"use client";

import { useEffect } from "react";
import { Loader2, RefreshCw } from "lucide-react";

/** Экран «подключаемся к базе»: показывается, если БД ещё поднимается (например, на Railway). */
export default function DbConnecting() {
  // Защита от вечного цикла перезагрузок: не больше 6 попыток подряд
  const tries = Number(typeof window !== "undefined" ? sessionStorage.getItem("pm_db_tries") ?? "0" : "0");
  const exhausted = tries >= 6;
  useEffect(() => {
    if (exhausted) return;
    sessionStorage.setItem("pm_db_tries", String(tries + 1));
    const t = setTimeout(() => window.location.reload(), 5_000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="relative flex h-dvh items-center justify-center overflow-hidden p-4">
      <div className="pointer-events-none absolute inset-0">
        <div className="animate-float absolute top-[12%] left-[8%] h-72 w-72 rounded-full bg-white/10 blur-[110px]" />
        <div className="animate-float absolute right-[6%] bottom-[10%] h-80 w-80 rounded-full bg-white/8 blur-[120px] [animation-delay:-6s]" />
      </div>

      <div className="glass-strong relative w-full max-w-md rounded-[2rem] p-10 text-center shadow-[0_40px_120px_-30px_rgba(0,0,0,0.9)]">
        <div className="btn-gradient mx-auto flex h-16 w-16 items-center justify-center rounded-[1.3rem]">
          <Loader2 className="h-7 w-7 animate-spin text-white" />
        </div>
        <h1 className="font-display mt-6 text-xl font-bold">Подключаемся к базе данных</h1>
        <p className="mt-3 text-sm leading-relaxed text-white/50">
          {exhausted
            ? "База данных так и не ответила. Попробуйте обновить страницу позже или написать администратору."
            : "Сервер уже работает и ждёт, когда база данных ответит. Это занимает несколько секунд после запуска — страница обновится автоматически."}
        </p>
        <button
          onClick={() => window.location.reload()}
          className="glass mt-6 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-white/80 transition-colors hover:text-white"
        >
          <RefreshCw className="h-4 w-4" />
          Обновить сейчас
        </button>
      </div>
    </main>
  );
}
