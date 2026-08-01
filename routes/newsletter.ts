import { Router, Response } from "express";
import { protect, type BetterAuthRequest } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/admin.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { schemas, validateBody } from "../utils/validation.js";
import NewsletterSubscriber from "../models/NewsletterSubscriber.js";

const router = Router();

// Public endpoint: subscribe or re-activate a newsletter email.
router.post(
  "/",
  asyncHandler(async (req: BetterAuthRequest, res: Response) => {
    const { email } = validateBody(schemas.newsletter, req.body);
    const subscriber = await NewsletterSubscriber.findOneAndUpdate(
      { email: email.toLowerCase() },
      { email: email.toLowerCase(), isActive: true },
      { upsert: true, new: true }
    );
    res.status(201).json(subscriber);
  })
);

// Admin endpoint: newsletter subscriber management

router.get(
  "/admin/all",
  protect,
  requireAdmin,
  asyncHandler(async (req: BetterAuthRequest, res: Response) => {
    const { active, page, limit } = req.query;
    const filter: Record<string, unknown> = {};
    if (active === "true" || active === "false") {
      filter.isActive = active === "true";
    }

    const pageNum = typeof page === "string" ? Math.max(1, Number(page) || 1) : 1;
    const pageSize = typeof limit === "string" ? Number(limit) || 20 : 20;

    const [subscribers, total] = await Promise.all([
      NewsletterSubscriber.find(filter)
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * pageSize)
        .limit(pageSize),
      NewsletterSubscriber.countDocuments(filter),
    ]);

    res.json({
      subscribers,
      pagination: {
        page: pageNum,
        pages: Math.ceil(total / pageSize),
        total,
      },
    });
  })
);

export default router;
