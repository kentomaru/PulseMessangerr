/**
 * Подключение к PostgreSQL.
 *
 * Ключевая идея (почему Railway раньше падал):
 *  — клиент создаётся лениво, никакого подключения на этапе импорта модуля;
 *  — при старте сервера instrumentation.ts вызывает waitForDb():
 *    если база ещё не поднята — ждём 2 секунды и пробуем снова (до 60 секунд),
 *    сервер при этом не падает;
 *  — ensureSchema() сама создаёт/дополняет таблицы (идемпотентный DDL),
 *    поэтому деплой не требует отдельного шага миграций;
 *  — если база «отвалилась» в рантайме — API-роуты через withApi()
 *    делают повторный запрос через 2 секунды, а не роняют процесс.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { createLogger } from "@/lib/logger";

const log = createLogger("db");

export const RETRY_DELAY_MS = 2_000;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  log.error("Переменная окружения DATABASE_URL не задана — укажите её (Railway: Variables → DATABASE_URL)");
}

export const client = postgres(connectionString ?? "postgres://postgres:postgres@localhost:5432/pulse", {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
  // postgres.js сам понимает sslmode=require в строке подключения.
  // NOTICE-сообщения (например, «already exists, skipping» от идемпотентного DDL)
  // не печатаем в stdout, а пишем на уровне debug.
  onnotice: (notice) => log.debug("Postgres NOTICE", { code: notice.code, message: notice.message }),
});

export const db = drizzle(client, { schema });

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Проверка живости соединения. */
export async function pingDb(): Promise<void> {
  await client`select 1`;
}

/**
 * Ждёт готовности базы данных: попытка → 2 секунды → новая попытка.
 * @returns true, если база ответила; false, если так и не дождались.
 */
export async function waitForDb(maxAttempts = 30, delayMs = RETRY_DELAY_MS): Promise<boolean> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await pingDb();
      if (attempt > 1) log.info("База данных на связи", { attempt: String(attempt) });
      else log.info("База данных на связи");
      return true;
    } catch (err) {
      log.warn(
        `База данных недоступна (попытка ${attempt}/${maxAttempts}). Повтор через ${delayMs / 1000} с`,
        { err: errorSummary(err) },
      );
      await sleep(delayMs);
    }
  }
  return false;
}

/** Краткое описание ошибки для логов (без стека). */
export function errorSummary(err: unknown): string {
  if (err instanceof Error) {
    const code = (err as { code?: string }).code;
    return [err.name, code, err.message].filter(Boolean).join(": ") || String(err);
  }
  return String(err);
}

/**
 * Идемпотентный DDL: создаёт таблицы, если их нет, и добавляет новые колонки
 * к уже существующим (для обновления деплоя без ручных миграций).
 * Опасных операций (drop) здесь нет.
 */
export async function ensureSchema(): Promise<void> {
  await client.unsafe(`
    create table if not exists users (
      id uuid primary key default gen_random_uuid(),
      username text not null unique,
      display_name text not null,
      password_hash text not null,
      avatar_url text,
      banner_url text,
      bio text not null default '',
      last_seen_at timestamptz not null default now(),
      created_at timestamptz not null default now()
    );
    alter table users add column if not exists show_online boolean not null default true;
    alter table users add column if not exists allow_calls boolean not null default true;
    alter table users add column if not exists allow_messages boolean not null default true;

    create table if not exists uploads (
      name text primary key,
      owner_id uuid references users(id) on delete cascade,
      mime_type text not null,
      data bytea not null,
      created_at timestamptz not null default now()
    );
    alter table uploads add column if not exists owner_id uuid references users(id) on delete cascade;

    create table if not exists sessions (
      token text primary key,
      user_id uuid not null references users(id) on delete cascade,
      created_at timestamptz not null default now(),
      expires_at timestamptz not null
    );
    create index if not exists sessions_user_idx on sessions(user_id);

    create table if not exists conversations (
      id uuid primary key default gen_random_uuid(),
      is_group boolean not null default false,
      created_at timestamptz not null default now()
    );

    create table if not exists calls (
      id uuid primary key default gen_random_uuid(),
      conversation_id uuid not null references conversations(id) on delete cascade,
      caller_id uuid not null references users(id) on delete cascade,
      callee_id uuid references users(id) on delete cascade,
      media text not null default 'audio',
      status text not null default 'ringing',
      offer_sdp text,
      answer_sdp text,
      caller_ice jsonb not null default '[]'::jsonb,
      callee_ice jsonb not null default '[]'::jsonb,
      created_at timestamptz not null default now(),
      answered_at timestamptz,
      ended_at timestamptz
    );
    alter table calls add column if not exists callee_id uuid references users(id) on delete cascade;
    alter table calls add column if not exists media text not null default 'audio';
    alter table calls add column if not exists caller_ice jsonb not null default '[]'::jsonb;
    alter table calls add column if not exists callee_ice jsonb not null default '[]'::jsonb;
    create index if not exists calls_callee_idx on calls(callee_id, status);

    create table if not exists conversation_members (
      conversation_id uuid not null references conversations(id) on delete cascade,
      user_id uuid not null references users(id) on delete cascade,
      last_read_at timestamptz not null default now(),
      typing_at timestamptz,
      wallpaper text,
      primary key (conversation_id, user_id)
    );
    alter table conversation_members add column if not exists typing_at timestamptz;
    alter table conversation_members add column if not exists wallpaper text;

    create table if not exists messages (
      id uuid primary key default gen_random_uuid(),
      conversation_id uuid not null references conversations(id) on delete cascade,
      sender_id uuid not null references users(id) on delete cascade,
      type text not null default 'text',
      content text not null,
      created_at timestamptz not null default now(),
      deleted_at timestamptz,
      call_id uuid references calls(id) on delete cascade
    );
    alter table messages add column if not exists call_id uuid references calls(id) on delete cascade;
    create unique index if not exists messages_call_id_key on messages(call_id);
    create index if not exists messages_conversation_idx on messages(conversation_id, created_at);

    create table if not exists stories (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references users(id) on delete cascade,
      media_url text not null,
      caption text not null default '',
      created_at timestamptz not null default now(),
      expires_at timestamptz not null
    );
    create index if not exists stories_user_idx on stories(user_id, created_at);

    create table if not exists story_views (
      story_id uuid not null references stories(id) on delete cascade,
      user_id uuid not null references users(id) on delete cascade,
      viewed_at timestamptz not null default now(),
      primary key (story_id, user_id)
    );
  `);
  log.info("Схема базы данных проверена (ensureSchema: ok)");
}
