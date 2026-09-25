/**
 * Клиентские уведомления: короткий «бип» нового сообщения через WebAudio.
 * Никаких внешних файлов — звук синтезируется осцилляторами.
 *
 * Ключевая деталь: браузеры разрешают звук только после жеста пользователя.
 * Раньше каждый бип создавал НОВЫЙ AudioContext — без жеста он рождался
 * в состоянии «suspended», и уведомление проходило молча («звука нет»).
 * Теперь контекст один на всё приложение: он создаётся/размораживается при
 * первом же клике/нажатии клавиши, и все последующие звуки играют сразу.
 */

let sharedCtx: AudioContext | null = null;
let unlockBound = false;

type AudioContextCtor = typeof AudioContext;

function getCtor(): AudioContextCtor | null {
  if (typeof window === "undefined") return null;
  return (
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext ??
    null
  );
}

/**
 * Единый AudioContext приложения. Создаётся лениво; если браузер держит его
 * в «suspended» (звук ещё не разрешён), пытается разморозить.
 */
export function getAudioContext(): AudioContext | null {
  const Ctx = getCtor();
  if (!Ctx) return null;
  if (!sharedCtx || sharedCtx.state === "closed") {
    try {
      sharedCtx = new Ctx();
    } catch {
      return null;
    }
  }
  if (sharedCtx.state === "suspended") void sharedCtx.resume().catch(() => {});
  return sharedCtx;
}

/**
 * Разблокировка звука по первому жесту пользователя: подписываемся один раз,
 * создаём и размораживаем контекст заранее, чтобы первое же уведомление
 * (сообщение/звонок), пришедшее после клика, прозвучало без задержек.
 */
export function ensureAudioUnlocked(): void {
  if (typeof window === "undefined" || unlockBound) return;
  if (!getCtor()) return;
  unlockBound = true;
  // Слушатели остаются навсегда: каждый жест заодно размораживает контекст,
  // если браузер успел его приостановить (например, вкладка долго была в фоне).
  const unlock = () => {
    getAudioContext();
  };
  window.addEventListener("pointerdown", unlock, true);
  window.addEventListener("keydown", unlock, true);
  window.addEventListener("touchstart", unlock, true);
}

// Разблокировка нужна как можно раньше — вешаем слушатели при загрузке модуля.
ensureAudioUnlocked();

/** Короткий «бип» нового сообщения: две ноты (соль → ми следующей октавы). */
export function playNotifySound(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const play = () => {
      // Контекст мог успеть «закрыться» (например, его пересоздали) — проверяем.
      if (ctx.state === "closed") return;
      const t0 = ctx.currentTime + 0.02;
      beep(ctx, 987, t0, 0.09);
      beep(ctx, 1318, t0 + 0.11, 0.12);
    };

    if (ctx.state === "suspended") {
      // resume() без жеста может не сработать сразу — пробуем и так.
      void ctx
        .resume()
        .then(play)
        .catch(() => {});
    } else {
      play();
    }
  } catch {
    /* без звука так без звука */
  }
}

function beep(ctx: AudioContext, freq: number, at: number, dur: number): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(0.12, at + 0.02);
  gain.gain.setValueAtTime(0.12, at + dur - 0.04);
  gain.gain.linearRampToValueAtTime(0, at + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(at);
  osc.stop(at + dur + 0.02);
}
