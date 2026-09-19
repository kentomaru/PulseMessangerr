"use client";

import { useEffect, useState } from "react";
import { ExternalLink, X } from "lucide-react";

/**
 * Если приложение открыто ВНУТРИ чужой рамки (предпросмотр песочницы,
 * встроенный браузер мессенджера), рамка может блокировать доступ к
 * микрофону/камере и автоплей звука — звонок будет немым, что бы ни делал
 * код внутри. Полоска честно об этом говорит и даёт открыть приложение
 * в отдельной вкладке браузера, где ограничения рамки не действуют.
 */
export default function IframeNotice() {
  const [embedded, setEmbedded] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let inFrame = false;
    try {
      inFrame = window.self !== window.top;
    } catch {
      inFrame = true;
    }
    setEmbedded(inFrame);
  }, []);

  if (!embedded || dismissed) return null;

  const url = typeof window !== "undefined" ? window.location.href : "/";

  return (
    <div className="fixed inset-x-0 top-0 z-[120] flex items-center justify-center gap-3 border-b border-amber-300/20 bg-[#1a1204]/95 px-4 py-2 text-[12px] text-amber-200 backdrop-blur">
      <span>
        Приложение открыто внутри предпросмотра — микрофон, камера и звук
        звонков могут блокироваться рамкой.
      </span>
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-400/20 px-3 py-1 font-semibold text-amber-100 transition hover:bg-amber-400/30"
      >
        <ExternalLink className="h-3.5 w-3.5" />
        Открыть в отдельной вкладке
      </a>
      <button
        onClick={() => setDismissed(true)}
        className="shrink-0 rounded-full p-1 text-amber-200/60 transition hover:bg-white/10"
        title="Скрыть"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
