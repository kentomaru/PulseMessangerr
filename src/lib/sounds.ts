"use client";

/** Tiny WebAudio ringer — no audio assets needed. */
export class Ringer {
  private ctx: AudioContext | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private stopped = false;

  private ensureCtx() {
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor();
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  private tone(freq: number, start: number, dur: number, gainV = 0.08, type: OscillatorType = "sine") {
    const ctx = this.ensureCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    const t = ctx.currentTime + start;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(gainV, t + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  startOutgoing() {
    this.ensureCtx();
    const play = () => {
      if (this.stopped) return;
      this.tone(440, 0, 1.0, 0.055);
      this.tone(480, 0, 1.0, 0.04);
    };
    play();
    this.timer = setInterval(play, 2600);
  }

  startIncoming() {
    this.ensureCtx();
    const play = () => {
      if (this.stopped) return;
      this.tone(698, 0, 0.32, 0.09);
      this.tone(932, 0.36, 0.32, 0.09);
      this.tone(698, 0.72, 0.32, 0.09);
      this.tone(932, 1.08, 0.32, 0.09);
    };
    play();
    this.timer = setInterval(play, 2100);
  }

  connected() {
    this.stop();
    this.tone(880, 0, 0.16, 0.1, "triangle");
    this.tone(1174, 0.14, 0.22, 0.1, "triangle");
  }

  ended() {
    this.stop();
    this.tone(392, 0, 0.2, 0.09, "triangle");
    this.tone(311, 0.18, 0.36, 0.09, "triangle");
  }

  stop() {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
