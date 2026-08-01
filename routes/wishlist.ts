import { Router, Response } from "express";
import { Types } from "mongoose";
import Wishlist from "../models/Wishlist.js";
import Product from "../models/Product.js";
import { protect, type BetterAuthRequest } from "../middleware/auth.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { schemas, validateBody } from "../utils/validation.js";

const router = Router();

// Wishlist is per authenticated user.
router.use(protect);

/**
 * Find the user's wishlist or create an empty one.
 */
async function getOrCreateWishlist(userId: string) {
  let wishlist = await Wishlist.findOne({ user: userId });
  if (!wishlist) {
    wishlist = await Wishlist.create({ user: userId, items: [] });
  }
  return wishlist;
}

router.get(
  "/",
  asyncHandler(async (req: BetterAuthRequest, res: Response) => {
    const wishlist = await Wishlist.findOne({ user: req.user!._id }).populate(
      "items.product"
    );
    res.json(wishlist ?? { user: req.user!._id, items: [] });
  })
);

/**
 * Add a product to the user's wishlist if it is not already there.
 */
router.post(
  "/",
  asyncHandler(async (req: BetterAuthRequest, res: Response) => {
    const { productId } = validateBody(schemas.wishlistItem, req.body);
    const product = await Product.findById(productId);
    if (!product) {
      throw new ApiError(404, "Product not found");
    }
    const wishlist = await getOrCreateWishlist(String(req.user!._id));
    const exists = wishlist.items.find(
      (i) => String(i.product) === productId
    );
    if (!exists) {
      wishlist.items.push({
        product: new Types.ObjectId(productId),
        addedAt: new Date(),
      });
      await wishlist.save();
    }
    res.json(wishlist);
  })
);

/**
 * Remove a product from the wishlist by product ID.
 */
router.delete(
  "/:productId",
  asyncHandler(async (req: BetterAuthRequest, res: Response) => {
    const wishlist = await getOrCreateWishlist(String(req.user!._id));
    wishlist.items = wishlist.items.filter(
      (i) => String(i.product) !== req.params.productId
    );
    await wishlist.save();
    res.json(wishlist);
  })
);

export default router;
