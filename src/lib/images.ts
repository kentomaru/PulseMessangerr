"use client";

/**
 * Сжать изображение до maxDim по большей стороне (JPEG, качество 0.85) ПЕРЕД
 * загрузкой на сервер. Фото с телефона весят 3–10 МБ и часто не проходили
 * через прокси/медленную сеть («не могу сменить аватар», «аватарки не
 * грузятся») — после сжатия файл весит 50–200 КБ и залетает мгновенно.
 * Гифки не трогаем (иначе пропадёт анимация).
 */
export async function compressImage(file: File, maxDim: number): Promise<File> {
  if (file.type === "image/gif" || !file.type.startsWith("image/")) return file;
  if (typeof createImageBitmap === "undefined") return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
    // Маленькое фото уже по размеру и так лёгкое — не пережимаем
    if (scale >= 1 && file.size <= 400_000) return file;
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bmp, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.85),
    );
    bmp.close?.();
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], `${file.name.replace(/\.[^.]+$/, "")}.jpg`, { type: "image/jpeg" });
  } catch {
    /* браузер не смог — грузим оригинал */
    return file;
  }
}
