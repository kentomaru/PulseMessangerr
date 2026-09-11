"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Loader2,
  LogOut,
  PhoneCall,
  Search,
  Sparkles,
  Image as ImageIcon,
  SearchX,
  Shield,
} from "lucide-react";
import Avatar from "./Avatar";
import StoriesRow from "./StoriesRow";
import { api } from "@/lib/api";
import { timeHHmm, parseCallContent, callLogLabel } from "@/lib/format";
import type { ConversationListItem, PublicUser, StoryGroup } from "@/lib/types";
import { parseImageMessage } from "@/lib/message-content";

type Props = {
  me: PublicUser;
  conversations: ConversationListItem[];
  activeId: string | null;
  storyGroups: StoryGroup[];
  onSelect: (id: string) => void;
  onOpenProfile: () => void;
  onOpenChat: (user: PublicUser) => void;
  onLogout: () => void;
  onOpenStories: (groupIndex: number) => void;
  onAddStory: () => void;
};

function previewText(conv: ConversationListItem, meId: string) {
  const lm = conv.lastMessage;
  if (!lm) return "Нет сообщений";
  if (lm.type === "image") {
    const image = parseImageMessage(lm.content);
    return image.caption ? `🖼 ${image.caption.replace(/\n/g, " ").slice(0, 56)}` : "🖼 Фото";
  }
  if (lm.type === "call") {
    const info = parseCallContent(lm.content);
    if (info) return `📞 ${callLogLabel(info)}`;
    return "📞 Звонок";
  }
  const prefix = lm.senderId === meId ? "Вы: " : "";
  return prefix + lm.content.replace(/\n/g, " ").slice(0, 60);
}

export default function Sidebar({
  me,
  conversations,
  activeId,
  storyGroups,
  onSelect,
  onOpenProfile,
  onOpenChat,
  onLogout,
  onOpenStories,
  onAddStory,
}: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PublicUser[]>([]);
  const [searching, setSearching] = useState(false);
  const searchBoxRef = useRef<HTMLDivElement | null>(null);

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
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  // Клик вне поиска — закрыть результаты
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) {
        setResults([]);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <aside className="flex h-full w-full flex-col border-r border-white/8 bg-[#0c0c17]/80 backdrop-blur-xl">
      {/* Шапка */}
      <div className="flex items-center gap-3 px-5 pt-5 pb-3">
        <button
          type="button"
          onClick={onOpenProfile}
          title="Профиль и приватность"
          className="transition-transform hover:scale-105 active:scale-95"
        >
          <Avatar name={me.displayName} src={me.avatarUrl} size={44} online={me.showOnline} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-display text-lg font-bold tracking-[0.18em]">PULSE</span>
            <Sparkles className="h-3.5 w-3.5 text-violet-300/80" />
          </div>
          <p className="truncate text-xs text-white/35">@{me.username}</p>
        </div>
        <button
          type="button"
          onClick={onOpenProfile}
          title="Приватность и настройки профиля"
          className="glass flex h-9 w-9 items-center justify-center rounded-xl text-white/50 transition-colors hover:text-violet-200"
        >
          <Shield className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onLogout}
          title="Выйти"
          className="glass flex h-9 w-9 items-center justify-center rounded-xl text-white/50 transition-colors hover:text-rose-300"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>

      {/* Поиск */}
      <div ref={searchBoxRef} className="relative px-5 pb-3">
        <label className="ring-focus flex items-center gap-2.5 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5 transition-all">
          <Search className="h-4 w-4 shrink-0 text-white/35" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск людей по @имени"
            className="w-full bg-transparent text-sm placeholder:text-white/30"
          />
          {searching && <Loader2 className="h-3.5 w-3.5 animate-spin text-white/40" />}
        </label>

        <AnimatePresence>
          {query.trim().length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="glass-strong absolute inset-x-5 top-full z-30 max-h-72 overflow-y-auto rounded-2xl p-1.5 shadow-2xl nice-scroll"
            >
              {results.length === 0 && !searching && (
                <p className="flex items-center gap-2 px-3 py-3 text-sm text-white/40">
                  <SearchX className="h-4 w-4" />
                  Никого не нашли
                </p>
              )}
              {results.map((u) => (
                <button
                  key={u.id}
                  onClick={() => {
                    onOpenChat(u);
                    setQuery("");
                    setResults([]);
                  }}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-white/8"
                >
                  <Avatar name={u.displayName} src={u.avatarUrl} size={36} online={u.online} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{u.displayName}</p>
                    <p className="truncate text-xs text-white/35">@{u.username}</p>
                  </div>
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Истории */}
      <StoriesRow me={me} groups={storyGroups} onOpen={onOpenStories} onAdd={onAddStory} />

      {/* Список чатов */}
      <div className="nice-scroll min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        <p className="px-2 pt-2 pb-2 text-[11px] font-semibold tracking-widest text-white/25 uppercase">
          Чаты
        </p>

        {conversations.length === 0 && (
          <div className="mt-10 px-6 text-center">
            <div className="glass mx-auto flex h-14 w-14 items-center justify-center rounded-2xl">
              <Search className="h-6 w-6 text-white/30" />
            </div>
            <p className="mt-4 text-sm leading-relaxed text-white/40">
              Пока никого. Найдите пользователя по @имени в поиске выше и начните первый чат
            </p>
          </div>
        )}

        <div className="space-y-1">
          {conversations.map((conv) => {
            const active = conv.id === activeId;
            const lm = conv.lastMessage;
            return (
              <button
                key={conv.id}
                onClick={() => onSelect(conv.id)}
                className={`relative flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors ${
                  active ? "bg-white/10" : "hover:bg-white/5"
                }`}
              >
                <Avatar
                  name={conv.peer.displayName}
                  src={conv.peer.avatarUrl}
                  size={48}
                  online={conv.peer.online}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-[15px] font-semibold">{conv.peer.displayName}</p>
                    {lm && (
                      <span className="shrink-0 text-[11px] text-white/30">
                        {timeHHmm(lm.createdAt)}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center justify-between gap-2">
                    <p className="truncate text-[13px] text-white/40">
                      {lm?.type === "call" && <PhoneCall className="mr-1 inline h-3.5 w-3.5 text-white/30" />}
                      {lm?.type === "image" && <ImageIcon className="mr-1 inline h-3.5 w-3.5 text-white/30" />}
                      {previewText(conv, me.id)}
                    </p>
                    {conv.unreadCount > 0 && (
                      <span className="btn-gradient flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-bold text-white">
                        {conv.unreadCount > 99 ? "99+" : conv.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
