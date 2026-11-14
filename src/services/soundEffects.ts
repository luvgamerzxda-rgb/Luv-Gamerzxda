/**
 * NovaChat AI - Console-Inspired UI Sound Effects Engine
 * Uses Web Audio API for zero-latency, high-performance, tactile interaction feedback.
 * Default volume: exactly 10% (0.10).
 * Completely independent from background music volume (20%).
 */

const STORAGE_KEY_UI_SOUNDS = 'novachat_ui_sounds_v1';

export interface UISoundSettings {
  enabled: boolean;
  volume: number; // 0.0 to 1.0 (default 0.10)
  isMuted: boolean;
}

class SoundEffectsManager {
  private ctx: AudioContext | null = null;
  private settings: UISoundSettings = {
    enabled: true,
    volume: 0.10, // 10% default as strictly required
    isMuted: false,
  };

  constructor() {
    this.loadSettings();
  }

  private loadSettings() {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY_UI_SOUNDS);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (typeof parsed.enabled === 'boolean') this.settings.enabled = parsed.enabled;
        if (typeof parsed.volume === 'number' && !isNaN(parsed.volume)) {
          this.settings.volume = Math.max(0, Math.min(1, parsed.volume));
        }
        if (typeof parsed.isMuted === 'boolean') this.settings.isMuted = parsed.isMuted;
      }
    } catch (e) {
      console.warn('Could not read UI sound settings:', e);
    }
  }

  private saveSettings() {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY_UI_SOUNDS, JSON.stringify(this.settings));
    } catch (e) {
      console.warn('Could not save UI sound settings:', e);
    }
  }

  private getAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        this.ctx = new AudioContextClass();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public getSettings(): UISoundSettings {
    return { ...this.settings };
  }

  public setEnabled(enabled: boolean) {
    this.settings.enabled = enabled;
    this.saveSettings();
  }

  public setVolume(volume: number) {
    this.settings.volume = Math.max(0, Math.min(1, volume));
    if (this.settings.isMuted && this.settings.volume > 0) {
      this.settings.isMuted = false;
    }
    this.saveSettings();
  }

  public toggleMute() {
    this.settings.isMuted = !this.settings.isMuted;
    this.saveSettings();
  }

  private getEffectiveVolume(): number {
    if (!this.settings.enabled || this.settings.isMuted) return 0;
    return Math.max(0, Math.min(1, this.settings.volume));
  }

  /**
   * Soft, subtle tactile button click
   */
  public playClick() {
    const vol = this.getEffectiveVolume();
    if (vol <= 0) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      // Soft high-frequency transient click
      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, now);
      osc.frequency.exponentialRampToValueAtTime(320, now + 0.035);

      gain.gain.setValueAtTime(vol * 0.4, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.04);
    } catch {
      // Audio policy safe
    }
  }

  /**
   * Gentle selection sound for tabs, options, cards
   */
  public playSelect() {
    const vol = this.getEffectiveVolume();
    if (vol <= 0) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      // Warm console-style harmonic chime
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.exponentialRampToValueAtTime(780, now + 0.06);

      gain.gain.setValueAtTime(vol * 0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.08);
    } catch {
      // Audio policy safe
    }
  }

  /**
   * Restrained confirmation sound for submitting messages, toggles, success
   */
  public playConfirm() {
    const vol = this.getEffectiveVolume();
    if (vol <= 0) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;

      // Two-note ascending soft chime
      [
        { freq: 587.33, start: now, dur: 0.07 }, // D5
        { freq: 880.00, start: now + 0.045, dur: 0.10 }, // A5
      ].forEach(({ freq, start, dur }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, start);

        gain.gain.setValueAtTime(vol * 0.3, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + dur);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(start);
        osc.stop(start + dur + 0.01);
      });
    } catch {
      // Audio policy safe
    }
  }

  /**
   * Soft toggle switch click
   */
  public playToggle(nextState?: boolean) {
    const vol = this.getEffectiveVolume();
    if (vol <= 0) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      const startFreq = nextState ? 440 : 660;
      const endFreq = nextState ? 660 : 440;

      osc.frequency.setValueAtTime(startFreq, now);
      osc.frequency.exponentialRampToValueAtTime(endFreq, now + 0.05);

      gain.gain.setValueAtTime(vol * 0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.06);
    } catch {
      // Audio policy safe
    }
  }

  /**
   * Quiet navigation sound
   */
  public playNav() {
    const vol = this.getEffectiveVolume();
    if (vol <= 0) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(420, now);
      osc.frequency.exponentialRampToValueAtTime(360, now + 0.04);

      gain.gain.setValueAtTime(vol * 0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.05);
    } catch {
      // Audio policy safe
    }
  }
}

export const soundEffects = new SoundEffectsManager();
