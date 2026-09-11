import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // Звонки/сообщения — реальное время через polling, ничего не кэшируем на уровне сборки.
  experimental: {},
};

export default nextConfig;
