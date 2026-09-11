"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  Check,
  CheckCheck,
  ImagePlus,
  Loader2,
  MoreVertical,
  Palette,
  Phone,
  PhoneIncoming,
  PhoneMissed,
  PhoneOutgoing,
  Send,
  Trash2,
  UserRound,
  Video,
  X,
} from "lucide-react";
import Avatar from "./Avatar";
import WallpaperModal from "./WallpaperModal";
import { api } from "@/lib/api";
import {
  callLogLabel,
  dayLabel,
  formatDuration,
  lastSeenLabel,
  parseCallContent,
  sameDay,
  timeHHmm,
} from "@/lib/format";
import { wallpaperStyle } from "@/lib/wallpapers";
import type { CallMedia, ChatMessage, Peer, PublicUser } from "@/lib/types";

type Props = {
  me: PublicUser;
  conversationId: string;
  peer: Peer;
  onBack: () => void;
  onCall: (media: CallMedia) => void;
  onViewPeer: () => void;
  callBusy: boolean;
  refreshConversations: () => void;
  notify: (msg: string) => void;
};

export default function ChatView({
  me,
  conversationId,
  peer,
  onBack,
  onCall,
  onViewPeer,
  callBusy,
  refreshConversations,
  notify,
}: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [peerState, setPeerState] = useState<Peer>(peer);
  const [wallpaper, setWallpaper] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showWallpaper, setShowWallpaper] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const lastTypingSent = useRef(0);
  const lastCount = useRef(0);

  const load = useCallback(async () => {
    try {
      const d = await api<{
        messages: ChatMessage[];
        peer: Peer | null;
        wallpaper: string | null;
      }>(`/api/messages?conversationId=${conversationId}`);
      setMessages(d.messages);
      if (d.peer) setPeerState(d.peer);
      setWallpaper(d.wallpaper);
      if (!loaded) {
        setLoaded(true);
        requestAnimationFrame(() =>
          scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }),
        );
      } else if (d.messages.length !== lastCount.current) {
        // автоскролл при новых сообщениях
        requestAnimationFrame(() => {
          const el = scrollRef.current;
          if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
        });
      }
      lastCount.current = d.messages.length;
    } catch {
      /* сеть моргнула — следующий опрос поправит */
    }
  }, [conversationId, loaded]);

  useEffect(() => {
    setLoaded(false);
    lastCount.current = 0;
    void load();
    const t = setInterval(() => void load(), 2_500);
    return () => clearInterval(t);
  }, [load]);

  const sendTyping = () => {
    const now = Date.now();
    if (now - lastTypingSent.current < 2_500) return;
    lastTypingSent.current = now;
    void api(`/api/conversations/${conversationId}/typing`, { method: "POST" }).catch(() => {});
  };

  const send = async () => {
    const content = text.trim();
    if (!content || sending) return;
    setSending(true);
    setText("");
    try {
      await api("/api/messages", {
        method: "POST",
        body: JSON.stringify({ conversationId, type: "text", content }),
      });
      await load();
      refreshConversations();
    } catch (e) {
      setText(content);
      notify(e instanceof Error ? e.message : "Не удалось отправить");
    } finally {
      setSending(false);
    }
  };

  const sendImage = async (file: File | null) => {
    if (!file) return;
    setUploading(true);
    try {
      const { uploadFile } = await import("@/lib/api");
      const url = await uploadFile(file);
      await api("/api/messages", {
        method: "POST",
        body: JSON.stringify({ conversationId, type: "image", content: url }),
      });
      await load();
      refreshConversations();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Не удалось отправить фото");
    } finally {
      setUploading(false);
    }
  };

  const removeMessage = async (id: string) => {
    try {
      await api(`/api/messages/${id}`, { method: "DELETE" });
      setMessages((ms) => ms.map((m) => (m.id === id ? { ...m, deletedAt: new Date().toISOString() } : m)));
      refreshConversations();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Не удалось удалить");
    }
  };

  const peerTyping =
    peerState.typingAt && Date.now() - new Date(peerState.typingAt).getTime() < 4_500;

  const readUpTo = peerState.lastReadAt ? new Date(peerState.lastReadAt).getTime() : 0;

  return (
    <div className="relative flex h-full min-w-0 flex-1 flex-col">
      {/* Обои */}
      <div
        className="pointer-events-none absolute inset-0"
        style={wallpaperStyle(wallpaper)}
        aria-hidden
      />
      {wallpaper?.startsWith("/api/files/") && (
        <div className="pointer-events-none absolute inset-0 bg-[#0a0a14]/70" aria-hidden />
      )}

      {/* Шапка */}
      <div className="glass-strong relative z-10 flex items-center gap-3 border-b border-white/8 px-4 py-3">
        <button
          onClick={onBack}
          className="glass flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white/70 md:hidden"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <button onClick={onViewPeer} className="flex min-w-0 items-center gap-3 text-left">
          <Avatar
            name={peerState.displayName}
            src={peerState.avatarUrl}
            size={42}
            online={peerState.online}
          />
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold">{peerState.displayName}</p>
            <p
              className={`truncate text-xs ${
                peerTyping
                  ? "text-violet-300"
                  : peerState.online
                    ? "text-emerald-400"
                    : "text-white/35"
              }`}
            >
              {peerTyping ? (
                <span className="inline-flex items-center gap-1">
                  печатает
                  <span className="typing-dot inline-block h-1 w-1 rounded-full bg-violet-300" />
                  <span
                    className="typing-dot inline-block h-1 w-1 rounded-full bg-violet-300"
                    style={{ animationDelay: "0.15s" }}
                  />
                  <span
                    className="typing-dot inline-block h-1 w-1 rounded-full bg-violet-300"
                    style={{ animationDelay: "0.3s" }}
                  />
                </span>
              ) : (
                lastSeenLabel(peerState.lastSeenAt, peerState.online)
              )}
            </p>
          </div>
        </button>

        <div className="ml-auto flex items-center gap-1.5">
          <button
            onClick={() => onCall("audio")}
            disabled={callBusy}
            title="Аудиозвонок"
            className="glass flex h-10 w-10 items-center justify-center rounded-xl text-white/75 transition-colors hover:text-white disabled:opacity-40"
          >
            <Phone className="h-4.5 w-4.5" />
          </button>
          <button
            onClick={() => onCall("video")}
            disabled={callBusy}
            title="Видеозвонок"
            className="glass flex h-10 w-10 items-center justify-center rounded-xl text-white/75 transition-colors hover:text-white disabled:opacity-40"
          >
            <Video className="h-4.5 w-4.5" />
          </button>
          <div className="relative">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="glass flex h-10 w-10 items-center justify-center rounded-xl text-white/75 transition-colors hover:text-white"
            >
              <MoreVertical className="h-4.5 w-4.5" />
            </button>
            <AnimatePresence>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-20" onClick={() => setMenuOpen(false)} />
                  <motion.div
                    initial={{ opacity: 0, y: -6, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.97 }}
                    className="glass-strong absolute right-0 z-30 mt-2 w-52 overflow-hidden rounded-2xl p-1.5 shadow-2xl"
                  >
                    <MenuItem
                      icon={<Palette className="h-4 w-4" />}
                      label="Обои чата"
                      onClick={() => {
                        setMenuOpen(false);
                        setShowWallpaper(true);
                      }}
                    />
                    <MenuItem
                      icon={<UserRound className="h-4 w-4" />}
                      label="Профиль"
                      onClick={() => {
                        setMenuOpen(false);
                        onViewPeer();
                      }}
                    />
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Сообщения */}
      <div ref={scrollRef} className="nice-scroll relative z-10 min-h-0 flex-1 overflow-y-auto px-4 py-5">
        {!loaded ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-white/30" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <Avatar name={peerState.displayName} src={peerState.avatarUrl} size={72} />
            <p className="font-display text-lg font-bold">{peerState.displayName}</p>
            <p className="max-w-xs text-sm leading-relaxed text-white/40">
              Здесь пока пусто. Напишите первое сообщение — или позвоните 👋
            </p>
          </div>
        ) : (
          <div className="mx-auto flex max-w-2xl flex-col gap-0.5">
            {messages.map((m, i) => {
              const prev = messages[i - 1];
              const showDay = !prev || !sameDay(prev.createdAt, m.createdAt);
              const own = m.senderId === me.id;
              return (
                <div key={m.id}>
                  {showDay && (
                    <div className="flex justify-center py-4">
                      <span className="glass rounded-full px-3.5 py-1.5 text-[11px] font-medium text-white/50">
                        {dayLabel(m.createdAt)}
                      </span>
                    </div>
                  )}
                  {m.type === "call" ? (
                    <CallLogBubble message={m} meId={me.id} />
                  ) : (
                    <MessageBubble
                      message={m}
                      own={own}
                      read={own && new Date(m.createdAt).getTime() <= readUpTo}
                      onOpenImage={setLightbox}
                      onDelete={() => void removeMessage(m.id)}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Поле ввода */}
      <div className="glass-strong relative z-10 border-t border-white/8 px-4 py-3">
        <div className="mx-auto flex max-w-2xl items-end gap-2.5">
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            title="Отправить фото"
            className="glass flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white/70 transition-colors hover:text-white disabled:opacity-50"
          >
            {uploading ? <Loader2 className="h-4.5 w-4.5 animate-spin" /> : <ImagePlus className="h-4.5 w-4.5" />}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={(e) => {
              void sendImage(e.target.files?.[0] ?? null);
              e.target.value = "";
            }}
          />
          <textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              sendTyping();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            rows={1}
            maxLength={4000}
            placeholder="Сообщение…"
            className="ring-focus nice-scroll max-h-32 min-h-11 flex-1 resize-none rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-[15px] transition-all placeholder:text-white/30"
          />
          <button
            onClick={() => void send()}
            disabled={!text.trim() || sending}
            title="Отправить"
            className="btn-gradient flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white"
          >
            {sending ? <Loader2 className="h-4.5 w-4.5 animate-spin" /> : <Send className="h-4.5 w-4.5" />}
          </button>
        </div>
      </div>

      {/* Модалки */}
      <AnimatePresence>
        {showWallpaper && (
          <WallpaperModal
            conversationId={conversationId}
            current={wallpaper}
            onClose={() => setShowWallpaper(false)}
            onSaved={(w) => {
              setWallpaper(w);
              setShowWallpaper(false);
            }}
            notify={notify}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {lightbox && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setLightbox(null)}
            className="fixed inset-0 z-[75] flex items-center justify-center bg-black/90 p-6 backdrop-blur-sm"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={lightbox}
              alt="Фото"
              className="max-h-full max-w-full rounded-2xl object-contain shadow-2xl"
            />
            <button className="absolute top-5 right-5 rounded-full bg-white/10 p-2.5 text-white/80">
              <X className="h-5 w-5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-white/80 transition-colors hover:bg-white/8 hover:text-white"
    >
      {icon}
      {label}
    </button>
  );
}

function MessageBubble({
  message,
  own,
  read,
  onOpenImage,
  onDelete,
}: {
  message: ChatMessage;
  own: boolean;
  read: boolean;
  onOpenImage: (url: string) => void;
  onDelete: () => void;
}) {
  if (message.deletedAt) {
    return (
      <div className={`flex ${own ? "justify-end" : "justify-start"} py-0.5`}>
        <div className="flex items-center gap-2 rounded-2xl border border-dashed border-white/12 px-3.5 py-2 text-[13px] italic text-white/35">
          <Trash2 className="h-3 w-3" />
          Сообщение удалено
        </div>
      </div>
    );
  }

  return (
    <div className={`group flex items-center gap-1.5 py-0.5 ${own ? "justify-end" : "justify-start"}`}>
      {!own && <div className="w-1" />}
      <div className={`relative max-w-[78%] sm:max-w-[70%] ${own ? "order-1" : ""}`}>
        {message.type === "image" ? (
          <button
            onClick={() => onOpenImage(message.content)}
            className="block overflow-hidden rounded-3xl ring-1 ring-white/10 transition-transform hover:scale-[1.01]"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={message.content}
              alt="Фото"
              className="max-h-80 w-full max-w-xs object-cover"
              draggable={false}
            />
          </button>
        ) : (
          <div
            className={`rounded-3xl px-4 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap break-words ${
              own ? "bubble-own text-white" : "bubble-peer text-white/90"
            } ${own ? "rounded-br-lg" : "rounded-bl-lg"}`}
          >
            {message.content}
          </div>
        )}
        <div
          className={`mt-1 flex items-center gap-1 text-[10px] text-white/30 ${own ? "justify-end" : ""}`}
        >
          <span>{timeHHmm(message.createdAt)}</span>
          {own &&
            (read ? (
              <CheckCheck className="h-3.5 w-3.5 text-cyan-300" />
            ) : (
              <Check className="h-3.5 w-3.5" />
            ))}
        </div>
      </div>

      {own && !message.deletedAt && (
        <button
          onClick={onDelete}
          title="Удалить"
          className="opacity-0 transition-opacity group-hover:opacity-100"
        >
          <Trash2 className="h-3.5 w-3.5 text-white/30 hover:text-rose-300" />
        </button>
      )}
    </div>
  );
}

function CallLogBubble({ message, meId }: { message: ChatMessage; meId: string }) {
  const info = parseCallContent(message.content);
  if (!info) return null;

  const mineOutgoing = info.callerId === meId;
  const missed = info.status === "missed" || info.status === "declined" || info.status === "cancelled";

  const icon =
    info.status === "missed" ? (
      <PhoneMissed className="h-4 w-4" />
    ) : mineOutgoing ? (
      <PhoneOutgoing className="h-4 w-4" />
    ) : (
      <PhoneIncoming className="h-4 w-4" />
    );

  return (
    <div className="flex justify-center py-1.5">
      <div
        className={`glass flex items-center gap-2.5 rounded-full px-4 py-2 text-[13px] ${
          missed ? "text-rose-300" : "text-emerald-300"
        }`}
      >
        {icon}
        <span className="text-white/80">{callLogLabel(info)}</span>
        {info.durationSec > 0 && (
          <span className="text-white/40">· {formatDuration(info.durationSec)}</span>
        )}
        <span className="text-white/25">{timeHHmm(message.createdAt)}</span>
        {info.media === "video" && <Video className="h-3.5 w-3.5 text-white/35" />}
      </div>
    </div>
  );
}
