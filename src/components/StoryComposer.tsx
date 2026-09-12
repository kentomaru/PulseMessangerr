"use client";

import { useRef, useState } from "react";
import { Film, ImagePlus, Loader2, Send, X } from "lucide-react";
import { ModalShell } from "./ProfileModal";
import { api, uploadFile } from "@/lib/api";
import { formatBytes } from "@/lib/format";
import type { StoryItem } from "@/lib/types";

type Props = {
  onClose: () => void;
  onPublished: (story: StoryItem) => void;
  notify: (msg: string) => void;
};

const MAX_STORY_BYTES = 500 * 1024 * 1024;

/** Создание истории: фото или видео + подпись, живёт 24 часа. */
export default function StoryComposer({ onClose, onPublished, notify }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  const isVideo = !!file && file.type.startsWith("video/");

  const pick = (f: File | null) => {
    setError("");
    if (!f) return;
    if (!f.type.startsWith("image/") && !f.type.startsWith("video/")) {
      setError("Нужна картинка или видео (PNG, JPG, WebP, GIF, MP4, WebM)");
      return;
    }
    if (f.size > MAX_STORY_BYTES) {
      setError(`Файл больше 500 МБ (${formatBytes(f.size)})`);
      return;
    }
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
  };

  const reset = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(null);
    setPreviewUrl(null);
  };

  const publish = async () => {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const mediaUrl = await uploadFile(file);
      const d = await api<{ story: StoryItem }>("/api/stories", {
        method: "POST",
        body: JSON.stringify({ mediaUrl, caption }),
      });
      notify("История опубликована");
      onPublished(d.story);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось опубликовать");
      setBusy(false);
    }
  };

  return (
    <ModalShell onClose={onClose}>
      <div className="flex items-center justify-between border-b border-white/8 px-6 py-4">
        <h3 className="font-display text-lg font-bold">Новая история</h3>
        <button
          onClick={onClose}
          className="rounded-full bg-white/5 p-2 text-white/60 transition-colors hover:bg-white/10"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-4 p-6">
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
          className="hidden"
          onChange={(e) => {
            pick(e.target.files?.[0] ?? null);
            e.target.value = "";
          }}
        />

        {previewUrl ? (
          <div className="relative overflow-hidden rounded-2xl bg-black/40">
            {isVideo ? (
              <video src={previewUrl} controls playsInline className="max-h-80 w-full object-contain" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl} alt="Превью истории" className="max-h-80 w-full object-cover" />
            )}
            <button
              onClick={reset}
              className="absolute top-3 right-3 rounded-full bg-black/60 p-2 text-white/90 backdrop-blur transition-colors hover:bg-black/80"
            >
              <X className="h-4 w-4" />
            </button>
            <p className="absolute bottom-3 left-3 rounded-full bg-black/70 px-3 py-1 text-[11px] text-white/80">
              {isVideo ? <Film className="mr-1 inline h-3 w-3" /> : null}
              {file?.name} · {formatBytes(file?.size)}
            </p>
          </div>
        ) : (
          <button
            onClick={() => inputRef.current?.click()}
            className="flex h-48 w-full flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-white/15 bg-white/[0.03] text-white/40 transition-colors hover:border-violet-400/40 hover:text-white/70"
          >
            <ImagePlus className="h-8 w-8" />
            <span className="text-sm">Фото или видео (до 500 МБ)</span>
          </button>
        )}

        <textarea
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          maxLength={140}
          rows={2}
          placeholder="Подпись (необязательно)…"
          className="ring-focus nice-scroll w-full resize-none rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-[15px] transition-all placeholder:text-white/25"
        />

        {error && (
          <p className="rounded-xl border border-rose-500/25 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-300">
            {error}
          </p>
        )}

        <button
          onClick={() => void publish()}
          disabled={!file || busy}
          className="btn-gradient flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-[15px] font-semibold text-white"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Опубликовать (24 часа)
        </button>
      </div>
    </ModalShell>
  );
}
