"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Eye, ImageOff, Loader2, Reply, Send, Trash2, X } from "lucide-react";
import Avatar from "./Avatar";
import { api } from "@/lib/api";
import { modalEnter, isTopModal } from "@/lib/modals";
import { encodeStoryQuote } from "@/lib/storyQuote";
import { timeAgo } from "@/lib/format";
import type { PublicUser, StoryGroup, StoryItem } from "@/lib/types";

type Props = {
  me: PublicUser;
  groups: StoryGroup[];
  startGroupIndex: number;
  onClose: () => void;
  onWatched: (storyId: string) => void;
  onDeleted: (storyId: string) => void;
  /** Открыть карточку пользователя (автор истории или зритель). */
  onViewUser?: (user: PublicUser) => void;
  /** Ответ на историю отправлен — обновить список чатов. */
  onReplied?: () => void;
};

type Viewer = { user: PublicUser; viewedAt: string };

const STORY_MS = 5_000;

/** Полноэкранный просмотр историй: тапы влево/вправо, автопереход, просмотры и удаление своих. */
export default function StoryViewer({
  me,
  groups,
  startGroupIndex,
  onClose,
  onWatched,
  onDeleted,
  onViewUser,
  onReplied,
}: Props) {
  const [gi, setGi] = useState(startGroupIndex);
  const [si, setSi] = useState(0);
  const [paused, setPaused] = useState(false);
  const [showViewers, setShowViewers] = useState(false);
  const [viewers, setViewers] = useState<Viewer[] | null>(null);
  /** Файл истории побит (404) — показываем заглушку вместо «сломанной картинки». */
  const [mediaBroken, setMediaBroken] = useState(false);
  /** Повторная попытка загрузки медиа (кэш/сеть моргнули). */
  const [mediaRetried, setMediaRetried] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Ответ на историю (только для чужих историй). */
  const [replyText, setReplyText] = useState("");
  const [replyBusy, setReplyBusy] = useState(false);
  const [replySent, setReplySent] = useState(false);
  const replyRef = useRef<HTMLInputElement | null>(null);

  const group = groups[gi];
  const story: StoryItem | undefined = group?.stories[si];
  const isMine = group?.user.id === me.id;

  // Новая история — сбрасываем флаг «файл побит» и состояние ответа
  useEffect(() => {
    setMediaBroken(false);
    setMediaRetried(false);
    setReplyText("");
    setReplySent(false);
  }, [story?.id]);

  // URL с «анти-кэш» суффиксом для второй попытки загрузки
  const mediaUrl = story
    ? mediaRetried
      ? `${story.mediaUrl}${story.mediaUrl.includes("?") ? "&" : "?"}r=1`
      : story.mediaUrl
    : "";

  const next = useCallback(() => {
    setSi((curSi) => {
      if (curSi + 1 < (groups[gi]?.stories.length ?? 0)) return curSi + 1;
      setGi((curGi) => {
        if (curGi + 1 < groups.length) {
          return curGi + 1;
        }
        onClose();
        return curGi;
      });
      return 0;
    });
  }, [gi, groups, onClose]);

  const prev = useCallback(() => {
    setSi((curSi) => {
      if (curSi > 0) return curSi - 1;
      if (gi > 0) {
        setGi(gi - 1);
        return 0;
      }
      return 0;
    });
  }, [gi]);

  // автопереход (для видео — по окончании проигрывания, а не по таймеру)
  const storyIsVideo = !!story && /\.(webm|mp4|mov|mkv|m4v)(\?|$)/i.test(story.mediaUrl);
  useEffect(() => {
    if (!story || paused || showViewers) return;
    onWatched(story.id);
    // у видео свой темп: onEnded; таймер — страховка на 60 секунд
    timerRef.current = setTimeout(next, storyIsVideo ? 60_000 : STORY_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [story?.id, paused, showViewers, next, story, onWatched, storyIsVideo]);

  // клавиатура: Esc закрывает просмотр (только если поверх не открыто окно)
  useEffect(() => {
    const id = Symbol("story-viewer");
    const leave = modalEnter(id);
    const onKey = (e: KeyboardEvent) => {
      const typing = document.activeElement === replyRef.current;
      if (e.key === "Escape") {
        if (isTopModal(id)) onClose();
        return;
      }
      if (typing) return;
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      leave();
    };
  }, [next, prev, onClose]);

  const openViewers = async () => {
    if (!story) return;
    setShowViewers(true);
    setPaused(true);
    try {
      const d = await api<{ views: Viewer[] }>(`/api/stories/${story.id}`);
      setViewers(d.views);
    } catch {
      setViewers([]);
    }
  };

  /** Ответить на историю: создаём/находим личку с автором и шлём цитату + текст. */
  /** Быстрая реакция: эмодзи улетает ответом одним нажатием. */
  const [reactBurst, setReactBurst] = useState<string | null>(null);

  const sendReply = async (override?: string) => {
    const text = (override ?? replyText).trim();
    if (!group || !story || replyBusy || !text) return;
    setReplyBusy(true);
    try {
      const conv = await api<{ conversation: { id: string } }>("/api/conversations", {
        method: "POST",
        body: JSON.stringify({ userId: group.user.id }),
      });
      const quote = {
        url: story.mediaUrl,
        video: storyIsVideo,
        caption: story.caption || undefined,
        author: group.user.displayName,
        at: story.createdAt,
      };
      await api("/api/messages", {
        method: "POST",
        body: JSON.stringify({
          conversationId: conv.conversation.id,
          type: "text",
          content: encodeStoryQuote(quote, text),
        }),
      });
      if (override === undefined) setReplyText("");
      setReplySent(true);
      onReplied?.();
    } catch {
      /* сеть/блок — молча, попробуют ещё раз */
    } finally {
      setReplyBusy(false);
    }
  };

  const remove = async () => {
    if (!story) return;
    try {
      await api(`/api/stories/${story.id}`, { method: "DELETE" });
      onDeleted(story.id);
      const rest = groups[gi]?.stories.filter((s) => s.id !== story.id);
      if (rest && rest.length > 0) {
        setSi(0);
      } else {
        onClose();
      }
    } catch {
      onClose();
    }
  };

  if (!group || !story) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/92 backdrop-blur-md"
    >
      {/* Зоны тапа */}
      <button
        aria-label="Назад"
        className="absolute left-0 top-0 z-10 h-full w-1/4"
        onClick={prev}
      />
      <button
        aria-label="Вперёд"
        className="absolute right-0 top-0 z-10 h-full w-3/4"
        onClick={next}
      />

      <div className="relative z-20 flex h-full w-full max-w-md flex-col">
        {/* Прогресс-бары */}
        <div className="flex gap-1.5 px-4 pt-4">
          {group.stories.map((s, idx) => (
            <div key={s.id} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/15">
              <div
                className={`h-full rounded-full bg-white ${idx < si ? "w-full" : ""} ${
                  idx === si ? "story-progress" : ""
                }`}
                style={idx > si ? { width: "0%" } : undefined}
                key={`${s.id}-${idx === si ? si : "done"}`}
              />
            </div>
          ))}
        </div>

        {/* Шапка: кто выложил историю (клик — открыть профиль) */}
        <div className="flex items-center gap-3 px-4 py-3.5">
          <button
            onClick={() => onViewUser?.(group.user)}
            className="flex min-w-0 flex-1 items-center gap-3 text-left"
            title="Открыть профиль"
          >
            {/* key по пользователю: при переходе к истории ДРУГОГО человека
                аватар пересоздаётся — старый не остаётся на экране. */}
            <Avatar
              key={group.user.id}
              name={group.user.displayName}
              src={group.user.avatarUrl}
              size={38}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">
                {isMine ? "Ваша история" : group.user.displayName}
              </p>
              <p className="truncate text-xs text-white/45">
                выложил(а) {timeAgo(story.createdAt)} · @{group.user.username}
              </p>
            </div>
          </button>
          {isMine && (
            <>
              <button
                onClick={() => void openViewers()}
                title="Просмотры"
                className="glass flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-white/75"
              >
                <Eye className="h-3.5 w-3.5" />
                {story.viewCount}
              </button>
              <button
                onClick={() => void remove()}
                title="Удалить"
                className="glass flex h-8 w-8 items-center justify-center rounded-full text-rose-300"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </>
          )}
          <button
            onClick={onClose}
            className="rounded-full bg-white/10 p-2 text-white/80 transition-colors hover:bg-white/20"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Изображение или видео */}
        <div className="relative min-h-0 flex-1 px-3 pb-4">
          {/* key по истории: при переходе к чужой истории медиа пересоздаётся,
              иначе браузер мог на мгновение показать КАДР И АВАТАР предыдущей.
              Зажал пальцем/мышью — история на паузе (как в ТГ/Инстаграме). */}
          <div
            key={story.id}
            className="relative h-full overflow-hidden rounded-3xl bg-black/40"
            onPointerDown={() => setPaused(true)}
            onPointerUp={() => {
              if (document.activeElement !== replyRef.current) setPaused(false);
            }}
            onPointerLeave={() => {
              if (document.activeElement !== replyRef.current) setPaused(false);
            }}
          >
            {/* Подложка: то же фото, растянутое и размытое — кадр заполняет
                экран целиком и не выглядит «маленькой картинкой в пустоте». */}
            {!storyIsVideo && !mediaBroken && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={mediaUrl}
                alt=""
                aria-hidden
                className="absolute inset-0 h-full w-full scale-110 object-cover opacity-60 blur-xl"
              />
            )}
            {storyIsVideo ? (
              <video
                src={mediaUrl}
                autoPlay
                playsInline
                onEnded={next}
                onClick={(e) => {
                  const v = e.currentTarget;
                  if (v.paused) void v.play().catch(() => {});
                  else v.pause();
                }}
                className="relative h-full w-full cursor-pointer object-contain"
              />
            ) : mediaBroken ? (
              <div className="relative flex h-full w-full flex-col items-center justify-center gap-3 text-center">
                <ImageOff className="h-8 w-8 text-white/30" />
                <p className="text-sm text-white/40">
                  Изображение недоступно
                  <br />
                  <span className="text-xs text-white/25">Файл мог быть удалён</span>
                </p>
              </div>
            ) : (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={mediaUrl}
                alt="История"
                loading="eager"
                onError={() => {
                  // Один раз пробуем перезагрузить (против кэша/моргания сети)
                  if (!mediaRetried) setMediaRetried(true);
                  else setMediaBroken(true);
                }}
                className="relative h-full w-full object-contain"
              />
            )}
            {story.caption && (
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-5 pt-12">
                <p className="text-center text-[15px] leading-relaxed text-white/95">
                  {story.caption}
                </p>
              </div>
            )}
          </div>

          {/* Кто выложил + просмотры */}
          <div className="pointer-events-none absolute inset-x-3 bottom-3 flex items-center gap-2">
            <button
              onClick={() => onViewUser?.(group.user)}
              className="glass-strong pointer-events-auto flex min-w-0 items-center gap-2 rounded-full py-1.5 pr-3.5 pl-1.5"
            >
              <Avatar
                key={`chip-${group.user.id}`}
                name={group.user.displayName}
                src={group.user.avatarUrl}
                size={24}
              />
              <span className="max-w-40 truncate text-[11px] text-white/75">
                выложил(а) {group.user.displayName}
              </span>
            </button>
            {isMine && (
              <button
                onClick={() => void openViewers()}
                className="glass-strong pointer-events-auto flex items-center gap-1.5 rounded-full px-3 py-2 text-[11px] text-white/75"
              >
                <Eye className="h-3.5 w-3.5" />
                {story.viewCount}
              </button>
            )}
          </div>

          {/* Стрелки (десктоп) */}
          {si > 0 && (
            <button
              onClick={prev}
              className="glass-strong absolute top-1/2 left-1 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-white/80 md:flex"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          )}
          <button
            onClick={next}
            className="glass-strong absolute top-1/2 right-1 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-white/80 md:flex"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        {/* Ответ на историю — как в ТГ: строка ввода под кадром */}
        {!isMine && (
          <div className="flex items-center gap-2 px-4 pt-1 pb-4">
                        {/* Быстрые реакции на историю — эмодзи улетает сразу */}
            <div className="absolute bottom-[calc(100%+6px)] left-1/2 flex -translate-x-1/2 items-center gap-1">
              {["❤️", "🔥", "😂", "😮", "👍", "🎉"].map((e) => (
                <button
                  key={e}
                  onClick={() => {
                    setReactBurst(e);
                    setTimeout(() => setReactBurst(null), 700);
                    void sendReply(e);
                  }}
                  className="emoji-ios rounded-full bg-black/35 px-1.5 py-1 text-[17px] backdrop-blur-sm transition-transform hover:scale-125 active:scale-90"
                  title={`Реакция ${e}`}
                >
                  {e}
                </button>
              ))}
              {reactBurst && (
                <span className="pointer-events-none absolute -top-6 left-1/2 -translate-x-1/2 animate-ping text-[22px]">
                  {reactBurst}
                </span>
              )}
            </div>
<button
              onClick={() => replyRef.current?.focus()}
              title="Ответить на историю"
              className="glass-strong grid h-10 w-10 shrink-0 place-items-center rounded-full text-white/70 hover:text-white"
            >
              <Reply className="h-4 w-4" />
            </button>
            <input
              ref={replyRef}
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              onFocus={() => setPaused(true)}
              onBlur={() => {
                if (!replyText.trim()) setPaused(false);
              }}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") void sendReply();
              }}
              maxLength={4096}
              placeholder={replySent ? "Ответ отправлен ✓" : "Ответить на историю…"}
              className="glass-strong ring-focus min-w-0 flex-1 rounded-full px-4 py-2.5 text-sm text-white placeholder:text-white/40"
            />
            <button
              onClick={() => void sendReply()}
              disabled={replyBusy || !replyText.trim()}
              title="Отправить ответ"
              className="btn-gradient grid h-10 w-10 shrink-0 place-items-center rounded-full text-white disabled:opacity-40"
            >
              {replyBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
        )}
      </div>

      {/* Список просмотров */}
      <AnimatePresence>
        {showViewers && (
          <motion.div
            key="viewers"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 30 }}
            onClick={(e) => e.stopPropagation()}
            className="glass-strong absolute bottom-6 left-1/2 z-30 max-h-72 w-[min(92vw,360px)] -translate-x-1/2 overflow-y-auto rounded-3xl p-4 nice-scroll"
          >
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold">Просмотры ({viewers?.length ?? 0})</p>
              <button
                onClick={() => {
                  setShowViewers(false);
                  setPaused(false);
                  setViewers(null);
                }}
                className="rounded-full bg-white/10 p-1.5 text-white/70"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            {viewers === null ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-white/40" />
              </div>
            ) : viewers.length === 0 ? (
              <p className="py-4 text-center text-sm text-white/40">Пока никто не увидел 🙈</p>
            ) : (
              <div className="space-y-1">
                {viewers.map((v) => (
                  <button
                    key={v.user.id}
                    onClick={() => onViewUser?.(v.user)}
                    className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-white/8"
                    title="Открыть профиль"
                  >
                    <Avatar name={v.user.displayName} src={v.user.avatarUrl} size={32} />
                    <div className="min-w-0">
                      <p className="truncate text-sm">{v.user.displayName}</p>
                      <p className="truncate text-xs text-white/35">@{v.user.username}</p>
                    </div>
                    <span className="ml-auto text-[11px] text-white/30">{timeAgo(v.viewedAt)}</span>
                  </button>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
