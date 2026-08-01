import { Request, Response, NextFunction } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { randomUUID } from "crypto";
import { auth } from "../lib/auth.js";
import type { AuthUser } from "../lib/auth.js";
import User, { type UserDoc } from "../models/User.js";
import { ApiError } from "../utils/ApiError.js";

/**
 * Express Request extended with `user` and `session` from the global declaration.
 * The global declaration already includes `AuthSession` for `session`.
 */
export interface BetterAuthRequest extends Request {
  user?: UserDoc;
}

/**
 * Synchronizes the local User document with the Better Auth session user.
 * This keeps role, ban status, name, and email consistent across sign-ins.
 */
async function syncLocalUser(betterUser: AuthUser): Promise<UserDoc> {
  const email = betterUser.email?.toLowerCase().trim();
  if (!email) {
    throw new ApiError(401, "Session user is missing an email");
  }

  let user = await User.findOne({ email });

  if (!user) {
    user = await User.create({
      name: betterUser.name ?? email.split("@")[0],
      email,
      password: randomUUID(), // never used; auth is delegated to Better Auth
      image: betterUser.image,
      role: (betterUser.role as "user" | "admin" | "superadmin") ?? "user",
      banned: betterUser.banned ?? false,
      emailVerified: betterUser.emailVerified ?? false,
    });
    return user;
  }

  // Re-sync fields that may change in Better Auth
  const updates: Partial<UserDoc> = {};
  if (betterUser.name && user.name !== betterUser.name) updates.name = betterUser.name;
  if (user.email !== email) updates.email = email;
  if (betterUser.image && user.image !== betterUser.image) updates.image = betterUser.image;
  if (betterUser.role && user.role !== betterUser.role) {
    updates.role = betterUser.role as "user" | "admin" | "superadmin";
  }
  if (typeof betterUser.banned === "boolean" && user.banned !== betterUser.banned) {
    updates.banned = betterUser.banned;
  }
  if (
    typeof betterUser.emailVerified === "boolean" &&
    user.emailVerified !== betterUser.emailVerified
  ) {
    updates.emailVerified = betterUser.emailVerified;
  }

  if (Object.keys(updates).length > 0) {
    await User.updateOne({ _id: user._id }, updates);
    user = await User.findById(user._id);
    if (!user) {
      throw new ApiError(500, "Failed to reload user after sync");
    }
  }

  return user;
}

/**
 * Requires a valid Better Auth session. Populates `req.user` and `req.session`.
 */
export async function protect(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

    if (!session || !session.user) {
      return next(new ApiError(401, "Not authorized, no session"));
    }

    const user = await syncLocalUser(session.user);

    if (user.banned) {
      return next(new ApiError(403, "User account is banned"));
    }

    const breq = req as BetterAuthRequest;
    breq.user = user;
    breq.session = session.session;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Attaches a user if a session exists, but never blocks the request.
 * Useful for guest-cart flows and public endpoints that can be personalized.
 */
export async function optionalSession(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });
    if (session?.user) {
      const breq = req as BetterAuthRequest;
      breq.user = await syncLocalUser(session.user);
    }
    next();
  } catch (err) {
    // Treat session failures as anonymous; do not block the request.
    next();
  }
}
