"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Ban,
  BellOff,
  BellRing,
  Bookmark,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  CornerUpLeft,
  Copy,
  ArrowDown,
  Download,
  File as PendingFileIcon,
  File as FileIcon,
  FileText,
  Film,
  Forward,
  Gift,
  BarChart3,
  Contact,
  MapPin,
  Flame,
  Star,
  Hash,
  ImagePlus,
  ChevronUp,
  Clock,
  Eye,
  EyeOff,
  MessageSquareText,
  Plus,
  VolumeX,
  Info,
  Link2,
  Loader2,
  Lock,
  Megaphone,
  MessageSquare,
  Sparkles,
  Mic,
  MoreVertical,
  Music,
  Palette,
  Paperclip,
  Pause,
  Pencil,
  Phone,
  PhoneIncoming,
  PhoneMissed,
  PhoneOutgoing,
  Pin,
  PinOff,
  Play,
  Radio,
  Reply,
  RotateCcw,
  Search,
  Send,
  Smile,
  SmilePlus,
  Sticker,
  Trash2,
  UserRound,
  Users,
  Video,
  X,
} from "lucide-react";
import Avatar from "./Avatar";
import PreviewLabel from "./PreviewLabel";
import StatusEmoji from "./StatusEmoji";
import WallpaperModal from "./WallpaperModal";
import { api, ApiError, copyToClipboard, uploadFile, uploadFileWithProgress } from "@/lib/api";
import { audioConstraints } from "@/lib/audioSettings";
import { claimPlayback, releasePlayback } from "@/lib/playback";
import { EMOJI_CATEGORIES, STICKERS } from "@/lib/emojis";
import { renderRichText } from "@/lib/richText";
import { addScheduled, readScheduled, removeScheduled, type ScheduledMsg } from "@/lib/scheduledStore";
import { parseStoryQuote, type StoryQuoteInfo } from "@/lib/storyQuote";
import { setCachedTranscript } from "@/lib/transcribe";
import { isModalOpen } from "@/lib/modals";
import { GIF_PACK, CUSTOM_EMOJI, customEmojiGlyphByToken, customEmojisToTokens, findCustomEmoji, findGif, gifpackId } from "@/lib/premiumContent";
import { findGift } from "@/lib/gifts";
import NftFigure from "./NftFigure";
import GiftDetailModal from "./GiftDetailModal";
import {
  callLogLabel,
  dayLabel,
  formatBytes,
  formatDuration,
  emojiOnly,
  lastSeenLabel,
  legacyAttachmentKind,
  parseCallContent,
  parseAttachment,
  sameDay,
  timeHHmm,
  cleanSnippet,
} from "@/lib/format";
import { wallpaperStyle } from "@/lib/wallpapers";
import type {
  AttachmentInfo,
  CallMedia,
  CallSummary,
  ChatMessage,
  ConversationKind,
  ConversationListItem,
  ConversationMemberItem,
  MemberRole,
  MessageReaction,
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
  /** Ограниченный чат: контент нельзя копировать/сохранять (как в ТГ). */
  restricted?: boolean;
  /** Слоумод: пауза между сообщениями участника в секундах (0 — выключен). */
  slowMode?: number;
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
  /** Непрочитанные на момент открытия (для разделителя «Непрочитанные»). */
  initialUnread?: number;
  /** Переход к сообщению по ссылке (#msg=…) сразу после загрузки истории. */
  initialJumpId?: string | null;
  onJumpConsumed?: () => void;
  /** Чат заглушён. */
  muted?: boolean;
  /** Переключить мьют текущего чата. */
  onToggleMuteChat?: () => void;
  peer: Peer | null;
  onBack: () => void;
  onCall: (media: CallMedia) => void;
  onJoinCall: (callId: string, media: CallMedia) => void;
  onViewPeer: () => void;
  onViewUser: (user: PublicUser) => void;
  onOpenInfo: () => void;
  onOpenDiscussion?: (postId: string) => void;
  onOpenUsername?: (name: string) => void;
  /** Режим «комментарии поста»: показываем только ответы на postId. */
  commentFilter?: { postId: string; channelTitle: string } | null;
  onExitCommentMode?: () => void;
  callBusy: boolean;
  refreshConversations: () => void;
  notify: (msg: string) => void;
  onUnauthorized: () => void;
};

type MessageLoad = {
  messages: ChatMessage[];
  pinned: ChatMessage[];
  postCount?: number;
  conversation: ConvMeta;
  members: ConversationMemberItem[];
  peer: Peer | null;
  activeCall: CallSummary | null;
  wallpaper: string | null;
};

/** Результат поиска по чату. */
type SearchHit = {
  id: string;
  type: string;
  content: string;
  preview: string;
  createdAt: string;
  senderId: string;
  senderName: string;
  sender: PublicUser | null;
};

type DraftFile = {
  id: string;
  file: File;
  /** Превью (для картинок). */
  preview: string | null;
  /** Спойлер: фото придёт размытым. */
  spoiler?: boolean;
};

/**
 * Черновики живут ВНЕ компонента: раньше при переключении чатов ChatView
 * размонтировался и недописанный текст + прикреплённые файлы бесследно
 * пропадали («сообщения удаляются при переходе в другой чат»). Теперь они
 * дожидаются пользователя; текст дополнительно переживает перезагрузку
 * страницы (localStorage).
 */
type SavedDraft = { text: string; files: DraftFile[] };
const draftStore = new Map<string, SavedDraft>();
const TEXT_DRAFTS_KEY = "pulse_text_drafts_v1";

function readTextDrafts(): Record<string, string> {
  try {
    const raw = localStorage.getItem(TEXT_DRAFTS_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : {};
    return parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function writeTextDraft(convId: string, text: string): void {
  try {
    const all = readTextDrafts();
    if (text.trim()) all[convId] = text;
    else delete all[convId];
    localStorage.setItem(TEXT_DRAFTS_KEY, JSON.stringify(all));
  } catch {
    /* переполнение квоты не критично — черновик останется в памяти */
  }
}

function getStoredDraft(convId: string): SavedDraft {
  let d = draftStore.get(convId);
  if (!d) {
    d = { text: readTextDrafts()[convId] ?? "", files: [] };
    draftStore.set(convId, d);
  }
  return d;
}

type ContextMenuState = {
  x: number;
  y: number;
  message: ChatMessage;
};

/** Быстрые реакции (те же, что в белом списке сервера). */
const QUICK_EMOJIS = ["👍", "❤️", "😂", "🔥", "😮", "😢", "🎉", "🤔", "👀", "💯"];
/** Дополнительный набор реакций — открывается по «+». */
const EXTRA_REACTIONS = [
  "😀","😅","😊","😍","😘","😜","🤗","😎","🥳","😇",
  "🙃","😉","🤩","😐","😴","🤯","😱","😤","😭","🤡",
  "💀","👻","🤖","💩","❤️‍🔥","💔","💕","✨","⚡","🌟",
  "🍀","🌈","🎂","🍾","🏆","🎯","🚀","💎","🙏","👏",
  "🤝","💪","✌️","🤘","🫡","🤌","👎","🖕","🥱","😬",
];

const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;
// Pulse Premium: файлы до 4 ГБ — как в ТГ Премиум
const PREMIUM_UPLOAD_BYTES = 4 * 1024 * 1024 * 1024;

/** Первый поддерживаемый браузером MIME для MediaRecorder. */
function pickRecorderMime(candidates: string[]): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  for (const c of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(c)) return c;
    } catch {
      /* ignore */
    }
  }
  return undefined;
}

export default function ChatView({
  me,
  conversationId,
  initialTitle,
  initialKind,
  initialAvatar,
  initialUnread,
  initialJumpId,
  onJumpConsumed,
  muted,
  onToggleMuteChat,
  peer,
  onBack,
  onCall,
  onJoinCall,
  onViewPeer,
  onViewUser,
  onOpenInfo,
  onOpenDiscussion,
  onOpenUsername,
  commentFilter = null,
  onExitCommentMode,
  callBusy,
  refreshConversations,
  notify,
  onUnauthorized,
}: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pinned, setPinned] = useState<ChatMessage[]>([]);
  /** Сколько записей в канале/группе (для подзаголовка). */
  const [postCount, setPostCount] = useState<number | null>(null);
  const [pinnedIdx, setPinnedIdx] = useState(0);
  const [meta, setMeta] = useState<ConvMeta | null>(null);
  const [members, setMembers] = useState<ConversationMemberItem[]>([]);
  const [peerState, setPeerState] = useState<Peer | null>(peer);
  const [activeCall, setActiveCall] = useState<CallSummary | null>(null);
  const [wallpaper, setWallpaper] = useState<string | null>(null);
  // Черновик восстанавливается из общего хранилища (не теряется при смене чата).
  const [text, setText] = useState(() => getStoredDraft(conversationId).text);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showWallpaper, setShowWallpaper] = useState(false);
  /** Подтверждение удаления/выхода из чата. */
  const [confirmDeleteChat, setConfirmDeleteChat] = useState(false);
  const [deleteChatForAll, setDeleteChatForAll] = useState(false);
  const [deletingChat, setDeletingChat] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  /** Зум фото в лайтбоксе колесом мыши. */
  const [lbZoom, setLbZoom] = useState(1);
  useEffect(() => setLbZoom(1), [lightbox]);
  /** Лайтбокс: листание фото стрелками клавиатуры (как в ТГ). */
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft" && e.key !== "Escape") return;
      e.preventDefault();
      if (e.key === "Escape") {
        setLightbox(null);
        return;
      }
      const imgs = messages
        .map((m) => parseAttachment(m.type, m.content))
        .filter((a): a is import("@/lib/types").AttachmentInfo => !!a && m2img(a) !== null)
        .map((a) => m2img(a) as string);
      const idx = imgs.indexOf(lightbox);
      if (idx >= 0 && imgs.length > 1)
        setLightbox(imgs[(idx + (e.key === "ArrowRight" ? 1 : -1) + imgs.length) % imgs.length]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox, messages]);
  /** Меню способов отправки: тихо, отложить, быстрые ответы. */
  const [sendMenu, setSendMenu] = useState(false);
  /** Черновик опроса (как в ТГ): вопрос + варианты. */
  const [pollDraft, setPollDraft] = useState<{ q: string; opts: string[]; multi?: boolean; quiz?: number | null } | null>(null);
  /** Избранное как в ТГ Премиум: фильтр по #хэштегам. */
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  /** Эффекты сообщений как в ТГ: одиночный эмодзи взлетает по экрану. */
  const [fx, setFx] = useState<{ id: number; emoji: string; x: number }[]>([]);
  const triggerFx = (content: string) => {
    const emoji = content.trim();
    if (!["❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🎉", "🔥", "👍", "😂", "✨"].includes(emoji)) return;
    const id = Date.now() + Math.random();
    setFx((cur) => [...cur.slice(-6), { id, emoji, x: 12 + Math.random() * 70 }]);
    setTimeout(() => setFx((cur) => cur.filter((f) => f.id !== id)), 1600);
  };

  /** Самоудаляющиеся сообщения (как в ТГ): 0 — выключено, иначе секунд до удаления. */
  const [selfDestruct, setSelfDestruct] = useState<0 | 10 | 30 | 60>(0);
  /** Ставим таймер удаления на только что отправленное сообщение. */
  const armSelfDestruct = (msgId?: string) => {
    const sec = selfDestruct;
    if (!sec || !msgId) return;
    setTimeout(() => {
      void api(`/api/messages/${msgId}`, { method: "DELETE" })
        .then(() => load())
        .catch(() => {});
    }, sec * 1000);
  };

  /** Слоумод: до какого момента нельзя отправлять (для обычных участников). */
  const [slowUntil, setSlowUntil] = useState(0);
  const [slowNow, setSlowNow] = useState(() => Date.now());
  useEffect(() => {
    if (slowUntil <= Date.now()) return;
    const t = setInterval(() => setSlowNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [slowUntil]);
  const slowLeft = Math.max(0, Math.ceil((slowUntil - slowNow) / 1000));
  const slowActive = slowLeft > 0;
  /** Включаем паузу слоумода после успешной отправки (админы не ждут). */
  const armSlow = () => {
    const sm = meta?.slowMode ?? 0;
    if (sm > 0 && meta?.myRole !== "owner" && meta?.myRole !== "admin") setSlowUntil(Date.now() + sm * 1000);
  };
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleTime, setScheduleTime] = useState("");
  const [scheduled, setScheduled] = useState<ScheduledMsg[]>([]);
  const [snippetsOpen, setSnippetsOpen] = useState(false);
  const [snippets, setSnippets] = useState<{ id: string; text: string }[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("pulse_snippets_v1") ?? "[]") as { id: string; text: string }[];
    } catch {
      return [];
    }
  });
  /** @-автодополнение: текущий набираемый префикс. */
  const [mentionQ, setMentionQ] = useState<string | null>(null);
  const [chatMembers, setChatMembers] = useState<{ id: string; username: string; displayName: string; avatarUrl: string | null }[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  // Кнопка «вниз» + счётчик новых сообщений, пока читаешь историю
  const [showJump, setShowJump] = useState(false);
  const [newBelow, setNewBelow] = useState(0);
  const atBottomRef = useRef(true);
  const prevLenRef = useRef(0);
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [draftFiles, setDraftFiles] = useState<DraftFile[]>(() => getStoredDraft(conversationId).files);
  // «Летящие» файлы в стиле TG: сообщение видно сразу, с прогрессом загрузки
  const [pendingUploads, setPendingUploads] = useState<
    {
      lid: string;
      isImage: boolean;
      att: AttachmentInfo;
      caption?: string;
      loaded: number;
      total: number;
    }[]
  >([]);
  const [postCounts, setPostCounts] = useState<Record<string, number>>({});
  const [enterSend] = useState(() => {
    try {
      return localStorage.getItem("pulse_enter_send") !== "0";
    } catch {
      return true;
    }
  });
  const [dragOver, setDragOver] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<ContextMenuState | null>(null);

  const [forwarding, setForwarding] = useState<ChatMessage | null>(null);
  /** Сообщение, ожидающее подтверждения удаления (защита от случайных кликов). */
  const [confirmDelete, setConfirmDelete] = useState<ChatMessage | null>(null);
  const [noteRecorder, setNoteRecorder] = useState(false);
  const [voiceRecActive, setVoiceRecActive] = useState(false);
  const [recSecs, setRecSecs] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchHits, setSearchHits] = useState<SearchHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  /** id сообщения, перед которым рисуем разделитель «Непрочитанные». */
  const [unreadBefore, setUnreadBefore] = useState<string | null>(null);
  useEffect(() => {
    if (!loaded || !unreadBefore) return;
    const el = scrollRef.current?.querySelector<HTMLElement>(`[data-mid="${unreadBefore}"]`);
    if (el) el.scrollIntoView({ block: "start" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, unreadBefore]);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const lastTypingSent = useRef(0);
  const lastCount = useRef(0);
  const loadedRef = useRef(false);
  /** Непрочитанные на момент открытия чата — замораживаем, чтобы опросы их не затирали. */
  const initialUnreadRef = useRef(initialUnread ?? 0);
  const voiceRef = useRef<{ recorder: MediaRecorder; stream: MediaStream; chunks: Blob[]; startedAt: number } | null>(null);
  const draftId = useRef(0);

  /**
   * Прокрутить чат вниз.
   * — null-safe: при переключении чата в полёте запроса колбэк может сработать
   *   после размонтирования — scrollRef.current уже null;
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

  /** Отпечаток последнего ответа — не перерисовываем ленту, если всё то же
      (опрос каждые 2.5 с иначе каждый раз гонял весь список сообщений). */
  const msgFingerprintRef = useRef("");

  const load = useCallback(async () => {
    try {
      const d = await api<MessageLoad>(
        `/api/messages?conversationId=${conversationId}${
          commentFilter ? `&replyToId=${commentFilter.postId}` : ""
        }`,
      );
      // Сравниваем с прошлым снимком: если ничего не поменялось, не трогаем
      // state — это убирает лишние перерисовки и «подтормаживание» интерфейса.
      let fp = "";
      try {
        fp = JSON.stringify(d.messages);
      } catch {
        fp = `n${d.messages.length}:${Date.now()}`;
      }
      const changed = fp !== msgFingerprintRef.current;
      msgFingerprintRef.current = fp;
      if (changed) {
        // Страховка от дублей (повторная доставка/кэш) — уникальный список по id
        const seen = new Set<string>();
        setMessages(d.messages.filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true))));
        setPinned(d.pinned ?? []);
      }
      if (typeof d.postCount === "number") setPostCount(d.postCount);
      setMeta(d.conversation);
      const ms = (d.conversation as unknown as { members?: { user: { id: string; username: string; displayName: string; avatarUrl: string | null } }[] }).members;
      if (ms) setChatMembers(ms.map((m) => m.user));
      setMembers(d.members);
      setActiveCall(d.activeCall);
      if (d.peer) setPeerState(d.peer);
      setWallpaper(d.wallpaper);
      if (!loadedRef.current) {
        loadedRef.current = true;
        setLoaded(true);
        // разделитель «Непрочитанные»: перед N-м с конца чужим сообщением
        // (initialUnreadRef — значение на момент открытия чата, дальше не меняется)
        const target = initialUnreadRef.current;
        if (target > 0) {
          let c = target;
          let idx = -1;
          for (let i = d.messages.length - 1; i >= 0 && c > 0; i--) {
            if (d.messages[i].senderId !== me.id) {
              c--;
              idx = i;
            }
          }
          setUnreadBefore(idx >= 0 ? d.messages[idx].id : (d.messages[0]?.id ?? null));
        }
        requestAnimationFrame(() => scrollToEnd());
      } else if (d.messages.length !== lastCount.current) {
        requestAnimationFrame(() => scrollToEnd(true));
      }
      lastCount.current = d.messages.length;
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) onUnauthorized();
      /* иначе сеть моргнула — следующий опрос поправит */
    }
    // Зависимость от conversationId и фильтра комментариев (режим «комментарии поста»)
  }, [conversationId, onUnauthorized, scrollToEnd, me.id, commentFilter]);

  useEffect(() => {
    loadedRef.current = false;
    setLoaded(false);
    lastCount.current = 0;
    msgFingerprintRef.current = "";
    setReplyTo(null);
    setEditing(null);
    setUnreadBefore(null);
    setSearchOpen(false);
    setSearchQuery("");
    setSearchHits(null);
    setPinnedIdx(0);
    setEmojiOpen(false);
    void load();
    const t = setInterval(() => void load(), 2_500);
    return () => clearInterval(t);
  }, [load]);

  // Отложенные сообщения хранятся глобально и отправляются из MessengerApp —
  // здесь только показываем список для текущего чата.
  useEffect(() => {
    const read = () => setScheduled(readScheduled().filter((x) => x.conversationId === conversationId));
    read();
    const t = setInterval(read, 1000);
    return () => clearInterval(t);
  }, [conversationId]);

  // Черновик (текст + файлы) держим в общем хранилище, чтобы при переключении
  // чатов он не пропадал. Синхронизируем на каждое изменение.
  useEffect(() => {
    draftStore.set(conversationId, { text, files: draftFiles });
    writeTextDraft(conversationId, text);
    window.dispatchEvent(new Event("pulse-drafts"));
  }, [conversationId, text, draftFiles]);

  // при уходе из чата — останавливаем запись голоса; черновики НЕ трогаем,
  // они дождутся пользователя в draftStore.
  useEffect(() => {
    return () => {
      voiceRef.current?.stream.getTracks().forEach((t) => t.stop());
      voiceRef.current = null;
    };
  }, [conversationId]);

  const kind = meta?.kind ?? initialKind;
  const title = meta?.title ?? initialTitle;
  const avatar = kind === "direct" ? (peerState?.avatarUrl ?? initialAvatar) : (meta?.avatarUrl ?? initialAvatar);
  const isSpace = kind !== "direct";
  const canPost = kind !== "channel" || meta?.myRole === "owner" || meta?.myRole === "admin";
  /** Лимиты как в Telegram: текст 4096; подпись к медиа 1024 (2048 с Premium). */
  const msgLimit = draftFiles.length > 0 ? (me.premium ? 2048 : 1024) : 4096;

  /** Pulse Premium: локальное зеркало + включение в два клика (бесплатно). */
  const [isPremium, setIsPremium] = useState(!!me.premium);
  useEffect(() => setIsPremium(!!me.premium), [me.premium]);
  const enablePremium = useCallback(async () => {
    try {
      await api<{ user: { premium?: boolean } }>("/api/auth/me", {
        method: "PATCH",
        body: JSON.stringify({ premium: true }),
      });
      setIsPremium(true);
    } catch {
      notify("Не удалось включить Premium — попробуйте ещё раз");
    }
  }, [notify]);
  /** «Избранное» — чат с самим собой: без звонков, подпись «сохранённые». */
  const isSaved = kind === "direct" && (peerState?.id ?? peer?.id) === me.id;

  /** Хэштеги в Избранном: собираем все #теги из сообщений. */
  const savedTags = useMemo(() => {
    if (!isSaved) return [] as string[];
    const set = new Set<string>();
    for (const m of messages) {
      for (const t of m.content.matchAll(/#[\p{L}0-9_]{2,32}/gu)) set.add(t[0].toLowerCase());
    }
    return [...set].slice(0, 12);
  }, [messages, isSaved]);
  /** Список сообщений с учётом фильтра по тегу. */
  const listMessages = useMemo(
    () => (tagFilter && isSaved ? messages.filter((m) => m.content.toLowerCase().includes(tagFilter)) : messages),
    [messages, tagFilter, isSaved],
  );
  const pinnedCurrent = pinned.length > 0 ? pinned[Math.min(pinnedIdx, pinned.length - 1)] : null;

  /* ─────────────────────────── отправка ─────────────────────────── */

  /**
   * Отправка сообщения. `directText` — отправить сразу (например, стикер),
   * минуя поле ввода.
   */
  const send = async (directText?: string, opts?: { silent?: boolean }) => {
    if (sending || uploading || !canPost) return;
    // Слоумод как в ТГ: обычные участники ждут паузу между сообщениями
    if (slowActive) {
      notify(`Слоумод: следующее сообщение через ${slowLeft} с`);
      return;
    }

    // Отложенная отправка: если выбрано время — не шлём сразу, ставим в очередь
    if (directText === undefined && !editing && scheduleOpen && scheduleTime && text.trim()) {
      const [hh, mm] = scheduleTime.split(":").map(Number);
      const at = new Date();
      at.setHours(hh, mm, 0, 0);
      if (at.getTime() <= Date.now()) at.setDate(at.getDate() + 1);
      addScheduled({
        id: `sch-${Date.now()}`,
        conversationId,
        text: text.trim(),
        at: at.getTime(),
        replyToId: commentFilter?.postId ?? null,
      });
      setText("");
      setScheduleOpen(false);
      setScheduleTime("");
      notify(`Сообщение будет отправлено в ${scheduleTime}`);
      return;
    }

    // Стикер/текст напрямую — без редактирования и черновиков
    if (directText !== undefined) {
      const content = emojify(directText).trim();
      if (!content) return;
      setSending(true);
      const reply = replyTo;
      setReplyTo(null);
      try {
        const sentMsg = await api<{ message?: { id: string } }>("/api/messages", {
          method: "POST",
          body: JSON.stringify({
            conversationId,
            type: "text",
            content,
            replyToId: reply?.id ?? null,
            silent: opts?.silent ?? false,
          }),
        });
        armSelfDestruct(sentMsg.message?.id);
        triggerFx(content);
        await load();
        refreshConversations();
        armSlow();
      } catch (e) {
        setReplyTo(reply);
        notify(e instanceof Error ? e.message : "Не удалось отправить");
      } finally {
        setSending(false);
      }
      return;
    }

    // Редактирование своего сообщения
    if (editing) {
      const content = emojify(text).trim();
      if (!content) return;
      setSending(true);
      const target = editing;
      setEditing(null);
      setText("");
      try {
        await api(`/api/messages/${target.id}`, {
          method: "PATCH",
          body: JSON.stringify({ content }),
        });
        await load();
        refreshConversations();
      } catch (e) {
        setText(content);
        setEditing(target);
        notify(e instanceof Error ? e.message : "Не удалось изменить");
      } finally {
        setSending(false);
      }
      return;
    }

    // Файлы из черновика — как в Telegram: поле ввода НЕ блокируется,
    // каждое «летящее» сообщение сразу видно с прогрессом 0.0 МБ из N МБ,
    // а когда загрузка доходит до конца — сообщение публикуется.
    if (draftFiles.length > 0) {
      const files = draftFiles;
      const caption = emojify(text).trim();
      setDraftFiles([]);
      setText("");
      void (async () => {
        for (let i = 0; i < files.length; i++) {
          const d = files[i];
          const lid = `up-${Date.now()}_${i}`;
          const extImg = /\.(gif|webp|png|jpe?g|bmp|avif|svg)$/i.test(d.file.name);
          const extVid = /\.(mp4|webm|mov|m4v|mkv|avi)$/i.test(d.file.name);
          const isImage = d.file.type.startsWith("image/") || (extImg && !d.file.type.startsWith("video/"));
          const cap = i === 0 && caption ? caption : undefined;
          setPendingUploads((ps) => [
            ...ps,
            {
              lid,
              isImage,
              att: {
                url: "",
                name: d.file.name,
                mimeType: d.file.type || "application/octet-stream",
                size: d.file.size,
              },
              caption: cap,
              loaded: 0,
              total: d.file.size,
            },
          ]);
          try {
            const url = await uploadFileWithProgress(d.file, (loaded, total) => {
              setPendingUploads((ps) => ps.map((x) => (x.lid === lid ? { ...x, loaded, total } : x)));
            });
            const att: AttachmentInfo = {
              url,
              name: d.file.name,
              mimeType:
                d.file.type ||
                (extVid ? "video/mp4" : extImg ? "image/png" : "application/octet-stream"),
              size: d.file.size,
            };
            if (cap) att.caption = cap;
            if (d.spoiler && isImage) att.spoiler = true;
            await api("/api/messages", {
              method: "POST",
              body: JSON.stringify({
                conversationId,
                type: isImage ? "image" : "file",
                content: isImage && !cap ? url : JSON.stringify(att),
                replyToId: commentFilter?.postId ?? replyTo?.id ?? null,
              }),
            });
            if (d.preview) URL.revokeObjectURL(d.preview);
          } catch (e) {
            notify(e instanceof Error ? e.message : "Не удалось отправить файлы");
          } finally {
            setPendingUploads((ps) => ps.filter((x) => x.lid !== lid));
          }
        }
        setReplyTo(null);
        await load();
        refreshConversations();
        armSlow();
      })();
      return;
    }

    // Обычный текст
    const content = text.trim();
    if (!content) return;
    setSending(true);
    setText("");
    const reply = replyTo;
    setReplyTo(null);
    try {
      const sentMsg = await api<{ message?: { id: string } }>("/api/messages", {
        method: "POST",
        body: JSON.stringify({
          conversationId,
          type: "text",
          content,
          replyToId: commentFilter?.postId ?? reply?.id ?? null,
          silent: opts?.silent ?? false,
        }),
      });
      armSelfDestruct(sentMsg.message?.id);
      triggerFx(content);
      await load();
      refreshConversations();
      loadPostCounts();
      armSlow();
    } catch (e) {
      setText(content);
      setReplyTo(reply);
      notify(e instanceof Error ? e.message : "Не удалось отправить");
    } finally {
      setSending(false);
    }
  };

  const sendAttachment = async (
    blob: Blob,
    durationSec: number,
    type: "voice" | "video_note",
    fallbackName: string,
  ) => {
    if (!canPost) return;
    const lid = `rec-${Date.now()}`;
    setPendingUploads((ps) => [
      ...ps,
      {
        lid,
        isImage: false,
        att: {
          url: "",
          name: type === "voice" ? "Голосовое сообщение" : "Видеокружок",
          mimeType: blob.type,
          size: blob.size,
        },
        loaded: 0,
        total: blob.size,
      },
    ]);
    try {
      const ext = blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm";
      const file = new File([blob], `${type}.${ext}`, { type: blob.type });
      const url = await uploadFileWithProgress(file, (loaded, total) => {
        setPendingUploads((ps) => ps.map((x) => (x.lid === lid ? { ...x, loaded, total } : x)));
      });
      const resp = await api<{ message?: { id?: string } }>("/api/messages", {
        method: "POST",
        body: JSON.stringify({
          conversationId,
          type,
          content: JSON.stringify({
            url,
            name: fallbackName,
            mimeType: blob.type,
            size: blob.size,
            duration: Math.max(1, Math.round(durationSec)),
          }),
          replyToId: replyTo?.id ?? null,
          // Расшифровка уходит на сервер вместе с голосовым — её увидят ВСЕ,
          // а не только тот, кто записывал.
          transcript: type === "voice" ? pendingTranscriptRef.current ?? null : undefined,
        }),
      });
      // Живая расшифровка, накопленная во время записи, привязывается к сообщению —
      // кнопка «В текст» отдаст её мгновенно, без скачивания модели.
      if (type === "voice" && pendingTranscriptRef.current && resp?.message?.id) {
        setCachedTranscript(resp.message.id, pendingTranscriptRef.current);
      }
      pendingTranscriptRef.current = null;
      setReplyTo(null);
      await load();
      refreshConversations();
      armSlow();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Не удалось отправить");
    } finally {
      setPendingUploads((ps) => ps.filter((x) => x.lid !== lid));
    }
  };

  /* ─────────────────────────── черновик файлов ─────────────────────────── */

  const addDraftFiles = useCallback(
    (files: File[]) => {
      if (!canPost || files.length === 0) return;
      setDraftFiles((ds) => {
        const next = [...ds];
        for (const f of files) {
          const capBytes = me.premium ? PREMIUM_UPLOAD_BYTES : MAX_UPLOAD_BYTES;
          if (f.size > capBytes) {
            notify(`«${f.name}» больше ${me.premium ? "4 ГБ — лимит Premium" : "500 МБ (с Premium — до 4 ГБ)"}`);
            continue;
          }
          next.push({
            // уникальный даже после восстановления черновика из другого маунта
            id: `d${Date.now().toString(36)}_${++draftId.current}`,
            file: f,
            preview: f.type.startsWith("image/") ? URL.createObjectURL(f) : null,
          });
        }
        return next.slice(0, 10);
      });
      inputRef.current?.focus();
    },
    [canPost, notify, me.premium],
  );

  const removeDraftFile = (id: string) => {
    setDraftFiles((ds) => {
      const d = ds.find((x) => x.id === id);
      if (d?.preview) URL.revokeObjectURL(d.preview);
      return ds.filter((x) => x.id !== id);
    });
  };

  /* ─────────────────────────── голосовая запись ─────────────────────────── */

  /** Живая расшифровка речи прямо во время записи (браузерный движок, без внешних моделей). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const speechRecRef = useRef<any>(null);
  const liveTranscriptRef = useRef("");
  const pendingTranscriptRef = useRef<string | null>(null);
  /** Последний промежуточный (ещё не финальный) кусок речи. */
  const interimTranscriptRef = useRef("");
  /** Идёт ли живой разбор речи (чтобы движок перезапускался после пауз). */
  const speechActiveRef = useRef(false);
  /** Живой текст во время записи — видно прямо в панели записи. */
  const [livePreview, setLivePreview] = useState("");

  const startVoiceRecording = async () => {
    if (!canPost || voiceRecActive || noteRecorder) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      notify("Запись звука не поддерживается этим браузером");
      return;
    }
    try {
      // Учитываем настройки звука (шумоподавление/эхо/гейт), если пользователь их задавал
      const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints() });
      const mime = pickRecorderMime(["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]);
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      recorder.start(250);
      voiceRef.current = { recorder, stream, chunks, startedAt: Date.now() };
      setRecSecs(0);
      setVoiceRecActive(true);
      sendTyping(true);
      // Параллельно с записью слушаем микрофон штатным движком браузера (ru-RU).
      // После отправки привяжем текст к сообщению — «В текст» сработает мгновенно.
      liveTranscriptRef.current = "";
      interimTranscriptRef.current = "";
      setLivePreview("");
      speechActiveRef.current = true;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const SRC = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SRC) {
        try {
          const recognition = new SRC();
          recognition.lang = "ru-RU";
          recognition.continuous = true;
          recognition.interimResults = true;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          recognition.onresult = (e: any) => {
            interimTranscriptRef.current = "";
            for (let i = e.resultIndex; i < e.results.length; i++) {
              if (e.results[i].isFinal) {
                const chunk = `${e.results[i][0].transcript} `;
                liveTranscriptRef.current += chunk;
                console.info("[pulse-stt] фрагмент:", chunk.trim(), "| всего:", liveTranscriptRef.current.trim());
              } else {
                interimTranscriptRef.current = e.results[i][0].transcript ?? "";
              }
            }
            setLivePreview(`${liveTranscriptRef.current}${interimTranscriptRef.current}`.replace(/\s+/g, " ").trim());
          };
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          recognition.onerror = (e: any) => {
            console.warn("[pulse-stt] ошибка движка:", e?.error);
            // "no-speech"/"aborted" не критичны — рестарт в onend; сетевые тоже пробуем пережить
          };
          // Браузер сам останавливает распознавание после пауз (~60 с) —
          // пока запись идёт, перезапускаем его автоматически.
          recognition.onend = () => {
            if (speechActiveRef.current) {
              try {
                recognition.start();
                console.info("[pulse-stt] движок перезапущен (запись продолжается)");
              } catch {
                /* уже активен */
              }
            }
          };
          recognition.start();
          speechRecRef.current = recognition;
          console.info("[pulse-stt] живая расшифровка запущена (ru-RU)");
        } catch (e) {
          console.warn("[pulse-stt] живая расшифровка недоступна:", e);
        }
      } else {
        console.warn("[pulse-stt] Web Speech API не поддерживается этим браузером — сработает кнопка «В текст»");
      }
    } catch {
      notify("Не удалось получить доступ к микрофону");
    }
  };

  const stopVoiceRecording = (send: boolean) => {
    const rec = voiceRef.current;
    if (!rec) return;
    voiceRef.current = null;
    sendTyping(false);
    speechActiveRef.current = false;
    if (speechRecRef.current) {
      try { speechRecRef.current.stop(); } catch { /* уже остановлен */ }
      speechRecRef.current = null;
      // Финальные куски + последний промежуточный (движок мог не успеть его финализировать)
      const t = `${liveTranscriptRef.current} ${interimTranscriptRef.current}`.replace(/\s+/g, " ").trim();
      pendingTranscriptRef.current = t || null;
      console.info(t ? `[pulse-stt] текст прикреплён к голосовому: «${t}»` : "[pulse-stt] живого текста нет (движок ничего не вернул)");
    } else {
      pendingTranscriptRef.current = null;
    }
    const duration = (Date.now() - rec.startedAt) / 1000;
    rec.recorder.onstop = () => {
      rec.stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(rec.chunks, { type: rec.recorder.mimeType || "audio/webm" });
      if (send && blob.size > 0) {
        void sendAttachment(blob, duration, "voice", "Голосовое сообщение");
      }
    };
    try {
      rec.recorder.stop();
    } catch {
      rec.stream.getTracks().forEach((t) => t.stop());
    }
    setVoiceRecActive(false);
    setRecSecs(0);
  };

  // тик таймера записи + автостоп
  useEffect(() => {
    if (!voiceRecActive) return;
    const t = setInterval(() => setRecSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [voiceRecActive]);
  // Собеседник видит «записывает голосовое», пока запись идёт (пинг раз в 5 с)
  useEffect(() => {
    if (!voiceRecActive) return;
    const t = setInterval(() => sendTyping(true), 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceRecActive]);
  useEffect(() => {
    if (voiceRecActive && recSecs >= 300) stopVoiceRecording(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recSecs, voiceRecActive]);

  /* ─────────────────────────── действия с сообщениями ─────────────────────────── */

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
      setPinned((ps) => ps.filter((p) => p.id !== id));
      refreshConversations();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Не удалось удалить");
    }
  };

  /** Удаление — только после подтверждения (защита от случайных кликов). */
  const requestDelete = useCallback((message: ChatMessage) => {
    setConfirmDelete(message);
  }, []);

  /** Недавно загруженные стикеры (гифки) — переживают перезагрузку. */
  const RECENT_STICKERS_KEY = "pulse_recent_stickers_v1";
  const [recentStickers, setRecentStickers] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(RECENT_STICKERS_KEY);
      const arr = raw ? (JSON.parse(raw) as unknown) : [];
      return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : [];
    } catch {
      return [];
    }
  });
  const rememberSticker = useCallback((url: string) => {
    setRecentStickers((prev) => {
      const next = [url, ...prev.filter((u) => u !== url)].slice(0, 24);
      try {
        localStorage.setItem(RECENT_STICKERS_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  /** Отправить картинку-стикер по готовой ссылке. */
  const sendStickerUrl = useCallback(
    async (url: string) => {
      if (!canPost) return;
      try {
        await api("/api/messages", {
          method: "POST",
          body: JSON.stringify({
            conversationId,
            type: "image",
            content: JSON.stringify({ url, sticker: true }),
            replyToId: null,
          }),
        });
        await load();
        refreshConversations();
      } catch (e) {
        notify(e instanceof Error ? e.message : "Не удалось отправить стикер");
      }
    },
    [canPost, conversationId, load, refreshConversations, notify],
  );

  /** Загрузить свой стикер (гифку/картинку ЛЮБОГО расширения) и отправить его. */
  const [stickerBusy, setStickerBusy] = useState(false);
  const sendStickerFile = useCallback(
    async (file: File) => {
      // Гифку/вебм/пнг/джипег принимаем даже если браузер не определил MIME
      // («гифка любого расширения»): смотрим и тип, и имя файла.
      const okType = file.type.startsWith("image/");
      const okName = /\.(gif|webp|png|jpe?g)$/i.test(file.name);
      if (!okType && !okName) {
        notify("Стикер — это картинка или гифка (gif, webp, png, jpg)");
        return;
      }
      if (file.size > 8 * 1024 * 1024) {
        notify("Стикер — до 8 МБ");
        return;
      }
      setStickerBusy(true);
      try {
        const url = await uploadFile(file);
        rememberSticker(url);
        await sendStickerUrl(url);
      } catch (e) {
        notify(e instanceof Error ? e.message : "Не удалось отправить стикер");
      } finally {
        setStickerBusy(false);
      }
    },
    [rememberSticker, sendStickerUrl, notify],
  );

  /** Удалить чат (личный — у себя или для всех; группа — выйти/удалить). */
  const deleteChat = useCallback(async () => {
    if (deletingChat) return;
    setDeletingChat(true);
    try {
      const qs = kind === "direct" && deleteChatForAll ? "?forAll=1" : "";
      await api(`/api/conversations/${conversationId}${qs}`, { method: "DELETE" });
      setConfirmDeleteChat(false);
      onBack();
      refreshConversations();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Не удалось удалить чат");
      setDeletingChat(false);
    }
  }, [conversationId, kind, deleteChatForAll, deletingChat, onBack, refreshConversations, notify]);

  const toggleReaction = async (messageId: string, emoji: string) => {
    // оптимистично — опрос подтвердит
    setMessages((ms) =>
      ms.map((m) => {
        if (m.id !== messageId) return m;
        const rs = [...(m.reactions ?? [])];
        const idx = rs.findIndex((r) => r.emoji === emoji);
        if (idx >= 0) {
          const r = rs[idx];
          if (r.mine) {
            if (r.count <= 1) rs.splice(idx, 1);
            else rs[idx] = { ...r, count: r.count - 1, mine: false };
          } else {
            rs[idx] = { ...r, count: r.count + 1, mine: true };
          }
        } else {
          rs.push({ emoji, count: 1, mine: true });
        }
        return { ...m, reactions: rs };
      }),
    );
    try {
      const d = await api<{ reactions: MessageReaction[] }>(`/api/messages/${messageId}/reactions`, {
        method: "POST",
        body: JSON.stringify({ emoji }),
      });
      setMessages((ms) => ms.map((m) => (m.id === messageId ? { ...m, reactions: d.reactions } : m)));
    } catch (e) {
      notify(e instanceof Error ? e.message : "Не удалось поставить реакцию");
      void load();
    }
  };

  /* ─────────────────────────── закреплённые сообщения ─────────────────────────── */

  /** Можно ли закрепить сообщение: в ЛС — любой, в группе/канале — админы или автор. */
  const canPinMessage = useCallback(
    (m: ChatMessage) => {
      if (!meta) return false;
      if (kind === "direct") return true;
      return meta.myRole === "owner" || meta.myRole === "admin" || m.senderId === me.id;
    },
    [meta, kind, me.id],
  );

  const togglePin = async (m: ChatMessage) => {
    try {
      const d = await api<{ pinned: boolean }>(`/api/messages/${m.id}/pin`, { method: "POST" });
      setPinned((ps) => {
        if (d.pinned) return [m, ...ps.filter((x) => x.id !== m.id)].slice(0, 10);
        return ps.filter((x) => x.id !== m.id);
      });
      setPinnedIdx(0);
      setMessages((ms) => ms.map((x) => (x.id === m.id ? { ...x, pinned: d.pinned } : x)));
      notify(d.pinned ? "Сообщение закреплено" : "Сообщение откреплено");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Не удалось закрепить");
    }
  };

  /* ─────────────────────────── поиск по чату ─────────────────────────── */

  useEffect(() => {
    if (!searchOpen) return;
    const q = searchQuery.trim();
    if (q.length < 1) {
      setSearchHits(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const d = await api<{ results: SearchHit[] }>(
          `/api/messages/search?conversationId=${conversationId}&q=${encodeURIComponent(q)}`,
        );
        setSearchHits(d.results);
      } catch {
        setSearchHits([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [searchQuery, searchOpen, conversationId]);

  /* ─────────────────────────── эмодзи-пикер ─────────────────────────── */

  const insertEmoji = (emoji: string) => {
    // Кастом-эмодзи в поле ввода показываем настоящим эмодзи, а не токеном
    const glyph = /^:ce_[a-z0-9_]+:$/.test(emoji) ? customEmojiGlyphByToken(emoji) : null;
    const ins = glyph ?? emoji;
    // Недавние эмодзи: пишем в localStorage (до 24 штук, без повторов)
    try {
      const cur = JSON.parse(localStorage.getItem("pulse_recent_emoji_v1") ?? "[]") as string[];
      const next = [ins, ...cur.filter((x) => x !== ins && x !== emoji)].slice(0, 24);
      localStorage.setItem("pulse_recent_emoji_v1", JSON.stringify(next));
    } catch { /* ignore */ }
    const el = inputRef.current;
    if (!el) {
      setText((t) => t + ins);
      return;
    }
    const start = el.selectionStart ?? text.length;
    const end = el.selectionEnd ?? text.length;
    const next = text.slice(0, start) + ins + text.slice(end);
    setText(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + ins.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const emojiBtnRef = useRef<HTMLButtonElement | null>(null);
  const emojiPickRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!emojiOpen) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (emojiBtnRef.current?.contains(t) || emojiPickRef.current?.contains(t)) return;
      setEmojiOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [emojiOpen]);

  const sendTyping = (recording?: boolean) => {
    const now = Date.now();
    // Сигналы записи не троттлим: важно и «начал», и «закончил»
    if (recording === undefined && now - lastTypingSent.current < 2_500) return;
    lastTypingSent.current = now;
    void api(`/api/conversations/${conversationId}/typing`, {
      method: "POST",
      body: JSON.stringify(recording === undefined ? {} : { recording }),
    }).catch(() => {});
  };

  // Открытие по ссылке «#msg=<id>»: прыгаем, как только история загрузилась.
  useEffect(() => {
    if (!initialJumpId || !loaded) return;
    if (messages.some((m) => m.id === initialJumpId)) {
      jumpTo(initialJumpId);
      onJumpConsumed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialJumpId, loaded, messages.length]);

  const jumpTo = (id: string) => {
    const el = scrollRef.current?.querySelector<HTMLElement>(`[data-mid="${id}"]`);
    if (!el) {
      notify("Это сообщение старше загруженной истории");
      return;
    }
    // scrollIntoView есть не везде (старые Safari/тестовые окружения) — страховка
    if (typeof el.scrollIntoView === "function") {
      try {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      } catch {
        el.scrollTop = 0;
      }
    }
    setHighlight(id);
    setTimeout(() => setHighlight(null), 1400);
  };

  const startReply = (m: ChatMessage) => {
    setEditing(null);
    setReplyTo(m);
    inputRef.current?.focus();
  };

  const startEdit = (m: ChatMessage) => {
    const att = parseAttachment(m.type, m.content);
    setReplyTo(null);
    setEditing(m);
    setText(m.type === "text" ? m.content : (att?.caption ?? ""));
    inputRef.current?.focus();
  };

  // Классика мессенджеров: текстовые смайлики при отправке становятся эмодзи
  const emojify = (s: string) =>
    // Глифы кастом-эмодзи в поле ввода → токены, чтобы в сообщении они анимировались
    customEmojisToTokens(
      s
        .replace(/<3/g, "❤️")
        .replace(/:\)/g, "🙂")
        .replace(/:\(/g, "🙁")
        .replace(/;\)/g, "😉")
        .replace(/:D/g, "😄"),
    );

  /** Скачать историю чата простым текстовым файлом. */
  const exportHistory = () => {
    const lines = messages.map((m) => {
      const who = m.senderId === me.id ? "Вы" : m.sender?.displayName || "…";
      const when = new Date(m.createdAt).toLocaleString("ru-RU");
      const attached = m.type !== "text" ? " [вложение]" : "";
      const body = (m.content || "") + attached;
      return `${when} — ${who}: ${body}`;
    });
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `pulse-${title.replace(/\s+/g, "_").slice(0, 40) || "chat"}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // Esc закрывает поиск/ответ/редактирование; Ctrl+F открывает поиск по чату
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setSearchOpen(true);
        return;
      }
      if (e.key !== "Escape") return;
      // Поверх чата открыто модальное окно — Esc достаётся ему, чат не трогаем
      if (isModalOpen()) return;
      if (searchOpen) setSearchOpen(false);
      else if (replyTo) setReplyTo(null);
      else if (editing) setEditing(null);
      // Больше ничего не открыто — выходим из чата в список (как в ТГ)
      else if (
        !lightbox &&
        !emojiOpen &&
        !sendMenu &&
        !pollDraft &&
        !forwarding &&
        !confirmDelete &&
        !confirmDeleteChat &&
        !deleteChatForAll &&
        !text
      ) {
        onBack();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [searchOpen, replyTo, editing, lightbox, emojiOpen, sendMenu, pollDraft, forwarding, confirmDelete, confirmDeleteChat, deleteChatForAll, text, onBack]);

  // Сколько комментариев в обсуждении канала — цифра под постами
  const loadPostCounts = useCallback(() => {
    if (kind !== "channel") return;
    api<{ discussion: { id: string } | null; postCounts?: Record<string, number> }>(
      `/api/conversations/${conversationId}/discussion`,
    )
      .then((d) => setPostCounts(d.postCounts ?? {}))
      .catch(() => {});
  }, [kind, conversationId]);
  useEffect(() => {
    loadPostCounts();
    // счётчики живые: подтягиваем, пока открыт канал
    const t = window.setInterval(loadPostCounts, 30_000);
    return () => window.clearInterval(t);
  }, [loadPostCounts]);

  // Автофокус поля ввода при открытии чата
  useEffect(() => {
    if (loaded) inputRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  // Счётчик сообщений, пришедших, пока ты не внизу ленты
  useEffect(() => {
    if (messages.length > prevLenRef.current && loadedRef.current && !atBottomRef.current) {
      setNewBelow((n) => n + (messages.length - prevLenRef.current));
    }
    prevLenRef.current = messages.length;
  }, [messages.length]);

  const copyMessage = async (m: ChatMessage) => {
    const att = parseAttachment(m.type, m.content);
    let value = m.type === "text" ? m.content : (att?.caption ?? att?.url ?? "");
    // Служебные префиксы (опрос, цитата истории, визитка…) при копировании не нужны
    const sq = parseStoryQuote(value);
    if (sq) value = sq.text;
    else if (value.startsWith("poll:")) value = "";
    else if (value.startsWith("contact:") || value.startsWith("location:")) value = "";
    else if (value.startsWith("gifpack:")) value = "";
    if (!value) return;
    const ok = await copyToClipboard(value);
    notify(ok ? "Скопировано" : "Не удалось скопировать");
  };

  /* ─────────────────────────── контекстное меню (ПКМ / долгое нажатие) ─────────────────────────── */

  const openContextMenu = useCallback(
    (x: number, y: number, message: ChatMessage) => {
      setMenuOpen(false);
      setCtxMenu({ x, y, message });
    },
    [],
  );

  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    // Клик «вне» закрывает меню через прозрачный фон (см. MessageContextMenu):
    // window-click-слушатель не годится — клик, открывший меню, долетел бы
    // до window уже ПОСЛЕ добавления слушателя и мгновенно закрывал меню.
    window.addEventListener("resize", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [ctxMenu]);

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

  /** Ссылка-приглашение чата (#group=токен) — для групп и каналов. */
  const copyChatLink = async () => {
    try {
      const d = await api<{ token: string }>(`/api/conversations/${conversationId}/invites`, {
        method: "POST",
      });
      const url = `${window.location.origin}${window.location.pathname}#group=${d.token}`;
      const ok = await copyToClipboard(url);
      notify(ok ? "Ссылка на чат скопирована" : "Не удалось скопировать — небезопасный контекст");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Не удалось получить ссылку");
    }
  };

  /** Быстрое сохранение сообщения в «Избранное» (чат с самим собой). */
  const saveToSaved = async (m: ChatMessage) => {
    try {
      const d = await api<{ conversation: { id: string } }>("/api/conversations", {
        method: "POST",
        body: JSON.stringify({ userId: me.id }),
      });
      const att = parseAttachment(m.type, m.content);
      const body = {
        conversationId: d.conversation.id,
        type: m.type === "call" ? "text" : m.type,
        content: m.type === "text" || m.type === "call" ? m.content : m.content,
        replyToId: null,
      };
      void att;
      await api("/api/messages", { method: "POST", body: JSON.stringify(body) });
      notify("Сохранено в «Избранное»");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Не удалось сохранить");
    }
  };

  /** Экспорт истории чата в текстовый файл. */
  const exportChat = async () => {
    try {
      const d = await api<MessageLoad>(`/api/messages?conversationId=${conversationId}`);
      const lines = d.messages.map((m) => {
        const who = m.senderId === me.id ? me.displayName : (m.sender?.displayName ?? "Участник");
        const when = new Date(m.createdAt).toLocaleString("ru-RU");
        const body = m.type === "text" ? m.content : `[${m.type}]`;
        return `[${when}] ${who}: ${body}`;
      });
      const blob = new Blob([`${title} — история Pulse\n\n${lines.join("\n")}`], {
        type: "text/plain;charset=utf-8",
      });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `pulse-${title.replace(/[^\wа-яА-Я-]+/g, "_")}.txt`;
      a.click();
      URL.revokeObjectURL(a.href);
      notify("История выгружена в файл");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Не удалось выгрузить историю");
    }
  };

  const headerSubtitle = () => {
    // Собеседник записывает голосовое — видно по свежему recordingAt
    const now = Date.now();
    void nowTick;
    const recPeers =
      kind === "direct"
        ? peerState?.recordingAt && now - new Date(peerState.recordingAt).getTime() < 10_000
          ? [peerState]
          : []
        : members
            .filter(
              (m) =>
                m.user.id !== me.id &&
                m.recordingAt &&
                now - new Date(m.recordingAt).getTime() < 10_000,
            )
            .map((m) => m.user);
    if (recPeers.length > 0) {
      const names = recPeers.map((u) => u.displayName.split(" ")[0]);
      return {
        text:
          names.length === 1
            ? `${names[0]} записывает голосовое…`
            : `${names.slice(0, 2).join(", ")} записывают голосовое…`,
        accent: true,
      };
    }
    if (typingMembers.length > 0) {
      const names = typingMembers.map((m) => m.user.displayName.split(" ")[0]);
      return {
        text: names.length === 1 ? `${names[0]} печатает…` : `${names.slice(0, 2).join(", ")} печатают…`,
        accent: true,
      };
    }
    if (isSaved) return { text: "сохранённые сообщения", accent: false };
    if (kind === "direct") {
      // Показываем и статус, и @юзернейм — «ник и юз», а не что-то одно
      const status = lastSeenLabel(peerState?.lastSeenAt ?? null, !!peerState?.online);
      const uname = peerState?.username ? ` · @${peerState.username}` : "";
      return { text: `${status}${uname}`, accent: !!peerState?.online };
    }
    const online = members.filter((m) => m.user.online).length;
    if (kind === "channel") {
      return {
        text: `${meta?.memberCount ?? members.length} подписчиков${postCount != null ? ` · ${postCount} записей` : ""}`,
        accent: false,
      };
    }
    return {
      text: `${meta?.memberCount ?? members.length} участников · ${online} в сети`,
      accent: false,
    };
  };
  const subtitle = headerSubtitle();

  const canSendSomething = !!text.trim() || draftFiles.length > 0;

  return (
    <div className="relative flex h-full min-w-0 flex-1 flex-col">
      {/* Эффекты сообщений: эмодзи взлетают, как в ТГ */}
      <div className="pointer-events-none absolute inset-0 z-50 overflow-hidden">
        {fx.map((f) => (
          <motion.span
            key={f.id}
            initial={{ opacity: 1, y: 0, scale: 0.5 }}
            animate={{ opacity: 0, y: -240, scale: 2 }}
            transition={{ duration: 1.5, ease: "easeOut" }}
            className="absolute bottom-28 text-4xl"
            style={{ left: `${f.x}%` }}
          >
            {f.emoji}
          </motion.span>
        ))}
      </div>
      {/* Обои: key по значению — при смене пресета элемент пересоздаётся,
          и CSS-анимация «живых» обоев гарантированно перезапускается
          (раньше второй живой пресет не играл до перезагрузки страницы). */}
      <div
        key={wallpaper ?? "default"}
        // Без обоев — фирменный узор из точек, чтобы чат не был «пустым»
        className={`pointer-events-none absolute inset-0 ${wallpaper ? "" : "chat-pattern"}`}
        style={wallpaperStyle(wallpaper)}
        aria-hidden
      />
      {wallpaper?.startsWith("/api/files/") && (
        <div className="pointer-events-none absolute inset-0 bg-[#16181c]/70" aria-hidden />
      )}

      {/* Шапка — z-30: выпадающее меню «⋮» должно быть НАД областью сообщений
          (раньше оба блока были z-10, сообщения перекрывали меню — клики «не работали») */}
      <div className="glass-strong chrome-line relative z-30 flex items-center gap-3 border-b border-white/8 px-4 py-3">
        <button
          onClick={onBack}
          className="glass flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white/70 md:hidden"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>

        <button
          onClick={kind === "direct" ? onViewPeer : onOpenInfo}
          title={meta?.about ? `Описание: ${meta.about}` : undefined}
          className="flex min-w-0 items-center gap-3 text-left"
        >
          <span
            className={`relative shrink-0 rounded-full ${
              kind === "direct" && peerState?.premium
                ? "bg-gradient-to-tr from-amber-300 via-fuchsia-400 to-sky-400 p-[2px]"
                : ""
            }`}
          >
            <Avatar
              name={title}
              src={avatar}
              size={42}
              online={kind === "direct" ? peerState?.online : undefined}
            />
          </span>
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 truncate text-[15px] font-semibold">
              {commentFilter && onExitCommentMode && (
                <button
                  onClick={onExitCommentMode}
                  title="Назад в канал"
                  className="flex items-center gap-1 rounded-lg bg-white/10 px-2 py-0.5 text-[12px] text-white/70 hover:bg-white/15"
                >
                  <ArrowLeft className="h-3 w-3" /> {commentFilter.channelTitle}
                </button>
              )}
              <span
                className="truncate"
                style={
                  kind === "direct" && peerState?.nameColor
                    ? { color: peerState.nameColor }
                    : undefined
                }
              >
                {commentFilter ? "Комментарии" : title}
              </span>
              {/* Звезда Premium — как в ТГ */}
              {kind === "direct" && peerState?.premium && (
                <Star className="h-3.5 w-3.5 shrink-0 fill-amber-300 text-amber-300" />
              )}
              {/* Кастомный статус-эмодзи собеседника (эмодзи или анимированная гифка) */}
              {kind === "direct" && peerState?.statusEmoji && (
                <StatusEmoji value={peerState.statusEmoji} size={28} />
              )}
              {isSaved && <Bookmark className="h-3.5 w-3.5 shrink-0 text-amber-300" />}
              {isSpace && kind === "channel" && <Megaphone className="h-3.5 w-3.5 shrink-0 text-slate-400" />}
              {isSpace && kind === "group" && <Hash className="h-3.5 w-3.5 shrink-0 text-slate-400" />}
              {isSpace && meta?.isPrivate && <Lock className="h-3 w-3 shrink-0 text-white/25" />}
            </p>
            <p className={`truncate text-xs ${subtitle.accent ? "text-slate-400" : "text-white/35"}`}>
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
            onClick={() => setSearchOpen((v) => !v)}
            title="Поиск по чату"
            className={`glass flex h-10 w-10 items-center justify-center rounded-xl transition-colors hover:text-white ${
              searchOpen ? "text-slate-400" : "text-white/75"
            }`}
          >
            <Search className="h-4.5 w-4.5" />
          </button>
          {onToggleMuteChat && (
            <button
              onClick={onToggleMuteChat}
              title={muted ? "Включить уведомления" : "Заглушить чат"}
              className={`glass flex h-10 w-10 items-center justify-center rounded-xl transition-colors hover:text-white ${
                muted ? "text-amber-300" : "text-white/75"
              }`}
            >
              {muted ? <BellRing className="h-4.5 w-4.5" /> : <BellOff className="h-4.5 w-4.5" />}
            </button>
          )}
          {!isSaved && kind !== "channel" && (
            <>
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
                className="glass flex h-10 w-10 items-center justify-center rounded-xl text-white/75 transition-colors hover:text-white sm:flex disabled:opacity-40"
              >
                <Video className="h-4.5 w-4.5" />
              </button>
            </>
          )}
          <div className="relative">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              title="Меню чата"
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
                    <MenuItem
                      icon={<Download className="h-4 w-4" />}
                      label="Скачать историю (.txt)"
                      onClick={() => {
                        setMenuOpen(false);
                        exportHistory();
                      }}
                    />
                    <div className="my-1 h-px bg-white/8" />
                    {isSpace && (
                      <MenuItem
                        icon={<Copy className="h-4 w-4 text-slate-400" />}
                        label="Ссылка-приглашение"
                        onClick={() => {
                          setMenuOpen(false);
                          void copyChatLink();
                        }}
                      />
                    )}
                    <MenuItem
                      icon={<Download className="h-4 w-4 text-slate-400" />}
                      label="Экспорт истории (.txt)"
                      onClick={() => {
                        setMenuOpen(false);
                        void exportChat();
                      }}
                    />
                    <div className="my-1 h-px bg-white/8" />
                    <MenuItem
                      icon={<Trash2 className="h-4 w-4 text-rose-300" />}
                      label={kind === "direct" ? "Удалить чат" : isSpace ? "Покинуть / удалить" : "Удалить чат"}
                      danger
                      onClick={() => {
                        setMenuOpen(false);
                        setConfirmDeleteChat(true);
                      }}
                    />
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Плашка закреплённого сообщения */}
      <AnimatePresence>
        {pinnedCurrent && (
          <motion.div
            key="pinned-bar"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="relative z-20 overflow-hidden border-b border-white/8 bg-[#5865f2]/8"
          >
            <div className="mx-auto flex max-w-2xl items-center gap-2 px-4 py-1.5">
              <Pin className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              <button
                onClick={() => jumpTo(pinnedCurrent.id)}
                title="Перейти к сообщению"
                className="min-w-0 flex-1 truncate text-left text-xs text-white/70"
              >
                <span className="font-semibold text-slate-400">
                  {pinnedCurrent.senderId === me.id ? "Вы" : (pinnedCurrent.sender?.displayName ?? "")}:{" "}
                </span>
                <PreviewLabel type={pinnedCurrent.type} content={pinnedCurrent.content} />
              </button>
              {pinned.length > 1 && (
                <span className="flex shrink-0 items-center gap-0.5 text-[11px] text-white/40 tabular-nums">
                  <button
                    onClick={() => setPinnedIdx((i) => (i - 1 + pinned.length) % pinned.length)}
                    className="rounded-full p-0.5 hover:text-white"
                    title="Предыдущее закреплённое"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  {Math.min(pinnedIdx, pinned.length - 1) + 1}/{pinned.length}
                  <button
                    onClick={() => setPinnedIdx((i) => (i + 1) % pinned.length)}
                    className="rounded-full p-0.5 hover:text-white"
                    title="Следующее закреплённое"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </span>
              )}
              {canPinMessage(pinnedCurrent) && (
                <button
                  onClick={() => void togglePin(pinnedCurrent)}
                  title="Открепить"
                  className="shrink-0 rounded-full p-1 text-white/40 transition-colors hover:text-rose-300"
                >
                  <PinOff className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Панель поиска по чату */}
      <AnimatePresence>
        {searchOpen && (
          <motion.div
            key="search-panel"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="relative z-20 overflow-hidden border-b border-white/8 bg-[#1e2127]/90"
          >
            <div className="mx-auto max-w-2xl px-4 py-2.5">
              <div className="flex items-center gap-2.5">
                <Search className="h-4 w-4 shrink-0 text-white/35" />
                <input
                  autoFocus
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setSearchOpen(false);
                  }}
                  placeholder="Поиск по чату…"
                  maxLength={100}
                  className="ring-focus w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm transition-all placeholder:text-white/30"
                />
                {searching && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-white/40" />}
                <button
                  onClick={() => setSearchOpen(false)}
                  className="shrink-0 rounded-full p-1.5 text-white/50 transition-colors hover:text-white"
                  title="Закрыть поиск"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              {searchHits && searchHits.length > 0 && (
                <div className="nice-scroll mt-2 max-h-64 space-y-0.5 overflow-y-auto">
                  {searchHits.map((h) => (
                    <button
                      key={h.id}
                      onClick={() => {
                        jumpTo(h.id);
                        setSearchOpen(false);
                      }}
                      className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-white/8"
                    >
                      <Avatar name={h.senderName} src={h.sender?.avatarUrl ?? null} size={28} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] text-white/85">{cleanSnippet(h.preview)}</span>
                        <span className="block text-[11px] text-white/35">
                          {h.senderName} · {dayLabel(h.createdAt)} {timeHHmm(h.createdAt)}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {searchHits && searchHits.length === 0 && !searching && searchQuery.trim().length > 0 && (
                <p className="px-2 pt-2 text-xs text-white/40">Ничего не найдено</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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

      {/* Сообщения (и зона перетаскивания файлов) */}
      <div
        ref={scrollRef}
        className="nice-scroll relative z-10 min-h-0 flex-1 overflow-y-auto px-4 py-5"
        onScroll={(e) => {
          const el = e.currentTarget;
          const gap = el.scrollHeight - el.scrollTop - el.clientHeight;
          atBottomRef.current = gap < 120;
          if (atBottomRef.current) setNewBelow(0);
          setShowJump(gap > 400);
        }}
        onDragOver={(e) => {
          if (!canPost) return;
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={(e) => {
          if (e.currentTarget.contains(e.relatedTarget as Node)) return;
          setDragOver(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const files = Array.from(e.dataTransfer.files ?? []);
          if (files.length > 0) addDraftFiles(files);
        }}
      >
        {dragOver && (
          <div className="pointer-events-none absolute inset-2 z-20 flex items-center justify-center rounded-3xl border-2 border-dashed border-[#5865f2]/60 bg-[#5865f2]/10 backdrop-blur-sm">
            <p className="rounded-2xl bg-black/60 px-5 py-3 text-sm font-medium text-white/90">
              Отпустите — прикрепим к сообщению
            </p>
          </div>
        )}
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
                : "Здесь пока пусто. Напишите первое сообщение — или запишите голосовое 👋"}
            </p>
          </div>
        ) : (
          <div className="mx-auto flex max-w-2xl flex-col gap-0.5">
            {(() => {
              const seq = { n: 0 };
              return listMessages.map((m, i) => {
              const prev = listMessages[i - 1];
              // Посты канала нумеруются (#1, #2…) — удобно ссылаться
              const postNum =
                kind === "channel" && m.type !== "call" && !m.deletedAt ? ++seq.n : null;
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
              // Конец ли группы сообщений: для радиусов «как в ТГ»
              const next = listMessages[i + 1];
              const lastOfGroup = !(
                next &&
                sameDay(m.createdAt, next.createdAt) &&
                next.senderId === m.senderId &&
                m.type !== "call" &&
                next.type !== "call" &&
                new Date(next.createdAt).getTime() - new Date(m.createdAt).getTime() < 5 * 60_000
              );
              // Упоминание меня: строка подсвечивается, как в больших мессенджерах
              const mentionMe =
                !own && m.type === "text" && m.content.toLowerCase().includes(`@${me.username.toLowerCase()}`);

              return (
                <div
                  key={m.id}
                  data-mid={m.id}
                  className={`relative ${mentionMe ? "rounded-xl bg-[#5865f2]/10 ring-1 ring-[#5865f2]/25" : ""}`}
                >
                  {unreadBefore === m.id && (
                    <div className="flex items-center gap-3 py-2">
                      <span className="h-px flex-1 bg-rose-400/30" />
                      <span className="rounded-full bg-rose-500/15 px-3 py-1 text-[11px] font-semibold text-rose-300">
                        Непрочитанные
                      </span>
                      <span className="h-px flex-1 bg-rose-400/30" />
                    </div>
                  )}
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
                      lastOfGroup={lastOfGroup}
                      read={own && new Date(m.createdAt).getTime() <= readUpTo}
                      canDelete={canDelete}
                      canPin={canPinMessage(m)}
                      highlighted={highlight === m.id}
                      onOpenImage={setLightbox}
                      onDelete={() => requestDelete(m)}
                      onReply={() => startReply(m)}
                      onDiscuss={
                        kind === "channel" && onOpenDiscussion ? onOpenDiscussion : undefined
                      }
                      commentCount={postCounts?.[m.id] ?? 0}
                      postNum={postNum}
                      restricted={!!meta?.restricted}
                      premium={isPremium}
                      meUsername={me.username}
                      onOpenUsername={onOpenUsername}
                      onEdit={() => startEdit(m)}
                      onPin={() => void togglePin(m)}
                      onReact={(emoji) => void toggleReaction(m.id, emoji)}
                      onDoubleTap={() => void toggleReaction(m.id, "❤️")}
                      onMenu={openContextMenu}
                      onJump={jumpTo}
                      onViewUser={onViewUser}
                    />
                  )}
                </div>
              );
              });
            })()}
          </div>
        )}
        {pendingUploads.length > 0 && (
          <div className="mx-auto flex w-full max-w-2xl flex-col gap-0.5">
            {pendingUploads.map((u) => (
              <div key={u.lid} className="flex justify-end py-0.5">
                <div className="bubble-own bubble-own-radius max-w-[75%] px-4 py-2.5">
                  <div className="flex items-center gap-3">
                    <span className="glass flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
                      <PendingFileIcon className="h-4 w-4 text-slate-400" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{u.att.name}</p>
                      <p className="text-[11px] text-white/50 tabular-nums">
                        {formatBytes(u.loaded)} из {formatBytes(u.total)}
                      </p>
                      <div className="mt-1 h-1 w-40 overflow-hidden rounded-full bg-white/20">
                        <div
                          className="h-full bg-white/70 transition-all"
                          style={{ width: `${Math.min(100, (u.loaded / Math.max(1, u.total)) * 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                  {u.caption && <p className="mt-1.5 text-[13px] text-white/70">{u.caption}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
        {showJump && (
          <div className="sticky bottom-2 z-20 flex justify-end">
            <button
              onClick={() => {
                scrollToEnd(true);
                setNewBelow(0);
                setShowJump(false);
              }}
              className="glass-strong flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold text-white/80"
              title="К новым сообщениям"
            >
              <ArrowDown className="h-3.5 w-3.5" />
              {newBelow > 0 ? `Новых: ${newBelow}` : "Вниз"}
            </button>
          </div>
        )}
      </div>

      {/* Ответ / редактирование / поле ввода */}
      <div className="glass-strong relative z-10 border-t border-white/8 px-4 py-3">
        <div className="mx-auto max-w-2xl">
          {/* Черновик файлов: превью + подпись + кнопка «Отправить» */}
          <AnimatePresence>
            {draftFiles.length > 0 && (
              <motion.div
                key="draft"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="mb-2 rounded-2xl border border-white/8 bg-white/[0.04] p-2.5">
                  <p className="mb-2 px-1 text-[11px] font-semibold tracking-wide text-white/40 uppercase">
                    К отправке · {draftFiles.length} шт.
                    {uploading ? " · загрузка…" : ""}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {draftFiles.map((d) => (
                      <div
                        key={d.id}
                        className="group/draft relative flex items-center gap-2.5 rounded-xl border border-white/10 bg-black/25 p-2 pr-3"
                      >
                        {d.preview ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={d.preview} alt={d.file.name} className="h-12 w-12 rounded-lg object-cover" />
                        ) : (
                          <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-white/8">
                            <DraftFileIcon mime={d.file.type} />
                          </span>
                        )}
                        <span className="max-w-36">
                          <span className="block truncate text-xs font-medium text-white/85">{d.file.name}</span>
                          <span className="block text-[11px] text-white/35">{formatBytes(d.file.size)}</span>
                        </span>
                        {d.preview && (
                          <button
                            onClick={() =>
                              setDraftFiles((cur) =>
                                cur.map((x) => (x.id === d.id ? { ...x, spoiler: !x.spoiler } : x)),
                              )
                            }
                            className={`rounded-full p-1 transition-colors ${
                              d.spoiler
                                ? "bg-[#5865f2]/60 text-white"
                                : "bg-black/60 text-white/70 hover:text-white"
                            }`}
                            title={d.spoiler ? "Спойлер включён" : "Отправить как спойлер (размыто)"}
                          >
                            <EyeOff className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => removeDraftFile(d.id)}
                          className="rounded-full bg-black/60 p-1 text-white/70 transition-colors hover:text-rose-300"
                          title="Убрать"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {/* (ниже очередь отложенных) */}
          {/* Отложенные сообщения — очередь с возможностью отмены */}

          {scheduled.length > 0 && (
            <div className="glass mb-1.5 rounded-2xl px-3.5 py-2">
              <p className="pb-1 text-[11px] font-semibold tracking-wide text-white/40 uppercase">
                Отложенные · {scheduled.length}
              </p>
              {scheduled.map((x) => (
                <div key={x.id} className="flex items-center gap-2 py-0.5 text-[12px]">
                  <Clock className="h-3 w-3 shrink-0 text-white/35" />
                  <span className="text-white/50 tabular-nums">
                    {new Date(x.at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-white/65">{x.text}</span>
                  <button
                    onClick={() => removeScheduled(x.id)}
                    className="text-white/30 hover:text-rose-300"
                    title="Отменить"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Хэштеги Избранного — клик фильтрует заметки */}
          {isSaved && savedTags.length > 0 && (
            <div className="glass-strong mb-2 flex flex-wrap items-center gap-1.5 rounded-2xl px-3 py-2">
              <span className="text-[11px] font-semibold tracking-widest text-white/30 uppercase">Теги</span>
              {tagFilter && (
                <button
                  onClick={() => setTagFilter(null)}
                  className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] text-white/70 hover:bg-white/15"
                >
                  Все ✕
                </button>
              )}
              {savedTags.map((t) => (
                <button
                  key={t}
                  onClick={() => setTagFilter((cur) => (cur === t ? null : t))}
                  className={`rounded-full px-2.5 py-1 text-[11px] transition-colors ${
                    tagFilter === t ? "bg-[#5865f2] text-white" : "bg-white/5 text-sky-300 hover:bg-white/10"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          )}

          {/* Создание опроса — как в ТГ */}
          {pollDraft && (
            <div className="glass-strong mb-2 rounded-2xl p-3.5">
              <div className="flex items-center gap-2 pb-2">
                <BarChart3 className="h-4 w-4 text-white/50" />
                <p className="flex-1 text-[13px] font-semibold text-white/80">Новый опрос</p>
                <button
                  onClick={() => setPollDraft(null)}
                  title="Отменить опрос"
                  className="rounded-lg p-1 text-white/40 hover:bg-white/10 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <input
                value={pollDraft.q}
                onChange={(e) => setPollDraft({ ...pollDraft, q: e.target.value })}
                maxLength={255}
                placeholder="Вопрос…"
                className="ring-focus mb-2 w-full rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-sm"
              />
              {pollDraft.opts.map((o, i) => (
                <div key={i} className="mb-1.5 flex items-center gap-1.5">
                  {pollDraft.quiz != null && (
                    <button
                      onClick={() => setPollDraft({ ...pollDraft, quiz: pollDraft.quiz === i ? null : i })}
                      title={pollDraft.quiz === i ? "Правильный ответ" : "Отметить правильным"}
                      className={`grid h-6 w-6 shrink-0 place-items-center rounded-lg border ${
                        pollDraft.quiz === i
                          ? "border-emerald-400/70 bg-emerald-400/20 text-emerald-300"
                          : "border-white/15 text-white/25 hover:text-emerald-300"
                      }`}
                    >
                      <Check className="h-3 w-3" />
                    </button>
                  )}
                  <input
                    value={o}
                    onChange={(e) => {
                      const opts = [...pollDraft.opts];
                      opts[i] = e.target.value;
                      setPollDraft({ ...pollDraft, opts });
                    }}
                    maxLength={100}
                    placeholder={`Вариант ${i + 1}`}
                    className="ring-focus w-full rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-sm"
                  />
                  {pollDraft.opts.length > 2 && (
                    <button
                      onClick={() => setPollDraft({ ...pollDraft, opts: pollDraft.opts.filter((_, j) => j !== i) })}
                      title="Убрать вариант"
                      className="shrink-0 rounded-lg p-1.5 text-white/35 hover:bg-white/10 hover:text-rose-300"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
              <div className="mt-1 flex flex-wrap items-center gap-3">
                <label className="flex cursor-pointer items-center gap-1.5 text-[12px] text-white/55">
                  <input
                    type="checkbox"
                    checked={!!pollDraft.multi}
                    onChange={(e) => setPollDraft({ ...pollDraft, multi: e.target.checked, quiz: e.target.checked ? null : pollDraft.quiz })}
                    className="accent-[#5865f2]"
                  />
                  Несколько ответов
                </label>
                <label className="flex cursor-pointer items-center gap-1.5 text-[12px] text-white/55">
                  <input
                    type="checkbox"
                    checked={pollDraft.quiz != null || false}
                    onChange={(e) => setPollDraft({ ...pollDraft, quiz: e.target.checked ? 0 : null, multi: e.target.checked ? false : pollDraft.multi })}
                    className="accent-emerald-400"
                  />
                  Викторина (один правильный)
                </label>
              </div>
              <div className="mt-2 flex items-center gap-2">
                {pollDraft.opts.length < 10 && (
                  <button
                    onClick={() => setPollDraft({ ...pollDraft, opts: [...pollDraft.opts, ""] })}
                    className="rounded-xl px-3 py-1.5 text-[12px] text-white/55 hover:bg-white/8 hover:text-white"
                  >
                    + Добавить вариант
                  </button>
                )}
                <button
                  onClick={() => {
                    const q = pollDraft.q.trim();
                    const opts = pollDraft.opts.map((o) => o.trim()).filter(Boolean);
                    if (!q || opts.length < 2) {
                      notify("Нужен вопрос и минимум два варианта");
                      return;
                    }
                    setPollDraft(null);
                    void send(`poll:${JSON.stringify({ q, opts, multi: pollDraft.multi ?? false, quiz: pollDraft.quiz ?? null })}`);
                  }}
                  className="btn-gradient ml-auto rounded-xl px-4 py-1.5 text-[12px] font-semibold"
                >
                  Отправить опрос
                </button>
              </div>
            </div>
          )}

          {(replyTo || editing) && (
              <motion.div
                key={editing ? "editing" : "reply"}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="mb-2 flex items-center gap-2.5 rounded-2xl border border-white/8 bg-white/[0.04] px-3 py-2">
                  {editing ? (
                    <Pencil className="h-4 w-4 shrink-0 text-amber-300" />
                  ) : (
                    <Reply className="h-4 w-4 shrink-0 text-slate-400" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className={`truncate text-[11px] font-semibold ${editing ? "text-amber-300" : "text-slate-400"}`}>
                      {editing
                        ? "Редактирование сообщения"
                        : replyTo!.senderId === me.id
                          ? "Вы"
                          : (replyTo!.sender?.displayName ?? "Сообщение")}
                    </p>
                    <p className="truncate text-xs text-white/45">
                      <PreviewLabel
                        type={editing ? editing.type : replyTo!.type}
                        content={editing ? editing.content : replyTo!.content}
                      />
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      if (editing) {
                        setEditing(null);
                        setText("");
                      } else setReplyTo(null);
                    }}
                    className="shrink-0 rounded-full p-1 text-white/40 hover:text-white"
                  >
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
          ) : voiceRecActive ? (
            /* Запись голосового: таймер + отмена + отправка */
            <div className="flex items-center gap-3 rounded-2xl border border-rose-400/25 bg-rose-500/10 px-4 py-3">
              <span className="relative flex h-3 w-3 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-70" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-rose-500" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-rose-200 tabular-nums">{formatDuration(recSecs)}</p>
                {livePreview ? (
                  <p className="flex items-center gap-1 truncate text-[11px] text-emerald-200/80" title={livePreview}>
                    <Mic className="h-3 w-3 shrink-0" />
                    <span className="truncate">{livePreview}</span>
                  </p>
                ) : (
                  <p className="text-[11px] text-white/40">Говорите — текст появится прямо здесь…</p>
                )}
              </div>
              <button
                onClick={() => stopVoiceRecording(false)}
                title="Отменить запись"
                className="glass flex h-11 w-11 items-center justify-center rounded-2xl text-white/70 transition-colors hover:text-rose-300"
              >
                <Ban className="h-4.5 w-4.5" />
              </button>
              <button
                onClick={() => stopVoiceRecording(true)}
                disabled={false}
                title="Закончить и отправить"
                className="btn-gradient flex h-11 items-center gap-2 rounded-2xl px-4 text-sm font-semibold text-white"
              >
                {uploading ? <Loader2 className="h-4.5 w-4.5 animate-spin" /> : <Send className="h-4.5 w-4.5" />}
                Отправить
              </button>
            </div>
          ) : (
            <div className="flex items-end gap-2.5">
              <button
                onClick={() => fileRef.current?.click()}
                disabled={sending}
                title={me.premium ? "Прикрепить файл (до 4 ГБ — Premium)" : "Прикрепить файл (до 500 МБ)"}
                className="glass flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white/70 transition-colors hover:text-white disabled:opacity-50"
              >
                {uploading ? <Loader2 className="h-4.5 w-4.5 animate-spin" /> : <Paperclip className="h-4.5 w-4.5" />}
              </button>
              <button
                onClick={() => void startVoiceRecording()}
                disabled={uploading || sending || noteRecorder}
                title="Записать голосовое сообщение"
                className="glass flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white/70 transition-colors hover:text-white disabled:opacity-50"
              >
                <Mic className="h-4.5 w-4.5" />
              </button>
              <button
                onClick={() => setNoteRecorder(true)}
                disabled={uploading || sending || voiceRecActive}
                title="Записать видеосообщение (кружок)"
                className="glass hidden h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white/70 transition-colors hover:text-white sm:flex disabled:opacity-50"
              >
                <VideoNoteIcon />
              </button>
              <input
                ref={fileRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  addDraftFiles(Array.from(e.target.files ?? []));
                  e.target.value = "";
                }}
              />
              <textarea
                ref={inputRef}
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  // поле растёт само, до лимита высоты — листать не нужно
                  const el = e.target;
                  el.style.height = "auto";
                  el.style.height = Math.min(el.scrollHeight, 128) + "px";
                  sendTyping();
                  // @-автодополнение: набираем @ник участника
                  const m = e.target.value.match(/(?:^|\s)@([a-zA-Z0-9_]*)$/);
                  setMentionQ(m ? m[1].toLowerCase() : null);
                }}
                onPaste={(e) => {
                  const files = Array.from(e.clipboardData?.files ?? []);
                  if (files.length > 0) {
                    e.preventDefault();
                    addDraftFiles(files);
                  }
                }}
                onKeyDown={(e) => {
                  if (
                    (enterSend && e.key === "Enter" && !e.shiftKey) ||
                    (!enterSend && e.key === "Enter" && (e.ctrlKey || e.metaKey))
                  ) {
                    e.preventDefault();
                    void send();
                  }
                  if (e.key === "Escape") {
                    if (editing) {
                      setEditing(null);
                      setText("");
                    } else if (replyTo) setReplyTo(null);
                  }
                }}
                rows={1}
                maxLength={msgLimit}
                placeholder={draftFiles.length > 0 ? "Подпись к файлам (необязательно)…" : kind === "channel" ? "Написать в канал…" : "Сообщение…"}
                className="ring-focus nice-scroll max-h-32 min-h-11 flex-1 resize-none rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-[15px] transition-all placeholder:text-white/30"
              />
              <button
                ref={emojiBtnRef}
                onClick={() => setEmojiOpen((v) => !v)}
                title="Эмодзи"
                className={`glass flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl transition-colors hover:text-white ${
                  emojiOpen ? "text-amber-300" : "text-white/70"
                }`}
              >
                <Smile className="h-4.5 w-4.5" />
              </button>
              {text.length > Math.floor(msgLimit * 0.85) && (
                <span className="absolute -top-5 right-14 text-[10px] text-white/35 tabular-nums">
                  {text.length}/{msgLimit}
                </span>
              )}
              {/* Отправка + меню способов: тихо, отложить, быстрые ответы */}
              <div className="relative flex shrink-0 items-center">
                <button
                  onClick={() => void send()}
                  disabled={(!canSendSomething && !editing) || sending || uploading || slowActive}
                  title={slowActive ? `Слоумод: ещё ${slowLeft} с` : "Отправить"}
                  className="btn-gradient flex h-11 w-11 items-center justify-center rounded-l-2xl text-white"
                >
                  {sending ? <Loader2 className="h-4.5 w-4.5 animate-spin" /> : <Send className="h-4.5 w-4.5" />}
                </button>
                <button
                  onClick={() => setSendMenu((v) => !v)}
                  title="Способы отправки"
                  className="btn-gradient flex h-11 w-5 items-center justify-center rounded-r-2xl border-l border-white/20 text-white/85"
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
                {sendMenu && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setSendMenu(false)} />
                    <div className="glass-strong absolute right-0 bottom-[calc(100%+8px)] z-40 w-56 rounded-2xl p-1.5 shadow-2xl">
                      <button
                        onClick={() => {
                          setSendMenu(false);
                          void send(undefined, { silent: true });
                        }}
                        className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[13px] text-white/75 hover:bg-white/10"
                      >
                        <VolumeX className="h-4 w-4 text-white/45" /> Отправить без звука
                      </button>
                      <button
                        onClick={() => {
                          setSendMenu(false);
                          setScheduleOpen((v) => !v);
                        }}
                        className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[13px] text-white/75 hover:bg-white/10"
                      >
                        <Clock className="h-4 w-4 text-white/45" /> Отложить отправку…
                      </button>
                      <button
                        onClick={() => {
                          setSendMenu(false);
                          setSnippetsOpen((v) => !v);
                        }}
                        className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[13px] text-white/75 hover:bg-white/10"
                      >
                        <MessageSquareText className="h-4 w-4 text-white/45" /> Быстрые ответы
                      </button>
                      {canPost && (
                        <button
                          onClick={() => {
                            setSendMenu(false);
                            setPollDraft({ q: "", opts: ["", ""] });
                          }}
                          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[13px] text-white/75 hover:bg-white/10"
                        >
                          <BarChart3 className="h-4 w-4 text-white/45" /> Опрос…
                        </button>
                      )}
                      {canPost && (
                        <button
                          onClick={() => {
                            setSendMenu(false);
                            void send(`contact:${JSON.stringify({ name: me.displayName, username: me.username, avatar: me.avatarUrl ?? "" })}`);
                          }}
                          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[13px] text-white/75 hover:bg-white/10"
                        >
                          <Contact className="h-4 w-4 text-white/45" /> Моя визитка
                        </button>
                      )}
                      {canPost && (
                        <button
                          onClick={() => {
                            setSendMenu(false);
                            if (!navigator.geolocation) {
                              notify("Геолокация недоступна в этом браузере");
                              return;
                            }
                            notify("Определяем местоположение…");
                            navigator.geolocation.getCurrentPosition(
                              (pos) =>
                                void send(
                                  `location:${JSON.stringify({
                                    lat: +pos.coords.latitude.toFixed(6),
                                    lon: +pos.coords.longitude.toFixed(6),
                                  })}`,
                                ),
                              () => notify("Не удалось определить местоположение"),
                              { timeout: 10000 },
                            );
                          }}
                          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[13px] text-white/75 hover:bg-white/10"
                        >
                          <MapPin className="h-4 w-4 text-white/45" /> Моё местоположение
                        </button>
                      )}
                      {canPost && (
                        <button
                          onClick={() => {
                            setSendMenu(false);
                            setSelfDestruct((v) => (v === 0 ? 10 : v === 10 ? 30 : v === 30 ? 60 : 0));
                          }}
                          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[13px] text-white/75 hover:bg-white/10"
                        >
                          <Flame className={`h-4 w-4 ${selfDestruct ? "text-orange-400" : "text-white/45"}`} />
                          {selfDestruct ? `Исчезнет через ${selfDestruct} с ✓` : "Исчезающее сообщение"}
                        </button>
                      )}
                    </div>
                  </>
                )}
                {scheduleOpen && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setScheduleOpen(false)} />
                    <div className="glass-strong absolute right-0 bottom-[calc(100%+8px)] z-40 w-64 rounded-2xl p-3 shadow-2xl">
                      <p className="pb-2 text-[12px] font-semibold text-white/60">Отправить в:</p>
                      <div className="flex items-center gap-2">
                        <input
                          type="time"
                          value={scheduleTime}
                          onChange={(e) => setScheduleTime(e.target.value)}
                          className="ring-focus flex-1 rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-sm"
                        />
                        <button
                          onClick={() => {
                            setScheduleOpen(false);
                            void send();
                          }}
                          disabled={!scheduleTime || !text.trim()}
                          className="btn-gradient rounded-xl px-3 py-2 text-[13px] font-semibold text-white disabled:opacity-40"
                        >
                          OK
                        </button>
                      </div>
                      <p className="pt-2 text-[11px] leading-snug text-white/35">
                        Отправится, пока приложение открыто.
                      </p>
                    </div>
                  </>
                )}
                {snippetsOpen && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setSnippetsOpen(false)} />
                    <div className="glass-strong nice-scroll absolute right-0 bottom-[calc(100%+8px)] z-40 max-h-64 w-72 overflow-y-auto rounded-2xl p-1.5 shadow-2xl">
                      <p className="px-3 pt-1.5 pb-1 text-[11px] font-semibold tracking-wide text-white/35 uppercase">
                        Быстрые ответы
                      </p>
                      {snippets.length === 0 && (
                        <p className="px-3 py-2 text-[12px] text-white/35">Пока пусто — сохраните текущий текст ниже.</p>
                      )}
                      {snippets.map((sn) => (
                        <div key={sn.id} className="group flex items-center gap-1">
                          <button
                            onClick={() => {
                              setText(sn.text);
                              setSnippetsOpen(false);
                              inputRef.current?.focus();
                            }}
                            className="min-w-0 flex-1 truncate rounded-xl px-3 py-2 text-left text-[13px] text-white/75 hover:bg-white/10"
                          >
                            {sn.text}
                          </button>
                          <button
                            onClick={() => {
                              const next = snippets.filter((x) => x.id !== sn.id);
                              setSnippets(next);
                              try { localStorage.setItem("pulse_snippets_v1", JSON.stringify(next)); } catch { /* ignore */ }
                            }}
                            className="rounded-lg p-1.5 text-white/25 opacity-0 transition-opacity group-hover:opacity-100 hover:text-rose-300"
                            title="Удалить шаблон"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                      {text.trim() && (
                        <button
                          onClick={() => {
                            const next = [...snippets, { id: `sn-${Date.now()}`, text: text.trim() }].slice(-20);
                            setSnippets(next);
                            try { localStorage.setItem("pulse_snippets_v1", JSON.stringify(next)); } catch { /* ignore */ }
                            setSnippetsOpen(false);
                          }}
                          className="mt-1 flex w-full items-center gap-2 rounded-xl border-t border-white/8 px-3 py-2 text-left text-[13px] text-emerald-300/90 hover:bg-white/10"
                        >
                          <Plus className="h-4 w-4" /> Сохранить текущий текст как шаблон
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Слеши: /имя — вставить быстрый ответ */}
          {text.startsWith("/") && snippets.length > 0 && (() => {
            const q = text.slice(1).toLowerCase();
            const matches = snippets.filter((sn) => sn.text.toLowerCase().includes(q)).slice(0, 5);
            if (matches.length === 0) return null;
            return (
              <div className="glass-strong absolute bottom-[calc(100%+8px)] left-0 z-40 w-72 rounded-2xl p-1.5 shadow-2xl">
                <p className="px-3 pt-1 pb-1 text-[10px] font-semibold tracking-wide text-white/30 uppercase">
                  Быстрые ответы
                </p>
                {matches.map((sn) => (
                  <button
                    key={sn.id}
                    onClick={() => {
                      setText(sn.text);
                      inputRef.current?.focus();
                    }}
                    className="block w-full truncate rounded-xl px-3 py-2 text-left text-[13px] text-white/75 hover:bg-white/10"
                  >
                    {sn.text}
                  </button>
                ))}
              </div>
            );
          })()}

          {/* @-автодополнение: участники чата */}
          {mentionQ !== null && chatMembers.filter((m) =>
            m.username.toLowerCase().startsWith(mentionQ) || m.displayName.toLowerCase().includes(mentionQ),
          ).length > 0 && (
            <div className="glass-strong absolute bottom-[calc(100%+8px)] left-0 z-40 w-64 rounded-2xl p-1.5 shadow-2xl">
              {chatMembers
                .filter((m) => m.username.toLowerCase().startsWith(mentionQ) || m.displayName.toLowerCase().includes(mentionQ))
                .slice(0, 6)
                .map((m) => (
                  <button
                    key={m.id}
                    onClick={() => {
                      setText((t) => t.replace(/@([a-zA-Z0-9_]*)$/, `@${m.username} `));
                      setMentionQ(null);
                      inputRef.current?.focus();
                    }}
                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left hover:bg-white/10"
                  >
                    <Avatar name={m.displayName} src={m.avatarUrl} size={26} />
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-medium">{m.displayName}</span>
                      <span className="block truncate text-[11px] text-white/35">@{m.username}</span>
                    </span>
                  </button>
                ))}
            </div>
          )}

          {/* Эмодзи-пикер */}
          <AnimatePresence>
            {emojiOpen && (
              <motion.div
                key="emoji-picker"
                ref={emojiPickRef}
                initial={{ opacity: 0, y: 8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.98 }}
                transition={{ duration: 0.15 }}
                className="absolute right-0 bottom-[calc(100%+8px)] z-30 w-[min(92vw,420px)]"
              >
                <EmojiPicker
                  onPick={insertEmoji}
                  onSendSticker={(s) => {
                    setEmojiOpen(false);
                    void send(s);
                  }}
                  recentStickers={recentStickers}
                  onSendStickerUrl={(u) => {
                    setEmojiOpen(false);
                    void sendStickerUrl(u);
                  }}
                  onUploadSticker={(f) => {
                    setEmojiOpen(false);
                    void sendStickerFile(f);
                  }}
                  stickerBusy={stickerBusy}
                  onClose={() => setEmojiOpen(false)}
                  premium={isPremium}
                  onEnablePremium={() => void enablePremium()}
                  onSendGif={(id) => {
                    setEmojiOpen(false);
                    void send(`gifpack:${id}`);
                  }}
                />
              </motion.div>
            )}
          </AnimatePresence>
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
        {noteRecorder && (
          <VideoNoteRecorder
            key="note-recorder"
            notify={notify}
            onClose={() => setNoteRecorder(false)}
            onSend={(blob, duration) => {
              setNoteRecorder(false);
              void sendAttachment(blob, duration, "video_note", "Видеосообщение");
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {forwarding && (
          <ForwardModal
            key="forward"
            message={forwarding}
            onClose={() => setForwarding(null)}
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
            <img
              src={lightbox}
              alt="Фото"
              style={{ transform: `scale(${lbZoom})`, transition: "transform 0.12s ease" }}
              onWheel={(e) => {
                e.stopPropagation();
                setLbZoom((z) => Math.max(0.4, Math.min(5, z + (e.deltaY < 0 ? 0.25 : -0.25))));
              }}
              className="max-h-full max-w-full rounded-2xl object-contain shadow-2xl"
            />
            {/* Навигация между фото чата */}
            {(() => {
              const imgs = messages
                .map((m) => parseAttachment(m.type, m.content))
                .filter((a): a is import("@/lib/types").AttachmentInfo => !!a && m2img(a) !== null)
                .map((a) => m2img(a) as string);
              const idx = lightbox ? imgs.indexOf(lightbox) : -1;
              if (idx < 0 || imgs.length < 2) return null;
              const go = (d: number) => setLightbox(imgs[(idx + d + imgs.length) % imgs.length]);
              return (
                <>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      go(-1);
                    }}
                    title="Предыдущее фото"
                    className="glass absolute left-5 top-1/2 -translate-y-1/2 rounded-full p-3 text-white/80 hover:text-white"
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      go(1);
                    }}
                    title="Следующее фото"
                    className="glass absolute right-5 top-1/2 -translate-y-1/2 rounded-full p-3 text-white/80 hover:text-white"
                  >
                    <ArrowRight className="h-5 w-5" />
                  </button>
                </>
              );
            })()}
            <a
              href={lightbox}
              download
              onClick={(e) => e.stopPropagation()}
              className="glass absolute top-5 left-5 flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm text-white/85 transition-colors hover:text-white"
            >
              <Download className="h-4 w-4" />
              Скачать
            </a>
            {/* Счётчик «3 из 12» */}
            {(() => {
              const imgs = messages
                .map((m) => parseAttachment(m.type, m.content))
                .filter((a): a is import("@/lib/types").AttachmentInfo => !!a && m2img(a) !== null)
                .map((a) => m2img(a) as string);
              const idx = lightbox ? imgs.indexOf(lightbox) : -1;
              if (idx < 0 || imgs.length < 2) return null;
              return (
                <span className="glass absolute bottom-5 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-[12px] text-white/70 tabular-nums">
                  {idx + 1} из {imgs.length}
                </span>
              );
            })()}
            <button
              onClick={() => setLightbox(null)}
              className="absolute top-5 right-5 rounded-full bg-white/10 p-2.5 text-white/80 transition-colors hover:bg-white/20"
            >
              <X className="h-5 w-5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Подтверждение удаления сообщения */}
      <AnimatePresence>
        {confirmDelete && (
          <ConfirmDeleteModal
            key="confirm-delete"
            message={confirmDelete}
            onCancel={() => setConfirmDelete(null)}
            onConfirm={() => {
              void removeMessage(confirmDelete.id);
              setConfirmDelete(null);
            }}
          />
        )}
      </AnimatePresence>

      {/* Подтверждение удаления/выхода из чата */}
      <AnimatePresence>
        {confirmDeleteChat && (
          <ConfirmDeleteChatModal
            key="confirm-delete-chat"
            kind={kind}
            isOwner={meta?.myRole === "owner"}
            forAll={deleteChatForAll}
            setForAll={setDeleteChatForAll}
            busy={deletingChat}
            onCancel={() => {
              setConfirmDeleteChat(false);
              setDeleteChatForAll(false);
            }}
            onConfirm={() => void deleteChat()}
          />
        )}
      </AnimatePresence>

      {/* Контекстное меню сообщения (ПКМ / долгое нажатие) */}
      <AnimatePresence>
        {ctxMenu && (
          <MessageContextMenu
            restricted={!!meta?.restricted}
            key="ctx"
            state={ctxMenu}
            meId={me.id}
            isSpace={isSpace}
            myRole={meta?.myRole ?? "member"}
            onClose={() => setCtxMenu(null)}
            onReact={(emoji) => void toggleReaction(ctxMenu.message.id, emoji)}
            onReply={() => {
              startReply(ctxMenu.message);
              setCtxMenu(null);
            }}
            onEdit={() => {
              startEdit(ctxMenu.message);
              setCtxMenu(null);
            }}
            onPin={() => {
              void togglePin(ctxMenu.message);
              setCtxMenu(null);
            }}
            onCopy={() => {
              void copyMessage(ctxMenu.message);
              setCtxMenu(null);
            }}
            onForward={() => {
              setForwarding(ctxMenu.message);
              setCtxMenu(null);
            }}
            onSave={() => {
              void saveToSaved(ctxMenu.message);
              setCtxMenu(null);
            }}
            onCopyLink={() => {
              const url = `${window.location.origin}${window.location.pathname}#msg=${ctxMenu.message.id}`;
              void navigator.clipboard.writeText(url).then(
                () => notify("Ссылка на сообщение скопирована"),
                () => notify("Не удалось скопировать ссылку"),
              );
              setCtxMenu(null);
            }}
            onDelete={() => {
              requestDelete(ctxMenu.message);
              setCtxMenu(null);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─────────────────────────── мелкие иконки ─────────────────────────── */

/** Кнопка «кружок»: круг с треугольником записи. */
function VideoNoteIcon() {
  return (
    <span className="relative flex h-7 w-7 items-center justify-center">
      <span className="absolute inset-0 rounded-full border-[1.6px] border-current opacity-70" />
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor">
        <path d="M8 6.5v11l9-5.5-9-5.5Z" />
      </svg>
    </span>
  );
}

function DraftFileIcon({ mime }: { mime: string }) {
  const cls = "h-5 w-5 text-white/60";
  if (mime.startsWith("video/")) return <Film className={cls} />;
  if (mime.startsWith("audio/")) return <Music className={cls} />;
  if (mime.startsWith("image/")) return <ImagePlus className={cls} />;
  if (mime.includes("pdf") || mime.includes("word") || mime.startsWith("text/")) return <FileText className={cls} />;
  return <FileIcon className={cls} />;
}

function MenuItem({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${
        danger
          ? "text-rose-300 hover:bg-rose-500/10 hover:text-rose-200"
          : "text-white/80 hover:bg-white/8 hover:text-white"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

/* ─────────────────────────── меню сообщения ─────────────────────────── */

function MessageContextMenu({
  state,
  meId,
  isSpace,
  myRole,
  restricted,
  onClose,
  onReact,
  onReply,
  onEdit,
  onPin,
  onCopy,
  onForward,
  onSave,
  onCopyLink,
  onDelete,
}: {
  state: ContextMenuState;
  meId: string;
  isSpace: boolean;
  myRole: MemberRole;
  /** Ограниченный чат (как в ТГ): нельзя копировать, пересылать, сохранять. */
  restricted?: boolean;
  onClose: () => void;
  onReact: (emoji: string) => void;
  onReply: () => void;
  onEdit: () => void;
  onPin: () => void;
  onCopy: () => void;
  onForward: () => void;
  /** Быстрое сохранение в «Избранное». */
  onSave: () => void;
  /** Скопировать ссылку на сообщение. */
  onCopyLink: () => void;
  onDelete: () => void;
}) {
  const m = state.message;
  const own = m.senderId === meId;
  /** Развёрнутый набор реакций («+»). */
  const [moreEmoji, setMoreEmoji] = useState(false);
  const att = parseAttachment(m.type, m.content);
  // Правка по ПКМ — только для текстовых сообщений. Гифку/картинку/файл
  // редактировать «как текст» нельзя (это ломало вложение).
  const isEditable = own && !m.deletedAt && m.type === "text";
  const hasText = m.type === "text" ? !!m.content : !!(att?.caption || att?.url);
  const canDelete = own || (isSpace && (myRole === "owner" || myRole === "admin"));
  const canPin = !isSpace || myRole === "owner" || myRole === "admin" || own;

  // чтобы меню не вылезало за край экрана
  const W = 236;
  const H = 372;
  const x = Math.min(Math.max(8, state.x), Math.max(8, window.innerWidth - W - 8));
  const y = Math.min(Math.max(8, state.y), Math.max(8, window.innerHeight - H - 8));

  return (
    <>
      {/* Прозрачный фон: клик мимо меню закрывает его */}
      <div className="fixed inset-0 z-[84]" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.94 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.12 }}
        onClick={(e) => e.stopPropagation()}
        className="glass-strong fixed z-[85] w-[236px] overflow-hidden rounded-2xl p-1.5 shadow-2xl"
        style={{ left: x, top: y }}
      >
      {/* быстрые реакции */}
      <div className="grid grid-cols-5 gap-0.5 border-b border-white/8 p-1">
        {QUICK_EMOJIS.map((e) => (
          <button
            key={e}
            onClick={onReact.bind(null, e)}
            className="emoji-ios rounded-lg py-1.5 text-xl transition-transform hover:scale-125 active:scale-95"
            title={`Реакция ${e}`}
          >
            {e}
          </button>
        ))}
        {/* «+»: ещё реакции */}
        <button
          onClick={() => setMoreEmoji((v) => !v)}
          className={`rounded-lg py-1.5 text-base transition-colors ${
            moreEmoji ? "bg-white/15 text-white" : "text-white/40 hover:bg-white/8 hover:text-white/80"
          }`}
          title="Ещё реакции"
        >
          +
        </button>
      </div>
      {moreEmoji && (
        <div className="nice-scroll grid max-h-36 grid-cols-8 gap-0.5 overflow-y-auto border-b border-white/8 p-1">
          {EXTRA_REACTIONS.map((e) => (
            <button
              key={e}
              onClick={onReact.bind(null, e)}
              className="rounded-lg py-1 text-base transition-transform hover:scale-125 active:scale-95"
              title={`Реакция ${e}`}
            >
              {e}
            </button>
          ))}
        </div>
      )}
      <ContextItem icon={<Reply className="h-4 w-4 text-slate-400" />} label="Ответить" onClick={onReply} />
      {canPin && (
        <ContextItem
          icon={
            m.pinned ? (
              <PinOff className="h-4 w-4 text-rose-300" />
            ) : (
              <Pin className="h-4 w-4 text-emerald-300" />
            )
          }
          label={m.pinned ? "Открепить" : "Закрепить"}
          onClick={onPin}
        />
      )}
      {hasText && !restricted && (
        <ContextItem icon={<Copy className="h-4 w-4 text-slate-400" />} label="Копировать" onClick={onCopy} />
      )}
      <ContextItem
        icon={<Link2 className="h-4 w-4 text-slate-400" />}
        label="Ссылка на сообщение"
        onClick={onCopyLink}
      />
      {/* Ссылка на сам медиафайл (фото/видео/файл) — как в ТГ */}
      {att?.url && !restricted && (
        <ContextItem
          icon={<Paperclip className="h-4 w-4 text-sky-300" />}
          label="Ссылка на медиа"
          onClick={() => {
            const u = att.url ?? "";
            const abs = u.startsWith("http") ? u : `${window.location.origin}${u}`;
            void navigator.clipboard?.writeText(abs).catch(() => {});
            onClose();
          }}
        />
      )}
      {isEditable && (
        <ContextItem icon={<Pencil className="h-4 w-4 text-amber-300" />} label="Изменить" onClick={onEdit} />
      )}
      {!restricted && (
        <ContextItem
          icon={<ChevronRight className="h-4 w-4 text-emerald-300" />}
          label="Переслать"
          onClick={onForward}
        />
      )}
      {!restricted && (
        <ContextItem
          icon={<Bookmark className="h-4 w-4 text-amber-300" />}
          label="В Избранное"
          onClick={onSave}
        />
      )}
      {canDelete && (
        <ContextItem icon={<Trash2 className="h-4 w-4 text-rose-300" />} label="Удалить" onClick={onDelete} danger />
      )}
      </motion.div>
    </>
  );
}

function ContextItem({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition-colors hover:bg-white/8 ${
        danger ? "text-rose-300/90 hover:text-rose-200" : "text-white/80 hover:text-white"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

/* ─────────────────────────── пересылка ─────────────────────────── */

function ForwardModal({
  message,
  onClose,
  notify,
}: {
  message: ChatMessage;
  onClose: () => void;
  notify: (msg: string) => void;
}) {
  const [convs, setConvs] = useState<ConversationListItem[] | null>(null);
  const [sendingTo, setSendingTo] = useState<string | null>(null);

  useEffect(() => {
    api<{ conversations: ConversationListItem[] }>("/api/conversations")
      .then((d) => setConvs(d.conversations))
      .catch(() => setConvs([]));
  }, []);

  const forwardTo = async (conv: ConversationListItem) => {
    if (sendingTo) return;
    setSendingTo(conv.id);
    try {
      await api("/api/messages", {
        method: "POST",
        body: JSON.stringify({
          conversationId: conv.id,
          type: message.type === "call" ? "text" : message.type,
          content: message.content,
          replyToId: null,
          // «Переслано от …»: сохраняем АВТОРА ОРИГИНАЛА, как в ТГ,
          // а не того, кто пересылает дальше по цепочке
          forwardedFrom:
            message.forwardedFrom ?? message.sender?.displayName ?? message.sender?.username ?? null,
          forwardedAvatar:
            message.forwardedAvatar ?? message.sender?.avatarUrl ?? null,
          forwardedUserId: message.forwardedUserId ?? message.senderId ?? null,
        }),
      });
      notify(`Переслано в «${conv.title}»`);
      onClose();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Не удалось переслать");
      setSendingTo(null);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-[80] grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        onClick={(e) => e.stopPropagation()}
        className="glass-strong w-full max-w-md overflow-hidden rounded-[1.8rem] shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-white/8 px-6 py-4">
          <h3 className="font-display text-lg font-bold">Переслать сообщение</h3>
          <button onClick={onClose} className="rounded-full bg-white/5 p-2 text-white/60 transition-colors hover:bg-white/10">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="truncate px-6 pt-4 text-xs text-white/40">
          <PreviewLabel type={message.type} content={message.content} />
        </p>
        <div className="nice-scroll max-h-80 overflow-y-auto p-3">
          {!convs ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-white/40" />
            </div>
          ) : convs.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-white/40">Пока нет чатов</p>
          ) : (
            convs.map((c) => (
              <button
                key={c.id}
                onClick={() => void forwardTo(c)}
                disabled={sendingTo !== null}
                className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors hover:bg-white/8 disabled:opacity-50"
              >
                <Avatar
                  name={c.title}
                  src={c.kind === "direct" ? c.peer?.avatarUrl ?? null : c.avatarUrl}
                  size={40}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 truncate text-sm font-medium">
                    <span className="truncate">{c.title}</span>
                    {c.saved && <Bookmark className="h-3 w-3 shrink-0 text-amber-300" />}
                  </span>
                  <span className="block text-[11px] text-white/35">
                    {c.saved ? "избранное" : c.kind === "direct" ? "личный чат" : c.kind === "channel" ? "канал" : "группа"}
                  </span>
                </span>
                {sendingTo === c.id && <Loader2 className="h-4 w-4 animate-spin text-white/50" />}
              </button>
            ))
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ─────────────────────────── запись «кружка» ─────────────────────────── */

function VideoNoteRecorder({
  notify,
  onClose,
  onSend,
}: {
  notify: (msg: string) => void;
  onClose: () => void;
  onSend: (blob: Blob, durationSec: number) => void;
}) {
  const [phase, setPhase] = useState<"camera" | "recording" | "review">("camera");
  const [secs, setSecs] = useState(0);
  const [reviewUrl, setReviewUrl] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const reviewRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<{ recorder: MediaRecorder; chunks: Blob[]; startedAt: number } | null>(null);
  const blobRef = useRef<Blob | null>(null);
  /** Текущий blob:-URL предпросмотра — cleanup эффектов всегда видит актуальный. */
  const reviewUrlRef = useRef<string | null>(null);
  reviewUrlRef.current = reviewUrl;

  useEffect(() => {
    let cancelled = false;
    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
        notify("Запись видео не поддерживается этим браузером");
        onClose();
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 640 } },
          // Шумоподавление/эхоподавление из настроек — и для видеокружков тоже
          audio: audioConstraints(),
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      } catch {
        notify("Нужен доступ к камере и микрофону");
        onClose();
      }
    };
    void start();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (reviewUrlRef.current) URL.revokeObjectURL(reviewUrlRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // таймер записи (автостоп на 60 секундах, как в Telegram)
  useEffect(() => {
    if (phase !== "recording") return;
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [phase]);
  useEffect(() => {
    if (phase === "recording" && secs >= 60) stopRecording();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secs, phase]);

  const startRecording = () => {
    const stream = streamRef.current;
    if (!stream) return;
    const mime = pickRecorderMime([
      "video/webm;codecs=vp8,opus",
      "video/webm;codecs=vp9,opus",
      "video/webm",
      "video/mp4",
    ]);
    const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    recorder.start(250);
    recRef.current = { recorder, chunks, startedAt: Date.now() };
    setSecs(0);
    setPhase("recording");
  };

  function stopRecording() {
    const rec = recRef.current;
    if (!rec) return;
    recRef.current = null;
    const duration = (Date.now() - rec.startedAt) / 1000;
    rec.recorder.onstop = () => {
      const blob = new Blob(rec.chunks, { type: rec.recorder.mimeType || "video/webm" });
      blobRef.current = blob;
      if (blob.size === 0) {
        notify("Запись не получилась — попробуйте ещё раз");
        setPhase("camera");
        return;
      }
      setReviewUrl(URL.createObjectURL(blob));
      setPhase("review");
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setTimeout(() => {
        if (reviewRef.current) {
          reviewRef.current.currentTime = 0;
          void reviewRef.current.play().catch(() => {});
        }
      }, 60);
    };
    try {
      rec.recorder.stop();
    } catch {
      setPhase("camera");
    }
  }

  const send = () => {
    const blob = blobRef.current;
    if (!blob) return;
    const duration = reviewRef.current?.duration && Number.isFinite(reviewRef.current.duration)
      ? reviewRef.current.duration
      : secs;
    onSend(blob, duration || 1);
  };

  const rerecord = () => {
    if (reviewUrl) URL.revokeObjectURL(reviewUrl);
    setReviewUrl(null);
    blobRef.current = null;
    setSecs(0);
    setPhase("camera");
    void (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 640 } },
          audio: audioConstraints(),
        });
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      } catch {
        notify("Нужен доступ к камере и микрофону");
        onClose();
      }
    })();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[80] flex flex-col items-center justify-center gap-6 bg-black/90 p-6 backdrop-blur-md"
    >
      <div className="flex w-full max-w-sm items-center justify-between">
        <p className="font-display text-lg font-bold">Видеосообщение</p>
        <button
          onClick={() => {
            const rec = recRef.current;
            if (rec && rec.recorder.state === "recording") {
              try {
                rec.recorder.stop();
              } catch {
                /* ignore */
              }
            }
            onClose();
          }}
          className="rounded-full bg-white/10 p-2.5 text-white/80 transition-colors hover:bg-white/20"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Круглое превью — как «кружок» в Telegram */}
      <div className="relative h-[280px] w-[280px]">
        <div
          className={`h-full w-full overflow-hidden rounded-full bg-black/60 ring-4 ${
            phase === "recording" ? "ring-rose-500" : "ring-white/15"
          }`}
        >
          {phase === "review" && reviewUrl ? (
            <video
              ref={reviewRef}
              src={reviewUrl}
              playsInline
              controls={false}
              className="h-full w-full object-cover"
            />
          ) : (
            <video ref={videoRef} autoPlay playsInline muted className="h-full w-full scale-x-[-1] object-cover" />
          )}
        </div>
        {phase === "recording" && (
          <span className="absolute top-4 left-4 flex items-center gap-1.5 rounded-full bg-black/70 px-3 py-1 text-xs font-bold text-rose-300 tabular-nums">
            <span className="h-2 w-2 animate-pulse rounded-full bg-rose-500" />
            {formatDuration(secs)} / 1:00
          </span>
        )}
        {phase === "camera" && (
          <span className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1 text-[11px] text-white/70">
            до 60 секунд
          </span>
        )}
      </div>

      {/* Управление */}
      <div className="flex items-center gap-6">
        {phase === "camera" && (
          <button
            onClick={startRecording}
            className="flex h-16 w-16 items-center justify-center rounded-full bg-rose-500 text-white shadow-[0_10px_30px_-6px_rgba(244,63,94,0.6)] transition-transform hover:scale-105 active:scale-95"
            title="Начать запись"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white">
              <VideoNoteIcon />
            </span>
          </button>
        )}
        {phase === "recording" && (
          <button
            onClick={stopRecording}
            className="flex h-16 w-16 items-center justify-center rounded-full bg-white text-black transition-transform hover:scale-105 active:scale-95"
            title="Закончить запись"
          >
            <span className="h-5 w-5 rounded-[4px] bg-rose-500" />
          </button>
        )}
        {phase === "review" && (
          <>
            <button
              onClick={rerecord}
              title="Перезаписать"
              className="glass flex h-12 w-12 items-center justify-center rounded-full text-white/80 transition-colors hover:text-white"
            >
              <RotateCcw className="h-5 w-5" />
            </button>
            <button
              onClick={send}
              className="btn-gradient flex h-16 w-16 items-center justify-center rounded-full text-white shadow-[0_10px_30px_-6px_rgba(139,92,246,0.6)] transition-transform hover:scale-105 active:scale-95"
              title="Отправить кружок"
            >
              <Send className="h-6 w-6" />
            </button>
          </>
        )}
      </div>
      <p className="text-xs text-white/40">
        {phase === "camera"
          ? "Наведите камеру и нажмите запись"
          : phase === "recording"
            ? "Говорите — нажмите кнопку, чтобы закончить"
            : "Проверьте запись и отправьте"}
      </p>
    </motion.div>
  );
}

/** URL фото из вложения (для навигации по лайтбоксу). */
function m2img(a: { url?: string; mimeType?: string; sticker?: boolean }): string | null {
  if (!a.url || a.sticker) return null;
  const mime = (a.mimeType ?? "").toLowerCase();
  if (mime.startsWith("image/") || /\.(png|jpe?g|gif|webp|avif|bmp|svg)$/i.test(a.url)) return a.url;
  return null;
}

/* ─────────────────────────── пузырь сообщения ─────────────────────────── */

/** Фото-спойлер: размыто, пока не кликнешь (или если прислались без спойлера). */
function SpoilerImage({
  url,
  caption,
  onOpen,
  spoiler,
}: {
  url: string;
  caption?: string;
  onOpen: (url: string) => void;
  spoiler: boolean;
}) {
  const [revealed, setRevealed] = useState(!spoiler);
  return (
    <div className="relative">
      <button
        onClick={() => (revealed ? onOpen(url) : setRevealed(true))}
        title={revealed ? "Открыть фото" : "Спойлер — нажмите, чтобы показать"}
        className="block overflow-hidden rounded-3xl ring-1 ring-white/10 transition-transform hover:scale-[1.01]"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={caption || "Фото"}
          className={`max-h-80 w-full max-w-xs object-cover transition-all duration-300 ${
            revealed ? "" : "scale-110 blur-xl"
          }`}
          draggable={false}
        />
      </button>
      {!revealed && (
        <span className="pointer-events-none absolute inset-0 grid place-items-center">
          <span className="glass rounded-xl px-3 py-1.5 text-[12px] font-medium text-white/80">
            Спойлер · показать
          </span>
        </span>
      )}
    </div>
  );
}

/** Визитка: карточка контакта с аватаром (клик — открыть профиль по @юзернейму). */
function ContactCard({ name, username, avatar, onOpenUsername }: { name: string; username: string; avatar: string; onOpenUsername?: (name: string) => void }) {
  return (
    <button
      onClick={() => {
        if (username) onOpenUsername?.(username);
      }}
      className="mb-0.5 flex w-full items-center gap-2.5 rounded-xl border border-white/10 bg-black/25 p-2 text-left select-none"
      title={username ? `Открыть @${username}` : "Контакт"}
    >
      <Avatar name={name} src={avatar || null} size={40} />
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-semibold text-white/90">{name}</span>
        {username && <span className="block truncate text-[11px] text-white/45">@{username}</span>}
      </span>
    </button>
  );
}

/** Местоположение: карточка с координатами и ссылкой на карту. */
function LocationCard({ lat, lon }: { lat: number; lon: number }) {
  const url = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=16/${lat}/${lon}`;
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="mb-0.5 flex w-full items-center gap-2.5 rounded-xl border border-white/10 bg-black/25 p-2 select-none hover:bg-black/35"
      title="Открыть на карте"
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-emerald-500/20">
        <MapPin className="h-4.5 w-4.5 text-emerald-300" />
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold text-white/90">Местоположение</span>
        <span className="block truncate text-[11px] text-white/45 tabular-nums">{lat.toFixed(4)}, {lon.toFixed(4)}</span>
      </span>
    </a>
  );
}

/** Цитата истории в ответе — мини-карточка с кадром и подписью. */
function StoryQuoteCard({ quote }: { quote: StoryQuoteInfo }) {
  return (
    <div className="mb-1.5 flex items-center gap-2.5 overflow-hidden rounded-xl border border-white/10 bg-black/25 p-2 select-none">
      <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-black/40">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={quote.url} alt="" className="h-full w-full object-cover" loading="lazy" />
        {quote.video && (
          <span className="absolute inset-0 grid place-items-center bg-black/30">
            <span className="text-[10px] text-white/90">▶</span>
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12px] font-semibold text-white/85">
          История{quote.author ? ` от ${quote.author}` : ""}
        </p>
        <p className="truncate text-[11px] text-white/45">
          {quote.caption ? quote.caption : quote.video ? "Видео-история" : "Фото-история"}
        </p>
      </div>
    </div>
  );
}

/** Длинные сообщения сворачиваются — разворачиваются по кнопке. */
function LongText({
  content,
  meUsername,
  onOpenUsername,
}: {
  content: string;
  meUsername?: string;
  onOpenUsername?: (name: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const LIMIT = 650;
  if (content.length <= LIMIT || expanded) {
    return (
      <>
        <p className="msg-text text-[15px] leading-relaxed break-words whitespace-pre-wrap">
          {renderRichText(content, meUsername, onOpenUsername)}
        </p>
        {content.length > LIMIT && (
          <button
            onClick={() => setExpanded(false)}
            className="mt-0.5 text-[12px] font-medium text-slate-400 hover:text-white"
          >
            Свернуть
          </button>
        )}
      </>
    );
  }
  return (
    <>
      <p className="msg-text text-[15px] leading-relaxed break-words whitespace-pre-wrap">
        {renderRichText(content.slice(0, LIMIT) + "…", meUsername, onOpenUsername)}
      </p>
      <button
        onClick={() => setExpanded(true)}
        className="mt-0.5 text-[12px] font-medium text-slate-400 hover:text-white"
      >
        Показать полностью ({Math.ceil(content.length / 100) / 10} тыс. симв.)
      </button>
    </>
  );
}

function MessageBubble({
  message,
  meId,
  own,
  space,
  grouped,
  lastOfGroup = true,
  read,
  canDelete,
  canPin,
  highlighted,
  onOpenImage,
  onDelete,
  onReply,
  onEdit,
  onPin,
  onReact,
  onMenu,
  onDiscuss,
  commentCount,
  postNum,
  restricted,
  premium,
  meUsername,
  onOpenUsername,
  onJump,
  onViewUser,
  onDoubleTap,
}: {
  message: ChatMessage;
  /** id текущего пользователя — чтобы в цитате писать «Вы», а не имя. */
  meId: string;
  own: boolean;
  space: boolean;
  grouped: boolean;
  /** Последнее сообщение в своей группе — влияет на «хвостик» пузыря. */
  lastOfGroup?: boolean;
  read: boolean;
  canDelete: boolean;
  canPin: boolean;
  highlighted: boolean;
  onOpenImage: (url: string) => void;
  onDelete: () => void;
  onReply: () => void;
  onEdit: () => void;
  onPin: () => void;
  onReact: (emoji: string) => void;
  onMenu: (x: number, y: number, message: ChatMessage) => void;
  onDiscuss?: (postId: string) => void;
  commentCount?: number | null;
  /** Номер поста в канале (#1, #2…) — как счётчик публикаций. */
  postNum?: number | null;
  /** Ограниченный чат (как в ТГ): без копирования/сохранения. */
  restricted?: boolean;
  /** Pulse Premium включён — доступны голос→текст и т. п. */
  premium?: boolean;
  meUsername?: string;
  onOpenUsername?: (name: string) => void;
  onJump: (id: string) => void;
  onViewUser: (u: PublicUser) => void;
  /** Двойной клик по сообщению — быстрая реакция, как в Telegram. */
  onDoubleTap?: () => void;
}) {
  const sender = message.sender;
  const alignRight = own && !space;
  // Редактируется только текст: у картинок/файлов/гифок-стикеров содержимое —
  // JSON-вложение, правка «как текста» ломала его (баг «изменено, но пусто»).
  const canEdit = own && message.type === "text";

  // долгое нажатие на телефоне = контекстное меню
  const longPress = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const suppressClick = useRef(false);
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    if (!t) return;
    touchStart.current = { x: t.clientX, y: t.clientY };
    suppressClick.current = false;
    longPress.current = setTimeout(() => {
      longPress.current = null;
      suppressClick.current = true;
      onMenu(t.clientX, t.clientY, message);
    }, 480);
  };
  const cancelLongPress = () => {
    if (longPress.current) clearTimeout(longPress.current);
    longPress.current = null;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const t = e.touches[0];
    const s = touchStart.current;
    if (t && s && (Math.abs(t.clientX - s.x) > 12 || Math.abs(t.clientY - s.y) > 12)) cancelLongPress();
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const fired = suppressClick.current;
    cancelLongPress();
    if (fired) {
      // не даём браузеру сгенерировать click — он мгновенно закрыл бы меню
      e.preventDefault();
      suppressClick.current = false;
    }
  };

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

  // вложение (для старых «сломанных» text-сообщений тоже распознаётся)
  const att = parseAttachment(message.type, message.content);
  /** «Стикер»: сообщение только из эмодзи рисуем крупно и без пузыря. */
  const sticker = message.type === "text" && emojiOnly(message.content);
  /** Анимированная гифка (как в ТГ): сообщение вида «gifpack:<id>». */
  const gif = message.type === "text" ? gifpackId(message.content) : null;
  /** Опрос: «poll:{...}». */
  const poll = message.type === "text" ? parsePoll(message.content) : null;
  /** Старое «сломанное» text-сообщение с видео-файлом (не кружок). */
  const legacyVideo =
    message.type === "text" && !!att && (att.mimeType ?? "").toLowerCase().startsWith("video/") && !att.duration;
  const legacyKind = message.type === "text" ? legacyAttachmentKind(att) : null;
  const isVoice = message.type === "voice" || legacyKind === "voice";
  const isNote = message.type === "video_note" || legacyKind === "video_note";
  const isImage = message.type === "image" && !legacyKind;
  const isFile = message.type === "file" && !legacyKind;
  const isGift = message.type === "gift";

  // голосовые и кружки не группируем вплотную — им нужен воздух
  const media = isVoice || isNote || isFile;

  return (
    <div
      className={`group no-callout relative flex items-start gap-2 ${media ? "py-1.5" : "py-0.5"} ${
        grouped ? "" : "mt-1.5"
      } ${isGift ? "justify-center" : alignRight ? "justify-end" : "justify-start"} ${highlighted ? "animate-pulse-dot" : ""}`}
      onContextMenu={(e) => {
        e.preventDefault();
        onMenu(e.clientX, e.clientY, message);
      }}
      onDoubleClick={() => (onDoubleTap ? onDoubleTap() : onReply())}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={cancelLongPress}
    >
      {/* Быстрые реакции при наведении — как в больших мессенджерах */}
      <div className="glass-strong absolute -top-3 right-2 z-10 hidden items-center gap-0.5 rounded-full px-1.5 py-0.5 group-hover:flex">
        {["❤️", "😂", "👍", "🔥"].map((e) => (
          <button
            key={e}
            onClick={(ev) => {
              ev.stopPropagation();
              onReact(e);
            }}
            className="text-[15px] transition-transform hover:scale-125"
            title="Реакция"
          >
            {e}
          </button>
        ))}
      </div>
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
            className="mb-1 block text-left text-[12px] font-semibold text-slate-400/90 hover:text-slate-300"
            style={sender.nameColor ? { color: sender.nameColor } : undefined}
          >
            {sender.displayName}
          </button>
        )}

        <div
          className={`relative overflow-hidden ${restricted ? "select-none" : ""} ${
            isNote || sticker || gif || isGift ? "" : own && !space ? "bubble-own text-white" : "bubble-peer text-white/90"
          } ${
            isNote || sticker || gif || isGift
              ? ""
              : `${own && !space ? "bubble-own-radius" : "bubble-peer-radius"} ${
                  grouped ? (lastOfGroup ? "g-last" : "g-mid") : lastOfGroup ? "" : "g-first"
                } px-4 py-2.5`
          } ${highlighted ? "ring-2 ring-[#5865f2]/60" : ""}`}
        >
          {/* «Переслано от …» — как в ТГ: аватарка + автор оригинала; тап открывает профиль */}
          {message.forwardedFrom && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (message.forwardedUser) onViewUser(message.forwardedUser);
              }}
              title={message.forwardedUser ? `Открыть профиль: ${message.forwardedFrom}` : undefined}
              className={`mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-sky-300 ${
                message.forwardedUser ? "cursor-pointer hover:text-sky-200" : "cursor-default"
              }`}
            >
              <Avatar name={message.forwardedFrom} src={message.forwardedAvatar ?? null} size={18} />
              Переслано от {message.forwardedFrom}
            </button>
          )}

          {/* Цитата (ответ на сообщение) */}
          {message.replyTo && (
            <button
              onClick={() => onJump(message.replyTo!.id)}
              className="mb-1.5 flex w-full gap-2 rounded-xl border-l-2 border-slate-500/70 bg-black/20 px-2.5 py-1.5 text-left"
            >
              <CornerUpLeft className="mt-0.5 h-3 w-3 shrink-0 text-slate-400/80" />
              <span className="min-w-0">
                <span className="block truncate text-[11px] font-semibold text-slate-300">
                  {message.replyTo.senderId === meId ? "Вы" : message.replyTo.senderName}
                </span>
                <span className="block truncate text-[12px] text-white/50">
                  {message.replyTo.deleted ? (
                    "Сообщение удалено"
                  ) : (
                    <PreviewLabel type={message.replyTo.type} content={message.replyTo.content} />
                  )}
                </span>
              </span>
            </button>
          )}

          {isGift ? (
            <GiftCard
              content={message.content}
              senderName={message.sender?.displayName ?? ""}
              senderAvatarUrl={message.sender?.avatarUrl ?? null}
              createdAt={message.createdAt}
              own={message.senderId === meId}
            />
          ) : isVoice && att ? (
            <VoiceBubble
              url={att.url}
              duration={att.duration ?? 0}
              own={own && !space}
              messageId={message.id}
              premium={premium}
              serverTranscript={message.transcript ?? null}
            />
          ) : isNote && att ? (
            <VideoNoteBubble url={att.url} duration={att.duration ?? 0} />
          ) : isImage && att?.sticker ? (
            /* Стикеры (в т.ч. анимированные гифки) — крупно и без пузыря */
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={att.url}
              alt="Стикер"
              draggable={false}
              className="max-h-44 max-w-44 min-w-24 select-none"
            />
          ) : isImage && att ? (
            <div>
              <SpoilerImage url={att.url} caption={att.caption} onOpen={onOpenImage} spoiler={!!att.spoiler} />
              {att.caption && (
                <p className="msg-text px-1 pt-2 pb-1 text-[15px] leading-relaxed break-words whitespace-pre-wrap">
                  {renderRichText(att.caption, meUsername, onOpenUsername)}
                </p>
              )}
            </div>
          ) : isFile && att && (att.mimeType ?? "").toLowerCase().startsWith("video/") ? (
            <VideoBubble url={att.url} caption={att.caption} own={own && !space} onOpenImage={onOpenImage} />
          ) : legacyVideo && att ? (
            <VideoBubble url={att.url} caption={att.caption} own={own && !space} onOpenImage={onOpenImage} />
          ) : isFile && att ? (
            <FileCard att={att} restricted={restricted} />
          ) : gif ? (
            /* Анимированная гифка — крупно, без пузыря, как в ТГ */
            <div
              className="py-0.5 select-none [&_svg]:h-36 [&_svg]:w-36"
              // SVG из доверенного набора приложения
              dangerouslySetInnerHTML={{ __html: findGif(gif)?.svg ?? "" }}
            />
          ) : sticker ? (
            /* «Стикер»: только эмодзи — крупно, без пузыря (как в мессенджерах) */
            <p className="py-0.5 text-[52px] leading-none select-none">{message.content.trim()}</p>
          ) : poll ? (
            <PollCard msgId={message.id} q={poll.q} opts={poll.opts} multi={!!poll.multi} quiz={poll.quiz ?? null} serverCounts={message.pollVotes} myServerVotes={message.myPollVotes} />
          ) : (() => {
            if (message.type === "text" && message.content.startsWith("contact:")) {
              try {
                const c = JSON.parse(message.content.slice(8)) as { name?: string; username?: string; avatar?: string };
                return <ContactCard name={c.name ?? "Контакт"} username={c.username ?? ""} avatar={c.avatar ?? ""} onOpenUsername={onOpenUsername} />;
              } catch { /* мусор — покажем как текст */ }
            }
            if (message.type === "text" && message.content.startsWith("location:")) {
              try {
                const l = JSON.parse(message.content.slice(9)) as { lat?: number; lon?: number };
                if (typeof l.lat === "number" && typeof l.lon === "number") return <LocationCard lat={l.lat} lon={l.lon} />;
              } catch { /* мусор */ }
            }
            const sq = message.type === "text" ? parseStoryQuote(message.content) : null;
            if (!sq) {
              return (
                <>
                  <LongText content={message.content} meUsername={meUsername} onOpenUsername={onOpenUsername} />
                  {message.type === "text" && <LinkPreview text={message.content} />}
                </>
              );
            }
            return (
              <>
                <StoryQuoteCard quote={sq.quote} />
                {sq.text && <LongText content={sq.text} meUsername={meUsername} onOpenUsername={onOpenUsername} />}
              </>
            );
          })()}
        </div>

        {/* Комментарии канала — пузырь-кнопка как в Telegram */}
        {onDiscuss && (
          <button
            onClick={() => onDiscuss(message.id)}
            className={`mt-1.5 flex items-center justify-center gap-1.5 rounded-xl px-3 py-1.5 text-[12px] font-medium transition-colors ${
              own
                ? "bg-black/25 text-white/85 hover:bg-black/35"
                : "bg-white/[0.07] text-slate-300 hover:bg-white/[0.12]"
            }`}
          >
            <MessageSquare className="h-3.5 w-3.5 opacity-80" />
            {commentCount != null && commentCount > 0
              ? `${commentCount} ${commentCount % 10 === 1 && commentCount % 100 !== 11 ? "комментарий" : [2, 3, 4].includes(commentCount % 10) && ![12, 13, 14].includes(commentCount % 100) ? "комментария" : "комментариев"}`
              : "Комментировать"}
          </button>
        )}

        {/* Реакции */}
        {message.reactions && message.reactions.length > 0 && (
          <div className={`mt-1 flex flex-wrap gap-1 ${alignRight ? "justify-end" : ""}`}>
            {message.reactions.map((r) => (
              <button
                key={r.emoji}
                onClick={() => onReact(r.emoji)}
                title={r.mine ? "Убрать реакцию" : "Поставить реакцию"}
                className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs transition-colors ${
                  r.mine
                    ? "bg-[#5865f2]/30 text-slate-200 ring-1 ring-[#5865f2]/50"
                    : "bg-white/8 text-white/70 hover:bg-white/12"
                }`}
              >
                <span>{r.emoji}</span>
                {r.count > 1 && <span className="text-[10px] font-semibold tabular-nums">{r.count}</span>}
              </button>
            ))}
          </div>
        )}

        <div className={`mt-1 flex items-center gap-1 text-[11px] text-white/35 tabular-nums ${alignRight ? "justify-end" : ""}`}>
          {message.silent && (
            <span title="Отправлено без звука">
              <VolumeX className="h-3 w-3 text-white/35" />
            </span>
          )}
          {postNum != null && (
            <span title="Номер поста в канале" className="text-white/45">#{postNum}</span>
          )}
          <span>{timeHHmm(message.createdAt)}</span>
          {message.pinned && (
            <span title="Закреплено" className="flex items-center">
              <Pin className="h-3 w-3 text-slate-400" />
            </span>
          )}
          {/* Просмотры поста канала — «глазик» как в ТГ */}
          {onDiscuss && message.views != null && (
            <span className="flex items-center gap-0.5 tabular-nums">
              <Eye className="h-3 w-3" />
              {message.views >= 1000
                ? `${(message.views / 1000).toFixed(message.views >= 10000 ? 0 : 1).replace(".", ",")}K`
                : message.views}
            </span>
          )}
          {message.editedAt && <span className="italic">изменено</span>}
          {own &&
            (read ? <CheckCheck className="h-3.5 w-3.5 text-slate-400" /> : <Check className="h-3.5 w-3.5" />)}
          {/* Подпись поста канала именем администратора — как в ТГ */}
          {onDiscuss && !message.replyToId && message.sender?.displayName && (
            <span className="italic text-white/40">{message.sender.displayName.split(" ")[0]}</span>
          )}
        </div>
      </div>

      {/* Действия: ответить / реакция / изменить / удалить.
          На телефоне hover нет — поэтому там кнопки всегда чуть видны. */}
      <div
        className={`flex shrink-0 items-center gap-0.5 self-center opacity-60 transition-opacity group-hover:opacity-100 max-md:opacity-60 ${
          alignRight ? "order-0" : ""
        }`}
      >
        <button
          onClick={onReply}
          title="Ответить"
          className="rounded-full p-1 text-white/30 hover:text-slate-400"
        >
          <Reply className="h-3.5 w-3.5" />
        </button>
        {canPin && (
          <button
            onClick={onPin}
            title={message.pinned ? "Открепить" : "Закрепить"}
            className={`rounded-full p-1 ${message.pinned ? "text-slate-400 hover:text-rose-300" : "text-white/30 hover:text-emerald-300"}`}
          >
            {message.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
          </button>
        )}
        <button
          onClick={(e) => {
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            onMenu(rect.left - 100, rect.bottom + 6, message);
          }}
          title="Реакция"
          className="rounded-full p-1 text-white/30 hover:text-amber-300"
        >
          <SmilePlus className="h-3.5 w-3.5" />
        </button>
        {canEdit && (
          <button onClick={onEdit} title="Изменить" className="rounded-full p-1 text-white/30 hover:text-slate-400">
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
        {canDelete && (
          <button onClick={onDelete} title="Удалить" className="rounded-full p-1 text-white/30 hover:text-rose-300">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────── голосовое сообщение ─────────────────────────── */

const WAVE_BARS = [
  8, 14, 20, 11, 26, 18, 9, 22, 30, 14, 10, 24, 16, 28, 12, 19, 25, 9, 15, 27, 11, 21, 17, 29, 13, 23, 10, 18,
];

/** Сообщение-подарок в чате: большая карточка по центру, тап — детали как в ТГ. */
function GiftCard({
  content,
  senderName,
  senderAvatarUrl,
  createdAt,
  own,
}: {
  content: string;
  senderName: string;
  senderAvatarUrl: string | null;
  createdAt: string;
  own: boolean;
}) {
  const [open, setOpen] = useState(false);
  let giftKey = "";
  let note = "";
  let anonymous = false;
  let variant = 0;
  try {
    const p = JSON.parse(content) as { giftKey?: unknown; note?: unknown; anonymous?: unknown; variant?: unknown };
    if (typeof p.giftKey === "string") giftKey = p.giftKey;
    if (typeof p.note === "string") note = p.note;
    anonymous = p.anonymous === true;
    if (typeof p.variant === "number" && p.variant >= 0 && p.variant <= 4) variant = p.variant;
  } catch {
    /* битый контент */
  }
  const gift = findGift(giftKey);
  if (!gift) return null;
  // Анонимность — для всех, кроме отправителя (он всегда видит себя)
  const showAnon = anonymous && !own;
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title={`${gift.name} · нажмите, чтобы посмотреть детали`}
        className={`gift-shine relative flex w-72 flex-col items-center gap-1.5 overflow-hidden rounded-3xl border bg-gradient-to-br px-5 py-6 transition-transform hover:scale-[1.02] ${
          gift.nft ? "border-amber-300/40" : "border-white/10"
        } ${gift.bg}`}
      >
        {gift.img ? (
          <NftFigure gift={gift} size={80} rounded="rounded-2xl" variant={variant} />
        ) : (
          <span
            className="gift-anim h-20 w-20 [&>svg]:h-full [&>svg]:w-full"
            dangerouslySetInnerHTML={{ __html: gift.icon }}
          />
        )}
        {gift.nft && (
          <span className="absolute top-2 left-2 rounded-full bg-black/60 px-1.5 py-px text-[8px] font-bold tracking-wider text-amber-300 uppercase backdrop-blur">
            NFT
          </span>
        )}
        <span className="text-[15px] font-bold">{gift.name}</span>
        <span className="flex items-center gap-1 text-[12px] font-bold text-amber-200">
          <Star className="h-3.5 w-3.5" /> {gift.price}
        </span>
        {note && <span className="max-w-full truncate text-[12px] text-white/60">«{note}»</span>}
        <span className="pt-0.5 text-[11px] text-white/40">
          {showAnon ? "Подарок от Анонима" : `Подарок от ${senderName || "…"}`}
        </span>
      </button>
      {open && (
        <GiftDetailModal
          giftKey={giftKey}
          note={note}
          senderName={senderName}
          senderAvatarUrl={senderAvatarUrl}
          anonymous={showAnon}
          createdAt={createdAt}
          variant={variant}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function VoiceBubble({
  url,
  duration,
  own,
  messageId,
  premium,
  serverTranscript = null,
}: {
  url: string;
  duration: number;
  own: boolean;
  messageId?: string;
  premium?: boolean;
  /** Расшифровка с сервера — видна всем сразу, как в ТГ. */
  serverTranscript?: string | null;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [speedIdx, setSpeedIdx] = useState(0);
  const [total, setTotal] = useState(duration || 0);
  const speeds = [1, 1.5, 2];
  /** Текст голосового показывается СРАЗУ: серверная расшифровка или кэш. */
  const sttText = serverTranscript ?? (() => {
    if (!messageId) return null;
    try {
      const all = JSON.parse(localStorage.getItem("pulse_stt_v1") ?? "{}") as Record<string, string>;
      return typeof all[messageId] === "string" ? all[messageId] : null;
    } catch {
      return null;
    }
  })();

  /** Уникальный ключ плеера для эксклюзивного воспроизведения. */
  const pbId = useRef(`voice-${Math.random().toString(36).slice(2)}`).current;

  const start = () => {
    const a = audioRef.current;
    if (!a) return;
    // Ставим на паузу любой другой играющий голосовой/кружок (позиция у него
    // сохраняется), затем играем этот — с текущей секунды.
    claimPlayback(pbId, () => a.pause());
    void a.play().catch(() => {});
  };

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) start();
    else a.pause();
  };

  useEffect(() => () => releasePlayback(pbId), [pbId]);

  return (
    <div className="flex w-64 min-w-52 flex-col gap-1.5 py-0.5">
    <div className="flex items-center gap-3">
      <audio
        ref={audioRef}
        src={url}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setProgress(0);
          releasePlayback(pbId);
        }}
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d) && d > 0) setTotal(d);
        }}
        onTimeUpdate={(e) => {
          const a = e.currentTarget;
          const t = Number.isFinite(a.duration) && a.duration > 0 ? a.duration : total;
          setProgress(t > 0 ? Math.min(1, a.currentTime / t) : 0);
        }}
      />
      <button
        onClick={toggle}
        title={playing ? "Пауза" : "Воспроизвести"}
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-transform hover:scale-105 active:scale-95 ${
          own ? "bg-white/20 text-white" : "btn-gradient text-white"
        }`}
      >
        {playing ? <Pause className="h-5 w-5" /> : <Play className="ml-0.5 h-5 w-5" />}
      </button>

      <div className="min-w-0 flex-1">
        {/* «Волна»: бары закрашиваются по мере проигрывания */}
        <button
          onClick={(e) => {
            const a = audioRef.current;
            if (a && total > 0) {
              const rect = e.currentTarget.getBoundingClientRect();
              a.currentTime = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * total;
              start();
            }
          }}
          className="flex h-8 w-full items-center gap-[2px]"
          title="Перемотать"
        >
          {WAVE_BARS.map((h, i) => {
            const filled = i / WAVE_BARS.length <= progress;
            return (
              <span
                key={i}
                className={`w-[3px] rounded-full transition-colors ${filled ? "bg-slate-300" : "bg-white/20"}`}
                style={{ height: `${h}px` }}
              />
            );
          })}
        </button>
        <div className="flex items-center justify-between text-[11px] text-white/45 tabular-nums">
          <span>{formatDuration(Math.round(total))}</span>
          <button
            onClick={() => {
              const next = (speedIdx + 1) % speeds.length;
              setSpeedIdx(next);
              if (audioRef.current) audioRef.current.playbackRate = speeds[next];
            }}
            title="Скорость воспроизведения"
            className="rounded-full bg-white/8 px-2 py-0.5 text-[10px] font-semibold text-white/70 transition-colors hover:bg-white/15"
          >
            {speeds[speedIdx]}x
          </button>
        </div>
      </div>
    </div>
    {sttText && (
      <p className="rounded-xl border border-white/8 bg-black/20 px-3 py-2 text-[12px] leading-relaxed text-white/80">
        {sttText}
      </p>
    )}
    </div>
  );
}

/* ─────────────────────────── кружок (видеосообщение) ─────────────────────────── */

function VideoNoteBubble({ url, duration }: { url: string; duration: number }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(duration || 0);
  /** Уникальный ключ плеера для эксклюзивного воспроизведения. */
  const pbId = useRef(`note-${Math.random().toString(36).slice(2)}`).current;

  const toggle = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      setStarted(true);
      // Ставим на паузу любой другой играющий кружок/голосовой — без «каши»
      // из двух звуков одновременно. Позиция у остановленного сохраняется.
      claimPlayback(pbId, () => v.pause());
      void v.play().catch(() => {});
    } else {
      v.pause();
    }
  };

  useEffect(() => () => releasePlayback(pbId), [pbId]);

  const R = 108; // радиус кольца прогресса
  const C = 2 * Math.PI * R;

  return (
    <div className="relative h-[224px] w-[224px] select-none">
      <video
        ref={videoRef}
        src={url}
        playsInline
        preload="metadata"
        className="h-full w-full rounded-full object-cover"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setProgress(0);
          releasePlayback(pbId);
        }}
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d) && d > 0) setTotal(d);
        }}
        onTimeUpdate={(e) => {
          const v = e.currentTarget;
          const t = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : total;
          setProgress(t > 0 ? Math.min(1, v.currentTime / t) : 0);
        }}
        onClick={toggle}
      />
      {/* Кольцо прогресса */}
      <svg viewBox="0 0 224 224" className="pointer-events-none absolute inset-0 h-full w-full -rotate-90">
        <circle cx="112" cy="112" r={R} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="3" />
        <circle
          cx="112"
          cy="112"
          r={R}
          fill="none"
          stroke="rgb(167 139 250)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - progress)}
        />
      </svg>
      {!playing && (
        <button
          onClick={toggle}
          className="absolute inset-0 flex items-center justify-center rounded-full transition-colors hover:bg-black/25"
          title={started ? "Продолжить" : "Воспроизвести"}
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-black/55 backdrop-blur-sm">
            <Play className="ml-1 h-6 w-6 text-white" />
          </span>
        </button>
      )}
      <span className="pointer-events-none absolute right-3 bottom-3 rounded-full bg-black/70 px-2 py-0.5 text-[10px] text-white/80 tabular-nums">
        {formatDuration(Math.round(total))}
      </span>
    </div>
  );
}

/* ─────────────────────────── карточка файла ─────────────────────────── */

/** Опрос/викторина как в ТГ. Голоса — серверные: все видят одинаковые результаты. */
function PollCard({
  msgId,
  q,
  opts,
  multi,
  quiz,
  serverCounts,
  myServerVotes,
}: {
  msgId: string;
  q: string;
  opts: string[];
  multi: boolean;
  quiz: number | null;
  serverCounts?: number[];
  myServerVotes?: number[];
}) {
  const [counts, setCounts] = useState<number[]>(() =>
    serverCounts && serverCounts.length === opts.length ? serverCounts : opts.map(() => 0),
  );
  const [myVotes, setMyVotes] = useState<number[]>(() => myServerVotes ?? []);
  const [pending, setPending] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  // Сервер прислал новые итоги (кто-то проголосовал) — синхронизируем
  useEffect(() => {
    if (serverCounts && serverCounts.length === opts.length) setCounts(serverCounts);
  }, [serverCounts, opts.length]);
  useEffect(() => {
    setMyVotes(myServerVotes ?? []);
  }, [myServerVotes]);
  const voted = myVotes.length > 0;
  /** «Результаты» без голосования: столбики видны, голос не засчитан. */
  const [preview, setPreview] = useState(false);
  const showBars = voted || preview;
  const total = counts.reduce((sum, n) => sum + n, 0);

  const applyResp = (d: { counts?: number[]; myVotes?: number[] }) => {
    if (Array.isArray(d.counts) && d.counts.length === opts.length) setCounts(d.counts);
    if (Array.isArray(d.myVotes)) setMyVotes(d.myVotes);
  };

  const voteOne = async (i: number) => {
    if (voted || busy) return;
    setBusy(true);
    // оптимистично, чтобы отклик был мгновенным
    setCounts((c) => c.map((n, j) => (j === i ? n + 1 : n)));
    setMyVotes([i]);
    try {
      const d = await api<{ counts: number[]; myVotes: number[] }>(`/api/messages/${msgId}/vote`, {
        method: "POST",
        body: JSON.stringify({ option: i, multi: false }),
      });
      applyResp(d);
    } catch {
      /* сервер поправит итоги при следующем опросе */
    } finally {
      setBusy(false);
    }
  };

  const commitMulti = async () => {
    if (busy || pending.length === 0) return;
    setBusy(true);
    try {
      // добавляем новые варианты и снимаем убранные
      const toAdd = pending.filter((i) => !myVotes.includes(i));
      const toRemove = myVotes.filter((i) => !pending.includes(i));
      let last: { counts: number[]; myVotes: number[] } | null = null;
      for (const i of [...toAdd, ...toRemove]) {
        last = await api<{ counts: number[]; myVotes: number[] }>(`/api/messages/${msgId}/vote`, {
          method: "POST",
          body: JSON.stringify({ option: i, multi: true }),
        });
      }
      if (last) applyResp(last);
      setPending([]);
    } catch {
      /* сервер поправит */
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="w-[min(78vw,340px)] py-0.5">
      <p className="mb-0.5 flex items-center gap-1.5 text-[11px] text-white/40">
        <BarChart3 className="h-3 w-3" /> {quiz != null ? "Викторина" : multi ? "Опрос · несколько ответов" : "Опрос"}
      </p>
      <p className="mb-2 text-[15px] font-semibold break-words">{q}</p>
      <div className="flex flex-col gap-1.5">
        {opts.map((o, i) => {
          const pct = total > 0 ? Math.round((counts[i] / total) * 100) : 0;
          const chosen = myVotes.includes(i) || (!voted && multi && pending.includes(i));
          const isRight = quiz === i;
          const chosenWrong = voted && quiz != null && myVotes.includes(i) && !isRight;
          return (
            <button
              key={i}
              onClick={() => {
                if (voted || preview) return;
                if (multi) setPending((cur) => (cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i]));
                else void voteOne(i);
              }}
              disabled={voted || preview || busy}
              className={`relative overflow-hidden rounded-xl border px-3 py-2 text-left text-[13px] transition-colors ${
                chosen
                  ? isRight && voted
                    ? "border-emerald-400/60 text-white"
                    : chosenWrong
                    ? "border-rose-400/60 text-white"
                    : "border-[#5865f2]/60 text-white"
                  : "border-white/10 text-white/80 " + (!voted && !busy ? "hover:bg-white/8" : "")
              }`}
            >
              {showBars && (
                <span
                  className={`absolute inset-y-0 left-0 transition-all ${isRight && quiz != null ? "bg-emerald-400/20" : "bg-[#5865f2]/25"}`}
                  style={{ width: `${pct}%` }}
                />
              )}
              <span className="relative flex items-center gap-2">
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center ${multi || quiz != null ? "rounded-md" : "rounded-full"} border ${
                    chosen
                      ? isRight && voted
                        ? "border-emerald-400 bg-emerald-400"
                        : chosenWrong
                        ? "border-rose-400 bg-rose-400"
                        : "border-[#5865f2] bg-[#5865f2]"
                      : "border-white/30"
                  }`}
                >
                  {chosen && (chosenWrong ? <X className="h-2.5 w-2.5 text-white" /> : <Check className="h-2.5 w-2.5 text-white" />)}
                  {!chosen && voted && quiz != null && isRight && <Check className="h-2.5 w-2.5 text-emerald-300" />}
                </span>
                <span className="min-w-0 flex-1 break-words">{o}</span>
                {showBars && <span className="shrink-0 text-[11px] text-white/45 tabular-nums">{pct}%</span>}
              </span>
            </button>
          );
        })}
      </div>
      {!voted && multi && !preview && (
        <button
          onClick={() => void commitMulti()}
          disabled={pending.length === 0 || busy}
          className="btn-gradient mt-2 rounded-xl px-4 py-1.5 text-[12px] font-semibold disabled:opacity-40"
        >
          {busy ? "Считаем…" : `Проголосовать${pending.length > 0 ? ` (${pending.length})` : ""}`}
        </button>
      )}
      {!voted && (
        <button
          onClick={() => setPreview((v) => !v)}
          className="mt-2 rounded-xl bg-white/[0.06] px-3 py-1.5 text-[12px] font-medium text-white/70 transition-colors hover:bg-white/10"
        >
          {preview ? "← Вернуться к голосованию" : "Результаты без голосования"}
        </button>
      )}
      <p className="mt-1.5 text-[11px] text-white/35 tabular-nums">
        {voted && quiz != null
          ? myVotes.includes(quiz)
            ? "Верно! 🎉"
            : "Неверно — правильный ответ подсвечен"
          : preview
          ? `Проголосовало: ${total} · это предпросмотр, ваш голос не учтён`
          : total > 0
          ? `Проголосовало: ${total}`
          : "Проголосуйте — результаты увидят все"}
      </p>
    </div>
  );
}

/** Разобрать сообщение-опрос вида «poll:{json}». */
function parsePoll(content: string): { q: string; opts: string[]; multi?: boolean; quiz?: number | null } | null {
  if (!content.startsWith("poll:")) return null;
  try {
    const p = JSON.parse(content.slice(5)) as { q?: unknown; opts?: unknown; multi?: unknown; quiz?: unknown };
    if (typeof p.q === "string" && Array.isArray(p.opts) && p.opts.every((o) => typeof o === "string"))
      return {
        q: p.q,
        opts: p.opts.slice(0, 10),
        multi: p.multi === true,
        quiz: typeof p.quiz === "number" ? p.quiz : null,
      };
  } catch {
    /* не опрос */
  }
  return null;
}

/** Превью ссылки в тексте — карточка с доменом, как в ТГ. */
function LinkPreview({ text }: { text: string }) {
  const m = text.match(/https?:\/\/[^\s<>"']+/i);
  if (!m) return null;
  let url: URL;
  try {
    url = new URL(m[0]);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, "");
  return (
    <a
      href={m[0]}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="mt-1.5 flex max-w-72 items-center gap-2.5 rounded-xl border-l-2 border-[#5865f2] bg-white/[0.05] px-3 py-2 transition-colors hover:bg-white/[0.09]"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=32`}
        alt=""
        className="h-7 w-7 shrink-0 rounded-md bg-white/10"
        onError={(e) => {
          e.currentTarget.style.display = "none";
        }}
      />
      <span className="min-w-0">
        <span className="block truncate text-[12px] font-semibold text-[#8ea1ff]">{host}</span>
        <span className="block truncate text-[11px] text-white/40">
          {url.pathname !== "/" ? url.pathname : "Ссылка"}
        </span>
      </span>
    </a>
  );
}

/** Видео-файл в чате: прямоугольный плеер с превью-кадром (как в ТГ), НЕ кружок. */
function VideoBubble({
  url,
  caption,
  own,
  onOpenImage,
}: {
  url: string;
  caption?: string;
  own?: boolean;
  onOpenImage?: (url: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [started, setStarted] = useState(false);
  return (
    <div className="w-[min(78vw,340px)]">
      <div className="relative overflow-hidden rounded-xl bg-black/60">
        {/* preload=metadata — браузер подтягивает первый кадр как превью */}
        <video
          ref={videoRef}
          src={url}
          playsInline
          preload="metadata"
          controls={started}
          onPlay={() => setStarted(true)}
          onPause={() => setStarted(false)}
          onEnded={() => setStarted(false)}
          className="max-h-[400px] w-full cursor-pointer object-contain"
          onClick={() => {
            const v = videoRef.current;
            if (!v) return;
            if (v.paused) void v.play();
            else v.pause();
          }}
        />
        {!started && (
          <button
            onClick={() => {
              const v = videoRef.current;
              if (v) void v.play();
            }}
            title="Воспроизвести видео"
            className="absolute inset-0 flex items-center justify-center transition-colors hover:bg-black/20"
          >
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-black/55 backdrop-blur-sm">
              <Play className="ml-1 h-6 w-6 text-white" />
            </span>
          </button>
        )}
      </div>
      {caption && (
        <p className="msg-text px-1 pt-2 pb-1 text-[15px] leading-relaxed break-words whitespace-pre-wrap">{caption}</p>
      )}
      {!caption && own && <span className="sr-only">Видео</span>}
    </div>
  );
}

function FileCard({ att, restricted }: { att: AttachmentInfo; restricted?: boolean }) {
  const mime = att.mimeType ?? "";
  // Скачивание с прогрессом «0.0 МБ из N МБ», как в Telegram
  const [prog, setProg] = useState<{ l: number; t: number } | null>(null);
  const [dlErr, setDlErr] = useState("");
  const download = async () => {
    try {
      setDlErr("");
      setProg({ l: 0, t: att.size ?? 0 });
      const res = await fetch(att.url);
      if (!res.ok) throw new Error("http");
      const total = Number(res.headers.get("content-length")) || att.size || 0;
      const reader = res.body?.getReader();
      if (!reader) throw new Error("stream");
      const chunks: BlobPart[] = [];
      let l = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        l += value.length;
        setProg({ l, t: total });
      }
      const blob = new Blob(chunks, { type: mime || undefined });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = att.name ?? "file";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      setProg(null);
    } catch {
      setDlErr("Не удалось скачать — попробуйте ещё раз");
      setProg(null);
    }
  };
  return(
    <div className="w-72 min-w-60">
      <div className="flex items-center gap-3">
        <span className="glass flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl">
          <DraftFileIcon mime={mime} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-white/90">{att.name ?? "Файл"}</p>
          <p className="text-[11px] text-white/40 tabular-nums">
            {prog ? `${formatBytes(prog.l)} из ${formatBytes(prog.t)}` : formatBytes(att.size)}
            {mime ? ` · ${mime.split("/")[1]?.split(";")[0] ?? mime}` : ""}
          </p>
          {prog && (
            <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-white/15">
              <div
                className="h-full bg-white/60 transition-all"
                style={{ width: `${Math.min(100, (prog.l / Math.max(1, prog.t)) * 100)}%` }}
              />
            </div>
          )}
          {dlErr && <p className="mt-0.5 text-[11px] text-rose-300">{dlErr}</p>}
        </div>
        {restricted ? (
          <span
            title="В этом чате запрещено сохранение контента"
            className="glass flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white/35"
          >
            <Lock className="h-4.5 w-4.5" />
          </span>
        ) : (
          <button
            onClick={(e) => {
              e.stopPropagation();
              void download();
            }}
            title="Скачать"
            className="glass flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white/75 transition-colors hover:text-white"
          >
            <Download className="h-4.5 w-4.5" />
          </button>
        )}
      </div>
      {(mime.startsWith("audio/") || mime.startsWith("video/")) && (
        <div className="mt-2">
          {mime.startsWith("audio/") ? (
            <audio src={att.url} controls preload="metadata" className="h-9 w-full" />
          ) : (
            <video src={att.url} controls preload="metadata" className="mt-1 max-h-64 w-full rounded-xl" />
          )}
        </div>
      )}
      {att.caption && (
        <p className="mt-2 text-[15px] leading-relaxed break-words whitespace-pre-wrap">{att.caption}</p>
      )}
    </div>
  );
}

/* ─────────────────────────── лог звонка ─────────────────────────── */

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

/* ─────────────────── подтверждение удаления сообщения ─────────────────── */

/* ─────────────────── подтверждение удаления чата ─────────────────── */

function ConfirmDeleteChatModal({
  kind,
  isOwner,
  forAll,
  setForAll,
  busy,
  onCancel,
  onConfirm,
}: {
  kind: ConversationKind;
  isOwner: boolean;
  forAll: boolean;
  setForAll: (v: boolean) => void;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const isDirect = kind === "direct";
  const title = isDirect ? "Удалить чат?" : isOwner ? "Удалить чат для всех?" : "Покинуть чат?";
  const subtitle = isDirect
    ? forAll
      ? "Переписка будет удалена у вас и у собеседника. Это действие нельзя отменить."
      : "Чат исчезнет из вашего списка. Собеседник продолжит видеть переписку."
    : isOwner
      ? "Чат и вся переписка будут удалены у всех участников."
      : "Вы выйдете из чата. Остальные участники останутся.";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onCancel}
      className="fixed inset-0 z-[85] grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 8 }}
        onClick={(e) => e.stopPropagation()}
        className="glass-strong w-full max-w-sm rounded-3xl p-6 text-center shadow-2xl"
      >
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-rose-500/15">
          <Trash2 className="h-5 w-5 text-rose-300" />
        </div>
        <h3 className="font-display text-lg font-bold">{title}</h3>
        <p className="mx-auto mt-2 max-w-xs text-sm text-white/45">{subtitle}</p>

        {/* Личный чат: можно удалить только у себя или у обоих */}
        {isDirect && (
          <button
            onClick={() => setForAll(!forAll)}
            className="mt-4 flex w-full items-center gap-3 rounded-2xl border border-white/8 bg-white/4 px-4 py-3 text-left transition-colors hover:bg-white/8"
          >
            <span
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
                forAll ? "border-rose-400 bg-rose-500" : "border-white/25 bg-transparent"
              }`}
            >
              {forAll && <Check className="h-3.5 w-3.5 text-white" />}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium">Удалить для всех</span>
              <span className="block text-xs text-white/35">Стереть переписку и у собеседника</span>
            </span>
          </button>
        )}

        <div className="mt-5 flex gap-2.5">
          <button
            onClick={onCancel}
            className="glass flex-1 rounded-2xl py-3 text-sm font-medium text-white/80 transition-colors hover:bg-white/10"
          >
            Отмена
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-rose-500 py-3 text-sm font-semibold text-white transition-transform hover:scale-[1.02] active:scale-95 disabled:opacity-60"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {isDirect ? "Удалить" : isOwner ? "Удалить" : "Покинуть"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function ConfirmDeleteModal({
  message,
  onConfirm,
  onCancel,
}: {
  message: ChatMessage;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const isAttachment = ["image", "file", "voice", "video_note"].includes(message.type);
  const previewText = (() => {
    if (!isAttachment) {
      const t = message.content.trim();
      return t.length > 90 ? `${t.slice(0, 90)}…` : t;
    }
    return "";
  })();

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onCancel}
      className="fixed inset-0 z-[85] grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 8 }}
        onClick={(e) => e.stopPropagation()}
        className="glass-strong w-full max-w-sm rounded-3xl p-6 text-center shadow-2xl"
      >
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-rose-500/15">
          <Trash2 className="h-5 w-5 text-rose-300" />
        </div>
        <h3 className="font-display text-lg font-bold">Удалить сообщение?</h3>
        {isAttachment ? (
          <p className="mx-auto mt-2 flex max-w-xs items-center justify-center text-sm text-white/45">
            <PreviewLabel type={message.type} content={message.content} iconClassName="h-4 w-4" />
          </p>
        ) : (
          previewText && (
            <p className="mx-auto mt-2 line-clamp-2 max-w-xs text-sm text-white/45">{previewText}</p>
          )
        )}
        <p className="mt-1.5 text-xs text-white/35">Это действие нельзя отменить</p>
        <div className="mt-5 flex gap-2.5">
          <button
            onClick={onCancel}
            className="glass flex-1 rounded-2xl py-3 text-sm font-medium text-white/80 transition-colors hover:bg-white/10"
          >
            Отмена
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 rounded-2xl bg-rose-500 py-3 text-sm font-semibold text-white transition-transform hover:scale-[1.02] active:scale-95"
          >
            Удалить
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ─────────────────────────── эмодзи-пикер ─────────────────────────── */

function EmojiPicker({
  onPick,
  onSendSticker,
  recentStickers,
  onSendStickerUrl,
  onUploadSticker,
  stickerBusy,
  onClose,
  premium,
  onEnablePremium,
  onSendGif,
}: {
  onPick: (emoji: string) => void;
  /** Отправить стикер отдельным сообщением. */
  onSendSticker: (sticker: string) => void;
  /** Недавно загруженные пользователем гифки-стикеры. */
  recentStickers: string[];
  /** Отправить загруженный ранее стикер по ссылке. */
  onSendStickerUrl: (url: string) => void;
  /** Загрузить свой стикер (гифку/картинку) и отправить его. */
  onUploadSticker: (file: File) => void;
  stickerBusy?: boolean;
  onClose: () => void;
  /** Pulse Premium активен — кастом-эмодзи доступны. */
  premium: boolean;
  /** Включить Pulse Premium бесплатно. */
  onEnablePremium: () => void;
  /** Отправить анимированную гифку. */
  onSendGif: (id: string) => void;
}) {
  /** catIdx === -1 — вкладка стикеров, остальное — категории эмодзи. */
  const [catIdx, setCatIdx] = useState(0);
  /** Недавно использованные эмодзи — запоминаются между сессиями. */
  const [recentEmojis] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("pulse_recent_emoji_v1") ?? "[]") as string[];
    } catch {
      return [];
    }
  });
  const cats = EMOJI_CATEGORIES;
  const cat = cats[Math.min(Math.max(catIdx, 0), cats.length - 1)];
  const gridRef = useRef<HTMLDivElement | null>(null);
  const stickerInputRef = useRef<HTMLInputElement | null>(null);

  // при смене категории прокручиваем сетку наверх
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    if (typeof el.scrollTo === "function") el.scrollTo({ top: 0 });
    else el.scrollTop = 0;
  }, [catIdx]);

  return (
    <div className="glass-strong overflow-hidden rounded-[1.4rem] shadow-2xl">
      {/* категории */}
      <div className="flex items-center gap-0.5 border-b border-white/8 px-2.5 py-2">
        <button
          onClick={() => setCatIdx(-1)}
          title="Стикеры — отправляются отдельным сообщением"
          className={`flex h-8 w-9 shrink-0 items-center justify-center rounded-xl transition-colors ${
            catIdx === -1 ? "bg-white/12 text-white" : "text-white/45 hover:bg-white/6 hover:text-white/80"
          }`}
        >
          <Sticker className="h-4 w-4" />
        </button>
        <button
          onClick={() => setCatIdx(-2)}
          title="Гифки — анимированные, отправляются отдельным сообщением"
          className={`flex h-8 w-9 shrink-0 items-center justify-center rounded-xl transition-colors ${
            catIdx === -2 ? "bg-white/12 text-white" : "text-white/45 hover:bg-white/6 hover:text-white/80"
          }`}
        >
          <Film className="h-4 w-4" />
        </button>
        <button
          onClick={() => setCatIdx(-3)}
          title="Кастом-эмодзи — анимированные (Pulse Premium)"
          className={`flex h-8 w-9 shrink-0 items-center justify-center rounded-xl transition-colors ${
            catIdx === -3 ? "bg-white/12 text-amber-300" : "text-amber-300/60 hover:bg-white/6 hover:text-amber-200"
          }`}
        >
          <Sparkles className="h-4 w-4" />
        </button>
        {cats.map((c, i) => (
          <button
            key={c.name}
            onClick={() => setCatIdx(i)}
            title={c.name}
            className={`flex h-8 flex-1 items-center justify-center rounded-xl text-base transition-colors ${
              i === catIdx ? "bg-white/12" : "hover:bg-white/6 opacity-60 hover:opacity-100"
            }`}
          >
            {c.emojis[0]}
          </button>
        ))}
        <button
          onClick={onClose}
          title="Закрыть"
          className="ml-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-white/40 transition-colors hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {catIdx === -2 ? (
        /* Гифки: анимированные, отправляются отдельным сообщением */
        <div className="nice-scroll grid max-h-64 grid-cols-3 gap-2 overflow-y-auto p-2.5 max-sm:grid-cols-2">
          {GIF_PACK.map((g) => (
            <button
              key={g.id}
              onClick={() => onSendGif(g.id)}
              title={`Отправить гифку «${g.title}»`}
              className="flex h-24 items-center justify-center overflow-hidden rounded-2xl bg-white/[0.03] transition-transform hover:scale-105 hover:bg-white/8 active:scale-95"
              // SVG из доверенного набора приложения
              dangerouslySetInnerHTML={{ __html: g.svg }}
            />
          ))}
        </div>
      ) : catIdx === -3 ? (
        /* Кастом-эмодзи — анимированные, только с Pulse Premium */
        premium ? (
          <div className="nice-scroll grid max-h-64 grid-cols-8 gap-1 overflow-y-auto p-2.5 max-sm:grid-cols-6">
            {CUSTOM_EMOJI.map((c) => (
              <button
                key={c.id}
                onClick={() => onPick(c.token)}
                title={`${c.title} — вставить в текст`}
                className="flex h-10 items-center justify-center rounded-xl text-[22px] transition-transform hover:scale-125 hover:bg-white/8 active:scale-95"
                // SVG из доверенного набора приложения
                dangerouslySetInnerHTML={{ __html: c.svg }}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2.5 px-6 py-7 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-amber-300/25 to-violet-400/25 text-3xl">💎</span>
            <p className="text-sm font-bold">Кастом-эмодзи — это Pulse Premium</p>
            <p className="max-w-64 text-[12px] leading-snug text-white/45">
              Анимированные эмодзи, которые вставляются прямо в текст сообщения.
              Бесплатно, включается в два клика.
            </p>
            <button
              onClick={onEnablePremium}
              className="mt-1 flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-300 to-violet-300 px-4 py-2 text-[12px] font-bold text-black/80 transition-opacity hover:opacity-90"
            >
              <Sparkles className="h-3.5 w-3.5" /> Включить бесплатно
            </button>
          </div>
        )
      ) : catIdx === -1 ? (
        /* Стикеры: нажатие сразу отправляет их в чат крупным сообщением */
        <>
          <div className="nice-scroll grid max-h-64 grid-cols-6 gap-1 overflow-y-auto p-2.5 max-sm:grid-cols-5">
            {/* Недавние: загруженные вами гифки-стикеры сохраняются между сессиями */}
            {recentStickers.map((u) => (
              <button
                key={u}
                onClick={() => onSendStickerUrl(u)}
                title="Отправить недавний стикер"
                className="flex h-14 items-center justify-center overflow-hidden rounded-2xl transition-transform hover:scale-110 hover:bg-white/8 active:scale-95"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={u} alt="" className="h-full w-full object-contain" draggable={false} />
              </button>
            ))}
            {STICKERS.map((s) => (
              <button
                key={s}
                onClick={() => onSendSticker(s)}
                title="Отправить стикер"
                className="flex h-14 items-center justify-center rounded-2xl text-[34px] transition-transform hover:scale-110 hover:bg-white/8 active:scale-95"
              >
                {s}
              </button>
            ))}
            {/* Свой стикер: гифка/вебм/картинка до 8 МБ (анимация поддерживается) */}
            <button
              onClick={() => stickerInputRef.current?.click()}
              title="Загрузить свой стикер (гифку или картинку)"
              className="flex h-14 flex-col items-center justify-center gap-0.5 rounded-2xl border border-dashed border-white/15 text-white/40 transition-colors hover:border-slate-500/50 hover:bg-white/6 hover:text-slate-300"
            >
              {stickerBusy ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  <ImagePlus className="h-4.5 w-4.5" />
                  <span className="text-[9px] font-medium">Гифка</span>
                </>
              )}
            </button>
            <input
              ref={stickerInputRef}
              type="file"
              accept="image/gif,image/webp,image/png,image/jpeg"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onUploadSticker(f);
                e.target.value = "";
              }}
            />
          </div>
          <p className="border-t border-white/8 px-3 py-1.5 text-[10px] text-white/30">
            Стикеры · нажмите, чтобы отправить · «Гифка» — загрузить свой (анимированный)
          </p>
        </>
      ) : (
        <>
          {/* недавние эмодзи */}
      {catIdx >= 0 && recentEmojis.length > 0 && (
        <div className="border-b border-white/8 px-2.5 py-1.5">
          <p className="pb-1 text-[10px] font-semibold tracking-wide text-white/30 uppercase">Недавние</p>
          <div className="flex flex-wrap gap-0.5">
            {recentEmojis.slice(0, 16).map((e) => {
              // Кастом-эмодзи хранятся токенами («:ce_gg:») — в «недавних»
              // рисуем сам анимированный эмодзи, а не сырой токен
              const ce = /^:ce_[a-z0-9_]+:$/.test(e) ? findCustomEmoji(e.slice(4, -1)) : null;
              return (
                <button
                  key={e}
                  onClick={() => onPick(e)}
                  title={ce ? ce.title : e}
                  className="rounded-lg p-1 text-lg transition-transform hover:scale-125"
                  {...(ce
                    ? { dangerouslySetInnerHTML: { __html: ce.svg } }
                    : { children: e })}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* сетка эмодзи */}
          <div
            ref={gridRef}
            className="nice-scroll grid max-h-64 grid-cols-8 gap-0.5 overflow-y-auto p-2 max-sm:grid-cols-7"
          >
            {cat.emojis.map((e) => (
              <button
                key={e}
                onClick={() => onPick(e)}
                className="emoji-ios flex h-10 items-center justify-center rounded-2xl text-[22px] transition-all hover:scale-125 hover:bg-white/10 active:scale-95"
              >
                {e}
              </button>
            ))}
          </div>
          <p className="border-t border-white/8 px-3 py-1.5 text-[10px] text-white/30">
            {cat.name} · нажмите, чтобы вставить
          </p>
        </>
      )}
    </div>
  );
}
