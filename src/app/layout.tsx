import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin", "cyrillic"], variable: "--font-inter" });
const sg = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-sg",
});

export const metadata: Metadata = {
  title: "Pulse — мессенджер со звонками",
  description:
    "Pulse: красивый мессенджер с личными чатами, голосовыми звонками через WebRTC и гибкой настройкой профиля.",
};

export const viewport: Viewport = {
  themeColor: "#06060b",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body className={`${inter.variable} ${sg.variable} antialiased grain`}>
        <div className="aurora-bg" />
        {children}
      </body>
    </html>
  );
}
