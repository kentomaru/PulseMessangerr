import type { AttachmentInfo, CallLogInfo } from "@/lib/types";

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
  if (mime.startsWith("video/")) return "video_note";
  if (mime.startsWith("audio/")) return "voice";
  return null;
}

/** Короткая строка-превью сообщения (сайдбар, цитаты, пересылка). */
export function messagePreview(type: string, content: string): string {
  if (type === "call") {
    const info = parseCallContent(content);
    return info ? `📞 ${callLogLabel(info)}` : "📞 Звонок";
  }
  const att = parseAttachment(type, content);
  if (att) {
    const caption = att.caption ? ` ${att.caption.replace(/\n/g, " ").slice(0, 40)}` : "";
    if (type === "image") return `🖼 Фото${caption}`;
    if (type === "voice" || legacyAttachmentKind(att) === "voice")
      return `🎤 Голосовое${att.duration ? ` · ${formatDuration(Math.round(att.duration))}` : ""}`;
    if (type === "video_note" || legacyAttachmentKind(att) === "video_note")
      return `🎬 Видеосообщение${att.duration ? ` · ${formatDuration(Math.round(att.duration))}` : ""}`;
    if (type === "file") return `📎 ${att.name ?? "Файл"}${caption}`;
  }
  return content.replace(/\n/g, " ").slice(0, 80);
}

/** «2,4 МБ» / «500 МБ» — размер файла для карточек. */
export function formatBytes(bytes: number | undefined): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} КБ`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} МБ`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2).replace(".", ",")} ГБ`;
}
