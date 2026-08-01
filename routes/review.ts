import { Router, Response } from "express";
import { Types } from "mongoose";
import Review from "../models/Review.js";
import Order from "../models/Order.js";
import Product from "../models/Product.js";
import { protect, type BetterAuthRequest } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/admin.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { schemas, validateBody } from "../utils/validation.js";

const router = Router();

/**
 * Returns true if the user has purchased the product in a non-cancelled order.
 * Verified-purchase badges help shoppers trust reviews.
 */
async function isVerifiedPurchase(
  userId: string,
  productId: string
): Promise<boolean> {
  const order = await Order.findOne({
    user: new Types.ObjectId(userId),
    status: { $ne: "cancelled" },
    "items.product": new Types.ObjectId(productId),
  });
  return !!order;
}

/**
 * Recomputes a product's average rating from approved reviews.
 */
async function recalculateProductRating(productId: string): Promise<void> {
  const stats = await Review.aggregate([
    { $match: { product: new Types.ObjectId(productId), isApproved: true } },
    {
      $group: {
        _id: "$product",
        avgRating: { $avg: "$rating" },
        count: { $sum: 1 },
      },
    },
  ]);

  const rating = stats.length > 0 ? Math.round(stats[0].avgRating * 10) / 10 : 0;
  const reviewCount = stats.length > 0 ? stats[0].count : 0;

  await Product.findByIdAndUpdate(productId, { rating, reviewCount });
}

// Public endpoint: list approved reviews for a product.
router.get(
  "/",
  asyncHandler(async (req: BetterAuthRequest, res: Response) => {
    const { productId } = req.query;
    const query: Record<string, unknown> = { isApproved: true };
    if (typeof productId === "string" && productId) {
      query.product = productId;
    }
    const reviews = await Review.find(query)
      .populate("user", "name image")
      .sort({ createdAt: -1 });
    res.json(reviews);
  })
);

/**
 * Submit a product review.
 * Reviews are created in a pending (not approved) state so admins can moderate.
 * Duplicate reviews from the same user for the same product are rejected.
 */
router.post(
  "/",
  protect,
  asyncHandler(async (req: BetterAuthRequest, res: Response) => {
    const { productId, rating, comment } = validateBody(
      schemas.review,
      req.body
    );

    const userId = String(req.user!._id);
    const verified = await isVerifiedPurchase(userId, productId);

    // Duplicate review check
    const existing = await Review.findOne({
      product: new Types.ObjectId(productId),
      user: new Types.ObjectId(userId),
    });
    if (existing) {
      throw new ApiError(409, "You have already reviewed this product");
    }

    const review = await Review.create({
      product: new Types.ObjectId(productId),
      user: new Types.ObjectId(userId),
      name: req.user!.name,
      rating,
      comment,
      isApproved: false,
      verifiedPurchase: verified,
    });

    res.status(201).json(review);
  })
);

// Admin endpoints: review moderation

router.get(
  "/admin/all",
  protect,
  requireAdmin,
  asyncHandler(async (req: BetterAuthRequest, res: Response) => {
    const { productId, isApproved, page, limit } = req.query;
    const filter: Record<string, unknown> = {};
    if (typeof productId === "string" && productId)
      filter.product = productId;
    if (isApproved === "true" || isApproved === "false") {
      filter.isApproved = isApproved === "true";
    }

    const pageNum = typeof page === "string" ? Math.max(1, Number(page) || 1) : 1;
    const pageSize = typeof limit === "string" ? Number(limit) || 20 : 20;

    const [reviews, total] = await Promise.all([
      Review.find(filter)
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * pageSize)
        .limit(pageSize)
        .populate("user", "name email")
        .populate("product", "title slug"),
      Review.countDocuments(filter),
    ]);

    res.json({
      reviews,
      pagination: {
        page: pageNum,
        pages: Math.ceil(total / pageSize),
        total,
      },
    });
  })
);

router.patch(
  "/admin/:id/approve",
  protect,
  requireAdmin,
  asyncHandler(async (req: BetterAuthRequest, res: Response) => {
    const { id } = req.params;
    if (!Types.ObjectId.isValid(id)) {
      throw new ApiError(400, "Invalid review ID");
    }

    const review = await Review.findByIdAndUpdate(
      id,
      { isApproved: true },
      { new: true }
    );
    if (!review) {
      throw new ApiError(404, "Review not found");
    }

    await recalculateProductRating(review.product.toString());
    res.json(review);
  })
);

router.patch(
  "/admin/:id/reject",
  protect,
  requireAdmin,
  asyncHandler(async (req: BetterAuthRequest, res: Response) => {
    const { id } = req.params;
    if (!Types.ObjectId.isValid(id)) {
      throw new ApiError(400, "Invalid review ID");
    }

    const review = await Review.findByIdAndUpdate(
      id,
      { isApproved: false },
      { new: true }
    );
    if (!review) {
      throw new ApiError(404, "Review not found");
    }

    await recalculateProductRating(review.product.toString());
    res.json(review);
  })
);

router.delete(
  "/admin/:id",
  protect,
  requireAdmin,
  asyncHandler(async (req: BetterAuthRequest, res: Response) => {
    const { id } = req.params;
    if (!Types.ObjectId.isValid(id)) {
      throw new ApiError(400, "Invalid review ID");
    }
    const review = await Review.findByIdAndDelete(id);
    if (!review) {
      throw new ApiError(404, "Review not found");
    }
    await recalculateProductRating(review.product.toString());
    res.json({ message: "Review deleted" });
  })
);

export default router;
