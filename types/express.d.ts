import type { UserDoc } from "../models/User.js";
import type { AuthSession } from "../lib/auth.js";

declare global {
  namespace Express {
    interface Request {
      user?: UserDoc;
      session?: AuthSession;
    }
  }
}

export {};
