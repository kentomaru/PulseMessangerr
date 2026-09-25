/**
 * Псевдонимы контактов: «свои» имена для собеседников, видны только вам.
 * Хранятся локально (как в ТГ — имя контакта переопределяется для себя).
 */
const KEY = "pulse_nicknames_v1";

export function getNicknames(): Record<string, string> {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "{}") as unknown;
    return v && typeof v === "object" ? (v as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export function getNickname(userId: string | null | undefined): string | null {
  if (!userId) return null;
  return getNicknames()[userId] ?? null;
}

export function setNickname(userId: string, name: string): void {
  const all = getNicknames();
  if (name.trim()) all[userId] = name.trim().slice(0, 48);
  else delete all[userId];
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event("pulse-nicknames"));
}

/** Подписка на изменение псевдонимов (для живого обновления). */
export function onNicknames(cb: () => void): () => void {
  window.addEventListener("pulse-nicknames", cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener("pulse-nicknames", cb);
    window.removeEventListener("storage", cb);
  };
}
