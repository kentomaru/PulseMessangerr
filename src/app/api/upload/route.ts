import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { createLogger } from "@/lib/logger";
import { randomUUID } from "crypto";
import { mkdir } from "fs/promises";
import { createWriteStream } from "fs";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import path from "path";

const log = createLogger("api:upload");

/** Лимит загрузки — 500 МБ (любые файлы: фото, видео, аудио, документы). */
const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;

/** Расширения по MIME-типу (для красивых имён и корректной отдачи). */
const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
  "image/bmp": "bmp",
  "image/avif": "avif",
  "audio/webm": "webm",
  "video/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/aac": "aac",
  "audio/opus": "opus",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/x-matroska": "mkv",
  "video/avi": "avi",
  "application/pdf": "pdf",
  "application/zip": "zip",
  "application/x-zip-compressed": "zip",
  "application/x-7z-compressed": "7z",
  "application/x-rar-compressed": "rar",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "text/plain": "txt",
  "text/csv": "csv",
  "application/json": "json",
  "application/octet-stream": "bin",
};

/** Безопасное расширение: только [a-z0-9], до 8 символов. */
function safeExtension(name: string | null, mime: string | null): string {
  const byMime = mime ? EXT_BY_MIME[mime.split(";")[0].trim().toLowerCase()] : undefined;
  if (byMime) return byMime;
  const fromName = (name ?? "").split(".").pop()?.toLowerCase() ?? "";
  if (/^[a-z0-9]{1,8}$/.test(fromName)) return fromName;
  return "bin";
}

function uploadsDir() {
  return path.join(process.cwd(), "data", "uploads");
}

export async function POST(req: NextRequest) {
  const started = Date.now();
  let me;
  try {
    me = await getSessionUser();
  } catch (err) {
    log.error("Не удалось проверить сессию", { err });
    return NextResponse.json({ error: "База данных ещё подключается, попробуйте позже" }, { status: 503 });
  }
  if (!me) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  try {
    const contentType = req.headers.get("content-type") ?? "";

    // ── Основной путь: сырой поток байтов (name/type в query) ──
    // Так 500-мегабайтные файлы не приходится держать в памяти целиком
    // (formData + arrayBuffer сделали бы две полные копии в RAM).
    if (!contentType.includes("multipart/form-data")) {
      const url = new URL(req.url);
      const name = url.searchParams.get("name");
      const mime = url.searchParams.get("type");
      const declaredSize = Number(url.searchParams.get("size") ?? "0");

      if (declaredSize > MAX_UPLOAD_BYTES) {
        return NextResponse.json({ error: "Файл больше 500 МБ" }, { status: 400 });
      }
      if (!req.body) {
        return NextResponse.json({ error: "Файл не найден" }, { status: 400 });
      }

      const ext = safeExtension(name, mime);
      const fileName = `${randomUUID()}.${ext}`;
      await mkdir(uploadsDir(), { recursive: true });
      const filePath = path.join(uploadsDir(), fileName);

      let written = 0;
      const source = Readable.fromWeb(req.body as Parameters<typeof Readable.fromWeb>[0]);
      source.on("data", (chunk: Buffer) => {
        written += chunk.length;
        // защита от «заявили меньше, прислали больше»
        if (written > MAX_UPLOAD_BYTES) source.destroy(new Error("too_large"));
      });
      try {
        await pipeline(source, createWriteStream(filePath));
      } catch (err) {
        const tooLarge = err instanceof Error && err.message === "too_large";
        return NextResponse.json(
          { error: tooLarge ? "Файл больше 500 МБ" : "Не удалось загрузить файл" },
          { status: tooLarge ? 400 : 500 },
        );
      }

      log.info("Файл загружен (stream)", {
        userId: me.id,
        name: fileName,
        size: String(written),
        ms: String(Date.now() - started),
      });
      return NextResponse.json({ url: `/api/files/${fileName}`, size: written });
    }

    // ── Совместимость: multipart/form-data (старые вызовы, маленькие файлы) ──
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Файл не найден" }, { status: 400 });
    if (file.size > MAX_UPLOAD_BYTES)
      return NextResponse.json({ error: "Файл больше 500 МБ" }, { status: 400 });

    const ext = safeExtension(file.name, file.type);
    const fileName = `${randomUUID()}.${ext}`;
    await mkdir(uploadsDir(), { recursive: true });
    const buffer = Buffer.from(await file.arrayBuffer());
    const { writeFile } = await import("fs/promises");
    await writeFile(path.join(uploadsDir(), fileName), buffer);

    log.info("Файл загружен (form)", {
      userId: me.id,
      name: fileName,
      size: String(file.size),
      ms: String(Date.now() - started),
    });
    return NextResponse.json({ url: `/api/files/${fileName}`, size: file.size });
  } catch (err) {
    log.error("Ошибка загрузки файла", { err });
    return NextResponse.json({ error: "Не удалось загрузить файл" }, { status: 500 });
  }
}
