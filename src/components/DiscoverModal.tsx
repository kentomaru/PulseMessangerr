"use client";

/** «Обзор»: публичные группы и каналы + вход по ссылке-приглашению. */
import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Compass, Hash, Link2, Loader2, LogIn, Megaphone, SearchX, Users, X } from "lucide-react";
import Avatar from "./Avatar";
import { ModalShell } from "./ProfileModal";
import { api } from "@/lib/api";
import type { DiscoverItem } from "@/lib/types";

type Props = {
  onClose: () => void;
  onJoined: (conversationId: string) => void;
  notify: (msg: string) => void;
};

export default function DiscoverModal({ onClose, onJoined, notify }: Props) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<DiscoverItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (q: string) => {
    try {
      const d = await api<{ items: DiscoverItem[] }>(`/api/discover?q=${encodeURIComponent(q)}`);
      setItems(d.items);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => void load(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query, load]);

  const join = async (item: DiscoverItem) => {
    setBusyId(item.id);
    try {
      await api("/api/conversations/join", {
        method: "POST",
        body: JSON.stringify({ conversationId: item.id }),
      });
      notify(`Вы в «${item.name}»`);
      onJoined(item.id);
      onClose();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Не удалось присоединиться");
    } finally {
      setBusyId(null);
    }
  };

  const joinByToken = async () => {
    const t = token.trim().replace(/^.*#group=/, "");
    if (!t) return;
    setBusyId("token");
    try {
      const d = await api<{ conversation: { id: string; title: string } }>("/api/conversations/join", {
        method: "POST",
        body: JSON.stringify({ token: t }),
      });
      notify(`Вы в «${d.conversation.title}»`);
      onJoined(d.conversation.id);
      onClose();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Ссылка не сработала");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <ModalShell onClose={onClose} wide>
      <div className="flex items-center gap-3 border-b border-white/8 px-6 py-4">
        <div className="btn-gradient flex h-10 w-10 items-center justify-center rounded-2xl">
          <Compass className="h-4.5 w-4.5 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-display text-[15px] font-bold">Обзор</p>
          <p className="truncate text-xs text-white/40">Публичные группы и каналы Pulse</p>
        </div>
        <button onClick={onClose} className="rounded-full bg-white/10 p-2 text-white/70">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="nice-scroll max-h-[64vh] space-y-4 overflow-y-auto px-6 py-5">
        {/* Вход по ссылке */}
        <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3.5">
          <p className="mb-2 flex items-center gap-2 text-xs font-medium text-white/50">
            <Link2 className="h-3.5 w-3.5" /> Есть ссылка-приглашение?
          </p>
          <div className="flex gap-2">
            <input
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Вставьте ссылку или токен"
              className="ring-focus min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm placeholder:text-white/25"
            />
            <button
              onClick={() => void joinByToken()}
              disabled={!token.trim() || busyId === "token"}
              className="glass flex shrink-0 items-center gap-2 rounded-xl px-3.5 text-sm text-white/80 disabled:opacity-40"
            >
              {busyId === "token" ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
              Войти
            </button>
          </div>
        </div>

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск по названию…"
          className="ring-focus w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm placeholder:text-white/25"
        />

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-white/30" />
          </div>
        ) : items.length === 0 ? (
          <p className="flex items-center justify-center gap-2 py-10 text-sm text-white/35">
            <SearchX className="h-4 w-4" />
            Публичных диалогов пока нет
          </p>
        ) : (
          <div className="space-y-2">
            {items.map((it) => (
              <motion.div
                key={it.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.03] p-3"
              >
                <Avatar name={it.name} src={it.avatarUrl} size={46} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate text-sm font-semibold">
                    {it.kind === "channel" ? (
                      <Megaphone className="h-3.5 w-3.5 text-slate-400" />
                    ) : (
                      <Hash className="h-3.5 w-3.5 text-slate-400" />
                    )}
                    {it.name}
                  </p>
                  {it.about && <p className="truncate text-xs text-white/40">{it.about}</p>}
                  <p className="mt-0.5 flex items-center gap-1 text-[11px] text-white/30">
                    <Users className="h-3 w-3" /> {it.memberCount} участников
                  </p>
                </div>
                {it.joined ? (
                  <button
                    onClick={() => {
                      onJoined(it.id);
                      onClose();
                    }}
                    className="glass shrink-0 rounded-xl px-3.5 py-2 text-[13px] text-white/70"
                  >
                    Открыть
                  </button>
                ) : (
                  <button
                    onClick={() => void join(it)}
                    disabled={busyId === it.id}
                    className="btn-gradient flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2 text-[13px] font-semibold text-white disabled:opacity-60"
                  >
                    {busyId === it.id && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    Вступить
                  </button>
                )}
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </ModalShell>
  );
}
