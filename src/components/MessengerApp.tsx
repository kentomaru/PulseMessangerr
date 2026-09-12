"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2 } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { playNotifySound } from "@/lib/notify";
import type { ConversationListItem, PublicUser, StoryGroup } from "@/lib/types";
import { useCallController } from "@/lib/useCallController";
import Sidebar from "./Sidebar";
import ChatView from "./ChatView";
import ProfileModal from "./ProfileModal";
import UserCardModal from "./UserCardModal";
import CallStage from "./CallStage";
import StoryComposer from "./StoryComposer";
import StoryViewer from "./StoryViewer";
import GroupCreateModal from "./GroupCreateModal";
import GroupInfoModal from "./GroupInfoModal";
import DiscoverModal from "./DiscoverModal";

type Toast = { id: number; msg: string };

/** Что лежит в hash-ссылке: `#join=<token>` (звонок) или `#group=<token>` (инвайт). */
function parseHash(): { join: string | null; group: string | null } {
  if (typeof window === "undefined") return { join: null, group: null };
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  return { join: params.get("join"), group: params.get("group") };
}

export default function MessengerApp({ me: initialMe }: { me: PublicUser }) {
  const [me, setMe] = useState(initialMe);
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [storyGroups, setStoryGroups] = useState<StoryGroup[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [viewUser, setViewUser] = useState<PublicUser | null>(null);
  const [storyComposer, setStoryComposer] = useState(false);
  const [storyViewer, setStoryViewer] = useState<number | null>(null);
  const [createKind, setCreateKind] = useState<"group" | "channel" | null>(null);
  const [discover, setDiscover] = useState(false);
  const [groupInfoId, setGroupInfoId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  /** Звук уведомлений (localStorage, вкл по умолчанию). */
  const [soundOn, setSoundOn] = useState(true);
  const toastId = useRef(0);
  const unauthorizedRef = useRef(false);
  const activeIdRef = useRef<string | null>(null);
  activeIdRef.current = activeId;
  const soundOnRef = useRef(true);

  const notify = useCallback((msg: string) => {
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, msg }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3800);
  }, []);

  /** Сессия истекла (401 в любом опросе) — возвращаем на экран входа. */
  const handleUnauthorized = useCallback(() => {
    if (unauthorizedRef.current) return;
    unauthorizedRef.current = true;
    window.location.href = "/";
  }, []);

  const handleUnauthorizedRef = useRef(handleUnauthorized);
  handleUnauthorizedRef.current = handleUnauthorized;

  const loadConversations = useCallback(async () => {
    try {
      const d = await api<{ conversations: ConversationListItem[] }>("/api/conversations");
      setConversations(d.conversations);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) handleUnauthorizedRef.current();
    }
  }, []);

  const loadStories = useCallback(async () => {
    try {
      const d = await api<{ groups: StoryGroup[] }>("/api/stories");
      setStoryGroups(d.groups);
    } catch {
      /* ignore */
    }
  }, []);

  const callCtl = useCallController(me.id, notify, handleUnauthorized, () => {
    void loadConversations();
  });

  useEffect(() => {
    void loadConversations();
    void loadStories();
    const t = setInterval(loadConversations, 4000);
    const ts = setInterval(loadStories, 30_000);
    return () => {
      clearInterval(t);
      clearInterval(ts);
    };
  }, [loadConversations, loadStories]);

  // Звук уведомлений: настройка из localStorage
  useEffect(() => {
    setSoundOn(localStorage.getItem("pulse_sound") !== "off");
  }, []);
  useEffect(() => {
    soundOnRef.current = soundOn;
  }, [soundOn]);

  const toggleSound = useCallback(() => {
    setSoundOn((v) => {
      const next = !v;
      localStorage.setItem("pulse_sound", next ? "on" : "off");
      return next;
    });
  }, []);

  // Счётчик непрочитанных в заголовке вкладки
  useEffect(() => {
    const n = conversations.reduce((s, c) => s + c.unreadCount, 0);
    document.title = n > 0 ? `(${n}) Pulse` : "Pulse";
  }, [conversations]);

  // Звук нового сообщения: сработать должен только для чужих сообщений
  // в чатах, которые сейчас не открыты (или когда вкладка в фоне).
  const lastMsgIdsRef = useRef<Map<string, string>>(new Map());
  const firstConvLoadRef = useRef(true);
  useEffect(() => {
    const prev = lastMsgIdsRef.current;
    let beep = false;
    for (const c of conversations) {
      const lm = c.lastMessage;
      const old = prev.get(c.id);
      const isNew = !!lm && !!old && lm.id !== old && lm.senderId !== me.id;
      if (isNew && (c.id !== activeIdRef.current || document.hidden)) beep = true;
      if (lm) prev.set(c.id, lm.id);
    }
    // первый опрос — просто запоминаем id, не пиликаем
    if (firstConvLoadRef.current) {
      firstConvLoadRef.current = false;
      beep = false;
    }
    if (beep && soundOnRef.current) playNotifySound();
  }, [conversations, me.id]);

  const activeConv = conversations.find((c) => c.id === activeId) ?? null;

  const openConversationWith = useCallback(
    async (user: PublicUser) => {
      try {
        const d = await api<{ conversation: { id: string; peer: PublicUser } }>("/api/conversations", {
          method: "POST",
          body: JSON.stringify({ userId: user.id }),
        });
        setActiveId(d.conversation.id);
        await loadConversations();
      } catch (e) {
        notify(e instanceof Error ? e.message : "Не удалось открыть чат");
      }
    },
    [loadConversations, notify],
  );

  /** Открыть «Избранное» — личный чат с самим собой (создаётся при первом открытии). */
  const openSaved = useCallback(async () => {
    const existing = conversations.find((c) => c.saved);
    if (existing) {
      setActiveId(existing.id);
      return;
    }
    try {
      const d = await api<{ conversation: { id: string } }>("/api/conversations", {
        method: "POST",
        body: JSON.stringify({ userId: me.id }),
      });
      setActiveId(d.conversation.id);
      await loadConversations();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Не удалось открыть «Избранное»");
    }
  }, [conversations, me.id, loadConversations, notify]);

  /** Вход по ссылке-приглашению в группу/канал. */
  const joinByToken = useCallback(
    async (token: string) => {
      try {
        const d = await api<{ conversation: { id: string; title: string } }>("/api/conversations/join", {
          method: "POST",
          body: JSON.stringify({ token }),
        });
        notify(`Вы в «${d.conversation.title}»`);
        await loadConversations();
        setActiveId(d.conversation.id);
      } catch (e) {
        notify(e instanceof Error ? e.message : "Ссылка-приглашение не сработала");
      }
    },
    [loadConversations, notify],
  );

  const joinByTokenRef = useRef(joinByToken);
  joinByTokenRef.current = joinByToken;
  const handledHashRef = useRef<string | null>(null);

  /**
   * Обработка hash-ссылок:
   *  `#join=<token>`  — войти в звонок (можно вообще не быть в чате);
   *  `#group=<token>` — вступить в приватную группу/канал.
   */
  useEffect(() => {
    const handle = async () => {
      const { join, group } = parseHash();
      const key = join ? `join:${join}` : group ? `group:${group}` : null;
      if (!key || handledHashRef.current === key) return;
      handledHashRef.current = key;

      if (join) {
        await callCtl.joinByToken(join);
      } else if (group) {
        await joinByTokenRef.current(group);
      }
      // Убираем hash из адресной строки, чтобы не срабатывал повторно
      try {
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
      } catch {
        /* не важно */
      }
    };
    void handle();
    window.addEventListener("hashchange", handle);
    return () => window.removeEventListener("hashchange", handle);
    // Зависимость только от готовности списка диалогов (для #group)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversations.length, callCtl.joinByToken]);

  const logout = useCallback(async () => {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } finally {
      window.location.reload();
    }
  }, []);

  // Переключаемся на чат, в который приходит звонок
  useEffect(() => {
    if (callCtl.incoming) setActiveId(callCtl.incoming.conversationId);
  }, [callCtl.incoming]);

  const markWatched = useCallback((storyId: string) => {
    setStoryGroups((gs) =>
      gs.map((g) => ({
        ...g,
        stories: g.stories.map((s) => (s.id === storyId ? { ...s, viewed: true } : s)),
      })),
    );
    void api(`/api/stories/${storyId}/view`, { method: "POST" }).catch(() => {});
  }, []);

  const removeStory = useCallback(
    (storyId: string) => {
      setStoryGroups((gs) =>
        gs.map((g) => ({ ...g, stories: g.stories.filter((s) => s.id !== storyId) })).filter((g) => g.stories.length > 0),
      );
      void loadStories();
    },
    [loadStories],
  );

  /** Контакты для быстрого выбора при создании группы. */
  const contacts = useMemo(() => {
    const map = new Map<string, PublicUser>();
    for (const c of conversations) {
      if (c.kind === "direct" && c.peer?.id) map.set(c.peer.id, c.peer);
      for (const m of c.members ?? []) if (m.user.id !== me.id) map.set(m.user.id, m.user);
    }
    return Array.from(map.values()).slice(0, 60);
  }, [conversations, me.id]);

  return (
    <main className="relative z-10 flex h-dvh overflow-hidden">
      <div className={`${activeId ? "hidden md:flex" : "flex"} w-full shrink-0 md:w-[380px]`}>
        <Sidebar
          me={me}
          conversations={conversations}
          activeId={activeId}
          storyGroups={storyGroups}
          soundOn={soundOn}
          onToggleSound={toggleSound}
          onSelect={setActiveId}
          onOpenProfile={() => setShowProfile(true)}
          onOpenChat={openConversationWith}
          onLogout={logout}
          onOpenStories={(idx) => setStoryViewer(idx)}
          onAddStory={() => setStoryComposer(true)}
          onCreateGroup={(kind) => setCreateKind(kind)}
          onDiscover={() => setDiscover(true)}
          onOpenSaved={() => void openSaved()}
          onJoinByToken={(token) => void joinByToken(token)}
        />
      </div>

      <div className={`${activeId ? "flex" : "hidden md:flex"} min-w-0 flex-1`}>
        {activeConv ? (
          <ChatView
            key={activeConv.id}
            me={me}
            conversationId={activeConv.id}
            initialTitle={activeConv.title}
            initialKind={activeConv.kind}
            initialAvatar={activeConv.avatarUrl}
            initialUnread={activeConv.unreadCount}
            peer={activeConv.kind === "direct" ? activeConv.peer : null}
            onBack={() => setActiveId(null)}
            onCall={(media) => callCtl.startCall(activeConv.id, media)}
            onJoinCall={(callId, media) => callCtl.joinCall(callId, media)}
            onViewPeer={() => activeConv.peer && setViewUser(activeConv.peer)}
            onViewUser={(u) => setViewUser(u)}
            onOpenInfo={() => setGroupInfoId(activeConv.id)}
            callBusy={!!callCtl.session || !!callCtl.incoming || callCtl.starting}
            refreshConversations={loadConversations}
            notify={notify}
            onUnauthorized={handleUnauthorized}
          />
        ) : (
          <EmptyState hasSpaces={conversations.some((c) => c.kind !== "direct")} onCreate={() => setCreateKind("group")} />
        )}
      </div>

      {/* Каждый условный ребёнок — со своим key: без них framer-motion
          ставит пустой ключ, а при двух открытых модалках это
          «two children with the same key» и сбитые exit-анимации. */}
      <AnimatePresence>
        {showProfile && (
          <ProfileModal
            key="profile"
            me={me}
            onClose={() => setShowProfile(false)}
            onSaved={(u: PublicUser) => {
              setMe(u);
              setShowProfile(false);
              void loadConversations();
              notify("Профиль обновлён");
            }}
            onDeletedAccount={() => {
              window.location.href = "/";
            }}
          />
        )}
        {viewUser && (
          <UserCardModal
            key="user-card"
            user={viewUser}
            onClose={() => setViewUser(null)}
            onMessage={() => {
              void openConversationWith(viewUser);
              setViewUser(null);
            }}
          />
        )}
        {createKind && (
          <GroupCreateModal
            key="create"
            me={me}
            contacts={contacts}
            initialKind={createKind}
            onClose={() => setCreateKind(null)}
            onCreated={(id) => {
              setCreateKind(null);
              void loadConversations().then(() => setActiveId(id));
            }}
            notify={notify}
          />
        )}
        {discover && (
          <DiscoverModal
            key="discover"
            onClose={() => setDiscover(false)}
            onJoined={(id) => {
              void loadConversations();
              setActiveId(id);
            }}
            notify={notify}
          />
        )}
        {groupInfoId && (
          <GroupInfoModal
            key="group-info"
            me={me}
            conversationId={groupInfoId}
            callBusy={!!callCtl.session || !!callCtl.incoming || callCtl.starting}
            onClose={() => setGroupInfoId(null)}
            onCall={(media) => {
              setGroupInfoId(null);
              void callCtl.startCall(groupInfoId, media);
            }}
            onViewUser={(u) => setViewUser(u)}
            onLeft={() => {
              setGroupInfoId(null);
              setActiveId(null);
              void loadConversations();
            }}
            onChanged={() => void loadConversations()}
            notify={notify}
          />
        )}
        {storyComposer && (
          <StoryComposer
            key="story-composer"
            onClose={() => setStoryComposer(false)}
            notify={notify}
            onPublished={() => {
              setStoryComposer(false);
              void loadStories();
            }}
          />
        )}
        {storyViewer !== null && storyGroups[storyViewer] && (
          <StoryViewer
            key="story-viewer"
            me={me}
            groups={storyGroups}
            startGroupIndex={storyViewer}
            onClose={() => setStoryViewer(null)}
            onWatched={markWatched}
            onDeleted={removeStory}
            onViewUser={(u) => setViewUser(u)}
          />
        )}
      </AnimatePresence>

      {/* Звонок: окно / «динамический остров» / входящий — поверх всего */}
      <CallStage
        meId={me.id}
        session={callCtl.session}
        incoming={callCtl.incoming}
        muted={callCtl.muted}
        cameraOn={callCtl.cameraOn}
        screenSharing={callCtl.screenSharing}
        screenStreamRef={callCtl.screenStreamRef}
        seconds={callCtl.seconds}
        starting={callCtl.starting}
        minimized={callCtl.minimized}
        setMinimized={callCtl.setMinimized}
        streamTick={callCtl.streamTick}
        localStreamRef={callCtl.localStreamRef}
        remoteStreams={callCtl.remoteStreams}
        onAccept={callCtl.accept}
        onDecline={callCtl.decline}
        onDismissIncoming={callCtl.dismissIncoming}
        onLeave={callCtl.hangup}
        onEndForAll={() => callCtl.leave({ endForAll: true })}
        onToggleMute={callCtl.toggleMute}
        onToggleCamera={() => void callCtl.toggleCamera()}
        onToggleScreenShare={() => void callCtl.toggleScreenShare()}
        onCopyLink={callCtl.getShareLink}
        onInvite={callCtl.inviteUsers}
        onViewUser={(u) => setViewUser(u)}
        notify={notify}
      />

      {/* toasts */}
      <div className="pointer-events-none fixed bottom-6 left-1/2 z-[95] flex -translate-x-1/2 flex-col items-center gap-2">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 16, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.96 }}
              className="glass-strong flex items-center gap-2.5 rounded-2xl px-4.5 py-3 text-sm text-white/90 shadow-xl"
            >
              <CheckCircle2 className="h-4 w-4 text-violet-300" />
              {t.msg}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </main>
  );
}

function EmptyState({
  hasSpaces,
  onCreate,
}: {
  hasSpaces: boolean;
  onCreate: () => void;
}) {
  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center gap-5 text-center">
      <div className="relative">
        <div className="absolute inset-0 animate-ping rounded-full bg-violet-600/20 blur-2xl" />
        <div className="btn-gradient relative flex h-20 w-20 items-center justify-center rounded-[1.6rem]">
          <svg
            viewBox="0 0 24 24"
            className="h-9 w-9 text-white"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
          </svg>
        </div>
      </div>
      <div>
        <h2 className="font-display text-2xl font-bold text-white/90">Выберите чат</h2>
        <p className="mt-2 max-w-xs text-sm leading-relaxed text-white/40">
          {hasSpaces
            ? "Или создайте новую группу/канал и позовите людей — звонки там групповые"
            : "Найдите человека по @имени в поиске слева — или создайте группу кнопкой «+»"}
        </p>
      </div>
      <button
        onClick={onCreate}
        className="glass rounded-2xl px-5 py-3 text-sm font-medium text-white/80 transition-colors hover:text-white"
      >
        Создать группу
      </button>
    </div>
  );
}
