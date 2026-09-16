import type { AttachmentInfo, CallLogInfo } from "@/lib/types";
import { gifpackId, findGif } from "./premiumContent";

export function timeHHmm(iso: string | Date) {
  const d = new Date(iso);
  return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

export function dayLabel(iso: string | Date) {
  const d = new Date(iso);
  const now = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOf(now) - startOf(d)) / 86400000);
  if (diff === 0) return "Сегодня";
  if (diff === 1) return "Вчера";
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}

export function sameDay(a: string | Date, b: string | Date) {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

export function formatDuration(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** «5 мин», «3 ч», «Вчера» — для историй и коротких подписей. */
export function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "только что";
  if (min < 60) return `${min} мин`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours} ч`;
  return dayLabel(iso);
}

export function lastSeenLabel(iso: string | null, online: boolean) {
  if (online) return "в сети";
  if (!iso) return "был(а) недавно"; // пользователь скрыл точное время (приватность)
  const d = new Date(iso);
  const diffMin = Math.floor((Date.now() - d.getTime()) / 60000);
  if (diffMin < 1) return "только что";
  if (diffMin < 60) return `была(я) ${diffMin} мин. назад`;
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return `был(а) сегодня в ${timeHHmm(d)}`;
  const yesterday = new Date(Date.now() - 86400000);
  if (d.toDateString() === yesterday.toDateString()) return `был(а) вчера в ${timeHHmm(d)}`;
  return `был(а) ${d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}`;
}

/** Безопасный разбор JSON-лога звонка из сообщения типа «call». */
export function parseCallContent(content: string): CallLogInfo | null {
  try {
    const v = JSON.parse(content) as CallLogInfo;
    if (!v || typeof v.status !== "string" || typeof v.durationSec !== "number") return null;
    return {
      callId: v.callId,
      status: v.status,
      durationSec: v.durationSec,
      callerId: v.callerId,
      media: v.media === "video" ? "video" : "audio",
    };
  } catch {
    return null;
  }
}

/** Человекочитаемая подпись для лога звонка (используется в чате и списке чатов). */
export function callLogLabel(info: CallLogInfo): string {
  switch (info.status) {
    case "ended":
      return info.durationSec > 0 ? `Звонок · ${formatDuration(info.durationSec)}` : "Звонок";
    case "missed":
      return "Пропущенный звонок";
    case "declined":
      return "Звонок отклонён";
    case "cancelled":
      return "Отменённый звонок";
    default:
      return "Звонок";
  }
}

/* ─────────────────── вложения (голосовые, кружки, файлы) ─────────────────── */

/**
 * Разбирает content сообщения во вложение.
 *
 * Форматы в базе:
 *  — image: url строка (старый формат) или JSON {url, caption};
 *  — voice / video_note / file: JSON {url, name, mimeType, size, duration, caption};
 *  — text: обычно текст, НО раньше голосовые/кружки сохранялись как text
 *    с JSON внутри (баг «выдаются текстом») — распознаём и их, чтобы
 *    уже отправленные сообщения снова отображались плеером.
 */
export function parseAttachment(type: string, content: string): AttachmentInfo | null {
  const looksLikeJson = content.trimStart().startsWith("{");
  if (!looksLikeJson) {
    // image в старом формате — просто ссылка
    return type === "image" && content.startsWith("/api/files/") ? { url: content } : null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;
  const url = typeof obj.url === "string" ? obj.url : "";
  if (!url.startsWith("/api/files/")) return null;

  const att: AttachmentInfo = { url };
  if (typeof obj.name === "string") att.name = obj.name;
  if (typeof obj.mimeType === "string") att.mimeType = obj.mimeType;
  if (typeof obj.size === "number" && Number.isFinite(obj.size)) att.size = obj.size;
  if (typeof obj.duration === "number" && Number.isFinite(obj.duration)) att.duration = obj.duration;
  if (typeof obj.caption === "string" && obj.caption.trim()) att.caption = obj.caption;
  if (obj.sticker === true) att.sticker = true;
  if (obj.spoiler === true) att.spoiler = true;

  // «кружок» или голосовое, сохранившееся как text — пропускаем только аудио/видео
  if (type === "text") {
    const mime = (att.mimeType ?? "").toLowerCase();
    if (!mime.startsWith("audio/") && !mime.startsWith("video/")) return null;
  }
  return att;
}

/** Это «испорченное» text-сообщение, внутри которого лежит голосовое/кружок? */
export function legacyAttachmentKind(att: AttachmentInfo | null): "voice" | "video_note" | null {
  if (!att || !att.mimeType) return null;
  const mime = att.mimeType.toLowerCase();
  // Кружок — это записанное видео с длительностью; обычный видео-файл кружком не является
  if (mime.startsWith("video/")) return att.duration ? "video_note" : null;
  if (mime.startsWith("audio/")) return "voice";
  return null;
}

/** Тип превью для иконки (вместо эмодзи — SVG в компоненте PreviewLabel). */
export type PreviewKind = "call" | "image" | "voice" | "video" | "file" | null;

/** Разобрать сообщение на «иконку» и чистый текст превью (без эмодзи). */
export function previewInfo(type: string, content: string): { kind: PreviewKind; text: string } {
  if (type === "call") {
    const info = parseCallContent(content);
    return { kind: "call", text: info ? callLogLabel(info) : "Звонок" };
  }
  // Анимированная гифка (сообщение «gifpack:<id>»)
  const gif = type === "text" ? gifpackId(content) : null;
  if (gif) return { kind: "video", text: `ГИФ${findGif(gif) ? ` · ${findGif(gif)!.title}` : ""}` };
  // Опрос («poll:{...}»): в превью показываем «Опрос» + вопрос, а не сырой JSON
  if (type === "text" && content.startsWith("poll:")) {
    try {
      const p = JSON.parse(content.slice(5)) as { q?: unknown };
      const q = typeof p.q === "string" ? p.q.replace(/\n/g, " ").slice(0, 40) : "";
      return { kind: null, text: q ? `Опрос · ${q}` : "Опрос" };
    } catch {
      return { kind: null, text: "Опрос" };
    }
  }
  const att = parseAttachment(type, content);
  if (att) {
    const caption = att.caption ? ` ${att.caption.replace(/\n/g, " ").slice(0, 40)}` : "";
    if (type === "image") return { kind: "image", text: `Фото${caption}` };
    if (type === "voice" || legacyAttachmentKind(att) === "voice")
      return {
        kind: "voice",
        text: `Голосовое${att.duration ? ` · ${formatDuration(Math.round(att.duration))}` : ""}`,
      };
    if (type === "video_note" || legacyAttachmentKind(att) === "video_note")
      return {
        kind: "video",
        text: `Видеосообщение${att.duration ? ` · ${formatDuration(Math.round(att.duration))}` : ""}`,
      };
    // обычное видео (в т.ч. старое «сломанное» text-сообщение с видео)
    if ((att.mimeType ?? "").toLowerCase().startsWith("video/"))
      return { kind: "video", text: `Видео${caption}` };
    if (type === "file") {
      // Видео-файл — отдельная подпись, как в ТГ
      if ((att.mimeType ?? "").toLowerCase().startsWith("video/"))
        return { kind: "video", text: `Видео${caption}` };
      return { kind: "file", text: `${att.name ?? "Файл"}${caption}` };
    }
  }
  return { kind: null, text: content.replace(/\n/g, " ").slice(0, 80) };
}

/** Короткая строка-превью сообщения (уведомления, title — только текст, без эмодзи). */
export function messagePreview(type: string, content: string): string {
  return previewInfo(type, content).text;
}

/**
 * Текст состоит только из 1–3 эмодзи? Такие сообщения рисуем как «стикеры» —
 * крупно и без пузыря.
 */
export function emojiOnly(text: string): boolean {
  const t = text.trim();
  if (!t || t.length > 32) return false;
  const emojis = t.match(/\p{Extended_Pictographic}/gu);
  if (!emojis || emojis.length < 1 || emojis.length > 3) return false;
  // кроме эмодзи допускаем только вариаторы/модификаторы и пробелы
  const rest = t
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/[\uFE0F\u200D\u20E3\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}]/gu, "")
    .replace(/\s/g, "");
  return rest.length === 0;
}

/** «2,4 МБ» / «500 МБ» — размер файла для карточек. */
export function formatBytes(bytes: number | undefined): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} КБ`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} МБ`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2).replace(".", ",")} ГБ`;
}
