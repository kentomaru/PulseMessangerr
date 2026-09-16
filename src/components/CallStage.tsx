"use client";

/**
 * Единая сцена звонка:
 *  — входящий вызов (ЛС «звонит» или групповая комната, куда зовут);
 *  — активная комната: плавающее окно на десктопе (можно двигать и менять
 *    размер) и полноэкранный режим на телефоне;
 *  — «динамический остров»: свёрнутый звонок, с которым можно переписываться.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AudioLines,
  Check,
  Copy,
  Expand,
  Maximize,
  Maximize2,
  Mic,
  MicOff,
  Minimize,
  Activity,
  Minimize2,
  MonitorOff,
  MonitorUp,
  ExternalLink,
  Phone,
  PhoneOff,
  RotateCw,
  Shrink,
  UserPlus,
  Users,
  Video,
  VideoOff,
  Volume2,
  X,
} from "lucide-react";
import Avatar from "./Avatar";
import PeoplePicker from "./PeoplePicker";
import { copyToClipboard } from "@/lib/api";
import { formatDuration } from "@/lib/format";
import { getAudioContext } from "@/lib/notify";
import {
  loadAudioSettings,
  loadUserVolumes,
  saveUserVolume,
  type AudioSettings,
} from "@/lib/audioSettings";
import type { CallSession, IncomingCall } from "@/lib/useCallController";
import type { CallParticipantInfo, PublicUser } from "@/lib/types";

type Props = {
  /** Сбросить громкости всех участников к 100%. */
  onResetVolumes?: () => void;
  meId: string;
  session: CallSession | null;
  incoming: IncomingCall | null;
  muted: boolean;
  cameraOn: boolean;
  /** Демонстрирую ли я свой экран. */
  screenSharing: boolean;
  /** Поток демонстрации экрана (мой). */
  screenStreamRef: React.RefObject<MediaStream | null>;
  seconds: number;
  starting: boolean;
  minimized: boolean;
  setMinimized: (v: boolean) => void;
  streamTick: number;
  localStreamRef: React.RefObject<MediaStream | null>;
  remoteStreams: Record<string, MediaStream>;
  onAccept: () => void;
  onDecline: () => void;
  onDismissIncoming: () => void;
  onLeave: () => void;
  onEndForAll: () => void;
  onToggleMute: () => void;
  onToggleCamera: () => void;
  onToggleScreenShare: () => void;
  /** Принудительно переподключить звук/видео со всеми участниками. */
  onReconnectMedia: () => void;
  onCopyLink: () => Promise<string | null>;
  onInvite: (userIds: string[]) => Promise<number>;
  onViewUser: (user: PublicUser) => void;
  notify: (msg: string) => void;
  /** Применить новые настройки звука (шумоподавление, порог голоса) на лету. */
  onApplyAudioSettings: (s: AudioSettings) => void;
  /** Текущий уровень микрофона (0–100) для индикатора. */
  micLevelRef: React.RefObject<number>;
  /** Живая статистика звука по каждому участнику (для панели «Диагностика»). */
  audioWatchdog?: Record<string, { conn: string; sentKB: number; recvKB: number; frames: number }>;
  /** Уровень связи с каждым участником: 0–3 «палочки». */
  connQuality?: Record<string, number>;
};

/** Индикатор уровня связи: 3 столбика, заполнены по качеству (0–3). */
function SignalBars({ quality }: { quality: number | undefined }) {
  const q = quality ?? 0;
  const color = q >= 3 ? "bg-emerald-400" : q === 2 ? "bg-amber-300" : q === 1 ? "bg-rose-400" : "bg-white/20";
  return (
    <span className="flex items-end gap-[2px]" title={`Связь: ${q === 0 ? "нет данных" : q === 1 ? "слабая" : q === 2 ? "средняя" : "отличная"}`}>
      {[1, 2, 3].map((i) => (
        <span
          key={i}
          className={`w-[3px] rounded-sm ${i <= q ? color : "bg-white/15"}`}
          style={{ height: 3 + i * 2.5 }}
        />
      ))}
    </span>
  );
}

const SIZES = {
  sm: { w: 340, h: 260 },
  md: { w: 560, h: 430 },
  lg: { w: 880, h: 620 },
} as const;
type SizeKey = keyof typeof SIZES;

/** Реестр удалённых потоков — доступен плиткам и «острову». */
const StreamsContext = createContext<{
  streams: Record<string, MediaStream>;
  tick: number;
}>({ streams: {}, tick: 0 });

function useRemoteStream(userId: string | null): { stream: MediaStream | null; tick: number } {
  const { streams, tick } = useContext(StreamsContext);
  return { stream: userId ? (streams[userId] ?? null) : null, tick };
}

/** Индивидуальная громкость участников (0–150, хранится в localStorage). */
const VolumesContext = createContext<{
  volumes: Record<string, number>;
  setVolume: (userId: string, v: number) => void;
}>({ volumes: {}, setVolume: () => {} });

export default function CallStage(props: Props) {
  const { session, incoming, minimized, setMinimized, onInvite, notify, meId, onCopyLink } = props;
  const [showInvite, setShowInvite] = useState(false);
  const [copied, setCopied] = useState(false);
  /** Громкость каждого участника — переживает перезагрузку (пункт ТЗ №7). */
  const [volumes, setVolumes] = useState<Record<string, number>>(() => loadUserVolumes());
  const setVolume = useCallback((userId: string, v: number) => {
    setVolumes((all) => ({ ...all, [userId]: v }));
    saveUserVolume(userId, v);
  }, []);
  /** Сброс всех громкостей к 100% — на случай, если кто-то случайно
      скрутил ползунок в ноль и «звука нет». */
  const resetVolumes = useCallback(() => {
    setVolumes({});
    try {
      localStorage.removeItem("pulse_user_volumes_v1");
    } catch {
      /* ок */
    }
  }, []);
  const volumesValue = useMemo(() => ({ volumes, setVolume }), [volumes, setVolume]);

  const streamsValue = useMemo(
    () => ({ streams: props.remoteStreams, tick: props.streamTick }),
    [props.remoteStreams, props.streamTick],
  );

  const copyLink = async () => {
    const url = await onCopyLink();
    if (!url) {
      notify("Не удалось получить ссылку");
      return;
    }
    // Раньше ссылку получали, но НЕ записывали в буфер — из-за этого
    // «ссылка на звонок не копируется». Пишем сами + фолбэк на prompt.
    const ok = await copyToClipboard(url);
    if (!ok) {
      window.prompt("Скопируйте ссылку на звонок:", url);
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
    notify("Ссылка на звонок скопирована — отправьте её кому угодно");
  };

  return (
    <StreamsContext.Provider value={streamsValue}>
      <VolumesContext.Provider value={volumesValue}>
      <AnimatePresence>
        {!session && incoming && <IncomingPrompt key="incoming" {...props} />}
      </AnimatePresence>

      <AnimatePresence>
        {session && !minimized && (
          <CallWindow
            key="window"
            {...props}
            onResetVolumes={resetVolumes}
            onCopyLink={copyLink}
            onShareLink={props.onCopyLink}
            copied={copied}
            onOpenInvite={() => setShowInvite(true)}
            onMinimize={() => setMinimized(true)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {session && minimized && (
          <CallIsland key="island" {...props} onExpand={() => setMinimized(false)} />
        )}
      </AnimatePresence>

      {/* Звук участников живёт здесь — в одном экземпляре, независимо от того,
          развёрнуто окно, свёрнуто в «остров» или открыта мобильная версия.
          (Внутри плиток были бы дубли: окно рендерится дважды — desktop и mobile.)
          ВАЖНО: контейнер НЕ display:none — некоторые браузеры глушат медиа
          внутри скрытых контейнеров. Уводим его за экран позиционированием. */}
      {session && (
        <div className="pointer-events-none fixed -left-[9999px] top-0 h-px w-px overflow-hidden" aria-hidden>
          {session.participants.map((p) =>
            p.userId === meId ? null : <RemoteAudio key={p.userId} userId={p.userId} />,
          )}
        </div>
      )}

      <AnimatePresence>
        {showInvite && session && (
          <PeoplePicker
            key="invite"
            title="Добавить в звонок"
            hint="Человек увидит звонок во входящих и сможет присоединиться"
            excludeIds={session.participants.map((p) => p.userId).filter((id) => id !== meId)}
            confirmLabel="Позвать"
            onClose={() => setShowInvite(false)}
            onConfirm={async (list) => {
              const n = await onInvite(list.map((u) => u.id));
              notify(n > 0 ? `Приглашено в звонок: ${n}` : "Все уже в звонке");
            }}
          />
        )}
      </AnimatePresence>
      </VolumesContext.Provider>
    </StreamsContext.Provider>
  );
}

/* ─────────────────────────── входящий вызов ─────────────────────────── */

function IncomingPrompt({ incoming, starting, onAccept, onDecline, onDismissIncoming }: Props) {
  if (!incoming) return null;
  const isDmRing = incoming.status === "ringing";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[80] grid place-items-center bg-[#16181c]/80 p-4 backdrop-blur-md"
    >
      <motion.div
        initial={{ scale: 0.92, y: 24 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: 12 }}
        className="glass-strong w-full max-w-sm rounded-[1.8rem] p-7 text-center shadow-2xl"
      >
        <div className="relative mx-auto flex h-32 w-32 items-center justify-center">
          {isDmRing && (
            <>
              <span className="ring-pulse absolute h-32 w-32 rounded-full bg-white/15" />
              <span
                className="ring-pulse absolute h-32 w-32 rounded-full bg-white/10"
                style={{ animationDelay: "0.6s" }}
              />
            </>
          )}
          <Avatar name={incoming.conversationTitle} src={incoming.conversationAvatar} size={112} />
        </div>

        <h2 className="font-display mt-6 text-xl font-bold">{incoming.conversationTitle}</h2>
        <p className="mt-2 flex items-center justify-center gap-2 text-sm text-white/50">
          {isDmRing ? (
            <>
              <Volume2 className="h-4 w-4 text-slate-400" />
              Входящий {incoming.media === "video" ? "видеозвонок" : "аудиозвонок"}
              {incoming.host ? ` · ${incoming.host.displayName}` : ""}
            </>
          ) : (
            <>
              <Users className="h-4 w-4 text-emerald-300" />
              Идёт звонок · {incoming.participants.length} в комнате
            </>
          )}
        </p>

        {!isDmRing && incoming.participants.length > 0 && (
          <div className="mt-4 flex flex-wrap justify-center gap-1.5">
            {incoming.participants.slice(0, 6).map((p) => (
              <span
                key={p.userId}
                className="glass flex items-center gap-1.5 rounded-full py-1 pr-2.5 pl-1 text-xs"
              >
                <Avatar name={p.user.displayName} src={p.user.avatarUrl} size={20} />
                {p.user.displayName.split(" ")[0]}
              </span>
            ))}
          </div>
        )}

        <div className="mt-8 flex items-center justify-center gap-6">
          <button
            onClick={isDmRing ? onDecline : onDismissIncoming}
            className="flex h-16 w-16 items-center justify-center rounded-full bg-rose-500 text-white shadow-[0_10px_30px_-6px_rgba(244,63,94,0.6)] transition-transform hover:scale-105 active:scale-95"
            title={isDmRing ? "Отклонить" : "Не сейчас"}
          >
            <PhoneOff className="h-6 w-6" />
          </button>
          <button
            onClick={onAccept}
            disabled={starting}
            className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500 text-white shadow-[0_10px_30px_-6px_rgba(16,185,129,0.6)] transition-transform hover:scale-105 active:scale-95 disabled:opacity-60"
            title="Присоединиться"
          >
            <Phone className="h-6 w-6" />
          </button>
        </div>
        <p className="mt-4 text-[11px] text-white/30">
          {isDmRing ? "Принять или отклонить вызов" : "Присоединиться можно в любой момент"}
        </p>
      </motion.div>
    </motion.div>
  );
}

/* ─────────────────────────── активный звонок ─────────────────────────── */

type WindowProps = Omit<Props, "onCopyLink"> & {
  onCopyLink: () => void;
  /** Оригинальный генератор ссылки (для «открыть звонок в отдельном окне»). */
  onShareLink: () => Promise<string | null>;
  copied: boolean;
  onOpenInvite: () => void;
  onMinimize: () => void;
};

/** Позиция/размер окна звонка между сессиями (пункт ТЗ: «окно можно двигать»). */
const CALL_WINDOW_PREFS_KEY = "pulse_call_window_v1";

function loadCallWindowPrefs(): { pos: { x: number; y: number } | null; sizeKey: SizeKey } {
  try {
    const raw = localStorage.getItem(CALL_WINDOW_PREFS_KEY);
    if (!raw) return { pos: null, sizeKey: "md" };
    const p = JSON.parse(raw) as { pos?: { x: number; y: number }; sizeKey?: SizeKey };
    const sizeKey: SizeKey = p.sizeKey === "sm" || p.sizeKey === "lg" ? p.sizeKey : "md";
    const pos =
      p.pos && Number.isFinite(p.pos.x) && Number.isFinite(p.pos.y)
        ? { x: Math.max(8, p.pos.x), y: Math.max(8, p.pos.y) }
        : null;
    return { pos, sizeKey };
  } catch {
    return { pos: null, sizeKey: "md" };
  }
}

function saveCallWindowPrefs(pos: { x: number; y: number } | null, sizeKey: SizeKey): void {
  try {
    localStorage.setItem(CALL_WINDOW_PREFS_KEY, JSON.stringify({ pos, sizeKey }));
  } catch {
    /* ignore */
  }
}

function CallWindow(props: WindowProps) {
  const { session } = props;
  const prefs = useRef(loadCallWindowPrefs()).current;
  const [sizeKey, setSizeKey] = useState<SizeKey>(prefs.sizeKey);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(prefs.pos);
  /** Полноэкранный режим окна звонка (пункт ТЗ №8). */
  const [fullscreen, setFullscreen] = useState(false);
  const dragRef = useRef<{ dx: number; dy: number; pointerId: number } | null>(null);
  const windowRef = useRef<HTMLDivElement | null>(null);

  const size = SIZES[sizeKey];

  const clampPos = useCallback(
    (x: number, y: number) => {
      const w = typeof window !== "undefined" ? window.innerWidth : 1280;
      const h = typeof window !== "undefined" ? window.innerHeight : 800;
      const width = SIZES[sizeKey].w;
      const height = SIZES[sizeKey].h;
      return {
        x: Math.min(Math.max(8, x), Math.max(8, w - Math.min(width, w - 16) - 8)),
        y: Math.min(Math.max(8, y), Math.max(8, h - 56)),
      };
    },
    [sizeKey],
  );

  // Запоминаем позицию/размер — после перезагрузки окно останется там же.
  useEffect(() => {
    saveCallWindowPrefs(pos, sizeKey);
  }, [pos, sizeKey]);

  if (!session) return null;

  /** Захват перетаскивания: pointer capture, чтобы окно не «срывалось».
      В полноэкранном режиме перетаскивание не нужно. */
  const onHeaderPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (fullscreen) return;
    // Кнопки в шапке перетаскивание не начинают
    if ((e.target as HTMLElement).closest("button")) return;
    const rect = windowRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragRef.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top, pointerId: e.pointerId };
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* не поддерживается — сработает и без захвата */
    }
  };
  const onHeaderPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    setPos(clampPos(e.clientX - d.dx, e.clientY - d.dy));
  };
  const onHeaderPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    dragRef.current = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* уже отпущен */
    }
  };

  return (
    <>
      {/* Десктоп: отдельное плавающее окно звонка — двигается за шапку,
          меняет размер, сворачивается; чат остаётся доступным под ним. */}
      <motion.div
        ref={windowRef}
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ type: "spring", bounce: 0.18, duration: 0.4 }}
        className={`fixed z-[80] hidden overflow-hidden rounded-[1.6rem] border border-white/12 bg-[#1b1e24]/95 shadow-[0_40px_120px_-30px_rgba(0,0,0,1)] backdrop-blur-2xl md:flex md:flex-col ${
          fullscreen ? "inset-2" : ""
        }`}
        style={
          fullscreen
            ? { width: "auto", height: "auto" }
            : {
                width: size.w,
                height: size.h,
                left: pos ? pos.x : undefined,
                top: pos ? pos.y : undefined,
                right: pos ? undefined : 24,
                bottom: pos ? undefined : 24,
              }
        }
      >
        <div
          onPointerDown={onHeaderPointerDown}
          onPointerMove={onHeaderPointerMove}
          onPointerUp={onHeaderPointerUp}
          onPointerCancel={onHeaderPointerUp}
          onDoubleClick={() => setFullscreen((v) => !v)}
          style={{ touchAction: "none" }}
          className={`flex items-center gap-2 border-b border-white/8 px-4 py-2.5 select-none ${
            fullscreen ? "cursor-default" : "cursor-grab active:cursor-grabbing"
          }`}
        >
          <LiveDot />
          <p className="min-w-0 flex-1 truncate text-sm font-semibold">{session.title}</p>
          <span className="shrink-0 text-xs tabular-nums text-white/45">
            {formatDuration(props.seconds)}
          </span>
          <span className="glass flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] text-white/60">
            <Users className="h-3 w-3" />
            {session.participants.length}
          </span>
          <div className="flex shrink-0 items-center gap-0.5">
            {!fullscreen && (
              <IconBtn
                title="Размер окна"
                onClick={() => setSizeKey((k) => (k === "sm" ? "md" : k === "md" ? "lg" : "sm"))}
              >
                {sizeKey === "lg" ? (
                  <Shrink className="h-3.5 w-3.5" />
                ) : (
                  <Maximize2 className="h-3.5 w-3.5" />
                )}
              </IconBtn>
            )}
            <IconBtn
              title={fullscreen ? "Выйти из полноэкранного режима" : "На весь экран (двойной клик по шапке)"}
              onClick={() => setFullscreen((v) => !v)}
            >
              {fullscreen ? (
                <Minimize className="h-3.5 w-3.5" />
              ) : (
                <Maximize className="h-3.5 w-3.5" />
              )}
            </IconBtn>
            <IconBtn title="Свернуть — можно писать в чат" onClick={props.onMinimize}>
              <Minimize2 className="h-3.5 w-3.5" />
            </IconBtn>
            <IconBtn title="Выйти из звонка" onClick={props.onLeave}>
              <X className="h-3.5 w-3.5" />
            </IconBtn>
          </div>
        </div>

        {/* Состав комнаты в групповых звонках: кто в комнате, у кого выключен
            микрофон, там же — индивидуальная громкость каждого. */}
        {session.participants.length > 2 && (
          <ParticipantsStrip session={session} meId={props.meId} />
        )}

        <CallBody {...props} />
        <Controls {...props} compact />
      </motion.div>

      {/* Телефон: полноэкранный режим */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[80] flex flex-col bg-[#16181c]/97 backdrop-blur-xl md:hidden"
      >
        <div className="flex items-center gap-2 px-4 py-3">
          <LiveDot />
          <p className="min-w-0 flex-1 truncate text-sm font-semibold">{session.title}</p>
          <span className="text-xs tabular-nums text-white/45">{formatDuration(props.seconds)}</span>
          <span className="glass flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]">
            <Users className="h-3 w-3" />
            {session.participants.length}
          </span>
          <IconBtn title="Свернуть" onClick={props.onMinimize}>
            <Minimize2 className="h-4 w-4" />
          </IconBtn>
        </div>
        <CallBody {...props} />
        <Controls {...props} />
      </motion.div>
    </>
  );
}

function LiveDot() {
  return (
    <span className="relative flex h-2.5 w-2.5 shrink-0">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
    </span>
  );
}

/** Содержимое звонка: плитки с видео или список участников. */
function CallBody({
  session,
  meId,
  cameraOn,
  screenSharing,
  screenStreamRef,
  localStreamRef,
  remoteStreams,
  streamTick,
  onViewUser,
  connQuality,
  micLevelRef,
}: WindowProps) {
  const localVideoRef = useRef<HTMLVideoElement | null>(null);

  // Смена состояний дорожек (девку выключили → кадры перестали идти) НЕ
  // вызывает событие в React. Раз в секунду принудительно пересчитываем —
  // чёрная плитка демки у собеседника исчезает максимум через секунду.
  const [, forceRerender] = useState(0);
  useEffect(() => {
    const t = setInterval(() => forceRerender((v) => v + 1), 1_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (localVideoRef.current)
      localVideoRef.current.srcObject =
        (screenSharing ? screenStreamRef.current : localStreamRef.current) ?? null;
  }, [localStreamRef, screenStreamRef, screenSharing, cameraOn, streamTick, session?.id]);

  if (!session) return null;

  const people = session.participants;
  const userById: Record<string, PublicUser> = {};
  for (const p of people) userById[p.userId] = p.user;

  // У удалённого участника видео может прийти раньше, чем флаг videoOn (или флаг
  // рассинхронизировался) — плитки рисуем и по факту наличия видеодорожек.
  const hasRemoteVideo = (id: string) =>
    !!remoteStreams[id]?.getVideoTracks().some((t) => t.readyState === "live");
  const hasVideo = (p: CallParticipantInfo) =>
    p.userId === meId ? cameraOn || screenSharing : p.videoOn || p.screenOn || hasRemoteVideo(p.userId);

  const videoPeople = people.filter(hasVideo);
  const gridCols = videoPeople.length <= 1 ? 1 : videoPeople.length <= 4 ? 2 : 3;

  // Демонстрации экрана — большими плитками над сеткой.
  // Плитка живёт ТОЛЬКО пока в потоке есть живая дорожка, принимающая кадры:
  // когда владелец выключает демку, дорожка у собеседника перестаёт получать
  // кадры (становится muted/ended) — и чёрный экран исчезает у ВСЕХ.
  const hasLiveVideo = (s: MediaStream | null | undefined) =>
    !!s?.getVideoTracks().some((t) => t.readyState === "live" && !t.muted);
  const screenSharers = people.filter((p) => {
    if (p.userId === meId) return screenSharing && hasLiveVideo(screenStreamRef.current);
    return p.screenOn && hasLiveVideo(remoteStreams[p.userId]);
  });

  return (
    <div className="nice-scroll relative min-h-0 flex-1 overflow-y-auto p-3">
      {people.length <= 1 && (
        <div className="absolute inset-x-0 top-3 z-10 mx-auto w-fit max-w-[92%] rounded-xl border border-white/10 bg-[#1e2127]/90 px-4 py-2.5 text-center text-xs text-white/70 shadow-xl backdrop-blur">
          Вы одни в звонке — звук и видео появятся, когда войдёт второй
          участник. Позовите кого-нибудь кнопкой «Пригласить» внизу.
        </div>
      )}
      <MicStateBadge localStreamRef={localStreamRef} />
      {screenSharers.map((p) => (
        <div key={`screen-${p.userId}`} className="mb-2.5 last:mb-0">
          <ScreenTile
            participant={p}
            isMe={p.userId === meId}
            stream={p.userId === meId ? (screenStreamRef.current ?? null) : (remoteStreams[p.userId] ?? null)}
            tick={streamTick}
            onViewUser={onViewUser}
          />
        </div>
      ))}

      {videoPeople.length > 0 ? (
        <div
          className={`grid gap-2.5 ${screenSharers.length > 0 ? "mt-2.5" : ""}`}
          style={{ gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))` }}
        >
          {videoPeople
            .filter((p) => !screenSharers.some((s) => s.userId === p.userId))
            .map((p) => (
              <Tile
                key={p.userId}
                participant={p}
                isMe={p.userId === meId}
                localStream={localStreamRef.current ?? null}
                userById={userById}
                onViewUser={onViewUser}
                quality={connQuality?.[p.userId]}
              />
            ))}
        </div>
      ) : screenSharers.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
          <Avatar name={session.title} src={null} size={72} />
          <div>
            <p className="font-display text-lg font-bold">{session.title}</p>
            <p className="mt-1 text-xs text-white/40">
              {people.length <= 1
                ? "Пока только вы — поделитесь ссылкой на звонок"
                : `${people.length} в звонке · видео выключено`}
            </p>
          </div>
          {people.length > 0 && (
            <div className="flex max-w-full flex-wrap justify-center gap-2">
              {people.map((p) => (
                <span
                  key={p.userId}
                  className="glass flex items-center gap-2 rounded-full py-1 pr-1.5 pl-1 text-xs"
                >
                  <button
                    onClick={() => p.userId !== meId && onViewUser(p.user)}
                    className="flex min-w-0 items-center gap-2 transition-opacity hover:opacity-80"
                    title="Открыть профиль"
                  >
                    <Avatar name={p.user.displayName} src={p.user.avatarUrl} size={22} />
                    <span className="max-w-24 truncate">
                      {p.userId === meId ? "Вы" : p.user.displayName.split(" ")[0]}
                    </span>
                  </button>
                  {p.muted ? (
                    <MicOff className="h-3 w-3 shrink-0 text-rose-300" />
                  ) : (
                    <Mic className="h-3 w-3 shrink-0 text-emerald-300" />
                  )}
                  {/* Громкость доступна всегда — даже в чисто голосовом звонке */}
                  {p.userId !== meId && (
                    <VolumeControl userId={p.userId} name={p.user.displayName} />
                  )}
                </span>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {/* Подписи аудио-участников под видео-сеткой (с регулировкой громкости) */}
      {videoPeople.length > 0 && people.some((p) => !hasVideo(p)) && (
        <div className="mt-2.5 flex flex-wrap gap-2">
          {people
            .filter((p) => !hasVideo(p))
            .map((p) => (
              <span
                key={p.userId}
                className="glass flex items-center gap-2 rounded-full py-1 pr-1.5 pl-1 text-[11px]"
              >
                <Avatar name={p.user.displayName} src={p.user.avatarUrl} size={20} />
                {p.userId === meId ? "Вы" : p.user.displayName.split(" ")[0]}
                {p.muted && <MicOff className="h-3 w-3 shrink-0 text-rose-300" />}
                {p.userId !== meId && (
                  <VolumeControl userId={p.userId} name={p.user.displayName} />
                )}
              </span>
            ))}
        </div>
      )}

      {(cameraOn || screenSharing) && (
        <div className="glass-strong pointer-events-none absolute right-4 bottom-4 aspect-[3/4] w-24 overflow-hidden rounded-xl">
          <video ref={localVideoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
        </div>
      )}
    </div>
  );
}

/** Большая плитка демонстрации экрана. */
function ScreenTile({
  participant,
  isMe,
  stream,
  tick,
  onViewUser,
}: {
  participant: CallParticipantInfo;
  isMe: boolean;
  stream: MediaStream | null;
  tick: number;
  onViewUser: (u: PublicUser) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [fs, setFs] = useState(false);
  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream ?? null;
  }, [stream, tick]);

  // Полноэкранный режим демо (как в Discord): разворачивается весь блок
  useEffect(() => {
    const onChange = () => setFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = () => {
    const el = boxRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void el.requestFullscreen().catch(() => {});
  };

  return (
    <div
      ref={boxRef}
      // Компактный размер как в Discord: не во всю ширину окна, а аккуратным
      // «экраном» по центру; по кнопке разворачивается на весь экран.
      className={`relative overflow-hidden rounded-2xl bg-black/80 ring-1 ring-emerald-400/25 ${
        fs ? "h-full w-full" : "mx-auto aspect-video w-full max-w-2xl"
      }`}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="h-full w-full object-contain"
      />
      <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-black/80 to-transparent px-3 py-2">
        <MonitorUp className="h-3.5 w-3.5 shrink-0 text-emerald-300" />
        <button
          onClick={() => !isMe && onViewUser(participant.user)}
          className="min-w-0 truncate text-left text-xs font-medium"
        >
          {isMe ? "Вы демонстрируете экран" : `Экран · ${participant.user.displayName}`}
        </button>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {!isMe && <VolumeControl userId={participant.userId} name={participant.user.displayName} />}
          <button
            onClick={toggleFullscreen}
            title={fs ? "Выйти из полноэкранного режима" : "На весь экран"}
            className="grid h-7 w-7 place-items-center rounded-lg bg-white/10 text-white/85 transition-colors hover:bg-white/20"
          >
            {fs ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Панель настроек звука прямо во время звонка:
 * шумоподавление / эхоподавление / автоусиление + порог активации голоса
 * (чувствительность микрофона) с живым индикатором уровня.
 * Изменения применяются на лету — без разрыва соединения.
 */
function AudioSettingsPanel({
  micLevelRef,
  onApply,
  onClose,
}: {
  micLevelRef: React.RefObject<number>;
  onApply: (s: AudioSettings) => void;
  onClose: () => void;
}) {
  const [settings, setSettings] = useState<AudioSettings>(() => loadAudioSettings());
  const [level, setLevel] = useState(0);
  const applyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Индикатор уровня микрофона
  useEffect(() => {
    const t = setInterval(() => setLevel(micLevelRef.current ?? 0), 120);
    return () => clearInterval(t);
  }, [micLevelRef]);

  useEffect(() => {
    return () => {
      if (applyTimer.current) clearTimeout(applyTimer.current);
    };
  }, []);

  const update = (patch: Partial<AudioSettings>) => {
    setSettings((s) => {
      const next = { ...s, ...patch };
      // Дебаунс: пересборка аудиодорожки — не на каждый пиксель ползунка.
      if (applyTimer.current) clearTimeout(applyTimer.current);
      applyTimer.current = setTimeout(() => onApply(next), 350);
      return next;
    });
  };

  return (
    // max-h + скролл: даже в переполненном групповом звонке панель всегда
    // умещается на экране и кнопка настроек звука не «уезжает».
    <div
      className="glass-strong nice-scroll absolute bottom-full left-1/2 z-40 mb-3 max-h-[min(26rem,62vh)] w-72 -translate-x-1/2 overflow-y-auto rounded-2xl p-4 shadow-2xl"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="mb-3 flex items-center justify-between">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <AudioLines className="h-4 w-4 text-slate-400" />
          Настройки звука
        </p>
        <button
          onClick={onClose}
          className="rounded-full bg-white/10 p-1 text-white/70 transition-colors hover:bg-white/20"
          title="Закрыть"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="space-y-3">
        {(
          [
            ["noiseSuppression", "Шумоподавление", "Убирает фоновый шум"],
            ["echoCancellation", "Эхоподавление", "Гасит эхо из динамиков"],
            ["autoGainControl", "Автоусиление", "Выравнивает громкость голоса"],
          ] as const
        ).map(([key, label, hint]) => (
          <button
            key={key}
            onClick={() => update({ [key]: !settings[key] } as Partial<AudioSettings>)}
            className="flex w-full items-center gap-2.5 text-left"
          >
            <span
              className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
                settings[key] ? "bg-[#5865f2]" : "bg-white/15"
              }`}
            >
              <span
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${
                  settings[key] ? "left-[18px]" : "left-0.5"
                }`}
              />
            </span>
            <span className="min-w-0">
              <span className="block text-xs font-medium">{label}</span>
              <span className="block text-[10px] leading-tight text-white/35">{hint}</span>
            </span>
          </button>
        ))}

        <div>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="font-medium">Порог активации голоса</span>
            <span className="tabular-nums text-white/45">
              {settings.voiceGate === 0 ? "выкл" : `${settings.voiceGate}%`}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={settings.voiceGate}
            onChange={(e) => update({ voiceGate: Number(e.target.value) })}
            className="w-full accent-[#5865f2]"
          />
          <p className="mt-1 text-[10px] leading-tight text-white/35">
            Микрофон открывается только для голоса громче порога — фон не попадает в звонок.
            0 — выключено.
          </p>
        </div>

        {/* Индикатор микрофона: ВЕРХНЯЯ полоса — порог, с которого вас
            слышно (порог активации голоса), НИЖНЯЯ — ваш живой уровень звука.
            Когда нижняя дорастает до верхней — микрофон открыт. */}
        <div>
          <p className="mb-1 text-[10px] uppercase tracking-wide text-white/35">Уровень микрофона</p>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="w-14 shrink-0 text-[9px] text-white/30">порог</span>
              <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-amber-400/80 to-amber-300/80 transition-[width] duration-150"
                  style={{ width: `${settings.voiceGate}%` }}
                />
              </div>
              <span className="w-9 shrink-0 text-right text-[9px] tabular-nums text-white/35">
                {settings.voiceGate}%
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-14 shrink-0 text-[9px] text-white/30">голос</span>
              <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                <div
                  className={`h-full rounded-full transition-[width] duration-100 ${
                    settings.voiceGate > 0 && level >= settings.voiceGate
                      ? "bg-gradient-to-r from-emerald-400 to-emerald-300"
                      : "bg-gradient-to-r from-emerald-400 via-[#6a76f4] to-[#7289da]"
                  }`}
                  style={{ width: `${Math.min(100, level)}%` }}
                />
              </div>
              <span className="w-9 shrink-0 text-right text-[9px] tabular-nums text-white/35">
                {Math.min(100, Math.round(level))}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Индикатор захвата микрофона: полоска живёт от уровня в реальном времени.
    Если при разговоре она НЕ двигается — браузер не отдаёт микрофон
    (нет разрешения/устройство занято), и проблема на стороне захвата. */
function MicMeter({ micLevelRef }: { micLevelRef: React.RefObject<number> }) {
  const [lvl, setLvl] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setLvl(micLevelRef.current ?? 0), 150);
    return () => clearInterval(t);
  }, [micLevelRef]);
  return (
    <span className="flex flex-col items-center gap-0.5" title="Уровень вашего микрофона">
      <span className="h-1.5 w-12 overflow-hidden rounded-full bg-white/10">
        <span
          className="block h-full rounded-full bg-gradient-to-r from-emerald-400 to-[#7289da] transition-[width] duration-150"
          style={{ width: `${Math.min(100, lvl)}%` }}
        />
      </span>
      <span className="text-[8px] leading-none text-white/30">микрофон</span>
    </span>
  );
}

/** Статус собственного микрофона: если потока нет (режим прослушивания),
    показываем заметный бейдж — иначе пользователь не понимает, почему
    «слышно одного, а другого нет». */
function MicStateBadge({
  localStreamRef,
}: {
  localStreamRef: React.RefObject<MediaStream | null>;
}) {
  const [hasMic, setHasMic] = useState(true);
  useEffect(() => {
    const t = setInterval(() => {
      const s = localStreamRef.current;
      setHasMic(!!s && s.getAudioTracks().some((tr) => tr.readyState === "live"));
    }, 1_000);
    return () => clearInterval(t);
  }, [localStreamRef]);
  if (hasMic) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-14 z-20 mx-auto w-fit max-w-[94%] rounded-xl border border-rose-300/30 bg-rose-500/15 px-3 py-2 text-center text-[11px] text-rose-200 backdrop-blur">
      Вас не слышно: нет доступа к микрофону. Нажмите на значок микрофона в
      адресной строке браузера и разрешите доступ (или откройте сайт в обычной
      вкладке).
    </div>
  );
}

function Controls({
  muted,
  cameraOn,
  screenSharing,
  onToggleMute,
  onToggleCamera,
  onToggleScreenShare,
  onCopyLink,
  copied,
  onOpenInvite,
  onLeave,
  onEndForAll,
  session,
  meId,
  compact,
  onApplyAudioSettings,
  onReconnectMedia,
  onShareLink,
  notify,
  micLevelRef,
  audioWatchdog,
  onResetVolumes,
}: WindowProps & { compact?: boolean }) {
  const [audioPanel, setAudioPanel] = useState(false);

  return (
    <div
      className={`relative flex flex-wrap items-center justify-center border-t border-white/8 ${
        compact ? "gap-2 px-3 py-2.5" : "gap-3 px-4 py-5"
      }`}
    >
      {audioPanel && (
        <AudioSettingsPanel
          micLevelRef={micLevelRef}
          onApply={onApplyAudioSettings}
          onClose={() => setAudioPanel(false)}
        />
      )}
      <Control
        small={compact}
        active={muted}
        onClick={onToggleMute}
        title={muted ? "Включить микрофон" : "Выключить микрофон"}
      >
        {muted ? <MicOff className="h-4.5 w-4.5" /> : <Mic className="h-4.5 w-4.5" />}
      </Control>
      {/* Живой уровень микрофона — сразу видно, ловится ли голос */}
      {!compact && <MicMeter micLevelRef={micLevelRef} />}
      <Control
        small={compact}
        active={!cameraOn}
        onClick={onToggleCamera}
        title={cameraOn ? "Выключить камеру" : "Включить камеру"}
      >
        {cameraOn ? <Video className="h-4.5 w-4.5" /> : <VideoOff className="h-4.5 w-4.5" />}
      </Control>
      <Control
        small={compact}
        active={screenSharing}
        onClick={onToggleScreenShare}
        title={screenSharing ? "Прекратить демонстрацию экрана" : "Демонстрировать экран"}
      >
        {screenSharing ? (
          <MonitorOff className="h-4.5 w-4.5" />
        ) : (
          <MonitorUp className="h-4.5 w-4.5" />
        )}
      </Control>
      <Control
        small={compact}
        onClick={onCopyLink}
        title={copied ? "Ссылка скопирована" : "Скопировать ссылку на звонок"}
      >
        {copied ? <Check className="h-4.5 w-4.5 text-emerald-300" /> : <Copy className="h-4.5 w-4.5" />}
      </Control>
      <Control small={compact} onClick={onOpenInvite} title="Добавить человека в звонок">
        <UserPlus className="h-4.5 w-4.5" />
      </Control>
      <Control
        small={compact}
        active={audioPanel}
        onClick={() => setAudioPanel((v) => !v)}
        title="Настройки звука: шумоподавление, чувствительность микрофона"
      >
        <AudioLines className="h-4.5 w-4.5" />
      </Control>
      <Control
        small={compact}
        onClick={() => {
          // Звонок в отдельном окне браузера — не зависит от этой вкладки:
          // новое окно заходит в тот же звонок по ссылке, а эта вкладка
          // через пару секунд передаёт эстафету и выходит.
          void (async () => {
            const url = await onShareLink();
            if (!url) {
              notify("Не удалось получить ссылку на звонок");
              return;
            }
            const w = window.open(url, "pulse-call", "popup,width=980,height=720");
            if (!w) {
              notify("Браузер заблокировал окно — разрешите всплывающие окна для сайта");
              return;
            }
            notify("Звонок открывается в отдельном окне…");
            setTimeout(() => onLeave(), 4_000);
          })();
        }}
        title="Открыть звонок в отдельном окне (переживёт закрытие вкладки)"
      >
        <ExternalLink className="h-4.5 w-4.5" />
      </Control>
      <button
        onClick={onLeave}
        title="Выйти из звонка"
        className={`flex items-center justify-center rounded-full bg-rose-500 text-white transition-transform hover:scale-105 active:scale-95 ${
          compact ? "h-10 w-10" : "h-12 w-12"
        }`}
      >
        <PhoneOff className={compact ? "h-4 w-4" : "h-5 w-5"} />
      </button>
      {session && session.participants.length > 1 && session.hostId === meId && (
        <button
          onClick={onEndForAll}
          title="Завершить звонок для всех"
          className="glass flex h-10 items-center gap-1.5 rounded-full px-3 text-[11px] text-white/70 transition-colors hover:text-rose-300"
        >
          <X className="h-3.5 w-3.5" /> для всех
        </button>
      )}
    </div>
  );
}

/** Лента участников группового звонка: аватары, статус микрофона, громкость. */
function ParticipantsStrip({ session, meId }: { session: CallSession; meId: string }) {
  return (
    <div className="nice-scroll flex shrink-0 items-center gap-1.5 overflow-x-auto border-b border-white/6 px-3 py-2">
      {session.participants.map((p) => {
        const isMe = p.userId === meId;
        return (
          <span
            key={p.userId}
            className="glass flex shrink-0 items-center gap-1.5 rounded-full py-0.5 pr-1.5 pl-1 text-[11px] text-white/75"
            title={p.user.displayName}
          >
            <Avatar name={p.user.displayName} src={p.user.avatarUrl} size={20} />
            <span className="max-w-20 truncate">{isMe ? "Вы" : p.user.displayName.split(" ")[0]}</span>
            {p.muted && <MicOff className="h-3 w-3 shrink-0 text-rose-300" />}
            {p.videoOn && <Video className="h-3 w-3 shrink-0 text-emerald-300" />}
            {p.screenOn && <MonitorUp className="h-3 w-3 shrink-0 text-emerald-300" />}
            {!isMe && <VolumeControl userId={p.userId} name={p.user.displayName} />}
          </span>
        );
      })}
    </div>
  );
}

/** Ползунок индивидуальной громкости участника (0–150%). */
function VolumeControl({ userId, name }: { userId: string; name: string }) {
  const { volumes, setVolume } = useContext(VolumesContext);
  const volume = volumes[userId] ?? 100;
  const [open, setOpen] = useState(false);

  return (
    <span className="relative flex items-center" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => setOpen((v) => !v)}
        title={`Громкость · ${name}`}
        className={`flex h-6 w-6 items-center justify-center rounded-full transition-colors hover:bg-white/15 ${
          volume === 0 ? "text-rose-300" : "text-white/70"
        }`}
      >
        <Volume2 className="h-3.5 w-3.5" />
      </button>
      {open && (
        <span className="glass-strong absolute bottom-8 right-0 z-30 flex w-40 items-center gap-2 rounded-xl px-2.5 py-2 shadow-xl">
          <input
            type="range"
            min={0}
            max={150}
            step={5}
            value={Math.min(150, Math.round(volume))}
            onChange={(e) => setVolume(userId, Number(e.target.value))}
            className="w-full accent-[#5865f2]"
          />
          <span className="w-8 shrink-0 text-right text-[10px] tabular-nums text-white/60">
            {Math.round(volume)}%
          </span>
        </span>
      )}
    </span>
  );
}

/* ─────────────────── плитка участника (видео + звук) ─────────────────── */

function Tile({
  participant,
  isMe,
  localStream,
  userById,
  onViewUser,
  quality,
}: {
  participant: CallParticipantInfo;
  isMe: boolean;
  localStream: MediaStream | null;
  userById: Record<string, PublicUser>;
  onViewUser: (u: PublicUser) => void;
  /** Уровень связи с участником (0–3). */
  quality?: number;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const { stream: remote, tick } = useRemoteStream(participant.userId);
  const src = isMe ? localStream : remote;

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = src ?? null;
  }, [src, tick]);

  const user = userById[participant.userId];

  return (
    <div className="relative min-h-32 overflow-hidden rounded-2xl bg-black/50 ring-1 ring-white/10">
      {/* Видео всегда без звука: звук участника играет один <RemoteAudio>,
          иначе при развёрнутом окне голос дублировался бы (видео + аудио). */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="h-full max-h-[46vh] w-full object-cover"
      />
      <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-black/75 to-transparent px-3 py-2">
        <button
          onClick={() => user && !isMe && onViewUser(user)}
          className="flex min-w-0 items-center gap-1.5 text-left"
          title={isMe ? undefined : "Открыть профиль"}
        >
          <span className="truncate text-xs font-medium">
            {isMe ? "Вы" : participant.user.displayName}
          </span>
        </button>
        {/* Уровень связи с участником (пинг + потери пакетов) */}
        {!isMe && <SignalBars quality={quality} />}
        {participant.muted && <MicOff className="h-3 w-3 shrink-0 text-rose-300" />}
        {participant.guest && !isMe && (
          <span className="shrink-0 rounded-full bg-white/10 px-1.5 text-[10px] text-white/50">
            гость
          </span>
        )}
        {/* Индивидуальная громкость — только для собеседников */}
        {!isMe && (
          <span className="ml-auto shrink-0">
            <VolumeControl userId={participant.userId} name={participant.user.displayName} />
          </span>
        )}
      </div>
    </div>
  );
}

/* ─────────────────── «динамический остров» ─────────────────── */

function CallIsland({
  session,
  seconds,
  muted,
  meId,
  onExpand,
  onToggleMute,
  onLeave,
}: Props & { onExpand: () => void }) {
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const offset = useRef<{ dx: number; dy: number } | null>(null);
  const moved = useRef(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const speaker = useMemo(
    () => session?.participants.find((p) => p.userId !== meId && p.videoOn) ?? null,
    [session, meId],
  );
  const { stream: remote, tick } = useRemoteStream(speaker?.userId ?? null);

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = remote ?? null;
  }, [remote, tick]);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const o = offset.current;
      if (!o) return;
      moved.current = true;
      setDrag({ x: e.clientX - o.dx, y: e.clientY - o.dy });
    };
    const onUp = () => {
      offset.current = null;
      setTimeout(() => (moved.current = false), 60);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);

  if (!session) return null;
  const count = session.participants.length;
  const first = session.participants.find((p) => p.userId !== meId) ?? session.participants[0];

  return (
    <motion.div
      initial={{ opacity: 0, y: -24, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -20, scale: 0.92 }}
      transition={{ type: "spring", bounce: 0.25, duration: 0.45 }}
      className="fixed z-[80] select-none"
      style={drag ? { left: drag.x, top: drag.y } : { right: 16, top: 16 }}
    >
      <div
        onPointerDown={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          offset.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
        }}
        onClick={() => {
          if (!moved.current) onExpand();
        }}
        className="glass-strong flex cursor-grab items-center gap-3 rounded-[1.4rem] p-2 pl-2.5 shadow-[0_20px_60px_-20px_rgba(0,0,0,1)] active:cursor-grabbing"
      >
        <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-2xl bg-black/50">
          {speaker && remote ? (
            <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Avatar
                name={first?.user.displayName ?? session.title}
                src={first?.user.avatarUrl ?? null}
                size={40}
              />
            </div>
          )}
          <span className="absolute right-1 bottom-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-black/70 px-1 text-[10px] font-bold">
            {count}
          </span>
        </div>

        <div className="min-w-0">
          <p className="max-w-40 truncate text-[13px] font-semibold">{session.title}</p>
          <p className="flex items-center gap-1.5 text-[11px] text-emerald-300">
            <LiveDot />
            {formatDuration(seconds)}
          </p>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleMute();
            }}
            title={muted ? "Включить микрофон" : "Выключить микрофон"}
            className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors ${
              muted ? "bg-white text-black" : "glass text-white/80"
            }`}
          >
            {muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onExpand();
            }}
            title="Развернуть звонок"
            className="glass flex h-9 w-9 items-center justify-center rounded-full text-white/80"
          >
            <Expand className="h-4 w-4" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onLeave();
            }}
            title="Выйти из звонка"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-rose-500 text-white"
          >
            <PhoneOff className="h-4 w-4" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

/* ─────────────── звук участника (живёт независимо от плиток) ─────────────── */

/**
 * Звук участника через WebAudio с индивидуальной громкостью (0–150%).
 * Поток: MediaStreamSource → GainNode → динамики. Если WebAudio недоступен —
 * обычный <audio> как фолбэк.
 */
function RemoteAudio({ userId }: { userId: string }) {
  const { stream, tick } = useRemoteStream(userId);
  const { volumes } = useContext(VolumesContext);
  const volume = volumes[userId] ?? 100;
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const graphRef = useRef<{ src: MediaStreamAudioSourceNode; gain: GainNode } | null>(null);

  /* ЗВУК УЧАСТНИКА. Главный путь — обычный <audio>, самый надёжный в
     браузерах: он не зависит от состояния AudioContext (замороженный
     контекст раньше делал звонок немым, и «лечилось» это случайно).
     WebAudio используется ТОЛЬКО если пользователь поставил громкость
     выше 100% или ниже 100% нестандартно.
     Пересборка — при любом изменении потока/дорожек. */
  useEffect(() => {
    const teardownGraph = () => {
      try {
        graphRef.current?.src.disconnect();
        graphRef.current?.gain.disconnect();
      } catch {
        /* уже отключены */
      }
      graphRef.current = null;
    };
    teardownGraph();

    const el = audioRef.current;
    if (!stream || stream.getAudioTracks().length === 0) {
      if (el) el.srcObject = null;
      return;
    }

    const useWebAudio = volume !== 100;
    let watch: ReturnType<typeof setInterval> | null = null;

    const playPlain = () => {
      if (!audioRef.current) return;
      // Клонируем поток: если дорожки добавились после первой привязки,
      // элемент надо «переподключить», иначе он продолжит молчать.
      const fresh = new MediaStream(stream.getTracks());
      audioRef.current.srcObject = fresh;
      audioRef.current.volume = Math.min(1, Math.max(0, volume / 100));
      void audioRef.current.play().catch(() => {
        // Автоплей заблокирован — доиграем по первому жесту пользователя
        const retry = () => {
          void audioRef.current?.play().catch(() => {});
          window.removeEventListener("pointerdown", retry, true);
          window.removeEventListener("keydown", retry, true);
        };
        window.addEventListener("pointerdown", retry, true);
        window.addEventListener("keydown", retry, true);
      });
    };

    if (useWebAudio) {
      const ctx = getAudioContext();
      if (ctx) {
        try {
          const src = ctx.createMediaStreamSource(stream);
          const gain = ctx.createGain();
          gain.gain.value = Math.max(0, volume) / 100;
          src.connect(gain).connect(ctx.destination);
          graphRef.current = { src, gain };
          if (ctx.state !== "running") void ctx.resume().catch(() => {});
          // Пока контекст не побежал — играем через <audio> как основной путь
          const check = () => {
            if (ctx.state === "running") {
              if (audioRef.current) audioRef.current.srcObject = null;
              if (watch) {
                clearInterval(watch);
                watch = null;
              }
            } else {
              void ctx.resume().catch(() => {});
              playPlain();
            }
          };
          check();
          if (watch === null && ctx.state !== "running") watch = setInterval(check, 600);
          return () => {
            if (watch) clearInterval(watch);
            teardownGraph();
          };
        } catch {
          /* WebAudio не завёлся — играем через <audio> */
        }
      }
    }

    playPlain();
    return () => {
      if (watch) clearInterval(watch);
      teardownGraph();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stream, tick, stream ? stream.getAudioTracks().length : 0, volume === 100]);

  // Громкость меняется мгновенно, без пересборки.
  useEffect(() => {
    const g = graphRef.current;
    if (g) g.gain.gain.value = Math.max(0, volume) / 100;
    if (audioRef.current) audioRef.current.volume = Math.min(1, Math.max(0, volume / 100));
  }, [volume]);

  return <audio ref={audioRef} autoPlay playsInline className="pointer-events-none opacity-0" />;
}

/* ─────────────────────────── мелочи ─────────────────────────── */

function IconBtn({
  children,
  onClick,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      onPointerDown={(e) => e.stopPropagation()}
      className="flex h-7 w-7 items-center justify-center rounded-full text-white/50 transition-colors hover:bg-white/10 hover:text-white"
    >
      {children}
    </button>
  );
}

function Control({
  children,
  onClick,
  active,
  title,
  small,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  title: string;
  small?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`flex items-center justify-center rounded-full transition-all hover:scale-105 active:scale-95 ${
        small ? "h-10 w-10" : "h-12 w-12"
      } ${active ? "bg-white text-black" : "glass text-white/80"}`}
    >
      {children}
    </button>
  );
}
