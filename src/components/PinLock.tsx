"use client";

import { useEffect, useState } from "react";
import { Delete, Lock, ShieldCheck, X } from "lucide-react";

/**
 * PIN-код приложения как в ТГ (код-пароль): 4 цифры, хранятся локально.
 * Пока приложение не разблокировано — вместо чатов показывается замок.
 */
const KEY = "pulse_pin_v1";

export function hasPin(): boolean {
  try {
    return !!localStorage.getItem(KEY);
  } catch {
    return false;
  }
}

export function verifyPin(pin: string): boolean {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return pin === "";
    return btoa(pin) === raw;
  } catch {
    return false;
  }
}

export function storePin(pin: string | null) {
  try {
    if (pin === null) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, btoa(pin));
  } catch {
    /* приватный режим */
  }
}

/** Разблокировка действует до закрытия вкладки. */
export function markUnlocked() {
  try {
    sessionStorage.setItem("pulse_unlocked", "1");
  } catch {
    /* ignore */
  }
}

/** Цифровая клавиатура. */
function Keypad({ onDigit, onBack }: { onDigit: (d: string) => void; onBack: () => void }) {
  return (
    <div className="mx-auto grid max-w-[240px] grid-cols-3 gap-2.5">
      {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
        <button
          key={d}
          onClick={() => onDigit(d)}
          className="glass grid h-14 place-items-center rounded-2xl text-lg font-semibold text-white/85 transition-all hover:bg-white/12 active:scale-95"
        >
          {d}
        </button>
      ))}
      <span />
      <button
        onClick={() => onDigit("0")}
        className="glass grid h-14 place-items-center rounded-2xl text-lg font-semibold text-white/85 transition-all hover:bg-white/12 active:scale-95"
      >
        0
      </button>
      <button
        onClick={onBack}
        title="Стереть"
        className="glass grid h-14 place-items-center rounded-2xl text-white/60 transition-all hover:bg-white/12 active:scale-95"
      >
        <Delete className="h-5 w-5" />
      </button>
    </div>
  );
}

/** Точки-индикаторы введённых цифр. */
function Dots({ len, shake }: { len: number; shake: boolean }) {
  return (
    <div className={`flex justify-center gap-3 ${shake ? "animate-pulse-dot" : ""}`}>
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className={`h-3.5 w-3.5 rounded-full border transition-all ${
            i < len ? "scale-110 border-indigo-300 bg-indigo-400" : "border-white/25"
          }`}
        />
      ))}
    </div>
  );
}

/** Полноэкранный замок: показывается вместо мессенджера, пока не введён PIN. */
export function PinGate({ onUnlock }: { onUnlock: () => void }) {
  const [val, setVal] = useState("");
  const [shake, setShake] = useState(false);
  const [err, setErr] = useState(false);

  useEffect(() => {
    if (val.length === 4) {
      if (verifyPin(val)) {
        markUnlocked();
        onUnlock();
      } else {
        setErr(true);
        setShake(true);
        setTimeout(() => {
          setVal("");
          setShake(false);
        }, 450);
      }
    }
  }, [val, onUnlock]);

  return (
    <main className="relative grid h-dvh place-items-center overflow-hidden p-4">
      <div className="pointer-events-none absolute inset-0">
        <div className="animate-float absolute top-[12%] left-[8%] h-72 w-72 rounded-full bg-white/10 blur-[110px]" />
        <div className="animate-float absolute right-[6%] bottom-[10%] h-80 w-80 rounded-full bg-white/8 blur-[120px] [animation-delay:-6s]" />
      </div>
      <div className="glass-strong relative w-full max-w-sm rounded-[2rem] p-8 text-center shadow-[0_40px_120px_-30px_rgba(0,0,0,0.9)]">
        <div className="btn-gradient mx-auto grid h-14 w-14 place-items-center rounded-2xl">
          <Lock className="h-6 w-6 text-white" />
        </div>
        <h1 className="font-display mt-4 text-lg font-bold">Pulse заблокирован</h1>
        <p className="pb-5 pt-1 text-[13px] text-white/45">Введите PIN-код, чтобы продолжить</p>
        <div className="pb-5">
          <Dots len={val.length} shake={shake} />
          {err && <p className="pt-2 text-[12px] text-rose-300">Неверный PIN-код</p>}
        </div>
        <Keypad
          onDigit={(d) => val.length < 4 && setVal((v) => v + d)}
          onBack={() => setVal((v) => v.slice(0, -1))}
        />
      </div>
    </main>
  );
}

/** Настройка PIN: установка, смена или отключение (вкладка «Приватность»). */
export function PinSetupModal({ onClose, notify }: { onClose: () => void; notify: (m: string) => void }) {
  const [stage, setStage] = useState<"enter" | "confirm">(hasPin() ? "enter" : "enter");
  const [first, setFirst] = useState("");
  const [val, setVal] = useState("");
  const [err, setErr] = useState("");
  const enabled = hasPin();

  const reset = (msg: string) => {
    setErr(msg);
    setVal("");
  };

  useEffect(() => {
    if (val.length !== 4) return;
    if (!enabled) {
      // Установка нового: первый ввод → подтверждение
      if (stage === "enter") {
        setFirst(val);
        setVal("");
        setStage("confirm");
        return;
      }
      if (val === first) {
        storePin(val);
        markUnlocked();
        notify("PIN-код установлен");
        onClose();
      } else {
        setStage("enter");
        setFirst("");
        reset("PIN-коды не совпадают — введите заново");
      }
      return;
    }
    // PIN уже есть: сначала проверяем текущий, потом принимаем новый (0000-отмена?)
    if (stage === "enter") {
      if (verifyPin(val)) {
        setFirst(val);
        setVal("");
        setStage("confirm");
        setErr("");
      } else {
        reset("Неверный PIN-код");
      }
    } else {
      // второй ввод при включённом = новый PIN (введите ещё раз для смены/отключения)
      storePin(val);
      notify("PIN-код изменён");
      onClose();
    }
  }, [val]); // eslint-disable-line react-hooks/exhaustive-deps

  const disable = () => {
    if (!enabled) return;
    if (!verifyPin(val.length === 4 ? val : "")) {
      setErr("Сначала введите текущий PIN");
      return;
    }
    storePin(null);
    notify("PIN-код отключён");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[106] grid place-items-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="glass-strong w-full max-w-sm rounded-[1.6rem] p-6 text-center shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center justify-between">
          <p className="font-display flex items-center gap-2 text-lg font-bold">
            <ShieldCheck className="h-5 w-5 text-indigo-300" /> PIN-код
          </p>
          <button onClick={onClose} className="rounded-full bg-white/10 p-1.5 text-white/70">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="pb-4 text-[13px] text-white/45">
          {!enabled
            ? stage === "enter"
              ? "Придумайте 4 цифры — они будут защищать вход в приложение"
              : "Повторите PIN-код ещё раз"
            : stage === "enter"
              ? "Введите текущий PIN-код"
              : "Теперь введите новый PIN-код"}
        </p>
        <div className="pb-4">
          <Dots len={val.length} shake={!!err} />
          {err && <p className="pt-2 text-[12px] text-rose-300">{err}</p>}
        </div>
        <Keypad
          onDigit={(d) => {
            setErr("");
            if (val.length < 4) setVal((v) => v + d);
          }}
          onBack={() => setVal((v) => v.slice(0, -1))}
        />
        {enabled && (
          <button
            onClick={disable}
            className="mt-4 w-full rounded-2xl bg-white/8 py-2.5 text-[13px] font-medium text-white/60 transition-colors hover:bg-rose-500/15 hover:text-rose-300"
          >
            Отключить PIN (после ввода текущего)
          </button>
        )}
      </div>
    </div>
  );
}
