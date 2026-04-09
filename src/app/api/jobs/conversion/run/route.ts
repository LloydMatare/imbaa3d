import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { processQueuedConversionJobs } from "@/lib/conversion/worker";
import { ensureDbUser } from "@/lib/auth/ensure-db-user";

export const runtime = "nodejs";

// Dev-only: simple DB-backed worker to process queued conversion jobs.
export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV !== "development") {
    return new NextResponse("Not found", { status: 404 });
  }

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { limit?: number };
  const limit = Math.max(1, Math.min(10, Math.floor(body.limit ?? 1)));

  await ensureDbUser();

  const processed = await processQueuedConversionJobs({ limit, userId });

  return NextResponse.json({ ok: true, processed });
}
