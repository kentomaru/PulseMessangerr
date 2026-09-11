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
import { api, ApiError, uploadFile } from "@/lib/api";
import { parseImageMessage } from "@/lib/message-content";
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

type PendingImage = {
  file: File;
  previewUrl: string;
};

type Props = {
  me: PublicUser;
  conversationId: string;
  peer: Peer;
  onBack: () => void;
  onCall: (media: CallMedia, peer: Peer) => void;
  onViewPeer: (peer: Peer) => void;
  callBusy: boolean;
  refreshConversations: () => void;
  notify: (msg: string) => void;
  onUnauthorized: () => void;
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
  onUnauthorized,
}: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [peerState, setPeerState] = useState<Peer>(peer);
  const [wallpaper, setWallpaper] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [pendingImage, setPendingImage] = useState<PendingImage | null>(null);
  const [sending, setSending] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showWallpaper, setShowWallpaper] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const lastTypingSent = useRef(0);
  const lastCount = useRef(0);
  const loadedRef = useRef(false);

  useEffect(() => {
    return () => {
      if (pendingImage) URL.revokeObjectURL(pendingImage.previewUrl);
    };
  }, [pendingImage]);

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
      if (!loadedRef.current) {
        loadedRef.current = true;
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
    } catch (e) {
      // 401 — сессия кончилась (например, аккаунт удалён): уводим на экран входа.
      if (e instanceof ApiError && e.status === 401) onUnauthorized();
      /* иначе сеть моргнула — следующий опрос поправит */
    }
    // ВАЖНО: зависимость только от conversationId. Если сюда попадёт `loaded`,
    // функция load пересоздаётся после первой загрузки → эффект ниже
    // перезапускается и сбрасывает состояние — чат «перезагружается» в цикле.
  }, [conversationId, onUnauthorized]);

  useEffect(() => {
    loadedRef.current = false;
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
    const caption = text.trim();
    if ((!caption && !pendingImage) || sending) return;
    setSending(true);

    try {
      if (pendingImage) {
        // Выбор файла только готовит вложение. Загрузка и создание сообщения
        // происходят здесь, после нажатия на общую кнопку «Отправить».
        const url = await uploadFile(pendingImage.file);
        await api("/api/messages", {
          method: "POST",
          body: JSON.stringify({
            conversationId,
            type: "image",
            content: url,
            caption,
          }),
        });
        setPendingImage(null);
        setText("");
      } else {
        await api("/api/messages", {
          method: "POST",
          body: JSON.stringify({ conversationId, type: "text", content: caption }),
        });
        setText("");
      }
      await load();
      refreshConversations();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Не удалось отправить");
    } finally {
      setSending(false);
    }
  };

  const chooseImage = (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      notify("Можно прикреплять только изображения");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      notify("Файл больше 10 МБ");
      return;
    }
    setPendingImage({ file, previewUrl: URL.createObjectURL(file) });
  };

  const removePendingImage = () => setPendingImage(null);

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
        <button type="button" onClick={() => onViewPeer(peerState)} className="flex min-w-0 items-center gap-3 text-left">
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
            type="button"
            onClick={() => onCall("audio", peerState)}
            disabled={callBusy}
            title="Аудиозвонок"
            className="glass flex h-10 w-10 items-center justify-center rounded-xl text-white/75 transition-colors hover:text-white disabled:opacity-40"
          >
            <Phone className="h-4.5 w-4.5" />
          </button>
          <button
            type="button"
            onClick={() => onCall("video", peerState)}
            disabled={callBusy}
            title="Видеозвонок"
            className="glass flex h-10 w-10 items-center justify-center rounded-xl text-white/75 transition-colors hover:text-white disabled:opacity-40"
          >
            <Video className="h-4.5 w-4.5" />
          </button>
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="glass flex h-10 w-10 items-center justify-center rounded-xl text-white/75 transition-colors hover:text-white"
            >
              <MoreVertical className="h-4.5 w-4.5" />
            </button>
            <AnimatePresence>
              {menuOpen && (
                <>
                  <button
                    type="button"
                    aria-label="Закрыть меню"
                    className="fixed inset-0 z-[70] cursor-default"
                    onClick={() => setMenuOpen(false)}
                  />
                  <motion.div
                    initial={{ opacity: 0, y: -6, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.97 }}
                    className="glass-strong absolute right-0 z-[80] mt-2 w-52 overflow-hidden rounded-2xl p-1.5 shadow-2xl"
                    onClick={(event) => event.stopPropagation()}
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
                        onViewPeer(peerState);
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
        <div className="mx-auto max-w-2xl">
          {pendingImage && (
            <div className="mb-2.5 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={pendingImage.previewUrl}
                alt="Прикреплённое фото"
                className="h-14 w-14 rounded-xl object-cover"
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-white/80">Фото прикреплено</p>
                <p className="truncate text-xs text-white/35">
                  Добавьте подпись и нажмите «Отправить»
                </p>
              </div>
              <button
                type="button"
                onClick={removePendingImage}
                title="Убрать фото"
                className="rounded-xl p-2 text-white/45 transition-colors hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
          <div className="flex items-end gap-2.5">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={sending}
              title="Прикрепить фото"
              className="glass flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white/70 transition-colors hover:text-white disabled:opacity-50"
            >
              <ImagePlus className="h-4.5 w-4.5" />
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={(e) => {
                chooseImage(e.target.files?.[0] ?? null);
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
              placeholder={pendingImage ? "Подпись к фото…" : "Сообщение…"}
              className="ring-focus nice-scroll max-h-32 min-h-11 flex-1 resize-none rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-[15px] transition-all placeholder:text-white/30"
            />
            <button
              type="button"
              onClick={() => void send()}
              disabled={(!text.trim() && !pendingImage) || sending}
              title="Отправить"
              className="btn-gradient flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white"
            >
              {sending ? <Loader2 className="h-4.5 w-4.5 animate-spin" /> : <Send className="h-4.5 w-4.5" />}
            </button>
          </div>
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
      type="button"
      onClick={onClick}
      className="relative z-[81] flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-white/80 transition-colors hover:bg-white/8 hover:text-white"
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

  const image = message.type === "image" ? parseImageMessage(message.content) : null;

  return (
    <div className={`group flex items-center gap-1.5 py-0.5 ${own ? "justify-end" : "justify-start"}`}>
      {!own && <div className="w-1" />}
      <div className={`relative max-w-[78%] sm:max-w-[70%] ${own ? "order-1" : ""}`}>
        {image ? (
          <div
            className={`overflow-hidden rounded-3xl ring-1 ring-white/10 ${
              own ? "bubble-own" : "bubble-peer"
            }`}
          >
            <button
              type="button"
              onClick={() => onOpenImage(image.url)}
              className="block w-full overflow-hidden transition-transform hover:scale-[1.01]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={image.url}
                alt="Фото"
                className="max-h-80 w-full max-w-xs object-cover"
                draggable={false}
              />
            </button>
            {image.caption && (
              <p className="px-4 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap break-words text-white">
                {image.caption}
              </p>
            )}
          </div>
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
