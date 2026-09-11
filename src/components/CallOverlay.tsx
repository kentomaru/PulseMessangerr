"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  Video,
  VideoOff,
  Volume2,
} from "lucide-react";
import Avatar from "./Avatar";
import { formatDuration } from "@/lib/format";
import type { OngoingCall, IncomingCall } from "@/lib/useCallController";

type Props = {
  call: OngoingCall | null;
  incoming: IncomingCall | null;
  muted: boolean;
  cameraOn: boolean;
  seconds: number;
  streamTick: number;
  localStreamRef: React.RefObject<MediaStream | null>;
  remoteStreamRef: React.RefObject<MediaStream | null>;
  onAccept: () => void;
  onDecline: () => void;
  onHangup: () => void;
  onToggleMute: () => void;
  onToggleCamera: () => void;
  audioInputs: MediaDeviceInfo[];
  selectedAudioInputId: string;
  micStatus: string;
  onSelectAudioInput: (deviceId: string) => void;
};

function statusText(call: OngoingCall | null, seconds: number) {
  if (!call) return "";
  switch (call.phase) {
    case "outgoing":
      return "Вызываем…";
    case "connecting":
      return "Соединение…";
    case "active":
      return formatDuration(seconds);
    default:
      return "";
  }
}

export default function CallOverlay({
  call,
  incoming,
  muted,
  cameraOn,
  seconds,
  streamTick,
  localStreamRef,
  remoteStreamRef,
  onAccept,
  onDecline,
  onHangup,
  onToggleMute,
  onToggleCamera,
  audioInputs,
  selectedAudioInputId,
  micStatus,
  onSelectAudioInput,
}: Props) {
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [audioNeedsGesture, setAudioNeedsGesture] = useState(false);

  const enableAudio = () => {
    const audio = audioRef.current;
    if (!audio) return;
    void audio
      .play()
      .then(() => setAudioNeedsGesture(false))
      .catch(() => setAudioNeedsGesture(true));
  };

  const active = call ?? incoming;
  const isVideo = active ? active.media === "video" : false;
  const showVideoStage = isVideo && (call?.phase === "active" || call?.phase === "connecting");
  const peer = call?.peer ?? incoming?.peer ?? null;
  const remoteHasVideo = Boolean(remoteStreamRef.current?.getVideoTracks().some((track) => track.readyState === "live"));
  const localHasVideo = Boolean(localStreamRef.current?.getVideoTracks().some((track) => track.readyState === "live"));

  useEffect(() => {
    const stream = remoteStreamRef.current ?? null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = stream;
    if (audioRef.current) {
      audioRef.current.srcObject = stream;
      // После getUserMedia браузер уже получил пользовательский жест, но
      // отдельному audio-элементу всё равно явно просим начать воспроизведение.
      if (stream) {
        void audioRef.current
          .play()
          .then(() => setAudioNeedsGesture(false))
          .catch(() => setAudioNeedsGesture(true));
      } else {
        setAudioNeedsGesture(false);
      }
    }
  }, [streamTick, remoteStreamRef, call?.phase, call?.id]);

  useEffect(() => {
    if (localVideoRef.current) localVideoRef.current.srcObject = localStreamRef.current ?? null;
  }, [streamTick, localStreamRef, call?.id]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[80] flex items-center justify-center bg-[#07070f]/95 backdrop-blur-xl"
    >
      {/* Дальний звук (для аудиозвонков) */}
      <audio
        ref={audioRef}
        autoPlay
        playsInline
        aria-label="Удалённый звук звонка"
        className="pointer-events-none absolute h-px w-px opacity-0"
      />
      {audioNeedsGesture && call && (
        <button
          type="button"
          onClick={enableAudio}
          className="glass-strong absolute top-5 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full px-4 py-2.5 text-sm text-white/90 shadow-xl"
        >
          <Volume2 className="h-4 w-4 text-violet-300" />
          Включить звук
        </button>
      )}

      {showVideoStage && call ? (
        <div className="relative h-full w-full">
          {remoteHasVideo ? (
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              muted
              className="h-full w-full bg-black object-cover"
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-[#080812] text-center">
              <div className="glass-strong rounded-full p-2">
                {peer && <Avatar name={peer.displayName} src={peer.avatarUrl} size={118} />}
              </div>
              <p className="max-w-xs text-sm text-white/55">Ожидание видео собеседника…</p>
            </div>
          )}
          {/* Собственное превью. Отсутствие камеры не прерывает звонок. */}
          <div className="glass-strong absolute top-5 right-5 aspect-[3/4] w-32 overflow-hidden rounded-2xl sm:w-40">
            {localHasVideo && cameraOn ? (
              <video ref={localVideoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 px-2 text-center text-white/55">
                <VideoOff className="h-5 w-5" />
                <span className="text-[11px]">Камера выключена</span>
              </div>
            )}
          </div>
          <VideoCallControls
            name={peer?.displayName ?? ""}
            status={statusText(call, seconds)}
            muted={muted}
            cameraOn={cameraOn}
            onToggleMute={onToggleMute}
            onToggleCamera={onToggleCamera}
            onHangup={onHangup}
            audioInputs={audioInputs}
            selectedAudioInputId={selectedAudioInputId}
            micStatus={micStatus}
            onSelectAudioInput={onSelectAudioInput}
          />
        </div>
      ) : (
        <div className="relative flex w-full max-w-sm flex-col items-center px-6">
          {/* Пульсирующие круги вокруг аватара */}
          <div className="relative flex items-center justify-center">
            {(incoming || call?.phase === "outgoing") && (
              <>
                <span className="ring-pulse absolute h-36 w-36 rounded-full bg-violet-500/40" />
                <span
                  className="ring-pulse absolute h-36 w-36 rounded-full bg-fuchsia-500/30"
                  style={{ animationDelay: "0.6s" }}
                />
              </>
            )}
            <div className="glass-strong flex h-32 w-32 items-center justify-center rounded-full p-1.5">
              {peer && (
                <Avatar name={peer.displayName} src={peer.avatarUrl} size={118} />
              )}
            </div>
          </div>

          <h2 className="font-display mt-7 text-2xl font-bold">{peer?.displayName}</h2>
          <p className="mt-2 flex items-center gap-2 text-sm text-white/50">
            {incoming ? (
              <>
                <Volume2 className="h-4 w-4 text-violet-300" />
                Входящий {isVideo ? "видеозвонок" : "аудиозвонок"}…
              </>
            ) : call ? (
              <>
                {isVideo && <Video className="h-4 w-4 text-violet-300" />}
                {statusText(call, seconds)}
              </>
            ) : null}
          </p>

          {incoming ? (
            <div className="mt-10 flex items-center gap-8">
              <button
                onClick={onDecline}
                className="flex h-16 w-16 items-center justify-center rounded-full bg-rose-500 text-white shadow-[0_10px_30px_-6px_rgba(244,63,94,0.6)] transition-transform hover:scale-105 active:scale-95"
                title="Отклонить"
              >
                <PhoneOff className="h-6 w-6" />
              </button>
              <button
                onClick={onAccept}
                className="flex h-16 w-16 animate-pulse-dot items-center justify-center rounded-full bg-emerald-500 text-white shadow-[0_10px_30px_-6px_rgba(16,185,129,0.6)] transition-transform hover:scale-105 active:scale-95"
                title="Принять"
              >
                <Phone className="h-6 w-6" />
              </button>
            </div>
          ) : call ? (
            <div className="mt-10 flex items-center gap-5">
              <ControlButton
                active={muted}
                onClick={onToggleMute}
                title={muted ? "Включить микрофон" : "Выключить микрофон"}
              >
                {muted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
              </ControlButton>
              {isVideo && (
                <ControlButton
                  active={!cameraOn}
                  onClick={onToggleCamera}
                  title={cameraOn ? "Выключить камеру" : "Включить камеру"}
                >
                  {cameraOn ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
                </ControlButton>
              )}
              <MicrophonePicker
                audioInputs={audioInputs}
                selectedAudioInputId={selectedAudioInputId}
                micStatus={micStatus}
                onSelectAudioInput={onSelectAudioInput}
              />
              <button
                onClick={onHangup}
                className="flex h-14 w-14 items-center justify-center rounded-full bg-rose-500 text-white shadow-[0_10px_30px_-6px_rgba(244,63,94,0.6)] transition-transform hover:scale-105 active:scale-95"
                title="Завершить"
              >
                <PhoneOff className="h-5 w-5" />
              </button>
            </div>
          ) : null}
        </div>
      )}
    </motion.div>
  );
}

function ControlButton({
  children,
  onClick,
  active,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  title: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`flex h-12 w-12 items-center justify-center rounded-full transition-all hover:scale-105 active:scale-95 ${
        active ? "bg-white text-black" : "glass text-white/80"
      }`}
    >
      {children}
    </button>
  );
}

function MicrophonePicker({
  audioInputs,
  selectedAudioInputId,
  micStatus,
  onSelectAudioInput,
}: {
  audioInputs: MediaDeviceInfo[];
  selectedAudioInputId: string;
  micStatus: string;
  onSelectAudioInput: (deviceId: string) => void;
}) {
  if (audioInputs.length <= 1) {
    return micStatus ? (
      <span className="max-w-28 truncate text-[10px] text-white/45" title={micStatus}>
        <Mic className="mr-1 inline h-3 w-3" />
        {audioInputs[0]?.label || "Микрофон подключён"}
      </span>
    ) : null;
  }

  return (
    <label className="flex max-w-36 items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-2 text-white/70" title={micStatus || "Выбрать микрофон"}>
      <Mic className="h-3.5 w-3.5 shrink-0" />
      <select
        aria-label="Выбрать микрофон"
        value={selectedAudioInputId}
        onChange={(event) => onSelectAudioInput(event.target.value)}
        className="min-w-0 max-w-28 bg-transparent text-[11px] outline-none"
      >
        {audioInputs.map((device, index) => (
          <option key={`${device.deviceId}-${index}`} value={device.deviceId} className="bg-[#171725] text-white">
            {device.label || `Микрофон ${index + 1}`}
          </option>
        ))}
      </select>
    </label>
  );
}

function VideoCallControls({
  name,
  status,
  muted,
  cameraOn,
  onToggleMute,
  onToggleCamera,
  onHangup,
  audioInputs,
  selectedAudioInputId,
  micStatus,
  onSelectAudioInput,
}: {
  name: string;
  status: string;
  muted: boolean;
  cameraOn: boolean;
  onToggleMute: () => void;
  onToggleCamera: () => void;
  onHangup: () => void;
  audioInputs: MediaDeviceInfo[];
  selectedAudioInputId: string;
  micStatus: string;
  onSelectAudioInput: (deviceId: string) => void;
}) {
  return (
    <div className="glass-strong absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-5 rounded-full px-6 py-3">
      <div className="mr-2 hidden sm:block">
        <p className="text-sm font-semibold">{name}</p>
        <p className="text-xs text-white/50">{status}</p>
      </div>
      <ControlButton active={muted} onClick={onToggleMute} title={muted ? "Включить микрофон" : "Выключить микрофон"}>
        {muted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
      </ControlButton>
      <ControlButton active={!cameraOn} onClick={onToggleCamera} title={cameraOn ? "Выключить камеру" : "Включить камеру"}>
        {cameraOn ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
      </ControlButton>
      <MicrophonePicker
        audioInputs={audioInputs}
        selectedAudioInputId={selectedAudioInputId}
        micStatus={micStatus}
        onSelectAudioInput={onSelectAudioInput}
      />
      <button
        onClick={onHangup}
        className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-500 text-white transition-transform hover:scale-105 active:scale-95"
        title="Завершить"
      >
        <PhoneOff className="h-5 w-5" />
      </button>
    </div>
  );
}
