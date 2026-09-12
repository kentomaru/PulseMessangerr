"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Ringer } from "./sounds";
import type { ActiveCall, CallPayload, CallPeer } from "./pulse";

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`request failed: ${res.status}`);
  return res.json() as Promise<T>;
}

function waitForIce(pc: RTCPeerConnection, timeoutMs = 3500) {
  return new Promise<void>((resolve) => {
    if (pc.iceGatheringState === "complete") return resolve();
    const done = () => {
      clearTimeout(to);
      pc.removeEventListener("icegatheringstatechange", onChange);
      resolve();
    };
    const onChange = () => {
      if (pc.iceGatheringState === "complete") done();
    };
    const to = setTimeout(done, timeoutMs);
    pc.addEventListener("icegatheringstatechange", onChange);
  });
}

export type ToastFn = (msg: string) => void;

export function useCallController(notify: ToastFn) {
  const [call, setCall] = useState<ActiveCall | null>(null);
  const [incoming, setIncoming] = useState<CallPayload | null>(null);
  const [muted, setMuted] = useState(false);
  const [seconds, setSeconds] = useState(0);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const callRef = useRef<ActiveCall | null>(null);
  const incomingRef = useRef<CallPayload | null>(null);
  const remoteDescRef = useRef(false);
  const mutedRef = useRef(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const ringerRef = useRef<Ringer | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const syncCall = (c: ActiveCall | null) => {
    callRef.current = c;
    setCall(c);
  };
  const syncIncoming = (c: CallPayload | null) => {
    incomingRef.current = c;
    setIncoming(c);
  };

  const getRinger = () => {
    if (!ringerRef.current) ringerRef.current = new Ringer();
    return ringerRef.current;
  };

  const getAudio = () => {
    if (!audioRef.current && typeof window !== "undefined") {
      const el = document.createElement("audio");
      el.autoplay = true;
      audioRef.current = el;
    }
    return audioRef.current;
  };

  const cleanup = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    try {
      pcRef.current?.close();
    } catch {
      /* noop */
    }
    pcRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (audioRef.current) audioRef.current.srcObject = null;
    remoteDescRef.current = false;
    mutedRef.current = false;
    setMuted(false);
    setSeconds(0);
    syncCall(null);
  }, []);

  const finishRemote = useCallback(
    (status: string) => {
      getRinger().ended();
      notify(
        status === "declined"
          ? "Звонок отклонён"
          : status === "missed"
            ? "Нет ответа"
            : "Звонок завершён",
      );
      cleanup();
    },
    [cleanup, notify],
  );

  const startTimer = () => {
    if (timerRef.current) return;
    timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
  };

  const ensurePc = async () => {
    if (pcRef.current) return pcRef.current;
    const pc = new RTCPeerConnection(RTC_CONFIG);
    pcRef.current = pc;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    });
    streamRef.current = stream;
    stream.getAudioTracks().forEach((t) => {
      t.enabled = !mutedRef.current;
      pc.addTrack(t, stream);
    });
    pc.ontrack = (e) => {
      const el = getAudio();
      if (el) {
        el.srcObject = e.streams[0];
        el.play().catch(() => {});
      }
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" && callRef.current) {
        void (async () => {
          try {
            await api(`/api/calls/${callRef.current!.id}`, {
              method: "POST",
              body: JSON.stringify({ action: "end" }),
            });
          } catch {
            /* noop */
          }
          notify("Соединение потеряно");
          cleanup();
        })();
      }
    };
    return pc;
  };

  const startPolling = useCallback(
    (callId: number) => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        const cur = callRef.current;
        if (!cur || cur.id !== callId) return;
        try {
          const { call: c } = await api<{ call: CallPayload }>(`/api/calls/${callId}`);
          if (c.status === "active" && c.answerSdp && !remoteDescRef.current && cur.role === "caller") {
            remoteDescRef.current = true;
            const pc = pcRef.current;
            if (pc) {
              try {
                await pc.setRemoteDescription({ type: "answer", sdp: c.answerSdp });
              } catch {
                /* noop */
              }
            }
            getRinger().connected();
            syncCall({ ...cur, phase: "active" });
            startTimer();
            return;
          }
          if (c.status === "ended" || c.status === "declined" || c.status === "missed") {
            finishRemote(c.status);
          }
        } catch {
          /* network hiccup — keep polling */
        }
      }, 1500);
    },
    [finishRemote],
  );

  const startCall = useCallback(
    async (chatId: number, peer: CallPeer) => {
      if (callRef.current) return;
      let pc: RTCPeerConnection;
      try {
        pc = await ensurePc();
      } catch {
        notify("Нет доступа к микрофону. Разрешите микрофон и попробуйте снова.");
        cleanup();
        return;
      }
      try {
        const { call: created } = await api<{ call: CallPayload }>("/api/calls", {
          method: "POST",
          body: JSON.stringify({ chatId }),
        });
        syncCall({ id: created.id, chatId, role: "caller", phase: "outgoing", peer });
        getRinger().startOutgoing();

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await waitForIce(pc);
        if (!callRef.current) return;
        await api(`/api/calls/${created.id}`, {
          method: "POST",
          body: JSON.stringify({ action: "offer", sdp: pc.localDescription?.sdp ?? "" }),
        });
        startPolling(created.id);
      } catch {
        notify("Не удалось начать звонок");
        cleanup();
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [cleanup, notify, startPolling],
  );

  const accept = useCallback(async () => {
    const inc = incomingRef.current;
    if (!inc) return;
    syncIncoming(null);
    getRinger().stop();

    let pc: RTCPeerConnection;
    try {
      pc = await ensurePc();
    } catch {
      notify("Нет доступа к микрофону. Разрешите микрофон и попробуйте снова.");
      try {
        await api(`/api/calls/${inc.id}`, {
          method: "POST",
          body: JSON.stringify({ action: "end" }),
        });
      } catch {
        /* noop */
      }
      cleanup();
      return;
    }

    const peer = inc.caller as CallPeer;
    syncCall({
      id: inc.id,
      chatId: inc.chatId,
      role: "callee",
      phase: "connecting",
      peer,
    });

    try {
      // caller may still be sending the offer — wait for it
      let offerSdp = inc.offerSdp;
      for (let i = 0; !offerSdp && i < 25; i++) {
        const { call: c } = await api<{ call: CallPayload }>(`/api/calls/${inc.id}`);
        if (c.status !== "ringing") throw new Error("cancelled");
        offerSdp = c.offerSdp;
        if (!offerSdp) await sleep(700);
      }
      if (!offerSdp) throw new Error("no offer");

      remoteDescRef.current = true;
      await pc.setRemoteDescription({ type: "offer", sdp: offerSdp });
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await waitForIce(pc);
      if (!callRef.current) return;
      await api(`/api/calls/${inc.id}`, {
        method: "POST",
        body: JSON.stringify({ action: "answer", sdp: pc.localDescription?.sdp ?? "" }),
      });
      getRinger().connected();
      const cur = callRef.current;
      if (cur) syncCall({ ...cur, phase: "active" });
      startTimer();
      startPolling(inc.id);
    } catch {
      notify("Звонок был отменён");
      cleanup();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cleanup, notify, startPolling]);

  const decline = useCallback(async () => {
    const inc = incomingRef.current;
    syncIncoming(null);
    getRinger().stop();
    if (inc) {
      try {
        await api(`/api/calls/${inc.id}`, {
          method: "POST",
          body: JSON.stringify({ action: "end" }),
        });
      } catch {
        /* noop */
      }
    }
  }, []);

  const hangup = useCallback(async () => {
    const cur = callRef.current;
    if (!cur) return;
    try {
      await api(`/api/calls/${cur.id}`, {
        method: "POST",
        body: JSON.stringify({ action: "end" }),
      });
    } catch {
      /* noop */
    }
    getRinger().ended();
    cleanup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cleanup]);

  const toggleMute = useCallback(() => {
    const next = !mutedRef.current;
    mutedRef.current = next;
    streamRef.current?.getAudioTracks().forEach((t) => {
      t.enabled = !next;
    });
    setMuted(next);
  }, []);

  // poll for incoming calls
  useEffect(() => {
    let stopped = false;
    const poll = async () => {
      try {
        const { call: inc } = await api<{ call: CallPayload | null }>("/api/calls/incoming");
        if (stopped) return;
        if (inc && callRef.current) {
          // busy — auto decline
          api(`/api/calls/${inc.id}`, {
            method: "POST",
            body: JSON.stringify({ action: "end" }),
          }).catch(() => {});
          return;
        }
        if (inc) {
          if (incomingRef.current?.id !== inc.id) {
            syncIncoming(inc);
            getRinger().startIncoming();
          }
        } else if (incomingRef.current) {
          syncIncoming(null);
          getRinger().stop();
        }
      } catch {
        /* ignore */
      }
    };
    void poll();
    const t = setInterval(poll, 2500);
    return () => {
      stopped = true;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // full cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
      ringerRef.current?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { call, incoming, muted, seconds, startCall, accept, decline, hangup, toggleMute };
}
