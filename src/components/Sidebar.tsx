"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bell,
  BellOff,
  BellRing,
  Bookmark,
  Check,
  CheckCheck,
  Compass,
  Hash,
  Loader2,
  Lock,
  LogOut,
  Megaphone,
  Mic,
  Play,
  MonitorSmartphone,
  Phone,
  Pin,
  Plus,
  Radio,
  Search,
  SearchX,
  Sparkles,
  MessageCircle,
  UserPlus,
  Users,
  Video,
  Volume2,
  VolumeX,
} from "lucide-react";
import Avatar from "./Avatar";
import PreviewLabel from "./PreviewLabel";
import StatusEmoji from "./StatusEmoji";
import StoriesRow from "./StoriesRow";
import { api } from "@/lib/api";
import { timeHHmm } from "@/lib/format";
import type { ConversationListItem, DiscoverItem, PublicUser, StoryGroup } from "@/lib/types";

type Props = {
  me: PublicUser;
  conversations: ConversationListItem[];
  activeId: string | null;
  storyGroups: StoryGroup[];
  /** Звук уведомлений о новых сообщениях. */
  soundOn: boolean;
  /** Закреплённые чаты (показываются сверху, с булавкой). */
  pinnedIds: Set<string>;
  /** Заглушённые чаты (без звука и уведомлений). */
  mutedIds: Set<string>;
  onTogglePin: (id: string) => void;
  onToggleMute: (id: string) => void;
  /** Заглушить чат на срок (мс; 0 = навсегда). */
  onMuteFor?: (id: string, ms: number) => void;
  /** Масштаб интерфейса: мелкий / обычный / крупный. */
  uiScale: "s" | "m" | "l";
  onSetUiScale: (v: "s" | "m" | "l") => void;
  /** Тема оформления: серый / синий / светлая. */
  theme: "gray" | "tg" | "light";
  onSetTheme: (t: "gray" | "tg" | "light") => void;
  /** Кастомизация оформления (хранится локально у пользователя). */
  custom: CustomSettings;
  onSetCustom: (c: CustomSettings) => void;
  /** Звук входящего звонка (рингтон). */
  callSoundOn: boolean;
  /** Браузерные уведомления (всплывающие, когда вкладка не активна). */
  notifyOn: boolean;
  onSelect: (id: string) => void;
  onOpenProfile: () => void;
  onOpenChat: (user: PublicUser) => void;
  onLogout: () => void;
  onOpenStories: (groupIndex: number) => void;
  onAddStory: () => void;
  onCreateGroup: (kind: "group" | "channel") => void;
  onDiscover: () => void;
  /** Открыть чат и перейти к сообщению (глобальный поиск). */
  onOpenMessage?: (conversationId: string, messageId: string) => void;
  /** Открыть «Избранное» (чат с самим собой). */
  onOpenSaved: () => void;
  /** Включить/выключить звук уведомлений. */
  onToggleSound: () => void;
  /** Включить/выключить звук входящего звонка. */
  onToggleCallSound: () => void;
  /** Включить/выключить браузерные уведомления. */
  onToggleNotify: () => void;
  /** Вход по ссылке-приглашению в группу/канал (#group=<token>). */
  onJoinByToken: (token: string) => void;
};

/** Превью последнего сообщения: префикс + иконка типа (SVG) + текст. */
/** URL вложения из content сообщения (сам контент или JSON вложения). */
function previewUrl(type: string, content: string): string | null {
  if (type === "image" || type === "video_note" || type === "voice" || type === "file") {
    if (content.startsWith("/api/files/")) return content;
    try {
      const att = JSON.parse(content) as { url?: string };
      if (typeof att.url === "string" && att.url) return att.url;
    } catch {
      /* не JSON */
    }
  }
  return null;
}

function PreviewNode({ conv, meId }: { conv: ConversationListItem; meId: string }) {
  // Индикатор «печатает…» — свежий typingAt (не старше 10 секунд)
  const typingPeer = [conv.peer, ...(conv.members ?? []).map((m) => ({
    ...m.user,
    typingAt: m.typingAt,
  }))].find((u) => u && u.id !== meId && u.typingAt && Date.now() - new Date(u.typingAt).getTime() < 10_000);
  if (typingPeer) return <span className="italic text-emerald-300/90">печатает…</span>;
  const lm = conv.lastMessage;
  if (!lm) return <>Нет сообщений</>;
  const prefix = lm.senderId === meId ? "Вы: " : conv.kind === "direct" ? "" : `${lm.senderName ?? ""}: `;
  const url = previewUrl(lm.type, lm.content);
  // подпись: у фото/видео — подпись из вложения или тип
  let caption = "";
  let mime = "";
  if (lm.type === "image" || lm.type === "video_note" || lm.type === "voice" || lm.type === "file") {
    try {
      const att = JSON.parse(lm.content) as { caption?: string; name?: string; mimeType?: string };
      caption = att.caption ?? att.name ?? "";
      mime = att.mimeType ?? "";
    } catch {
      caption = "";
    }
  }
  const isVideoFile = lm.type === "file" && mime.startsWith("video/");
  const label =
    lm.type === "image" ? caption || "Фото"
    : lm.type === "video_note" ? caption || "Видеосообщение"
    : lm.type === "voice" ? caption || "Голосовое"
    : null;
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      {url && lm.type === "image" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-10 w-10 shrink-0 rounded-md object-cover" loading="lazy" />
      )}
      {url && (lm.type === "video_note" || isVideoFile) && (
        /* Квадратик как в ТГ: первый кадр видео подгружается и виден сразу */
        <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md bg-white/10">
          <video
            src={url}
            muted
            playsInline
            preload="metadata"
            onLoadedMetadata={(e) => {
              // заставляем браузер отрисовать первый кадр в превью
              try {
                e.currentTarget.currentTime = 0.01;
              } catch {
                /* не критично */
              }
            }}
            className="h-full w-full object-cover"
          />
          <span className="absolute right-0.5 bottom-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-black/60">
            <Play className="h-2 w-2 text-white" />
          </span>
        </span>
      )}
      {lm.type === "voice" && (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-white/10">
          <Mic className="h-4 w-4 text-white/60" />
        </span>
      )}
      {prefix && <span className="shrink-0">{prefix}</span>}
      {label !== null ? (
        <span className="truncate">{label}</span>
      ) : (
        <PreviewLabel type={lm.type} content={lm.content} iconClassName="h-3.5 w-3.5" />
      )}
    </span>
  );
}

/** Из вставленной ссылки/токена достаём token. */
function extractToken(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  const m = v.match(/#group=([A-Za-z0-9_-]+)/);
  if (m) return m[1];
  // Голый токен/юзернейм: допускаем @префикс и длину 5–32 (как в Telegram)
  const bare = v.replace(/^@/, "");
  if (/^[A-Za-z0-9_-]{5,32}$/.test(bare)) return bare;
  return null;
}

export default function Sidebar({
  me,
  conversations,
  activeId,
  storyGroups,
  soundOn,
  pinnedIds,
  mutedIds,
  onTogglePin,
  onToggleMute,
  onMuteFor,
  uiScale,
  onSetUiScale,
  theme,
  onSetTheme,
  custom,
  onSetCustom,
  callSoundOn,
  notifyOn,
  onSelect,
  onOpenProfile,
  onOpenChat,
  onLogout,
  onOpenStories,
  onAddStory,
  onCreateGroup,
  onDiscover,
  onOpenMessage,
  onOpenSaved,
  onToggleSound,
  onToggleCallSound,
  onToggleNotify,
  onJoinByToken,
}: Props) {
  const markAllRead = async () => {
    const targets = conversations.filter((c) => c.unreadCount > 0);
    await Promise.all(
      targets.map((c) =>
        api(`/api/conversations/${c.id}/read`, { method: "POST", body: "{}" }).catch(() => {}),
      ),
    );
  };
  // Черновики: красный ярлык в списке чатов, обновляется на лету
  const [draftTick, setDraftTick] = useState(0);
  useEffect(() => {
    const on = () => setDraftTick((v) => v + 1);
    window.addEventListener("pulse-drafts", on);
    window.addEventListener("storage", on);
    return () => {
      window.removeEventListener("pulse-drafts", on);
      window.removeEventListener("storage", on);
    };
  }, []);
  const drafts = useMemo(() => {
    void draftTick;
    try {
      return JSON.parse(localStorage.getItem("pulse_text_drafts_v1") ?? "{}") as Record<
        string,
        string
      >;
    } catch {
      return {} as Record<string, string>;
    }
  }, [draftTick, conversations]);
  /** Папки чатов: фильтр списка по типу (как вкладки в мессенджерах). */
  const [folder, setFolder] = useState<"all" | "direct" | "group" | "channel" | "unread">(() => {
    try {
      const f = localStorage.getItem("pulse_folder_v1");
      if (f === "direct" || f === "group" || f === "channel" || f === "unread") return f;
    } catch { /* ignore */ }
    return "all";
  });
  const pickFolder = (f: typeof folder) => {
    setFolder(f);
    try {
      localStorage.setItem("pulse_folder_v1", f);
    } catch { /* ignore */ }
  };
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [groups, setGroups] = useState<DiscoverItem[]>([]);
  /** Глобальный поиск по сообщениям во всех моих чатах. */
  const [msgHits, setMsgHits] = useState<
    { id: string; conversationId: string; conversationName: string | null; snippet: string }[]
  >([]);
  const [searching, setSearching] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const searchBoxRef = useRef<HTMLDivElement | null>(null);
  const createRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 1) {
      setUsers([]);
      setGroups([]);
      setMsgHits([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const [u, g, m] = await Promise.all([
          api<{ users: PublicUser[] }>(`/api/users/search?q=${encodeURIComponent(q)}`),
          api<{ items: DiscoverItem[] }>(`/api/discover?q=${encodeURIComponent(q)}`),
          q.length >= 2
            ? api<{
                results: {
                  id: string;
                  conversationId: string;
                  conversationName: string | null;
                  snippet: string;
                }[];
              }>(`/api/messages/search?q=${encodeURIComponent(q)}`).catch(() => ({ results: [] }))
            : Promise.resolve({ results: [] }),
        ]);
        setUsers(u.users);
        setGroups(g.items);
        setMsgHits(m.results.slice(0, 6));
      } catch {
        setUsers([]);
        setGroups([]);
        setMsgHits([]);
      } finally {
        setSearching(false);
      }
    }, 280);
    return () => clearTimeout(t);
  }, [query]);

  // Клик вне поиска / меню создания — закрыть
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (createRef.current && !createRef.current.contains(e.target as Node)) setCreateOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // Папки: фильтруем список по выбранной вкладке
  const inFolder = useCallback(
    (c: ConversationListItem) => {
      if (folder === "all") return true;
      if (folder === "unread") return c.unreadCount > 0;
      if (folder === "direct") return c.kind === "direct";
      return c.kind === folder; // group | channel
    },
    [folder],
  );
  const spaces = useMemo(
    () => conversations.filter((c) => c.kind !== "direct" && inFolder(c)),
    [conversations, inFolder],
  );
  const dms = useMemo(
    () => conversations.filter((c) => c.kind === "direct" && inFolder(c)),
    [conversations, inFolder],
  );
  // Закреплённые чаты выводим отдельной секцией сверху (и убираем из обычных)
  const pinned = useMemo(
    () => conversations.filter((c) => pinnedIds.has(c.id) && inFolder(c)),
    [conversations, pinnedIds, inFolder],
  );
  const unpinnedSpaces = useMemo(
    () => spaces.filter((c) => !pinnedIds.has(c.id)),
    [spaces, pinnedIds],
  );
  const unpinnedDms = useMemo(() => dms.filter((c) => !pinnedIds.has(c.id)), [dms, pinnedIds]);

  const linkToken = extractToken(query);

  return (
    <aside className="flex h-full w-full flex-col border-r border-white/5 bg-[#1b1e24]">
      {/* Шапка: аватар + имя (клик — профиль), фирменный логотип градиентом */}
      <div className="flex items-center gap-3 px-5 pt-5 pb-3">
        <button onClick={onOpenProfile} className="transition-transform hover:scale-105 active:scale-95">
          <Avatar name={me.displayName} src={me.avatarUrl} size={44} online={me.showOnline} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-gradient font-display text-lg font-bold tracking-[0.18em]">PULSE</span>
            <Sparkles className="h-3.5 w-3.5 text-slate-400/90" />
          </div>
          <button
            onClick={onOpenProfile}
            className="flex max-w-full items-center gap-1.5 text-left text-xs text-white/40 transition-colors hover:text-white/70"
            title="Открыть профиль"
          >
            <span className="truncate">@{me.username}</span>
            {me.statusEmoji && <StatusEmoji value={me.statusEmoji} size={16} />}
          </button>
        </div>

        <div ref={createRef} className="relative">
          <button
            onClick={() => setCreateOpen((v) => !v)}
            title="Создать группу или канал"
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-white/80 hover:bg-white/15"
          >
            <Plus className="h-4 w-4" />
          </button>
          <AnimatePresence>
            {createOpen && (
              <motion.div
                key="create-menu"
                initial={{ opacity: 0, y: -6, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.97 }}
                className="glass-strong absolute right-0 z-40 mt-2 w-56 overflow-hidden rounded-2xl p-1.5 shadow-2xl"
              >
                <CreateItem
                  icon={<Users className="h-4 w-4 text-slate-400" />}
                  title="Создать группу"
                  hint="Общий чат и звонки"
                  onClick={() => {
                    setCreateOpen(false);
                    onCreateGroup("group");
                  }}
                />
                <CreateItem
                  icon={<Megaphone className="h-4 w-4 text-slate-400" />}
                  title="Создать канал"
                  hint="Пишут админы"
                  onClick={() => {
                    setCreateOpen(false);
                    onCreateGroup("channel");
                  }}
                />
                <CreateItem
                  icon={<Compass className="h-4 w-4 text-emerald-300" />}
                  title="Обзор"
                  hint="Публичные группы и каналы"
                  onClick={() => {
                    setCreateOpen(false);
                    onDiscover();
                  }}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <button
          onClick={onOpenSaved}
          title="Избранное — сохранить сообщение можно через «Переслать»"
          className="glass flex h-9 w-9 items-center justify-center rounded-xl text-white/50 transition-colors hover:text-amber-300"
        >
          <Bookmark className="h-4 w-4" />
        </button>
        {/* Отметить всё прочитанным — быстрое действие */}
        <button
          onClick={() => void markAllRead()}
          title="Отметить всё прочитанным"
          className="glass flex h-9 w-9 items-center justify-center rounded-xl text-white/50 transition-colors hover:text-emerald-300"
        >
          <CheckCheck className="h-4 w-4" />
        </button>
        <button
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
            id="pulse-chat-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Люди, группы, каналы или ссылка"
            className="w-full bg-transparent text-sm placeholder:text-white/30"
          />
          {searching && <Loader2 className="h-3.5 w-3.5 animate-spin text-white/40" />}
        </label>

        <AnimatePresence>
          {query.trim().length > 0 && (
            <motion.div
              key="search-results"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="glass-strong nice-scroll absolute inset-x-5 top-full z-30 max-h-80 overflow-y-auto rounded-2xl p-1.5 shadow-2xl"
            >
              {linkToken && (
                <button
                  onClick={() => {
                    onJoinByToken(linkToken);
                    setQuery("");
                  }}
                  className="mb-1 flex w-full items-center gap-3 rounded-xl bg-white/8 px-3 py-2.5 text-left"
                >
                  <span className="glass flex h-8 w-8 items-center justify-center rounded-lg">
                    <Lock className="h-3.5 w-3.5 text-slate-400" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">Войти по ссылке</span>
                    <span className="block truncate text-[11px] text-white/40">
                      приватная группа, канал или звонок
                    </span>
                  </span>
                </button>
              )}

              {groups.length > 0 && (
                <p className="px-3 pt-2 pb-1 text-[10px] font-semibold tracking-widest text-white/25 uppercase">
                  Группы и каналы
                </p>
              )}
              {groups.map((g) => (
                <button
                  key={g.id}
                  onClick={() => {
                    if (g.joined) {
                      onSelect(g.id);
                    }
                    setQuery("");
                  }}
                  disabled={!g.joined}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-white/8 disabled:opacity-60"
                >
                  <Avatar name={g.name} src={g.avatarUrl} size={34} />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                      {g.kind === "channel" ? (
                        <Megaphone className="h-3 w-3 text-slate-400" />
                      ) : (
                        <Hash className="h-3 w-3 text-slate-400" />
                      )}
                      {g.name}
                    </p>
                    <p className="truncate text-xs text-white/35">{g.memberCount} участников</p>
                  </div>
                  {!g.joined && <span className="text-[11px] text-white/30">в обзоре</span>}
                </button>
              ))}

              {users.length > 0 && (
                <p className="px-3 pt-2 pb-1 text-[10px] font-semibold tracking-widest text-white/25 uppercase">
                  Люди
                </p>
              )}
              {users.map((u) => (
                <button
                  key={u.id}
                  onClick={() => {
                    onOpenChat(u);
                    setQuery("");
                  }}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-white/8"
                >
                  <Avatar name={u.displayName} src={u.avatarUrl} size={34} online={u.online} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{u.displayName}</p>
                    <p className="truncate text-xs text-white/35">@{u.username}</p>
                  </div>
                  <UserPlus className="h-3.5 w-3.5 text-white/25" />
                </button>
              ))}

              {msgHits.length > 0 && (
                <p className="px-3 pt-2 pb-1 text-[10px] font-semibold tracking-widest text-white/25 uppercase">
                  Сообщения
                </p>
              )}
              {msgHits.map((m) => (
                <button
                  key={m.id}
                  onClick={() => {
                    if (onOpenMessage) onOpenMessage(m.conversationId, m.id);
                    else onSelect(m.conversationId);
                    setQuery("");
                  }}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-white/8"
                >
                  <span className="glass flex h-8 w-8 shrink-0 items-center justify-center rounded-lg">
                    <MessageCircle className="h-3.5 w-3.5 text-slate-400" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {m.conversationName ?? "Личный чат"}
                    </span>
                    <span className="block truncate text-xs text-white/40">{m.snippet}</span>
                  </span>
                </button>
              ))}

              {users.length === 0 && groups.length === 0 && msgHits.length === 0 && !searching && !linkToken && (
                <p className="flex items-center gap-2 px-3 py-3 text-sm text-white/40">
                  <SearchX className="h-4 w-4" />
                  Ничего не нашли
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Папки чатов — быстрый фильтр по типу, во всю ширину без переполнения */}
      <div className="flex w-full gap-1.5 px-3 pb-2">
        {(
          [
            ["all", "Все"],
            ["direct", "Личные"],
            ["group", "Группы"],
            ["channel", "Каналы"],
            ["unread", "Не прочитано"],
          ] as const
        ).map(([f, label]) => {
          const n =
            f === "unread"
              ? conversations.filter((c) => c.unreadCount > 0).length
              : f === "all"
              ? conversations.reduce((s, c) => s + c.unreadCount, 0)
              // на папке — сколько чатов этого типа с непрочитанным
              : conversations.filter((c) => c.kind === f && c.unreadCount > 0).length;
          return (
            <button
              key={f}
              onClick={() => pickFolder(f)}
              className={`flex min-w-0 flex-1 items-center justify-center gap-1 whitespace-nowrap rounded-full px-2 py-1 text-[11px] font-medium transition-colors ${
                folder === f
                  ? "bg-[#5865f2]/25 text-white ring-1 ring-[#5865f2]/60"
                  : "bg-white/[0.05] text-white/45 hover:bg-white/10 hover:text-white/70"
              }`}
            >
              {label}
              {n > 0 && (
                <span className="rounded-full bg-[#5865f2] px-1.5 text-[9px] font-bold leading-4 text-white">
                  {n}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Истории */}
      <StoriesRow me={me} groups={storyGroups} onOpen={onOpenStories} onAdd={onAddStory} />

      {/* Список диалогов */}
      <div className="nice-scroll min-h-0 flex-1 overflow-y-auto px-2.5 pb-4">
        {/* Закреплённые чаты — всегда сверху, в одном списке */}
        {pinned.length > 0 && (
          <>
            <SectionLabel>Закреплённые</SectionLabel>
            <div className="space-y-1">
              {pinned.map((conv) => (
                <ConvRow
                  key={conv.id}
                  conv={conv}
                  active={conv.id === activeId}
                  meId={me.id}
                  onSelect={onSelect}
                  pinned
                  draft={drafts[conv.id] ?? ""}
                  compact={custom.compact}
                  muted={mutedIds.has(conv.id)}
                  onTogglePin={onTogglePin}
                  onToggleMute={onToggleMute}
                  onMuteFor={onMuteFor}
                />
              ))}
            </div>
          </>
        )}

        {unpinnedSpaces.length > 0 && (
          <SectionLabel>Группы и каналы</SectionLabel>
        )}
        <div className="space-y-1">
          {unpinnedSpaces.map((conv) => (
            <ConvRow
              key={conv.id}
              conv={conv}
              active={conv.id === activeId}
              meId={me.id}
              onSelect={onSelect}
              draft={drafts[conv.id] ?? ""}
              compact={custom.compact}
              muted={mutedIds.has(conv.id)}
              onTogglePin={onTogglePin}
              onToggleMute={onToggleMute}
            />
          ))}
        </div>

        <SectionLabel>Личные чаты</SectionLabel>
        {unpinnedDms.length === 0 && unpinnedSpaces.length === 0 && pinned.length === 0 ? (
          <div className="mt-8 px-6 text-center">
            <div className="glass mx-auto flex h-14 w-14 items-center justify-center rounded-2xl">
              <Search className="h-6 w-6 text-white/30" />
            </div>
            <p className="mt-4 text-sm leading-relaxed text-white/40">
              Пока никого. Найдите человека по @имени в поиске выше — или создайте группу кнопкой «+»
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {unpinnedDms.map((conv) => (
              <ConvRow
                key={conv.id}
                conv={conv}
                active={conv.id === activeId}
                meId={me.id}
                onSelect={onSelect}
                muted={mutedIds.has(conv.id)}
                onTogglePin={onTogglePin}
                onToggleMute={onToggleMute}
              />
            ))}
          </div>
        )}

        <button
          onClick={onDiscover}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-white/12 py-3 text-[13px] text-white/40 transition-colors hover:border-[#5865f2]/40 hover:text-white/70"
        >
          <Compass className="h-4 w-4" />
          Найти публичные группы и каналы
        </button>
      </div>
    </aside>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-2.5 pt-1.5 pb-1 text-[11px] font-semibold tracking-widest text-white/25 uppercase">
      {children}
    </p>
  );
}

function ConvRow({
  conv,
  active,
  meId,
  onSelect,
  pinned = false,
  muted = false,
  draft = "",
  compact = false,
  onTogglePin,
  onToggleMute,
  onMuteFor,
}: {
  conv: ConversationListItem;
  active: boolean;
  meId: string;
  onSelect: (id: string) => void;
  pinned?: boolean;
  muted?: boolean;
  draft?: string;
  compact?: boolean;
  onTogglePin?: (id: string) => void;
  onToggleMute?: (id: string) => void;
  onMuteFor?: (id: string, ms: number) => void;
}) {
  /** Открытое меню выбора длительности мьюта. */
  const [muteMenu, setMuteMenu] = useState(false);
  const lm = conv.lastMessage;
  /** Прочитано ли моё последнее сообщение (по lastReadAt собеседника). */
  const lmRead =
    !!lm &&
    !!conv.peer?.lastReadAt &&
    new Date(lm.createdAt).getTime() <= new Date(conv.peer.lastReadAt).getTime();
  const call = conv.activeCall;
  const isSpace = conv.kind !== "direct";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(conv.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(conv.id);
        }
      }}
      className={`group/row relative flex w-full cursor-pointer items-center gap-3 rounded-2xl px-3 text-left transition-colors ${compact ? "py-1.5" : "py-3"} ${
        active
          ? "bg-white/10"
          : "hover:bg-white/5"
      }`}
    >
      {/* Акцентная полоска у активного чата */}
      {active && (
        <span className="absolute top-1/2 left-0 h-6 w-1 -translate-y-1/2 rounded-full bg-slate-300" />
      )}
      <div className="relative">
        <Avatar
          name={isSpace ? conv.title : conv.peer.displayName}
          src={isSpace ? conv.avatarUrl : conv.peer.avatarUrl}
          size={48}
          online={isSpace ? undefined : conv.peer.online}
        />
        {isSpace && (
          <span className="glass-strong absolute -right-1 -bottom-1 flex h-5 w-5 items-center justify-center rounded-full">
            {conv.kind === "channel" ? (
              <Megaphone className="h-3 w-3 text-slate-400" />
            ) : (
              <Users className="h-3 w-3 text-slate-400" />
            )}
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="flex min-w-0 items-center gap-1.5 truncate text-[15px] font-semibold">
            <span className="truncate">{conv.title}</span>
            {conv.isPrivate && isSpace && <Lock className="h-3 w-3 shrink-0 text-white/25" />}
            {muted && <BellOff className="h-3 w-3 shrink-0 text-white/25" />}
          </p>
          {/* Наведение: быстрые действия (закрепить / заглушить) вместо времени */}
          <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/row:opacity-100">
            {onToggleMute && (
              <span
                role="button"
                title={muted ? "Включить уведомления" : "Заглушить чат"}
                onClick={(e) => {
                  e.stopPropagation();
                  if (muted || !onMuteFor) onToggleMute(conv.id);
                  else setMuteMenu((v) => !v);
                }}
                className="relative grid h-6 w-6 place-items-center rounded-lg text-white/35 hover:bg-white/10 hover:text-white/80"
              >
                {muted ? <BellRing className="h-3 w-3" /> : <BellOff className="h-3 w-3" />}
                {muteMenu && (
                  <>
                    {/* фон-подложка: клик мимо закрывает меню */}
                    <span className="fixed inset-0 z-40 cursor-default" onClick={(e) => { e.stopPropagation(); setMuteMenu(false); }} />
                    <span className="glass-strong absolute top-6 right-0 z-50 w-36 rounded-xl p-1 shadow-2xl" onClick={(e) => e.stopPropagation()}>
                      {(
                        [
                          ["На 1 час", 3_600_000],
                          ["На 8 часов", 8 * 3_600_000],
                          ["На 2 дня", 2 * 86_400_000],
                          ["Навсегда", 0],
                        ] as const
                      ).map(([label, ms]) => (
                        <button
                          key={label}
                          onClick={(e) => {
                            e.stopPropagation();
                            onMuteFor?.(conv.id, ms);
                            setMuteMenu(false);
                          }}
                          className="block w-full rounded-lg px-2.5 py-1.5 text-left text-[12px] text-white/70 hover:bg-white/10 hover:text-white"
                        >
                          {label}
                        </button>
                      ))}
                    </span>
                  </>
                )}
              </span>
            )}
            {onTogglePin && (
              <span
                role="button"
                title={pinned ? "Открепить" : "Закрепить чат"}
                onClick={(e) => {
                  e.stopPropagation();
                  onTogglePin(conv.id);
                }}
                className={`grid h-6 w-6 place-items-center rounded-lg hover:bg-white/10 ${
                  pinned ? "text-slate-400" : "text-white/35 hover:text-white/80"
                }`}
              >
                <Pin className="h-3 w-3" />
              </span>
            )}
          </span>
          {!pinned && lm && (
            <span className="hidden shrink-0 items-center gap-0.5 text-[11px] text-white/30 group-hover/row:hidden">
              {/* Статус моего последнего сообщения в личке: ✓ / ✓✓ */}
              {conv.kind === "direct" && lm.senderId === meId && (
                <span className={lmRead ? "text-slate-400" : ""} title={lmRead ? "Прочитано" : "Доставлено"}>
                  {lmRead ? <CheckCheck className="h-3 w-3" /> : <Check className="h-3 w-3" />}
                </span>
              )}
              {timeHHmm(lm.createdAt)}
            </span>
          )}
        </div>

        <div className="mt-0.5 flex items-center justify-between gap-2">
          {call && call.status === "live" ? (
            <p className="flex min-w-0 items-center gap-1.5 truncate text-[13px] text-emerald-300">
              <Radio className="h-3.5 w-3.5 shrink-0 animate-pulse-dot" />
              <span className="truncate">
                Звонок идёт · {call.participantCount}
                {call.media === "video" && <Video className="ml-1 inline h-3 w-3" />}
              </span>
            </p>
          ) : (
            <p className="min-w-0 flex-1 truncate text-[13px] text-white/40">
              {draft && <span className="font-semibold text-rose-400">Черновик: </span>}
              <PreviewNode conv={conv} meId={meId} />
            </p>
          )}
          {conv.unreadCount > 0 && (
            <span className="btn-gradient flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-bold text-white">
              {conv.unreadCount > 99 ? "99+" : conv.unreadCount}
            </span>
          )}
        </div>
      </div>
      {/* Булавка у закреплённого чата */}
      {pinned && (
        <Pin className="absolute top-2 right-2 h-3 w-3 rotate-45 text-slate-400/70" />
      )}
    </div>
  );
}

function CreateItem({
  icon,
  title,
  hint,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-white/8"
    >
      <span className="glass flex h-8 w-8 shrink-0 items-center justify-center rounded-lg">{icon}</span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{title}</span>
        <span className="block truncate text-[11px] text-white/35">{hint}</span>
      </span>
    </button>
  );
}

/** Строка настройки уведомлений: иконка + подпись + переключатель. */


export type CustomSettings = {
  bubbles: string;
  radius: string;
  chatfs: string;
  compact: boolean;
  font: string;
  anims: boolean;
  dndUntil: number;
};

function SettingToggle({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center justify-between rounded-xl px-2 py-1.5 text-left text-[12px] text-white/60 hover:bg-white/5"
    >
      <span>{label}</span>
      <span
        className={`relative h-4 w-7 rounded-full transition-colors ${on ? "bg-[#5865f2]" : "bg-white/15"}`}
      >
        <span
          className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${
            on ? "left-3.5" : "left-0.5"
          }`}
        />
      </span>
    </button>
  );
}
