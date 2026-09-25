"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { modalEnter, isTopModal } from "@/lib/modals";
import {
  ArrowLeft,
  BarChart3,
  Pin,
  Ban,
  Camera,
  CircleDot,
  ImageIcon,
  Loader2,
  Link2,
  Lock,
  LogOut,
  Monitor,
  MessageSquareLock,
  Palette,
  PhoneOff,
  Shield,
  Trash2,
  UserCheck,
  UserPlus,
  UsersRound,
  X,
} from "lucide-react";
import { ChevronRight, Gem, Gift, Infinity, Package, PenLine, Star, Timer } from "lucide-react";
import Avatar, { paletteFor } from "./Avatar";
import StatusEmoji from "./StatusEmoji";
import { PrivacySettings } from "./PrivacyModal";
import { api, copyToClipboard, uploadFile } from "@/lib/api";
import { findGift, type GiftItem } from "@/lib/gifts";
import NftFigure from "./NftFigure";
import GiftsPanel from "./GiftsPanel";
import SessionsModal from "./SessionsModal";
import { PinSetupModal, hasPin } from "./PinLock";
import GiftDetailModal from "./GiftDetailModal";
import { compressImage } from "@/lib/images";
import { BANNER_PRESETS, bannerStyle, isFileBanner } from "@/lib/wallpapers";
import type { PublicUser } from "@/lib/types";

/** Эмодзи для кастомного статуса профиля (выбор из готового набора). */
const STATUS_EMOJIS = [
  "🔥", "⚡", "✨", "🌙", "🌸", "🍀", "🎧", "🎮", "🚀", "💎",
  "🌊", "🦄", "👾", "🍕", "☕", "🏆", "❤️", "😎", "🥶", "🤖",
];

type Props = {
  me: PublicUser;
  onClose: () => void;
  onSaved: (u: PublicUser) => void;
  onDeletedAccount: () => void;
  /** Настройки оформления — переехали сюда из сайдбара. */
  theme?: "gray" | "tg" | "light" | "auto";
  onSetTheme?: (t: "gray" | "tg" | "light" | "auto") => void;
  uiScale?: "s" | "m" | "l";
  onSetUiScale?: (v: "s" | "m" | "l") => void;
  custom?: import("./Sidebar").CustomSettings;
  onSetCustom?: (c: import("./Sidebar").CustomSettings) => void;
  soundOn?: boolean;
  callSoundOn?: boolean;
  notifyOn?: boolean;
  /** Тост-уведомления (для вложенных окон вроде «Устройств»). */
  notify?: (m: string) => void;
  onToggleSound?: () => void;
  onToggleCallSound?: () => void;
  onToggleNotify?: () => void;
  /** Открыть свою карточку — «как меня видят другие». */
  onOpenMyCard?: () => void;
};

export default function ProfileModal({
  me,
  onClose,
  onSaved,
  onDeletedAccount,
  theme = "gray",
  onSetTheme,
  uiScale = "m",
  onSetUiScale,
  custom,
  onSetCustom,
  soundOn = true,
  callSoundOn = true,
  notifyOn = false,
  notify = () => {},
  onToggleSound,
  onToggleCallSound,
  onToggleNotify,
  onOpenMyCard,
}: Props) {
  /** Вкладки: профиль, приватность, оформление (с превью), друзья. */
  const [tab, setTab] = useState<"profile" | "privacy" | "appearance" | "friends">("profile");
  /** Модалка личной статистики. */
  const [statsOpen, setStatsOpen] = useState(false);
  const [displayName, setDisplayName] = useState(me.displayName);
  const [username, setUsername] = useState(me.username);
  const [copiedName, setCopiedName] = useState(false);
  /** «Моя ссылка»: глубокая ссылка на профиль (#user=…). */
  const [copiedLink, setCopiedLink] = useState(false);
  /** Мои подарки (видны и мне, и другим в карточке). */
  const [myGifts, setMyGifts] = useState<GiftItem[] | null>(null);
  /** Тап по своему подарку — детали открываются мгновенно, без запросов. */
  const [giftDetail, setGiftDetail] = useState<GiftItem | null>(null);
  const [giftsPanelOpen, setGiftsPanelOpen] = useState(false);
  /** «Устройства»: активные сессии аккаунта. */
  const [devicesOpen, setDevicesOpen] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [pinOn, setPinOn] = useState(false);
  useEffect(() => setPinOn(hasPin()), [pinOpen]);
  /** Id этого окна в стеке — для корректного каскада Esc. */
  const shellIdRef = useRef(Symbol("profile-modal"));
  const shellId = shellIdRef.current;

  /** Esc: в подразделе возвращает в профиль, из профиля — закрывает окно.
   *  Если сверху открыто другое окно (например, детали подарка) — не мешаем:
   *  оно закроет себя само, а каскад продолжится следующим нажатием. */
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (giftDetail) return; // вложенное окно закроется само
      if (!isTopModal(shellId)) return; // поверх профиля открыто что-то другое
      if (tab !== "profile") setTab("profile");
      else onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [tab, giftDetail, onClose]);
  useEffect(() => {
    let alive = true;
    api<{ gifts: GiftItem[] }>(`/api/gifts?userId=${me.id}`)
      .then((d) => alive && setMyGifts(d.gifts))
      .catch(() => alive && setMyGifts([]));
    return () => {
      alive = false;
    };
  }, [me.id]);
  const [bio, setBio] = useState(me.bio);
  const [birthday, setBirthday] = useState(me.birthday ?? "");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(me.avatarUrl);
  const [bannerUrl, setBannerUrl] = useState<string | null>(me.bannerUrl);
  /** Кастомный статус-эмодзи: эмодзи или анимированная гифка. */
  const [statusEmoji, setStatusEmoji] = useState(me.statusEmoji || "");
  /** Pulse Premium: цвет имени в чатах («цвет профиля», как в ТГ). */
  const [nameColor, setNameColor] = useState(me.nameColor || "");
  /** Панель выбора баннера (живые пресеты + загрузка гифки). */
  const [bannerPickerOpen, setBannerPickerOpen] = useState(false);
  /** Панель выбора статус-эмодзи. */
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  /** Короткое «Фото обновлено ✓» после мгновенной смены аватара/баннера. */
  const [flash, setFlash] = useState("");
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<"avatar" | "banner" | null>(null);
  const [error, setError] = useState("");
  const avatarInput = useRef<HTMLInputElement | null>(null);
  const bannerInput = useRef<HTMLInputElement | null>(null);

  const pick = async (file: File | null, kind: "avatar" | "banner") => {
    if (!file) return;
    setBusy(kind);
    setError("");
    setFlash("");
    try {
      // Сжимаем фото до лёгкого JPEG (аватар 512, баннер 1280 по большей
      // стороне) — тяжелые фото с телефона не проходили через сеть/прокси.
      const light = await compressImage(file, kind === "avatar" ? 512 : 1280);
      const url = await uploadFile(light);
      if (kind === "avatar") setAvatarUrl(url);
      else setBannerUrl(url);
      // ВАЖНО: применяем СРАЗУ после загрузки, не дожидаясь «Сохранить».
      // Раньше пользователь выбирал фото, закрывал окно — и оставалось
      // старое («фотку сменить нельзя»).
      try {
        const d = await api<{ user: PublicUser }>("/api/auth/me", {
          method: "PATCH",
          body: JSON.stringify(kind === "avatar" ? { avatarUrl: url } : { bannerUrl: url }),
        });
        onSaved(d.user);
        setFlash(kind === "avatar" ? "Фото обновлено ✓" : "Баннер обновлён ✓");
        setTimeout(() => setFlash(""), 2500);
      } catch {
        /* сохранится вместе с кнопкой «Сохранить» */
      }
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Ошибка загрузки — попробуйте файл поменьше или другую сеть",
      );
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const d = await api<{ user: PublicUser }>("/api/auth/me", {
        method: "PATCH",
        body: JSON.stringify({
          displayName,
          username,
          bio,
          avatarUrl,
          bannerUrl,
          statusEmoji,
          nameColor: nameColor || null,
          birthday,
        }),
      });
      onSaved(d.user);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить");
      setSaving(false);
    }
  };

  /** Pulse Premium: включить/выключить бесплатно, сразу. */
  const togglePremium = async () => {
    try {
      const d = await api<{ user: PublicUser }>("/api/auth/me", {
        method: "PATCH",
        body: JSON.stringify({ premium: !me.premium }),
      });
      onSaved(d.user);
    } catch {
      setError("Не удалось изменить Premium");
    }
  };

  const logoutAll = async () => {
    if (!confirm("Выйти со всех устройств? Текущий вход тоже завершится.")) return;
    try {
      await api("/api/auth/logout-all", { method: "POST" });
    } finally {
      window.location.reload();
    }
  };

  const deleteAccount = async () => {
    if (!confirm("Удалить аккаунт навсегда? Все сообщения, истории и профиль будут удалены."))
      return;
    if (!confirm("Это действие необратимо. Точно удалить аккаунт?")) return;
    setSaving(true);
    try {
      await api("/api/auth/me", { method: "DELETE" });
      onDeletedAccount();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось удалить аккаунт");
      setSaving(false);
    }
  };

  return (
    <>
    <ModalShell onClose={onClose} noEscape shellId={shellId}>
      {/* баннер: поддерживает ЖИВЫЕ пресеты (анимированные градиенты),
          загруженные картинки/гифки и градиент по умолчанию */}
      <div
        className={`relative h-36 w-full overflow-hidden ${
          bannerUrl ? "" : `bg-gradient-to-br ${paletteFor(me.username)}`
        }`}
        style={bannerUrl ? bannerStyle(bannerUrl) : undefined}
      >
        <div className="absolute inset-0 bg-gradient-to-t from-black/55 to-transparent" />
        <button
          onClick={() => setBannerPickerOpen((v) => !v)}
          className="glass-strong absolute right-4 bottom-4 flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-white/90 transition-transform hover:scale-105 active:scale-95"
        >
          {busy === "banner" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageIcon className="h-3.5 w-3.5" />}
          Сменить баннер
        </button>
        <input
          ref={bannerInput}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={(e) => {
            void pick(e.target.files?.[0] ?? null, "banner");
            e.target.value = "";
          }}
        />
        <button
          onClick={onClose}
          className="absolute top-4 right-4 rounded-full bg-black/40 p-2 text-white/80 backdrop-blur transition-colors hover:bg-black/60"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Панель выбора баннера: живые пресеты + загрузка гифки/картинки */}
      {bannerPickerOpen && (
        <div className="border-b border-white/8 bg-black/25 px-7 py-4">
          <div className="mb-2.5 flex items-center justify-between">
            <p className="text-xs font-semibold text-white/70">Баннер профиля</p>
            <div className="flex gap-1.5">
              <button
                onClick={() => bannerInput.current?.click()}
                className="glass rounded-lg px-2.5 py-1 text-[11px] text-white/75 transition-colors hover:bg-white/15"
              >
                {busy === "banner" ? "Загрузка…" : "Загрузить гифку / картинку"}
              </button>
              {bannerUrl && (
                <button
                  onClick={() => setBannerUrl(null)}
                  className="glass flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] text-rose-300 transition-colors hover:bg-rose-500/15"
                >
                  <Trash2 className="h-3 w-3" /> Убрать
                </button>
              )}
            </div>
          </div>
          <div className="nice-scroll flex gap-2 overflow-x-auto pb-1">
            {BANNER_PRESETS.map((b) => {
              const active = bannerUrl === b.key;
              return (
                <button
                  key={b.key}
                  onClick={() => setBannerUrl(active ? null : b.key)}
                  title={b.label}
                  className={`h-12 w-24 shrink-0 overflow-hidden rounded-xl transition-all ${
                    active ? "ring-2 ring-[#5865f2] ring-offset-2 ring-offset-[#24272d]" : "opacity-80 hover:opacity-100"
                  }`}
                  style={bannerStyle(b.key)}
                >
                  {b.anim && (
                    <span className="rounded-bl-xl bg-black/45 px-1.5 py-0.5 text-[9px] text-white/85">живой</span>
                  )}
                </button>
              );
            })}
            {bannerUrl && isFileBanner(bannerUrl) && (
              <div
                className="h-12 w-24 shrink-0 overflow-hidden rounded-xl ring-2 ring-[#5865f2] ring-offset-2 ring-offset-[#24272d]"
                style={bannerStyle(bannerUrl)}
                title="Ваш баннер"
              />
            )}
          </div>
        </div>
      )}

      {/* аватар: клик по нему ИЛИ по кнопке «Сменить фото» открывает выбор файла.
          z-10: блок лежит поверх баннера (-mt-10) и должен ловить клики всегда. */}
      <div className="relative z-10 -mt-10 flex flex-col items-center gap-2">
        <button
          onClick={() => avatarInput.current?.click()}
          className="group relative rounded-full ring-4 ring-[#1b1e24]"
        >
          <Avatar name={displayName || me.username} src={avatarUrl} size={86} />
          <span className="absolute inset-0 grid place-items-center rounded-full bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
            {busy === "avatar" ? <Loader2 className="h-5 w-5 animate-spin text-white" /> : <Camera className="h-5 w-5 text-white" />}
          </span>
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={() => avatarInput.current?.click()}
            disabled={busy === "avatar"}
            className="glass flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-medium text-white/85 transition-colors hover:bg-white/15 disabled:opacity-60"
          >
            {busy === "avatar" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Camera className="h-3 w-3" />}
            Сменить фото
          </button>
          {avatarUrl && (
            <button
              onClick={() => {
                setAvatarUrl(null);
                // Применяем удаление сразу, как и установку
                void api<{ user: PublicUser }>("/api/auth/me", {
                  method: "PATCH",
                  body: JSON.stringify({ avatarUrl: null }),
                })
                  .then((d) => onSaved(d.user))
                  .catch(() => {});
              }}
              className="flex items-center gap-1 rounded-full px-2 py-1.5 text-[11px] text-rose-300/90 transition-colors hover:bg-rose-500/10"
              title="Убрать аватар"
            >
              <Trash2 className="h-3 w-3" /> убрать
            </button>
          )}
        </div>
        {/* Мгновенная обратная связь по смене фото/баннера */}
        {flash && <p className="text-[11px] font-semibold text-emerald-300">{flash}</p>}
        <input
          ref={avatarInput}
          type="file"
          accept="image/*,.gif"
          className="hidden"
          onChange={(e) => {
            void pick(e.target.files?.[0] ?? null, "avatar");
            e.target.value = "";
          }}
        />
      </div>

      {/* Переключатель вкладок убран: те же разделы открываются строками ниже
          (Приватность / Оформление / Друзья / Моя карточка) */}
      {/* В подразделе — шапка со стрелкой «назад», как в настройках ТГ */}
      {tab !== "profile" && (
        <div className="flex items-center gap-2 border-b border-white/8 px-7 py-3">
          <button
            onClick={() => setTab("profile")}
            title="Назад в профиль (Esc)"
            className="grid h-8 w-8 place-items-center rounded-full bg-white/[0.06] text-white/80 transition-colors hover:bg-white/12"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <p className="font-display text-[15px] font-bold">
            {tab === "privacy" ? "Приватность" : tab === "appearance" ? "Оформление" : "Друзья"}
          </p>
        </div>
      )}

      <div className="nice-scroll max-h-[60vh] space-y-5 overflow-y-auto px-7 pt-4 pb-7">
        {tab === "appearance" ? (
          <AppearanceTab
            theme={theme}
            onSetTheme={onSetTheme}
            uiScale={uiScale}
            onSetUiScale={onSetUiScale}
            custom={custom}
            onSetCustom={onSetCustom}
            soundOn={soundOn}
            callSoundOn={callSoundOn}
            notifyOn={notifyOn}
            onToggleSound={onToggleSound}
            onToggleCallSound={onToggleCallSound}
            onToggleNotify={onToggleNotify}
          />
        ) : tab === "friends" ? (
          <FriendsTab me={me} />
        ) : tab === "privacy" ? (
          <>
            <button
              onClick={() => setPinOpen(true)}
              className="flex w-full items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.03] px-3.5 py-3 text-left transition-colors hover:bg-white/[0.06]"
              title="Защитить вход в приложение 4-значным кодом"
            >
              <Lock className="h-4.5 w-4.5 shrink-0 text-indigo-300" />
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-semibold">PIN-код приложения</span>
                <span className="block text-[11px] text-white/35">
                  {pinOn ? "Включён — нажмите, чтобы сменить или отключить" : "Замок на вход, как в ТГ"}
                </span>
              </span>
              <span className={`h-2 w-2 shrink-0 rounded-full ${pinOn ? "bg-emerald-400" : "bg-white/15"}`} />
            </button>
            <p className="text-xs leading-relaxed text-white/35">
              Эти настройки применяются сразу после сохранения и действуют на всех, кто пытается
              найти вас в Pulse.
            </p>
            <PrivacySettings
              me={me}
              onSaved={(u) => {
                onSaved(u);
              }}
            />
          </>
        ) : (
          <>
        <div className="text-center">
          {/* Имя видно сразу при редактировании профиля + статус-эмодзи рядом */}
          <p className="flex items-center justify-center gap-2">
            <span className="font-display text-lg font-bold">{displayName || me.username}</span>
            <StatusEmoji value={statusEmoji} size={32} />
          </p>
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={() => {
                void copyToClipboard(`@${username}`).then((ok) => {
                  if (ok) {
                    setCopiedName(true);
                    setTimeout(() => setCopiedName(false), 1500);
                  } else {
                    window.prompt("Скопируйте юзернейм:", `@${username}`);
                  }
                });
              }}
              title="Скопировать юзернейм"
              className="text-xs text-white/35 underline-offset-2 hover:underline"
            >
              {copiedName ? "Скопировано ✓" : `@${username}`}
            </button>
            {/* Инвайт-ссылка на мой профиль — как «ссылка на профиль» в ТГ */}
            <button
              onClick={() => {
                const url = `${window.location.origin}${window.location.pathname}#user=${username}`;
                void copyToClipboard(url).then((ok) => {
                  if (ok) {
                    setCopiedLink(true);
                    setTimeout(() => setCopiedLink(false), 1500);
                  } else {
                    window.prompt("Скопируйте ссылку:", url);
                  }
                });
              }}
              title="Скопировать ссылку на мой профиль — по ней любой откроет вашу карточку"
              className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors ${
                copiedLink
                  ? "border-emerald-300/40 text-emerald-300"
                  : "border-white/10 bg-white/5 text-white/45 hover:bg-white/10 hover:text-white/80"
              }`}
            >
              <Link2 className="h-2.5 w-2.5" />
              {copiedLink ? "Ссылка скопирована ✓" : "Моя ссылка"}
            </button>
          </div>
        </div>

        {/* Быстрые разделы — строками как в настройках ТГ: иконка, название, стрелка */}
        <div className="space-y-1">
          {(
            [
              ["privacy", "Приватность", Shield, "from-rose-500/80 to-red-400/70"],
              ["appearance", "Оформление", Palette, "from-sky-500/80 to-indigo-400/70"],
              ["friends", "Друзья", UsersRound, "from-emerald-500/80 to-teal-400/70"],
            ] as const
          ).map(([t, label, Icon, grad]) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left transition-colors hover:bg-white/5"
              title={`Открыть раздел «${label}»`}
            >
              <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br text-white ${grad}`}>
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1 text-[14px] font-medium text-white/85">{label}</span>
              <ChevronRight className="h-4 w-4 text-white/30" />
            </button>
          ))}
          {onOpenMyCard && (
            <button
              onClick={onOpenMyCard}
              className="flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left transition-colors hover:bg-white/5"
              title="Открыть мою карточку — так меня видят другие"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-violet-500/80 to-fuchsia-400/70 text-white">
                <ImageIcon className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1 text-[14px] font-medium text-white/85">Моя карточка</span>
              <ChevronRight className="h-4 w-4 text-white/30" />
            </button>
          )}
          <button
            onClick={() => setStatsOpen(true)}
            className="flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left transition-colors hover:bg-white/5"
            title="Личная статистика"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-sky-500/80 to-cyan-400/70 text-white">
              <BarChart3 className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1 text-[14px] font-medium text-white/85">Статистика</span>
            <ChevronRight className="h-4 w-4 text-white/30" />
          </button>
        </div>

        {statsOpen && <StatsModal onClose={() => setStatsOpen(false)} />}

        {/* Подарки — отдельная плашка с листанием */}
        {myGifts && myGifts.length > 0 && (
          <button
            onClick={() => setGiftsPanelOpen(true)}
            className="flex w-full items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.03] px-3.5 py-3 text-left transition-colors hover:border-amber-300/40 hover:bg-white/[0.06]"
          >
            <span className="flex shrink-0 -space-x-2">
              {myGifts.slice(0, 3).map((g) => {
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
              <span className="block text-sm font-semibold">Мои подарки</span>
              <span className="block text-[11px] text-white/35">
                {myGifts.length} шт · нажмите, чтобы листать
              </span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-white/30" />
          </button>
        )}

        <label className="block">
          <span className="mb-1.5 block text-xs font-medium tracking-wide text-white/45 uppercase">
            Отображаемое имя
          </span>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={40}
            className="ring-focus w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-[15px] transition-all"
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs font-medium tracking-wide text-white/45 uppercase">
            Юзернейм
          </span>
          <div className="flex items-center gap-1">
            <span className="text-white/35">@</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20))}
              className="ring-focus w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-[15px] transition-all"
            />
          </div>
          <p className="mt-1 text-[11px] text-white/30">5–32 символа: латиница, цифры, «_»</p>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs font-medium tracking-wide text-white/45 uppercase">
            О себе
          </span>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={70}
            rows={3}
            placeholder="Пара слов о себе…"
            className="ring-focus nice-scroll w-full resize-none rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-[15px] transition-all placeholder:text-white/25"
          />
          <span className="mt-1 block text-right text-[11px] text-white/25">{bio.length}/70</span>
        </label>

        {/* Pulse Premium — бесплатно, включается в два клика */}
        <div className="flex items-center gap-3 rounded-2xl border border-amber-300/20 bg-gradient-to-r from-amber-400/10 to-violet-400/10 px-4 py-3">
          <span className="text-2xl">💎</span>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-sm font-bold">
              Pulse Premium
              {me.premium && <span className="rounded-full bg-amber-300/20 px-2 py-0.5 text-[10px] font-bold text-amber-200">АКТИВЕН</span>}
            </p>
            <p className="text-[11px] leading-snug text-white/45">
              Файлы до 4 ГБ, цвет имени, сторис до 48 ч, кастом-эмодзи и не только. Бесплатно.
            </p>
          </div>
          <button
            onClick={() => void togglePremium()}
            className={`shrink-0 rounded-xl px-3.5 py-2 text-[12px] font-bold transition-colors ${
              me.premium
                ? "bg-white/10 text-white/70 hover:bg-white/15"
                : "bg-gradient-to-r from-amber-300 to-violet-300 text-black/80 hover:opacity-90"
            }`}
          >
            {me.premium ? "Выключить" : "Включить"}
          </button>
        </div>
        {me.premium && (
          <div className="-mt-1 grid grid-cols-2 gap-1.5 rounded-2xl border border-white/8 bg-white/[0.02] p-3 text-[11px] leading-snug text-white/55">
            {(
              [
                [Package, "Файлы до 4 ГБ"],
                [Palette, "Цвет имени в чатах"],
                [Timer, "Сторис до 48 часов"],
                [PenLine, "Подписи до 2048 симв."],
                [Star, "Кастом-эмодзи"],
                [ImageIcon, "Анимированные стикеры"],
                [Gem, "Значок в профиле"],
                [Infinity, "Все лимиты удвоены"],
              ] as const
            ).map(([Icon, label]) => (
              <span key={label} className="flex items-center gap-1.5">
                <Icon className="h-3.5 w-3.5 shrink-0 text-amber-200/80" />
                {label}
              </span>
            ))}
          </div>
        )}

        {/* Дата рождения */}
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium tracking-wide text-white/45 uppercase">
            Дата рождения
          </span>
          <input
            value={birthday}
            onChange={(e) => setBirthday(e.target.value)}
            maxLength={20}
            placeholder="31.12.1999"
            className="ring-focus w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-[15px] transition-all placeholder:text-white/25"
          />
        </label>

        {/* Кастомный статус-эмодзи: обычный эмодзи или анимированная гифка */}
        <div className="block">
          <span className="mb-1.5 block text-xs font-medium tracking-wide text-white/45 uppercase">
            Статус-эмодзи в профиле
          </span>
          <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/[0.06]">
              {statusEmoji ? (
                <StatusEmoji value={statusEmoji} size={36} />
              ) : (
                <span className="text-[11px] text-white/25">нет</span>
              )}
            </div>
            <button
              onClick={() => setEmojiPickerOpen((v) => !v)}
              className="glass rounded-xl px-3 py-1.5 text-xs font-medium text-white/85 transition-colors hover:bg-white/15"
            >
              {emojiPickerOpen ? "Скрыть выбор" : "Выбрать эмодзи"}
            </button>
            {statusEmoji && (
              <button
                onClick={() => setStatusEmoji("")}
                className="flex items-center gap-1 text-xs text-rose-300/90 transition-colors hover:text-rose-200"
              >
                <Trash2 className="h-3.5 w-3.5" /> убрать
              </button>
            )}
          </div>
          {emojiPickerOpen && (
            <div className="mt-2 rounded-2xl border border-white/10 bg-black/25 p-3">
              <p className="mb-1.5 text-[11px] font-semibold text-white/40">Эмодзи</p>
              <div className="grid grid-cols-10 gap-1">
                {STATUS_EMOJIS.map((e) => (
                  <button
                    key={e}
                    onClick={() => {
                      setStatusEmoji((cur) => (cur === e ? "" : e));
                    }}
                    className={`emoji-ios grid h-9 place-items-center rounded-lg text-xl transition-all hover:scale-110 hover:bg-white/10 ${
                      statusEmoji === e ? "bg-[#5865f2]/25 ring-1 ring-[#5865f2]" : ""
                    }`}
                  >
                    {e}
                  </button>
                ))}
              </div>
              <p className="mt-2.5 mb-1.5 text-[11px] font-semibold text-white/40">
                Анимированные гифки (ваши недавние стикеры)
              </p>
              <RecentGifRow
                onPick={(url) => setStatusEmoji((cur) => (cur === url ? "" : url))}
                active={statusEmoji}
              />
            </div>
          )}
        </div>

        {/* Цвет имени — как «цвет профиля» в ТГ Премиум */}
        <div className="block">
          <span className="mb-1.5 block text-xs font-medium tracking-wide text-white/45 uppercase">
            Цвет имени в чатах {!me.premium && "· Premium"}
          </span>
          {me.premium ? (
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
              <button
                onClick={() => setNameColor("")}
                title="Стандартный"
                className={`grid h-8 w-8 place-items-center rounded-full border text-[11px] transition-all ${
                  !nameColor ? "border-white/60 ring-2 ring-white/25" : "border-white/15 hover:border-white/40"
                }`}
              >
                Аа
              </button>
              {["#5b8def", "#a970ff", "#e8639c", "#ff7a59", "#f0c04b", "#4fc36c", "#35c2c1", "#ff5c5c"].map((c) => (
                <button
                  key={c}
                  onClick={() => setNameColor((cur) => (cur === c ? "" : c))}
                  title={c}
                  style={{ background: c }}
                  className={`h-8 w-8 rounded-full transition-all hover:scale-110 ${
                    nameColor === c ? "ring-2 ring-white/70" : "ring-1 ring-black/20"
                  }`}
                />
              ))}
              <span className="ml-1 text-sm font-semibold" style={nameColor ? { color: nameColor } : undefined}>
                {displayName || "Ваше имя"}
              </span>
            </div>
          ) : (
            <p className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-xs text-white/40">
              Доступно с Premium — включите его в разделе «Премиум».
            </p>
          )}
        </div>

        {error && (
          <p className="rounded-xl border border-rose-500/25 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-300">
            {error}
          </p>
        )}

        <button
          onClick={() => void save()}
          disabled={saving || displayName.trim().length === 0}
          className="btn-gradient flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-[15px] font-semibold text-white disabled:cursor-not-allowed"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Сохранить
        </button>

        <button
          onClick={() => setDevicesOpen(true)}
          className="glass flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-sm font-medium text-white/70 transition-colors hover:text-white"
          title="Активные сессии и устройства"
        >
          <Monitor className="h-4 w-4" />
          Устройства и сессии
        </button>

        <div className="flex gap-2.5">
          <button
            onClick={() => void logoutAll()}
            className="glass flex flex-1 items-center justify-center gap-2 rounded-2xl py-3 text-sm font-medium text-white/70 transition-colors hover:text-white"
          >
            <LogOut className="h-4 w-4" />
            Выйти на всех устройствах
          </button>
          <button
            onClick={() => void deleteAccount()}
            title="Удалить аккаунт"
            className="flex items-center justify-center gap-2 rounded-2xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-sm font-medium text-rose-300 transition-colors hover:bg-rose-500/20"
          >
            <Trash2 className="h-4 w-4" />
            Удалить аккаунт
          </button>
        </div>
          </>
        )}

        {tab === "privacy" && (
          <a
            href="/privacy"
            target="_blank"
            rel="noreferrer"
            className="block text-center text-xs text-slate-400/80 transition-colors hover:text-slate-300"
          >
            Политика конфиденциальности →
          </a>
        )}
      </div>
    </ModalShell>

      {pinOpen && (
        <PinSetupModal onClose={() => setPinOpen(false)} notify={notify} />
      )}

      {/* Устройства: активные сессии */}
      {devicesOpen && <SessionsModal onClose={() => setDevicesOpen(false)} notify={notify} />}

      {/* Плашка подарков — отдельное окно с листанием */}
      {giftsPanelOpen && myGifts && (
        <GiftsPanel
          title="Мои подарки"
          gifts={myGifts}
          canPin
          onClose={() => setGiftsPanelOpen(false)}
        />
      )}

      {/* Детали подарка — мгновенно, из уже загруженных данных */}
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
          canPin
          onPinned={(v) => {
            setMyGifts((cur) =>
              cur ? cur.map((x) => (x.id === giftDetail.id ? { ...x, pinned: v } : x)) : cur,
            );
            setGiftDetail((cur) => (cur && cur.id === giftDetail.id ? { ...cur, pinned: v } : cur));
          }}
          onClose={() => setGiftDetail(null)}
        />
      )}
    </>
  );
}

const BUBBLE_COLORS: Record<string, string> = {
  blue: "#2f4b7c",
  green: "#2f6b4f",
  red: "#7c3a3a",
  purple: "#54407c",
  gray: "#3a3f47",
};
const RADIUS: Record<string, string> = {
  sm: "0.6rem 0.6rem 0.25rem 0.6rem",
  md: "1rem 1rem 0.35rem 1rem",
  lg: "1.6rem 1.6rem 0.6rem 1.6rem",
};
const CHATFS: Record<string, string> = { s: "12px", m: "14px", l: "16px" };
const THEMES: Record<string, { bg: string; panel: string; label: string }> = {
  gray: { bg: "#20232a", panel: "#2a2e36", label: "Серая" },
  tg: { bg: "#12202f", panel: "#17293a", label: "Синяя" },
  light: { bg: "#eef1f5", panel: "#ffffff", label: "Светлая" },
  auto: { bg: "linear-gradient(135deg,#20232a 50%,#12202f 50%)", panel: "#2a2e36", label: "Авто" },
};

/** Личная статистика: стаж, чаты, сообщения, полученные реакции. */
function StatsModal({ onClose }: { onClose: () => void }) {
  const [stats, setStats] = useState<{
    days: number;
    chats: number;
    sent: number;
    reactions: number;
    premium: boolean;
  } | null>(null);
  useEffect(() => {
    let dead = false;
    api<{ stats: { days: number; chats: number; sent: number; reactions: number; premium: boolean } }>(
      "/api/auth/me/stats",
    )
      .then((d) => {
        if (!dead) setStats(d.stats);
      })
      .catch(() => {
        if (!dead) setStats({ days: 0, chats: 0, sent: 0, reactions: 0, premium: false });
      });
    return () => {
      dead = true;
    };
  }, []);
  return (
    <div className="fixed inset-0 z-[92] grid place-items-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="pm-rise w-full max-w-sm rounded-3xl border border-white/10 bg-[#1b1e24] p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="flex items-center gap-2 text-[15px] font-bold">
          <BarChart3 className="h-4 w-4 text-sky-300" /> Моя статистика
        </p>
        {!stats ? (
          <p className="py-8 text-center text-[13px] text-white/40">Считаем…</p>
        ) : (
          <div className="grid grid-cols-2 gap-2 pt-4">
            {[
              [stats.days, "дней в Pulse"],
              [stats.chats, "чатов"],
              [stats.sent, "сообщений отправлено"],
              [stats.reactions, "реакций на ваших сообщениях"],
            ].map(([n, label]) => (
              <div key={String(label)} className="rounded-2xl border border-white/8 bg-white/[0.04] px-3 py-3 text-center">
                <p className="text-[20px] font-extrabold text-sky-300 tabular-nums">{n}</p>
                <p className="pt-0.5 text-[11px] leading-tight text-white/45">{label}</p>
              </div>
            ))}
          </div>
        )}
        {stats?.premium && (
          <p className="pt-3 text-center text-[12px] font-semibold text-amber-300">⭐ У вас Pulse Premium</p>
        )}
        <button
          onClick={onClose}
          className="mt-4 w-full rounded-2xl bg-white/8 py-2.5 text-[13px] font-medium text-white/70 hover:bg-white/12"
        >
          Закрыть
        </button>
      </div>
    </div>
  );
}

/**
 * Вкладка «Оформление» — все настройки вида переехали из сайдбара.
 * Внизу живой предпросмотр: мини-чат сразу показывает выбранный вид.
 */
function AppearanceTab({
  theme,
  onSetTheme,
  uiScale,
  onSetUiScale,
  custom,
  onSetCustom,
  soundOn,
  callSoundOn,
  notifyOn,
  onToggleSound,
  onToggleCallSound,
  onToggleNotify,
}: {
  theme: "gray" | "tg" | "light" | "auto";
  onSetTheme?: (t: "gray" | "tg" | "light" | "auto") => void;
  uiScale: "s" | "m" | "l";
  onSetUiScale?: (v: "s" | "m" | "l") => void;
  custom?: import("./Sidebar").CustomSettings;
  onSetCustom?: (c: import("./Sidebar").CustomSettings) => void;
  soundOn: boolean;
  callSoundOn: boolean;
  notifyOn: boolean;
  onToggleSound?: () => void;
  onToggleCallSound?: () => void;
  onToggleNotify?: () => void;
}) {
  const t = THEMES[theme] ?? THEMES.gray;
  const light = theme === "light";
  const ownColor = BUBBLE_COLORS[custom?.bubbles ?? "blue"] ?? BUBBLE_COLORS.blue;
  const ownRadius = RADIUS[custom?.radius ?? "md"] ?? RADIUS.md;
  const peerRadius = ownRadius.split(" ").reverse().join(" ");
  const fs = CHATFS[custom?.chatfs ?? "m"] ?? CHATFS.m;
  const roundFont = custom?.font === "round";
  const font = roundFont ? "'Nunito', 'Comic Sans MS', ui-rounded, sans-serif" : "inherit";

  const set = (patch: Partial<NonNullable<typeof custom>>) => {
    if (!custom || !onSetCustom) return;
    onSetCustom({ ...custom, ...patch });
  };

  return (
    <div className="space-y-5">
      <p className="text-xs leading-relaxed text-white/35">
        Всё оформление живёт здесь и применяется сразу. Внизу — живой предпросмотр того, как будет
        выглядеть чат.
      </p>

      {/* Живой предпросмотр */}
      <div
        className="overflow-hidden rounded-2xl border border-white/10"
        style={{ background: t.bg, fontFamily: font }}
      >
        <div
          className="flex items-center gap-2 px-3 py-2 text-[12px] font-semibold"
          style={{ background: t.panel, color: light ? "#111" : "#fff" }}
        >
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />
          Предпросмотр · @{`имя`}
        </div>
        <div className="space-y-2 px-3 py-3">
          <div className="flex justify-start">
            <div
              className="max-w-[70%] px-3 py-1.5"
              style={{
                background: light ? "#fff" : "rgba(255,255,255,0.08)",
                color: light ? "#111" : "#e7e9ee",
                borderRadius: peerRadius,
                fontSize: fs,
              }}
            >
              Привет! Так будет выглядеть чужое сообщение
            </div>
          </div>
          <div className="flex justify-end">
            <div
              className="max-w-[70%] px-3 py-1.5 text-white"
              style={{ background: ownColor, borderRadius: ownRadius, fontSize: fs }}
            >
              А так — твоё, с выбранным цветом и формой
            </div>
          </div>
        </div>
      </div>

      {/* Тема */}
      <div>
        <p className="mb-2 text-xs font-semibold tracking-wide text-white/45 uppercase">Тема</p>
        <div className="grid grid-cols-3 gap-1.5">
          {(Object.keys(THEMES) as (keyof typeof THEMES)[]).map((k) => (
            <button
              key={k}
              onClick={() => onSetTheme?.(k as "gray" | "tg" | "light" | "auto")}
              className={`rounded-xl border px-2 py-2.5 text-[12px] font-medium transition-all ${
                theme === k
                  ? "border-[#5865f2] bg-[#5865f2]/15 text-white"
                  : "border-white/10 bg-white/[0.04] text-white/55 hover:bg-white/8"
              }`}
            >
              {THEMES[k].label}
            </button>
          ))}
        </div>
      </div>

      {/* Акцентный цвет — перекрашивает кнопки, ссылки и выделения */}
      <div>
        <p className="mb-2 text-xs font-semibold tracking-wide text-white/45 uppercase">Акцентный цвет</p>
        <div className="flex items-center gap-2">
          {(
            [
              ["default", "#5865f2", "Стандарт"],
              ["violet", "#7c3aed", "Фиолет"],
              ["emerald", "#059669", "Изумруд"],
              ["rose", "#e11d48", "Роза"],
              ["amber", "#d97706", "Янтарь"],
              ["cyan", "#0891b2", "Бирюза"],
            ] as const
          ).map(([key, color, label]) => (
            <button
              key={key}
              onClick={() => set({ accent: key })}
              title={label}
              className={`grid h-9 w-9 place-items-center rounded-full transition-transform hover:scale-110 ${
                (custom?.accent ?? "default") === key ? "ring-2 ring-white/80 ring-offset-2 ring-offset-black/40" : ""
              }`}
              style={{ background: color }}
            >
              {(custom?.accent ?? "default") === key && (
                <span className="text-[13px] font-bold text-white">✓</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Размер интерфейса */}
      <div>
        <p className="mb-2 text-xs font-semibold tracking-wide text-white/45 uppercase">
          Размер интерфейса
        </p>
        <div className="grid grid-cols-3 gap-1.5">
          {(
            [
              ["s", "Мелкий"],
              ["m", "Обычный"],
              ["l", "Крупный"],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              onClick={() => onSetUiScale?.(v)}
              className={`rounded-xl border px-2 py-2 text-[12px] font-medium transition-all ${
                uiScale === v
                  ? "border-[#5865f2] bg-[#5865f2]/15 text-white"
                  : "border-white/10 bg-white/[0.04] text-white/55 hover:bg-white/8"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Цвет своих пузырей */}
      <div>
        <p className="mb-2 text-xs font-semibold tracking-wide text-white/45 uppercase">
          Цвет своих сообщений
        </p>
        <div className="flex items-center gap-2">
          {Object.entries(BUBBLE_COLORS).map(([k, col]) => (
            <button
              key={k}
              onClick={() => set({ bubbles: k })}
              className={`h-8 w-8 rounded-lg transition-all ${
                custom?.bubbles === k ? "ring-2 ring-white ring-offset-2 ring-offset-black/40" : "hover:scale-110"
              }`}
              style={{ background: col }}
              title={k}
            />
          ))}
        </div>
      </div>

      {/* Форма пузырей + размер текста */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="mb-2 text-xs font-semibold tracking-wide text-white/45 uppercase">Углы</p>
          <div className="grid grid-cols-3 gap-1.5">
            {(
              [
                ["sm", "Острые"],
                ["md", "Средние"],
                ["lg", "Круглые"],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                onClick={() => set({ radius: v })}
                className={`rounded-xl border px-1 py-2 text-[11px] font-medium transition-all ${
                  custom?.radius === v
                    ? "border-[#5865f2] bg-[#5865f2]/15 text-white"
                    : "border-white/10 bg-white/[0.04] text-white/55 hover:bg-white/8"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold tracking-wide text-white/45 uppercase">
            Размер текста
          </p>
          <div className="grid grid-cols-3 gap-1.5">
            {(
              [
                ["s", "S"],
                ["m", "M"],
                ["l", "L"],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                onClick={() => set({ chatfs: v })}
                className={`rounded-xl border px-1 py-2 text-[11px] font-medium transition-all ${
                  custom?.chatfs === v
                    ? "border-[#5865f2] bg-[#5865f2]/15 text-white"
                    : "border-white/10 bg-white/[0.04] text-white/55 hover:bg-white/8"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Переключатели */}
      <div className="space-y-3">
        <Toggle
          checked={!!custom?.compact}
          onChange={(v) => set({ compact: v })}
          icon={<CircleDot className="h-4 w-4 text-white/50" />}
          label="Компактный список чатов"
          hint="Меньше отступов — больше диалогов на экране"
        />
        <Toggle
          checked={custom?.font === "round"}
          onChange={(v) => set({ font: v ? "round" : "sys" })}
          icon={<CircleDot className="h-4 w-4 text-white/50" />}
          label="Округлый шрифт"
          hint="Более мягкий, «пузырчатый» шрифт во всём интерфейсе"
        />
        <Toggle
          checked={custom?.anims ?? true}
          onChange={(v) => set({ anims: v })}
          icon={<CircleDot className="h-4 w-4 text-white/50" />}
          label="Анимации"
          hint="Плавные появления сообщений и переходы"
        />
        {onToggleSound && (
          <Toggle
            checked={soundOn}
            onChange={() => onToggleSound()}
            icon={<CircleDot className="h-4 w-4 text-white/50" />}
            label="Звук сообщений"
            hint="Короткий сигнал о новом сообщении"
          />
        )}
        {onToggleCallSound && (
          <Toggle
            checked={callSoundOn}
            onChange={() => onToggleCallSound()}
            icon={<CircleDot className="h-4 w-4 text-white/50" />}
            label="Звук входящего звонка"
            hint="Рингтон, когда вам звонят"
          />
        )}
        {onToggleNotify && (
          <Toggle
            checked={notifyOn}
            onChange={() => onToggleNotify()}
            icon={<CircleDot className="h-4 w-4 text-white/50" />}
            label="Браузерные уведомления"
            hint="Всплывают, даже когда вкладка скрыта"
          />
        )}
      </div>
    </div>
  );
}

/** Вкладка «Друзья» — заявки как в Discord: входящие, исходящие, список. */
function FriendsTab({ me }: { me: PublicUser }) {
  const [friends, setFriends] = useState<PublicUser[]>([]);
  const [incoming, setIncoming] = useState<PublicUser[]>([]);
  const [outgoing, setOutgoing] = useState<PublicUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PublicUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [busyId, setBusyId] = useState("");

  const reload = async () => {
    try {
      const d = await api<{ friends: PublicUser[]; incoming: PublicUser[]; outgoing: PublicUser[] }>(
        "/api/friends",
      );
      setFriends(d.friends);
      setIncoming(d.incoming);
      setOutgoing(d.outgoing);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void reload();
  }, []);

  const act = async (userId: string, action: string) => {
    setBusyId(userId);
    try {
      await api("/api/friends", { method: "POST", body: JSON.stringify({ userId, action }) });
      await reload();
      setResults([]);
      setQ("");
    } finally {
      setBusyId("");
    }
  };

  const search = async () => {
    const query = q.trim();
    if (!query) return;
    setSearching(true);
    try {
      const d = await api<{ users: PublicUser[] }>(`/api/users/search?q=${encodeURIComponent(query)}`);
      setResults(d.users.filter((u) => u.id !== me.id));
    } finally {
      setSearching(false);
    }
  };

  const friendIds = new Set(friends.map((f) => f.id));
  const incomingIds = new Set(incoming.map((f) => f.id));
  const outgoingIds = new Set(outgoing.map((f) => f.id));

  const Row = ({ u, right }: { u: PublicUser; right: React.ReactNode }) => (
    <div className="flex items-center gap-3 rounded-xl bg-white/[0.03] px-3 py-2">
      <Avatar name={u.displayName} src={u.avatarUrl} online={u.online} size={34} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-white/85">{u.displayName}</p>
        <p className="truncate text-xs text-white/35">@{u.username}</p>
      </div>
      {right}
    </div>
  );

  const ActionBtn = ({
    label,
    tone,
    onClick,
    disabled,
  }: {
    label: string;
    tone: "accent" | "ghost" | "danger";
    onClick: () => void;
    disabled?: boolean;
  }) => (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`shrink-0 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-colors disabled:opacity-40 ${
        tone === "accent"
          ? "bg-[#5865f2] text-white hover:bg-[#4752c4]"
          : tone === "danger"
          ? "bg-rose-500/15 text-rose-300 hover:bg-rose-500/25"
          : "bg-white/10 text-white/70 hover:bg-white/15"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="nice-scroll max-h-[52vh] space-y-5 overflow-y-auto pr-1">
      <p className="text-xs leading-relaxed text-white/35">
        Добавляйте людей в друзья — как в Discord. Входящие заявки ждут подтверждения.
      </p>

      {/* Поиск для добавления */}
      <div className="flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void search()}
          placeholder="Найти по имени или @никнейму…"
          className="ring-focus flex-1 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm transition-all placeholder:text-white/25"
        />
        <button
          onClick={() => void search()}
          disabled={searching || !q.trim()}
          className="flex items-center gap-1.5 rounded-xl bg-[#5865f2] px-3.5 text-sm font-semibold text-white transition-colors hover:bg-[#4752c4] disabled:opacity-40"
        >
          {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
          Найти
        </button>
      </div>

      {results.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold tracking-wide text-white/40 uppercase">Результаты</p>
          {results.map((u) => {
            const isFriend = friendIds.has(u.id);
            const isOut = outgoingIds.has(u.id);
            const isIn = incomingIds.has(u.id);
            return (
              <Row
                key={u.id}
                u={u}
                right={
                  isFriend ? (
                    <span className="text-[11px] text-emerald-300">Уже в друзьях</span>
                  ) : isOut ? (
                    <ActionBtn
                      label="Отменить"
                      tone="ghost"
                      disabled={busyId === u.id}
                      onClick={() => void act(u.id, "remove")}
                    />
                  ) : isIn ? (
                    <ActionBtn
                      label="Принять"
                      tone="accent"
                      disabled={busyId === u.id}
                      onClick={() => void act(u.id, "accept")}
                    />
                  ) : (
                    <ActionBtn
                      label="Добавить"
                      tone="accent"
                      disabled={busyId === u.id}
                      onClick={() => void act(u.id, "request")}
                    />
                  )
                }
              />
            );
          })}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-6 text-white/40">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : (
        <>
          {incoming.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold tracking-wide text-white/40 uppercase">
                Входящие заявки · {incoming.length}
              </p>
              {incoming.map((u) => (
                <Row
                  key={u.id}
                  u={u}
                  right={
                    <div className="flex gap-1.5">
                      <ActionBtn
                        label="Принять"
                        tone="accent"
                        disabled={busyId === u.id}
                        onClick={() => void act(u.id, "accept")}
                      />
                      <ActionBtn
                        label="Отклонить"
                        tone="danger"
                        disabled={busyId === u.id}
                        onClick={() => void act(u.id, "decline")}
                      />
                    </div>
                  }
                />
              ))}
            </div>
          )}

          {outgoing.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold tracking-wide text-white/40 uppercase">
                Исходящие · {outgoing.length}
              </p>
              {outgoing.map((u) => (
                <Row
                  key={u.id}
                  u={u}
                  right={
                    <ActionBtn
                      label="Отменить"
                      tone="ghost"
                      disabled={busyId === u.id}
                      onClick={() => void act(u.id, "remove")}
                    />
                  }
                />
              ))}
            </div>
          )}

          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold tracking-wide text-white/40 uppercase">
              Мои друзья · {friends.length}
            </p>
            {friends.length === 0 ? (
              <p className="rounded-xl bg-white/[0.03] px-3 py-4 text-center text-sm text-white/30">
                Пока никого нет. Найдите человека выше и отправьте заявку.
              </p>
            ) : (
              friends.map((u) => (
                <Row
                  key={u.id}
                  u={u}
                  right={
                    <ActionBtn
                      label="Убрать"
                      tone="ghost"
                      disabled={busyId === u.id}
                      onClick={() => void act(u.id, "remove")}
                    />
                  }
                />
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  icon,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  icon: React.ReactNode;
  label: string;
  hint: string;
}) {
  return (
    <button onClick={() => onChange(!checked)} className="flex w-full items-center gap-3 text-left">
      <span className="glass flex h-9 w-9 shrink-0 items-center justify-center rounded-xl">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-white/85">{label}</span>
        <span className="block text-xs leading-snug text-white/35">{hint}</span>
      </span>
      <span
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
          checked ? "bg-[#5865f2]" : "bg-white/15"
        }`}
      >
        <motion.span
          layout
          transition={{ type: "spring", bounce: 0.3, duration: 0.3 }}
          className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow"
          style={{ left: checked ? "1.375rem" : "0.125rem" }}
        />
      </span>
    </button>
  );
}

/**
 * Ряд недавно загруженных пользователем гифок-стикеров (тот же список, что в
 * чате) — можно выбрать как АНИМИРОВАННЫЙ статус-эмодзи профиля.
 */
export function RecentGifRow({
  onPick,
  active,
}: {
  onPick: (url: string) => void;
  active?: string;
}) {
  const [gifs, setGifs] = useState<string[]>([]);
  useEffect(() => {
    try {
      const raw = localStorage.getItem("pulse_recent_stickers_v1");
      const arr = raw ? (JSON.parse(raw) as unknown) : [];
      setGifs(Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : []);
    } catch {
      setGifs([]);
    }
  }, []);
  if (gifs.length === 0) {
    return (
      <p className="text-[11px] leading-relaxed text-white/30">
        Пока пусто. Загрузите гифку-стикер в любом чате — она появится здесь.
      </p>
    );
  }
  return (
    <div className="nice-scroll flex gap-1.5 overflow-x-auto pb-1">
      {gifs.map((u) => (
        <button
          key={u}
          onClick={() => onPick(u)}
          title="Сделать статус-эмодзи"
          className={`h-12 w-12 shrink-0 overflow-hidden rounded-xl transition-all hover:scale-105 ${
            active === u ? "ring-2 ring-[#5865f2] ring-offset-2 ring-offset-[#24272d]" : ""
          }`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={u} alt="" className="h-full w-full object-contain" draggable={false} />
        </button>
      ))}
    </div>
  );
}

export function ModalShell({
  children,
  onClose,
  wide,
  noEscape,
  shellId,
}: {
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
  /** Окно само обрабатывает Esc (например, с внутренней каскадной логикой). */
  noEscape?: boolean;
  /** Свой id в стеке окон (нужен окнам с собственной логикой Esc). */
  shellId?: symbol;
}) {
  const idRef = useRef<symbol | null>(null);
  if (!idRef.current) idRef.current = shellId ?? Symbol("modal-shell");
  // Esc закрывает окно: только самое верхнее в стеке, и только если окно
  // не обрабатывает клавишу само (каскады вроде профиля с подразделами).
  useEffect(() => {
    const leave = modalEnter(idRef.current as symbol);
    if (!noEscape) {
      const h = (e: KeyboardEvent) => {
        if (e.key !== "Escape") return;
        if (isTopModal(idRef.current as symbol)) onClose();
      };
      window.addEventListener("keydown", h);
      return () => {
        window.removeEventListener("keydown", h);
        leave();
      };
    }
    return leave;
  }, [onClose, noEscape]);
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-[90] grid place-items-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 24 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 12 }}
        transition={{ type: "spring", bounce: 0.22, duration: 0.45 }}
        onClick={(e) => e.stopPropagation()}
        className={`glass-strong nice-scroll m-auto max-h-[90vh] w-full overflow-y-auto rounded-[1.8rem] shadow-[0_40px_100px_-20px_rgba(0,0,0,0.9)] ${
          wide ? "max-w-lg" : "max-w-md"
        }`}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}