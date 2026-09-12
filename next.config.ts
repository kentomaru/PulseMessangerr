import type { NextConfig } from "next";

/**
 * Next.js компилирует `src/instrumentation.ts` не только для Node-рантайма,
 * но и для edge/middleware-слоя. Туда попадает и `src/db/index.ts` с драйвером
 * `postgres`, которому нужны Node-модули (net/tls/crypto). В edge-сборке их нет,
 * и любой запрос в dev падал с 500 «Module not found: Can't resolve 'net'».
 *
 * Поэтому для edge-целей помечаем драйвер и Node-модули как внешние:
 * код instrumentation сам проверяет NEXT_RUNTIME и в edge ничего не вызывает.
 */
const NODE_BUILTINS = [
  "net",
  "tls",
  "dns",
  "fs",
  "stream",
  "crypto",
  "http",
  "https",
  "zlib",
  "util",
  "path",
  "os",
  "events",
  "buffer",
  "string_decoder",
  "querystring",
  "assert",
  "child_process",
  "worker_threads",
  "perf_hooks",
  "async_hooks",
  "tty",
  "constants",
  "process",
  "module",
  "timers",
  "url",
  "node:crypto",
  "node:net",
  "node:tls",
  "node:fs",
  "node:stream",
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // Звонки/сообщения — реальное время через polling, ничего не кэшируем на уровне сборки.
  experimental: {},
  webpack: (config, { nextRuntime }) => {
    if (nextRuntime === "edge" || nextRuntime === undefined) {
      config.externals = config.externals ?? [];
      config.externals.push({
        postgres: "commonjs postgres",
        ...Object.fromEntries(NODE_BUILTINS.map((m) => [m, `commonjs ${m}`])),
      });
    }
    return config;
  },
};

export default nextConfig;
