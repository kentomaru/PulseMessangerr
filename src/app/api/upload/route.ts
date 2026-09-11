import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

const ALLOWED: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

export async function POST(req: NextRequest) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File))
    return NextResponse.json({ error: "Файл не найден" }, { status: 400 });

  const ext = ALLOWED[file.type];
  if (!ext)
    return NextResponse.json(
      { error: "Поддерживаются только изображения (PNG, JPG, WebP, GIF)" },
      { status: 400 },
    );
  if (file.size > 10 * 1024 * 1024)
    return NextResponse.json({ error: "Файл больше 10 МБ" }, { status: 400 });

  const name = `${randomUUID()}.${ext}`;
  const dir = path.join(process.cwd(), "data", "uploads");
  await mkdir(dir, { recursive: true });
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(dir, name), buffer);

  return NextResponse.json({ url: `/api/files/${name}` });
}
