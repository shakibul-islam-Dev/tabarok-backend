import { Router, Response } from "express";
import { Types } from "mongoose";
import CustomOrderRequest from "../models/CustomOrderRequest.js";
import { protect, type BetterAuthRequest } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/admin.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { schemas, validateBody } from "../utils/validation.js";

const router = Router();

// Public endpoint: anyone can request a custom order quote.
router.post(
  "/",
  asyncHandler(async (req: BetterAuthRequest, res: Response) => {
    const data = validateBody(schemas.customOrder, req.body);
    const request = await CustomOrderRequest.create({
      ...data,
      user: req.user?._id,
    });
    res.status(201).json(request);
  })
);

// Admin endpoints: custom order request management

router.use(protect, requireAdmin);

/**
 * List all custom order requests with optional status filter.
 */
router.get(
  "/admin/all",
  asyncHandler(async (req: BetterAuthRequest, res: Response) => {
    const { status, page, limit } = req.query;
    const filter: Record<string, unknown> = {};
    if (typeof status === "string" && status) filter.status = status;

    const pageNum = typeof page === "string" ? Math.max(1, Number(page) || 1) : 1;
    const pageSize = typeof limit === "string" ? Number(limit) || 20 : 20;

    const [requests, total] = await Promise.all([
      CustomOrderRequest.find(filter)
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * pageSize)
        .limit(pageSize),
      CustomOrderRequest.countDocuments(filter),
    ]);

    res.json({
      requests,
      pagination: {
        page: pageNum,
        pages: Math.ceil(total / pageSize),
        total,
      },
    });
  })
);

/**
 * Update the status of a custom order request (e.g. pending -> quoted -> fulfilled).
 */
router.patch(
  "/admin/:id",
  asyncHandler(async (req: BetterAuthRequest, res: Response) => {
    const { id } = req.params;
    if (!Types.ObjectId.isValid(id)) {
      throw new ApiError(400, "Invalid request ID");
    }
    const { status } = validateBody(schemas.statusUpdate, req.body);
    const request = await CustomOrderRequest.findByIdAndUpdate(
      id,
      { status },
      { new: true }
    );
    if (!request) {
      throw new ApiError(404, "Request not found");
    }
    res.json(request);
  })
);

export default router;
