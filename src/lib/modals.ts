/**
 * Учёт открытых модальных окон.
 *
 * Зачем:
 * 1. Каждое окно закрывается по Esc (только самое верхнее — стек),
 *    а горячие клавиши приложения не срабатывают «сквозь» открытое окно.
 * 2. Чат/приложение видят, что открыто окно, и не перехватывают Esc
 *    (иначе вместе с окном закрывался бы ещё и чат позади него).
 */

let openCount = 0;
const stack: symbol[] = [];

/** Зарегистрировать открытое окно. Возвращает функцию «закрыл». */
export function modalEnter(id: symbol): () => void {
  openCount += 1;
  stack.push(id);
  return () => {
    openCount = Math.max(0, openCount - 1);
    const i = stack.indexOf(id);
    if (i >= 0) stack.splice(i, 1);
  };
}

/** Открыто ли хоть одно модальное окно/оверлей. */
export const isModalOpen = (): boolean => openCount > 0;

/** Является ли окно с этим id самым верхним. */
export const isTopModal = (id: symbol): boolean => stack[stack.length - 1] === id;
