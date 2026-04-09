import { auth, currentUser } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { creditTransactions, users } from "@/lib/db/schema";

export async function ensureDbUserById(userId: string) {
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (existing[0]) return { userId, created: false as const };

  // No Clerk context here (e.g. webhooks). Create a minimal row.
  await db
    .insert(users)
    .values({
      id: userId,
      // `email` is non-nullable in our schema; use a stable placeholder.
      email: `${userId}@clerk.local`,
      credits: 0,
    })
    .onConflictDoNothing({ target: users.id });

  return { userId, created: true as const };
}

/**
 * Ensures a corresponding row exists in our `User` table for the current Clerk user.
 *
 * This keeps the rest of the app (credits, project FK constraints, etc.) working even
 * when users authenticate solely via Clerk.
 */
export async function ensureDbUser() {
  const { userId } = await auth();
  if (!userId) return null;

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (existing[0]) return { userId, created: false as const };

  const u = await currentUser();
  const email =
    u?.primaryEmailAddress?.emailAddress ??
    u?.emailAddresses?.[0]?.emailAddress ??
    `${userId}@clerk.local`;
  const name =
    u?.fullName ??
    [u?.firstName, u?.lastName].filter(Boolean).join(" ") ??
    null;
  const image = u?.imageUrl ?? null;

  const inserted = await db
    .insert(users)
    .values({ id: userId, email, name, image })
    .onConflictDoNothing({ target: users.id })
    .returning({ id: users.id, credits: users.credits });

  // If another request raced us, there is nothing else to do.
  if (!inserted[0]) return { userId, created: false as const };

  // Optional: record the initial credit grant for auditing.
  const initialCredits = inserted[0].credits ?? 5;
  await db
    .insert(creditTransactions)
    .values({
      userId,
      amount: initialCredits,
      reason: "signup_bonus",
      balanceAfter: initialCredits,
    })
    .catch(() => {
      // Avoid blocking sign-in on non-critical audit logging.
    });

  return { userId, created: true as const };
}
