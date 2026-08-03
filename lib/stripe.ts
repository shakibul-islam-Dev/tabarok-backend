import Stripe from "stripe";
import type Order from "../models/Order.js";
import { ApiError } from "../utils/ApiError.js";

let client: Stripe | null = null;

/**
 * Lazily initializes the Stripe client so the server can boot even when the
 * secret key is still a placeholder. Any checkout call fails with a clear
 * message until STRIPE_SECRET_KEY is configured.
 */
export function getStripe(): Stripe {
  if (client) return client;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || key.includes("REPLACE_WITH_YOUR")) {
    throw new ApiError(
      500,
      "STRIPE_SECRET_KEY is not configured. Set it in .env to enable payments."
    );
  }
  client = new Stripe(key);
  return client;
}

export function stripeCurrency(): string {
  return (process.env.STRIPE_CURRENCY || "usd").toLowerCase();
}

/** Converts a taka amount into the smallest currency unit Stripe expects. */
export function toStripeAmount(amount: number): number {
  return Math.round(amount * 100);
}

/**
 * Frontend base URL used for Stripe success/cancel redirects.
 * Reuses BETTER_AUTH_URL (the frontend origin convention used in this project).
 */
export function frontendBaseUrl(): string {
  const origins = (process.env.BETTER_AUTH_URL || "http://localhost:3000")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  return origins[0] || "http://localhost:3000";
}

export interface CheckoutOrderParams {
  order: InstanceType<typeof Order>;
  successPath?: string;
  cancelPath?: string;
}

/**
 * Creates a Stripe Checkout Session for an existing pending order.
 * Line items mirror the order: products, delivery fee, and any points discount.
 * The webhook uses `metadata.type = "order"` to mark the order as paid.
 */
export async function createOrderCheckoutSession({
  order,
  successPath = "/payment/success",
  cancelPath = "/checkout",
}: CheckoutOrderParams): Promise<Stripe.Checkout.Session> {
  const stripe = getStripe();
  const currency = stripeCurrency();

  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = order.items.map(
    (item) => {
      const description = [item.size && `Size: ${item.size}`, item.color && `Color: ${item.color}`]
        .filter(Boolean)
        .join(", ");
      return {
        quantity: item.qty,
        price_data: {
          currency,
          product_data: { name: item.title, description: description || undefined },
          unit_amount: toStripeAmount(item.price),
        },
      };
    }
  );

  if (order.deliveryFee > 0) {
    lineItems.push({
      quantity: 1,
      price_data: {
        currency,
        product_data: { name: "Delivery fee" },
        unit_amount: toStripeAmount(order.deliveryFee),
      },
    });
  }

  if (order.pointsDiscount > 0) {
    lineItems.push({
      quantity: 1,
      price_data: {
        currency,
        product_data: { name: "Points discount" },
        unit_amount: -toStripeAmount(order.pointsDiscount),
      },
    });
  }

  return stripe.checkout.sessions.create({
    mode: "payment",
    line_items: lineItems,
    client_reference_id: order._id.toString(),
    customer_email: order.contact?.email || undefined,
    metadata: { type: "order", orderId: order._id.toString() },
    success_url: `${frontendBaseUrl()}${successPath}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${frontendBaseUrl()}${cancelPath}`,
  });
}

export interface CheckoutPointsParams {
  points: number;
  price: number;
  packageId?: string;
  userId: string;
  successPath?: string;
  cancelPath?: string;
}

/**
 * Creates a Stripe Checkout Session for a points top-up.
 * The webhook uses `metadata.type = "points"` to credit the user's balance.
 */
export async function createPointsCheckoutSession({
  points,
  price,
  packageId,
  userId,
  successPath = "/payment/success",
  cancelPath = "/points",
}: CheckoutPointsParams): Promise<Stripe.Checkout.Session> {
  const stripe = getStripe();
  const currency = stripeCurrency();

  return stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency,
          product_data: { name: packageId ? `${points} points package` : `${points} points` },
          unit_amount: toStripeAmount(price),
        },
      },
    ],
    metadata: {
      type: "points",
      userId,
      ...(packageId ? { packageId } : {}),
      points: String(points),
      price: String(price),
    },
    success_url: `${frontendBaseUrl()}${successPath}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${frontendBaseUrl()}${cancelPath}`,
  });
}

/**
 * Verifies a Stripe webhook signature against the raw request body.
 * Throws if the payload is invalid or STRIPE_WEBHOOK_SECRET is not set.
 */
export function constructWebhookEvent(
  payload: string | Buffer,
  signature: string | string[] | undefined
): Stripe.Event {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || secret.includes("REPLACE_WITH_YOUR")) {
    throw new ApiError(
      500,
      "STRIPE_WEBHOOK_SECRET is not configured. Set it in .env to receive payment events."
    );
  }
  if (!signature) {
    throw new ApiError(400, "Missing Stripe signature");
  }
  const sig = Array.isArray(signature) ? signature[0] : signature;
  return getStripe().webhooks.constructEvent(payload, sig, secret);
}

export { Stripe };
