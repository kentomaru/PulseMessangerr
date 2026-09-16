"use client";

import { useEffect, useState } from "react";
import {
  Ban,
  CalendarDays,
  Copy,
  Gift,
  Loader2,
  Link2,
  MessageSquareLock,
  MessageSquareText,
  PhoneOff,
  Star,
  UserPlus,
  X,
} from "lucide-react";
import Avatar, { paletteFor } from "./Avatar";
import StatusEmoji from "./StatusEmoji";
import { ModalShell } from "./ProfileModal";
import { bannerStyle, isFileBanner } from "@/lib/wallpapers";
import { api } from "@/lib/api";
import type { PublicUser } from "@/lib/types";
import { lastSeenLabel } from "@/lib/format";
import { GIFTS, findGift, type GiftItem } from "@/lib/gifts";

type Props = {
  user: PublicUser;
  onClose: () => void;
  onMessage: () => void;
  /** Id текущего пользователя — чтобы карточка себя не предлагала действия. */
  myId?: string;
};

export default function UserCardModal({ user, onClose, onMessage, myId }: Props) {
  /** Своя карточка («как меня видят другие») — без действий над собой. */
  const isSelf = myId != null && user.id === myId;
  // Баннер мог не дожить до текущего запуска (битый файл) — тогда градиент
  // вместо «сломанной картинки». При ошибке сети делаем ОДНУ повторную
  // попытку с новым параметром — «баннеры хуёво грузят» чаще всего именно
  // временный сбой/кэш.
  // Отношения с этим пользователем: друзья/заявки + блокировка
  const [copiedName, setCopiedName] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [rel, setRel] = useState<"none" | "friend" | "incoming" | "outgoing" | null>(null);
  /** Подарки пользователя и окно выбора подарка. */
  const [userGifts, setUserGifts] = useState<GiftItem[] | null>(null);
  const [giftPicker, setGiftPicker] = useState(false);
  const [giftSent, setGiftSent] = useState(false);
  useEffect(() => {
    let alive = true;
    api<{ gifts: GiftItem[] }>(`/api/gifts?userId=${user.id}`)
      .then((d) => alive && setUserGifts(d.gifts))
      .catch(() => alive && setUserGifts([]));
    return () => {
      alive = false;
    };
  }, [user.id]);
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
        <div className="mt-0.5 flex items-center justify-center gap-2">
          <button
            onClick={() => {
              const ok = navigator.clipboard?.writeText(`@${user.username}`);
              void ok;
              setCopiedName(true);
              setTimeout(() => setCopiedName(false), 1500);
            }}
            title="Скопировать юзернейм"
            className="inline-flex items-center gap-1 text-sm text-white/40 transition-colors hover:text-white/75"
          >
            @{user.username}
            {copiedName ? (
              <span className="text-[10px] text-emerald-300">скопировано</span>
            ) : (
              <Copy className="h-3 w-3 opacity-50" />
            )}
          </button>
          {/* Инвайт-ссылка на профиль человека */}
          <button
            onClick={() => {
              const url = `${window.location.origin}${window.location.pathname}#user=${user.username}`;
              void navigator.clipboard?.writeText(url).then(() => {
                setCopiedLink(true);
                setTimeout(() => setCopiedLink(false), 1500);
              });
            }}
            title="Скопировать ссылку на профиль"
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors ${
              copiedLink
                ? "border-emerald-300/40 text-emerald-300"
                : "border-white/10 bg-white/5 text-white/45 hover:bg-white/10 hover:text-white/80"
            }`}
          >
            <Link2 className="h-2.5 w-2.5" />
            {copiedLink ? "Ссылка скопирована ✓" : "Ссылка"}
          </button>
        </div>
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
            {(() => {
              // Возраст считаем автоматически (ДД.ММ.ГГГГ)
              const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(user.birthday.trim());
              if (!m) return null;
              const bd = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
              if (Number.isNaN(bd.getTime())) return null;
              const now = new Date();
              let age = now.getFullYear() - bd.getFullYear();
              if (now.getMonth() < bd.getMonth() || (now.getMonth() === bd.getMonth() && now.getDate() < bd.getDate()))
                age--;
              if (age < 0 || age > 120) return null;
              return <span className="text-white/60">· {age} лет</span>;
            })()}
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

        {/* Подарки как в ТГ: витрина в профиле */}
        {userGifts && userGifts.length > 0 && (
          <div className="mx-auto mt-4 max-w-xs">
            <p className="pb-2 text-[10px] font-semibold tracking-wide text-white/35 uppercase">
              Подарки · {userGifts.length}
            </p>
            <div className="grid grid-cols-4 gap-2">
              {userGifts.slice(0, 8).map((g) => {
                const gd = findGift(g.giftKey);
                if (!gd) return null;
                return (
                  <div
                    key={g.id}
                    title={`${gd.name}${g.sender ? ` — от ${g.sender.displayName}` : ""}${g.message ? ` · «${g.message}»` : ""}`}
                    className={`gift-pop gift-shine relative flex aspect-square items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br ${gd.bg}`}
                  >
                    <span className="gift-anim text-3xl">{gd.emoji}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Своя карточка: просто бейдж, без действий над собой */}
        {isSelf && (
          <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-center text-[13px] text-white/50">
            Это ваша карточка — так вас видят другие пользователи
          </div>
        )}

        {/* Друзья: добавить / принять / отменить / убрать */}
        {!isSelf && rel !== null && (
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

        {!isSelf && (
          <div className="mt-4 flex gap-2">
            <button
              onClick={onMessage}
              className="btn-gradient flex min-w-0 flex-1 items-center justify-center gap-2 rounded-2xl py-3.5 text-[15px] font-semibold text-white"
            >
              <MessageSquareText className="h-4.5 w-4.5" />
              Написать сообщение
            </button>
            <button
              onClick={() => setGiftPicker(true)}
              title={giftSent ? "Подарок отправлен ✓" : "Подарить подарок"}
              className={`grid w-14 shrink-0 place-items-center rounded-2xl transition-colors ${
                giftSent
                  ? "bg-emerald-500/20 text-emerald-300"
                  : "bg-white/10 text-white/80 hover:bg-white/15"
              }`}
            >
              <Gift className="h-5 w-5" />
            </button>
          </div>
        )}
      </div>

      {giftPicker && (
        <GiftPicker
          userId={user.id}
          name={user.displayName}
          onClose={() => setGiftPicker(false)}
          onSent={() => {
            setGiftSent(true);
            setUserGifts((cur) => cur); // список у получателя обновится при следующем открытии
          }}
        />
      )}
    </ModalShell>
  );
}

/** Выбор подарка: сетка как в ТГ, звёзды у Premium бесконечные. */
function GiftPicker({
  userId,
  name,
  onClose,
  onSent,
}: {
  userId: string;
  name: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const [mePremium, setMePremium] = useState<boolean | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    api<{ user?: { premium?: boolean }; premium?: boolean }>("/api/auth/me")
      .then((d) => alive && setMePremium(!!(d.user?.premium ?? (d as { premium?: boolean }).premium)))
      .catch(() => alive && setMePremium(false));
    return () => {
      alive = false;
    };
  }, []);
  const gift = picked ? GIFTS.find((g) => g.key === picked) : null;

  const send = async () => {
    if (!gift || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api("/api/gifts", {
        method: "POST",
        body: JSON.stringify({ recipientId: userId, giftKey: gift.key, message }),
      });
      onSent();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось отправить подарок");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[95] grid place-items-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="glass-strong nice-scroll max-h-[85vh] w-full max-w-md overflow-y-auto rounded-[1.6rem] p-5 shadow-2xl"
      >
        <div className="mb-3 flex items-center justify-between">
          <p className="font-display text-lg font-bold">Подарок для {name}</p>
          <button onClick={onClose} className="rounded-full bg-white/10 p-1.5 text-white/70">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mb-2 flex items-center justify-between text-[12px]">
          <span className="flex items-center gap-1 text-white/45">
            <Star className="h-3 w-3 text-amber-300" />
            Баланс звёзд
          </span>
          <span className="font-bold text-amber-300">{mePremium ? "∞ · Premium" : "0 · нужен Premium"}</span>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {GIFTS.map((g) => (
            <button
              key={g.key}
              onClick={() => setPicked(g.key)}
              title={`${g.name} · ${g.price} звёзд`}
              className={`flex flex-col items-center gap-1 rounded-2xl border p-2.5 transition-all ${
                picked === g.key
                  ? "border-amber-300/70 bg-amber-300/10"
                  : "border-white/10 bg-white/[0.03] hover:bg-white/8"
              }`}
            >
              <span className={`grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br text-3xl ${g.bg}`}>
                {g.emoji}
              </span>
              <span className="text-[10px] text-white/55">{g.name}</span>
              <span className="flex items-center gap-0.5 text-[10px] font-bold text-amber-300 tabular-nums">
                <Star className="h-2.5 w-2.5" /> {g.price}
              </span>
            </button>
          ))}
        </div>
        <input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={140}
          placeholder="Сообщение к подарку (необязательно)…"
          className="ring-focus mt-3 w-full rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2.5 text-sm"
        />
        {error && <p className="pt-2 text-[12px] text-rose-300">{error}</p>}
        {!mePremium && (
          <p className="pt-2 text-[11px] leading-snug text-white/40">
            Дарить подарки могут только участники с Pulse Premium — у них бесконечные звёзды.
            Включается бесплатно в профиле.
          </p>
        )}
        <button
          onClick={() => void send()}
          disabled={!gift || busy || mePremium !== true}
          className="btn-gradient mt-3 flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold text-white disabled:opacity-40"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gift className="h-4 w-4" />}
          {gift ? `Подарить за ${gift.price} звёзд` : "Выберите подарок"}
        </button>
      </div>
    </div>
  );
}
