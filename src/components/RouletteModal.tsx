"use client";

import { useEffect, useRef, useState } from "react";
import { Dices, Loader2, Timer, X } from "lucide-react";
import { ModalShell } from "./ProfileModal";
import { api } from "@/lib/api";
import { findGift, variantName } from "@/lib/gifts";
import NftFigure from "./NftFigure";

type PrizeInfo = { key: string; name: string; img?: string; price: number; chance: number };
type SpinResult = {
  id: string;
  giftKey: string;
  name: string;
  img?: string;
  price: number;
  edition?: number;
  variant: number;
  variantName: string;
};

/**
 * Рулетка NFT: бесплатный спин раз в 24 часа.
 * Таймер хранится на сервере — перезагрузка страницы его НЕ сбрасывает
 * (работает как таймеры голосовых сообщений).
 */
export default function RouletteModal({ onClose }: { onClose: () => void }) {
  const [prizes, setPrizes] = useState<PrizeInfo[]>([]);
  const [available, setAvailable] = useState(false);
  const [readyAt, setReadyAt] = useState<number | null>(null);
  const [left, setLeft] = useState("");
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<SpinResult | null>(null);
  const [error, setError] = useState("");
  const [reelOffset, setReelOffset] = useState(0);
  const [reelTiles, setReelTiles] = useState<PrizeInfo[]>([]);
  const [reelOn, setReelOn] = useState(false);
  const tileW = 96; // px на тайл + gap
  const mounted = useRef(true);

  const load = async () => {
    try {
      const d = await api<{ available: boolean; readyAt: string | null; now: string; prizes: PrizeInfo[] }>(
        "/api/roulette",
      );
      if (!mounted.current) return;
      setPrizes(d.prizes);
      setAvailable(d.available);
      setReadyAt(d.readyAt ? new Date(d.readyAt).getTime() : null);
    } catch {
      setError("Не удалось загрузить рулетку");
    }
  };
  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Тикающий таймер до следующего спина
  useEffect(() => {
    const t = window.setInterval(() => {
      if (readyAt == null) {
        setLeft("");
        setAvailable(true);
        return;
      }
      const ms = readyAt - Date.now();
      if (ms <= 0) {
        setLeft("");
        setAvailable(true);
        setReadyAt(null);
        return;
      }
      setAvailable(false);
      const h = Math.floor(ms / 3_600_000);
      const m = Math.floor((ms % 3_600_000) / 60_000);
      const s = Math.floor((ms % 60_000) / 1000);
      setLeft(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`);
    }, 500);
    return () => window.clearInterval(t);
  }, [readyAt]);

  const spin = async () => {
    if (spinning || !available) return;
    setError("");
    setResult(null);
    setSpinning(true);
    try {
      const d = await api<{ ok: boolean; prize: SpinResult; nextReadyAt: string }>("/api/roulette", {
        method: "POST",
      });
      // Лента рулетки: 30 тайлов, приз на позиции 24
      const WIN = 24;
      const tiles: PrizeInfo[] = [];
      for (let i = 0; i < 30; i++) {
        if (i === WIN) {
          const g = findGift(d.prize.giftKey);
          tiles.push({ key: d.prize.giftKey, name: g?.name ?? d.prize.name, img: g?.img, price: d.prize.price, chance: 0 });
        } else {
          const pool = prizes.length ? prizes : [];
          tiles.push(pool[Math.floor(Math.random() * pool.length)] ?? { key: "", name: "?", price: 0, chance: 0 });
        }
      }
      setReelTiles(tiles);
      setReelOn(false);
      setReelOffset(0);
      // старт прокрутки на следующем кадре
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          setReelOn(true);
          setReelOffset(WIN * tileW + tileW / 2 - 148);
        }),
      );
      window.setTimeout(() => {
        if (!mounted.current) return;
        setSpinning(false);
        setResult(d.prize);
        setReadyAt(new Date(d.nextReadyAt).getTime());
        setAvailable(false);
      }, 3900);
    } catch (e) {
      setSpinning(false);
      setError(e instanceof Error ? e.message : "Не удалось крутнуть");
    }
  };

  return (
    <ModalShell onClose={onClose} wide>
      <div className="p-6">
        <div className="flex items-center justify-between pb-1">
          <p className="font-display flex items-center gap-2 text-lg font-bold">
            <Dices className="h-5 w-5 text-amber-300" /> Рулетка NFT
          </p>
          <button onClick={onClose} className="rounded-full bg-white/10 p-1.5 text-white/70">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="pb-4 text-sm text-white/45">
          Бесплатный спин раз в 24 часа. Выпадают редкие NFT — вплоть до Феникса за 50 000 ⭐.
        </p>

        {/* Лента рулетки */}
        <div className="relative mb-4 h-28 overflow-hidden rounded-2xl border border-white/10 bg-black/30">
          <div className="pointer-events-none absolute top-0 left-1/2 z-10 h-full w-0.5 -translate-x-1/2 bg-amber-300/90 shadow-[0_0_12px_rgba(252,211,77,0.9)]" />
          {reelTiles.length === 0 ? (
            <div className="grid h-full place-items-center text-sm text-white/35">
              {spinning ? <Loader2 className="h-5 w-5 animate-spin" /> : "Нажмите «Крутить» — и лента поедет"}
            </div>
          ) : (
            <div
              className="absolute top-1/2 left-[148px] flex -translate-y-1/2 gap-1.5"
              style={{
                transform: `translateX(-${reelOffset}px) translateY(-50%)`,
                transition: reelOn ? "transform 3.7s cubic-bezier(0.12, 0.8, 0.16, 1)" : "none",
              }}
            >
              {reelTiles.map((t, i) => {
                const g = findGift(t.key);
                return (
                  <div
                    key={i}
                    className="grid h-24 w-[96px] shrink-0 place-items-center overflow-hidden rounded-xl border border-white/10 bg-white/[0.04]"
                  >
                    {g?.img ? (
                      <NftFigure gift={g} size={72} rounded="rounded-lg" />
                    ) : (
                      <span className="text-xl">❓</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Результат */}
        {result && (
          <div className="mb-4 flex items-center gap-3 rounded-2xl border border-amber-300/40 bg-amber-300/10 p-3">
            {result.img && findGift(result.giftKey)?.img ? (
              <NftFigure gift={findGift(result.giftKey)!} size={56} rounded="rounded-xl" variant={result.variant} />
            ) : null}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-bold">
                Выпал: {result.name} · {variantName(result.variant)}
              </p>
              <p className="text-xs text-amber-300">
                {result.price} ⭐ {result.edition ? `· тираж ${result.edition} шт` : ""} — уже в вашей витрине!
              </p>
            </div>
          </div>
        )}

        {error && <p className="mb-3 text-sm text-rose-300">{error}</p>}

        <button
          onClick={() => void spin()}
          disabled={spinning || !available}
          className="btn-gradient flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-[15px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {spinning ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : available ? (
            <Dices className="h-4 w-4" />
          ) : (
            <Timer className="h-4 w-4" />
          )}
          {spinning ? "Крутим…" : available ? "Крутить рулетку" : `Следующий спин через ${left}`}
        </button>

        {/* Призы и шансы */}
        <p className="pt-4 pb-2 text-[10px] font-semibold tracking-wide text-white/35 uppercase">
          Призы и шансы
        </p>
        <div className="grid grid-cols-3 gap-2">
          {prizes.map((p) => {
            const g = findGift(p.key);
            return (
              <div
                key={p.key}
                className="flex flex-col items-center gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-2"
              >
                {g ? <NftFigure gift={g} size={48} rounded="rounded-lg" /> : null}
                <p className="max-w-full truncate text-[11px] font-medium">{p.name}</p>
                <p className="text-[10px] text-amber-300">{p.price} ⭐</p>
                <p className="text-[10px] text-white/35">{p.chance}%</p>
              </div>
            );
          })}
        </div>
      </div>
    </ModalShell>
  );
}
