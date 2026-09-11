"use client";

import { ACCENTS } from "@/lib/pulse";
import type { CSSProperties, ReactNode } from "react";

export function PulseLogo({ size = 34, className = "" }: { size?: number; className?: string }) {
  const gid = `pg-${size}`;
  const sid = `ps-${size}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      aria-label="Pulse"
      role="img"
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#8b5cf6" />
          <stop offset="45%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#22d3ee" />
        </linearGradient>
        <linearGradient id={sid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="17" fill={`url(#${gid})`} />
      <rect x="2" y="2" width="60" height="60" rx="17" fill={`url(#${sid})`} />
      <path
        d="M10 33h6.5l4.2-13.5 6.6 27 5.6-19.5 3.6 6H54"
        fill="none"
        stroke="#ffffff"
        strokeWidth="4.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="54" cy="33" r="4.6" fill="#ffffff" />
    </svg>
  );
}

export function Avatar({
  name,
  emoji,
  accent = "violet",
  fileId,
  size = 46,
  ring = false,
  online = false,
}: {
  name: string;
  emoji?: string;
  accent?: string;
  fileId?: number | null;
  size?: number;
  ring?: boolean;
  online?: boolean;
}) {
  const grad = ACCENTS[accent] ?? ACCENTS.violet;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      {fileId ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/files/${fileId}`}
          alt={name}
          className="h-full w-full rounded-full object-cover"
          style={ring ? { boxShadow: `0 0 0 2px ${grad.ring}` } : undefined}
        />
      ) : (
        <div
          className="flex h-full w-full items-center justify-center rounded-full font-semibold text-white"
          style={{
            background: `linear-gradient(135deg, ${grad.from}, ${grad.to})`,
            fontSize: size * 0.42,
            boxShadow: ring ? `0 0 0 2px ${grad.ring}` : undefined,
          }}
        >
          {emoji ?? name.slice(0, 1).toUpperCase()}
        </div>
      )}
      {online ? (
        <span
          className="absolute -right-0.5 -bottom-0.5 block rounded-full border-2 bg-emerald-400"
          style={{ width: size * 0.28, height: size * 0.28, borderColor: "var(--panel-solid)" }}
        />
      ) : null}
    </div>
  );
}

type IconProps = { size?: number; className?: string; style?: CSSProperties };

function svg(path: ReactNode, viewBox = "0 0 24 24") {
  return function Icon({ size = 20, className = "", style }: IconProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox={viewBox}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        style={style}
        aria-hidden
      >
        {path}
      </svg>
    );
  };
}

export const IconSearch = svg(
  <>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </>,
);
export const IconSettings = svg(
  <>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.11-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.55-1.11 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </>,
);
export const IconPlus = svg(
  <>
    <path d="M12 5v14M5 12h14" />
  </>,
);
export const IconSend = svg(<path d="M4.5 12 20 4.5 15 20l-3.6-5.2L4.5 12Z" />);
export const IconClip = svg(
  <path d="M21 11.5 12.5 20a5 5 0 0 1-7-7l8-8a3.5 3.5 0 0 1 5 5l-8 8a2 2 0 0 1-3-3l7-7" />,
);
export const IconImage = svg(
  <>
    <rect x="3" y="4" width="18" height="16" rx="3" />
    <circle cx="9" cy="10" r="1.6" />
    <path d="m4 18 5-4.5 4 3.5 3-2.5 4 3.5" />
  </>,
);
export const IconFile = svg(
  <>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5" />
  </>,
);
export const IconMic = svg(
  <>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
  </>,
);
export const IconPhone = svg(
  <path d="M21 16.9v2a2 2 0 0 1-2.2 2 19 19 0 0 1-8.3-3 19 19 0 0 1-5.8-5.8A19 19 0 0 1 1.7 3.8 2 2 0 0 1 3.7 1.6h2a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.5 2.1L9 9.4a15 15 0 0 0 5.6 5.6l1.1-1.1a2 2 0 0 1 2.1-.5c.9.3 1.9.6 2.9.7a2 2 0 0 1 1.7 2z" />,
);
export const IconVideo = svg(
  <>
    <rect x="2.5" y="6" width="13" height="12" rx="3" />
    <path d="m16 11 5.5-3v8L16 13z" />
  </>,
);
export const IconMore = svg(
  <>
    <circle cx="12" cy="5" r="1.4" />
    <circle cx="12" cy="12" r="1.4" />
    <circle cx="12" cy="19" r="1.4" />
  </>,
);
export const IconReply = svg(
  <>
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h9a7 7 0 0 1 7 7v4" />
  </>,
);
export const IconTrash = svg(
  <>
    <path d="M4 7h16M10 11v6M14 11v6" />
    <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
  </>,
);
export const IconCheck = svg(<path d="m5 13 4 4L19 7" />);
export const IconCheckDouble = svg(<path d="m2 13 4 4 8-8M10 15l2 2 8-8" />);
export const IconBan = svg(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="m5.6 5.6 12.8 12.8" />
  </>,
);
export const IconWallpaper = svg(
  <>
    <rect x="3" y="4" width="18" height="16" rx="3" />
    <circle cx="8.5" cy="9.5" r="1.5" />
    <path d="m4 17 4.5-4 3.5 3 3-2.5L20 17" />
  </>,
);
export const IconClose = svg(<path d="M6 6l12 12M18 6 6 18" />);
export const IconSmile = svg(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M8.5 14.5a4.5 4.5 0 0 0 7 0" />
    <path d="M9 9.5h.01M15 9.5h.01" />
  </>,
);
export const IconPin = svg(
  <>
    <path d="M12 17v5" />
    <path d="M8 3h8l-1 6 3 3v2H6v-2l3-3z" />
  </>,
);
export const IconArchive = svg(
  <>
    <rect x="3" y="4" width="18" height="4" rx="1.5" />
    <path d="M5 8v11a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8M10 12h4" />
  </>,
);
export const IconBell = svg(
  <>
    <path d="M18 9a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6" />
    <path d="M10.5 20a2 2 0 0 0 3 0" />
  </>,
);
export const IconBellOff = svg(
  <>
    <path d="M18 9a6 6 0 0 0-9.5-4.9M6 9c0 5-2 6-2 6h16s-1-.5-1.6-1.6" />
    <path d="M10.5 20a2 2 0 0 0 3 0M3 3l18 18" />
  </>,
);
export const IconBack = svg(<path d="M15 5l-7 7 7 7" />);
export const IconDownload = svg(
  <>
    <path d="M12 4v11" />
    <path d="m7.5 11 4.5 4.5L16.5 11" />
    <path d="M5 19h14" />
  </>,
);
export const IconPlay = svg(<path d="M7 4.5 19 12 7 19.5z" />);
export const IconPause = svg(<path d="M9 5v14M15 5v14" />);
export const IconEdit = svg(
  <>
    <path d="M4 20h4l10-10-4-4L4 16z" />
    <path d="m13.5 6.5 4 4" />
  </>,
);
export const IconUsers = svg(
  <>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3 20a6 6 0 0 1 12 0" />
    <path d="M16 5.5a3 3 0 0 1 0 5.5M17.5 20a6 6 0 0 0-2-4.5" />
  </>,
);
export const IconLogout = svg(
  <>
    <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" />
    <path d="M10 8 6 12l4 4M6 12h9" />
  </>,
);
export const IconShield = svg(
  <>
    <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" />
    <path d="m9 12 2 2 4-4" />
  </>,
);
export const IconPalette = svg(
  <>
    <path d="M12 3a9 9 0 1 0 0 18c1.4 0 2-1 2-2s-.7-1.6-.7-2.4c0-1 .8-1.6 1.8-1.6h1.6A4.3 4.3 0 0 0 21 10.6C21 6.3 17 3 12 3z" />
    <path d="M7.5 10.5h.01M11 7.5h.01M15.5 8.5h.01" />
  </>,
);
export const IconStorage = svg(
  <>
    <ellipse cx="12" cy="6" rx="8" ry="3" />
    <path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6" />
    <path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
  </>,
);
export const IconSparkles = svg(
  <>
    <path d="M12 3l1.8 4.7L18.5 9.5 13.8 11.3 12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" />
    <path d="M18 17l.9 2.3 2.3.9-2.3.9L18 23l-.9-2.3-2.3-.9 2.3-.9z" />
  </>,
);

export function Modal({
  open,
  onClose,
  title,
  children,
  width = "max-w-lg",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  width?: string;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog">
      <div
        className="absolute inset-0"
        style={{ background: "var(--overlay)", backdropFilter: "blur(6px)" }}
        onClick={onClose}
      />
      <div
        className={`animate-pulse-in relative w-full ${width} overflow-hidden rounded-3xl border`}
        style={{
          background: "var(--panel-solid)",
          borderColor: "var(--border)",
          boxShadow: "var(--shadow)",
        }}
      >
        <div
          className="flex items-center justify-between border-b px-5 py-4"
          style={{ borderColor: "var(--border)" }}
        >
          <h2 className="text-[15px] font-semibold">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-xl p-2 transition hover:brightness-125"
            style={{ background: "var(--panel-2)", color: "var(--muted)" }}
            aria-label="Закрыть"
          >
            <IconClose size={17} />
          </button>
        </div>
        <div className="max-h-[72vh] pulse-scroll p-5">{children}</div>
      </div>
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-4 rounded-2xl px-3 py-2.5 text-left transition hover:brightness-110"
      style={{ background: "var(--panel-2)" }}
    >
      <span className="min-w-0">
        <span className="block text-[13.5px] font-medium">{label}</span>
        {hint ? (
          <span className="mt-0.5 block text-[11.5px] leading-tight" style={{ color: "var(--muted)" }}>
            {hint}
          </span>
        ) : null}
      </span>
      <span
        className="relative h-6 w-11 shrink-0 rounded-full transition"
        style={{ background: checked ? "var(--accent)" : "var(--panel-3)" }}
      >
        <span
          className="absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all"
          style={{ left: checked ? 22 : 2, boxShadow: "0 2px 6px rgba(0,0,0,.3)" }}
        />
      </span>
    </button>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div
      className="flex gap-1 rounded-2xl p-1"
      style={{ background: "var(--panel-2)", border: "1px solid var(--border)" }}
    >
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className="flex-1 rounded-xl px-3 py-1.5 text-[12.5px] font-medium transition"
          style={{
            background: value === o.value ? "var(--accent)" : "transparent",
            color: value === o.value ? "#fff" : "var(--muted)",
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="mb-3">
      <div className="mb-1.5 px-1 text-[12.5px] font-semibold uppercase tracking-wide" style={{ color: "var(--muted)" }}>
        {label}
      </div>
      {children}
      {hint ? <div className="mt-1 px-1 text-[11.5px]" style={{ color: "var(--muted)" }}>{hint}</div> : null}
    </div>
  );
}

export function SectionTitle({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <div className="mb-2 flex items-center gap-2 text-[13px] font-semibold" style={{ color: "var(--accent)" }}>
      {icon}
      {children}
    </div>
  );
}
