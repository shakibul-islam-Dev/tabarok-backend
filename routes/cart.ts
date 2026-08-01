import { Router, Response } from "express";
import { Types } from "mongoose";
import Cart from "../models/Cart.js";
import Product from "../models/Product.js";
import { protect, type BetterAuthRequest } from "../middleware/auth.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { schemas, validateBody } from "../utils/validation.js";

const router = Router();

// All cart operations require authentication.
// Guest cart support exists in the schema but is not wired up here yet.
router.use(protect);

/**
 * Find the user's cart or create an empty one.
 * Called by every mutating route so the cart always exists.
 */
async function getOrCreateCart(userId: string) {
  let cart = await Cart.findOne({ user: userId });
  if (!cart) {
    cart = await Cart.create({ user: userId, items: [] });
  }
  return cart;
}

router.get(
  "/",
  asyncHandler(async (req: BetterAuthRequest, res: Response) => {
    const cart = await Cart.findOne({ user: req.user!._id }).populate(
      "items.product"
    );
    res.json(cart ?? { user: req.user!._id, items: [] });
  })
);

/**
 * Add a product to the cart.
 * Validates stock so users cannot add more items than are available.
 * If the same product/size/color is already in the cart, quantities are merged.
 */
router.post(
  "/",
  asyncHandler(async (req: BetterAuthRequest, res: Response) => {
    const { productId, qty, size, color } = validateBody(
      schemas.cartItem,
      req.body
    );
    const product = await Product.findById(productId);
    if (!product) {
      throw new ApiError(404, "Product not found");
    }
    if (!product.isActive) {
      throw new ApiError(400, "Product is not available");
    }
    if (product.stockQuantity < qty) {
      throw new ApiError(
        400,
        `Only ${product.stockQuantity} item(s) available in stock`
      );
    }

    const cart = await getOrCreateCart(String(req.user!._id));
    const existing = cart.items.find(
      (i) =>
        String(i.product) === productId &&
        i.size === size &&
        i.color === color
    );

    if (existing) {
      const newQty = existing.qty + qty;
      if (product.stockQuantity < newQty) {
        throw new ApiError(
          400,
          `Cannot add more than ${product.stockQuantity} item(s) to cart`
        );
      }
      existing.qty = newQty;
    } else {
      cart.items.push({
        product: new Types.ObjectId(productId),
        titleSnapshot: product.title,
        imageSnapshot: product.image,
        qty,
        size,
        color,
        priceSnapshot: product.price,
      });
    }
    await cart.save();
    res.json(cart);
  })
);

/**
 * Update the quantity of an existing cart item.
 * Stock is re-checked against the new quantity.
 */
router.put(
  "/:itemId",
  asyncHandler(async (req: BetterAuthRequest, res: Response) => {
    const { qty } = validateBody(schemas.cartItemUpdate, req.body);
    const cart = await getOrCreateCart(String(req.user!._id));
    const item = cart.items.find((i) => String(i._id) === req.params.itemId);
    if (!item) {
      throw new ApiError(404, "Cart item not found");
    }

    const product = await Product.findById(item.product);
    if (product && product.stockQuantity < qty) {
      throw new ApiError(
        400,
        `Only ${product.stockQuantity} item(s) available in stock`
      );
    }

    item.qty = qty;
    await cart.save();
    res.json(cart);
  })
);

/**
 * Remove a single item from the cart by its cart item _id.
 */
router.delete(
  "/:itemId",
  asyncHandler(async (req: BetterAuthRequest, res: Response) => {
    const cart = await getOrCreateCart(String(req.user!._id));
    cart.items = cart.items.filter((i) => String(i._id) !== req.params.itemId);
    await cart.save();
    res.json(cart);
  })
);

export default router;
