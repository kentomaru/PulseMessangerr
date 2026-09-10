"use client";

import { motion } from "framer-motion";
import { Mic, MicOff, Phone, PhoneOff, User as UserIcon } from "lucide-react";
import Avatar, { paletteFor } from "./Avatar";
import type { ActiveCall, CallPayload } from "@/lib/types";
import { formatDuration } from "@/lib/format";

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
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[80] flex flex-col items-center justify-between overflow-hidden bg-[#07070d] py-14"
    >
      {/* ambient background from peer's identity */}
      <div className="pointer-events-none absolute inset-0">
        {peer.bannerUrl || peer.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={(peer.bannerUrl || peer.avatarUrl) as string}
            alt=""
            className="h-full w-full scale-125 object-cover opacity-30 blur-[70px] saturate-150"
          />
        ) : (
          <div
            className={`h-full w-full bg-gradient-to-br ${paletteFor(peer.username)} opacity-25 blur-3xl`}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/80" />
      </div>

      {/* top status */}
      <motion.div
        initial={{ y: -16, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="glass relative z-10 flex items-center gap-2.5 rounded-full px-5 py-2.5"
      >
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute h-full w-full animate-ping rounded-full bg-emerald-400/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
        </span>
        <span className="text-sm font-medium tracking-wide text-white/85">{phaseLabel}</span>
      </motion.div>

      {/* avatar + sonar */}
      <div className="relative z-10 flex flex-col items-center">
        <div className="relative">
          {(isIncoming || call?.phase === "outgoing" || call?.phase === "connecting") && (
            <>
              <span className="animate-sonar absolute inset-0 rounded-full bg-violet-500/40" />
              <span className="animate-sonar absolute inset-0 rounded-full bg-fuchsia-500/30 [animation-delay:0.7s]" />
              <span className="animate-sonar absolute inset-0 rounded-full bg-cyan-400/20 [animation-delay:1.4s]" />
            </>
          )}
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", bounce: 0.35 }}
            className="relative rounded-full ring-4 ring-white/10"
          >
            <Avatar name={peer.displayName} src={peer.avatarUrl} size={148} />
          </motion.div>
        </div>
        <motion.h2
          initial={{ y: 14, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.15 }}
          className="mt-7 font-display text-3xl font-bold tracking-tight"
        >
          {peer.displayName}
        </motion.h2>
        <motion.p
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.22 }}
          className="mt-1.5 flex items-center gap-1.5 text-sm text-white/45"
        >
          <UserIcon className="h-3.5 w-3.5" />@{peer.username}
        </motion.p>
      </div>

      {/* controls */}
      <motion.div
        initial={{ y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="relative z-10 flex items-center gap-6"
      >
        {isIncoming ? (
          <>
            <ControlButton
              label="Отклонить"
              onClick={onDecline}
              className="bg-rose-500/90 hover:bg-rose-500"
            >
              <PhoneOff className="h-6 w-6" />
            </ControlButton>
            <motion.div
              animate={{ scale: [1, 1.08, 1] }}
              transition={{ repeat: Infinity, duration: 1.6 }}
            >
              <ControlButton
                label="Принять"
                onClick={onAccept}
                className="bg-emerald-500/90 hover:bg-emerald-500"
              >
                <Phone className="h-6 w-6" />
              </ControlButton>
            </motion.div>
          </>
        ) : (
          <>
            <ControlButton
              label={muted ? "Включить микрофон" : "Выключить микрофон"}
              onClick={onToggleMute}
              active={muted}
              className={
                muted ? "bg-white text-black hover:bg-white/90" : "bg-white/10 hover:bg-white/20"
              }
            >
              {muted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
            </ControlButton>
            <ControlButton
              label="Завершить"
              onClick={onHangup}
              className="bg-rose-500/90 hover:bg-rose-500"
            >
              <PhoneOff className="h-6 w-6" />
            </ControlButton>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}

function ControlButton({
  children,
  onClick,
  label,
  className,
  active,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
  className?: string;
  active?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-2.5">
      <button
        onClick={onClick}
        aria-label={label}
        className={`grid h-16 w-16 place-items-center rounded-full text-white shadow-[0_14px_40px_-10px_rgba(0,0,0,0.7)] backdrop-blur transition-all hover:scale-105 active:scale-95 ${className} ${
          active ? "ring-2 ring-white/40" : ""
        }`}
      >
        {children}
      </button>
      <span className="text-[11px] font-medium tracking-wide text-white/45">{label}</span>
    </div>
  );
}
