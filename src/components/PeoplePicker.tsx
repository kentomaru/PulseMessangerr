"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Check, Loader2, SearchX, UserPlus, X } from "lucide-react";
import Avatar from "./Avatar";
import { api } from "@/lib/api";
import type { PublicUser } from "@/lib/types";

type Props = {
  title: string;
  hint?: string;
  /** Кого не показывать в списке (например, уже участников). */
  excludeIds?: string[];
  /** Уже выбранные (нельзя снять). */
  lockedIds?: string[];
  confirmLabel?: string;
  onClose: () => void;
  onConfirm: (users: PublicUser[]) => void | Promise<void>;
};

/**
 * Универсальный поиск людей: «добавить в группу», «добавить в звонок»,
 * «назначить админом». Ищет по @username и имени.
 */
export default function PeoplePicker({
  title,
  hint,
  excludeIds = [],
  lockedIds = [],
  confirmLabel = "Добавить",
  onClose,
  onConfirm,
}: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PublicUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<PublicUser[]>([]);
  const [busy, setBusy] = useState(false);

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
        const d = await api<{ users: PublicUser[] }>(
          `/api/users/search?q=${encodeURIComponent(q)}`,
        );
        setResults(d.users);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  const visible = useMemo(() => {
    const skip = new Set(excludeIds);
    return results.filter((u) => !skip.has(u.id));
  }, [results, excludeIds]);

  const toggle = (u: PublicUser) => {
    if (lockedIds.includes(u.id)) return;
    setSelected((cur) =>
      cur.some((x) => x.id === u.id) ? cur.filter((x) => x.id !== u.id) : [...cur, u],
    );
  };

  const confirm = async () => {
    if (selected.length === 0 || busy) return;
    setBusy(true);
    try {
      await onConfirm(selected);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-[85] grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        onClick={(e) => e.stopPropagation()}
        className="glass-strong flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-[1.6rem] shadow-2xl"
      >
        <div className="flex items-center gap-3 border-b border-white/8 px-5 py-4">
          <div className="glass flex h-9 w-9 items-center justify-center rounded-xl">
            <UserPlus className="h-4 w-4 text-violet-300" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-display truncate text-[15px] font-bold">{title}</p>
            {hint && <p className="truncate text-xs text-white/40">{hint}</p>}
          </div>
          <button onClick={onClose} className="rounded-full bg-white/10 p-2 text-white/70">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-3">
          <label className="ring-focus flex items-center gap-2.5 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск по @имени или имени"
              className="w-full bg-transparent text-sm placeholder:text-white/30"
            />
            {searching && <Loader2 className="h-3.5 w-3.5 animate-spin text-white/40" />}
          </label>
        </div>

        <div className="nice-scroll min-h-24 flex-1 overflow-y-auto px-3 pb-3">
          {selected.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5 px-2">
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

          {query.trim().length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-white/35">
              Начните вводить имя или @username
            </p>
          ) : visible.length === 0 && !searching ? (
            <p className="flex items-center justify-center gap-2 px-4 py-6 text-sm text-white/35">
              <SearchX className="h-4 w-4" /> Никого не нашли
            </p>
          ) : (
            visible.map((u) => {
              const on = selected.some((x) => x.id === u.id);
              return (
                <button
                  key={u.id}
                  onClick={() => toggle(u)}
                  className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors hover:bg-white/8"
                >
                  <Avatar name={u.displayName} src={u.avatarUrl} size={38} online={u.online} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{u.displayName}</p>
                    <p className="truncate text-xs text-white/35">@{u.username}</p>
                  </div>
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full border ${
                      on ? "btn-gradient border-transparent text-white" : "border-white/20"
                    }`}
                  >
                    {on && <Check className="h-3.5 w-3.5" />}
                  </span>
                </button>
              );
            })
          )}
        </div>

        <div className="border-t border-white/8 px-5 py-4">
          <button
            onClick={() => void confirm()}
            disabled={selected.length === 0 || busy}
            className="btn-gradient flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-[15px] font-semibold text-white disabled:cursor-not-allowed"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {confirmLabel}
            {selected.length > 0 && ` · ${selected.length}`}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
