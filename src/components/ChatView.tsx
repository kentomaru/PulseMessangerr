"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChatPayload, MessagePayload, SettingsPayload } from "@/lib/pulse";
import {
  REACTION_EMOJI,
  dayKey,
  formatBytes,
  formatDay,
  formatLastSeen,
  formatTime,
  isOnline,
  parseWallpaper,
  wallpaperCss,
} from "@/lib/pulse";
import AttachmentView from "./AttachmentView";
import Composer from "./Composer";
import {
  Avatar,
  IconArchive,
  IconBack,
  IconBan,
  IconBell,
  IconBellOff,
  IconCheck,
  IconCheckDouble,
  IconClose,
  IconDownload,
  IconEdit,
  IconMore,
  IconPhone,
  IconPin,
  IconReply,
  IconSearch,
  IconSmile,
  IconStorage,
  IconTrash,
  IconUsers,
  IconWallpaper,
  Modal,
  PulseLogo,
} from "./ui";

type Member = {
  userId: number;
  name: string;
  handle: string;
  emoji: string;
  accent: string;
  avatarFileId: number | null;
  lastSeenAt: string;
  role: string;
  lastReadMessageId: number;
};

type ChatDetails = {
  chat: {
    id: number;
    kind: string;
    title: string;
    emoji: string;
    accent: string;
    avatarFileId: number | null;
    wallpaper: string | null;
    ownerId: number | null;
  };
  me: { muted: boolean; pinned: boolean; archived: boolean; wallpaper: string | null; role: string };
  members: Member[];
  blockState: { blocked: boolean; blockedBy: boolean };
};

export type Person = { id: number; name: string; handle: string; emoji: string; accent: string; about: string };

function isEmojiOnly(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 8) return false;
  return /^(\p{Extended_Pictographic}|️|‍|\p{Emoji_Component})+$/u.test(trimmed);
}

export default function ChatView({
  chat,
  me,
  settings,
  onNotify,
  onChanged,
  onOpenWallpaper,
  onBack,
  onStartCall,
}: {
  chat: ChatPayload;
  me: Person;
  settings: SettingsPayload;
  onNotify: (text: string) => void;
  onChanged: () => void;
  onOpenWallpaper: () => void;
  onBack: () => void;
  onStartCall: (peer: { id: number; name: string; handle: string; emoji: string; accent: string; avatarFileId: number | null }) => void;
}) {
  const [details, setDetails] = useState<ChatDetails | null>(null);
  const [messages, setMessages] = useState<MessagePayload[]>([]);
  const [typing, setTyping] = useState<string[]>([]);
  const [replyTo, setReplyTo] = useState<MessagePayload | null>(null);
  const [editing, setEditing] = useState<MessagePayload | null>(null);
  const [highlightId, setHighlightId] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const sinceRef = useRef<string>(new Date(0).toISOString());
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopTypingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pinnedToBottom = useRef(true);

  const partner = chat.partner;
  const isGroup = chat.kind === "group";
  const title = isGroup ? chat.title : (partner?.name ?? "Чат");
  const emoji = isGroup ? chat.emoji : (partner?.emoji ?? "💬");
  const accent = isGroup ? chat.accent : (partner?.accent ?? "violet");
  const avatarFileId = isGroup ? chat.avatarFileId : partner?.avatarFileId;

  const wallpaper = useMemo(() => {
    const raw = chat.wallpaper ?? settings.wallpaper;
    const parsed = parseWallpaper(raw);
    const url = parsed.image ? `/api/files/${parsed.image}` : null;
    return { css: wallpaperCss(parsed, url), parsed };
  }, [chat.wallpaper, settings.wallpaper]);

  const loadDetails = useCallback(async () => {
    const res = await fetch(`/api/chats/${chat.id}`);
    if (!res.ok) return;
    const data = (await res.json()) as ChatDetails;
    setDetails(data);
  }, [chat.id]);

  const loadMessages = useCallback(
    async (mode: "full" | "poll") => {
      const after = mode === "full" ? 0 : (messagesRef.current.at(-1)?.id ?? 0);
      const params = new URLSearchParams({
        after: String(after),
        since: sinceRef.current,
        limit: "300",
      });
      const res = await fetch(`/api/chats/${chat.id}/messages?${params.toString()}`);
      if (!res.ok) return;
      const data = (await res.json()) as {
        messages: MessagePayload[];
        updates: MessagePayload[];
        typing: string[];
        serverTime?: string;
      };
      sinceRef.current = data.serverTime ?? new Date().toISOString();
      setTyping(data.typing ?? []);
      setMessages((prev) => {
        const map = new Map(prev.map((m) => [m.id, m]));
        for (const m of data.messages ?? []) map.set(m.id, m);
        for (const m of data.updates ?? []) map.set(m.id, m);
        return [...map.values()].sort((a, b) => a.id - b.id);
      });
    },
    [chat.id],
  );

  const messagesRef = useRef<MessagePayload[]>([]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    setMessages([]);
    setReplyTo(null);
    setEditing(null);
    setMenuOpen(false);
    setInfoOpen(false);
    sinceRef.current = new Date(0).toISOString();
    pinnedToBottom.current = true;
    void loadDetails();
    void loadMessages("full").then(() => {
      requestAnimationFrame(() => {
        bottomRef.current?.scrollIntoView({ block: "end" });
      });
    });
  }, [chat.id, loadDetails, loadMessages]);

  useEffect(() => {
    const interval = setInterval(() => {
      void loadMessages("poll");
      void loadDetails();
    }, 3000);
    return () => clearInterval(interval);
  }, [loadDetails, loadMessages]);

  const markRead = useCallback(
    async (isTyping = false) => {
      await fetch(`/api/chats/${chat.id}/read`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ typing: isTyping }),
      });
    },
    [chat.id],
  );

  useEffect(() => {
    void markRead(false);
  }, [markRead, messages.length]);

  useEffect(() => {
    if (!pinnedToBottom.current) return;
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, typing.length]);

  const handleTyping = useCallback(() => {
    if (!settings.typingStatus) return;
    if (stopTypingTimer.current) clearTimeout(stopTypingTimer.current);
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => void markRead(true), 350);
    stopTypingTimer.current = setTimeout(() => void markRead(false), 3200);
  }, [markRead, settings.typingStatus]);

  const patchChat = useCallback(
    async (patch: Record<string, unknown>) => {
      await fetch(`/api/chats/${chat.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      await loadDetails();
      onChanged();
    },
    [chat.id, loadDetails, onChanged],
  );

  const toggleBlock = useCallback(async () => {
    if (!partner) return;
    if (details?.blockState.blocked) {
      await fetch(`/api/blocks?userId=${partner.id}`, { method: "DELETE" });
      onNotify(`${partner.name} разблокирован(а)`);
    } else {
      await fetch("/api/blocks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: partner.id }),
      });
      onNotify(`${partner.name} заблокирован(а)`);
    }
    setMenuOpen(false);
    await loadDetails();
    onChanged();
  }, [details?.blockState.blocked, loadDetails, onChanged, onNotify, partner]);

  const deleteChat = useCallback(
    async (scope: "me" | "all") => {
      const res = await fetch(`/api/chats/${chat.id}?scope=${scope}`, { method: "DELETE" });
      if (!res.ok) {
        onNotify("Недостаточно прав для удаления");
        return;
      }
      setConfirmDelete(false);
      setMenuOpen(false);
      onNotify(scope === "all" ? "Чат удалён для всех" : "Чат удалён");
      onChanged();
    },
    [chat.id, onChanged, onNotify],
  );

  const messageAction = useCallback(
    async (action: "delete-me" | "delete-all" | "react" | "edit", message: MessagePayload, emoji?: string) => {
      if (action === "react") {
        await fetch(`/api/messages/${message.id}/react`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ emoji }),
        });
        void loadMessages("poll");
        return;
      }
      if (action === "delete-me" || action === "delete-all") {
        await fetch(`/api/messages/${message.id}?scope=${action === "delete-all" ? "all" : "me"}`, {
          method: "DELETE",
        });
        setMessages((prev) => prev.filter((m) => m.id !== message.id));
        onChanged();
        return;
      }
      if (action === "edit") {
        setEditing(message);
      }
    },
    [loadMessages, onChanged],
  );

  const jumpTo = useCallback((id: number) => {
    setHighlightId(id);
    const el = document.getElementById(`msg-${id}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => setHighlightId(null), 1800);
  }, []);

  const visibleMessages = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return messages;
    return messages.filter((m) => m.body.toLowerCase().includes(q));
  }, [messages, query]);

  const blocked = details?.blockState.blocked || details?.blockState.blockedBy;
  const muted = details?.me?.muted ?? chat.muted;
  const pinned = details?.me?.pinned ?? chat.pinned;
  const archived = details?.me?.archived ?? chat.archived;
  const partnerLastRead = useMemo(() => {
    if (!details) return 0;
    const others = details.members.filter((m) => m.userId !== me.id);
    return Math.max(0, ...others.map((m) => m.lastReadMessageId));
  }, [details, me.id]);

  const statusText = (() => {
    if (typing.length > 0 && settings.typingStatus) {
      return typing.length === 1 ? `${typing[0]} печатает…` : "печатают…";
    }
    if (isGroup) {
      return `${details?.members.length ?? 1} участников`;
    }
    if (!partner) return "";
    if (partner.lastSeenAt && isOnline(partner.lastSeenAt)) return "в сети";
    return formatLastSeen(partner.lastSeenAt);
  })();

  let lastDay = "";
  let lastSender = -1;

  return (
    <section className="relative flex h-full min-w-0 flex-1 flex-col">
      <header
        className="glass relative z-20 flex items-center gap-3 border-b px-3 py-2.5"
        style={{ background: "var(--panel)", borderColor: "var(--border)" }}
      >
        <button
          onClick={onBack}
          className="rounded-xl p-2 transition hover:brightness-125 md:hidden"
          style={{ color: "var(--muted)" }}
        >
          <IconBack size={19} />
        </button>
        <button onClick={() => setInfoOpen((v) => !v)} className="flex min-w-0 items-center gap-3">
          <Avatar
            name={title}
            emoji={emoji}
            accent={accent}
            fileId={avatarFileId}
            size={42}
            online={!isGroup && !!partner && isOnline(partner.lastSeenAt)}
          />
          <div className="min-w-0 text-left">
            <div className="truncate text-[14.5px] font-semibold">{title}</div>
            <div className="truncate text-[12px]" style={{ color: typing.length ? "var(--accent)" : "var(--muted)" }}>
              {statusText}
            </div>
          </div>
        </button>

        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => {
              setShowSearch((v) => !v);
              setQuery("");
            }}
            className="rounded-xl p-2.5 transition hover:brightness-125"
            style={{ color: showSearch ? "var(--accent)" : "var(--muted)" }}
            title="Поиск по чату"
          >
            <IconSearch size={18} />
          </button>
          <button
            onClick={() => {
              if (partner) onStartCall(partner);
              else onNotify("Звонки доступны только в личных чатах");
            }}
            className="rounded-xl p-2.5 transition hover:brightness-125"
            style={{ color: "var(--muted)" }}
            title="Позвонить"
          >
            <IconPhone size={18} />
          </button>
          <div className="relative">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="rounded-xl p-2.5 transition hover:brightness-125"
              style={{ color: menuOpen ? "var(--accent)" : "var(--muted)" }}
              title="Меню чата"
            >
              <IconMore size={18} />
            </button>
            {menuOpen ? (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
                <div
                  className="animate-pulse-in absolute top-full right-0 z-40 mt-1 w-60 overflow-hidden rounded-2xl border p-1.5"
                  style={{ background: "var(--panel-solid)", borderColor: "var(--border)", boxShadow: "var(--shadow)" }}
                >
                  <MenuItem icon={<IconWallpaper size={17} />} onClick={() => { setMenuOpen(false); onOpenWallpaper(); }}>
                    Обои чата
                  </MenuItem>
                  <MenuItem
                    icon={muted ? <IconBellOff size={17} /> : <IconBell size={17} />}
                    onClick={() => void patchChat({ muted: !muted })}
                  >
                    {muted ? "Включить звук" : "Без звука"}
                  </MenuItem>
                  <MenuItem icon={<IconPin size={17} />} onClick={() => void patchChat({ pinned: !pinned })}>
                    {pinned ? "Открепить" : "Закрепить"}
                  </MenuItem>
                  <MenuItem icon={<IconArchive size={17} />} onClick={() => void patchChat({ archived: !archived })}>
                    {archived ? "Вернуть из архива" : "В архив"}
                  </MenuItem>
                  {partner ? (
                    <MenuItem
                      icon={<IconBan size={17} />}
                      danger={!details?.blockState.blocked}
                      onClick={() => void toggleBlock()}
                    >
                      {details?.blockState.blocked ? "Разблокировать" : "Заблокировать"}
                    </MenuItem>
                  ) : null}
                  <MenuItem icon={<IconTrash size={17} />} danger onClick={() => { setMenuOpen(false); setConfirmDelete(true); }}>
                    Удалить чат
                  </MenuItem>
                </div>
              </>
            ) : null}
          </div>
        </div>
      </header>

      {showSearch ? (
        <div className="relative z-10 px-3 py-2" style={{ background: "var(--panel)" }}>
          <div
            className="mx-auto flex max-w-3xl items-center gap-2 rounded-2xl px-3 py-2"
            style={{ background: "var(--panel-2)", border: "1px solid var(--border)" }}
          >
            <IconSearch size={16} />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск в переписке"
              className="w-full bg-transparent text-[13.5px] outline-none"
            />
            <button onClick={() => setShowSearch(false)} style={{ color: "var(--muted)" }}>
              <IconClose size={15} />
            </button>
          </div>
        </div>
      ) : null}

      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          pinnedToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 140;
        }}
        className="pulse-scroll relative flex-1 px-3 py-4 sm:px-5"
        style={{ background: wallpaper.css }}
      >
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: wallpaper.parsed.dim
              ? `rgba(0,0,0,${wallpaper.parsed.dim / 100})`
              : "transparent",
            backdropFilter: wallpaper.parsed.blur ? `blur(${wallpaper.parsed.blur}px)` : undefined,
          }}
        />
        <div className="relative mx-auto flex max-w-3xl flex-col gap-1.5">
          {visibleMessages.length === 0 ? (
            <div className="mt-16 text-center">
              <div className="mb-3 flex justify-center opacity-80">
                <PulseLogo size={54} />
              </div>
              <div className="text-[14px] font-semibold">{query ? "Ничего не найдено" : "Пока пусто"}</div>
              <div className="text-[12.5px]" style={{ color: "var(--muted)" }}>
                {query ? "Попробуйте другой запрос" : "Отправьте первое сообщение ⚡"}
              </div>
            </div>
          ) : null}

          {visibleMessages.map((message) => {
            const day = formatDay(message.createdAt);
            const key = dayKey(message.createdAt);
            const showDay = key !== lastDay;
            lastDay = key;
            const mine = message.senderId === me.id;
            const grouped = !showDay && lastSender === message.senderId;
            lastSender = message.senderId;
            const read = mine && partnerLastRead >= message.id;

            return (
              <div key={message.id}>
                {showDay ? (
                  <div className="my-3 flex justify-center">
                    <span
                      className="rounded-full px-3 py-1 text-[11.5px] font-medium"
                      style={{ background: "var(--panel-3)", color: "var(--text)" }}
                    >
                      {day}
                    </span>
                  </div>
                ) : null}
                <MessageBubble
                  message={message}
                  mine={mine}
                  grouped={grouped}
                  isGroup={isGroup}
                  read={read}
                  settings={settings}
                  highlight={highlightId === message.id}
                  onReply={() => {
                    setEditing(null);
                    setReplyTo(message);
                  }}
                  onReact={(emojiValue) => void messageAction("react", message, emojiValue)}
                  onEdit={() => void messageAction("edit", message)}
                  onDeleteMe={() => void messageAction("delete-me", message)}
                  onDeleteAll={() => void messageAction("delete-all", message)}
                  onJump={() => jumpTo(message.replyToId ?? message.id)}
                />
              </div>
            );
          })}

          {typing.length > 0 && settings.typingStatus ? (
            <div className="mt-1 flex items-center gap-2 pl-1">
              <div
                className="flex items-center gap-1 rounded-2xl px-3 py-2.5"
                style={{ background: "var(--bubble-in)" }}
              >
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="typing-dot block h-2 w-2 rounded-full"
                    style={{ background: "var(--muted)", animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </div>
            </div>
          ) : null}
          <div ref={bottomRef} />
        </div>
      </div>

      {!pinnedToBottom ? null : null}

      {blocked ? (
        <div
          className="px-4 pb-1 text-center text-[12.5px]"
          style={{ color: "var(--muted)" }}
        >
          {details?.blockState.blocked
            ? "Вы заблокировали этого пользователя — разблокируйте в меню чата"
            : "Этот пользователь ограничил общение с вами"}
        </div>
      ) : null}

      <Composer
        chatId={chat.id}
        settings={settings}
        disabled={!!blocked}
        disabledHint={
          details?.blockState.blocked
            ? "Вы заблокировали пользователя. Разблокируйте, чтобы писать."
            : "Пользователь ограничил общение с вами."
        }
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
        editing={editing}
        onCancelEdit={() => setEditing(null)}
        onSent={() => {
          void loadMessages("poll");
          pinnedToBottom.current = true;
          onChanged();
        }}
        onTyping={handleTyping}
        onNotify={onNotify}
      />

      {infoOpen ? (
        <div
          className="animate-pulse-in absolute top-0 right-0 z-30 h-full w-full max-w-sm border-l p-5"
          style={{ background: "var(--panel-solid)", borderColor: "var(--border)", boxShadow: "var(--shadow)" }}
        >
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-[14px] font-semibold">Профиль</h3>
            <button onClick={() => setInfoOpen(false)} style={{ color: "var(--muted)" }}>
              <IconClose size={18} />
            </button>
          </div>
          <div className="flex flex-col items-center text-center">
            <Avatar name={title} emoji={emoji} accent={accent} fileId={avatarFileId} size={84} ring />
            <div className="mt-3 text-[17px] font-bold">{title}</div>
            <div className="text-[12.5px]" style={{ color: "var(--muted)" }}>
              {isGroup ? "Групповой чат" : `@${partner?.handle ?? ""}`}
            </div>
            {!isGroup && partner ? (
              <div className="mt-2 text-[12.5px]" style={{ color: "var(--muted)" }}>
                {partner.about}
              </div>
            ) : null}
          </div>

          <div className="mt-5 space-y-2">
            <InfoAction icon={<IconWallpaper size={17} />} onClick={onOpenWallpaper}>
              Обои чата
            </InfoAction>
            <InfoAction
              icon={muted ? <IconBellOff size={17} /> : <IconBell size={17} />}
              onClick={() => void patchChat({ muted: !muted })}
            >
              {muted ? "Включить уведомления" : "Отключить уведомления"}
            </InfoAction>
            {partner ? (
              <InfoAction
                icon={<IconBan size={17} />}
                danger={!details?.blockState.blocked}
                onClick={() => void toggleBlock()}
              >
                {details?.blockState.blocked ? "Разблокировать пользователя" : "Заблокировать пользователя"}
              </InfoAction>
            ) : null}
            <InfoAction icon={<IconTrash size={17} />} danger onClick={() => setConfirmDelete(true)}>
              Удалить чат
            </InfoAction>
          </div>

          {isGroup && details ? (
            <div className="mt-6">
              <div className="mb-2 flex items-center gap-2 text-[12.5px] font-semibold" style={{ color: "var(--muted)" }}>
                <IconUsers size={16} /> Участники ({details.members.length})
              </div>
              <div className="pulse-scroll max-h-52">
                {details.members.map((m) => (
                  <div key={m.userId} className="mb-1.5 flex items-center gap-2.5 rounded-2xl px-2 py-1.5" style={{ background: "var(--panel-2)" }}>
                    <Avatar name={m.name} emoji={m.emoji} accent={m.accent} fileId={m.avatarFileId} size={34} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium">{m.name}{m.userId === me.id ? " (вы)" : ""}</div>
                      <div className="truncate text-[11.5px]" style={{ color: "var(--muted)" }}>
                        {m.role === "owner" ? "создатель" : m.role === "admin" ? "админ" : "участник"}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {details ? (
            <div className="mt-6 rounded-2xl p-3 text-[12px]" style={{ background: "var(--panel-2)", color: "var(--muted)" }}>
              <div className="mb-1 flex items-center gap-2 font-semibold" style={{ color: "var(--text)" }}>
                <IconStorage size={15} /> Медиа чата
              </div>
              {messages.filter((m) => m.attachments.length > 0).length} сообщений с вложениями
            </div>
          ) : null}
        </div>
      ) : null}

      <Modal open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Удалить чат" width="max-w-sm">
        <p className="mb-4 text-[13.5px]" style={{ color: "var(--muted)" }}>
          {isGroup
            ? "Удаление для всех возможно только для создателя группы."
            : "«Удалить для всех» удалит переписку у обоих собеседников."}
        </p>
        <div className="space-y-2">
          <button
            onClick={() => void deleteChat("me")}
            className="w-full rounded-2xl py-3 text-[13.5px] font-semibold"
            style={{ background: "var(--panel-2)" }}
          >
            Удалить у меня
          </button>
          <button
            onClick={() => void deleteChat("all")}
            className="w-full rounded-2xl py-3 text-[13.5px] font-semibold text-white"
            style={{ background: "#ef4444" }}
          >
            Удалить для всех
          </button>
        </div>
      </Modal>
    </section>
  );
}

function MenuItem({
  icon,
  children,
  onClick,
  danger,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13.5px] font-medium transition hover:brightness-125"
      style={{ color: danger ? "#f87171" : "var(--text)" }}
    >
      {icon}
      {children}
    </button>
  );
}

function InfoAction({
  icon,
  children,
  onClick,
  danger,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-[13px] font-medium transition hover:brightness-125"
      style={{ background: "var(--panel-2)", color: danger ? "#f87171" : "var(--text)" }}
    >
      {icon}
      {children}
    </button>
  );
}

function MessageBubble({
  message,
  mine,
  grouped,
  isGroup,
  read,
  settings,
  highlight,
  onReply,
  onReact,
  onEdit,
  onDeleteMe,
  onDeleteAll,
  onJump,
}: {
  message: MessagePayload;
  mine: boolean;
  grouped: boolean;
  isGroup: boolean;
  read: boolean;
  settings: SettingsPayload;
  highlight: boolean;
  onReply: () => void;
  onReact: (emoji: string) => void;
  onEdit: () => void;
  onDeleteMe: () => void;
  onDeleteAll: () => void;
  onJump: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [picker, setPicker] = useState(false);
  const hasAttachments = message.attachments.length > 0;
  const bigEmoji = settings.largeEmoji && isEmojiOnly(message.body);
  const isStickerLike = hasAttachments && !message.body;

  if (message.kind === "system") {
    return (
      <div className="my-2 flex justify-center">
        <span className="rounded-full px-3 py-1 text-[11.5px]" style={{ background: "var(--panel-3)", color: "var(--muted)" }}>
          {message.body}
        </span>
      </div>
    );
  }

  const deleted = !!message.deletedForAllAt;

  return (
    <div
      id={`msg-${message.id}`}
      className={`group flex items-end gap-2 ${mine ? "justify-end" : "justify-start"} ${grouped ? "mt-0.5" : "mt-2"}`}
    >
      {!mine ? (
        <div className="w-8 shrink-0">
          {!grouped && isGroup ? (
            <Avatar name={message.sender.name} emoji={message.sender.emoji} accent={message.sender.accent} fileId={message.sender.avatarFileId} size={32} />
          ) : null}
        </div>
      ) : null}

      <div className={`relative max-w-[78%] min-w-0 ${mine ? "items-end" : "items-start"}`}>
        <div
          className={`relative rounded-[var(--radius-bubble)] px-3.5 py-2 ${
            settings.bubbleStyle === "solid" ? "" : settings.bubbleStyle === "outline" ? "border" : ""
          }`}
          style={{
            background: deleted
              ? "var(--panel-2)"
              : mine
                ? "var(--bubble-out)"
                : settings.bubbleStyle === "outline"
                  ? "transparent"
                  : "var(--bubble-in)",
            borderColor: "var(--border)",
            color: deleted ? "var(--muted)" : mine ? "var(--bubble-out-text)" : "var(--bubble-in-text)",
            boxShadow: highlight ? `0 0 0 2px var(--accent)` : "0 6px 18px rgba(0,0,0,.18)",
            borderTopLeftRadius: !mine && !grouped ? 6 : undefined,
            borderTopRightRadius: mine && !grouped ? 6 : undefined,
            maxWidth: 460,
          }}
        >
          {!grouped && isGroup && !mine ? (
            <div className="mb-1 text-[12px] font-semibold" style={{ color: "var(--accent)" }}>
              {message.sender.name}
            </div>
          ) : null}

          {message.replyTo ? (
            <button
              onClick={onJump}
              className="mb-1.5 flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-left"
              style={{
                background: mine ? "rgba(0,0,0,.16)" : "rgba(127,127,127,.18)",
                borderLeft: `3px solid ${mine ? "#fff" : "var(--accent)"}`,
              }}
            >
              <IconReply size={13} />
              <span className="min-w-0">
                <span className="block text-[11.5px] font-semibold" style={{ opacity: 0.9 }}>
                  {message.replyTo.senderName}
                </span>
                <span className="block truncate text-[12px]" style={{ opacity: 0.8 }}>
                  {message.replyTo.deleted
                    ? "Сообщение удалено"
                    : message.replyTo.body ||
                      (message.replyTo.attachmentKind === "image"
                        ? "Фото"
                        : message.replyTo.attachmentKind === "video"
                          ? "Видео"
                          : message.replyTo.attachmentKind === "audio"
                            ? "Голосовое"
                            : message.replyTo.attachmentKind
                              ? "Файл"
                              : "")}
                </span>
              </span>
            </button>
          ) : null}

          {deleted ? (
            <div className="flex items-center gap-2 py-0.5 text-[13px] italic" style={{ color: "var(--muted)" }}>
              <IconTrash size={13} /> Сообщение удалено
            </div>
          ) : (
            <>
              {hasAttachments ? <AttachmentView attachments={message.attachments} /> : null}
              {message.body ? (
                <div
                  className={`whitespace-pre-wrap break-words ${hasAttachments ? "mt-1.5" : ""} ${isStickerLike ? "" : ""}`}
                  style={{ fontSize: bigEmoji ? "calc(var(--msg-size) * 2.4)" : "var(--msg-size)", lineHeight: bigEmoji ? 1.2 : 1.45 }}
                >
                  {message.body}
                </div>
              ) : null}
            </>
          )}

          <div className="mt-1 flex items-center justify-end gap-1.5" style={{ opacity: 0.75 }}>
            {message.editedAt ? <span className="text-[10.5px]">изм.</span> : null}
            <span className="text-[10.5px] tabular-nums">{formatTime(message.createdAt)}</span>
            {mine ? (
              read ? (
                <IconCheckDouble size={14} className="text-sky-300" />
              ) : (
                <IconCheck size={13} />
              )
            ) : null}
          </div>
        </div>

        {message.reactions.length > 0 ? (
          <div className={`mt-1 flex flex-wrap gap-1 ${mine ? "justify-end" : "justify-start"}`}>
            {message.reactions.map((r) => (
              <button
                key={r.emoji}
                onClick={() => onReact(r.emoji)}
                className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] transition hover:brightness-125"
                style={{
                  background: r.users.includes(message.senderId) || r.users.length > 1 ? "var(--panel-3)" : "var(--panel-2)",
                  border: `1px solid ${r.users.length > 0 ? "var(--border)" : "transparent"}`,
                }}
              >
                <span>{r.emoji}</span>
                <span style={{ color: "var(--muted)" }}>{r.users.length}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {!deleted ? (
        <div className={`relative shrink-0 ${mine ? "order-first" : ""}`}>
          <div className="flex items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
            <BubbleAction title="Реакция" onClick={() => setPicker((v) => !v)}>
              <IconSmile size={15} />
            </BubbleAction>
            <BubbleAction title="Ответить" onClick={onReply}>
              <IconReply size={15} />
            </BubbleAction>
            <BubbleAction title="Ещё" onClick={() => setOpen((v) => !v)}>
              <IconMore size={15} />
            </BubbleAction>
          </div>
          {picker ? (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setPicker(false)} />
              <div
                className="animate-pulse-in absolute bottom-full z-40 mb-1 flex gap-1 rounded-2xl border p-1.5"
                style={{
                  background: "var(--panel-solid)",
                  borderColor: "var(--border)",
                  boxShadow: "var(--shadow)",
                  left: mine ? "auto" : 0,
                  right: mine ? 0 : "auto",
                }}
              >
                {REACTION_EMOJI.map((e) => (
                  <button
                    key={e}
                    onClick={() => {
                      onReact(e);
                      setPicker(false);
                    }}
                    className="rounded-lg px-1.5 py-1 text-[17px] transition hover:brightness-125"
                  >
                    {e}
                  </button>
                ))}
              </div>
            </>
          ) : null}
          {open ? (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
              <div
                className="animate-pulse-in absolute top-full z-40 mt-1 w-48 overflow-hidden rounded-2xl border p-1.5"
                style={{
                  background: "var(--panel-solid)",
                  borderColor: "var(--border)",
                  boxShadow: "var(--shadow)",
                  left: mine ? "auto" : 0,
                  right: mine ? 0 : "auto",
                }}
              >
                {mine && !hasAttachments ? (
                  <MenuItem icon={<IconEdit size={16} />} onClick={() => { setOpen(false); onEdit(); }}>
                    Изменить
                  </MenuItem>
                ) : null}
                {mine ? (
                  <MenuItem icon={<IconTrash size={16} />} danger onClick={() => { setOpen(false); onDeleteAll(); }}>
                    Удалить у всех
                  </MenuItem>
                ) : null}
                <MenuItem icon={<IconTrash size={16} />} onClick={() => { setOpen(false); onDeleteMe(); }}>
                  Удалить у меня
                </MenuItem>
                {hasAttachments ? (
                  <a
                    href={`/api/files/${message.attachments[0].fileId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13.5px]"
                  >
                    <IconDownload size={16} /> Скачать ({formatBytes(message.attachments[0].size)})
                  </a>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function BubbleAction({
  children,
  onClick,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="rounded-full p-1.5 transition hover:brightness-125"
      style={{ color: "var(--muted)" }}
    >
      {children}
    </button>
  );
}
