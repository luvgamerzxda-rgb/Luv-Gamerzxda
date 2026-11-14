/**
 * Procedural Web Audio Ambient Soundscape Generator.
 * Synthesizes serene, PS5-inspired ambient music with zero external file dependencies.
 * Provides mathematically seamless, infinite looping with smooth volume ramps.
 */

export type AmbientSoundscapeStyle = 'cosmic-ps5' | 'starlight' | 'zen-sanctuary';

interface SoundscapeConfig {
  chords: number[][]; // Frequencies in Hz
  subBass: number;
  lfoRate: number; // Hz (slow breathing filter)
  baseFilterFreq: number;
  filterModDepth: number;
}

const SOUNDSCAPES: Record<AmbientSoundscapeStyle, SoundscapeConfig> = {
  'cosmic-ps5': {
    // Dmaj9 / Dsus2 warm floating pad: D3, A3, E4, F#4, C#5
    chords: [
      [146.83, 220.0, 329.63, 369.99, 554.37],
      [130.81, 196.0, 293.66, 392.0, 493.88], // Cmaj9 swell
    ],
    subBass: 73.42, // D2
    lfoRate: 0.08, // ~12.5s cycle
    baseFilterFreq: 520,
    filterModDepth: 220,
  },
  'starlight': {
    // Aadd9 / F#m7 tranquil night sky
    chords: [
      [110.0, 220.0, 277.18, 329.63, 440.0],
      [92.5, 185.0, 220.0, 277.18, 369.99],
    ],
    subBass: 55.0, // A1
    lfoRate: 0.05, // ~20s cycle
    baseFilterFreq: 420,
    filterModDepth: 180,
  },
  'zen-sanctuary': {
    // Fmaj7(#11) crystalline calm
    chords: [
      [174.61, 261.63, 329.63, 392.0, 493.88],
      [130.81, 196.0, 246.94, 293.66, 392.0],
    ],
    subBass: 87.31, // F2
    lfoRate: 0.06,
    baseFilterFreq: 480,
    filterModDepth: 160,
  },
};

export class AmbientSynthesizer {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private filterNode: BiquadFilterNode | null = null;
  private lfoNode: OscillatorNode | null = null;
  private activeVoices: { osc: OscillatorNode; gain: GainNode }[] = [];
  private subOsc: OscillatorNode | null = null;
  private isRunning: boolean = false;
  private currentStyle: AmbientSoundscapeStyle = 'cosmic-ps5';
  private targetVolume: number = 0.20;

  private getAudioContext(): AudioContext {
    if (!this.ctx || this.ctx.state === 'closed') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    return this.ctx;
  }

  public async start(style: AmbientSoundscapeStyle = 'cosmic-ps5', initialVolume: number = 0.20): Promise<boolean> {
    this.currentStyle = style;
    this.targetVolume = Math.max(0, Math.min(1, initialVolume));

    try {
      const ctx = this.getAudioContext();

      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      // Stop any existing voices cleanly before creating new ones
      this.stopVoices();

      const config = SOUNDSCAPES[style] || SOUNDSCAPES['cosmic-ps5'];

      // Master Gain
      const master = ctx.createGain();
      master.gain.setValueAtTime(0.001, ctx.currentTime);
      master.gain.linearRampToValueAtTime(this.targetVolume, ctx.currentTime + 1.2);
      master.connect(ctx.destination);
      this.masterGain = master;

      // Lowpass resonant filter with warm roll-off
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(config.baseFilterFreq, ctx.currentTime);
      filter.Q.setValueAtTime(1.4, ctx.currentTime);
      filter.connect(master);
      this.filterNode = filter;

      // LFO for slow breathing swells
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.frequency.setValueAtTime(config.lfoRate, ctx.currentTime);
      lfoGain.gain.setValueAtTime(config.filterModDepth, ctx.currentTime);
      lfo.connect(lfoGain);
      lfoGain.connect(filter.frequency);
      lfo.start();
      this.lfoNode = lfo;

      // Spatial stereo delay / shimmer reverb node
      const delay = ctx.createDelay();
      delay.delayTime.setValueAtTime(0.42, ctx.currentTime);
      const delayFeedback = ctx.createGain();
      delayFeedback.gain.setValueAtTime(0.35, ctx.currentTime);
      delay.connect(delayFeedback);
      delayFeedback.connect(delay);
      delay.connect(filter);

      // Polyphonic pad voices (multi-oscillator with micro-detuning)
      const chord = config.chords[0];
      chord.forEach((freq, idx) => {
        // Voice A: Soft Sine
        const oscA = ctx.createOscillator();
        oscA.type = 'sine';
        oscA.frequency.setValueAtTime(freq, ctx.currentTime);
        oscA.detune.setValueAtTime(-5 + (idx % 3) * 3, ctx.currentTime);

        const voiceGainA = ctx.createGain();
        voiceGainA.gain.setValueAtTime(0.12 / Math.sqrt(chord.length), ctx.currentTime);
        oscA.connect(voiceGainA);
        voiceGainA.connect(filter);
        voiceGainA.connect(delay);
        oscA.start();
        this.activeVoices.push({ osc: oscA, gain: voiceGainA });

        // Voice B: Warm Triangle for harmonic richness
        const oscB = ctx.createOscillator();
        oscB.type = 'triangle';
        oscB.frequency.setValueAtTime(freq, ctx.currentTime);
        oscB.detune.setValueAtTime(6 - (idx % 2) * 4, ctx.currentTime);

        const voiceGainB = ctx.createGain();
        voiceGainB.gain.setValueAtTime(0.08 / Math.sqrt(chord.length), ctx.currentTime);
        oscB.connect(voiceGainB);
        voiceGainB.connect(filter);
        oscB.start();
        this.activeVoices.push({ osc: oscB, gain: voiceGainB });
      });

      // Sub-bass grounding drone
      const sub = ctx.createOscillator();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(config.subBass, ctx.currentTime);
      const subGain = ctx.createGain();
      subGain.gain.setValueAtTime(0.18, ctx.currentTime);
      sub.connect(subGain);
      subGain.connect(master);
      sub.start();
      this.subOsc = sub;

      this.isRunning = true;
      return true;
    } catch (err) {
      console.warn('Ambient synthesizer autoplay blocked or failed to start:', err);
      this.isRunning = false;
      return false;
    }
  }

  public setVolume(volume: number, smooth: boolean = true) {
    this.targetVolume = Math.max(0, Math.min(1, volume));
    if (this.masterGain && this.ctx && this.isRunning) {
      const now = this.ctx.currentTime;
      if (smooth) {
        this.masterGain.gain.linearRampToValueAtTime(this.targetVolume, now + 0.12);
      } else {
        this.masterGain.gain.setValueAtTime(this.targetVolume, now);
      }
    }
  }

  public stop(fadeOut: boolean = true) {
    if (!this.isRunning || !this.ctx || !this.masterGain) {
      this.stopVoices();
      this.isRunning = false;
      return;
    }

    try {
      const now = this.ctx.currentTime;
      if (fadeOut) {
        this.masterGain.gain.linearRampToValueAtTime(0.0001, now + 0.35);
        setTimeout(() => {
          this.stopVoices();
          this.isRunning = false;
        }, 380);
      } else {
        this.masterGain.gain.setValueAtTime(0.0001, now);
        this.stopVoices();
        this.isRunning = false;
      }
    } catch (e) {
      this.stopVoices();
      this.isRunning = false;
    }
  }

  private stopVoices() {
    this.activeVoices.forEach(({ osc }) => {
      try {
        osc.stop();
        osc.disconnect();
      } catch {}
    });
    this.activeVoices = [];

    if (this.subOsc) {
      try {
        this.subOsc.stop();
        this.subOsc.disconnect();
      } catch {}
      this.subOsc = null;
    }

    if (this.lfoNode) {
      try {
        this.lfoNode.stop();
        this.lfoNode.disconnect();
      } catch {}
      this.lfoNode = null;
    }

    if (this.filterNode) {
      try {
        this.filterNode.disconnect();
      } catch {}
      this.filterNode = null;
    }
  }

  public getIsRunning(): boolean {
    return this.isRunning;
  }

  public getAudioContextState(): AudioContextState | 'uninitialized' {
    return this.ctx ? this.ctx.state : 'uninitialized';
  }
}
