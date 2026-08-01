import { Router, Response } from "express";
import { Types } from "mongoose";
import User from "../models/User.js";
import { protect, type BetterAuthRequest } from "../middleware/auth.js";
import { requireAdmin, requireSuperAdmin } from "../middleware/admin.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { schemas, validateBody } from "../utils/validation.js";

const router = Router();

// All admin routes require at least an admin role.
router.use(protect, requireAdmin);

/**
 * List users with optional filtering.
 * Password hashes are intentionally excluded from the response.
 */
router.get(
  "/users",
  asyncHandler(async (req: BetterAuthRequest, res: Response) => {
    const { role, banned, search, page, limit } = req.query;
    const filter: Record<string, unknown> = {};
    if (typeof role === "string" && role) filter.role = role;
    if (banned === "true" || banned === "false") {
      filter.banned = banned === "true";
    }
    if (typeof search === "string" && search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    const pageNum = typeof page === "string" ? Math.max(1, Number(page) || 1) : 1;
    const pageSize = typeof limit === "string" ? Number(limit) || 20 : 20;

    const [users, total] = await Promise.all([
      User.find(filter)
        .select("-password")
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * pageSize)
        .limit(pageSize),
      User.countDocuments(filter),
    ]);

    res.json({
      users,
      pagination: {
        page: pageNum,
        pages: Math.ceil(total / pageSize),
        total,
      },
    });
  })
);

/**
 * Get a single user by ID. Password hash is never returned.
 */
router.get(
  "/users/:id",
  asyncHandler(async (req: BetterAuthRequest, res: Response) => {
    const { id } = req.params;
    if (!Types.ObjectId.isValid(id)) {
      throw new ApiError(400, "Invalid user ID");
    }
    const user = await User.findById(id).select("-password");
    if (!user) {
      throw new ApiError(404, "User not found");
    }
    res.json(user);
  })
);

/**
 * Change a user's role. Restricted to superadmins to avoid privilege escalation.
 */
router.patch(
  "/users/:id/role",
  requireSuperAdmin,
  asyncHandler(async (req: BetterAuthRequest, res: Response) => {
    const { id } = req.params;
    if (!Types.ObjectId.isValid(id)) {
      throw new ApiError(400, "Invalid user ID");
    }
    const { role } = validateBody(schemas.userRoleUpdate, req.body);
    const user = await User.findByIdAndUpdate(id, { role }, { new: true }).select(
      "-password"
    );
    if (!user) {
      throw new ApiError(404, "User not found");
    }
    res.json(user);
  })
);

/**
 * Ban or unban a user. Banned users are rejected by the auth middleware on every request.
 */
router.patch(
  "/users/:id/ban",
  asyncHandler(async (req: BetterAuthRequest, res: Response) => {
    const { id } = req.params;
    if (!Types.ObjectId.isValid(id)) {
      throw new ApiError(400, "Invalid user ID");
    }
    const { banned } = validateBody(schemas.userBanUpdate, req.body);
    const user = await User.findByIdAndUpdate(id, { banned }, { new: true }).select(
      "-password"
    );
    if (!user) {
      throw new ApiError(404, "User not found");
    }
    res.json(user);
  })
);

export default router;
