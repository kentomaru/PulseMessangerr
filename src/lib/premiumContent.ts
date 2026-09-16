/**
 * Pulse Premium контент — как в Telegram Premium:
 *  — набор анимированных «гифок» (встроенные SVG с SMIL-анимацией, работают офлайн);
 *  — кастомные эмодзи — анимированные, вставляются в текст токеном :ce_<id>:
 *    и рендерятся инлайн (только для владельцев Pulse Premium).
 *
 * Гифки отправляются сообщением вида `gifpack:<id>` и рисуются крупно, без пузыря.
 */

export interface GifItem {
  id: string;
  title: string;
  svg: string;
}

export interface CustomEmoji {
  id: string;
  /** Текстовый токен, который вставляется в сообщение: :ce_<id>: */
  token: string;
  title: string;
  svg: string;
}

const S = (inner: string, size = 120) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 120 120">${inner}</svg>`;

/* ─────────────────────────── ГИФКИ ─────────────────────────── */

export const GIF_PACK: GifItem[] = [
  {
    id: "party",
    title: "Вечеринка",
    svg: S(
      `<g><circle cx="60" cy="60" r="34" fill="#f6c945"/>
      <path d="M45 55 q5 -8 10 0" stroke="#5b3a1e" stroke-width="4" fill="none" stroke-linecap="round"/>
      <path d="M65 55 q5 -8 10 0" stroke="#5b3a1e" stroke-width="4" fill="none" stroke-linecap="round"/>
      <path d="M45 72 q15 14 30 0" stroke="#5b3a1e" stroke-width="4" fill="none" stroke-linecap="round"/>
      <animateTransform attributeName="transform" type="rotate" values="-8 60 60;8 60 60;-8 60 60" dur="0.8s" repeatCount="indefinite"/></g>
      <g fill="#7c5cff"><circle cx="18" cy="22" r="4"><animate attributeName="cy" values="14;30;14" dur="1.1s" repeatCount="indefinite"/></circle>
      <circle cx="102" cy="26" r="4" fill="#ff6b6b"><animate attributeName="cy" values="30;14;30" dur="1.3s" repeatCount="indefinite"/></circle>
      <circle cx="98" cy="96" r="4" fill="#4ecdc4"><animate attributeName="cy" values="102;88;102" dur="0.9s" repeatCount="indefinite"/></circle>
      <circle cx="22" cy="98" r="4" fill="#ffd166"><animate attributeName="cy" values="90;106;90" dur="1.2s" repeatCount="indefinite"/></circle></g>`,
    ),
  },
  {
    id: "heart",
    title: "Сердце",
    svg: S(
      `<path fill="#ff4d6d" d="M60 96 C30 74 16 56 16 40 a20 20 0 0 1 38 -9 a20 20 0 0 1 38 9 c0 16 -14 34 -32 56z">
      <animateTransform attributeName="transform" type="scale" values="1;1.15;0.95;1.1;1" dur="1s" repeatCount="indefinite" additive="sum" origin="60 60"/></path>
      <circle cx="88" cy="26" r="3" fill="#ffb3c1"><animate attributeName="opacity" values="0;1;0" dur="1.4s" repeatCount="indefinite"/></circle>
      <circle cx="30" cy="22" r="2.5" fill="#ffb3c1"><animate attributeName="opacity" values="1;0;1" dur="1.7s" repeatCount="indefinite"/></circle>`,
    ),
  },
  {
    id: "fire",
    title: "Огонь",
    svg: S(
      `<path fill="#ff7b00" d="M60 14 c4 18 -14 26 -14 44 a14 14 0 0 0 28 0 c0 -8 -4 -12 -6 -20 6 4 12 12 12 24 a20 20 0 1 1 -40 0 c0 -22 14 -30 20 -48z">
      <animateTransform attributeName="transform" type="scale" values="1 1;1.06 0.94;0.97 1.05;1 1" dur="0.7s" repeatCount="indefinite" additive="sum"/></path>
      <path fill="#ffd000" d="M60 52 c2 10 -8 14 -8 24 a8 8 0 0 0 16 0 c0 -8 -6 -12 -8 -24z">
      <animate attributeName="opacity" values="1;0.65;1" dur="0.5s" repeatCount="indefinite"/></path>`,
    ),
  },
  {
    id: "laugh",
    title: "До слёз",
    svg: S(
      `<circle cx="60" cy="60" r="40" fill="#ffd93d"/>
      <path d="M38 48 q8 -10 16 0" stroke="#3a2b00" stroke-width="4" fill="none" stroke-linecap="round"/>
      <path d="M66 48 q8 -10 16 0" stroke="#3a2b00" stroke-width="4" fill="none" stroke-linecap="round"/>
      <path d="M38 66 q22 26 44 0 q-22 10 -44 0z" fill="#3a2b00"/>
      <path d="M40 68 q-6 14 4 18" stroke="#63c8ff" stroke-width="5" fill="none" stroke-linecap="round"><animate attributeName="opacity" values="0;1;0" dur="1.2s" repeatCount="indefinite"/></path>
      <animateTransform attributeName="transform" type="rotate" values="-4 60 60;4 60 60;-4 60 60" dur="0.6s" repeatCount="indefinite"/>`,
    ),
  },
  {
    id: "clap",
    title: "Аплодисменты",
    svg: S(
      `<g><path fill="#ffb35c" d="M34 66 l20 -30 a8 8 0 0 1 14 8 l-16 26z"/>
      <path fill="#ffcf87" d="M86 66 l-20 -30 a8 8 0 0 0 -14 8 l16 26z">
      <animateTransform attributeName="transform" type="rotate" values="0 60 60;-16 60 60;0 60 60" dur="0.5s" repeatCount="indefinite"/></path>
      <path d="M60 22 l0 -10 M44 26 l-6 -8 M76 26 l6 -8" stroke="#ffd93d" stroke-width="4" stroke-linecap="round">
      <animate attributeName="opacity" values="0;1;0" dur="0.5s" repeatCount="indefinite"/></path></g>`,
    ),
  },
  {
    id: "rocket",
    title: "Ракета",
    svg: S(
      `<g><path fill="#dfe7ff" d="M60 14 c12 12 14 34 8 52 h-16 c-6 -18 -4 -40 8 -52z"/>
      <circle cx="60" cy="46" r="7" fill="#7c5cff"/>
      <path fill="#ff6b6b" d="M52 60 l-12 16 l14 -4z M68 60 l12 16 l-14 -4z"/>
      <path fill="#ffb300" d="M56 68 q4 18 8 24 q4 -6 8 -24z">
      <animate attributeName="d" values="M56 68 q4 18 8 24 q4 -6 8 -24z;M56 68 q4 26 8 34 q4 -8 8 -34z;M56 68 q4 18 8 24 q4 -6 8 -24z" dur="0.4s" repeatCount="indefinite"/></path>
      <animateTransform attributeName="transform" type="translate" values="0 4;0 -4;0 4" dur="0.9s" repeatCount="indefinite"/></g>`,
    ),
  },
  {
    id: "boom",
    title: "Взрыв",
    svg: S(
      `<g><circle cx="60" cy="60" r="18" fill="#ff4d00">
      <animate attributeName="r" values="10;34;10" dur="0.9s" repeatCount="indefinite"/>
      <animate attributeName="opacity" values="1;0.2;1" dur="0.9s" repeatCount="indefinite"/></circle>
      <g stroke="#ffd000" stroke-width="5" stroke-linecap="round">
      <path d="M60 20 l0 -10 M60 100 l0 10 M20 60 l-10 0 M100 60 l10 0 M32 32 l-8 -8 M88 32 l8 -8 M32 88 l-8 8 M88 88 l8 8">
      <animate attributeName="opacity" values="0;1;0" dur="0.9s" repeatCount="indefinite"/></path></g></g>`,
    ),
  },
  {
    id: "dance",
    title: "Танец",
    svg: S(
      `<g stroke-linecap="round"><circle cx="60" cy="30" r="12" fill="#7c5cff"/>
      <path d="M60 42 v28" stroke="#7c5cff" stroke-width="7"/>
      <path d="M60 50 l-18 -8 M60 50 l18 -8" stroke="#7c5cff" stroke-width="7">
      <animateTransform attributeName="transform" type="rotate" values="0 60 50;40 60 50;0 60 50;-40 60 50;0 60 50" dur="0.8s" repeatCount="indefinite"/></path>
      <path d="M60 70 l-14 24 M60 70 l14 24" stroke="#7c5cff" stroke-width="7"/></g>
      <circle cx="24" cy="90" r="4" fill="#ffd93d"><animate attributeName="cy" values="96;80;96" dur="0.8s" repeatCount="indefinite"/></circle>
      <circle cx="96" cy="86" r="4" fill="#4ecdc4"><animate attributeName="cy" values="80;96;80" dur="0.8s" repeatCount="indefinite"/></circle>`,
    ),
  },
  {
    id: "thumbsup",
    title: "Класс",
    svg: S(
      `<g><path fill="#ffcf87" d="M30 56 h14 v38 h-14z"/>
      <path fill="#ffb35c" d="M44 94 l30 0 c8 0 12 -5 11 -11 l4 -18 c1 -7 -4 -11 -10 -11 l-16 0 l4 -16 c2 -8 -9 -12 -13 -5 l-20 28z">
      <animateTransform attributeName="transform" type="translate" values="0 0;0 -6;0 0" dur="0.7s" repeatCount="indefinite"/></path>
      <path d="M92 30 l6 -6 M96 44 l9 0 M92 58 l6 6" stroke="#ffd93d" stroke-width="4" stroke-linecap="round">
      <animate attributeName="opacity" values="0;1;0" dur="0.7s" repeatCount="indefinite"/></path></g>`,
    ),
  },
  {
    id: "rain",
    title: "Плачу",
    svg: S(
      `<circle cx="60" cy="56" r="38" fill="#63c8ff"/>
      <path d="M42 50 q6 -8 12 0 M66 50 q6 -8 12 0" stroke="#0b3a5c" stroke-width="4" fill="none" stroke-linecap="round"/>
      <path d="M46 72 q14 -10 28 0" stroke="#0b3a5c" stroke-width="4" fill="none" stroke-linecap="round"/>
      <path d="M40 96 q0 10 0 14 M80 96 q0 10 0 14" stroke="#bfe7ff" stroke-width="6" stroke-linecap="round">
      <animate attributeName="d" values="M40 96 q0 10 0 14 M80 96 q0 10 0 14;M40 100 q0 12 0 16 M80 100 q0 12 0 16;M40 96 q0 10 0 14 M80 96 q0 10 0 14" dur="0.8s" repeatCount="indefinite"/></path>`,
    ),
  },
  {
    id: "cat",
    title: "Кот",
    svg: S(
      `<g><path fill="#9aa3b2" d="M36 44 l-8 -20 l18 10z M84 44 l8 -20 l-18 10z"/>
      <circle cx="60" cy="64" r="32" fill="#9aa3b2"/>
      <circle cx="48" cy="58" r="4" fill="#20242c"><animate attributeName="ry" values="4;0.5;4" dur="3s" repeatCount="indefinite"/></circle>
      <circle cx="72" cy="58" r="4" fill="#20242c"/>
      <path d="M56 72 q4 4 8 0" stroke="#20242c" stroke-width="3" fill="none" stroke-linecap="round"/>
      <path d="M30 66 l-14 -2 M30 72 l-14 2 M90 66 l14 -2 M90 72 l14 2" stroke="#20242c" stroke-width="2"/>
      <animateTransform attributeName="transform" type="rotate" values="-3 60 64;3 60 64;-3 60 64" dur="1.6s" repeatCount="indefinite"/></g>`,
    ),
  },
  {
    id: "gg",
    title: "Победа",
    svg: S(
      `<g><path fill="#f6c945" d="M38 34 h44 v18 a22 22 0 0 1 -44 0z"/>
      <path fill="#f6c945" d="M38 38 h-12 a10 12 0 0 0 12 14z M82 38 h12 a10 12 0 0 1 -12 14z"/>
      <rect x="54" y="72" width="12" height="12" fill="#c99a1e"/>
      <rect x="44" y="84" width="32" height="10" rx="3" fill="#c99a1e"/>
      <path d="M60 18 l3 8 8 1 -6 6 2 8 -7 -4 -7 4 2 -8 -6 -6 8 -1z" fill="#fff" opacity="0.9">
      <animate attributeName="opacity" values="0.2;1;0.2" dur="1.1s" repeatCount="indefinite"/></path></g>`,
    ),
  },
];

/* ─────────────────────── КАСТОМ ЭМОДЗИ ─────────────────────── */

const CE = (inner: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" style="vertical-align:-0.15em">${inner}</svg>`;

/** SVG-обёртка: настоящий эмодзи-глиф + лёгкая анимация. */
const CE_EMOJI = (emoji: string, anim: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" style="vertical-align:-0.15em"><text x="12" y="18" text-anchor="middle" font-size="19">${emoji}${anim}</text></svg>`;
/** Пульс размера. */
const PULSE = `<animate attributeName="font-size" values="19;21.5;19" dur="0.9s" repeatCount="indefinite"/>`;
/** Мягкое мигание. */
const BLINK = `<animate attributeName="opacity" values="1;0.55;1" dur="1.2s" repeatCount="indefinite"/>`;

export const CUSTOM_EMOJI: CustomEmoji[] = [
  // Теперь внутри SVG — настоящие эмодзи (как просили): рисованные пути заменены
  // на глифы, анимация осталась. Токены и названия не менялись.
  { id: "fire", token: ":ce_fire:", title: "Огонь", svg: CE_EMOJI("🔥", PULSE) },
  { id: "heart", token: ":ce_heart:", title: "Сердце", svg: CE_EMOJI("❤️", PULSE) },
  { id: "star", token: ":ce_star:", title: "Звезда", svg: CE_EMOJI("⭐", BLINK) },
  { id: "party", token: ":ce_party:", title: "Праздник", svg: CE_EMOJI("🎉", PULSE) },
  { id: "hundred", token: ":ce_100:", title: "Сотка", svg: CE_EMOJI("💯", BLINK) },
  { id: "skull", token: ":ce_skull:", title: "Череп", svg: CE_EMOJI("💀", BLINK) },
  { id: "crown", token: ":ce_crown:", title: "Корона", svg: CE_EMOJI("👑", PULSE) },
  { id: "gem", token: ":ce_gem:", title: "Алмаз", svg: CE_EMOJI("💎", BLINK) },
  { id: "rocket", token: ":ce_rocket:", title: "Ракета", svg: CE_EMOJI("🚀", PULSE) },
  { id: "rainbow", token: ":ce_rainbow:", title: "Радуга", svg: CE_EMOJI("🌈", BLINK) },
  { id: "ghost", token: ":ce_ghost:", title: "Привидение", svg: CE_EMOJI("👻", PULSE) },
  { id: "bolt", token: ":ce_bolt:", title: "Молния", svg: CE_EMOJI("⚡", BLINK) },
  { id: "cat", token: ":ce_cat:", title: "Кот", svg: CE_EMOJI("🐱", PULSE) },
  { id: "clover", token: ":ce_clover:", title: "Клевер", svg: CE_EMOJI("🍀", BLINK) },
  { id: "moon", token: ":ce_moon:", title: "Луна", svg: CE_EMOJI("🌙", BLINK) },
  { id: "cool", token: ":ce_cool:", title: "Крутой", svg: CE_EMOJI("😎", PULSE) },
  { id: "gg", token: ":ce_gg:", title: "ГГ", svg: CE_EMOJI("🏆", PULSE) },
];

/** Найти гифку по id. */
export function findGif(id: string): GifItem | undefined {
  return GIF_PACK.find((g) => g.id === id);
}

/** Найти кастом-эмодзи по id. */
export function findCustomEmoji(id: string): CustomEmoji | undefined {
  return CUSTOM_EMOJI.find((c) => c.id === id);
}

/** Сообщение-гифка? Возвращает id или null. */
export function gifpackId(content: string): string | null {
  const t = content.trim();
  const m = /^gifpack:([a-z0-9_]+)$/.exec(t);
  return m ? m[1] : null;
}

/** Глиф кастомного эмодзи по токену — для превью, подсказок и поиска. */
const GLYPH_BY_TOKEN: Map<string, string> = new Map(
  CUSTOM_EMOJI.map((ce) => [
    ce.token,
    ce.svg.match(/<text[^>]*>([^<]+)</)?.[1] ?? "⭐",
  ]),
);

export function customEmojiGlyph(token: string): string {
  return GLYPH_BY_TOKEN.get(token) ?? "⭐";
}

/** Заменить все токены «:ce_x:» на настоящие эмодзи (для текстовых превью). */
export function replaceCustomEmoji(text: string): string {
  return text.replace(/:ce_[a-z0-9_]+:/g, (t) => customEmojiGlyph(t));
}
