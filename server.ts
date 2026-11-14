import express, { type Request, type Response } from 'express';
import http from 'http';
import fs from 'fs';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFile } from 'child_process';
import OpenAI from 'openai';
import { WebSocketServer, WebSocket } from 'ws';
import { Modality } from '@google/genai';
import { GEMINI_LIVE_VOICES } from './src/constants/voices.ts';
import {
  estimateTextTokens,
  estimateFullRequestTokens,
  compactConversationHistory,
  getModelTokenConfig,
  buildHandoffSummary,
  checkSingleMessageSize,
  deduplicateMessages,
} from './src/services/tokenEngine.ts';
import {
  buildFullSystemInstruction,
  NOVACHAT_CORE_DIRECTIVES,
  NOVACHAT_DEFAULT_SYSTEM_PROMPT,
} from './src/services/systemDirectives.ts';
import {
  resolveActivePersona,
  classifyPersonaIntent,
  PERSONAS,
  AUTO_PERSONA,
} from './src/services/personaEngine.ts';
import {
  CodebaseKnowledgeEngine,
  detectSelfKnowledgeIntent,
  VERIFIED_FEATURES,
  VERIFIED_SETTINGS,
  ARCHITECTURE_DATA_FLOW,
} from './src/services/codebaseEngine.ts';
import { buildAdaptiveConversationDirective } from './src/services/conversationEngine.ts';
import { StreamTimeoutController } from './src/services/timeoutManager.ts';
import {
  PRIMARY_DEFAULT_MODEL,
  PRIMARY_MODEL_NAME,
  PRIMARY_ENGINE_LABEL,
  getModelEffortConfig,
} from './src/services/modelConfig.ts';
import {
  evaluateVerificationRequirement,
  executeAnswerVerificationPass,
} from './src/services/answerVerification.ts';
import {
  DEFAULT_FALLBACK_MODEL,
  executeCanonicalChatTurn,
  extractSubjectFromPrompt,
  isImagePrompt,
  markModelUnavailable,
  resolveModelCandidates,
} from './src/services/chatOrchestrator.ts';

dotenv.config();

// Process-level crash prevention guards to keep dev server resilient during pre-warming & restarts
process.on('uncaughtException', (err: any) => {
  // Ignore benign client socket abort errors
  if (err?.code === 'ECONNRESET' || err?.code === 'EPIPE' || err?.message?.includes('aborted')) {
    return;
  }
  console.error('[Process] Uncaught exception:', err);
});

process.on('unhandledRejection', (reason: any) => {
  if (reason?.code === 'ECONNRESET' || reason?.message?.includes('aborted')) {
    return;
  }
  console.error('[Process] Unhandled promise rejection:', reason);
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// Parse port and host from command-line arguments (--port 3000 --host 0.0.0.0) or environment
function parsePort(): number {
  const argv = process.argv;
  const portIdx = argv.indexOf('--port');
  if (portIdx !== -1 && argv[portIdx + 1]) {
    const val = parseInt(argv[portIdx + 1], 10);
    if (!isNaN(val) && val > 0) return val;
  }
  const portEq = argv.find((a) => a.startsWith('--port='));
  if (portEq) {
    const val = parseInt(portEq.split('=')[1], 10);
    if (!isNaN(val) && val > 0) return val;
  }
  if (process.env.PORT) {
    const val = parseInt(process.env.PORT, 10);
    if (!isNaN(val) && val > 0) return val;
  }
  return 3000;
}

function parseHost(): string {
  const argv = process.argv;
  const hostIdx = argv.indexOf('--host');
  if (hostIdx !== -1 && argv[hostIdx + 1]) {
    return argv[hostIdx + 1];
  }
  const hostEq = argv.find((a) => a.startsWith('--host='));
  if (hostEq) {
    return hostEq.split('=')[1];
  }
  return process.env.HOST || '0.0.0.0';
}

const PORT = parsePort();
const HOST = parseHost();

// Configurable Timeout Architecture
const PROVIDER_TIMEOUT_MS = parseInt(process.env.PROVIDER_TIMEOUT_MS || '60000', 10);
const REQUEST_CONNECT_TIMEOUT_MS = parseInt(
  process.env.REQUEST_CONNECT_TIMEOUT_MS || process.env.REQUEST_TIMEOUT_MS || '60000',
  10
);
const STREAM_IDLE_TIMEOUT_MS = parseInt(process.env.STREAM_IDLE_TIMEOUT_MS || '30000', 10);

// Initialize Codebase Intelligence & Self-Awareness Engine (deferred to not block boot)
const codebaseEngine = CodebaseKnowledgeEngine.getInstance(__dirname);
setTimeout(() => {
  codebaseEngine
    .indexCodebase()
    .then((res) => {
      console.log(`[CodebaseEngine] Initialized: ${res.totalFiles} files, ${res.totalSymbols} symbols (${res.elapsedMs}ms)`);
    })
    .catch((err) => {
      console.warn('[CodebaseEngine] Initial indexing warning:', err.message);
    });
}, 1000);

import { GoogleGenAI } from '@google/genai';
import { executeLiveWebSearch, shouldPerformWebSearch, type WebSearchPayload } from './src/services/webSearch.ts';

app.use(express.json({ limit: '30mb' }));

// Immediate root health check for container pre-warming probes
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Dynamic runtime secret resolution functions
export function getGroqApiKey(): string {
  // 1. Check primary environment variable names (direct runtime process.env read)
  const directKey = process.env.GROQ_API_KEY || process.env.GROQ_KEY || process.env.VITE_GROQ_API_KEY;
  if (directKey && typeof directKey === 'string' && directKey.trim()) {
    return directKey.trim();
  }

  // 2. Check secret mount files in /etc/secrets/ or /run/secrets/
  const secretPaths = [
    '/etc/secrets/GROQ_API_KEY',
    '/etc/secrets/groq_api_key',
    '/run/secrets/GROQ_API_KEY',
    '/run/secrets/groq_api_key',
  ];
  for (const sp of secretPaths) {
    try {
      if (fs.existsSync(sp)) {
        const val = fs.readFileSync(sp, 'utf8').trim();
        if (val) return val;
      }
    } catch {}
  }

  // 3. Fallback: reload .env if present in root
  try {
    if (fs.existsSync('.env')) {
      const parsed = dotenv.parse(fs.readFileSync('.env', 'utf8'));
      const envKey = parsed.GROQ_API_KEY || parsed.GROQ_KEY || parsed.VITE_GROQ_API_KEY;
      if (envKey && typeof envKey === 'string' && envKey.trim()) {
        process.env.GROQ_API_KEY = envKey.trim();
        return envKey.trim();
      }
    }
  } catch {}

  return '';
}

const rejectedGeminiKeys = new Set<string>();

function readConfiguredGeminiKeyCandidates(): string[] {
  const candidates: string[] = [];
  const pushUnique = (val?: string | null) => {
    if (val && typeof val === 'string') {
      const trimmed = val.trim();
      if (trimmed && !candidates.includes(trimmed)) {
        candidates.push(trimmed);
      }
    }
  };

  pushUnique(process.env.GEMINI_API_KEY);
  pushUnique(process.env.GEMINI_KEY);
  pushUnique(process.env.VITE_GEMINI_API_KEY);

  const secretPaths = [
    '/etc/secrets/GEMINI_API_KEY',
    '/etc/secrets/gemini_api_key',
    '/run/secrets/GEMINI_API_KEY',
    '/run/secrets/gemini_api_key',
  ];
  for (const sp of secretPaths) {
    try {
      if (fs.existsSync(sp)) {
        pushUnique(fs.readFileSync(sp, 'utf8'));
      }
    } catch {}
  }

  try {
    if (fs.existsSync('.env')) {
      const parsed = dotenv.parse(fs.readFileSync('.env', 'utf8'));
      pushUnique(parsed.GEMINI_API_KEY);
      pushUnique(parsed.GEMINI_KEY);
      pushUnique(parsed.VITE_GEMINI_API_KEY);
      pushUnique(parsed.NOVA_LIVE_API_KEY);
    }
  } catch {}

  pushUnique(process.env.NOVA_LIVE_API_KEY);
  for (const sp of [
    '/etc/secrets/NOVA_LIVE_API_KEY',
    '/etc/secrets/nova_live_api_key',
    '/run/secrets/NOVA_LIVE_API_KEY',
    '/run/secrets/nova_live_api_key',
  ]) {
    try {
      if (fs.existsSync(sp)) {
        pushUnique(fs.readFileSync(sp, 'utf8'));
      }
    } catch {}
  }

  return candidates;
}

export function getGeminiApiKey(): string {
  const candidates = readConfiguredGeminiKeyCandidates();
  const active = candidates.find((k) => !rejectedGeminiKeys.has(k));
  return active || candidates[0] || '';
}

export function getNovaLiveApiKey(): string {
  const directKey = process.env.NOVA_LIVE_API_KEY;
  if (directKey && typeof directKey === 'string' && directKey.trim()) {
    return directKey.trim();
  }
  const secretPaths = [
    '/etc/secrets/NOVA_LIVE_API_KEY',
    '/etc/secrets/nova_live_api_key',
    '/run/secrets/NOVA_LIVE_API_KEY',
    '/run/secrets/nova_live_api_key',
  ];
  for (const sp of secretPaths) {
    try {
      if (fs.existsSync(sp)) {
        const val = fs.readFileSync(sp, 'utf8').trim();
        if (val) return val;
      }
    } catch {}
  }
  try {
    if (fs.existsSync('.env')) {
      const parsed = dotenv.parse(fs.readFileSync('.env', 'utf8'));
      const envKey = parsed.NOVA_LIVE_API_KEY;
      if (envKey && typeof envKey === 'string' && envKey.trim()) {
        process.env.NOVA_LIVE_API_KEY = envKey.trim();
        return envKey.trim();
      }
    }
  } catch {}
  return getGeminiApiKey();
}

let cachedGroqClient: OpenAI | null = null;
let cachedGroqApiKey = '';

export function getGroqClient(): OpenAI {
  const currentKey = getGroqApiKey();
  if (!cachedGroqClient || cachedGroqApiKey !== currentKey) {
    cachedGroqApiKey = currentKey;
    cachedGroqClient = new OpenAI({
      apiKey: currentKey || 'unconfigured-groq-key',
      baseURL: 'https://api.groq.com/openai/v1',
      timeout: PROVIDER_TIMEOUT_MS,
    });
  }
  return cachedGroqClient;
}

let cachedGeminiClient: GoogleGenAI | null = null;
let cachedGeminiApiKey = '';

export function getGeminiClient(): GoogleGenAI | null {
  const currentKey = getGeminiApiKey();
  if (!currentKey) return null;
  if (!cachedGeminiClient || cachedGeminiApiKey !== currentKey) {
    cachedGeminiApiKey = currentKey;
    cachedGeminiClient = new GoogleGenAI({
      apiKey: currentKey,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
    });
  }
  return cachedGeminiClient;
}

export function rotateGeminiClientAfterAuthFailure(failedKey: string): { apiKey: string; client: GoogleGenAI | null } | null {
  if (failedKey) {
    rejectedGeminiKeys.add(failedKey.trim());
  }
  cachedGeminiClient = null;
  cachedGeminiApiKey = '';
  const nextKey = getGeminiApiKey();
  if (!nextKey || rejectedGeminiKeys.has(nextKey)) {
    return null;
  }
  return {
    apiKey: nextKey,
    client: getGeminiClient(),
  };
}

// Proxies for file-wide backwards compatibility ensuring dynamic runtime key updates
export const groq = new Proxy({} as OpenAI, {
  get(_target, prop) {
    const client = getGroqClient();
    const val = (client as any)[prop];
    return typeof val === 'function' ? val.bind(client) : val;
  },
});

export const geminiClient = new Proxy({} as GoogleGenAI, {
  get(_target, prop) {
    const client = getGeminiClient();
    if (!client) return undefined;
    const val = (client as any)[prop];
    return typeof val === 'function' ? val.bind(client) : val;
  },
});

// Canonical stream orchestration & thought filtering live in src/services/chatOrchestrator.ts.
// Helper wrapper for enhancing image prompts using Groq when available.

// API: Health / Config check
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    hasApiKey: !!getGroqApiKey(),
    hasGeminiKey: !!getGeminiApiKey(),
    provider: 'Groq (LPU) + Google Gemini',
    defaultModel: PRIMARY_DEFAULT_MODEL,
    primaryModelName: PRIMARY_MODEL_NAME,
    engineLabel: PRIMARY_ENGINE_LABEL,
    availableModels: [
      {
        id: PRIMARY_DEFAULT_MODEL,
        name: PRIMARY_MODEL_NAME,
        tag: 'Default',
        supportsSearch: true,
      },
    ],
  });
});

// API: Secure Groq Authentication & Environment Diagnostic Endpoint
// NEVER returns, logs, or leaks the raw API key.
app.get('/api/diagnostics/groq', (req: Request, res: Response) => {
  const currentKey = getGroqApiKey();
  const directEnvVal = process.env.GROQ_API_KEY || process.env.GROQ_KEY || process.env.VITE_GROQ_API_KEY;
  const isKeyConfigured = Boolean(currentKey && currentKey.length > 0);
  const isNonEmptyString = typeof currentKey === 'string' && currentKey.trim().length > 0;
  const clientInitialized = isKeyConfigured && !!getGroqClient();

  // Check possible secret file locations
  const secretPathsChecked = [
    '/etc/secrets/GROQ_API_KEY',
    '/etc/secrets/groq_api_key',
    '/run/secrets/GROQ_API_KEY',
  ];
  const hasSecretMountFile = secretPathsChecked.some((sp) => {
    try {
      return fs.existsSync(sp) && fs.statSync(sp).size > 0;
    } catch {
      return false;
    }
  });

  res.json({
    status: 'ok',
    groqApiKeyConfigured: isKeyConfigured,
    isNonEmptyString,
    clientInitialized,
    provider: 'Groq',
    configuredModel: PRIMARY_DEFAULT_MODEL,
    hasGeminiFallback: Boolean(getGeminiApiKey()),
    serverRuntime: 'Google AI Studio Node.js / Express',
    environmentCheck: {
      processEnvKeyPresent: Boolean(directEnvVal && directEnvVal.length > 0),
      processEnvKeyLength: directEnvVal ? directEnvVal.trim().length : 0,
      hasSecretMountFile,
    },
    actionRequired: isKeyConfigured
      ? 'None. GROQ_API_KEY is detected in server environment.'
      : 'GROQ_API_KEY is missing or empty. Please set GROQ_API_KEY in Google AI Studio Secrets / environment settings.',
  });
});

// API: Test Groq Authentication with configured model using existing server-side client
// Minimal test call (ping with max_tokens: 2). Never logs or exposes credentials.
app.post('/api/diagnostics/groq/test', async (req: Request, res: Response) => {
  const key = getGroqApiKey();
  if (!key) {
    return res.status(401).json({
      success: false,
      status: 401,
      error: 'GROQ_API_KEY environment variable is missing or empty.',
      diagnostic: 'Please configure GROQ_API_KEY in Google AI Studio Secrets.',
      hasGeminiFallback: Boolean(getGeminiApiKey()),
    });
  }

  try {
    const client = getGroqClient();
    const testModel = PRIMARY_DEFAULT_MODEL || 'openai/gpt-oss-120b';
    const completion = await client.chat.completions.create({
      model: testModel,
      messages: [{ role: 'user', content: 'Say OK' }],
      max_tokens: 5,
    });
    return res.json({
      success: true,
      status: 200,
      modelTested: testModel,
      responseReceived: Boolean(completion?.choices?.[0]?.message?.content),
      diagnostic: 'Groq API authentication and model invocation succeeded.',
    });
  } catch (err: any) {
    const upstreamStatus = err.status || (err.message?.includes('401') ? 401 : 500);
    const sanitizedMsg = err.message ? String(err.message).replace(/gsk_[a-zA-Z0-9_-]+/g, '[REDACTED]') : 'Groq API request failed';
    return res.status(upstreamStatus).json({
      success: false,
      status: upstreamStatus,
      error: sanitizedMsg,
      diagnostic: upstreamStatus === 401
        ? 'The GROQ_API_KEY was rejected by Groq upstream as invalid or unauthorized. Please verify the key in your Groq console.'
        : upstreamStatus === 429
        ? 'Rate limit exceeded on Groq upstream. Retry in a few moments.'
        : `Upstream Groq error (${upstreamStatus}).`,
      hasGeminiFallback: Boolean(getGeminiApiKey()),
    });
  }
});

// API: Codebase Intelligence & Indexing Status (Module 13 & 15)
app.get('/api/codebase/status', (req: Request, res: Response) => {
  res.json({
    status: codebaseEngine.getStatus(),
    featuresCount: VERIFIED_FEATURES.length,
    settingsCount: VERIFIED_SETTINGS.length,
    historyCount: codebaseEngine.getChangeHistory().length,
  });
});

// API: Refresh Codebase Index on Demand (Module 13)
app.post('/api/codebase/refresh', async (req: Request, res: Response) => {
  try {
    const result = await codebaseEngine.indexCodebase();
    res.json({
      success: true,
      result,
      status: codebaseEngine.getStatus(),
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to refresh codebase index', details: err.message });
  }
});

// API: Verified Feature Registry (Module 8)
app.get('/api/codebase/features', (req: Request, res: Response) => {
  res.json({ features: VERIFIED_FEATURES });
});

// API: Verified Settings Inventory (Module 2)
app.get('/api/codebase/settings', (req: Request, res: Response) => {
  res.json({ settings: VERIFIED_SETTINGS });
});

// API: End-to-End Architecture Data Flow (Module 4)
app.get('/api/codebase/architecture', (req: Request, res: Response) => {
  res.json({ dataFlow: ARCHITECTURE_DATA_FLOW });
});

// API: Search Codebase / Impact Analysis / Error Diagnostics (Module 5, 10, 11)
app.post('/api/codebase/query', (req: Request, res: Response) => {
  const { query, action = 'search', targetPath, errorMessage } = req.body || {};

  if (action === 'diagnose' && errorMessage) {
    const diagnosis = codebaseEngine.diagnoseError(errorMessage);
    return res.json({ diagnosis });
  }

  if (action === 'impact' && targetPath) {
    const impact = codebaseEngine.analyzeChangeImpact(targetPath);
    return res.json({ impact });
  }

  const results = codebaseEngine.searchCodebase(query || '', 10);
  return res.json({ results });
});

// API: Project Change History (Module 12)
app.get('/api/codebase/history', (req: Request, res: Response) => {
  res.json({ history: codebaseEngine.getChangeHistory() });
});

// Storage Directory Setup for Chat Sessions and Long-Term Memory
const DATA_DIR = path.resolve(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (e) {
    console.warn('Could not create data dir:', e);
  }
}
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');
const MEMORY_FILE = path.join(DATA_DIR, 'memory.json');

// API: Load persistent chat sessions
app.get('/api/sessions', (req: Request, res: Response) => {
  try {
    if (fs.existsSync(SESSIONS_FILE)) {
      const raw = fs.readFileSync(SESSIONS_FILE, 'utf-8');
      return res.json({ sessions: JSON.parse(raw) });
    }
    return res.json({ sessions: [] });
  } catch (err: any) {
    console.warn('Error reading sessions file:', err.message);
    return res.json({ sessions: [] });
  }
});

// API: Save persistent chat sessions
app.post('/api/sessions', (req: Request, res: Response) => {
  try {
    const { sessions } = req.body || {};
    if (Array.isArray(sessions)) {
      fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2), 'utf-8');
      return res.json({ status: 'saved', count: sessions.length });
    }
    return res.status(400).json({ error: 'Invalid sessions payload' });
  } catch (err: any) {
    console.error('Error saving sessions file:', err.message);
    return res.status(500).json({ error: 'Failed to save sessions' });
  }
});

// Helper: Read memory vault file safely supporting both legacy array and structured { memories, codeMemories }
const readMemoryVaultFile = (): { memories: any[]; codeMemories: any[] } => {
  try {
    if (!fs.existsSync(MEMORY_FILE)) {
      return { memories: [], codeMemories: [] };
    }
    const raw = fs.readFileSync(MEMORY_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return { memories: parsed, codeMemories: [] };
    }
    if (parsed && typeof parsed === 'object') {
      return {
        memories: Array.isArray(parsed.memories) ? parsed.memories : [],
        codeMemories: Array.isArray(parsed.codeMemories) ? parsed.codeMemories : [],
      };
    }
    return { memories: [], codeMemories: [] };
  } catch {
    return { memories: [], codeMemories: [] };
  }
};

// API: Load cross-chat User Memory Vault (Text + Code Memories)
app.get('/api/memory', (req: Request, res: Response) => {
  try {
    const vault = readMemoryVaultFile();
    return res.json(vault);
  } catch (err: any) {
    console.warn('Error reading memory file:', err.message);
    return res.json({ memories: [], codeMemories: [] });
  }
});

// API: Save cross-chat User Memory Vault (Text + Code Memories)
app.post('/api/memory', (req: Request, res: Response) => {
  try {
    const { memories, codeMemories } = req.body || {};
    if (memories !== undefined && !Array.isArray(memories)) {
      return res.status(400).json({ error: 'Invalid memories payload' });
    }
    if (codeMemories !== undefined && !Array.isArray(codeMemories)) {
      return res.status(400).json({ error: 'Invalid codeMemories payload' });
    }
    if (memories === undefined && codeMemories === undefined) {
      return res.status(400).json({ error: 'Invalid memory payload' });
    }

    const existing = readMemoryVaultFile();
    const nextVault = {
      memories: Array.isArray(memories) ? memories : existing.memories,
      codeMemories: Array.isArray(codeMemories) ? codeMemories : existing.codeMemories,
    };

    fs.writeFileSync(MEMORY_FILE, JSON.stringify(nextVault, null, 2), 'utf-8');
    return res.json({
      status: 'saved',
      count: nextVault.memories.length,
      codeCount: nextVault.codeMemories.length,
    });
  } catch (err: any) {
    console.error('Error saving memory file:', err.message);
    return res.status(500).json({ error: 'Failed to save memory' });
  }
});

// Helper: Run python memory_corrections CLI command
const runMemoryScript = (args: string[]): Promise<any> => {
  return new Promise((resolve, reject) => {
    execFile('python3', [path.join(__dirname, 'memory_corrections.py'), ...args], (err, stdout, stderr) => {
      if (err) {
        return reject(new Error(stderr || err.message));
      }
      try {
        const parsed = JSON.parse(stdout.trim());
        resolve(parsed);
      } catch (parseErr) {
        resolve(stdout.trim());
      }
    });
  });
};

// API: List memory corrections
app.get('/api/memory/corrections', async (req: Request, res: Response) => {
  try {
    const corrections = await runMemoryScript(['list']);
    return res.json({ corrections: Array.isArray(corrections) ? corrections : [] });
  } catch (err: any) {
    console.warn('Error fetching memory corrections:', err.message);
    return res.status(500).json({ error: 'Failed to fetch corrections', details: err.message });
  }
});

// API: Propose a memory correction
const handleProposeCorrection = async (req: Request, res: Response) => {
  try {
    const { memory_key, original_value, proposed_value, evidence } = req.body || {};
    if (!memory_key || !original_value || !proposed_value || !evidence) {
      return res.status(400).json({ error: 'All fields (memory_key, original_value, proposed_value, evidence) are required.' });
    }
    const result = await runMemoryScript(['propose', memory_key, original_value, proposed_value, evidence]);
    return res.json(result);
  } catch (err: any) {
    console.error('Error proposing memory correction:', err.message);
    return res.status(500).json({ error: 'Failed to propose correction', details: err.message });
  }
};
app.post('/api/memory/corrections/propose', handleProposeCorrection);
app.post('/api/memory/corrections', handleProposeCorrection);

// API: Approve a memory correction
app.post('/api/memory/corrections/:id/approve', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { authorized_user, approved_by } = req.body || {};
    const actor = authorized_user || approved_by || 'User';
    const result = await runMemoryScript(['approve', id, actor]);

    // When approved, update matching memory in memory.json while preserving structured codeMemories
    try {
      if (fs.existsSync(MEMORY_FILE)) {
        const corrections: any[] = await runMemoryScript(['list']);
        const curr = corrections.find((c) => c.id === id);
        if (curr) {
          const vault = readMemoryVaultFile();
          const idx = vault.memories.findIndex((m) => (m.fact || m) === curr.original_value);
          if (idx >= 0) {
            if (typeof vault.memories[idx] === 'string') {
              vault.memories[idx] = curr.proposed_value;
            } else {
              vault.memories[idx].fact = curr.proposed_value;
              vault.memories[idx].updatedAt = Date.now();
            }
            fs.writeFileSync(MEMORY_FILE, JSON.stringify(vault, null, 2), 'utf-8');
          }
        }
      }
    } catch (e: any) {
      console.warn('Could not sync approved correction to memory.json:', e.message);
    }

    return res.json(result);
  } catch (err: any) {
    console.error('Error approving correction:', err.message);
    return res.status(500).json({ error: 'Failed to approve correction', details: err.message });
  }
});

// API: Reject a memory correction
app.post('/api/memory/corrections/:id/reject', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { authorized_user = 'User' } = req.body || {};
    const result = await runMemoryScript(['reject', id, authorized_user]);
    return res.json(result);
  } catch (err: any) {
    console.error('Error rejecting correction:', err.message);
    return res.status(500).json({ error: 'Failed to reject correction', details: err.message });
  }
});

// API: Get audit log
app.get('/api/memory/audit-log', async (req: Request, res: Response) => {
  try {
    const { correction_id } = req.query;
    const args = correction_id && typeof correction_id === 'string'
      ? ['audit', correction_id]
      : ['audit'];
    const logs = await runMemoryScript(args);
    return res.json({ audit_log: Array.isArray(logs) ? logs : [] });
  } catch (err: any) {
    console.warn('Error fetching audit log:', err.message);
    return res.status(500).json({ error: 'Failed to fetch audit log', details: err.message });
  }
});

// API: Permanent memory creation is strictly user-controlled via Save to Memory
app.post('/api/extract-memory', (_req: Request, res: Response) => {
  return res.json({
    newMemories: [],
    disabled: true,
    reason: 'Automatic hidden memory extraction is disabled; permanent memories are created only via Save to Memory.',
  });
});

// Image prompt detection & subject extraction imported from src/services/chatOrchestrator.ts

/**
 * Intelligently expands concise user image prompts into rich visual descriptions using Groq.
 * Enhances lighting, composition, textures, depth, and respects sacred traditional Hindu deity iconography.
 */
async function enhanceImagePrompt(subject: string): Promise<string> {
  if (!subject) return 'breathtaking masterpiece, highly detailed, 8k resolution, cinematic lighting';

  const lower = subject.toLowerCase();
  const isDeity = /\b(shiva|mahadev|bholenath|rudra|krishna|shree\s+krishna|radha\s+krishna|ganesh|ganesha|ganpati|ram|shree\s+ram|sita\s+ram|hanuman|bajrangbali|lakshmi|durga|saraswati|vishnu|kartikeya|parvati)\b/i.test(lower);

  try {
    if (getGroqApiKey()) {
      const systemDirective = isDeity
        ? `You are an expert art director and scholar of sacred Indian art and iconography.
Expand the user's deity request into a majestic, reverent, breathtaking visual prompt (under 60 words).
Ensure accurate traditional sacred iconography:
- If Lord Shiva: serene meditative poise on Mount Kailash, crescent moon in matted locks (Jata), river Ganga descending, holy serpent Vasuki, sacred Trishula (trident) and damru, ash-smeared skin with gentle divine blue aura, glowing Himalayan snow peaks, cinematic volumetric lighting, ethereal atmosphere, highly detailed spiritual oil painting.
- If Lord Krishna: gentle smile, peacock feather in crown, holding celestial flute (Bansuri), yellow silk pitambara, lotus eyes, divine radiance, Vrindavan Yamuna riverbank, sacred soft golden hour glow.
- If Lord Ganesha: benevolent elephant head, modak sweet, single tusk, lotus seat, golden ornaments, warm auspicious glow.
- If Lord Hanuman: devoted heroic posture, mace (Gada), radiating golden aura, mountain background, devotion and strength.
Output ONLY the raw descriptive prompt with no quotes, commentary, or conversational preamble.`
        : `You are an expert AI prompt engineer for photorealistic and cinematic image generation.
Expand the user request into a rich, vivid, descriptive visual prompt (under 60 words).
Include subject details, dynamic composition, dramatic lighting (e.g. volumetric rays, golden hour, chiaroscuro), rich textures, depth of field, atmosphere, and artistic style.
Output ONLY the raw descriptive prompt with no quotes, markdown, or preamble.`;

      const completion = await groq.chat.completions.create({
        model: 'qwen/qwen3.8-27b',
        messages: [
          { role: 'system', content: systemDirective },
          { role: 'user', content: `Expand image prompt: "${subject}"` },
        ],
        max_tokens: 120,
        temperature: 0.7,
      });

      const enhanced = completion?.choices[0]?.message?.content?.trim().replace(/^["']|["']$/g, '');
      if (enhanced && enhanced.length > 20) {
        return enhanced;
      }
    }
  } catch (err: any) {
    console.warn('[ImagePromptEnhancer] Groq expansion fallback:', err.message);
  }

  // Deterministic fallback expansion if Groq is slow or unavailable
  if (isDeity) {
    if (/\b(shiva|mahadev|bholenath)\b/i.test(lower)) {
      return `Majestic depiction of Lord Shiva in deep meditation on sacred Mount Kailash, crescent moon in matted hair, holy river Ganga flowing, serpent Vasuki around neck, holding divine Trishula and damru, ethereal blue glow, snow-capped Himalayas, cosmic starlight, highly detailed spiritual oil painting, 8k resolution, serene and divine`;
    }
    if (/\b(krishna)\b/i.test(lower)) {
      return `Divine Lord Krishna playing celestial flute under blossoming Kadamba tree, peacock feather in crown, yellow silk robes, soft lotus eyes, gentle smile, glowing Vrindavan twilight, spiritual aura, exquisite masterwork painting, 8k resolution`;
    }
    if (/\b(ganesh|ganesha)\b/i.test(lower)) {
      return `Auspicious Lord Ganesha seated on a radiant golden lotus, benevolent gentle eyes, holding sweet modak and lotus, ornate crown, warm divine illumination, intricate sacred carvings, peaceful temple ambiance, masterpiece`;
    }
    return `Reverent and divine sacred depiction of ${subject}, celestial golden aura, traditional holy iconography, ethereal atmospheric lighting, spiritual tranquility, 8k resolution masterwork`;
  }

  return `Breathtaking high-detail illustration of ${subject}, cinematic volumetric lighting, intricate textures, rich atmospheric depth, stunning color grading, 8k resolution, professional digital art masterpiece`;
}

// API: Generate short title for a conversation
app.post('/api/generate-title', async (req: Request, res: Response) => {
  try {
    const { prompt } = req.body || {};
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'Valid prompt is required.' });
    }

    if (isImagePrompt(prompt)) {
      const subject = extractSubjectFromPrompt(prompt);
      return res.json({ title: `Image: ${subject.slice(0, 24)}` });
    }

    let title = 'New Chat';
    try {
      const titleCandidate = resolveModelCandidates('llama-3.3-70b-versatile')[0] || 'qwen/qwen3.8-27b';
      let completion;
      try {
        completion = await groq.chat.completions.create({
          model: titleCandidate,
          messages: [
            {
              role: 'system',
              content: 'Generate a concise 3-5 word title summarizing the user prompt. Output ONLY the title with no markdown or quotes.',
            },
            {
              role: 'user',
              content: `Prompt: "${prompt.slice(0, 300)}"`,
            },
          ],
          max_tokens: 15,
        });
      } catch (titleModelErr: any) {
        if (titleModelErr.status === 404 || titleModelErr.message?.includes('not exist')) {
          markModelUnavailable(titleCandidate);
          completion = await groq.chat.completions.create({
            model: DEFAULT_FALLBACK_MODEL,
            messages: [
              {
                role: 'system',
                content: 'Generate a concise 3-5 word title summarizing the user prompt. Output ONLY the title with no markdown or quotes.',
              },
              {
                role: 'user',
                content: `Prompt: "${prompt.slice(0, 300)}"`,
              },
            ],
            max_tokens: 15,
          });
        } else {
          throw titleModelErr;
        }
      }

      title = completion?.choices[0]?.message?.content?.trim().replace(/^["']|["']$/g, '') || 'New Chat';
    } catch {
      title = prompt.slice(0, 25).trim() || 'New Chat';
    }

    return res.json({ title });
  } catch (err: any) {
    console.error('Error in /api/generate-title:', err);
    return res.json({ title: 'New Chat' });
  }
});

// API: Classify persona intent without executing chat
app.post('/api/classify-persona', (req: Request, res: Response) => {
  const { prompt, personaId = 'auto' } = req.body || {};
  const activePersona = resolveActivePersona(personaId, prompt || '');
  return res.json({
    personaId: activePersona.id,
    name: activePersona.name,
    role: activePersona.role,
    category: activePersona.category,
    isAuto: !personaId || personaId === 'auto',
  });
});

// API: Unified single-assistant streaming chat endpoint (Groq primary + Gemini shared-context failover)
app.post('/api/chat', async (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const reqId = 'req_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
  const controller = new AbortController();
  let timeoutController: StreamTimeoutController | null = null;

  try {
    const body = req.body || {};
    const {
      messages,
      model = PRIMARY_DEFAULT_MODEL,
      thinkMode = false,
      systemInstruction,
      customInstruction,
      handoffSummary,
      searchGrounding = false,
      memoryEnabled = true,
      userMemory = [],
      personaId = 'auto',
      sessionId,
      turnId,
    } = body;

    const isThinkMode = Boolean(thinkMode);
    const effortConfig = getModelEffortConfig(isThinkMode);

    timeoutController = new StreamTimeoutController(
      (event) => {
        if (!res.writableEnded && !res.destroyed) {
          console.warn(`[StreamLogger] [${reqId}] ${event.phase.toUpperCase()} timeout after ${event.elapsedMs}ms: ${event.message}`);
          controller.abort();
          res.write(
            `data: ${JSON.stringify({
              error: event.message,
              done: true,
              requestId: reqId,
              turnId,
              searchStatus: 'done',
            })}\n\n`
          );
          res.end();
        }
      },
      effortConfig.connectTimeoutMs,
      effortConfig.idleTimeoutMs,
      effortConfig.maxDeadlineMs
    );

    res.on('close', () => {
      controller.abort();
      timeoutController?.clear();
      const metrics = timeoutController?.getMetrics();
      console.log(
        `[StreamLogger] [${reqId}] Client connection closed (elapsed: ${metrics?.elapsedMs ?? 0}ms, chunks: ${metrics?.chunkCount ?? 0}, ttft: ${
          metrics?.ttftMs !== null && metrics?.ttftMs !== undefined ? `${metrics.ttftMs}ms` : 'N/A'
        })`
      );
    });

    if (!Array.isArray(messages) || messages.length === 0) {
      timeoutController?.clear();
      res.write(`data: ${JSON.stringify({ error: 'Messages array is required', done: true, requestId: reqId })}\n\n`);
      res.end();
      return;
    }

    const result = await executeCanonicalChatTurn(
      {
        requestId: reqId,
        sessionId,
        turnId,
        messages,
        model,
        thinkMode: isThinkMode,
        systemInstruction,
        customInstruction,
        handoffSummary,
        searchGrounding: Boolean(searchGrounding),
        memoryEnabled: memoryEnabled !== false,
        userMemory,
        personaId,
      },
      (event) => {
        if (!res.writableEnded && !res.destroyed) {
          res.write(`data: ${JSON.stringify(event)}\n\n`);
          if (event.done) {
            res.end();
          }
        }
      },
      {
        getGroqKey: getGroqApiKey,
        getGroqClient,
        getGeminiKey: getGeminiApiKey,
        getGeminiClient,
        rotateGeminiClientAfterAuthFailure,
        runWebSearch: executeLiveWebSearch,
        isSelfKnowledgeQuery: detectSelfKnowledgeIntent,
        resolveCodebaseContext: (promptText, meta) => codebaseEngine.buildSelfKnowledgePromptContext(promptText, meta),
        enhanceImagePrompt,
      },
      {
        abortSignal: controller.signal,
        timeoutController,
      }
    );

    timeoutController?.clear();
    const metrics = timeoutController?.getMetrics();
    console.log(
      `[StreamLogger] [${reqId}] Turn ${result.turnId} finished via ${result.providerUsed} (${result.modelUsed}, fallback=${result.isFallback}) in ${metrics?.elapsedMs ?? 0}ms`
    );
  } catch (err: any) {
    timeoutController?.clear();
    console.error(`[StreamLogger] [${reqId}] Error in /api/chat:`, err.message || err);
    if (!res.writableEnded && !res.destroyed) {
      res.write(
        `data: ${JSON.stringify({
          text: `⚠️ **Error:** ${err.message || 'Stream processing failed'}`,
          error: err.message || 'Stream processing failed',
          done: true,
          requestId: reqId,
        })}\n\n`
      );
      res.end();
    }
  }
});

// API: Get live token estimate and safe context budget for current conversation state
app.post('/api/token-estimate', (req: Request, res: Response) => {
  try {
    const {
      model = 'llama-3.3-70b-versatile',
      systemInstruction = '',
      userMemories = [],
      messages = [],
      pendingInput = '',
      pendingAttachments = [],
      handoffSummary = '',
    } = req.body || {};

    const estimate = estimateFullRequestTokens({
      model,
      systemInstruction,
      userMemories,
      messages,
      pendingInput,
      pendingAttachments,
      handoffSummary,
    });

    return res.json(estimate);
  } catch (err: any) {
    console.warn('Error in /api/token-estimate:', err.message);
    const fallbackConfig = getModelTokenConfig('llama-3.3-70b-versatile');
    return res.json({
      systemTokens: 400,
      memoryTokens: 0,
      historyTokens: 0,
      currentMessageTokens: 0,
      totalInputTokens: 400,
      safeBudget: fallbackConfig.safeInputBudget,
      maxContext: fallbackConfig.contextWindow,
      usageRatio: 400 / fallbackConfig.safeInputBudget,
      status: 'normal',
      model: fallbackConfig.name,
      canSafelySend: true,
      recommendedAction: 'none',
      explanation: 'Estimate completed using fallback parameters.',
    });
  }
});

// API: Generate compact structured handoff summary for "New Chat with Context"
app.post('/api/summarize-context', async (req: Request, res: Response) => {
  try {
    const { messages = [], sessionTitle = 'Previous Chat', model = 'llama-3.3-70b-versatile' } = req.body || {};

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.json({
        summary: '',
        estimatedTokens: 0,
        title: sessionTitle,
      });
    }

    // First build deterministic structured distillation
    const deterministicHandoff = buildHandoffSummary(messages, sessionTitle);

    // Optionally synthesize with fast Groq model if available
    let synthesizedSummary = deterministicHandoff;
    try {
      const summaryPrompt = `You are a context handoff specialist for NovaChat AI.
Analyze the following conversation and produce a compact, high-density structured continuation brief (under 250 words).
Retain:
1. Active user goal and core problem being solved.
2. Technical decisions made, languages, and architecture chosen.
3. Key code snippets, functions, or file names referenced.
4. Next unresolved task or immediate next question.
Do NOT repeat the whole conversation. Output ONLY clean markdown under the header "# CONTINUATION CONTEXT".

Conversation:
${messages
  .slice(-8)
  .map((m: any) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${String(m.content).slice(0, 300)}`)
  .join('\n\n')}`;

      const completion = await groq.chat.completions.create({
        model: 'qwen/qwen3.8-27b',
        messages: [{ role: 'user', content: summaryPrompt }],
        max_tokens: 350,
        temperature: 0.2,
      });

      const aiText = completion.choices[0]?.message?.content?.trim();
      if (aiText && aiText.length > 50) {
        synthesizedSummary = aiText;
      }
    } catch (e: any) {
      console.log('[SummarizeContext] Using deterministic summary fallback:', e.message);
    }

    const estimatedTokens = estimateTextTokens(synthesizedSummary);
    return res.json({
      summary: synthesizedSummary,
      estimatedTokens,
      title: sessionTitle,
    });
  } catch (err: any) {
    console.error('Error generating handoff summary:', err);
    return res.status(500).json({ error: 'Failed to generate summary', details: err.message });
  }
});

// API: Proxy image download to bypass cross-origin restrictions and force direct download to device
app.get('/api/download-image', async (req: Request, res: Response) => {
  try {
    const { url, filename } = req.query;
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'Image URL parameter is required.' });
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return res.status(400).json({ error: 'Invalid URL provided.' });
    }

    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      return res.status(400).json({ error: 'Only HTTP/HTTPS protocols are supported.' });
    }

    // Restrict proxy to trusted image hosts
    const allowed = ['image.pollinations.ai', 'pollinations.ai'];
    const isAllowed =
      allowed.some((h) => parsedUrl.hostname === h || parsedUrl.hostname.endsWith('.' + h)) ||
      parsedUrl.hostname.includes('pollinations');
    if (!isAllowed) {
      return res.status(403).json({ error: 'Host not permitted for image proxy.' });
    }

    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), 25000);

    const imageResp = await fetch(url, {
      signal: abortController.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) NovaChat/1.0',
        Accept: 'image/png,image/jpeg,image/webp,image/*;q=0.9',
      },
    });

    clearTimeout(timeout);

    if (!imageResp.ok) {
      return res.status(imageResp.status).json({
        error: `Remote provider returned HTTP ${imageResp.status}`,
      });
    }

    const contentType = imageResp.headers.get('content-type') || 'image/png';
    const buffer = await imageResp.arrayBuffer();

    // Generate safe descriptive filename e.g. novachat-lord-shiva-20261023.png
    let safeName = 'novachat-image.png';
    if (typeof filename === 'string' && filename.trim()) {
      safeName = filename.replace(/[^a-zA-Z0-9_.-]/g, '_');
      if (!safeName.endsWith('.png') && !safeName.endsWith('.jpg') && !safeName.endsWith('.webp')) {
        const ext = contentType.includes('jpeg') ? '.jpg' : contentType.includes('webp') ? '.webp' : '.png';
        safeName += ext;
      }
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.send(Buffer.from(buffer));
  } catch (err: any) {
    console.error('Error in /api/download-image:', err.message);
    return res.status(500).json({
      error: 'Failed to download image from provider.',
      details: err.message,
    });
  }
});

// In-memory audio preview cache for instant voice testing
const voicePreviewCache = new Map<string, { audio: string; mimeType: string }>();

// API: Get all 30 officially supported Gemini Live prebuilt voices
app.get('/api/live/voices', (_req: Request, res: Response) => {
  return res.json({
    voices: GEMINI_LIVE_VOICES,
    defaultVoice: 'Zephyr',
  });
});

// API: Generate real Google TTS voice preview audio
app.post('/api/live/voice-preview', async (req: Request, res: Response) => {
  try {
    const { voiceName = 'Zephyr' } = req.body || {};
    const validVoice = GEMINI_LIVE_VOICES.find((v) => v.id.toLowerCase() === String(voiceName).toLowerCase());
    const targetVoice = validVoice ? validVoice.id : 'Zephyr';

    if (voicePreviewCache.has(targetVoice)) {
      return res.json(voicePreviewCache.get(targetVoice));
    }

    const apiKey = getNovaLiveApiKey();
    if (!apiKey) {
      return res.status(503).json({ error: 'NOVA_LIVE_API_KEY / GEMINI_API_KEY is not configured on the server.' });
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    // Generate real speech audio using Google GenAI TTS (gemini-3.8-flash-lite-tts)
    const interaction: any = await ai.interactions.create({
      model: 'gemini-3.8-flash-lite-tts',
      input: `Hello! I am NovaChat's ${targetVoice} voice, ready for live conversation.`,
      response_format: { type: 'audio' },
      generation_config: {
        speech_config: [
          {
            language: 'en-US',
            voice: targetVoice,
          },
        ],
      },
    });

    const audio = interaction?.output_audio;
    if (audio?.data) {
      const result = {
        audio: audio.data,
        mimeType: audio.mime_type || 'audio/wav',
      };
      voicePreviewCache.set(targetVoice, result);
      return res.json(result);
    }

    return res.status(500).json({ error: 'No audio data returned by Google TTS model.' });
  } catch (err: any) {
    console.warn('[VoicePreview] Generation warning:', err.message);
    const msg = String(err?.message || '');
    if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
      return res.status(429).json({ error: 'Gemini usage limit reached. Please try again later.' });
    }
    if (
      msg.includes('401') ||
      msg.includes('403') ||
      msg.includes('UNAUTHENTICATED') ||
      msg.includes('API_KEY_INVALID') ||
      msg.includes('PERMISSION_DENIED')
    ) {
      return res.status(401).json({
        error: 'Gemini API key rejected (401/403). Please verify your GEMINI_API_KEY in Google AI Studio Secrets.',
      });
    }
    return res.status(500).json({ error: msg || 'Voice preview generation failed.' });
  }
});

// Mount Vite or serve static production build
async function startServer() {
  // Serve public directory for static audio and other media
  app.use(express.static(path.resolve(__dirname, 'public'), {
    maxAge: '1d',
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.mp3')) {
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Accept-Ranges', 'bytes');
      }
    }
  }));

  const httpServer = http.createServer(app);

  // Setup WebSocketServer for Gemini Live Audio Proxy (noServer: true to avoid colliding with Vite HMR)
  const liveWss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (request, socket, head) => {
    const pathname = request.url ? request.url.split('?')[0] : '';
    if (pathname === '/api/live-ws') {
      liveWss.handleUpgrade(request, socket, head, (ws) => {
        liveWss.emit('connection', ws, request);
      });
    }
    // All other upgrade requests (e.g. Vite HMR ws) are passed through to Vite's listeners untouched
  });

  liveWss.on('connection', async (clientWs: WebSocket, request: http.IncomingMessage) => {
    console.log('[LiveWS] Client connected for Gemini Live voice session.');
    const reqUrl = new URL(request.url || '', `http://${request.headers.host || 'localhost'}`);
    const voiceParam = reqUrl.searchParams.get('voice') || 'Zephyr';
    const resumeParam = reqUrl.searchParams.get('resume');

    // Validate voice name against official list
    const matchedVoice = GEMINI_LIVE_VOICES.find((v) => v.id.toLowerCase() === voiceParam.toLowerCase());
    const selectedVoiceName = matchedVoice ? matchedVoice.id : 'Zephyr';

    const apiKey = getNovaLiveApiKey();
    if (!apiKey) {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(
          JSON.stringify({
            error: 'NOVA_LIVE_API_KEY / GEMINI_API_KEY environment variable is missing on the server.',
          })
        );
      }
      clientWs.close();
      return;
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const liveSystemPrompt = `${NOVACHAT_DEFAULT_SYSTEM_PROMPT}

${NOVACHAT_CORE_DIRECTIVES}

=== NOVACHAT LIVE REAL-TIME VOICE DIRECTIVES ===
You are NovaChat AI speaking in real-time continuous voice mode.
- Speak naturally, warmly, clearly, and conversationally.
- Never output markdown code blocks, tables, raw URLs, or formatting artifacts; communicate in clean, spoken sentences.
- Never pronounce or read emojis or emoji tags aloud.
- Multilingual and Hinglish: If the user speaks in Hindi or Romanized Hinglish, respond warmly in natural Romanized Hinglish with a supportive buddy tone. If the user speaks in English, reply in natural English. Keep technical words in clear English.
- Keep responses concise, direct, and conversational to maintain natural spoken turn-taking.`;

    let clientClosed = false;
    let liveSession: any = null;
    const pendingAudioChunks: string[] = [];

    clientWs.on('message', (messageData: any) => {
      try {
        const parsed = JSON.parse(messageData.toString());
        if (parsed.audio) {
          if (liveSession) {
            liveSession.sendRealtimeInput({
              audio: { data: parsed.audio, mimeType: 'audio/pcm;rate=16000' },
            });
          } else if (pendingAudioChunks.length < 30) {
            pendingAudioChunks.push(parsed.audio);
          }
        }
      } catch (e: any) {
        console.warn('[LiveWS] Client chunk error:', e.message);
      }
    });

    clientWs.on('close', () => {
      clientClosed = true;
      console.log('[LiveWS] Client disconnected. Closing Gemini Live session...');
      try {
        liveSession?.close();
      } catch {}
    });

    clientWs.on('error', (err) => {
      clientClosed = true;
      console.warn('[LiveWS] Client socket error:', err);
      try {
        liveSession?.close();
      } catch {}
    });

    try {
      const sessionConfig: any = {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: selectedVoiceName,
            },
          },
        },
        systemInstruction: liveSystemPrompt,
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        sessionResumption: resumeParam ? { handle: resumeParam } : {},
        contextWindowCompression: {
          triggerTokens: '16000',
          slidingWindow: { targetTokens: '8000' },
        },
      };

      const session = await ai.live.connect({
        model: 'gemini-3.8-live',
        config: sessionConfig,
        callbacks: {
          onmessage: (msg: any) => {
            // 1. Audio stream from model
            const parts = msg.serverContent?.modelTurn?.parts || [];
            for (const part of parts) {
              if (part.inlineData?.data && clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(JSON.stringify({ audio: part.inlineData.data }));
              }
            }

            // 2. Interruption signal
            if (msg.serverContent?.interrupted && clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({ interrupted: true }));
            }

            // 3. Turn completion
            if (msg.serverContent?.turnComplete && clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({ turnComplete: true }));
            }

            // 4. Input audio transcription (user speech-to-text)
            const inputTxt = msg.serverContent?.inputTranscription?.text;
            if (inputTxt && clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({ userTranscript: inputTxt, isFinal: true }));
            }

            const interimInputTxt = msg.serverContent?.interimInputTranscription?.text;
            if (interimInputTxt && clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({ userTranscript: interimInputTxt, isFinal: false }));
            }

            // 5. Output audio transcription (Nova speech-to-text)
            const outputTxt = msg.serverContent?.outputTranscription?.text;
            if (outputTxt && clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({ aiTranscript: outputTxt, isFinal: false }));
            }

            // 6. Session Resumption Handle
            const resumeHandle = msg.sessionResumptionUpdate?.newHandle;
            if (resumeHandle && clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({ resumptionHandle: resumeHandle }));
            }

            // 7. GoAway warning before server-side session expiration
            if (msg.goAway && clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({ goAway: true, timeLeft: msg.goAway.timeLeft }));
            }
          },
          onerror: (err: any) => {
            console.error('[LiveWS] Gemini Live error:', err.message || err);
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(
                JSON.stringify({
                  error: err.message || 'Gemini Live encountered an error.',
                })
              );
            }
          },
          onclose: (event: any) => {
            const closeCode = event?.code;
            const closeReason = event?.reason || '';
            console.log('[LiveWS] Gemini Live backend session ended.', closeCode, closeReason);
            if (!clientClosed && clientWs.readyState === WebSocket.OPEN) {
              if (closeReason || (closeCode && closeCode !== 1000)) {
                clientWs.send(
                  JSON.stringify({
                    error: closeReason || `Gemini Live session closed (code ${closeCode}).`,
                  })
                );
              }
              clientWs.close();
            }
          },
        },
      });

      if (clientClosed) {
        try {
          session.close();
        } catch {}
        return;
      }

      liveSession = session;
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({ ready: true, voice: selectedVoiceName }));
      }
      while (pendingAudioChunks.length > 0) {
        const chunk = pendingAudioChunks.shift();
        if (chunk) {
          session.sendRealtimeInput({
            audio: { data: chunk, mimeType: 'audio/pcm;rate=16000' },
          });
        }
      }
    } catch (sessionErr: any) {
      console.error('[LiveWS] Failed to connect to Gemini Live:', sessionErr.message || sessionErr);
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(
          JSON.stringify({
            error: sessionErr.message || 'Could not connect to Gemini Live.',
          })
        );
      }
      clientWs.close();
    }
  });

  // Resilient error handler to prevent dev server crashes on EADDRINUSE during container pre-warming
  let listenRetries = 0;
  const MAX_LISTEN_RETRIES = 5;

  httpServer.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      listenRetries++;
      if (listenRetries <= MAX_LISTEN_RETRIES) {
        console.warn(`[Server] Port ${PORT} busy (attempt ${listenRetries}/${MAX_LISTEN_RETRIES}). Waiting 1s for previous process to release...`);
        setTimeout(() => {
          try {
            httpServer.close();
          } catch {}
          httpServer.listen(PORT, HOST);
        }, 1000);
        return;
      }
    }
    console.error('[Server] HTTP server encountered error:', err);
  });

  // Graceful termination handlers to release port 3000 immediately
  const handleShutdown = (signal: string) => {
    console.log(`[Server] Received ${signal}. Closing HTTP listener cleanly...`);
    httpServer.close(() => {
      process.exit(0);
    });
    // Fallback force exit
    setTimeout(() => process.exit(0), 3000).unref();
  };

  process.once('SIGTERM', () => handleShutdown('SIGTERM'));
  process.once('SIGINT', () => handleShutdown('SIGINT'));

  try {
    if (process.env.NODE_ENV === 'production') {
      app.use(express.static(path.resolve(__dirname, 'dist')));
      app.get('*', (_req: Request, res: Response) => {
        res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
      });
    } else {
      const { createServer } = await import('vite');
      const vite = await createServer({
        server: {
          middlewareMode: true,
          ws: { server: httpServer },
          hmr: { server: httpServer },
        },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    }

    httpServer.listen(PORT, HOST, () => {
      console.log(`NovaChat Server listening at http://${HOST}:${PORT}`);
    });
  } catch (err: any) {
    console.error('[Server] Error during server initialization:', err);
    try {
      httpServer.listen(PORT, HOST, () => {
        console.log(`NovaChat Server fallback listening at http://${HOST}:${PORT}`);
      });
    } catch (fallbackErr) {
      console.error('[Server] Fallback listen error:', fallbackErr);
    }
  }
}

startServer().catch((err) => {
  console.error('[Server] Fatal server startup error:', err);
});
