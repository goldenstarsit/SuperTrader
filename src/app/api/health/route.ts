import { NextResponse } from "next/server";
import db from "@/lib/database";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = db.prepare("SELECT 1 AS ok").get() as { ok: number };

  return NextResponse.json({
    app: "SuperTrader",
    status: "ok",
    database: result.ok === 1,
    environment: env.nodeEnv,
  });
}
