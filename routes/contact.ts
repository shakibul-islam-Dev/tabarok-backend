import { Router, Response } from "express";
import { Types } from "mongoose";
import ContactSubmission from "../models/ContactSubmission.js";
import { protect, type BetterAuthRequest } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/admin.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { schemas, validateBody } from "../utils/validation.js";

const router = Router();

// Public endpoint: anyone can submit a contact inquiry.
router.post(
  "/",
  asyncHandler(async (req: BetterAuthRequest, res: Response) => {
    const { name, email, subject, message } = validateBody(
      schemas.contact,
      req.body
    );
    const submission = await ContactSubmission.create({
      name,
      email,
      subject,
      message,
    });
    res.status(201).json(submission);
  })
);

// Admin endpoints: contact inquiry management

router.use(protect, requireAdmin);

/**
 * List all contact submissions with optional status filter.
 */
router.get(
  "/admin/all",
  asyncHandler(async (req: BetterAuthRequest, res: Response) => {
    const { status, page, limit } = req.query;
    const filter: Record<string, unknown> = {};
    if (typeof status === "string" && status) filter.status = status;

    const pageNum = typeof page === "string" ? Math.max(1, Number(page) || 1) : 1;
    const pageSize = typeof limit === "string" ? Number(limit) || 20 : 20;

    const [submissions, total] = await Promise.all([
      ContactSubmission.find(filter)
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * pageSize)
        .limit(pageSize),
      ContactSubmission.countDocuments(filter),
    ]);

    res.json({
      submissions,
      pagination: {
        page: pageNum,
        pages: Math.ceil(total / pageSize),
        total,
      },
    });
  })
);

/**
 * Update the status of a contact submission (e.g. new -> resolved).
 */
router.patch(
  "/admin/:id",
  asyncHandler(async (req: BetterAuthRequest, res: Response) => {
    const { id } = req.params;
    if (!Types.ObjectId.isValid(id)) {
      throw new ApiError(400, "Invalid submission ID");
    }
    const { status } = validateBody(schemas.statusUpdate, req.body);
    const submission = await ContactSubmission.findByIdAndUpdate(
      id,
      { status },
      { new: true }
    );
    if (!submission) {
      throw new ApiError(404, "Submission not found");
    }
    res.json(submission);
  })
);

export default router;
