import { Schema, model, HydratedDocument, Model, Types } from "mongoose";
import bcrypt from "bcryptjs";
import crypto from "crypto";

export type UserRole = "user" | "admin" | "superadmin";

export interface IUserAddress {
  _id?: Types.ObjectId;
  label?: string;
  fullName: string;
  phone: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state?: string;
  zip?: string;
  country: string;
  isDefault: boolean;
}

export interface IUser {
  name: string;
  email: string;
  password: string;
  emailVerified?: boolean;
  image?: string;
  phone?: string;
  role: UserRole;
  banned?: boolean;
  points: number;
  totalEarned: number;
  totalRedeemed: number;
  riskLevel: "low" | "medium" | "high";
  referralCode: string;
  referredBy?: Types.ObjectId;
  addresses: IUserAddress[];
  createdAt: Date;
  updatedAt: Date;
}

export interface IUserMethods {
  matchPassword(entered: string): Promise<boolean>;
}

export type UserDoc = HydratedDocument<IUser, IUserMethods>;

type UserModel = Model<IUser, {}, IUserMethods>;

function generateReferralCode(): string {
  return crypto.randomBytes(4).toString("hex").toUpperCase();
}

const addressSchema = new Schema<IUserAddress>(
  {
    label: { type: String },
    fullName: { type: String, required: true },
    phone: { type: String, required: true },
    addressLine1: { type: String, required: true },
    addressLine2: { type: String },
    city: { type: String, required: true },
    state: { type: String },
    zip: { type: String },
    country: { type: String, default: "Bangladesh" },
    isDefault: { type: Boolean, default: false },
  },
  { _id: true, timestamps: true }
);

const userSchema = new Schema<IUser, UserModel, IUserMethods>(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: { type: String, required: true, minlength: 6 },
    emailVerified: { type: Boolean, default: false },
    image: { type: String },
    phone: { type: String },
    role: {
      type: String,
      enum: ["user", "admin", "superadmin"],
      default: "user",
    },
    banned: { type: Boolean, default: false },
    points: { type: Number, default: 0, min: 0 },
    totalEarned: { type: Number, default: 0, min: 0 },
    totalRedeemed: { type: Number, default: 0, min: 0 },
    riskLevel: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "low",
    },
    referralCode: {
      type: String,
      unique: true,
      sparse: true,
      uppercase: true,
      trim: true,
    },
    referredBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    addresses: { type: [addressSchema], default: [] },
  },
  { timestamps: true }
);

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.pre("save", async function (next) {
  if (!this.isNew || this.referralCode) return next();
  let code = generateReferralCode();
  while (await User.exists({ referralCode: code })) {
    code = generateReferralCode();
  }
  this.referralCode = code;
  next();
});

userSchema.methods.matchPassword = function (entered: string) {
  return bcrypt.compare(entered, this.password);
};

const User = model<IUser, UserModel>("User", userSchema);

export default User;
