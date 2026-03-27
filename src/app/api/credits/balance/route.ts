import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getCredits } from "@/lib/credits";
import { ensureDbUser } from "@/lib/auth/ensure-db-user";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await ensureDbUser();
    const credits = await getCredits(userId);
    return NextResponse.json({ credits });
  } catch (err) {
    console.error("/api/credits/balance failed", err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
