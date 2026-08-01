import { Schema, model, HydratedDocument, Types } from "mongoose";

export type PointTransactionType =
  | "ad_view"
  | "share_facebook"
  | "share_whatsapp"
  | "share_twitter"
  | "referral"
  | "purchase"
  | "redeem"
  | "topup"
  | "cashback"
  | "refund"
  | "order_payment"
  | "correction";

export type PointTransactionStatus =
  | "pending"
  | "completed"
  | "rejected"
  | "review"
  | "reversed";

export type RiskDecision = "approve" | "review" | "reject" | "adjust";

/**
 * Broad category that links a point transaction to its source system.
 * This makes reconciliation and audit trails possible without parsing metadata.
 */
export type PointTransactionReferenceType =
  | "ad"
  | "share"
  | "referral"
  | "redeem_code"
  | "order"
  | "product_redemption"
  | "purchase"
  | "cashback"
  | "refund"
  | "manual"
  | "other";

export interface IPointTransaction {
  user: Types.ObjectId;
  type: PointTransactionType;
  amount: number;
  finalAmount: number;
  description: string;
  /**
   * Dynamic link to the source that generated this transaction.
   * `referenceType` tells you which system to look at; `referenceId` is the
   * external document ID (ad ID, order ID, redeem code, etc.).
   */
  referenceType?: PointTransactionReferenceType;
  referenceId?: string;
  metadata?: Record<string, unknown>;
  riskScore: number;
  riskDecision: RiskDecision;
  status: PointTransactionStatus;
}

export type PointTransactionDoc = HydratedDocument<IPointTransaction>;

const pointTransactionSchema = new Schema<IPointTransaction>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    type: {
      type: String,
      required: true,
      enum: [
        "ad_view",
        "share_facebook",
        "share_whatsapp",
        "share_twitter",
        "referral",
        "purchase",
        "redeem",
        "topup",
        "cashback",
        "refund",
        "order_payment",
        "correction",
      ],
      index: true,
    },
    amount: { type: Number, required: true },
    finalAmount: { type: Number, required: true },
    description: { type: String, required: true },
    referenceType: {
      type: String,
      enum: [
        "ad",
        "share",
        "referral",
        "redeem_code",
        "order",
        "product_redemption",
        "purchase",
        "cashback",
        "refund",
        "manual",
        "other",
      ],
      index: true,
    },
    referenceId: { type: String, index: true },
    metadata: { type: Schema.Types.Mixed, default: {} },
    riskScore: { type: Number, default: 0, min: 0, max: 100 },
    riskDecision: {
      type: String,
      enum: ["approve", "review", "reject", "adjust"],
      default: "approve",
    },
    status: {
      type: String,
      enum: ["pending", "completed", "rejected", "review", "reversed"],
      default: "completed",
    },
  },
  { timestamps: true }
);

pointTransactionSchema.index({ user: 1, type: 1, createdAt: -1 });
pointTransactionSchema.index({ user: 1, status: 1, createdAt: -1 });
pointTransactionSchema.index({ user: 1, referenceType: 1, referenceId: 1 });
pointTransactionSchema.index({ referenceType: 1, referenceId: 1 });
pointTransactionSchema.index({ riskScore: 1 });

const PointTransaction = model<IPointTransaction>(
  "PointTransaction",
  pointTransactionSchema
);

export default PointTransaction;
