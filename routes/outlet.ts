import { Router, Response } from "express";
import { Types } from "mongoose";
import Outlet from "../models/Outlet.js";
import { protect, type BetterAuthRequest } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/admin.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { schemas, validateBody } from "../utils/validation.js";

const router = Router();

// Public endpoint: list active physical outlets.

router.get(
  "/",
  asyncHandler(async (_req: BetterAuthRequest, res: Response) => {
    const outlets = await Outlet.find({ isActive: true });
    res.json(outlets);
  })
);

// Admin endpoints: outlet CRUD

router.use(protect, requireAdmin);

router.post(
  "/",
  asyncHandler(async (req: BetterAuthRequest, res: Response) => {
    const data = validateBody(schemas.outlet, req.body);
    const outlet = await Outlet.create(data);
    res.status(201).json(outlet);
  })
);

router.put(
  "/:id",
  asyncHandler(async (req: BetterAuthRequest, res: Response) => {
    const { id } = req.params;
    if (!Types.ObjectId.isValid(id)) {
      throw new ApiError(400, "Invalid outlet ID");
    }
    const data = validateBody(schemas.outlet.partial(), req.body);
    const outlet = await Outlet.findByIdAndUpdate(id, data, { new: true });
    if (!outlet) {
      throw new ApiError(404, "Outlet not found");
    }
    res.json(outlet);
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req: BetterAuthRequest, res: Response) => {
    const { id } = req.params;
    if (!Types.ObjectId.isValid(id)) {
      throw new ApiError(400, "Invalid outlet ID");
    }
    const outlet = await Outlet.findByIdAndDelete(id);
    if (!outlet) {
      throw new ApiError(404, "Outlet not found");
    }
    res.json({ message: "Outlet deleted" });
  })
);

export default router;
