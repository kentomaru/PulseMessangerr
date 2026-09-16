/**
 * Отложенные сообщения: единое хранилище в localStorage, чтобы отправка
 * срабатывала независимо от открытого чата (обрабатывает MessengerApp).
 */
export type ScheduledMsg = {
  id: string;
  conversationId: string;
  text: string;
  /** Когда отправить (мс с эпохи). */
  at: number;
  /** Ответ/комментарий к посту, если был. */
  replyToId?: string | null;
};

const KEY = "pulse_scheduled_v1";

export function readScheduled(): ScheduledMsg[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]") as ScheduledMsg[];
    return Array.isArray(raw) ? raw.filter((x) => x && x.id && x.conversationId && x.at) : [];
  } catch {
    return [];
  }
}

export function writeScheduled(list: ScheduledMsg[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* приватный режим */
  }
}

export function addScheduled(msg: ScheduledMsg) {
  writeScheduled([...readScheduled(), msg]);
}

export function removeScheduled(id: string) {
  writeScheduled(readScheduled().filter((x) => x.id !== id));
}
