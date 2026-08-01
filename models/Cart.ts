import { Schema, model, HydratedDocument, Types } from "mongoose";

export interface ICartItem {
  _id?: Types.ObjectId;
  product: Types.ObjectId;
  titleSnapshot: string;
  imageSnapshot?: string;
  qty: number;
  size?: string;
  color?: string;
  priceSnapshot: number;
}

export interface ICart {
  user?: Types.ObjectId;
  guestSessionId?: string;
  items: ICartItem[];
}

export type CartDoc = HydratedDocument<ICart>;

const cartItemSchema = new Schema<ICartItem>(
  {
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    titleSnapshot: { type: String, required: true },
    imageSnapshot: { type: String },
    qty: { type: Number, required: true, min: 1 },
    size: { type: String },
    color: { type: String },
    priceSnapshot: { type: Number, required: true, min: 0 },
  },
  { _id: true }
);

const cartSchema = new Schema<ICart>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", sparse: true, unique: true },
    guestSessionId: { type: String, sparse: true, unique: true },
    items: { type: [cartItemSchema], default: [] },
  },
  { timestamps: true }
);

const Cart = model<ICart>("Cart", cartSchema);

export default Cart;
