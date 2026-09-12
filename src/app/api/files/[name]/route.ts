import { NextRequest, NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";
import { createReadStream, statSync, writeFileSync, mkdirSync } from "fs";
import path from "path";
import { Readable } from "stream";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { files } from "@/db/schema";

const log = createLogger("api:files");

const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  avif: "image/avif",
  heic: "image/heic",
  heif: "image/heif",
  tiff: "image/tiff",
  tif: "image/tiff",
  jxl: "image/jxl",
  ico: "image/x-icon",
  webm: "video/webm",
  mp4: "video/mp4",
  m4v: "video/mp4",
  "3gp": "video/3gpp",
  "3g2": "video/3gpp2",
  mov: "video/quicktime",
  mkv: "video/x-matroska",
  avi: "video/x-msvideo",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  ogg: "audio/ogg",
  opus: "audio/ogg",
  wav: "audio/wav",
  flac: "audio/flac",
  pdf: "application/pdf",
  txt: "text/plain",
  csv: "text/csv",
  json: "application/json",
  md: "text/plain",
  zip: "application/zip",
  "7z": "application/x-7z-compressed",
  rar: "application/vnd.rar",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  apk: "application/vnd.android.package-archive",
  bin: "application/octet-stream",
};

/**
 * Достаёт файл из таблицы files (копия на диске может отсутствовать после
 * редеплоя — ФС контейнера эфемерная). Возвращает байты или null.
 * Заодно пытается прогреть дисковый кэш, чтобы дальше отдавать потоком.
 *
 * Почему это важно: после каждого редеплоя папка data/uploads пустела, и ВСЕ
 * загруженные картинки — истории, баннеры, аватары — «переставали грузиться».
 */
async function restoreFromDb(name: string, filePath: string): Promise<Buffer | null> {
  try {
    const rows = await db.select().from(files).where(eq(files.name, name)).limit(1);
    const row = rows[0];
    if (!row || !row.data || row.data.length === 0) return null;
    const data = row.data as Buffer;
    try {
      mkdirSync(path.dirname(filePath), { recursive: true });
      writeFileSync(filePath, data); // прогреваем дисковый кэш
    } catch (err) {
      log.warn("Не удалось записать восстановленный файл на диск", {
        name,
        err: err instanceof Error ? err.message : String(err),
      });
    }
    return data;
  } catch (err) {
    log.warn("Не удалось восстановить файл из БД", {
      name,
      err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * GET /api/files/[name] — отдача загруженных файлов.
 *
 *  — поддерживает HTTP Range: без него <audio>/<video> не перематываются,
 *    а некоторые браузеры вообще не играют webm;
 *  — картинки/аудио/видео отдаются inline, остальное — как скачивание
 *    (вместе с nosniff это закрывает хранение HTML/SVG-«вредителей»).
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ name: string }> },
) {
  const { name } = await ctx.params;
  if (!/^[a-zA-Z0-9-]+\.[a-z0-9]{1,8}$/i.test(name)) {
    log.debug("Запрос файла отклонён (недопустимое имя)", { name });
    return NextResponse.json({ error: "Недопустимое имя" }, { status: 400 });
  }

  const ext = name.split(".").pop()!.toLowerCase();
  const mime = MIME[ext] ?? "application/octet-stream";
  const isInline = /^(image|audio|video)\//.test(mime);
  const disposition = isInline ? "inline" : "attachment";

  const filePath = path.join(process.cwd(), "data", "uploads", name);
  let size: number;
  let onDisk = true;
  let dbData: Buffer | null = null;
  try {
    size = statSync(filePath).size;
  } catch {
    // На диске нет — так бывает после редеплоя/рестарта (эфемерная ФС
    // контейнера). Пробуем восстановить копию из базы: пока файл ≤25 МБ
    // загружался, он продублирован в таблицу files.
    const restored = await restoreFromDb(name, filePath);
    if (!restored) {
      log.debug("Файл не найден", { name });
      return NextResponse.json({ error: "Не найден" }, { status: 404 });
    }
    log.info("Файл восстановлен из БД", { name, size: String(restored.length) });
    dbData = restored;
    size = restored.length;
    // Если прогреть дисковый кэш не удалось — отдадим прямо из памяти.
    onDisk = (() => {
      try {
        return statSync(filePath).size === size;
      } catch {
        return false;
      }
    })();
  }

  const baseHeaders: Record<string, string> = {
    "Content-Type": mime,
    "Content-Disposition": `${disposition}; filename="${name}"`,
    "Cache-Control": "public, max-age=31536000, immutable",
    "Accept-Ranges": "bytes",
    "X-Content-Type-Options": "nosniff",
  };

  // ── Range-запрос (перемотка аудио/видео) ──
  const range = req.headers.get("range");
  if (range) {
    const m = range.match(/^bytes=(\d*)-(\d*)$/);
    if (m) {
      let start = m[1] ? parseInt(m[1], 10) : 0;
      let end = m[2] ? parseInt(m[2], 10) : size - 1;
      if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= size) {
        return new NextResponse(null, {
          status: 416,
          headers: { "Content-Range": `bytes */${size}` },
        });
      }
      end = Math.min(end, size - 1);
      if (!onDisk && dbData) {
        return new NextResponse(new Uint8Array(dbData.subarray(start, end + 1)), {
          status: 206,
          headers: {
            ...baseHeaders,
            "Content-Range": `bytes ${start}-${end}/${size}`,
            "Content-Length": String(end - start + 1),
          },
        });
      }
      const stream = createReadStream(filePath, { start, end });
      return new NextResponse(Readable.toWeb(stream) as unknown as ReadableStream, {
        status: 206,
        headers: {
          ...baseHeaders,
          "Content-Range": `bytes ${start}-${end}/${size}`,
          "Content-Length": String(end - start + 1),
        },
      });
    }
  }

  if (!onDisk && dbData) {
    return new NextResponse(new Uint8Array(dbData), {
      status: 200,
      headers: { ...baseHeaders, "Content-Length": String(size) },
    });
  }

  const stream = createReadStream(filePath);
  return new NextResponse(Readable.toWeb(stream) as unknown as ReadableStream, {
    status: 200,
    headers: { ...baseHeaders, "Content-Length": String(size) },
  });
}
