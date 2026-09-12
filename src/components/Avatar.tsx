"use client";

import { useEffect, useState } from "react";

const PALETTES = [
  "from-violet-500 to-fuchsia-500",
  "from-cyan-500 to-blue-600",
  "from-emerald-500 to-teal-600",
  "from-amber-500 to-orange-600",
  "from-rose-500 to-pink-600",
  "from-indigo-500 to-violet-600",
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
  const [broken, setBroken] = useState(false);
  useEffect(() => {
    setBroken(false);
  }, [src]);
  const showImg = !!src && !broken;
  return (
    <div className={`relative shrink-0 ${className}`} style={{ width: size, height: size }}>
      {showImg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src ?? undefined}
          alt={name}
          className="h-full w-full rounded-full object-cover ring-1 ring-white/15"
          draggable={false}
          onError={() => setBroken(true)}
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
          className={`absolute right-0 bottom-0 h-3 w-3 rounded-full border-2 border-[#0a0a14] ${
            online ? "bg-emerald-400 animate-pulse-dot" : "bg-zinc-500"
          }`}
          style={{ transform: "translate(2px, 2px)" }}
        />
      )}
    </div>
  );
}
