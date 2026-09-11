/**
 * Формат содержимого сообщения с изображением.
 *
 * До появления подписи к фотографиям в базе хранилась просто строка URL.
 * Парсер оставляет поддержку старых сообщений, а новые сообщения сохраняют
 * URL и подпись вместе одной записью в таблице messages.
 */
export type ImageMessageContent = {
  url: string;
  caption: string;
};

export function isUploadUrl(value: string): boolean {
  return /^\/api\/files\/[a-zA-Z0-9-]+\.(png|jpg|jpeg|webp|gif)$/i.test(value);
}

export function encodeImageMessage(url: string, caption = ""): string {
  return JSON.stringify({ url, caption: caption.trim() });
}

export function parseImageMessage(content: string): ImageMessageContent {
  const plain = content.trim();
  if (isUploadUrl(plain)) return { url: plain, caption: "" };

  try {
    const value = JSON.parse(plain) as { url?: unknown; caption?: unknown };
    if (typeof value.url === "string" && isUploadUrl(value.url)) {
      return {
        url: value.url,
        caption: typeof value.caption === "string" ? value.caption : "",
      };
    }
  } catch {
    // Старое/повреждённое содержимое обработается как неизвестная ссылка.
  }

  return { url: plain, caption: "" };
}
