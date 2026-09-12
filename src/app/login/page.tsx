"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PulseLogo } from "@/components/ui";
import { ACCENTS, ACCENT_KEYS, WALLPAPERS, parseWallpaper, wallpaperCss } from "@/lib/pulse";

type Account = {
  id: number;
  name: string;
  handle: string;
  emoji: string;
  accent: string;
  about: string;
};

const EMOJI_CHOICES = ["⚡", "🌊", "🎧", "🍭", "🚀", "🔥", "🌙", "🦊", "🐙", "🍀", "🎨", "🧊"];

export default function LoginPage() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [busy, setBusy] = useState<number | null>(null);
  const [mode, setMode] = useState<"pick" | "create">("pick");
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("⚡");
  const [accent, setAccent] = useState("violet");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/auth/accounts")
      .then((r) => r.json())
      .then((d) => setAccounts(d.accounts ?? []))
      .finally(() => setLoading(false));
  }, []);

  const enter = useCallback(
    async (userId: number) => {
      setBusy(userId);
      await fetch("/api/auth/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      router.push("/");
      router.refresh();
    },
    [router],
  );

  const create = useCallback(async () => {
    if (name.trim().length < 2) return;
    setBusy(-1);
    const res = await fetch("/api/auth/accounts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: name.trim(), emoji, accent }),
    });
    const data = await res.json();
    if (data?.user?.id) {
      await fetch("/api/auth/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: data.user.id }),
      });
      router.push("/");
      router.refresh();
    }
    setBusy(null);
  }, [accent, emoji, name, router]);

  const wp = parseWallpaper(JSON.stringify({ preset: "nebula" }));

  return (
    <main className="flex h-screen w-full items-center justify-center p-4">
      <div
        className="absolute inset-0 -z-10"
        style={{ background: wallpaperCss(wp), filter: "saturate(120%)" }}
      />
      <div
        className="animate-pulse-in glass w-full max-w-md overflow-hidden rounded-[28px] border p-7"
        style={{ background: "var(--panel)", borderColor: "var(--border)", boxShadow: "var(--shadow)" }}
      >
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="pulse-ring mb-3 rounded-[22px]">
            <PulseLogo size={62} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Pulse</h1>
          <p className="mt-1 text-[13px]" style={{ color: "var(--muted)" }}>
            Мессенджер, который звучит в ритме с вами
          </p>
        </div>

        {mode === "pick" ? (
          <>
            <div className="mb-2 px-1 text-[12px] font-semibold uppercase tracking-wide" style={{ color: "var(--muted)" }}>
              Выберите профиль
            </div>
            <div className="max-h-[46vh] pulse-scroll -mr-2 pr-2">
              {loading ? (
                <div className="space-y-2">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="h-16 animate-pulse rounded-2xl" style={{ background: "var(--panel-2)" }} />
                  ))}
                </div>
              ) : (
                accounts.map((acc) => {
                  const grad = ACCENTS[acc.accent] ?? ACCENTS.violet;
                  return (
                    <button
                      key={acc.id}
                      onClick={() => enter(acc.id)}
                      disabled={busy !== null}
                      className="mb-2 flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition hover:brightness-110 disabled:opacity-60"
                      style={{ background: "var(--panel-2)", borderColor: "var(--border)" }}
                    >
                      <div
                        className="flex h-11 w-11 items-center justify-center rounded-full text-xl"
                        style={{ background: `linear-gradient(135deg, ${grad.from}, ${grad.to})` }}
                      >
                        {acc.emoji}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[14px] font-semibold">{acc.name}</div>
                        <div className="truncate text-[12px]" style={{ color: "var(--muted)" }}>
                          @{acc.handle} · {acc.about}
                        </div>
                      </div>
                      <span className="text-[12px] font-medium" style={{ color: "var(--accent)" }}>
                        {busy === acc.id ? "Вход…" : "Войти"}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
            <button
              onClick={() => setMode("create")}
              className="mt-3 w-full rounded-2xl py-3 text-[13.5px] font-semibold text-white transition hover:brightness-110"
              style={{ background: "var(--accent)" }}
            >
              Создать новый профиль
            </button>
          </>
        ) : (
          <>
            <div className="mb-3">
              <div className="mb-1.5 px-1 text-[12px] font-semibold uppercase tracking-wide" style={{ color: "var(--muted)" }}>
                Имя
              </div>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Как вас зовут?"
                className="w-full rounded-2xl border px-4 py-3 text-[14px] outline-none"
                style={{ background: "var(--panel-2)", borderColor: "var(--border)" }}
              />
            </div>
            <div className="mb-3">
              <div className="mb-1.5 px-1 text-[12px] font-semibold uppercase tracking-wide" style={{ color: "var(--muted)" }}>
                Эмодзи
              </div>
              <div className="flex flex-wrap gap-2">
                {EMOJI_CHOICES.map((e) => (
                  <button
                    key={e}
                    onClick={() => setEmoji(e)}
                    className="h-10 w-10 rounded-xl text-lg transition"
                    style={{
                      background: emoji === e ? "var(--accent)" : "var(--panel-2)",
                      border: emoji === e ? "none" : "1px solid var(--border)",
                    }}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
            <div className="mb-5">
              <div className="mb-1.5 px-1 text-[12px] font-semibold uppercase tracking-wide" style={{ color: "var(--muted)" }}>
                Цвет
              </div>
              <div className="flex flex-wrap gap-2">
                {ACCENT_KEYS.map((key) => (
                  <button
                    key={key}
                    onClick={() => setAccent(key)}
                    className="h-9 w-9 rounded-full transition"
                    style={{
                      background: `linear-gradient(135deg, ${ACCENTS[key].from}, ${ACCENTS[key].to})`,
                      outline: accent === key ? `3px solid ${ACCENTS[key].ring}` : "none",
                    }}
                    aria-label={key}
                  />
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setMode("pick")}
                className="flex-1 rounded-2xl py-3 text-[13.5px] font-semibold"
                style={{ background: "var(--panel-2)", color: "var(--muted)" }}
              >
                Назад
              </button>
              <button
                onClick={create}
                disabled={name.trim().length < 2 || busy === -1}
                className="flex-[1.4] rounded-2xl py-3 text-[13.5px] font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
                style={{ background: "var(--accent)" }}
              >
                {busy === -1 ? "Создаём…" : "Войти в Pulse"}
              </button>
            </div>
          </>
        )}

        <p className="mt-5 text-center text-[11.5px]" style={{ color: "var(--muted)" }}>
          Демо-режим: любой профиль доступен без пароля
        </p>
      </div>
    </main>
  );
}
