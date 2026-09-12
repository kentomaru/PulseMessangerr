"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ChatPayload, SettingsPayload } from "@/lib/pulse";
import ChatView from "./ChatView";
import CallOverlay from "./CallOverlay";
import NewChatDialog from "./NewChatDialog";
import SettingsPanel from "./SettingsPanel";
import Sidebar from "./Sidebar";
import WallpaperPicker from "./WallpaperPicker";
import { Modal } from "./ui";
import { useCallController } from "@/lib/useCallController";

export type Person = {
  id: number;
  name: string;
  handle: string;
  emoji: string;
  accent: string;
  about: string;
  avatarFileId?: number | null;
};

type Toast = { id: number; text: string };

export default function Messenger({
  me,
  initialChats,
  initialSettings,
}: {
  me: Person;
  initialChats: ChatPayload[];
  initialSettings: SettingsPayload;
}) {
  const router = useRouter();
  const [person, setPerson] = useState<Person>(me);
  const [chats, setChats] = useState<ChatPayload[]>(initialChats);
  const [settings, setSettings] = useState<SettingsPayload>(initialSettings);
  const [activeId, setActiveId] = useState<number | null>(initialChats[0]?.id ?? null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [wallpaperFor, setWallpaperFor] = useState<ChatPayload | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [mobileView, setMobileView] = useState<"list" | "chat">("list");
  const toastId = useRef(0);

  const notify = useCallback((text: string) => {
    toastId.current += 1;
    const id = toastId.current;
    setToasts((prev) => [...prev, { id, text }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 2600);
  }, []);

  const { call, incoming, muted, seconds, startCall, accept, decline, hangup, toggleMute } =
    useCallController(notify);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/state");
    if (!res.ok) return;
    const data = (await res.json()) as {
      me: Person;
      chats: ChatPayload[];
      settings: SettingsPayload;
    };
    setChats(data.chats);
    setSettings(data.settings);
    setPerson((prev) => ({ ...prev, ...data.me }));
    setActiveId((prev) => {
      if (prev && data.chats.some((c) => c.id === prev)) return prev;
      return data.chats[0]?.id ?? null;
    });
  }, []);

  useEffect(() => {
    const interval = setInterval(() => void refresh(), 5000);
    return () => clearInterval(interval);
  }, [refresh]);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = settings.theme;
    root.dataset.size = settings.fontSize;
    root.style.setProperty("--accent", accentColor(settings.accent));
    root.classList.toggle("no-anim", !settings.animations);
  }, [settings.accent, settings.animations, settings.fontSize, settings.theme]);

  const updateSettings = useCallback(
    async (patch: Partial<SettingsPayload> & Record<string, unknown>) => {
      setSettings((prev) => ({ ...prev, ...patch }) as SettingsPayload);
      await fetch("/api/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      await refresh();
    },
    [refresh],
  );

  const activeChat = chats.find((c) => c.id === activeId) ?? null;

  return (
    <div
      className="flex h-screen w-full overflow-hidden"
      style={{ background: "var(--bg)", color: "var(--text)" }}
      data-density={settings.density}
    >
      <div
        className={`h-full w-full shrink-0 md:block md:w-[336px] ${mobileView === "list" ? "block" : "hidden"}`}
      >
        <Sidebar
          me={person}
          chats={chats}
          activeId={activeId}
          settings={settings}
          onSelect={(id) => {
            setActiveId(id);
            setMobileView("chat");
          }}
          onNewChat={() => setNewChatOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
          onLogout={async () => {
            await fetch("/api/auth/session", { method: "DELETE" });
            router.push("/login");
            router.refresh();
          }}
        />
      </div>

      <div className={`min-w-0 flex-1 md:block ${mobileView === "chat" && activeChat ? "block" : "hidden md:block"}`}>
        {activeChat ? (
          <ChatView
            key={activeChat.id}
            chat={activeChat}
            me={person}
            settings={settings}
            onNotify={notify}
            onChanged={() => void refresh()}
            onOpenWallpaper={() => setWallpaperFor(activeChat)}
            onBack={() => setMobileView("list")}
            onStartCall={(peer) => void startCall(activeChat.id, peer)}
          />
        ) : (
          <EmptyState onCreate={() => setNewChatOpen(true)} />
        )}
      </div>

      {settingsOpen ? (
        <SettingsPanel
          me={person}
          settings={settings}
          onUpdate={(patch) => void updateSettings(patch)}
          onClose={() => setSettingsOpen(false)}
          onLogout={async () => {
            await fetch("/api/auth/session", { method: "DELETE" });
            router.push("/login");
            router.refresh();
          }}
        />
      ) : null}

      <NewChatDialog
        open={newChatOpen}
        onClose={() => setNewChatOpen(false)}
        onCreated={(chatId) => {
          void refresh().then(() => {
            setActiveId(chatId);
            setMobileView("chat");
          });
        }}
      />

      <Modal
        open={!!wallpaperFor}
        onClose={() => setWallpaperFor(null)}
        title="Обои чата"
        width="max-w-md"
      >
        {wallpaperFor ? (
          <>
            <WallpaperPicker
              value={wallpaperFor.wallpaper}
              onChange={async (value) => {
                await fetch(`/api/chats/${wallpaperFor.id}`, {
                  method: "PATCH",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ personalWallpaper: value }),
                });
                setWallpaperFor((prev) => (prev ? { ...prev, wallpaper: value } : prev));
                await refresh();
              }}
              onNotify={notify}
            />
            <button
              onClick={async () => {
                await fetch(`/api/chats/${wallpaperFor.id}`, {
                  method: "PATCH",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ personalWallpaper: null }),
                });
                setWallpaperFor(null);
                await refresh();
                notify("Используются обои по умолчанию");
              }}
              className="mt-4 w-full rounded-2xl py-2.5 text-[13px] font-medium"
              style={{ background: "var(--panel-2)", border: "1px solid var(--border)" }}
            >
              Сбросить к обоям по умолчанию
            </button>
          </>
        ) : null}
      </Modal>

      <div className="pointer-events-none fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="animate-pulse-in rounded-2xl px-4 py-2.5 text-[13px] font-medium text-white shadow-lg"
            style={{ background: "rgba(20,22,32,.94)", border: "1px solid rgba(255,255,255,.12)" }}
          >
            {t.text}
          </div>
        ))}
      </div>

      {call || incoming ? (
        <CallOverlay
          call={call}
          incoming={incoming}
          muted={muted}
          seconds={seconds}
          onAccept={accept}
          onDecline={decline}
          onHangup={hangup}
          onToggleMute={toggleMute}
        />
      ) : null}
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="pulse-ring rounded-[26px]">
        <PulseBig />
      </div>
      <div>
        <div className="text-[18px] font-bold">Pulse</div>
        <div className="mt-1 text-[13px]" style={{ color: "var(--muted)" }}>
          Выберите чат слева или создайте новый — фото, видео и файлы уходят одним сообщением вместе с текстом.
        </div>
      </div>
      <button
        onClick={onCreate}
        className="rounded-2xl px-5 py-2.5 text-[13.5px] font-semibold text-white"
        style={{ background: "var(--accent)" }}
      >
        Новый чат
      </button>
    </div>
  );
}

function PulseBig() {
  return (
    <svg width="76" height="76" viewBox="0 0 64 64" aria-hidden>
      <defs>
        <linearGradient id="big-pulse" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#8b5cf6" />
          <stop offset="45%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#22d3ee" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="17" fill="url(#big-pulse)" />
      <path
        d="M10 33h6.5l4.2-13.5 6.6 27 5.6-19.5 3.6 6H54"
        fill="none"
        stroke="#ffffff"
        strokeWidth="4.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="54" cy="33" r="4.6" fill="#ffffff" />
    </svg>
  );
}

function accentColor(accent: string): string {
  const map: Record<string, string> = {
    violet: "#7c3aed",
    cyan: "#0ea5e9",
    emerald: "#10b981",
    amber: "#f59e0b",
    rose: "#f43f5e",
    indigo: "#6366f1",
  };
  return map[accent] ?? map.violet;
}
