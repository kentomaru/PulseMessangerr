"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertCircle,
  AtSign,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  MessagesSquare,
  PhoneCall,
  Sparkles,
  User,
} from "lucide-react";
import { api } from "@/lib/api";

type Mode = "login" | "register";

export default function AuthScreen() {
  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  /** Подсказка надёжности пароля при регистрации. */
  const strength = (() => {
    let s = 0;
    if (password.length >= 6) s++;
    if (password.length >= 10) s++;
    if (/[A-ZА-Я]/.test(password) && /[a-zа-я]/.test(password)) s++;
    if (/\d/.test(password)) s++;
    if (/[^\w\sа-яА-Яa-zA-Z0-9]/.test(password)) s++;
    return Math.min(s, 4);
  })();
  const strengthLabel = ["", "Слабый", "Средний", "Хороший", "Надёжный"][strength];
  const strengthColor = ["", "bg-rose-400", "bg-amber-400", "bg-emerald-400", "bg-emerald-300"][strength];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (mode === "register") {
      if (password !== password2) {
        setError("Пароли не совпадают");
        return;
      }
      if (password.length < 6) {
        setError("Пароль — не менее 6 символов");
        return;
      }
    }
    setLoading(true);
    try {
      await api(`/api/auth/${mode}`, {
        method: "POST",
        body: JSON.stringify({ username, password, displayName }),
      });
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Что-то пошло не так");
      setLoading(false);
    }
  }

  return (
    <main className="relative flex h-dvh items-center justify-center overflow-hidden p-4">
      {/* floating orbs */}
      <div className="pointer-events-none absolute inset-0">
        <div className="animate-float absolute top-[12%] left-[8%] h-72 w-72 rounded-full bg-white/10 blur-[110px]" />
        <div className="animate-float absolute right-[6%] bottom-[10%] h-80 w-80 rounded-full bg-white/8 blur-[120px] [animation-delay:-6s]" />
        <div className="animate-float absolute top-[55%] left-[45%] h-64 w-64 rounded-full bg-white/8 blur-[100px] [animation-delay:-11s]" />
      </div>

      <div className="relative z-10 grid w-full max-w-5xl overflow-hidden rounded-[2rem] border border-white/10 shadow-[0_40px_120px_-30px_rgba(0,0,0,0.9)] md:grid-cols-[1.15fr_1fr]">
        {/* Hero panel */}
        <div className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-[#262930] via-[#1e2127] to-[#16181c] p-10 md:flex">
          <div className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-white/10 blur-[90px]" />
          <div className="absolute -bottom-20 -left-16 h-64 w-64 rounded-full bg-white/10 blur-[80px]" />

          <div className="relative flex items-center gap-3">
            <div className="btn-gradient flex h-11 w-11 items-center justify-center rounded-2xl">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <span className="font-display text-xl font-bold tracking-[0.22em] text-white">PULSE</span>
          </div>

          <div className="relative">
            <h1 className="font-display text-[2.6rem] leading-[1.05] font-bold text-white">
              Общайтесь.
              <br />
              <span className="text-gradient">Звоните.</span>
              <br />
              Без границ.
            </h1>
            <p className="mt-5 max-w-sm text-[15px] leading-relaxed text-white/55">
              Личные чаты, голосовые звонки и профиль, который выглядит именно так, как вы хотите.
            </p>
          </div>

          <div className="relative flex flex-col gap-3 text-sm text-white/60">
            <div className="flex items-center gap-3">
              <div className="glass flex h-9 w-9 items-center justify-center rounded-xl">
                <MessagesSquare className="h-4 w-4 text-slate-400" />
              </div>
              Мгновенные сообщения и фото
            </div>
            <div className="flex items-center gap-3">
              <div className="glass flex h-9 w-9 items-center justify-center rounded-xl">
                <PhoneCall className="h-4 w-4 text-slate-400" />
              </div>
              Голосовые и видеозвонки в браузере
            </div>
          </div>
        </div>

        {/* Form panel */}
        <div className="glass-strong relative p-7 sm:p-10">
          <div className="mb-8 flex items-center gap-3 md:hidden">
            <div className="btn-gradient flex h-10 w-10 items-center justify-center rounded-xl">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <span className="font-display text-lg font-bold tracking-[0.22em]">PULSE</span>
          </div>

          <div className="mb-7 flex rounded-2xl bg-white/5 p-1">
            {(["login", "register"] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => {
                  setMode(m);
                  setError("");
                }}
                className={`relative flex-1 rounded-xl py-2.5 text-sm font-medium transition-colors ${
                  mode === m ? "text-white" : "text-white/45 hover:text-white/70"
                }`}
              >
                {mode === m && (
                  <motion.span
                    layoutId="auth-tab"
                    className="absolute inset-0 rounded-xl bg-gradient-to-r from-[#5865f2]/80 to-[#7289da]/80"
                    transition={{ type: "spring", bounce: 0.25, duration: 0.5 }}
                  />
                )}
                <span className="relative">{m === "login" ? "Вход" : "Регистрация"}</span>
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            <motion.form
              key={mode}
              initial={{ opacity: 0, x: mode === "login" ? -14 : 14 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: mode === "login" ? 14 : -14 }}
              transition={{ duration: 0.22 }}
              onSubmit={submit}
              className="flex flex-col gap-4"
            >
              <h2 className="font-display text-2xl font-bold">
                {mode === "login" ? "С возвращением" : "Создать аккаунт"}
              </h2>

              {mode === "register" && (
                <label className="ring-focus flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3.5 transition-all">
                  <User className="h-4.5 w-4.5 shrink-0 text-white/35" />
                  <input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Отображаемое имя"
                    maxLength={40}
                    className="w-full bg-transparent text-[15px] placeholder:text-white/30"
                  />
                </label>
              )}

              <label className="ring-focus flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3.5 transition-all">
                <AtSign className="h-4.5 w-4.5 shrink-0 text-white/35" />
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Имя пользователя"
                  autoComplete="username"
                  required
                  className="w-full bg-transparent text-[15px] placeholder:text-white/30"
                />
              </label>

              <label className="ring-focus flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3.5 transition-all">
                <Lock className="h-4.5 w-4.5 shrink-0 text-white/35" />
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Пароль"
                  type={showPassword ? "text" : "password"}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  required
                  className="w-full bg-transparent text-[15px] placeholder:text-white/30"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  tabIndex={-1}
                  className="shrink-0 text-white/35 transition-colors hover:text-white/70"
                  title={showPassword ? "Скрыть пароль" : "Показать пароль"}
                >
                  {showPassword ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
                </button>
              </label>

              {/* Индикатор надёжности — только при регистрации */}
              {mode === "register" && password.length > 0 && (
                <div className="-mt-1 flex items-center gap-2 px-1">
                  <div className="flex h-1 flex-1 gap-1">
                    {[0, 1, 2, 3].map((i) => (
                      <span
                        key={i}
                        className={`h-full flex-1 rounded-full transition-colors ${
                          i < strength ? strengthColor : "bg-white/10"
                        }`}
                      />
                    ))}
                  </div>
                  {strengthLabel && (
                    <span className="text-[11px] text-white/35">{strengthLabel}</span>
                  )}
                </div>
              )}

              {mode === "register" && (
                <label className="ring-focus flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3.5 transition-all">
                  <Lock className="h-4.5 w-4.5 shrink-0 text-white/35" />
                  <input
                    value={password2}
                    onChange={(e) => setPassword2(e.target.value)}
                    placeholder="Повторите пароль"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    required
                    className="w-full bg-transparent text-[15px] placeholder:text-white/30"
                  />
                  {password2.length > 0 && (
                    <span className="shrink-0">
                      {password === password2 ? (
                        <CheckCircle2 className="h-4.5 w-4.5 text-emerald-400" />
                      ) : (
                        <AlertCircle className="h-4.5 w-4.5 text-rose-400" />
                      )}
                    </span>
                  )}
                </label>
              )}

              <AnimatePresence>
                {error && (
                  <motion.p
                    key="error"
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="rounded-xl border border-rose-500/25 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-300"
                  >
                    {error}
                  </motion.p>
                )}
              </AnimatePresence>

              <button
                type="submit"
                disabled={loading}
                className="btn-gradient mt-1 flex items-center justify-center gap-2 rounded-2xl py-3.5 text-[15px] font-semibold text-white"
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                {mode === "login" ? "Войти" : "Зарегистрироваться"}
              </button>

              <p className="text-center text-xs text-white/30">
                {mode === "login"
                  ? "Нет аккаунта? Переключитесь на регистрацию"
                  : "Имя пользователя — латиница, цифры и _, 3–24 символа. Пароль — не менее 6 символов"}
              </p>
            </motion.form>
          </AnimatePresence>

          <p className="mt-6 text-center text-[11px] text-white/25">
            Продолжая, вы соглашаетесь с{" "}
            <a href="/privacy" target="_blank" rel="noreferrer" className="text-slate-400/70 transition-colors hover:text-slate-300">
              политикой конфиденциальности
            </a>
          </p>
        </div>
      </div>
    </main>
  );
}
