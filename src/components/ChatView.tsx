"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  Check,
  CheckCheck,
  ImagePlus,
  Loader2,
  Phone,
  PhoneIncoming,
  PhoneMissed,
  PhoneOutgoing,
  Send,
  Trash2,
  X,
} from "lucide-react";
import Avatar from "./Avatar";
import { api, uploadFile } from "@/lib/api";
import type { ChatMessage, Peer, PublicUser } from "@/lib/types";
import { dayLabel, formatDuration, lastSeenLabel, sameDay, timeHHmm } from "@/lib/format";

type Props = {
  me: PublicUser;
  conversationId: string;
  peer: Peer;
  onBack: () => void;
  onCall: () => void;
  onViewPeer: () => void;
  callBusy: boolean;
  refreshConversations: () => void;
};

type MessagesResponse = {
  messages: ChatMessage[];
  peer: (Peer & { lastReadAt: string }) | null;
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
}: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [peerReadAt, setPeerReadAt] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [pendingImage, setPendingImage] = useState<{ file: File; url: string } | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const stickToBottom = useRef(true);
  const firstLoad = useRef(true);

  const scrollToBottom = useCallback((smooth = false) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, []);

  const load = useCallback(async () => {
    try {
      const d = await api<MessagesResponse>(`/api/messages?conversationId=${conversationId}`);
      setMessages((prev) => {
        if (
          prev.length === d.messages.length &&
          prev[prev.length - 1]?.id === d.messages[d.messages.length - 1]?.id
        ) {
          return prev;
        }
        return d.messages;
      });
      if (d.peer?.lastReadAt) setPeerReadAt(d.peer.lastReadAt);
      if (firstLoad.current) {
        firstLoad.current = false;
        setLoaded(true);
        requestAnimationFrame(() => scrollToBottom());
      } else if (stickToBottom.current) {
        requestAnimationFrame(() => scrollToBottom(true));
      }
    } catch {
      /* keep trying */
    }
  }, [conversationId, scrollToBottom]);

  useEffect(() => {
    void load();
    const t = setInterval(load, 2200);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    // instant conversations refresh so unread counters clear
    refreshConversations();
  }, [messages.length, refreshConversations]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  };

  const send = async () => {
    const text = draft.trim();
    if ((!text && !pendingImage) || sending) return;
    setSending(true);
    stickToBottom.current = true;
    try {
      if (pendingImage) {
        const url = await uploadFile(pendingImage.file);
        await api("/api/messages", {
          method: "POST",
          body: JSON.stringify({ conversationId, type: "image", content: url }),
        });
        URL.revokeObjectURL(pendingImage.url);
        setPendingImage(null);
      }
      if (text) {
        await api("/api/messages", {
          method: "POST",
          body: JSON.stringify({ conversationId, type: "text", content: text }),
        });
      }
      setDraft("");
      await load();
      scrollToBottom(true);
      inputRef.current?.focus();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Не удалось отправить");
    } finally {
      setSending(false);
    }
  };

  const removeMessage = async (id: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== id));
    try {
      await api(`/api/messages/${id}`, { method: "DELETE" });
      void load();
    } catch {
      /* noop */
    }
  };

  const pickImage = (file: File | null) => {
    if (!file) return;
    setPendingImage({ file, url: URL.createObjectURL(file) });
  };

  const lastMineIdx = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].senderId === me.id && messages[i].type !== "call") return i;
    }
    return -1;
  })();

  return (
    <section className="relative flex h-full w-full flex-col">
      {/* header */}
      <header className="glass flex shrink-0 items-center gap-3 border-x-0 border-t-0 px-4 py-3.5 sm:px-6">
        <button
          onClick={onBack}
          className="rounded-xl p-2 text-white/50 transition-colors hover:bg-white/5 hover:text-white md:hidden"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <button onClick={onViewPeer} className="flex min-w-0 flex-1 items-center gap-3.5 text-left">
          <Avatar name={peer.displayName} src={peer.avatarUrl} size={44} online={peer.online} />
          <div className="min-w-0">
            <p className="truncate font-display text-[15px] font-semibold">{peer.displayName}</p>
            <p className={`truncate text-xs ${peer.online ? "text-emerald-400/80" : "text-white/35"}`}>
              {lastSeenLabel(peer.lastSeenAt, peer.online)}
            </p>
          </div>
        </button>
        <button
          onClick={onCall}
          disabled={callBusy}
          title="Позвонить"
          className="btn-gradient grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-white disabled:cursor-not-allowed"
        >
          <Phone className="h-[18px] w-[18px]" />
        </button>
      </header>

      {/* messages */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="nice-scroll flex-1 space-y-1 overflow-y-auto px-4 py-6 sm:px-8"
      >
        {!loaded && (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-violet-400" />
          </div>
        )}
        {loaded && messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <Avatar name={peer.displayName} src={peer.avatarUrl} size={84} />
            <div>
              <p className="font-display text-lg font-semibold">{peer.displayName}</p>
              <p className="mt-1 text-sm text-white/35">Здесь пока тихо. Напишите первое сообщение!</p>
            </div>
          </div>
        )}
        {messages.map((m, i) => {
          const prev = messages[i - 1];
          const showDay = !prev || !sameDay(prev.createdAt, m.createdAt);
          const mine = m.senderId === me.id;
          const isLastMine = i === lastMineIdx;
          const read =
            isLastMine && peerReadAt
              ? new Date(peerReadAt).getTime() >= new Date(m.createdAt).getTime()
              : false;

          if (m.type === "call") {
            return (
              <div key={m.id}>
                {showDay && <DaySeparator iso={m.createdAt} />}
                <CallLogBubble message={m} meId={me.id} />
              </div>
            );
          }

          const closeToPrev =
            prev &&
            prev.type !== "call" &&
            prev.senderId === m.senderId &&
            new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60_000;

          return (
            <div key={m.id}>
              {showDay && <DaySeparator iso={m.createdAt} />}
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.22 }}
                className={`group flex ${mine ? "justify-end" : "justify-start"} ${
                  closeToPrev ? "mt-0.5" : "mt-3"
                }`}
              >
                {mine && (
                  <button
                    onClick={() => removeMessage(m.id)}
                    title="Удалить"
                    className="mr-2 self-center rounded-lg p-1.5 text-white/0 transition-all group-hover:text-white/35 hover:!text-rose-400"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
                <div
                  className={`max-w-[78%] rounded-2xl px-4 py-2.5 sm:max-w-[65%] ${
                    mine ? "bubble-mine" : "bubble-theirs"
                  }`}
                >
                  {m.type === "image" ? (
                    <button onClick={() => setLightbox(m.content)} className="block">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={m.content}
                        alt="Фото"
                        className="max-h-72 w-auto rounded-xl object-cover"
                        draggable={false}
                      />
                    </button>
                  ) : (
                    <p className="text-[15px] leading-relaxed break-words whitespace-pre-wrap text-white/95">
                      {m.content}
                    </p>
                  )}
                  <div
                    className={`mt-1 flex items-center justify-end gap-1 text-[10.5px] ${
                      mine ? "text-white/60" : "text-white/35"
                    }`}
                  >
                    {timeHHmm(m.createdAt)}
                    {mine &&
                      (isLastMine ? (
                        read ? (
                          <CheckCheck className="h-3.5 w-3.5 text-cyan-200" />
                        ) : (
                          <CheckCheck className="h-3.5 w-3.5 opacity-70" />
                        )
                      ) : (
                        <Check className="h-3.5 w-3.5 opacity-60" />
                      ))}
                  </div>
                </div>
              </motion.div>
            </div>
          );
        })}
      </div>

      {/* composer */}
      <div className="shrink-0 px-4 pb-4 sm:px-8 sm:pb-6">
        <AnimatePresence>
          {pendingImage && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              className="glass mb-3 flex w-fit items-center gap-3 rounded-2xl p-2.5"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={pendingImage.url} alt="preview" className="h-16 w-16 rounded-xl object-cover" />
              <span className="max-w-40 truncate text-sm text-white/60">{pendingImage.file.name}</span>
              <button
                onClick={() => {
                  URL.revokeObjectURL(pendingImage.url);
                  setPendingImage(null);
                }}
                className="rounded-lg p-1.5 text-white/40 hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
        <div className="ring-focus flex items-end gap-2 rounded-3xl border border-white/10 bg-white/[0.04] p-2 backdrop-blur-xl transition-all">
          <button
            onClick={() => fileRef.current?.click()}
            title="Прикрепить фото"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl text-white/45 transition-colors hover:bg-white/5 hover:text-violet-300"
          >
            <ImagePlus className="h-5 w-5" />
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={(e) => {
              pickImage(e.target.files?.[0] ?? null);
              e.target.value = "";
            }}
          />
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder="Сообщение…"
            rows={1}
            className="nice-scroll max-h-36 min-h-10 w-full resize-none bg-transparent py-2.5 text-[15px] placeholder:text-white/30"
            style={{ height: "auto" }}
            onInput={(e) => {
              const el = e.currentTarget;
              el.style.height = "auto";
              el.style.height = `${Math.min(el.scrollHeight, 144)}px`;
            }}
          />
          <button
            onClick={() => void send()}
            disabled={sending || (!draft.trim() && !pendingImage)}
            className="btn-gradient grid h-10 w-10 shrink-0 place-items-center rounded-2xl text-white disabled:cursor-not-allowed"
          >
            {sending ? <Loader2 className="h-4.5 w-4.5 animate-spin" /> : <Send className="h-4.5 w-4.5" />}
          </button>
        </div>
      </div>

      {/* lightbox */}
      <AnimatePresence>
        {lightbox && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setLightbox(null)}
            className="fixed inset-0 z-[70] grid cursor-zoom-out place-items-center bg-black/85 p-6 backdrop-blur-md"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <motion.img
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              src={lightbox}
              alt="Фото"
              className="max-h-[88vh] max-w-full rounded-2xl object-contain shadow-2xl"
            />
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

function DaySeparator({ iso }: { iso: string }) {
  return (
    <div className="my-4 flex items-center gap-3">
      <div className="h-px flex-1 bg-white/[0.06]" />
      <span className="glass rounded-full px-3.5 py-1 text-[11px] font-medium text-white/45">
        {dayLabel(iso)}
      </span>
      <div className="h-px flex-1 bg-white/[0.06]" />
    </div>
  );
}

function CallLogBubble({ message, meId }: { message: ChatMessage; meId: string }) {
  let status = "ended";
  let durationSec = 0;
  try {
    const data = JSON.parse(message.content);
    status = data.status;
    durationSec = data.durationSec ?? 0;
  } catch {
    /* noop */
  }
  const outgoing = message.senderId === meId;
  const missed = status === "missed" || status === "declined";

  return (
    <div className="my-3 flex justify-center">
      <div className="glass flex items-center gap-3 rounded-2xl px-4 py-2.5">
        <span
          className={`grid h-8 w-8 place-items-center rounded-full ${
            missed ? "bg-rose-500/15 text-rose-400" : "bg-emerald-500/15 text-emerald-400"
          }`}
        >
          {missed ? (
            <PhoneMissed className="h-3.5 w-3.5" />
          ) : outgoing ? (
            <PhoneOutgoing className="h-3.5 w-3.5" />
          ) : (
            <PhoneIncoming className="h-3.5 w-3.5" />
          )}
        </span>
        <div>
          <p className="text-sm font-medium text-white/85">
            {missed
              ? outgoing
                ? "Без ответа"
                : "Пропущенный звонок"
              : `Звонок · ${formatDuration(durationSec)}`}
          </p>
          <p className="text-[11px] text-white/35">{timeHHmm(message.createdAt)}</p>
        </div>
      </div>
    </div>
  );
}
