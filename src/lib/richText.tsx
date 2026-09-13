"use client";

/**
 * Discord-подобная разметка сообщений (без внешних библиотек):
 *
 *   **жирный**   *курсив*   __подчёркнутый__   ~~зачёркнутый~~
 *   `код`        ```блок кода```      ||спойлер|| (клик — открыть)
 *   @упоминание (подсвечивается, если это вы)
 *   https://ссылка — кликабельна
 *
 * Безопасность: всё собирается в React-элементы, никакого HTML/innerHTML;
 * ссылки — только http/https и с rel="noopener noreferrer".
 */
import { useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";

/* ─────────────────────────── спойлер ─────────────────────────── */

function Spoiler({ children }: { children: ReactNode }) {
  const [shown, setShown] = useState(false);
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        setShown((v) => !v);
      }}
      title={shown ? "Скрыть спойлер" : "Спойлер — нажмите, чтобы показать"}
      className={`rounded-md px-1 text-inherit transition-colors ${
        shown ? "bg-white/10" : "select-none bg-white/25 text-transparent"
      }`}
    >
      {children}
    </button>
  );
}

/* ─────────────────────────── блок кода ─────────────────────────── */

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative my-1">
      <pre className="nice-scroll overflow-x-auto rounded-xl border border-white/10 bg-black/50 p-3 pr-10 font-mono text-[13px] leading-relaxed text-emerald-100/90">
        <code>{code}</code>
      </pre>
      <button
        onClick={async (e) => {
          e.stopPropagation();
          try {
            await navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            /* буфер недоступен */
          }
        }}
        title="Скопировать код"
        className="absolute top-2 right-2 rounded-lg bg-white/8 p-1.5 text-white/60 transition-colors hover:text-white"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-emerald-300" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

/* ─────────────────────────── инлайн-разметка ─────────────────────────── */

type InlineRule = {
  id: "code" | "bold" | "underline" | "strike" | "italic" | "spoiler" | "mention" | "link";
  re: RegExp;
  render: (
    m: RegExpExecArray,
    me: string | undefined,
    onMention?: (name: string) => void,
  ) => ReactNode;
};

const INLINE_RULES: InlineRule[] = [
  {
    id: "code",
    re: /`([^`\n]+)`/,
    render: (m) => (
      <code key={m.index} className="rounded-md bg-black/40 px-1.5 py-0.5 font-mono text-[13px] text-amber-200/90">
        {m[1]}
      </code>
    ),
  },
  {
    id: "bold",
    re: /\*\*([^*\n]+)\*\*/,
    render: (m) => <strong key={m.index}>{m[1]}</strong>,
  },
  {
    id: "underline",
    re: /__([^_\n]+)__/,
    render: (m) => <u key={m.index}>{m[1]}</u>,
  },
  {
    id: "strike",
    re: /~~([^~\n]+)~~/,
    render: (m) => <s key={m.index}>{m[1]}</s>,
  },
  {
    id: "italic",
    re: /\*([^*\n]+)\*/,
    render: (m) => <em key={m.index}>{m[1]}</em>,
  },
  {
    id: "spoiler",
    re: /\|\|([^|\n]+)\|\|/,
    render: (m) => <Spoiler key={m.index}>{m[1]}</Spoiler>,
  },
  {
    id: "mention",
    re: /(^|[^a-zA-Z0-9_])@([a-zA-Z0-9_]{2,32})/,
    render: (m, meUsername, onMention) => {
      const name = m[2].toLowerCase();
      // @all — обращение ко всем участникам чата (не кликается как профиль).
      const isAll = name === "all";
      const mine = !!meUsername && name === meUsername.toLowerCase();
      if (isAll) {
        return (
          <span key={`m-${m.index}`} className="inline">
            {m[1]}
            <span
              title="Упоминание всех участников"
              className="rounded-md bg-sky-400/20 px-1 py-px font-semibold text-sky-200"
            >
              @{m[2]}
            </span>
          </span>
        );
      }
      return (
        <span key={`m-${m.index}`} className="inline">
          {m[1]}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onMention?.(name);
            }}
            title={mine ? "Это вы" : `Открыть @${name}`}
            className={`rounded-md px-1 py-px font-medium underline-offset-2 hover:underline ${
              mine ? "bg-white/15 text-slate-100" : "bg-white/10 text-slate-200"
            }`}
          >
            @{m[2]}
          </button>
        </span>
      );
    },
  },
  {
    id: "link",
    re: /(https?:\/\/[^\s<>"')\]]+)/,
    render: (m) => (
      <a
        key={`a-${m.index}`}
        href={m[1]}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="text-sky-300 underline decoration-sky-300/40 underline-offset-2 hover:text-sky-200"
      >
        {m[1]}
      </a>
    ),
  },
];

/** Рекурсивный инлайн-парсер: находит самое левое правило и делит текст. */
function parseInline(
  text: string,
  me: string | undefined,
  keyPrefix: string,
  onMention?: (name: string) => void,
): ReactNode[] {
  if (!text) return [];
  let best: { rule: InlineRule; m: RegExpExecArray } | null = null;
  for (const rule of INLINE_RULES) {
    const m = rule.re.exec(text);
    if (m && (best === null || m.index < best.m.index)) best = { rule, m };
  }
  if (!best) return [text];

  const { rule, m } = best;
  const before = text.slice(0, m.index);
  // у упоминания в начале есть префикс-символ — он входит в m[0] целиком
  const afterStart = rule.id === "mention" && m[1] ? m.index + m[1].length : m.index + m[0].length;
  const after = text.slice(afterStart);

  const out: ReactNode[] = [];
  if (before) out.push(...parseInline(before, me, `${keyPrefix}b`, onMention));
  out.push(rule.render(m, me, onMention));
  if (after) out.push(...parseInline(after, me, `${keyPrefix}a`, onMention));
  return out;
}

/**
 * Разбор текста сообщения в React-элементы.
 * Сначала вынимаем ```блоки кода``` (многострочные), остальное — инлайн.
 */
export function renderRichText(
  text: string,
  meUsername?: string,
  onMention?: (name: string) => void,
): ReactNode {
  const parts: ReactNode[] = [];
  const codeRe = /```([\s\S]*?)```/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = codeRe.exec(text)) !== null) {
    if (m.index > last) parts.push(...parseInline(text.slice(last, m.index), meUsername, `t${i}`, onMention));
    parts.push(<CodeBlock key={`c${i}`} code={m[1].replace(/^\n|\n$/g, "")} />);
    last = m.index + m[0].length;
    i++;
  }
  if (last < text.length) parts.push(...parseInline(text.slice(last), meUsername, `t${i}`, onMention));
  return parts;
}

/** Убирает разметку — для превью в цитатах и сайдбаре. */
export function stripMarkdown(text: string): string {
  return text
    .replace(/```([\s\S]*?)```/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/\|\|([^|]+)\|\|/g, "$1")
    .replace(/\n/g, " ")
    .slice(0, 80);
}
