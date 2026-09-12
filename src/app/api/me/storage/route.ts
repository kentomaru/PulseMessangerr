import { db } from "@/db";
import { files } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { getSessionUser } from "@/lib/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const me = await getSessionUser();
  if (!me) return Response.json({ error: "unauthorized" }, { status: 401 });
  const rows = await db
    .select({
      bytes: sql<string>`coalesce(sum(${files.size}), 0)`,
      count: sql<string>`count(*)`,
    })
    .from(files)
    .where(eq(files.uploadedBy, me.id));
  return Response.json({
    bytes: Number(rows[0]?.bytes ?? 0),
    count: Number(rows[0]?.count ?? 0),
  });
}
