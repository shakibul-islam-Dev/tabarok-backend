import { Schema, model, HydratedDocument, Types } from "mongoose";

export type CategoryType = "collection" | "signature" | "budget" | "accessory" | "menu-group";

export interface ICategory {
  title: string;
  slug: string;
  description?: string;
  image?: string;
  parent?: Types.ObjectId;
  type: CategoryType;
  order: number;
  isActive?: boolean;
}

export type CategoryDoc = HydratedDocument<ICategory>;

const categorySchema = new Schema<ICategory>(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
    description: { type: String },
    image: { type: String },
    parent: { type: Schema.Types.ObjectId, ref: "Category", default: null },
    type: {
      type: String,
      enum: ["collection", "signature", "budget", "accessory", "menu-group"],
      default: "collection",
    },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

categorySchema.index({ type: 1, isActive: 1 });
categorySchema.index({ parent: 1 });

const Category = model<ICategory>("Category", categorySchema);

export default Category;
