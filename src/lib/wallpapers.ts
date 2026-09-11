/** Пресеты обоев чата. Значение хранится в БД (conversation_members.wallpaper). */
export type WallpaperPreset = {
  key: string;
  label: string;
  css: string;
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
  if (preset) return { background: preset.css };
  return {};
}
