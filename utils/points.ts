import { PointsService } from "../services/pointsService.js";
import type { FraudMetadata } from "../services/fraudDetectionService.js";
import type { PointTransactionType } from "../models/PointTransaction.js";

export { envNumber } from "./env.js";

const pointsService = new PointsService();

/**
 * Award points to a user. Runs fraud detection before crediting.
 *
 * @deprecated Prefer `PointsService.earnPoints()` directly for full control over the result.
 * This helper is kept for legacy callers that only need a void success/failure signal.
 */
export async function awardPoints(
  userId: string,
  type: PointTransactionType,
  amount: number,
  description: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  const result = await pointsService.earnPoints({
    userId,
    type,
    amount,
    description,
    metadata: metadata as FraudMetadata,
  });

  // Keep backward-compatible void behavior; throw on hard rejection so callers know.
  if (!result.success) {
    throw new Error(result.message ?? "Points rejected by fraud detection");
  }

  void result;
}

/**
 * Get the current points balance for a user.
 */
export async function getPointsBalance(userId: string): Promise<number> {
  return pointsService.getBalance(userId);
}

/**
 * Get summarized point statistics for the user profile/dashboard.
 */
export async function getPointsStats(userId: string) {
  return pointsService.getStats(userId);
}

export { PointsService };
