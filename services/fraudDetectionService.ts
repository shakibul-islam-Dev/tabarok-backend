import PointTransaction, {
  type PointTransactionType,
} from "../models/PointTransaction.js";
import User from "../models/User.js";
import { envNumber } from "../utils/env.js";

/**
 * Possible outcomes of a fraud analysis.
 * `adjust` halves the reward instead of rejecting it entirely.
 */
export type FraudDecision = "approve" | "review" | "reject" | "adjust";

/**
 * Result returned by FraudDetectionService.analyze.
 * `finalAmount` is the amount that should actually be credited after adjustments.
 */
export interface FraudAnalysisResult {
  riskScore: number;
  decision: FraudDecision;
  finalAmount: number;
  reasons: string[];
}

/**
 * Context passed to fraud detection. Extra fields are allowed because different
 * point-earning flows (ad views, shares, referrals, cashback, topups, redeem codes)
 * contribute different signals.
 */
export interface FraudMetadata {
  ip?: string;
  userAgent?: string;
  deviceFingerprint?: string;
  lastAdAt?: Date;
  firstAdToday?: Date;
  adId?: string;
  duration?: number;
  orderId?: string;
  purchaseAmount?: number;
  platform?: string;
  url?: string;
  referralCode?: string;
  referredUserId?: string;
  referrerId?: string;
  packageId?: string;
  price?: number;
  currency?: string;
  paymentMethod?: string;
  transactionId?: string;
  redeemCode?: string;
  redeemCodeId?: string;
}

/**
 * Rule-based fraud detection engine for the points system.
 *
 * Why this exists: point-earning actions (watching ads, sharing, referrals) are easy to automate
 * or abuse, so each transaction is scored against velocity, duplication, and account-level signals.
 *
 * Why topups skip fraud checks: topups represent real money purchases made by the user; blocking
 * them would harm legitimate revenue. They are intentionally assigned a risk score of 0.
 */
export class FraudDetectionService {
  /**
   * Scores a point-earning event and returns a decision.
   *
   * The risk score is clamped to 0-100, then mapped to a decision:
   *   - reject  (>=80): no points credited
   *   - review  (>=50): transaction held for admin approval; no balance change yet
   *   - adjust  (>=20): 50% of the requested amount is credited
   *   - approve (<20): full amount credited
   */
  async analyze(
    userId: string,
    type: PointTransactionType,
    amount: number,
    metadata: FraudMetadata = {}
  ): Promise<FraudAnalysisResult> {
    let riskScore = 0;
    const reasons: string[] = [];
    const now = new Date();
    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const user = await User.findById(userId);
    if (!user) {
      return {
        riskScore: 100,
        decision: "reject",
        finalAmount: 0,
        reasons: ["User not found"],
      };
    }

    // 1. Ad view fraud detection
    if (type === "ad_view") {
      const maxAdsPerHour = envNumber("MAX_ADS_PER_HOUR", 5);
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      // Velocity: block users who watch more ads than a human plausibly can.
      const adsInLastHour = await PointTransaction.countDocuments({
        user: userId,
        type: "ad_view",
        status: { $in: ["completed", "review"] },
        createdAt: { $gte: oneHourAgo },
      });

      if (adsInLastHour >= maxAdsPerHour) {
        riskScore += 60;
        reasons.push(
          `Ad view velocity exceeded: ${adsInLastHour}/${maxAdsPerHour} per hour`
        );
      }

      // Rapid-fire ad views: reward watching two ads within 30 seconds is suspicious.
      if (metadata.lastAdAt) {
        const secondsSinceLastAd =
          (now.getTime() - new Date(metadata.lastAdAt).getTime()) / 1000;
        if (secondsSinceLastAd < 30) {
          riskScore += 40;
          reasons.push(
            `Ad watched too fast: ${secondsSinceLastAd.toFixed(1)}s since last ad`
          );
        }
      }

      // Duplicate ad view check: each ad should only be rewarded once per user.
      if (metadata.adId) {
        const duplicateAd = await PointTransaction.findOne({
          user: userId,
          type: "ad_view",
          "metadata.adId": metadata.adId,
          status: { $in: ["completed", "review"] },
        });
        if (duplicateAd) {
          riskScore += 80;
          reasons.push("Duplicate ad view detected");
        }
      }
    }

    // 2. Share fraud detection
    if (type.startsWith("share_")) {
      const shareCount24h = await PointTransaction.countDocuments({
        user: userId,
        type: { $regex: "^share_" },
        status: { $in: ["completed", "review"] },
        createdAt: { $gte: last24Hours },
      });

      if (shareCount24h > 10) {
        riskScore += 40;
        reasons.push(`Excessive shares in 24h: ${shareCount24h}`);
      }
    }

    // 3. Referral fraud detection
    if (type === "referral") {
      const referrals24h = await PointTransaction.countDocuments({
        user: userId,
        type: "referral",
        status: { $in: ["completed", "review"] },
        createdAt: { $gte: last24Hours },
      });

      if (referrals24h > 10) {
        riskScore += 50;
        reasons.push(`Referral spam: ${referrals24h} in 24h`);
      }

      // Detect referral loops or multiple accounts behind the same IP/device.
      if (metadata.ip && metadata.deviceFingerprint) {
        const duplicateReferral = await PointTransaction.findOne({
          user: { $ne: userId },
          type: "referral",
          "metadata.ip": metadata.ip,
          "metadata.deviceFingerprint": metadata.deviceFingerprint,
          status: { $in: ["completed", "review"] },
          createdAt: { $gte: last24Hours },
        });
        if (duplicateReferral) {
          riskScore += 70;
          reasons.push("Duplicate referral from same IP/device");
        }
      }
    }

    // 4. Cashback fraud detection (only applies to actual cashback rewards)
    if (type === "cashback") {
      if (typeof metadata.purchaseAmount === "number") {
        const cashbackRate = Number(process.env.CASHBACK_RATE) || 0.05;
        const expectedPoints = Math.floor(metadata.purchaseAmount * cashbackRate);
        if (amount > expectedPoints * 2) {
          riskScore += 50;
          reasons.push("Cashback amount significantly higher than expected");
        }
      }
    }

    // Point top-ups are intentionally not fraud-checked; they are user purchases.
    if (type === "topup") {
      // no-op: keep risk score at 0
    }

    // 5. Account-level risk factors
    const accountAgeDays =
      (now.getTime() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24);
    if (accountAgeDays < 1) {
      riskScore += 20;
      reasons.push("Account created within 24 hours");
    }

    if (user.riskLevel === "high") {
      riskScore += 30;
      reasons.push("User flagged as high risk");
    } else if (user.riskLevel === "medium") {
      riskScore += 15;
      reasons.push("User flagged as medium risk");
    }

    // Historical rejection rate: repeatedly rejected users are more likely to be abusers.
    const totalTransactions = await PointTransaction.countDocuments({
      user: userId,
    });
    const rejectedTransactions = await PointTransaction.countDocuments({
      user: userId,
      status: "rejected",
    });

    if (totalTransactions > 5 && rejectedTransactions / totalTransactions > 0.3) {
      riskScore += 25;
      reasons.push("High historical rejection rate");
    }

    // Clamp score to a valid 0-100 range so downstream logic is predictable.
    riskScore = Math.min(100, Math.max(0, riskScore));

    // Decision matrix
    let decision: FraudDecision;
    let finalAmount = amount;

    if (riskScore >= 80) {
      decision = "reject";
      finalAmount = 0;
    } else if (riskScore >= 50) {
      decision = "review";
      finalAmount = amount;
    } else if (riskScore >= 20) {
      decision = "adjust";
      finalAmount = Math.floor(amount * 0.5);
    } else {
      decision = "approve";
    }

    return {
      riskScore,
      decision,
      finalAmount,
      reasons,
    };
  }
}

export default FraudDetectionService;
