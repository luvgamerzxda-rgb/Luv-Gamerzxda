import {
  CodeMemoryItem,
  MemoryExportPayload,
  TextMemoryCategory,
  UserMemoryItem,
} from '../types';
import { estimateTextTokens } from './tokenEngine';

export const CODE_MEMORY_LANGUAGES = [
  'TypeScript',
  'JavaScript',
  'React / JSX / TSX',
  'Python',
  'Node.js',
  'HTML',
  'CSS',
  'JSON',
  'SQL',
  'Bash',
  'Other',
] as const;

export const TEXT_MEMORY_CATEGORIES: { id: TextMemoryCategory; label: string }[] = [
  { id: 'identity', label: 'Identity' },
  { id: 'preference', label: 'Preference' },
  { id: 'project', label: 'Project' },
  { id: 'decision', label: 'Decision' },
  { id: 'instruction', label: 'Instruction' },
  { id: 'hobby', label: 'Hobby' },
  { id: 'education', label: 'Education' },
  { id: 'general', label: 'General' },
];

export interface CredentialScanResult {
  hasSecrets: boolean;
  findings: string[];
}

const SECRET_RULES: { label: string; regex: RegExp }[] = [
  { label: 'Groq API Key (gsk_*)', regex: /\bgsk_[A-Za-z0-9_-]{16,}/ },
  { label: 'Google / Gemini API Key (AIza*)', regex: /\bAIza[0-9A-Za-z_-]{20,}/ },
  { label: 'Google Cloud / OAuth Key (AQ.*)', regex: /\bAQ\.[A-Za-z0-9_-]{16,}/ },
  { label: 'OpenAI / Anthropic Secret Key (sk-*)', regex: /\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{18,}/ },
  { label: 'GitHub Token (ghp_*/github_pat_*)', regex: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}|\bgithub_pat_[A-Za-z0-9_]{20,}/ },
  { label: 'AWS Access Key ID (AKIA*)', regex: /\bAKIA[0-9A-Z]{16}\b/ },
  { label: 'Slack Token (xox*)', regex: /\bxox[baprs]-[A-Za-z0-9-]{12,}/ },
  { label: 'PEM Private Key Block', regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/ },
  { label: 'Bearer Auth Token', regex: /\bBearer\s+[A-Za-z0-9\-._~+/]{20,}=*/ },
  {
    label: 'Hardcoded Password / Secret / Token Assignment',
    regex: /(?:api[_-]?key|secret[_-]?key|client[_-]?secret|access[_-]?token|auth[_-]?token|db[_-]?password|password|passwd)\s*[:=]\s*['"`][^'"`\s]{8,}['"`]/i,
  },
];

/**
 * Deterministic security scanner to warn users before saving secrets/credentials in Memory Vault.
 * Never returns raw credential values so secrets are never echoed into logs.
 */
export function detectSensitiveCredentials(content: string): CredentialScanResult {
  if (!content || typeof content !== 'string') {
    return { hasSecrets: false, findings: [] };
  }
  const findings: string[] = [];
  for (const rule of SECRET_RULES) {
    if (rule.regex.test(content)) {
      findings.push(rule.label);
    }
  }
  return {
    hasSecrets: findings.length > 0,
    findings,
  };
}

export function normalizeTextMemory(raw: any, idx = 0): UserMemoryItem | null {
  if (!raw) return null;
  if (typeof raw === 'string') {
    const fact = raw.trim();
    if (!fact) return null;
    return {
      id: `mem-${Date.now()}-${idx}`,
      fact,
      category: 'general',
      tags: [],
      pinned: false,
      enabled: true,
      createdAt: Date.now(),
    };
  }
  if (typeof raw !== 'object' || typeof raw.fact !== 'string' || !raw.fact.trim()) {
    return null;
  }
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : `mem-${Date.now()}-${idx}`,
    fact: raw.fact.trim(),
    category: raw.category || 'general',
    tags: Array.isArray(raw.tags) ? raw.tags.map((t: any) => String(t).trim()).filter(Boolean) : [],
    pinned: Boolean(raw.pinned),
    enabled: raw.enabled === undefined ? true : Boolean(raw.enabled),
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : Date.now(),
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : undefined,
  };
}

export function normalizeCodeMemory(raw: any, idx = 0): CodeMemoryItem | null {
  if (!raw || typeof raw !== 'object' || typeof raw.code !== 'string' || !raw.code.trim()) {
    return null;
  }
  const now = Date.now();
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : `code-${now}-${idx}`,
    title: (typeof raw.title === 'string' && raw.title.trim()) || 'Untitled Code Snippet',
    language: (typeof raw.language === 'string' && raw.language.trim()) || 'Other',
    projectName: typeof raw.projectName === 'string' ? raw.projectName.trim() : '',
    description: typeof raw.description === 'string' ? raw.description.trim() : '',
    tags: Array.isArray(raw.tags) ? raw.tags.map((t: any) => String(t).trim()).filter(Boolean) : [],
    code: raw.code,
    pinned: Boolean(raw.pinned),
    enabled: raw.enabled === undefined ? true : Boolean(raw.enabled),
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : now,
  };
}

export function normalizeFenceLanguageToCodeMemoryLanguage(lang?: string): string {
  const l = (lang || '').trim().toLowerCase();
  if (['ts', 'typescript'].includes(l)) return 'TypeScript';
  if (['js', 'javascript', 'mjs', 'cjs'].includes(l)) return 'JavaScript';
  if (['tsx', 'jsx', 'react'].includes(l)) return 'React / JSX / TSX';
  if (['py', 'python'].includes(l)) return 'Python';
  if (['node', 'nodejs'].includes(l)) return 'Node.js';
  if (['html', 'htm'].includes(l)) return 'HTML';
  if (['css', 'scss', 'sass'].includes(l)) return 'CSS';
  if (['json', 'jsonc'].includes(l)) return 'JSON';
  if (['sql', 'postgres', 'sqlite', 'mysql'].includes(l)) return 'SQL';
  if (['sh', 'bash', 'zsh', 'shell'].includes(l)) return 'Bash';
  return 'Other';
}

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'if', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
  'can', 'could', 'would', 'should', 'will', 'shall', 'may', 'might', 'this', 'that', 'these',
  'those', 'it', 'its', 'me', 'my', 'i', 'you', 'your', 'we', 'our', 'please', 'help', 'how',
  'what', 'when', 'where', 'why', 'which', 'about', 'from', 'into', 'tell', 'show', 'explain',
]);

function tokenizeQuery(text: string): string[] {
  if (!text) return [];
  return Array.from(
    new Set(
      text
        .toLowerCase()
        .replace(/[^a-z0-9_+#.-]+/g, ' ')
        .split(/\s+/)
        .map((t) => t.trim())
        .filter((t) => t.length >= 2 && !STOP_WORDS.has(t))
    )
  );
}

export interface MemoryRetrievalResult {
  selectedTextMemories: UserMemoryItem[];
  selectedCodeMemories: CodeMemoryItem[];
  promptStrings: string[];
  estimatedTokens: number;
}

/**
 * Selects ONLY relevant enabled Text & Code Memories for the current user prompt,
 * prioritizing pinned relevant memories and enforcing a strict token budget.
 * Never dumps the entire memory database into Groq/Gemini requests.
 */
export function selectRelevantMemories(params: {
  prompt: string;
  memoryEnabled: boolean;
  textMemories: UserMemoryItem[];
  codeMemories: CodeMemoryItem[];
  maxText?: number;
  maxCode?: number;
  maxTokenBudget?: number;
}): MemoryRetrievalResult {
  if (!params.memoryEnabled) {
    return {
      selectedTextMemories: [],
      selectedCodeMemories: [],
      promptStrings: [],
      estimatedTokens: 0,
    };
  }

  const maxText = params.maxText ?? 6;
  const maxCode = params.maxCode ?? 2;
  const maxTokenBudget = params.maxTokenBudget ?? 850;

  const queryTokens = tokenizeQuery(params.prompt);
  const queryLower = (params.prompt || '').toLowerCase();
  const hasIdentityIntent = /\b(my name|who am i|about me|remember me|my favorite|my preference|my style|my job|my school|my project|always respond|call me)\b/i.test(queryLower);
  const hasCodeIntent = /\b(code|snippet|function|component|script|saved|vault|bug|error|refactor|api|query|sql|react|typescript|javascript|python|html|css|node|json|implement|example)\b/i.test(queryLower);

  const enabledText = (params.textMemories || []).filter((m) => m && m.enabled !== false && m.fact.trim());
  const enabledCode = (params.codeMemories || []).filter((c) => c && c.enabled !== false && c.code.trim());

  // Score text memories
  const scoredText = enabledText
    .map((m) => {
      const hay = `${m.fact} ${m.category || ''} ${(m.tags || []).join(' ')}`.toLowerCase();
      let matchScore = 0;

      for (const tok of queryTokens) {
        if (hay.includes(tok)) {
          matchScore += tok.length >= 5 ? 4 : 2.5;
        }
      }
      if ((m.tags || []).some((t) => queryLower.includes(t.toLowerCase()))) {
        matchScore += 5;
      }

      const isCoreIdentity = m.category === 'identity' || m.category === 'instruction';
      const isPinned = Boolean(m.pinned);

      // Pinned items only get high priority when relevant, plus small allowance for core identity/instruction
      let totalScore = matchScore;
      if (matchScore > 0 && isPinned) totalScore += 6;
      else if (isPinned && (isCoreIdentity || hasIdentityIntent)) totalScore += 2;
      else if (isCoreIdentity && hasIdentityIntent) totalScore += 4;

      return { item: m, matchScore, totalScore };
    })
    .filter((entry) => entry.totalScore > 0)
    .sort((a, b) => b.totalScore - a.totalScore || (b.item.updatedAt || b.item.createdAt) - (a.item.updatedAt || a.item.createdAt));

  // Score code memories (stricter relevance threshold so unrelated code is never injected)
  const scoredCode = enabledCode
    .map((c) => {
      const metaHay = `${c.title} ${c.language} ${c.projectName || ''} ${c.description || ''} ${(c.tags || []).join(' ')}`.toLowerCase();
      const codeHay = c.code.toLowerCase().slice(0, 1200);
      let matchScore = 0;

      for (const tok of queryTokens) {
        if (metaHay.includes(tok)) matchScore += 5;
        else if (codeHay.includes(tok)) matchScore += 2;
      }

      if (c.projectName && queryLower.includes(c.projectName.toLowerCase())) {
        matchScore += 8;
      }
      if (c.tags.some((t) => queryLower.includes(t.toLowerCase()))) {
        matchScore += 6;
      }
      if (c.language && queryLower.includes(c.language.toLowerCase().split(' ')[0])) {
        matchScore += 3;
      }

      const minThreshold = hasCodeIntent ? 3 : 5;
      if (matchScore < minThreshold) {
        return { item: c, matchScore, totalScore: 0 };
      }

      const totalScore = matchScore + (c.pinned ? 5 : 0);
      return { item: c, matchScore, totalScore };
    })
    .filter((entry) => entry.totalScore > 0)
    .sort((a, b) => b.totalScore - a.totalScore || b.item.updatedAt - a.item.updatedAt);

  const selectedTextMemories: UserMemoryItem[] = [];
  const selectedCodeMemories: CodeMemoryItem[] = [];
  const promptStrings: string[] = [];
  let usedTokens = 0;

  for (const entry of scoredText) {
    if (selectedTextMemories.length >= maxText) break;
    const cat = entry.item.category || 'general';
    const tagStr = entry.item.tags && entry.item.tags.length > 0 ? ` [tags: ${entry.item.tags.join(', ')}]` : '';
    const formatted = `- [${cat}]${entry.item.pinned ? ' [pinned]' : ''} ${entry.item.fact}${tagStr}`;
    const tok = estimateTextTokens(formatted) + 2;
    if (usedTokens + tok > maxTokenBudget) continue;
    selectedTextMemories.push(entry.item);
    promptStrings.push(formatted);
    usedTokens += tok;
  }

  for (const entry of scoredCode) {
    if (selectedCodeMemories.length >= maxCode) break;
    const c = entry.item;
    const remainingBudget = maxTokenBudget - usedTokens;
    if (remainingBudget < 80) break;

    const header = `[Saved Code Memory: "${c.title}" (${c.language}${c.projectName ? `, project: ${c.projectName}` : ''})]${c.description ? ` — ${c.description}` : ''}`;
    const trimmedCode = c.code.length > 1400 ? `${c.code.slice(0, 1400)}\n// ... (truncated to stay within prompt token budget)` : c.code;
    const formatted = `${header}\n\`\`\`${c.language.toLowerCase().split(' ')[0]}\n${trimmedCode}\n\`\`\``;
    const tok = estimateTextTokens(formatted) + 4;
    if (usedTokens + tok > maxTokenBudget) continue;

    selectedCodeMemories.push(c);
    promptStrings.push(formatted);
    usedTokens += tok;
  }

  return {
    selectedTextMemories,
    selectedCodeMemories,
    promptStrings,
    estimatedTokens: usedTokens,
  };
}

export function buildMemoryExportPayload(
  memories: UserMemoryItem[],
  codeMemories: CodeMemoryItem[]
): MemoryExportPayload {
  return {
    version: 2,
    exportedAt: new Date().toISOString(),
    source: 'novachat',
    memories,
    codeMemories,
  };
}

export function parseMemoryImportPayload(rawContent: string): {
  memories: UserMemoryItem[];
  codeMemories: CodeMemoryItem[];
  secretFindings: { title: string; findings: string[] }[];
} {
  let parsed: any;
  try {
    parsed = JSON.parse(rawContent);
  } catch (err: any) {
    throw new Error(`Invalid JSON memory file: ${err?.message || 'Syntax error'}`);
  }

  let rawMemList: any[] = [];
  let rawCodeList: any[] = [];

  if (Array.isArray(parsed)) {
    rawMemList = parsed;
  } else if (parsed && typeof parsed === 'object') {
    if (Array.isArray(parsed.memories)) rawMemList = parsed.memories;
    if (Array.isArray(parsed.codeMemories)) rawCodeList = parsed.codeMemories;
    if (!Array.isArray(parsed.memories) && !Array.isArray(parsed.codeMemories)) {
      throw new Error('Unrecognized memory export format. Expected memories or codeMemories arrays.');
    }
  } else {
    throw new Error('Invalid memory export structure.');
  }

  const memories = rawMemList
    .map((m, idx) => normalizeTextMemory(m, idx))
    .filter((m): m is UserMemoryItem => m !== null);

  const codeMemories = rawCodeList
    .map((c, idx) => normalizeCodeMemory(c, idx))
    .filter((c): c is CodeMemoryItem => c !== null);

  if (memories.length === 0 && codeMemories.length === 0) {
    throw new Error('No valid text or code memories found in the imported file.');
  }

  const secretFindings: { title: string; findings: string[] }[] = [];
  for (const c of codeMemories) {
    const scan = detectSensitiveCredentials(c.code);
    if (scan.hasSecrets) {
      secretFindings.push({ title: c.title, findings: scan.findings });
    }
  }

  return { memories, codeMemories, secretFindings };
}
