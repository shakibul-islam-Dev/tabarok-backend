import { Schema, model, HydratedDocument } from "mongoose";

export type ContactStatus = "new" | "in_progress" | "resolved";

export interface IContactSubmission {
  name: string;
  email: string;
  subject?: string;
  message: string;
  status: ContactStatus;
}

export type ContactSubmissionDoc = HydratedDocument<IContactSubmission>;

const contactSubmissionSchema = new Schema<IContactSubmission>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    subject: { type: String, trim: true },
    message: { type: String, required: true },
    status: {
      type: String,
      enum: ["new", "in_progress", "resolved"],
      default: "new",
    },
  },
  { timestamps: true }
);

const ContactSubmission = model<IContactSubmission>(
  "ContactSubmission",
  contactSubmissionSchema
);

export default ContactSubmission;
