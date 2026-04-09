import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { addCredits } from "@/lib/credits";

// Dev-only admin endpoint to grant credits to a user by email.
export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV !== "development") {
    return new NextResponse("Not found", { status: 404 });
  }

  try {
    const body = await req.json();
    const { email, amount } = body as { email?: string; amount?: number };

    if (!email || !amount) {
      return NextResponse.json(
        { error: "email and amount are required" },
        { status: 400 }
      );
    }

    // Find user by email
    const [user] = await db
      .select({ id: users.id, credits: users.credits })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (!user) {
      return NextResponse.json(
        { error: `No user found with email: ${email}` },
        { status: 404 }
      );
    }

    const result = await addCredits(user.id, amount, "signup_bonus");

    return NextResponse.json({
      success: true,
      email,
      userId: user.id,
      previousCredits: user.credits,
      newCredits: result.credits,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
