"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { LogOut, MessageSquarePlus, Phone, PhoneMissed, Search, Settings2, X } from "lucide-react";
import Avatar from "./Avatar";
import { api } from "@/lib/api";
import type { ConversationListItem, PublicUser } from "@/lib/types";
import { lastSeenLabel, timeHHmm } from "@/lib/format";

type Props = {
  me: PublicUser;
  conversations: ConversationListItem[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onOpenProfile: () => void;
  onOpenChat: (user: PublicUser) => void;
  onLogout: () => void;
};

export default function Sidebar({
  me,
  conversations,
  activeId,
  onSelect,
  onOpenProfile,
  onOpenChat,
  onLogout,
}: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PublicUser[] | null>(null);
  const [searching, setSearching] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    const q = query.trim();
    if (!q) {
      setResults(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounce.current = setTimeout(async () => {
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
    }, 350);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [query]);

  const filtered = conversations.filter((c) =>
    c.peer.displayName.toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <aside className="flex h-full w-full flex-col border-r border-white/[0.07] bg-white/[0.015]">
      {/* header */}
      <div className="flex items-center gap-3 px-5 pt-5 pb-4">
        <button
          onClick={onOpenProfile}
          className="group relative shrink-0 transition-transform hover:scale-105 active:scale-95"
          title="Мой профиль"
        >
          <Avatar name={me.displayName} src={me.avatarUrl} size={44} online />
          <span className="absolute inset-0 grid place-items-center rounded-full bg-black/45 opacity-0 transition-opacity group-hover:opacity-100">
            <Settings2 className="h-4 w-4 text-white" />
          </span>
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-[15px] font-semibold">{me.displayName}</p>
          <p className="truncate text-xs text-white/35">@{me.username}</p>
        </div>
        <button
          onClick={onLogout}
          title="Выйти"
          className="rounded-xl p-2.5 text-white/40 transition-colors hover:bg-white/5 hover:text-white/80"
        >
          <LogOut className="h-[18px] w-[18px]" />
        </button>
      </div>

      {/* search */}
      <div className="px-5 pb-4">
        <div className="ring-focus flex items-center gap-2.5 rounded-2xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 transition-all">
          <Search className="h-4 w-4 shrink-0 text-white/30" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск людей и чатов"
            className="w-full bg-transparent text-sm placeholder:text-white/30"
          />
          {query && (
            <button onClick={() => setQuery("")} className="text-white/30 hover:text-white/70">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* list */}
      <div className="nice-scroll flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
        {query.trim() && results !== null ? (
          <>
            <SectionLabel>Люди</SectionLabel>
            {results.length === 0 && !searching && (
              <p className="px-3 py-6 text-center text-sm text-white/30">Никого не нашли</p>
            )}
            {results.map((u) => (
              <Row
                key={u.id}
                onClick={() => {
                  onOpenChat(u);
                  setQuery("");
                }}
              >
                <Avatar name={u.displayName} src={u.avatarUrl} size={46} online={u.online} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-[15px] font-medium">{u.displayName}</p>
                  </div>
                  <p className="truncate text-[13px] text-white/35">
                    @{u.username} · {u.online ? "в сети" : "не в сети"}
                  </p>
                </div>
                <MessageSquarePlus className="h-4 w-4 shrink-0 text-violet-300/70" />
              </Row>
            ))}
            {filtered.length > 0 && <SectionLabel>Чаты</SectionLabel>}
          </>
        ) : null}

        {filtered.map((c, i) => (
          <motion.div
            key={c.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i * 0.03, 0.3), duration: 0.25 }}
          >
            <Row active={c.id === activeId} onClick={() => onSelect(c.id)}>
              <Avatar
                name={c.peer.displayName}
                src={c.peer.avatarUrl}
                size={46}
                online={c.peer.online}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate text-[15px] font-medium">{c.peer.displayName}</p>
                  {c.lastMessage && (
                    <span className="shrink-0 text-[11px] text-white/30">
                      {timeHHmm(c.lastMessage.createdAt)}
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-[13px] text-white/40">
                    <LastMessagePreview item={c} />
                  </p>
                  {c.unreadCount > 0 && (
                    <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-600 px-1.5 text-[11px] font-bold text-white">
                      {c.unreadCount > 99 ? "99+" : c.unreadCount}
                    </span>
                  )}
                </div>
              </div>
            </Row>
          </motion.div>
        ))}

        {!query.trim() && filtered.length === 0 && (
          <div className="flex flex-col items-center gap-3 px-6 pt-16 text-center">
            <div className="glass grid h-14 w-14 place-items-center rounded-2xl">
              <Search className="h-6 w-6 text-white/40" />
            </div>
            <p className="text-sm leading-relaxed text-white/35">
              Чатов пока нет.
              <br />
              Найдите кого-нибудь по имени пользователя
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}

function LastMessagePreview({ item }: { item: ConversationListItem }) {
  const m = item.lastMessage;
  if (!m) return <span className="italic">Чат создан — напишите первым!</span>;
  if (m.type === "image") return <span>Фотография</span>;
  if (m.type === "call") {
    let status = "";
    try {
      status = JSON.parse(m.content).status;
    } catch {
      /* noop */
    }
    return (
      <span className="inline-flex items-center gap-1.5">
        {status === "missed" ? (
          <PhoneMissed className="h-3.5 w-3.5 text-rose-400" />
        ) : (
          <Phone className="h-3.5 w-3.5 text-emerald-400" />
        )}
        {status === "missed"
          ? "Пропущенный звонок"
          : status === "declined"
            ? "Отклонённый звонок"
            : "Звонок"}
      </span>
    );
  }
  return (
    <>
      {item.peer && null}
      {m.content}
    </>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-3 pt-4 pb-1.5 text-[11px] font-semibold tracking-[0.14em] text-white/30 uppercase">
      {children}
    </p>
  );
}

function Row({
  children,
  onClick,
  active,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3.5 rounded-2xl px-3 py-3 text-left transition-all ${
        active
          ? "bg-gradient-to-r from-violet-600/20 to-fuchsia-600/10 ring-1 ring-violet-500/25"
          : "hover:bg-white/[0.05]"
      }`}
    >
      {children}
    </button>
  );
}
