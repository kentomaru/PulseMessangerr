/**
 * Обёртка для API-роутов: единая точка для
 *  — авторизации (getSessionUser);
 *  — логирования каждого запроса (метод, путь, статус, длительность);
 *  — устойчивости к «база ещё не поднялась»: при ошибке соединения ждём 2 секунды
 *    и повторяем запрос, и только потом отдаём 503;
 *  — единых JSON-ошибок (500 без стека наружу, стек — в логи).
 */
import { NextRequest, NextResponse } from "next/server";
import type { User } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { createLogger, type Logger } from "@/lib/logger";
import { sleep, errorSummary } from "@/db";

export function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

/** Похоже ли исключение на «база недоступна / ещё поднимается»? */
export function isDbDownError(err: unknown): boolean {
  const e = err as { code?: string; message?: string };
  if (!e) return false;
  const code = e.code ?? "";
  const message = e.message ?? "";
  return (
    code === "ECONNREFUSED" ||
    code === "ETIMEDOUT" ||
    code === "ENOTFOUND" ||
    code === "ECONNRESET" ||
    code === "57P03" || // the database system is starting up
    code === "57P02" || // crash recovery
    message.includes("Connection refused") ||
    message.includes("database system is starting up") ||
    message.includes("the database system is shutting down") ||
    message.includes("Connection timed out") ||
    message.includes("cannot connect") ||
    message.includes("ConnectionError")
  );
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Проверка формата uuid, чтобы «мусорные» id не превращались в 500 от базы. */
export function isUuid(value: string | undefined | null): boolean {
  return !!value && UUID_RE.test(value);
}

type Params = Record<string, string>;

type HandlerArgs<P extends Params> = {
  req: NextRequest;
  params: P;
  me: User;
  log: Logger;
};

type PublicHandlerArgs<P extends Params> = {
  req: NextRequest;
  params: P;
  log: Logger;
};

type RouteContext<P extends Params> = { params: Promise<P> };

export function withApi<P extends Params = Record<string, never>>(
  scope: string,
  handler: (args: HandlerArgs<P>) => Promise<NextResponse>,
): (req: NextRequest, ctx: RouteContext<P>) => Promise<NextResponse> {
  return runWrapped(scope, handler, { auth: true });
}

export function withPublicApi<P extends Params = Record<string, never>>(
  scope: string,
  handler: (args: PublicHandlerArgs<P>) => Promise<NextResponse>,
): (req: NextRequest, ctx: RouteContext<P>) => Promise<NextResponse> {
  return runWrapped(scope, handler as (args: HandlerArgs<P>) => Promise<NextResponse>, { auth: false });
}

function runWrapped<P extends Params>(
  scope: string,
  handler: (args: HandlerArgs<P>) => Promise<NextResponse>,
  opts: { auth: boolean },
) {
  const log = createLogger(`api:${scope}`);
  return async (req: NextRequest, ctx: RouteContext<P>): Promise<NextResponse> => {
    const started = Date.now();
    const path = safePath(req);
    const attempt = async (): Promise<NextResponse> => {
      let me: User | null = null;
      if (opts.auth) {
        me = await getSessionUser();
        if (!me) return jsonError("Не авторизован", 401);
      }
      const params = ((await ctx?.params) ?? {}) as P;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return await handler({ req, params, me: me as any, log });
    };

    try {
      let res: NextResponse;
      try {
        res = await attempt();
      } catch (err) {
        if (isDbDownError(err)) {
          log.warn(`${req.method} ${path}: база недоступна, повтор запроса через 2 с`, {
            err: errorSummary(err),
          });
          await sleep(2_000);
          res = await attempt(); // если и сейчас упало — уйдёт в общий catch
        } else {
          throw err;
        }
      }
      log.info(`${req.method} ${path} → ${res.status}`, { ms: String(Date.now() - started) });
      return res;
    } catch (err) {
      if (err instanceof SyntaxError) {
        log.warn(`${req.method} ${path}: некорректный JSON в теле запроса`);
        return jsonError("Некорректный формат запроса", 400);
      }
      if (isDbDownError(err)) {
        log.error(`${req.method} ${path}: база данных недоступна после повтора`, {
          err: errorSummary(err),
        });
        return jsonError("База данных ещё подключается, попробуйте через несколько секунд", 503);
      }
      log.error(`${req.method} ${path}: необработанная ошибка`, { err });
      return jsonError("Ошибка сервера", 500);
    }
  };
}

function safePath(req: NextRequest): string {
  try {
    return req.nextUrl.pathname + (req.nextUrl.search || "");
  } catch {
    return "unknown";
  }
}
