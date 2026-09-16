/**
 * Подарки как в Telegram: премиум-пользователи со звёздами дарят их друзьям,
 * подарки отображаются в профиле получателя.
 */
export type Gift = {
  key: string;
  /** Эмодзи-«текстура» подарка. */
  emoji: string;
  name: string;
  /** Цена в звёздах. */
  price: number;
  /** Градиент фона витрины. */
  bg: string;
};

export const GIFTS: Gift[] = [
  { key: "rose", emoji: "🌹", name: "Роза", price: 15, bg: "from-rose-500/30 to-red-400/10" },
  { key: "heart", emoji: "💝", name: "Сердце", price: 25, bg: "from-pink-500/30 to-rose-400/10" },
  { key: "star", emoji: "🌟", name: "Звезда", price: 50, bg: "from-amber-400/30 to-yellow-300/10" },
  { key: "bear", emoji: "🧸", name: "Мишка", price: 50, bg: "from-orange-400/30 to-amber-300/10" },
  { key: "cake", emoji: "🎂", name: "Торт", price: 75, bg: "from-fuchsia-400/30 to-pink-300/10" },
  { key: "rocket", emoji: "🚀", name: "Ракета", price: 100, bg: "from-sky-400/30 to-indigo-300/10" },
  { key: "trophy", emoji: "🏆", name: "Кубок", price: 150, bg: "from-yellow-400/30 to-amber-300/10" },
  { key: "crown", emoji: "👑", name: "Корона", price: 250, bg: "from-violet-400/30 to-purple-300/10" },
  { key: "ring", emoji: "💍", name: "Кольцо", price: 500, bg: "from-emerald-400/30 to-teal-300/10" },
  { key: "diamond", emoji: "💎", name: "Алмаз", price: 1000, bg: "from-cyan-400/30 to-sky-300/10" },
];

export function findGift(key: string): Gift | undefined {
  return GIFTS.find((g) => g.key === key);
}

export type GiftItem = {
  id: string;
  giftKey: string;
  message: string | null;
  createdAt: string;
  sender: { id: string | null; displayName: string; username: string; avatarUrl: string | null } | null;
};
