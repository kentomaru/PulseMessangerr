"use client";

/**
 * Кастомный статус-эмодзи пользователя (как в профиле, так и рядом с именем
 * в чате). Значение — либо обычный эмодзи («🔥»), либо ссылка на загруженную
 * АНИМИРОВАННУЮ гифку — тогда она проигрывается прямо рядом с именем.
 */
export default function StatusEmoji({
  value,
  size = 18,
  className = "",
}: {
  value?: string | null;
  size?: number;
  className?: string;
}) {
  if (!value) return null;
  const isGif = value.startsWith("/api/files/") || value.startsWith("http");
  if (isGif) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={value}
        alt=""
        aria-hidden
        draggable={false}
        className={`inline-block shrink-0 object-contain ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span className={`inline-block shrink-0 leading-none ${className}`} style={{ fontSize: size * 0.95 }}>
      {value}
    </span>
  );
}
