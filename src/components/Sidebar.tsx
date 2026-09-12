"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bell,
  BellOff,
  Bookmark,
  Compass,
  Hash,
  Loader2,
  Lock,
  LogOut,
  Megaphone,
  MonitorSmartphone,
  Phone,
  Plus,
  Radio,
  Search,
  SearchX,
  Shield,
  Sparkles,
  UserPlus,
  Users,
  Video,
  Volume2,
  VolumeX,
} from "lucide-react";
import Avatar from "./Avatar";
import PreviewLabel from "./PreviewLabel";
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
  /** Открыть «Избранное» (чат с самим собой). */
  onOpenSaved: () => void;
  /** Открыть отдельную вкладку «Приватность». */
  onOpenPrivacy: () => void;
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
function PreviewNode({ conv, meId }: { conv: ConversationListItem; meId: string }) {
  const lm = conv.lastMessage;
  if (!lm) return <>Нет сообщений</>;
  const prefix = lm.senderId === meId ? "Вы: " : conv.kind === "direct" ? "" : `${lm.senderName ?? ""}: `;
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      {prefix && <span className="shrink-0">{prefix}</span>}
      <PreviewLabel type={lm.type} content={lm.content} iconClassName="h-3.5 w-3.5" />
    </span>
  );
}

/** Из вставленной ссылки/токена достаём token. */
function extractToken(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  const m = v.match(/#group=([A-Za-z0-9_-]+)/);
  if (m) return m[1];
  if (/^[A-Za-z0-9_-]{8,32}$/.test(v)) return v;
  return null;
}

export default function Sidebar({
  me,
  conversations,
  activeId,
  storyGroups,
  soundOn,
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
  onOpenSaved,
  onOpenPrivacy,
  onToggleSound,
  onToggleCallSound,
  onToggleNotify,
  onJoinByToken,
}: Props) {
  const [query, setQuery] = useState("");
  const [notifyOpen, setNotifyOpen] = useState(false);
  const notifyBoxRef = useRef<HTMLDivElement | null>(null);
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [groups, setGroups] = useState<DiscoverItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const searchBoxRef = useRef<HTMLDivElement | null>(null);
  const createRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 1) {
      setUsers([]);
      setGroups([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const [u, g] = await Promise.all([
          api<{ users: PublicUser[] }>(`/api/users/search?q=${encodeURIComponent(q)}`),
          api<{ items: DiscoverItem[] }>(`/api/discover?q=${encodeURIComponent(q)}`),
        ]);
        setUsers(u.users);
        setGroups(g.items);
      } catch {
        setUsers([]);
        setGroups([]);
      } finally {
        setSearching(false);
      }
    }, 280);
    return () => clearTimeout(t);
  }, [query]);

  // Клик вне поиска / меню создания / панели уведомлений — закрыть
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (createRef.current && !createRef.current.contains(e.target as Node)) setCreateOpen(false);
      if (notifyBoxRef.current && !notifyBoxRef.current.contains(e.target as Node))
        setNotifyOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const spaces = useMemo(() => conversations.filter((c) => c.kind !== "direct"), [conversations]);
  const dms = useMemo(() => conversations.filter((c) => c.kind === "direct"), [conversations]);

  const linkToken = extractToken(query);

  return (
    <aside className="flex h-full w-full flex-col border-r border-white/8 bg-[#0c0c17]/80 backdrop-blur-xl">
      {/* Шапка */}
      <div className="flex items-center gap-3 px-5 pt-5 pb-3">
        <button onClick={onOpenProfile} className="transition-transform hover:scale-105 active:scale-95">
          <Avatar name={me.displayName} src={me.avatarUrl} size={44} online={me.showOnline} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-display text-lg font-bold tracking-[0.18em]">PULSE</span>
            <Sparkles className="h-3.5 w-3.5 text-violet-300/80" />
          </div>
          <p className="truncate text-xs text-white/35">@{me.username}</p>
        </div>

        <div ref={createRef} className="relative">
          <button
            onClick={() => setCreateOpen((v) => !v)}
            title="Создать группу или канал"
            className="btn-gradient flex h-9 w-9 items-center justify-center rounded-xl text-white"
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
                  icon={<Users className="h-4 w-4 text-violet-300" />}
                  title="Создать группу"
                  hint="Общий чат и звонки"
                  onClick={() => {
                    setCreateOpen(false);
                    onCreateGroup("group");
                  }}
                />
                <CreateItem
                  icon={<Megaphone className="h-4 w-4 text-cyan-300" />}
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
        <button
          onClick={onOpenPrivacy}
          title="Приватность — кто видит ваш статус и может звонить/писать"
          className="glass flex h-9 w-9 items-center justify-center rounded-xl text-white/50 transition-colors hover:text-violet-300"
        >
          <Shield className="h-4 w-4" />
        </button>
        {/* Настройки уведомлений: звук сообщений, рингтон, браузерные уведомления */}
        <div ref={notifyBoxRef} className="relative">
          <button
            onClick={() => setNotifyOpen((v) => !v)}
            title="Настройки уведомлений"
            className={`glass flex h-9 w-9 items-center justify-center rounded-xl transition-colors ${
              soundOn || notifyOn
                ? "text-white/50 hover:text-emerald-300"
                : "text-white/30 hover:text-white/70"
            }`}
          >
            {soundOn || notifyOn ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
          </button>

          <AnimatePresence>
            {notifyOpen && (
              <motion.div
                initial={{ opacity: 0, y: 6, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 6, scale: 0.97 }}
                transition={{ duration: 0.14 }}
                className="glass-strong absolute top-11 right-0 z-50 w-64 rounded-2xl p-3 shadow-2xl"
              >
                <p className="px-1 pb-2 text-[10px] font-semibold tracking-wide text-white/40 uppercase">
                  Уведомления
                </p>
                <NotifyRow
                  icon={soundOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                  label="Звук сообщений"
                  hint="Короткий сигнал о новом сообщении"
                  active={soundOn}
                  onClick={onToggleSound}
                />
                <NotifyRow
                  icon={<Phone className="h-4 w-4" />}
                  label="Звук входящего звонка"
                  hint="Рингтон, когда вам звонят"
                  active={callSoundOn}
                  onClick={onToggleCallSound}
                />
                <NotifyRow
                  icon={<MonitorSmartphone className="h-4 w-4" />}
                  label="Браузерные уведомления"
                  hint="Всплывают, даже когда вкладка скрыта"
                  active={notifyOn}
                  onClick={onToggleNotify}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
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
                  className="mb-1 flex w-full items-center gap-3 rounded-xl bg-violet-500/15 px-3 py-2.5 text-left"
                >
                  <span className="glass flex h-8 w-8 items-center justify-center rounded-lg">
                    <Lock className="h-3.5 w-3.5 text-violet-300" />
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
                        <Megaphone className="h-3 w-3 text-cyan-300" />
                      ) : (
                        <Hash className="h-3 w-3 text-violet-300" />
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

              {users.length === 0 && groups.length === 0 && !searching && !linkToken && (
                <p className="flex items-center gap-2 px-3 py-3 text-sm text-white/40">
                  <SearchX className="h-4 w-4" />
                  Ничего не нашли
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Истории */}
      <StoriesRow me={me} groups={storyGroups} onOpen={onOpenStories} onAdd={onAddStory} />

      {/* Список диалогов */}
      <div className="nice-scroll min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        {spaces.length > 0 && (
          <SectionLabel>Группы и каналы</SectionLabel>
        )}
        <div className="space-y-1">
          {spaces.map((conv) => (
            <ConvRow key={conv.id} conv={conv} active={conv.id === activeId} meId={me.id} onSelect={onSelect} />
          ))}
        </div>

        <SectionLabel>Личные чаты</SectionLabel>
        {dms.length === 0 && spaces.length === 0 ? (
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
            {dms.map((conv) => (
              <ConvRow key={conv.id} conv={conv} active={conv.id === activeId} meId={me.id} onSelect={onSelect} />
            ))}
          </div>
        )}

        <button
          onClick={onDiscover}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-white/12 py-3 text-[13px] text-white/40 transition-colors hover:border-violet-400/40 hover:text-white/70"
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
    <p className="px-2 pt-3 pb-2 text-[11px] font-semibold tracking-widest text-white/25 uppercase">
      {children}
    </p>
  );
}

function ConvRow({
  conv,
  active,
  meId,
  onSelect,
}: {
  conv: ConversationListItem;
  active: boolean;
  meId: string;
  onSelect: (id: string) => void;
}) {
  const lm = conv.lastMessage;
  const call = conv.activeCall;
  const isSpace = conv.kind !== "direct";

  return (
    <button
      onClick={() => onSelect(conv.id)}
      className={`relative flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors ${
        active ? "bg-white/10" : "hover:bg-white/5"
      }`}
    >
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
              <Megaphone className="h-3 w-3 text-cyan-300" />
            ) : (
              <Users className="h-3 w-3 text-violet-300" />
            )}
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="flex min-w-0 items-center gap-1.5 truncate text-[15px] font-semibold">
            <span className="truncate">{conv.title}</span>
            {conv.isPrivate && isSpace && <Lock className="h-3 w-3 shrink-0 text-white/25" />}
          </p>
          {lm && <span className="shrink-0 text-[11px] text-white/30">{timeHHmm(lm.createdAt)}</span>}
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
            <p className="truncate text-[13px] text-white/40">
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
    </button>
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
function NotifyRow({
  icon,
  label,
  hint,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  hint: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-white/8"
    >
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
          active ? "bg-violet-500/20 text-violet-200" : "bg-white/6 text-white/35"
        }`}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium">{label}</span>
        <span className="block truncate text-[11px] text-white/35">{hint}</span>
      </span>
      <span
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
          active ? "bg-violet-500" : "bg-white/15"
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${
            active ? "left-[18px]" : "left-0.5"
          }`}
        />
      </span>
    </button>
  );
}
