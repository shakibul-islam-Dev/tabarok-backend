import { Router, Response } from "express";
import { protect, type BetterAuthRequest } from "../middleware/auth.js";

const router = Router();

/**
 * Return the currently authenticated user and session.
 * This is useful for the frontend to refresh its auth state on page load.
 */
router.get("/me", protect, (req: BetterAuthRequest, res: Response) => {
  res.json({
    user: req.user,
    session: req.session,
  });
});

export default router;
