import mongoose from "mongoose";

async function connectDB(): Promise<void> {
  try {
    const uri = process.env.MONGO_DB_URI;
    if (!uri) {
      throw new Error("MONGO_DB_URI environment variable is not set");
    }

    const conn = await mongoose.connect(uri);
    console.log(
      `MongoDB connected: ${conn.connection.host} (${conn.connection.name})`,
    );
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}

export default connectDB;
