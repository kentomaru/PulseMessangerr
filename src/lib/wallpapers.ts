/** Пресеты обоев чата. Значение хранится в БД (conversation_members.wallpaper). */
export type WallpaperPreset = {
  key: string;
  label: string;
  css: string;
  /** CSS-animation для «живых» обоев (градиент плавно дрейфует). */
  anim?: string;
};

export const WALLPAPER_PRESETS: WallpaperPreset[] = [
  { key: "g1", label: "Полночь", css: "linear-gradient(160deg, #150b2e 0%, #090a16 60%, #0a0a14 100%)" },
  { key: "g2", label: "Глубина", css: "linear-gradient(160deg, #04121f 0%, #071a2c 55%, #0a0a14 100%)" },
  { key: "g3", label: "Сакура", css: "linear-gradient(160deg, #1d0b1e 0%, #2a1030 50%, #0a0a14 100%)" },
  { key: "g4", label: "Лес", css: "linear-gradient(160deg, #0d1f14 0%, #0a1410 55%, #0a0a14 100%)" },
  { key: "g5", label: "Туманность", css: "radial-gradient(circle at 20% 20%, rgba(124,58,237,.35), transparent 55%), radial-gradient(circle at 85% 70%, rgba(34,211,238,.22), transparent 50%), #0a0a14" },
  { key: "g6", label: "Закат", css: "radial-gradient(circle at 75% 15%, rgba(217,70,239,.28), transparent 55%), radial-gradient(circle at 15% 85%, rgba(59,130,246,.25), transparent 50%), #0a0a14" },
  { key: "g7", label: "Изумруд", css: "radial-gradient(circle at 50% 0%, rgba(16,185,129,.25), transparent 55%), radial-gradient(circle at 20% 90%, rgba(139,92,246,.25), transparent 50%), #0a0a14" },
  { key: "g8", label: "Штрихи", css: "repeating-linear-gradient(45deg, rgba(255,255,255,.02) 0 12px, transparent 12px 24px), linear-gradient(160deg, #16122b, #0a0a14)" },
  { key: "g9", label: "Круги", css: "repeating-radial-gradient(circle at 0 0, rgba(255,255,255,.025) 0 14px, transparent 14px 28px), linear-gradient(160deg, #0b1526, #0a0a14)" },
  { key: "g10", label: "Карамель", css: "linear-gradient(160deg, #241205 0%, #170d04 55%, #0a0a14 100%)" },
  /* Живые обои: большой градиент плавно дрейфует по экрану */
  {
    key: "live1",
    label: "Аврора · живые",
    css: "radial-gradient(circle at 15% 20%, rgba(124,58,237,.5), transparent 45%), radial-gradient(circle at 85% 30%, rgba(34,211,238,.35), transparent 45%), radial-gradient(circle at 50% 90%, rgba(217,70,239,.35), transparent 50%), #07070f",
    anim: "wallpaper-drift 22s ease-in-out infinite alternate",
  },
  {
    key: "live2",
    label: "Пульс · живые",
    css: "radial-gradient(circle at 30% 25%, rgba(139,92,246,.55), transparent 40%), radial-gradient(circle at 75% 75%, rgba(59,130,246,.4), transparent 45%), #05050c",
    anim: "wallpaper-drift 16s ease-in-out infinite alternate-reverse",
  },
  {
    key: "live3",
    label: "Глубина · живые",
    css: "radial-gradient(circle at 70% 15%, rgba(6,182,212,.45), transparent 45%), radial-gradient(circle at 20% 80%, rgba(16,185,129,.3), transparent 50%), #04101a",
    anim: "wallpaper-drift 26s ease-in-out infinite alternate",
  },
  {
    key: "live4",
    label: "Неон · живые",
    css: "radial-gradient(circle at 25% 70%, rgba(217,70,239,.5), transparent 45%), radial-gradient(circle at 80% 20%, rgba(244,63,94,.3), transparent 45%), #0d0512",
    anim: "wallpaper-drift 19s ease-in-out infinite alternate-reverse",
  },
];

export function presetByKey(key: string | null | undefined): WallpaperPreset | undefined {
  if (!key) return undefined;
  return WALLPAPER_PRESETS.find((p) => p.key === key);
}

/** CSS-фон по значению обоев: пресет, своя картинка или ничего. */
export function wallpaperStyle(wallpaper: string | null): React.CSSProperties {
  if (!wallpaper) return {};
  if (wallpaper.startsWith("/api/files/")) {
    return {
      backgroundImage: `url(${wallpaper})`,
      backgroundSize: "cover",
      backgroundPosition: "center",
    };
  }
  const preset = presetByKey(wallpaper);
  if (!preset) return {};
  if (preset.anim) {
    // «Живые» обои: фон больше экрана, анимация плавно его сдвигает
    return {
      background: preset.css,
      backgroundSize: "170% 170%",
      animation: preset.anim,
    };
  }
  return { background: preset.css };
}
