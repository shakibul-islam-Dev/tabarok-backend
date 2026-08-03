import { Router, Request, Response } from "express";
import { Types } from "mongoose";
import Order from "../models/Order.js";
import PointTransaction from "../models/PointTransaction.js";
import { protect, type BetterAuthRequest } from "../middleware/auth.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { schemas, validateBody } from "../utils/validation.js";
import { PointsService } from "../services/pointsService.js";
import {
  createOrderCheckoutSession,
  createPointsCheckoutSession,
  constructWebhookEvent,
} from "../lib/stripe.js";
import { envNumber } from "../utils/env.js";

const router = Router();

const pointPackages = [
  { id: "pkg-small", name: "Starter Pack", points: 100, price: 100, currency: "BDT" },
  { id: "pkg-medium", name: "Popular Pack", points: 500, price: 450, currency: "BDT" },
  { id: "pkg-large", name: "Mega Pack", points: 1000, price: 800, currency: "BDT" },
];

function resolvePointsPackage(body: {
  packageId?: string;
  amount?: number;
}): { points: number; price: number; packageId?: string } {
  if (body.packageId) {
    const pkg = pointPackages.find((p) => p.id === body.packageId);
    if (!pkg) throw new ApiError(404, "Package not found");
    return { points: pkg.points, price: pkg.price, packageId: pkg.id };
  }
  if (typeof body.amount === "number" && body.amount > 0) {
    const rate = envNumber("POINT_PURCHASE_RATE", 1);
    return { points: body.amount, price: body.amount * rate };
  }
  throw new ApiError(400, "Provide either a valid packageId or a positive amount");
}

// Authenticated checkout session endpoints.

router.use(protect);

/**
 * POST /api/payments/checkout/order
 * Body: { orderId, successPath?, cancelPath? }
 * Returns a Stripe Checkout Session URL for the user's pending order.
 */
router.post(
  "/checkout/order",
  asyncHandler(async (req: BetterAuthRequest, res: Response) => {
    const { orderId, successPath, cancelPath } = validateBody(
      schemas.checkoutOrder,
      req.body
    );

    const order = await Order.findOne({ _id: orderId, user: req.user!._id });
    if (!order) {
      throw new ApiError(404, "Order not found");
    }
    if (order.paymentStatus === "paid") {
      throw new ApiError(400, "Order has already been paid");
    }

    const session = await createOrderCheckoutSession({
      order,
      successPath,
      cancelPath,
    });

    res.json({ url: session.url, sessionId: session.id });
  })
);

/**
 * POST /api/payments/checkout/points
 * Body: { packageId? | amount?, successPath?, cancelPath? }
 * Returns a Stripe Checkout Session URL for a points top-up.
 */
router.post(
  "/checkout/points",
  asyncHandler(async (req: BetterAuthRequest, res: Response) => {
    const { packageId, amount, successPath, cancelPath } = validateBody(
      schemas.checkoutPoints,
      req.body
    );

    const { points, price, packageId: resolvedPackage } = resolvePointsPackage({
      packageId,
      amount,
    });

    const session = await createPointsCheckoutSession({
      points,
      price,
      packageId: resolvedPackage,
      userId: String(req.user!._id),
      successPath,
      cancelPath,
    });

    res.json({ url: session.url, sessionId: session.id });
  })
);

// ---------------------------------------------------------------------------
// Stripe webhook.
//
// This handler is mounted in server.ts BEFORE express.json() with a raw body
// parser, because signature verification needs the exact bytes Stripe sent.
// ---------------------------------------------------------------------------

interface StripeCheckoutSession {
  id: string;
  payment_status: string;
  payment_intent?: string | null;
  metadata?: { type?: string; [k: string]: string | undefined };
}

async function fulfillOrderPayment(session: StripeCheckoutSession): Promise<void> {
  const orderId = session.metadata?.orderId;
  if (!orderId || !Types.ObjectId.isValid(orderId)) return;

  const order = await Order.findById(orderId);
  if (!order) return;

  // Idempotency: never re-mark or re-trigger an already paid order.
  if (order.paymentStatus === "paid") return;

  order.paymentStatus = "paid";
  order.paymentId = session.payment_intent ?? session.id;
  order.paidAt = new Date();
  order.paymentMethod = "stripe";
  await order.save();
}

async function fulfillPointsPurchase(session: StripeCheckoutSession): Promise<void> {
  const userId = session.metadata?.userId;
  const points = Number(session.metadata?.points ?? 0);
  if (!userId || !Types.ObjectId.isValid(userId) || points <= 0) return;

  // Idempotency: each Stripe session credits points at most once.
  const pointsService = new PointsService();

  const existing = await PointTransaction.findOne({
    referenceType: "purchase",
    referenceId: session.id,
  });
  if (existing) return;

  await pointsService.earnPoints(
    {
      userId,
      type: "topup",
      amount: points,
      description: `Purchased ${points} points`,
      referenceType: "purchase",
      referenceId: session.id,
      metadata: {
        packageId: session.metadata?.packageId,
        price: Number(session.metadata?.price ?? 0),
        currency: "BDT",
        paymentMethod: "stripe",
        transactionId: session.id,
        purchaseAmount: Number(session.metadata?.price ?? 0),
      },
    },
    { skipFraudCheck: true }
  );
}

export async function paymentWebhook(
  req: Request,
  res: Response
): Promise<void> {
  let event;
  try {
    event = constructWebhookEvent(req.body, req.headers["stripe-signature"]);
  } catch (err) {
    res.status(400).json({
      message: `Webhook signature verification failed: ${
        err instanceof Error ? err.message : "invalid signature"
      }`,
    });
    return;
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as StripeCheckoutSession;
    try {
      if (session.payment_status !== "paid") {
        res.json({ received: true, fulfilled: false, reason: "unpaid" });
        return;
      }
      if (session.metadata?.type === "order") {
        await fulfillOrderPayment(session);
      } else if (session.metadata?.type === "points") {
        await fulfillPointsPurchase(session);
      }
    } catch (err) {
      // Return an error so Stripe retries the delivery.
      res.status(500).json({
        message: `Webhook handler failed: ${err instanceof Error ? err.message : "unknown error"}`,
      });
      return;
    }
  }

  res.json({ received: true });
}

export default router;
