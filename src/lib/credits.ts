import { db } from "./db";
import { users, creditTransactions } from "./db/schema";
import { eq, sql } from "drizzle-orm";

// ─── Credit Packages ─────────────────────────────────────────────

export const CREDIT_PACKAGES = [
  {
    id: "starter",
    name: "Starter",
    credits: 10,
    price: 499, // cents
    priceLabel: "$4.99",
    stripePriceId: process.env.STRIPE_PRICE_STARTER!,
  },
  {
    id: "pro",
    name: "Pro",
    credits: 50,
    price: 1999,
    priceLabel: "$19.99",
    badge: "20% savings",
    stripePriceId: process.env.STRIPE_PRICE_PRO!,
  },
  {
    id: "business",
    name: "Business",
    credits: 200,
    price: 5999,
    priceLabel: "$59.99",
    badge: "40% savings",
    stripePriceId: process.env.STRIPE_PRICE_BUSINESS!,
  },
] as const;

// ─── Credit Costs ────────────────────────────────────────────────

export const CREDIT_COSTS = {
  AI_CONVERSION: 3,
  HD_RENDER: 1,
  AI_FURNITURE: 1,
} as const;

// ─── Credit Operations ──────────────────────────────────────────

export type CreditReason =
  | "purchase"
  | "signup_bonus"
  | "ai_conversion"
  | "ai_conversion_refund"
  | "hd_render"
  | "ai_furniture";

/**
 * Atomically deduct credits from a user.
 * Returns the updated user or throws if insufficient credits.
 */
export async function useCredits(
  userId: string,
  amount: number,
  reason: CreditReason
) {
  if (amount <= 0) throw new Error("Credit amount must be positive");

  // Atomic decrement: only updates if credits >= amount
  const result = await db
    .update(users)
    .set({ credits: sql`${users.credits} - ${amount}` })
    .where(eq(users.id, userId))
    .returning({ credits: users.credits });

  if (!result[0]) {
    throw new Error("User not found or insufficient credits");
  }

  if (result[0].credits < 0) {
    // Rollback — restore credits
    await db
      .update(users)
      .set({ credits: sql`${users.credits} + ${amount}` })
      .where(eq(users.id, userId));
    throw new Error("Insufficient credits");
  }

  await db.insert(creditTransactions).values({
    userId,
    amount: -amount,
    reason,
    balanceAfter: result[0].credits,
  });

  return result[0];
}

/**
 * Add credits to a user account (e.g. after purchase).
 */
export async function addCredits(
  userId: string,
  amount: number,
  reason: CreditReason
) {
  if (amount <= 0) throw new Error("Credit amount must be positive");

  const result = await db
    .update(users)
    .set({ credits: sql`${users.credits} + ${amount}` })
    .where(eq(users.id, userId))
    .returning({ credits: users.credits });

  if (!result[0]) throw new Error("User not found");

  await db.insert(creditTransactions).values({
    userId,
    amount,
    reason,
    balanceAfter: result[0].credits,
  });

  return result[0];
}

/**
 * Get a user's current credit balance.
 */
export async function getCredits(userId: string): Promise<number> {
  const result = await db
    .select({ credits: users.credits })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return result[0]?.credits ?? 0;
}
