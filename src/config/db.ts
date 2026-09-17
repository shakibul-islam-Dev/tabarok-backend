import mongoose from "mongoose";

export const DB_NAME = "Tobarok";

export function resolveDbName(uri?: string): string {
  if (!uri) return DB_NAME;
  const m = uri.split("?")[0].match(/\/([^/]+)$/);
  return m ? m[1] : DB_NAME;
}

async function connectDB(): Promise<void> {
  try {
    const uri = process.env.MONGO_DB_URI;
    if (!uri) {
      throw new Error("MONGO_DB_URI environment variable is not set");
    }

    const conn = await mongoose.connect(uri, { dbName: resolveDbName(uri) });
    console.log(
      `MongoDB connected: ${conn.connection.host} (${conn.connection.name})`,
    );
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}

export default connectDB;
