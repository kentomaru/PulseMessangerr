"use client";

import { useRef, useState } from "react";
import type { AttachmentPayload } from "@/lib/pulse";
import { formatBytes, formatDuration } from "@/lib/pulse";
import { IconDownload, IconFile, IconPause, IconPlay } from "./ui";

export function fileIcon(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["pdf"].includes(ext)) return "📕";
  if (["doc", "docx", "rtf", "odt"].includes(ext)) return "📘";
  if (["xls", "xlsx", "csv"].includes(ext)) return "📗";
  if (["zip", "rar", "7z", "tar", "gz"].includes(ext)) return "🗜️";
  if (["mp3", "wav", "ogg", "m4a", "flac"].includes(ext)) return "🎵";
  if (["mp4", "mov", "webm", "mkv", "avi"].includes(ext)) return "🎬";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "heic"].includes(ext)) return "🖼️";
  if (["js", "ts", "tsx", "json", "html", "css", "py", "sh"].includes(ext)) return "💾";
  return "📄";
}

function AudioPlayer({ src, compact }: { src: string; compact?: boolean }) {
  const ref = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  return (
    <div className="flex min-w-[190px] items-center gap-2">
      <button
        onClick={() => {
          const el = ref.current;
          if (!el) return;
          if (el.paused) {
            void el.play();
            setPlaying(true);
          } else {
            el.pause();
            setPlaying(false);
          }
        }}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white"
        style={{ background: "var(--accent)" }}
      >
        {playing ? <IconPause size={16} /> : <IconPlay size={16} />}
      </button>
      <div className="flex-1">
        <input
          type="range"
          min={0}
          max={Math.max(duration, 0.1)}
          step={0.05}
          value={progress}
          onChange={(e) => {
            const value = Number(e.target.value);
            if (ref.current) ref.current.currentTime = value;
            setProgress(value);
          }}
          className="w-full"
        />
        <div className="mt-0.5 flex justify-between text-[10.5px]" style={{ color: "var(--muted)" }}>
          <span>{formatDuration(progress)}</span>
          <span>{duration ? formatDuration(duration) : (compact ? "голосовое" : "")}</span>
        </div>
      </div>
      <audio
        ref={ref}
        src={src}
        preload="metadata"
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
        onTimeUpdate={(e) => setProgress(e.currentTarget.currentTime)}
        onEnded={() => {
          setPlaying(false);
          setProgress(0);
        }}
      />
    </div>
  );
}

function VideoPlayer({ src }: { src: string }) {
  const [poster, setPoster] = useState<string | null>(null);
  const ref = useRef<HTMLVideoElement | null>(null);

  return (
    <video
      ref={ref}
      src={src}
      controls
      playsInline
      preload="metadata"
      className="max-h-[320px] w-full rounded-2xl bg-black/40 object-contain"
      onLoadedData={(e) => {
        const el = e.currentTarget;
        if (!poster && el.duration > 0) {
          try {
            const canvas = document.createElement("canvas");
            canvas.width = el.videoWidth;
            canvas.height = el.videoHeight;
            canvas.getContext("2d")?.drawImage(el, 0, 0);
            setPoster(canvas.toDataURL("image/jpeg", 0.7));
          } catch {
            /* ignore */
          }
        }
      }}
      poster={poster ?? undefined}
      style={{ aspectRatio: "16 / 10" }}
    >
    </video>
  );
}

export default function AttachmentView({
  attachments,
  onRemove,
  compact = false,
}: {
  attachments: AttachmentPayload[];
  onRemove?: (fileId: number) => void;
  compact?: boolean;
}) {
  const images = attachments.filter((a) => a.kind === "image");
  const videos = attachments.filter((a) => a.kind === "video");
  const audios = attachments.filter((a) => a.kind === "audio");
  const docs = attachments.filter((a) => a.kind === "file");

  if (attachments.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5">
      {images.length > 0 ? (
        <div
          className={`grid gap-1 ${images.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}
          style={{ maxWidth: compact ? 320 : 420 }}
        >
          {images.map((a) => (
            <div key={a.id} className="group relative overflow-hidden rounded-2xl">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/files/${a.fileId}`}
                alt={a.name}
                className="w-full cursor-pointer object-cover transition group-hover:brightness-95"
                style={{
                  maxHeight: images.length === 1 ? 320 : 170,
                  aspectRatio: a.width && a.height ? `${a.width} / ${a.height}` : undefined,
                }}
                onClick={() => window.open(`/api/files/${a.fileId}`, "_blank")}
              />
              {onRemove ? (
                <button
                  onClick={() => onRemove(a.fileId)}
                  className="absolute top-1.5 right-1.5 rounded-full bg-black/60 px-2 py-1 text-[11px] text-white"
                >
                  ✕
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {videos.map((a) => (
        <div key={a.id} className="relative overflow-hidden rounded-2xl" style={{ maxWidth: compact ? 320 : 420 }}>
          <VideoPlayer src={`/api/files/${a.fileId}`} />
          {onRemove ? (
            <button
              onClick={() => onRemove(a.fileId)}
              className="absolute top-1.5 right-1.5 rounded-full bg-black/60 px-2 py-1 text-[11px] text-white"
            >
              ✕
            </button>
          ) : null}
        </div>
      ))}

      {audios.map((a) => (
        <div key={a.id} className="relative">
          <AudioPlayer src={`/api/files/${a.fileId}`} compact={compact} />
          {onRemove ? (
            <button
              onClick={() => onRemove(a.fileId)}
              className="absolute -top-1 right-0 rounded-full bg-black/60 px-2 py-0.5 text-[11px] text-white"
            >
              ✕
            </button>
          ) : null}
        </div>
      ))}

      {docs.map((a) => (
        <a
          key={a.id}
          href={`/api/files/${a.fileId}`}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-3 rounded-2xl px-3 py-2.5 transition hover:brightness-110"
          style={{ background: "rgba(127,127,127,.16)", maxWidth: 340 }}
        >
          <span className="text-xl">{fileIcon(a.name)}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium">{a.name}</span>
            <span className="block text-[11px]" style={{ color: "var(--muted)" }}>
              {formatBytes(a.size)} · {a.mime.split("/").pop()?.toUpperCase() ?? "FILE"}
            </span>
          </span>
          <IconDownload size={16} />
          {onRemove ? (
            <button
              onClick={(e) => {
                e.preventDefault();
                onRemove(a.fileId);
              }}
              className="rounded-full px-1.5 text-[12px]"
            >
              ✕
            </button>
          ) : null}
        </a>
      ))}
    </div>
  );
}

export function AttachmentChips({
  attachments,
  onRemove,
}: {
  attachments: AttachmentPayload[];
  onRemove: (fileId: number) => void;
}) {
  if (attachments.length === 0) return null;
  return (
    <div className="mb-2 flex flex-wrap gap-2">
      {attachments.map((a) => (
        <div
          key={a.id}
          className="animate-pulse-in relative overflow-hidden rounded-2xl"
          style={{ background: "var(--panel-2)", border: "1px solid var(--border)" }}
        >
          {a.kind === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/files/${a.fileId}`} alt={a.name} className="h-20 w-24 object-cover" />
          ) : (
            <div className="flex h-20 w-24 flex-col items-center justify-center gap-1 px-2">
              <span className="text-2xl">{fileIcon(a.name)}</span>
              <span className="w-full truncate text-center text-[10.5px]" style={{ color: "var(--muted)" }}>
                {a.name}
              </span>
            </div>
          )}
          <button
            onClick={() => onRemove(a.fileId)}
            className="absolute top-1 right-1 rounded-full bg-black/65 px-1.5 py-0.5 text-[11px] leading-none text-white"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
