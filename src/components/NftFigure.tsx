import type { Gift } from "@/lib/gifts";
import { variantFilter } from "@/lib/gifts";

/**
 * Хореография «жизни» каждого NFT — своя для каждого:
 * дракон бросается и дышит огнём, кот игриво раскачивается,
 * ракета стартует, кит дрейфует, они содрогается, феникс взмывает…
 */
type Choreo = {
  /** Класс анимации самой картинки. */
  anim: string;
  /** Частицы вокруг: пламя/искры/сердца/пузыри/угольки/мороз. */
  emitter?: "flames" | "sparks" | "hearts" | "bubbles" | "embers" | "frost";
  /** Цвет пульсирующего свечения. */
  glow: string;
};

const CHOREO: Record<string, Choreo> = {
  nft_dragon: { anim: "nftx-dragon", emitter: "flames", glow: "rgba(255,140,40,0.55)" },
  nft_cat: { anim: "nftx-cat", emitter: "sparks", glow: "rgba(255,225,140,0.5)" },
  nft_bear: { anim: "nftx-bear", emitter: "sparks", glow: "rgba(255,200,120,0.5)" },
  nft_heart: { anim: "nftx-heart", emitter: "hearts", glow: "rgba(255,120,170,0.55)" },
  nft_rocket: { anim: "nftx-rocket", emitter: "flames", glow: "rgba(140,180,255,0.5)" },
  nft_crown: { anim: "nftx-crown", emitter: "sparks", glow: "rgba(255,215,90,0.55)" },
  nft_whale: { anim: "nftx-whale", emitter: "bubbles", glow: "rgba(120,160,255,0.5)" },
  nft_oni: { anim: "nftx-oni", emitter: "embers", glow: "rgba(200,90,255,0.55)" },
  nft_pegasus: { anim: "nftx-pegasus", emitter: "sparks", glow: "rgba(190,160,255,0.55)" },
  nft_wolf: { anim: "nftx-wolf", emitter: "frost", glow: "rgba(150,210,255,0.5)" },
  nft_diamond: { anim: "nftx-diamond", emitter: "sparks", glow: "rgba(160,220,255,0.6)" },
  nft_phoenix: { anim: "nftx-phoenix", emitter: "embers", glow: "rgba(255,150,40,0.6)" },
};

const FALLBACK: Choreo = { anim: "nftx-idle", emitter: "sparks", glow: "rgba(255,220,120,0.5)" };

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

const BUBBLES = [
  { l: 12, d: 0, s: 0.8, dur: 3.0 },
  { l: 30, d: 0.8, s: 1.1, dur: 3.6 },
  { l: 52, d: 0.3, s: 0.7, dur: 2.8 },
  { l: 70, d: 1.4, s: 1.0, dur: 3.3 },
  { l: 86, d: 2.0, s: 0.6, dur: 2.6 },
];

const EMBERS = [
  { l: 20, d: 0, s: 0.7, c: "#ffb066" },
  { l: 40, d: 0.5, s: 1.0, c: "#ff7a3d" },
  { l: 58, d: 1.0, s: 0.8, c: "#ffd27a" },
  { l: 74, d: 1.6, s: 1.1, c: "#ff9052" },
  { l: 32, d: 2.1, s: 0.6, c: "#ffbe8a" },
  { l: 64, d: 2.6, s: 0.9, c: "#ff6a2a" },
];

const FROST = [
  { l: 15, t: 18, d: 0, s: 0.7 },
  { l: 80, t: 25, d: 0.9, s: 1.0 },
  { l: 68, t: 70, d: 1.7, s: 0.8 },
  { l: 12, t: 64, d: 2.5, s: 0.9 },
  { l: 48, t: 10, d: 1.2, s: 0.6 },
];

/**
 * «Живой» NFT-подарок: у каждого — своя анимация и свои частицы.
 * Все размеры в em (font-size = size/10), так что компонент одинаково
 * жив и в плитке 48px, и в большом просмотре.
 */
export default function NftFigure({
  gift,
  size,
  rounded = "rounded-2xl",
  variant,
}: {
  gift: Gift;
  size: number;
  rounded?: string;
  /** Расцветка 0–4 (для NFT с вариантами). */
  variant?: number;
}) {
  const ch = CHOREO[gift.key] ?? FALLBACK;
  return (
    <div className={`relative ${rounded}`} style={{ width: size, height: size, fontSize: size / 10 }}>
      <div
        className="nft-glow"
        style={{ background: `radial-gradient(circle, ${ch.glow} 0%, transparent 62%)` }}
      />
      <div className={`nft-wrap ${ch.anim}`} style={{ position: "absolute", inset: 0 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={gift.img}
          alt={gift.name}
          draggable={false}
          className={`h-full w-full ${rounded} object-cover`}
          style={{ filter: variantFilter(variant) }}
        />
      </div>
      {ch.emitter === "flames" &&
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
                "--fs": f.s,
              } as React.CSSProperties
            }
          />
        ))}
      {ch.emitter === "sparks" &&
        SPARKS.map((s, i) => (
          <span
            key={i}
            className="nft-spark"
            style={
              { left: `${s.l}%`, top: `${s.t}%`, animationDelay: `${s.d}s`, "--ss": s.s } as React.CSSProperties
            }
          />
        ))}
      {ch.emitter === "hearts" &&
        HEARTS.map((h, i) => (
          <svg
            key={i}
            viewBox="0 0 24 24"
            fill="#ff7aa8"
            className="nft-heart"
            style={{ left: `${h.l}%`, animationDelay: `${h.d}s`, "--hs": h.s } as React.CSSProperties}
          >
            <path d="M12 21s-7.5-4.9-10-9.5C.6 8 2.3 4.5 5.8 4.5c2 0 3.4 1 4.2 2.4.8-1.4 2.2-2.4 4.2-2.4 3.5 0 5.2 3.5 3.8 7-2.5 4.6-10 9.5-10 9.5z" />
          </svg>
        ))}
      {ch.emitter === "bubbles" &&
        BUBBLES.map((b, i) => (
          <span
            key={i}
            className="nft-bubble"
            style={
              {
                left: `${b.l}%`,
                animationDelay: `${b.d}s`,
                animationDuration: `${b.dur}s`,
                "--bs": b.s,
              } as React.CSSProperties
            }
          />
        ))}
      {ch.emitter === "embers" &&
        EMBERS.map((e, i) => (
          <span
            key={i}
            className="nft-ember"
            style={
              {
                left: `${e.l}%`,
                background: e.c,
                boxShadow: `0 0 0.5em ${e.c}`,
                animationDelay: `${e.d}s`,
                "--es": e.s,
              } as React.CSSProperties
            }
          />
        ))}
      {ch.emitter === "frost" &&
        FROST.map((f, i) => (
          <span
            key={i}
            className="nft-frost"
            style={
              { left: `${f.l}%`, top: `${f.t}%`, animationDelay: `${f.d}s`, "--fs2": f.s } as React.CSSProperties
            }
          />
        ))}
    </div>
  );
}
