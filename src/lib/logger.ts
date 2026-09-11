/**
 * Структурированный логгер Pulse.
 *
 * Формат: [время] [УРОВЕНЬ] [scope] сообщение key=value key=value
 * Пишет в stdout/stderr — Railway и другие платформы собирают эти логи.
 *
 * Уровень задаётся переменной окружения LOG_LEVEL: debug | info | warn | error (по умолчанию info).
 *
 * В контекст можно передавать Error — тогда логируется message + stack.
 * В логи никогда не пишутся пароли, SDP-описания звонков и содержимое сообщений.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function minLevel(): number {
  const raw = (process.env.LOG_LEVEL ?? "info").toLowerCase();
  return LEVEL_ORDER[(raw as LogLevel) in LEVEL_ORDER ? (raw as LogLevel) : "info"];
}

export type LogContext = Record<string, unknown>;

function formatValue(value: unknown): string {
  if (value instanceof Error) {
    const stack = value.stack ?? "";
    const trimmed = stack.length > 900 ? `${stack.slice(0, 900)}…` : stack;
    return JSON.stringify({ name: value.name, message: value.message, stack: trimmed });
  }
  if (value === undefined) return "undefined";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || value === null) return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function formatContext(ctx?: LogContext): string {
  if (!ctx || Object.keys(ctx).length === 0) return "";
  const parts = Object.entries(ctx).map(([k, v]) => `${k}=${formatValue(v)}`);
  return ` ${parts.join(" ")}`;
}

function write(level: LogLevel, scope: string, message: string, ctx?: LogContext) {
  if (LEVEL_ORDER[level] < minLevel()) return;
  const line = `[${new Date().toISOString()}] [${level.toUpperCase()}] [${scope}] ${message}${formatContext(ctx)}`;
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export interface Logger {
  debug(message: string, ctx?: LogContext): void;
  info(message: string, ctx?: LogContext): void;
  warn(message: string, ctx?: LogContext): void;
  error(message: string, ctx?: LogContext): void;
}

export function createLogger(scope: string): Logger {
  return {
    debug: (m, c) => write("debug", scope, m, c),
    info: (m, c) => write("info", scope, m, c),
    warn: (m, c) => write("warn", scope, m, c),
    error: (m, c) => write("error", scope, m, c),
  };
}
