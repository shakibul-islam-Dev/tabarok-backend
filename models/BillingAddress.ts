import { Schema, model, HydratedDocument, Types } from "mongoose";

export interface IBillingAddress {
  user: Types.ObjectId;
  label?: string;
  fullName: string;
  phone: string;
  email?: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state?: string;
  zip?: string;
  country: string;
  isDefault: boolean;
}

export type BillingAddressDoc = HydratedDocument<IBillingAddress>;

const billingAddressSchema = new Schema<IBillingAddress>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    label: { type: String },
    fullName: { type: String, required: true },
    phone: { type: String, required: true },
    email: { type: String },
    addressLine1: { type: String, required: true },
    addressLine2: { type: String },
    city: { type: String, required: true },
    state: { type: String },
    zip: { type: String },
    country: { type: String, default: "Bangladesh" },
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true }
);

billingAddressSchema.index({ user: 1, isDefault: 1 });

const BillingAddress = model<IBillingAddress>("BillingAddress", billingAddressSchema);

export default BillingAddress;
