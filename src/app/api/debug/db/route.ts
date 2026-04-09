import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { client } from "@/lib/db";

function safeDbInfo(url: string | undefined) {
  if (!url) return { defined: false as const };
  try {
    const u = new URL(url);
    return {
      defined: true as const,
      protocol: u.protocol,
      host: u.hostname,
      port: u.port || (u.protocol.startsWith("postgres") ? "5432" : ""),
      database: u.pathname.replace(/^\//, ""),
      schema: u.searchParams.get("schema") ?? undefined,
      user: u.username || undefined,
    };
  } catch {
    return { defined: true as const, parseError: true as const };
  }
}

export async function GET() {
  // Dev-only diagnostics.
  if (process.env.NODE_ENV !== "development") {
    return new NextResponse("Not found", { status: 404 });
  }

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const info = safeDbInfo(process.env.DATABASE_URL);

  try {
    const result = await client<{ ok: number }[]>`select 1 as ok`;
    return NextResponse.json({
      ok: true,
      db: info,
      result: result?.[0]?.ok ?? null,
    });
  } catch (err) {
    const e = err as {
      code?: unknown;
      message?: unknown;
      detail?: unknown;
      hint?: unknown;
    };
    return NextResponse.json(
      {
        ok: false,
        db: info,
        error: {
          code: e?.code,
          message: e?.message,
          detail: e?.detail,
          hint: e?.hint,
        },
      },
      { status: 500 }
    );
  }
}
