"use client";

/**
 * Карточка группы/канала: участники с ролями, настройки (название, описание,
 * приватность), ссылка-приглашение, добавление/исключение людей, звонок,
 * выход из диалога и удаление (для владельца).
 */
import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Camera,
  Check,
  Copy,
  Crown,
  Hash,
  Loader2,
  Lock,
  LogOut,
  Megaphone,
  Phone,
  Settings2,
  ShieldBan,
  Timer,
  RefreshCw,
  Shield,
  Trash2,
  UserPlus,
  Users,
  Video,
  X,
} from "lucide-react";
import Avatar from "./Avatar";
import PeoplePicker from "./PeoplePicker";
import { ModalShell } from "./ProfileModal";
import { api, copyToClipboard, uploadFile } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import type { ConversationInfo, ConversationMemberItem, MemberRole, PublicUser } from "@/lib/types";

type Props = {
  me: PublicUser;
  conversationId: string;
  onClose: () => void;
  onCall: (media: "audio" | "video") => void;
  onViewUser: (user: PublicUser) => void;
  onLeft: () => void;
  onChanged: () => void;
  notify: (msg: string) => void;
  callBusy: boolean;
  onOpenConversation?: (id: string) => void;
};

const ROLE_LABEL: Record<MemberRole, string> = {
  owner: "владелец",
  admin: "админ",
  member: "участник",
};

export default function GroupInfoModal({
  me,
  conversationId,
  onClose,
  onCall,
  onViewUser,
  onLeft,
  onChanged,
  notify,
  callBusy,
  onOpenConversation,
}: Props) {
  const [info, setInfo] = useState<ConversationInfo | null>(null);
  const [members, setMembers] = useState<ConversationMemberItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState(false);
  const [name, setName] = useState("");
  const [about, setAbout] = useState("");
  const [isPrivate, setIsPrivate] = useState(true);
  const [restricted, setRestricted] = useState(false);
  /** Слоумод: пауза между сообщениями участников (сек, 0 — выключен). */
  const [slowMode, setSlowMode] = useState(0);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [saving, setSaving] = useState(false);
  const [picker, setPicker] = useState<"add" | null>(null);
  const [copied, setCopied] = useState(false);
  // Комментарии канала: привязанная группа-обсуждение
  const [discussion, setDiscussion] = useState<{ id: string; name: string | null } | null>(null);
  const [myGroups, setMyGroups] = useState<{ id: string; name: string | null }[]>([]);
  const [discPicker, setDiscPicker] = useState(false);
  const [discBusy, setDiscBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api<{ conversation: ConversationInfo & { members: ConversationMemberItem[] } }>(
        `/api/conversations/${conversationId}`,
      );
      setInfo(d.conversation);
      setMembers(d.conversation.members);
      setName(d.conversation.name ?? "");
      setAbout(d.conversation.about ?? "");
      setIsPrivate(d.conversation.isPrivate);
      setRestricted(!!(d.conversation as { restricted?: boolean }).restricted);
      setSlowMode(typeof (d.conversation as { slowMode?: number }).slowMode === "number" ? (d.conversation as { slowMode?: number }).slowMode ?? 0 : 0);
      setAvatarUrl(d.conversation.avatarUrl);
      const tk = (d.conversation as { inviteToken?: string | null }).inviteToken ?? "";
      setUsername(/^[a-z0-9_]{5,32}$/.test(tk) ? tk : "");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Не удалось загрузить");
    } finally {
      setLoading(false);
    }
  }, [conversationId, notify]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (info?.kind !== "channel" || info.myRole !== "owner") return;
    api<{ discussion: { id: string; name: string | null } | null; myGroups: { id: string; name: string | null }[] }>(
      `/api/conversations/${conversationId}/discussion`,
    )
      .then((d) => {
        setDiscussion(d.discussion);
        setMyGroups(d.myGroups);
      })
      .catch(() => {});
  }, [info?.kind, info?.myRole, conversationId]);

  const linkDiscussion = async (groupId: string) => {
    setDiscBusy(true);
    try {
      await api(`/api/conversations/${conversationId}/discussion`, {
        method: "POST",
        body: JSON.stringify({ groupId }),
      });
      const d = await api<{ discussion: { id: string; name: string | null } | null }>(
        `/api/conversations/${conversationId}/discussion`,
      );
      setDiscussion(d.discussion);
      setDiscPicker(false);
      notify("Чат для комментариев привязан");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Не удалось привязать чат");
    } finally {
      setDiscBusy(false);
    }
  };

  const createDiscussion = async () => {
    setDiscBusy(true);
    try {
      const d = await api<{ conversation: { id: string } }>("/api/conversations", {
        method: "POST",
        body: JSON.stringify({
          kind: "group",
          name: `Чат канала «${info?.name ?? ""}»`,
          memberIds: [me.id],
        }),
      });
      await linkDiscussion(d.conversation.id);
      onChanged();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Не удалось создать чат");
      setDiscBusy(false);
    }
  };

  const manager = info ? info.myRole === "owner" || info.myRole === "admin" : false;
  const owner = info?.myRole === "owner";

  const addMembers = async (list: PublicUser[]) => {
    try {
      await api(`/api/conversations/${conversationId}/members`, {
        method: "POST",
        body: JSON.stringify({ userIds: list.map((u) => u.id) }),
      });
      notify(`Добавлено: ${list.length}`);
      await load();
      onChanged();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Не удалось добавить");
    }
  };

  const setRole = async (userId: string, role: MemberRole) => {
    try {
      await api(`/api/conversations/${conversationId}/members/${userId}`, {
        method: "PATCH",
        body: JSON.stringify({ role }),
      });
      notify("Роль обновлена");
      await load();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Не удалось изменить роль");
    }
  };

  const removeMember = async (userId: string, who: string) => {
    if (!confirm(userId === me.id ? `Выйти из «${who}»?` : `Исключить ${who}?`)) return;
    try {
      await api(`/api/conversations/${conversationId}/members/${userId}`, { method: "DELETE" });
      if (userId === me.id) {
        notify("Вы покинули диалог");
        onLeft();
        return;
      }
      notify("Участник исключён");
      await load();
      onChanged();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Не удалось исключить");
    }
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await api(`/api/conversations/${conversationId}`, {
        method: "PATCH",
        body: JSON.stringify({
          name,
          about,
          isPrivate,
          avatarUrl,
          ...(info?.myRole === "owner" ? { username, restricted } : {}),
          ...(info?.myRole === "owner" || info?.myRole === "admin" ? { slowMode } : {}),
        }),
      });
      notify("Сохранено");
      setEdit(false);
      await load();
      onChanged();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  };

  const pickAvatar = async (file: File | null) => {
    if (!file) return;
    try {
      setAvatarUrl(await uploadFile(file));
    } catch (e) {
      notify(e instanceof Error ? e.message : "Ошибка загрузки");
    }
  };

  /** Отозвать инвайт-ссылку: старый токен перестаёт работать (как в ТГ). */
  const revokeInvite = async () => {
    if (!confirm("Отозвать текущую ссылку-приглашение? Старые ссылки перестанут работать.")) return;
    try {
      await api(`/api/conversations/${conversationId}`, {
        method: "PATCH",
        body: JSON.stringify({ revokeInvite: true }),
      });
      notify("Ссылка отозвана — выпущена новая");
      await load();
      onChanged();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Не удалось отозвать ссылку");
    }
  };

  const copyInvite = async () => {
    try {
      const d = await api<{ token: string }>(`/api/conversations/${conversationId}/invites`, {
        method: "POST",
      });
      const url = `${window.location.origin}${window.location.pathname}#group=${d.token}`;
      // copyToClipboard — с фолбэком на execCommand (http/небезопасный контекст)
      if (!(await copyToClipboard(url))) {
        window.prompt("Скопируйте ссылку-приглашение:", url);
        return;
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
      notify("Ссылка-приглашение скопирована");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Не удалось получить ссылку");
    }
  };

  if (loading || !info) {
    return (
      <ModalShell onClose={onClose}>
        <div className="flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-white/40" />
        </div>
      </ModalShell>
    );
  }

  const isChannel = info.kind === "channel";

  return (
    <ModalShell onClose={onClose} wide>
      {/* Шапка */}
      <div className="relative">
        <div className="flex items-start gap-4 px-6 pt-6">
          <div className="relative">
            <Avatar name={info.title} src={avatarUrl} size={72} />
            {edit && (
              <label className="absolute inset-0 grid cursor-pointer place-items-center rounded-full bg-black/60">
                <Camera className="h-4 w-4 text-white" />
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="hidden"
                  onChange={(e) => {
                    void pickAvatar(e.target.files?.[0] ?? null);
                    e.target.value = "";
                  }}
                />
              </label>
            )}
          </div>
          <div className="min-w-0 flex-1">
            {edit ? (
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={32}
                className="ring-focus w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[15px] font-semibold"
              />
            ) : (
              <p className="font-display truncate text-lg font-bold">{info.title}</p>
            )}
            <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-white/40">
              <span className="flex items-center gap-1">
                {isChannel ? <Megaphone className="h-3 w-3" /> : <Users className="h-3 w-3" />}
                {isChannel ? "Канал" : "Группа"} · {info.memberCount}
              </span>
              <span className="flex items-center gap-1">
                {info.isPrivate ? <Lock className="h-3 w-3" /> : <Hash className="h-3 w-3" />}
                {info.isPrivate ? "приватный" : "публичный"}
              </span>
              <span className="flex items-center gap-1 text-slate-400/80">
                <Shield className="h-3 w-3" />
                вы — {ROLE_LABEL[info.myRole]}
              </span>
              {username && (
                <button
                  onClick={() => {
                    const url = `${window.location.origin}${window.location.pathname}#group=${username}`;
                    void copyToClipboard(url).then((ok) => {
                      if (!ok) window.prompt("Скопируйте ссылку:", url);
                      notify(`Ссылка @${username} скопирована`);
                    });
                  }}
                  title="Скопировать ссылку на чат"
                  className="flex items-center gap-1 rounded-md bg-white/10 px-1.5 py-0.5 text-slate-200 hover:bg-white/15"
                >
                  @{username} <Copy className="h-3 w-3" />
                </button>
              )}
            </p>
          </div>
          <button onClick={onClose} className="rounded-full bg-white/10 p-2 text-white/70">
            <X className="h-4 w-4" />
          </button>
        </div>

        {edit ? (
          <div className="space-y-2.5 px-6 pt-4">
            {owner && (
              <div className="flex items-center gap-1">
                <span className="text-white/35">@</span>
                <input
                  value={username}
                  onChange={(e) =>
                    setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 32))
                  }
                  maxLength={32}
                  placeholder="юзернейм чата (5–32: a-z, 0-9, _)"
                  className="ring-focus w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm placeholder:text-white/25"
                />
              </div>
            )}
            <textarea
              value={about}
              onChange={(e) => setAbout(e.target.value)}
              rows={2}
              maxLength={255}
              placeholder="Описание"
              className="ring-focus nice-scroll w-full resize-none rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm placeholder:text-white/25"
            />
            <button
              onClick={() => setIsPrivate((v) => !v)}
              className="flex w-full items-center gap-3 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2.5 text-left"
            >
              {isPrivate ? <Lock className="h-4 w-4 text-slate-400" /> : <Hash className="h-4 w-4 text-slate-400" />}
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{isPrivate ? "Приватный" : "Публичный"}</span>
                <span className="block text-[11px] text-white/35">
                  {isPrivate
                    ? "Только по приглашению/ссылке"
                    : "Виден в «Обзоре», может вступить любой"}
                </span>
              </span>
              <span className={`h-5 w-9 shrink-0 rounded-full ${isPrivate ? "bg-[#5865f2]" : "bg-white/20"}`} />
            </button>
            {owner && (
              <button
                onClick={() => setRestricted((v) => !v)}
                className="flex w-full items-center gap-3 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2.5 text-left"
              >
                <ShieldBan className="h-4 w-4 shrink-0 text-slate-400" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">Запретить копирование и сохранение</span>
                  <span className="block text-[11px] text-white/35">
                    Как ограниченные каналы в ТГ: без скачивания, пересылки и копирования
                  </span>
                </span>
                <span className={`h-5 w-9 shrink-0 rounded-full ${restricted ? "bg-rose-400/80" : "bg-white/20"}`} />
              </button>
            )}
            {(owner || info.myRole === "admin") && (
              <div className="flex w-full items-center gap-3 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2.5">
                <Timer className="h-4 w-4 shrink-0 text-slate-400" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">Слоумод</span>
                  <span className="block text-[11px] text-white/35">
                    Пауза между сообщениями участников — как в ТГ
                  </span>
                </span>
                <select
                  value={slowMode}
                  onChange={(e) => setSlowMode(Number(e.target.value))}
                  className="ring-focus rounded-lg border border-white/10 bg-white/[0.06] px-2 py-1 text-xs"
                  title="Интервал слоумода"
                >
                  <option value={0}>Выкл</option>
                  <option value={10}>10 сек</option>
                  <option value={30}>30 сек</option>
                  <option value={60}>1 мин</option>
                  <option value={300}>5 мин</option>
                </select>
              </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => void save()}
                disabled={saving || name.trim().length < 2}
                className="btn-gradient flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold disabled:opacity-50"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Сохранить
              </button>
              <button
                onClick={() => {
                  setEdit(false);
                  setName(info.name ?? "");
                  setAbout(info.about);
                  setIsPrivate(info.isPrivate);
                  setRestricted(!!info.restricted);
                  setSlowMode(typeof info.slowMode === "number" ? info.slowMode : 0);
                  setAvatarUrl(info.avatarUrl);
                }}
                className="glass rounded-xl px-4 py-2.5 text-sm text-white/70"
              >
                Отмена
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-4 flex flex-wrap gap-2 px-6">
            <Action onClick={() => onCall("audio")} disabled={callBusy} icon={<Phone className="h-4 w-4" />}>
              Позвонить
            </Action>
            <Action onClick={() => onCall("video")} disabled={callBusy} icon={<Video className="h-4 w-4" />}>
              Видео
            </Action>
            <Action onClick={() => void copyInvite()} icon={copied ? <Check className="h-4 w-4 text-emerald-300" /> : <Copy className="h-4 w-4" />}>
              {copied ? "Скопировано" : "Ссылка"}
            </Action>
            {owner && (
              <Action onClick={() => void revokeInvite()} icon={<RefreshCw className="h-4 w-4" />}>
                Отозвать
              </Action>
            )}
            <Action onClick={() => setPicker("add")} icon={<UserPlus className="h-4 w-4" />}>
              Добавить
            </Action>
            {manager && (
              <Action onClick={() => setEdit(true)} icon={<Settings2 className="h-4 w-4" />}>
                Настройки
              </Action>
            )}
          </div>
        )}
      </div>

      {/* Комментарии канала: группа-обсуждение (владелец привязывает чат) */}
      {info.kind === "channel" && owner && (
        <div className="px-6 pt-4">
          <p className="mb-2 text-[10px] font-semibold tracking-wide text-white/40 uppercase">
            Комментарии
          </p>
          {discussion ? (
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  onClose();
                  onOpenConversation?.(discussion.id);
                }}
                className="btn-gradient rounded-xl px-3.5 py-2 text-[13px] font-semibold text-white"
              >
                Открыть чат · {discussion.name ?? "обсуждение"}
              </button>
              <button
                onClick={() => {
                  void (async () => {
                    try {
                      await api(`/api/conversations/${conversationId}/discussion`, {
                        method: "POST",
                        body: JSON.stringify({ unlink: true }),
                      });
                      setDiscussion(null);
                      notify("Обсуждение отвязано");
                    } catch {
                      notify("Не удалось отвязать");
                    }
                  })();
                }}
                className="rounded-xl bg-white/10 px-3.5 py-2 text-[13px] text-white/70 hover:bg-white/15"
              >
                Отвязать
              </button>
            </div>
          ) : discPicker ? (
            <div className="space-y-1.5">
              {myGroups.map((g) => (
                <button
                  key={g.id}
                  disabled={discBusy}
                  onClick={() => void linkDiscussion(g.id)}
                  className="flex w-full items-center gap-2 rounded-xl bg-white/5 px-3 py-2 text-left text-[13px] hover:bg-white/10 disabled:opacity-50"
                >
                  <Users className="h-3.5 w-3.5 text-slate-400" />
                  <span className="truncate">{g.name ?? "Группа"}</span>
                </button>
              ))}
              <button
                disabled={discBusy}
                onClick={() => void createDiscussion()}
                className="flex w-full items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-[13px] font-medium hover:bg-white/15 disabled:opacity-50"
              >
                <UserPlus className="h-3.5 w-3.5" /> Создать новый чат
              </button>
            </div>
          ) : (
            <button
              onClick={() => setDiscPicker(true)}
              className="rounded-xl bg-white/10 px-3.5 py-2 text-[13px] text-white/80 hover:bg-white/15"
            >
              Добавить чат для комментариев
            </button>
          )}
        </div>
      )}

      {info.about && !edit && (
        <p className="px-6 pt-4 text-sm leading-relaxed text-white/55">{info.about}</p>
      )}

      {/* Участники */}
      <div className="nice-scroll mt-4 max-h-[38vh] overflow-y-auto px-4 pb-5">
        <p className="px-2 py-2 text-[11px] font-semibold tracking-widest text-white/25 uppercase">
          Участники · {members.length}
        </p>
        {members.map((m) => {
          const isMe = m.user.id === me.id;
          const canManageThem =
            (owner && m.role !== "owner") ||
            (info.myRole === "admin" && m.role === "member" && !isMe);
          return (
            <div key={m.user.id} className="group flex items-center gap-3 rounded-2xl px-2 py-2 hover:bg-white/5">
              <button onClick={() => onViewUser(m.user)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                <Avatar name={m.user.displayName} src={m.user.avatarUrl} size={38} online={m.user.online} />
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                    {m.user.displayName}
                    {isMe && <span className="text-[10px] text-white/30">(вы)</span>}
                    {m.role === "owner" && <Crown className="h-3 w-3 text-amber-300" />}
                  </p>
                  <p className="truncate text-[11px] text-white/35">
                    @{m.user.username} · {ROLE_LABEL[m.role]} · с нами {timeAgo(m.joinedAt)}
                  </p>
                </div>
              </button>

              <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                {owner && !isMe && m.role !== "owner" && (
                  <>
                    <IconAction
                      title={m.role === "admin" ? "Снять админа" : "Сделать админом"}
                      onClick={() => void setRole(m.user.id, m.role === "admin" ? "member" : "admin")}
                    >
                      <Shield className="h-3.5 w-3.5" />
                    </IconAction>
                  </>
                )}
                {canManageThem && (
                  <IconAction title="Исключить" onClick={() => void removeMember(m.user.id, m.user.displayName)}>
                    <Trash2 className="h-3.5 w-3.5 text-rose-300" />
                  </IconAction>
                )}
              </div>
            </div>
          );
        })}

        <div className="mt-3 flex gap-2 px-2">
          <button
            onClick={() => void removeMember(me.id, info.title)}
            className="glass flex flex-1 items-center justify-center gap-2 rounded-2xl py-3 text-sm text-white/70 transition-colors hover:text-white"
          >
            <LogOut className="h-4 w-4" />
            {owner ? "Покинуть (владение передастся)" : "Выйти"}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {picker === "add" && (
          <PeoplePicker
            key="picker"
            title="Добавить участников"
            hint={isChannel ? "Подписчики канала" : "Участники группы"}
            excludeIds={members.map((m) => m.user.id)}
            onClose={() => setPicker(null)}
            onConfirm={addMembers}
          />
        )}
      </AnimatePresence>
    </ModalShell>
  );
}

function Action({
  children,
  onClick,
  icon,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  icon: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="glass flex items-center gap-2 rounded-xl px-3.5 py-2 text-[13px] text-white/80 transition-colors hover:text-white disabled:opacity-40"
    >
      {icon}
      {children}
    </button>
  );
}

function IconAction({
  children,
  onClick,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="glass flex h-8 w-8 items-center justify-center rounded-xl text-white/70 transition-colors hover:text-white"
    >
      {children}
    </button>
  );
}
