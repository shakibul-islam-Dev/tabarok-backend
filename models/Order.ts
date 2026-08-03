import { Schema, model, HydratedDocument, Types } from "mongoose";

export type OrderStatus =
  | "pending"
  | "confirmed"
  | "processing"
  | "shipped"
  | "out_for_delivery"
  | "delivered"
  | "cancelled"
  | "returned";

export type PaymentStatus = "pending" | "paid" | "failed" | "refunded";

export interface IOrderItem {
  product: Types.ObjectId;
  title: string;
  price: number;
  size?: string;
  color?: string;
  qty: number;
}

export interface IOrderContact {
  fullName: string;
  phone: string;
  email?: string;
}

export interface IOrderAddress {
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state?: string;
  zip?: string;
  country: string;
}

export interface IOrder {
  orderNumber: string;
  user?: Types.ObjectId;
  items: IOrderItem[];
  contact: IOrderContact;
  deliveryAddress: IOrderAddress;
  billingAddress?: IOrderAddress;
  paymentMethod: string;
  paymentStatus: PaymentStatus;
  paymentId?: string;
  paidAt?: Date;
  subtotal: number;
  deliveryFee: number;
  discount: number;
  pointsUsed: number;
  pointsDiscount: number;
  total: number;
  status: OrderStatus;
  notes?: string;
  trackingSteps?: { label: string; done: boolean; timestamp?: Date }[];
}

export type OrderDoc = HydratedDocument<IOrder>;

const orderItemSchema = new Schema<IOrderItem>(
  {
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    title: { type: String, required: true },
    price: { type: Number, required: true, min: 0 },
    size: { type: String },
    color: { type: String },
    qty: { type: Number, required: true, min: 1 },
  },
  { _id: true }
);

const contactSchema = new Schema<IOrderContact>(
  {
    fullName: { type: String, required: true },
    phone: { type: String, required: true },
    email: { type: String },
  },
  { _id: false }
);

const addressSchema = new Schema<IOrderAddress>(
  {
    addressLine1: { type: String, required: true },
    addressLine2: { type: String },
    city: { type: String, required: true },
    state: { type: String },
    zip: { type: String },
    country: { type: String, default: "Bangladesh" },
  },
  { _id: false }
);

const trackingStepSchema = new Schema(
  {
    label: { type: String, required: true },
    done: { type: Boolean, default: false },
    timestamp: { type: Date },
  },
  { _id: false }
);

function generateOrderNumber(): string {
  const prefix = "TB";
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substring(2, 5).toUpperCase();
  return `${prefix}-${ts}-${rand}`;
}

const orderSchema = new Schema<IOrder>(
  {
    orderNumber: { type: String, unique: true, default: generateOrderNumber },
    user: { type: Schema.Types.ObjectId, ref: "User" },
    items: { type: [orderItemSchema], required: true },
    contact: { type: contactSchema, required: true },
    deliveryAddress: { type: addressSchema, required: true },
    billingAddress: { type: addressSchema },
    paymentMethod: { type: String, required: true },
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed", "refunded"],
      default: "pending",
    },
    paymentId: { type: String },
    paidAt: { type: Date },
    subtotal: { type: Number, required: true, min: 0 },
    deliveryFee: { type: Number, default: 0, min: 0 },
    discount: { type: Number, default: 0, min: 0 },
    pointsUsed: { type: Number, default: 0, min: 0 },
    pointsDiscount: { type: Number, default: 0, min: 0 },
    total: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: [
        "pending",
        "confirmed",
        "processing",
        "shipped",
        "out_for_delivery",
        "delivered",
        "cancelled",
        "returned",
      ],
      default: "pending",
    },
    notes: { type: String },
    trackingSteps: { type: [trackingStepSchema], default: [] },
  },
  { timestamps: true }
);

orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ status: 1 });

const Order = model<IOrder>("Order", orderSchema);

export default Order;
