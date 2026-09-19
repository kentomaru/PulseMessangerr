"use client";

/**
 * Настройки звука для звонков: шумоподавление, эхоподавление, автоусиление,
 * порог активации голоса (VOX) и индивидуальная громкость участников.
 * Хранятся в localStorage, применяются при захвате микрофона.
 */

export type AudioSettings = {
  /** Шумоподавление (браузерный шумодав). */
  noiseSuppression: boolean;
  /** Эхоподавление. */
  echoCancellation: boolean;
  /** Автоматическая регулировка усиления. */
  autoGainControl: boolean;
  /**
   * Порог активации голоса (чувствительность микрофона), 0–100.
   * 0 — выключено (микрофон всегда открыт); чем выше, тем тише звуки,
   * которые «проходят» к собеседникам.
   */
  voiceGate: number;
};

const SETTINGS_KEY = "pulse_audio_settings_v1";
const VOLUMES_KEY = "pulse_user_volumes_v1";

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  noiseSuppression: true,
  echoCancellation: true,
  autoGainControl: true,
  voiceGate: 0,
};

export function loadAudioSettings(): AudioSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_AUDIO_SETTINGS };
    const p = JSON.parse(raw) as Partial<AudioSettings>;
    return {
      noiseSuppression: p.noiseSuppression ?? true,
      echoCancellation: p.echoCancellation ?? true,
      autoGainControl: p.autoGainControl ?? true,
      voiceGate: typeof p.voiceGate === "number" ? Math.min(100, Math.max(0, p.voiceGate)) : 0,
    };
  } catch {
    return { ...DEFAULT_AUDIO_SETTINGS };
  }
}

export function saveAudioSettings(s: AudioSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

/** Ограничения аудио с учётом настроек — для getUserMedia. */
export function audioConstraints(): MediaTrackConstraints {
  const s = loadAudioSettings();
  return {
    noiseSuppression: s.noiseSuppression,
    echoCancellation: s.echoCancellation,
    autoGainControl: s.autoGainControl,
  };
}

/* ─────────────── индивидуальная громкость участников ─────────────── */

/** Громкость 0–100 по id пользователя (100 — по умолчанию). */
export function loadUserVolumes(): Record<string, number> {
  try {
    const raw = localStorage.getItem(VOLUMES_KEY);
    if (!raw) return {};
    const p = JSON.parse(raw) as unknown;
    if (!p || typeof p !== "object") return {};
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(p as Record<string, unknown>)) {
      if (typeof v === "number" && Number.isFinite(v)) out[k] = Math.min(150, Math.max(0, v));
    }
    return out;
  } catch {
    return {};
  }
}

export function saveUserVolume(userId: string, volume: number): void {
  try {
    const all = loadUserVolumes();
    all[userId] = volume;
    localStorage.setItem(VOLUMES_KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}
