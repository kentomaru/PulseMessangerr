"use client";

import { useState } from "react";
import {
  CircleDot,
  Eye,
  EyeOff,
  Loader2,
  MessageSquareLock,
  PhoneOff,
  Shield,
  ShieldCheck,
  UsersRound,
  X,
} from "lucide-react";
import { ModalShell, Toggle } from "./ProfileModal";
import { api } from "@/lib/api";
import type { PublicUser } from "@/lib/types";

type Props = {
  me: PublicUser;
  onClose: () => void;
  onSaved: (u: PublicUser) => void;
};

/**
 * Панель настроек приватности — используется и как отдельная модалка,
 * и как вкладка внутри профиля (пункт ТЗ: «приватность — отдельная
 * вкладка при редактировании профиля»).
 */
export function PrivacySettings({
  me,
  onSaved,
  onDone,
}: {
  me: PublicUser;
  onSaved: (u: PublicUser) => void;
  /** Вызывается после успешного сохранения (например, закрыть модалку). */
  onDone?: () => void;
}) {
  const [showOnline, setShowOnline] = useState(me.showOnline);
  const [allowCalls, setAllowCalls] = useState(me.allowCalls);
  const [allowMessages, setAllowMessages] = useState(me.allowMessages);
  const [allowGroupInvites, setAllowGroupInvites] = useState(me.allowGroupInvites);
  const [discoverable, setDiscoverable] = useState(me.discoverable ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const dirty =
    showOnline !== me.showOnline ||
    allowCalls !== me.allowCalls ||
    allowMessages !== me.allowMessages ||
    allowGroupInvites !== me.allowGroupInvites ||
    discoverable !== (me.discoverable ?? true);

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const d = await api<{ user: PublicUser }>("/api/auth/me", {
        method: "PATCH",
        body: JSON.stringify({ showOnline, allowCalls, allowMessages, allowGroupInvites, discoverable }),
      });
      onSaved(d.user);
      onDone?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить");
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="space-y-4">
        <Toggle
          checked={showOnline}
          onChange={setShowOnline}
          icon={
            showOnline ? (
              <Eye className="h-4 w-4 text-emerald-300" />
            ) : (
              <EyeOff className="h-4 w-4 text-white/50" />
            )
          }
          label="Статус «в сети»"
          hint="Если выключить — никто не увидит, когда вы онлайн и время последнего визита"
        />
        <Toggle
          checked={allowCalls}
          onChange={setAllowCalls}
          icon={<PhoneOff className="h-4 w-4 text-white/50" />}
          label="Разрешать звонки"
          hint="Если выключить — вам никто не сможет позвонить"
        />
        <Toggle
          checked={allowMessages}
          onChange={setAllowMessages}
          icon={<MessageSquareLock className="h-4 w-4 text-white/50" />}
          label="Новые личные чаты"
          hint="Если выключить — незнакомцы не смогут начать с вами переписку"
        />
        <Toggle
          checked={allowGroupInvites}
          onChange={setAllowGroupInvites}
          icon={<UsersRound className="h-4 w-4 text-white/50" />}
          label="Добавление в группы"
          hint="Если выключить — никто не сможет добавить вас в группу или канал"
        />
        <Toggle
          checked={discoverable}
          onChange={setDiscoverable}
          icon={<CircleDot className="h-4 w-4 text-white/50" />}
          label="Кто может меня найти"
          hint="Если выключить — вас не видно в поиске, но по ссылке-инвайту найти можно"
        />

        {error && (
          <p className="rounded-xl border border-rose-500/25 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-300">
            {error}
          </p>
        )}
      </div>

      {/* Второй пароль (2ФА) — как в ТГ: при входе запрашивается дополнительно */}
      <SecondPassBlock />

      <button
        onClick={() => void save()}
        disabled={!dirty || saving}
        className="btn-gradient mt-5 flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-[15px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
        Сохранить приватность
      </button>
    </div>
  );
}

/** Настройка второго пароля (2ФА): установка, смена, отключение. */
function SecondPassBlock() {
  const [on, setOn] = useState(() => {
    try {
      return localStorage.getItem("pulse_2fa") === "1";
    } catch {
      return false;
    }
  });
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const apply = async (value: string, okMsg: string) => {
    setBusy(true);
    setMsg("");
    try {
      await api("/api/auth/me", { method: "PATCH", body: JSON.stringify({ setSecondPass: value }) });
      setOn(value !== "");
      try {
        localStorage.setItem("pulse_2fa", value !== "" ? "1" : "0");
      } catch {
        /* ignore */
      }
      setPass("");
      setMsg(okMsg);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Не удалось");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3.5">
      <p className="flex items-center gap-2 text-[13px] font-semibold">
        <ShieldCheck className="h-4 w-4 text-indigo-300" />
        Второй пароль (2ФА)
        <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${on ? "bg-emerald-500/20 text-emerald-300" : "bg-white/10 text-white/40"}`}>
          {on ? "включён" : "выключен"}
        </span>
      </p>
      <p className="pt-1 text-[11px] leading-snug text-white/35">
        При входе, кроме основного пароля, нужно будет ввести второй. Защита от угона аккаунта.
      </p>
      <div className="flex gap-2 pt-2.5">
        <input
          value={pass}
          onChange={(e) => setPass(e.target.value)}
          type="password"
          placeholder={on ? "Новый второй пароль" : "Придумайте второй пароль"}
          className="ring-focus min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-[13px]"
        />
        <button
          onClick={() => pass.length >= 6 && void apply(pass, on ? "Второй пароль изменён" : "Второй пароль установлен")}
          disabled={busy || pass.length < 6}
          className="rounded-xl bg-indigo-500/80 px-3.5 py-2 text-[12px] font-semibold text-white hover:bg-indigo-500 disabled:opacity-40"
        >
          {on ? "Сменить" : "Включить"}
        </button>
        {on && (
          <button
            onClick={() => {
              if (confirm("Отключить второй пароль?")) void apply("", "Второй пароль отключён");
            }}
            disabled={busy}
            className="rounded-xl bg-white/8 px-3 py-2 text-[12px] font-medium text-white/60 hover:bg-rose-500/15 hover:text-rose-300 disabled:opacity-40"
          >
            Отключить
          </button>
        )}
      </div>
      {msg && <p className="pt-2 text-[11px] text-white/50">{msg}</p>}
    </div>
  );
}

/** Отдельная модалка «Приватность» (используется как обёртка над панелью). */
export default function PrivacyModal({ me, onClose, onSaved }: Props) {
  return (
    <ModalShell onClose={onClose}>
      <div className="flex items-center gap-3 border-b border-white/8 px-6 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/8">
          <Shield className="h-4.5 w-4.5 text-slate-400" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-base font-bold">Приватность</h3>
          <p className="truncate text-xs text-white/35">Кто и что видит в вашем профиле</p>
        </div>
        <button
          onClick={onClose}
          className="rounded-full bg-white/10 p-2 text-white/80 transition-colors hover:bg-white/20"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="px-6 py-5">
        <PrivacySettings me={me} onSaved={onSaved} onDone={onClose} />
      </div>
    </ModalShell>
  );
}
