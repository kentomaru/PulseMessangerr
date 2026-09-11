export type FileKind = "image" | "video" | "file" | "audio";

export type AttachmentPayload = {
  id: number;
  fileId: number;
  kind: FileKind;
  name: string;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
  duration: number | null;
};

export type ReactionPayload = {
  emoji: string;
  users: number[];
};

export type ReplyPreview = {
  id: number;
  senderId: number;
  senderName: string;
  body: string;
  kind: string;
  attachmentKind: FileKind | null;
  deleted: boolean;
} | null;

export type MessagePayload = {
  id: number;
  chatId: number;
  senderId: number;
  body: string;
  kind: string;
  createdAt: string;
  editedAt: string | null;
  deletedForAllAt: string | null;
  replyToId: number | null;
  replyTo: ReplyPreview;
  attachments: AttachmentPayload[];
  reactions: ReactionPayload[];
  sender: {
    id: number;
    name: string;
    handle: string;
    emoji: string;
    accent: string;
    avatarFileId: number | null;
  };
  pending?: boolean;
};

export type ChatPayload = {
  id: number;
  kind: string;
  title: string;
  emoji: string;
  accent: string;
  avatarFileId: number | null;
  wallpaper: string | null;
  muted: boolean;
  pinned: boolean;
  archived: boolean;
  unread: number;
  lastMessage: {
    id: number;
    senderId: number;
    body: string;
    kind: string;
    createdAt: string;
    deletedForAllAt: string | null;
  } | null;
  partner: {
    id: number;
    name: string;
    handle: string;
    emoji: string;
    accent: string;
    avatarFileId: number | null;
    lastSeenAt: string;
    about: string;
  } | null;
  blocked: boolean;
  blockedBy: boolean;
};

export type SettingsPayload = {
  theme: string;
  accent: string;
  wallpaper: string;
  bubbleStyle: string;
  fontSize: string;
  density: string;
  enterToSend: boolean;
  sounds: boolean;
  notifications: boolean;
  messagePreview: boolean;
  readReceipts: boolean;
  typingStatus: boolean;
  lastSeenPrivacy: string;
  autoDownload: string;
  language: string;
  animations: boolean;
  largeEmoji: boolean;
};

export type Wallpaper = {
  preset: string;
  image?: number | null;
  blur?: number;
  dim?: number;
};

export const ACCENTS: Record<string, { from: string; to: string; solid: string; ring: string }> = {
  violet: { from: "#8b5cf6", to: "#6366f1", solid: "#7c3aed", ring: "rgba(139,92,246,.45)" },
  cyan: { from: "#22d3ee", to: "#3b82f6", solid: "#0ea5e9", ring: "rgba(34,211,238,.45)" },
  emerald: { from: "#34d399", to: "#10b981", solid: "#10b981", ring: "rgba(52,211,153,.45)" },
  amber: { from: "#fbbf24", to: "#f59e0b", solid: "#f59e0b", ring: "rgba(251,191,36,.45)" },
  rose: { from: "#fb7185", to: "#f43f5e", solid: "#f43f5e", ring: "rgba(251,113,133,.45)" },
  indigo: { from: "#818cf8", to: "#4f46e5", solid: "#6366f1", ring: "rgba(129,140,248,.45)" },
};

export const ACCENT_KEYS = Object.keys(ACCENTS);

export const WALLPAPERS: { id: string; name: string; css: string }[] = [
  {
    id: "aurora",
    name: "Aurora",
    css: "radial-gradient(1200px 600px at 12% 8%, rgba(124,58,237,.55), transparent 60%), radial-gradient(900px 700px at 88% 12%, rgba(34,211,238,.35), transparent 60%), radial-gradient(1000px 900px at 50% 110%, rgba(16,185,129,.28), transparent 60%), linear-gradient(160deg,#0b1020,#111a2e 55%,#0a0f1c)",
  },
  {
    id: "sunset",
    name: "Sunset",
    css: "radial-gradient(900px 600px at 15% 15%, rgba(251,146,60,.45), transparent 60%), radial-gradient(900px 700px at 85% 25%, rgba(244,63,94,.40), transparent 60%), linear-gradient(165deg,#1a1024,#2a1226 50%,#120a18)",
  },
  {
    id: "ocean",
    name: "Ocean",
    css: "radial-gradient(1000px 700px at 80% 5%, rgba(59,130,246,.45), transparent 60%), radial-gradient(800px 800px at 10% 90%, rgba(20,184,166,.35), transparent 60%), linear-gradient(170deg,#04121f,#072033 55%,#03101c)",
  },
  {
    id: "noir",
    name: "Noir",
    css: "radial-gradient(900px 700px at 70% 10%, rgba(148,163,184,.16), transparent 60%), linear-gradient(180deg,#0a0a0c,#141418 60%,#08080a)",
  },
  {
    id: "blossom",
    name: "Blossom",
    css: "radial-gradient(900px 700px at 20% 10%, rgba(249,168,212,.40), transparent 60%), radial-gradient(900px 700px at 85% 85%, rgba(167,139,250,.38), transparent 60%), linear-gradient(160deg,#f7e9f3,#e7dcf7 55%,#fdf2f8)",
  },
  {
    id: "mint",
    name: "Mint",
    css: "radial-gradient(900px 700px at 15% 20%, rgba(52,211,153,.35), transparent 60%), radial-gradient(800px 700px at 85% 80%, rgba(34,211,238,.32), transparent 60%), linear-gradient(165deg,#f2fbf7,#eef6ff 55%,#f7fefb)",
  },
  {
    id: "graphite",
    name: "Graphite",
    css: "repeating-linear-gradient(45deg, rgba(255,255,255,.035) 0 2px, transparent 2px 9px), linear-gradient(180deg,#12151c,#191d27 60%,#0d1015)",
  },
  {
    id: "nebula",
    name: "Nebula",
    css: "radial-gradient(700px 500px at 30% 25%, rgba(217,70,239,.45), transparent 60%), radial-gradient(800px 600px at 75% 70%, rgba(56,189,248,.35), transparent 60%), linear-gradient(150deg,#0d0a1f,#1b0f2b 55%,#080614)",
  },
];

export const LIGHT_WALLPAPERS = new Set(["blossom", "mint"]);

export function parseWallpaper(raw: string | null | undefined): Wallpaper {
  try {
    const parsed = JSON.parse(raw || '{"preset":"aurora"}');
    return {
      preset: typeof parsed.preset === "string" ? parsed.preset : "aurora",
      image: typeof parsed.image === "number" ? parsed.image : null,
      blur: typeof parsed.blur === "number" ? parsed.blur : 0,
      dim: typeof parsed.dim === "number" ? parsed.dim : 0,
    };
  } catch {
    return { preset: "aurora", image: null, blur: 0, dim: 0 };
  }
}

export function wallpaperCss(wp: Wallpaper, customUrl?: string | null): string {
  const preset = WALLPAPERS.find((w) => w.id === wp.preset);
  const base = customUrl ? `url(${customUrl}) center/cover no-repeat, ` : "";
  return base + (preset?.css ?? WALLPAPERS[0].css);
}

export function isLightWallpaper(wp: Wallpaper): boolean {
  if (wp.image) return false;
  return LIGHT_WALLPAPERS.has(wp.preset);
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

export function formatDay(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const diffDays = Math.floor((startOfToday - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 86400000);
  if (diffDays === 0) return "Сегодня";
  if (diffDays === 1) return "Вчера";
  if (diffDays < 7) {
    return d.toLocaleDateString("ru-RU", { weekday: "long" });
  }
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}

export function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function formatLastSeen(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "в сети";
  if (diff < 3600_000) return `был(а) ${Math.floor(diff / 60_000)} мин назад`;
  if (diff < 86400_000) return `был(а) ${Math.floor(diff / 3600_000)} ч назад`;
  return `был(а) ${new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}`;
}

export function isOnline(iso: string): boolean {
  return Date.now() - new Date(iso).getTime() < 45_000;
}

export function formatBytes(size: number): string {
  if (!size) return "0 Б";
  const units = ["Б", "КБ", "МБ", "ГБ"];
  const i = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1);
  return `${(size / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export const QUICK_EMOJI = [
  "🔥", "❤️", "😂", "😮", "😢", "👍", "🎉", "✨", "🙏", "💯", "⚡", "🌙",
  "☕", "🍕", "🎧", "🚀", "💡", "🧠", "🥳", "😎", "🤝", "👀", "🫶", "🌈",
];

export const REACTION_EMOJI = ["❤️", "🔥", "😂", "👍", "😮", "🎉", "👀", "🙏"];

export type CallPeer = {
  id: number;
  name: string;
  handle: string;
  emoji: string;
  accent: string;
  avatarFileId: number | null;
};

export type CallPayload = {
  id: number;
  chatId: number;
  callerId: number;
  status: "ringing" | "active" | "ended" | "declined" | "missed";
  offerSdp: string | null;
  answerSdp: string | null;
  createdAt: string;
  answeredAt: string | null;
  endedAt: string | null;
  caller?: CallPeer;
};

export type ActiveCall = {
  id: number;
  chatId: number;
  role: "caller" | "callee";
  phase: "outgoing" | "incoming" | "connecting" | "active" | "ended";
  peer: CallPeer;
};
