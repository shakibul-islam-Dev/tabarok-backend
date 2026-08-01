import { Router, Response } from "express";
import { Types } from "mongoose";
import BillingAddress from "../models/BillingAddress.js";
import { protect, type BetterAuthRequest } from "../middleware/auth.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { schemas, validateBody } from "../utils/validation.js";

const router = Router();

// Billing addresses are private to each authenticated user.
router.use(protect);

/**
 * List all billing addresses for the current user.
 * Default addresses are sorted to the top.
 */
router.get(
  "/",
  asyncHandler(async (req: BetterAuthRequest, res: Response) => {
    const addresses = await BillingAddress.find({ user: req.user!._id }).sort({
      isDefault: -1,
      createdAt: -1,
    });
    res.json(addresses);
  })
);

/**
 * Create a new billing address.
 * If marked as default, clear the default flag from all other addresses first.
 */
router.post(
  "/",
  asyncHandler(async (req: BetterAuthRequest, res: Response) => {
    const data = validateBody(schemas.billingAddress, req.body);
    if (data.isDefault) {
      await BillingAddress.updateMany(
        { user: req.user!._id },
        { isDefault: false }
      );
    }
    const address = await BillingAddress.create({
      ...data,
      user: req.user!._id,
    });
    res.status(201).json(address);
  })
);

/**
 * Update one of the user's own billing addresses.
 */
router.put(
  "/:id",
  asyncHandler(async (req: BetterAuthRequest, res: Response) => {
    const { id } = req.params;
    if (!Types.ObjectId.isValid(id)) {
      throw new ApiError(400, "Invalid address ID");
    }
    const data = validateBody(schemas.billingAddress.partial(), req.body);
    if (data.isDefault) {
      await BillingAddress.updateMany(
        { user: req.user!._id },
        { isDefault: false }
      );
    }
    const address = await BillingAddress.findOneAndUpdate(
      { _id: id, user: req.user!._id },
      data,
      { new: true }
    );
    if (!address) {
      throw new ApiError(404, "Address not found");
    }
    res.json(address);
  })
);

/**
 * Delete one of the user's own billing addresses.
 */
router.delete(
  "/:id",
  asyncHandler(async (req: BetterAuthRequest, res: Response) => {
    const { id } = req.params;
    if (!Types.ObjectId.isValid(id)) {
      throw new ApiError(400, "Invalid address ID");
    }
    const address = await BillingAddress.findOneAndDelete({
      _id: id,
      user: req.user!._id,
    });
    if (!address) {
      throw new ApiError(404, "Address not found");
    }
    res.json({ message: "Address deleted" });
  })
);

export default router;
