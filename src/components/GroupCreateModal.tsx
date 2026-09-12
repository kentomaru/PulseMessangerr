"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Camera,
  Check,
  Hash,
  Loader2,
  Lock,
  Megaphone,
  Search,
  SearchX,
  Users,
  X,
} from "lucide-react";
import Avatar from "./Avatar";
import { ModalShell } from "./ProfileModal";
import { api, uploadFile } from "@/lib/api";
import type { ConversationKind, PublicUser } from "@/lib/types";

type Props = {
  me: PublicUser;
  /** Контакты для быстрого выбора (участники моих диалогов). */
  contacts: PublicUser[];
  onClose: () => void;
  onCreated: (conversationId: string) => void;
  notify: (msg: string) => void;
  initialKind?: ConversationKind;
};

/** Создание группы или канала (как в Discord: название, аватар, приватность, участники). */
export default function GroupCreateModal({
  me,
  contacts,
  onClose,
  onCreated,
  notify,
  initialKind = "group",
}: Props) {
  const [kind, setKind] = useState<ConversationKind>(initialKind === "channel" ? "channel" : "group");
  const [name, setName] = useState("");
  const [about, setAbout] = useState("");
  const [isPrivate, setIsPrivate] = useState(true);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [selected, setSelected] = useState<PublicUser[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PublicUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const q = query.trim();
    if (q.length < 1) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const d = await api<{ users: PublicUser[] }>(`/api/users/search?q=${encodeURIComponent(q)}`);
        setResults(d.users);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  const suggestions = useMemo(() => {
    const ids = new Set(selected.map((u) => u.id));
    const source = query.trim() ? results : contacts;
    return source.filter((u) => u.id !== me.id && !ids.has(u.id)).slice(0, 30);
  }, [contacts, me.id, query, results, selected]);

  const toggle = (u: PublicUser) =>
    setSelected((cur) =>
      cur.some((x) => x.id === u.id) ? cur.filter((x) => x.id !== u.id) : [...cur, u],
    );

  const pickAvatar = async (file: File | null) => {
    if (!file) return;
    setUploading(true);
    try {
      setAvatarUrl(await uploadFile(file));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить картинку");
    } finally {
      setUploading(false);
    }
  };

  const create = async () => {
    if (saving) return;
    setError("");
    if (name.trim().length < 2) {
      setError("Название должно быть не короче 2 символов");
      return;
    }
    setSaving(true);
    try {
      const d = await api<{ conversation: { id: string } }>("/api/conversations", {
        method: "POST",
        body: JSON.stringify({
          kind,
          name: name.trim(),
          about: about.trim(),
          isPrivate,
          avatarUrl,
          memberIds: selected.map((u) => u.id),
        }),
      });
      notify(kind === "channel" ? "Канал создан" : "Группа создана");
      onCreated(d.conversation.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось создать");
      setSaving(false);
    }
  };

  return (
    <ModalShell onClose={onClose}>
      <div className="flex items-center gap-3 border-b border-white/8 px-6 py-4">
        <div className="btn-gradient flex h-10 w-10 items-center justify-center rounded-2xl">
          {kind === "channel" ? <Megaphone className="h-4.5 w-4.5 text-white" /> : <Users className="h-4.5 w-4.5 text-white" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-display text-[15px] font-bold">
            {kind === "channel" ? "Новый канал" : "Новая группа"}
          </p>
          <p className="truncate text-xs text-white/40">
            {kind === "channel"
              ? "Пишут админы — остальные читают и слушают звонки"
              : "Общий чат и групповые звонки для всех участников"}
          </p>
        </div>
        <button onClick={onClose} className="rounded-full bg-white/10 p-2 text-white/70">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="nice-scroll max-h-[68vh] space-y-4 overflow-y-auto px-6 py-5">
        {/* Тип */}
        <div className="grid grid-cols-2 gap-2.5">
          <KindCard
            active={kind === "group"}
            onClick={() => setKind("group")}
            icon={<Users className="h-4.5 w-4.5" />}
            title="Группа"
            hint="Общаются все"
          />
          <KindCard
            active={kind === "channel"}
            onClick={() => setKind("channel")}
            icon={<Megaphone className="h-4.5 w-4.5" />}
            title="Канал"
            hint="Пишут админы"
          />
        </div>

        {/* Аватар + название */}
        <div className="flex items-center gap-4">
          <label className="group relative cursor-pointer">
            <Avatar name={name || (kind === "channel" ? "Канал" : "Группа")} src={avatarUrl} size={64} />
            <span className="absolute inset-0 grid place-items-center rounded-full bg-black/55 opacity-0 transition-opacity group-hover:opacity-100">
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin text-white" />
              ) : (
                <Camera className="h-4 w-4 text-white" />
              )}
            </span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={(e) => {
                void pickAvatar(e.target.files?.[0] ?? null);
                e.target.value = "";
              }}
            />
          </label>
          <div className="min-w-0 flex-1 space-y-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              placeholder={kind === "channel" ? "Название канала" : "Название группы"}
              className="ring-focus w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-[15px] placeholder:text-white/25"
            />
            <input
              value={about}
              onChange={(e) => setAbout(e.target.value)}
              maxLength={140}
              placeholder="О чём это (необязательно)"
              className="ring-focus w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm placeholder:text-white/25"
            />
          </div>
        </div>

        {/* Приватность */}
        <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3.5">
          <button onClick={() => setIsPrivate((v) => !v)} className="flex w-full items-center gap-3 text-left">
            <span className="glass flex h-9 w-9 shrink-0 items-center justify-center rounded-xl">
              {isPrivate ? <Lock className="h-4 w-4 text-violet-300" /> : <Hash className="h-4 w-4 text-cyan-300" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{isPrivate ? "Приватный" : "Публичный"}</span>
              <span className="block text-xs leading-snug text-white/35">
                {isPrivate
                  ? "Не видно в поиске — заходят только по приглашению или ссылке"
                  : "Виден в «Обзоре» — любой может найти и присоединиться"}
              </span>
            </span>
            <span
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                isPrivate ? "bg-violet-500" : "bg-white/15"
              }`}
            >
              <motion.span
                layout
                transition={{ type: "spring", bounce: 0.3, duration: 0.3 }}
                className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow"
                style={{ left: isPrivate ? "1.375rem" : "0.125rem" }}
              />
            </span>
          </button>
        </div>

        {/* Участники */}
        <div>
          <p className="mb-2 text-xs font-medium tracking-wide text-white/45 uppercase">
            Участники {selected.length > 0 && `· ${selected.length}`}
          </p>
          <label className="ring-focus mb-2 flex items-center gap-2.5 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5">
            <Search className="h-4 w-4 shrink-0 text-white/35" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Найти по @имени"
              className="w-full bg-transparent text-sm placeholder:text-white/25"
            />
            {searching && <Loader2 className="h-3.5 w-3.5 animate-spin text-white/40" />}
          </label>

          {selected.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {selected.map((u) => (
                <button
                  key={u.id}
                  onClick={() => toggle(u)}
                  className="glass flex items-center gap-1.5 rounded-full py-1 pr-2.5 pl-1 text-xs"
                >
                  <Avatar name={u.displayName} src={u.avatarUrl} size={20} />
                  {u.displayName}
                  <X className="h-3 w-3 text-white/40" />
                </button>
              ))}
            </div>
          )}

          <div className="nice-scroll max-h-44 space-y-0.5 overflow-y-auto">
            {suggestions.length === 0 ? (
              <p className="flex items-center justify-center gap-2 py-5 text-sm text-white/30">
                <SearchX className="h-4 w-4" />
                {query.trim() ? "Никого не нашли" : "Добавить участников можно и позже"}
              </p>
            ) : (
              suggestions.map((u) => (
                <button
                  key={u.id}
                  onClick={() => toggle(u)}
                  className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-white/8"
                >
                  <Avatar name={u.displayName} src={u.avatarUrl} size={34} online={u.online} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{u.displayName}</p>
                    <p className="truncate text-xs text-white/35">@{u.username}</p>
                  </div>
                  <span className="flex h-5 w-5 items-center justify-center rounded-full border border-white/20" />
                </button>
              ))
            )}
          </div>
        </div>

        {error && (
          <p className="rounded-xl border border-rose-500/25 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-300">
            {error}
          </p>
        )}

        <button
          onClick={() => void create()}
          disabled={saving || name.trim().length < 2}
          className="btn-gradient flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-[15px] font-semibold text-white disabled:cursor-not-allowed"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {kind === "channel" ? "Создать канал" : "Создать группу"}
        </button>
      </div>
    </ModalShell>
  );
}

function KindCard({
  active,
  onClick,
  icon,
  title,
  hint,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  hint: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-2xl border p-3.5 text-left transition-colors ${
        active ? "border-violet-400/60 bg-violet-500/15" : "border-white/8 bg-white/[0.03] hover:bg-white/[0.06]"
      }`}
    >
      <span className={`mb-2 flex h-8 w-8 items-center justify-center rounded-xl ${active ? "btn-gradient text-white" : "glass text-white/60"}`}>
        {icon}
      </span>
      <span className="block text-sm font-semibold">{title}</span>
      <span className="block text-[11px] text-white/40">{hint}</span>
    </button>
  );
}
