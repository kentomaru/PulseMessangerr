/**
 * Хук запуска Next.js (instrumentation).
 *
 * register() вызывается один раз при старте сервера — как раз здесь надёжно
 * ждём готовности базы данных (Railway иногда поднимает Postgres позже приложения),
 * не давая серверу упасть: попытка → 2 секунды → следующая попытка.
 *
 * Сначала ждём недолго в блокирующем режиме (чтобы обычный запуск с живой БД
 * стартовал мгновенно), а если база ещё поднимается — продолжаем ждать в фоне:
 * сервер уже отвечает, API отдают 503 и восстанавливаются сами.
 *
 * onRequestError() автоматически логирует все необработанные ошибки сервера —
 * сразу видно, «где что сломалось».
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { createLogger } = await import("./lib/logger");
  const log = createLogger("startup");
  log.info("Pulse запускается…", { node: process.version });

  const { waitForDb, ensureSchema } = await import("./db");

  // Фаза 1: ждём до 16 секунд (8 попыток × 2 с) — обычно БД на Railway готова за 2–4 с.
  const quick = await waitForDb(8);

  if (quick) {
    try {
      await ensureSchema();
      log.info("Pulse готов к работе");
    } catch (err) {
      log.error("Не удалось применить схему БД — проверьте права доступа к базе", { err });
    }
    return;
  }

  // Фаза 2: база ещё поднимается — не блокируем сервер, ждём в фоне ещё 90 секунд.
  log.warn(
    "База данных ещё поднимается. Сервер начинает работать: страница покажет экран подключения, API будут отвечать 503 и восстанавливаются сами.",
  );
  void (async () => {
    const ready = await waitForDb(45);
    if (!ready) {
      log.error(
        "База данных так и не ответила (всего ~106 секунд ожидания). Проверьте DATABASE_URL и статус сервиса Postgres.",
      );
      return;
    }
    try {
      await ensureSchema();
      log.info("База данных подключена — Pulse полностью готов");
    } catch (err) {
      log.error("Не удалось применить схему БД — проверьте права доступа к базе", { err });
    }
  })();
}

export function onRequestError(
  err: unknown,
  request: { path: string; method: string; headers: Record<string, string | undefined> },
  context: { routerKind: string; routePath: string; routeType: string },
) {
  const message = err instanceof Error ? `${err.message}\n${err.stack ?? ""}` : String(err);
  console.error(
    `[${new Date().toISOString()}] [ERROR] [server] ${request.method} ${request.path} (${context.routerKind}:${context.routePath})\n${message}`,
  );
}
