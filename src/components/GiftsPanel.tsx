"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Gift, Pin, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { ModalShell } from "./ProfileModal";
import GiftDetailModal from "./GiftDetailModal";
import NftFigure from "./NftFigure";
import { findGift, type GiftItem } from "@/lib/gifts";

/**
 * Отдельная плашка подарков: окно с листанием по страницам (как альбом),
 * вместо сетки прямо в профиле. Стрелки, точки-страницы, клик — детали.
 */
export default function GiftsPanel({
  title,
  gifts,
  canPin = false,
  onClose,
}: {
  title: string;
  gifts: GiftItem[];
  canPin?: boolean;
  onClose: () => void;
}) {
  const PER_PAGE = 6;
  const [page, setPage] = useState(0);
  const [list, setList] = useState<GiftItem[]>(gifts);
  const [detail, setDetail] = useState<GiftItem | null>(null);

  // закреплённые — первыми
  const sorted = [...list].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned));
  const pages = Math.max(1, Math.ceil(sorted.length / PER_PAGE));
  const cur = Math.min(page, pages - 1);
  const slice = sorted.slice(cur * PER_PAGE, cur * PER_PAGE + PER_PAGE);

  // стрелки клавиатуры листают, Esc закрывает (вложенные окна — сами)
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (detail) return;
      if (e.key === "ArrowRight") setPage((p) => Math.min(pages - 1, p + 1));
      if (e.key === "ArrowLeft") setPage((p) => Math.max(0, p - 1));
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [pages, detail]);

  return (
    <ModalShell onClose={onClose} wide>
      <div className="p-6">
        <div className="flex items-center justify-between pb-4">
          <p className="font-display flex items-center gap-2 text-lg font-bold">
            <Gift className="h-5 w-5 text-amber-300" /> {title} · {sorted.length}
          </p>
          <button onClick={onClose} className="rounded-full bg-white/10 p-1.5 text-white/70">
            <X className="h-4 w-4" />
          </button>
        </div>

        {sorted.length === 0 ? (
          <p className="py-10 text-center text-sm text-white/40">Подарков пока нет</p>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={cur === 0}
                title="Назад"
                className="glass rounded-xl p-2 text-white/70 transition-colors hover:bg-white/10 disabled:opacity-30"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="min-h-[240px] flex-1">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={cur}
                    initial={{ opacity: 0, x: 24 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -24 }}
                    transition={{ duration: 0.18 }}
                    className="grid grid-cols-3 gap-2.5"
                  >
                    {slice.map((g) => {
                      const gd = findGift(g.giftKey);
                      if (!gd) return null;
                      return (
                        <button
                          key={g.id}
                          onClick={() => setDetail(g)}
                          title={`${gd.name} — детали`}
                          className={`gift-pop gift-shine relative flex aspect-square items-center justify-center overflow-hidden rounded-2xl border bg-gradient-to-br transition-transform hover:scale-105 ${
                            gd.nft || gd.live ? "border-amber-300/40" : "border-white/10"
                          } ${gd.bg}`}
                        >
                          {gd.img ? (
                            <NftFigure gift={gd} size={84} rounded="rounded-xl" variant={g.variant} />
                          ) : (
                            <span
                              className="gift-anim h-12 w-12 [&>svg]:h-full [&>svg]:w-full"
                              dangerouslySetInnerHTML={{ __html: gd.icon }}
                            />
                          )}
                          {g.pinned && (
                            <span className="absolute top-1 right-1 grid h-4 w-4 place-items-center rounded-full bg-black/60 text-amber-300 backdrop-blur">
                              <Pin className="h-2.5 w-2.5" />
                            </span>
                          )}
                          {(gd.nft || gd.live) && (
                            <span
                              className={`absolute right-1 bottom-1 rounded-full bg-black/60 px-1.5 py-px text-[8px] font-bold tracking-wider uppercase backdrop-blur ${
                                gd.live ? "text-rose-300" : "text-amber-300"
                              }`}
                            >
                              {gd.live ? "LIVE" : "NFT"}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </motion.div>
                </AnimatePresence>
              </div>
              <button
                onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}
                disabled={cur >= pages - 1}
                title="Вперёд"
                className="glass rounded-xl p-2 text-white/70 transition-colors hover:bg-white/10 disabled:opacity-30"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            {/* точки страниц */}
            {pages > 1 && (
              <div className="flex justify-center gap-1.5 pt-3">
                {Array.from({ length: pages }).map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setPage(i)}
                    aria-label={`Страница ${i + 1}`}
                    className={`h-1.5 rounded-full transition-all ${
                      i === cur ? "w-5 bg-amber-300" : "w-1.5 bg-white/20 hover:bg-white/40"
                    }`}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {detail && (
        <GiftDetailModal
          giftKey={detail.giftKey}
          note={detail.message}
          senderName={detail.sender?.displayName ?? null}
          senderAvatarUrl={detail.sender?.avatarUrl ?? null}
          anonymous={!!detail.anonymous && !detail.sender}
          createdAt={detail.createdAt}
          giftId={detail.id}
          pinned={!!detail.pinned}
          variant={detail.variant ?? 0}
          source={detail.source ?? "gift"}
          canPin={canPin}
          onPinned={(v) =>
            setList((ls) => ls.map((x) => (x.id === detail.id ? { ...x, pinned: v } : x)))
          }
          onClose={() => setDetail(null)}
        />
      )}
    </ModalShell>
  );
}
