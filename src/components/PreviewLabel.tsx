"use client";

import { Clapperboard, ImageIcon, Mic, Paperclip, Phone } from "lucide-react";
import { previewInfo, type PreviewKind } from "@/lib/format";

/** SVG-иконка для типа вложения (вместо эмодзи). */
export function PreviewIcon({
  kind,
  className = "h-3.5 w-3.5",
}: {
  kind: PreviewKind;
  className?: string;
}) {
  switch (kind) {
    case "call":
      return <Phone className={`${className} shrink-0`} />;
    case "image":
      return <ImageIcon className={`${className} shrink-0`} />;
    case "voice":
      return <Mic className={`${className} shrink-0`} />;
    case "video":
      return <Clapperboard className={`${className} shrink-0`} />;
    case "file":
      return <Paperclip className={`${className} shrink-0`} />;
    default:
      return null;
  }
}

/**
 * Превью сообщения «иконка + текст» для сайдбара, цитат, пересылки и
 * подтверждения удаления. Вместо эмодзи — аккуратные SVG-иконки.
 */
export default function PreviewLabel({
  type,
  content,
  className = "",
  iconClassName = "h-3.5 w-3.5",
}: {
  type: string;
  content: string;
  className?: string;
  iconClassName?: string;
}) {
  const { kind, text } = previewInfo(type, content);
  return (
    <span className={`inline-flex min-w-0 items-center gap-1.5 ${className}`}>
      {kind && (
        <span className="shrink-0 text-white/45">
          <PreviewIcon kind={kind} className={iconClassName} />
        </span>
      )}
      <span className="truncate">{text}</span>
    </span>
  );
}
