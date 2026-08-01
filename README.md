# Point-Based Reward System

This backend module powers the points economy for the e-commerce platform. Users earn points for watching ads, sharing the site, and completing purchases, then redeem points for discounts or products. All point operations are protected by an AI fraud and anomaly detection layer.

---

## Table of Contents

1. [Architecture Flow](#architecture-flow)
2. [How Points Work](#how-points-work)
   - [Increase (Earn)](#increase-earn)
   - [Decrease (Redeem)](#decrease-redeem)
3. [AI Anti-Fraud Layer](#ai-anti-fraud-layer)
4. [Database Schema](#database-schema)
5. [API Endpoints](#api-endpoints)
6. [Environment Variables](#environment-variables)

---

## Architecture Flow

```
User Action
    │
    ▼
Points API Route
    │
    ▼
Validation & Deduplication
    │
    ▼
FraudDetectionService (AI Risk Scoring)
    │
    ├─ APPROVE  → full points
    ├─ ADJUST   → reduced points
    ├─ REVIEW   → logged, pending review
    └─ REJECT   → no points
    │
    ▼
PointsService (Atomic MongoDB Transaction)
    │
    ├─ Update user balance
    └─ Insert transaction log
    │
    ▼
Response with riskScore, riskDecision, finalAmount
```

### Key Files

| File | Purpose |
|------|---------|
| `services/fraudDetectionService.ts` | AI risk scoring engine |
| `services/pointsService.ts` | Atomic credit / debit operations |
| `routes/points.ts` | Earn points, view balance, transactions |
| `routes/order.ts` | Redeem points during checkout |
| `models/PointTransaction.ts` | Transaction log schema |
| `models/Redemption.ts` | Point redemption records |
| `models/User.ts` | User balance and risk fields |

---

## How Points Work

### Increase (Earn)

Credits are applied through `PointsService.earnPoints()` inside a MongoDB transaction.

```typescript
await pointsService.earnPoints({
  userId,
  type: "ad_view",        // or "share_facebook", "referral", "purchase", "cashback"
  amount: 10,
  description: "Watched ad",
  metadata: { adId, ip, userAgent },
});
```

Behavior:

- Runs fraud detection.
- Rejected transactions are logged but never touch the balance.
- Approved/adjusted transactions update `user.points` and `user.totalEarned`.

### Decrease (Redeem)

Deductions are applied through `PointsService.redeemPoints()` inside a MongoDB transaction.

```typescript
await pointsService.redeemPoints({
  userId,
  productId,
  pointsRequired: 500,
  productValue: 25.00,
});
```

Behavior:

- Validates balance before deducting.
- Deducts `user.points` and increments `user.totalRedeemed`.
- Creates a `PointTransaction` record and a `Redemption` record.

### Increase / Decrease Logic

All balance updates use MongoDB `$inc` inside a `withTransaction` block.

```javascript
// Credit
User.findByIdAndUpdate(userId, {
  $inc: { points: finalAmount, totalEarned: finalAmount }
})

// Debit
User.findByIdAndUpdate(userId, {
  $inc: { points: -pointsRequired, totalRedeemed: pointsRequired }
})
```

---

## AI Anti-Fraud Layer

The `FraudDetectionService` assigns a risk score (`0-100`) to every point transaction.

### Risk Signals

| Signal | Weight | Trigger |
|--------|--------|---------|
| Ad velocity | `+60` | More than `MAX_ADS_PER_HOUR` ads per hour |
| Ad speed | `+40` | Two ads within 30 seconds |
| Duplicate ad | `+80` | Same ad already credited |
| Share spam | `+40` | More than 10 shares in 24 hours |
| Referral spam | `+50` | More than 10 referrals in 24 hours |
| Duplicate referral | `+70` | Same IP/device fingerprint used |
| Cashback anomaly | `+50` | Cashback amount much higher than expected |
| New account | `+20` | Account created within 24 hours |
| High-risk user | `+30` | User flagged as `high` risk |
| Rejection history | `+25` | >30% historical rejection rate |

### Decision Matrix

| Risk Score | Decision | Effect |
|------------|----------|--------|
| 0–19 | `approve` | Full points credited |
| 20–49 | `adjust` | Points reduced by 50% |
| 50–79 | `review` | Logged, queued for manual review |
| 80–100 | `reject` | No points credited |

### Smart Recommendations

- Auto-ban or suspend users with consistent high-risk scores.
- Reduce ad/share rewards for medium-risk users.
- Require email verification for new accounts before large point accrual.
- Review flagged transactions in an admin dashboard.

---

## Database Schema

### `users`

```json
{
  "_id": "ObjectId",
  "email": "user@example.com",
  "points": 1250,
  "totalEarned": 5000,
  "totalRedeemed": 3750,
  "riskLevel": "low",
  "referralCode": "ABC123",
  "referredBy": "ObjectId",
  "createdAt": "ISODate"
}
```

### `pointtransactions`

```json
{
  "_id": "ObjectId",
  "user": "ObjectId",
  "type": "ad_view",
  "amount": 10,
  "finalAmount": 5,
  "riskScore": 35,
  "riskDecision": "adjust",
  "status": "completed",
  "description": "Watched ad: Summer Sale Promo",
  "metadata": {
    "adId": "ad1",
    "ip": "203.0.113.1",
    "userAgent": "Mozilla/5.0 ..."
  },
  "createdAt": "ISODate"
}
```

### `redemptions`

```json
{
  "_id": "ObjectId",
  "user": "ObjectId",
  "productId": "ObjectId",
  "orderId": "ObjectId",
  "pointsUsed": 500,
  "productValue": 25.00,
  "status": "pending_fulfillment",
  "createdAt": "ISODate"
}
```

### `redeemcodes`

```json
{
  "_id": "ObjectId",
  "code": "TB-ABCD1234EF",
  "type": "points",
  "value": 100,
  "currency": "BDT",
  "maxUses": 100,
  "usedCount": 12,
  "usedBy": ["ObjectId"],
  "startsAt": "ISODate",
  "expiresAt": "ISODate",
  "isActive": true,
  "createdAt": "ISODate"
}
```

---

## API Endpoints

### Get Balance

```http
GET /api/points/balance
```

Response:

```json
{
  "points": 1250,
  "totalEarned": 5000,
  "totalRedeemed": 3750,
  "riskLevel": "low"
}
```

### Get Transactions

```http
GET /api/points/transactions
```

### Earn Ad View

```http
POST /api/points/ads/:id/watch
```

Response:

```json
{
  "message": "Ad reward processed: 10 points credited",
  "pointsEarned": 10,
  "riskScore": 0,
  "riskDecision": "approve",
  "balance": 1260
}
```

### Share

```http
POST /api/points/share
Content-Type: application/json

{
  "platform": "facebook",
  "url": "https://example.com/product/123"
}
```

### Apply Referral

```http
POST /api/points/referral
Content-Type: application/json

{
  "referralCode": "ABC123"
}
```

### Purchase Points

```http
POST /api/points/purchase
Content-Type: application/json

{
  "packageId": "pkg-small",
  "paymentMethod": "bkash",
  "transactionId": "TXN123456"
}
```

### Redeem Points (Checkout)

Handled automatically when placing an order:

```http
POST /api/orders
Content-Type: application/json

{
  "items": [...],
  "pointsToRedeem": 500,
  "paymentMethod": "cod"
}
```

### Redeem Code — Validate

```http
POST /api/redeem-codes/validate
Content-Type: application/json

{
  "code": "TB-ABCD1234EF"
}
```

### Redeem Code — Redeem

```http
POST /api/redeem-codes/redeem
Content-Type: application/json

{
  "code": "TB-ABCD1234EF"
}
```

Response for points code:

```json
{
  "success": true,
  "code": "TB-ABCD1234EF",
  "type": "points",
  "value": 100,
  "message": "100 points credited",
  "transaction": { "finalAmount": 100 }
}
```

### Redeem Code — Admin Create

```http
POST /api/redeem-codes
Content-Type: application/json

{
  "type": "points",
  "value": 100,
  "maxUses": 100,
  "expiresAt": "2026-12-31T23:59:59Z"
}
```

### Redeem Code — Admin List

```http
GET /api/redeem-codes?page=1&limit=20
```

### Redeem Code — Admin Deactivate

```http
PATCH /api/redeem-codes/TB-ABCD1234EF/deactivate
```

---

## Environment Variables

```env
# Points Economy
POINTS_PER_AD=10
MAX_ADS_PER_HOUR=5
POINTS_PER_SHARE=15
SHARE_COOLDOWN_HOURS=24
POINTS_REFERRER=50
POINTS_REFERRED=25
POINT_PURCHASE_RATE=1
POINT_REDEMPTION_RATE=1

# AI Fraud (thresholds)
FRAUD_MAX_ADS_PER_HOUR=5
FRAUD_ADJUST_THRESHOLD=20
FRAUD_REVIEW_THRESHOLD=50
FRAUD_REJECT_THRESHOLD=80
```

---

## Notes

- All point mutations are atomic MongoDB transactions.
- Suspicious transactions are logged with full metadata for review.
- Ad callbacks should be verified cryptographically in production.
- Cashback orders should be reversed on refund using a reversal transaction.

---

## Dynamic Transaction Linking & Reconciliation

Every point mutation is linked to its source using `referenceType` and `referenceId` on the `PointTransaction` model.

| referenceType | Example referenceId | Source |
|---------------|---------------------|--------|
| `ad` | `ad1` | Ad view reward |
| `share` | `facebook:https://...` | Social share reward |
| `referral` | `ABC123:userId` | Referral code usage |
| `purchase` | payment transaction ID | Points top-up |
| `redeem_code` | `TB-XXXXXXX` | Redeem code reward |
| `order` | order ID | Order-level point discount |
| `product_redemption` | product ID | Product reward redemption |
| `manual` | — | Admin correction |

### Reconciliation Endpoints

These admin endpoints keep the points economy accurate by comparing the live `user.points` balance against the sum of completed `PointTransaction` records.

```http
GET  /api/points/admin/reconcile              # list all discrepancies
GET  /api/points/admin/reconcile/:userId      # verify one user (read-only)
POST /api/points/admin/reconcile/:userId      # fix discrepancy with a correction transaction
GET  /api/points/admin/audit?referenceType=order&referenceId=...&userId=...
```

### Why this prevents errors

1. **Ledger as source of truth**: the live balance is derived from transactions, not the other way around.
2. **Atomic order flow**: order creation, stock deduction, and point redemption now happen in a single MongoDB transaction.
3. **Audit trail**: `referenceType/referenceId` plus `Redemption` records let you trace every point change back to its origin.
4. **Self-healing**: if a bug or manual edit causes a mismatch, the reconciliation endpoint detects it and writes a correction transaction.
