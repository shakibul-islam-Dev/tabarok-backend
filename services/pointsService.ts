import mongoose from "mongoose";
import User from "../models/User.js";
import PointTransaction, {
  type PointTransactionType,
  type PointTransactionReferenceType,
} from "../models/PointTransaction.js";
import Redemption from "../models/Redemption.js";
import FraudDetectionService, {
  type FraudMetadata,
} from "./fraudDetectionService.js";
import { ApiError } from "../utils/ApiError.js";
import type { PointTransactionDoc } from "../models/PointTransaction.js";
import type { UserDoc } from "../models/User.js";
import type { RedemptionDoc } from "../models/Redemption.js";
import type { FraudAnalysisResult } from "./fraudDetectionService.js";

/**
 * Input required to credit points to a user.
 * Metadata is passed to fraud detection so velocity, device, and IP checks work.
 * referenceType/referenceId create a dynamic link back to the source (ad, order, redeem code, etc.)
 * so transactions can be audited and reconciled without inspecting metadata.
 */
export interface EarnPointsInput {
  userId: string;
  type: PointTransactionType;
  amount: number;
  description: string;
  referenceType?: PointTransactionReferenceType;
  referenceId?: string;
  metadata?: FraudMetadata;
}

/**
 * Options that control how earnPoints behaves when called from another service.
 * `session` lets the caller share a MongoDB transaction so multiple writes commit together.
 * `skipFraudCheck` is used by redeem-code rewards because those are trusted, paid/user-initiated top-ups.
 */
export interface EarnPointsOptions {
  session?: mongoose.ClientSession;
  skipFraudCheck?: boolean;
}

/**
 * Input required to redeem points against an order or product reward.
 * referenceType/referenceId link the debit to the order or product redemption record.
 */
export interface RedeemPointsInput {
  userId: string;
  productId?: string;
  orderId?: string;
  pointsRequired: number;
  productValue?: number;
  description?: string;
  referenceType?: PointTransactionReferenceType;
  referenceId?: string;
  /**
   * Optional external MongoDB session. When provided, the debit is executed inside the
   * caller's transaction so the order, stock, and point changes commit together.
   */
  session?: mongoose.ClientSession;
}

/**
 * Generic result shape returned by points mutations so callers can inspect
 * the updated user, transaction, fraud decision, and optional redemption record.
 */
export interface PointsResult {
  success: boolean;
  transaction?: PointTransactionDoc;
  user?: UserDoc;
  fraudResult?: FraudAnalysisResult;
  redemption?: RedemptionDoc | null;
  message?: string;
}

const fraudService = new FraudDetectionService();

/**
 * Central service for all points mutations: earning, redeeming, querying, and admin review.
 * All balance-changing operations use MongoDB sessions so debits/credits stay atomic with their transactions.
 */
export class PointsService {
  /**
   * Credits points to a user after running fraud detection.
   *
   * Why sessions: MongoDB transactions ensure the user's points balance and the PointTransaction
   * row are committed together; if one fails, the other rolls back and we cannot end up with
   * a recorded transaction but no credited points (or vice versa).
   *
   * Why fraud checks are skipped for topups/redeem-code rewards: those flows represent real
   * user purchases or trusted code redemptions, so treating them like ad-view farming would
   * incorrectly block legitimate top-ups.
   *
   * Rejected/review transactions still create a PointTransaction row so admins can audit the
   * decision and so the user has a visible trail. Review transactions can later be approved
   * via `reviewTransaction`.
   */
  async earnPoints(
    input: EarnPointsInput,
    options: EarnPointsOptions = {}
  ): Promise<PointsResult> {
    const {
      userId,
      type,
      amount,
      description,
      referenceType,
      referenceId,
      metadata = {},
    } = input;
    const { session: externalSession, skipFraudCheck = false } = options;

    if (amount <= 0) {
      throw new ApiError(400, "Amount must be positive for earning points");
    }

    const user = await User.findById(userId).session(externalSession ?? null);
    if (!user) {
      throw new ApiError(404, "User not found");
    }

    if (user.banned) {
      throw new ApiError(403, "User account is banned");
    }

    // AI fraud & anomaly detection (skip when inside an outer transaction to avoid deadlocks)
    const fraudResult = skipFraudCheck
      ? { riskScore: 0, decision: "approve" as const, finalAmount: amount, reasons: [] }
      : await fraudService.analyze(userId, type, amount, metadata);

    // Rejected and review transactions don't touch the user balance yet.
    // Review transactions can be approved later via an admin endpoint.
    if (fraudResult.decision === "reject" || fraudResult.decision === "review") {
      const transaction = await PointTransaction.create(
        [
          {
            user: userId,
            type,
            amount,
            finalAmount:
              fraudResult.decision === "reject" ||
              fraudResult.decision === "review"
                ? 0
                : amount,
            riskScore: fraudResult.riskScore,
            riskDecision: fraudResult.decision,
            description,
            referenceType,
            referenceId,
            metadata,
            status: fraudResult.decision === "reject" ? "rejected" : "review",
          },
        ],
        { session: externalSession }
      );

      return {
        success: fraudResult.decision === "review",
        message:
          fraudResult.decision === "reject"
            ? "Rejected by fraud detection"
            : "Transaction queued for review; points will be credited after approval",
        transaction: transaction[0],
        fraudResult,
      };
    }

    // If no caller-supplied session exists, start our own. The caller's session is respected
    // so services like redeemCodeService can bundle the code consumption and point credit.
    const ownSession = externalSession ? null : await mongoose.startSession();
    const session = externalSession ?? ownSession;
    if (!session) {
      throw new ApiError(500, "Unable to start MongoDB session");
    }

    try {
      const runWithTransaction = async () => {
        const updatedUser = await User.findByIdAndUpdate(
          userId,
          {
            $inc: {
              points: fraudResult.finalAmount,
              totalEarned: fraudResult.finalAmount,
            },
          },
          { new: true, session }
        );

        if (!updatedUser) {
          throw new ApiError(500, "Failed to update user balance");
        }

        const [transaction] = await PointTransaction.create(
          [
            {
              user: userId,
              type,
              amount,
              finalAmount: fraudResult.finalAmount,
              riskScore: fraudResult.riskScore,
              riskDecision: fraudResult.decision,
              description,
              referenceType,
              referenceId,
              metadata,
              status:
                fraudResult.decision === "review" ? "review" : "completed",
            },
          ],
          { session }
        );

        return { user: updatedUser, transaction };
      };

      const result = externalSession
        ? await runWithTransaction()
        : await session!.withTransaction(runWithTransaction);

      return {
        success: true,
        ...result,
        fraudResult,
      };
    } catch (error) {
      if (!externalSession && session.inTransaction()) {
        await session.abortTransaction();
      }
      throw error;
    } finally {
      if (!externalSession) session.endSession();
    }
  }

  /**
   * Deducts points from a user and records a redemption.
   *
   * Why sessions: the user's balance must decrease at the exact same time the redeem transaction
   * and Redemption record are created. Without a transaction a crash between these steps could
   * deduct points without fulfilling the reward.
   *
   * If a productId is supplied we also create a Redemption record in "pending_fulfillment" status
   * so the admin/warehouse team knows what physical or digital reward the user unlocked.
   */
  async redeemPoints(input: RedeemPointsInput): Promise<PointsResult> {
    const {
      userId,
      productId,
      orderId,
      pointsRequired,
      productValue,
      description,
      referenceType,
      referenceId,
      session: externalSession,
    } = input;

    if (pointsRequired <= 0) {
      throw new ApiError(400, "Points required must be positive");
    }

    const ownSession = externalSession ? null : await mongoose.startSession();
    const session = externalSession ?? ownSession;
    if (!session) {
      throw new ApiError(500, "Unable to start MongoDB session");
    }

    try {
      const runWithTransaction = async () => {
        const user = await User.findById(userId).session(session);
        if (!user) {
          throw new ApiError(404, "User not found");
        }
        if (user.banned) {
          throw new ApiError(403, "User account is banned");
        }
        if (user.points < pointsRequired) {
          throw new ApiError(
            400,
            `Insufficient points balance. Available: ${user.points}, Required: ${pointsRequired}`
          );
        }

        const updatedUser = await User.findByIdAndUpdate(
          userId,
          {
            $inc: {
              points: -pointsRequired,
              totalRedeemed: pointsRequired,
            },
          },
          { new: true, session }
        );

        if (!updatedUser) {
          throw new ApiError(500, "Failed to deduct points");
        }

        const [transaction] = await PointTransaction.create(
          [
            {
              user: userId,
              type: "redeem",
              amount: -pointsRequired,
              finalAmount: -pointsRequired,
              riskScore: 0,
              riskDecision: "approve",
              description:
                description ??
                `Redeemed ${pointsRequired} points${productId ? ` for product ${productId}` : ""}`,
              referenceType:
                referenceType ??
                (productId ? "product_redemption" : "order"),
              referenceId:
                referenceId ??
                (productId ? productId : orderId),
              metadata: { productId, orderId, productValue },
              status: "completed",
            },
          ],
          { session }
        );

        // Create a Redemption record for any debit so it can be audited later.
        // Product redemptions start as "pending_fulfillment"; order-level redemptions are
        // considered fulfilled immediately because the discount is applied at checkout.
        const [redemption] = await Redemption.create(
          [
            {
              user: userId,
              productId: productId ? new mongoose.Types.ObjectId(productId) : undefined,
              orderId: orderId ? new mongoose.Types.ObjectId(orderId) : undefined,
              pointsUsed: pointsRequired,
              productValue,
              status: productId ? "pending_fulfillment" : "fulfilled",
            },
          ],
          { session }
        );

        return { user: updatedUser, transaction, redemption };
      };

      const result = externalSession
        ? await runWithTransaction()
        : await session!.withTransaction(runWithTransaction);

      return {
        success: true,
        ...result,
      };
    } catch (error) {
      if (!externalSession && session.inTransaction()) {
        await session.abortTransaction();
      }
      throw error;
    } finally {
      if (!externalSession) session.endSession();
    }
  }

  /**
   * Returns the user's current points balance.
   * This is a lightweight read that avoids loading the whole user document.
   */
  async getBalance(userId: string): Promise<number> {
    const user = await User.findById(userId).select("points");
    return user?.points ?? 0;
  }

  /**
   * Lists recent point transactions for a user, newest first.
   * A default cap keeps response sizes predictable for user-facing UIs.
   */
  async getTransactions(userId: string, limit = 50) {
    return PointTransaction.find({ user: userId })
      .sort({ createdAt: -1 })
      .limit(limit);
  }

  /**
   * Returns summarized point metrics for the user profile/dashboard.
   * Includes current balance, lifetime earned/redeemed, and current risk level.
   */
  async getStats(userId: string) {
    const user = await User.findById(userId).select(
      "points totalEarned totalRedeemed riskLevel"
    );
    if (!user) {
      throw new ApiError(404, "User not found");
    }
    return {
      points: user.points,
      totalEarned: user.totalEarned,
      totalRedeemed: user.totalRedeemed,
      riskLevel: user.riskLevel,
    };
  }

  /**
   * Approve or reject a transaction that is currently in "review" status.
   * Approval credits the user with the original amount. Rejection finalizes it as 0.
   */
  async reviewTransaction(
    transactionId: string,
    decision: "approve" | "reject"
  ): Promise<PointsResult> {
    const session = await mongoose.startSession();
    try {
      const result = await session.withTransaction(async () => {
        const transaction = await PointTransaction.findById(transactionId).session(
          session
        );
        if (!transaction) {
          throw new ApiError(404, "Transaction not found");
        }
        if (transaction.status !== "review") {
          throw new ApiError(400, "Transaction is not pending review");
        }

        if (decision === "reject") {
          transaction.status = "rejected";
          await transaction.save({ session });
          return { transaction, user: undefined };
        }

        // Approve: credit the original amount
        const user = await User.findByIdAndUpdate(
          transaction.user,
          {
            $inc: {
              points: transaction.amount,
              totalEarned: transaction.amount,
            },
          },
          { new: true, session }
        );
        if (!user) {
          throw new ApiError(500, "Failed to update user balance");
        }

        transaction.status = "completed";
        transaction.finalAmount = transaction.amount;
        transaction.riskDecision = "approve";
        await transaction.save({ session });

        return { transaction, user };
      });

      return {
        success: decision === "approve",
        ...result,
      };
    } catch (error) {
      if (session.inTransaction()) {
        await session.abortTransaction();
      }
      throw error;
    } finally {
      session.endSession();
    }
  }
}

export default PointsService;
