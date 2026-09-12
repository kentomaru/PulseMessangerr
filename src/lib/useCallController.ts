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
import type {
  CallMedia,
  CallState,
  IncomingCall,
  PublicUser,
} from "@/lib/types";

const ICE_SERVERS: RTCIceServer[] = [
  { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
];

const INCOMING_POLL_MS = 3_000;
const CALL_POLL_MS = 1_200;
/** Сколько ждём answer, прежде чем переотправить оффер. */
const OFFER_RETRY_MS = 6_000;

/** Состояние соединения с одним участником. */
type PeerLink = {
  pc: RTCPeerConnection;
  /** Кто инициировал текущее согласование. */
  offering: boolean;
  /** Когда отправили оффер — чтобы повторить, если ответ так и не пришёл. */
  offeringSince: number | null;
  /** SDP, который я опубликовал/отправил этому участнику. */
  publishedSdp: string | null;
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
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    const ctx = new Ctx();
    void ctx.resume().catch(() => {});
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
      if (stopped) return;
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
        void ctx.close().catch(() => {});
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
  const [muted, setMuted] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [starting, setStarting] = useState(false);
  /** Уменьшенный звонок («динамический остров») — можно писать в чат. */
  const [minimized, setMinimized] = useState(false);
  /** Карта «участник → его медиапоток». */
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  /** Счётчик изменений потоков — чтобы <video> переподключались. */
  const [streamTick, setStreamTick] = useState(0);

  const localStreamRef = useRef<MediaStream | null>(null);
  const linksRef = useRef<Map<string, PeerLink>>(new Map());
  const streamsRef = useRef<Map<string, MediaStream>>(new Map());
  const sessionRef = useRef<CallSession | null>(null);
  const incomingRef = useRef<IncomingCall | null>(null);
  const dismissedRef = useRef<Set<string>>(new Set());
  const busyRef = useRef(false);
  const ringtoneRef = useRef<{ stop: () => void } | null>(null);
  const syncingRef = useRef(false);
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
    ringtoneRef.current?.stop();
    ringtoneRef.current = null;
    sessionRef.current = null;
    incomingRef.current = null;
    busyRef.current = false;
    syncingRef.current = false;
    setSession(null);
    setIncoming(null);
    setSeconds(0);
    setMuted(false);
    setCameraOn(false);
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
  const iShouldOffer = useCallback((peerId: string) => meIdRef.current < peerId, []);

  const createLink = useCallback(
    (peerId: string): PeerLink => {
      const callId = sessionRef.current?.id ?? "";
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      const local = localStreamRef.current;
      if (local) local.getTracks().forEach((t) => pc.addTrack(t, local));

      let stream = streamsRef.current.get(peerId);
      if (!stream) {
        stream = new MediaStream();
        streamsRef.current.set(peerId, stream);
      }
      const remote = stream;

      pc.ontrack = (e) => {
        const [track] = e.streams[0]?.getTracks() ?? [];
        const t = track ?? e.track;
        if (t && !remote.getTracks().some((x) => x.id === t.id)) remote.addTrack(t);
        publishStreams();
      };
      pc.onicecandidate = (e) => {
        if (e.candidate && callId) void sendSignal(callId, peerId, "ice", e.candidate.toJSON());
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed") {
          notifyRef.current("Соединение с одним из участников потеряно");
        }
      };

      const link: PeerLink = {
        pc,
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
  const syncMesh = useCallback(
    async (state: CallState) => {
      if (syncingRef.current) return;
      syncingRef.current = true;
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
          const existing = linksRef.current.get(p.userId);
          const pc = existing?.pc ?? createLink(p.userId).pc;
          const link = linksRef.current.get(p.userId)!;

          // 1) Собеседник опубликовал SDP-оффер — значит, он ждёт мой answer
          if (p.sdp) {
            const remoteChanged =
              pc.remoteDescription?.sdp !== p.sdp ||
              (pc.signalingState === "stable" && !existing);
            if (remoteChanged) {
              try {
                // Встречные офферы: «вежливая» сторона откатывает свой
                if (pc.signalingState === "have-local-offer" && !iShouldOffer(p.userId)) {
                  await pc.setLocalDescription({ type: "rollback" });
                  link.offering = false;
                  link.offeringSince = null;
                }
                await pc.setRemoteDescription({ type: "offer", sdp: p.sdp });
                link.publishedSdp = p.sdp;
                await flushIce(link);
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                await sendSignal(callId, p.userId, "answer", {
                  type: answer.type,
                  sdp: answer.sdp,
                });
                continue;
              } catch {
                /* попробуем на следующем опросе */
              }
            }
          }

          // 2) Входящие сигналы (answer / ice) от этого участника
          for (const sig of state.signals.filter((s) => s.from === p.userId)) {
            try {
              if (sig.kind === "answer" && typeof sig.payload?.sdp === "string") {
                if (pc.signalingState === "have-local-offer") {
                  await pc.setRemoteDescription({ type: "answer", sdp: sig.payload.sdp });
                  link.offering = false; // согласование завершено
                  link.offeringSince = null;
                  await flushIce(link);
                }
              } else if (sig.kind === "ice" && sig.payload) {
                if (pc.remoteDescription) await pc.addIceCandidate(sig.payload as RTCIceCandidateInit);
                else link.pendingIce.push(sig.payload as RTCIceCandidateInit);
              } else if (sig.kind === "offer" && typeof sig.payload?.sdp === "string") {
                // Внезапный оффер (например, после включения камеры)
                if (pc.signalingState === "have-local-offer" && iShouldOffer(p.userId)) {
                  // «Невоспитанная» сторона игнорирует встречный оффер
                  continue;
                }
                if (pc.signalingState !== "stable") {
                  await pc.setLocalDescription({ type: "rollback" }).catch(() => {});
                }
                await pc.setRemoteDescription({ type: "offer", sdp: sig.payload.sdp });
                await flushIce(link);
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                await sendSignal(callId, p.userId, "answer", { type: answer.type, sdp: answer.sdp });
              }
            } catch {
              /* сигнал обработаем повторно */
            }
          }

          // 3) Моя очередь предлагать — создаём/обновляем оффер
          if (iShouldOffer(p.userId)) {
            // Ответ потерялся (сеть/вкладка спала) — откатываемся и пробуем снова,
            // иначе соединение навсегда останется в have-local-offer без звука.
            if (
              link.offering &&
              link.offeringSince !== null &&
              Date.now() - link.offeringSince > OFFER_RETRY_MS &&
              pc.signalingState === "have-local-offer"
            ) {
              await pc.setLocalDescription({ type: "rollback" }).catch(() => {});
              link.offering = false;
              link.offeringSince = null;
            }

            const needOffer =
              !existing || (pc.signalingState === "stable" && !pc.remoteDescription);
            if (needOffer && !link.offering) {
              try {
                link.offering = true;
                link.offeringSince = Date.now();
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                await sendSignal(callId, p.userId, "offer", { type: offer.type, sdp: offer.sdp });
              } catch {
                link.offering = false;
                link.offeringSince = null;
              }
            }
          }
        }
      } finally {
        syncingRef.current = false;
      }
    },
    [createLink, dropPeer, flushIce, iShouldOffer, sendSignal],
  );

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
      sessionRef.current = next;
      setSession(next);
      setIncoming(null);
      incomingRef.current = null;
      void syncMesh(state);
    },
    [cleanup, syncMesh],
  );

  /* ─────────────────────── вход в комнату ─────────────────────── */

  const acquireMedia = useCallback(async (media: CallMedia): Promise<MediaStream> => {
    try {
      return await navigator.mediaDevices.getUserMedia({ audio: true, video: media === "video" });
    } catch (err) {
      if (media === "video") {
        // Камеры может не быть — продолжаем хотя бы с аудио
        try {
          const audioOnly = await navigator.mediaDevices.getUserMedia({ audio: true });
          notifyRef.current("Камера недоступна — переключаемся на аудио");
          return audioOnly;
        } catch {
          /* упадём ниже */
        }
      }
      throw err;
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
      let stream: MediaStream | null = null;
      try {
        stream = await acquireMedia(opts.media);
        localStreamRef.current = stream;
        const videoOn = stream.getVideoTracks().some((t) => t.enabled);
        setCameraOn(videoOn);
        setMuted(false);

        let state: CallState;
        if (opts.callId) {
          const d = await api<{ call: CallState }>(`/api/calls/${opts.callId}`, {
            method: "POST",
            body: JSON.stringify({ action: "join", token: opts.token ?? null, videoOn, muted: false }),
          });
          state = d.call;
        } else {
          const d = await api<{ call: CallState }>("/api/calls", {
            method: "POST",
            body: JSON.stringify({ conversationId: opts.conversationId, media: opts.media }),
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

  // Закрытие вкладки во время звонка — деликатно выходим из комнаты
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
    return () => window.removeEventListener("beforeunload", onLeave);
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

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      localStreamRef.current?.getAudioTracks().forEach((t) => (t.enabled = !next));
      const s = sessionRef.current;
      if (s) void api(`/api/calls/${s.id}`, { method: "POST", body: JSON.stringify({ action: "state", muted: next }) }).catch(() => {});
      return next;
    });
  }, []);

  /**
   * Повторное согласование со всеми: нужно, когда изменился состав дорожек
   * (включили камеру). Оффер шлёт та же сторона, что и при первом соединении;
   * остальные участники просто получат новый оффер сигналом.
   */
  const renegotiateAll = useCallback(async () => {
    for (const [peerId, l] of Array.from(linksRef.current.entries())) {
      if (!iShouldOffer(peerId)) continue;
      try {
        l.offering = true;
        l.offeringSince = Date.now();
        const offer = await l.pc.createOffer();
        await l.pc.setLocalDescription(offer);
        const s = sessionRef.current;
        if (s) await sendSignal(s.id, peerId, "offer", { type: offer.type, sdp: offer.sdp });
      } catch {
        l.offering = false;
        l.offeringSince = null;
      }
    }
  }, [iShouldOffer, sendSignal]);

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
          linksRef.current.forEach((l) => l.pc.addTrack(track, local));
        } else {
          localStreamRef.current = video;
        }
      } catch {
        notifyRef.current("Камера недоступна");
        return;
      }
    }

    setCameraOn((on) => {
      const next = !on;
      localStreamRef.current?.getVideoTracks().forEach((t) => (t.enabled = next));
      void api(`/api/calls/${s.id}`, {
        method: "POST",
        body: JSON.stringify({ action: "state", videoOn: next }),
      }).catch(() => {});
      return next;
    });

    // Сообщаем остальным, что состав дорожек изменился
    void renegotiateAll();
  }, [cameraOn, renegotiateAll]);

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
    seconds,
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
    getShareLink,
    inviteUsers,
  };
}

export type CallController = ReturnType<typeof useCallController>;
export type { IncomingCall, PublicUser };
