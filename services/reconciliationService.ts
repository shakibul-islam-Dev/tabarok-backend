import mongoose from "mongoose";
import User from "../models/User.js";
import PointTransaction, {
  type IPointTransaction,
  type PointTransactionReferenceType,
} from "../models/PointTransaction.js";
import { ApiError } from "../utils/ApiError.js";

export interface ReconciliationResult {
  userId: string;
  expectedBalance: number;
  actualBalance: number;
  difference: number;
  reconciled: boolean;
  correctionTransaction?: IPointTransaction;
}

/**
 * ReconciliationService keeps the points economy accurate.
 *
 * Every point credit/debit is stored as a PointTransaction. The user's live balance
 * (`user.points`) should always equal the sum of `finalAmount` for that user's completed
 * transactions. If a bug, race condition, or manual DB edit causes a mismatch, this service
 * detects it and can optionally write a correction transaction.
 */
export class ReconciliationService {
  /**
   * Compute the expected balance from the transaction ledger for a single user.
   * Only completed transactions count; rejected, pending-review, and reversed rows do not.
   */
  async calculateExpectedBalance(userId: string): Promise<number> {
    const [result] = await PointTransaction.aggregate([
      {
        $match: {
          user: new mongoose.Types.ObjectId(userId),
          status: "completed",
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$finalAmount" },
        },
      },
    ]);
    return result?.total ?? 0;
  }

  /**
   * Verify a single user's balance without making changes.
   * Returns the expected, actual, and difference values.
   */
  async verifyUserBalance(userId: string): Promise<ReconciliationResult> {
    const user = await User.findById(userId);
    if (!user) {
      throw new ApiError(404, "User not found");
    }

    const expectedBalance = await this.calculateExpectedBalance(userId);
    const actualBalance = user.points;
    const difference = expectedBalance - actualBalance;

    return {
      userId,
      expectedBalance,
      actualBalance,
      difference,
      reconciled: false,
    };
  }

  /**
   * Reconcile a single user's balance.
   * If there is a discrepancy, a "correction" transaction is created and the user's balance
   * is adjusted to match the ledger. This keeps the ledger itself the source of truth.
   */
  async reconcileUserBalance(userId: string): Promise<ReconciliationResult> {
    const user = await User.findById(userId);
    if (!user) {
      throw new ApiError(404, "User not found");
    }

    const expectedBalance = await this.calculateExpectedBalance(userId);
    const actualBalance = user.points;
    const difference = expectedBalance - actualBalance;

    if (difference === 0) {
      return {
        userId,
        expectedBalance,
        actualBalance,
        difference,
        reconciled: false,
      };
    }

    const session = await mongoose.startSession();
    let correctionTransaction: IPointTransaction | undefined;

    try {
      await session.withTransaction(async () => {
        // Adjust the user's live balance to match the ledger.
        const updatedUser = await User.findByIdAndUpdate(
          userId,
          { $inc: { points: difference } },
          { new: true, session }
        );
        if (!updatedUser) {
          throw new ApiError(500, "Failed to update user balance during reconciliation");
        }

        // Record the correction as a transaction so the audit trail remains complete.
        const [created] = await PointTransaction.create(
          [
            {
              user: userId,
              type: "correction",
              amount: difference,
              finalAmount: difference,
              riskScore: 0,
              riskDecision: "approve",
              referenceType: "manual" as PointTransactionReferenceType,
              description: `Balance correction: expected ${expectedBalance}, actual ${actualBalance}`,
              status: "completed",
              metadata: {
                expectedBalance,
                actualBalance,
                difference,
              },
            },
          ],
          { session }
        );
        correctionTransaction = created;
      });

      return {
        userId,
        expectedBalance,
        actualBalance,
        difference,
        reconciled: true,
        correctionTransaction,
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

  /**
   * Scan all users and report any whose live balance differs from their ledger.
   * This is useful for periodic audits and nightly integrity checks.
   */
  async verifyAllBalances(): Promise<
    { userId: string; email: string; expectedBalance: number; actualBalance: number; difference: number }[]
  > {
    const users = await User.find().select("_id email points");
    const discrepancies: {
      userId: string;
      email: string;
      expectedBalance: number;
      actualBalance: number;
      difference: number;
    }[] = [];

    for (const user of users) {
      const expectedBalance = await this.calculateExpectedBalance(user._id.toString());
      if (expectedBalance !== user.points) {
        discrepancies.push({
          userId: user._id.toString(),
          email: user.email,
          expectedBalance,
          actualBalance: user.points,
          difference: expectedBalance - user.points,
        });
      }
    }

    return discrepancies;
  }

  /**
   * Find all transactions linked to a specific external source.
   * Example: audit all point changes for a given order or redeem code.
   */
  async getTransactionAuditTrail(
    referenceType: PointTransactionReferenceType,
    referenceId: string,
    userId?: string
  ) {
    const filter: Record<string, unknown> = {
      referenceType,
      referenceId,
    };
    if (userId) {
      filter.user = new mongoose.Types.ObjectId(userId);
    }

    const transactions = await PointTransaction.find(filter)
      .sort({ createdAt: -1 })
      .populate("user", "name email");

    const total = transactions.reduce((sum, t) => {
      return t.status === "completed" ? sum + t.finalAmount : sum;
    }, 0);

    return { transactions, totalCompleted: total };
  }
}

export default ReconciliationService;
