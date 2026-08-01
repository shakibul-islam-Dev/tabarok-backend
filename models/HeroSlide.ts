import { Schema, model, HydratedDocument } from "mongoose";

export interface IHeroSlide {
  eyebrow: string;
  title: string;
  subtitle: string;
  cta: string;
  link: string;
  image: string;
  order: number;
  isActive?: boolean;
}

export type HeroSlideDoc = HydratedDocument<IHeroSlide>;

const heroSlideSchema = new Schema<IHeroSlide>(
  {
    eyebrow: { type: String, required: true },
    title: { type: String, required: true },
    subtitle: { type: String, required: true },
    cta: { type: String, required: true },
    link: { type: String, required: true },
    image: { type: String, required: true },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

heroSlideSchema.index({ isActive: 1, order: 1 });

const HeroSlide = model<IHeroSlide>("HeroSlide", heroSlideSchema);

export default HeroSlide;
