import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { db } from "@/lib/db";
import { payments } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { addCredits } from "@/lib/credits";
import { ensureDbUserById } from "@/lib/auth/ensure-db-user";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const headersList = await headers();
  const signature = headersList.get("stripe-signature");

  if (!signature) {
    return NextResponse.json(
      { error: "Missing stripe-signature" },
      { status: 400 }
    );
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`Webhook signature verification failed: ${message}`);
    return NextResponse.json(
      { error: `Webhook Error: ${message}` },
      { status: 400 }
    );
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;

    const userId = session.metadata?.userId;
    const creditsToAdd = parseInt(session.metadata?.creditsToAdd || "0", 10);

    if (!userId || creditsToAdd <= 0) {
      console.error("Missing metadata on checkout session", session.id);
      return NextResponse.json({ received: true });
    }

    // Idempotency: check if we already processed this session
    const [existing] = await db
      .select({ status: payments.status })
      .from(payments)
      .where(eq(payments.stripeCheckoutSessionId, session.id))
      .limit(1);

    if (existing?.status === "COMPLETED") {
      return NextResponse.json({ received: true });
    }

    try {
      // Upsert the payment record
      await db
        .insert(payments)
        .values({
          userId,
          stripeCheckoutSessionId: session.id,
          stripePaymentIntentId: session.payment_intent as string | null,
          amount: session.amount_total || 0,
          currency: session.currency || "usd",
          creditsAdded: creditsToAdd,
          status: "COMPLETED",
        })
        .onConflictDoUpdate({
          target: payments.stripeCheckoutSessionId,
          set: {
            status: "COMPLETED",
            stripePaymentIntentId: session.payment_intent as string | null,
          },
        });

      // In case the user hasn't hit the app yet (and thus doesn't have a DB row),
      // make sure the FK target exists before we add credits.
      await ensureDbUserById(userId);

      // Add credits
      await addCredits(userId, creditsToAdd, "purchase");

      console.log(
        `Added ${creditsToAdd} credits to user ${userId} (session: ${session.id})`
      );
    } catch (error) {
      console.error("Failed to process payment webhook:", error);
      return NextResponse.json(
        { error: "Webhook handler failed" },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ received: true });
}
