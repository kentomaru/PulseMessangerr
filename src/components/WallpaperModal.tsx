"use client";

import { useRef, useState } from "react";
import { Eraser, ImagePlus, Loader2, X } from "lucide-react";
import { ModalShell } from "./ProfileModal";
import { api, uploadFile } from "@/lib/api";
import { WALLPAPER_PRESETS, wallpaperStyle } from "@/lib/wallpapers";

type Props = {
  conversationId: string;
  current: string | null;
  onClose: () => void;
  onSaved: (wallpaper: string | null) => void;
  notify: (msg: string) => void;
};

/** Выбор обоев чата: пресет, своя картинка или сброс. У каждого участника — свои. */
export default function WallpaperModal({ conversationId, current, onClose, onSaved, notify }: Props) {
  const [selected, setSelected] = useState<string | null>(current);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);

  const save = async (value: string | null) => {
    setBusy(true);
    setError("");
    try {
      await api(`/api/conversations/${conversationId}/wallpaper`, {
        method: "POST",
        body: JSON.stringify({ wallpaper: value }),
      });
      notify("Обои чата обновлены");
      onSaved(value);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить обои");
      setBusy(false);
    }
  };

  const upload = async (file: File | null) => {
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const url = await uploadFile(file);
      await save(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки");
    } finally {
      setUploading(false);
    }
  };

  return (
    <ModalShell onClose={onClose}>
      <div className="flex items-center justify-between border-b border-white/8 px-6 py-4">
        <h3 className="font-display text-lg font-bold">Обои чата</h3>
        <button
          onClick={onClose}
          className="rounded-full bg-white/5 p-2 text-white/60 transition-colors hover:bg-white/10"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-4 p-6">
        <div className="grid grid-cols-5 gap-2.5">
          {WALLPAPER_PRESETS.map((p) => (
            <button
              key={p.key}
              title={p.label}
              onClick={() => setSelected(p.key)}
              className={`aspect-square rounded-2xl transition-all hover:scale-105 ${
                selected === p.key ? "ring-2 ring-[#5865f2] ring-offset-2 ring-offset-[#0d0d18]" : ""
              } ${p.anim ? "relative overflow-hidden" : ""}`}
              style={{
                ...wallpaperStyle(p.key),
                border: "1px solid rgba(255,255,255,0.08)",
                // мини-плитка: фон без «разгона» размера, но с той же анимацией
                backgroundSize: p.anim ? "220% 220%" : undefined,
              }}
            />
          ))}
        </div>

        <div className="flex gap-2.5">
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="glass flex flex-1 items-center justify-center gap-2 rounded-2xl py-3 text-sm font-medium text-white/85 transition-colors hover:bg-white/10"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
            Своя картинка или гифка (будет «живой»)
          </button>
          <button
            onClick={() => setSelected(null)}
            className={`flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm transition-colors ${
              selected === null ? "bg-rose-500/20 text-rose-200" : "glass text-white/60 hover:text-white"
            }`}
          >
            <Eraser className="h-4 w-4" />
            Сброс
          </button>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={(e) => {
            void upload(e.target.files?.[0] ?? null);
            e.target.value = "";
          }}
        />

        {error && (
          <p className="rounded-xl border border-rose-500/25 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-300">
            {error}
          </p>
        )}

        <button
          onClick={() => void save(selected)}
          disabled={busy || selected === current}
          className="btn-gradient flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-[15px] font-semibold text-white"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          Применить
        </button>
      </div>
    </ModalShell>
  );
}
