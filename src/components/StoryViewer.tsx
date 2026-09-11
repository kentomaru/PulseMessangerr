"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Eye, Loader2, Trash2, X } from "lucide-react";
import Avatar from "./Avatar";
import { api } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import type { PublicUser, StoryGroup, StoryItem } from "@/lib/types";

type Props = {
  me: PublicUser;
  groups: StoryGroup[];
  startGroupIndex: number;
  onClose: () => void;
  onWatched: (storyId: string) => void;
  onDeleted: (storyId: string) => void;
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
}: Props) {
  const [activeStoryId, setActiveStoryId] = useState<string | null>(
    () => groups[startGroupIndex]?.stories[0]?.id ?? null,
  );
  const [paused, setPaused] = useState(false);
  const [showViewers, setShowViewers] = useState(false);
  const [viewers, setViewers] = useState<Viewer[] | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Историю выбираем по стабильному id, а не по индексу: фоновые обновления
  // списка и удаление другой истории больше не показывают первое фото повторно.
  const gi = groups.findIndex((candidate) =>
    candidate.stories.some((candidateStory) => candidateStory.id === activeStoryId),
  );
  const safeGi = gi >= 0 ? gi : Math.min(startGroupIndex, Math.max(0, groups.length - 1));
  const group = groups[safeGi];
  const si = group ? Math.max(0, group.stories.findIndex((candidate) => candidate.id === activeStoryId)) : 0;
  const story: StoryItem | undefined = group?.stories[si];
  const isMine = group?.user.id === me.id;

  useEffect(() => {
    if (gi >= 0) return;
    const fallback = groups[safeGi]?.stories[0]?.id ?? null;
    if (fallback !== activeStoryId) setActiveStoryId(fallback);
  }, [activeStoryId, groups, gi, safeGi]);

  const next = useCallback(() => {
    if (!group || !story) return;
    const nextStory = group.stories[si + 1];
    if (nextStory) {
      setActiveStoryId(nextStory.id);
      return;
    }
    const nextGroup = groups[safeGi + 1];
    if (nextGroup?.stories[0]) {
      setActiveStoryId(nextGroup.stories[0].id);
      return;
    }
    onClose();
  }, [group, groups, safeGi, si, story, onClose]);

  const prev = useCallback(() => {
    if (!group || !story) return;
    const previousStory = group.stories[si - 1];
    if (previousStory) {
      setActiveStoryId(previousStory.id);
      return;
    }
    const previousGroup = groups[safeGi - 1];
    const lastStory = previousGroup?.stories.at(-1);
    if (lastStory) setActiveStoryId(lastStory.id);
  }, [group, groups, safeGi, si, story]);

  // автопереход. next меняется при фоновой перезагрузке групп, поэтому таймер
  // вызывает его через ref и не начинает пятую секунду заново каждые 5 секунд.
  const nextRef = useRef(next);
  nextRef.current = next;
  const currentStoryId = story?.id;

  useEffect(() => {
    if (!currentStoryId || paused || showViewers) return;
    onWatched(currentStoryId);
    timerRef.current = setTimeout(() => nextRef.current(), STORY_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [currentStoryId, paused, showViewers, onWatched]);

  // клавиатура
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
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

  const remove = async () => {
    if (!story) return;
    try {
      await api(`/api/stories/${story.id}`, { method: "DELETE" });
      onDeleted(story.id);
      const rest = group?.stories.filter((s) => s.id !== story.id) ?? [];
      if (rest.length > 0) {
        setActiveStoryId(rest[0].id);
      } else {
        const nextGroup = groups[safeGi + 1];
        const previousGroup = groups[safeGi - 1];
        const replacement = nextGroup?.stories[0] ?? previousGroup?.stories.at(-1);
        if (replacement) setActiveStoryId(replacement.id);
        else onClose();
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

        {/* Шапка */}
        <div className="flex items-center gap-3 px-4 py-3.5">
          <Avatar name={group.user.displayName} src={group.user.avatarUrl} size={38} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">
              {isMine ? "Ваша история" : group.user.displayName}
            </p>
            <p className="text-xs text-white/45">{timeAgo(story.createdAt)}</p>
          </div>
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

        {/* Изображение */}
        <div className="relative min-h-0 flex-1 px-3 pb-4">
          <div className="relative h-full overflow-hidden rounded-3xl bg-white/5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={story.mediaUrl} alt="История" className="h-full w-full object-contain" />
            {story.caption && (
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-5 pt-12">
                <p className="text-center text-[15px] leading-relaxed text-white/95">
                  {story.caption}
                </p>
              </div>
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
      </div>

      {/* Список просмотров */}
      <AnimatePresence>
        {showViewers && (
          <motion.div
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
                  <div key={v.user.id} className="flex items-center gap-3 rounded-xl px-2 py-2">
                    <Avatar name={v.user.displayName} src={v.user.avatarUrl} size={32} />
                    <div className="min-w-0">
                      <p className="truncate text-sm">{v.user.displayName}</p>
                      <p className="truncate text-xs text-white/35">@{v.user.username}</p>
                    </div>
                    <span className="ml-auto text-[11px] text-white/30">{timeAgo(v.viewedAt)}</span>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
