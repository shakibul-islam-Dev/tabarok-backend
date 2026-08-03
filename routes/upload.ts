import { Router, Response } from "express";
import { protect } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { upload, fileUrl } from "../utils/upload.js";
import { ApiError } from "../utils/ApiError.js";

const router = Router();

// Uploading requires an authenticated session so the endpoint cannot be abused.
router.use(protect);

/**
 * POST /api/uploads
 * Single-file upload. Expect multipart/form-data with a file in the "file" field.
 * Returns the absolute URL that can be stored directly on products, categories,
 * hero slides, etc.
 */
router.post(
  "/",
  upload.single("file"),
  asyncHandler(async (req, res: Response) => {
    if (!req.file) {
      throw new ApiError(400, "No file uploaded. Use a multipart field named 'file'");
    }
    res.status(201).json({
      url: fileUrl(req, req.file.filename),
      filename: req.file.filename,
      size: req.file.size,
      mimetype: req.file.mimetype,
    });
  })
);

/**
 * POST /api/uploads/multiple
 * Multiple-file upload. Expect files in the "files" field.
 * Returns an array of absolute URLs.
 */
router.post(
  "/multiple",
  upload.array("files", 10),
  asyncHandler(async (req, res: Response) => {
    const files = req.files as Express.Multer.File[] | undefined;
    if (!files || files.length === 0) {
      throw new ApiError(400, "No files uploaded. Use a multipart field named 'files'");
    }
    res.status(201).json({
      urls: files.map((f) => fileUrl(req, f.filename)),
      files: files.map((f) => ({
        filename: f.filename,
        size: f.size,
        mimetype: f.mimetype,
      })),
    });
  })
);

export default router;
