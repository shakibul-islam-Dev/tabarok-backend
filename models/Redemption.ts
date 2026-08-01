import { Schema, model, HydratedDocument, Types } from "mongoose";

export type RedemptionStatus =
  | "pending_fulfillment"
  | "fulfilled"
  | "cancelled"
  | "refunded";

export interface IRedemption {
  user: Types.ObjectId;
  productId?: Types.ObjectId;
  orderId?: Types.ObjectId;
  pointsUsed: number;
  productValue?: number;
  status: RedemptionStatus;
  fulfilledAt?: Date;
  notes?: string;
}

export type RedemptionDoc = HydratedDocument<IRedemption>;

const redemptionSchema = new Schema<IRedemption>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    productId: { type: Schema.Types.ObjectId, ref: "Product" },
    orderId: { type: Schema.Types.ObjectId, ref: "Order" },
    pointsUsed: { type: Number, required: true, min: 0 },
    productValue: { type: Number, min: 0 },
    status: {
      type: String,
      enum: ["pending_fulfillment", "fulfilled", "cancelled", "refunded"],
      default: "pending_fulfillment",
    },
    fulfilledAt: { type: Date },
    notes: { type: String },
  },
  { timestamps: true }
);

redemptionSchema.index({ user: 1, createdAt: -1 });
redemptionSchema.index({ status: 1 });

const Redemption = model<IRedemption>("Redemption", redemptionSchema);

export default Redemption;
