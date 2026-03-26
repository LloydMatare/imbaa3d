import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { addCredits } from "@/lib/credits";

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
    const existing = await prisma.payment.findUnique({
      where: { stripeCheckoutSessionId: session.id },
    });

    if (existing?.status === "COMPLETED") {
      return NextResponse.json({ received: true });
    }

    try {
      await prisma.$transaction(async (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) => {
        // Upsert payment record
        await tx.payment.upsert({
          where: { stripeCheckoutSessionId: session.id },
          create: {
            userId,
            stripeCheckoutSessionId: session.id,
            stripePaymentIntentId: session.payment_intent as string | null,
            amount: session.amount_total || 0,
            currency: session.currency || "usd",
            creditsAdded: creditsToAdd,
            status: "COMPLETED",
          },
          update: {
            status: "COMPLETED",
            stripePaymentIntentId: session.payment_intent as string | null,
          },
        });
      });

      // Add credits (separate transaction for clarity)
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
