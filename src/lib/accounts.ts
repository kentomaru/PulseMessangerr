/**
 * Мультиаккаунт как в ТГ: в приложении можно держать до 5 аккаунтов
 * и переключаться между ними без ввода пароля. Токены сессий хранятся
 * локально в браузере (как это делают веб-версии мессенджеров).
 */
export const MAX_ACCOUNTS = 5;

export type SavedAccount = {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  token: string;
  addedAt: number;
};

const KEY = "pulse_accounts_v1";

function read(): SavedAccount[] {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? (JSON.parse(raw) as SavedAccount[]) : [];
    return Array.isArray(arr) ? arr.filter((a) => a && a.token && a.userId) : [];
  } catch {
    return [];
  }
}

function write(list: SavedAccount[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX_ACCOUNTS)));
  } catch {
    /* приватный режим и т. п. */
  }
}

export function getAccounts(): SavedAccount[] {
  return read();
}

/** Добавить/обновить аккаунт. Возвращает false, если достигнут лимит. */
export function saveAccount(acc: Omit<SavedAccount, "addedAt">): boolean {
  const list = read();
  const i = list.findIndex((a) => a.userId === acc.userId);
  if (i === -1) {
    if (list.length >= MAX_ACCOUNTS) return false;
    list.push({ ...acc, addedAt: Date.now() });
  } else {
    list[i] = { ...list[i], ...acc };
  }
  write(list);
  return true;
}

export function removeAccount(userId: string) {
  write(read().filter((a) => a.userId !== userId));
}
