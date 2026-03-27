import { client } from "@/lib/db";
import { formatDbError } from "@/lib/db/format-db-error";

/**
 * Runs a trivial query to force a real driver-level error (connect/auth/etc).
 * Drizzle can wrap some driver errors as "Failed query ..." which hides the root cause.
 */
export async function assertDbConnection() {
  try {
    await client`select 1 as ok`;
  } catch (err) {
    throw new Error(`Database connection failed: ${formatDbError(err)}`, {
      cause: err as unknown,
    });
  }
}

