/**
 * NovaChat AI - Web Audio Engine for Gemini Live
 * Handles 16kHz PCM capture with robust resampling, 24kHz PCM scheduled gapless playback,
 * instant interruption flushing, and dual-source AnalyserNodes for relative audio visualization.
 */

export class LiveAudioEngine {
  private inputAudioCtx: AudioContext | null = null;
  private outputAudioCtx: AudioContext | null = null;
  private micStream: MediaStream | null = null;
  private micSourceNode: MediaStreamAudioSourceNode | null = null;
  private micProcessorNode: ScriptProcessorNode | null = null;
  private micAnalyserNode: AnalyserNode | null = null;

  private outputGainNode: GainNode | null = null;
  private outputAnalyserNode: AnalyserNode | null = null;
  private nextPlayTime = 0;
  private activeSources: AudioBufferSourceNode[] = [];

  private isMuted = false;
  private isOutputMuted = false;
  private onAudioChunkReady: ((base64Pcm: string) => void) | null = null;

  constructor() {}

  /**
   * Initializes microphone capture, sets up 16kHz PCM pipeline with resampling,
   * and configures the input AnalyserNode for relative voice visualization.
   */
  public async startMicrophone(onChunk: (base64Pcm: string) => void): Promise<void> {
    this.onAudioChunkReady = onChunk;

    // 1. Request microphone stream
    this.micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    // 2. Setup Input Audio Context (attempt 16kHz, fallback to system rate)
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    try {
      this.inputAudioCtx = new AudioCtx({ sampleRate: 16000 });
    } catch {
      this.inputAudioCtx = new AudioCtx();
    }

    if (this.inputAudioCtx.state === 'suspended') {
      await this.inputAudioCtx.resume();
    }

    const actualSampleRate = this.inputAudioCtx.sampleRate;

    // 3. Setup Mic Analyser for Relative User Speech Visualization
    this.micAnalyserNode = this.inputAudioCtx.createAnalyser();
    this.micAnalyserNode.fftSize = 256;
    this.micAnalyserNode.smoothingTimeConstant = 0.8;

    this.micSourceNode = this.inputAudioCtx.createMediaStreamSource(this.micStream);
    this.micSourceNode.connect(this.micAnalyserNode);

    // 4. Capture audio chunks via ScriptProcessor with accurate resampling
    const bufferSize = 4096;
    this.micProcessorNode = this.inputAudioCtx.createScriptProcessor(bufferSize, 1, 1);

    this.micProcessorNode.onaudioprocess = (e) => {
      if (this.isMuted) return;

      const inputData = e.inputBuffer.getChannelData(0);
      let pcm16: Int16Array;

      // Accurately resample when native hardware rate is 44100, 48000, 96000, etc.
      if (actualSampleRate === 16000) {
        pcm16 = this.float32ToInt16(inputData);
      } else {
        pcm16 = this.resampleTo16kHz(inputData, actualSampleRate);
      }

      const base64 = this.arrayBufferToBase64(pcm16.buffer);
      if (this.onAudioChunkReady) {
        this.onAudioChunkReady(base64);
      }
    };

    this.micSourceNode.connect(this.micProcessorNode);
    // Connect to destination through a zero-gain node so processing continues without speaker feedback
    const zeroGain = this.inputAudioCtx.createGain();
    zeroGain.gain.value = 0;
    this.micProcessorNode.connect(zeroGain);
    zeroGain.connect(this.inputAudioCtx.destination);

    // 5. Pre-warm Output Audio Context for 24kHz Gemini Live playback
    this.ensureOutputAudioContext();
  }

  /**
   * Prepares the 24kHz output playback context & analyser node
   */
  private ensureOutputAudioContext(): void {
    if (this.outputAudioCtx && this.outputAudioCtx.state !== 'closed') {
      return;
    }

    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    try {
      this.outputAudioCtx = new AudioCtx({ sampleRate: 24000 });
    } catch {
      this.outputAudioCtx = new AudioCtx();
    }

    this.outputGainNode = this.outputAudioCtx.createGain();
    this.outputGainNode.gain.value = this.isOutputMuted ? 0 : 1;

    this.outputAnalyserNode = this.outputAudioCtx.createAnalyser();
    this.outputAnalyserNode.fftSize = 256;
    this.outputAnalyserNode.smoothingTimeConstant = 0.85;

    this.outputGainNode.connect(this.outputAnalyserNode);
    this.outputAnalyserNode.connect(this.outputAudioCtx.destination);
    this.nextPlayTime = this.outputAudioCtx.currentTime;
  }

  /**
   * Schedules an incoming 24kHz PCM chunk from Gemini Live for gapless playback.
   */
  public playAiAudioChunk(base64Pcm: string): void {
    if (this.isOutputMuted) return;
    this.ensureOutputAudioContext();

    if (!this.outputAudioCtx || !this.outputGainNode) return;

    if (this.outputAudioCtx.state === 'suspended') {
      this.outputAudioCtx.resume().catch(() => {});
    }

    try {
      const arrayBuffer = this.base64ToArrayBuffer(base64Pcm);
      const int16 = new Int16Array(arrayBuffer);
      const float32 = new Float32Array(int16.length);

      for (let i = 0; i < int16.length; i++) {
        float32[i] = int16[i] / 32768.0;
      }

      // Gemini Live model output is mono 24000Hz
      const audioBuffer = this.outputAudioCtx.createBuffer(1, float32.length, 24000);
      audioBuffer.getChannelData(0).set(float32);

      const source = this.outputAudioCtx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.outputGainNode);

      const currentTime = this.outputAudioCtx.currentTime;
      if (this.nextPlayTime < currentTime) {
        this.nextPlayTime = currentTime + 0.025; // 25ms jitter buffer
      }

      source.start(this.nextPlayTime);
      this.nextPlayTime += audioBuffer.duration;

      this.activeSources.push(source);
      source.onended = () => {
        const idx = this.activeSources.indexOf(source);
        if (idx !== -1) {
          this.activeSources.splice(idx, 1);
        }
      };
    } catch (err) {
      console.warn('[LiveAudioEngine] Chunk decode error:', err);
    }
  }

  /**
   * Speech Interruption: Immediately stops active source nodes,
   * empties scheduled audio buffers, and halts playback immediately.
   */
  public flushPlayback(): void {
    for (const src of this.activeSources) {
      try {
        src.stop();
        src.disconnect();
      } catch {}
    }
    this.activeSources = [];
    if (this.outputAudioCtx) {
      this.nextPlayTime = this.outputAudioCtx.currentTime;
    }
  }

  public setMuted(muted: boolean): void {
    this.isMuted = muted;
  }

  public setOutputMuted(muted: boolean): void {
    this.isOutputMuted = muted;
    if (this.outputGainNode && this.outputAudioCtx) {
      this.outputGainNode.gain.setValueAtTime(
        muted ? 0 : 1,
        this.outputAudioCtx.currentTime
      );
    }
  }

  /**
   * Retrieves relative RMS amplitude (0 to 1) and byte frequency data
   * for driving visual waveforms smoothly without claiming physical sound measurement.
   */
  public getLiveMetrics(): {
    userVolume: number;
    aiVolume: number;
    userFreq: Uint8Array;
    aiFreq: Uint8Array;
  } {
    const userFreq = new Uint8Array(128);
    const aiFreq = new Uint8Array(128);

    let userVolume = 0;
    let aiVolume = 0;

    if (this.micAnalyserNode && !this.isMuted) {
      this.micAnalyserNode.getByteFrequencyData(userFreq);
      let sum = 0;
      for (let i = 0; i < userFreq.length; i++) {
        sum += userFreq[i];
      }
      userVolume = Math.min(1, (sum / userFreq.length) / 128);
    }

    if (this.outputAnalyserNode && !this.isOutputMuted) {
      this.outputAnalyserNode.getByteFrequencyData(aiFreq);
      let sum = 0;
      for (let i = 0; i < aiFreq.length; i++) {
        sum += aiFreq[i];
      }
      aiVolume = Math.min(1, (sum / aiFreq.length) / 128);
    }

    return { userVolume, aiVolume, userFreq, aiFreq };
  }

  /**
   * Stops all streams, disconnects nodes, and releases audio resources.
   */
  public stop(): void {
    this.flushPlayback();

    if (this.micStream) {
      this.micStream.getTracks().forEach((track) => track.stop());
      this.micStream = null;
    }

    if (this.micProcessorNode) {
      this.micProcessorNode.disconnect();
      this.micProcessorNode.onaudioprocess = null;
      this.micProcessorNode = null;
    }

    if (this.micSourceNode) {
      this.micSourceNode.disconnect();
      this.micSourceNode = null;
    }

    if (this.micAnalyserNode) {
      this.micAnalyserNode.disconnect();
      this.micAnalyserNode = null;
    }

    if (this.inputAudioCtx && this.inputAudioCtx.state !== 'closed') {
      this.inputAudioCtx.close().catch(() => {});
      this.inputAudioCtx = null;
    }

    if (this.outputAudioCtx && this.outputAudioCtx.state !== 'closed') {
      this.outputAudioCtx.close().catch(() => {});
      this.outputAudioCtx = null;
    }
  }

  // --- Resampling and Binary Helpers ---

  private float32ToInt16(buffer: Float32Array): Int16Array {
    const l = buffer.length;
    const buf = new Int16Array(l);
    for (let i = 0; i < l; i++) {
      const s = Math.max(-1, Math.min(1, buffer[i]));
      buf[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return buf;
  }

  /**
   * Resamples raw audio to exactly 16000Hz using linear interpolation
   * with anti-aliasing window accumulation.
   */
  private resampleTo16kHz(sourceData: Float32Array, sourceSampleRate: number): Int16Array {
    const targetSampleRate = 16000;
    const ratio = sourceSampleRate / targetSampleRate;
    const newLength = Math.round(sourceData.length / ratio);
    const result = new Int16Array(newLength);

    for (let i = 0; i < newLength; i++) {
      const start = i * ratio;
      const end = (i + 1) * ratio;
      const startIndex = Math.floor(start);
      const endIndex = Math.min(sourceData.length, Math.ceil(end));

      let sum = 0;
      let count = 0;
      for (let j = startIndex; j < endIndex; j++) {
        sum += sourceData[j];
        count++;
      }

      const avg = count > 0 ? sum / count : 0;
      const clamped = Math.max(-1, Math.min(1, avg));
      result[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
    }

    return result;
  }

  private arrayBufferToBase64(buffer: ArrayBufferLike): string {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  /**
   * Plays actual Google-generated audio for voice preview in the voice selector gallery.
   */
  public static async playGoogleVoicePreview(base64Audio: string, mimeType = 'audio/wav'): Promise<void> {
    const binary = atob(base64Audio);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const blob = new Blob([bytes.buffer], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);

    await new Promise<void>((resolve, reject) => {
      audio.onended = () => {
        URL.revokeObjectURL(url);
        resolve();
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Audio playback failed.'));
      };
      audio.play().catch((err) => {
        URL.revokeObjectURL(url);
        reject(err);
      });
    });
  }
}
