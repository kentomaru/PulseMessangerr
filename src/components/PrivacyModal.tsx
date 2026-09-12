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

/** Отдельная вкладка «Приватность»: все настройки видимости в одном месте. */
export default function PrivacyModal({ me, onClose, onSaved }: Props) {
  const [showOnline, setShowOnline] = useState(me.showOnline);
  const [allowCalls, setAllowCalls] = useState(me.allowCalls);
  const [allowMessages, setAllowMessages] = useState(me.allowMessages);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const dirty =
    showOnline !== me.showOnline ||
    allowCalls !== me.allowCalls ||
    allowMessages !== me.allowMessages;

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const d = await api<{ user: PublicUser }>("/api/auth/me", {
        method: "PATCH",
        body: JSON.stringify({ showOnline, allowCalls, allowMessages }),
      });
      onSaved(d.user);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить");
      setSaving(false);
    }
  };

  return (
    <ModalShell onClose={onClose}>
      <div className="flex items-center gap-3 border-b border-white/8 px-6 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-500/15">
          <Shield className="h-4.5 w-4.5 text-violet-300" />
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

      <div className="space-y-4 px-6 py-5">
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

        {error && (
          <p className="rounded-xl border border-rose-500/25 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-300">
            {error}
          </p>
        )}
      </div>

      <div className="border-t border-white/8 px-6 py-4">
        <button
          onClick={() => void save()}
          disabled={!dirty || saving}
          className="btn-gradient flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-[15px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Сохранить
        </button>
      </div>
    </ModalShell>
  );
}
