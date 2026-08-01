import { Schema, model, HydratedDocument, Types } from "mongoose";

export interface IProductColor {
  name: string;
  hex?: string;
}

export interface IProduct {
  title: string;
  slug: string;
  sku?: string;
  description?: string;
  shortDescription?: string;
  image: string;
  images?: string[];
  price: number;
  originalPrice?: number;
  costPrice?: number;
  badge?: string;
  category: string;
  categoryRef?: Types.ObjectId;
  collections?: string[];
  signatureSeries?: string[];
  tags?: string[];
  sizes?: string[];
  colors?: IProductColor[];
  stockQuantity: number;
  inStock: boolean;
  isActive?: boolean;
  weight?: number;
  pointsReward?: number;
  rating?: number;
  reviewCount?: number;
}

export type ProductDoc = HydratedDocument<IProduct>;

const colorSchema = new Schema<IProductColor>(
  {
    name: { type: String, required: true },
    hex: { type: String },
  },
  { _id: false }
);

const productSchema = new Schema<IProduct>(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
    sku: { type: String, unique: true, sparse: true, trim: true },
    description: { type: String },
    shortDescription: { type: String },
    image: { type: String, required: true },
    images: { type: [String], default: [] },
    price: { type: Number, required: true, min: 0 },
    originalPrice: { type: Number, min: 0 },
    costPrice: { type: Number, min: 0 },
    badge: { type: String },
    category: { type: String, default: "all" },
    categoryRef: { type: Schema.Types.ObjectId, ref: "Category" },
    collections: { type: [String], default: [] },
    signatureSeries: { type: [String], default: [] },
    tags: { type: [String], default: [] },
    sizes: { type: [String], default: [] },
    colors: { type: [colorSchema], default: [] },
    stockQuantity: { type: Number, default: 0, min: 0 },
    inStock: { type: Boolean, default: true },
    isActive: { type: Boolean, default: true },
    weight: { type: Number, min: 0 },
    pointsReward: { type: Number, default: 0, min: 0 },
    rating: { type: Number, default: 0, min: 0, max: 5 },
    reviewCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

productSchema.index({ category: 1, isActive: 1 });
productSchema.index({ collections: 1 });
productSchema.index({ signatureSeries: 1 });
productSchema.index({ tags: 1 });
productSchema.index({ title: "text", description: "text", tags: "text" });

const Product = model<IProduct>("Product", productSchema);

export default Product;
