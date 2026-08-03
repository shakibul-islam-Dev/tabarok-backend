# Backend Architecture Guide

Complete reference for the tobarok e-commerce backend. Read this to understand how everything fits together before changing code.

---

## Table of Contents

1. [Tech Stack](#1-tech-stack)
2. [Directory Map](#2-directory-map)
3. [Request Lifecycle](#3-request-lifecycle)
4. [Environment Variables](#4-environment-variables)
5. [Database & Models](#5-database--models)
6. [Authentication & Authorization](#6-authentication--authorization)
7. [Feature Modules (API Reference)](#7-feature-modules-api-reference)
8. [Points Economy](#8-points-economy)
9. [Stripe Payments](#9-stripe-payments)
10. [File Uploads](#10-file-uploads)
11. [Validation](#11-validation)
12. [Error Handling](#12-error-handling)
13. [MongoDB Transactions](#13-mongodb-transactions)
14. [Recipes — How To Add Things](#14-recipes--how-to-add-things)
15. [Deployment](#15-deployment)
16. [Known Conventions & Gotchas](#16-known-conventions--gotchas)

---

## 1. Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js (ESM, `"type": "module"`) |
| Language | TypeScript (`module: NodeNext`, strict mode) |
| Framework | Express 4 |
| Auth | Better Auth (MongoDB adapter) + admin plugin + RBAC |
| Database | MongoDB Atlas via Mongoose (native driver for Better Auth) |
| Payments | Stripe hosted Checkout + webhook |
| Uploads | Multer (local disk, static serving) |
| Validation | Zod v4 |
| Rate limiting | express-rate-limit |
| Dev runner | tsx watch (`npm run dev`) |
| Deploy target | Vercel serverless (`vercel.json`) |

**Scripts** (`package.json`):

| Command | Purpose |
|---------|---------|
| `npm run dev` | Dev server with hot reload (`tsx watch server.ts`) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled server (`node dist/server.js`) |
| `npm run seed` | Seed products/categories/hero slides/outlets + optional admin |
| `npm run typecheck` | Type-check without emitting |

---

## 2. Directory Map

```
backend/
├── server.ts            # App entry: middleware pipeline, route mounting, error handler
├── seed.ts              # One-off data seeder (products, categories, slides, outlets, admin)
├── config/
│   └── db.ts            # Mongoose connection + DB name resolution (resolveDbName)
├── lib/
│   ├── auth.ts          # Better Auth instance (MongoDB adapter, Google OAuth, admin plugin)
│   ├── rbac.ts          # Better Auth access-control roles (user/admin/superadmin)
│   └── stripe.ts        # Stripe client, checkout session builders, webhook verifier
├── middleware/
│   ├── auth.ts          # protect, optionalSession — session check + local user sync
│   └── admin.ts         # requireAdmin, requireSuperAdmin
├── models/              # Mongoose schemas (business data lives in `users` collection etc.)
├── routes/              # Express routers, one file per API namespace
├── services/
│   ├── pointsService.ts          # All point credits/debits (atomic)
│   ├── fraudDetectionService.ts  # Rule-based risk scoring for point earning
│   ├── reconciliationService.ts  # Balance-vs-ledger audit & correction
│   └── redeemCodeService.ts      # Redeem code CRUD + atomic redemption
├── utils/
│   ├── ApiError.ts      # Error class with HTTP status
│   ├── asyncHandler.ts  # Wraps async route handlers -> forwards to error middleware
│   ├── env.ts           # envNumber / envString / envBoolean with fallbacks
│   ├── points.ts        # Thin points helpers (getPointsBalance, getPointsStats, awardPoints)
│   ├── upload.ts        # Multer storage/filter/limits + fileUrl builder
│   └── validation.ts    # All Zod schemas + validateBody/Params/Query
├── types/
│   └── express.d.ts     # Global Express.Request augmentation (req.user, req.session)
├── uploads/             # Uploaded files, served statically at /uploads/*
└── vercel.json          # Vercel serverless routing
```

**Import convention**: ESM with `.js` extensions in relative imports (`./config/db.js`), because TypeScript NodeNext maps them to the compiled output. Always include the `.js` suffix when importing local files.

---

## 3. Request Lifecycle

`server.ts` builds the pipeline in this exact order — order matters:

```
1. connectDB()                     # Mongoose connects to MongoDB (db name resolved, default "Tobarok")
2. cors()                          # Whitelist = BETTER_AUTH_URL (comma-separated origins), credentials on
3. generalLimiter                  # 200 req / 15 min per IP
4. /api/auth/* limiter             # 20 req / 15 min (brute-force protection)
5. app.all("/api/auth/*", toNodeHandler(auth))
                                   # Better Auth owns everything under /api/auth — BEFORE express.json
6. express.static("/uploads")      # Serve uploaded files
7. POST /api/payments/webhook      # Stripe webhook with express.raw — BEFORE express.json
                                   # (signature verification needs exact raw bytes)
8. express.json()                  # JSON body parsing for everything else
9. GET /                           # Health check
10. Business routers               # /api/account, /api/admin, /api/products, ... (see §7)
11. 404 handler                    # throw ApiError(404)
12. Central error handler          # ZodError -> 400 w/ field errors; ApiError -> its status; else 500
13. app.listen(PORT)               # Only when NOT on Vercel (Vercel uses the exported app)
```

**Why the ordering matters:**

- Better Auth and the Stripe webhook both read the raw body. If `express.json()` ran first, Better Auth would break and webhook signature verification would fail. They are mounted *before* it.
- The 404 and error handlers must be *last*.

---

## 4. Environment Variables

**Naming convention is unusual — read carefully:**

| Variable | Actually used as |
|----------|-----------------|
| `BETTER_AUTH_URL` | **Frontend origin(s)** (comma-separated). Used for CORS whitelist, Better Auth `trustedOrigins`, and Stripe redirect base. |
| `NEXT_PUBLIC_URL` | **Backend base URL**. Used as Better Auth `baseURL` and to build absolute upload URLs. |
| `PORT` | HTTP port (default 5000). |
| `MONGO_DB_URI` | Mongo connection string. If it has no db name in the path, `resolveDbName()` falls back to `Tobarok`. Both Mongoose and Better Auth use the same resolved db. |
| `BETTER_AUTH_SECRET` | Session signing secret (Better Auth reads it automatically; must be ≥32 chars). |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google social login. |
| `SUPER_ADMIN_USER_IDS` | Optional. Comma-separated Better Auth user IDs that are always treated as admins by the admin plugin. Not in `.env` currently — optional. |
| `NODE_ENV` | When `production`, stack traces are hidden in error responses. |
| `VERCEL` | Set automatically on Vercel; skips `app.listen()`. |

**Points economy** (all have code fallbacks via `envNumber`):

`POINTS_PER_AD` (10), `MAX_ADS_PER_HOUR` (5), `POINTS_PER_SHARE` (15), `POINTS_REFERRER` (50), `POINTS_REFERRED` (25), `POINT_PURCHASE_RATE` (1), `POINT_REDEMPTION_RATE` (1), `CASHBACK_RATE` (0.05, not in `.env`, used only by fraud checks).

**Stripe**:

`STRIPE_SECRET_KEY` (secret key), `STRIPE_WEBHOOK_SECRET` (from webhook config), `STRIPE_CURRENCY` (default `usd` — Stripe has no BDT support).

**Uploads**:

`UPLOAD_DIR` (default `uploads`), `MAX_UPLOAD_SIZE_MB` (default 10).

**Defined but currently unused in code** (kept for future / by convention): `JWT_SECRET`, `JWT_EXPIRES_IN`, `SHARE_COOLDOWN_HOURS`.

**Seeding**: `SEED_ADMIN_PASSWORD` — if set, `npm run seed` creates `admin@tobarok.com` with role `superadmin`.

**Helper**: read env vars through `utils/env.ts` (`envNumber`, `envString`, `envBoolean`) instead of raw `process.env` so you get fallbacks and parsing for free.

---

## 5. Database & Models

**Connection**: `config/db.ts`
- `resolveDbName(uri)` extracts the db name from the URI path; falls back to `"Tobarok"`.
- Mongoose connects with `{ dbName }`; Better Auth uses `client.db(resolveDbName(uri))`.
- **Both must always use the same db.** Never hardcode a different db name anywhere.

**Two "user" stores exist** (important):

| Store | Owner | Contents |
|-------|-------|----------|
| `user` collection | Better Auth | Auth accounts: email, password hash (Better Auth's own), sessions links |
| `users` collection (Mongoose `User` model) | App business logic | Profile + points, role, referral code, addresses, risk level |

`middleware/auth.ts` keeps them in sync by email on every authenticated request (see §6).

### Model summary

| Model / Collection | Key fields | Notes |
|---|---|---|
| `User` (`users`) | email*, password (bcrypt, unused by auth), role (`user`/`admin`/`superadmin`), points, totalEarned, totalRedeemed, riskLevel, referralCode*, referredBy, addresses[] | Pre-save hooks: hash password, generate referral code |
| `Product` | title, slug*, sku, image, images[], price, category, collections[], sizes[], colors[], stockQuantity, inStock, isActive, pointsReward, rating, reviewCount | Text index for search |
| `Category` | title, slug*, type (`collection`/`signature`/`budget`/`accessory`/`menu-group`), parent, order | Slug-unique, hierarchical |
| `Cart` | user* or guestSessionId*, items[] (product, qty, size, color, priceSnapshot, titleSnapshot) | Snapshots protect against later product edits |
| `Wishlist` | user* (unique), items[] (product, addedAt) | |
| `Order` | orderNumber*, user, items[], contact, deliveryAddress, billingAddress, paymentMethod, paymentStatus, paymentId, paidAt, subtotal, deliveryFee, pointsUsed, pointsDiscount, total, status, trackingSteps[] | Status flow: pending → confirmed → processing → shipped → out_for_delivery → delivered (or cancelled/returned) |
| `PointTransaction` | user, type, amount, finalAmount, referenceType/referenceId, riskScore, riskDecision, status | The points ledger — source of truth |
| `Redemption` | user, productId?/orderId?, pointsUsed, status | Fulfillment record for point spending |
| `RedeemCode` | code*, type (`points`/`discount`/`product`/`cash`), value, maxUses, usedCount, usedBy[], startsAt/expiresAt, isActive | `getStatus()` computed |
| `Review` | product, user, rating 1-5, comment, isApproved, verifiedPurchase | One review per user per product (sparse unique index) |
| `BillingAddress` | user, fullName, phone, address fields, isDefault | Only one default per user |
| `CustomOrderRequest` | name, phone, productType, quantity, description, designFileUrl, status | Status: new → quoted → accepted → completed/cancelled |
| `ContactSubmission` | name, email, message, status | new → in_progress → resolved |
| `HeroSlide` | eyebrow, title, subtitle, cta, link, image, order, isActive | |
| `Outlet` | name, area, hours, coordinates | |
| `NewsletterSubscriber` | email* (unique), isActive | Upsert on subscribe |

**Better Auth collections** (managed by Better Auth, don't touch directly): `user`, `session`, `account`, `verification`.

---

## 6. Authentication & Authorization

### Flow

```
Client request (Better Auth session cookie)
        │
        ▼
protect middleware (middleware/auth.ts)
  1. auth.api.getSession(headers)          # asks Better Auth who this is
  2. syncLocalUser(session.user)           # find local User by email
     ├── not found → create one (random password; role/banned/image copied)
     └── found → patch changed fields (name, role, banned, emailVerified)
  3. banned? → 403
  4. req.user = local Mongoose User doc    # business logic uses THIS
     req.session = Better Auth session
```

**Key point**: all business logic uses the local Mongoose `User` doc (`req.user._id`), never the Better Auth user id directly. The local doc is the single source for points, role, bans, referral codes.

**Roles**: `user` < `admin` < `superadmin`.
- `requireAdmin` → admin or superadmin.
- `requireSuperAdmin` → superadmin only (currently: user role changes).
- Better Auth also enforces RBAC on its own `/api/auth/admin/*` endpoints via `lib/rbac.ts` (admins can manage users but not roles/deletes; superadmins can do everything).

**Middleware helpers**:
- `protect` — require a valid session (401 otherwise).
- `optionalSession` — attach user if logged in, but never block. Used for public-but-personalizable endpoints.

**Local password field**: the Mongoose `User.password` is legacy (bcrypt). Actual login is delegated to Better Auth. The `seed.ts` admin is created through the Mongoose model — note Better Auth auth requires a record in the `user` collection, so the seeded admin is primarily for API-level role checks.

**Google OAuth**: configured via `GOOGLE_CLIENT_ID`/`SECRET` in `lib/auth.ts`.

---

## 7. Feature Modules (API Reference)

Mount points are set in `server.ts`. Auth column: P = public, U = authenticated user, A = admin, SA = superadmin.

### `/api/account` — routes/auth.ts
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/me` | U | Current user + session (for frontend auth refresh) |

### `/api/admin` — routes/admin.ts (all `protect`)
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/users` | A | List users (role, banned, search, pagination) |
| GET | `/users/:id` | A | Get one user |
| PATCH | `/users/:id/role` | SA | Change role |
| PATCH | `/users/:id/ban` | A | Ban/unban |

### `/api/products` — routes/product.ts
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/` | P | List (category, collection, signature, search, inStock, active, page, limit, sort) |
| GET | `/:id` | P | Get by ObjectId **or slug** |
| POST | `/` | A | Create |
| PUT | `/:id` | A | Update |
| DELETE | `/:id` | A | Delete |

### `/api/categories`, `/api/hero-slides`, `/api/outlets`
Same pattern: public `GET /` (active only; categories also `GET /:slug`), admin `POST/PUT/DELETE`.

### `/api/cart` (all U)
`GET /`, `POST /` (add w/ stock check + merge same product/size/color), `PUT /:itemId` (update qty), `DELETE /:itemId`.

### `/api/wishlist` (all U)
`GET /`, `POST /` (add, deduped), `DELETE /:productId`.

### `/api/billing-addresses` (all U)
Full CRUD scoped to current user; setting `isDefault` clears the flag on others first.

### `/api/orders` (user routes all U; admin routes A)
| Method | Path | Purpose |
|---|---|---|
| GET | `/` | My orders (newest first) |
| GET | `/:id` | My single order |
| POST | `/` | Place order — see flow below |
| GET | `/admin/all` | Admin list (status, paymentStatus, pagination) |
| GET | `/admin/:id` | Admin get |
| PATCH | `/admin/:id` | Update status/paymentStatus/trackingSteps |

**Order creation flow** (routes/order.ts `POST /`):
1. Validate body (`schemas.order`; supports legacy aliases name/phone/address/city/note).
2. Resolve product prices from the DB (never trust client prices), compute subtotal.
3. Delivery fee: free ≥ ৳1500, else ৳90.
4. If `pointsToRedeem`: cap discount at subtotal & balance; compute `pointsUsed`.
5. **One MongoDB transaction**: create order → `validateAndDeductStock` → `redeemPoints`.
6. Clear the user's cart.
7. Order starts `paymentStatus: "pending"`. Pay it later via `/api/payments/checkout/order` (Stripe) or leave as COD.

### `/api/points` — see §8.
### `/api/redeem-codes` (all U)
| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/` | A | Create code (auto-generates `TB-XXXXXXXXXX` if omitted) |
| POST | `/validate` | U | Preview a code without consuming |
| POST | `/redeem` | U | Consume code, get reward |
| GET | `/` | A | List (active, type, pagination) |
| PATCH | `/:code/deactivate` | A | Soft-disable |

### `/api/reviews`
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/` | P | Approved reviews (filter `productId`) |
| POST | `/` | U | Submit (starts unapproved, deduped, `verifiedPurchase` badge if bought) |
| GET | `/admin/all` | A | List all |
| PATCH | `/admin/:id/approve` / `reject` | A | Moderate; recalculates product rating |
| DELETE | `/admin/:id` | A | Delete; recalculates rating |

### `/api/contact`, `/api/custom-orders`, `/api/newsletter`
Public `POST /` (submit). Admin `GET /admin/all` + status updates (`PATCH /admin/:id`) for contact/custom orders.

### `/api/uploads` (all U) — see §10.
### `/api/payments` — see §9.

---

## 8. Points Economy

**Source of truth is the ledger**, not `user.points`. Every change is a `PointTransaction` row; `user.points` is a cached running balance. `ReconciliationService` verifies/repairs drift.

### Earning (PointsService.earnPoints)

```
Input: userId, type, amount, description, referenceType/referenceId, metadata
  1. Load user (404 if missing, 403 if banned)
  2. FraudDetectionService.analyze()  →  riskScore + decision
     (skipped when skipFraudCheck: true — topups, redeem codes, Stripe purchases)
  3. reject (≥80)  → row logged, status=rejected, 0 credited
     review (≥50)  → row logged, status=review, 0 credited (admin can approve later)
     adjust (≥20)  → 50% credited
     approve (<20) → full credit
  4. Inside a Mongo transaction: $inc user.points/totalEarned + insert transaction
```

### Fraud scoring signals (fraudDetectionService.ts)

| Signal | Score |
|--------|-------|
| Ad views > MAX_ADS_PER_HOUR/hr | +60 |
| Two ads <30s apart | +40 |
| Duplicate ad id | +80 |
| >10 shares in 24h | +40 |
| >10 referrals in 24h | +50 |
| Same IP+device referral | +70 |
| Cashback >2× expected | +50 |
| Account <24h old | +20 |
| riskLevel medium/high | +15/+30 |
| >30% historical rejection rate | +25 |

Thresholds: reject ≥80, review ≥50, adjust ≥20, approve <20.

### Redeeming (PointsService.redeemPoints)

Checks balance, then in one transaction: `$inc points:-N, totalRedeemed:+N` + transaction row + `Redemption` record (`pending_fulfillment` for product rewards, `fulfilled` for order discounts). Used by order checkout (`pointsToRedeem`).

### User endpoints (`/api/points`, all U)

`GET /balance`, `GET /transactions`, `GET /ads`, `POST /ads/:id/watch`, `POST /share`, `GET /referral`, `POST /referral` (credits both sides, deduped), `GET /packages`, `POST /purchase` (manual top-up with external payment reference).

### Admin endpoints

`GET /admin/transactions` (filter), `PATCH /admin/transactions/:id` (approve/reject review rows — approval credits), `GET /admin/reconcile` (find drifted users), `GET|POST /admin/reconcile/:userId` (verify / fix with correction transaction), `GET /admin/audit` (all transactions for a referenceType+referenceId).

### referenceType/referenceId

Every transaction links to its source (`order`, `ad`, `share`, `referral`, `redeem_code`, `purchase`, `manual`…) so you can audit without parsing metadata. Always set these when calling the service.

---

## 9. Stripe Payments

Hosted Checkout: backend creates a session, frontend redirects to `url`, webhook fulfills. **Stripe has no BDT** — `STRIPE_CURRENCY` defaults to `usd`.

### Files
- `lib/stripe.ts` — `getStripe()` (lazy; clear error if key missing), `createOrderCheckoutSession`, `createPointsCheckoutSession`, `constructWebhookEvent` (signature verify), `frontendBaseUrl()` (from `BETTER_AUTH_URL`).
- `routes/payment.ts` — endpoints + webhook handler.

### Endpoints
| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/payments/checkout/order` | U | `{ orderId, successPath?, cancelPath? }` → `{ url, sessionId }`. Order must be user's own and unpaid. Line items mirror products + delivery fee − points discount. |
| POST | `/api/payments/checkout/points` | U | `{ packageId }` or `{ amount }` → `{ url, sessionId }` |
| POST | `/api/payments/webhook` | P (sig-verified) | Stripe events; mounted with raw body before `express.json()` |

### Fulfillment flow (webhook, `checkout.session.completed` + `payment_status === "paid"`)

```
metadata.type === "order"  → Order.findById(metadata.orderId)
                              → set paymentStatus="paid", paymentId (intent/session id),
                                paymentMethod="stripe", paidAt
                              (idempotent: skips if already paid)

metadata.type === "points" → PointsService.earnPoints({ type:"topup", amount: metadata.points,
                              referenceId: session.id }, { skipFraudCheck: true })
                              (idempotent: skips if a transaction with this session id exists)
```

### Frontend (Next.js) integration
1. Create order → `POST /api/orders`.
2. `POST /api/payments/checkout/order { orderId }` → get `url`.
3. Redirect: `window.location.href = url` (or use the URL in a checkout button).
4. Stripe redirects back to `{BETTER_AUTH_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}` (default; override with `successPath`/`cancelPath`).
5. The webhook marks the order paid independently — the success page should poll `GET /api/orders/:id` or `/api/account/me` until `paymentStatus === "paid"` (webhooks are near-instant but async).

**Webhook setup**: Stripe Dashboard → Developers → Webhooks → endpoint `https://<backend>/api/payments/webhook`, event `checkout.session.completed`. Local testing: `stripe listen --forward-to localhost:5000/api/payments/webhook` and put the printed `whsec_...` in `.env`.

---

## 10. File Uploads

- **Storage**: local disk (`UPLOAD_DIR`, default `uploads/`), served at `/uploads/<filename>` via `express.static`.
- **Allowed types**: JPEG, PNG, GIF, WebP, AVIF, SVG, PDF. **Limit**: `MAX_UPLOAD_SIZE_MB` (default 10), max 10 files per multi-upload.
- **Filenames**: sanitized + `Date.now()` + random suffix (collision-proof).
- **URL builder** (`fileUrl`): absolute URL from `NEXT_PUBLIC_URL` (falls back to request origin) — store this string directly in `product.image`, `heroSlide.image`, `customOrder.designFileUrl`, etc.

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/uploads` | One file in multipart field `file` → `{ url, filename, size, mimetype }` |
| POST | `/api/uploads/multiple` | Files in field `files` (≤10) → `{ urls, files }` |

Both require auth (`protect`). Example: `fetch("/api/uploads", { method: "POST", body: formData, credentials: "include" })`.

> **Vercel caveat**: local disk does not persist between serverless invocations. For production, swap the multer disk storage for S3/Cloudinary — only `utils/upload.ts` needs to change.

---

## 11. Validation

All input validation is Zod, centralized in `utils/validation.ts`:

```ts
const data = validateBody(schemas.order, req.body);
// throws ZodError → central handler → 400 { message: "Validation failed", errors: [...] }
```

- `schemas.<name>` — one schema per payload type (order, productCreate, checkoutOrder, checkoutPoints, …).
- Helpers: `validateBody`, `validateParams`, `validateQuery`. `objectId` regex for Mongo IDs.
- **Rule**: never trust client data — especially prices (orders re-resolve them from DB) and IDs (check `Types.ObjectId.isValid`).
- When adding a field to a model, also add it to the matching schema or it will be stripped/rejected.

---

## 12. Error Handling

- Throw `new ApiError(status, message)` anywhere in a handler — it lands in the central error middleware with that HTTP status.
- Wrap every async handler in `asyncHandler(...)` so rejections reach the error middleware (Express 4 doesn't catch async errors by itself).
- `ZodError` → 400 with field-level `errors: [{ path, message }]`.
- Unknown errors → 500; `stack` included only when `NODE_ENV !== "production"`.
- Response shape is consistent: `{ message, stack? }` or `{ message, errors }`.

---

## 13. MongoDB Transactions

Multi-document writes always run inside `session.withTransaction`:

- **Order placement**: order + stock deduction + point redemption commit together or not at all (routes/order.ts).
- **Point mutations**: balance + transaction row together (services/pointsService.ts).
- **Redeem codes**: code usage + reward fulfillment together (services/redeemCodeService.ts).
- **Reconciliation**: balance fix + correction transaction together.

**Pattern**: services accept an optional `session` — pass the caller's session to nest operations in one outer transaction; omit it and the service starts its own. Never run fraud checks inside an outer transaction (deadlock risk) — hence `skipFraudCheck` and the ordering in `earnPoints`.

Requires MongoDB replica set (Atlas already is one) — transactions fail on standalone instances.

---

## 14. Recipes — How To Add Things

### Add a new API module
1. `models/Foo.ts` — interface + schema + indexes + `export default model`.
2. Add a Zod schema in `utils/validation.ts` under `schemas`.
3. `routes/foo.ts` — `const router = Router()`, handlers with `asyncHandler`, `protect`/`requireAdmin` as needed, `export default router`.
4. Mount in `server.ts`: `app.use("/api/foo", fooRouter)` (before the 404 handler).

### Add a protected route
```ts
router.get("/x", protect, asyncHandler(async (req: BetterAuthRequest, res: Response) => {
  const userId = String(req.user!._id); // local user, always present after protect
  ...
}));
```
Admin: add `requireAdmin` after `protect` (or use `router.use(protect, requireAdmin)` for whole files).

### Add a point-earning action
Call `pointsService.earnPoints({ userId, type, amount, description, referenceType, referenceId, metadata: { ip: req.ip, userAgent: req.headers["user-agent"] } })`. Choose an amount from env (`envNumber`) and add the new type to `PointTransaction`'s enums. Check `result.success` and throw `ApiError(400, result.message)` on rejection.

### Add an env variable
Add to `.env`, read with `envNumber`/`envString`/`envBoolean` from `utils/env.ts`, always with a sane fallback so the app never crashes when it's missing.

### Add a payment for something new
1. Build a `createXCheckoutSession` in `lib/stripe.ts` with `metadata: { type: "x", ... }`.
2. Add an endpoint in `routes/payment.ts`.
3. Handle `metadata.type === "x"` in the webhook, idempotently (check for an existing record before fulfilling).

### Change DB name
Edit the fallback in `config/db.ts` (`DB_NAME`) or include a db name in `MONGO_DB_URI`. Mongoose and Better Auth both follow `resolveDbName`.

---

## 15. Deployment

**Vercel** (`vercel.json`):
- `server.ts` is built as a serverless function; all routes proxy to it.
- `export default app` is used by Vercel; `app.listen()` only runs when `VERCEL` is unset (local dev).
- `dist/` is built by `npm run build`.

**Production checklist**:
- Set all env vars in the host dashboard (never commit `.env`).
- Switch `BETTER_AUTH_URL` (frontend) and `NEXT_PUBLIC_URL` (backend) to production URLs (commented examples are in `.env`).
- Use live Stripe keys + configure the production webhook endpoint.
- Local-disk uploads don't persist on serverless — move to S3/Cloudinary.
- Rate limits are in-memory; for multi-instance deployments use a shared store (e.g. Redis-backed limiter).

---

## 16. Known Conventions & Gotchas

- **DB naming**: URI without a db name → Mongoose would default to `test`. That's why `resolveDbName` exists — both Mongoose and Better Auth must use the same db. Don't bypass it.
- **Env naming is inverted from intuition**: `BETTER_AUTH_URL` = frontend, `NEXT_PUBLIC_URL` = backend. Keep this convention everywhere for consistency.
- **`req.user` is the local Mongoose User** (business data), not the Better Auth user. Email is the join key; it's synced on every request.
- **Better Auth routes bypass `express.json()`** — the handler must stay mounted before it.
- **Stripe webhook bypasses `express.json()`** — uses `express.raw`; must stay mounted before it too.
- **Snapshots**: carts/orders store title/price snapshots; products can change later without corrupting history.
- **Client prices are never trusted**: order totals are recomputed server-side.
- **Unused env vars**: `JWT_SECRET`, `JWT_EXPIRES_IN`, `SHARE_COOLDOWN_HOURS` are defined in `.env` but not referenced by code (reserved for future use).
- **Seeded admin caveat**: `seed.ts` creates the admin via the Mongoose model (business users collection). To also log in through Better Auth, register `admin@tobarok.com` via `/api/auth/sign-up/email` or promote it with `SUPER_ADMIN_USER_IDS`.
- **Review ratings** are only recomputed when reviews are approved/rejected/deleted through the admin endpoints.
- **TypeScript strict + NodeNext**: relative imports need the `.js` extension; run `npm run typecheck` before committing.
```
