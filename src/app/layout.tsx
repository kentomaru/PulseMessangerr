import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import RegisterSW from "./register-sw";

export const metadata: Metadata = {
  title: "Pulse — мессенджер",
  description:
    "Pulse: быстрый мессенджер с обоями, вложениями, ответами, реакциями и гибкими настройками.",
  applicationName: "Pulse",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Pulse",
  },
};

export const viewport: Viewport = {
  themeColor: "#070a11",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru" data-theme="midnight" data-size="md">
      <body className="h-full overflow-hidden antialiased">
        {children}
        <RegisterSW />
      </body>
    </html>
  );
}
