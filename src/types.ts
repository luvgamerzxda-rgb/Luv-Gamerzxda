export interface Attachment {
  id: string;
  name: string;
  type: string;
  base64: string;
  size?: number;
}

export interface GroundingSource {
  web?: {
    uri: string;
    title: string;
  };
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
  attachments?: Attachment[];
  groundingChunks?: GroundingSource[];
  webSearchQueries?: string[];
  modelUsed?: string;
  providerUsed?: 'groq' | 'gemini';
  isFallback?: boolean;
  fallbackReason?: string;
  requestId?: string;
  turnId?: string;
  isStreaming?: boolean;
  searchProvider?: string;
  searchStatus?: 'searching' | 'reading' | 'preparing' | 'done';
  statusNotice?: string;
  personaUsed?: string;
  personaName?: string;
  personaRole?: string;
  isAutoMode?: boolean;
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
  model: string;
  systemInstruction: string;
  searchGrounding: boolean;
  handoffSummary?: string;
  parentSessionId?: string;
  parentSessionTitle?: string;
  dismissedTokenWarning?: boolean;
  importedFrom?: string;
  importedAt?: number;
}

export type TokenUsageStatus = 'normal' | 'approaching' | 'high' | 'critical';

export interface TokenEstimate {
  systemTokens: number;
  memoryTokens: number;
  historyTokens: number;
  currentMessageTokens: number;
  totalInputTokens: number;
  safeBudget: number;
  maxContext: number;
  usageRatio: number;
  contextUsageRatio?: number;
  rateLimitUsageRatio?: number;
  status: TokenUsageStatus;
  model: string;
  canSafelySend: boolean;
  recommendedAction: 'none' | 'warning' | 'compact' | 'new_chat';
  explanation?: string;
}

export interface ModelTokenConfig {
  id: string;
  name: string;
  contextWindow: number;
  maxOutputReserve: number;
  itpmLimit: number;
  safeInputBudget: number;
  warningThreshold: number;
  criticalThreshold: number;
}

export interface ModelOption {
  id: string;
  name: string;
  badge: string;
  description: string;
  supportsSearch: boolean;
}

export interface PersonaOption {
  id: string;
  name: string;
  role: string;
  category?: string;
  description: string;
  instruction: string;
  iconName?: string;
  badgeColor?: string;
}

export type TextMemoryCategory =
  | 'identity'
  | 'preference'
  | 'project'
  | 'decision'
  | 'instruction'
  | 'hobby'
  | 'education'
  | 'general';

export interface UserMemoryItem {
  id: string;
  fact: string;
  category?: TextMemoryCategory;
  tags?: string[];
  pinned?: boolean;
  enabled?: boolean;
  createdAt: number;
  updatedAt?: number;
}

export interface CodeMemoryItem {
  id: string;
  title: string;
  language: string;
  projectName?: string;
  description?: string;
  tags: string[];
  code: string;
  pinned: boolean;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

export type ChatImportFormat =
  | 'novachat-json'
  | 'chatgpt-json'
  | 'claude-json'
  | 'gemini-json'
  | 'generic-json'
  | 'markdown'
  | 'text';

export interface ParsedImportConversation {
  importKey: string;
  sourceId?: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
  warnings: string[];
  fingerprint: string;
  isDuplicate: boolean;
  duplicateReason?: string;
}

export interface ChatImportParseResult {
  format: ChatImportFormat;
  formatLabel: string;
  conversations: ParsedImportConversation[];
  warnings: string[];
  totalMessages: number;
  duplicateCount: number;
}

export interface MemoryExportPayload {
  version: number;
  exportedAt: string;
  source: 'novachat';
  memories: UserMemoryItem[];
  codeMemories: CodeMemoryItem[];
}

export interface MemoryCorrection {
  id: string;
  memory_key: string;
  original_value: string;
  proposed_value: string;
  evidence: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  decided_at?: string | null;
  approved_by?: string | null;
}

export interface MemoryAuditLogEntry {
  id: string;
  correction_id: string;
  action: 'proposed' | 'approved' | 'rejected';
  actor: string;
  details: string;
  created_at: string;
}

export type MusicRepeatMode = 'repeat-one' | 'repeat-all';
export type MusicTrackType = 'default' | 'preset' | 'user';

export interface MusicTrack {
  id: string;
  name: string;
  type: MusicTrackType;
  url?: string;
  description?: string;
  size?: number;
  duration?: number;
  blobUrl?: string;
  presetStyle?: 'cosmic-ps5' | 'starlight' | 'zen-sanctuary';
  createdAt?: number;
}

export interface MusicSettings {
  enabled: boolean;
  volume: number; // 0.0 to 1.0 (default 0.20)
  isMuted: boolean;
  selectedTrackId: string;
  repeatMode: MusicRepeatMode;
}
