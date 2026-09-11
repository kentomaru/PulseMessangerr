"use client";

import { Plus } from "lucide-react";
import Avatar from "./Avatar";
import type { PublicUser, StoryGroup } from "@/lib/types";

type Props = {
  me: PublicUser;
  groups: StoryGroup[];
  onOpen: (groupIndex: number) => void;
  onAdd: () => void;
};

/** Лента историй (как в Telegram): кружки под поиском, свои — первыми. */
export default function StoriesRow({ me, groups, onOpen, onAdd }: Props) {
  const mine = groups.find((g) => g.user.id === me.id);
  const others = groups.filter((g) => g.user.id !== me.id);

  return (
    <div className="nice-scroll flex shrink-0 items-start gap-4 overflow-x-auto border-b border-white/5 px-5 py-3">
      {/* Моя история */}
      <div className="group flex w-14 shrink-0 flex-col items-center gap-1.5">
        <div className="relative">
          <button
            type="button"
            onClick={() => (mine ? onOpen(groups.indexOf(mine)) : onAdd())}
            aria-label={mine ? "Открыть мою историю" : "Добавить историю"}
            className="block rounded-full"
          >
            <div
              className={`rounded-full p-[2.5px] transition-colors ${
                mine ? "story-ring-seen" : "bg-white/10"
              } group-hover:bg-violet-500/40`}
            >
              <div className="rounded-full bg-[#0c0c17] p-[2px]">
                <Avatar name={me.displayName} src={me.avatarUrl} size={44} />
              </div>
            </div>
          </button>
          <button
            type="button"
            onClick={onAdd}
            aria-label="Добавить историю"
            className="btn-gradient absolute -right-0.5 -bottom-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-[#0c0c17] text-white"
          >
            <Plus className="h-3 w-3" />
          </button>
        </div>
        <span className="w-full truncate text-center text-[10px] text-white/40">
          {mine ? "Моя история" : "Добавить"}
        </span>
      </div>

      {others.map((g) => {
        const unseen = g.stories.some((s) => !s.viewed);
        return (
          <button
            key={g.user.id}
            onClick={() => onOpen(groups.indexOf(g))}
            className="flex w-14 shrink-0 flex-col items-center gap-1.5"
          >
            <div
              className={`rounded-full p-[2.5px] transition-transform hover:scale-105 ${
                unseen ? "story-ring" : "story-ring-seen"
              }`}
            >
              <div className="rounded-full bg-[#0c0c17] p-[2px]">
                <Avatar name={g.user.displayName} src={g.user.avatarUrl} size={44} />
              </div>
            </div>
            <span className="w-full truncate text-center text-[10px] text-white/45">
              {g.user.displayName.split(" ")[0]}
            </span>
          </button>
        );
      })}

      {others.length === 0 && !mine && (
        <p className="self-center py-3 text-xs leading-snug text-white/25">
          Историй пока нет.
          <br />
          Нажмите «+», чтобы добавить
        </p>
      )}
    </div>
  );
}
