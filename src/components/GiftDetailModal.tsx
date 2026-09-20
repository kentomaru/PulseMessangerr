"use client";

/**
 * Детали подарка — единый экран для чата, карточки пользователя и своего
 * профиля: большая иконка/текстура, кто подарил (аватарка + ник), время и подпись.
 * Для NFT — особая рамка и бейдж «NFT · Limited». Владелец может закрепить
 * подарок в витрине профиля.
 */
import { useEffect, useState } from "react";
import { Dices, Gift, Loader2, Pin, Star, UserRound, X } from "lucide-react";
import Avatar from "./Avatar";
import { findGift, variantName } from "@/lib/gifts";
import NftFigure from "./NftFigure";
import { api } from "@/lib/api";

export default function GiftDetailModal({
  giftKey,
  note,
  senderName,
  senderAvatarUrl,
  /** true — отправитель скрыл имя (для всех, кроме получателя). */
  anonymous = false,
  createdAt,
  giftId,
  pinned = false,
  /** Расцветка NFT (0–4). */
  variant = 0,
  /** Подарен или выигран в рулетке. */
  source = "gift",
  /** Владелец витрины (может закреплять). */
  canPin = false,
  onPinned,
  onClose,
}: {
  giftKey: string;
  note?: string | null;
  senderName?: string | null;
  senderAvatarUrl?: string | null;
  anonymous?: boolean;
  createdAt?: string | null;
  giftId?: string;
  pinned?: boolean;
  variant?: number;
  source?: "gift" | "roulette";
  canPin?: boolean;
  onPinned?: (v: boolean) => void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [isPinned, setIsPinned] = useState(pinned);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  const gift = findGift(giftKey);
  if (!gift) return null;
  const when = createdAt
    ? new Date(createdAt).toLocaleString("ru-RU", {
        day: "numeric",
        month: "long",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  const togglePin = async () => {
    if (!giftId || busy) return;
    setBusy(true);
    try {
      const d = await api<{ pinned: boolean }>(`/api/gifts/${giftId}`, {
        method: "PATCH",
        body: JSON.stringify({ pinned: !isPinned }),
      });
      setIsPinned(d.pinned);
      onPinned?.(d.pinned);
    } catch {
      /* сервер поправит при следующем открытии */
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[96] grid place-items-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className={`glass-strong w-full max-w-xs rounded-[1.6rem] p-5 shadow-2xl ${
          gift.nft ? "ring-1 ring-amber-300/50" : ""
        }`}
      >
        <div className="flex items-center justify-between pb-2">
          <p className="font-display text-[15px] font-bold">
{gift.live ? "Живой подарок" : gift.nft ? "NFT-подарок" : "Подарок"}
          </p>
          <button onClick={onClose} className="rounded-full bg-white/10 p-1.5 text-white/70 transition-colors hover:bg-white/15">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div
          className={`gift-shine relative mx-auto grid aspect-square w-44 place-items-center overflow-hidden rounded-3xl border bg-gradient-to-br ${gift.bg} ${
            gift.nft ? "border-amber-300/50" : "border-white/10"
          }`}
        >
          {gift.img ? (
            <NftFigure gift={gift} size={168} rounded="rounded-2xl" variant={variant} full />
          ) : (
            <span
              className={`${gift.anim ?? "gift-anim"} h-28 w-28 [&>svg]:h-full [&>svg]:w-full`}
              dangerouslySetInnerHTML={{ __html: gift.icon }}
            />
          )}
          {gift.nft && (
            <span className="absolute top-2 left-2 rounded-full bg-black/60 px-2 py-0.5 text-[9px] font-bold tracking-wider text-amber-300 uppercase backdrop-blur">
              NFT · {gift.edition} шт
            </span>
          )}
        </div>
        <p className="pt-3 text-center text-[16px] font-bold">
          {gift.name}
          {gift.nft && variant > 0 ? <span className="text-white/50"> · {variantName(variant)}</span> : null}
        </p>
        <p className="flex items-center justify-center gap-1 pt-0.5 text-[12px] font-bold text-amber-300">
          <Star className="h-3 w-3" /> {gift.price} звёзд
        </p>

        {/* Выигрыш в рулетке */}
        {source === "roulette" ? (
          <div className="mt-3 flex items-center gap-3 rounded-2xl border border-amber-300/30 bg-amber-300/10 px-3 py-2.5">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-amber-300/20 text-amber-300">
              <Dices className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold text-amber-200">Выигран в рулетке NFT</span>
              {when && <span className="block text-[11px] text-white/40">{when}</span>}
            </span>
          </div>
        ) : null}

        {/* Кто подарил: аватарка + ник + время — как в ТГ */}
        {source !== "roulette" && (
        <div className="mt-3 flex items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.04] px-3 py-2.5">
          {anonymous ? (
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/10 text-white/50">
              <UserRound className="h-5 w-5" />
            </span>
          ) : (
            <Avatar name={senderName || "?"} src={senderAvatarUrl ?? null} size={40} />
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-semibold">
              {anonymous ? "Аноним" : senderName || "—"}
            </span>
            {when && <span className="block text-[11px] text-white/40">{when}</span>}
          </span>
          <Gift className="h-4 w-4 shrink-0 text-amber-200/70" />
        </div>
        )}

        {note && (
          <p className="mt-2 rounded-xl border border-white/8 bg-white/[0.04] px-3 py-2 text-[12px] leading-relaxed text-white/75">
            «{note}»
          </p>
        )}

        {canPin && giftId && (
          <button
            onClick={() => void togglePin()}
            disabled={busy}
            className={`mt-3 flex w-full items-center justify-center gap-2 rounded-2xl py-2.5 text-[13px] font-semibold transition-colors disabled:opacity-50 ${
              isPinned
                ? "bg-amber-300/20 text-amber-200 hover:bg-amber-300/30"
                : "bg-white/10 text-white/80 hover:bg-white/15"
            }`}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pin className="h-4 w-4" />}
            {isPinned ? "Открепить из витрины" : "Закрепить в витрине"}
          </button>
        )}
      </div>
    </div>
  );
}
