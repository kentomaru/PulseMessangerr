import { NextRequest, NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";
import { readFile } from "fs/promises";
import path from "path";

const log = createLogger("api:files");

const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ name: string }> },
) {
  const { name } = await ctx.params;
  if (!/^[a-zA-Z0-9-]+\.(png|jpg|jpeg|webp|gif)$/.test(name)) {
    log.debug("Запрос файла отклонён (недопустимое имя)", { name });
    return NextResponse.json({ error: "Недопустимое имя" }, { status: 400 });
  }

  const ext = name.split(".").pop()!.toLowerCase();
  try {
    const filePath = path.join(process.cwd(), "data", "uploads", name);
    const data = await readFile(filePath);
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": MIME[ext] ?? "application/octet-stream",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    log.debug("Файл не найден", { name });
    return NextResponse.json({ error: "Не найден" }, { status: 404 });
  }
}
