import type { Gift } from "@/lib/gifts";

/** Тип «жизни» по подарку: пламя / искры / сердечки. */
function nfxKind(key: string): "fire" | "spark" | "heart" {
  if (key === "nft_heart") return "heart";
  if (key === "nft_cat" || key === "nft_bear") return "spark";
  return "fire"; // дракон, ракета, корона
}

const FLAMES = [
  { l: 16, d: 0, dur: 1.05, s: 1.0, c: "#ff6a2a" },
  { l: 34, d: 0.35, dur: 1.3, s: 1.4, c: "#ffb03a" },
  { l: 50, d: 0.12, dur: 0.95, s: 0.85, c: "#ffd257" },
  { l: 66, d: 0.55, dur: 1.2, s: 1.2, c: "#ff7a2a" },
  { l: 26, d: 0.75, dur: 1.35, s: 0.75, c: "#ffca4a" },
  { l: 58, d: 0.9, dur: 1.1, s: 1.05, c: "#ff5a1f" },
];

const SPARKS = [
  { l: 14, t: 22, d: 0, s: 0.9 },
  { l: 78, t: 14, d: 0.6, s: 1.2 },
  { l: 70, t: 66, d: 1.1, s: 0.8 },
  { l: 10, t: 72, d: 0.35, s: 1.0 },
  { l: 46, t: 6, d: 0.85, s: 0.7 },
];

const HEARTS = [
  { l: 18, d: 0, s: 0.9 },
  { l: 44, d: 0.6, s: 1.2 },
  { l: 68, d: 1.1, s: 0.8 },
  { l: 30, d: 1.6, s: 1.0 },
];

const GLOW: Record<string, string> = {
  fire: "rgba(255,150,40,0.55)",
  spark: "rgba(255,225,140,0.5)",
  heart: "rgba(255,120,170,0.5)",
};

/**
 * «Живой» NFT-подарок: парит и покачивается, пульсирует свечением,
 * извергает пламя / рассыпает искры / выпускает сердечки — по типу.
 * Все размеры эффектов в em: font-size ставится от размера картинки,
 * так что один и тот же компонент одинаково жив и в плитке, и в деталях.
 */
export default function NftFigure({
  gift,
  size,
  rounded = "rounded-2xl",
}: {
  gift: Gift;
  size: number;
  rounded?: string;
}) {
  const kind = nfxKind(gift.key);
  return (
    <div
      className={`nft-figure relative ${rounded}`}
      style={{ width: size, height: size, fontSize: size / 10 }}
      aria-hidden={false}
    >
      <div className="nft-glow" style={{ background: `radial-gradient(circle, ${GLOW[kind]} 0%, transparent 62%)` }} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={gift.img}
        alt={gift.name}
        draggable={false}
        className={`absolute inset-0 h-full w-full ${rounded} object-cover`}
      />
      {kind === "fire" &&
        FLAMES.map((f, i) => (
          <span
            key={i}
            className="nft-flame"
            style={
              {
                left: `${f.l}%`,
                background: `linear-gradient(to top, ${f.c} 0%, #ffd97a 55%, transparent 100%)`,
                animationDuration: `${f.dur}s`,
                animationDelay: `${f.d}s`,
                transform: `scale(${f.s})`,
                "--fs": f.s,
              } as React.CSSProperties
            }
          />
        ))}
      {kind === "spark" &&
        SPARKS.map((s, i) => (
          <span
            key={i}
            className="nft-spark"
            style={
              {
                left: `${s.l}%`,
                top: `${s.t}%`,
                animationDelay: `${s.d}s`,
                "--ss": s.s,
              } as React.CSSProperties
            }
          />
        ))}
      {kind === "heart" &&
        HEARTS.map((h, i) => (
          <svg
            key={i}
            viewBox="0 0 24 24"
            fill="#ff7aa8"
            className="nft-heart"
            style={
              {
                left: `${h.l}%`,
                animationDelay: `${h.d}s`,
                "--hs": h.s,
              } as React.CSSProperties
            }
          >
            <path d="M12 21s-7.5-4.9-10-9.5C.6 8 2.3 4.5 5.8 4.5c2 0 3.4 1 4.2 2.4.8-1.4 2.2-2.4 4.2-2.4 3.5 0 5.2 3.5 3.8 7-2.5 4.6-10 9.5-10 9.5z" />
          </svg>
        ))}
    </div>
  );
}
