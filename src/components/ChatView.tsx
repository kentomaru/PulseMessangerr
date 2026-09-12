"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  Check,
  CheckCheck,
  CornerUpLeft,
  Hash,
  ImagePlus,
  Info,
  Loader2,
  Lock,
  Megaphone,
  MoreVertical,
  Palette,
  Phone,
  PhoneIncoming,
  PhoneMissed,
  PhoneOutgoing,
  Radio,
  Reply,
  Send,
  Trash2,
  UserRound,
  Users,
  Video,
  X,
} from "lucide-react";
import Avatar from "./Avatar";
import WallpaperModal from "./WallpaperModal";
import { api, ApiError } from "@/lib/api";
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
import type {
  CallMedia,
  CallSummary,
  ChatMessage,
  ConversationKind,
  ConversationMemberItem,
  MemberRole,
  Peer,
  PublicUser,
} from "@/lib/types";

type ConvMeta = {
  id: string;
  kind: ConversationKind;
  name: string | null;
  avatarUrl: string | null;
  about: string;
  isPrivate: boolean;
  memberCount: number;
  myRole: MemberRole;
  title: string;
};

type Props = {
  me: PublicUser;
  conversationId: string;
  /** Данные из списка диалогов (используются до первой загрузки). */
  initialTitle: string;
  initialKind: ConversationKind;
  initialAvatar: string | null;
  peer: Peer | null;
  onBack: () => void;
  onCall: (media: CallMedia) => void;
  onJoinCall: (callId: string, media: CallMedia) => void;
  onViewPeer: () => void;
  onViewUser: (user: PublicUser) => void;
  onOpenInfo: () => void;
  callBusy: boolean;
  refreshConversations: () => void;
  notify: (msg: string) => void;
  onUnauthorized: () => void;
};

type MessageLoad = {
  messages: ChatMessage[];
  conversation: ConvMeta;
  members: ConversationMemberItem[];
  peer: Peer | null;
  activeCall: CallSummary | null;
  wallpaper: string | null;
};

export default function ChatView({
  me,
  conversationId,
  initialTitle,
  initialKind,
  initialAvatar,
  peer,
  onBack,
  onCall,
  onJoinCall,
  onViewPeer,
  onViewUser,
  onOpenInfo,
  callBusy,
  refreshConversations,
  notify,
  onUnauthorized,
}: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [meta, setMeta] = useState<ConvMeta | null>(null);
  const [members, setMembers] = useState<ConversationMemberItem[]>([]);
  const [peerState, setPeerState] = useState<Peer | null>(peer);
  const [activeCall, setActiveCall] = useState<CallSummary | null>(null);
  const [wallpaper, setWallpaper] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showWallpaper, setShowWallpaper] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const lastTypingSent = useRef(0);
  const lastCount = useRef(0);
  const loadedRef = useRef(false);

  /**
   * Прокрутить чат вниз.
   * — null-safe: при переключении чата в полёте запроса колбэк может сработать
   *   после размонтирования — scrollRef.current уже null (раньше `scrollTo({ top: scrollRef.current.scrollHeight })`
   *   падал с null-ref ещё до опционального вызова);
   * — фолбэк на scrollTop: в окружениях без рабочей Element.scrollTo (например
   *   jsdom в UI-смоке) скролл просто не выполнялся молча.
   */
  const scrollToEnd = useCallback((smooth = false) => {
    const el = scrollRef.current;
    if (!el) return;
    const top = el.scrollHeight;
    if (typeof el.scrollTo === "function") {
      try {
        el.scrollTo({ top, behavior: smooth ? "smooth" : "auto" });
        return;
      } catch {
        /* не поддерживается — уходим в scrollTop ниже */
      }
    }
    el.scrollTop = top;
  }, []);

  const load = useCallback(async () => {
    try {
      const d = await api<MessageLoad>(`/api/messages?conversationId=${conversationId}`);
      setMessages(d.messages);
      setMeta(d.conversation);
      setMembers(d.members);
      setActiveCall(d.activeCall);
      if (d.peer) setPeerState(d.peer);
      setWallpaper(d.wallpaper);
      if (!loadedRef.current) {
        loadedRef.current = true;
        setLoaded(true);
        requestAnimationFrame(() => scrollToEnd());
      } else if (d.messages.length !== lastCount.current) {
        requestAnimationFrame(() => scrollToEnd(true));
      }
      lastCount.current = d.messages.length;
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) onUnauthorized();
      /* иначе сеть моргнула — следующий опрос поправит */
    }
    // ВАЖНО: зависимость только от conversationId (см. комментарий в истории правок)
  }, [conversationId, onUnauthorized, scrollToEnd]);

  useEffect(() => {
    loadedRef.current = false;
    setLoaded(false);
    lastCount.current = 0;
    setReplyTo(null);
    void load();
    const t = setInterval(() => void load(), 2_500);
    return () => clearInterval(t);
  }, [load]);

  const kind = meta?.kind ?? initialKind;
  const title = meta?.title ?? initialTitle;
  const avatar = kind === "direct" ? (peerState?.avatarUrl ?? initialAvatar) : (meta?.avatarUrl ?? initialAvatar);
  const isSpace = kind !== "direct";
  const canPost = kind !== "channel" || meta?.myRole === "owner" || meta?.myRole === "admin";

  const send = async (imageUrl?: string) => {
    const content = (imageUrl ?? text).trim();
    if (!content || sending || !canPost) return;
    setSending(true);
    if (!imageUrl) setText("");
    const reply = replyTo;
    setReplyTo(null);
    try {
      await api("/api/messages", {
        method: "POST",
        body: JSON.stringify({
          conversationId,
          type: imageUrl ? "image" : "text",
          content,
          replyToId: reply?.id ?? null,
        }),
      });
      await load();
      refreshConversations();
    } catch (e) {
      if (!imageUrl) setText(content);
      setReplyTo(reply);
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
      await send(url);
    } catch (e) {
      notify(e instanceof Error ? e.message : "Не удалось отправить фото");
    } finally {
      setUploading(false);
    }
  };

  const removeMessage = async (id: string) => {
    try {
      await api(`/api/messages/${id}`, { method: "DELETE" });
      setMessages((ms) =>
        ms.map((m) =>
          m.id === id
            ? { ...m, deletedAt: new Date().toISOString(), content: "" }
            : m.replyToId === id
              ? { ...m, replyToId: null, replyTo: null }
              : m,
        ),
      );
      refreshConversations();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Не удалось удалить");
    }
  };

  const sendTyping = () => {
    const now = Date.now();
    if (now - lastTypingSent.current < 2_500) return;
    lastTypingSent.current = now;
    void api(`/api/conversations/${conversationId}/typing`, { method: "POST" }).catch(() => {});
  };

  const jumpTo = (id: string) => {
    const el = scrollRef.current?.querySelector<HTMLElement>(`[data-mid="${id}"]`);
    if (!el) {
      notify("Это сообщение старше загруженной истории");
      return;
    }
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlight(id);
    setTimeout(() => setHighlight(null), 1400);
  };

  // Тик для «протухания» индикатора «печатает…» между опросами
  const [nowTick, setNowTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setNowTick((v) => v + 1), 1_500);
    return () => clearInterval(t);
  }, []);

  const typingMembers = useMemo(() => {
    const now = Date.now();
    void nowTick;
    return members.filter(
      (m) => m.user.id !== me.id && m.typingAt && now - new Date(m.typingAt).getTime() < 4_500,
    );
  }, [members, me.id, nowTick]);

  const readUpTo = useMemo(() => {
    if (kind === "direct") {
      return peerState?.lastReadAt ? new Date(peerState.lastReadAt).getTime() : 0;
    }
    // В группах считаем прочитанным, если прочитали все остальные
    const others = members.filter((m) => m.user.id !== me.id && m.lastReadAt);
    if (others.length === 0) return 0;
    return Math.min(...others.map((m) => new Date(m.lastReadAt as string).getTime()));
  }, [kind, peerState, members, me.id]);

  const headerSubtitle = () => {
    if (typingMembers.length > 0) {
      const names = typingMembers.map((m) => m.user.displayName.split(" ")[0]);
      return {
        text: names.length === 1 ? `${names[0]} печатает…` : `${names.slice(0, 2).join(", ")} печатают…`,
        accent: true,
      };
    }
    if (kind === "direct") {
      return { text: lastSeenLabel(peerState?.lastSeenAt ?? null, !!peerState?.online), accent: !!peerState?.online };
    }
    const online = members.filter((m) => m.user.online).length;
    return {
      text: `${meta?.memberCount ?? members.length} участников · ${online} в сети`,
      accent: false,
    };
  };
  const subtitle = headerSubtitle();

  const startReply = (m: ChatMessage) => {
    setReplyTo(m);
    inputRef.current?.focus();
  };

  return (
    <div className="relative flex h-full min-w-0 flex-1 flex-col">
      {/* Обои */}
      <div className="pointer-events-none absolute inset-0" style={wallpaperStyle(wallpaper)} aria-hidden />
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

        <button
          onClick={kind === "direct" ? onViewPeer : onOpenInfo}
          className="flex min-w-0 items-center gap-3 text-left"
        >
          <Avatar
            name={title}
            src={avatar}
            size={42}
            online={kind === "direct" ? peerState?.online : undefined}
          />
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 truncate text-[15px] font-semibold">
              <span className="truncate">{title}</span>
              {isSpace && kind === "channel" && <Megaphone className="h-3.5 w-3.5 shrink-0 text-cyan-300" />}
              {isSpace && kind === "group" && <Hash className="h-3.5 w-3.5 shrink-0 text-violet-300" />}
              {isSpace && meta?.isPrivate && <Lock className="h-3 w-3 shrink-0 text-white/25" />}
            </p>
            <p className={`truncate text-xs ${subtitle.accent ? "text-violet-300" : "text-white/35"}`}>
              {subtitle.text}
            </p>
          </div>
        </button>

        <div className="ml-auto flex items-center gap-1.5">
          {activeCall && (
            <button
              onClick={() => onJoinCall(activeCall.id, activeCall.media)}
              className="flex items-center gap-2 rounded-xl bg-emerald-500/90 px-3 py-2 text-[13px] font-semibold text-white transition-transform hover:scale-[1.03] active:scale-95"
              title="Присоединиться к звонку"
            >
              <Radio className="h-4 w-4 animate-pulse-dot" />
              <span className="hidden sm:inline">В звонке · {activeCall.participantCount}</span>
              <span className="sm:hidden">{activeCall.participantCount}</span>
            </button>
          )}
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
            className="glass hidden h-10 w-10 items-center justify-center rounded-xl text-white/75 transition-colors hover:text-white sm:flex disabled:opacity-40"
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
                  <div key="menu-backdrop" className="fixed inset-0 z-20" onClick={() => setMenuOpen(false)} />
                  <motion.div
                    key="menu"
                    initial={{ opacity: 0, y: -6, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.97 }}
                    className="glass-strong absolute right-0 z-30 mt-2 w-56 overflow-hidden rounded-2xl p-1.5 shadow-2xl"
                  >
                    {isSpace && (
                      <MenuItem
                        icon={<Info className="h-4 w-4" />}
                        label={kind === "channel" ? "О канале" : "О группе"}
                        onClick={() => {
                          setMenuOpen(false);
                          onOpenInfo();
                        }}
                      />
                    )}
                    <MenuItem
                      icon={<Palette className="h-4 w-4" />}
                      label="Обои чата"
                      onClick={() => {
                        setMenuOpen(false);
                        setShowWallpaper(true);
                      }}
                    />
                    {kind === "direct" && (
                      <MenuItem
                        icon={<UserRound className="h-4 w-4" />}
                        label="Профиль"
                        onClick={() => {
                          setMenuOpen(false);
                          onViewPeer();
                        }}
                      />
                    )}
                    {isSpace && (
                      <MenuItem
                        icon={<Users className="h-4 w-4" />}
                        label={`Участники · ${meta?.memberCount ?? members.length}`}
                        onClick={() => {
                          setMenuOpen(false);
                          onOpenInfo();
                        }}
                      />
                    )}
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Идёт звонок — приглашение присоединиться */}
      <AnimatePresence>
        {activeCall && (
          <motion.div
            key="call-banner"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="relative z-10 overflow-hidden"
          >
            <div className="mx-4 mt-3 flex max-w-2xl items-center gap-3 rounded-2xl border border-emerald-400/25 bg-emerald-500/12 px-4 py-2.5">
              <Radio className="h-4 w-4 shrink-0 animate-pulse-dot text-emerald-300" />
              <p className="min-w-0 flex-1 truncate text-[13px] text-emerald-100/90">
                {activeCall.participantCount > 0
                  ? `В комнате ${activeCall.participantCount} чел. — присоединяйтесь`
                  : "Комната звонка открыта"}
              </p>
              <button
                onClick={() => onJoinCall(activeCall.id, activeCall.media)}
                className="shrink-0 rounded-xl bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white"
              >
                Войти
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Сообщения */}
      <div ref={scrollRef} className="nice-scroll relative z-10 min-h-0 flex-1 overflow-y-auto px-4 py-5">
        {!loaded ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-white/30" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <Avatar name={title} src={avatar} size={72} />
            <p className="font-display text-lg font-bold">{title}</p>
            <p className="max-w-xs text-sm leading-relaxed text-white/40">
              {isSpace
                ? kind === "channel"
                  ? "Канал создан. Опубликуйте первый пост — и позовите людей ссылкой"
                  : "Группа создана. Напишите первое сообщение или начните групповой звонок 👋"
                : "Здесь пока пусто. Напишите первое сообщение — или позвоните 👋"}
            </p>
          </div>
        ) : (
          <div className="mx-auto flex max-w-2xl flex-col gap-0.5">
            {messages.map((m, i) => {
              const prev = messages[i - 1];
              const showDay = !prev || !sameDay(prev.createdAt, m.createdAt);
              const grouped =
                !!prev &&
                !showDay &&
                prev.senderId === m.senderId &&
                prev.type !== "call" &&
                m.type !== "call" &&
                new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60_000;
              const own = m.senderId === me.id;
              const canDelete = own || (isSpace && (meta?.myRole === "owner" || meta?.myRole === "admin"));

              return (
                <div key={m.id} data-mid={m.id}>
                  {showDay && (
                    <div className="flex justify-center py-4">
                      <span className="glass rounded-full px-3.5 py-1.5 text-[11px] font-medium text-white/50">
                        {dayLabel(m.createdAt)}
                      </span>
                    </div>
                  )}
                  {m.type === "call" ? (
                    <CallLogBubble message={m} meId={me.id} onJoin={activeCall ? () => onJoinCall(activeCall.id, activeCall.media) : null} />
                  ) : (
                    <MessageBubble
                      message={m}
                      meId={me.id}
                      own={own}
                      space={isSpace}
                      grouped={grouped}
                      read={own && new Date(m.createdAt).getTime() <= readUpTo}
                      canDelete={canDelete}
                      highlighted={highlight === m.id}
                      onOpenImage={setLightbox}
                      onDelete={() => void removeMessage(m.id)}
                      onReply={() => startReply(m)}
                      onJump={jumpTo}
                      onViewUser={onViewUser}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Ответ / поле ввода */}
      <div className="glass-strong relative z-10 border-t border-white/8 px-4 py-3">
        <div className="mx-auto max-w-2xl">
          <AnimatePresence>
            {replyTo && (
              <motion.div
                key="reply"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="mb-2 flex items-center gap-2.5 rounded-2xl border border-white/8 bg-white/[0.04] px-3 py-2">
                  <Reply className="h-4 w-4 shrink-0 text-violet-300" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] font-semibold text-violet-300">
                      {replyTo.senderId === me.id ? "Вы" : (replyTo.sender?.displayName ?? "Сообщение")}
                    </p>
                    <p className="truncate text-xs text-white/45">
                      {replyTo.deletedAt
                        ? "Сообщение удалено"
                        : replyTo.type === "image"
                          ? "🖼 Фото"
                          : replyTo.content.replace(/\n/g, " ")}
                    </p>
                  </div>
                  <button onClick={() => setReplyTo(null)} className="shrink-0 rounded-full p-1 text-white/40 hover:text-white">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {!canPost ? (
            <div className="flex items-center justify-center gap-2 rounded-2xl border border-white/8 bg-white/[0.03] py-3.5 text-sm text-white/40">
              <Lock className="h-4 w-4" />
              В этом канале писать могут только администраторы
            </div>
          ) : (
            <div className="flex items-end gap-2.5">
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
                ref={inputRef}
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
                  if (e.key === "Escape" && replyTo) setReplyTo(null);
                }}
                rows={1}
                maxLength={4000}
                placeholder={kind === "channel" ? "Написать в канал…" : "Сообщение…"}
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
          )}
        </div>
      </div>

      {/* Модалки */}
      <AnimatePresence>
        {showWallpaper && (
          <WallpaperModal
            key="wallpaper"
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
            key="lightbox"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setLightbox(null)}
            className="fixed inset-0 z-[75] flex items-center justify-center bg-black/90 p-6 backdrop-blur-sm"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={lightbox} alt="Фото" className="max-h-full max-w-full rounded-2xl object-contain shadow-2xl" />
            <button className="absolute top-5 right-5 rounded-full bg-white/10 p-2.5 text-white/80">
              <X className="h-5 w-5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function MenuItem({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
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
  meId,
  own,
  space,
  grouped,
  read,
  canDelete,
  highlighted,
  onOpenImage,
  onDelete,
  onReply,
  onJump,
  onViewUser,
}: {
  message: ChatMessage;
  /** id текущего пользователя — чтобы в цитате писать «Вы», а не имя. */
  meId: string;
  own: boolean;
  space: boolean;
  grouped: boolean;
  read: boolean;
  canDelete: boolean;
  highlighted: boolean;
  onOpenImage: (url: string) => void;
  onDelete: () => void;
  onReply: () => void;
  onJump: (id: string) => void;
  onViewUser: (u: PublicUser) => void;
}) {
  const sender = message.sender;
  const alignRight = own && !space;

  if (message.deletedAt) {
    return (
      <div className={`flex py-0.5 ${alignRight ? "justify-end" : "justify-start"}`}>
        <div className="flex items-center gap-2 rounded-2xl border border-dashed border-white/12 px-3.5 py-2 text-[13px] italic text-white/35">
          <Trash2 className="h-3 w-3" />
          Сообщение удалено
        </div>
      </div>
    );
  }

  return (
    <div
      className={`group flex items-start gap-2 py-0.5 ${alignRight ? "justify-end" : "justify-start"} ${
        highlighted ? "animate-pulse-dot" : ""
      }`}
    >
      {space && !alignRight && (
        <button
          onClick={() => sender && onViewUser(sender)}
          className="mt-1 shrink-0"
          title={sender ? "Открыть профиль" : undefined}
        >
          {grouped ? (
            <span className="block h-8 w-8" />
          ) : (
            <Avatar name={sender?.displayName ?? "?"} src={sender?.avatarUrl ?? null} size={32} />
          )}
        </button>
      )}

      <div className={`relative max-w-[80%] min-w-0 sm:max-w-[72%] ${alignRight ? "order-1" : ""}`}>
        {space && !grouped && !alignRight && sender && (
          <button
            onClick={() => onViewUser(sender)}
            className="mb-1 block text-left text-[12px] font-semibold text-violet-300/90 hover:text-violet-200"
          >
            {sender.displayName}
          </button>
        )}

        <div
          className={`relative overflow-hidden ${
            message.type === "image" ? "" : own && !space ? "bubble-own text-white" : "bubble-peer text-white/90"
          } ${message.type === "image" ? "" : "rounded-3xl px-4 py-2.5"} ${
            own && !space ? "rounded-br-lg" : space || !own ? "rounded-bl-lg" : ""
          } ${highlighted ? "ring-2 ring-violet-400/60" : ""}`}
        >
          {/* Цитата (ответ на сообщение) */}
          {message.replyTo && (
            <button
              onClick={() => onJump(message.replyTo!.id)}
              className="mb-1.5 flex w-full gap-2 rounded-xl border-l-2 border-violet-300/70 bg-black/20 px-2.5 py-1.5 text-left"
            >
              <CornerUpLeft className="mt-0.5 h-3 w-3 shrink-0 text-violet-300/80" />
              <span className="min-w-0">
                <span className="block truncate text-[11px] font-semibold text-violet-200">
                  {message.replyTo.senderId === meId ? "Вы" : message.replyTo.senderName}
                </span>
                <span className="block truncate text-[12px] text-white/50">
                  {message.replyTo.deleted
                    ? "Сообщение удалено"
                    : message.replyTo.type === "image"
                      ? "🖼 Фото"
                      : message.replyTo.content.replace(/\n/g, " ")}
                </span>
              </span>
            </button>
          )}

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
            <p className="text-[15px] leading-relaxed break-words whitespace-pre-wrap">{message.content}</p>
          )}
        </div>

        <div className={`mt-1 flex items-center gap-1 text-[10px] text-white/30 ${alignRight ? "justify-end" : ""}`}>
          <span>{timeHHmm(message.createdAt)}</span>
          {own &&
            (read ? <CheckCheck className="h-3.5 w-3.5 text-cyan-300" /> : <Check className="h-3.5 w-3.5" />)}
        </div>
      </div>

      {/* Действия: ответить / удалить */}
      <div className={`flex shrink-0 items-center gap-1 self-center opacity-0 transition-opacity group-hover:opacity-100 ${alignRight ? "order-0" : ""}`}>
        <button onClick={onReply} title="Ответить" className="rounded-full p-1 text-white/30 hover:text-violet-300">
          <Reply className="h-3.5 w-3.5" />
        </button>
        {canDelete && (
          <button onClick={onDelete} title="Удалить" className="rounded-full p-1 text-white/30 hover:text-rose-300">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

function CallLogBubble({
  message,
  meId,
  onJoin,
}: {
  message: ChatMessage;
  meId: string;
  onJoin: (() => void) | null;
}) {
  const info = parseCallContent(message.content);
  if (!info) return null;

  const mineOutgoing = info.callerId === meId;
  const missed = info.status === "missed" || info.status === "declined" || info.status === "cancelled";
  const group = (info.participants ?? 0) > 2;

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
        <span className="text-white/80">
          {group ? "Групповой звонок" : callLogLabel(info)}
          {group && info.durationSec > 0 ? ` · ${formatDuration(info.durationSec)}` : ""}
          {group && info.participants ? ` · ${info.participants} чел.` : ""}
        </span>
        {!group && info.durationSec > 0 && (
          <span className="text-white/40">· {formatDuration(info.durationSec)}</span>
        )}
        <span className="text-white/25">{timeHHmm(message.createdAt)}</span>
        {info.media === "video" && <Video className="h-3.5 w-3.5 text-white/35" />}
        {onJoin && (
          <button onClick={onJoin} className="ml-1 rounded-full bg-emerald-500/90 px-2.5 py-1 text-[11px] font-semibold text-white">
            войти
          </button>
        )}
      </div>
    </div>
  );
}
