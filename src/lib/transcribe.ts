"use client";

/**
 * Распознавание голосовых сообщений в текст — функция Pulse Premium.
 *
 * Работает полностью в браузере: модель Vosk (WASM) скачивается один раз
 * (~45 МБ) и кэшируется браузером, аудио никуда не отправляется.
 */

/**
 * Небольшая русская модель Vosk.
 * ПРИОРИТЕТ 1 — та же модель, но разложенная на НАШЕМ сервере
 * (public/stt/vosk-model-small-ru-0.22.zip → /stt/…). Со своего домена
 * она грузится без CORS-проблем и не зависит от чужих хостов.
 * Внешний адрес — только запасной, если на сервере файла пока нет.
 */
const MODEL_URL_LOCAL = "/stt/vosk-model-small-ru-0.22.zip";
const MODEL_URL_FALLBACK = "https://alphacephei.com/vosk/models/vosk-model-small-ru-0.22.zip";
/** Кэш моделей и распознавателей между вызовами. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let modelPromise: Promise<any> | null = null;

const LS_CACHE = "pulse_stt_v1";

/** Прочитать кэш расшифровок из localStorage. */
export function getCachedTranscript(messageId: string): string | null {
  try {
    const all = JSON.parse(localStorage.getItem(LS_CACHE) ?? "{}") as Record<string, string>;
    return typeof all[messageId] === "string" ? all[messageId] : null;
  } catch {
    return null;
  }
}

/** Сохранить расшифровку в кэш (до 200 последних). */
export function setCachedTranscript(messageId: string, text: string) {
  try {
    const all = JSON.parse(localStorage.getItem(LS_CACHE) ?? "{}") as Record<string, string>;
    all[messageId] = text;
    const keys = Object.keys(all);
    if (keys.length > 200) delete all[keys[0]];
    localStorage.setItem(LS_CACHE, JSON.stringify(all));
  } catch {
    /* приватный режим */
  }
}

/** Модель грузим один раз; повторные вызовы переиспользуют её. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getModel(): Promise<any> {
  if (!modelPromise) {
    modelPromise = (async () => {
      const vosk = await import("vosk-browser");
      // Сначала пробуем модель со СВОЕГО сервера; если её там нет — запасной хост
      console.info("[pulse-stt] загрузка модели…");
      try {
        const head = await fetch(MODEL_URL_LOCAL, { method: "HEAD" });
        if (head.ok) {
          console.info("[pulse-stt] беру модель со своего сервера:", MODEL_URL_LOCAL);
          return await vosk.createModel(MODEL_URL_LOCAL);
        }
        console.warn("[pulse-stt] на сервере модели нет (код", head.status, ")");
      } catch (e) {
        console.warn("[pulse-stt] сервер модели недоступен:", e);
      }
      console.info("[pulse-stt] пробую запасной хост:", MODEL_URL_FALLBACK);
      return await vosk.createModel(MODEL_URL_FALLBACK);
    })();
    modelPromise.catch(() => {
      modelPromise = null; // при ошибке пробуем заново в следующий раз
    });
  }
  return modelPromise;
}

/** Декодировать аудиофайл (webm/ogg/m4a…) в моно-буфер 16 кГц. */
async function decodeTo16k(url: string): Promise<AudioBuffer> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error("Не удалось скачать аудио для расшифровки");
  const arr = await resp.arrayBuffer();
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  const decoded = await ctx.decodeAudioData(arr);
  void ctx.close().catch(() => {});
  if (decoded.sampleRate === 16000 && decoded.numberOfChannels === 1) return decoded;
  // Догоняем до 16 кГц моно через OfflineAudioContext
  const length = Math.max(1, Math.ceil(decoded.duration * 16000));
  const offline = new OfflineAudioContext(1, length, 16000);
  const src = offline.createBufferSource();
  src.buffer = decoded;
  src.connect(offline.destination);
  src.start();
  return offline.startRendering();
}

/**
 * Расшифровать голосовое сообщение в текст.
 * Возвращает строку (может быть пустой, если речь не распознана).
 */
export async function transcribeAudio(url: string): Promise<string> {
  console.info("[pulse-stt] расшифровка через Vosk:", url);
  const model = await getModel();
  console.info("[pulse-stt] модель готова, декодирую аудио…");
  const buffer = await decodeTo16k(url);
  console.info("[pulse-stt] аудио:", buffer.duration.toFixed(1), "с @", buffer.sampleRate, "Гц");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognizer = new model.KaldiRecognizer(16000);
  const parts: string[] = [];

  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (!settled) {
        settled = true;
        resolve();
      }
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognizer.on("result", (msg: any) => {
      const t = msg?.result?.text?.trim();
      if (t) parts.push(t);
    });
    try {
      recognizer.acceptWaveform(buffer);
    } catch {
      /* формат не подошёл */
    }
    // Даём воркеру обработать дорожку, затем запрашиваем финальный результат
    const processMs = Math.min(8000, 400 + Math.round(buffer.duration * 250));
    setTimeout(() => {
      try {
        recognizer.retrieveFinalResult();
      } catch {
        /* уже удалён */
      }
      setTimeout(finish, 1200);
    }, processMs);
    // страховка от зависания
    setTimeout(finish, processMs + 15000);
  });

  try {
    recognizer.remove();
  } catch {
    /* не важно */
  }
  const out = parts.join(" ").replace(/\s+/g, " ").trim();
  console.info(out ? `[pulse-stt] готово: «${out}»` : "[pulse-stt] речь не распознана (пустой результат)");
  return out;
}
