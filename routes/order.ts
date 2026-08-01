import { Router, Response } from "express";
import { Types, ClientSession } from "mongoose";
import Order from "../models/Order.js";
import Product from "../models/Product.js";
import Cart from "../models/Cart.js";
import Redemption from "../models/Redemption.js";
import { protect, type BetterAuthRequest } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/admin.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { schemas, validateBody } from "../utils/validation.js";
import { envNumber, getPointsBalance } from "../utils/points.js";
import { PointsService } from "../services/pointsService.js";

const router = Router();

// Fallback delivery fee rule. Free delivery over ৳1500, otherwise ৳90.
function deliveryFee(subtotal: number): number {
  return subtotal >= 1500 ? 0 : 90;
}

interface PopulatedOrderItem {
  product: Types.ObjectId;
  title: string;
  price: number;
  size?: string;
  color?: string;
  qty: number;
}

/**
 * Validates stock for every item and deducts it in one go.
 * Throws ApiError if any item is unavailable or exceeds stock.
 */
async function validateAndDeductStock(
  items: PopulatedOrderItem[],
  session: ClientSession
): Promise<void> {
  const productIds = items.map((i) => i.product);
  const products = await Product.find({ _id: { $in: productIds } }).session(
    session
  );
  const productMap = new Map(
    products.map((p) => [String(p._id), p])
  );

  // Validate all items first
  for (const item of items) {
    const product = productMap.get(String(item.product));
    if (!product) {
      throw new ApiError(400, `Product not found: ${item.product}`);
    }
    if (!product.isActive) {
      throw new ApiError(400, `Product is no longer available: ${product.title}`);
    }
    if (product.stockQuantity < item.qty) {
      throw new ApiError(
        400,
        `Insufficient stock for ${product.title}. Available: ${product.stockQuantity}, requested: ${item.qty}`
      );
    }
  }

  // Deduct stock
  const bulkOps = items.map((item) => ({
    updateOne: {
      filter: { _id: item.product },
      update: { $inc: { stockQuantity: -item.qty } },
    },
  }));
  await Product.bulkWrite(bulkOps, { session });
}

router.use(protect);

router.get(
  "/",
  asyncHandler(async (req: BetterAuthRequest, res: Response) => {
    const orders = await Order.find({ user: req.user!._id }).sort({
      createdAt: -1,
    });
    res.json(orders);
  })
);

router.get(
  "/:id",
  asyncHandler(async (req: BetterAuthRequest, res: Response) => {
    const { id } = req.params;
    if (!Types.ObjectId.isValid(id)) {
      throw new ApiError(400, "Invalid order ID");
    }
    const order = await Order.findOne({ _id: id, user: req.user!._id });
    if (!order) {
      throw new ApiError(404, "Order not found");
    }
    res.json(order);
  })
);

router.post(
  "/",
  asyncHandler(async (req: BetterAuthRequest, res: Response) => {
    const body = validateBody(schemas.order, req.body);
    const {
      items,
      contact,
      deliveryAddress,
      billingAddress,
      paymentMethod,
      notes,
      pointsToRedeem,
      name,
      phone,
      address,
      city,
      note,
    } = body;

    const userId = String(req.user!._id);

    // Resolve product prices and validate stock
    const productIds = items.map((i) => new Types.ObjectId(i.product));
    const products = await Product.find({ _id: { $in: productIds } });
    const productMap = new Map(products.map((p) => [String(p._id), p]));

    let subtotal = 0;
    const orderItems: PopulatedOrderItem[] = items.map((i) => {
      const product = productMap.get(i.product);
      if (!product) {
        throw new ApiError(400, `Product not found: ${i.product}`);
      }
      const price = product.price;
      subtotal += price * i.qty;
      return {
        product: new Types.ObjectId(i.product),
        title: i.title ?? product.title,
        price,
        size: i.size,
        color: i.color,
        qty: i.qty,
      };
    });

    const orderContact = {
      fullName: contact?.fullName ?? name ?? "",
      phone: contact?.phone ?? phone ?? "",
      email: contact?.email ?? req.user!.email,
    };

    const orderDeliveryAddress = {
      addressLine1: deliveryAddress?.addressLine1 ?? address ?? "",
      addressLine2: deliveryAddress?.addressLine2,
      city: deliveryAddress?.city ?? city ?? "",
      state: deliveryAddress?.state,
      zip: deliveryAddress?.zip,
      country: deliveryAddress?.country ?? "Bangladesh",
    };

    if (!orderContact.fullName || !orderContact.phone) {
      throw new ApiError(400, "Name and phone are required");
    }
    if (!orderDeliveryAddress.addressLine1 || !orderDeliveryAddress.city) {
      throw new ApiError(400, "Address and city are required");
    }

    const fee = deliveryFee(subtotal);
    let pointsUsed = 0;
    let pointsDiscount = 0;
    let total = subtotal + fee;

    // Resolve points redemption in taka terms
    if (typeof pointsToRedeem === "number" && pointsToRedeem > 0) {
      const redemptionRate = envNumber("POINT_REDEMPTION_RATE", 1);
      const balance = await getPointsBalance(userId);
      const requestedDiscount = pointsToRedeem * redemptionRate;
      const maxDiscountInTaka = Math.min(subtotal, balance * redemptionRate);
      pointsDiscount = Math.min(requestedDiscount, maxDiscountInTaka);
      pointsUsed = Math.ceil(pointsDiscount / redemptionRate);
      total = Math.max(0, subtotal + fee - pointsDiscount);
    }

    // Create the order, deduct stock, and redeem points in a single transaction.
    // If any step fails, the whole order is rolled back so we cannot end up with
    // a placed order but missing stock or unredeemed points.
    const pointsService = new PointsService();
    const session = await Order.startSession();
    let order;

    try {
      order = await session.withTransaction(async () => {
        const created = await Order.create(
          [
            {
              user: req.user!._id,
              items: orderItems,
              contact: orderContact,
              deliveryAddress: orderDeliveryAddress,
              billingAddress: billingAddress
                ? {
                    addressLine1: billingAddress.addressLine1 ?? "",
                    addressLine2: billingAddress.addressLine2,
                    city: billingAddress.city ?? "",
                    state: billingAddress.state,
                    zip: billingAddress.zip,
                    country: billingAddress.country ?? "Bangladesh",
                  }
                : undefined,
              paymentMethod,
              subtotal,
              deliveryFee: fee,
              discount: 0,
              pointsUsed,
              pointsDiscount,
              total,
              notes: notes ?? note,
            },
          ],
          { session }
        );

        await validateAndDeductStock(orderItems, session);

        if (pointsUsed > 0) {
          await pointsService.redeemPoints({
            userId,
            orderId: created[0]._id.toString(),
            pointsRequired: pointsUsed,
            productValue: pointsDiscount,
            description: `Redeemed ${pointsUsed} points on order ${created[0].orderNumber}`,
            referenceType: "order",
            referenceId: created[0]._id.toString(),
            session,
          });
        }

        return created[0];
      });
    } catch (error) {
      throw error;
    } finally {
      session.endSession();
    }

    // Clear the user's cart after a successful order
    await Cart.findOneAndUpdate(
      { user: req.user!._id },
      { $set: { items: [] } }
    );

    res.status(201).json(order);
  })
);

// ---- Admin endpoints ----

router.get(
  "/admin/all",
  requireAdmin,
  asyncHandler(async (req: BetterAuthRequest, res: Response) => {
    const { status, paymentStatus, page, limit } = req.query;
    const filter: Record<string, unknown> = {};
    if (typeof status === "string" && status) filter.status = status;
    if (typeof paymentStatus === "string" && paymentStatus)
      filter.paymentStatus = paymentStatus;

    const pageNum = typeof page === "string" ? Math.max(1, Number(page) || 1) : 1;
    const pageSize = typeof limit === "string" ? Number(limit) || 20 : 20;

    const [orders, total] = await Promise.all([
      Order.find(filter)
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * pageSize)
        .limit(pageSize)
        .populate("user", "name email"),
      Order.countDocuments(filter),
    ]);

    res.json({
      orders,
      pagination: {
        page: pageNum,
        pages: Math.ceil(total / pageSize),
        total,
      },
    });
  })
);

router.get(
  "/admin/:id",
  requireAdmin,
  asyncHandler(async (req: BetterAuthRequest, res: Response) => {
    const { id } = req.params;
    if (!Types.ObjectId.isValid(id)) {
      throw new ApiError(400, "Invalid order ID");
    }
    const order = await Order.findById(id).populate("user", "name email");
    if (!order) {
      throw new ApiError(404, "Order not found");
    }
    res.json(order);
  })
);

router.patch(
  "/admin/:id",
  requireAdmin,
  asyncHandler(async (req: BetterAuthRequest, res: Response) => {
    const { id } = req.params;
    if (!Types.ObjectId.isValid(id)) {
      throw new ApiError(400, "Invalid order ID");
    }

    const update = validateBody(schemas.orderStatusUpdate, req.body);
    const order = await Order.findByIdAndUpdate(
      id,
      { $set: update },
      { new: true }
    );
    if (!order) {
      throw new ApiError(404, "Order not found");
    }
    res.json(order);
  })
);

export default router;
