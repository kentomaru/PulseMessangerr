"use client";

import { useEffect } from "react";

export default function RegisterSW() {
  useEffect(() => {
    // Один и тот же вид эмодзи на всех платформах: подтягиваем
    // Noto Color Emoji веб-шрифтом (в тестовых средах не грузим внешнее).
    if (!navigator.userAgent.includes("jsdom")) {
      const pre1 = document.createElement("link");
      pre1.rel = "preconnect";
      pre1.href = "https://fonts.googleapis.com";
      const pre2 = document.createElement("link");
      pre2.rel = "preconnect";
      pre2.href = "https://fonts.gstatic.com";
      pre2.crossOrigin = "anonymous";
      const font = document.createElement("link");
      font.rel = "stylesheet";
      font.href = "https://fonts.googleapis.com/css2?family=Noto+Color+Emoji&display=swap";
      document.head.append(pre1, pre2, font);
    }
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* установка PWA просто не будет предложена — приложение работает как обычно */
      });
    }
  }, []);
  return null;
}
