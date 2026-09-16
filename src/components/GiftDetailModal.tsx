"use client";

/**
 * Детали подарка — единый экран для чата, карточки пользователя и своего
 * профиля: большая иконка, кто подарил (аватарка + ник), время и подпись.
 * Открывается мгновенно — все данные уже на руках, никаких запросов.
 */
import { Gift, Star, UserRound, X } from "lucide-react";
import Avatar from "./Avatar";
import { findGift } from "@/lib/gifts";

export default function GiftDetailModal({
  giftKey,
  note,
  senderName,
  senderAvatarUrl,
  /** true — отправитель скрыл имя (для всех, кроме получателя). */
  anonymous = false,
  createdAt,
  onClose,
}: {
  giftKey: string;
  note?: string | null;
  senderName?: string | null;
  senderAvatarUrl?: string | null;
  anonymous?: boolean;
  createdAt?: string | null;
  onClose: () => void;
}) {
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
  return (
    <div className="fixed inset-0 z-[96] grid place-items-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="glass-strong w-full max-w-xs rounded-[1.6rem] p-5 shadow-2xl"
      >
        <div className="flex items-center justify-between pb-2">
          <p className="font-display text-[15px] font-bold">Подарок</p>
          <button onClick={onClose} className="rounded-full bg-white/10 p-1.5 text-white/70 transition-colors hover:bg-white/15">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className={`gift-shine relative mx-auto grid aspect-square w-44 place-items-center overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br ${gift.bg}`}>
          <span
            className="gift-anim h-28 w-28 [&>svg]:h-full [&>svg]:w-full"
            dangerouslySetInnerHTML={{ __html: gift.icon }}
          />
        </div>
        <p className="pt-3 text-center text-[16px] font-bold">{gift.name}</p>
        <p className="flex items-center justify-center gap-1 pt-0.5 text-[12px] font-bold text-amber-300">
          <Star className="h-3 w-3" /> {gift.price} звёзд
        </p>

        {/* Кто подарил: аватарка + ник + время — как в ТГ */}
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

        {note && (
          <p className="mt-2 rounded-xl border border-white/8 bg-white/[0.04] px-3 py-2 text-[12px] leading-relaxed text-white/75">
            «{note}»
          </p>
        )}
      </div>
    </div>
  );
}
