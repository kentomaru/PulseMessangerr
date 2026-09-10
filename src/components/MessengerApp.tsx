"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { api } from "@/lib/api";
import type { ConversationListItem, PublicUser } from "@/lib/types";
import { useCallController } from "@/lib/useCallController";
import Sidebar from "./Sidebar";
import ChatView from "./ChatView";
import ProfileModal from "./ProfileModal";
import UserCardModal from "./UserCardModal";
import CallOverlay from "./CallOverlay";
import { CheckCircle2 } from "lucide-react";

type Toast = { id: number; msg: string };

export default function MessengerApp({ me: initialMe }: { me: PublicUser }) {
  const [me, setMe] = useState(initialMe);
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [viewUser, setViewUser] = useState<PublicUser | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);

  const notify = useCallback((msg: string) => {
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, msg }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3800);
  }, []);

  const callCtl = useCallController(notify);

  const loadConversations = useCallback(async () => {
    try {
      const d = await api<{ conversations: ConversationListItem[] }>("/api/conversations");
      setConversations(d.conversations);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void loadConversations();
    const t = setInterval(loadConversations, 4000);
    return () => clearInterval(t);
  }, [loadConversations]);

  const activeConv = conversations.find((c) => c.id === activeId) ?? null;

  const openConversationWith = useCallback(
    async (user: PublicUser) => {
      try {
        const d = await api<{ conversation: { id: string; peer: PublicUser } }>(
          "/api/conversations",
          { method: "POST", body: JSON.stringify({ userId: user.id }) },
        );
        setActiveId(d.conversation.id);
        await loadConversations();
      } catch (e) {
        notify(e instanceof Error ? e.message : "Не удалось открыть чат");
      }
    },
    [loadConversations, notify],
  );

  const logout = useCallback(async () => {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } finally {
      window.location.reload();
    }
  }, []);

  // jump to the chat behind an incoming call
  useEffect(() => {
    if (callCtl.incoming) setActiveId(callCtl.incoming.conversationId);
  }, [callCtl.incoming]);

  return (
    <main className="relative z-10 flex h-dvh overflow-hidden">
      <div className={`${activeId ? "hidden md:flex" : "flex"} w-full shrink-0 md:w-[380px]`}>
        <Sidebar
          me={me}
          conversations={conversations}
          activeId={activeId}
          onSelect={setActiveId}
          onOpenProfile={() => setShowProfile(true)}
          onOpenChat={openConversationWith}
          onLogout={logout}
        />
      </div>

      <div className={`${activeId ? "flex" : "hidden md:flex"} min-w-0 flex-1`}>
        {activeConv ? (
          <ChatView
            key={activeConv.id}
            me={me}
            conversationId={activeConv.id}
            peer={activeConv.peer}
            onBack={() => setActiveId(null)}
            onCall={() => callCtl.startCall(activeConv.id, activeConv.peer)}
            onViewPeer={() => setViewUser(activeConv.peer)}
            callBusy={!!callCtl.call}
            refreshConversations={loadConversations}
          />
        ) : (
          <EmptyState />
        )}
      </div>

      <AnimatePresence>
        {showProfile && (
          <ProfileModal
            me={me}
            onClose={() => setShowProfile(false)}
            onSaved={(u: PublicUser) => {
              setMe(u);
              setShowProfile(false);
              void loadConversations();
              notify("Профиль обновлён");
            }}
          />
        )}
        {viewUser && (
          <UserCardModal
            user={viewUser}
            onClose={() => setViewUser(null)}
            onMessage={() => {
              void openConversationWith(viewUser);
              setViewUser(null);
            }}
          />
        )}
        {(callCtl.call || callCtl.incoming) && (
          <CallOverlay
            call={callCtl.call}
            incoming={callCtl.incoming}
            muted={callCtl.muted}
            seconds={callCtl.seconds}
            onAccept={callCtl.accept}
            onDecline={callCtl.decline}
            onHangup={callCtl.hangup}
            onToggleMute={callCtl.toggleMute}
          />
        )}
      </AnimatePresence>

      {/* toasts */}
      <div className="pointer-events-none fixed bottom-6 left-1/2 z-[90] flex -translate-x-1/2 flex-col items-center gap-2">
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

function EmptyState() {
  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center gap-5 text-center">
      <div className="relative">
        <div className="absolute inset-0 animate-ping rounded-full bg-violet-600/20 blur-2xl" />
        <div className="btn-gradient relative flex h-20 w-20 items-center justify-center rounded-[1.6rem]">
          <svg viewBox="0 0 24 24" className="h-9 w-9 text-white" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
          </svg>
        </div>
      </div>
      <div>
        <h2 className="font-display text-2xl font-bold text-white/90">Выберите чат</h2>
        <p className="mt-2 max-w-xs text-sm leading-relaxed text-white/40">
          Или найдите человека по имени пользователя в поиске слева и начните общение
        </p>
      </div>
    </div>
  );
}
