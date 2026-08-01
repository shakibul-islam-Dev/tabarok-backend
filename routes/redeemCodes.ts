import { Router, Response } from "express";
import { protect, type BetterAuthRequest } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/admin.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { schemas, validateBody, z } from "../utils/validation.js";
import { RedeemCodeService } from "../services/redeemCodeService.js";

const router = Router();
const redeemService = new RedeemCodeService();

// All redeem-code routes require authentication.
router.use(protect);

/**
 * POST /api/redeem-codes
 * Admin: create a new redeem code (points, discount, product, or cash reward).
 */
router.post(
  "/",
  requireAdmin,
  asyncHandler(async (req: BetterAuthRequest, res: Response) => {
    const raw = validateBody(schemas.redeemCode, req.body);
    const input = {
      ...raw,
      startsAt: raw.startsAt ? new Date(raw.startsAt) : undefined,
      expiresAt: raw.expiresAt ? new Date(raw.expiresAt) : undefined,
    };
    const redeemCode = await redeemService.create(input);

    res.status(201).json({
      success: true,
      redeemCode: {
        code: redeemCode.code,
        type: redeemCode.type,
        value: redeemCode.value,
        maxUses: redeemCode.maxUses,
        isActive: redeemCode.isActive,
        expiresAt: redeemCode.expiresAt,
      },
    });
  })
);

/**
 * POST /api/redeem-codes/validate
 * User: validate a code without consuming it (useful to preview a reward).
 */
router.post(
  "/validate",
  asyncHandler(async (req: BetterAuthRequest, res: Response) => {
    const { code } = validateBody(
      z.object({ code: z.string().min(1) }),
      req.body
    );

    const redeemCode = await redeemService.validate(code, String(req.user!._id));

    res.json({
      success: true,
      valid: true,
      code: redeemCode.code,
      type: redeemCode.type,
      value: redeemCode.value,
      title: redeemCode.title,
      description: redeemCode.description,
    });
  })
);

/**
 * POST /api/redeem-codes/redeem
 * User: consume a code and receive the reward.
 */
router.post(
  "/redeem",
  asyncHandler(async (req: BetterAuthRequest, res: Response) => {
    const { code } = validateBody(
      z.object({ code: z.string().min(1) }),
      req.body
    );

    const result = await redeemService.redeem(code, String(req.user!._id), {
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });

    res.json(result);
  })
);

/**
 * GET /api/redeem-codes
 * Admin: paginated list of redeem codes with optional filters.
 */
router.get(
  "/",
  requireAdmin,
  asyncHandler(async (req: BetterAuthRequest, res: Response) => {
    const { active, type, page, limit } = req.query;
    const result = await redeemService.list({
      active: active !== undefined ? active === "true" : undefined,
      type: typeof type === "string" ? type : undefined,
      page: typeof page === "string" ? Number(page) : undefined,
      limit: typeof limit === "string" ? Number(limit) : undefined,
    });
    res.json({ success: true, ...result });
  })
);

/**
 * PATCH /api/redeem-codes/:code/deactivate
 * Admin: deactivate a redeem code so it cannot be used for new redemptions.
 */
router.patch(
  "/:code/deactivate",
  requireAdmin,
  asyncHandler(async (req: BetterAuthRequest, res: Response) => {
    const redeemCode = await redeemService.deactivate(req.params.code);
    res.json({
      success: true,
      code: redeemCode.code,
      isActive: redeemCode.isActive,
    });
  })
);

export default router;
