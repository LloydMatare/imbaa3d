import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { stripe } from "@/lib/stripe";
import { CREDIT_PACKAGES } from "@/lib/credits";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { packageId } = await req.json();

  const pkg = CREDIT_PACKAGES.find((p) => p.id === packageId);
  if (!pkg) {
    return NextResponse.json({ error: "Invalid package" }, { status: 400 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  const checkoutSession = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: `${pkg.name} — ${pkg.credits} Credits`,
            description: `${pkg.credits} credits for Imbaa3D platform`,
          },
          unit_amount: pkg.price,
        },
        quantity: 1,
      },
    ],
    metadata: {
      userId: session.user.id,
      creditsToAdd: String(pkg.credits),
      packageId: pkg.id,
    },
    success_url: `${appUrl}/dashboard?purchase=success`,
    cancel_url: `${appUrl}/pricing?purchase=cancelled`,
  });

  return NextResponse.json({ url: checkoutSession.url });
}
