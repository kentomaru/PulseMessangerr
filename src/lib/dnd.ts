/**
 * «Не беспокоить»: ручной режим (до времени) + расписание по часам
 * и текст автоответа для личных сообщений. Всё хранится локально.
 */
const SCHEDULE_KEY = "pulse_dnd_schedule_v1";
const AUTOREPLY_KEY = "pulse_auto_reply_v1";

export type DndSchedule = { on: boolean; from: string; to: string };

export function getDndSchedule(): DndSchedule {
  try {
    const v = JSON.parse(localStorage.getItem(SCHEDULE_KEY) ?? "") as Partial<DndSchedule>;
    if (v && typeof v === "object") {
      return { on: !!v.on, from: v.from ?? "23:00", to: v.to ?? "08:00" };
    }
  } catch {
    /* ignore */
  }
  return { on: false, from: "23:00", to: "08:00" };
}

export function setDndSchedule(s: DndSchedule): void {
  try {
    localStorage.setItem(SCHEDULE_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event("pulse-dnd"));
}

/** Сейчас действует «не беспокоить» по расписанию? (учитывает переход через полночь) */
export function isDndScheduleActive(now = new Date()): boolean {
  const s = getDndSchedule();
  if (!s.on) return false;
  const parse = (t: string) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(t);
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  };
  const from = parse(s.from);
  const to = parse(s.to);
  if (from === null || to === null) return false;
  const cur = now.getHours() * 60 + now.getMinutes();
  return from <= to ? cur >= from && cur < to : cur >= from || cur < to;
}

/** Ручной режим «не беспокоить до…» хранится в настройках кастомизации. */
export function getManualDndUntil(): number {
  try {
    const c = JSON.parse(localStorage.getItem("pulse_custom_v1") ?? "{}") as { dndUntil?: number };
    return typeof c.dndUntil === "number" ? c.dndUntil : 0;
  } catch {
    return 0;
  }
}

/** Любой режим «не беспокоить» активен прямо сейчас? */
export function isDndActiveNow(): boolean {
  return Date.now() < getManualDndUntil() || isDndScheduleActive();
}

/** Текст автоответа (пустой — автоответ выключен). */
export function getAutoReply(): string {
  try {
    return localStorage.getItem(AUTOREPLY_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setAutoReply(text: string): void {
  try {
    if (text.trim()) localStorage.setItem(AUTOREPLY_KEY, text.trim().slice(0, 200));
    else localStorage.removeItem(AUTOREPLY_KEY);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event("pulse-dnd"));
}

export type Reminder = { messageId: string; conversationId: string; at: number; text: string };

export function getReminders(): Reminder[] {
  try {
    const v = JSON.parse(localStorage.getItem("pulse_reminders_v1") ?? "[]") as unknown;
    return Array.isArray(v) ? (v as Reminder[]) : [];
  } catch {
    return [];
  }
}

export function saveReminders(list: Reminder[]): void {
  try {
    localStorage.setItem("pulse_reminders_v1", JSON.stringify(list));
  } catch {
    /* ignore */
  }
}
