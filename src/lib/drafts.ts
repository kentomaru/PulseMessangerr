/**
 * Единое хранилище текстовых черновиков.
 * Пишем и в localStorage, и в память сессии: если браузер заблокировал
 * хранилище (приватный режим, сторонний iframe), черновики всё равно
 * живут в рамках сессии. Чтение: сначала хранилище, потом память.
 */
const TEXT_DRAFTS_KEY = "pulse_text_drafts_v1";
const textDraftMemory = new Map<string, string>();

function readStore(): Record<string, string> {
  try {
    const raw = localStorage.getItem(TEXT_DRAFTS_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : {};
    return parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

/** Все черновики (хранилище + память) — для списка чатов. */
export function getAllDraftTexts(): Record<string, string> {
  const merged: Record<string, string> = { ...readStore() };
  for (const [k, v] of textDraftMemory) merged[k] = v;
  return merged;
}

export function getDraftText(key: string): string {
  const fromStore = readStore()[key];
  if (typeof fromStore === "string") return fromStore;
  return textDraftMemory.get(key) ?? "";
}

export function setDraftText(key: string, text: string): void {
  if (text.trim()) textDraftMemory.set(key, text);
  else textDraftMemory.delete(key);
  try {
    const all = readStore();
    if (text.trim()) all[key] = text;
    else delete all[key];
    localStorage.setItem(TEXT_DRAFTS_KEY, JSON.stringify(all));
  } catch {
    /* остаёмся на памяти */
  }
}

/** Есть ли непустые черновики с ключами вида «<chatId>#c-<postId>» (комментарии)? */
export function getCommentDrafts(): Record<string, string> {
  const all = getAllDraftTexts();
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(all)) {
    if (k.includes("#c-")) out[k] = v;
  }
  return out;
}
