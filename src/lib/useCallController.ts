"use client";

/**
 * WebRTC-контроллер звонков Pulse.
 *
 * Сервер хранит только сигналинг (SDP и ICE-кандидаты). Медиа-потоки идут
 * напрямую между браузерами. Важные детали:
 *  — ICE-кандидаты, появившиеся до ответа POST /api/calls, ставятся в очередь;
 *  — вызываемый никогда не применяет собственный answer как remote description;
 *  — состояние звонка очищается при реальном разрыве, поэтому повторный звонок
 *    запускается одним нажатием обычной кнопки вызова.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { ActiveCall, CallMedia, CallPayload, PublicUser } from "@/lib/types";

const TURN_URL = process.env.NEXT_PUBLIC_TURN_URL;
const ICE_SERVERS: RTCIceServer[] = [
  { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
  { urls: "stun:stun.cloudflare.com:3478" },
  ...(TURN_URL
    ? [
        {
          urls: TURN_URL,
          username: process.env.NEXT_PUBLIC_TURN_USERNAME,
          credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL,
        },
      ]
    : []),
];

export type OngoingCall = ActiveCall;
export type IncomingCall = CallPayload & { peer: PublicUser };

const INCOMING_POLL_MS = 2_000;
const CALL_POLL_MS = 700;
const DISCONNECTED_GRACE_MS = 8_000;

/** Рингтон входящего звонка без внешнего файла. */
function startRingtone(): { stop: () => void } | null {
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    const ctx = new Ctx();
    void ctx.resume().catch(() => {});
    let stopped = false;

    const beep = (frequency: number, at: number, duration: number) => {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(0.14, at + 0.04);
      gain.gain.setValueAtTime(0.14, at + duration - 0.06);
      gain.gain.linearRampToValueAtTime(0, at + duration);
      oscillator.connect(gain).connect(ctx.destination);
      oscillator.start(at);
      oscillator.stop(at + duration + 0.02);
    };

    const cycle = () => {
      if (stopped) return;
      const start = ctx.currentTime + 0.02;
      beep(880, start, 0.35);
      beep(660, start + 0.42, 0.35);
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
  const [streamTick, setStreamTick] = useState(0);
  const [starting, setStarting] = useState(false);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const callRef = useRef<OngoingCall | null>(null);
  const incomingRef = useRef<IncomingCall | null>(null);
  const signalCallIdRef = useRef<string | null>(null);
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);
  const appliedIceRef = useRef(0);
  const answeredRef = useRef(false);
  const busyRef = useRef(false);
  const endingRef = useRef(false);
  const disconnectedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ringtoneRef = useRef<{ stop: () => void } | null>(null);
  const notifyRef = useRef(notify);
  const unauthorizedRef = useRef(onUnauthorized);
  const meIdRef = useRef(meId);

  notifyRef.current = notify;
  unauthorizedRef.current = onUnauthorized;
  meIdRef.current = meId;
  callRef.current = call;
  incomingRef.current = incoming;

  const setPhase = useCallback((phase: OngoingCall["phase"]) => {
    setCall((current) => {
      if (!current) return current;
      const next = { ...current, phase };
      callRef.current = next;
      return next;
    });
  }, []);

  const clearDisconnectedTimer = useCallback(() => {
    if (disconnectedTimerRef.current) {
      clearTimeout(disconnectedTimerRef.current);
      disconnectedTimerRef.current = null;
    }
  }, []);

  const cleanup = useCallback(() => {
    clearDisconnectedTimer();

    const pc = pcRef.current;
    pcRef.current = null;
    if (pc) {
      // Не даём событию "closed" от нашей очистки выглядеть как новый разрыв.
      pc.onconnectionstatechange = null;
      pc.oniceconnectionstatechange = null;
      try {
        pc.getSenders().forEach((sender) => sender.track?.stop());
        pc.close();
      } catch {
        /* соединение уже закрыто */
      }
    }

    ringtoneRef.current?.stop();
    ringtoneRef.current = null;
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    remoteStreamRef.current?.getTracks().forEach((track) => track.stop());
    remoteStreamRef.current = null;
    signalCallIdRef.current = null;
    pendingIceRef.current = [];
    appliedIceRef.current = 0;
    answeredRef.current = false;
    callRef.current = null;
    incomingRef.current = null;

    setCall(null);
    setIncoming(null);
    setSeconds(0);
    setMuted(false);
    setCameraOn(false);
    setStarting(false);
    busyRef.current = false;
  }, [clearDisconnectedTimer]);

  const sendIce = useCallback(async (callId: string, candidate: RTCIceCandidateInit) => {
    try {
      await api(`/api/calls/${callId}`, {
        method: "POST",
        body: JSON.stringify({ action: "ice", candidate }),
      });
    } catch {
      // Следующий candidate или обычный опрос всё равно продолжит сигналинг.
    }
  }, []);

  const flushPendingIce = useCallback(
    async (callId: string) => {
      const pending = pendingIceRef.current;
      pendingIceRef.current = [];
      await Promise.all(pending.map((candidate) => sendIce(callId, candidate)));
    },
    [sendIce],
  );

  const applyRemoteIce = useCallback(
    async (info: CallPayload, role?: "caller" | "callee") => {
      const pc = pcRef.current;
      const currentRole = role ?? callRef.current?.role;
      if (!pc || !currentRole || !pc.remoteDescription) return;

      const candidates = currentRole === "caller" ? info.calleeIce : info.callerIce;
      const fresh = candidates.slice(appliedIceRef.current);
      for (const candidate of fresh) {
        try {
          await pc.addIceCandidate(candidate);
        } catch {
          // Браузер может отклонить устаревший candidate после смены сети.
        }
      }
      appliedIceRef.current = candidates.length;
    },
    [],
  );

  const finishUnexpected = useCallback(() => {
    const current = callRef.current;
    if (!current || endingRef.current) return;
    endingRef.current = true;
    const id = current.id;
    notifyRef.current("Соединение потеряно");
    void api(`/api/calls/${id}`, {
      method: "POST",
      body: JSON.stringify({ action: "hangup" }),
    }).catch(() => {});
    cleanup();
  }, [cleanup]);

  const createPeer = useCallback(
    (role: "caller" | "callee", callId?: string) => {
      if (callId) signalCallIdRef.current = callId;
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      const local = localStreamRef.current;
      if (local) local.getTracks().forEach((track) => pc.addTrack(track, local));

      const remote = new MediaStream();
      remoteStreamRef.current = remote;

      pc.ontrack = (event) => {
        // Некоторые браузеры заполняют event.streams, некоторые могут прислать
        // только track. В обоих случаях добавляем именно удалённую дорожку.
        const tracks = [...(event.streams[0]?.getTracks() ?? []), event.track];
        for (const track of tracks) {
          if (!remote.getTracks().some((existing) => existing.id === track.id)) {
            remote.addTrack(track);
          }
        }
        setStreamTick((value) => value + 1);
      };

      pc.onicecandidate = (event) => {
        if (!event.candidate) return;
        const callIdForIce = signalCallIdRef.current;
        const candidate = event.candidate.toJSON();
        if (callIdForIce) {
          void sendIce(callIdForIce, candidate);
        } else {
          pendingIceRef.current.push(candidate);
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "connected") {
          clearDisconnectedTimer();
          setPhase("active");
          return;
        }
        if (pc.connectionState === "disconnected") {
          clearDisconnectedTimer();
          disconnectedTimerRef.current = setTimeout(finishUnexpected, DISCONNECTED_GRACE_MS);
          return;
        }
        if (pc.connectionState === "failed" || pc.connectionState === "closed") {
          finishUnexpected();
        }
      };
      pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === "failed") finishUnexpected();
      };

      pcRef.current = pc;
      return pc;
    },
    [clearDisconnectedTimer, finishUnexpected, sendIce, setPhase],
  );

  const startCall = useCallback(
    async (
      conversationId: string,
      peer: PublicUser,
      media: CallMedia = "audio",
      retry = false,
    ) => {
      if (callRef.current || incomingRef.current || busyRef.current) return;
      busyRef.current = true;
      endingRef.current = false;
      setStarting(true);
      let stream: MediaStream | null = null;
      let handedOffToRetry = false;

      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("Браузер не поддерживает доступ к микрофону");
        }
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

        signalCallIdRef.current = d.call.id;
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
        await flushPendingIce(d.call.id);
      } catch (err) {
        stream?.getTracks().forEach((track) => track.stop());
        cleanup();

        if (err instanceof ApiError && err.status === 401) {
          unauthorizedRef.current();
          return;
        }

        if (err instanceof ApiError && err.status === 409 && err.payload?.call) {
          const busyCall = err.payload.call as CallPayload;

          if (busyCall.callerId === meIdRef.current) {
            try {
              await api(`/api/calls/${busyCall.id}`, {
                method: "POST",
                body: JSON.stringify({ action: "hangup" }),
              });
            } catch {
              /* звонок мог уже завершиться */
            }
            if (!retry) {
              // Передаём управление новому звонку. Внешний finally не должен
              // сбросить busy-состояние уже начавшейся повторной попытки.
              handedOffToRetry = true;
              busyRef.current = false;
              setStarting(false);
              endingRef.current = false;
              await startCallRef.current?.(conversationId, peer, media, true);
              return;
            }
            notifyRef.current("Предыдущий звонок закрыт — нажмите звонок ещё раз");
            return;
          }

          if (busyCall.calleeId === meIdRef.current && busyCall.status === "ringing" && busyCall.offerSdp) {
            const inc: IncomingCall = { ...busyCall, peer: busyCall.caller ?? peer };
            incomingRef.current = inc;
            setIncoming(inc);
            return;
          }
        }

        if (err instanceof ApiError) {
          notifyRef.current(err.message);
        } else if (err instanceof Error && err.name === "NotAllowedError") {
          notifyRef.current("Нет доступа к микрофону или камере — разрешите доступ в браузере");
        } else {
          notifyRef.current(err instanceof Error ? err.message : "Не удалось начать звонок");
        }
      } finally {
        if (!handedOffToRetry) {
          busyRef.current = false;
          setStarting(false);
        }
      }
    },
    [cleanup, createPeer, flushPendingIce],
  );

  const startCallRef = useRef(startCall);
  startCallRef.current = startCall;

  // Входящие звонки.
  useEffect(() => {
    const timer = setInterval(async () => {
      if (callRef.current || incomingRef.current) return;
      try {
        const d = await api<{ calls: CallPayload[] }>("/api/calls/incoming");
        const current = d.calls[0];
        if (current?.caller && current.offerSdp) {
          const inc: IncomingCall = { ...current, peer: current.caller };
          incomingRef.current = inc;
          setIncoming(inc);
        }
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) unauthorizedRef.current();
      }
    }, INCOMING_POLL_MS);
    return () => clearInterval(timer);
  }, []);

  const accept = useCallback(async () => {
    const inc = incomingRef.current;
    if (!inc?.offerSdp || busyRef.current) return;
    busyRef.current = true;
    endingRef.current = false;
    setStarting(true);
    let stream: MediaStream | null = null;

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Браузер не поддерживает доступ к микрофону");
      }
      stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: inc.media === "video",
      });
      localStreamRef.current = stream;
      signalCallIdRef.current = inc.id;

      const pc = createPeer("callee", inc.id);
      await pc.setRemoteDescription({ type: "offer", sdp: inc.offerSdp });
      await applyRemoteIce(inc, "callee");
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      answeredRef.current = true;

      await api(`/api/calls/${inc.id}`, {
        method: "POST",
        body: JSON.stringify({ action: "answer", answerSdp: answer.sdp }),
      });
      await flushPendingIce(inc.id);

      const ongoing: OngoingCall = {
        id: inc.id,
        conversationId: inc.conversationId,
        role: "callee",
        phase: "connecting",
        peer: inc.peer,
        media: inc.media,
      };
      incomingRef.current = null;
      callRef.current = ongoing;
      setIncoming(null);
      setCall(ongoing);
      setCameraOn(inc.media === "video");
    } catch (err) {
      stream?.getTracks().forEach((track) => track.stop());
      cleanup();
      if (err instanceof ApiError && err.status === 401) {
        unauthorizedRef.current();
      } else {
        notifyRef.current(
          err instanceof Error ? `Не удалось принять звонок: ${err.message}` : "Не удалось принять звонок",
        );
      }
    } finally {
      busyRef.current = false;
      setStarting(false);
    }
  }, [applyRemoteIce, cleanup, createPeer, flushPendingIce]);

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
      /* Вторая сторона могла уже завершить звонок. */
    }
  }, []);

  const hangup = useCallback(async () => {
    const current = callRef.current;
    const inc = incomingRef.current;
    const id = current?.id ?? inc?.id;
    const action = current ? "hangup" : "decline";
    endingRef.current = true;
    cleanup();
    if (!id) {
      endingRef.current = false;
      return;
    }
    try {
      await api(`/api/calls/${id}`, {
        method: "POST",
        body: JSON.stringify({ action }),
      });
    } catch {
      /* Вторая сторона могла уже завершить звонок. */
    } finally {
      endingRef.current = false;
    }
  }, [cleanup]);

  // Завершаем сигналинг, если вкладку закрыли во время звонка.
  useEffect(() => {
    const onLeave = () => {
      const current = callRef.current;
      const inc = incomingRef.current;
      const id = current?.id ?? inc?.id;
      if (!id) return;
      void fetch(`/api/calls/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: current ? "hangup" : "decline" }),
        keepalive: true,
        credentials: "include",
      });
    };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, []);

  // Обмен answer/ICE и обнаружение удалённого завершения.
  useEffect(() => {
    const timer = setInterval(async () => {
      const current = callRef.current;
      if (!current) return;
      try {
        const d = await api<{ call: CallPayload }>(`/api/calls/${current.id}`);
        const info = d.call;
        const pc = pcRef.current;

        // Только caller принимает answer. Callee уже установил offer как remote
        // description и не должен устанавливать собственный answer ещё раз.
        if (current.role === "caller" && info.answerSdp && pc && !answeredRef.current) {
          await pc.setRemoteDescription({ type: "answer", sdp: info.answerSdp });
          answeredRef.current = true;
          setPhase("connecting");
        }
        if (info.answerSdp) await applyRemoteIce(info);

        if (pc?.connectionState === "failed" || pc?.iceConnectionState === "failed") {
          finishUnexpected();
          return;
        }
        if (pc?.connectionState === "connected") setPhase("active");

        if (info.status === "ended" || info.status === "declined" || info.status === "missed") {
          const wasCaller = current.role === "caller";
          endingRef.current = true;
          cleanup();
          if (wasCaller) {
            if (info.status === "declined") notifyRef.current("Звонок отклонён");
            else if (info.status === "missed") notifyRef.current("Без ответа");
            else notifyRef.current("Звонок завершён");
          } else {
            notifyRef.current("Звонок завершён");
          }
          endingRef.current = false;
        }
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          cleanup();
          unauthorizedRef.current();
        }
      }
    }, CALL_POLL_MS);
    return () => clearInterval(timer);
  }, [applyRemoteIce, cleanup, finishUnexpected, setPhase]);

  useEffect(() => {
    if (call?.phase !== "active") return;
    const timer = setInterval(() => setSeconds((value) => value + 1), 1_000);
    return () => clearInterval(timer);
  }, [call?.phase]);

  const toggleMute = useCallback(() => {
    setMuted((value) => {
      const next = !value;
      localStreamRef.current?.getAudioTracks().forEach((track) => (track.enabled = !next));
      return next;
    });
  }, []);

  const toggleCamera = useCallback(() => {
    setCameraOn((value) => {
      const next = !value;
      localStreamRef.current?.getVideoTracks().forEach((track) => (track.enabled = next));
      return next;
    });
  }, []);

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
