import { Router, Response } from "express";
import { Types } from "mongoose";
import Category from "../models/Category.js";
import { protect, type BetterAuthRequest } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/admin.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { schemas, validateBody } from "../utils/validation.js";

const router = Router();

// Public endpoints: list and view active categories.

router.get(
  "/",
  asyncHandler(async (req: BetterAuthRequest, res: Response) => {
    const { type, active } = req.query;
    const query: Record<string, unknown> = {};
    if (typeof type === "string" && type) {
      query.type = type;
    }
    if (active !== "false") {
      query.isActive = true;
    }
    const categories = await Category.find(query).sort({ order: 1, title: 1 });
    res.json(categories);
  })
);

router.get(
  "/:slug",
  asyncHandler(async (req: BetterAuthRequest, res: Response) => {
    const category = await Category.findOne({
      slug: req.params.slug,
      isActive: true,
    });
    if (!category) {
      throw new ApiError(404, "Category not found");
    }
    res.json(category);
  })
);

// Admin endpoints: category CRUD

router.use(protect, requireAdmin);

/**
 * Builds a unique URL slug from a category title.
 * Called when an admin omits the optional `slug` field.
 */
async function uniqueCategorySlug(title: string): Promise<string> {
  const base =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "category";
  let slug = base;
  let n = 2;
  while (await Category.exists({ slug })) {
    slug = `${base}-${n++}`;
  }
  return slug;
}

router.post(
  "/",
  asyncHandler(async (req: BetterAuthRequest, res: Response) => {
    const data = validateBody(schemas.category, req.body);
    if (!data.slug) {
      data.slug = await uniqueCategorySlug(data.title);
    }
    const category = await Category.create(data);
    res.status(201).json(category);
  })
);

router.put(
  "/:id",
  asyncHandler(async (req: BetterAuthRequest, res: Response) => {
    const { id } = req.params;
    if (!Types.ObjectId.isValid(id)) {
      throw new ApiError(400, "Invalid category ID");
    }
    const data = validateBody(schemas.category.partial(), req.body);
    const category = await Category.findByIdAndUpdate(id, data, { new: true });
    if (!category) {
      throw new ApiError(404, "Category not found");
    }
    res.json(category);
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req: BetterAuthRequest, res: Response) => {
    const { id } = req.params;
    if (!Types.ObjectId.isValid(id)) {
      throw new ApiError(400, "Invalid category ID");
    }
    const category = await Category.findByIdAndDelete(id);
    if (!category) {
      throw new ApiError(404, "Category not found");
    }
    res.json({ message: "Category deleted" });
  })
);

export default router;
