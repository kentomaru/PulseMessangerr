"use client";

/**
 * Контроллер звонков (WebRTC) для Pulse.
 *
 * Сервер (Next.js API) выступает сигнальным центром через короткий опрос:
 *  1. Звонящий: POST /api/calls        — SDP-offer + статус «ringing».
 *  2. Вызываемый: GET /api/calls/incoming — видит звонок, показывает входящий.
 *  3. Вызываемый: POST /api/calls/[id] {action:"answer"} — SDP-answer.
 *  4. Оба: POST /api/calls/[id] {action:"ice"} — обмен ICE-кандидатами
 *     (GET /api/calls/[id] отдаёт кандидаты второй стороны).
 *  5. POST /api/calls/[id] {action:"hangup"|"decline"} — завершение.
 * Сам аудио/видео поток идёт напрямую между браузерами (P2P), минуя сервер.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import type {
  ActiveCall,
  CallMedia,
  CallPayload,
  PublicUser,
} from "@/lib/types";

const ICE_SERVERS: RTCIceServer[] = [
  { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
];

export type OngoingCall = ActiveCall;
export type IncomingCall = CallPayload & { peer: PublicUser };

const INCOMING_POLL_MS = 3_000;
const CALL_POLL_MS = 1_200;

/**
 * Рингтон для входящего звонка — генерируется через WebAudio,
 * никаких внешних файлов: две ноты по 0.4 с каждые 2 секунды.
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
) {
  const [call, setCall] = useState<OngoingCall | null>(null);
  const [incoming, setIncoming] = useState<IncomingCall | null>(null);
  const [muted, setMuted] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [seconds, setSeconds] = useState(0);
  /** Счётчик изменений удалённого потока — чтобы <video> переподключался. */
  const [streamTick, setStreamTick] = useState(0);
  /** true, пока идёт запрос на старт/приём звонка (кнопки блокируются). */
  const [starting, setStarting] = useState(false);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const callRef = useRef<OngoingCall | null>(null);
  const incomingRef = useRef<IncomingCall | null>(null);
  const appliedIceRef = useRef(0);
  const answeredRef = useRef(false);
  const notifyRef = useRef(notify);
  const meIdRef = useRef(meId);
  meIdRef.current = meId;
  const unauthorizedRef = useRef(onUnauthorized);
  /** Идёт попытка начать/принять звонок — защита от двойного клика. */
  const busyRef = useRef(false);
  const ringtoneRef = useRef<{ stop: () => void } | null>(null);
  notifyRef.current = notify;
  unauthorizedRef.current = onUnauthorized;
  incomingRef.current = incoming;
  callRef.current = call;

  const setPhase = useCallback((phase: OngoingCall["phase"]) => {
    setCall((c) => (c ? { ...c, phase } : c));
  }, []);

  const cleanup = useCallback(() => {
    try {
      pcRef.current?.getSenders().forEach((s) => s.track?.stop());
      pcRef.current?.close();
    } catch {
      /* уже закрыт */
    }
    pcRef.current = null;
    ringtoneRef.current?.stop();
    ringtoneRef.current = null;
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    remoteStreamRef.current = null;
    callRef.current = null;
    appliedIceRef.current = 0;
    answeredRef.current = false;
    setCall(null);
    setIncoming(null);
    setSeconds(0);
    setMuted(false);
    setCameraOn(false);
    setStarting(false);
    busyRef.current = false;
  }, []);

  const sendIce = useCallback(async (callId: string, side: "caller" | "callee", candidate: RTCIceCandidateInit) => {
    try {
      await api(`/api/calls/${callId}`, {
        method: "POST",
        body: JSON.stringify({ action: "ice", candidate }),
      });
    } catch {
      /* кандидат дойдет со следующим onicecandidate */
    }
  }, []);

  const applyRemoteIce = useCallback(async (info: CallPayload, role: "caller" | "callee") => {
    const pc = pcRef.current;
    if (!pc) return;
    const list = role === "caller" ? info.calleeIce : info.callerIce;
    const fresh = list.slice(appliedIceRef.current);
    for (const c of fresh) {
      try {
        await pc.addIceCandidate(c);
      } catch {
        /* устаревший кандидат */
      }
    }
    appliedIceRef.current = list.length;
  }, []);

  const createPeer = useCallback(
    (role: "caller" | "callee"): RTCPeerConnection => {
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      const local = localStreamRef.current;
      if (local) local.getTracks().forEach((t) => pc.addTrack(t, local));

      const remote = new MediaStream();
      remoteStreamRef.current = remote;

      pc.ontrack = (e) => {
        e.streams[0]?.getTracks().forEach((t) => {
          if (!remote.getTracks().some((x) => x.id === t.id)) remote.addTrack(t);
        });
        setStreamTick((v) => v + 1);
      };
      pc.onicecandidate = (e) => {
        const c = callRef.current;
        if (e.candidate && c) void sendIce(c.id, role, e.candidate.toJSON());
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed") {
          notifyRef.current("Соединение потеряно");
        }
      };
      pcRef.current = pc;
      return pc;
    },
    [sendIce],
  );

  /* ─────────── Звонящий ─────────── */

  const startCall = useCallback(
    async (conversationId: string, peer: PublicUser, media: CallMedia = "audio", retry = false) => {
      // Защита от двойного клика и от звонка поверх активного/входящего.
      if (callRef.current || incomingRef.current || busyRef.current) return;
      busyRef.current = true;
      setStarting(true);
      let stream: MediaStream | null = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: media === "video",
        });
        localStreamRef.current = stream;
        const pc = createPeer("caller");
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        const d = await api<{ call: CallPayload }>("/api/calls", {
          method: "POST",
          body: JSON.stringify({ conversationId, media, offerSdp: offer.sdp }),
        });

        const ongoing: OngoingCall = {
          id: d.call.id,
          conversationId,
          role: "caller",
          phase: "outgoing",
          peer,
          media,
        };
        callRef.current = ongoing;
        setCall(ongoing);
        setCameraOn(media === "video");
      } catch (err) {
        stream?.getTracks().forEach((t) => t.stop());
        cleanup();

        if (err instanceof ApiError && err.status === 401) {
          unauthorizedRef.current();
          return;
        }

        // 409 — в чате уже висит звонок. Сервер прислал его тело.
        if (err instanceof ApiError && err.status === 409 && err.payload?.call) {
          const busyCall = err.payload.call;

          // Это мой же зависший звонок → отменяем его и звоним заново (один раз).
          if (busyCall.callerId === meIdRef.current) {
            try {
              await api(`/api/calls/${busyCall.id}`, {
                method: "POST",
                body: JSON.stringify({ action: "hangup" }),
              });
            } catch {
              /* уже закрыт */
            }
            if (!retry) {
              busyRef.current = false;
              setStarting(false);
              await startCallRef.current?.(conversationId, peer, media, true);
              return;
            }
            notifyRef.current("Предыдущий звонок закрыт, попробуйте ещё раз");
            return;
          }

          // Чужой звонок мне же — показываем как входящий, а не как ошибку.
          if (busyCall.calleeId === meIdRef.current && busyCall.status === "ringing" && busyCall.offerSdp) {
            const inc: IncomingCall = { ...busyCall, peer: busyCall.caller ?? peer };
            incomingRef.current = inc;
            setIncoming(inc);
            return;
          }

          notifyRef.current(err.message);
          return;
        }

        if (err instanceof ApiError) notifyRef.current(err.message);
        else if (err instanceof Error && err.name === "NotAllowedError")
          notifyRef.current("Нет доступа к микрофону или камере — разрешите доступ в браузере");
        else notifyRef.current("Не удалось начать звонок");
      } finally {
        busyRef.current = false;
        setStarting(false);
      }
    },
    [cleanup, createPeer],
  );

  const startCallRef = useRef(startCall);
  startCallRef.current = startCall;

  /* ─────────── Вызываемый: входящие ─────────── */

  useEffect(() => {
    const t = setInterval(async () => {
      if (callRef.current || incomingRef.current) return;
      try {
        const d = await api<{ calls: CallPayload[] }>("/api/calls/incoming");
        const c = d.calls[0];
        if (c?.caller && c.offerSdp) {
          const inc: IncomingCall = { ...c, peer: c.caller };
          incomingRef.current = inc;
          setIncoming(inc);
        }
      } catch (e) {
        // Сессия кончилась — уводим на экран входа, иначе опрос будет
        // вечно долбить 401 (как после удаления аккаунта).
        if (e instanceof ApiError && e.status === 401) unauthorizedRef.current();
        /* иначе сеть моргнула — попробуем в следующий раз */
      }
    }, INCOMING_POLL_MS);
    return () => clearInterval(t);
  }, []);

  const accept = useCallback(async () => {
    const inc = incomingRef.current;
    if (!inc?.offerSdp || busyRef.current) return;
    busyRef.current = true;
    setStarting(true);
    let stream: MediaStream | null = null;
    try {
      const media = inc.media;
      stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: media === "video",
      });
      localStreamRef.current = stream;
      const pc = createPeer("callee");
      await pc.setRemoteDescription({ type: "offer", sdp: inc.offerSdp });
      await applyRemoteIce(inc, "callee");
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      await api(`/api/calls/${inc.id}`, {
        method: "POST",
        body: JSON.stringify({ action: "answer", answerSdp: answer.sdp }),
      });

      const ongoing: OngoingCall = {
        id: inc.id,
        conversationId: inc.conversationId,
        role: "callee",
        phase: "connecting",
        peer: inc.peer,
        media,
      };
      incomingRef.current = null;
      callRef.current = ongoing;
      setIncoming(null);
      setCall(ongoing);
      setCameraOn(media === "video");
    } catch (err) {
      stream?.getTracks().forEach((t) => t.stop());
      cleanup();
      if (err instanceof ApiError && err.status === 401) {
        unauthorizedRef.current();
        return;
      }
      notifyRef.current(err instanceof Error ? `Не удалось принять звонок: ${err.message}` : "Не удалось принять звонок");
    } finally {
      busyRef.current = false;
      setStarting(false);
    }
  }, [applyRemoteIce, cleanup, createPeer]);

  const decline = useCallback(async () => {
    const inc = incomingRef.current;
    if (!inc) return;
    incomingRef.current = null;
    setIncoming(null);
    try {
      await api(`/api/calls/${inc.id}`, {
        method: "POST",
        body: JSON.stringify({ action: "decline" }),
      });
    } catch {
      /* звонок уже завершён на другой стороне */
    }
  }, []);

  /* ─────────── Завершение ─────────── */

  const hangup = useCallback(async () => {
    const c = callRef.current;
    const inc = incomingRef.current;
    cleanup();
    try {
      if (c) {
        await api(`/api/calls/${c.id}`, {
          method: "POST",
          body: JSON.stringify({ action: "hangup" }),
        });
      } else if (inc) {
        await api(`/api/calls/${inc.id}`, {
          method: "POST",
          body: JSON.stringify({ action: "decline" }),
        });
      }
    } catch {
      /* вторая сторона уже завершила */
    }
  }, [cleanup]);

  // При закрытии вкладки во время звонка — деликатно завершаем
  useEffect(() => {
    const onLeave = () => {
      const c = callRef.current;
      const inc = incomingRef.current;
      const id = c?.id ?? inc?.id;
      const action = c ? "hangup" : "decline";
      if (id) {
        void fetch(`/api/calls/${id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
          keepalive: true,
          credentials: "include",
        });
      }
    };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, []);

  /* ─────────── Опрос состояния активного звонка ─────────── */

  useEffect(() => {
    const t = setInterval(async () => {
      const c = callRef.current;
      if (!c) return;
      try {
        const d = await api<{ call: CallPayload }>(`/api/calls/${c.id}`);
        const info = d.call;
        const pc = pcRef.current;

        if (info.answerSdp && pc && !answeredRef.current) {
          answeredRef.current = true;
          await pc.setRemoteDescription({ type: "answer", sdp: info.answerSdp });
          setPhase("connecting");
        }
        if (info.answerSdp) await applyRemoteIce(info, c.role);

        if (info.status === "active" && c.phase !== "active") setPhase("active");

        if (info.status === "ended" || info.status === "declined" || info.status === "missed") {
          cleanup();
          if (c.role === "caller") {
            if (info.status === "declined") notifyRef.current("Звонок отклонён");
            else if (info.status === "missed") notifyRef.current("Без ответа");
            else notifyRef.current("Звонок завершён");
          } else {
            notifyRef.current("Звонок завершён");
          }
        }
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          cleanup();
          unauthorizedRef.current();
        }
        /* иначе сеть моргнула — в следующий раз */
      }
    }, CALL_POLL_MS);
    return () => clearInterval(t);
  }, [applyRemoteIce, cleanup, setPhase]);

  /* ─────────── Таймер активного звонка ─────────── */

  useEffect(() => {
    if (call?.phase !== "active") return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1_000);
    return () => clearInterval(t);
  }, [call?.phase]);

  /* ─────────── Микрофон / камера ─────────── */

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      localStreamRef.current?.getAudioTracks().forEach((t) => (t.enabled = !next));
      return next;
    });
  }, []);

  const toggleCamera = useCallback(() => {
    setCameraOn((on) => {
      const next = !on;
      localStreamRef.current?.getVideoTracks().forEach((t) => (t.enabled = next));
      return next;
    });
  }, []);

  /* ─────────── Рингтон входящего ─────────── */

  useEffect(() => {
    if (!incoming) {
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
  }, [incoming]);

  return {
    call,
    incoming,
    starting,
    muted,
    cameraOn,
    seconds,
    streamTick,
    localStreamRef,
    remoteStreamRef,
    startCall,
    accept,
    decline,
    hangup,
    toggleMute,
    toggleCamera,
  };
}
