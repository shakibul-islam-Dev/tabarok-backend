import { Schema, model, HydratedDocument, Types } from "mongoose";

export interface IReview {
  product: Types.ObjectId;
  user?: Types.ObjectId;
  name: string;
  rating: number;
  comment: string;
  isApproved: boolean;
  verifiedPurchase?: boolean;
}

export type ReviewDoc = HydratedDocument<IReview>;

const reviewSchema = new Schema<IReview>(
  {
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    user: { type: Schema.Types.ObjectId, ref: "User" },
    name: { type: String, required: true, trim: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, required: true },
    isApproved: { type: Boolean, default: false },
    verifiedPurchase: { type: Boolean, default: false },
  },
  { timestamps: true }
);

reviewSchema.index({ product: 1, isApproved: 1, createdAt: -1 });
reviewSchema.index({ product: 1, user: 1 }, { unique: true, sparse: true });

const Review = model<IReview>("Review", reviewSchema);

export default Review;
