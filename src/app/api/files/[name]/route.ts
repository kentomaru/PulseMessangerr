import { NextRequest, NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";
import { createReadStream, statSync } from "fs";
import path from "path";
import { Readable } from "stream";

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
  ico: "image/x-icon",
  webm: "video/webm",
  mp4: "video/mp4",
  m4v: "video/mp4",
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
  try {
    size = statSync(filePath).size;
  } catch {
    log.debug("Файл не найден", { name });
    return NextResponse.json({ error: "Не найден" }, { status: 404 });
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

  const stream = createReadStream(filePath);
  return new NextResponse(Readable.toWeb(stream) as unknown as ReadableStream, {
    status: 200,
    headers: { ...baseHeaders, "Content-Length": String(size) },
  });
}
