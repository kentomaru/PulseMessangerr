import { NextResponse } from "next/server";
import { destroySession } from "@/lib/auth";
import { withPublicApi } from "@/lib/api-helpers";

export const POST = withPublicApi("auth/logout", async ({ log }) => {
  await destroySession();
  log.info("Выход выполнен");
  return NextResponse.json({ ok: true });
});
