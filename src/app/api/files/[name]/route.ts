import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { uploads } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createLogger } from "@/lib/logger";
import { readFile } from "fs/promises";
import path from "path";

const log = createLogger("api:files");

export const dynamic = "force-dynamic";

const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  ogg: "audio/ogg",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  pdf: "application/pdf",
};

function headersFor(name: string, mimeType: string) {
  const inline = /^(image|video|audio)\//.test(mimeType);
  return {
    "Content-Type": mimeType || "application/octet-stream",
    "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(name)}`,
    "Cache-Control": "public, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
  };
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ name: string }> },
) {
  const { name } = await ctx.params;
  if (!/^[a-zA-Z0-9-]+\.[a-zA-Z0-9]{1,16}$/.test(name)) {
    log.debug("Запрос файла отклонён (недопустимое имя)", { name });
    return NextResponse.json({ error: "Недопустимое имя" }, { status: 400 });
  }

  const ext = name.split(".").pop()!.toLowerCase();
  try {
    const rows = await db
      .select({ data: uploads.data, mimeType: uploads.mimeType })
      .from(uploads)
      .where(eq(uploads.name, name))
      .limit(1);
    const stored = rows[0];
    if (stored) {
      return new NextResponse(new Uint8Array(stored.data), {
        headers: headersFor(name, stored.mimeType || MIME[ext] || "application/octet-stream"),
      });
    }
  } catch (err) {
    // До первого запуска ensureSchema или при временной недоступности БД
    // пробуем старый локальный каталог.
    log.debug("Не удалось проверить файл в PostgreSQL", {
      name,
      err: err instanceof Error ? err.message : String(err),
    });
  }

  try {
    const filePath = path.join(process.cwd(), "data", "uploads", name);
    const data = await readFile(filePath);
    const mimeType = MIME[ext] ?? "application/octet-stream";
    // Переносим старые локальные файлы в durable-хранилище при первом
    // обращении, чтобы уже созданные аватары тоже пережили деплой.
    void db
      .insert(uploads)
      .values({ name, mimeType, data })
      .onConflictDoNothing()
      .catch(() => {});
    return new NextResponse(new Uint8Array(data), {
      headers: headersFor(name, mimeType),
    });
  } catch {
    log.debug("Файл не найден", { name });
    return NextResponse.json({ error: "Не найден" }, { status: 404 });
  }
}
