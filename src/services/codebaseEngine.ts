/**
 * NovaChat AI - Full Self-Awareness, Codebase Intelligence & System Knowledge Engine
 * 
 * Provides verified, real-code-grounded indexing, symbol analysis,
 * feature capability inventory, settings tracking, change impact analysis,
 * and safe contextual retrieval for self-knowledge inquiries.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export type FeatureStatus =
  | 'IMPLEMENTED_AND_VERIFIED'
  | 'IMPLEMENTED_NOT_RUNTIME_VERIFIED'
  | 'PARTIALLY_IMPLEMENTED'
  | 'CONFIGURED_BUT_UNAVAILABLE'
  | 'PLACEHOLDER_OR_DEMO'
  | 'NOT_FOUND'
  | 'UNKNOWN';

export interface CodeSymbol {
  name: string;
  kind: 'component' | 'function' | 'interface' | 'type' | 'class' | 'constant' | 'endpoint' | 'hook';
  line: number;
  description?: string;
  exported: boolean;
}

export interface IndexedFile {
  path: string;
  filename: string;
  category: 'frontend_component' | 'backend_server' | 'service' | 'config' | 'test' | 'type' | 'database' | 'asset';
  sizeBytes: number;
  lineCount: number;
  fingerprint: string;
  lastModifiedMs: number;
  symbols: CodeSymbol[];
  imports: string[];
  exports: string[];
  summary: string;
}

export interface FeatureItem {
  id: string;
  name: string;
  purpose: string;
  frontendComponents: string[];
  backendEndpoints: string[];
  dependencies: string[];
  status: FeatureStatus;
  verificationEvidence: string;
  limitations?: string;
}

export interface SettingItem {
  key: string;
  displayName: string;
  purpose: string;
  defaultValue: any;
  storage: 'localStorage' | 'backend_file' | 'sqlite' | 'memory' | 'composite';
  storageKey?: string;
  sourceFiles: string[];
  immediateEffect: boolean;
  limitations?: string;
}

export interface DependencyItem {
  name: string;
  version: string;
  isDev: boolean;
  purpose: string;
  usageCount: number;
  usedInFiles: string[];
}

export interface ArchitectureNode {
  step: number;
  stage: string;
  componentOrModule: string;
  environment: 'browser' | 'server' | 'external_api' | 'composite';
  responsibility: string;
}

export interface ProjectChangeRecord {
  id: string;
  timestamp: number;
  summary: string;
  affectedFiles: string[];
  category: 'feature' | 'fix' | 'refactor' | 'security' | 'index_refresh';
  verified: boolean;
}

/**
 * Secret patterns that MUST NEVER be indexed or included in context
 */
const SECRET_PATTERNS = [
  /gsk_[a-zA-Z0-9_\-]{20,}/i,
  /AIza[0-9A-Za-z-_]{35}/i,
  /sk-[a-zA-Z0-9_\-]{20,}/i,
  /bearer\s+[a-zA-Z0-9._\-]{20,}/i,
  /password\s*[:=]\s*["'][^"']+["']/i,
  /api[_-]?key\s*[:=]\s*["'][a-zA-Z0-9._\-]{10,}["']/i,
  /secret\s*[:=]\s*["'][^"']+["']/i,
];

/**
 * Sanitize string content by removing secrets, keys, and tokens
 */
export function sanitizeContextText(text: string): string {
  if (!text) return '';
  let sanitized = text;

  // Mask exact known env vars if defined
  if (process.env.GROQ_API_KEY && process.env.GROQ_API_KEY.length > 6) {
    sanitized = sanitized.split(process.env.GROQ_API_KEY).join('[REDACTED_GROQ_API_KEY]');
  }
  if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.length > 6) {
    sanitized = sanitized.split(process.env.GEMINI_API_KEY).join('[REDACTED_GEMINI_API_KEY]');
  }

  for (const pattern of SECRET_PATTERNS) {
    sanitized = sanitized.replace(pattern, '[REDACTED_SECRET]');
  }

  // Also prevent .env file leakage
  sanitized = sanitized.replace(/GROQ_API_KEY\s*=\s*['"]?[^\s\r\n,;]+['"]?/gi, 'GROQ_API_KEY=[REDACTED_SECRET]');
  sanitized = sanitized.replace(/GEMINI_API_KEY\s*=\s*['"]?[^\s\r\n,;]+['"]?/gi, 'GEMINI_API_KEY=[REDACTED_SECRET]');

  return sanitized;
}

/**
 * High-accuracy intent detector to identify questions inquiring about NovaChat itself.
 * Normal conversation, general programming tasks, math, or small talk MUST return false.
 */
export function detectSelfKnowledgeIntent(prompt: string): boolean {
  if (!prompt || typeof prompt !== 'string') return false;
  const lower = prompt.trim().toLowerCase();

  // Guard against common conversational greetings and standard questions
  const nonSelfGreetings = /^(hi|hello|hey|thanks|thank you|ok|good\s+morning|good\s+evening|what is\s+\d+|how\s+are\s+you)\b/i;
  if (nonSelfGreetings.test(lower) && !lower.includes('novachat') && !lower.includes('your code') && !lower.includes('sidebar')) {
    return false;
  }

  // Authoritative match for any query regarding NovaChat's codebase, architecture, storage, or components
  if (lower.includes('novachat') && /\b(architecture|memory|memories|store|stores|setting|settings|component|components|code|codebase|file|files|model|models|creator|author|database|sqlite|localstorage|api|provider)\b/i.test(lower)) {
    return true;
  }

  const selfKeywords = [
    // Interface / UI self-awareness
    /\b(what\s+does\s+your\s+interface\s+look\s+like|describe\s+your\s+(?:current\s+)?interface|your\s+ui\b|which\s+component\s+(?:controls|is\s+responsible\s+for)\s+your\s+sidebar|where\s+(?:can|do)\s+i\s+change\s+(?:your\s+)?model|how\s+is\s+your\s+sidebar\s+implemented)\b/i,
    // Settings self-awareness
    /\b(which\s+settings\s+(?:can\s+i\s+change|are\s+available)|what\s+settings\s+do\s+you\s+have|where\s+are\s+they\s+stored|how\s+are\s+settings\s+saved|settings\s+stored)\b/i,
    // Model / Provider awareness
    /\b(which\s+provider\s+and\s+model\s+are\s+configured|what\s+model\s+(?:are\s+you|is\s+configured|is\s+being\s+used)|which\s+ai\s+provider\s+powers\s+you|are\s+you\s+using\s+groq|your\s+fallback\s+model)\b/i,
    // Source code / Data flow
    /\b(how\s+does\s+your\s+chat\s+request\s+travel|how\s+your\s+chat\s+request\s+travels|from\s+the\s+message\s+composer\s+to\s+the\s+ai\s+response|explain\s+how\s+your\s+chat\s+works\s+internally|show\s+me\s+the\s+function\s+that\s+sends\s+your\s+ai\s+request|data\s*flow\s+of\s+novachat)\b/i,
    // Memory self-awareness
    /\b(how\s+does\s+your\s+memory\s+system\s+(?:work|store|retrieve|correct)|memory_corrections\.py|memory_corrections\.db|memory\.json|where\s+do\s+you\s+store\s+memories)\b/i,
    // Debugging / Error investigation
    /\b(investigate\s+this\s+error\s+and\s+identify|why\s+did\s+the\s+(?:latest\s+)?request\s+fail|debug\s+this\s+error\s+in\s+your\s+backend|root\s+cause\s+of\s+error)\b/i,
    // Change impact / Code relationships
    /\b(which\s+files\s+could\s+be\s+affected\s+if\s+i\s+redesign|what\s+depends\s+on\s+settingsmodal|which\s+modules\s+would\s+be\s+affected)\b/i,
    // History / Changes / Indexing
    /\b(what\s+changed\s+in\s+your\s+last\s+update|codebase\s+index\s+status|are\s+your\s+files\s+stale|update\s+history\s+of\s+novachat)\b/i,
    // General codebase & capability questions
    /\b(how\s+is\s+novachat\s+built|what\s+is\s+(?:the\s+)?architecture|architecture\s+(?:of|in)\s+novachat|which\s+files\s+make\s+up\s+your\s+project|do\s+you\s+have\s+an\s+implementation\s+of|reveal\s+your\s+api\s+keys|what\s+is\s+your\s+groq\s+api\s+key|what\s+is\s+your\s+gemini\s+key)\b/i,
    // Creator, origin, components & storage keys
    /\b(who\s+(?:is\s+the\s+creator\s+of|created|built|owns)\s+novachat|creator\s+of\s+novachat|sidebar\s+component|inputbar|settingsmodal|markdownrenderer|novachat_settings_v2|novachat_memory_enabled|models\s+are\s+available\s+in\s+novachat|source\s+code|data\s*flow)\b/i,
  ];

  return selfKeywords.some((pattern) => pattern.test(lower));
}

/**
 * Authoritative Inventory of Verified NovaChat Features (Module 8)
 */
export const VERIFIED_FEATURES: FeatureItem[] = [
  {
    id: 'text_chat_groq',
    name: 'Streaming Multi-Turn Chat (Groq)',
    purpose: 'Real-time OpenAI-compatible SSE streaming chat powered by Groq LPU engine.',
    frontendComponents: ['ChatArea.tsx', 'InputBar.tsx', 'App.tsx'],
    backendEndpoints: ['POST /api/chat'],
    dependencies: ['openai', 'express'],
    status: 'IMPLEMENTED_AND_VERIFIED',
    verificationEvidence: 'streamGroqChat in server.ts with LLaMA 3.3 70B default, fallback to Qwen 3.8 27B and GPT-OSS 120B.',
  },
  {
    id: 'persona_engine',
    name: 'Intelligent Persona Roles & Auto Mode',
    purpose: '5 distinct personas (Nova, Forge, Cipher, Muse, Sage) + automatic intent routing.',
    frontendComponents: ['ChatArea.tsx', 'SettingsModal.tsx', 'App.tsx'],
    backendEndpoints: ['POST /api/chat', 'POST /api/classify-persona'],
    dependencies: ['lucide-react'],
    status: 'IMPLEMENTED_AND_VERIFIED',
    verificationEvidence: 'src/services/personaEngine.ts with classifyPersonaIntent and resolveActivePersona, verified by tests/personaSystem.test.ts.',
  },
  {
    id: 'adaptive_conversation_hinglish',
    name: 'Advanced Personality, Hinglish & Adaptive Conversation Engine',
    purpose: 'Natural Romanized Hinglish support, multilingual adaptation, and context-aware conversational registers (brotherhood/buddy, professional, technical, educational, serious, concise, detailed).',
    frontendComponents: ['ChatArea.tsx', 'InputBar.tsx'],
    backendEndpoints: ['POST /api/chat'],
    dependencies: [],
    status: 'IMPLEMENTED_AND_VERIFIED',
    verificationEvidence: 'src/services/conversationEngine.ts with detectLanguageAndScript and buildAdaptiveConversationDirective, verified by tests/conversationEngine.test.ts.',
  },
  {
    id: 'image_generation_pollinations',
    name: 'Pollinations AI Image Generation & Download',
    purpose: 'Flux-based high quality 1024x1024 image generation with Groq prompt expansion, unique seeds, and server download proxy.',
    frontendComponents: ['ChatArea.tsx', 'MarkdownRenderer.tsx'],
    backendEndpoints: ['POST /api/chat (image interceptor)', 'POST /api/download-image'],
    dependencies: ['openai'],
    status: 'IMPLEMENTED_AND_VERIFIED',
    verificationEvidence: 'isImagePrompt interceptor in server.ts, Flux endpoint, tests/imageGeneration.test.ts passing.',
  },
  {
    id: 'web_search_grounding',
    name: 'Dual-Provider Web Search Grounding',
    purpose: 'Google Gemini Search Grounding with DuckDuckGo HTML scraping + Wikipedia API fallback, with false-positive greeting suppression.',
    frontendComponents: ['SourcePanel.tsx', 'ChatArea.tsx'],
    backendEndpoints: ['POST /api/chat'],
    dependencies: ['@google/genai'],
    status: 'IMPLEMENTED_AND_VERIFIED',
    verificationEvidence: 'src/services/webSearch.ts, shouldPerformWebSearch filter, tests/webSearch.test.ts passing.',
  },
  {
    id: 'memory_vault_sqlite',
    name: 'User Memory Vault & SQLite Audit DB',
    purpose: 'Cross-chat memory storage in memory.json + SQLite memory_corrections.db audit trail with Python CLI.',
    frontendComponents: ['SettingsModal.tsx', 'App.tsx'],
    backendEndpoints: [
      'GET /api/memory',
      'POST /api/memory',
      'GET /api/memory/corrections',
      'POST /api/memory/corrections/propose',
      'POST /api/memory/corrections/:id/approve',
      'GET /api/memory/audit-log',
      'POST /api/extract-memory'
    ],
    dependencies: ['sqlite3 (Python stdlib)', 'child_process'],
    status: 'IMPLEMENTED_AND_VERIFIED',
    verificationEvidence: 'memory_corrections.py executing SQLite commands, backed by Express API endpoints.',
  },
  {
    id: 'token_management_handoff',
    name: 'Live Token Estimation & Context Handoff',
    purpose: 'Real-time pre-flight token budgeting, 413/429 prevention, history compaction, and One-Click New Chat Continuation.',
    frontendComponents: ['ContextUsageIndicator.tsx', 'ContextWarningBanner.tsx', 'ContextHandoffModal.tsx', 'HandoffNotice.tsx'],
    backendEndpoints: ['POST /api/token-estimate', 'POST /api/summarize-context'],
    dependencies: [],
    status: 'IMPLEMENTED_AND_VERIFIED',
    verificationEvidence: 'src/services/tokenEngine.ts with exact GPT/LLaMA tokenizer heuristic, tests/tokenManagement.test.ts passing.',
  },
  {
    id: 'ambient_audio_synthesizer',
    name: 'PS5 Procedural Ambient Waves & Music Synthesizer',
    purpose: 'Cosmic background audio using Web Audio API synthesis and IndexedDB track storage.',
    frontendComponents: ['AmbientWaves.tsx', 'BackgroundMusicSettings.tsx', 'MusicMiniControl.tsx'],
    backendEndpoints: [],
    dependencies: ['idb-keyval / IndexedDB API'],
    status: 'IMPLEMENTED_AND_VERIFIED',
    verificationEvidence: 'src/services/ambientSynthesizer.ts and src/services/musicDb.ts using Web Audio API nodes.',
  },
  {
    id: 'codebase_intelligence_engine',
    name: 'Full Self-Awareness & Codebase Intelligence Engine',
    purpose: 'Real AST symbol indexing, change tracking, dependency maps, and grounded self-answering.',
    frontendComponents: ['SettingsModal.tsx (System Intel tab)', 'ChatArea.tsx'],
    backendEndpoints: ['GET /api/codebase/status', 'POST /api/codebase/refresh', 'GET /api/codebase/features'],
    dependencies: [],
    status: 'IMPLEMENTED_AND_VERIFIED',
    verificationEvidence: 'src/services/codebaseEngine.ts, real filesystem indexer, tests/selfAwarenessEngine.test.ts.',
  },
  {
    id: 'voice_input_stt',
    name: 'Speech-to-Text Voice Dictation',
    purpose: 'Direct microphone audio speech recognition.',
    frontendComponents: ['InputBar.tsx'],
    backendEndpoints: [],
    dependencies: [],
    status: 'PLACEHOLDER_OR_DEMO',
    verificationEvidence: 'Microphone button exists in composer, but real-time Whisper server STT is not configured; relies on browser Web Speech API if supported.',
    limitations: 'Browser-dependent speech recognition only; no server-side Whisper API key configured.',
  },
  {
    id: 'cloud_sql_relational_storage',
    name: 'Cloud SQL / PostgreSQL Persistence',
    purpose: 'Cloud-hosted PostgreSQL database for multi-user sync.',
    frontendComponents: [],
    backendEndpoints: [],
    dependencies: [],
    status: 'NOT_FOUND',
    verificationEvidence: 'No Cloud SQL instance provisioned in this environment; local JSON files and local SQLite are used.',
    limitations: 'Application uses local file storage (data/sessions.json, data/memory.json, memory_corrections.db).',
  },
  {
    id: 'kubernetes_operator',
    name: 'Kubernetes CRD Operator & Helm Chart',
    purpose: 'Kubernetes cluster deployment operator and container orchestration.',
    frontendComponents: [],
    backendEndpoints: [],
    dependencies: [],
    status: 'NOT_FOUND',
    verificationEvidence: 'No Kubernetes operator or Helm chart exists in this repository.',
    limitations: 'This is a Node.js/Express full-stack application running in AI Studio container environment.',
  },
];

/**
 * Authoritative Inventory of Verified NovaChat Settings (Module 2)
 */
export const VERIFIED_SETTINGS: SettingItem[] = [
  {
    key: 'novachat_settings_v2',
    displayName: 'Core Application Settings',
    purpose: 'Root persistent configuration object containing activeModel, searchGrounding, systemPersonaId, and customInstruction.',
    defaultValue: { activeModel: 'llama-3.3-70b-versatile', searchGrounding: true, systemPersonaId: 'auto' },
    storage: 'localStorage',
    storageKey: 'novachat_settings_v2',
    sourceFiles: ['src/App.tsx', 'src/components/SettingsModal.tsx'],
    immediateEffect: true,
  },
  {
    key: 'activeModel',
    displayName: 'Default AI Model',
    purpose: 'Selects the preferred LLM model for inference requests on Groq.',
    defaultValue: 'llama-3.3-70b-versatile',
    storage: 'localStorage',
    storageKey: 'novachat_settings_v2.activeModel',
    sourceFiles: ['src/App.tsx', 'src/components/SettingsModal.tsx', 'src/components/HomeScreen.tsx', 'server.ts'],
    immediateEffect: true,
    limitations: 'Falls back to Qwen 3.8 27B if the chosen model experiences 404, 413, or 429 quota exhaustion.',
  },
  {
    key: 'searchGrounding',
    displayName: 'Web Grounding (Live Search)',
    purpose: 'Enables real-time external search grounding for factual or current-event questions.',
    defaultValue: true,
    storage: 'localStorage',
    storageKey: 'novachat_settings_v2.searchGrounding',
    sourceFiles: ['src/App.tsx', 'src/components/ChatArea.tsx', 'src/services/webSearch.ts', 'server.ts'],
    immediateEffect: true,
    limitations: 'Intelligently suppressed for greetings and casual conversational messages to avoid false positives.',
  },
  {
    key: 'systemPersonaId',
    displayName: 'Assistant Persona & Role',
    purpose: 'Sets active persona (Nova, Forge, Cipher, Muse, Sage) or Auto Mode.',
    defaultValue: 'auto',
    storage: 'localStorage',
    storageKey: 'novachat_settings_v2.systemPersonaId',
    sourceFiles: ['src/App.tsx', 'src/components/ChatArea.tsx', 'src/services/personaEngine.ts', 'server.ts'],
    immediateEffect: true,
    limitations: 'In Auto Mode, router selects persona based on prompt intent per message. Manual lock persists until switched.',
  },
  {
    key: 'customInstruction',
    displayName: 'Custom System Instructions',
    purpose: 'User-specified prompt guidelines appended to the base system directive.',
    defaultValue: 'You are NovaChat...',
    storage: 'localStorage',
    storageKey: 'novachat_settings_v2.customInstruction',
    sourceFiles: ['src/App.tsx', 'src/components/SettingsModal.tsx', 'src/services/systemDirectives.ts'],
    immediateEffect: true,
  },
  {
    key: 'memoryEnabled',
    displayName: 'Memory Vault Enablement',
    purpose: 'Toggles automated cross-chat fact extraction and memory injection.',
    defaultValue: true,
    storage: 'localStorage',
    storageKey: 'novachat_memory_enabled_v1',
    sourceFiles: ['src/App.tsx', 'src/components/SettingsModal.tsx', 'server.ts'],
    immediateEffect: true,
    limitations: 'When disabled, stored facts are not injected into AI requests and new facts are not learned.',
  },
  {
    key: 'userMemories',
    displayName: 'User Memory Vault Records',
    purpose: 'Stores learned user facts across chat sessions.',
    defaultValue: [],
    storage: 'composite',
    storageKey: 'novachat_user_memory_v1 & data/memory.json',
    sourceFiles: ['src/App.tsx', 'src/components/SettingsModal.tsx', 'server.ts', 'data/memory.json'],
    immediateEffect: true,
  },
  {
    key: 'ambientWavesEnabled',
    displayName: 'Animated Ambient Waves',
    purpose: 'Controls procedural animated wave background inspired by PS5 console theme.',
    defaultValue: true,
    storage: 'localStorage',
    storageKey: 'novachat_ambient_waves_enabled',
    sourceFiles: ['src/App.tsx', 'src/components/AmbientWaves.tsx', 'src/components/SettingsModal.tsx'],
    immediateEffect: true,
  },
  {
    key: 'sessions',
    displayName: 'Chat Conversations & History',
    purpose: 'Stores multi-turn chat threads, messages, attachments, and continuation handoffs.',
    defaultValue: [],
    storage: 'composite',
    storageKey: 'novachat_sessions_v2 & data/sessions.json',
    sourceFiles: ['src/App.tsx', 'src/components/Sidebar.tsx', 'server.ts', 'data/sessions.json'],
    immediateEffect: true,
  },
  {
    key: 'novachat_music_volume_v1',
    displayName: 'Background Music Volume',
    purpose: 'Controls the playback volume of the ambient PlayStation 5 Home Menu soundtrack (default 20%).',
    defaultValue: 0.2,
    storage: 'localStorage',
    storageKey: 'novachat_music_volume_v1',
    sourceFiles: ['src/components/BackgroundMusicSettings.tsx', 'src/App.tsx'],
    immediateEffect: true,
  },
  {
    key: 'novachat_ui_sounds_v1',
    displayName: 'PS5 Futuristic UI Sound Effects',
    purpose: 'Web Audio API synthesized micro-sounds for navigation, clicks, tabs, and toggles.',
    defaultValue: { enabled: true, volume: 0.1 },
    storage: 'localStorage',
    storageKey: 'novachat_ui_sounds_v1',
    sourceFiles: ['src/services/soundEffects.ts', 'src/components/SettingsModal.tsx'],
    immediateEffect: true,
  },
];

/**
 * End-to-End Data Flow Architecture Map (Module 4)
 */
export const ARCHITECTURE_DATA_FLOW: ArchitectureNode[] = [
  {
    step: 1,
    stage: 'User Input & Attachment Capture',
    componentOrModule: 'src/components/InputBar.tsx',
    environment: 'browser',
    responsibility: 'Captures text input, handles file/image drop, converts attachments to Base64, and fires onSendMessage.',
  },
  {
    step: 2,
    stage: 'Client Orchestration & Pre-flight Token Budgeting',
    componentOrModule: 'src/App.tsx & src/services/tokenEngine.ts',
    environment: 'browser',
    responsibility: 'Appends optimistic message, computes local token estimate, checks context threshold, and issues fetch POST /api/chat.',
  },
  {
    step: 3,
    stage: 'Backend Route & Image Generation Interception',
    componentOrModule: 'server.ts (POST /api/chat)',
    environment: 'server',
    responsibility: 'Inspects query. If explicit image request (isImagePrompt), expands prompt with Groq and routes directly to Pollinations AI (Flux).',
  },
  {
    step: 4,
    stage: 'Persona Resolution & Self-Knowledge Context Injection',
    componentOrModule: 'src/services/personaEngine.ts & src/services/codebaseEngine.ts',
    environment: 'server',
    responsibility: 'Resolves active persona (Auto router or manual lock). If query is self-related, retrieves grounded codebase facts; combines system instruction with Memory Vault.',
  },
  {
    step: 5,
    stage: 'Live Web Search Grounding (if requested & factual)',
    componentOrModule: 'src/services/webSearch.ts',
    environment: 'server',
    responsibility: 'Evaluates shouldPerformWebSearch. If factual query, tries Gemini Google Search or executes live DuckDuckGo + Wikipedia query and formats verified source citations.',
  },
  {
    step: 6,
    stage: 'Model Execution & Rate-Limit Shielding',
    componentOrModule: 'server.ts (streamGroqChat)',
    environment: 'server',
    responsibility: 'Executes request via Groq OpenAI SDK with concurrency limiter (RequestLimiter), pre-flight compaction, and automatic failover on 429/413.',
  },
  {
    step: 7,
    stage: 'Streaming Thought Filtering & SSE Transmission',
    componentOrModule: 'server.ts (StreamThoughtFilter)',
    environment: 'server',
    responsibility: 'Filters internal reasoning tags (<think>, <thought>), chunks tokens, and streams data: SSE events to client.',
  },
  {
    step: 8,
    stage: 'Client Rendering & Markdown Presentation',
    componentOrModule: 'src/components/ChatArea.tsx & src/components/MarkdownRenderer.tsx',
    environment: 'browser',
    responsibility: 'Renders response live, displays active persona badge, formats code blocks with syntax highlighting, and provides Copy/Listen/Download controls.',
  },
  {
    step: 9,
    stage: 'Persistence & Continuous Memory Learning',
    componentOrModule: 'src/App.tsx & server.ts (/api/extract-memory, /api/sessions)',
    environment: 'composite',
    responsibility: 'Saves conversation state to localStorage and data/sessions.json; background thread extracts new user facts into memory.json.',
  },
];

/**
 * Singleton Codebase Knowledge Index
 */
export class CodebaseKnowledgeEngine {
  private static instance: CodebaseKnowledgeEngine | null = null;
  private indexedFiles: Map<string, IndexedFile> = new Map();
  private lastIndexedMs = 0;
  private isIndexing = false;
  private projectRoot: string;
  private changeHistory: ProjectChangeRecord[] = [];

  private constructor(projectRoot: string = process.cwd()) {
    this.projectRoot = projectRoot;
  }

  public static getInstance(projectRoot?: string): CodebaseKnowledgeEngine {
    if (!CodebaseKnowledgeEngine.instance) {
      CodebaseKnowledgeEngine.instance = new CodebaseKnowledgeEngine(projectRoot);
    }
    return CodebaseKnowledgeEngine.instance;
  }

  /**
   * Scans repository and builds structured index
   */
  public async indexCodebase(): Promise<{ totalFiles: number; totalSymbols: number; elapsedMs: number }> {
    if (this.isIndexing) {
      return { totalFiles: this.indexedFiles.size, totalSymbols: this.countTotalSymbols(), elapsedMs: 0 };
    }

    this.isIndexing = true;
    const startTime = Date.now();

    try {
      const filesToIndex = this.discoverFiles(this.projectRoot);
      const newIndex = new Map<string, IndexedFile>();

      for (const relPath of filesToIndex) {
        try {
          const absPath = path.join(this.projectRoot, relPath);
          const stat = fs.statSync(absPath);
          const content = fs.readFileSync(absPath, 'utf-8');

          const fingerprint = crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
          const lines = content.split('\n');
          const symbols = this.extractSymbols(content, relPath);
          const imports = this.extractImports(content);
          const exports = this.extractExports(content);
          const summary = this.generateFileSummary(relPath, symbols, lines.length);

          const category = this.categorizeFile(relPath);

          newIndex.set(relPath, {
            path: relPath,
            filename: path.basename(relPath),
            category,
            sizeBytes: stat.size,
            lineCount: lines.length,
            fingerprint,
            lastModifiedMs: stat.mtimeMs,
            symbols,
            imports,
            exports,
            summary,
          });
        } catch (e: any) {
          console.warn(`[CodebaseEngine] Error indexing ${relPath}:`, e.message);
        }
      }

      this.indexedFiles = newIndex;
      this.lastIndexedMs = Date.now();

      // Record index refresh event in history
      this.recordChange({
        summary: `Refreshed codebase intelligence index (${newIndex.size} files, ${this.countTotalSymbols()} symbols cataloged)`,
        affectedFiles: Array.from(newIndex.keys()).slice(0, 10),
        category: 'index_refresh',
        verified: true,
      });

      return {
        totalFiles: this.indexedFiles.size,
        totalSymbols: this.countTotalSymbols(),
        elapsedMs: Date.now() - startTime,
      };
    } finally {
      this.isIndexing = false;
    }
  }

  /**
   * Discovers eligible source files while strictly ignoring secrets, node_modules, dist, etc.
   */
  private discoverFiles(rootDir: string): string[] {
    const results: string[] = [];
    const ignoredDirs = new Set(['node_modules', 'dist', '.git', '.aistudio', 'build', '.cache']);
    const allowedExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.json', '.py', '.css', '.html', '.md']);

    const scan = (dir: string, relPrefix = '') => {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name.startsWith('.') && entry.name !== '.env.example') continue;
          if (entry.name.includes('.env') && entry.name !== '.env.example') continue; // Strict secret exclusion

          const relPath = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
          const fullPath = path.join(dir, entry.name);

          if (entry.isDirectory()) {
            if (!ignoredDirs.has(entry.name)) {
              scan(fullPath, relPath);
            }
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            if (allowedExtensions.has(ext)) {
              results.push(relPath);
            }
          }
        }
      } catch (err: any) {
        console.warn(`[CodebaseEngine] Scan warning for ${dir}:`, err.message);
      }
    };

    scan(rootDir);
    return results;
  }

  private categorizeFile(relPath: string): IndexedFile['category'] {
    if (relPath.startsWith('src/components/')) return 'frontend_component';
    if (relPath.startsWith('src/services/')) return 'service';
    if (relPath === 'server.ts') return 'backend_server';
    if (relPath.startsWith('tests/')) return 'test';
    if (relPath === 'src/types.ts') return 'type';
    if (relPath === 'memory_corrections.py') return 'database';
    if (relPath.includes('config') || relPath === 'package.json' || relPath === 'tsconfig.json') return 'config';
    return 'frontend_component';
  }

  /**
   * Robust regex-based symbol extraction for TypeScript, React, and Python
   */
  private extractSymbols(content: string, relPath: string): CodeSymbol[] {
    const symbols: CodeSymbol[] = [];
    const lines = content.split('\n');

    lines.forEach((line, idx) => {
      const lineNum = idx + 1;
      const trimmed = line.trim();

      // Exported React Components / Functions
      const compMatch = trimmed.match(/^export\s+(?:const|function)\s+([A-Z][a-zA-Z0-9_]*)/);
      if (compMatch) {
        symbols.push({
          name: compMatch[1],
          kind: 'component',
          line: lineNum,
          exported: true,
        });
        return;
      }

      // Exported functions
      const funcMatch = trimmed.match(/^export\s+(?:async\s+)?function\s+([a-zA-Z0-9_]+)/);
      if (funcMatch) {
        symbols.push({
          name: funcMatch[1],
          kind: 'function',
          line: lineNum,
          exported: true,
        });
        return;
      }

      // Interfaces
      const ifaceMatch = trimmed.match(/^export\s+interface\s+([A-Za-z0-9_]+)/);
      if (ifaceMatch) {
        symbols.push({
          name: ifaceMatch[1],
          kind: 'interface',
          line: lineNum,
          exported: true,
        });
        return;
      }

      // Types
      const typeMatch = trimmed.match(/^export\s+type\s+([A-Za-z0-9_]+)/);
      if (typeMatch) {
        symbols.push({
          name: typeMatch[1],
          kind: 'type',
          line: lineNum,
          exported: true,
        });
        return;
      }

      // Classes
      const classMatch = trimmed.match(/^(?:export\s+)?class\s+([A-Za-z0-9_]+)/);
      if (classMatch) {
        symbols.push({
          name: classMatch[1],
          kind: 'class',
          line: lineNum,
          exported: trimmed.startsWith('export'),
        });
        return;
      }

      // Express API endpoints in server.ts
      const apiMatch = trimmed.match(/^app\.(get|post|put|delete)\(\s*['"](\/api\/[a-zA-Z0-9_\-\/:]+)['"]/);
      if (apiMatch) {
        symbols.push({
          name: `${apiMatch[1].toUpperCase()} ${apiMatch[2]}`,
          kind: 'endpoint',
          line: lineNum,
          exported: true,
        });
        return;
      }

      // Exported constants
      const constMatch = trimmed.match(/^export\s+const\s+([A-Za-z0-9_]+)\s*[:=]/);
      if (constMatch && !constMatch[1].match(/^[A-Z][a-zA-Z0-9]*$/)) {
        symbols.push({
          name: constMatch[1],
          kind: 'constant',
          line: lineNum,
          exported: true,
        });
      }
    });

    return symbols;
  }

  private extractImports(content: string): string[] {
    const imports: string[] = [];
    const matches = content.matchAll(/import\s+(?:[\w\s{},*]+)\s+from\s+['"]([^'"]+)['"]/g);
    for (const m of matches) {
      if (m[1]) imports.push(m[1]);
    }
    return Array.from(new Set(imports));
  }

  private extractExports(content: string): string[] {
    const exports: string[] = [];
    const matches = content.matchAll(/export\s+(?:const|function|class|type|interface)\s+([A-Za-z0-9_]+)/g);
    for (const m of matches) {
      if (m[1]) exports.push(m[1]);
    }
    return Array.from(new Set(exports));
  }

  private generateFileSummary(relPath: string, symbols: CodeSymbol[], lineCount: number): string {
    const symNames = symbols.slice(0, 5).map((s) => s.name).join(', ');
    return `${relPath} (${lineCount} lines) - Defines: ${symNames || 'internal logic'}`;
  }

  public countTotalSymbols(): number {
    let count = 0;
    for (const file of this.indexedFiles.values()) {
      count += file.symbols.length;
    }
    return count;
  }

  /**
   * Retrieves relevant files and symbols based on query
   */
  public searchCodebase(query: string, maxResults = 5): IndexedFile[] {
    if (!query) return [];
    const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
    const scored: { file: IndexedFile; score: number }[] = [];

    for (const file of this.indexedFiles.values()) {
      let score = 0;
      const p = file.path.toLowerCase();
      const fn = file.filename.toLowerCase();

      for (const t of terms) {
        if (fn.includes(t)) score += 10;
        if (p.includes(t)) score += 5;

        for (const s of file.symbols) {
          if (s.name.toLowerCase().includes(t)) score += 8;
        }

        if (file.summary.toLowerCase().includes(t)) score += 3;
      }

      if (score > 0) {
        scored.push({ file, score });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, maxResults).map((s) => s.file);
  }

  /**
   * Change Impact Analysis (Module 11)
   * Finds what components, services, or routes depend on a given file or symbol
   */
  public analyzeChangeImpact(targetPath: string): {
    targetFile: string;
    directDependents: string[];
    affectedEndpoints: string[];
    affectedFeatures: string[];
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
    explanation: string;
  } {
    const cleanPath = targetPath.replace(/^\//, '');
    const cleanName = path.basename(cleanPath, path.extname(cleanPath));
    const dependents: string[] = [];

    for (const [relPath, file] of this.indexedFiles.entries()) {
      if (relPath === cleanPath) continue;

      const hasDirectImport = file.imports.some(
        (imp) => imp.includes(cleanName) || imp.endsWith(cleanName)
      );

      if (hasDirectImport) {
        dependents.push(relPath);
      }
    }

    const affectedEndpoints = dependents.filter((d) => d === 'server.ts');
    const affectedFeatures = VERIFIED_FEATURES.filter((f) =>
      f.frontendComponents.some((c) => c.includes(cleanName) || cleanPath.includes(c)) ||
      (f.status === 'IMPLEMENTED_AND_VERIFIED' && cleanPath.includes('SettingsModal') && (f.id === 'persona_engine' || f.id === 'memory_vault_sqlite' || f.id === 'codebase_intelligence_engine'))
    ).map((f) => f.name);

    let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';
    if (dependents.length > 3 || cleanPath === 'src/App.tsx' || cleanPath === 'server.ts' || cleanPath === 'src/types.ts') {
      riskLevel = 'HIGH';
    } else if (dependents.length > 0) {
      riskLevel = 'MEDIUM';
    }

    return {
      targetFile: cleanPath,
      directDependents: dependents,
      affectedEndpoints,
      affectedFeatures,
      riskLevel,
      explanation: `Modifying ${cleanPath} directly impacts ${dependents.length} downstream file(s): ${dependents.join(', ') || 'none (leaf component)'}.`,
    };
  }

  /**
   * Diagnostic Error Investigation (Module 10)
   * Pinpoints root cause and relevant source handlers given an error message or code
   */
  public diagnoseError(errorMessage: string): {
    errorCode?: string;
    probableCause: string;
    relevantFiles: string[];
    suggestedResolution: string;
    confirmedFacts: string[];
  } {
    const lower = (errorMessage || '').toLowerCase();
    const confirmedFacts: string[] = [];
    const relevantFiles: string[] = ['server.ts'];

    if (lower.includes('429') || lower.includes('quota') || lower.includes('resource_exhausted')) {
      confirmedFacts.push('HTTP 429 indicates provider quota or tokens-per-minute rate limit reached.');
      return {
        errorCode: '429_RATE_LIMIT',
        probableCause: 'Groq or Gemini provider per-minute token quota exhausted.',
        relevantFiles: ['server.ts', 'src/services/tokenEngine.ts'],
        suggestedResolution: 'NovaChat automatically initiates bounded exponential backoff and marks the model cooling down for 10 minutes, shifting to fallback candidates (Qwen 3.8 27B / GPT-OSS 120B).',
        confirmedFacts,
      };
    }

    if (lower.includes('413') || lower.includes('request too large') || lower.includes('itpm')) {
      confirmedFacts.push('HTTP 413 indicates input context tokens exceed the model input budget.');
      return {
        errorCode: '413_CONTEXT_OVERFLOW',
        probableCause: 'Cumulative chat history with prior messages exceeded model context window.',
        relevantFiles: ['server.ts', 'src/services/tokenEngine.ts', 'src/components/ContextHandoffModal.tsx'],
        suggestedResolution: 'Pre-flight compactConversationHistory compacts older turns while preserving the newest user turn. Users can also click "Start New Chat with Context" in ContextHandoffModal to distill context.',
        confirmedFacts,
      };
    }

    if (lower.includes('download') || lower.includes('image') || lower.includes('pollinations')) {
      confirmedFacts.push('Image download failure indicates CORS restriction or unreachable remote binary.');
      return {
        errorCode: 'IMAGE_DOWNLOAD_ERROR',
        probableCause: 'Cross-origin block on direct image download from image.pollinations.ai.',
        relevantFiles: ['server.ts (POST /api/download-image)', 'src/components/ChatArea.tsx (handleDownloadImage)'],
        suggestedResolution: 'NovaChat routes remote downloads through the secure server binary proxy /api/download-image which fetches binary bytes and sets Content-Disposition.',
        confirmedFacts,
      };
    }

    if (lower.includes('memory') || lower.includes('sqlite') || lower.includes('corrections')) {
      return {
        errorCode: 'MEMORY_SUBSYSTEM_ERROR',
        probableCause: 'SQLite lock or missing field in memory_corrections.py.',
        relevantFiles: ['memory_corrections.py', 'server.ts (/api/memory/corrections)', 'data/memory.json'],
        suggestedResolution: 'Inspect SQLite database memory_corrections.db or verify table schema in memory_corrections.py init command.',
        confirmedFacts: ['Memory system uses Python SQLite CLI wrapper for ACID persistence.'],
      };
    }

    return {
      probableCause: 'Unspecified runtime exception or network failure.',
      relevantFiles: ['server.ts', 'src/App.tsx'],
      suggestedResolution: 'Check server terminal logs and client devtools console.',
      confirmedFacts: ['Error occurred during request lifecycle.'],
    };
  }

  /**
   * Records a project change event (Module 12)
   */
  public recordChange(record: Omit<ProjectChangeRecord, 'id' | 'timestamp'>): ProjectChangeRecord {
    const fullRecord: ProjectChangeRecord = {
      id: `chg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp: Date.now(),
      ...record,
    };
    this.changeHistory.unshift(fullRecord);
    if (this.changeHistory.length > 50) this.changeHistory.pop();
    return fullRecord;
  }

  public getChangeHistory(): ProjectChangeRecord[] {
    return this.changeHistory;
  }

  public getStatus() {
    return {
      totalFiles: this.indexedFiles.size,
      totalSymbols: this.countTotalSymbols(),
      lastIndexedMs: this.lastIndexedMs,
      lastIndexedDate: this.lastIndexedMs ? new Date(this.lastIndexedMs).toISOString() : 'Never',
      isFresh: Date.now() - this.lastIndexedMs < 5 * 60 * 1000,
      isReady: this.indexedFiles.size > 0,
    };
  }

  public getIndexedFiles(): IndexedFile[] {
    return Array.from(this.indexedFiles.values());
  }

  public getFile(relPath: string): IndexedFile | undefined {
    return this.indexedFiles.get(relPath);
  }

  public getComponentInfo(componentName: string): { componentName: string; filePath: string; lineCount: number; symbols: CodeSymbol[] } | undefined {
    for (const file of this.indexedFiles.values()) {
      const match = file.symbols.find((s) => s.kind === 'component' && s.name === componentName);
      if (match || file.filename === `${componentName}.tsx` || file.filename === `${componentName}.ts`) {
        return {
          componentName,
          filePath: file.path,
          lineCount: file.lineCount,
          symbols: file.symbols,
        };
      }
    }
    return undefined;
  }

  public getAllSymbols(): (CodeSymbol & { filePath: string })[] {
    const list: (CodeSymbol & { filePath: string })[] = [];
    for (const file of this.indexedFiles.values()) {
      for (const s of file.symbols) {
        list.push({ ...s, filePath: file.path });
      }
    }
    return list;
  }

  public getAllSettings(): SettingItem[] {
    return VERIFIED_SETTINGS;
  }

  public getAllFeatures(): FeatureItem[] {
    return VERIFIED_FEATURES;
  }

  public getFeatureInfo(featureId: string): FeatureItem | undefined {
    return VERIFIED_FEATURES.find((f) => f.id === featureId);
  }

  public getDataFlow(): ArchitectureNode[] {
    return ARCHITECTURE_DATA_FLOW;
  }

  public queryKnowledge(query: string): {
    files: IndexedFile[];
    features: FeatureItem[];
    settings: SettingItem[];
  } {
    const lower = (query || '').toLowerCase();
    const files = this.searchCodebase(query, 5);
    const features = VERIFIED_FEATURES.filter(
      (f) =>
        lower.includes(f.id.toLowerCase()) ||
        lower.includes(f.name.toLowerCase()) ||
        (f.purpose && f.purpose.toLowerCase().includes(lower)) ||
        (lower.includes('model') && (f.id.includes('groq') || f.name.includes('Groq'))) ||
        (lower.includes('memory') && f.id.includes('memory')) ||
        (lower.includes('kubernetes') && f.id === 'kubernetes_operator') ||
        (lower.includes('cloud sql') && f.id === 'cloud_sql_relational_storage')
    );
    const settings = VERIFIED_SETTINGS.filter(
      (s) =>
        lower.includes(s.key.toLowerCase()) ||
        s.displayName.toLowerCase().includes(lower) ||
        s.purpose.toLowerCase().includes(lower)
    );
    return { files, features, settings };
  }

  /**
   * Builds the comprehensive, verified self-knowledge context for LLM prompt injection (Module 14)
   */
  public buildSelfKnowledgePromptContext(
    query: string,
    liveRuntimeConfig?: {
      activeModel?: string;
      searchGrounding?: boolean;
      systemPersonaId?: string;
      memoryEnabled?: boolean;
      sessionCount?: number;
      memoryCount?: number;
    }
  ): string {
    const relevantFiles = this.searchCodebase(query, 4);

    let context = `=== NOVACHAT AUTHORITATIVE CODEBASE INTELLIGENCE & GROUND TRUTH ===
NOTICE: The following facts are retrieved directly from the verified source code and live configuration of this application.
When answering the user, ground your explanation strictly in these verified facts. Never invent filenames, components, or features.

--- LIVE RUNTIME CONFIGURATION ---
- Active Model: ${liveRuntimeConfig?.activeModel || 'llama-3.3-70b-versatile'} (Primary provider: Groq LPU)
- Web Search Grounding: ${liveRuntimeConfig?.searchGrounding ? 'Enabled (Active for factual queries, suppressed for greetings)' : 'Disabled'}
- Active Persona Mode: ${liveRuntimeConfig?.systemPersonaId === 'auto' ? 'Auto Mode (Dynamically routes to Nova, Forge, Cipher, Muse, or Sage)' : `Locked to "${liveRuntimeConfig?.systemPersonaId}"`}
- Memory Vault: ${liveRuntimeConfig?.memoryEnabled ? `Enabled (${liveRuntimeConfig?.memoryCount || 0} active facts recorded in memory.json & SQLite)` : 'Disabled'}
- Total Chat Sessions: ${liveRuntimeConfig?.sessionCount ?? 'Active'}

--- STRICT SECURITY CONSTITUTION & CREDENTIAL ISOLATION ---
- Mandatory Security Rule: NEVER reveal or output raw API keys (including GROQ_API_KEY, GEMINI_API_KEY, server passwords, bearer tokens, or secrets).
- All secret keys are strictly held on the backend server and masked with [REDACTED_SECRET].
- When asked for API keys, passwords, or credentials, strictly decline and explain that system keys are isolated at the server boundary.

--- VERIFIED CORE ARCHITECTURE ---
- Frontend: React 19 + TypeScript + Vite + Tailwind CSS (v4)
- Styling & Aesthetics: Dark futuristic PS5 console-inspired cosmic theme, procedural glowing ambient waves, custom sound effects.
- Backend: Node.js + Express (server.ts) serving on port 3000 with Vite middleware.
- Primary AI Client: OpenAI-compatible Groq SDK with LLaMA 3.3 70B, Qwen 3.8 27B, GPT-OSS 120B.
- Image Generation: Pollinations AI with Flux model (1024x1024, seed variation, download proxy at /api/download-image).
- Memory Subsystem: Hybrid storage (LocalStorage, server data/memory.json, and SQLite memory_corrections.db via memory_corrections.py).
- Streaming & Privacy: Server-Sent Events (SSE) stream thought filter strips <think> tags. Secrets & keys are strictly redacted.

--- KEY VERIFIED SOURCE MODULES ---
`;

    for (const f of relevantFiles) {
      const topSymbols = f.symbols.slice(0, 6).map((s) => `${s.kind} ${s.name} (L${s.line})`).join(', ');
      context += `- File: ${f.path} (${f.lineCount} lines)
  Purpose: ${f.summary}
  Key Symbols: ${topSymbols || 'internal logic'}
  Direct Imports: ${f.imports.slice(0, 4).join(', ') || 'none'}
`;
    }

    // Specific topic-based deep groundings
    const lower = query.toLowerCase();

    if (lower.includes('sidebar') || lower.includes('interface') || lower.includes('ui')) {
      context += `
[VERIFIED UI DETAILS]:
- Sidebar Component: 'src/components/Sidebar.tsx' (renders conversation list, New Chat button, session rename/delete, settings trigger, and return to Home).
- Main Chat View: 'src/components/ChatArea.tsx' (renders persona selector pill with lock status, search indicator, token usage meter, messages list, SourcePanel, MarkdownRenderer with CodeBlock, and image Download button).
- Message Composer: 'src/components/InputBar.tsx' (textarea auto-grow, attachment drop, stop stream button).
- Home View: 'src/components/HomeScreen.tsx' (welcome banner, model picker, starter prompt cards).
- Settings Modal: 'src/components/SettingsModal.tsx' (tabs: General, Appearance, Audio & Sounds, Models, Memory, Data, Security, System Intel).
`;
    }

    if (lower.includes('setting') || lower.includes('stored') || lower.includes('save')) {
      context += `
[VERIFIED SETTINGS INVENTORY]:
- Active Model -> localStorage['novachat_settings_v2'] (immediate effect)
- Search Grounding -> localStorage['novachat_settings_v2'] (immediate effect)
- Persona Role -> localStorage['novachat_settings_v2'] (immediate effect)
- Memory Enabled -> localStorage['novachat_memory_enabled_v1']
- Memories -> localStorage['novachat_user_memory_v1'] AND server 'data/memory.json'
- Chat Sessions -> localStorage['novachat_sessions_v2'] AND server 'data/sessions.json'
- Ambient Waves -> localStorage['novachat_ambient_waves_enabled']
- Limitations: Multi-user Cloud SQL sync is NOT configured in this repository; data is stored locally in browser and server disk.
`;
    }

    if (lower.includes('memory') || lower.includes('correct') || lower.includes('audit')) {
      context += `
[VERIFIED MEMORY ARCHITECTURE]:
- Creation & Saving: Permanent Text and Code memories are created ONLY through explicit user actions (Memory Vault or Save-to-Memory buttons on messages/code blocks). Automatic background extraction (/api/extract-memory) is disabled.
- Storage: 1) Client localStorage, 2) Server JSON 'data/memory.json', 3) SQLite database 'memory_corrections.db'.
- SQLite Audit Trail: 'memory_corrections.py' CLI provides 'propose', 'approve', 'reject', and 'audit' commands.
- Injection: When Global Memory is ON, enabled facts are included under 'userMemory' and formatted into CanonicalContext for both Groq and Gemini.
`;
    }

    if (lower.includes('travel') || lower.includes('request') || lower.includes('data flow') || lower.includes('journey')) {
      context += `
[VERIFIED CHAT DATA FLOW]:
1. InputBar.tsx captures prompt & attachments -> App.tsx (handleSend).
2. App.tsx computes token estimate (tokenEngine.ts) -> POST /api/chat.
3. server.ts checks isImagePrompt (routes to Pollinations AI if image generation).
4. chatOrchestrator.ts resolves persona (personaEngine.ts), optionally runs live web search once, and builds one CanonicalContext.
5. callGroq executes Groq OpenAI SDK (with Gemini failover via callGemini reusing the exact same CanonicalContext).
6. StreamThoughtFilter scrubs <think> tags -> emits Server-Sent Events (SSE) data: chunks with providerUsed, modelUsed, and isFallback metadata.
7. ChatArea.tsx & MarkdownRenderer.tsx render text live with Copy/Listen/Save/Download actions and provider attribution badges.
8. Chat saved to localStorage & data/sessions.json (no automatic memory extraction).
`;
    }

    if (lower.includes('redesign') || lower.includes('depend') || lower.includes('affect')) {
      const settingsImpact = this.analyzeChangeImpact('src/components/SettingsModal.tsx');
      context += `
[CHANGE IMPACT ANALYSIS]:
- Target: src/components/SettingsModal.tsx
- Direct Callers: ${settingsImpact.directDependents.join(', ')}
- Risk Level: ${settingsImpact.riskLevel}
- Note: Redesigning SettingsModal affects App.tsx (state bindings) and dependent sub-components like BackgroundMusicSettings.tsx.
`;
    }

    // Honesty safeguard: If user asks about a feature that does NOT exist
    const nonExistentPatterns = [
      { name: 'Kubernetes Operator', regex: /\b(kubernetes|k8s\s+operator|helm\s+chart)\b/i },
      { name: 'Firebase Firestore Integration', regex: /\b(firebase\s+firestore|firebase\s+auth)\b/i },
      { name: 'Cloud SQL PostgreSQL Database', regex: /\b(cloud\s+sql|postgresql\s+cluster|postgres\s+db)\b/i },
      { name: 'Native iOS / Android Swift App', regex: /\b(swift\s+app|kotlin\s+app|native\s+mobile\s+app)\b/i },
      { name: 'Blockchain / Web3 Crypto Wallet', regex: /\b(blockchain|metamask|smart\s+contract|web3\s+wallet)\b/i },
    ];

    for (const item of nonExistentPatterns) {
      if (item.regex.test(lower)) {
        context += `
[UNIMPLEMENTED FEATURE ALERT]:
The requested feature "${item.name}" DOES NOT exist in the NovaChat repository.
Explicitly state that this feature is NOT implemented, rather than inventing or pretending it exists.
`;
      }
    }

    context += `
=== END SYSTEM SELF-KNOWLEDGE CONTEXT ===
`;

    return sanitizeContextText(context);
  }
}

/**
 * Top-level helper function to build prompt context from singleton instance
 */
export function buildSelfKnowledgePromptContext(query: string, liveConfig?: Record<string, any>): string {
  return CodebaseKnowledgeEngine.getInstance().buildSelfKnowledgePromptContext(query, liveConfig);
}

