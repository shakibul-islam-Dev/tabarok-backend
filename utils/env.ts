/**
 * Read a numeric environment variable.
 * Falls back to the provided default if the variable is missing or not a valid number.
 */
export function envNumber(key: string, fallback: number): number {
  const value = Number(process.env[key]);
  return Number.isNaN(value) ? fallback : value;
}

/**
 * Read a string environment variable.
 * Falls back to the provided default if the variable is missing.
 */
export function envString(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

/**
 * Read a boolean environment variable.
 * Recognizes true/false, 1/0, and yes/no (case-insensitive).
 * Falls back to the provided default if the variable is missing or unrecognized.
 */
export function envBoolean(key: string, fallback: boolean): boolean {
  const value = process.env[key]?.toLowerCase();
  if (value === "true" || value === "1" || value === "yes") return true;
  if (value === "false" || value === "0" || value === "no") return false;
  return fallback;
}
