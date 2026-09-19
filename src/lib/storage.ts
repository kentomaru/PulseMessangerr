/**
 * Хранилище файлов: Backblaze B2 (S3-совместимое).
 *
 * Зачем: на Railway файловая система контейнера ЭФЕМЕРНАЯ — после каждого
 * редеплоя папка data/uploads стирается, и все картинки/войсы пропадают.
 * В B2 файлы живут постоянно (10 ГБ бесплатно), доступ отдаётся через
 * короткие подписанные ссылки — сам bucket приватный.
 *
 * Деградация: если переменные B2 не заданы или B2 недоступен — вызывающий
 * код получает `false`/`null` и использует запасной путь (диск + копия в БД),
 * поэтому приложение работает и без настроенного B2.
 */
import type { Readable } from "stream";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createLogger } from "@/lib/logger";

const log = createLogger("storage");

let cached: S3Client | null | undefined;

function client(): S3Client | null {
  if (cached !== undefined) return cached;
  const keyId = process.env.B2_KEY_ID;
  const appKey = process.env.B2_APPLICATION_KEY;
  const bucket = process.env.B2_BUCKET;
  const region = process.env.B2_REGION;
  if (!keyId || !appKey || !bucket || !region) {
    cached = null;
    return null;
  }
  cached = new S3Client({
    region,
    endpoint: `https://s3.${region}.backblazeb2.com`,
    credentials: { accessKeyId: keyId, secretAccessKey: appKey },
  });
  return cached;
}

function bucketName(): string {
  return process.env.B2_BUCKET ?? "";
}

/** Настроено ли внешнее хранилище (есть ли смысл пытаться туда писать). */
export function storageEnabled(): boolean {
  return client() !== null;
}

/**
 * Потоковая загрузка объекта в B2. Тело НЕ буферизуется целиком в памяти,
 * поэтому даже 500 МБ проходят спокойно. Возвращает успех операции.
 */
export async function uploadToStorage(
  key: string,
  body: Readable | Buffer | Uint8Array | string,
  contentType: string,
): Promise<boolean> {
  const c = client();
  if (!c) return false;
  try {
    await new Upload({
      client: c,
      params: {
        Bucket: bucketName(),
        Key: key,
        Body: body,
        ContentType: contentType || "application/octet-stream",
      },
    }).done();
    return true;
  } catch (err) {
    log.warn("Не удалось загрузить файл в B2", {
      key,
      err: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

/**
 * Подписанная ссылка на чтение (1 час). Генерируется ЛОКАЛЬНО (без запроса
 * в сеть), поэтому редирект на неё ничего не стоит серверу. Ответ сразу
 * несёт правильный Content-Type и disposition (inline/attachment).
 */
export function presignedGetUrl(
  key: string,
  filename: string,
  contentType: string,
  disposition: "inline" | "attachment",
): Promise<string | null> {
  const c = client();
  if (!c) return Promise.resolve(null);
  return getSignedUrl(
    c,
    new GetObjectCommand({
      Bucket: bucketName(),
      Key: key,
      ResponseContentType: contentType || "application/octet-stream",
      ResponseContentDisposition: `${disposition}; filename="${filename}"`,
    }),
    { expiresIn: 3600 },
  ).catch((err) => {
    log.warn("Не удалось подписать ссылку B2", {
      key,
      err: err instanceof Error ? err.message : String(err),
    });
    return null;
  });
}
