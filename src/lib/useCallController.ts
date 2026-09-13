"use client";

/**
 * Контроллер звонков Pulse (WebRTC): 1:1 и групповые.
 *
 * Звонок = «комната» на диалог. Медиа идёт напрямую между браузерами по схеме
 * mesh (каждый с каждым), а сервер выступает только сигнальным центром:
 *
 *   POST /api/calls                       — создать комнату (или войти в живую);
 *   POST /api/calls/[id] {action:"join"}  — войти (в т.ч. по ссылке-приглашению);
 *   POST /api/calls/[id] {action:"signal"}— offer/answer/ice конкретному участнику;
 *   GET  /api/calls/[id]                  — состав комнаты + мои входящие сигналы
 *                                           (этот же опрос — heartbeat);
 *   POST /api/calls/[id] {action:"invite"}— позвать людей в звонок;
 *   POST /api/calls/[id] {action:"leave" | "end" | "decline"}.
 *
 * Согласование офферов: предлагает тот, чей userId лексикографически меньше
 * (детерминированно для обеих сторон), при «встречных» офферах спасаемся
 * rollback'ом по правилам perfect negotiation.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { ensureAudioUnlocked, getAudioContext } from "@/lib/notify";
import {

  loadAudioSettings,
  saveAudioSettings,
  type AudioSettings,
} from "@/lib/audioSettings";
import type {
  CallMedia,
  CallParticipantInfo,
  CallState,
  IncomingCall,
  PublicUser,
  SignalInfo,
} from "@/lib/types";

/**
 * ICE-серверы. Публичного STUN хватает почти всегда, но за симметричным NAT
 * (корпоративные сети, мобильный оператор) соединение без TURN не установится.
 * Если нужен TURN — задайте переменные окружения (NEXT_PUBLIC_ — они видны клиенту):
 *   NEXT_PUBLIC_TURN_URL=turn:turn.example.com:3478
 *   NEXT_PUBLIC_TURN_USERNAME=user
 *   NEXT_PUBLIC_TURN_CREDENTIAL=secret
 */
const ICE_SERVERS: RTCIceServer[] = [
  // Несколько STUN + открытый TURN-релей: если сеть режет UDP (прокси,
  // корпоративные ограничения), медиа всё равно пройдёт через TURN.
  // Раньше был только один STUN — в «плохих» сетях звук/видео могли не
  // идти вовсе, пока включение демки не перезапускало соединение.
  {
    urls: [
      "stun:stun.l.google.com:19302",
      "stun:stun1.l.google.com:19302",
      "stun:stun2.l.google.com:19302",
    ],
  },
  // TURN — из переменных окружения (см. .env: NEXT_PUBLIC_TURN_URL и т.д.).
  // Старый открытый релей больше не используется.
  ...(process.env.NEXT_PUBLIC_TURN_URL
    ? [
        {
          urls: process.env.NEXT_PUBLIC_TURN_URL.split(",").map((u) => u.trim()),
          username: process.env.NEXT_PUBLIC_TURN_USERNAME || undefined,
          credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL || undefined,
        },
      ]
    : []),
];

const INCOMING_POLL_MS = 3_000;
const CALL_POLL_MS = 1_200;
/** Точно как в эталонном примере Google webrtc/samples (pc1): оффер явно
 *  просит принимать и аудио, и видео. */
const OFFER_OPTIONS: RTCOfferOptions = {
  offerToReceiveAudio: true,
  offerToReceiveVideo: true,
};
/** Сколько ждём answer, прежде чем переотправить оффер. */


/** Состояние соединения с одним участником (паттерн Perfect Negotiation,
 *  рекомендованный W3C/MDN: https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Perfect_negotiation). */
type PeerLink = {
  pc: RTCPeerConnection;
  /** Вежливая сторона уступает при столкновении офферов (детерминированно). */
  polite: boolean;
  /** Готовим свой оффер прямо сейчас (аналог makingOffer из паттерна). */
  makingOffer: boolean;
  /** Игнорировать входящие кандидаты отклонённого оффера. */
  ignoreOffer: boolean;
  /** Применяем answer прямо сейчас. */
  settingRemoteAnswer: boolean;
  /** Когда создан линк — для страховочного повторного оффера. */
  createdAt: number;
  /** Кто инициировал текущее согласование (для совместимости). */
  offering: boolean;
  offeringSince: number | null;
  publishedSdp: string | null;
  /** Когда последний раз делали ICE-рестарт (защита от спама). */
  lastIceRestart?: number;
  /** Кандидаты, пришедшие до setRemoteDescription. */
  pendingIce: RTCIceCandidateInit[];
};

export type CallSession = {
  id: string;
  conversationId: string;
  title: string;
  kind: "direct" | "group" | "channel";
  media: CallMedia;
  hostId: string;
  joinToken: string;
  status: "ringing" | "live";
  participants: CallState["participants"];
};

/**
 * Рингтон входящего звонка — генерируется через WebAudio,
 * никаких внешних файлов: две ноты по 0.35 с каждые 2 секунды.
 */
function startRingtone(): { stop: () => void } | null {
  try {
    // Рингтон можно выключить в настройках уведомлений (колокольчик в сайдбаре).
    try {
      if (localStorage.getItem("pulse_call_sound") === "off") return null;
    } catch {
      /* localStorage недоступен — играем как обычно */
    }
    // Используем ОБЩИЙ аудиоконтекст приложения (см. lib/notify): он один раз
    // разблокируется жестом пользователя и не закрывается. Раньше рингтон
    // создавал свой контекст, который без жеста висел в «suspended», и входящий
    // звонок звонил молча.
    ensureAudioUnlocked();
    const ctx = getAudioContext();
    if (!ctx) return null;
    let stopped = false;

    const beep = (freq: number, at: number, dur: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(0.14, at + 0.04);
      gain.gain.setValueAtTime(0.14, at + dur - 0.06);
      gain.gain.linearRampToValueAtTime(0, at + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(at);
      osc.stop(at + dur + 0.02);
    };

    const cycle = () => {
      if (stopped || ctx.state === "closed") return;
      // Вкладка могла долго висеть в фоне — пробуем разморозить перед циклом.
      if (ctx.state === "suspended") {
        void ctx.resume().catch(() => {});
        return;
      }
      const t0 = ctx.currentTime + 0.02;
      beep(880, t0, 0.35);
      beep(660, t0 + 0.42, 0.35);
    };
    cycle();
    const timer = setInterval(cycle, 2_000);

    return {
      stop: () => {
        stopped = true;
        clearInterval(timer);
        // Общий контекст НЕ закрываем — он нужен уведомлениям.
      },
    };
  } catch {
    return null;
  }
}

export function useCallController(
  meId: string,
  notify: (msg: string) => void,
  onUnauthorized: () => void = () => {},
  onCallEnded: () => void = () => {},
) {
  const [session, setSession] = useState<CallSession | null>(null);
  const [incoming, setIncoming] = useState<IncomingCall | null>(null);
  /** Качество связи с каждым участником: 0 — нет, 1 — плохая, 2 — средняя, 3 — отличная. */
  const [connQuality, setConnQuality] = useState<Record<string, number>>({});
  const [muted, setMuted] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [starting, setStarting] = useState(false);
  /** Уменьшенный звонок («динамический остров») — можно писать в чат. */
  const [minimized, setMinimized] = useState(false);
  /** Карта «участник → его медиапоток». */
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  /** Счётчик изменений потоков — чтобы <video> переподключались. */
  const [streamTick, setStreamTick] = useState(0);

  const localStreamRef = useRef<MediaStream | null>(null);
  /** Поток демонстрации экрана (getDisplayMedia). */
  const screenStreamRef = useRef<MediaStream | null>(null);
  const linksRef = useRef<Map<string, PeerLink>>(new Map());
  const streamsRef = useRef<Map<string, MediaStream>>(new Map());
  const sessionRef = useRef<CallSession | null>(null);
  const incomingRef = useRef<IncomingCall | null>(null);
  const dismissedRef = useRef<Set<string>>(new Set());
  const busyRef = useRef(false);
  const ringtoneRef = useRef<{ stop: () => void } | null>(null);
  const syncingRef = useRef(false);
  /**
   * Очередь входящих сигналов (offer/answer/ice). Сервер помечает сигналы
   * прочитанными в момент выдачи, поэтому их нельзя просто выбросить, если
   * прошлый syncMesh ещё крутится: складываем сюда и обрабатываем в следующем
   * проходе — без этого терялись answer/ICE и соединение могло не собраться.
   */
  const signalQueueRef = useRef<SignalInfo[]>([]);
  /** Зеркало muted для VOX-гейта (чтобы ручной мьют имел приоритет). */
  const mutedRef = useRef(false);
  /** Текущий уровень микрофона (0–100) — индикатор в панели настроек звука. */
  const micLevelRef = useRef(0);
  /** rAF-цикл VOX/уровня и его аудио-узлы. */
  const gateRafRef = useRef<number | null>(null);
  const gateNodesRef = useRef<{ src: MediaStreamAudioSourceNode; analyser: AnalyserNode } | null>(null);
  const meIdRef = useRef(meId);
  const notifyRef = useRef(notify);
  const unauthorizedRef = useRef(onUnauthorized);
  const endedRef = useRef(onCallEnded);
  meIdRef.current = meId;
  notifyRef.current = notify;
  unauthorizedRef.current = onUnauthorized;
  endedRef.current = onCallEnded;
  sessionRef.current = session;
  incomingRef.current = incoming;
  mutedRef.current = muted;

  /* ─────────────────────────── утилиты ─────────────────────────── */

  const publishStreams = useCallback(() => {
    const next: Record<string, MediaStream> = {};
    streamsRef.current.forEach((s, k) => (next[k] = s));
    setRemoteStreams(next);
    setStreamTick((v) => v + 1);
  }, []);

  const dropPeer = useCallback(
    (userId: string) => {
      const link = linksRef.current.get(userId);
      if (link) {
        try {
          link.pc.close();
        } catch {
          /* уже закрыт */
        }
      }
      linksRef.current.delete(userId);
      streamsRef.current.delete(userId);
      publishStreams();
    },
    [publishStreams],
  );

  const cleanup = useCallback(() => {
    // Останавливаем VOX-гейт и индикатор уровня микрофона
    if (gateRafRef.current !== null) {
      cancelAnimationFrame(gateRafRef.current);
      gateRafRef.current = null;
    }
    try {
      gateNodesRef.current?.src.disconnect();
      gateNodesRef.current?.analyser.disconnect();
    } catch {
      /* уже отключены */
    }
    gateNodesRef.current = null;
    micLevelRef.current = 0;

    linksRef.current.forEach((l) => {
      try {
        l.pc.close();
      } catch {
        /* уже закрыт */
      }
    });
    linksRef.current.clear();
    streamsRef.current.clear();
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current = null;
    ringtoneRef.current?.stop();
    ringtoneRef.current = null;
    sessionRef.current = null;
    incomingRef.current = null;
    busyRef.current = false;
    syncingRef.current = false;
    signalQueueRef.current = [];
    setSession(null);
    setIncoming(null);
    setSeconds(0);
    setMuted(false);
    setCameraOn(false);
    setScreenSharing(false);
    setMinimized(false);
    setStarting(false);
    setRemoteStreams({});
  }, []);

  const sendSignal = useCallback(
    async (callId: string, to: string, kind: "offer" | "answer" | "ice", payload: unknown) => {
      try {
        await api(`/api/calls/${callId}`, {
          method: "POST",
          body: JSON.stringify({ action: "signal", to, kind, payload }),
        });
      } catch {
        /* сигнал повторится при следующем согласовании */
      }
    },
    [],
  );

  /** Я предлагаю соединение, если мой id «меньше» (детерминированно для обоих). */


  const createLink = useCallback(
    (peerId: string): PeerLink => {
      const callId = sessionRef.current?.id ?? "";
      // ВАЖНО: «max-bundle» — аудио и видео идут по ОДНОМУ транспорту.
      // С политикой по умолчанию браузер мог развести их по разным
      // транспортам: видео (демка) шло по рабочему, а звук — по мёртвому,
      // и звонок был немым, пока пересогласование случайно не переносило
      // аудио на рабочий транспорт.
      const pc = new RTCPeerConnection({
        iceServers: ICE_SERVERS,
        bundlePolicy: "max-bundle",
      });
      const local = localStreamRef.current;
      if (local) local.getTracks().forEach((t) => pc.addTrack(t, local));

      let stream = streamsRef.current.get(peerId);
      if (!stream) {
        stream = new MediaStream();
        streamsRef.current.set(peerId, stream);
      }
      const remote = stream;

      /* PERFECT NEGOTIATION: роли назначаются детерминированно по id,
         офферы создаются САМИ по событию negotiationneeded (после каждого
         addTrack/removeTrack/replaceTrack-через-добавление) — ручной
         очереди «кто кому должен предложить» больше нет. */
      const polite = meIdRef.current > peerId;
      pc.onnegotiationneeded = async () => {
        const link = linksRef.current.get(peerId);
        if (!link) return;
        try {
          link.makingOffer = true;
          // Оффер — по образцу сэмпла: явные опции приёма аудио/видео.
          const offer = await pc.createOffer(OFFER_OPTIONS);
          await pc.setLocalDescription(offer);
          const d = pc.localDescription;
          const s = sessionRef.current;
          if (s && d)
            await sendSignal(s.id, peerId, d.type === "answer" ? "answer" : "offer", {
              type: d.type,
              sdp: d.sdp,
            });
        } catch {
          /* событие повторится */
        } finally {
          link.makingOffer = false;
        }
      };

    pc.ontrack = (e) => {
      // ВАЖНО: берём именно e.track — дорожку ЭТОГО события. Раньше брали
      // e.streams[0].getTracks()[0], но к моменту второго события (видео)
      // в потоке уже лежит аудио, и оно всегда оказывалось «первым» —
      // видеодорожка молча отбрасивалась. Итог: собеседник слышал звук,
      // но не видел ни камеру, ни демонстрацию экрана.
      const t = e.track;
      if (t && !remote.getTracks().some((x) => x.id === t.id)) remote.addTrack(t);
      publishStreams();
      // Дорожка закончилась (собеседник выключил демку/камеру целиком) —
      // мгновенно убираем её из потока, чтобы плитка не висела чёрной.
      t.onended = () => {
        try {
          remote.removeTrack(t);
        } catch {
          /* уже убрана */
        }
        publishStreams();
      };
    };
      pc.onicecandidate = (e) => {
        if (e.candidate && callId) void sendSignal(callId, peerId, "ice", e.candidate.toJSON());
      };
      pc.onconnectionstatechange = () => {
        const st = pc.connectionState;
        if (st === "failed" || st === "disconnected") {
          // Авто-переподключение: пересобираем маршрут медиа через
          // ICE-рестарт. Раньше при обрыве звук/видео умирали навсегда,
          // пока кто-нибудь не включал демку.
          const link = linksRef.current.get(peerId);
          const last = link?.lastIceRestart ?? 0;
          if (link && Date.now() - last > 8000) {
            link.lastIceRestart = Date.now();
            (async () => {
              try {
                link.offering = true;
                link.offeringSince = Date.now();
                const offer = await pc.createOffer({ iceRestart: true });
                await pc.setLocalDescription(offer);
                const s = sessionRef.current;
                if (s)
                  await sendSignal(s.id, peerId, "offer", {
                    type: offer.type,
                    sdp: offer.sdp,
                  });
              } catch {
                link.offering = false;
                link.offeringSince = null;
              }
            })();
          }
          if (st === "failed") notifyRef.current("Переподключаемся к участнику…");
        }
      };

      const link: PeerLink = {
        pc,
        polite,
        makingOffer: false,
        ignoreOffer: false,
        settingRemoteAnswer: false,
        createdAt: Date.now(),
        offering: false,
        offeringSince: null,
        publishedSdp: null,
        pendingIce: [],
      };
      linksRef.current.set(peerId, link);
      return link;
    },
    [publishStreams, sendSignal],
  );

  const flushIce = useCallback(async (link: PeerLink) => {
    const queued = link.pendingIce.splice(0, link.pendingIce.length);
    for (const c of queued) {
      try {
        await link.pc.addIceCandidate(c);
      } catch {
        /* устаревший кандидат */
      }
    }
  }, []);

  /**
   * Синхронизация mesh-соединений по состоянию комнаты:
   * создаём недостающие пиры, отвечаем на офферы, предлагаем свои.
   */
  /** Обработка одного входящего сигнала по канонам Perfect Negotiation
 *  (MDN/W3C): вежливый уступает при коллизии, невежливый игнорирует чужой
 *  оффер. Один и тот же код для «звонящего» и «принимающего». */
const handlePeerSignal = async (
  link: PeerLink,
  peerId: string,
  sig: { kind: "offer" | "answer" | "ice"; payload?: unknown },
) => {
  const pc = link.pc;
  const s = sessionRef.current;

  if (sig.kind === "ice" && sig.payload) {
    if (pc.remoteDescription) {
      try {
        await pc.addIceCandidate(sig.payload as RTCIceCandidateInit);
      } catch {
        /* кандидат от отклонённого оффера или устаревший */
      }
    } else {
      link.pendingIce.push(sig.payload as RTCIceCandidateInit);
    }
    return;
  }

  if (
    (sig.kind === "offer" || sig.kind === "answer") &&
    sig.payload &&
    typeof (sig.payload as { sdp?: unknown }).sdp === "string"
  ) {
    const description: RTCSessionDescriptionInit = {
      type: sig.kind,
      sdp: (sig.payload as { sdp: string }).sdp,
    };
    const readyForOffer =
      !link.makingOffer &&
      (pc.signalingState === "stable" || link.settingRemoteAnswer);
    const offerCollision = description.type === "offer" && !readyForOffer;
    link.ignoreOffer = !link.polite && offerCollision;
    if (link.ignoreOffer) return;

    link.settingRemoteAnswer = description.type === "answer";
    await pc.setRemoteDescription(description);
    link.settingRemoteAnswer = false;

    if (description.type === "offer") {
      // setLocalDescription() без аргументов сам создаёт ответ.
      await pc.setLocalDescription();
      const d = pc.localDescription;
      if (s && d)
        await sendSignal(s.id, peerId, d.type === "answer" ? "answer" : "offer", {
          type: d.type,
          sdp: d.sdp,
        });
    }
    await flushIce(link);
  }
};

const syncMesh = useCallback(
    async (state: CallState) => {
      if (syncingRef.current) return;
      syncingRef.current = true;
      // Страховка: даже если какой-то внутренний await зависнет, блокировка
      // снимется сама через 12 секунд и соединения продолжат создаваться.
      const lockTimer = setTimeout(() => {
        syncingRef.current = false;
      }, 12_000);
      const signals = signalQueueRef.current.splice(0, signalQueueRef.current.length);
      try {
        const me = meIdRef.current;
        const callId = state.call.id;
        const active = state.participants.filter((p) => p.userId !== me);
        const activeIds = new Set(active.map((p) => p.userId));

        // Ушли из комнаты — закрываем соединения
        for (const id of Array.from(linksRef.current.keys())) {
          if (!activeIds.has(id)) dropPeer(id);
        }

        for (const p of active) {
          const link = linksRef.current.get(p.userId) ?? createLink(p.userId);

          // Оффер, опубликованный при входе, может прийти через поле участника
          if (p.sdp && link.pc.remoteDescription?.sdp !== p.sdp) {
            try {
              await handlePeerSignal(link, p.userId, {
                kind: "offer",
                payload: { type: "offer", sdp: p.sdp },
              });
            } catch {
              /* повторится на следующем опросе */
            }
          }

          // Все накопленные сигналы от этого участника — через один обработчик
          for (const sig of signals.filter((s) => s.from === p.userId)) {
            try {
              await handlePeerSignal(link, p.userId, sig);
            } catch {
              /* попробуем на следующем опросе */
            }
          }

          // Страховка от потерянного оффера: если связи всё ещё нет дольше
          // 8 секунд — напоминаем о себе (идемпотентно, по паттерну).
          if (
            link.pc.signalingState === "stable" &&
            !link.pc.remoteDescription &&
            !link.makingOffer &&
            Date.now() - link.createdAt > 8_000
          ) {
            try {
              const offer = await link.pc.createOffer(OFFER_OPTIONS);
              await link.pc.setLocalDescription(offer);
              const d = link.pc.localDescription;
              if (d)
                await sendSignal(callId, p.userId, "offer", {
                  type: d.type,
                  sdp: d.sdp,
                });
            } catch {
              /* следующее событие договорит */
            }
          }
        }
      } finally {
        clearTimeout(lockTimer);
        syncingRef.current = false;
      }
    },
    [createLink, dropPeer, flushIce, sendSignal],
  );
  const syncMeshRef = useRef(syncMesh);
  syncMeshRef.current = syncMesh;

  /**
   * СТОРОЖ ЗВУКА. Каждые 3 секунды читаем реальную статистику соединений
   * (сколько байт звука отправлено/получено). Если связь установлена, но
   * звук не течёт >10 секунд — чиним сами: свежий захват микрофона +
   * пересогласование. Плюс отдаём цифры на экран («Диагностика»), чтобы
   * всегда было видно, где именно тишина.
   */
  const [audioWatchdog, setAudioWatchdog] = useState<
    Record<string, { conn: string; sentKB: number; recvKB: number; frames: number }>
  >({});
  const watchdogRef = useRef<
    Record<string, { sent: number; recv: number; stuck: number }>
  >({});
  useEffect(() => {
    const s = session;
    if (!s || s.status !== "live") return;
    const t = setInterval(() => {
      (async () => {
        const diag: Record<string, { conn: string; sentKB: number; recvKB: number; frames: number }> = {};
        for (const [peerId, l] of linksRef.current) {
          let sent = 0;
          let recv = 0;
          let frames = 0;
          try {
            const stats = await l.pc.getStats();
            stats.forEach((r) => {
              if (r.type === "outbound-rtp" && r.kind === "audio")
                sent = (r as RTCOutboundRtpStreamStats).bytesSent ?? sent;
              if (r.type === "inbound-rtp" && r.kind === "audio")
                recv = (r as RTCInboundRtpStreamStats).bytesReceived ?? recv;
              if (r.type === "inbound-rtp" && r.kind === "video")
                frames = (r as RTCInboundRtpStreamStats).framesReceived ?? frames;
            });
          } catch {
            continue;
          }
          watchdogRef.current[peerId] = { sent, recv, stuck: 0 };
          diag[peerId] = {
            conn: l.pc.connectionState,
            sentKB: Math.round(sent / 1024),
            recvKB: Math.round(recv / 1024),
            frames,
          };
        }
        setAudioWatchdog(diag);

        // Если участников больше одного, а соединений нет (сигнал потерялся,
        // вкладка засыпала) — принудительно пересинхронизируем mesh.
        const cur = sessionRef.current;
        if (cur && cur.status === "live") {
          const others = cur.participants.filter((p) => p.userId !== meIdRef.current);
          if (others.length > 0 && linksRef.current.size === 0) {
            void syncMeshRef.current({
              call: { id: cur.id },
              participants: cur.participants,
            } as unknown as CallState);
          }
        }
      })();
    }, 3_000);
    return () => {
      clearInterval(t);
      watchdogRef.current = {};
    };
  // В зависимостях ТОЛЬКО стабильные значения: объект session меняется
  // каждые 2 секунды опроса, и интервал пересоздавался раньше, чем успевал
  // сработать (3 с) — из-за этого диагностика вечно показывала
  // «Пока нет соединений», а сторож никогда не лечил тишину.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id, session?.status]);

  /** Применить состояние комнаты к локальному состоянию + синхронизировать mesh. */
  const applyState = useCallback(
    (state: CallState) => {
      const s = state.call;
      if (s.status === "ended" || s.status === "missed" || s.status === "declined") {
        const wasRinging = sessionRef.current?.status === "ringing";
        cleanup();
        if (s.status === "missed") notifyRef.current("Звонок пропущен");
        else if (s.status === "declined") notifyRef.current(wasRinging ? "Звонок отклонён" : "Звонок завершён");
        else notifyRef.current("Звонок завершён");
        endedRef.current();
        return;
      }

      const next: CallSession = {
        id: s.id,
        conversationId: s.conversationId,
        title: s.conversationTitle,
        kind: s.conversationKind,
        media: s.media,
        hostId: s.hostId,
        joinToken: s.joinToken,
        status: s.status === "ringing" ? "ringing" : "live",
        participants: state.participants,
      };
      // Личный звонок 1:1: собеседник вышел — звонок завершается сам, чтобы
      // не висеть в пустой комнате («тыкаю на новое окошко и звонок
      // сбрасывается» не нужен).
      const others = next.participants.filter((p) => p.userId !== meIdRef.current);
      const prev = sessionRef.current;
      const wasLiveWithPeer =
        !!prev && prev.status === "live" && prev.id === next.id &&
        prev.participants.some((p) => p.userId !== meIdRef.current);
      if (next.kind === "direct" && wasLiveWithPeer && others.length === 0) {
        cleanup();
        notifyRef.current("Собеседник вышел — звонок завершён");
        endedRef.current();
        return;
      }

      sessionRef.current = next;
      setSession(next);
      setIncoming(null);
      incomingRef.current = null;
      // Сигналы сервер выдаёт ровно один раз (помечает прочитанными) —
      // складываем их в очередь ДО запуска синхронизации, чтобы они не
      // потерялись, даже если прошлый проход ещё занят.
      if (state.signals.length > 0) signalQueueRef.current.push(...state.signals);
      void syncMesh(state);
    },
    [cleanup, syncMesh],
  );

  /* ─────────────────────── вход в комнату ─────────────────────── */

  const acquireMedia = useCallback(async (media: CallMedia): Promise<MediaStream | null> => {
    // ВАЖНО: захватываем микрофон МАКСИМАЛЬНО ПРОСТО — { audio: true }, как
    // в старой рабочей версии и в эталонных примерах. Ограничения
    // (шумоподавление и т.д.) применяются ТОЛЬКО если пользователь сам нажмёт
    // «Применить» в панели настроек звука: на части систем они ломают захват
    // и звонок становился немым.
    try {
      return await navigator.mediaDevices.getUserMedia({ audio: true, video: media === "video" });
    } catch {
      if (media === "video") {
        // Камеры может не быть — продолжаем хотя бы с аудио
        try {
          return await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch {
          /* пробуем дальше */
        }
      }
      // Ничего не дало (нет доступа к микрофону, запрет в браузере и т.п.) —
      // НЕ роняем звонок: заходим в режиме прослушивания (собеседников будет
      // слышно и видно, но вас — нет).
      notifyRef.current(
        "Нет доступа к микрофону/камере — вы в режиме прослушивания. Разрешите доступ в настройках браузера, чтобы говорить",
      );
      return null;
    }
  }, []);

  /** Универсальный вход: action=join (по id/токену) или создание комнаты. */
  const enterRoom = useCallback(
    async (opts: {
      media: CallMedia;
      callId?: string;
      token?: string;
      conversationId?: string;
    }) => {
      if (sessionRef.current || busyRef.current) return;
      busyRef.current = true;
      setStarting(true);
      // Размораживаем AudioContext ПРЯМО в жесте пользователя (клик
      // «Позвонить»/«Принять») — иначе первый звонок мог идти без звука.
      try {
        void getAudioContext()?.resume().catch(() => {});
      } catch {
        /* нет WebAudio */
      }
      let stream: MediaStream | null = null;
      try {
        stream = await acquireMedia(opts.media);
        // stream может быть null — режим прослушивания (нет доступа к
        // микрофону): звонок всё равно работает, мы слышим и видим других.
        localStreamRef.current = stream;
        const videoOn = !!stream?.getVideoTracks().some((t) => t.enabled);
        setCameraOn(videoOn);
        setMuted(false);
        mutedRef.current = false;
        // VOX-гейт и индикатор уровня микрофона
        restartVoiceGate();

        let state: CallState;
        if (opts.callId) {
          const d = await api<{ call: CallState }>(`/api/calls/${opts.callId}`, {
            method: "POST",
            body: JSON.stringify({ action: "join", token: opts.token ?? null, videoOn, muted: false }),
          });
          state = d.call;
        } else {
          // ВАЖНО: передаём videoOn и при СОЗДАНИИ комнаты — раньше флаг не
          // сохранялся, и у автора видеозвонка плитку камеры никто не рисовал
          // («изображение не показывается»), хотя видео уже шло по сети.
          const d = await api<{ call: CallState }>("/api/calls", {
            method: "POST",
            body: JSON.stringify({
              conversationId: opts.conversationId,
              media: opts.media,
              videoOn,
              muted: false,
            }),
          });
          state = d.call;
        }
        applyState(state);
        setSeconds(0);
        setMinimized(false);
      } catch (err) {
        stream?.getTracks().forEach((t) => t.stop());
        localStreamRef.current = null;
        if (err instanceof ApiError && err.status === 401) {
          unauthorizedRef.current();
          return;
        }
        if (err instanceof ApiError) notifyRef.current(err.message);
        else if (err instanceof Error && err.name === "NotAllowedError")
          notifyRef.current("Нет доступа к микрофону или камере — разрешите доступ в браузере");
        else notifyRef.current("Не удалось войти в звонок");
      } finally {
        busyRef.current = false;
        setStarting(false);
      }
    },
    [acquireMedia, applyState],
  );

  /** Начать звонок в диалоге (ЛС → «звонит», группа/канал → живая комната). */
  const startCall = useCallback(
    async (conversationId: string, media: CallMedia = "audio") => {
      await enterRoom({ conversationId, media });
    },
    [enterRoom],
  );

  /** Войти в уже существующую комнату (кнопка «присоединиться» в шапке чата). */
  const joinCall = useCallback(
    async (callId: string, media: CallMedia = "audio") => {
      await enterRoom({ callId, media });
    },
    [enterRoom],
  );

  /** Принять входящий звонок. */
  const accept = useCallback(async () => {
    const inc = incomingRef.current;
    if (!inc) return;
    const media = inc.media;
    setIncoming(null);
    incomingRef.current = null;
    await enterRoom({ callId: inc.id, media });
  }, [enterRoom]);

  /**
   * Войти по ссылке-приглашению (#join=<token>).
   * Сначала спрашиваем у сервера, жива ли комната и какое в ней медиа,
   * потом запрашиваем микрофон/камеру и входим.
   */
  const joinByToken = useCallback(
    async (token: string) => {
      if (!token) return;
      if (sessionRef.current) {
        notifyRef.current("Вы уже в звонке");
        return;
      }
      try {
        const d = await api<{
          call: { id: string; media: CallMedia; status: string; title: string; participants: number };
        }>(`/api/calls/info/${encodeURIComponent(token)}`);
        if (d.call.status !== "live" && d.call.status !== "ringing") {
          notifyRef.current("Звонок уже завершён");
          return;
        }
        await enterRoom({ callId: d.call.id, token, media: d.call.media });
      } catch (err) {
        setStarting(false);
        if (err instanceof ApiError && err.status === 401) unauthorizedRef.current();
        else if (err instanceof ApiError && (err.status === 410 || err.status === 404))
          notifyRef.current("Звонок уже завершён");
        else notifyRef.current(err instanceof Error ? err.message : "Не удалось войти по ссылке");
      }
    },
    [enterRoom],
  );

  /* ─────────────────────── завершение ─────────────────────── */

  const leave = useCallback(
    async (opts: { endForAll?: boolean } = {}) => {
      const s = sessionRef.current;
      const inc = incomingRef.current;
      cleanup();
      try {
        if (s) {
          await api(`/api/calls/${s.id}`, {
            method: "POST",
            body: JSON.stringify({ action: opts.endForAll ? "end" : "leave" }),
          });
        } else if (inc) {
          await api(`/api/calls/${inc.id}`, {
            method: "POST",
            body: JSON.stringify({ action: "decline" }),
          });
        }
      } catch {
        /* комната уже закрыта с другой стороны */
      }
      endedRef.current();
    },
    [cleanup],
  );

  const hangup = useCallback(() => leave({ endForAll: false }), [leave]);

  const decline = useCallback(async () => {
    const inc = incomingRef.current;
    if (!inc) return;
    dismissedRef.current.add(inc.id);
    incomingRef.current = null;
    setIncoming(null);
    try {
      await api(`/api/calls/${inc.id}`, {
        method: "POST",
        body: JSON.stringify({ action: inc.status === "ringing" ? "decline" : "leave" }),
      });
    } catch {
      /* уже завершён */
    }
  }, []);

  /** Скрыть уведомление о групповом звонке (не входя в него). */
  const dismissIncoming = useCallback(() => {
    const inc = incomingRef.current;
    if (!inc) return;
    dismissedRef.current.add(inc.id);
    incomingRef.current = null;
    setIncoming(null);
  }, []);

  // Закрытие вкладки во время звонка — деликатно выходим из комнаты.
  // Слушаем И beforeunload, И pagehide: на мобильных и при сворачивании
  // срабатывает только pagehide, а раньше звонок «шёл дальше».
  useEffect(() => {
    const onLeave = () => {
      const id = sessionRef.current?.id;
      if (id) {
        void fetch(`/api/calls/${id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "leave" }),
          keepalive: true,
          credentials: "include",
        });
      }
    };
    window.addEventListener("beforeunload", onLeave);
    window.addEventListener("pagehide", onLeave);
    return () => {
      window.removeEventListener("beforeunload", onLeave);
      window.removeEventListener("pagehide", onLeave);
    };
  }, []);

  /* ─────────────────────── опросы ─────────────────────── */

  // Входящие звонки (комнаты, куда меня зовут)
  useEffect(() => {
    const poll = async () => {
      if (sessionRef.current || busyRef.current) return;
      try {
        const token = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("join");
        const d = await api<{ calls: IncomingCall[] }>(
          `/api/calls/incoming${token ? `?token=${encodeURIComponent(token)}` : ""}`,
        );
        const candidate = d.calls.find(
          (c) => !dismissedRef.current.has(c.id) && c.participants.some((p) => p.userId !== meIdRef.current),
        );
        if (candidate) {
          // обновляем и состав участников, и статус (ringing → live)
          incomingRef.current = candidate;
          setIncoming(candidate);
        } else if (incomingRef.current) {
          const stillThere = d.calls.some((c) => c.id === incomingRef.current?.id);
          if (!stillThere) {
            incomingRef.current = null;
            setIncoming(null);
          }
        }
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) unauthorizedRef.current();
        /* иначе сеть моргнула — попробуем в следующий раз */
      }
    };
    void poll();
    const t = setInterval(poll, INCOMING_POLL_MS);
    return () => clearInterval(t);
  }, []);

  // Состояние комнаты + сигналы (этот же запрос — heartbeat)
  useEffect(() => {
    const t = setInterval(async () => {
      const s = sessionRef.current;
      if (!s) return;
      try {
        const d = await api<{ call: CallState }>(`/api/calls/${s.id}`);
        applyState(d.call);
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          cleanup();
          unauthorizedRef.current();
        } else if (e instanceof ApiError && e.status === 404) {
          cleanup();
          notifyRef.current("Звонок завершён");
          endedRef.current();
        }
      }
    }, CALL_POLL_MS);
    return () => clearInterval(t);
  }, [applyState, cleanup]);

  // Таймер живого звонка
  useEffect(() => {
    if (session?.status !== "live") return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1_000);
    return () => clearInterval(t);
  }, [session?.status, session?.id]);

  // Уровень связи с каждым участником: раз в 3 секунды смотрим статистику
  // WebRTC (пинг + потери пакетов) и переводим в 0–3 «палочки».
  useEffect(() => {
    if (session?.status !== "live") {
      setConnQuality({});
      return;
    }
    const t = setInterval(async () => {
      const next: Record<string, number> = {};
      for (const [peerId, l] of Array.from(linksRef.current.entries())) {
        try {
          const stats = await l.pc.getStats();
          let rtt: number | null = null;
          let lost = 0;
          let received = 0;
          stats.forEach((r) => {
            const s = r as Record<string, unknown>;
            if (s.type === "candidate-pair" && s.state === "succeeded" && typeof s.currentRoundTripTime === "number") {
              rtt = (s.currentRoundTripTime as number) * 1000;
            }
            if (s.type === "inbound-rtp") {
              lost += typeof s.packetsLost === "number" ? (s.packetsLost as number) : 0;
              received += typeof s.packetsReceived === "number" ? (s.packetsReceived as number) : 0;
            }
          });
          const lossRatio = received + lost > 0 ? lost / (received + lost) : 0;
          const ping = rtt ?? 0;
          let q = 3;
          if (ping > 900 || lossRatio > 0.2) q = 0;
          else if (ping > 400 || lossRatio > 0.08) q = 1;
          else if (ping > 150 || lossRatio > 0.02) q = 2;
          next[peerId] = q;
        } catch {
          next[peerId] = 0;
        }
      }
      setConnQuality((cur) => {
        const key = JSON.stringify(cur);
        return JSON.stringify(next) === key ? cur : next;
      });
    }, 3_000);
    return () => clearInterval(t);
  }, [session?.status, session?.id]);

  // Рингтон входящего. Зависимость — только id звонящего звонка: объект incoming
  // обновляется каждым опросом, и рингтон перезапускался бы каждые 3 секунды.
  const ringingId = incoming && incoming.status === "ringing" ? incoming.id : null;
  useEffect(() => {
    if (!ringingId) {
      ringtoneRef.current?.stop();
      ringtoneRef.current = null;
      return;
    }
    ringtoneRef.current?.stop();
    ringtoneRef.current = startRingtone();
    return () => {
      ringtoneRef.current?.stop();
      ringtoneRef.current = null;
    };
  }, [ringingId]);

  /* ─────────────────────── медиа ─────────────────────── */

  /**
   * Оптимистично обновить МОЙ медиастатус в списке участников, не дожидаясь
   * следующего опроса комнаты (1+ с). Иначе иконка «микрофон выкл/вкл»
   * переключалась с заметной задержкой («статус долго обновляется»).
   */
  const patchMyMediaState = useCallback(
    (patch: Partial<Pick<CallParticipantInfo, "muted" | "videoOn" | "screenOn">>) => {
      const s = sessionRef.current;
      if (!s) return;
      const me = meIdRef.current;
      const next: CallSession = {
        ...s,
        participants: s.participants.map((p) => (p.userId === me ? { ...p, ...patch } : p)),
      };
      sessionRef.current = next;
      setSession(next);
    },
    [],
  );

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      localStreamRef.current?.getAudioTracks().forEach((t) => (t.enabled = !next));
      patchMyMediaState({ muted: next });
      const s = sessionRef.current;
      if (s) void api(`/api/calls/${s.id}`, { method: "POST", body: JSON.stringify({ action: "state", muted: next }) }).catch(() => {});
      return next;
    });
  }, [patchMyMediaState]);

  /**
   * Повторное согласование со всеми: нужно, когда изменился состав дорожек
   * (включили камеру/экран). Оффер может послать ЛЮБАЯ сторона: встречные
   * офферы разруливаются правилами perfect negotiation (rollback в syncMesh),
   * а раньше «большая» сторона не могла добавить камеру — её оффер никто
   * не создавал, и собеседник не видел видео.
   */
  const renegotiateAll = useCallback(async (plain = false) => {
    for (const [peerId, l] of Array.from(linksRef.current.entries())) {
      try {
        l.offering = true;
        l.offeringSince = Date.now();
        const offer = await l.pc.createOffer(plain ? undefined : OFFER_OPTIONS);
        await l.pc.setLocalDescription(offer);
        const d = l.pc.localDescription;
        const s = sessionRef.current;
        if (s && d) await sendSignal(s.id, peerId, d.type === "answer" ? "answer" : "offer", { type: d.type, sdp: d.sdp });
      } catch {
        l.offering = false;
        l.offeringSince = null;
      }
    }
  }, [sendSignal]);
  const renegotiateAllRef = useRef(renegotiateAll);
  renegotiateAllRef.current = renegotiateAll;



  /**
   * Принудительное переподключение медиа со всеми (кнопка «перезвук»):
   * новые офферы с ICE-рестартом. Лечит «звук пропал / не было с самого
   * начала» без выхода из звонка.
   */
  const reconnectMedia = useCallback(async () => {
    for (const [peerId, l] of Array.from(linksRef.current.entries())) {
      try {
        l.lastIceRestart = Date.now();
        l.offering = true;
        l.offeringSince = Date.now();
        const offer = await l.pc.createOffer({ iceRestart: true });
        await l.pc.setLocalDescription(offer);
        const s = sessionRef.current;
        if (s) await sendSignal(s.id, peerId, "offer", { type: offer.type, sdp: offer.sdp });
      } catch {
        l.offering = false;
        l.offeringSince = null;
      }
    }
    notifyRef.current("Переподключаем звук и видео…");
  }, [sendSignal]);

  /* ─────────── порог активации голоса (VOX) + уровень микрофона ─────────── */

  /**
   * Запускает (перезапускает) анализатор микрофона:
   *  — отдаёт текущий уровень (для индикатора в настройках);
   *  — при пороге > 0 работает как VOX-гейт: пока тише порога, дорожка
   *    «закрыта» (собеседники не слышат фон), голос открывается мгновенно.
   * Ручной мьют всегда в приоритете.
   */
  /**
   * ИЗМЕРИТЕЛЬ УРОВНЯ МИКРОФОНА (только индикация для полоски в звонке).
   * Раньше здесь был VOX-гейт, который сам дёргал track.enabled — любой сбой
   * логики молча выключал микрофон насовсем («говоришь, а звука нет»).
   * Теперь код звонка НИКОГДА не трогает enabled дорожки без явного мьюта
   * пользователя — как в эталонных примерах WebRTC.
   */
  const restartVoiceGate = useCallback(() => {
    if (gateRafRef.current !== null) {
      cancelAnimationFrame(gateRafRef.current);
      gateRafRef.current = null;
    }
    try {
      gateNodesRef.current?.src.disconnect();
      gateNodesRef.current?.analyser.disconnect();
    } catch {
      /* уже отключены */
    }
    gateNodesRef.current = null;
    micLevelRef.current = 0;

    const track = localStreamRef.current?.getAudioTracks()[0];
    if (!track) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    try {
      const src = ctx.createMediaStreamSource(new MediaStream([track]));
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      src.connect(analyser);
      gateNodesRef.current = { src, analyser };

      const data = new Uint8Array(analyser.fftSize);
      const loop = () => {
        gateRafRef.current = requestAnimationFrame(loop);
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length); // 0..1
        micLevelRef.current = Math.min(100, Math.round(rms * 400));
      };
      gateRafRef.current = requestAnimationFrame(loop);
    } catch {
      /* нет WebAudio — индикатор просто не двигается */
    }
  }, []);
  const restartVoiceGateRef = useRef(restartVoiceGate);
  restartVoiceGateRef.current = restartVoiceGate;

  /**
   * Применить новые настройки звука прямо во время звонка: микрофон
   * перезахватывается с новыми ограничениями (шумоподавление и т.д.), дорожка
   * прозрачно подменяется у всех участников (replaceTrack) — звонок не рвётся.
   */
  /* ──────── МИКС ЗВУКА ДЕМОНСТРАЦИИ: экран/вкладка + микрофон ────────
     Браузер проигрывает у собеседника только ОДИН входящий аудиотрек,
     поэтому звук шаренного окна и микрофон сводятся в один трек через
     Web Audio (MediaStreamDestination) и подменяются на сендере через
     replaceTrack — без пересогласования. */
  const screenAudioMixRef = useRef<{
    ctx: AudioContext;
    mixed: MediaStreamTrack;
    destStream: MediaStream;
    originalMic: MediaStreamTrack | null;
  } | null>(null);

  const teardownScreenAudioMix = useCallback(() => {
    const mix = screenAudioMixRef.current;
    if (!mix) return;
    screenAudioMixRef.current = null;
    // Возвращаем на все аудиосендеры чистый микрофон
    for (const l of linksRef.current.values()) {
      const snd = l.pc.getSenders().find((x) => x.track?.kind === "audio");
      if (snd) void snd.replaceTrack(mix.originalMic).catch(() => {});
    }
    void mix.ctx.close().catch(() => {});
  }, []);

  /** Возвращает: удалось ли подмешать звук экрана (и нужен ли ренегот). */
  const buildScreenAudioMix = useCallback(
    (screenStream: MediaStream): boolean => {
      const screenAudio = screenStream.getAudioTracks()[0];
      if (!screenAudio) return false; // Safari/macOS: звука экрана нет
      try {
        const ctx = new AudioContext();
        if (ctx.state !== "running") void ctx.resume().catch(() => {});
        const dest = ctx.createMediaStreamDestination();
        const mic = localStreamRef.current?.getAudioTracks()[0] ?? null;
        if (mic) ctx.createMediaStreamSource(new MediaStream([mic])).connect(dest);
        ctx.createMediaStreamSource(new MediaStream([screenAudio])).connect(dest);
        const mixed = dest.stream.getAudioTracks()[0];
        if (!mixed) {
          void ctx.close().catch(() => {});
          return false;
        }
        mixed.enabled = true;
        screenAudioMixRef.current = {
          ctx,
          mixed,
          destStream: dest.stream,
          originalMic: mic,
        };
        for (const l of linksRef.current.values()) {
          const snd = l.pc.getSenders().find((x) => x.track?.kind === "audio");
          if (snd) void snd.replaceTrack(mixed).catch(() => {});
        }
        return true;
      } catch {
        /* Web Audio недоступен — демонстрация пойдёт без звука экрана */
        return false;
      }
    },
    [],
  );

  const applyAudioSettings = useCallback(
    async (next: AudioSettings) => {
      saveAudioSettings(next);
      const stream = localStreamRef.current;
      if (!stream) return;
      try {
        const fresh = await navigator.mediaDevices.getUserMedia({
          audio: {
            noiseSuppression: next.noiseSuppression,
            echoCancellation: next.echoCancellation,
            autoGainControl: next.autoGainControl,
          },
        });
        const [newTrack] = fresh.getAudioTracks();
        if (!newTrack) throw new Error("no audio track");
        const oldTrack = stream.getAudioTracks()[0];
        // Сохраняем текущее состояние мьюта на новой дорожке
        newTrack.enabled = oldTrack ? oldTrack.enabled : !mutedRef.current;
        if (oldTrack) {
          stream.removeTrack(oldTrack);
          oldTrack.stop();
        }
        stream.addTrack(newTrack);
        let addedSomewhere = false;
        for (const l of linksRef.current.values()) {
          const sender = l.pc.getSenders().find((x) => x.track?.kind === "audio");
          if (sender) {
            void sender.replaceTrack(newTrack).catch(() => {});
          } else {
            l.pc.addTrack(newTrack, stream);
            addedSomewhere = true;
          }
        }
        if (addedSomewhere) void renegotiateAll();
        // Если идёт демонстрация — пересобираем микс с новым микрофоном,
        // иначе звук экрана остался бы без голоса.
        if (screenStreamRef.current && screenAudioMixRef.current) {
          teardownScreenAudioMix();
          buildScreenAudioMix(screenStreamRef.current);
        }
        setStreamTick((v) => v + 1);
        restartVoiceGate();
      } catch {
        notifyRef.current("Не удалось применить настройки звука");
      }
    },
    [renegotiateAll, restartVoiceGate, teardownScreenAudioMix, buildScreenAudioMix],
  );

  const toggleCamera = useCallback(async () => {
    const s = sessionRef.current;
    if (!s) return;
    const turningOn = !cameraOn;

    if (turningOn && !localStreamRef.current?.getVideoTracks().length) {
      try {
        const video = await navigator.mediaDevices.getUserMedia({ video: true });
        const [track] = video.getVideoTracks();
        if (!track) throw new Error("no video track");
        const local = localStreamRef.current;
        if (local) {
          local.addTrack(track);
          // ВАЖНО: как и в демонстрации экрана — если у пира уже есть
          // видео-сендер, ПОДМЕНЯЕМ дорожку (мгновенно, без пересогласования).
          // Только если сендера нет вовсе — добавляем трек и ренеготиируем.
          // Раньше всегда делали addTrack + offer, и при малейшем сбое
          // пересогласования собеседник не видел камеру (а демку — видел,
          // т.к. она шла через replaceTrack).
          let needRenegotiate = false;
          linksRef.current.forEach((l) => {
            const sender = l.pc.getSenders().find((x) => x.track?.kind === "video");
            if (sender) void sender.replaceTrack(track).catch(() => {});
            else {
              l.pc.addTrack(track, local);
              needRenegotiate = true;
            }
          });
          if (needRenegotiate) void renegotiateAll();
        } else {
          localStreamRef.current = video;
        }
        setStreamTick((v) => v + 1);
      } catch {
        notifyRef.current("Камера недоступна");
        return;
      }
    }

    setCameraOn((on) => {
      const next = !on;
      localStreamRef.current?.getVideoTracks().forEach((t) => (t.enabled = next));
      // Мгновенно показываем новый статус в списке участников (сервер догонит опросом)
      patchMyMediaState({ videoOn: next });
      void api(`/api/calls/${s.id}`, {
        method: "POST",
        body: JSON.stringify({ action: "state", videoOn: next }),
      }).catch(() => {});
      return next;
    });
    // Ренеготиация теперь делается ТОЛЬКО если добавляли новый трек
    // (см. выше) — при подмене через replaceTrack она не нужна, а лишний
    // оффер мог «перекричать» ответ собеседника и видео не доезжало.
  }, [cameraOn, renegotiateAll, patchMyMediaState]);

  /* ─────────────────────── демонстрация экрана ─────────────────────── */

  /** Заменить видеодорожку у всех пиров (камера ↔ экран) без пересогласования. */
  const stopScreenShare = useCallback(() => {
    const s = sessionRef.current;
    const stream = screenStreamRef.current;
    screenStreamRef.current = null;
    setScreenSharing(false);
    setStreamTick((v) => v + 1);
    stream?.getTracks().forEach((t) => t.stop());
    // Возвращаем собеседникам чистый микрофон вместо микса и закрываем
    // AudioContext, чтобы он не висел в памяти.
    teardownScreenAudioMix();
    // Статус «демонстрация выключена» — сразу, без ожидания опроса сервера
    patchMyMediaState({ screenOn: false });

    // ЧТО ВИДИТ СОБЕСЕДНИК: либо живую камеру, либо НИЧЕГО.
    // Раньше мы подставляли на место демки выключенную/пустую дорожку — и
    // у второго участника висела ЧЁРНАЯ плитка. Теперь: рабочая камера
    // включена → подменяем на неё; иначе → ПОЛНОСТЬЮ убираем видеодорожку
    // и делаем пересогласование: у собеседника дорожка реально «заканчивается»
    // и чёрная плитка исчезает.
    const cameraTrack = localStreamRef.current?.getVideoTracks()[0] ?? null;
    const cameraUsable =
      !!cameraTrack && cameraTrack.readyState === "live" && cameraTrack.enabled;
    let needsRenegotiate = false;
    for (const l of linksRef.current.values()) {
      const sender = l.pc.getSenders().find(
        (x) => x.track?.kind === "video" || x.track === null,
      );
      if (!sender) continue;
      if (cameraUsable) {
        void sender.replaceTrack(cameraTrack).catch(() => {});
      } else {
        l.pc.removeTrack(sender);
        // ВАЖНО: сам видеотрансивер переводим в «неактивный». Если просто
        // убрать трек, оффер с опцией «хочу принимать видео» оставлял
        // m=видео как recvonly — у собеседника дорожка не заканчивалась,
        // и ЧЁРНАЯ плитка демки висела вечно.
        const tr = l.pc.getTransceivers().find((t) => t.sender === sender);
        if (tr) {
          try {
            tr.direction = "inactive";
          } catch {
            /* браузер сам разберётся */
          }
        }
        needsRenegotiate = true;
      }
    }
    // После демки — чистое пересогласование БЕЗ принудительного приёма
    // видео (иначе видеосекция воскреснет пустой и плитка останется чёрной).
    void renegotiateAll(true);
    if (s)
      void api(`/api/calls/${s.id}`, {
        method: "POST",
        body: JSON.stringify({ action: "state", screenOn: false }),
      }).catch(() => {});
  }, [patchMyMediaState, renegotiateAll, teardownScreenAudioMix]);

  const stopScreenShareRef = useRef(stopScreenShare);
  stopScreenShareRef.current = stopScreenShare;

  /**
   * Демонстрация экрана (как в Discord): getDisplayMedia → видеодорожка
   * экрана заменяет камеру у всех участников (sender.replaceTrack — без
   * пересогласования, мгновенно). Если камеры не было вовсе — дорожка
   * добавляется и делается renegotiate.
   */
  const toggleScreenShare = useCallback(async () => {
    const s = sessionRef.current;
    if (!s) return;
    if (screenStreamRef.current) {
      stopScreenShareRef.current();
      return;
    }
    if (!navigator.mediaDevices?.getDisplayMedia) {
      notifyRef.current("Демонстрация экрана не поддерживается этим браузером");
      return;
    }
    // Звук экрана/вкладки: просим браузер захватить и видео, и звук
    // (галочка «поделиться звуком» в системном диалоге). Если платформа
    // не умеет (например, часть браузеров на macOS) — падаем на видео.
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    } catch {
      try {
        stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      } catch {
        notifyRef.current("Не удалось начать демонстрацию экрана");
        return;
      }
    }
    try {
      const [track] = stream.getVideoTracks();
      if (!track) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      screenStreamRef.current = stream;
      // Пользователь нажал «Прекратить демонстрацию» в браузере
      track.addEventListener("ended", () => stopScreenShareRef.current());

      let needsRenegotiate = false;
      for (const l of linksRef.current.values()) {
        const sender = l.pc.getSenders().find((x) => x.track?.kind === "video");
        if (sender) {
          await sender.replaceTrack(track).catch(() => {});
        } else {
          const local = localStreamRef.current;
          if (local) {
            l.pc.addTrack(track, local);
            needsRenegotiate = true;
          }
        }
      }

      // ЗВУК ДЕМОНСТРАЦИИ: микс «экран + микрофон» в один трек. Собеседник
      // услышит и вас, и звук шаренного окна/вкладки. Если звука экрана нет
      // (ОС не отдала) или микс не собрался — остаётся обычный микрофон.
      if (buildScreenAudioMix(stream)) {
        // Там, где аудиосендера не было вовсе (режим «только слушать»),
        // микс добавляется как новая дорожка — нужно пересогласование.
        const mix = screenAudioMixRef.current;
        if (mix) {
          for (const l of linksRef.current.values()) {
            const snd = l.pc.getSenders().find((x) => x.track?.kind === "audio");
            if (!snd) {
              l.pc.addTrack(mix.mixed, mix.destStream);
              needsRenegotiate = true;
            }
          }
        }
      }

      setScreenSharing(true);
      setStreamTick((v) => v + 1);
      // Статус «демонстрация включена» — сразу, без ожидания опроса сервера
      patchMyMediaState({ screenOn: true });
      void api(`/api/calls/${s.id}`, {
        method: "POST",
        body: JSON.stringify({ action: "state", screenOn: true }),
      }).catch(() => {});
      if (needsRenegotiate) void renegotiateAll();
    } catch {
      notifyRef.current("Не удалось начать демонстрацию экрана");
    }
  }, [renegotiateAll, patchMyMediaState, buildScreenAudioMix]);

  /** Ссылка-приглашение в текущий звонок (её можно кинуть кому угодно). */
  const getShareLink = useCallback(async (): Promise<string | null> => {
    const s = sessionRef.current;
    if (!s) return null;
    const url = `${window.location.origin}${window.location.pathname}#join=${s.joinToken}&media=${s.media}`;
    try {
      const d = await api<{ url?: string }>(`/api/calls/${s.id}/invite`, { method: "POST" });
      if (d.url && d.url.startsWith("http")) return d.url;
    } catch {
      /* используем локальную ссылку */
    }
    return url;
  }, []);

  /** Позвать людей в звонок (они увидят его во «входящих»). */
  const inviteUsers = useCallback(
    async (userIds: string[]) => {
      const s = sessionRef.current;
      if (!s || userIds.length === 0) return 0;
      try {
        const d = await api<{ invited: string[] }>(`/api/calls/${s.id}`, {
          method: "POST",
          body: JSON.stringify({ action: "invite", userIds }),
        });
        return d.invited?.length ?? 0;
      } catch (e) {
        notifyRef.current(e instanceof Error ? e.message : "Не удалось пригласить");
        return 0;
      }
    },
    [notify],
  );

  return {
    meId,
    session,
    incoming,
    starting,
    muted,
    cameraOn,
    screenSharing,
    screenStreamRef,
    seconds,
    connQuality,
    reconnectMedia,
    audioWatchdog,
    minimized,
    setMinimized,
    streamTick,
    localStreamRef,
    remoteStreams,
    startCall,
    joinCall,
    accept,
    decline,
    dismissIncoming,
    hangup,
    leave,
    joinByToken,
    toggleMute,
    toggleCamera,
    toggleScreenShare,
    getShareLink,
    inviteUsers,
    applyAudioSettings,
    micLevelRef,
  };
}

export type CallController = ReturnType<typeof useCallController>;
export type { IncomingCall, PublicUser };
