import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const url = process.env.AI_SERVICE_URL;
  const configured = Boolean(url);
  return NextResponse.json({ configured, url });
}
