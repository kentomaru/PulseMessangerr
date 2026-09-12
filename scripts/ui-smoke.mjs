#!/usr/bin/env node
/**
 * UI-смоук: прогоняет НАСТОЯЩИЙ клиентский бандл в jsdom и «кликает» интерфейс.
 *
 * Зачем это нужно: API-проверки не видят «мёртвый» UI. Если клиентский бандл
 * падает до гидратации (исторический пример: webpack externals из next.config.ts
 * попали в клиентскую сборку → require("process") в браузере), сервер отвечает
 * 200, данные в БД целы, а в браузере виден только SSR-каркас. Этот скрипт
 * грузит страницу со стартующего сервера (dev ИЛИ prod) под сессией
 * зарегистрированного пользователя и проходит основной сценарий:
 *
 *   гидратация → сайдбар → поиск → меню «+» → создание группы → чат →
 *   отправка сообщения → меню «⋮» → модалка обоев → закрытие → профиль.
 *
 * Везде слушаем window.onerror / unhandledrejection / console.error:
 * любая ошибка рантайма клиента — провал.
 *
 * Использование (сервер должен быть запущен отдельно):
 *   npm run dev                # или: npm run build && npm run start
 *   npm run smoke              # дождётся /api/health и прогонит сценарий
 *
 * Переменные окружения:
 *   SMOKE_URL                   адрес сервера (по умолчанию http://127.0.0.1:3000)
 *   SMOKE_HEALTH_TIMEOUT_MS     сколько ждать готовности (по умолчанию 240 с —
 *                               в dev первая компиляция может быть долгой)
 *   SMOKE_TIMEOUT_MS            общий таймаут сценария (по умолчанию 300 с)
 */
import jsdom from "jsdom";

const { JSDOM, VirtualConsole, requestInterceptor } = jsdom;

const BASE = (process.env.SMOKE_URL ?? "http://127.0.0.1:3000").replace(/\/+$/, "");
const HEALTH_TIMEOUT_MS = Number(process.env.SMOKE_HEALTH_TIMEOUT_MS ?? 240_000);
const OVERALL_TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS ?? 300_000);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ─────────────────────────── сбор ошибок рантайма ─────────────────────────── */

/**
 * Все перехваченные ошибки клиента. window.onerror и jsdomError дублируют одну
 * и ту же необработанную исключение — дедуплицируем по тексту.
 */
const seen = new Set();
const runtimeErrors = [];
const consoleLines = []; // warn/log — не провал, но полезно при разборе провала

function addError(kind, message) {
  const text = String(message ?? "").split("\n").slice(0, 12).join("\n");
  if (!text) return;
  const key = `${kind}:${text.slice(0, 200)}`;
  if (seen.has(key)) return;
  seen.add(key);
  runtimeErrors.push({ kind, text });
}

// Ошибки приложения умеют «вылетать» из vm-контекста jsdom в хост-процесс
// (uncaught-исключение в микротаске клиентского бандла) — именно так проявлялся
// «мёртвый» UI: ReferenceError: require is not defined ронял и сам смок.
// Перехватываем здесь: фиксируем, а не падаем; код выхода всё равно будет 1.
process.on("uncaughtException", (e) =>
  addError("host-uncaught", `${e.message}\n${e.stack ?? ""}`),
);
process.on("unhandledRejection", (reason) =>
  addError(
    "host-unhandledrejection",
    reason instanceof Error ? `${reason.message}\n${reason.stack ?? ""}` : String(reason),
  ),
);

/* ─────────────────────────── шаги сценария ─────────────────────────── */

const steps = [];
function step(name, fn) {
  steps.push({ name, fn, state: "pending" });
}

let document, window;
let sessionCookie = "";

async function waitFor(what, fn, { timeout = 10_000, stepMs = 100 } = {}) {
  const start = Date.now();
  for (;;) {
    let value;
    try {
      value = await fn();
    } catch {
      value = undefined;
    }
    if (value) return value;
    if (Date.now() - start > timeout) throw new Error(`не дождались: ${what}`);
    await sleep(stepMs);
  }
}

const $ = (sel, root = document) => root.querySelector(sel);
const $all = (sel, root = document) => [...root.querySelectorAll(sel)];
const bodyText = () => document.body.textContent ?? "";

/** Кнопка, содержащая текст (поиск по текстContent, устойчив к иконкам). */
function buttonByText(needle, root = document) {
  return $all("button", root).find(
    (b) => b.textContent.replace(/\s+/g, " ").trim().includes(needle),
  );
}

/**
 * «Печатаем» в контролируемом input/textarea: нативный setter + событие input,
 * иначе React (value tracker) не увидит изменения.
 */
function typeInto(el, value) {
  const proto =
    el instanceof window.HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
  el.dispatchEvent(new window.Event("input", { bubbles: true }));
}

const click = (el) => el.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));

/** Оверлей модалки (ModalShell: fixed inset-0 z-[90]). */
const modalOverlay = () => document.querySelector("div[class*='z-[90]']");

/* ─────────────────────────── 10 проверок ─────────────────────────── */

function defineSteps(username, actorDisplayName, target, groupName, messageText) {
  step("Клиентский бандл отработал, React смонтировался", async () => {
    await waitFor(
      "гидратация (React-ключи на DOM)",
      () =>
        [document.body, document.querySelector("main")]
          .filter(Boolean)
          .some((n) =>
            Object.keys(n).some((k) => k.startsWith("__reactFiber") || k.startsWith("__reactContainer")),
          ),
      { timeout: 30_000, stepMs: 200 },
    );
  });

  step("Сайдбар жив: видно @username пользователя", async () => {
    await waitFor(`текст «@${username}» в сайдбаре`, () => bodyText().includes(`@${username}`));
  });

  step("Поиск: по вводу появляется дропдаун с людьми", async () => {
    const input = $("aside input[placeholder*='ссылка']") ?? $("aside input[type]");
    if (!input) throw new Error("не нашлось поле поиска в сайдбаре");
    // Ищем по отображаемому имени: API вырезает из запроса спецсимволы
    // (включая «_»), а @username аккаунтов смока начинается с «smoke_».
    typeInto(input, target.displayName);
    await waitFor(`дропдаун поиска с @${target.username}`, () =>
      bodyText().includes("Люди") && bodyText().includes(`@${target.username}`),
    );
    typeInto(input, "");
  });

  step("Меню «+» открывается", async () => {
    const plus = $('button[title="Создать группу или канал"]');
    if (!plus) throw new Error("не нашлась кнопка «+» в сайдбаре");
    click(plus);
    await waitFor("пункт «Создать группу» в меню", () => !!buttonByText("Создать группу", document.querySelector("aside")));
  });

  step("Группа создаётся через интерфейс", async () => {
    click(buttonByText("Создать группу", document.querySelector("aside")));
    await waitFor("модалка «Новая группа»", () => {
      const o = modalOverlay();
      return o && !!o.querySelector("input[placeholder='Название группы']");
    });
    const nameInput = $("input[placeholder='Название группы']");
    if (!nameInput) throw new Error("не нашлось поле названия группы");
    typeInto(nameInput, groupName);
    const submit = $all("button", modalOverlay()).find((b) => b.querySelector("svg[class*='lucide-check']"));
    if (!submit) throw new Error("не нашлась кнопка «Создать группу» в модалке");
    await waitFor("кнопка создания активна", () => !submit.disabled, { timeout: 5_000 });
    click(submit);
    await waitFor("модалка закрылась, группа в сайдбаре", () =>
      !modalOverlay() && bodyText().includes(groupName),
      { timeout: 15_000 },
    );
  });

  step("Чат открылся: шапка с названием группы", async () => {
    await waitFor("поле ввода чата + название группы в шапке", () =>
      !!$("textarea[placeholder='Сообщение…']") && bodyText().includes(groupName),
      { timeout: 15_000 },
    );
  });

  step("Сообщение отправляется и появляется в ленте", async () => {
    const input = $("textarea[placeholder='Сообщение…']");
    typeInto(input, messageText);
    const send = $('button[title="Отправить"]');
    if (!send) throw new Error("не нашлась кнопка отправки");
    await waitFor("кнопка отправки активна", () => !send.disabled, { timeout: 5_000 });
    click(send);
    await waitFor(`сообщение «${messageText}» в ленте`, () =>
      $all("p").some((p) => (p.textContent ?? "").includes(messageText)),
      { timeout: 15_000 },
    );
  });

  step("Меню «⋮» в чате → модалка «Обои чата»", async () => {
    const more = $all("button").find((b) => b.querySelector("svg[class*='lucide-more-vertical']"));
    if (!more) throw new Error("не нашлось меню «⋮» в шапке чата");
    click(more);
    const item = await waitFor("пункт «Обои чата» в меню", () => buttonByText("Обои чата"), {
      timeout: 5_000,
    });
    click(item);
    await waitFor("модалка обоев (h3 «Обои чата»)", () =>
      $all("h3").some((h) => h.textContent.includes("Обои чата")),
      { timeout: 10_000 },
    );
  });

  step("Модалка обоев закрывается (exit-анимация AnimatePresence)", async () => {
    const overlay = modalOverlay();
    const close = $all("button", overlay).find((b) => b.querySelector("svg[class*='lucide-x']"));
    if (!close) throw new Error("не нашлась кнопка закрытия модалки обоев");
    click(close);
    await waitFor("оверлей модалки удалён из DOM", () => !modalOverlay(), { timeout: 10_000 });
  });

  step("Профиль: клик по аватару → модалка → закрытие", async () => {
    const parts = actorDisplayName.trim().split(/\s+/);
    const initials = ((parts[0]?.[0] ?? "?") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
    const avatarBtn = $all("button", document.querySelector("aside")).find(
      (b) => b.textContent.trim() === initials,
    );
    if (!avatarBtn) throw new Error(`не нашлась кнопка аватара в сайдбаре (инициалы «${initials}»)`);
    click(avatarBtn);
    await waitFor("модалка профиля", () => {
      const o = modalOverlay();
      return o && o.textContent.includes("Отображаемое имя");
    });
    const close = $all("button", modalOverlay()).find((b) => b.querySelector("svg[class*='lucide-x']"));
    if (!close) throw new Error("не нашлась кнопка закрытия профиля");
    click(close);
    await waitFor("оверлей профиля удалён из DOM", () => !modalOverlay(), { timeout: 10_000 });
  });
}

/* ─────────────────────────── запуск ─────────────────────────── */

async function main() {
  console.log(`UI-смок против ${BASE}`);
  const watchdog = setTimeout(() => {
    console.error(`\n⏱ Превышен общий таймаут (${OVERALL_TIMEOUT_MS / 1000} с)`);
    process.exit(1);
  }, OVERALL_TIMEOUT_MS);

  // 1) Сервер и БД живы (в dev первая компиляция может занять минуту).
  console.log("Ждём /api/health (200)…");
  const healthStart = Date.now();
  for (;;) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.status === 200) break;
    } catch {
      /* сервер ещё не отвечает */
    }
    if (Date.now() - healthStart > HEALTH_TIMEOUT_MS) {
      throw new Error(`сервер не ответил 200 на /api/health за ${HEALTH_TIMEOUT_MS / 1000} с`);
    }
    await sleep(3_000);
  }
  console.log(`/api/health: 200 за ${((Date.now() - healthStart) / 1000).toFixed(1)} с`);

  // 2) Две регистрации: «актёр» (под его сессией жив jsdom) и «цель» для поиска.
  const suffix = Date.now().toString(36);
  const actor = { username: `smoke_a${suffix}`, password: "smoke-pass-1", displayName: "Smoke Test" };
  const target = { username: `smoke_b${suffix}`, password: "smoke-pass-2", displayName: "Цель Смоук" };
  const register = async (u) => {
    const r = await fetch(`${BASE}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(u),
    });
    const body = await r.json().catch(() => ({}));
    if (r.status !== 200) throw new Error(`регистрация ${u.username}: ${r.status} ${body.error ?? ""}`);
    const setCookie = r.headers.get("set-cookie") ?? "";
    const m = setCookie.match(/pulse_session=([^;]+)/);
    if (!m) throw new Error("регистрация не вернула cookie pulse_session");
    return m[1];
  };
  const token = await register(actor);
  sessionCookie = `pulse_session=${token}`;
  await register(target);
  console.log(`Зарегистрированы ${actor.username} (актёр) и ${target.username} (цель поиска)`);

  // 3) SSR-страница уже ПОД сессией (иначе в jsdom будет экран входа).
  const pageRes = await fetch(`${BASE}/`, { headers: { cookie: sessionCookie } });
  if (pageRes.status !== 200) throw new Error(`GET / → ${pageRes.status}`);
  const html = await pageRes.text();
  if (html.includes("С возвращением")) {
    throw new Error("SSR отдал экран входа — сессия не подхватилась");
  }

  // 4) jsdom: настоящий клиентский бандл, наш fetch с cookie, перехват ошибок.
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("error", (...args) => addError("console.error", args.map((a) => (a instanceof Error ? a.stack : String(a))).join(" ")));
  virtualConsole.on("jsdomError", (e) => {
    const msg = String(e?.message ?? e);
    // Известные ограничения jsdom, а не баги приложения:
    if (/Not implemented/i.test(msg) && /scroll|navigation|close/i.test(msg)) return;
    addError("jsdomError", msg + (e?.detail?.stack ? `\n${e.detail.stack}` : ""));
  });
  for (const level of ["log", "info", "warn"]) {
    virtualConsole.on(level, (...args) => consoleLines.push(`[${level}] ${args.map(String).join(" ")}`));
  }

  const dom = new JSDOM(html, {
    url: `${BASE}/`,
    runScripts: "dangerously",
    resources: {
      // Картинки не тянем — смоку нужен DOM, а не декодирование.
      interceptors: [
        requestInterceptor((request) => {
          if (request.url.includes("/api/files/")) {
            return new Response("", { headers: { "Content-Type": "image/png" } });
          }
          return undefined; // дальше — обычный undici
        }),
      ],
    },
    pretendToBeVisual: true, // requestAnimationFrame — framer-motion и скролл чата
    virtualConsole,
    beforeParse(w) {
      // jsdom-окно не наследует глобалы Node: докидываем web-globals, которых
      // нет у самого jsdom, а использует клиентский бандл (React 19/Next 15
      // смотрят ReadableStream и пр. на window).
      for (const name of [
        "ReadableStream",
        "WritableStream",
        "TransformStream",
        "Blob",
        "File",
        "Headers",
        "Request",
        "Response",
        "TextEncoder",
        "TextDecoder",
        "AbortController",
        "AbortSignal",
      ]) {
        if (typeof w[name] === "undefined" && typeof globalThis[name] !== "undefined") {
          try {
            Object.defineProperty(w, name, { value: globalThis[name], writable: true, configurable: true });
          } catch {
            /* readonly — пропускаем */
          }
        }
      }
      // fetch: полифилл на undici-фетч Node + cookie сессии на каждом запросе.
      // jsdom fetch не умеет relative-пути и не держит cookie httpOnly.
      w.fetch = (input, init = {}) => {
        const url = typeof input === "string" ? new URL(input, BASE).href : String(input);
        const headers = new Headers(init.headers ?? undefined);
        if (sessionCookie) headers.set("cookie", sessionCookie);
        return fetch(url, { ...init, headers });
      };
      // ResizeObserver: нет в jsdom, есть в любом браузере. В dev-сборке его
      // использует next-devtools (оверлей ошибок) — без заглушки смок падал бы
      // с «ResizeObserver is not defined» на чистой dev-сборке.
      if (typeof w.ResizeObserver === "undefined") {
        w.ResizeObserver = class ResizeObserver {
          constructor(callback) {
            this.callback = callback;
          }
          observe() {}
          unobserve() {}
          disconnect() {}
        };
      }
      // matchMedia: jsdom не реализует; framer-motion спрашивает prefers-reduced-motion.
      if (typeof w.matchMedia !== "function") {
        w.matchMedia = (query) => ({
          matches: false,
          media: query,
          onchange: null,
          addEventListener() {},
          removeEventListener() {},
          addListener() {},
          removeListener() {},
          dispatchEvent() {
            return false;
          },
        });
      }
      // Ошибки рантайма клиента: onerror + unhandledrejection.
      w.addEventListener("error", (e) => addError("window.onerror", `${e.message} (${e.filename ?? "?"}:${e.lineno ?? "?"})`));
      w.addEventListener("unhandledrejection", (e) => {
        const r = e.reason;
        addError("unhandledrejection", r instanceof Error ? `${r.message}\n${r.stack ?? ""}` : String(r));
      });
    },
  });
  window = dom.window;
  document = window.document;

  defineSteps(
    actor.username,
    actor.displayName,
    target,
    `Смоук ${suffix.slice(-4).toUpperCase()}`,
    `Привет, смоук ${suffix.slice(-4)}`,
  );

  // 5) Последовательно: упал шаг — следующие не выполняем.
  let aborted = false;
  for (const s of steps) {
    if (aborted) {
      s.state = "failed";
      console.log(`❌ ${s.name} — не выполнен (сбой на предыдущем шаге)`);
      continue;
    }
    try {
      await s.fn();
      s.state = "passed";
      console.log(`✅ ${s.name}`);
    } catch (e) {
      s.state = "failed";
      aborted = true;
      console.log(`❌ ${s.name} — ${e instanceof Error ? e.message : e}`);
    }
  }

  window.close();
  clearTimeout(watchdog);

  const passed = steps.filter((s) => s.state === "passed").length;
  const failed = steps.length - passed;
  console.log(`\nUI-смок: ✅ ${passed} / ❌ ${failed}`);

  if (runtimeErrors.length > 0) {
    console.log(`\nОшибки рантайма клиента — ${runtimeErrors.length}:`);
    for (const { kind, text } of runtimeErrors) {
      console.log(`  • [${kind}] ${text.split("\n").slice(0, 6).join("\n    ")}`);
    }
  } else if (failed === 0) {
    console.log("Ошибки рантайма клиента: нет");
  }

  if (failed > 0 && consoleLines.length > 0) {
    console.log("\nПоследние console.log/warn страницы:");
    for (const line of consoleLines.slice(-15)) console.log(`  ${line}`);
  }

  process.exit(failed > 0 || runtimeErrors.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(`\n💥 Смок упал: ${e instanceof Error ? (e.stack ?? e.message) : e}`);
  for (const { kind, text } of runtimeErrors) {
    console.error(`  • [${kind}] ${text.split("\n").slice(0, 6).join("\n    ")}`);
  }
  process.exit(1);
});
