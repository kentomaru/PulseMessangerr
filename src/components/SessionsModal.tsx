"use client";

import { useCallback, useEffect, useState } from "react";
import { Globe, Loader2, LogOut, Monitor, Smartphone, X } from "lucide-react";
import { ModalShell } from "./ProfileModal";
import { api } from "@/lib/api";

type SessionItem = {
  token: string;
  userAgent: string;
  ip: string;
  createdAt: string;
  expiresAt: string;
  current: boolean;
};

/** Человекочитаемое имя устройства по User-Agent. */
function deviceLabel(ua: string): { name: string; kind: "mobile" | "desktop" | "web" } {
  const u = ua.toLowerCase();
  let kind: "mobile" | "desktop" | "web" = "desktop";
  if (/iphone|ipad|android|mobile/.test(u)) kind = "mobile";
  else if (!ua) kind = "web";
  const os = /iphone|ipad/.test(u)
    ? "iOS"
    : /android/.test(u)
      ? "Android"
      : /windows/.test(u)
        ? "Windows"
        : /mac os/.test(u)
          ? "macOS"
          : /linux/.test(u)
            ? "Linux"
            : ua
              ? "Устройство"
              : "Неизвестно";
  const browser = /edg\//.test(u)
    ? "Edge"
    : /firefox/.test(u)
      ? "Firefox"
      : /chrome/.test(u)
        ? "Chrome"
        : /safari/.test(u)
          ? "Safari"
          : "Браузер";
  return { name: kind === "mobile" ? `${browser} · ${os}` : `${os} · ${browser}`, kind };
}

/** «Устройства»: активные сессии аккаунта, как в ТГ. */
export default function SessionsModal({ onClose, notify }: { onClose: () => void; notify: (m: string) => void }) {
  const [rows, setRows] = useState<SessionItem[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await api<{ sessions: SessionItem[] }>("/api/auth/sessions");
      setRows(d.sessions);
    } catch (e) {
      notify(e instanceof Error ? e.message : "Не удалось загрузить устройства");
    }
  }, [notify]);

  useEffect(() => {
    void load();
  }, [load]);

  const kill = async (token: string) => {
    setBusy(token);
    try {
      await api("/api/auth/sessions/kill", { method: "POST", body: JSON.stringify({ token }) });
      notify("Сессия завершена");
      await load();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Не удалось завершить");
    } finally {
      setBusy(null);
    }
  };

  const killOthers = async () => {
    setBusy("all");
    try {
      const d = await api<{ killed: number }>("/api/auth/sessions/kill", {
        method: "POST",
        body: JSON.stringify({ allOthers: true }),
      });
      notify(`Завершено сессий: ${d.killed}`);
      await load();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Не удалось завершить");
    } finally {
      setBusy(null);
    }
  };

  return (
    <ModalShell onClose={onClose}>
      <div className="flex items-center gap-3 border-b border-white/8 px-6 py-4">
        <div className="btn-gradient grid h-10 w-10 place-items-center rounded-2xl">
          <Monitor className="h-5 w-5 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-display text-[15px] font-bold">Устройства</p>
          <p className="text-xs text-white/40">Кто сейчас в вашем аккаунте</p>
        </div>
        <button onClick={onClose} className="rounded-full bg-white/10 p-2 text-white/70 hover:bg-white/15" title="Закрыть">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="nice-scroll max-h-[60vh] space-y-1.5 overflow-y-auto px-6 py-4">
        {rows === null ? (
          <div className="grid place-items-center py-10 text-white/40">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <>
            {rows.map((r) => {
              const d = deviceLabel(r.userAgent);
              const Icon = d.kind === "mobile" ? Smartphone : d.kind === "web" ? Globe : Monitor;
              return (
                <div
                  key={r.token}
                  className={`pm-rise flex items-center gap-3 rounded-2xl border px-3.5 py-2.5 ${
                    r.current ? "border-emerald-400/30 bg-emerald-500/[0.06]" : "border-white/8 bg-white/[0.03]"
                  }`}
                >
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${r.current ? "bg-emerald-500/15 text-emerald-300" : "bg-white/8 text-white/50"}`}>
                    <Icon className="h-4.5 w-4.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate text-[13px] font-semibold">
                      {d.name}
                      {r.current && <span className="rounded-full bg-emerald-500/20 px-1.5 py-px text-[9px] font-bold tracking-wide text-emerald-300 uppercase">это устройство</span>}
                    </p>
                    <p className="truncate text-[11px] text-white/40">
                      {r.ip || "IP скрыт"} · вход {new Date(r.createdAt).toLocaleDateString("ru-RU")}
                    </p>
                  </div>
                  {!r.current && (
                    <button
                      onClick={() => void kill(r.token)}
                      disabled={busy !== null}
                      title="Завершить сессию"
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-white/8 text-white/60 transition-colors hover:bg-rose-500/20 hover:text-rose-300 disabled:opacity-40"
                    >
                      {busy === r.token ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
                    </button>
                  )}
                </div>
              );
            })}
            {rows.some((r) => !r.current) && (
              <button
                onClick={() => void killOthers()}
                disabled={busy !== null}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-rose-500/15 py-2.5 text-[13px] font-semibold text-rose-300 transition-colors hover:bg-rose-500/25 disabled:opacity-40"
              >
                {busy === "all" ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
                Завершить все остальные сессии
              </button>
            )}
          </>
        )}
      </div>
    </ModalShell>
  );
}
