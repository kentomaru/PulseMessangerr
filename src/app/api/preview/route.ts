import { NextResponse } from "next/server";
import { withApi } from "@/lib/api-helpers";

/**
 * GET /api/preview?url=... — сервер достаёт og-теги страницы (как в ТГ:
 * заголовок, описание, картинка). Браузер сам не может из-за CORS.
 */
export const GET = withApi("preview", async ({ req }) => {
  const url = new URL(req.url).searchParams.get("url") ?? "";
  if (!/^https?:\/\//i.test(url)) {
    return NextResponse.json({ error: "Некорректная ссылка" }, { status: 400 });
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  let html = "";
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "user-agent": "Mozilla/5.0 (compatible; PulseBot/1.0; +link-preview)" },
    });
    const ct = res.headers.get("content-type") ?? "";
    if (res.ok && ct.includes("text/html")) {
      // Читаем не больше 300 КБ — ог-теги всегда в начале
      const buf = new Uint8Array(await res.arrayBuffer());
      html = new TextDecoder("utf-8", { fatal: false }).decode(buf.slice(0, 300_000));
    }
  } catch {
    /* таймаут/недоступно — просто без превью */
  } finally {
    clearTimeout(timer);
  }

  const pick = (attr: string, name: string): string => {
    const re = new RegExp(`<meta[^>]+${attr}=["']${name}["'][^>]+content=["']([^"']*)["']`, "i");
    const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+${attr}=["']${name}["']`, "i");
    return (html.match(re)?.[1] ?? html.match(re2)?.[1] ?? "").trim();
  };
  const host = (() => {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  })();
  const title =
    pick("property", "og:title") ||
    html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ||
    host;
  const description = pick("property", "og:description") || pick("name", "description");
  let image = pick("property", "og:image");
  if (image && !/^https?:\/\//i.test(image)) {
    try {
      image = new URL(image, url).toString();
    } catch {
      image = "";
    }
  }
  if (!title && !image) return NextResponse.json({ error: "Нет данных" }, { status: 404 });
  return NextResponse.json({
    preview: {
      url,
      title: title.slice(0, 160),
      description: description.slice(0, 240),
      image: image || null,
      site: host,
    },
  });
});
