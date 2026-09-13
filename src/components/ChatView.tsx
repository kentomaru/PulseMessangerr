"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  Ban,
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
  Hash,
  ImagePlus,
  Info,
  Loader2,
  Lock,
  Megaphone,
  MessageSquare,
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

const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;

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
      setMeta(d.conversation);
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
  /** «Избранное» — чат с самим собой: без звонков, подпись «сохранённые». */
  const isSaved = kind === "direct" && (peerState?.id ?? peer?.id) === me.id;
  const pinnedCurrent = pinned.length > 0 ? pinned[Math.min(pinnedIdx, pinned.length - 1)] : null;

  /* ─────────────────────────── отправка ─────────────────────────── */

  /**
   * Отправка сообщения. `directText` — отправить сразу (например, стикер),
   * минуя поле ввода.
   */
  const send = async (directText?: string) => {
    if (sending || uploading || !canPost) return;

    // Стикер/текст напрямую — без редактирования и черновиков
    if (directText !== undefined) {
      const content = emojify(directText).trim();
      if (!content) return;
      setSending(true);
      const reply = replyTo;
      setReplyTo(null);
      try {
        await api("/api/messages", {
          method: "POST",
          body: JSON.stringify({
            conversationId,
            type: "text",
            content,
            replyToId: reply?.id ?? null,
          }),
        });
        await load();
        refreshConversations();
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
            await api("/api/messages", {
              method: "POST",
              body: JSON.stringify({
                conversationId,
                type: isImage ? "image" : "file",
                content: isImage && !cap ? url : JSON.stringify(att),
                replyToId: replyTo?.id ?? null,
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
      await api("/api/messages", {
        method: "POST",
        body: JSON.stringify({
          conversationId,
          type: "text",
          content,
          replyToId: reply?.id ?? null,
        }),
      });
      await load();
      refreshConversations();
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
      await api("/api/messages", {
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
        }),
      });
      setReplyTo(null);
      await load();
      refreshConversations();
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
          if (f.size > MAX_UPLOAD_BYTES) {
            notify(`«${f.name}» больше 500 МБ`);
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
    [canPost, notify],
  );

  const removeDraftFile = (id: string) => {
    setDraftFiles((ds) => {
      const d = ds.find((x) => x.id === id);
      if (d?.preview) URL.revokeObjectURL(d.preview);
      return ds.filter((x) => x.id !== id);
    });
  };

  /* ─────────────────────────── голосовая запись ─────────────────────────── */

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
    } catch {
      notify("Не удалось получить доступ к микрофону");
    }
  };

  const stopVoiceRecording = (send: boolean) => {
    const rec = voiceRef.current;
    if (!rec) return;
    voiceRef.current = null;
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
    const el = inputRef.current;
    if (!el) {
      setText((t) => t + emoji);
      return;
    }
    const start = el.selectionStart ?? text.length;
    const end = el.selectionEnd ?? text.length;
    const next = text.slice(0, start) + emoji + text.slice(end);
    setText(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + emoji.length;
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
    s
      .replace(/<3/g, "❤️")
      .replace(/:\)/g, "🙂")
      .replace(/:\(/g, "🙁")
      .replace(/;\)/g, "😉")
      .replace(/:D/g, "😄");

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

  // Esc закрывает поиск/ответ/редактирование — как в больших мессенджерах
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (searchOpen) setSearchOpen(false);
      else if (replyTo) setReplyTo(null);
      else if (editing) setEditing(null);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [searchOpen, replyTo, editing]);

  // Сколько комментариев в обсуждении канала — цифра под постами
  useEffect(() => {
    if (kind !== "channel") return;
    api<{ discussion: { id: string } | null; postCounts?: Record<string, number> }>(
      `/api/conversations/${conversationId}/discussion`,
    )
      .then((d) => setPostCounts(d.postCounts ?? {}))
      .catch(() => {});
  }, [kind, conversationId]);

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
    const value = m.type === "text" ? m.content : (att?.caption ?? att?.url ?? "");
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

  const headerSubtitle = () => {
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
    return {
      text: `${meta?.memberCount ?? members.length} участников · ${online} в сети`,
      accent: false,
    };
  };
  const subtitle = headerSubtitle();

  const canSendSomething = !!text.trim() || draftFiles.length > 0;

  return (
    <div className="relative flex h-full min-w-0 flex-1 flex-col">
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
              {commentFilter && onExitCommentMode && (
                <button
                  onClick={onExitCommentMode}
                  title="Назад в канал"
                  className="flex items-center gap-1 rounded-lg bg-white/10 px-2 py-0.5 text-[12px] text-white/70 hover:bg-white/15"
                >
                  <ArrowLeft className="h-3 w-3" /> {commentFilter.channelTitle}
                </button>
              )}
              <span className="truncate">{commentFilter ? "Комментарии" : title}</span>
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
                        <span className="block truncate text-[13px] text-white/85">{h.preview}</span>
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
                      meUsername={me.username}
                      onOpenUsername={onOpenUsername}
                      onEdit={() => startEdit(m)}
                      onPin={() => void togglePin(m)}
                      onReact={(emoji) => void toggleReaction(m.id, emoji)}
                      onMenu={openContextMenu}
                      onJump={jumpTo}
                      onViewUser={onViewUser}
                    />
                  )}
                </div>
              );
            })}
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
                <p className="text-[11px] text-white/40">Запись голосового сообщения…</p>
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
                title="Прикрепить файл (до 500 МБ)"
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
                  sendTyping();
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
                maxLength={4000}
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
              <button
                onClick={() => void send()}
                disabled={(!canSendSomething && !editing) || sending || uploading}
                title="Отправить"
                className="btn-gradient flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white"
              >
                {sending ? <Loader2 className="h-4.5 w-4.5 animate-spin" /> : <Send className="h-4.5 w-4.5" />}
              </button>
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
            <img src={lightbox} alt="Фото" className="max-h-full max-w-full rounded-2xl object-contain shadow-2xl" />
            <a
              href={lightbox}
              download
              onClick={(e) => e.stopPropagation()}
              className="glass absolute top-5 left-5 flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm text-white/85 transition-colors hover:text-white"
            >
              <Download className="h-4 w-4" />
              Скачать
            </a>
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
  onClose,
  onReact,
  onReply,
  onEdit,
  onPin,
  onCopy,
  onForward,
  onDelete,
}: {
  state: ContextMenuState;
  meId: string;
  isSpace: boolean;
  myRole: MemberRole;
  onClose: () => void;
  onReact: (emoji: string) => void;
  onReply: () => void;
  onEdit: () => void;
  onPin: () => void;
  onCopy: () => void;
  onForward: () => void;
  onDelete: () => void;
}) {
  const m = state.message;
  const own = m.senderId === meId;
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
            className="rounded-lg py-1.5 text-lg transition-transform hover:scale-125 active:scale-95"
            title={`Реакция ${e}`}
          >
            {e}
          </button>
        ))}
      </div>
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
      {hasText && (
        <ContextItem icon={<Copy className="h-4 w-4 text-slate-400" />} label="Копировать" onClick={onCopy} />
      )}
      {isEditable && (
        <ContextItem icon={<Pencil className="h-4 w-4 text-amber-300" />} label="Изменить" onClick={onEdit} />
      )}
      <ContextItem
        icon={<ChevronRight className="h-4 w-4 text-emerald-300" />}
        label="Переслать"
        onClick={onForward}
      />
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

/* ─────────────────────────── пузырь сообщения ─────────────────────────── */

function MessageBubble({
  message,
  meId,
  own,
  space,
  grouped,
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
  meUsername,
  onOpenUsername,
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
  meUsername?: string;
  onOpenUsername?: (name: string) => void;
  onJump: (id: string) => void;
  onViewUser: (u: PublicUser) => void;
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
  const legacyKind = message.type === "text" ? legacyAttachmentKind(att) : null;
  const isVoice = message.type === "voice" || legacyKind === "voice";
  const isNote = message.type === "video_note" || legacyKind === "video_note";
  const isImage = message.type === "image" && !legacyKind;
  const isFile = message.type === "file" && !legacyKind;

  // голосовые и кружки не группируем вплотную — им нужен воздух
  const media = isVoice || isNote || isFile;

  return (
    <div
      className={`group no-callout relative flex items-start gap-2 ${media ? "py-1.5" : "py-0.5"} ${
        alignRight ? "justify-end" : "justify-start"
      } ${highlighted ? "animate-pulse-dot" : ""}`}
      onContextMenu={(e) => {
        e.preventDefault();
        onMenu(e.clientX, e.clientY, message);
      }}
      onDoubleClick={() => onReply()}
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
          >
            {sender.displayName}
          </button>
        )}

        <div
          className={`relative overflow-hidden ${
            media || sticker ? "" : own && !space ? "bubble-own text-white" : "bubble-peer text-white/90"
          } ${media || sticker ? "" : `${own && !space ? "bubble-own-radius" : "bubble-peer-radius"} px-4 py-2.5`} ${
            highlighted ? "ring-2 ring-[#5865f2]/60" : ""
          }`}
        >
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

          {isVoice && att ? (
            <VoiceBubble url={att.url} duration={att.duration ?? 0} own={own && !space} />
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
              <button
                onClick={() => onOpenImage(att.url)}
                className="block overflow-hidden rounded-3xl ring-1 ring-white/10 transition-transform hover:scale-[1.01]"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={att.url}
                  alt={att.caption || "Фото"}
                  className="max-h-80 w-full max-w-xs object-cover"
                  draggable={false}
                />
              </button>
              {att.caption && (
                <p className="msg-text px-1 pt-2 pb-1 text-[15px] leading-relaxed break-words whitespace-pre-wrap">
                  {renderRichText(att.caption, meUsername, onOpenUsername)}
                </p>
              )}
            </div>
          ) : isFile && att ? (
            <FileCard att={att} />
          ) : sticker ? (
            /* «Стикер»: только эмодзи — крупно, без пузыря (как в мессенджерах) */
            <p className="py-0.5 text-[52px] leading-none select-none">{message.content.trim()}</p>
          ) : (
            <p className="msg-text text-[15px] leading-relaxed break-words whitespace-pre-wrap">
              {renderRichText(message.content, meUsername, onOpenUsername)}
            </p>
          )}
        </div>

        {/* Комментарии канала — открывают привязанную группу-обсуждение */}
        {onDiscuss && (
          <button
            onClick={() => onDiscuss(message.id)}
            className="mt-1 flex items-center gap-1 text-[11px] text-slate-400 transition-colors hover:text-slate-200"
          >
            <MessageSquare className="h-3 w-3" /> Комментарии{commentCount != null && commentCount > 0 ? ` · ${commentCount}` : ""}
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

        <div className={`mt-1 flex items-center gap-1 text-[10px] text-white/30 ${alignRight ? "justify-end" : ""}`}>
          <span>{timeHHmm(message.createdAt)}</span>
          {message.pinned && (
            <span title="Закреплено" className="flex items-center">
              <Pin className="h-3 w-3 text-slate-400" />
            </span>
          )}
          {message.editedAt && <span className="italic">изменено</span>}
          {own &&
            (read ? <CheckCheck className="h-3.5 w-3.5 text-slate-400" /> : <Check className="h-3.5 w-3.5" />)}
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

function VoiceBubble({ url, duration, own }: { url: string; duration: number; own: boolean }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [speedIdx, setSpeedIdx] = useState(0);
  const [total, setTotal] = useState(duration || 0);
  const speeds = [1, 1.5, 2];
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
    <div className="flex w-64 min-w-52 items-center gap-3 py-0.5">
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

function FileCard({ att }: { att: AttachmentInfo }) {
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
}) {
  /** catIdx === -1 — вкладка стикеров, остальное — категории эмодзи. */
  const [catIdx, setCatIdx] = useState(0);
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

      {catIdx === -1 ? (
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
          {/* сетка эмодзи */}
          <div
            ref={gridRef}
            className="nice-scroll grid max-h-64 grid-cols-8 gap-0.5 overflow-y-auto p-2 max-sm:grid-cols-7"
          >
            {cat.emojis.map((e) => (
              <button
                key={e}
                onClick={() => onPick(e)}
                className="flex h-9 items-center justify-center rounded-xl text-xl transition-transform hover:scale-125 hover:bg-white/8 active:scale-95"
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
