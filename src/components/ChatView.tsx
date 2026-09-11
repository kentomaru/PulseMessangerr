"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  Check,
  CheckCheck,
  Circle,
  FileText,
  Loader2,
  Mic,
  Square,
  MoreVertical,
  Palette,
  Paperclip,
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
import { parseAttachmentMessage } from "@/lib/message-content";
import type { AttachmentMessageContent } from "@/lib/message-content";
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

type PendingAttachment = {
  file: File;
  previewUrl: string | null;
};

type RecordingKind = "voice" | "voice-circle";

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
  const [pendingAttachment, setPendingAttachment] = useState<PendingAttachment | null>(null);
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState<RecordingKind | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, right: 16 });
  const [showWallpaper, setShowWallpaper] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingCancelledRef = useRef(false);
  const recordingStartedAtRef = useRef(0);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastTypingSent = useRef(0);
  const lastCount = useRef(0);
  const loadedRef = useRef(false);

  useEffect(() => {
    return () => {
      if (pendingAttachment?.previewUrl) URL.revokeObjectURL(pendingAttachment.previewUrl);
    };
  }, [pendingAttachment]);

  useEffect(() => {
    return () => {
      recordingCancelledRef.current = true;
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      recordingRefCleanup(recorderRef, recordingStreamRef);
    };
  }, []);

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

  const toggleMenu = () => {
    const button = menuButtonRef.current;
    if (button) {
      const rect = button.getBoundingClientRect();
      setMenuPosition({
        top: rect.bottom + 8,
        right: Math.max(12, window.innerWidth - rect.right),
      });
    }
    setMenuOpen((value) => !value);
  };

  const sendTyping = () => {
    const now = Date.now();
    if (now - lastTypingSent.current < 2_500) return;
    lastTypingSent.current = now;
    void api(`/api/conversations/${conversationId}/typing`, { method: "POST" }).catch(() => {});
  };

  const send = async () => {
    const caption = text.trim();
    if ((!caption && !pendingAttachment) || sending) return;
    setSending(true);

    try {
      if (pendingAttachment) {
        // Выбор файла только готовит вложение. Загрузка и создание сообщения
        // происходят здесь, после нажатия на общую кнопку «Отправить».
        const attachment = pendingAttachment;
        const url = await uploadFile(attachment.file);
        const type = attachment.file.type.startsWith("image/")
          ? "image"
          : attachment.file.type.startsWith("video/")
            ? "video"
            : "file";
        await api("/api/messages", {
          method: "POST",
          body: JSON.stringify({
            conversationId,
            type,
            content: url,
            caption,
            name: attachment.file.name,
            mimeType: attachment.file.type,
            size: attachment.file.size,
          }),
        });
        setPendingAttachment(null);
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

  const chooseAttachment = (file: File | null) => {
    if (!file) return;
    if (file.size > 500 * 1024 * 1024) {
      notify("Файл больше 500 МБ");
      return;
    }
    const previewUrl = file.type.startsWith("image/") || file.type.startsWith("video/")
      ? URL.createObjectURL(file)
      : null;
    setPendingAttachment({ file, previewUrl });
  };

  const removePendingAttachment = () => setPendingAttachment(null);

  const finishRecording = async (cancelled: boolean) => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    recordingCancelledRef.current = cancelled;
    if (recorder.state !== "inactive") recorder.stop();
  };

  const startRecording = async (kind: RecordingKind) => {
    if (recording || sending) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      notify("Браузер не поддерживает запись с микрофона");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: kind === "voice-circle" ? { facingMode: "user" } : false,
      });
      const candidates = kind === "voice-circle"
        ? ["video/webm;codecs=vp8,opus", "video/webm"]
        : ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
      const mimeType = candidates.find((value) => MediaRecorder.isTypeSupported(value));
      let recorder: MediaRecorder;
      try {
        recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      } catch {
        stream.getTracks().forEach((track) => track.stop());
        notify("Браузер не поддерживает этот формат записи");
        return;
      }

      recordingChunksRef.current = [];
      recordingCancelledRef.current = false;
      recordingStreamRef.current = stream;
      recorderRef.current = recorder;
      recordingStartedAtRef.current = Date.now();
      setRecordingSeconds(0);
      setRecording(kind);
      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds(Math.floor((Date.now() - recordingStartedAtRef.current) / 1000));
      }, 250);

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) recordingChunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        notify("Не удалось записать сообщение");
        void finishRecording(true);
      };
      recorder.onstop = () => {
        const duration = Math.max(1, Math.round((Date.now() - recordingStartedAtRef.current) / 1000));
        const wasCancelled = recordingCancelledRef.current;
        const chunks = recordingChunksRef.current;
        const actualMime = recorder.mimeType || mimeType || (kind === "voice-circle" ? "video/webm" : "audio/webm");
        recordingRefCleanup(recorderRef, recordingStreamRef);
        recordingChunksRef.current = [];
        if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
        setRecording(null);
        setRecordingSeconds(0);
        if (wasCancelled || chunks.length === 0) return;

        const extension = actualMime.includes("mp4") ? "mp4" : actualMime.includes("ogg") ? "ogg" : "webm";
        const file = new File(chunks, `message-${Date.now()}.${extension}`, { type: actualMime });
        void (async () => {
          setSending(true);
          try {
            const url = await uploadFile(file);
            await api("/api/messages", {
              method: "POST",
              body: JSON.stringify({
                conversationId,
                type: kind,
                content: url,
                name: kind === "voice-circle" ? "Видеосообщение" : "Голосовое сообщение",
                mimeType: actualMime,
                size: file.size,
                duration,
              }),
            });
            await load();
            refreshConversations();
          } catch (e) {
            notify(e instanceof Error ? e.message : "Не удалось отправить запись");
          } finally {
            setSending(false);
          }
        })();
      };
      recorder.start(250);
    } catch (e) {
      const error = e as DOMException;
      const message = error?.name === "NotAllowedError"
        ? "Разрешите доступ к микрофону в настройках браузера"
        : error?.name === "NotFoundError"
          ? "Микрофон не найден"
          : kind === "voice-circle"
            ? "Не удалось включить камеру и микрофон"
            : "Не удалось включить микрофон";
      notify(message);
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
              ref={menuButtonRef}
              type="button"
              aria-label="Открыть меню чата"
              aria-expanded={menuOpen}
              onClick={toggleMenu}
              className="glass flex h-10 w-10 items-center justify-center rounded-xl text-white/75 transition-colors hover:text-white"
            >
              <MoreVertical className="h-4.5 w-4.5" />
            </button>
          </div>
        </div>
      </div>

      {menuOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            <button
              type="button"
              aria-label="Закрыть меню"
              className="fixed inset-0 z-[999] cursor-default"
              onClick={() => setMenuOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.97 }}
              style={{ top: menuPosition.top, right: menuPosition.right }}
              className="glass-strong fixed z-[1000] w-52 overflow-hidden rounded-2xl p-1.5 shadow-2xl"
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
          </AnimatePresence>,
          document.body,
        )}

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
          {recording && (
            <div className="mb-2.5 flex items-center gap-3 rounded-2xl border border-rose-300/20 bg-rose-500/[0.08] p-2.5">
              <span className="flex min-w-0 flex-1 items-center gap-2 text-sm text-rose-100">
                <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-rose-300" />
                {recording === "voice-circle" ? "Записывается видеосообщение" : "Записывается голосовое"}
                <span className="text-white/45">{formatRecordingTime(recordingSeconds)}</span>
              </span>
              <button
                type="button"
                onClick={() => void finishRecording(true)}
                title="Отменить запись"
                className="rounded-xl p-2 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => void finishRecording(false)}
                title="Остановить и отправить"
                className="flex items-center gap-1.5 rounded-xl bg-rose-400/20 px-3 py-2 text-xs font-medium text-rose-100 transition-colors hover:bg-rose-400/30"
              >
                <Square className="h-3.5 w-3.5 fill-current" />
                Отправить
              </button>
            </div>
          )}
          {pendingAttachment && (
            <div className="mb-2.5 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-2.5">
              {pendingAttachment.previewUrl ? (
                pendingAttachment.file.type.startsWith("video/") ? (
                  <video
                    src={pendingAttachment.previewUrl}
                    muted
                    className="h-14 w-14 rounded-xl object-cover"
                  />
                ) : (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={pendingAttachment.previewUrl}
                    alt="Предпросмотр вложения"
                    className="h-14 w-14 rounded-xl object-cover"
                  />
                )
              ) : (
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white/60">
                  <FileText className="h-6 w-6" />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-white/80">{pendingAttachment.file.name}</p>
                <p className="truncate text-xs text-white/35">
                  {formatBytes(pendingAttachment.file.size)} · добавьте подпись и отправьте
                </p>
              </div>
              <button
                type="button"
                onClick={removePendingAttachment}
                title="Убрать вложение"
                className="rounded-xl p-2 text-white/45 transition-colors hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
          <div className="flex items-end gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={sending || Boolean(recording)}
              title="Прикрепить файл до 500 МБ"
              className="glass flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white/70 transition-colors hover:text-white disabled:opacity-50"
            >
              <Paperclip className="h-4.5 w-4.5" />
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="*/*"
              className="hidden"
              onChange={(e) => {
                chooseAttachment(e.target.files?.[0] ?? null);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => void startRecording("voice")}
              disabled={sending || Boolean(recording)}
              title="Записать голосовое"
              className="glass flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white/70 transition-colors hover:text-white disabled:opacity-50"
            >
              <Mic className="h-4.5 w-4.5" />
            </button>
            <button
              type="button"
              onClick={() => void startRecording("voice-circle")}
              disabled={sending || Boolean(recording)}
              title="Записать видеосообщение"
              className="glass flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white/70 transition-colors hover:text-white disabled:opacity-50"
            >
              <Circle className="h-4.5 w-4.5" />
            </button>
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
              disabled={Boolean(recording)}
              placeholder={pendingAttachment ? "Подпись к вложению…" : "Сообщение…"}
              className="ring-focus nice-scroll max-h-32 min-h-11 flex-1 resize-none rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-[15px] transition-all placeholder:text-white/30 disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => void send()}
              disabled={Boolean(recording) || (!text.trim() && !pendingAttachment) || sending}
              title="Отправить"
              className="btn-gradient flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white disabled:opacity-50"
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

  const attachmentType =
    message.type === "image" ||
    message.type === "video" ||
    message.type === "file" ||
    message.type === "voice" ||
    message.type === "voice-circle"
      ? message.type
      : null;
  const attachment = attachmentType ? parseAttachmentMessage(message.content) : null;

  return (
    <div className={`group flex items-center gap-1.5 py-0.5 ${own ? "justify-end" : "justify-start"}`}>
      {!own && <div className="w-1" />}
      <div className={`relative max-w-[78%] sm:max-w-[70%] ${own ? "order-1" : ""}`}>
        {attachment && attachmentType ? (
          <AttachmentBubble
            type={attachmentType}
            attachment={attachment}
            own={own}
            onOpenImage={onOpenImage}
          />
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

type AttachmentType = "image" | "video" | "file" | "voice" | "voice-circle";

function AttachmentBubble({
  type,
  attachment,
  own,
  onOpenImage,
}: {
  type: AttachmentType;
  attachment: AttachmentMessageContent;
  own: boolean;
  onOpenImage: (url: string) => void;
}) {
  const shell = `overflow-hidden rounded-3xl ring-1 ring-white/10 ${own ? "bubble-own" : "bubble-peer"}`;
  const caption = attachment.caption ? (
    <p className="px-4 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap break-words text-white">
      {attachment.caption}
    </p>
  ) : null;

  if (type === "image") {
    return (
      <div className={shell}>
        <button
          type="button"
          onClick={() => onOpenImage(attachment.url)}
          className="block w-full overflow-hidden transition-transform hover:scale-[1.01]"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={attachment.url}
            alt={attachment.caption || "Фото"}
            className="max-h-80 w-full max-w-xs object-cover"
            draggable={false}
          />
        </button>
        {caption}
      </div>
    );
  }

  if (type === "video") {
    return (
      <div className={`${shell} max-w-xs`}>
        <video
          src={attachment.url}
          controls
          playsInline
          preload="metadata"
          className="max-h-80 w-full object-contain"
        />
        {(attachment.name !== "Файл" || caption) && (
          <p className="px-4 pt-2.5 text-xs text-white/55">{attachment.name}</p>
        )}
        {caption}
      </div>
    );
  }

  if (type === "voice" || type === "voice-circle") {
    return (
      <div className={`${shell} ${type === "voice-circle" ? "rounded-[50%] p-1" : "p-3"}`}>
        {type === "voice-circle" ? (
          <video
            src={attachment.url}
            controls
            playsInline
            preload="metadata"
            className="aspect-square w-48 rounded-[50%] object-cover"
          />
        ) : (
          <audio src={attachment.url} controls preload="metadata" className="max-w-[min(18rem,70vw)]" />
        )}
        {attachment.duration ? (
          <p className="px-2 pt-1 text-center text-[11px] text-white/45">
            {formatRecordingTime(attachment.duration)}
          </p>
        ) : null}
        {caption}
      </div>
    );
  }

  return (
    <div className={`${shell} flex min-w-52 items-center gap-3 px-4 py-3`}>
      <FileText className="h-7 w-7 shrink-0 text-white/65" />
      <div className="min-w-0">
        <a
          href={attachment.url}
          download={attachment.name}
          className="block truncate text-sm font-medium text-white underline decoration-white/20 underline-offset-4 hover:decoration-white/70"
        >
          {attachment.name}
        </a>
        {attachment.size > 0 && <p className="text-xs text-white/40">{formatBytes(attachment.size)}</p>}
        {caption}
      </div>
    </div>
  );
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} Б`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} КБ`;
  if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} МБ`;
  return `${(value / (1024 * 1024 * 1024)).toFixed(1)} ГБ`;
}

function formatRecordingTime(value: number) {
  const minutes = Math.floor(value / 60).toString().padStart(2, "0");
  const seconds = Math.max(0, value % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function recordingRefCleanup(
  recorderRef: { current: MediaRecorder | null },
  streamRef: { current: MediaStream | null },
) {
  const recorder = recorderRef.current;
  if (recorder && recorder.state !== "inactive") recorder.stop();
  recorderRef.current = null;
  streamRef.current?.getTracks().forEach((track) => track.stop());
  streamRef.current = null;
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
