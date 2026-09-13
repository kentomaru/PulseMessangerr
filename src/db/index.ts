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
import { eq } from "drizzle-orm";
import postgres from "postgres";
import * as schema from "./schema";
import { files } from "./schema";
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
    alter table users add column if not exists allow_group_invites boolean not null default true;
    alter table users add column if not exists status_emoji text not null default '';

    create table if not exists sessions (
      token text primary key,
      user_id uuid not null references users(id) on delete cascade,
      created_at timestamptz not null default now(),
      expires_at timestamptz not null
    );
    create index if not exists sessions_user_idx on sessions(user_id);

    create table if not exists conversations (
      id uuid primary key default gen_random_uuid(),
      kind text not null default 'direct',
      is_group boolean not null default false,
      name text,
      avatar_url text,
      about text not null default '',
      is_private boolean not null default true,
      invite_token text unique,
      owner_id uuid references users(id) on delete set null,
      created_at timestamptz not null default now()
    );
    alter table conversations add column if not exists name text;
    alter table conversations add column if not exists avatar_url text;
    alter table conversations add column if not exists about text not null default '';
    alter table conversations add column if not exists is_private boolean not null default true;
    alter table conversations add column if not exists invite_token text unique;
    alter table conversations add column if not exists owner_id uuid references users(id) on delete set null;
    /* Одноразовый перенос со старой модели (is_group) на kind: срабатывает только
       если колонки kind раньше не было, иначе перезапись на каждом старте
       превратила бы каналы обратно в группы. */
    do $$
    begin
      if not exists (
        select 1 from information_schema.columns
        where table_name = 'conversations' and column_name = 'kind'
      ) then
        alter table conversations add column kind text not null default 'direct';
        if exists (
          select 1 from information_schema.columns
          where table_name = 'conversations' and column_name = 'is_group'
        ) then
          update conversations set kind = 'group' where is_group;
        end if;
      end if;
    end $$;
    create index if not exists conversations_kind_idx on conversations(kind, is_private);

    create table if not exists conversation_members (
      conversation_id uuid not null references conversations(id) on delete cascade,
      user_id uuid not null references users(id) on delete cascade,
      role text not null default 'member',
      last_read_at timestamptz not null default now(),
      typing_at timestamptz,
      wallpaper text,
      joined_at timestamptz not null default now(),
      primary key (conversation_id, user_id)
    );
    alter table conversation_members add column if not exists typing_at timestamptz;
    alter table conversation_members add column if not exists wallpaper text;
    alter table conversation_members add column if not exists role text not null default 'member';
    alter table conversation_members add column if not exists joined_at timestamptz not null default now();
    create index if not exists conversation_members_user_idx on conversation_members(user_id);
    /* Старые группы создавались без владельца и ролей — назначаем владельцем
       самого раннего участника, иначе группой никто не сможет управлять. */
    do $$
    declare
      rec record;
      first_member uuid;
    begin
      for rec in
        select c.id from conversations c
        where c.kind <> 'direct' and c.owner_id is null
      loop
        select cm.user_id into first_member
          from conversation_members cm
          where cm.conversation_id = rec.id
          order by cm.joined_at, cm.user_id
          limit 1;
        if first_member is not null then
          update conversations set owner_id = first_member where id = rec.id;
          update conversation_members set role = 'owner'
            where conversation_id = rec.id and user_id = first_member;
        end if;
      end loop;
    end $$;

    /* ── Звонки: комната на диалог + mesh-сигналинг между участниками ──
       Старая модель 1:1 (caller/callee, offer/answer в одной строке) заменена
       групповыми комнатами. Сносим таблицу только если она ещё старой формы —
       иначе каждый рестарт стирал бы живые комнаты. */
    do $$
    begin
      if exists (
        select 1 from information_schema.columns
        where table_name = 'calls' and column_name in ('caller_id', 'callee_id')
      ) then
        drop table if exists call_signals cascade;
        drop table if exists call_invites cascade;
        drop table if exists call_participants cascade;
        drop table if exists calls cascade;
      end if;
    end $$;

    create table if not exists calls (
      id uuid primary key default gen_random_uuid(),
      conversation_id uuid not null references conversations(id) on delete cascade,
      host_id uuid not null references users(id) on delete cascade,
      media text not null default 'audio',
      status text not null default 'live',
      join_token text not null unique,
      participant_count integer not null default 0,
      started_at timestamptz not null default now(),
      answered_at timestamptz,
      ended_at timestamptz
    );
    alter table calls add column if not exists participant_count integer not null default 0;
    create index if not exists calls_conversation_idx on calls(conversation_id, status);
    create index if not exists calls_join_token_idx on calls(join_token);

    create table if not exists call_participants (
      call_id uuid not null references calls(id) on delete cascade,
      user_id uuid not null references users(id) on delete cascade,
      sdp text,
      video_on boolean not null default false,
      muted boolean not null default false,
      guest boolean not null default false,
      joined_at timestamptz not null default now(),
      left_at timestamptz,
      last_seen_at timestamptz not null default now(),
      primary key (call_id, user_id)
    );
    alter table call_participants add column if not exists screen_on boolean not null default false;
    create index if not exists call_participants_user_idx on call_participants(user_id);

    create table if not exists call_signals (
      id uuid primary key default gen_random_uuid(),
      call_id uuid not null references calls(id) on delete cascade,
      from_user_id uuid not null references users(id) on delete cascade,
      to_user_id uuid not null references users(id) on delete cascade,
      kind text not null,
      payload jsonb not null,
      read_at timestamptz,
      created_at timestamptz not null default now()
    );
    create index if not exists call_signals_to_idx on call_signals(call_id, to_user_id, read_at);

    create table if not exists call_invites (
      call_id uuid not null references calls(id) on delete cascade,
      user_id uuid not null references users(id) on delete cascade,
      invited_by uuid not null references users(id) on delete cascade,
      created_at timestamptz not null default now(),
      primary key (call_id, user_id)
    );
    create index if not exists call_invites_user_idx on call_invites(user_id);

    create table if not exists messages (
      id uuid primary key default gen_random_uuid(),
      conversation_id uuid not null references conversations(id) on delete cascade,
      sender_id uuid not null references users(id) on delete cascade,
      type text not null default 'text',
      content text not null,
      reply_to_id uuid,
      created_at timestamptz not null default now(),
      deleted_at timestamptz,
      call_id uuid references calls(id) on delete cascade
    );
    alter table messages add column if not exists call_id uuid references calls(id) on delete cascade;
    alter table messages add column if not exists reply_to_id uuid;
    /* Если старая таблица calls сносилась каскадом — внешний ключ messages.call_id
       пропадал вместе с ней, возвращаем его обратно. */
    do $$
    begin
      if exists (select 1 from information_schema.columns
                 where table_name = 'messages' and column_name = 'call_id')
         and not exists (select 1 from pg_constraint
                         where conname = 'messages_call_id_fkey') then
        /* старая таблица calls снесена — ссылки на неё больше не валидны */
        update messages set call_id = null
          where call_id is not null
            and not exists (select 1 from calls where calls.id = messages.call_id);
        alter table messages
          add constraint messages_call_id_fkey
          foreign key (call_id) references calls(id) on delete cascade;
      end if;
    end $$;
    alter table messages add column if not exists reply_to_id uuid;
    alter table messages add column if not exists edited_at timestamptz;
    alter table messages add column if not exists pinned_at timestamptz;
    create unique index if not exists messages_call_id_key on messages(call_id);
    create index if not exists messages_conversation_idx on messages(conversation_id, created_at);
    create index if not exists messages_reply_idx on messages(reply_to_id);

    /* Реакции на сообщения (Discord/Telegram-стайл) */
    create table if not exists message_reactions (
      message_id uuid not null references messages(id) on delete cascade,
      user_id uuid not null references users(id) on delete cascade,
      emoji text not null,
      created_at timestamptz not null default now(),
      primary key (message_id, user_id, emoji)
    );
    create index if not exists message_reactions_message_idx on message_reactions(message_id);

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

    /* Загруженные файлы в самой базе: на эфемерной файловой системе контейнера
       (Railway и т.п.) папка data/uploads переживает только текущий деплой —
       после рестарта все истории/аватары/баннеры «переставали грузиться». */
    create table if not exists files (
      name text primary key,
      data bytea not null,
      mime text not null default 'application/octet-stream',
      size bigint not null default 0,
      created_at timestamptz not null default now()
    );

    /* Друзья (заявки как в Discord) и чёрный список — без шага миграций. */
    alter table users add column if not exists discoverable boolean not null default true;
    alter table users add column if not exists birthday text not null default '';
    create table if not exists friend_requests (
      from_id uuid not null references users(id) on delete cascade,
      to_id uuid not null references users(id) on delete cascade,
      status text not null default 'pending',
      created_at timestamptz not null default now(),
      primary key (from_id, to_id)
    );
    create table if not exists user_blocks (
      blocker_id uuid not null references users(id) on delete cascade,
      blocked_id uuid not null references users(id) on delete cascade,
      created_at timestamptz not null default now(),
      primary key (blocker_id, blocked_id)
    );
  `);
  log.info("Схема базы данных проверена (ensureSchema: ok)");
}

/** Максимальный размер файла, который дублируем в БД (картинки/аудио). */
export const DB_MIRROR_MAX_BYTES = 100 * 1024 * 1024;

/**
 * Разово переносит уже существующие на диске файлы в таблицу files.
 * Нужно при старте после обновления: истории/баннеры, загруженные ДО того,
 * как появилась копия в БД, иначе переживут только текущий деплой.
 * Работает лениво и идемпотентно (пропускает то, что уже в базе).
 */
export async function backfillFilesToDb(): Promise<void> {
  const { readFile, readdir, stat } = await import("fs/promises");
  const path = await import("path");
  const dir = path.join(process.cwd(), "data", "uploads");

  let names: string[] = [];
  try {
    names = await readdir(dir);
  } catch {
    return; // папки ещё нет — нечего переносить
  }

  let copied = 0;
  let skipped = 0;
  for (const name of names.slice(0, 2000)) {
    if (!/^[a-zA-Z0-9-]+\.[a-z0-9]{1,8}$/i.test(name)) continue;
    const filePath = path.join(dir, name);
    try {
      const st = await stat(filePath);
      if (!st.isFile() || st.size === 0 || st.size > DB_MIRROR_MAX_BYTES) {
        skipped++;
        continue;
      }
      const exists = await db
        .select({ name: files.name })
        .from(files)
        .where(eq(files.name, name))
        .limit(1);
      if (exists.length > 0) continue;
      const data = await readFile(filePath);
      await db
        .insert(files)
        .values({ name, data, mime: "application/octet-stream", size: data.length })
        .onConflictDoNothing();
      copied++;
    } catch (err) {
      log.debug("backfill: пропуск файла", {
        name,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }
  if (copied > 0 || skipped > 0) {
    log.info("Файлы продублированы в БД (backfill)", {
      copied: String(copied),
      skippedLarge: String(skipped),
    });
  }
}
