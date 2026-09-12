import { db } from "@/db";
import { files } from "@/db/schema";
import { getSessionUser } from "@/lib/server";
import type { AttachmentPayload, FileKind } from "@/lib/pulse";

export const dynamic = "force-dynamic";

const MAX_BYTES = 26 * 1024 * 1024;

function parseDataUrl(value: string): { data: string; mime: string } | null {
  const match = /^data:([^;]+);base64,([\s\S]*)$/.exec(value);
  if (match) return { mime: match[1], data: match[2] };
  if (/^[A-Za-z0-9+/=\s]+$/.test(value) && value.length > 32) {
    return { mime: "application/octet-stream", data: value.replace(/\s+/g, "") };
  }
  return null;
}

export async function POST(request: Request) {
  const me = await getSessionUser();
  if (!me) return Response.json({ error: "unauthorized" }, { status: 401 });

  const payload = (await request.json().catch(() => ({}))) as {
    name?: string;
    mime?: string;
    kind?: string;
    data?: string;
    width?: number | null;
    height?: number | null;
    duration?: number | null;
  };
  if (!payload.data) return Response.json({ error: "empty" }, { status: 400 });

  const parsed = parseDataUrl(payload.data);
  if (!parsed) return Response.json({ error: "bad_data" }, { status: 400 });

  const rawLength = Math.floor((parsed.data.length * 3) / 4);
  if (rawLength > MAX_BYTES) {
    return Response.json({ error: "too_large", limit: MAX_BYTES }, { status: 413 });
  }

  const mime = payload.mime || parsed.mime || "application/octet-stream";
  const kind: FileKind =
    payload.kind === "image" || payload.kind === "video" || payload.kind === "audio"
      ? payload.kind
      : mime.startsWith("image/")
        ? "image"
        : mime.startsWith("video/")
          ? "video"
          : mime.startsWith("audio/")
            ? "audio"
            : "file";

  const ins = await db
    .insert(files)
    .values({
      kind,
      name: (payload.name || "file").slice(0, 180),
      mime,
      size: rawLength,
      data: parsed.data,
      width: payload.width ?? null,
      height: payload.height ?? null,
      duration: payload.duration ?? null,
      uploadedBy: me.id,
    })
    .returning();

  const row = ins[0];
  const attachment: AttachmentPayload = {
    id: row.id,
    fileId: row.id,
    kind: row.kind as FileKind,
    name: row.name,
    mime: row.mime,
    size: row.size,
    width: row.width,
    height: row.height,
    duration: row.duration,
  };
  return Response.json({ attachment });
}
