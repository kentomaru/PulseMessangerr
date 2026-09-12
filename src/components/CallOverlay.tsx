"use client";

import type { ActiveCall, CallPayload } from "@/lib/pulse";
import { formatDuration } from "@/lib/pulse";
import { Avatar, IconClose, IconMic, IconPhone } from "./ui";

type Props = {
  call: ActiveCall | null;
  incoming: CallPayload | null;
  muted: boolean;
  seconds: number;
  onAccept: () => void;
  onDecline: () => void;
  onHangup: () => void;
  onToggleMute: () => void;
};

export default function CallOverlay({
  call,
  incoming,
  muted,
  seconds,
  onAccept,
  onDecline,
  onHangup,
  onToggleMute,
}: Props) {
  const isIncoming = !call && !!incoming;
  const peer = call?.peer ?? incoming?.caller ?? null;
  if (!peer) return null;

  const phaseLabel = isIncoming
    ? "Входящий звонок"
    : call?.phase === "outgoing"
      ? "Вызов…"
      : call?.phase === "connecting"
        ? "Соединение…"
        : formatDuration(seconds);

  return (
    <div
      className="fixed inset-0 z-[80] flex flex-col items-center justify-between overflow-hidden py-14"
      style={{ background: "rgba(4,6,12,.92)", backdropFilter: "blur(14px)" }}
    >
      <div
        className="relative z-10 flex items-center gap-2.5 rounded-full px-5 py-2.5"
        style={{ background: "var(--panel-2)", border: "1px solid var(--border)" }}
      >
        <span className="relative flex h-2.5 w-2.5">
          <span
            className="absolute h-full w-full animate-ping rounded-full"
            style={{ background: "rgba(52,211,153,.7)" }}
          />
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#34d399" }} />
        </span>
        <span className="text-sm font-medium tracking-wide" style={{ color: "var(--text)" }}>
          {phaseLabel}
        </span>
      </div>

      <div className="relative z-10 flex flex-col items-center">
        <div className="relative">
          {(isIncoming || call?.phase === "outgoing" || call?.phase === "connecting") && (
            <span className="pulse-ring absolute inset-0 rounded-full" style={{ background: "var(--accent)", opacity: 0.35 }} />
          )}
          <div className="relative rounded-full" style={{ boxShadow: "0 0 0 4px rgba(255,255,255,.08)" }}>
            <Avatar name={peer.name} emoji={peer.emoji} accent={peer.accent} fileId={peer.avatarFileId} size={148} />
          </div>
        </div>
        <h2 className="mt-7 text-3xl font-bold tracking-tight" style={{ color: "var(--text)" }}>
          {peer.name}
        </h2>
        <p className="mt-1.5 flex items-center gap-1.5 text-sm" style={{ color: "var(--muted)" }}>
          @{peer.handle}
        </p>
      </div>

      <div className="relative z-10 flex items-center gap-6">
        {isIncoming ? (
          <>
            <ControlButton label="Отклонить" onClick={onDecline} background="#ef4444">
              <IconClose size={24} />
            </ControlButton>
            <ControlButton label="Принять" onClick={onAccept} background="#10b981">
              <IconPhone size={24} />
            </ControlButton>
          </>
        ) : (
          <>
            <ControlButton
              label={muted ? "Включить микрофон" : "Выключить микрофон"}
              onClick={onToggleMute}
              background={muted ? "#ffffff" : "rgba(255,255,255,.1)"}
              color={muted ? "#000000" : "#ffffff"}
            >
              <IconMic size={24} />
            </ControlButton>
            <ControlButton label="Завершить" onClick={onHangup} background="#ef4444">
              <IconClose size={24} />
            </ControlButton>
          </>
        )}
      </div>
    </div>
  );
}

function ControlButton({
  children,
  onClick,
  label,
  background,
  color = "#ffffff",
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
  background: string;
  color?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2.5">
      <button
        onClick={onClick}
        aria-label={label}
        className="grid h-16 w-16 place-items-center rounded-full shadow-lg backdrop-blur transition-transform hover:scale-105 active:scale-95"
        style={{ background, color }}
      >
        {children}
      </button>
      <span className="text-[11px] font-medium tracking-wide" style={{ color: "var(--muted)" }}>
        {label}
      </span>
    </div>
  );
}
