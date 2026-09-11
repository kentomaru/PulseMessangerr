/**
 * Формат вложения в сообщении.
 * Старые изображения в базе были обычной строкой URL, поэтому парсер
 * специально сохраняет обратную совместимость с этим форматом.
 */
export type AttachmentMessageContent = {
  url: string;
  caption: string;
  name: string;
  mimeType: string;
  size: number;
  duration?: number;
};

const FILE_URL_RE = /^\/api\/files\/[a-zA-Z0-9-]+\.[a-zA-Z0-9]{1,16}$/;

export function isFileUrl(value: string): boolean {
  return FILE_URL_RE.test(value.trim());
}

/** Старое имя оставлено для вызовов, которые работают только с картинками. */
export function isUploadUrl(value: string): boolean {
  return isFileUrl(value);
}

export function encodeAttachmentMessage(
  data: Pick<AttachmentMessageContent, "url" | "caption" | "name" | "mimeType" | "size"> &
    Partial<Pick<AttachmentMessageContent, "duration">>,
): string {
  return JSON.stringify({
    url: data.url,
    caption: data.caption.trim(),
    name: data.name,
    mimeType: data.mimeType,
    size: data.size,
    ...(typeof data.duration === "number" ? { duration: data.duration } : {}),
  });
}

export function parseAttachmentMessage(content: string): AttachmentMessageContent {
  const plain = content.trim();
  if (isFileUrl(plain)) {
    return { url: plain, caption: "", name: "Файл", mimeType: "", size: 0 };
  }

  try {
    const value = JSON.parse(plain) as Partial<AttachmentMessageContent>;
    if (typeof value.url === "string" && isFileUrl(value.url)) {
      return {
        url: value.url,
        caption: typeof value.caption === "string" ? value.caption : "",
        name: typeof value.name === "string" && value.name ? value.name : "Файл",
        mimeType: typeof value.mimeType === "string" ? value.mimeType : "",
        size: typeof value.size === "number" && value.size > 0 ? value.size : 0,
        duration: typeof value.duration === "number" ? value.duration : undefined,
      };
    }
  } catch {
    // Старое/повреждённое содержимое обработается как неизвестная ссылка.
  }

  return { url: plain, caption: "", name: "Файл", mimeType: "", size: 0 };
}

export function parseImageMessage(content: string) {
  const attachment = parseAttachmentMessage(content);
  return { url: attachment.url, caption: attachment.caption };
}
