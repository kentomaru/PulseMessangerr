/**
 * Подарки как в Telegram: премиум-пользователи со звёздами дарят их друзьям,
 * подарки отображаются в профиле получателя.
 *
 * Иконки — собственные векторные рисунки (как «текстуры» подарков в ТГ):
 * градиенты, блики, мягкие тени. Не эмодзи-шрифт, поэтому выглядят
 * одинаково на любой платформе и анимируются как единое целое.
 */
export type Gift = {
  key: string;
  /** Запасной эмодзи (если вектор не подгрузится). */
  emoji: string;
  /** Векторная иконка подарка (64×64). */
  icon: string;
  name: string;
  /** Цена в звёздах. */
  price: number;
  /** Градиент фона витрины. */
  bg: string;
  /** NFT-подарок: коллекционный, с лимитом и особой рамкой. */
  nft?: boolean;
  /** Текстура (картинка) вместо вектора — для NFT. */
  img?: string;
  /** Тираж лимитированной серии. */
  edition?: number;
  /** Доступен только в рулетке NFT (не продаётся в каталоге). */
  rouletteOnly?: boolean;
};

/** Блик-звёздочка для «дорогих» подарков. */
const SPARK = (x: number, y: number, s = 3, o = 0.9) =>
  `<path d="M${x} ${y - s}L${x + s * 0.28} ${y - s * 0.28}L${x + s} ${y}L${x + s * 0.28} ${y + s * 0.28}L${x} ${y + s}L${x - s * 0.28} ${y + s * 0.28}L${x - s} ${y}L${x - s * 0.28} ${y - s * 0.28}Z" fill="#fff" opacity="${o}"/>`;

const svg = (body: string, defs = "") =>
  `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${defs}${body}</svg>`;

export const GIFTS: Gift[] = [
  {
    key: "rose",
    emoji: "🌹",
    name: "Роза",
    price: 15,
    bg: "from-rose-500/30 to-red-400/10",
    icon: svg(
      `<defs>
        <radialGradient id="rg1" cx="32" cy="22" r="16" gradientUnits="userSpaceOnUse">
          <stop offset="0" stop-color="#ff8fa3"/><stop offset="1" stop-color="#e0245e"/>
        </radialGradient>
        <linearGradient id="rg2" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#35c46f"/><stop offset="1" stop-color="#1e8f4e"/>
        </linearGradient>
      </defs>
      <path d="M31 30 C31 42 30 50 30 56" stroke="url(#rg2)" stroke-width="3" stroke-linecap="round" fill="none"/>
      <path d="M31 40 C24 38 20 41 19 45 C25 46 29 44 31 40Z" fill="#2fae62"/>
      <path d="M31 46 C38 44 42 47 43 51 C37 52 33 50 31 46Z" fill="#35c46f"/>
      <circle cx="32" cy="21" r="14" fill="url(#rg1)"/>
      <path d="M32 10 C25 12 22 18 25 24 C27 28 32 30 37 28 C42 26 44 20 41 15 C46 18 47 26 43 30 C38 35 29 35 25 30 C20 24 22 13 32 10Z" fill="#c9184a" opacity="0.85"/>
      <path d="M32 15 C29 16 27 20 29 23 C31 26 35 26 37 24 C39 21 37 17 34 16Z" fill="#ff758f"/>
      <path d="M33 19 C32 19.5 31.5 21 32.5 22 C33.5 22.7 35 22 35 21 C35 19.8 34 19 33 19Z" fill="#ffd6e0"/>
      ${SPARK(15, 12, 2.6, 0.7)}`,
    ),
  },
  {
    key: "heart",
    emoji: "💝",
    name: "Сердце",
    price: 25,
    bg: "from-pink-500/30 to-rose-400/10",
    icon: svg(
      `<defs>
        <linearGradient id="hg1" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#ff7ab8"/><stop offset="1" stop-color="#e0218a"/>
        </linearGradient>
        <linearGradient id="hg2" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#ffd1e8"/><stop offset="1" stop-color="#ff9ac9"/>
        </linearGradient>
      </defs>
      <path d="M32 55 C14 43 7 32 9 22 C11 13 20 9 27 13 C29 14 31 16 32 18 C33 16 35 14 37 13 C44 9 53 13 55 22 C57 32 50 43 32 55Z" fill="url(#hg1)"/>
      <path d="M32 55 C14 43 7 32 9 22 C11 13 20 9 27 13 C29 14 31 16 32 18 L32 55Z" fill="#ff4d9d" opacity="0.5"/>
      <rect x="29" y="10" width="6" height="46" rx="3" fill="url(#hg2)" transform="rotate(0 32 33)" opacity="0.95"/>
      <path d="M29 12 C25 8 27 3 32 5 C37 3 39 8 35 12 L32 15Z" fill="#ffd1e8"/>
      <ellipse cx="21" cy="21" rx="5" ry="3.4" fill="#ffc2dd" opacity="0.85" transform="rotate(-28 21 21)"/>
      ${SPARK(49, 15, 2.8)} ${SPARK(13, 40, 2, 0.6)}`,
    ),
  },
  {
    key: "star",
    emoji: "🌟",
    name: "Звезда",
    price: 50,
    bg: "from-amber-400/30 to-yellow-300/10",
    icon: svg(
      `<defs>
        <linearGradient id="sg1" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#ffe36e"/><stop offset="1" stop-color="#ffb01f"/>
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="24" fill="#ffd94d" opacity="0.25"/>
      <path d="M32 8 L38.5 24.5 L56 25.5 L42.5 36.5 L47 53 L32 43.5 L17 53 L21.5 36.5 L8 25.5 L25.5 24.5 Z" fill="url(#sg1)" stroke="#e58f00" stroke-width="1.5" stroke-linejoin="round"/>
      <path d="M32 8 L38.5 24.5 L32 30 Z" fill="#fff3b0" opacity="0.8"/>
      <path d="M25.5 24.5 L32 30 L21.5 36.5 Z" fill="#fff3b0" opacity="0.55"/>
      ${SPARK(50, 12, 3)} ${SPARK(12, 52, 2.2, 0.7)} ${SPARK(54, 46, 2.4, 0.8)}`,
    ),
  },
  {
    key: "bear",
    emoji: "🧸",
    name: "Мишка",
    price: 50,
    bg: "from-orange-400/30 to-amber-300/10",
    icon: svg(
      `<defs>
        <radialGradient id="bg1" cx="32" cy="30" r="26" gradientUnits="userSpaceOnUse">
          <stop offset="0" stop-color="#e8a06a"/><stop offset="1" stop-color="#b06a34"/>
        </radialGradient>
      </defs>
      <circle cx="17" cy="17" r="8" fill="url(#bg1)"/><circle cx="17" cy="17" r="4" fill="#f2c79e"/>
      <circle cx="47" cy="17" r="8" fill="url(#bg1)"/><circle cx="47" cy="17" r="4" fill="#f2c79e"/>
      <circle cx="32" cy="30" r="18" fill="url(#bg1)"/>
      <ellipse cx="32" cy="36" rx="9" ry="7" fill="#f2c79e"/>
      <ellipse cx="32" cy="33.5" rx="3.2" ry="2.4" fill="#5c3a21"/>
      <path d="M32 36 L32 39 M28 41 Q32 43.5 36 41" stroke="#5c3a21" stroke-width="1.6" stroke-linecap="round" fill="none"/>
      <circle cx="25" cy="27" r="2.4" fill="#3d2716"/><circle cx="39" cy="27" r="2.4" fill="#3d2716"/>
      <circle cx="25.9" cy="26.2" r="0.8" fill="#fff"/><circle cx="39.9" cy="26.2" r="0.8" fill="#fff"/>
      <path d="M32 48 C22 48 16 52 16 57 L48 57 C48 52 42 48 32 48Z" fill="#c07f47"/>
      <ellipse cx="32" cy="52" rx="5" ry="3.6" fill="#f2c79e"/>
      ${SPARK(52, 26, 2.2, 0.7)}`,
    ),
  },
  {
    key: "cake",
    emoji: "🎂",
    name: "Торт",
    price: 75,
    bg: "from-fuchsia-400/30 to-pink-300/10",
    icon: svg(
      `<defs>
        <linearGradient id="cg1" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#ff9ac9"/><stop offset="1" stop-color="#e75aa5"/>
        </linearGradient>
      </defs>
      <rect x="26" y="6" width="3" height="9" rx="1.5" fill="#7dd3fc"/>
      <path d="M31.5 2 C33.5 4 33 6 31.5 7 C30 6 29.5 4 31.5 2Z" fill="#fbbf24"/>
      <path d="M38 8 C40 10 39.5 12 38 13 C36.5 12 36 10 38 8Z" fill="#fbbf24" opacity="0.9"/>
      <rect x="36.6" y="9" width="2.8" height="7" rx="1.4" fill="#fda4af"/>
      <rect x="25" y="13" width="2.8" height="7" rx="1.4" fill="#c4b5fd"/>
      <path d="M14 30 C14 24 20 20 32 20 C44 20 50 24 50 30 L50 34 C50 37 47 38 44 38 C41 38 40 36 38 36 C36 36 36 39 32 39 C28 39 28 36 26 36 C24 36 23 38 20 38 C17 38 14 37 14 34 Z" fill="url(#cg1)"/>
      <rect x="12" y="38" width="40" height="14" rx="6" fill="#f9a8d4"/>
      <rect x="10" y="50" width="44" height="6" rx="3" fill="#fdf2f8" opacity="0.9"/>
      <circle cx="22" cy="31" r="2" fill="#fff0f6"/><circle cx="32" cy="29" r="2" fill="#fff0f6"/><circle cx="42" cy="31" r="2" fill="#fff0f6"/>
      ${SPARK(52, 16, 2.4, 0.8)}`,
    ),
  },
  {
    key: "rocket",
    emoji: "🚀",
    name: "Ракета",
    price: 100,
    bg: "from-sky-400/30 to-indigo-300/10",
    icon: svg(
      `<defs>
        <linearGradient id="kg1" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#f8fafc"/><stop offset="1" stop-color="#cbd5e1"/>
        </linearGradient>
        <linearGradient id="kg2" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#fde047"/><stop offset="0.5" stop-color="#fb923c"/><stop offset="1" stop-color="#ef4444"/>
        </linearGradient>
      </defs>
      <g transform="rotate(45 32 32)">
        <path d="M32 6 C37 12 39 20 39 30 L39 42 L25 42 L25 30 C25 20 27 12 32 6Z" fill="url(#kg1)" stroke="#94a3b8" stroke-width="1.2"/>
        <circle cx="32" cy="24" r="4.5" fill="#38bdf8" stroke="#0ea5e9" stroke-width="1.5"/>
        <path d="M25 34 L17 46 L25 44Z" fill="#ef4444"/><path d="M39 34 L47 46 L39 44Z" fill="#ef4444"/>
        <path d="M29 42 L32 54 L35 42Z" fill="url(#kg2)"/>
        <path d="M30.5 42 L32 49 L33.5 42Z" fill="#fef08a"/>
      </g>
      ${SPARK(12, 14, 2.6, 0.8)} ${SPARK(54, 22, 2, 0.6)} ${SPARK(16, 50, 2.2, 0.7)}`,
    ),
  },
  {
    key: "trophy",
    emoji: "🏆",
    name: "Кубок",
    price: 150,
    bg: "from-yellow-400/30 to-amber-300/10",
    icon: svg(
      `<defs>
        <linearGradient id="tg1" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#fbbf24"/><stop offset="0.5" stop-color="#fde68a"/><stop offset="1" stop-color="#f59e0b"/>
        </linearGradient>
      </defs>
      <path d="M18 12 L46 12 L44 32 C43 40 38 44 32 44 C26 44 21 40 20 32 Z" fill="url(#tg1)" stroke="#d97706" stroke-width="1.4"/>
      <path d="M18 14 C10 14 8 20 10 25 C12 29 16 31 20 30" fill="none" stroke="#f59e0b" stroke-width="3" stroke-linecap="round"/>
      <path d="M46 14 C54 14 56 20 54 25 C52 29 48 31 44 30" fill="none" stroke="#f59e0b" stroke-width="3" stroke-linecap="round"/>
      <rect x="29" y="43" width="6" height="6" fill="#d97706"/>
      <rect x="23" y="49" width="18" height="6" rx="2" fill="#b45309"/>
      <path d="M32 22 L33.8 26 L38 26.3 L34.8 29 L35.9 33 L32 30.7 L28.1 33 L29.2 29 L26 26.3 L30.2 26Z" fill="#fff7cc"/>
      <ellipse cx="26" cy="17" rx="3.5" ry="1.8" fill="#fff7cc" opacity="0.8" transform="rotate(-18 26 17)"/>
      ${SPARK(52, 10, 2.6, 0.85)} ${SPARK(11, 44, 2, 0.6)}`,
    ),
  },
  {
    key: "crown",
    emoji: "👑",
    name: "Корона",
    price: 250,
    bg: "from-violet-400/30 to-purple-300/10",
    icon: svg(
      `<defs>
        <linearGradient id="wg1" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#fde047"/><stop offset="1" stop-color="#eab308"/>
        </linearGradient>
      </defs>
      <path d="M12 24 L20 34 L32 14 L44 34 L52 24 L49 46 L15 46 Z" fill="url(#wg1)" stroke="#ca8a04" stroke-width="1.6" stroke-linejoin="round"/>
      <rect x="14" y="46" width="36" height="6" rx="2.5" fill="#ca8a04"/>
      <circle cx="12" cy="22" r="3" fill="#f472b6"/><circle cx="32" cy="12" r="3.4" fill="#60a5fa"/><circle cx="52" cy="22" r="3" fill="#4ade80"/>
      <circle cx="24" cy="41" r="2.6" fill="#f472b6"/><circle cx="32" cy="39" r="3" fill="#38bdf8"/><circle cx="40" cy="41" r="2.6" fill="#a78bfa"/>
      <path d="M20 30 L26 30" stroke="#fef9c3" stroke-width="1.6" stroke-linecap="round" opacity="0.8"/>
      ${SPARK(56, 36, 2.4, 0.85)} ${SPARK(9, 12, 2, 0.7)}`,
    ),
  },
  {
    key: "ring",
    emoji: "💍",
    name: "Кольцо",
    price: 500,
    bg: "from-emerald-400/30 to-teal-300/10",
    icon: svg(
      `<defs>
        <linearGradient id="gg1" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#fde68a"/><stop offset="1" stop-color="#d97706"/>
        </linearGradient>
        <linearGradient id="gg2" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#ccfbf1"/><stop offset="1" stop-color="#2dd4bf"/>
        </linearGradient>
      </defs>
      <circle cx="32" cy="38" r="15" fill="none" stroke="url(#gg1)" stroke-width="6"/>
      <circle cx="32" cy="38" r="15" fill="none" stroke="#fff7cc" stroke-width="1.4" opacity="0.6"/>
      <path d="M32 8 L41 17 L32 26 L23 17 Z" fill="url(#gg2)" stroke="#0d9488" stroke-width="1.5" stroke-linejoin="round"/>
      <path d="M32 8 L36 17 L32 26 L28 17 Z" fill="#fff" opacity="0.45"/>
      <path d="M23 17 L41 17" stroke="#0f766e" stroke-width="1" opacity="0.5"/>
      ${SPARK(46, 10, 2.8)} ${SPARK(14, 26, 2, 0.7)} ${SPARK(50, 50, 2.2, 0.75)}`,
    ),
  },
  {
    key: "nft_cat",
    emoji: "🐱",
    name: "Космокот",
    price: 1500,
    bg: "from-violet-500/30 to-indigo-400/10",
    nft: true,
    img: "/gifts/nft-cat.png",
    edition: 1000,
    icon: "",
  },
  {
    key: "nft_heart",
    emoji: "💗",
    name: "Кристальное сердце",
    price: 2000,
    bg: "from-pink-500/30 to-fuchsia-400/10",
    nft: true,
    img: "/gifts/nft-heart.png",
    edition: 750,
    icon: "",
  },
  {
    key: "nft_rocket",
    emoji: "🚀",
    name: "Ретро-ракета",
    price: 2500,
    bg: "from-sky-500/30 to-cyan-400/10",
    nft: true,
    img: "/gifts/nft-rocket.png",
    edition: 500,
    icon: "",
  },
  {
    key: "nft_bear",
    emoji: "🧸",
    name: "Медовый мишка",
    price: 3000,
    bg: "from-amber-500/30 to-orange-400/10",
    nft: true,
    img: "/gifts/nft-bear.png",
    edition: 350,
    icon: "",
  },
  {
    key: "nft_crown",
    emoji: "👑",
    name: "Корона Рубинов",
    price: 4000,
    bg: "from-rose-500/30 to-amber-400/10",
    nft: true,
    img: "/gifts/nft-crown.png",
    edition: 200,
    icon: "",
  },
  {
    key: "nft_dragon",
    emoji: "🐉",
    name: "Золотой дракон",
    price: 5000,
    bg: "from-emerald-500/30 to-yellow-400/10",
    nft: true,
    img: "/gifts/nft-dragon.png",
    edition: 100,
    icon: "",
  },
  {
    key: "nft_whale",
    emoji: "🐋",
    name: "Космический кит",
    price: 5000,
    bg: "from-indigo-500/30 to-cyan-400/10",
    nft: true,
    img: "/gifts/nft-whale.png",
    edition: 80,
    rouletteOnly: true,
    icon: "",
  },
  {
    key: "nft_oni",
    emoji: "👺",
    name: "Маска они",
    price: 7500,
    bg: "from-purple-500/30 to-rose-500/10",
    nft: true,
    img: "/gifts/nft-oni.png",
    edition: 60,
    rouletteOnly: true,
    icon: "",
  },
  {
    key: "nft_pegasus",
    emoji: "🦄",
    name: "Пегас",
    price: 10000,
    bg: "from-violet-500/30 to-sky-400/10",
    nft: true,
    img: "/gifts/nft-pegasus.png",
    edition: 45,
    rouletteOnly: true,
    icon: "",
  },
  {
    key: "nft_wolf",
    emoji: "🐺",
    name: "Ледяной волк",
    price: 15000,
    bg: "from-slate-500/30 to-cyan-300/10",
    nft: true,
    img: "/gifts/nft-wolf.png",
    edition: 30,
    rouletteOnly: true,
    icon: "",
  },
  {
    key: "nft_diamond",
    emoji: "💠",
    name: "Вечный алмаз",
    price: 25000,
    bg: "from-cyan-400/30 to-blue-500/10",
    nft: true,
    img: "/gifts/nft-diamond.png",
    edition: 15,
    rouletteOnly: true,
    icon: "",
  },
  {
    key: "nft_phoenix",
    emoji: "🔥",
    name: "Феникс",
    price: 50000,
    bg: "from-orange-500/30 to-amber-400/10",
    nft: true,
    img: "/gifts/nft-phoenix.png",
    edition: 5,
    rouletteOnly: true,
    icon: "",
  },
  {
    key: "diamond",
    emoji: "💎",
    name: "Алмаз",
    price: 1000,
    bg: "from-cyan-400/30 to-sky-300/10",
    icon: svg(
      `<defs>
        <linearGradient id="dg1" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#e0f2fe"/><stop offset="1" stop-color="#38bdf8"/>
        </linearGradient>
        <linearGradient id="dg2" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#7dd3fc"/><stop offset="1" stop-color="#0284c7"/>
        </linearGradient>
      </defs>
      <path d="M14 24 L23 12 L41 12 L50 24 L32 54 Z" fill="url(#dg1)" stroke="#0ea5e9" stroke-width="1.5" stroke-linejoin="round"/>
      <path d="M14 24 L50 24 L32 54 Z" fill="url(#dg2)" opacity="0.9"/>
      <path d="M23 12 L28 24 L32 12 L36 24 L41 12" fill="none" stroke="#bae6fd" stroke-width="1.6"/>
      <path d="M14 24 L28 24 M36 24 L50 24 M28 24 L32 54 L36 24" fill="none" stroke="#e0f2fe" stroke-width="1.3" opacity="0.9"/>
      ${SPARK(52, 14, 3)} ${SPARK(11, 44, 2.4, 0.8)} ${SPARK(32, 6, 2, 0.7)} ${SPARK(55, 42, 2, 0.65)}`,
    ),
  },
];

export function findGift(key: string): Gift | undefined {
  return GIFTS.find((g) => g.key === key);
}

export type GiftItem = {
  id: string;
  giftKey: string;
  message: string | null;
  createdAt: string;
  /** «Скрыть моё имя» — отправитель не показывается. */
  anonymous?: boolean;
  /** Закреплён в витрине — показывается первым. */
  pinned?: boolean;
  /** Расцветка (0–4) — у каждого NFT пять вариантов. */
  variant?: number;
  /** Откуда подарок: подарен или выигран в рулетке. */
  source?: "gift" | "roulette";
  sender: { id: string | null; displayName: string; username: string; avatarUrl: string | null } | null;
};


/* ============ Расцветки NFT: у каждого 5 вариантов ============ */

export type NftVariant = { name: string; filter: string };

/** Пять расцветок каждого NFT (вариант 0 — классический, без фильтра). */
export const NFT_VARIANTS: NftVariant[] = [
  { name: "Классический", filter: "none" },
  { name: "Лазурный", filter: "hue-rotate(185deg) saturate(1.1)" },
  { name: "Изумрудный", filter: "hue-rotate(105deg) saturate(1.05)" },
  { name: "Рубиновый", filter: "hue-rotate(315deg) saturate(1.15)" },
  { name: "Золотой", filter: "hue-rotate(40deg) saturate(1.35) brightness(1.08)" },
];

/** CSS-фильтр для расцветки (0–4, -1/мусор → классика). */
export function variantFilter(variant: number | undefined | null): string {
  if (variant == null || variant < 0 || variant >= NFT_VARIANTS.length) return "none";
  return NFT_VARIANTS[variant].filter;
}

export function variantName(variant: number | undefined | null): string {
  if (variant == null || variant < 0 || variant >= NFT_VARIANTS.length) return NFT_VARIANTS[0].name;
  return NFT_VARIANTS[variant].name;
}
