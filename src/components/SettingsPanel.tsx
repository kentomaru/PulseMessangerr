"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SettingsPayload } from "@/lib/pulse";
import { ACCENTS, ACCENT_KEYS, formatBytes } from "@/lib/pulse";
import { prepareFile, uploadPrepared } from "@/lib/upload";
import WallpaperPicker from "./WallpaperPicker";
import {
  Avatar,
  IconBan,
  IconBell,
  IconClose,
  IconLogout,
  IconPalette,
  IconShield,
  IconSparkles,
  IconStorage,
  IconUsers,
  PulseLogo,
  Row,
  SectionTitle,
  Segmented,
  Toggle,
} from "./ui";

type BlockedUser = {
  id: number;
  name: string;
  handle: string;
  emoji: string;
  accent: string;
  avatarFileId: number | null;
};

const EMOJI_CHOICES = ["⚡", "🌊", "🎧", "🍭", "🚀", "🔥", "🌙", "🦊", "🐙", "🍀", "🎨", "🧊"];

const SECTIONS = [
  { id: "profile", label: "Профиль", icon: "🙂" },
  { id: "appearance", label: "Оформление", icon: "🎨" },
  { id: "chats", label: "Чаты", icon: "💬" },
  { id: "notifications", label: "Звук и уведомления", icon: "🔔" },
  { id: "privacy", label: "Приватность", icon: "🛡️" },
  { id: "data", label: "Данные", icon: "💾" },
  { id: "about", label: "О приложении", icon: "⚡" },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

export default function SettingsPanel({
  me,
  settings,
  onUpdate,
  onClose,
  onLogout,
}: {
  me: { id: number; name: string; handle: string; emoji: string; accent: string; about: string; avatarFileId?: number | null };
  settings: SettingsPayload;
  onUpdate: (patch: Partial<SettingsPayload> & Record<string, unknown>) => void;
  onClose: () => void;
  onLogout: () => void;
}) {
  const [section, setSection] = useState<SectionId>("profile");
  const [name, setName] = useState(me.name);
  const [about, setAbout] = useState(me.about);
  const [blocked, setBlocked] = useState<BlockedUser[]>([]);
  const [storage, setStorage] = useState<{ bytes: number; count: number } | null>(null);
  const avatarInput = useRef<HTMLInputElement | null>(null);

  const loadBlocked = useCallback(async () => {
    const res = await fetch("/api/blocks");
    const data = await res.json();
    setBlocked(data.blocked ?? []);
  }, []);

  useEffect(() => {
    if (section === "privacy") void loadBlocked();
    if (section === "data") {
      void fetch("/api/me/storage")
        .then((r) => r.json())
        .then((d) => setStorage({ bytes: d.bytes ?? 0, count: d.count ?? 0 }));
    }
  }, [loadBlocked, section]);

  const saveProfile = useCallback(() => {
    onUpdate({ name, about });
  }, [about, name, onUpdate]);

  const uploadAvatar = async (file: File) => {
    const prepared = await prepareFile(file);
    const attachment = await uploadPrepared(prepared);
    onUpdate({ avatarFileId: attachment.fileId });
  };

  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog">
      <div className="absolute inset-0" style={{ background: "var(--overlay)" }} onClick={onClose} />
      <div
        className="animate-pulse-in relative flex h-full w-full max-w-4xl flex-col border-l"
        style={{ background: "var(--panel-solid)", borderColor: "var(--border)", boxShadow: "var(--shadow)" }}
      >
        <div
          className="flex items-center gap-3 border-b px-5 py-4"
          style={{ borderColor: "var(--border)" }}
        >
          <PulseLogo size={30} />
          <div className="flex-1">
            <div className="text-[15px] font-bold">Настройки Pulse</div>
            <div className="text-[11.5px]" style={{ color: "var(--muted)" }}>
              @{me.handle} · всё под ваш ритм
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-2"
            style={{ background: "var(--panel-2)", color: "var(--muted)" }}
          >
            <IconClose size={17} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          <nav className="hidden w-56 shrink-0 border-r p-3 sm:block" style={{ borderColor: "var(--border)" }}>
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                onClick={() => setSection(s.id)}
                className="mb-1 flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[13px] font-medium transition"
                style={{
                  background: section === s.id ? "var(--panel-3)" : "transparent",
                  color: section === s.id ? "var(--text)" : "var(--muted)",
                }}
              >
                <span>{s.icon}</span>
                {s.label}
              </button>
            ))}
            <button
              onClick={onLogout}
              className="mt-3 flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[13px] font-medium"
              style={{ color: "#f87171", background: "var(--panel-2)" }}
            >
              <IconLogout size={16} /> Сменить профиль
            </button>
          </nav>

          <div className="pulse-scroll min-h-0 flex-1 p-5">
            <div className="mb-4 flex gap-2 overflow-x-auto sm:hidden">
              {SECTIONS.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSection(s.id)}
                  className="shrink-0 rounded-full px-3 py-1.5 text-[12px]"
                  style={{
                    background: section === s.id ? "var(--accent)" : "var(--panel-2)",
                    color: section === s.id ? "#fff" : "var(--muted)",
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>

            {section === "profile" ? (
              <div className="max-w-xl">
                <SectionTitle icon={<IconUsers size={15} />}>Профиль</SectionTitle>
                <div className="mb-5 flex items-center gap-4">
                  <Avatar name={me.name} emoji={me.emoji} accent={me.accent} fileId={me.avatarFileId} size={72} ring />
                  <div className="flex gap-2">
                    <button
                      onClick={() => avatarInput.current?.click()}
                      className="rounded-2xl px-3 py-2 text-[12.5px] font-medium"
                      style={{ background: "var(--panel-2)", border: "1px solid var(--border)" }}
                    >
                      Сменить фото
                    </button>
                    {me.avatarFileId ? (
                      <button
                        onClick={() => onUpdate({ avatarFileId: null })}
                        className="rounded-2xl px-3 py-2 text-[12.5px] font-medium"
                        style={{ background: "var(--panel-2)", border: "1px solid var(--border)", color: "#f87171" }}
                      >
                        Убрать
                      </button>
                    ) : null}
                  </div>
                  <input
                    ref={avatarInput}
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void uploadAvatar(f);
                      e.target.value = "";
                    }}
                  />
                </div>
                <Row label="Имя">
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onBlur={saveProfile}
                    className="w-full rounded-2xl px-4 py-2.5 text-[13.5px] outline-none"
                    style={{ background: "var(--panel-2)", border: "1px solid var(--border)" }}
                  />
                </Row>
                <Row label="О себе">
                  <input
                    value={about}
                    onChange={(e) => setAbout(e.target.value)}
                    onBlur={saveProfile}
                    className="w-full rounded-2xl px-4 py-2.5 text-[13.5px] outline-none"
                    style={{ background: "var(--panel-2)", border: "1px solid var(--border)" }}
                  />
                </Row>
                <Row label="Аватар-эмодзи">
                  <div className="flex flex-wrap gap-2">
                    {EMOJI_CHOICES.map((e) => (
                      <button
                        key={e}
                        onClick={() => onUpdate({ emoji: e })}
                        className="h-10 w-10 rounded-xl text-lg"
                        style={{
                          background: me.emoji === e ? "var(--accent)" : "var(--panel-2)",
                          border: me.emoji === e ? "none" : "1px solid var(--border)",
                        }}
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                </Row>
                <Row label="Ваш цвет">
                  <div className="flex flex-wrap gap-2">
                    {ACCENT_KEYS.map((key) => (
                      <button
                        key={key}
                        onClick={() => onUpdate({ accent: key })}
                        className="h-9 w-9 rounded-full"
                        style={{
                          background: `linear-gradient(135deg, ${ACCENTS[key].from}, ${ACCENTS[key].to})`,
                          outline: me.accent === key ? `3px solid ${ACCENTS[key].ring}` : "none",
                        }}
                      />
                    ))}
                  </div>
                </Row>
              </div>
            ) : null}

            {section === "appearance" ? (
              <div className="max-w-xl">
                <SectionTitle icon={<IconPalette size={15} />}>Оформление</SectionTitle>
                <Row label="Тема">
                  <Segmented
                    value={settings.theme}
                    onChange={(v) => onUpdate({ theme: v })}
                    options={[
                      { value: "midnight", label: "Полночь" },
                      { value: "noir", label: "Нуар" },
                      { value: "aurora", label: "Аврора" },
                      { value: "dawn", label: "Рассвет" },
                    ]}
                  />
                </Row>
                <Row label="Акцентный цвет">
                  <div className="flex flex-wrap gap-2">
                    {ACCENT_KEYS.map((key) => (
                      <button
                        key={key}
                        onClick={() => onUpdate({ accent: key })}
                        className="h-9 w-9 rounded-full"
                        style={{
                          background: `linear-gradient(135deg, ${ACCENTS[key].from}, ${ACCENTS[key].to})`,
                          outline: settings.accent === key ? `3px solid ${ACCENTS[key].ring}` : "none",
                        }}
                      />
                    ))}
                  </div>
                </Row>
                <Row label="Обои по умолчанию" hint="В каждом чате можно задать свои обои через меню чата">
                  <WallpaperPicker
                    value={settings.wallpaper}
                    onChange={(v) => onUpdate({ wallpaper: v })}
                    onNotify={() => undefined}
                  />
                </Row>
                <Row label="Стиль пузырьков">
                  <Segmented
                    value={settings.bubbleStyle}
                    onChange={(v) => onUpdate({ bubbleStyle: v })}
                    options={[
                      { value: "glass", label: "Стекло" },
                      { value: "solid", label: "Плотный" },
                      { value: "outline", label: "Контур" },
                    ]}
                  />
                </Row>
                <Row label="Размер текста">
                  <Segmented
                    value={settings.fontSize}
                    onChange={(v) => onUpdate({ fontSize: v })}
                    options={[
                      { value: "sm", label: "A-" },
                      { value: "md", label: "A" },
                      { value: "lg", label: "A+" },
                    ]}
                  />
                </Row>
                <Row label="Плотность">
                  <Segmented
                    value={settings.density}
                    onChange={(v) => onUpdate({ density: v })}
                    options={[
                      { value: "comfy", label: "Обычная" },
                      { value: "compact", label: "Компактная" },
                    ]}
                  />
                </Row>
                <div className="mt-4 space-y-2">
                  <Toggle
                    label="Анимации"
                    hint="Плавные появления, индикаторы набора, звонок"
                    checked={settings.animations}
                    onChange={(v) => onUpdate({ animations: v })}
                  />
                  <Toggle
                    label="Крупные эмодзи"
                    hint="Сообщения только из эмодзи отображаются крупно"
                    checked={settings.largeEmoji}
                    onChange={(v) => onUpdate({ largeEmoji: v })}
                  />
                </div>
              </div>
            ) : null}

            {section === "chats" ? (
              <div className="max-w-xl space-y-2">
                <SectionTitle icon={<IconSparkles size={15} />}>Чаты и ввод</SectionTitle>
                <Toggle
                  label="Enter отправляет"
                  hint="Выключите, чтобы отправлять по Ctrl+Enter, а Enter делать перенос"
                  checked={settings.enterToSend}
                  onChange={(v) => onUpdate({ enterToSend: v })}
                />
                <Toggle
                  label="Превью сообщений в списке"
                  hint="Показывать текст последнего сообщения"
                  checked={settings.messagePreview}
                  onChange={(v) => onUpdate({ messagePreview: v })}
                />
                <Toggle
                  label="Отчёты о прочтении"
                  hint="Показывать собеседникам, что вы прочитали сообщение"
                  checked={settings.readReceipts}
                  onChange={(v) => onUpdate({ readReceipts: v })}
                />
                <Toggle
                  label="Статус «печатает…»"
                  hint="Отправлять статус набора текста"
                  checked={settings.typingStatus}
                  onChange={(v) => onUpdate({ typingStatus: v })}
                />
                <Row label="Автозагрузка медиа">
                  <Segmented
                    value={settings.autoDownload}
                    onChange={(v) => onUpdate({ autoDownload: v })}
                    options={[
                      { value: "always", label: "Всегда" },
                      { value: "wifi", label: "Только Wi-Fi" },
                      { value: "never", label: "Никогда" },
                    ]}
                  />
                </Row>
                <Row label="Язык интерфейса">
                  <Segmented
                    value={settings.language}
                    onChange={(v) => onUpdate({ language: v })}
                    options={[
                      { value: "ru", label: "Русский" },
                      { value: "en", label: "English" },
                    ]}
                  />
                </Row>
              </div>
            ) : null}

            {section === "notifications" ? (
              <div className="max-w-xl space-y-2">
                <SectionTitle icon={<IconBell size={15} />}>Звук и уведомления</SectionTitle>
                <Toggle
                  label="Уведомления"
                  hint="Push-уведомления о новых сообщениях"
                  checked={settings.notifications}
                  onChange={(v) => onUpdate({ notifications: v })}
                />
                <Toggle
                  label="Звуки Pulse"
                  hint="Короткий импульс при отправке и получении"
                  checked={settings.sounds}
                  onChange={(v) => onUpdate({ sounds: v })}
                />
                <p className="mt-4 text-[12.5px]" style={{ color: "var(--muted)" }}>
                  Уведомления можно отключить точечно: откройте меню чата → «Без звука».
                </p>
              </div>
            ) : null}

            {section === "privacy" ? (
              <div className="max-w-xl">
                <SectionTitle icon={<IconShield size={15} />}>Приватность</SectionTitle>
                <Row label="Кто видит время последнего визита">
                  <Segmented
                    value={settings.lastSeenPrivacy}
                    onChange={(v) => onUpdate({ lastSeenPrivacy: v })}
                    options={[
                      { value: "everyone", label: "Все" },
                      { value: "contacts", label: "Контакты" },
                      { value: "nobody", label: "Никто" },
                    ]}
                  />
                </Row>
                <div className="mt-5">
                  <div className="mb-2 flex items-center gap-2 text-[13px] font-semibold">
                    <IconBan size={15} /> Заблокированные ({blocked.length})
                  </div>
                  {blocked.length === 0 ? (
                    <div className="rounded-2xl px-3 py-4 text-[12.5px]" style={{ background: "var(--panel-2)", color: "var(--muted)" }}>
                      Список пуст. Заблокировать можно в меню чата.
                    </div>
                  ) : (
                    blocked.map((u) => (
                      <div
                        key={u.id}
                        className="mb-1.5 flex items-center gap-3 rounded-2xl px-3 py-2"
                        style={{ background: "var(--panel-2)" }}
                      >
                        <Avatar name={u.name} emoji={u.emoji} accent={u.accent} fileId={u.avatarFileId} size={34} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[13px] font-medium">{u.name}</div>
                          <div className="truncate text-[11.5px]" style={{ color: "var(--muted)" }}>
                            @{u.handle}
                          </div>
                        </div>
                        <button
                          onClick={async () => {
                            await fetch(`/api/blocks?userId=${u.id}`, { method: "DELETE" });
                            void loadBlocked();
                          }}
                          className="rounded-xl px-3 py-1.5 text-[12px] font-medium"
                          style={{ background: "var(--panel-3)" }}
                        >
                          Разблокировать
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : null}

            {section === "data" ? (
              <div className="max-w-xl">
                <SectionTitle icon={<IconStorage size={15} />}>Данные и память</SectionTitle>
                <div className="mb-4 rounded-2xl p-4" style={{ background: "var(--panel-2)" }}>
                  <div className="text-[13px] font-semibold">Загруженные файлы</div>
                  <div className="mt-1 text-[12.5px]" style={{ color: "var(--muted)" }}>
                    {storage ? `${formatBytes(storage.bytes)} · ${storage.count} файлов` : "Считаем…"}
                  </div>
                </div>
                <p className="text-[12.5px]" style={{ color: "var(--muted)" }}>
                  Все вложения (фото, видео, документы, голосовые) хранятся в защищённом хранилище Pulse
                  и прикрепляются к сообщению целиком — текст и файлы уходят одним сообщением.
                </p>
              </div>
            ) : null}

            {section === "about" ? (
              <div className="max-w-xl">
                <SectionTitle icon={<PulseLogo size={15} />}>О приложении</SectionTitle>
                <div className="flex items-center gap-4 rounded-2xl p-4" style={{ background: "var(--panel-2)" }}>
                  <div className="pulse-ring rounded-2xl">
                    <PulseLogo size={54} />
                  </div>
                  <div>
                    <div className="text-[16px] font-bold">Pulse 1.2</div>
                    <div className="text-[12px]" style={{ color: "var(--muted)" }}>
                      Мессенджер с обоями, вложениями и гибкими настройками
                    </div>
                  </div>
                </div>
                <ul className="mt-4 space-y-1.5 text-[13px]" style={{ color: "var(--muted)" }}>
                  <li>⚡ Фото, видео, документы и голосовые — одним сообщением с подписью</li>
                  <li>💬 Ответы на сообщения, реакции, редактирование и удаление</li>
                  <li>🎨 Обои для каждого чата, темы и акценты</li>
                  <li>🛡️ Блокировка пользователей и удаление чатов</li>
                </ul>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
