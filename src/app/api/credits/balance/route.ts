import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getCredits } from "@/lib/credits";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const credits = await getCredits(session.user.id);
  return NextResponse.json({ credits });
}
