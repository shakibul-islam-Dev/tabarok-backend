import { Router, Response } from "express";
import { Types } from "mongoose";
import HeroSlide from "../models/HeroSlide.js";
import { protect, type BetterAuthRequest } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/admin.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { schemas, validateBody } from "../utils/validation.js";

const router = Router();

// Public endpoint: only active slides are returned, sorted by display order.

router.get(
  "/",
  asyncHandler(async (_req: BetterAuthRequest, res: Response) => {
    const slides = await HeroSlide.find({ isActive: true }).sort({ order: 1 });
    res.json(slides);
  })
);

// Admin endpoints: hero slide CRUD

router.use(protect, requireAdmin);

router.post(
  "/",
  asyncHandler(async (req: BetterAuthRequest, res: Response) => {
    const data = validateBody(schemas.heroSlide, req.body);
    const slide = await HeroSlide.create(data);
    res.status(201).json(slide);
  })
);

router.put(
  "/:id",
  asyncHandler(async (req: BetterAuthRequest, res: Response) => {
    const { id } = req.params;
    if (!Types.ObjectId.isValid(id)) {
      throw new ApiError(400, "Invalid slide ID");
    }
    const data = validateBody(schemas.heroSlide.partial(), req.body);
    const slide = await HeroSlide.findByIdAndUpdate(id, data, { new: true });
    if (!slide) {
      throw new ApiError(404, "Slide not found");
    }
    res.json(slide);
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req: BetterAuthRequest, res: Response) => {
    const { id } = req.params;
    if (!Types.ObjectId.isValid(id)) {
      throw new ApiError(400, "Invalid slide ID");
    }
    const slide = await HeroSlide.findByIdAndDelete(id);
    if (!slide) {
      throw new ApiError(404, "Slide not found");
    }
    res.json({ message: "Slide deleted" });
  })
);

export default router;
