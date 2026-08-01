import { Schema, model, HydratedDocument, Model, Types } from "mongoose";

export type RedeemCodeType = "points" | "discount" | "product" | "cash";

export type RedeemCodeStatus = "active" | "inactive" | "expired" | "depleted";

export interface IRedeemCode {
  code: string;
  type: RedeemCodeType;
  value: number;
  currency?: string;
  productId?: Types.ObjectId;
  title?: string;
  description?: string;
  maxUses: number;
  usedCount: number;
  usedBy: Types.ObjectId[];
  startsAt?: Date;
  expiresAt?: Date;
  isActive: boolean;
  metadata?: Record<string, unknown>;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IRedeemCodeMethods {
  getStatus(now?: Date): RedeemCodeStatus;
}

export type RedeemCodeDoc = HydratedDocument<IRedeemCode, IRedeemCodeMethods>;

const redeemCodeSchema = new Schema<IRedeemCode, unknown, IRedeemCodeMethods>(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    type: {
      type: String,
      required: true,
      enum: ["points", "discount", "product", "cash"],
      index: true,
    },
    value: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "BDT" },
    productId: { type: Schema.Types.ObjectId, ref: "Product" },
    title: { type: String, trim: true },
    description: { type: String, trim: true },
    maxUses: { type: Number, default: 1, min: 0 },
    usedCount: { type: Number, default: 0, min: 0 },
    usedBy: [{ type: Schema.Types.ObjectId, ref: "User" }],
    startsAt: { type: Date },
    expiresAt: { type: Date },
    isActive: { type: Boolean, default: true },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

redeemCodeSchema.index({ isActive: 1, type: 1 });
redeemCodeSchema.index({ expiresAt: 1 });

redeemCodeSchema.methods.getStatus = function (now = new Date()): RedeemCodeStatus {
  if (!this.isActive) return "inactive";
  if (this.expiresAt && this.expiresAt < now) return "expired";
  if (this.maxUses > 0 && this.usedCount >= this.maxUses) return "depleted";
  if (this.startsAt && this.startsAt > now) return "inactive";
  return "active";
};

type RedeemCodeModel = Model<IRedeemCode, {}, IRedeemCodeMethods>;

const RedeemCode = model<IRedeemCode, RedeemCodeModel>(
  "RedeemCode",
  redeemCodeSchema
);

export default RedeemCode;
