"use client";

import { useRef, useState } from "react";
import { WALLPAPERS, parseWallpaper, wallpaperCss } from "@/lib/pulse";
import { prepareFile, uploadPrepared } from "@/lib/upload";
import { Row } from "./ui";

export default function WallpaperPicker({
  value,
  onChange,
  onNotify,
}: {
  value: string | null;
  onChange: (value: string) => void;
  onNotify: (text: string) => void;
}) {
  const wp = parseWallpaper(value);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);

  const upload = async (file: File) => {
    setBusy(true);
    try {
      const prepared = await prepareFile(file);
      const attachment = await uploadPrepared(prepared);
      onChange(JSON.stringify({ ...wp, image: attachment.fileId }));
    } catch {
      onNotify("Не удалось загрузить изображение");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <Row label="Готовые обои">
        <div className="grid grid-cols-4 gap-2">
          {WALLPAPERS.map((w) => (
            <button
              key={w.id}
              onClick={() => onChange(JSON.stringify({ ...wp, preset: w.id, image: null }))}
              className="relative h-20 overflow-hidden rounded-2xl border transition"
              style={{
                background: w.css,
                borderColor: wp.preset === w.id ? "var(--accent)" : "var(--border)",
                outline: wp.preset === w.id ? "2px solid var(--accent)" : "none",
              }}
            >
              <span className="absolute inset-x-0 bottom-0 bg-black/45 py-0.5 text-[10.5px] text-white">
                {w.name}
              </span>
            </button>
          ))}
        </div>
      </Row>

      <Row label="Своё изображение" hint="JPG или PNG до 24 МБ">
        <div className="flex items-center gap-2">
          <button
            onClick={() => inputRef.current?.click()}
            className="flex-1 rounded-2xl px-3 py-2.5 text-[13px] font-medium"
            style={{ background: "var(--panel-2)", border: "1px solid var(--border)" }}
          >
            {busy ? "Загружаем…" : "Загрузить фон"}
          </button>
          {wp.image ? (
            <button
              onClick={() => onChange(JSON.stringify({ ...wp, image: null }))}
              className="rounded-2xl px-3 py-2.5 text-[13px] font-medium"
              style={{ background: "var(--panel-2)", border: "1px solid var(--border)", color: "#f87171" }}
            >
              Убрать
            </button>
          ) : null}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
            e.target.value = "";
          }}
        />
      </Row>

      <Row label={`Размытие: ${wp.blur ?? 0}px`}>
        <input
          type="range"
          min={0}
          max={12}
          value={wp.blur ?? 0}
          onChange={(e) => onChange(JSON.stringify({ ...wp, blur: Number(e.target.value) }))}
          className="w-full"
        />
      </Row>

      <Row label={`Затемнение: ${wp.dim ?? 0}%`}>
        <input
          type="range"
          min={0}
          max={70}
          value={wp.dim ?? 0}
          onChange={(e) => onChange(JSON.stringify({ ...wp, dim: Number(e.target.value) }))}
          className="w-full"
        />
      </Row>

      <div
        className="mt-3 h-28 overflow-hidden rounded-2xl border"
        style={{ background: wallpaperCss(wp, wp.image ? `/api/files/${wp.image}` : null), borderColor: "var(--border)" }}
      />
    </div>
  );
}
