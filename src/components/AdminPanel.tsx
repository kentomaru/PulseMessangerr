"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Ban,
  Ghost,
  Loader2,
  RotateCcw,
  Search,
  Shield,
  ShieldCheck,
  Star,
  Trash2,
  Unlock,
  UserX,
} from "lucide-react";
import { ModalShell } from "./ProfileModal";
import Avatar from "./Avatar";
import { api } from "@/lib/api";

type AdminUser = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  premium: boolean;
  isAdmin: boolean;
  bannedAt: string | null;
  banReason: string | null;
  deletedAt: string | null;
  createdAt: string;
  lastSeenAt: string | null;
};

/** Шаблоны оснований бана — подставляются в причину одним нажатием. */
const REASON_TEMPLATES = [
  "Спам",
  "Оскорбления участников",
  "Реклама без разрешения",
  "Флуд",
  "Мошенничество",
  "Нарушение правил сервиса",
];

/**
 * Админка: поиск пользователей и действия — заблокировать (с удалением
 * сообщений или без), удалить аккаунт («призрак»), разблокировать,
 * восстановить. У каждого действия — своя причина (шаблон или текст).
 */
export default function AdminPanel({ onClose, notify }: { onClose: () => void; notify: (m: string) => void }) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<AdminUser[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmFor, setConfirmFor] = useState<{
    user: AdminUser;
    mode: "ban" | "wipe" | "delete" | "restore";
  } | null>(null);
  const [reason, setReason] = useState("");

  const load = useCallback(async (query: string) => {
    try {
      const d = await api<{ users: AdminUser[] }>(`/api/admin/users?q=${encodeURIComponent(query)}`);
      setRows(d.users);
    } catch (e) {
      notify(e instanceof Error ? e.message : "Не удалось загрузить список");
    }
  }, [notify]);

  useEffect(() => {
    const t = setTimeout(() => void load(q.trim()), q ? 300 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const openConfirm = (user: AdminUser, mode: "ban" | "wipe" | "delete" | "restore") => {
    setReason("");
    setConfirmFor({ user, mode });
  };

  const act = async (user: AdminUser, mode: "ban" | "wipe" | "delete" | "restore" | "unban", why?: string) => {
    setBusyId(user.id);
    try {
      await api("/api/admin/ban", {
        method: "POST",
        body: JSON.stringify({ userId: user.id, mode, reason: why ?? "" }),
      });
      notify(
        mode === "ban"
          ? `@${user.username} заблокирован навсегда`
          : mode === "wipe"
            ? `@${user.username} заблокирован, сообщения удалены`
            : mode === "delete"
              ? `@${user.username} теперь «Удалённый аккаунт»`
              : mode === "restore"
                ? `Аккаунт @${user.username} восстановлен`
                : `@${user.username} разблокирован`,
      );
      setConfirmFor(null);
      await load(q.trim());
    } catch (e) {
      notify(e instanceof Error ? e.message : "Не удалось выполнить действие");
    } finally {
      setBusyId(null);
    }
  };

  const modeTitle =
    confirmFor?.mode === "ban"
      ? "Заблокировать навсегда?"
      : confirmFor?.mode === "wipe"
        ? "Заблокировать и стереть сообщения?"
        : confirmFor?.mode === "delete"
          ? "Удалить аккаунт?"
          : "Восстановить аккаунт?";

  return (
    <ModalShell onClose={onClose} wide>
      <div className="flex items-center gap-3 border-b border-white/8 px-6 py-4">
        <div className="btn-gradient grid h-10 w-10 place-items-center rounded-2xl">
          <ShieldCheck className="h-5 w-5 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-display text-[15px] font-bold">Админка</p>
          <p className="text-xs text-white/40">Блокировки, удаление и восстановление аккаунтов</p>
        </div>
        <button onClick={onClose} className="rounded-full bg-white/10 p-2 text-white/70 hover:bg-white/15" title="Закрыть">
          ✕
        </button>
      </div>

      <div className="px-6 pt-4">
        <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5">
          <Search className="h-4 w-4 text-white/35" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Поиск по @юзернейму или имени…"
            className="w-full bg-transparent text-sm outline-none placeholder:text-white/30"
          />
        </div>
      </div>

      <div className="nice-scroll max-h-[60vh] space-y-1.5 overflow-y-auto px-6 py-4">
        {rows === null ? (
          <div className="grid place-items-center py-10 text-white/40">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <p className="py-10 text-center text-sm text-white/40">Никого не нашли</p>
        ) : (
          rows.map((u) => (
            <div
              key={u.id}
              className={`pm-rise rounded-2xl border px-3.5 py-2.5 ${
                u.deletedAt
                  ? "border-zinc-400/25 bg-zinc-500/[0.07]"
                  : u.bannedAt
                    ? "border-rose-400/30 bg-rose-500/[0.06]"
                    : "border-white/8 bg-white/[0.03]"
              }`}
            >
              <div className="flex items-center gap-3">
                <Avatar
                  name={u.deletedAt ? "Удалённый аккаунт" : u.displayName}
                  src={u.deletedAt ? null : u.avatarUrl}
                  size={40}
                />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate text-[14px] font-semibold">
                    {u.deletedAt ? "Удалённый аккаунт" : u.displayName}
                    {u.deletedAt && <Ghost className="h-3.5 w-3.5 text-zinc-300" />}
                    {u.isAdmin && !u.deletedAt && <Shield className="h-3.5 w-3.5 text-indigo-300" />}
                    {u.premium && !u.deletedAt && <Star className="h-3 w-3 text-amber-300" />}
                  </p>
                  <p className="truncate text-[12px] text-white/40">
                    @{u.username} · с {new Date(u.createdAt).toLocaleDateString("ru-RU")}
                  </p>
                  {u.deletedAt ? (
                    <p className="flex items-center gap-1 pt-0.5 text-[11px] text-zinc-300/80">
                      <Ghost className="h-3 w-3" />
                      Удалён {new Date(u.deletedAt).toLocaleDateString("ru-RU")} · {u.banReason || "без причины"}
                    </p>
                  ) : u.bannedAt ? (
                    <p className="flex items-center gap-1 pt-0.5 text-[11px] text-rose-300">
                      <Ban className="h-3 w-3" />
                      Заблокирован {new Date(u.bannedAt).toLocaleDateString("ru-RU")} · {u.banReason || "без причины"}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {busyId === u.id ? (
                    <Loader2 className="h-4 w-4 animate-spin text-white/40" />
                  ) : u.isAdmin ? (
                    <span className="text-[11px] text-white/30">админ</span>
                  ) : u.deletedAt ? (
                    <button
                      onClick={() => openConfirm(u, "restore")}
                      className="flex items-center gap-1.5 rounded-xl bg-emerald-500/15 px-3 py-1.5 text-[12px] font-medium text-emerald-300 hover:bg-emerald-500/25"
                      title="Откатить удаление и разблокировать"
                    >
                      <RotateCcw className="h-3.5 w-3.5" /> Восстановить
                    </button>
                  ) : u.bannedAt ? (
                    <button
                      onClick={() => void act(u, "unban")}
                      className="flex items-center gap-1.5 rounded-xl bg-emerald-500/15 px-3 py-1.5 text-[12px] font-medium text-emerald-300 hover:bg-emerald-500/25"
                    >
                      <Unlock className="h-3.5 w-3.5" /> Разблокировать
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => openConfirm(u, "ban")}
                        title="Заблокировать навсегда (данные остаются)"
                        className="grid h-8 w-8 place-items-center rounded-xl bg-white/8 text-white/70 hover:bg-amber-500/20 hover:text-amber-300"
                      >
                        <Ban className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => openConfirm(u, "wipe")}
                        title="Заблокировать и удалить все сообщения"
                        className="grid h-8 w-8 place-items-center rounded-xl bg-white/8 text-white/70 hover:bg-orange-500/20 hover:text-orange-300"
                      >
                        <UserX className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => openConfirm(u, "delete")}
                        title="Удалить аккаунт (станет «Удалённым аккаунтом» с призраком)"
                        className="grid h-8 w-8 place-items-center rounded-xl bg-white/8 text-white/70 hover:bg-rose-500/20 hover:text-rose-300"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Подтверждение: способ + основание (шаблоны или свой текст) */}
      {confirmFor && (
        <div className="fixed inset-0 z-[96] grid place-items-center bg-black/70 p-4 backdrop-blur-sm" onClick={() => setConfirmFor(null)}>
          <div className="glass-strong w-full max-w-sm rounded-[1.6rem] p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <p className="font-display text-lg font-bold">{modeTitle}</p>
            <p className="pt-2 text-[13px] leading-relaxed text-white/55">
              {confirmFor.mode === "ban" && (
                <>@{confirmFor.user.username} больше не сможет войти. Переписки и профиль останутся.</>
              )}
              {confirmFor.mode === "wipe" && (
                <>@{confirmFor.user.username} будет заблокирован, а все его сообщения — удалены безвозвратно.</>
              )}
              {confirmFor.mode === "delete" && (
                <>
                  Аккаунт @{confirmFor.user.username} станет «Удалённым аккаунтом» с аватаром-призраком,
                  сообщения сотрутся. Действие можно откатить восстановлением.
                </>
              )}
              {confirmFor.mode === "restore" && (
                <>Аккаунт @{confirmFor.user.username} вернётся в обычный вид и снова сможет войти.</>
              )}
            </p>

            {confirmFor.mode !== "restore" && (
              <div className="pt-3">
                <p className="pb-1.5 text-[11px] font-semibold tracking-wide text-white/40 uppercase">
                  Основание (увидит пользователь)
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {REASON_TEMPLATES.map((t) => (
                    <button
                      key={t}
                      onClick={() => setReason(t)}
                      className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                        reason === t
                          ? "border-rose-300 bg-rose-500/20 text-rose-200"
                          : "border-white/15 text-white/50 hover:border-white/35 hover:text-white/70"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  maxLength={200}
                  rows={2}
                  placeholder="Своя причина (заполняет шаблоны)…"
                  className="ring-focus mt-2 w-full resize-none rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-[13px]"
                />
              </div>
            )}

            <div className="flex gap-2 pt-3">
              <button
                onClick={() => setConfirmFor(null)}
                className="flex-1 rounded-2xl bg-white/10 py-2.5 text-sm font-medium text-white/70 hover:bg-white/15"
              >
                Отмена
              </button>
              <button
                onClick={() => void act(confirmFor.user, confirmFor.mode, reason)}
                disabled={busyId !== null}
                className={`flex-1 rounded-2xl py-2.5 text-sm font-semibold text-white disabled:opacity-40 ${
                  confirmFor.mode === "restore" ? "bg-emerald-500/80 hover:bg-emerald-500" : "bg-rose-500/80 hover:bg-rose-500"
                }`}
              >
                {confirmFor.mode === "delete"
                  ? "Удалить"
                  : confirmFor.mode === "wipe"
                    ? "Бан + стереть"
                    : confirmFor.mode === "restore"
                      ? "Восстановить"
                      : "Заблокировать"}
              </button>
            </div>
          </div>
        </div>
      )}
    </ModalShell>
  );
}
