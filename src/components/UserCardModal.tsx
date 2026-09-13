"use client";

import { useEffect, useState } from "react";
import {
  Ban,
  CalendarDays,
  Loader2,
  MessageSquareLock,
  MessageSquareText,
  PhoneOff,
  UserPlus,
} from "lucide-react";
import Avatar, { paletteFor } from "./Avatar";
import StatusEmoji from "./StatusEmoji";
import { ModalShell } from "./ProfileModal";
import { bannerStyle, isFileBanner } from "@/lib/wallpapers";
import { api } from "@/lib/api";
import type { PublicUser } from "@/lib/types";
import { lastSeenLabel } from "@/lib/format";

type Props = {
  user: PublicUser;
  onClose: () => void;
  onMessage: () => void;
};

export default function UserCardModal({ user, onClose, onMessage }: Props) {
  // Баннер мог не дожить до текущего запуска (битый файл) — тогда градиент
  // вместо «сломанной картинки». При ошибке сети делаем ОДНУ повторную
  // попытку с новым параметром — «баннеры хуёво грузят» чаще всего именно
  // временный сбой/кэш.
  // Отношения с этим пользователем: друзья/заявки + блокировка
  const [rel, setRel] = useState<"none" | "friend" | "incoming" | "outgoing" | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [relBusy, setRelBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    api<{ friends: { id: string }[]; incoming: { id: string }[]; outgoing: { id: string }[] }>(
      "/api/friends",
    )
      .then((d) => {
        if (!alive) return;
        setRel(
          d.friends.some((f) => f.id === user.id)
            ? "friend"
            : d.incoming.some((f) => f.id === user.id)
            ? "incoming"
            : d.outgoing.some((f) => f.id === user.id)
            ? "outgoing"
            : "none",
        );
      })
      .catch(() => alive && setRel("none"));
    api<{ blocked: string[] }>("/api/users/block")
      .then((d) => alive && setBlocked(d.blocked.includes(user.id)))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [user.id]);

  const friendAct = async (action: string) => {
    setRelBusy(true);
    try {
      await api("/api/friends", { method: "POST", body: JSON.stringify({ userId: user.id, action }) });
      const d = await api<{ friends: { id: string }[]; incoming: { id: string }[]; outgoing: { id: string }[] }>(
        "/api/friends",
      );
      setRel(
        d.friends.some((f) => f.id === user.id)
          ? "friend"
          : d.incoming.some((f) => f.id === user.id)
          ? "incoming"
          : d.outgoing.some((f) => f.id === user.id)
          ? "outgoing"
          : "none",
      );
    } finally {
      setRelBusy(false);
    }
  };

  const toggleBlock = async () => {
    setRelBusy(true);
    try {
      await api("/api/users/block", {
        method: "POST",
        body: JSON.stringify({ userId: user.id, block: !blocked }),
      });
      setBlocked(!blocked);
    } finally {
      setRelBusy(false);
    }
  };

  const [bannerBroken, setBannerBroken] = useState(false);
  const [bannerRetried, setBannerRetried] = useState(false);
  useEffect(() => {
    setBannerBroken(false);
    setBannerRetried(false);
  }, [user.bannerUrl]);
  const showBanner = !!user.bannerUrl && !bannerBroken;
  // Живой/пресетный баннер рисуется CSS-фоном (анимация), файл — картинкой
  const bannerIsFile = isFileBanner(user.bannerUrl);
  const bannerSrc =
    user.bannerUrl && bannerRetried
      ? `${user.bannerUrl}${user.bannerUrl.includes("?") ? "&" : "?"}r=1`
      : user.bannerUrl ?? undefined;

  return (
    <ModalShell onClose={onClose}>
      <div
        className={`relative h-32 w-full overflow-hidden ${
          showBanner && !bannerIsFile ? "" : showBanner ? "bg-black/40" : `bg-gradient-to-br ${paletteFor(user.username)}`
        }`}
        style={showBanner && !bannerIsFile ? bannerStyle(user.bannerUrl) : undefined}
      >
        {showBanner && bannerIsFile && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={bannerSrc}
            alt="Баннер"
            loading="eager"
            className="h-full w-full object-cover"
            onError={() => {
              if (!bannerRetried) setBannerRetried(true);
              else setBannerBroken(true);
            }}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/55 to-transparent" />
      </div>

      <div className="relative -mt-10 flex justify-center">
        <span className="rounded-full ring-4 ring-[#1b1e24]">
          <Avatar name={user.displayName} src={user.avatarUrl} size={86} online={user.online} />
        </span>
      </div>

      <div className="px-7 pt-3 pb-7 text-center">
        <h3 className="flex items-center justify-center gap-2">
          <span className="font-display text-xl font-bold">{user.displayName}</span>
          {/* Кастомный статус-эмодзи: эмодзи или анимированная гифка */}
          <StatusEmoji value={user.statusEmoji} size={36} />
        </h3>
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

        {user.birthday && (
          <p className="mt-2 flex items-center justify-center gap-1.5 text-xs text-white/45">
            <CalendarDays className="h-3 w-3" />
            День рождения: {user.birthday}
          </p>
        )}

        <p className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-white/25">
          <CalendarDays className="h-3 w-3" />в Pulse с{" "}
          {new Date(user.createdAt).toLocaleDateString("ru-RU", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </p>

        {/* Друзья: добавить / принять / отменить / убрать */}
        {rel !== null && (
          <div className="mt-4 flex justify-center gap-2">
            {rel === "none" && (
              <button
                onClick={() => void friendAct("request")}
                disabled={relBusy}
                className="flex items-center gap-1.5 rounded-xl bg-[#5865f2] px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-[#4752c4] disabled:opacity-40"
              >
                {relBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                Добавить в друзья
              </button>
            )}
            {rel === "outgoing" && (
              <button
                onClick={() => void friendAct("remove")}
                disabled={relBusy}
                className="rounded-xl bg-white/10 px-4 py-2 text-[13px] font-medium text-white/70 transition-colors hover:bg-white/15 disabled:opacity-40"
              >
                Заявка отправлена · отменить
              </button>
            )}
            {rel === "incoming" && (
              <button
                onClick={() => void friendAct("accept")}
                disabled={relBusy}
                className="rounded-xl bg-emerald-500/80 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-40"
              >
                Принять заявку в друзья
              </button>
            )}
            {rel === "friend" && (
              <button
                onClick={() => void friendAct("remove")}
                disabled={relBusy}
                className="rounded-xl bg-emerald-500/15 px-4 py-2 text-[13px] font-medium text-emerald-300 transition-colors hover:bg-emerald-500/25 disabled:opacity-40"
              >
                В друзьях · убрать
              </button>
            )}
            <button
              onClick={() => void toggleBlock()}
              disabled={relBusy}
              className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-[13px] font-medium transition-colors disabled:opacity-40 ${
                blocked
                  ? "bg-white/10 text-white/70 hover:bg-white/15"
                  : "bg-rose-500/15 text-rose-300 hover:bg-rose-500/25"
              }`}
            >
              <Ban className="h-4 w-4" />
              {blocked ? "Разблокировать" : "Заблокировать"}
            </button>
          </div>
        )}

        <button
          onClick={onMessage}
          className="btn-gradient mt-4 flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-[15px] font-semibold text-white"
        >
          <MessageSquareText className="h-4.5 w-4.5" />
          Написать сообщение
        </button>
      </div>
    </ModalShell>
  );
}
