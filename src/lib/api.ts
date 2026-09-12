export async function api<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  // Идемпотентность отправки сообщений: прокси/браузер могут повторить POST
  // по таймауту — тогда в чате появлялся ДУБЛЬ последнего сообщения. Шлём
  // случайный ключ, сервер по нему возвращает уже созданное сообщение.
  let body = options.body;
  if (
    options.method === "POST" &&
    path.split("?")[0] === "/api/messages" &&
    typeof body === "string" &&
    typeof crypto !== "undefined" &&
    crypto.randomUUID
  ) {
    try {
      const parsed = JSON.parse(body) as Record<string, unknown>;
      if (!parsed.clientKey) {
        parsed.clientKey = crypto.randomUUID();
        body = JSON.stringify(parsed);
      }
    } catch {
      /* тело не JSON — не трогаем */
    }
  }
  let res: Response;
  // ЖЁСТКИЙ ТАЙМАУТ: раньше зависший запрос (прокси «задумался») вечно
  // висел в await и навсегда блокировал синхронизацию звонка — соединения
  // между участниками не создавались вообще («Участников: 2, Соединений: 0»).
  const isUpload = path.split("?")[0] === "/api/upload";
  const ctrl = isUpload ? null : new AbortController();
  const timer = ctrl ? setTimeout(() => ctrl.abort(), 8_000) : null;
  try {
    res = await fetch(path, {
      ...options,
      body,
      signal: ctrl ? ctrl.signal : options.signal,
      headers:
        options.body instanceof FormData
          ? options.headers
          : { "Content-Type": "application/json", ...(options.headers ?? {}) },
      credentials: "include",
    });
  } catch {
    throw new ApiError("Нет соединения с сервером", 0);
  } finally {
    if (timer) clearTimeout(timer);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(
      (data as { error?: string }).error ?? "Ошибка запроса",
      res.status,
      data as Record<string, unknown>,
    );
  }
  return data as T;
}

export class ApiError extends Error {
  status: number;
  /** Тело ответа целиком — например, при 409 сервер кладёт сюда { call }. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(message: string, status: number, payload?: any) {
    super(message);
    this.status = status;
    this.payload = payload;
  }
}

export async function uploadFile(file: File): Promise<string> {
  // Сырое тело вместо FormData: сервер пишет файл на диск потоком,
  // поэтому даже 500 МБ не разворачиваются в памяти целиком.
  const params = new URLSearchParams({
    name: file.name || "file",
    type: file.type || "application/octet-stream",
    size: String(file.size),
  });
  let res: Response;
  try {
    res = await fetch(`/api/upload?${params.toString()}`, {
      method: "POST",
      body: file,
      credentials: "include",
    });
  } catch {
    // Сеть оборвалась / прокси отрезал тело запроса. Раньше здесь вылетало
    // безликое «Failed to fetch» — объясняем, что делать.
    throw new ApiError(
      file.size > 5 * 1024 * 1024
        ? "Файл не дошёл до сервера. Такое бывает с большими файлами при слабой сети или ограничении прокси — попробуйте файл поменьше или другую сеть"
        : "Не удалось загрузить файл — проверьте интернет-соединение и попробуйте ещё раз",
      0,
    );
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error ?? "Не удалось загрузить файл", res.status);
  return data.url as string;
}

/**
 * Копирование в буфер с фолбэком: navigator.clipboard доступен только в
 * защищённом контексте (https/localhost). Раньше ссылка на звонок «не копировалась»
 * именно потому, что после получения url его никто не записывал в буфер.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}
