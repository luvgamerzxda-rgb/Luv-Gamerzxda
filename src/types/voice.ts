/**
 * NovaChat AI - Gemini Live Voice Conversation Type Definitions
 */

export type VoiceSessionState =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'interrupted'
  | 'reconnecting'
  | 'error'
  | 'ended';

export interface GeminiVoiceItem {
  id: string; // Exact case-sensitive Google API voice name (e.g., 'Zephyr', 'Puck')
  name: string;
  description: string; // Official Google description
  recommended?: boolean;
}

export interface LiveTranscriptItem {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: string;
  isFinal: boolean;
}

export interface LiveAudioMetrics {
  userVolume: number; // 0 to 1 relative RMS level
  aiVolume: number;   // 0 to 1 relative RMS level
  userFrequency: Uint8Array;
  aiFrequency: Uint8Array;
}
