"use client";

import { useRef, useState } from "react";
import { ImagePlus, Loader2, Send, X } from "lucide-react";
import { ModalShell } from "./ProfileModal";
import { api, uploadFile } from "@/lib/api";
import type { StoryItem } from "@/lib/types";

type Props = {
  onClose: () => void;
  onPublished: (story: StoryItem) => void;
  notify: (msg: string) => void;
};

/** Создание истории: фото + подпись, живёт 24 часа. */
export default function StoryComposer({ onClose, onPublished, notify }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  const pick = (f: File | null) => {
    setError("");
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      setError("Нужна картинка (PNG, JPG, WebP, GIF)");
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      setError("Файл больше 10 МБ");
      return;
    }
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
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
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={(e) => {
            pick(e.target.files?.[0] ?? null);
            e.target.value = "";
          }}
        />

        {previewUrl ? (
          <div className="relative overflow-hidden rounded-2xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl} alt="Превью истории" className="max-h-80 w-full object-cover" />
            <button
              onClick={() => {
                setFile(null);
                setPreviewUrl(null);
              }}
              className="absolute top-3 right-3 rounded-full bg-black/60 p-2 text-white/90 backdrop-blur transition-colors hover:bg-black/80"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => inputRef.current?.click()}
            className="flex h-48 w-full flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-white/15 bg-white/[0.03] text-white/40 transition-colors hover:border-violet-400/40 hover:text-white/70"
          >
            <ImagePlus className="h-8 w-8" />
            <span className="text-sm">Выбрать изображение</span>
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
