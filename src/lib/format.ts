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

export function lastSeenLabel(iso: string, online: boolean) {
  if (online) return "в сети";
  const d = new Date(iso);
  const diffMin = Math.floor((Date.now() - d.getTime()) / 60000);
  if (diffMin < 1) return "только что";
  if (diffMin < 60) return `была(я) ${diffMin} мин. назад`;
  const today = new Date();
  if (d.toDateString() === today.toDateString())
    return `был(а) сегодня в ${timeHHmm(d)}`;
  const yesterday = new Date(Date.now() - 86400000);
  if (d.toDateString() === yesterday.toDateString())
    return `был(а) вчера в ${timeHHmm(d)}`;
  return `был(а) ${d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}`;
}
