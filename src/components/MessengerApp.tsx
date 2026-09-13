"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2 } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { messagePreview } from "@/lib/format";
import { playNotifySound } from "@/lib/notify";
import type { ConversationListItem, PublicUser, StoryGroup } from "@/lib/types";
import { useCallController } from "@/lib/useCallController";
import Sidebar from "./Sidebar";
import ChatView from "./ChatView";
import ProfileModal from "./ProfileModal";
import UserCardModal from "./UserCardModal";
import CallStage from "./CallStage";
import StoryComposer from "./StoryComposer";
import StoryViewer from "./StoryViewer";
import GroupCreateModal from "./GroupCreateModal";
import GroupInfoModal from "./GroupInfoModal";
import DiscoverModal from "./DiscoverModal";
import IframeNotice from "./IframeNotice";

type Toast = { id: number; msg: string };

/** Что лежит в hash-ссылке: `#join=<token>` (звонок) или `#group=<token>` (инвайт). */
function parseHash(): { join: string | null; group: string | null } {
  if (typeof window === "undefined") return { join: null, group: null };
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  return { join: params.get("join"), group: params.get("group") };
}

export default function MessengerApp({ me: initialMe }: { me: PublicUser }) {
  const [me, setMe] = useState(initialMe);
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [storyGroups, setStoryGroups] = useState<StoryGroup[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  // Тема оформления: серый (по умолчанию), синий как в TG, светлая
  const [theme, setTheme] = useState<"gray" | "tg" | "light">(() => {
    try {
      const t = localStorage.getItem("pulse_theme_v1");
      return t === "tg" || t === "light" ? t : "gray";
    } catch {
      return "gray";
    }
  });
  const [online, setOnline] = useState(true);
  // Полная кастомизация: цвет/радиус пузырей, размер текста, компактность,
  // шрифт, анимации, Enter, «не беспокоить». Хранится локально.
  const [custom, setCustom] = useState(() => {
    try {
      const c = JSON.parse(localStorage.getItem("pulse_custom_v1") ?? "{}") as Record<string, unknown>;
      return {
        bubbles: (c.bubbles as string) ?? "blue",
        radius: (c.radius as string) ?? "md",
        chatfs: (c.chatfs as string) ?? "m",
        compact: !!c.compact,
        font: (c.font as string) ?? "sys",
        anims: c.anims !== false,
        dndUntil: (c.dndUntil as number) ?? 0,
      };
    } catch {
      return { bubbles: "blue", radius: "md", chatfs: "m", compact: false, font: "sys", anims: true, dndUntil: 0 };
    }
  });
  const [showProfile, setShowProfile] = useState(false);
  const [viewUser, setViewUser] = useState<PublicUser | null>(null);
  const [storyComposer, setStoryComposer] = useState(false);
  const [storyViewer, setStoryViewer] = useState<number | null>(null);
  const [createKind, setCreateKind] = useState<"group" | "channel" | null>(null);
  const [discover, setDiscover] = useState(false);
  const [groupInfoId, setGroupInfoId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  /** Звук уведомлений (localStorage, вкл по умолчанию). */
  const [soundOn, setSoundOn] = useState(true);
  /** Ширина панели чатов — меняется перетаскиванием разделителя (десктоп). */
  const [sidebarW, setSidebarW] = useState<number>(() => {
    try {
      const v = Number(localStorage.getItem("pulse_sidebar_w"));
      return Number.isFinite(v) && v >= 280 && v <= 640 ? v : 380;
    } catch {
      return 380;
    }
  });
  const resizingRef = useRef(false);
  const toastId = useRef(0);
  const unauthorizedRef = useRef(false);
  const activeIdRef = useRef<string | null>(null);
  activeIdRef.current = activeId;
  const conversationsRef = useRef<ConversationListItem[]>([]);
  const soundOnRef = useRef(true);
  const dndUntilRef = useRef(0);

  const notify = useCallback((msg: string) => {
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, msg }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3800);
  }, []);

  /** Сессия истекла (401 в любом опросе) — возвращаем на экран входа. */
  const handleUnauthorized = useCallback(() => {
    if (unauthorizedRef.current) return;
    unauthorizedRef.current = true;
    window.location.href = "/";
  }, []);

  const handleUnauthorizedRef = useRef(handleUnauthorized);
  handleUnauthorizedRef.current = handleUnauthorized;

  const convFpRef = useRef("");
  const loadConversations = useCallback(async () => {
    try {
      const d = await api<{ conversations: ConversationListItem[] }>("/api/conversations");
      // Не перерисовываем список, если ничего не изменилось (опрос каждые 4 с):
      // убирает «подтормаживание» интерфейса на ровном месте.
      let fp = "";
      try {
        fp = JSON.stringify(d.conversations);
      } catch {
        fp = `n${d.conversations.length}:${Date.now()}`;
      }
      if (fp !== convFpRef.current) {
        convFpRef.current = fp;
        setConversations(d.conversations);
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) handleUnauthorizedRef.current();
    }
  }, []);

  const loadStories = useCallback(async () => {
    try {
      const d = await api<{ groups: StoryGroup[] }>("/api/stories");
      setStoryGroups(d.groups);
    } catch {
      /* ignore */
    }
  }, []);

  const callCtl = useCallController(me.id, notify, handleUnauthorized, () => {
    void loadConversations();
  });

  useEffect(() => {
    void loadConversations();
    void loadStories();
    const t = setInterval(loadConversations, 4000);
    const ts = setInterval(loadStories, 30_000);
    return () => {
      clearInterval(t);
      clearInterval(ts);
    };
  }, [loadConversations, loadStories]);

  /** Звук входящего звонка (рингтон). */
  const [callSoundOn, setCallSoundOn] = useState(true);
  /** Браузерные уведомления о новых сообщениях. */
  const [notifyOn, setNotifyOn] = useState(false);

  // Настройки уведомлений из localStorage
  useEffect(() => {
    setSoundOn(localStorage.getItem("pulse_sound") !== "off");
    setCallSoundOn(localStorage.getItem("pulse_call_sound") !== "off");
    setNotifyOn(
      localStorage.getItem("pulse_notify") === "on" &&
        typeof Notification !== "undefined" &&
        Notification.permission === "granted",
    );
  }, []);
  useEffect(() => {
    soundOnRef.current = soundOn;
    dndUntilRef.current = custom.dndUntil;
  }, [soundOn]);

  const toggleSound = useCallback(() => {
    setSoundOn((v) => {
      const next = !v;
      localStorage.setItem("pulse_sound", next ? "on" : "off");
      return next;
    });
  }, []);

  const toggleCallSound = useCallback(() => {
    setCallSoundOn((v) => {
      const next = !v;
      localStorage.setItem("pulse_call_sound", next ? "on" : "off");
      return next;
    });
  }, []);

  const toggleNotify = useCallback(() => {
    setNotifyOn((v) => {
      const next = !v;
      if (next && typeof Notification !== "undefined" && Notification.permission === "default") {
        // Просим разрешение у браузера; если откажут — не включаем.
        void Notification.requestPermission().then((perm) => {
          const ok = perm === "granted";
          localStorage.setItem("pulse_notify", ok ? "on" : "off");
          setNotifyOn(ok);
          if (!ok) notify("Браузер не разрешил уведомления — проверьте настройки сайта");
        });
        return v; // фактическое включение — после ответа на запрос
      }
      localStorage.setItem("pulse_notify", next ? "on" : "off");
      return next;
    });
  }, [notify]);

  /** Браузерное уведомление (всплывает поверх других окон). */
  const pushBrowserNotification = useCallback((title: string, body: string) => {
    try {
      if (typeof Notification === "undefined") return;
      if (localStorage.getItem("pulse_notify") !== "on") return;
      if (Notification.permission !== "granted") return;
      const n = new Notification(title, { body, icon: "/icons/icon-192.png", tag: `pulse-${Date.now()}` });
      n.onclick = () => {
        window.focus();
        n.close();
      };
      setTimeout(() => n.close(), 7_000);
    } catch {
      /* уведомления недоступны — тихо пропускаем */
    }
  }, []);

  // Счётчик непрочитанных в заголовке вкладки
  useEffect(() => {
    const n = conversations.reduce((s, c) => s + c.unreadCount, 0);
    document.title = n > 0 ? `(${n}) Pulse` : "Pulse";
  }, [conversations]);

  /* ── Масштаб интерфейса: «всё очень маленькое» → можно укрупнить ── */
  const UI_SCALE_KEY = "pulse_ui_scale_v1";
  const [uiScale, setUiScaleState] = useState<"s" | "m" | "l">(() => {
    try {
      const v = localStorage.getItem(UI_SCALE_KEY);
      return v === "s" || v === "l" ? v : "m";
    } catch {
      return "m";
    }
  });
  const setUiScale = useCallback((v: "s" | "m" | "l") => {
    setUiScaleState(v);
    try {
      localStorage.setItem(UI_SCALE_KEY, v);
    } catch {
      /* ignore */
    }
  }, []);
  const zoom = uiScale === "s" ? 0.88 : uiScale === "l" ? 1.14 : 1;

  useEffect(() => {
    const h = document.documentElement;
    h.dataset.bubbles = custom.bubbles;
    h.dataset.bradius = custom.radius;
    h.dataset.chatfs = custom.chatfs;
    h.dataset.font = custom.font;
    h.dataset.anims = custom.anims ? "1" : "0";
    try {
      localStorage.setItem("pulse_custom_v1", JSON.stringify(custom));
    } catch {
      /* ignore */
    }
  }, [custom]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("pulse_theme_v1", theme);
    } catch {
      /* приватный режим */
    }
  }, [theme]);

  // Баннер «нет сети» и хоткей Ctrl+K — фокус на поиск чатов
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    setOnline(navigator.onLine);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    const keys = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        document.getElementById("pulse-chat-search")?.focus();
      }
      // Ctrl+Shift+D — переключение темы оформления
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "d") {
        e.preventDefault();
        setTheme((t) => (t === "gray" ? "tg" : t === "tg" ? "light" : "gray"));
      }
      // Alt+↑/↓ — переключение между чатами
      if (e.altKey && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
        e.preventDefault();
        const list = conversationsRef.current;
        if (list.length === 0) return;
        const idx = list.findIndex((c) => c.id === activeIdRef.current);
        const next =
          e.key === "ArrowDown"
            ? list[Math.min(list.length - 1, idx + 1)]
            : list[Math.max(0, idx <= 0 ? 0 : idx - 1)];
        if (next) setActiveId(next.id);
      }
    };
    window.addEventListener("keydown", keys);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      window.removeEventListener("keydown", keys);
    };
  }, []);

  /* ── Закреплённые и заглушённые чаты (хранятся локально) ── */
  const PINNED_KEY = "pulse_pinned_v1";
  const MUTED_KEY = "pulse_muted_v1";
  const readIdSet = (key: string): Set<string> => {
    try {
      const raw = localStorage.getItem(key);
      const arr = raw ? (JSON.parse(raw) as unknown) : [];
      return new Set(Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : []);
    } catch {
      return new Set();
    }
  };
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(() => readIdSet(PINNED_KEY));
  const [mutedIds, setMutedIds] = useState<Set<string>>(() => readIdSet(MUTED_KEY));
  const mutedRef = useRef(mutedIds);
  mutedRef.current = mutedIds;
  const togglePinned = useCallback((id: string) => {
    setPinnedIds((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(PINNED_KEY, JSON.stringify(Array.from(next)));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);
  const toggleMuted = useCallback((id: string) => {
    setMutedIds((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(MUTED_KEY, JSON.stringify(Array.from(next)));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  // Звук нового сообщения: сработать должен только для чужих сообщений
  // в чатах, которые сейчас не открыты (или когда вкладка в фоне).
  const lastMsgIdsRef = useRef<Map<string, string>>(new Map());
  const firstConvLoadRef = useRef(true);
  useEffect(() => {
    const prev = lastMsgIdsRef.current;
    let beep = false;
    let notif: { title: string; body: string } | null = null;
    for (const c of conversations) {
      const lm = c.lastMessage;
      const old = prev.get(c.id);
      // Диалог мог появиться в списке впервые сразу с чужим сообщением
      // (написал новый человек) — это тоже «новое сообщение», бип нужен.
      // От первоначальной загрузки список защищает firstConvLoadRef ниже.
      const isNew = !!lm && lm.id !== old && lm.senderId !== me.id;
      // Заглушённый чат: ни звука, ни всплывающего уведомления
      if (isNew && mutedRef.current.has(c.id)) continue;
      if (isNew && (c.id !== activeIdRef.current || document.hidden)) {
        beep = true;
        // Для браузерного уведомления берём последнее новое сообщение
        const sender = lm.senderId === me.id ? "Вы" : (lm.senderName ?? "Новое сообщение");
        notif = {
          title: c.kind === "direct" ? sender : `${sender} · ${c.title}`,
          body: messagePreview(lm.type, lm.content),
        };
      }
      if (lm) prev.set(c.id, lm.id);
    }
    // первый опрос — просто запоминаем id, не пиликаем
    if (firstConvLoadRef.current) {
      firstConvLoadRef.current = false;
      beep = false;
      notif = null;
    }
    if (beep) {
      if (soundOnRef.current && Date.now() >= (dndUntilRef.current ?? 0)) playNotifySound();
      if (notif) pushBrowserNotification(notif.title, notif.body);
    }
  }, [conversations, me.id, pushBrowserNotification]);

  conversationsRef.current = conversations;
  const activeConv = conversations.find((c) => c.id === activeId) ?? null;

  /** Клик по @юзернейму в сообщении: чат/канал или личный чат с человеком. */
  const openUsername = async (name: string) => {
    try {
      const d = await api<{ conversation: { id: string } | null }>(
        `/api/conversations/resolve?username=${encodeURIComponent(name)}`,
      );
      if (d.conversation) {
        await loadConversations();
        setActiveId(d.conversation.id);
        return;
      }
    } catch {
      /* fallthrough к людям */
    }
    try {
      const u = await api<{ users: PublicUser[] }>(`/api/users/search?q=${encodeURIComponent(name)}`);
      const hit = u.users.find((x) => x.username.toLowerCase() === name);
      if (hit) {
        openConversationWith(hit);
        return;
      }
    } catch {
      /* ignore */
    }
    notify(`@${name} не найден`);
  };

  /** «Комментарии» под постом канала: вступление в обсуждение и переход в него. */
  const openChannelDiscussion = async () => {
    const conv = activeConv;
    if (!conv || conv.kind !== "channel") return;
    try {
      const d = await api<{ discussion: { id: string } | null }>(
        `/api/conversations/${conv.id}/discussion`,
      );
      if (!d.discussion) {
        notify("Обсуждение не привязано. Владелец канала добавляет чат в настройках канала.");
        return;
      }
      await api(`/api/conversations/${conv.id}/discussion`, {
        method: "POST",
        body: JSON.stringify({ join: true, groupId: d.discussion.id }),
      }).catch(() => {});
      await loadConversations();
      setActiveId(d.discussion.id);
    } catch (e) {
      notify(e instanceof Error ? e.message : "Не удалось открыть комментарии");
    }
  };

  const openConversationWith = useCallback(
    async (user: PublicUser) => {
      try {
        const d = await api<{ conversation: { id: string; peer: PublicUser } }>("/api/conversations", {
          method: "POST",
          body: JSON.stringify({ userId: user.id }),
        });
        setActiveId(d.conversation.id);
        await loadConversations();
      } catch (e) {
        notify(e instanceof Error ? e.message : "Не удалось открыть чат");
      }
    },
    [loadConversations, notify],
  );

  /** Открыть «Избранное» — личный чат с самим собой (создаётся при первом открытии). */
  const openSaved = useCallback(async () => {
    const existing = conversations.find((c) => c.saved);
    if (existing) {
      setActiveId(existing.id);
      return;
    }
    try {
      const d = await api<{ conversation: { id: string } }>("/api/conversations", {
        method: "POST",
        body: JSON.stringify({ userId: me.id }),
      });
      setActiveId(d.conversation.id);
      await loadConversations();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Не удалось открыть «Избранное»");
    }
  }, [conversations, me.id, loadConversations, notify]);

  /** Вход по ссылке-приглашению в группу/канал. */
  const joinByToken = useCallback(
    async (token: string) => {
      try {
        const d = await api<{ conversation: { id: string; title: string } }>("/api/conversations/join", {
          method: "POST",
          body: JSON.stringify({ token }),
        });
        notify(`Вы в «${d.conversation.title}»`);
        await loadConversations();
        setActiveId(d.conversation.id);
      } catch (e) {
        notify(e instanceof Error ? e.message : "Ссылка-приглашение не сработала");
      }
    },
    [loadConversations, notify],
  );

  const joinByTokenRef = useRef(joinByToken);
  joinByTokenRef.current = joinByToken;
  const handledHashRef = useRef<string | null>(null);

  /**
   * Обработка hash-ссылок:
   *  `#join=<token>`  — войти в звонок (можно вообще не быть в чате);
   *  `#group=<token>` — вступить в приватную группу/канал.
   */
  useEffect(() => {
    const handle = async () => {
      const { join, group } = parseHash();
      const key = join ? `join:${join}` : group ? `group:${group}` : null;
      if (!key || handledHashRef.current === key) return;
      handledHashRef.current = key;

      if (join) {
        await callCtl.joinByToken(join);
      } else if (group) {
        await joinByTokenRef.current(group);
      }
      // Убираем hash из адресной строки, чтобы не срабатывал повторно
      try {
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
      } catch {
        /* не важно */
      }
    };
    void handle();
    window.addEventListener("hashchange", handle);
    return () => window.removeEventListener("hashchange", handle);
    // Зависимость только от готовности списка диалогов (для #group)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversations.length, callCtl.joinByToken]);

  const logout = useCallback(async () => {
    try {
      // Если идёт звонок — завершаем его ДО выхода, чтобы он не «висел»
      // у собеседника после разлогина (раньше звонок шёл дальше).
      if (callCtl.session) await callCtl.leave({ endForAll: false }).catch(() => {});
      await api("/api/auth/logout", { method: "POST" });
    } finally {
      window.location.reload();
    }
  }, [callCtl]);

  // Переключаемся на чат, в который приходит звонок
  useEffect(() => {
    if (callCtl.incoming) setActiveId(callCtl.incoming.conversationId);
  }, [callCtl.incoming]);

  const markWatched = useCallback((storyId: string) => {
    setStoryGroups((gs) =>
      gs.map((g) => ({
        ...g,
        stories: g.stories.map((s) => (s.id === storyId ? { ...s, viewed: true } : s)),
      })),
    );
    void api(`/api/stories/${storyId}/view`, { method: "POST" }).catch(() => {});
  }, []);

  const removeStory = useCallback(
    (storyId: string) => {
      setStoryGroups((gs) =>
        gs.map((g) => ({ ...g, stories: g.stories.filter((s) => s.id !== storyId) })).filter((g) => g.stories.length > 0),
      );
      void loadStories();
    },
    [loadStories],
  );

  /** Контакты для быстрого выбора при создании группы. */
  const contacts = useMemo(() => {
    const map = new Map<string, PublicUser>();
    for (const c of conversations) {
      if (c.kind === "direct" && c.peer?.id) map.set(c.peer.id, c.peer);
      for (const m of c.members ?? []) if (m.user.id !== me.id) map.set(m.user.id, m.user);
    }
    return Array.from(map.values()).slice(0, 60);
  }, [conversations, me.id]);

  /** Перетаскивание разделителя: ширина панели чатов. */
  const onResizeDown = (e: React.PointerEvent<HTMLDivElement>) => {
    resizingRef.current = true;
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };
  const onResizeMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!resizingRef.current) return;
    setSidebarW(Math.min(640, Math.max(280, e.clientX)));
  };
  const onResizeUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!resizingRef.current) return;
    resizingRef.current = false;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    setSidebarW((w) => {
      try {
        localStorage.setItem("pulse_sidebar_w", String(w));
      } catch {
        /* ignore */
      }
      return w;
    });
  };

  return (
    <main
      className="relative z-10 flex h-dvh overflow-hidden"
      // Масштаб интерфейса («Мелкий / Обычный / Крупный» в настройках)
      style={zoom !== 1 ? ({ zoom } as React.CSSProperties) : undefined}
    >
      <IframeNotice />
      {!online && (
        <div className="fixed inset-x-0 top-0 z-[130] bg-rose-600/90 px-4 py-1.5 text-center text-[12px] font-semibold text-white">
          Нет соединения с сетью — сообщения и звонки не работают
        </div>
      )}
      <div
        className={`${activeId ? "hidden md:flex" : "flex"} w-full shrink-0 md:w-[var(--sbw,380px)]`}
        style={{ "--sbw": `${sidebarW}px` } as React.CSSProperties}
      >
        <Sidebar
          me={me}
          conversations={conversations}
          activeId={activeId}
          storyGroups={storyGroups}
          soundOn={soundOn}
          pinnedIds={pinnedIds}
          mutedIds={mutedIds}
          onTogglePin={togglePinned}
          onToggleMute={toggleMuted}
          uiScale={uiScale}
          onSetUiScale={setUiScale}
          theme={theme}
          onSetTheme={setTheme}
          custom={custom}
          onSetCustom={setCustom}
          callSoundOn={callSoundOn}
          notifyOn={notifyOn}
          onToggleSound={toggleSound}
          onToggleCallSound={toggleCallSound}
          onToggleNotify={toggleNotify}
          onSelect={setActiveId}
          onOpenProfile={() => setShowProfile(true)}
          onOpenChat={openConversationWith}
          onLogout={logout}
          onOpenStories={(idx) => setStoryViewer(idx)}
          onAddStory={() => setStoryComposer(true)}
          onCreateGroup={(kind) => setCreateKind(kind)}
          onDiscover={() => setDiscover(true)}
          onOpenSaved={() => void openSaved()}
          onJoinByToken={(token) => void joinByToken(token)}
        />
      </div>

      {/* Разделитель: перетащите, чтобы изменить ширину панели чатов (десктоп) */}
      <div
        onPointerDown={onResizeDown}
        onPointerMove={onResizeMove}
        onPointerUp={onResizeUp}
        onPointerCancel={onResizeUp}
        style={{ touchAction: "none" }}
        className="group relative hidden w-2 shrink-0 cursor-col-resize md:block"
        title="Потяните, чтобы изменить ширину панели"
      >
        <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-white/5 transition-colors group-hover:w-[3px] group-hover:bg-white/20" />
      </div>

      <div className={`${activeId ? "flex" : "hidden md:flex"} min-w-0 flex-1`}>
        {activeConv ? (
          <ChatView
            key={activeConv.id}
            me={me}
            conversationId={activeConv.id}
            initialTitle={activeConv.title}
            initialKind={activeConv.kind}
            initialAvatar={activeConv.avatarUrl}
            initialUnread={activeConv.unreadCount}
            peer={activeConv.kind === "direct" ? activeConv.peer : null}
            onBack={() => setActiveId(null)}
            onCall={(media) => callCtl.startCall(activeConv.id, media)}
            onJoinCall={(callId, media) => callCtl.joinCall(callId, media)}
            onViewPeer={() => activeConv.peer && setViewUser(activeConv.peer)}
            onViewUser={(u) => setViewUser(u)}
            onOpenInfo={() => setGroupInfoId(activeConv.id)}
            onOpenDiscussion={
              activeConv.kind === "channel" ? () => void openChannelDiscussion() : undefined
            }
            onOpenUsername={(name) => void openUsername(name)}
            callBusy={!!callCtl.session || !!callCtl.incoming || callCtl.starting}
            refreshConversations={loadConversations}
            notify={notify}
            onUnauthorized={handleUnauthorized}
          />
        ) : (
          <EmptyState hasSpaces={conversations.some((c) => c.kind !== "direct")} onCreate={() => setCreateKind("group")} />
        )}
      </div>

      {/* Каждый условный ребёнок — со своим key: без них framer-motion
          ставит пустой ключ, а при двух открытых модалках это
          «two children with the same key» и сбитые exit-анимации. */}
      <AnimatePresence>
        {showProfile && (
          <ProfileModal
            key="profile"
            me={me}
            onClose={() => setShowProfile(false)}
            onSaved={(u: PublicUser) => {
              // Приватность сохраняется во вкладке профиля и НЕ закрывает окно;
              // само окно закрывает кнопка «Сохранить» вкладки профиля.
              setMe(u);
              void loadConversations();
              notify("Сохранено");
            }}
            onDeletedAccount={() => {
              window.location.href = "/";
            }}
          />
        )}

        {viewUser && (
          <UserCardModal
            key="user-card"
            user={viewUser}
            onClose={() => setViewUser(null)}
            onMessage={() => {
              void openConversationWith(viewUser);
              setViewUser(null);
            }}
          />
        )}
        {createKind && (
          <GroupCreateModal
            key="create"
            me={me}
            contacts={contacts}
            initialKind={createKind}
            onClose={() => setCreateKind(null)}
            onCreated={(id) => {
              setCreateKind(null);
              void loadConversations().then(() => setActiveId(id));
            }}
            notify={notify}
          />
        )}
        {discover && (
          <DiscoverModal
            key="discover"
            onClose={() => setDiscover(false)}
            onJoined={(id) => {
              void loadConversations();
              setActiveId(id);
            }}
            notify={notify}
          />
        )}
        {groupInfoId && (
          <GroupInfoModal
            key="group-info"
            me={me}
            conversationId={groupInfoId}
            callBusy={!!callCtl.session || !!callCtl.incoming || callCtl.starting}
            onClose={() => setGroupInfoId(null)}
            onOpenConversation={(id) => setActiveId(id)}
            onCall={(media) => {
              setGroupInfoId(null);
              void callCtl.startCall(groupInfoId, media);
            }}
            onViewUser={(u) => setViewUser(u)}
            onLeft={() => {
              setGroupInfoId(null);
              setActiveId(null);
              void loadConversations();
            }}
            onChanged={() => void loadConversations()}
            notify={notify}
          />
        )}
        {storyComposer && (
          <StoryComposer
            key="story-composer"
            onClose={() => setStoryComposer(false)}
            notify={notify}
            onPublished={() => {
              setStoryComposer(false);
              void loadStories();
            }}
          />
        )}
        {storyViewer !== null && storyGroups[storyViewer] && (
          <StoryViewer
            key="story-viewer"
            me={me}
            groups={storyGroups}
            startGroupIndex={storyViewer}
            onClose={() => setStoryViewer(null)}
            onWatched={markWatched}
            onDeleted={removeStory}
            onViewUser={(u) => setViewUser(u)}
          />
        )}
      </AnimatePresence>

      {/* Звонок: окно / «динамический остров» / входящий — поверх всего */}
      <CallStage
        meId={me.id}
        session={callCtl.session}
        incoming={callCtl.incoming}
        muted={callCtl.muted}
        cameraOn={callCtl.cameraOn}
        screenSharing={callCtl.screenSharing}
        screenStreamRef={callCtl.screenStreamRef}
        seconds={callCtl.seconds}
        starting={callCtl.starting}
        minimized={callCtl.minimized}
        setMinimized={callCtl.setMinimized}
        streamTick={callCtl.streamTick}
        localStreamRef={callCtl.localStreamRef}
        remoteStreams={callCtl.remoteStreams}
        onAccept={callCtl.accept}
        onDecline={callCtl.decline}
        onDismissIncoming={callCtl.dismissIncoming}
        onLeave={callCtl.hangup}
        onEndForAll={() => callCtl.leave({ endForAll: true })}
        onToggleMute={callCtl.toggleMute}
        onToggleCamera={() => void callCtl.toggleCamera()}
        onToggleScreenShare={() => void callCtl.toggleScreenShare()}
        onReconnectMedia={() => void callCtl.reconnectMedia()}
        audioWatchdog={callCtl.audioWatchdog}
        onCopyLink={callCtl.getShareLink}
        onInvite={callCtl.inviteUsers}
        onViewUser={(u) => setViewUser(u)}
        notify={notify}
        onApplyAudioSettings={(s) => void callCtl.applyAudioSettings(s)}
        micLevelRef={callCtl.micLevelRef}
        connQuality={callCtl.connQuality}
      />

      {/* toasts */}
      <div className="pointer-events-none fixed bottom-6 left-1/2 z-[95] flex -translate-x-1/2 flex-col items-center gap-2">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 16, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.96 }}
              className="glass-strong flex items-center gap-2.5 rounded-2xl px-4.5 py-3 text-sm text-white/90 shadow-xl"
            >
              <CheckCircle2 className="h-4 w-4 text-slate-400" />
              {t.msg}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </main>
  );
}

function EmptyState({
  hasSpaces,
  onCreate,
}: {
  hasSpaces: boolean;
  onCreate: () => void;
}) {
  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center gap-5 text-center">
      <div className="relative">
        <div className="absolute inset-0 animate-ping rounded-full bg-white/10 blur-2xl" />
        <div className="btn-gradient relative flex h-20 w-20 items-center justify-center rounded-[1.6rem]">
          <svg
            viewBox="0 0 24 24"
            className="h-9 w-9 text-white"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
          </svg>
        </div>
      </div>
      <div>
        <h2 className="font-display text-2xl font-bold text-white/90">Выберите чат</h2>
        <p className="mt-2 max-w-xs text-sm leading-relaxed text-white/40">
          {hasSpaces
            ? "Или создайте новую группу/канал и позовите людей — звонки там групповые"
            : "Найдите человека по @имени в поиске слева — или создайте группу кнопкой «+»"}
        </p>
      </div>
      <button
        onClick={onCreate}
        className="glass rounded-2xl px-5 py-3 text-sm font-medium text-white/80 transition-colors hover:text-white"
      >
        Создать группу
      </button>
    </div>
  );
}
