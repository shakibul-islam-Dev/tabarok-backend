import { Schema, model, HydratedDocument, Types } from "mongoose";

export interface IWishlistItem {
  product: Types.ObjectId;
  addedAt: Date;
}

export interface IWishlist {
  user: Types.ObjectId;
  items: IWishlistItem[];
}

export type WishlistDoc = HydratedDocument<IWishlist>;

const wishlistItemSchema = new Schema<IWishlistItem>(
  {
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    addedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const wishlistSchema = new Schema<IWishlist>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    items: { type: [wishlistItemSchema], default: [] },
  },
  { timestamps: true }
);

const Wishlist = model<IWishlist>("Wishlist", wishlistSchema);

export default Wishlist;
