/**
 * Эксклюзивное воспроизведение медиа в чате (пункт ТЗ: «включил второе
 * голосовое — первое должно остановиться на своей секунде»).
 *
 * Одновременно играет только ОДИН голосовой/кружок: когда стартует новый,
 * предыдущий ставится на паузу — его позиция сохраняется, и при повторном
 * нажатии он продолжится с того же места.
 */

type PlaybackClaim = { id: string; pause: () => void };

let current: PlaybackClaim | null = null;

/** Заявить право на воспроизведение: предыдущий плеер будет поставлен на паузу. */
export function claimPlayback(id: string, pause: () => void): void {
  if (current && current.id !== id) {
    try {
      current.pause();
    } catch {
      /* чужой плеер уже разобран — не страшно */
    }
  }
  current = { id, pause };
}

/** Освободить слот (например, когда плеер завершился или размонтирован). */
export function releasePlayback(id: string): void {
  if (current?.id === id) current = null;
}
