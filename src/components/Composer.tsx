"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AttachmentPayload, MessagePayload, SettingsPayload } from "@/lib/pulse";
import { QUICK_EMOJI } from "@/lib/pulse";
import { MAX_UPLOAD_BYTES, prepareFile, uploadPrepared } from "@/lib/upload";
import AttachmentView, { AttachmentChips } from "./AttachmentView";
import {
  IconClip,
  IconClose,
  IconFile,
  IconImage,
  IconMic,
  IconSend,
  IconSmile,
} from "./ui";

export default function Composer({
  chatId,
  settings,
  disabled = false,
  disabledHint,
  replyTo,
  onCancelReply,
  editing,
  onCancelEdit,
  onSent,
  onTyping,
  onNotify,
}: {
  chatId: number;
  settings: SettingsPayload;
  disabled?: boolean;
  disabledHint?: string;
  replyTo: MessagePayload | null;
  onCancelReply: () => void;
  editing: MessagePayload | null;
  onCancelEdit: () => void;
  onSent: (message?: MessagePayload) => void;
  onTyping: () => void;
  onNotify: (text: string) => void;
}) {
  const [text, setText] = useState("");
  const [pending, setPending] = useState<AttachmentPayload[]>([]);
  const [uploading, setUploading] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordTime, setRecordTime] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [sending, setSending] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const imageInput = useRef<HTMLInputElement | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (editing) {
      setText(editing.body);
      setPending([]);
      textareaRef.current?.focus();
    }
  }, [editing]);

  useEffect(() => {
    if (!replyTo) return;
    textareaRef.current?.focus();
  }, [replyTo]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text]);

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      const tooBig = list.filter((f) => f.size > MAX_UPLOAD_BYTES);
      if (tooBig.length > 0) {
        onNotify(`Файл слишком большой (максимум 24 МБ): ${tooBig[0].name}`);
        return;
      }
      setUploading((n) => n + list.length);
      for (const file of list) {
        try {
          const prepared = await prepareFile(file);
          const attachment = await uploadPrepared(prepared);
          setPending((prev) => [...prev, attachment]);
        } catch {
          onNotify(`Не удалось загрузить ${file.name}`);
        } finally {
          setUploading((n) => Math.max(0, n - 1));
        }
      }
    },
    [onNotify],
  );

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        setRecording(false);
        setRecordTime(0);
        if (blob.size < 512) return;
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            const attachment = await uploadPrepared({
              dataUrl: String(reader.result),
              name: `Голосовое ${new Date().toLocaleTimeString("ru-RU")}.webm`,
              mime: blob.type || "audio/webm",
              kind: "audio",
              duration: Math.round(recordTime),
            });
            setPending((prev) => [...prev, attachment]);
          } catch {
            onNotify("Не удалось отправить голосовое");
          }
        };
        reader.readAsDataURL(blob);
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      setRecordTime(0);
      timerRef.current = setInterval(() => setRecordTime((t) => t + 1), 1000);
    } catch {
      onNotify("Микрофон недоступен");
    }
  }, [onNotify, recordTime]);

  const stopRecording = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    recorderRef.current?.stop();
  }, []);

  const send = useCallback(async () => {
    if (disabled || sending) return;
    const body = text.trim();
    if (!body && pending.length === 0) return;
    setSending(true);
    try {
      if (editing) {
        const res = await fetch(`/api/messages/${editing.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ body }),
        });
        if (!res.ok) throw new Error("edit_failed");
        onCancelEdit();
      } else {
        const res = await fetch(`/api/chats/${chatId}/messages`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            body,
            replyToId: replyTo?.id ?? null,
            attachments: pending.map((a) => ({ fileId: a.fileId })),
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          if (data?.error === "blocked") onNotify("Отправка невозможна: есть блокировка");
          throw new Error("send_failed");
        }
        onSent(data.message as MessagePayload);
      }
      setText("");
      setPending([]);
      onCancelReply();
    } catch {
      onNotify("Не удалось отправить сообщение");
    } finally {
      setSending(false);
      onTyping();
    }
  }, [chatId, disabled, editing, onCancelEdit, onCancelReply, onNotify, onSent, onTyping, pending, replyTo, sending, text]);

  if (disabled) {
    return (
      <div
        className="mx-auto w-full max-w-3xl px-4 pb-5 text-center text-[13px]"
        style={{ color: "var(--muted)" }}
      >
        <div className="rounded-2xl border px-4 py-4" style={{ borderColor: "var(--border)", background: "var(--panel-2)" }}>
          {disabledHint ?? "Отправка сообщений недоступна"}
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full px-3 pb-4 sm:px-4">
      {menuOpen ? (
        <div
          className="animate-pulse-in absolute bottom-full left-3 z-30 mb-2 w-60 overflow-hidden rounded-2xl border p-1.5"
          style={{ background: "var(--panel-solid)", borderColor: "var(--border)", boxShadow: "var(--shadow)" }}
        >
          <button
            onClick={() => {
              setMenuOpen(false);
              imageInput.current?.click();
            }}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13.5px] transition hover:brightness-110"
            style={{ background: "transparent" }}
          >
            <IconImage size={18} /> Фото и видео
          </button>
          <button
            onClick={() => {
              setMenuOpen(false);
              fileInput.current?.click();
            }}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13.5px] transition hover:brightness-110"
          >
            <IconFile size={18} /> Документ или файл
          </button>
          <button
            onClick={() => {
              setMenuOpen(false);
              void startRecording();
            }}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13.5px] transition hover:brightness-110"
          >
            <IconMic size={18} /> Голосовое сообщение
          </button>
        </div>
      ) : null}

      {emojiOpen ? (
        <div
          className="animate-pulse-in absolute right-3 bottom-full z-30 mb-2 w-72 rounded-2xl border p-2"
          style={{ background: "var(--panel-solid)", borderColor: "var(--border)", boxShadow: "var(--shadow)" }}
        >
          <div className="grid grid-cols-8 gap-1">
            {QUICK_EMOJI.map((e) => (
              <button
                key={e}
                onClick={() => {
                  setText((t) => t + e);
                  onTyping();
                }}
                className="rounded-lg py-1.5 text-lg transition hover:brightness-125"
              >
                {e}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {replyTo ? (
        <div
          className="mx-auto mb-2 flex max-w-3xl items-center gap-2 rounded-2xl border-l-4 px-3 py-2"
          style={{ background: "var(--panel-2)", borderColor: "var(--accent)" }}
        >
          <div className="min-w-0 flex-1">
            <div className="text-[12px] font-semibold" style={{ color: "var(--accent)" }}>
              Ответ {replyTo.sender.name}
            </div>
            <div className="truncate text-[12.5px]" style={{ color: "var(--muted)" }}>
              {replyTo.body || (replyTo.attachments[0] ? replyTo.attachments[0].name : "Вложение")}
            </div>
          </div>
          <button onClick={onCancelReply} style={{ color: "var(--muted)" }}>
            <IconClose size={16} />
          </button>
        </div>
      ) : null}

      {editing ? (
        <div
          className="mx-auto mb-2 flex max-w-3xl items-center gap-2 rounded-2xl border-l-4 px-3 py-2"
          style={{ background: "var(--panel-2)", borderColor: "var(--accent)" }}
        >
          <div className="min-w-0 flex-1">
            <div className="text-[12px] font-semibold" style={{ color: "var(--accent)" }}>
              Редактирование
            </div>
            <div className="truncate text-[12.5px]" style={{ color: "var(--muted)" }}>
              {editing.body || "Вложение"}
            </div>
          </div>
          <button onClick={onCancelEdit} style={{ color: "var(--muted)" }}>
            <IconClose size={16} />
          </button>
        </div>
      ) : null}

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files?.length) void handleFiles(e.dataTransfer.files);
        }}
        className="mx-auto w-full max-w-3xl rounded-[26px] border px-2 py-2"
        style={{
          background: "var(--panel)",
          borderColor: dragOver ? "var(--accent)" : "var(--border)",
          boxShadow: "var(--shadow)",
          backdropFilter: "blur(18px)",
        }}
      >
        {pending.length > 0 ? (
          <div className="px-2 pt-2">
            <AttachmentChips
              attachments={pending}
              onRemove={(fileId) => setPending((prev) => prev.filter((a) => a.fileId !== fileId))}
            />
            <div className="mb-1 px-1 text-[11px]" style={{ color: "var(--muted)" }}>
              Можно добавить подпись — всё уйдёт одним сообщением
            </div>
          </div>
        ) : null}

        {recording ? (
          <div className="mb-2 flex items-center gap-3 px-3 py-2" style={{ color: "var(--muted)" }}>
            <span className="flex h-2.5 w-2.5 rounded-full bg-red-500" />
            <div className="flex h-6 items-end gap-0.5">
              {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                <span
                  key={i}
                  className="wave-bar w-1 rounded-full"
                  style={{
                    height: 18,
                    background: "var(--accent)",
                    animationDelay: `${i * 0.09}s`,
                  }}
                />
              ))}
            </div>
            <span className="text-[13px] tabular-nums">
              {String(Math.floor(recordTime / 60)).padStart(2, "0")}:
              {String(recordTime % 60).padStart(2, "0")}
            </span>
            <button
              onClick={stopRecording}
              className="ml-auto rounded-xl px-3 py-1.5 text-[12.5px] font-semibold text-white"
              style={{ background: "var(--accent)" }}
            >
              Отправить голосовое
            </button>
          </div>
        ) : null}

        <div className="flex items-end gap-1.5">
          <button
            onClick={() => {
              setEmojiOpen(false);
              setMenuOpen((v) => !v);
            }}
            className="rounded-2xl p-2.5 transition hover:brightness-125"
            style={{ color: "var(--muted)" }}
            title="Прикрепить"
          >
            <IconClip size={20} />
          </button>
          <textarea
            ref={textareaRef}
            rows={1}
            value={text}
            placeholder={
              pending.length > 0 ? "Добавьте подпись…" : "Напишите сообщение…"
            }
            onChange={(e) => {
              setText(e.target.value);
              onTyping();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                if (settings.enterToSend) {
                  e.preventDefault();
                  void send();
                }
              }
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                void send();
              }
              if (e.key === "Escape") {
                onCancelReply();
                onCancelEdit();
              }
            }}
            onPaste={(e) => {
              const files = Array.from(e.clipboardData?.files ?? []);
              if (files.length > 0) {
                e.preventDefault();
                void handleFiles(files);
              }
            }}
            className="max-h-40 flex-1 resize-none bg-transparent px-1 py-2.5 outline-none"
            style={{ fontSize: "var(--msg-size)", color: "var(--text)" }}
          />
          <button
            onClick={() => {
              setMenuOpen(false);
              setEmojiOpen((v) => !v);
            }}
            className="rounded-2xl p-2.5 transition hover:brightness-125"
            style={{ color: "var(--muted)" }}
            title="Эмодзи"
          >
            <IconSmile size={20} />
          </button>
          <button
            onClick={() => void send()}
            disabled={sending || (!text.trim() && pending.length === 0)}
            className="flex h-11 w-11 items-center justify-center rounded-2xl text-white transition hover:brightness-110 disabled:opacity-40"
            style={{ background: "var(--accent)" }}
            title="Отправить"
          >
            {uploading > 0 ? (
              <span className="text-[11px] font-bold">{uploading}</span>
            ) : (
              <IconSend size={19} />
            )}
          </button>
        </div>
      </div>

      <input
        ref={imageInput}
        type="file"
        accept="image/*,video/*"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) void handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) void handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}

export { AttachmentView };
