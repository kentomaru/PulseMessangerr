/**
 * Клиентские уведомления: короткий «бип» нового сообщения через WebAudio.
 *
 * AudioContext без жеста пользователя может быть приостановлен браузером —
 * тогда звук просто не прозвучит (без ошибок). Никаких внешних файлов.
 */
export function playNotifySound(): void {
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    void ctx.resume().catch(() => {});

    const beep = (freq: number, at: number, dur: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(0.07, at + 0.02);
      gain.gain.setValueAtTime(0.07, at + dur - 0.04);
      gain.gain.linearRampToValueAtTime(0, at + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(at);
      osc.stop(at + dur + 0.02);
    };

    const t0 = ctx.currentTime + 0.02;
    beep(987, t0, 0.09);
    beep(1318, t0 + 0.11, 0.12);

    // Контекст закрываем после того, как ноты отыграют
    setTimeout(() => void ctx.close().catch(() => {}), 500);
  } catch {
    /* без звука так без звука */
  }
}
