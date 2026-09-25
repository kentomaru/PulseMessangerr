/**
 * Ответ на историю: сообщение в личке с цитатой истории поверх текста.
 * Транспорт — префикс `storyquote:` + JSON, затем (необязательно) текст
 * через перенос строки. Тот же приём, что у опросов (`poll:`).
 */
export type StoryQuoteInfo = {
  /** Превью истории (кадр). */
  url: string;
  /** История была видео. */
  video: boolean;
  /** Подпись истории, если была. */
  caption?: string;
  /** Имя автора истории. */
  author?: string;
  /** Когда была выложена (для «История от …»). */
  at?: string;
};

export const STORYQUOTE_PREFIX = "storyquote:";

export function encodeStoryQuote(quote: StoryQuoteInfo, text: string): string {
  const body = JSON.stringify(quote);
  return text.trim() ? `${STORYQUOTE_PREFIX}${body}\n${text}` : `${STORYQUOTE_PREFIX}${body}`;
}

export function parseStoryQuote(
  content: string,
): { quote: StoryQuoteInfo; text: string } | null {
  if (!content.startsWith(STORYQUOTE_PREFIX)) return null;
  const rest = content.slice(STORYQUOTE_PREFIX.length);
  const nl = rest.indexOf("\n");
  const raw = nl === -1 ? rest : rest.slice(0, nl);
  try {
    const quote = JSON.parse(raw) as StoryQuoteInfo;
    if (!quote || typeof quote.url !== "string") return null;
    return { quote, text: nl === -1 ? "" : rest.slice(nl + 1) };
  } catch {
    return null;
  }
}
