import { Router, Response } from "express";
import { FilterQuery, Types } from "mongoose";
import Product, { IProduct } from "../models/Product.js";
import { protect, type BetterAuthRequest } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/admin.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { schemas, validateBody } from "../utils/validation.js";

const router = Router();

// Public endpoints: anyone can list and view products.

router.get(
  "/",
  asyncHandler(async (req: BetterAuthRequest, res: Response) => {
    const {
      category,
      collection,
      signature,
      search,
      inStock,
      active,
      limit,
      page,
      sort,
    } = req.query;

    const query: FilterQuery<IProduct> = {};

    if (typeof category === "string" && category !== "all") {
      query.category = category;
    }
    if (typeof collection === "string" && collection) {
      query.collections = collection;
    }
    if (typeof signature === "string" && signature) {
      query.signatureSeries = signature;
    }
    if (typeof search === "string" && search) {
      query.$text = { $search: search };
    }
    if (inStock === "true") {
      query.inStock = true;
    }
    if (active !== "false") {
      query.isActive = true;
    }

    const pageNum = typeof page === "string" ? Math.max(1, Number(page) || 1) : 1;
    const pageSize = typeof limit === "string" ? Number(limit) || 20 : 20;
    const sortOption = typeof sort === "string" ? sort : "createdAt";

    const [products, total] = await Promise.all([
      Product.find(query)
        .sort(sortOption === "price" ? { price: 1 } : { createdAt: -1 })
        .skip((pageNum - 1) * pageSize)
        .limit(pageSize),
      Product.countDocuments(query),
    ]);

    res.json({
      products,
      pagination: {
        page: pageNum,
        pages: Math.ceil(total / pageSize),
        total,
      },
    });
  })
);

router.get(
  "/:id",
  asyncHandler(async (req: BetterAuthRequest, res: Response) => {
    const { id } = req.params;
    // Accept either a MongoDB ObjectId or a URL-friendly slug.
    let product;
    if (Types.ObjectId.isValid(id)) {
      product = await Product.findById(id);
    }
    if (!product) {
      product = await Product.findOne({ slug: id.toLowerCase() });
    }
    if (!product) {
      throw new ApiError(404, "Product not found");
    }
    res.json(product);
  })
);

// Admin endpoints: all subsequent routes require admin/superadmin.

router.use(protect, requireAdmin);

router.post(
  "/",
  asyncHandler(async (req: BetterAuthRequest, res: Response) => {
    const data = validateBody(schemas.productCreate, req.body);
    const product = await Product.create(data);
    res.status(201).json(product);
  })
);

router.put(
  "/:id",
  asyncHandler(async (req: BetterAuthRequest, res: Response) => {
    const { id } = req.params;
    if (!Types.ObjectId.isValid(id)) {
      throw new ApiError(400, "Invalid product ID");
    }
    const data = validateBody(schemas.productUpdate, req.body);
    const product = await Product.findByIdAndUpdate(id, data, { new: true });
    if (!product) {
      throw new ApiError(404, "Product not found");
    }
    res.json(product);
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req: BetterAuthRequest, res: Response) => {
    const { id } = req.params;
    if (!Types.ObjectId.isValid(id)) {
      throw new ApiError(400, "Invalid product ID");
    }
    const product = await Product.findByIdAndDelete(id);
    if (!product) {
      throw new ApiError(404, "Product not found");
    }
    res.json({ message: "Product deleted" });
  })
);

export default router;
