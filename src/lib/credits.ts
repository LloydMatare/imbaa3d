import { prisma } from "./prisma";

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

  return await prisma.$transaction(async (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) => {
    // Atomic: only updates if user has enough credits
    const user = await tx.user.update({
      where: {
        id: userId,
        credits: { gte: amount },
      },
      data: { credits: { decrement: amount } },
    });

    await tx.creditTransaction.create({
      data: {
        userId,
        amount: -amount,
        reason,
        balanceAfter: user.credits,
      },
    });

    return user;
  });
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

  return await prisma.$transaction(async (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) => {
    const user = await tx.user.update({
      where: { id: userId },
      data: { credits: { increment: amount } },
    });

    await tx.creditTransaction.create({
      data: {
        userId,
        amount,
        reason,
        balanceAfter: user.credits,
      },
    });

    return user;
  });
}

/**
 * Get a user's current credit balance.
 */
export async function getCredits(userId: string): Promise<number> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { credits: true },
  });
  return user?.credits ?? 0;
}
