"use client";

import { useEffect, useState } from "react";
import {
  ChevronRight,
  ArrowLeft,
  Ban,
  CalendarDays,
  Check,
  Copy,
  Gift,
  Loader2,
  Link2,
  Pin,
  MessageSquareLock,
  MessageSquareText,
  PhoneOff,
  Dices,
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
import { getNickname, setNickname } from "@/lib/nicknames";
import { GIFTS, findGift, NFT_VARIANTS, type GiftItem } from "@/lib/gifts";
import GiftDetailModal from "./GiftDetailModal";
import GiftsPanel from "./GiftsPanel";
import NftFigure from "./NftFigure";

type Props = {
  user: PublicUser;
  onClose: () => void;
  onMessage: () => void;
  /** Id текущего пользователя — чтобы карточка себя не предлагала действия. */
  myId?: string;
  /** «Назад» — вернуться в окно, из которого открыли карточку. */
  onBack?: () => void;
};

export default function UserCardModal({ user, onClose, onMessage, myId, onBack }: Props) {
  /** Псевдоним контакта: «своё» имя, видно только вам. */
  const [nick, setNick] = useState(() => getNickname(user.id) ?? "");
  useEffect(() => {
    setNick(getNickname(user.id) ?? "");
  }, [user.id]);
  /** Общие группы и каналы. */
  const [common, setCommon] = useState<{ id: string; title: string; kind: string }[] | null>(null);
  useEffect(() => {
    if (user.id === myId) return;
    let dead = false;
    api<{ common: { id: string; title: string; kind: string }[] }>(`/api/users/${user.id}/common`)
      .then((d) => {
        if (!dead) setCommon(d.common);
      })
      .catch(() => {
        if (!dead) setCommon([]);
      });
    return () => {
      dead = true;
    };
  }, [user.id, myId]);
  /** Сегодня день рождения? */
  const birthdayToday = (() => {
    const m = /^(\d{1,2})\.(\d{1,2})/.exec(user.birthday?.trim() ?? "");
    if (!m) return false;
    const now = new Date();
    return Number(m[1]) === now.getDate() && Number(m[2]) === now.getMonth() + 1;
  })();
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
  /** Тап по подарку — мгновенные детали (кто, когда, с каким текстом). */
  const [giftDetail, setGiftDetail] = useState<GiftItem | null>(null);
  const [giftsPanelOpen, setGiftsPanelOpen] = useState(false);
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
      {onBack && (
        <div className="px-5 pt-4">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 rounded-xl bg-white/8 px-3 py-1.5 text-[13px] font-medium text-white/70 transition-colors hover:bg-white/12 hover:text-white"
            title="Назад"
          >
            <ArrowLeft className="h-4 w-4" /> Назад
          </button>
        </div>
      )}
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

        {birthdayToday && (
          <p className="mx-auto mt-2 flex w-fit items-center gap-1.5 rounded-full border border-pink-300/30 bg-pink-500/15 px-3 py-1 text-[12px] font-semibold text-pink-200">
            🎂 Сегодня день рождения — поздравьте!
          </p>
        )}

        {/* Псевдоним: как вы видите этого человека */}
        {user.id !== myId && (
          <div className="mx-auto mt-3 w-full max-w-xs rounded-2xl border border-white/8 bg-white/[0.03] p-2.5">
            <p className="px-1 pb-1.5 text-[10px] font-semibold tracking-widest text-white/30 uppercase">
              Псевдоним (видно только вам)
            </p>
            <div className="flex gap-1.5">
              <input
                value={nick}
                onChange={(e) => setNick(e.target.value)}
                maxLength={48}
                placeholder={user.displayName}
                className="ring-focus min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[0.05] px-3 py-1.5 text-[13px]"
              />
              <button
                onClick={() => setNickname(user.id, nick)}
                className="rounded-xl bg-[#5865f2]/80 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-[#5865f2]"
              >
                ОК
              </button>
              {(nick || getNickname(user.id)) && (
                <button
                  onClick={() => {
                    setNickname(user.id, "");
                    setNick("");
                  }}
                  title="Сбросить псевдоним"
                  className="rounded-xl bg-white/8 px-2.5 py-1.5 text-[12px] text-white/60 hover:bg-rose-500/15 hover:text-rose-300"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        )}

        {/* Общие группы и каналы */}
        {common !== null && common.length > 0 && (
          <div className="mx-auto mt-3 w-full max-w-xs rounded-2xl border border-white/8 bg-white/[0.03] p-2.5">
            <p className="px-1 pb-1.5 text-[10px] font-semibold tracking-widest text-white/30 uppercase">
              Общие чаты · {common.length}
            </p>
            <div className="nice-scroll max-h-28 space-y-1 overflow-y-auto">
              {common.map((c) => (
                <p key={c.id} className="truncate rounded-lg bg-white/[0.04] px-2.5 py-1.5 text-[12px] text-white/70">
                  {c.kind === "channel" ? "📢" : "👥"} {c.title || "Без названия"}
                </p>
              ))}
            </div>
          </div>
        )}

        <p className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-white/25">
          <CalendarDays className="h-3 w-3" />в Pulse с{" "}
          {new Date(user.createdAt).toLocaleDateString("ru-RU", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </p>

        {/* Подарки — отдельная плашка с листанием */}
        {userGifts && userGifts.length > 0 && (
          <button
            onClick={() => setGiftsPanelOpen(true)}
            className="mt-4 flex w-full items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.03] px-3.5 py-3 text-left transition-colors hover:border-amber-300/40 hover:bg-white/[0.06]"
          >
            <span className="flex shrink-0 -space-x-2">
              {userGifts.slice(0, 3).map((g) => {
                const gd = findGift(g.giftKey);
                if (!gd) return null;
                return (
                  <span
                    key={g.id}
                    className={`grid h-10 w-10 place-items-center overflow-hidden rounded-xl ring-2 ring-black/40 bg-gradient-to-br ${gd.bg}`}
                  >
                    {gd.img ? (
                      <NftFigure gift={gd} size={38} rounded="rounded-[10px]" variant={g.variant} />
                    ) : (
                      <span className="h-6 w-6 [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: gd.icon }} />
                    )}
                  </span>
                );
              })}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">Подарки</span>
              <span className="block text-[11px] text-white/35">
                {userGifts.length} шт · нажмите, чтобы листать
              </span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-white/30" />
          </button>
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

        <div className="mt-4 flex gap-2">
          {!isSelf && (
            <button
              onClick={onMessage}
              className="btn-gradient flex min-w-0 flex-1 items-center justify-center gap-2 rounded-2xl py-3.5 text-[15px] font-semibold text-white"
            >
              <MessageSquareText className="h-4.5 w-4.5" />
              Написать сообщение
            </button>
          )}
          <button
            onClick={() => setGiftPicker(true)}
            title={giftSent ? "Подарок отправлен ✓" : isSelf ? "Подарить себе" : "Подарить подарок"}
            className={`${isSelf ? "flex-1" : "grid w-14 shrink-0 place-items-center"} rounded-2xl transition-colors ${
              giftSent
                ? "bg-emerald-500/20 text-emerald-300"
                : "bg-white/10 text-white/80 hover:bg-white/15"
            }`}
          >
            <span className={`${isSelf ? "flex items-center justify-center gap-2" : ""}`}>
              <Gift className="h-5 w-5" />
              {isSelf ? <span className="text-[13px] font-semibold">Подарить себе</span> : null}
            </span>
          </button>
        </div>
      </div>

      {/* Плашка подарков — отдельное окно с листанием */}
      {giftsPanelOpen && userGifts && (
        <GiftsPanel
          title="Подарки"
          gifts={userGifts}
          onClose={() => setGiftsPanelOpen(false)}
        />
      )}

      {giftDetail && (
        <GiftDetailModal
          giftKey={giftDetail.giftKey}
          note={giftDetail.message}
          senderName={giftDetail.sender?.displayName ?? null}
          senderAvatarUrl={giftDetail.sender?.avatarUrl ?? null}
          anonymous={!!giftDetail.anonymous && !giftDetail.sender}
          createdAt={giftDetail.createdAt}
          giftId={giftDetail.id}
          pinned={!!giftDetail.pinned}
          variant={giftDetail.variant ?? 0}
          source={giftDetail.source ?? "gift"}
          canPin={isSelf}
          onPinned={(v) => {
            setUserGifts((cur) =>
              cur ? cur.map((x) => (x.id === giftDetail.id ? { ...x, pinned: v } : x)) : cur,
            );
            setGiftDetail((cur) => (cur && cur.id === giftDetail.id ? { ...cur, pinned: v } : cur));
          }}
          onClose={() => setGiftDetail(null)}
        />
      )}

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

/** Выбор подарков: сетка как в ТГ; можно выбрать несколько сразу. */
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
  const MAX_PICK = 10;
  const [mePremium, setMePremium] = useState<boolean | null>(null);
  /** Выбранные подарки (ключи) — можно несколько сразу, как в ТГ. */
  const [picked, setPicked] = useState<string[]>([]);
  const [step2, setStep2] = useState(false);
  const [message, setMessage] = useState("");
  /** «Скрыть моё имя» — как в ТГ, получатель увидит «Аноним». */
  const [hideName, setHideName] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Расцветка NFT-подарков: 0–4 или «случайная». */
  const [variantChoice, setVariantChoice] = useState<number | "random">(0);
  /** Праздничная заставка после успешной отправки. */
  const [celebrate, setCelebrate] = useState(false);

  useEffect(() => {
    let alive = true;
    api<{ user?: { premium?: boolean }; premium?: boolean }>("/api/auth/me")
      .then((d) => alive && setMePremium(!!(d.user?.premium ?? (d as { premium?: boolean }).premium)))
      .catch(() => alive && setMePremium(false));
    return () => {
      alive = false;
    };
  }, []);

  const selected = picked
    .map((k) => GIFTS.find((g) => g.key === k))
    .filter((g): g is NonNullable<ReturnType<typeof findGift>> => !!g);
  const totalPrice = selected.reduce((s, g) => s + g.price, 0);
  const hasNft = selected.some((g) => g.nft && g.img);

  const toggle = (key: string) => {
    setError(null);
    setPicked((cur) => {
      if (cur.includes(key)) return cur.filter((k) => k !== key);
      if (cur.length >= MAX_PICK) {
        setError(`Не больше ${MAX_PICK} подарков за раз`);
        return cur;
      }
      return [...cur, key];
    });
  };

  // Esc: сначала назад к каталогу (сброс шага), потом — закрыть окно
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      if (step2) setStep2(false);
      else onClose();
    };
    window.addEventListener("keydown", h, true);
    return () => window.removeEventListener("keydown", h, true);
  }, [step2, onClose]);

  const send = async () => {
    if (selected.length === 0 || busy) return;
    setBusy(true);
    setError(null);
    try {
      for (const g of selected) {
        await api("/api/gifts", {
          method: "POST",
          body: JSON.stringify({
            recipientId: userId,
            giftKey: g.key,
            message,
            hideSender: hideName,
            variant: g.nft ? (variantChoice === "random" ? -1 : variantChoice) : 0,
          }),
        });
      }
      setCelebrate(true);
      onSent();
      setTimeout(() => onClose(), 1300);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось отправить подарок");
      setBusy(false);
    }
  };

  if (celebrate) {
    return (
      <div className="fixed inset-0 z-[96] grid place-items-center bg-black/75 p-4 backdrop-blur-sm">
        <div className="pm-rise flex flex-col items-center">
          <div className="relative">
            <span className="absolute -inset-6 animate-ping rounded-full bg-amber-300/20" />
            <span className="absolute -inset-3 animate-pulse rounded-full bg-amber-300/20" />
            <div className="gift-pop gift-shine relative grid h-32 w-32 place-items-center overflow-hidden rounded-3xl border border-amber-300/60 bg-gradient-to-br from-amber-400/25 to-fuchsia-400/15">
              <Gift className="h-16 w-16 text-amber-300" />
            </div>
            <span className="absolute -top-3 -right-3 text-2xl">✨</span>
            <span className="absolute -bottom-2 -left-3 text-xl">✨</span>
          </div>
          <p className="font-display pt-5 text-xl font-bold text-white">
            {selected.length === 1 ? "Подарок отправлен!" : `Отправлено подарков: ${selected.length}!`}
          </p>
          <p className="pt-1 text-[13px] text-white/50">{name} уже получает ваш сюрприз</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[95] grid place-items-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="glass-strong nice-scroll max-h-[85vh] w-full max-w-md overflow-y-auto rounded-[1.6rem] p-5 shadow-2xl"
      >
        {/* ── Шаг 2: подтверждение (подпись, имя, отправка всех выбранных) ── */}
        {step2 && selected.length > 0 ? (
          <>
            <div className="mb-3 flex items-center gap-2">
              <button
                onClick={() => setStep2(false)}
                title="Назад к каталогу"
                className="rounded-full bg-white/10 p-1.5 text-white/70 transition-colors hover:bg-white/15"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <p className="font-display flex-1 text-lg font-bold">
                {selected.length === 1 ? `Подарить «${selected[0].name}»` : `Подарить ${selected.length} подарков`}
              </p>
              <button onClick={onClose} className="rounded-full bg-white/10 p-1.5 text-white/70">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Лента выбранных подарков: тап по крестику убирает */}
            <div className="nice-scroll mb-2 flex gap-2 overflow-x-auto pb-1">
              {selected.map((g) => (
                <span
                  key={g.key}
                  className={`gift-pop relative grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-2xl border bg-gradient-to-br ${
                    g.nft ? "border-amber-300/50" : "border-white/10"
                  } ${g.bg}`}
                >
                  {g.img ? (
                    <NftFigure gift={g} size={60} rounded="rounded-xl" variant={variantChoice === "random" ? undefined : variantChoice} />
                  ) : (
                    <span className={`${g.anim ?? "gift-anim"} h-10 w-10 [&>svg]:h-full [&>svg]:w-full`} dangerouslySetInnerHTML={{ __html: g.icon }} />
                  )}
                  <button
                    onClick={() => {
                      toggle(g.key);
                      if (selected.length <= 1) setStep2(false);
                    }}
                    title="Убрать из выбора"
                    className="absolute top-0.5 right-0.5 grid h-4 w-4 place-items-center rounded-full bg-black/70 text-white/80 hover:text-white"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              ))}
            </div>

            {hasNft && (
              <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
                <p className="pb-2 text-[11px] font-semibold tracking-wide text-white/40 uppercase">
                  Расцветка NFT · {NFT_VARIANTS.length} вариантов
                </p>
                <div className="flex items-center gap-1.5">
                  {NFT_VARIANTS.map((v, i) => (
                    <button
                      key={v.name}
                      onClick={() => setVariantChoice(i)}
                      title={v.name}
                      className={`overflow-hidden rounded-xl border p-0.5 transition-all ${
                        variantChoice === i
                          ? "border-amber-300 ring-1 ring-amber-300"
                          : "border-white/10 hover:border-white/30"
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={selected.find((g) => g.nft && g.img)?.img}
                        alt={v.name}
                        className="h-9 w-9 rounded-lg object-cover"
                        style={{ filter: v.filter }}
                      />
                    </button>
                  ))}
                  <button
                    onClick={() => setVariantChoice("random")}
                    title="Случайная расцветка"
                    className={`ml-auto flex items-center gap-1 rounded-xl border px-2 py-1.5 text-[11px] font-medium transition-colors ${
                      variantChoice === "random"
                        ? "border-amber-300 text-amber-300"
                        : "border-white/15 text-white/50 hover:border-white/35"
                    }`}
                  >
                    <Dices className="h-3.5 w-3.5" /> Рандом
                  </button>
                </div>
              </div>
            )}

            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={140}
              rows={2}
              placeholder="Сообщение к подаркам (необязательно)…"
              className="ring-focus mt-3 w-full resize-none rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2.5 text-sm"
            />
            <button
              onClick={() => setHideName((v) => !v)}
              className="mt-2 flex w-full items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 text-left transition-colors hover:bg-white/8"
              title="Получатель не увидит, кто подарил"
            >
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
                  hideName ? "border-amber-300 bg-amber-300" : "border-white/25"
                }`}
              >
                {hideName && <Check className="h-3.5 w-3.5 text-black" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium">Скрыть моё имя</span>
                <span className="block text-[11px] text-white/35">{name} увидит подарки от «Анонима»</span>
              </span>
            </button>
            {error && <p className="pt-2 text-[12px] text-rose-300">{error}</p>}
            {!mePremium && (
              <p className="pt-2 text-[11px] leading-snug text-white/40">
                Дарить подарки могут только участники с Pulse Premium — у них бесконечные звёзды.
                Включается бесплатно в профиле.
              </p>
            )}
            <button
              onClick={() => void send()}
              disabled={busy || mePremium !== true}
              className="btn-gradient mt-3 flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold text-white disabled:opacity-40"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gift className="h-4 w-4" />}
              {selected.length === 1
                ? `Подарить за ${totalPrice} звёзд`
                : `Подарить ${selected.length} шт за ${totalPrice} звёзд`}
            </button>
          </>
        ) : (
          /* ── Шаг 1: каталог — можно выбрать несколько подарков ── */
          <>
            <div className="mb-3 flex items-center justify-between">
              <p className="font-display text-lg font-bold">Подарок для {name}</p>
              <button onClick={onClose} className="rounded-full bg-white/10 p-1.5 text-white/70">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mb-3 flex items-center justify-between text-[12px]">
              <span className="flex items-center gap-1 text-white/45">
                <Star className="h-3 w-3 text-amber-300" />
                Баланс звёзд
              </span>
              <span className="font-bold text-amber-300">{mePremium ? "∞ · Premium" : "0 · нужен Premium"}</span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {GIFTS.map((g) => {
                const on = picked.includes(g.key);
                return (
                  <button
                    key={g.key}
                    onClick={() => toggle(g.key)}
                    title={`${g.name} · ${g.price} звёзд${g.nft ? " · NFT" : ""}${g.live ? " · LIVE" : ""}`}
                    className={`relative flex flex-col items-center gap-1 rounded-2xl border p-2.5 transition-all hover:bg-white/8 ${
                      on
                        ? "border-amber-300 bg-amber-300/10 ring-1 ring-amber-300"
                        : g.nft
                          ? "border-amber-300/40 hover:border-amber-300/70 bg-white/[0.03]"
                          : "border-white/10 hover:border-amber-300/50 bg-white/[0.03]"
                    }`}
                  >
                    {on && (
                      <span className="absolute -top-1 -left-1 z-10 grid h-4.5 w-4.5 place-items-center rounded-full bg-amber-300 text-black shadow">
                        <Check className="h-3 w-3" />
                      </span>
                    )}
                    {(g.nft || g.live) && (
                      <span className={`absolute top-1 right-1 rounded-full bg-black/60 px-1.5 py-px text-[8px] font-bold tracking-wider uppercase backdrop-blur ${g.live ? "text-rose-300" : "text-amber-300"}`}>
                        {g.live ? "LIVE" : "NFT"}
                      </span>
                    )}
                    <span className={`grid h-12 w-12 place-items-center overflow-hidden rounded-xl bg-gradient-to-br ${g.bg}`}>
                      {g.img ? (
                        <NftFigure gift={g} size={48} rounded="rounded-xl" />
                      ) : (
                        <span
                          className={`${g.anim ?? "gift-anim"} h-9 w-9 [&>svg]:h-full [&>svg]:w-full`}
                          dangerouslySetInnerHTML={{ __html: g.icon }}
                        />
                      )}
                    </span>
                    <span className="text-[10px] text-white/55">{g.name}</span>
                    <span className="flex items-center gap-0.5 text-[10px] font-bold text-amber-300 tabular-nums">
                      <Star className="h-2.5 w-2.5" /> {g.price}
                    </span>
                  </button>
                );
              })}
            </div>
            {error && <p className="pt-2 text-[12px] text-rose-300">{error}</p>}
            {/* Плашка выбора: сколько выбрано и на какую сумму */}
            <div className="sticky bottom-0 -mx-5 mt-3 border-t border-white/8 bg-black/45 px-5 py-3 backdrop-blur-md">
              {picked.length === 0 ? (
                <p className="text-[11px] leading-snug text-white/35">
                  Можно выбрать сразу несколько подарков — они придут одним набором.
                </p>
              ) : (
                <button
                  onClick={() => setStep2(true)}
                  className="btn-gradient flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold text-white"
                >
                  <Gift className="h-4 w-4" />
                  Далее · {picked.length} {picked.length === 1 ? "подарок" : picked.length < 5 ? "подарка" : "подарков"} · {totalPrice} ⭐
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
