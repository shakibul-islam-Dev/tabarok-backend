import type { Request, Response, NextFunction } from "express";

/**
 * Wraps async Express handlers so rejected promises are forwarded to the
 * centralized error middleware. This removes the need for a manual try/catch
 * block in every route handler.
 *
 * Supports extended request types such as BetterAuthRequest.
 */
export function asyncHandler<
  Req extends Request = Request
>(
  fn: (req: Req, res: Response, next: NextFunction) => Promise<unknown>
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    Promise.resolve(fn(req as Req, res, next)).catch(next);
  };
}
