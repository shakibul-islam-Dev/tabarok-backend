import { Schema, model, HydratedDocument } from "mongoose";

export interface IOutlet {
  name: string;
  area: string;
  hours?: string;
  phone?: string;
  coordinates?: {
    lat: number;
    lng: number;
  };
  isActive?: boolean;
}

export type OutletDoc = HydratedDocument<IOutlet>;

const outletSchema = new Schema<IOutlet>(
  {
    name: { type: String, required: true, trim: true },
    area: { type: String, required: true },
    hours: { type: String },
    phone: { type: String },
    coordinates: {
      lat: { type: Number },
      lng: { type: Number },
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const Outlet = model<IOutlet>("Outlet", outletSchema);

export default Outlet;
