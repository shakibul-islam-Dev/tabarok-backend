import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import multer from "multer";
import type { Request } from "express";
import { ApiError } from "./ApiError.js";
import { envNumber } from "./env.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const uploadDir = path.resolve(
  __dirname,
  "..",
  process.env.UPLOAD_DIR || "uploads"
);

fs.mkdirSync(uploadDir, { recursive: true });

const maxSizeMb = envNumber("MAX_UPLOAD_SIZE_MB", 10);

const allowedMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/avif",
  "image/svg+xml",
  "application/pdf",
]);

function fileFilter(
  _req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
): void {
  if (allowedMimeTypes.has(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new ApiError(400, `Unsupported file type: ${file.mimetype}`));
  }
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || "";
    const safeName = path
      .basename(file.originalname, ext)
      .replace(/[^a-zA-Z0-9-_]/g, "-")
      .toLowerCase();
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${safeName}-${unique}${ext}`);
  },
});

export const upload = multer({
  storage,
  limits: { fileSize: maxSizeMb * 1024 * 1024, files: 10 },
  fileFilter,
});

/**
 * Builds the absolute URL for an uploaded file using the backend's public URL.
 * Falls back to the request origin when NEXT_PUBLIC_URL is not configured.
 */
export function fileUrl(req: Request, filename: string): string {
  const base =
    process.env.NEXT_PUBLIC_URL?.replace(/\/$/, "") ??
    `${req.protocol}://${req.get("host")}`;
  return `${base}/uploads/${filename}`;
}
