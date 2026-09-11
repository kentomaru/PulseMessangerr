import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/db";
import { uploads } from "@/db/schema";
import { createLogger } from "@/lib/logger";
import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

const log = createLogger("api:upload");
const MAX_FILE_SIZE = 500 * 1024 * 1024;

function extensionFor(file: File): string {
  const original = file.name.split(/[\\/]/).pop() ?? "file";
  const ext = original.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") ?? "";
  if (ext && ext.length <= 16) return ext;
  const mimeExt = file.type.split("/")[1]?.replace(/[^a-z0-9]/g, "");
  return mimeExt && mimeExt.length <= 16 ? mimeExt : "bin";
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
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File))
      return NextResponse.json({ error: "Файл не найден" }, { status: 400 });
    if (file.size > MAX_FILE_SIZE)
      return NextResponse.json({ error: "Файл больше 500 МБ" }, { status: 413 });

    const ext = extensionFor(file);
    const name = `${randomUUID()}.${ext}`;
    const mimeType = file.type || "application/octet-stream";
    const buffer = Buffer.from(await file.arrayBuffer());

    try {
      await db.insert(uploads).values({ name, ownerId: me.id, mimeType, data: buffer });
    } catch (err) {
      // Локальный fallback полезен для разработки без PostgreSQL. На Railway
      // основное хранилище — PostgreSQL, иначе файл пропадёт после деплоя.
      log.warn("Не удалось сохранить файл в PostgreSQL, используем локальный fallback", {
        err: err instanceof Error ? err.message : String(err),
      });
      const dir = path.join(process.cwd(), "data", "uploads");
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, name), buffer);
    }

    log.info("Файл загружен", {
      userId: me.id,
      name,
      mimeType,
      size: String(file.size),
      ms: String(Date.now() - started),
    });
    return NextResponse.json({ url: `/api/files/${name}` });
  } catch (err) {
    log.error("Ошибка загрузки файла", { err });
    return NextResponse.json({ error: "Не удалось загрузить файл" }, { status: 500 });
  }
}
