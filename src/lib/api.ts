export async function api<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...options,
      headers:
        options.body instanceof FormData
          ? options.headers
          : { "Content-Type": "application/json", ...(options.headers ?? {}) },
      credentials: "include",
    });
  } catch {
    throw new ApiError("Нет соединения с сервером", 0);
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

/** Как uploadFile, но с прогрессом («как в TG»): XHR даёт upload.onprogress. */
export function uploadFileWithProgress(
  file: File,
  onProgress: (loaded: number, total: number) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const params = new URLSearchParams({
      name: file.name || "file",
      type: file.type || "application/octet-stream",
      size: String(file.size),
    });
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/upload?${params.toString()}`);
    xhr.withCredentials = true;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded, e.total);
    };
    xhr.onload = () => {
      try {
        const d = JSON.parse(xhr.responseText) as { url?: string; error?: string };
        if (xhr.status >= 200 && xhr.status < 300 && d.url) resolve(d.url);
        else reject(new ApiError(d.error ?? "Не удалось загрузить файл", xhr.status));
      } catch {
        reject(new ApiError("Не удалось загрузить файл", xhr.status));
      }
    };
    xhr.onerror = () => reject(new ApiError("Не удалось загрузить файл — проверьте интернет", 0));
    xhr.send(file);
  });
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
  const res = await fetch(`/api/upload?${params.toString()}`, {
    method: "POST",
    body: file,
    credentials: "include",
  });
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
