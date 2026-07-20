import "dotenv/config";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "../src/db/schema";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set. Copy .env.example to .env and fill in your PostgreSQL connection string."
  );
}

const client = postgres(process.env.DATABASE_URL, { max: 10 });
export const db = drizzle(client, { schema });
export { schema };
