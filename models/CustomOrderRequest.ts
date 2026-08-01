import { Schema, model, HydratedDocument, Types } from "mongoose";

export type CustomOrderStatus = "new" | "quoted" | "accepted" | "completed" | "cancelled";

export interface ICustomOrderRequest {
  user?: Types.ObjectId;
  name: string;
  phone: string;
  email?: string;
  productType: string;
  quantity: number;
  description: string;
  designFileUrl?: string;
  status: CustomOrderStatus;
}

export type CustomOrderRequestDoc = HydratedDocument<ICustomOrderRequest>;

const customOrderRequestSchema = new Schema<ICustomOrderRequest>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User" },
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true },
    email: { type: String, lowercase: true, trim: true },
    productType: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    description: { type: String, required: true },
    designFileUrl: { type: String },
    status: {
      type: String,
      enum: ["new", "quoted", "accepted", "completed", "cancelled"],
      default: "new",
    },
  },
  { timestamps: true }
);

const CustomOrderRequest = model<ICustomOrderRequest>(
  "CustomOrderRequest",
  customOrderRequestSchema
);

export default CustomOrderRequest;
