import { betterAuth } from "better-auth";
import { MongoClient } from "mongodb";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { admin } from "better-auth/plugins";
import { ac, adminRole, superadminRole, userRole } from "./rbac.js";

const uri = process.env.MONGO_DB_URI;
if (!uri) {
  throw new Error("MONGO_DB_URI environment variable is not set");
}

const client = new MongoClient(uri);
const db = client.db("Tobarok");

export const auth = betterAuth({
  database: mongodbAdapter(db, { client }),
  // NEXT_PUBLIC_URL = backend base URL in this project's env convention
  baseURL: process.env.NEXT_PUBLIC_URL ?? "http://localhost:5000",
  // BETTER_AUTH_URL = frontend origin(s) in this project's env convention
  trustedOrigins: process.env.BETTER_AUTH_URL
    ? process.env.BETTER_AUTH_URL.split(",").map((o) => o.trim()).filter(Boolean)
    : ["http://localhost:3000"],
  emailAndPassword: {
    enabled: true,
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    },
  },
  plugins: [
    admin({
      defaultRole: "user",
      adminRoles: ["admin", "superadmin"],
      adminUserIds: process.env.SUPER_ADMIN_USER_IDS?.split(",")
        .map((id) => id.trim())
        .filter(Boolean),
      ac,
      roles: {
        user: userRole,
        admin: adminRole,
        superadmin: superadminRole,
      },
    }),
  ],
});

export type AuthUser = typeof auth.$Infer.Session.user;
export type AuthSession = typeof auth.$Infer.Session.session;
