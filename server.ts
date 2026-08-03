import "dotenv/config";
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import { toNodeHandler } from "better-auth/node";
import { ZodError } from "zod";
import rateLimit from "express-rate-limit";
import path from "path";
import connectDB from "./config/db.js";
import { auth } from "./lib/auth.js";
import { ApiError } from "./utils/ApiError.js";
import { uploadDir } from "./utils/upload.js";
import paymentRouter, { paymentWebhook } from "./routes/payment.js";
import uploadRouter from "./routes/upload.js";
import authRouter from "./routes/auth.js";
import adminRouter from "./routes/admin.js";
import productRouter from "./routes/product.js";
import orderRouter from "./routes/order.js";
import pointsRouter from "./routes/points.js";
import categoryRouter from "./routes/category.js";
import heroSlideRouter from "./routes/heroSlide.js";
import outletRouter from "./routes/outlet.js";
import billingAddressRouter from "./routes/billingAddress.js";
import cartRouter from "./routes/cart.js";
import wishlistRouter from "./routes/wishlist.js";
import contactRouter from "./routes/contact.js";
import customOrderRouter from "./routes/customOrder.js";
import newsletterRouter from "./routes/newsletter.js";
import reviewRouter from "./routes/review.js";
import redeemCodeRouter from "./routes/redeemCodes.js";

connectDB();

const app = express();

// BETTER_AUTH_URL holds the frontend origin(s) in this project's env convention
const clientOrigins = (process.env.BETTER_AUTH_URL || "http://localhost:3000")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || clientOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS blocked origin: ${origin}`));
      }
    },
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    credentials: true,
  })
);

// General rate limiter for public endpoints
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests, please try again later." },
});
app.use(generalLimiter);

// Stricter limiter for auth-related endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many auth attempts, please try again later." },
});
app.use("/api/auth/", authLimiter);

// Mount Better Auth handler BEFORE express.json()
app.all("/api/auth/*", toNodeHandler(auth));

// Serve uploaded files statically.
app.use("/uploads", express.static(uploadDir));

// Stripe webhook needs the raw request body for signature verification,
// so it is mounted BEFORE express.json().
app.post(
  "/api/payments/webhook",
  express.raw({ type: "application/json" }),
  paymentWebhook
);

// Body parser only for non-Better-Auth routes
app.use(express.json());

// Health-check / root endpoint.
app.get("/", (_req: Request, res: Response) =>
  res.json({ message: "tobarok API" })
);

// Business route modules.
// Each module owns its own validation, auth, and admin guards internally.
app.use("/api/account", authRouter);
app.use("/api/admin", adminRouter);
app.use("/api/products", productRouter);
app.use("/api/categories", categoryRouter);
app.use("/api/orders", orderRouter);
app.use("/api/points", pointsRouter);
app.use("/api/cart", cartRouter);
app.use("/api/wishlist", wishlistRouter);
app.use("/api/billing-addresses", billingAddressRouter);
app.use("/api/contact", contactRouter);
app.use("/api/custom-orders", customOrderRouter);
app.use("/api/newsletter", newsletterRouter);
app.use("/api/reviews", reviewRouter);
app.use("/api/redeem-codes", redeemCodeRouter);
app.use("/api/hero-slides", heroSlideRouter);
app.use("/api/outlets", outletRouter);
app.use("/api/uploads", uploadRouter);
app.use("/api/payments", paymentRouter);

app.use((_req: Request, _res: Response, _next: NextFunction) => {
  throw new ApiError(404, "Route not found");
});

// Centralized error handler.
// - Zod validation errors become 400 with field-level details.
// - ApiError instances use their own status code.
// - Unexpected errors become 500; stack traces are included in development only.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ZodError) {
    const issues = err.issues.map((i) => ({ path: i.path, message: i.message }));
    res.status(400).json({
      message: "Validation failed",
      errors: issues,
    });
    return;
  }

  const status = err instanceof ApiError ? err.status : 500;
  const body: { message: string; stack?: string } = {
    message: err instanceof Error ? err.message : "Server error",
  };
  if (process.env.NODE_ENV !== "production" && err instanceof Error) {
    body.stack = err.stack;
  }
  res.status(status).json(body);
});

const PORT = Number(process.env.PORT) || 5000;

// Export app for Vercel serverless; keep local dev listener
export default app;

if (!process.env.VERCEL) {
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}
