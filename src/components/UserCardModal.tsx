"use client";

import { useEffect, useState } from "react";
import { CalendarDays, MessageSquareLock, MessageSquareText, PhoneOff } from "lucide-react";
import Avatar, { paletteFor } from "./Avatar";
import { ModalShell } from "./ProfileModal";
import type { PublicUser } from "@/lib/types";
import { lastSeenLabel } from "@/lib/format";

type Props = {
  user: PublicUser;
  onClose: () => void;
  onMessage: () => void;
};

export default function UserCardModal({ user, onClose, onMessage }: Props) {
  // Баннер мог не дожить до текущего запуска (битый файл) — тогда градиент
  // вместо «сломанной картинки».
  const [bannerBroken, setBannerBroken] = useState(false);
  useEffect(() => {
    setBannerBroken(false);
  }, [user.bannerUrl]);
  const showBanner = !!user.bannerUrl && !bannerBroken;

  return (
    <ModalShell onClose={onClose}>
      <div
        className={`relative h-32 w-full overflow-hidden ${
          showBanner ? "" : `bg-gradient-to-br ${paletteFor(user.username)}`
        }`}
      >
        {showBanner && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.bannerUrl ?? undefined}
            alt="Баннер"
            className="h-full w-full object-cover"
            onError={() => setBannerBroken(true)}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/55 to-transparent" />
      </div>

      <div className="relative -mt-10 flex justify-center">
        <span className="rounded-full ring-4 ring-[#0d0d18]">
          <Avatar name={user.displayName} src={user.avatarUrl} size={86} online={user.online} />
        </span>
      </div>

      <div className="px-7 pt-3 pb-7 text-center">
        <h3 className="font-display text-xl font-bold">{user.displayName}</h3>
        <p className="mt-0.5 text-sm text-white/40">@{user.username}</p>
        <p className={`mt-1.5 text-xs font-medium ${user.online ? "text-emerald-400" : "text-white/35"}`}>
          {lastSeenLabel(user.lastSeenAt, user.online)}
        </p>

        {/* Подсказки о приватности собеседника */}
        {(!user.allowCalls || !user.allowMessages) && (
          <div className="mt-2.5 flex flex-wrap justify-center gap-1.5">
            {!user.allowCalls && (
              <span className="flex items-center gap-1.5 rounded-full border border-white/8 bg-white/5 px-2.5 py-1 text-[11px] text-white/50">
                <PhoneOff className="h-3 w-3" />
                Не принимает звонки
              </span>
            )}
            {!user.allowMessages && (
              <span className="flex items-center gap-1.5 rounded-full border border-white/8 bg-white/5 px-2.5 py-1 text-[11px] text-white/50">
                <MessageSquareLock className="h-3 w-3" />
                Новые чаты закрыты
              </span>
            )}
          </div>
        )}

        {user.bio && (
          <p className="mx-auto mt-4 max-w-xs text-sm leading-relaxed text-white/65">{user.bio}</p>
        )}

        <p className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-white/25">
          <CalendarDays className="h-3 w-3" />в Pulse с{" "}
          {new Date(user.createdAt).toLocaleDateString("ru-RU", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </p>

        <button
          onClick={onMessage}
          className="btn-gradient mt-6 flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-[15px] font-semibold text-white"
        >
          <MessageSquareText className="h-4.5 w-4.5" />
          Написать сообщение
        </button>
      </div>
    </ModalShell>
  );
}
