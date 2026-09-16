/**
 * Сброс базы данных Pulse до чистого состояния.
 *
 * Что делает: подключается к Postgres, УДАЛЯЕТ базу `pulse` целиком
 * и создаёт её заново. После этого достаточно перезапустить сервер —
 * он сам накатит всю схему (ensureSchema) на старте. Все пользователи,
 * сообщения и подарки сотрутся.
 *
 * Запуск (из корня репозитория):
 *   node scripts/reset-db.mjs
 *
 * Если база находится не на localhost:5432 — задай DATABASE_URL:
 *   DATABASE_URL=postgres://user:pass@host:5432/postgres node scripts/reset-db.mjs
 */
import pg from "pg";

const { Client } = pg;
const base = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/postgres";
// из URL соединения выдёргиваем адрес сервера (базу в пути заменяем на postgres)
const url = new URL(base.replace("postgresql://", "postgres://"));
if (!/\/(postgres|)$/.test(url.pathname)) url.pathname = "/postgres";

const c = new Client({ connectionString: url.toString() });
await c.connect();
console.log("Соединился с", url.host);
await c.query('DROP DATABASE IF EXISTS pulse WITH (FORCE)');
console.log("База pulse удалена");
await c.query("CREATE DATABASE pulse");
console.log("База pulse создана заново");
await c.end();
console.log("Готово. Перезапусти сервер — схема накатится сама.");
