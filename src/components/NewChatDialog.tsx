"use client";

import { useCallback, useEffect, useState } from "react";
import { Avatar, IconClose, IconPlus, IconSearch, IconUsers, Modal, Segmented } from "./ui";
import { isOnline } from "@/lib/pulse";

type FoundUser = {
  id: number;
  name: string;
  handle: string;
  emoji: string;
  accent: string;
  about: string;
  avatarFileId: number | null;
  lastSeenAt: string;
};

export default function NewChatDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (chatId: number) => void;
}) {
  const [mode, setMode] = useState<"direct" | "group">("direct");
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<FoundUser[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSelected([]);
    setTitle("");
    void fetch(`/api/users?q=`)
      .then((r) => r.json())
      .then((d) => setUsers(d.users ?? []));
  }, [open]);

  useEffect(() => {
    const t = setTimeout(() => {
      void fetch(`/api/users?q=${encodeURIComponent(query)}`)
        .then((r) => r.json())
        .then((d) => setUsers(d.users ?? []));
    }, 200);
    return () => clearTimeout(t);
  }, [query]);

  const create = useCallback(async () => {
    setBusy(true);
    if (mode === "direct") {
      const target = selected[0];
      const res = await fetch("/api/chats", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "direct", userId: target }),
      });
      const data = await res.json();
      setBusy(false);
      if (data?.chatId) {
        onCreated(Number(data.chatId));
        onClose();
      }
      return;
    }
    const res = await fetch("/api/chats", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "group", title: title.trim() || "Новая группа", memberIds: selected }),
    });
    const data = await res.json();
    setBusy(false);
    if (data?.chatId) {
      onCreated(Number(data.chatId));
      onClose();
    }
  }, [mode, onClose, onCreated, selected, title]);

  return (
    <Modal open={open} onClose={onClose} title="Новый чат" width="max-w-md">
      <Segmented
        value={mode}
        onChange={(v) => {
          setMode(v);
          setSelected(mode === "direct" ? [] : selected.slice(0, 1));
        }}
        options={[
          { value: "direct", label: "Личный" },
          { value: "group", label: "Группа" },
        ]}
      />

      {mode === "group" ? (
        <div className="mt-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Название группы"
            className="w-full rounded-2xl px-4 py-3 text-[14px] outline-none"
            style={{ background: "var(--panel-2)", border: "1px solid var(--border)" }}
          />
        </div>
      ) : null}

      <div
        className="mt-3 flex items-center gap-2 rounded-2xl px-3 py-2.5"
        style={{ background: "var(--panel-2)", border: "1px solid var(--border)" }}
      >
        <IconSearch size={16} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск людей"
          className="w-full bg-transparent text-[13.5px] outline-none"
        />
        {query ? (
          <button onClick={() => setQuery("")} style={{ color: "var(--muted)" }}>
            <IconClose size={15} />
          </button>
        ) : null}
      </div>

      <div className="mt-3 max-h-64 pulse-scroll">
        {users.map((u) => {
          const active = selected.includes(u.id);
          return (
            <button
              key={u.id}
              onClick={() =>
                setSelected((prev) =>
                  mode === "direct"
                    ? [u.id]
                    : prev.includes(u.id)
                      ? prev.filter((id) => id !== u.id)
                      : [...prev, u.id],
                )
              }
              className="mb-1.5 flex w-full items-center gap-3 rounded-2xl px-2.5 py-2 text-left transition"
              style={{
                background: active ? "var(--panel-3)" : "var(--panel-2)",
                border: `1px solid ${active ? "var(--accent)" : "transparent"}`,
              }}
            >
              <Avatar name={u.name} emoji={u.emoji} accent={u.accent} fileId={u.avatarFileId} size={38} online={isOnline(u.lastSeenAt)} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13.5px] font-semibold">{u.name}</div>
                <div className="truncate text-[11.5px]" style={{ color: "var(--muted)" }}>
                  @{u.handle} · {isOnline(u.lastSeenAt) ? "в сети" : u.about}
                </div>
              </div>
              {active ? <span style={{ color: "var(--accent)" }}>✓</span> : null}
            </button>
          );
        })}
      </div>

      <button
        onClick={() => void create()}
        disabled={busy || selected.length === 0}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-[14px] font-semibold text-white transition hover:brightness-110 disabled:opacity-40"
        style={{ background: "var(--accent)" }}
      >
        {mode === "group" ? <IconUsers size={17} /> : <IconPlus size={17} />}
        {mode === "group" ? `Создать группу (${selected.length})` : "Начать чат"}
      </button>
    </Modal>
  );
}
