"use client";

import { useEffect } from "react";

export default function RegisterSW() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* установка PWA просто не будет предложена — приложение работает как обычно */
      });
    }
  }, []);
  return null;
}
