import { Response, NextFunction } from "express";
import { ApiError } from "../utils/ApiError.js";
import type { BetterAuthRequest } from "./auth.js";

/**
 * Centralized admin authorization. Assumes `protect` has already run.
 */
export function requireAdmin(
  req: BetterAuthRequest,
  _res: Response,
  next: NextFunction
): void {
  if (!req.user) {
    return next(new ApiError(401, "Not authenticated"));
  }
  if (req.user.role !== "admin" && req.user.role !== "superadmin") {
    return next(new ApiError(403, "Admin access required"));
  }
  next();
}

export function requireSuperAdmin(
  req: BetterAuthRequest,
  _res: Response,
  next: NextFunction
): void {
  if (!req.user) {
    return next(new ApiError(401, "Not authenticated"));
  }
  if (req.user.role !== "superadmin") {
    return next(new ApiError(403, "Super admin access required"));
  }
  next();
}
