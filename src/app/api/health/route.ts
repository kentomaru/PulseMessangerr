import { NextResponse } from "next/server";
import { pingDb, errorSummary } from "@/db";
import { createLogger } from "@/lib/logger";

const log = createLogger("api:health");

/**
 * Healthcheck для Railway (см. railway.json).
 * 200 — сервер и база живы; 503 — сервер жив, но база ещё поднимается
 * (Railway перезапустит сервис, если ситуация не исправится сама).
 */
export async function GET() {
  try {
    await pingDb();
    return NextResponse.json({ status: "ok", db: true });
  } catch (err) {
    log.warn("Healthcheck: база недоступна", { err: errorSummary(err) });
    return NextResponse.json({ status: "degraded", db: false }, { status: 503 });
  }
}
