/**
 * Custom API error with an HTTP status code. Captures the stack trace so
 * the centralized error handler can include it in development mode.
 */
export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}
