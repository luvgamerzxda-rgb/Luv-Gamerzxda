import { GeminiVoiceItem } from '../types/voice';

/**
 * All 30 officially supported Gemini Live prebuilt voices
 * Exact case-sensitive Google GenAI API voiceName identifiers
 * and their official Google style descriptions.
 */
export const GEMINI_LIVE_VOICES: GeminiVoiceItem[] = [
  { id: 'Zephyr', name: 'Zephyr', description: 'Bright', recommended: true },
  { id: 'Puck', name: 'Puck', description: 'Impish' },
  { id: 'Kore', name: 'Kore', description: 'Firm' },
  { id: 'Fenrir', name: 'Fenrir', description: 'Excitable' },
  { id: 'Charon', name: 'Charon', description: 'Informative' },
  { id: 'Leda', name: 'Leda', description: 'Youthful' },
  { id: 'Orus', name: 'Orus', description: 'Firm' },
  { id: 'Aoede', name: 'Aoede', description: 'Breezy' },
  { id: 'Callirrhoe', name: 'Callirrhoe', description: 'Easy-going' },
  { id: 'Autonoe', name: 'Autonoe', description: 'Bright' },
  { id: 'Enceladus', name: 'Enceladus', description: 'Breathy' },
  { id: 'Iapetus', name: 'Iapetus', description: 'Casual' },
  { id: 'Umbriel', name: 'Umbriel', description: 'Easy-going' },
  { id: 'Algieba', name: 'Algieba', description: 'Smooth' },
  { id: 'Despina', name: 'Despina', description: 'Smooth' },
  { id: 'Erinome', name: 'Erinome', description: 'Clear' },
  { id: 'Algenib', name: 'Algenib', description: 'Deep' },
  { id: 'Rasalgethi', name: 'Rasalgethi', description: 'Warm' },
  { id: 'Laomedeia', name: 'Laomedeia', description: 'Upbeat' },
  { id: 'Achernar', name: 'Achernar', description: 'Crisp' },
  { id: 'Alnilam', name: 'Alnilam', description: 'Resolute' },
  { id: 'Schedar', name: 'Schedar', description: 'Even' },
  { id: 'Gacrux', name: 'Gacrux', description: 'Grounded' },
  { id: 'Pulcherrima', name: 'Pulcherrima', description: 'Vivid' },
  { id: 'Achird', name: 'Achird', description: 'Friendly' },
  { id: 'Zubenelgenubi', name: 'Zubenelgenubi', description: 'Balanced' },
  { id: 'Vindemiatrix', name: 'Vindemiatrix', description: 'Gentle' },
  { id: 'Sadachbia', name: 'Sadachbia', description: 'Engaging' },
  { id: 'Sadaltager', name: 'Sadaltager', description: 'Conversational' },
  { id: 'Sulafat', name: 'Sulafat', description: 'Lively' },
];

export const DEFAULT_GEMINI_LIVE_VOICE = 'Zephyr';
export const STORAGE_KEY_SELECTED_VOICE = 'novachat_selected_voice_v1';
