import { Schema, model, HydratedDocument } from "mongoose";

export interface INewsletterSubscriber {
  email: string;
  isActive: boolean;
}

export type NewsletterSubscriberDoc = HydratedDocument<INewsletterSubscriber>;

const newsletterSubscriberSchema = new Schema<INewsletterSubscriber>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const NewsletterSubscriber = model<INewsletterSubscriber>(
  "NewsletterSubscriber",
  newsletterSubscriberSchema
);

export default NewsletterSubscriber;
