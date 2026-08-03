import { Router, Response } from "express";
import { protect, type BetterAuthRequest } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/admin.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { schemas, validateBody, z } from "../utils/validation.js";
import {
  envNumber,
  getPointsBalance,
  getPointsStats,
  PointsService,
} from "../utils/points.js";
import PointTransaction, {
  type PointTransactionReferenceType,
} from "../models/PointTransaction.js";
import User from "../models/User.js";
import { ReconciliationService } from "../services/reconciliationService.js";

const router = Router();
const pointsService = new PointsService();
const reconciliationService = new ReconciliationService();

// All routes in this file require an authenticated user.
router.use(protect);

const sharePlatforms = ["facebook", "whatsapp", "twitter"] as const;
type SharePlatform = (typeof sharePlatforms)[number];

// Ads and point packages are hardcoded here for simplicity.
// In production these should come from a database or CMS so admins can change them
// without redeploying the backend.
const ads = [
  { id: "ad1", title: "Summer Sale Promo", duration: 30 },
  { id: "ad2", title: "New Arrivals", duration: 30 },
  { id: "ad3", title: "Brand Spotlight", duration: 30 },
];

const pointPackages = [
  { id: "pkg-small", name: "Starter Pack", points: 100, price: 100, currency: "BDT" },
  { id: "pkg-medium", name: "Popular Pack", points: 500, price: 450, currency: "BDT" },
  { id: "pkg-large", name: "Mega Pack", points: 1000, price: 800, currency: "BDT" },
];

// User endpoints

router.get(
  "/balance",
  asyncHandler(async (req: BetterAuthRequest, res: Response) => {
    const stats = await getPointsStats(String(req.user!._id));
    res.json(stats);
  })
);

router.get(
  "/transactions",
  asyncHandler(async (req: BetterAuthRequest, res: Response) => {
    const transactions = await PointTransaction.find({
      user: req.user!._id,
    }).sort({ createdAt: -1 });
    res.json(transactions);
  })
);

router.get("/ads", (_req: BetterAuthRequest, res: Response) => {
  res.json(ads);
});

router.post(
  "/ads/:id/watch",
  asyncHandler(async (req: BetterAuthRequest, res: Response) => {
    const ad = ads.find((a) => a.id === req.params.id);
    if (!ad) {
      throw new ApiError(404, "Ad not found");
    }

    const userId = String(req.user!._id);
    const pointsPerAd = envNumber("POINTS_PER_AD", 10);

    const result = await pointsService.earnPoints({
      userId,
      type: "ad_view",
      amount: pointsPerAd,
      description: `Watched ad: ${ad.title}`,
      referenceType: "ad",
      referenceId: ad.id,
      metadata: {
        adId: ad.id,
        duration: ad.duration,
        ip: req.ip,
        userAgent: req.headers["user-agent"],
      },
    });

    if (!result.success) {
      throw new ApiError(400, result.message ?? "Ad reward rejected");
    }

    const balance = await getPointsBalance(userId);
    res.json({
      message: `Ad reward processed: ${result.transaction?.finalAmount ?? 0} points credited`,
      pointsEarned: result.transaction?.finalAmount ?? 0,
      riskScore: result.fraudResult?.riskScore ?? 0,
      riskDecision: result.fraudResult?.decision ?? "approve",
      balance,
    });
  })
);

router.post(
  "/share",
  asyncHandler(async (req: BetterAuthRequest, res: Response) => {
    const { platform, url } = validateBody(schemas.pointsShare, req.body);

    const validPlatform = platform as SharePlatform;
    const shareType = `share_${validPlatform}` as const;

    const userId = String(req.user!._id);
    const pointsPerShare = envNumber("POINTS_PER_SHARE", 15);

    const result = await pointsService.earnPoints({
      userId,
      type: shareType,
      amount: pointsPerShare,
      description: `Shared on ${validPlatform}`,
      referenceType: "share",
      referenceId: `${validPlatform}:${url ?? "unknown"}`,
      metadata: {
        platform: validPlatform,
        url,
        ip: req.ip,
        userAgent: req.headers["user-agent"],
      },
    });

    if (!result.success) {
      throw new ApiError(400, result.message ?? "Share reward rejected");
    }

    const balance = await getPointsBalance(userId);
    res.json({
      message: `Share reward processed: ${result.transaction?.finalAmount ?? 0} points credited`,
      pointsEarned: result.transaction?.finalAmount ?? 0,
      riskScore: result.fraudResult?.riskScore ?? 0,
      riskDecision: result.fraudResult?.decision ?? "approve",
      balance,
    });
  })
);

router.get(
  "/referral",
  asyncHandler(async (req: BetterAuthRequest, res: Response) => {
    const userId = req.user!._id;
    const [referralCount, transactions] = await Promise.all([
      User.countDocuments({ referredBy: userId }),
      PointTransaction.find({ user: userId, type: "referral" }).sort({
        createdAt: -1,
      }),
    ]);

    res.json({
      referralCode: req.user!.referralCode,
      referralCount,
      referralPointsEarned: transactions.reduce(
        (sum, t) => sum + t.finalAmount,
        0
      ),
    });
  })
);

router.post(
  "/referral",
  asyncHandler(async (req: BetterAuthRequest, res: Response) => {
    const { referralCode } = validateBody(schemas.pointsReferral, req.body);

    const referrer = await User.findOne({
      referralCode: referralCode.toUpperCase(),
    });
    if (!referrer) {
      throw new ApiError(404, "Invalid referral code");
    }
    if (String(referrer._id) === String(req.user!._id)) {
      throw new ApiError(400, "You cannot refer yourself");
    }

    const userId = String(req.user!._id);
    const referrerId = String(referrer._id);
    const pointsReferrer = envNumber("POINTS_REFERRER", 50);
    const pointsReferred = envNumber("POINTS_REFERRED", 25);

    // Prevent duplicate referral credits
    const existingReferral = await PointTransaction.findOne({
      user: referrerId,
      type: "referral",
      "metadata.referredUserId": userId,
      status: { $in: ["completed", "review"] },
    });
    if (existingReferral) {
      throw new ApiError(409, "Referral already credited for this user");
    }

    const referrerResult = await pointsService.earnPoints({
      userId: referrerId,
      type: "referral",
      amount: pointsReferrer,
      description: `Referral reward: new user ${userId}`,
      referenceType: "referral",
      referenceId: `${referralCode.toUpperCase()}:${userId}`,
      metadata: {
        referredUserId: userId,
        referralCode: referralCode.toUpperCase(),
        ip: req.ip,
        userAgent: req.headers["user-agent"],
      },
    });

    const referredResult = await pointsService.earnPoints({
      userId,
      type: "referral",
      amount: pointsReferred,
      description: `Welcome bonus from referral code ${referralCode.toUpperCase()}`,
      referenceType: "referral",
      referenceId: `${referralCode.toUpperCase()}:${referrerId}`,
      metadata: {
        referrerId,
        referralCode: referralCode.toUpperCase(),
      },
    });

    await User.findByIdAndUpdate(userId, { referredBy: referrer._id });

    res.json({
      referrer: {
        pointsEarned: referrerResult.transaction?.finalAmount ?? 0,
        riskScore: referrerResult.fraudResult?.riskScore ?? 0,
      },
      referred: {
        pointsEarned: referredResult.transaction?.finalAmount ?? 0,
        riskScore: referredResult.fraudResult?.riskScore ?? 0,
      },
    });
  })
);

router.get("/packages", (_req: BetterAuthRequest, res: Response) => {
  res.json(pointPackages);
});

router.post(
  "/purchase",
  asyncHandler(async (req: BetterAuthRequest, res: Response) => {
    const { packageId, amount: customAmount, paymentMethod, transactionId } =
      validateBody(schemas.pointsPurchase, req.body);

    let points = 0;
    let price = 0;

    if (packageId) {
      const pkg = pointPackages.find((p) => p.id === packageId);
      if (!pkg) {
        throw new ApiError(404, "Package not found");
      }
      points = pkg.points;
      price = pkg.price;
    } else if (typeof customAmount === "number" && customAmount > 0) {
      const rate = envNumber("POINT_PURCHASE_RATE", 1);
      points = customAmount;
      price = customAmount * rate;
    } else {
      throw new ApiError(
        400,
        "Provide either a valid packageId or a positive amount"
      );
    }

    const userId = String(req.user!._id);
    const result = await pointsService.earnPoints(
      {
        userId,
        type: "topup",
        amount: points,
        description: `Purchased ${points} points`,
        referenceType: "purchase",
        referenceId: transactionId,
        metadata: {
          packageId,
          price,
          currency: "BDT",
          paymentMethod,
          transactionId,
          purchaseAmount: price,
        },
      },
      // Top-ups are real paid purchases; they must never be penalized by
      // fraud detection (the Stripe webhook path already skips it too).
      { skipFraudCheck: true }
    );

    if (!result.success) {
      throw new ApiError(400, result.message ?? "Purchase points rejected");
    }

    const balance = await getPointsBalance(userId);
    res.status(201).json({
      message: `Purchased ${points} points`,
      pointsPurchased: result.transaction?.finalAmount ?? 0,
      price,
      riskScore: result.fraudResult?.riskScore ?? 0,
      riskDecision: result.fraudResult?.decision ?? "approve",
      balance,
    });
  })
);

// Admin endpoints: require admin or superadmin role

router.get(
  "/admin/transactions",
  requireAdmin,
  asyncHandler(async (req: BetterAuthRequest, res: Response) => {
    const { userId, type, status, page, limit } = req.query;
    const filter: Record<string, unknown> = {};
    if (typeof userId === "string" && userId) filter.user = userId;
    if (typeof type === "string" && type) filter.type = type;
    if (typeof status === "string" && status) filter.status = status;

    const pageNum = typeof page === "string" ? Math.max(1, Number(page) || 1) : 1;
    const pageSize = typeof limit === "string" ? Number(limit) || 20 : 20;

    const [transactions, total] = await Promise.all([
      PointTransaction.find(filter)
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * pageSize)
        .limit(pageSize)
        .populate("user", "name email"),
      PointTransaction.countDocuments(filter),
    ]);

    res.json({
      transactions,
      pagination: {
        page: pageNum,
        pages: Math.ceil(total / pageSize),
        total,
      },
    });
  })
);

router.patch(
  "/admin/transactions/:id",
  requireAdmin,
  asyncHandler(async (req: BetterAuthRequest, res: Response) => {
    const { id } = req.params;
    const { decision } = validateBody(
      z.object({ decision: z.enum(["approve", "reject"]) }),
      req.body
    );

    const result = await pointsService.reviewTransaction(id, decision);
    res.json({
      success: result.success,
      message: result.message ?? `Transaction ${decision}d`,
      transaction: result.transaction,
    });
  })
);

// ---------------------------------------------------------------------------
// Reconciliation endpoints
//
// These endpoints make the points economy auditable. Every point mutation is
// linked to a source via referenceType/referenceId, and the live user balance
// can be verified against the transaction ledger.
// ---------------------------------------------------------------------------

/**
 * GET /api/points/admin/reconcile
 * List all users whose live balance does not match their transaction ledger.
 */
router.get(
  "/admin/reconcile",
  requireAdmin,
  asyncHandler(async (req: BetterAuthRequest, res: Response) => {
    const discrepancies = await reconciliationService.verifyAllBalances();
    res.json({
      count: discrepancies.length,
      discrepancies,
    });
  })
);

/**
 * GET /api/points/admin/reconcile/:userId
 * Verify a single user's balance without changing anything.
 */
router.get(
  "/admin/reconcile/:userId",
  requireAdmin,
  asyncHandler(async (req: BetterAuthRequest, res: Response) => {
    const result = await reconciliationService.verifyUserBalance(
      req.params.userId
    );
    res.json(result);
  })
);

/**
 * POST /api/points/admin/reconcile/:userId
 * Reconcile a single user's balance. If a discrepancy exists, a correction
 * transaction is written and the user's balance is updated to match the ledger.
 */
router.post(
  "/admin/reconcile/:userId",
  requireAdmin,
  asyncHandler(async (req: BetterAuthRequest, res: Response) => {
    const result = await reconciliationService.reconcileUserBalance(
      req.params.userId
    );
    res.status(result.reconciled ? 201 : 200).json(result);
  })
);

/**
 * GET /api/points/admin/audit
 * Audit trail: find all transactions linked to a specific source.
 * Query params: referenceType, referenceId, userId (optional)
 */
router.get(
  "/admin/audit",
  requireAdmin,
  asyncHandler(async (req: BetterAuthRequest, res: Response) => {
    const { referenceType, referenceId, userId } = req.query;
    if (
      typeof referenceType !== "string" ||
      !referenceType ||
      typeof referenceId !== "string" ||
      !referenceId
    ) {
      throw new ApiError(400, "referenceType and referenceId are required");
    }

    const result = await reconciliationService.getTransactionAuditTrail(
      referenceType as PointTransactionReferenceType,
      referenceId,
      typeof userId === "string" && userId ? userId : undefined
    );
    res.json(result);
  })
);

export default router;
