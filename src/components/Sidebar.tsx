"use client";

import { useMemo, useState } from "react";
import type { ChatPayload, SettingsPayload } from "@/lib/pulse";
import { ACCENTS, formatTime, isOnline } from "@/lib/pulse";
import {
  Avatar,
  IconArchive,
  IconBellOff,
  IconLogout,
  IconPin,
  IconPlus,
  IconSearch,
  IconSettings,
  PulseLogo,
} from "./ui";

export type Person = {
  id: number;
  name: string;
  handle: string;
  emoji: string;
  accent: string;
  about: string;
};

const FILTERS = [
  { id: "all", label: "Все" },
  { id: "unread", label: "Непрочитанные" },
  { id: "groups", label: "Группы" },
  { id: "archived", label: "Архив" },
] as const;

type Filter = (typeof FILTERS)[number]["id"];

function previewText(chat: ChatPayload, meId: number): string {
  const last = chat.lastMessage;
  if (!last) return "Нет сообщений";
  if (last.deletedForAllAt) return "Сообщение удалено";
  if (last.kind === "system") return last.body;
  const prefix = last.senderId === meId ? "Вы: " : "";
  return prefix + (last.body || "Вложение");
}

export default function Sidebar({
  me,
  chats,
  activeId,
  settings,
  onSelect,
  onNewChat,
  onOpenSettings,
  onLogout,
}: {
  me: Person;
  chats: ChatPayload[];
  activeId: number | null;
  settings: SettingsPayload;
  onSelect: (id: number) => void;
  onNewChat: () => void;
  onOpenSettings: () => void;
  onLogout: () => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return chats.filter((c) => {
      if (filter === "archived" ? !c.archived : c.archived) return false;
      if (filter === "unread" && c.unread === 0) return false;
      if (filter === "groups" && c.kind !== "group") return false;
      if (!q) return true;
      const title = c.kind === "group" ? c.title : (c.partner?.name ?? "");
      return (
        title.toLowerCase().includes(q) ||
        (c.lastMessage?.body ?? "").toLowerCase().includes(q) ||
        (c.partner?.handle ?? "").toLowerCase().includes(q)
      );
    });
  }, [chats, filter, query]);

  const pinned = visible.filter((c) => c.pinned);
  const rest = visible.filter((c) => !c.pinned);
  const totalUnread = chats.reduce((sum, c) => sum + (c.archived ? 0 : c.unread), 0);
  const grad = ACCENTS[me.accent] ?? ACCENTS.violet;

  return (
    <aside
      className="flex h-full w-full flex-col border-r"
      style={{ background: "var(--panel-solid)", borderColor: "var(--border)" }}
    >
      <div className="flex items-center gap-3 px-4 pt-4 pb-3">
        <PulseLogo size={36} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] leading-tight font-bold">Pulse</div>
          <div className="text-[11.5px]" style={{ color: "var(--muted)" }}>
            {totalUnread > 0 ? `${totalUnread} новых` : "всё прочитано"}
          </div>
        </div>
        <button
          onClick={onNewChat}
          className="rounded-2xl p-2.5 text-white transition hover:brightness-110"
          style={{ background: `linear-gradient(135deg, ${grad.from}, ${grad.to})` }}
          title="Новый чат"
        >
          <IconPlus size={18} />
        </button>
      </div>

      <div className="px-4 pb-3">
        <div
          className="flex items-center gap-2 rounded-2xl px-3 py-2.5"
          style={{ background: "var(--panel-2)", border: "1px solid var(--border)" }}
        >
          <IconSearch size={17} className="shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск чатов и сообщений"
            className="w-full bg-transparent text-[13.5px] outline-none placeholder:text-[13px]"
            style={{ color: "var(--text)" }}
          />
        </div>
        <div className="mt-2.5 flex gap-1.5 overflow-x-auto pb-0.5">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className="shrink-0 rounded-full px-3 py-1.5 text-[12px] font-medium transition"
              style={{
                background: filter === f.id ? "var(--accent)" : "var(--panel-2)",
                color: filter === f.id ? "#fff" : "var(--muted)",
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="pulse-scroll flex-1 px-2 pb-2">
        {[...pinned, ...rest].map((chat) => {
          const partner = chat.partner;
          const name = chat.kind === "group" ? chat.title : (partner?.name ?? "Чат");
          const emoji = chat.kind === "group" ? chat.emoji : (partner?.emoji ?? "💬");
          const accent = chat.kind === "group" ? chat.accent : (partner?.accent ?? "violet");
          const online = partner ? isOnline(partner.lastSeenAt) : false;
          const active = chat.id === activeId;
          return (
            <button
              key={chat.id}
              onClick={() => onSelect(chat.id)}
              className="mb-1 flex w-full items-center gap-3 rounded-2xl px-2.5 py-2.5 text-left transition"
              style={{
                background: active ? "var(--panel-3)" : "transparent",
                boxShadow: active ? `inset 3px 0 0 var(--accent)` : undefined,
              }}
            >
              <Avatar
                name={name}
                emoji={emoji}
                accent={accent}
                fileId={chat.kind === "group" ? chat.avatarFileId : partner?.avatarFileId}
                size={46}
                online={online}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-[14px] font-semibold">{name}</span>
                  {chat.pinned ? <IconPin size={12} style={{ color: "var(--muted)" }} /> : null}
                  {chat.muted ? <IconBellOff size={13} style={{ color: "var(--muted)" }} /> : null}
                  {chat.archived ? <IconArchive size={13} style={{ color: "var(--muted)" }} /> : null}
                  {chat.blocked || chat.blockedBy ? (
                    <span className="text-[11px]" style={{ color: "var(--muted)" }}>
                      🚫
                    </span>
                  ) : null}
                  <span className="ml-auto shrink-0 text-[11px]" style={{ color: "var(--muted)" }}>
                    {chat.lastMessage ? formatTime(chat.lastMessage.createdAt) : ""}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className="truncate text-[12.5px]"
                    style={{ color: chat.unread > 0 ? "var(--text)" : "var(--muted)" }}
                  >
                    {settings.messagePreview ? previewText(chat, me.id) : "Сообщение скрыто"}
                  </span>
                  {chat.unread > 0 ? (
                    <span
                      className="ml-auto flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-bold text-white"
                      style={{
                        background: chat.muted ? "var(--panel-3)" : "var(--accent)",
                        color: chat.muted ? "var(--muted)" : "#fff",
                      }}
                    >
                      {chat.unread}
                    </span>
                  ) : null}
                </div>
              </div>
            </button>
          );
        })}
        {visible.length === 0 ? (
          <div className="mt-8 px-4 text-center text-[13px]" style={{ color: "var(--muted)" }}>
            {query ? "Ничего не найдено" : "Пока нет чатов — создайте новый ⚡"}
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-2 border-t px-3 py-3" style={{ borderColor: "var(--border)" }}>
        <Avatar name={me.name} emoji={me.emoji} accent={me.accent} size={38} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold">{me.name}</div>
          <div className="truncate text-[11.5px]" style={{ color: "var(--muted)" }}>
            @{me.handle}
          </div>
        </div>
        <button
          onClick={onOpenSettings}
          className="rounded-xl p-2.5 transition hover:brightness-125"
          style={{ background: "var(--panel-2)", color: "var(--muted)" }}
          title="Настройки"
        >
          <IconSettings size={18} />
        </button>
        <button
          onClick={onLogout}
          className="rounded-xl p-2.5 transition hover:brightness-125"
          style={{ background: "var(--panel-2)", color: "var(--muted)" }}
          title="Сменить профиль"
        >
          <IconLogout size={18} />
        </button>
      </div>
    </aside>
  );
}
