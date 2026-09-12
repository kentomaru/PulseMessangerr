"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Camera,
  CircleDot,
  ImageIcon,
  Loader2,
  LogOut,
  MessageSquareLock,
  PhoneOff,
  Shield,
  Trash2,
  X,
} from "lucide-react";
import Avatar, { paletteFor } from "./Avatar";
import StatusEmoji from "./StatusEmoji";
import { PrivacySettings } from "./PrivacyModal";
import { api, uploadFile } from "@/lib/api";
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
};

export default function ProfileModal({ me, onClose, onSaved, onDeletedAccount }: Props) {
  /** Вкладки редактирования: «Профиль» и «Приватность» (пункт ТЗ №4). */
  const [tab, setTab] = useState<"profile" | "privacy">("profile");
  const [displayName, setDisplayName] = useState(me.displayName);
  const [bio, setBio] = useState(me.bio);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(me.avatarUrl);
  const [bannerUrl, setBannerUrl] = useState<string | null>(me.bannerUrl);
  /** Кастомный статус-эмодзи: эмодзи или анимированная гифка. */
  const [statusEmoji, setStatusEmoji] = useState(me.statusEmoji || "");
  /** Панель выбора баннера (живые пресеты + загрузка гифки). */
  const [bannerPickerOpen, setBannerPickerOpen] = useState(false);
  /** Панель выбора статус-эмодзи. */
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<"avatar" | "banner" | null>(null);
  const [error, setError] = useState("");
  const avatarInput = useRef<HTMLInputElement | null>(null);
  const bannerInput = useRef<HTMLInputElement | null>(null);

  const pick = async (file: File | null, kind: "avatar" | "banner") => {
    if (!file) return;
    setBusy(kind);
    setError("");
    try {
      const url = await uploadFile(file);
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
      } catch {
        /* сохранится вместе с кнопкой «Сохранить» */
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки");
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
          bio,
          avatarUrl,
          bannerUrl,
          statusEmoji,
        }),
      });
      onSaved(d.user);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить");
      setSaving(false);
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
    <ModalShell onClose={onClose}>
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
                    active ? "ring-2 ring-violet-400 ring-offset-2 ring-offset-[#0d0d18]" : "opacity-80 hover:opacity-100"
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
                className="h-12 w-24 shrink-0 overflow-hidden rounded-xl ring-2 ring-violet-400 ring-offset-2 ring-offset-[#0d0d18]"
                style={bannerStyle(bannerUrl)}
                title="Ваш баннер"
              />
            )}
          </div>
        </div>
      )}

      {/* аватар: клик по нему ИЛИ по кнопке «Сменить фото» открывает выбор файла */}
      <div className="relative -mt-10 flex flex-col items-center gap-2">
        <button
          onClick={() => avatarInput.current?.click()}
          className="group relative rounded-full ring-4 ring-[#0d0d18]"
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
              onClick={() => setAvatarUrl(null)}
              className="flex items-center gap-1 rounded-full px-2 py-1.5 text-[11px] text-rose-300/90 transition-colors hover:bg-rose-500/10"
              title="Убрать аватар"
            >
              <Trash2 className="h-3 w-3" /> убрать
            </button>
          )}
        </div>
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

      {/* Вкладки: Профиль / Приватность */}
      <div className="flex gap-1 border-b border-white/8 px-7 pt-3">
        {(
          [
            ["profile", "Профиль", null],
            ["privacy", "Приватность", <Shield key="i" className="h-3.5 w-3.5" />],
          ] as const
        ).map(([t, label, icon]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`relative flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === t ? "text-white" : "text-white/40 hover:text-white/70"
            }`}
          >
            {icon}
            {label}
            {tab === t && (
              <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-gradient-to-r from-violet-400 to-fuchsia-400" />
            )}
          </button>
        ))}
      </div>

      <div className="nice-scroll max-h-[60vh] space-y-5 overflow-y-auto px-7 pt-4 pb-7">
        {tab === "privacy" ? (
          <>
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
            <StatusEmoji value={statusEmoji} size={28} />
          </p>
          <p className="text-xs text-white/35">@{me.username}</p>
        </div>

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
            О себе
          </span>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={280}
            rows={3}
            placeholder="Пара слов о себе…"
            className="ring-focus nice-scroll w-full resize-none rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-[15px] transition-all placeholder:text-white/25"
          />
          <span className="mt-1 block text-right text-[11px] text-white/25">{bio.length}/280</span>
        </label>

        {/* Кастомный статус-эмодзи: обычный эмодзи или анимированная гифка */}
        <div className="block">
          <span className="mb-1.5 block text-xs font-medium tracking-wide text-white/45 uppercase">
            Статус-эмодзи в профиле
          </span>
          <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/[0.06]">
              {statusEmoji ? (
                <StatusEmoji value={statusEmoji} size={30} />
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
                    className={`grid h-9 place-items-center rounded-lg text-lg transition-all hover:scale-110 hover:bg-white/10 ${
                      statusEmoji === e ? "bg-violet-500/25 ring-1 ring-violet-400" : ""
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
            className="block text-center text-xs text-violet-300/80 transition-colors hover:text-violet-200"
          >
            Политика конфиденциальности →
          </a>
        )}
      </div>
    </ModalShell>
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
          checked ? "bg-violet-500" : "bg-white/15"
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
            active === u ? "ring-2 ring-violet-400 ring-offset-2 ring-offset-[#0d0d18]" : ""
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
}: {
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
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
        className={`glass-strong w-full overflow-hidden rounded-[1.8rem] shadow-[0_40px_100px_-20px_rgba(0,0,0,0.9)] ${
          wide ? "max-w-lg" : "max-w-md"
        }`}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}
