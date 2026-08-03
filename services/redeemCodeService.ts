import mongoose from "mongoose";
import crypto from "crypto";
import RedeemCode from "../models/RedeemCode.js";
import type { RedeemCodeDoc } from "../models/RedeemCode.js";
import { PointsService } from "./pointsService.js";
import { ApiError } from "../utils/ApiError.js";

/**
 * Result returned when a user redeems a code.
 * `transaction` is populated for "points" rewards so the caller can show the credit.
 * `message` explains what happens for non-points types (cash/discount/product) which are
 * recorded but fulfilled outside this service.
 */
export interface RedeemCodeResult {
  success: boolean;
  code: string;
  type: string;
  value: number;
  title?: string;
  description?: string;
  transaction?: any;
  productId?: string;
  message?: string;
}

/**
 * Fields accepted when an admin creates a redeem code.
 * - `type`: what kind of reward the code unlocks.
 * - `value`: number of points, percentage discount, cash amount, or product value.
 * - `maxUses`: how many times the code can be redeemed (0 = unlimited).
 * - `productId`: required when type is "product".
 */
export interface CreateRedeemCodeInput {
  code?: string;
  type: "points" | "discount" | "product" | "cash";
  value: number;
  currency?: string;
  productId?: string;
  title?: string;
  description?: string;
  maxUses?: number;
  startsAt?: Date;
  expiresAt?: Date;
  isActive?: boolean;
  metadata?: Record<string, unknown>;
}

/**
 * Service for managing promotional redeem codes (points, discount, product, cash).
 *
 * Redemption is atomic: the code's used count and usedBy list are updated in the same
 * MongoDB transaction as the reward fulfillment. This prevents race conditions where two
 * users redeem the last available slot at the same time.
 */
export class RedeemCodeService {
  private pointsService: PointsService;

  constructor() {
    this.pointsService = new PointsService();
  }

  /**
   * Generate a random uppercase redeem code that avoids confusing characters
   * (no 0/O or 1/I). The prefix helps users identify the code origin.
   */
  generateCode(prefix = "TB", length = 10): string {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Removed confusing chars
    let code = "";
    while (code.length < length) {
      code += chars[crypto.randomInt(chars.length)];
    }
    return `${prefix}-${code}`;
  }

  /**
   * Create a new redeem code. If `code` is omitted, a unique random code is generated.
   * We retry generation a few times in the extremely unlikely case of a collision.
   */
  async create(input: CreateRedeemCodeInput): Promise<RedeemCodeDoc> {
    const {
      code,
      type,
      value,
      currency = "BDT",
      productId,
      title,
      description,
      maxUses = 1,
      startsAt,
      expiresAt,
      isActive = true,
      metadata,
    } = input;

    let finalCode = code?.trim().toUpperCase();
    if (!finalCode) {
      let attempts = 0;
      do {
        finalCode = this.generateCode();
        attempts++;
      } while ((await RedeemCode.exists({ code: finalCode })) && attempts < 10);
    }

    if (!finalCode) {
      throw new ApiError(500, "Failed to generate unique redeem code");
    }

    const existing = await RedeemCode.findOne({ code: finalCode });
    if (existing) {
      throw new ApiError(409, "Redeem code already exists");
    }

    const redeemCode = await RedeemCode.create({
      code: finalCode,
      type,
      value,
      currency,
      productId: productId ? new mongoose.Types.ObjectId(productId) : undefined,
      title,
      description,
      maxUses,
      startsAt,
      expiresAt,
      isActive,
      metadata,
    });

    return redeemCode;
  }

  /**
   * Validate a redeem code without consuming it.
   * Checks existence, active dates, usage limits, and whether the user already redeemed it.
   */
  async validate(code: string, userId?: string): Promise<RedeemCodeDoc> {
    const now = new Date();
    const redeemCode = await RedeemCode.findOne({ code: code.trim().toUpperCase() });

    if (!redeemCode) {
      throw new ApiError(404, "Invalid redeem code");
    }

    const status = redeemCode.getStatus(now);
    if (status === "inactive") {
      throw new ApiError(400, "Redeem code is not active");
    }
    if (status === "expired") {
      throw new ApiError(400, "Redeem code has expired");
    }
    if (status === "depleted") {
      throw new ApiError(400, "Redeem code has reached maximum uses");
    }

    if (userId) {
      const userObjectId = new mongoose.Types.ObjectId(userId);
      const alreadyUsed = redeemCode.usedBy.some((id) => id.equals(userObjectId));
      if (alreadyUsed) {
        throw new ApiError(409, "You have already used this code");
      }
    }

    return redeemCode;
  }

  /**
   * Redeem a code for a user.
   *
   * Runs inside a MongoDB transaction:
   * 1. Re-validate the code under the session lock.
   * 2. Atomically increment usedCount and push the user into usedBy.
   * 3. Fulfill the reward based on type.
   *
   * For "points" rewards we credit through PointsService as a topup so the transaction is logged.
   */
  async redeem(code: string, userId: string, metadata?: Record<string, unknown>): Promise<RedeemCodeResult> {
    const session = await mongoose.startSession();

    try {
      const result = await session.withTransaction(async () => {
        const now = new Date();
        const redeemCode = await RedeemCode.findOne({
          code: code.trim().toUpperCase(),
        }).session(session);

        if (!redeemCode) {
          throw new ApiError(404, "Invalid redeem code");
        }

        const status = redeemCode.getStatus(now);
        if (status === "inactive") {
          throw new ApiError(400, "Redeem code is not active");
        }
        if (status === "expired") {
          throw new ApiError(400, "Redeem code has expired");
        }
        if (status === "depleted") {
          throw new ApiError(400, "Redeem code has reached maximum uses");
        }

        const userObjectId = new mongoose.Types.ObjectId(userId);
        const alreadyUsed = redeemCode.usedBy.some((id) => id.equals(userObjectId));
        if (alreadyUsed) {
          throw new ApiError(409, "You have already used this code");
        }

        // Increment used count and add user atomically
        const updatedCode = await RedeemCode.findOneAndUpdate(
          {
            _id: redeemCode._id,
            $or: [
              { maxUses: 0 },
              { usedCount: { $lt: redeemCode.maxUses } },
            ],
          },
          {
            $inc: { usedCount: 1 },
            $push: { usedBy: userObjectId },
          },
          { new: true, session }
        );

        if (!updatedCode) {
          throw new ApiError(400, "Redeem code is no longer available");
        }

        // Process reward based on type
        let pointsTransaction = null;
        let message = "";

        if (redeemCode.type === "points") {
          const rewardResult = await this.pointsService.earnPoints(
            {
              userId,
              type: "topup",
              amount: redeemCode.value,
              description: `Redeemed code ${redeemCode.code}`,
              referenceType: "redeem_code",
              referenceId: redeemCode.code,
              metadata: {
                redeemCode: redeemCode.code,
                redeemCodeId: redeemCode._id.toString(),
                ...metadata,
              },
            },
            { session, skipFraudCheck: true }
          );
          pointsTransaction = rewardResult.transaction;
          message = `${rewardResult.transaction?.finalAmount ?? redeemCode.value} points credited`;
        } else if (redeemCode.type === "cash") {
          // Cash reward is stored as metadata; payment should be processed separately
          message = `${redeemCode.value} ${redeemCode.currency} cash reward recorded. Payment processing pending.`;
        } else if (redeemCode.type === "discount") {
          message = `${redeemCode.value}% discount code applied to your account`;
        } else if (redeemCode.type === "product") {
          message = `Product reward unlocked. Fulfillment pending.`;
        }

        return {
          success: true,
          code: redeemCode.code,
          type: redeemCode.type,
          value: redeemCode.value,
          title: redeemCode.title,
          description: redeemCode.description,
          transaction: pointsTransaction,
          productId: redeemCode.productId?.toString(),
          message,
        };
      });

      return result;
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
   * List redeem codes with optional filtering and pagination.
   * Returns both the page of codes and pagination metadata for the admin UI.
   */
  async list(options: {
    active?: boolean;
    type?: string;
    page?: number;
    limit?: number;
  } = {}) {
    const { active, type, page = 1, limit = 20 } = options;
    const filter: Record<string, unknown> = {};
    if (active !== undefined) filter.isActive = active;
    if (type) filter.type = type;

    const [codes, total] = await Promise.all([
      RedeemCode.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      RedeemCode.countDocuments(filter),
    ]);

    return {
      codes,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Soft-disable a redeem code by setting `isActive` to false.
   * Existing redemptions remain valid; this only prevents new redemptions.
   */
  async deactivate(code: string): Promise<RedeemCodeDoc> {
    const redeemCode = await RedeemCode.findOneAndUpdate(
      { code: code.trim().toUpperCase() },
      { isActive: false },
      { new: true }
    );
    if (!redeemCode) {
      throw new ApiError(404, "Redeem code not found");
    }
    return redeemCode;
  }
}

export default RedeemCodeService;
