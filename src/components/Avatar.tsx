"use client";

import { useEffect, useState } from "react";

const PALETTES = [
  "from-[#5865f2] to-[#7289da]",
  "from-[#5865f2] to-blue-600",
  "from-emerald-500 to-teal-600",
  "from-amber-500 to-orange-600",
  "from-rose-500 to-pink-600",
  "from-indigo-500 to-[#4752c4]",
];

export function paletteFor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return PALETTES[h % PALETTES.length];
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  const a = parts[0]?.[0] ?? "?";
  const b = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (a + b).toUpperCase();
}

export function bannerGradient(seed: string) {
  const p = paletteFor(seed);
  return `bg-gradient-to-br ${p}`;
}

export default function Avatar({
  name,
  src,
  size = 44,
  online,
  className = "",
}: {
  name: string;
  src?: string | null;
  size?: number;
  online?: boolean;
  className?: string;
}) {
  // Если файл аватара побился (404) — показываем градиент с инициалами,
  // а не «сломанную картинку». Сбрасывается при смене адреса картинки.
  // «Аватарки не грузятся»: иногда браузер кэширует временный сбой сети —
  // при ошибке делаем ОДНУ повторную попытку с новым параметром.
  const [broken, setBroken] = useState(false);
  const [retried, setRetried] = useState(false);
  useEffect(() => {
    setBroken(false);
    setRetried(false);
  }, [src]);
  const showImg = !!src && !broken;
  const imgSrc =
    src && retried
      ? `${src}${src.includes("?") ? "&" : "?"}r=1`
      : src ?? undefined;
  return (
    <div className={`relative shrink-0 ${className}`} style={{ width: size, height: size }}>
      {showImg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imgSrc}
          alt={name}
          loading="eager"
          className="h-full w-full rounded-full object-cover ring-1 ring-white/15"
          draggable={false}
          onError={() => {
            if (!retried) setRetried(true);
            else setBroken(true);
          }}
        />
      ) : (
        <div
          className={`flex h-full w-full items-center justify-center rounded-full bg-gradient-to-br ${paletteFor(
            name,
          )} font-semibold text-white ring-1 ring-white/15`}
          style={{ fontSize: size * 0.38 }}
        >
          {initials(name)}
        </div>
      )}
      {online !== undefined && (
        <span
          className={`absolute right-0 bottom-0 h-3 w-3 rounded-full border-2 border-[#16181c] ${
            online ? "bg-emerald-400 animate-pulse-dot" : "bg-zinc-500"
          }`}
          style={{ transform: "translate(2px, 2px)" }}
        />
      )}
    </div>
  );
}
