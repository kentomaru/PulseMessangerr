"use client";

import { useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Camera,
  CheckCheck,
  EyeOff,
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
import { api, uploadFile } from "@/lib/api";
import type { PublicUser } from "@/lib/types";

type Props = {
  me: PublicUser;
  onClose: () => void;
  onSaved: (u: PublicUser) => void;
  onDeletedAccount: () => void;
};

export default function ProfileModal({ me, onClose, onSaved, onDeletedAccount }: Props) {
  const [displayName, setDisplayName] = useState(me.displayName);
  const [bio, setBio] = useState(me.bio);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(me.avatarUrl);
  const [bannerUrl, setBannerUrl] = useState<string | null>(me.bannerUrl);
  const [showOnline, setShowOnline] = useState(me.showOnline);
  const [allowCalls, setAllowCalls] = useState(me.allowCalls);
  const [allowMessages, setAllowMessages] = useState(me.allowMessages);
  const [showReadReceipts, setShowReadReceipts] = useState(me.showReadReceipts);
  const [allowStories, setAllowStories] = useState(me.allowStories);
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
          showOnline,
          allowCalls,
          allowMessages,
          showReadReceipts,
          allowStories,
        }),
      });
      onSaved(d.user);
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
      {/* баннер */}
      <div
        className={`relative h-36 w-full overflow-hidden ${
          bannerUrl ? "" : `bg-gradient-to-br ${paletteFor(me.username)}`
        }`}
      >
        {bannerUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={bannerUrl} alt="Баннер" className="h-full w-full object-cover" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/55 to-transparent" />
        <button
          onClick={() => bannerInput.current?.click()}
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

      {/* аватар */}
      <div className="relative -mt-10 flex justify-center">
        <button
          onClick={() => avatarInput.current?.click()}
          className="group relative rounded-full ring-4 ring-[#0d0d18]"
        >
          <Avatar name={displayName || me.username} src={avatarUrl} size={86} />
          <span className="absolute inset-0 grid place-items-center rounded-full bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
            {busy === "avatar" ? <Loader2 className="h-5 w-5 animate-spin text-white" /> : <Camera className="h-5 w-5 text-white" />}
          </span>
        </button>
        <input
          ref={avatarInput}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={(e) => {
            void pick(e.target.files?.[0] ?? null, "avatar");
            e.target.value = "";
          }}
        />
      </div>

      <div className="nice-scroll max-h-[60vh] space-y-5 overflow-y-auto px-7 pt-4 pb-7">
        <div className="text-center">
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

        {/* Приватность */}
        <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white/85">
            <Shield className="h-4 w-4 text-violet-300" />
            Приватность
          </div>
          <div className="space-y-3.5">
            <Toggle
              checked={showOnline}
              onChange={setShowOnline}
              icon={<span className="text-xs">🟢</span>}
              label="Показывать статус «в сети»"
              hint="Скрывает онлайн и время последнего визита"
            />
            <Toggle
              checked={allowCalls}
              onChange={setAllowCalls}
              icon={<PhoneOff className="h-4 w-4 text-white/50" />}
              label="Разрешать звонки"
              hint="Если выключить — вам никто не сможет позвонить"
            />
            <Toggle
              checked={allowMessages}
              onChange={setAllowMessages}
              icon={<MessageSquareLock className="h-4 w-4 text-white/50" />}
              label="Разрешать новые личные чаты"
              hint="Существующие чаты продолжат работать"
            />
            <Toggle
              checked={showReadReceipts}
              onChange={setShowReadReceipts}
              icon={<CheckCheck className="h-4 w-4 text-white/50" />}
              label="Показывать прочтение сообщений"
              hint="Собеседник не увидит вторую галочку, если вы это запретите"
            />
            <Toggle
              checked={allowStories}
              onChange={setAllowStories}
              icon={<EyeOff className="h-4 w-4 text-white/50" />}
              label="Показывать мои истории другим"
              hint="Ваши истории останутся видны вам, но скроются у других"
            />
          </div>
          <a
            href="/privacy"
            target="_blank"
            rel="noreferrer"
            className="mt-4 block text-center text-xs text-violet-300/80 transition-colors hover:text-violet-200"
          >
            Политика конфиденциальности →
          </a>
        </div>

        {error && (
          <p className="rounded-xl border border-rose-500/25 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-300">
            {error}
          </p>
        )}

        <button
          onClick={() => void save()}
          disabled={saving || busy !== null || displayName.trim().length === 0}
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
      </div>
    </ModalShell>
  );
}

function Toggle({
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
    <div className="rounded-2xl border border-white/8 bg-black/10 p-3">
      <div className="flex items-start gap-3">
        <span className="glass flex h-9 w-9 shrink-0 items-center justify-center rounded-xl">{icon}</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-white/85">{label}</p>
          <p className="mt-0.5 text-xs leading-snug text-white/35">{hint}</p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onChange(true)}
          aria-pressed={checked}
          className={`rounded-xl px-3 py-2 text-xs font-semibold transition-colors ${
            checked
              ? "bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-400/40"
              : "bg-white/5 text-white/35 hover:bg-white/10 hover:text-white/70"
          }`}
        >
          Разрешено
        </button>
        <button
          type="button"
          onClick={() => onChange(false)}
          aria-pressed={!checked}
          className={`rounded-xl px-3 py-2 text-xs font-semibold transition-colors ${
            !checked
              ? "bg-rose-500/20 text-rose-200 ring-1 ring-rose-400/40"
              : "bg-white/5 text-white/35 hover:bg-white/10 hover:text-white/70"
          }`}
        >
          Запрещено
        </button>
      </div>
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
      className="fixed inset-0 z-[60] grid place-items-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm"
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
