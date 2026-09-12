import type { AttachmentPayload, FileKind } from "./pulse";

export function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function detectKind(file: File): FileKind {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  return "file";
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image_error"));
    img.src = src;
  });
}

export type PreparedFile = {
  dataUrl: string;
  name: string;
  mime: string;
  kind: FileKind;
  width?: number;
  height?: number;
  duration?: number;
};

export async function prepareFile(file: File): Promise<PreparedFile> {
  const kind = detectKind(file);
  if (kind === "image" && file.type !== "image/gif") {
    const dataUrl = await readAsDataUrl(file);
    try {
      const img = await loadImage(dataUrl);
      const max = 1600;
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const compressed = canvas.toDataURL("image/jpeg", 0.85);
        if (compressed.length < dataUrl.length) {
          return {
            dataUrl: compressed,
            name: file.name,
            mime: "image/jpeg",
            kind: "image",
            width: canvas.width,
            height: canvas.height,
          };
        }
      }
      return {
        dataUrl,
        name: file.name,
        mime: file.type,
        kind: "image",
        width: img.width,
        height: img.height,
      };
    } catch {
      return { dataUrl, name: file.name, mime: file.type, kind: "image" };
    }
  }
  const dataUrl = await readAsDataUrl(file);
  return { dataUrl, name: file.name, mime: file.type || "application/octet-stream", kind };
}

export async function uploadPrepared(prepared: PreparedFile): Promise<AttachmentPayload> {
  const res = await fetch("/api/files", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(prepared),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "upload_failed");
  }
  const data = (await res.json()) as { attachment: AttachmentPayload };
  return data.attachment;
}

export const MAX_UPLOAD_BYTES = 24 * 1024 * 1024;
