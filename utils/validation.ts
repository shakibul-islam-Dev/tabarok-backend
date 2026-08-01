import { z } from "zod";

// ---------------------------------------------------------------------------
// Zod validation schemas for the whole API.
//
// Each route calls `validateBody(schema, req.body)` so that invalid input is
// rejected before it reaches the database. The centralized error handler in
// server.ts formats ZodError into a readable JSON response with field-level
// messages.
// ---------------------------------------------------------------------------

// MongoDB ObjectId as a 24-character hex string.
const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid ObjectId");

export const schemas = {
  // Products
  productCreate: z.object({
    title: z.string().min(1, "Title is required").max(200),
    slug: z.string().min(1).max(200).optional(),
    sku: z.string().optional(),
    description: z.string().optional(),
    shortDescription: z.string().max(500).optional(),
    image: z.string().url("Image must be a valid URL"),
    images: z.array(z.string().url()).optional(),
    price: z.number().nonnegative("Price must be 0 or more"),
    originalPrice: z.number().nonnegative().optional(),
    costPrice: z.number().nonnegative().optional(),
    badge: z.string().optional(),
    category: z.string().optional(),
    categoryRef: objectId.optional(),
    collections: z.array(z.string()).optional(),
    signatureSeries: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
    sizes: z.array(z.string()).optional(),
    colors: z
      .array(
        z.object({ name: z.string().min(1), hex: z.string().optional() })
      )
      .optional(),
    stockQuantity: z.number().int().nonnegative().default(0),
    inStock: z.boolean().optional(),
    isActive: z.boolean().optional(),
    weight: z.number().nonnegative().optional(),
    pointsReward: z.number().int().nonnegative().optional(),
  }),

  productUpdate: z.object({
    title: z.string().min(1).max(200).optional(),
    slug: z.string().min(1).max(200).optional(),
    sku: z.string().optional(),
    description: z.string().optional(),
    shortDescription: z.string().max(500).optional(),
    image: z.string().url().optional(),
    images: z.array(z.string().url()).optional(),
    price: z.number().nonnegative().optional(),
    originalPrice: z.number().nonnegative().optional(),
    costPrice: z.number().nonnegative().optional(),
    badge: z.string().optional(),
    category: z.string().optional(),
    categoryRef: objectId.optional(),
    collections: z.array(z.string()).optional(),
    signatureSeries: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
    sizes: z.array(z.string()).optional(),
    colors: z
      .array(
        z.object({ name: z.string().min(1), hex: z.string().optional() })
      )
      .optional(),
    stockQuantity: z.number().int().nonnegative().optional(),
    inStock: z.boolean().optional(),
    isActive: z.boolean().optional(),
    weight: z.number().nonnegative().optional(),
    pointsReward: z.number().int().nonnegative().optional(),
  }),

  // Categories
  category: z.object({
    title: z.string().min(1).max(100),
    slug: z.string().min(1).max(100).optional(),
    description: z.string().optional(),
    image: z.string().url("Image must be a valid URL").optional(),
    type: z.enum(["collection", "signature", "budget", "accessory", "other"]).default("collection"),
    parent: objectId.optional(),
    order: z.number().int().default(0),
    isActive: z.boolean().optional(),
  }),

  // Hero slides
  heroSlide: z.object({
    eyebrow: z.string().optional(),
    title: z.string().min(1, "Title is required"),
    subtitle: z.string().optional(),
    cta: z.string().optional(),
    link: z.string().optional(),
    image: z.string().url("Image must be a valid URL"),
    order: z.number().int().default(0),
    isActive: z.boolean().optional(),
  }),

  // Outlets
  outlet: z.object({
    name: z.string().min(1),
    area: z.string().min(1),
    hours: z.string().optional(),
    phone: z.string().optional(),
    coordinates: z.object({ lat: z.number(), lng: z.number() }).optional(),
    isActive: z.boolean().optional(),
  }),

  // Cart
  cartItem: z.object({
    productId: objectId,
    qty: z.number().int().min(1).default(1),
    size: z.string().optional(),
    color: z.string().optional(),
  }),

  cartItemUpdate: z.object({
    qty: z.number().int().min(1),
  }),

  // Wishlist
  wishlistItem: z.object({
    productId: objectId,
  }),

  // Order
  order: z.object({
    items: z
      .array(
        z.object({
          product: objectId,
          title: z.string().optional(),
          size: z.string().optional(),
          color: z.string().optional(),
          qty: z.number().int().min(1),
        })
      )
      .min(1, "At least one item is required"),
    contact: z
      .object({
        fullName: z.string().min(1),
        phone: z.string().min(1),
        email: z.string().email().optional(),
      })
      .optional(),
    deliveryAddress: z
      .object({
        addressLine1: z.string().min(1),
        addressLine2: z.string().optional(),
        city: z.string().min(1),
        state: z.string().optional(),
        zip: z.string().optional(),
        country: z.string().default("Bangladesh"),
      })
      .optional(),
    billingAddress: z
      .object({
        addressLine1: z.string().min(1),
        addressLine2: z.string().optional(),
        city: z.string().min(1),
        state: z.string().optional(),
        zip: z.string().optional(),
        country: z.string().default("Bangladesh"),
      })
      .optional(),
    paymentMethod: z.string().min(1).default("cod"),
    notes: z.string().optional(),
    pointsToRedeem: z.number().int().nonnegative().optional(),
    // Legacy aliases
    name: z.string().optional(),
    phone: z.string().optional(),
    address: z.string().optional(),
    city: z.string().optional(),
    note: z.string().optional(),
  }),

  orderStatusUpdate: z.object({
    status: z.enum([
      "pending",
      "confirmed",
      "processing",
      "shipped",
      "out_for_delivery",
      "delivered",
      "cancelled",
      "returned",
    ]),
    paymentStatus: z.enum(["pending", "paid", "failed", "refunded"]).optional(),
    trackingSteps: z
      .array(
        z.object({
          label: z.string(),
          done: z.boolean(),
          timestamp: z.string().datetime().optional(),
        })
      )
      .optional(),
  }),

  // Reviews
  review: z.object({
    productId: objectId,
    rating: z.number().int().min(1).max(5),
    comment: z.string().min(1).max(2000),
  }),

  // Contact / Custom order
  contact: z.object({
    name: z.string().min(1),
    email: z.string().email(),
    subject: z.string().optional(),
    message: z.string().min(1),
  }),

  customOrder: z.object({
    name: z.string().min(1),
    phone: z.string().min(1),
    email: z.string().email().optional(),
    productType: z.string().min(1),
    quantity: z.number().int().positive(),
    description: z.string().min(1),
    designFileUrl: z.string().url().optional(),
  }),

  // Newsletter
  newsletter: z.object({
    email: z.string().email(),
  }),

  // Billing address
  billingAddress: z.object({
    label: z.string().optional(),
    fullName: z.string().min(1),
    phone: z.string().min(1),
    email: z.string().email().optional(),
    addressLine1: z.string().min(1),
    addressLine2: z.string().optional(),
    city: z.string().min(1),
    state: z.string().optional(),
    zip: z.string().optional(),
    country: z.string().default("Bangladesh"),
    isDefault: z.boolean().optional(),
  }),

  // Points
  pointsShare: z.object({
    platform: z.enum(["facebook", "whatsapp", "twitter"]),
    url: z.string().url().optional(),
  }),

  pointsReferral: z.object({
    referralCode: z.string().min(1),
  }),

  pointsPurchase: z.object({
    packageId: z.string().optional(),
    amount: z.number().int().positive().optional(),
    paymentMethod: z.string().min(1),
    transactionId: z.string().min(1),
  }),

  // Redeem codes
  redeemCode: z.object({
    code: z.string().optional(),
    type: z.enum(["points", "discount", "product", "cash"]),
    value: z.number().positive(),
    currency: z.string().max(10).optional(),
    productId: objectId.optional(),
    title: z.string().optional(),
    description: z.string().optional(),
    maxUses: z.number().int().positive().optional(),
    startsAt: z.string().datetime().optional(),
    expiresAt: z.string().datetime().optional(),
    isActive: z.boolean().optional(),
  }),

  // Admin
  userRoleUpdate: z.object({
    role: z.enum(["user", "admin", "superadmin"]),
  }),

  userBanUpdate: z.object({
    banned: z.boolean(),
  }),

  statusUpdate: z.object({
    status: z.string().min(1),
  }),
};

/**
 * Validates an HTTP request body against a Zod schema.
 * On failure it throws a ZodError, which the central error handler converts into a
 * 400 response with field-level error messages.
 */
export function validateBody<T>(schema: z.ZodSchema<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw result.error;
  }
  return result.data;
}

/**
 * Validates URL path parameters (e.g. `req.params`) against a Zod schema.
 */
export function validateParams<T>(schema: z.ZodSchema<T>, params: unknown): T {
  const result = schema.safeParse(params);
  if (!result.success) {
    throw result.error;
  }
  return result.data;
}

/**
 * Validates URL query parameters (e.g. `req.query`) against a Zod schema.
 */
export function validateQuery<T>(schema: z.ZodSchema<T>, query: unknown): T {
  const result = schema.safeParse(query);
  if (!result.success) {
    throw result.error;
  }
  return result.data;
}

export { z };
