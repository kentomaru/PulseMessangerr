import Link from "next/link";
import { ArrowLeft, Database, Eye, Lock, PhoneCall, Shield, Trash2, Image as ImageIcon } from "lucide-react";

export const metadata = {
  title: "Политика конфиденциальности — Pulse",
};

const SECTIONS: { icon: React.ReactNode; title: string; items: string[] }[] = [
  {
    icon: <Database className="h-5 w-5 text-violet-300" />,
    title: "Какие данные мы храним",
    items: [
      "Аккаунт: имя пользователя, отображаемое имя и пароль. Пароль хранится только в виде необратимого scrypt-хэша — даже администратор базы не может его прочитать.",
      "Профиль: аватар, баннер и описание — по желанию, удаляются в один клик.",
      "Сообщения и отправленные изображения — только в ваших диалогах.",
      "Истории автоматически удаляются через 24 часа.",
      "Служебные данные сессий (защищённый httpOnly-cookie) для входа.",
    ],
  },
  {
    icon: <PhoneCall className="h-5 w-5 text-cyan-300" />,
    title: "Звонки",
    items: [
      "Звонки идут напрямую между браузерами (WebRTC, P2P).",
      "Сервер видит только факт звонка и его длительность — аудио и видео через сервер не проходят.",
    ],
  },
  {
    icon: <Eye className="h-5 w-5 text-fuchsia-300" />,
    title: "Логи",
    items: [
      "Мы пишем технические логи (какие запросы выполнялись и с каким статусом), чтобы быстро находить сбои.",
      "В логи никогда не попадают пароли, содержимое сообщений и SDP-описания звонков.",
    ],
  },
  {
    icon: <Shield className="h-5 w-5 text-emerald-300" />,
    title: "Ваши настройки приватности",
    items: [
      "«Показывать статус в сети» — скрывает и онлайн-статус, и время последнего визита.",
      "«Разрешать звонки» — запрещает всем звонить вам.",
      "«Разрешать личные чаты» — никто не сможет начать с вами новый чат.",
      "«Выйти со всех устройств» — мгновенно завершает все сессии.",
    ],
  },
  {
    icon: <Trash2 className="h-5 w-5 text-rose-300" />,
    title: "Удаление данных",
    items: [
      "Удалить аккаунт со всеми сообщениями, историями и сессиями можно прямо в настройках профиля — без обращения к кому-либо.",
      "Мягкое удаление сообщений доступно в любом чате.",
    ],
  },
  {
    icon: <ImageIcon className="h-5 w-5 text-amber-300" />,
    title: "Cookies",
    items: [
      "Только один служебный cookie pulse_session (httpOnly) для хранения входа. Никакой аналитики и трекеров.",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <main className="relative min-h-dvh overflow-hidden p-4 py-10">
      <div className="pointer-events-none absolute inset-0">
        <div className="animate-float absolute top-[8%] left-[10%] h-72 w-72 rounded-full bg-violet-600/20 blur-[110px]" />
        <div className="animate-float absolute right-[5%] bottom-[8%] h-80 w-80 rounded-full bg-cyan-500/12 blur-[120px] [animation-delay:-6s]" />
      </div>

      <div className="relative z-10 mx-auto max-w-3xl">
        <Link
          href="/"
          className="glass inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm text-white/70 transition-colors hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Вернуться в Pulse
        </Link>

        <div className="mt-6 flex items-center gap-3">
          <div className="btn-gradient flex h-11 w-11 items-center justify-center rounded-2xl">
            <Lock className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold">Конфиденциальность</h1>
            <p className="text-sm text-white/40">Что Pulse знает о вас и как это защищено</p>
          </div>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {SECTIONS.map((s) => (
            <section key={s.title} className="glass rounded-3xl p-6">
              <div className="flex items-center gap-3">
                <div className="glass flex h-9 w-9 items-center justify-center rounded-xl">
                  {s.icon}
                </div>
                <h2 className="font-display font-semibold">{s.title}</h2>
              </div>
              <ul className="mt-4 space-y-2.5">
                {s.items.map((item) => (
                  <li key={item} className="flex gap-2 text-[13px] leading-relaxed text-white/55">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-violet-400/70" />
                    {item}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <p className="mt-8 text-center text-xs text-white/25">
          Pulse работает на вашем собственном сервере — все данные остаются в вашей базе PostgreSQL.
        </p>
      </div>
    </main>
  );
}
