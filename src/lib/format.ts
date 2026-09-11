import type { CallLogInfo } from "@/lib/types";

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
