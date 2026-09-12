import { db } from "@/db";
import { files } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const fileId = Number(id);
  if (!Number.isFinite(fileId)) return new Response("bad id", { status: 400 });
  const rows = await db.select().from(files).where(eq(files.id, fileId)).limit(1);
  if (rows.length === 0) return new Response("not found", { status: 404 });
  const row = rows[0];
  const buffer = Buffer.from(row.data, "base64");
  return new Response(new Uint8Array(buffer), {
    headers: {
      "content-type": row.mime || "application/octet-stream",
      "content-length": String(buffer.byteLength),
      "cache-control": "public, max-age=31536000, immutable",
      "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(row.name)}`,
    },
  });
}
