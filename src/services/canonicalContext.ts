/**
 * NovaChat AI - Canonical Request Context & Unified Provider Adapters
 *
 * Single source of truth for per-turn conversation context:
 *   - Persona resolution + user custom instructions + continuation handoff
 *   - Memory Vault context (Text Memories + Code Memories) respecting toggles
 *   - Shared Web Search grounding results (or explicit unavailability notice)
 *   - Ordered, deduplicated message history with unified attachment normalization
 *   - Deterministic history compaction
 *   - Pure schema translators for Groq (OpenAI-compatible) and Google Gemini
 *
 * Neither provider executes separate retrieval, prompt assembly, or compaction.
 */

import type OpenAI from 'openai';
import { ThinkingLevel } from '@google/genai';
import { resolveActivePersona } from './personaEngine';
import { buildAdaptiveConversationDirective } from './conversationEngine';
import { buildFullSystemInstruction } from './systemDirectives';
import {
  compactConversationHistory,
  deduplicateMemories,
  deduplicateMessages,
  estimateTextTokens,
  getModelTokenConfig,
} from './tokenEngine';
import {
  getModelEffortConfig,
  PRIMARY_DEFAULT_MODEL,
  supportsGroqReasoningEffort,
} from './modelConfig';
import type { CodeMemoryItem, PersonaOption, UserMemoryItem } from '../types';
import type { WebSearchPayload } from './webSearch';

export type ProviderId = 'groq' | 'gemini';

export interface CanonicalAttachment {
  id?: string;
  name: string;
  type: string;
  base64: string;
  size?: number;
}

export interface NormalizedImageAttachment {
  kind: 'image';
  name: string;
  mimeType: string;
  dataUrl: string;
  base64Data: string;
}

export interface NormalizedTextAttachment {
  kind: 'text';
  name: string;
  mimeType: string;
  textContent: string;
  truncated: boolean;
}

export interface UnsupportedAttachment {
  kind: 'unsupported';
  name: string;
  mimeType: string;
  reason: string;
}

export type ProcessedAttachment =
  | NormalizedImageAttachment
  | NormalizedTextAttachment
  | UnsupportedAttachment;

export interface CanonicalMessage {
  id?: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  images: NormalizedImageAttachment[];
  textAttachments: NormalizedTextAttachment[];
  unsupportedAttachments: UnsupportedAttachment[];
}

export interface SearchGroundingOutcome {
  requested: boolean;
  performed: boolean;
  payload?: WebSearchPayload;
  unavailableReason?: string;
}

export interface CanonicalRequestInput {
  requestId: string;
  sessionId: string;
  turnId: string;
  messages: Array<{
    id?: string;
    role: string;
    content: any;
    attachments?: CanonicalAttachment[];
  }>;
  model?: string;
  thinkMode?: boolean;
  personaId?: string;
  customInstruction?: string;
  handoffSummary?: string;
  memoryEnabled?: boolean;
  userMemory?: Array<string | UserMemoryItem | CodeMemoryItem>;
  codebaseContext?: string;
  searchOutcome?: SearchGroundingOutcome;
}

export interface CanonicalContext {
  requestId: string;
  sessionId: string;
  turnId: string;
  requestedModel: string;
  primaryProvider: ProviderId;
  thinkMode: boolean;
  reasoningEffort: 'low' | 'medium' | 'high';
  maxOutputTokens: number;
  connectTimeoutMs: number;
  idleTimeoutMs: number;
  workDeadlineMs: number;
  maxDeadlineMs: number;
  persona: PersonaOption;
  isAutoMode: boolean;
  customInstruction: string;
  handoffSummary: string;
  memoryEnabled: boolean;
  memoryFacts: string[];
  codebaseContext: string;
  adaptiveDirective: string;
  searchOutcome: SearchGroundingOutcome;
  searchContextText: string;
  systemInstruction: string;
  systemTokens: number;
  orderedMessages: CanonicalMessage[];
  wasCompacted: boolean;
  compactionSummary?: string;
  userPromptText: string;
  attachmentWarnings: string[];
  safeInputBudget: number;
}

const TEXT_MIME_PREFIXES = ['text/'];
const TEXT_EXACT_MIMES = new Set([
  'application/json',
  'application/ld+json',
  'application/xml',
  'application/javascript',
  'application/x-javascript',
  'application/typescript',
  'application/x-typescript',
  'application/x-sh',
  'application/sql',
  'application/yaml',
  'application/x-yaml',
]);
const TEXT_EXTENSIONS = new Set([
  '.txt',
  '.md',
  '.markdown',
  '.csv',
  '.tsv',
  '.json',
  '.jsonl',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.py',
  '.java',
  '.c',
  '.cpp',
  '.h',
  '.hpp',
  '.cs',
  '.go',
  '.rs',
  '.rb',
  '.php',
  '.html',
  '.htm',
  '.css',
  '.scss',
  '.sql',
  '.yaml',
  '.yml',
  '.toml',
  '.ini',
  '.env',
  '.log',
  '.xml',
  '.sh',
  '.bash',
]);

const MAX_TEXT_ATTACHMENT_CHARS = 16000;

function decodeBase64ToUtf8(base64Input: string): string {
  const raw = base64Input.includes(',') ? base64Input.split(',')[1] || '' : base64Input;
  if (!raw) return '';
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(raw, 'base64').toString('utf8');
  }
  const binary = atob(raw);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

function isImageAttachment(att: CanonicalAttachment): boolean {
  const mime = (att.type || '').toLowerCase();
  return mime.startsWith('image/') || (typeof att.base64 === 'string' && att.base64.startsWith('data:image/'));
}

function isTextAttachment(att: CanonicalAttachment): boolean {
  const mime = (att.type || '').toLowerCase().split(';')[0].trim();
  if (TEXT_MIME_PREFIXES.some((p) => mime.startsWith(p))) return true;
  if (TEXT_EXACT_MIMES.has(mime)) return true;
  const nameLower = (att.name || '').toLowerCase();
  const dotIdx = nameLower.lastIndexOf('.');
  if (dotIdx !== -1 && TEXT_EXTENSIONS.has(nameLower.slice(dotIdx))) {
    return true;
  }
  return (typeof att.base64 === 'string' && att.base64.startsWith('data:text/'));
}

export function normalizeAttachments(attachments?: CanonicalAttachment[]): ProcessedAttachment[] {
  if (!Array.isArray(attachments) || attachments.length === 0) return [];

  const processed: ProcessedAttachment[] = [];
  for (const att of attachments) {
    if (!att || typeof att.name !== 'string') continue;
    const base64Str = typeof att.base64 === 'string' ? att.base64.trim() : '';
    const mime = (att.type || 'application/octet-stream').trim();

    if (isImageAttachment(att) && base64Str) {
      const dataUrl = base64Str.startsWith('data:')
        ? base64Str
        : `data:${mime || 'image/png'};base64,${base64Str}`;
      const match = dataUrl.match(/^data:([^;]+);base64,(.*)$/s);
      const cleanMime = match?.[1] || (mime.startsWith('image/') ? mime : 'image/png');
      const rawData = match?.[2] || (base64Str.includes(',') ? base64Str.split(',')[1] || '' : base64Str);
      processed.push({
        kind: 'image',
        name: att.name,
        mimeType: cleanMime,
        dataUrl,
        base64Data: rawData,
      });
      continue;
    }

    if (isTextAttachment(att) && base64Str) {
      try {
        const decoded = decodeBase64ToUtf8(base64Str);
        const truncated = decoded.length > MAX_TEXT_ATTACHMENT_CHARS;
        const bounded = truncated
          ? `${decoded.slice(0, MAX_TEXT_ATTACHMENT_CHARS)}\n... [Truncated at ${MAX_TEXT_ATTACHMENT_CHARS} characters]`
          : decoded;
        processed.push({
          kind: 'text',
          name: att.name,
          mimeType: mime,
          textContent: bounded,
          truncated,
        });
      } catch {
        processed.push({
          kind: 'unsupported',
          name: att.name,
          mimeType: mime,
          reason: 'Text attachment could not be UTF-8 decoded.',
        });
      }
      continue;
    }

    processed.push({
      kind: 'unsupported',
      name: att.name,
      mimeType: mime,
      reason: `Binary attachment type (${mime || 'unknown'}) is not supported for automatic text/vision extraction.`,
    });
  }

  return processed;
}

export function formatSearchContextBlock(outcome?: SearchGroundingOutcome): string {
  if (!outcome || !outcome.requested) return '';

  if (outcome.unavailableReason) {
    return `[LIVE WEB SEARCH STATUS: UNAVAILABLE]
Live web search was requested but could not complete (${outcome.unavailableReason}).
- Do NOT fabricate URLs, citations, or claim to have browsed live web sources.
- State honestly if up-to-date external information could not be retrieved.`;
  }

  if (outcome.performed && outcome.payload) {
    if (outcome.payload.results.length === 0) {
      return `[LIVE WEB SEARCH STATUS: 0 RESULTS]
Live web search ran for query "${outcome.payload.query}" via ${outcome.payload.provider}, and returned 0 external results.
- Do NOT invent URLs, bracketed citations like [1], or claim to have retrieved live sources.
- Inform the user honestly if real-time external verification was unavailable.`;
    }

    return `VERIFIED WEB SEARCH RESULTS (Search Provider: ${outcome.payload.provider}):
User Query: "${outcome.payload.query}"

${outcome.payload.results
  .map(
    (r, i) =>
      `[${i + 1}] Title: ${r.title}\nURL: ${r.url}\nExcerpt: ${r.snippet}`
  )
  .join('\n\n')}

MANDATORY INLINE CITATION REQUIREMENTS:
- Synthesize a comprehensive, factual answer grounded directly in the verified web search results above.
- Add standard bracketed citation markers like [1], [2], etc., immediately following factual statements derived from these sources.
- Do NOT invent external URLs or cite numbers outside the range [1] to [${outcome.payload.results.length}].`;
  }

  return '';
}

function normalizeMemoryItems(
  memories?: Array<string | UserMemoryItem | CodeMemoryItem>,
  memoryEnabled: boolean = true
): string[] {
  if (!memoryEnabled || !Array.isArray(memories) || memories.length === 0) {
    return [];
  }

  const formatted: string[] = [];
  for (const item of memories) {
    if (typeof item === 'string') {
      if (item.trim()) formatted.push(item.trim());
    } else if (item && typeof item === 'object') {
      if ('enabled' in item && item.enabled === false) continue;
      if ('fact' in item && typeof item.fact === 'string' && item.fact.trim()) {
        formatted.push(`[TEXT MEMORY] ${item.fact.trim()}`);
      } else if ('code' in item && typeof item.code === 'string' && item.code.trim()) {
        const lang = (item as CodeMemoryItem).language || 'text';
        const title = (item as CodeMemoryItem).title || 'Snippet';
        formatted.push(
          `[CODE MEMORY | ${lang}] ${title}:\n\`\`\`${lang}\n${item.code.trim()}\n\`\`\``
        );
      }
    }
  }

  return deduplicateMemories(formatted);
}

function extractRawText(content: any): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter((p) => p && p.type === 'text' && typeof p.text === 'string')
      .map((p) => p.text)
      .join('\n');
  }
  if (content == null) return '';
  return JSON.stringify(content);
}

/**
 * Builds the SINGLE canonical request context for a user turn.
 * Both Groq and Gemini receive the exact same instructions, memories,
 * search grounding, ordered messages, and attachments from this object.
 */
export function buildCanonicalRequestContext(input: CanonicalRequestInput): CanonicalContext {
  const requestedModel = (input.model || PRIMARY_DEFAULT_MODEL).trim();
  const primaryProvider: ProviderId = requestedModel.startsWith('gemini-') ? 'gemini' : 'groq';
  const isThinkMode = Boolean(input.thinkMode);
  const effortConfig = getModelEffortConfig(isThinkMode);
  const memoryEnabled = input.memoryEnabled !== false;

  const normalizedRawMessages = deduplicateMessages(
    (Array.isArray(input.messages) ? input.messages : []).map((m, idx) => {
      const role: 'user' | 'assistant' | 'system' =
        m.role === 'model' || m.role === 'assistant'
          ? 'assistant'
          : m.role === 'system'
          ? 'system'
          : 'user';

      const baseText = extractRawText(m.content);
      const processedAtts = normalizeAttachments(m.attachments);
      const images = processedAtts.filter((a): a is NormalizedImageAttachment => a.kind === 'image');
      const textAttachments = processedAtts.filter((a): a is NormalizedTextAttachment => a.kind === 'text');
      const unsupportedAttachments = processedAtts.filter((a): a is UnsupportedAttachment => a.kind === 'unsupported');

      const textSections: string[] = [];
      if (baseText.trim()) {
        textSections.push(baseText);
      } else if (images.length > 0 && role === 'user') {
        textSections.push('Please inspect and analyze the attached image.');
      }

      for (const ta of textAttachments) {
        textSections.push(`[Attached Text File: ${ta.name}]\n\`\`\`\n${ta.textContent}\n\`\`\``);
      }

      for (const ua of unsupportedAttachments) {
        textSections.push(
          `[Attachment Notice: "${ua.name}" (${ua.mimeType}) — ${ua.reason}]`
        );
      }

      return {
        id: m.id || `norm-${idx}`,
        role,
        content: textSections.join('\n\n'),
        images,
        textAttachments,
        unsupportedAttachments,
      } satisfies CanonicalMessage;
    })
  );

  const attachmentWarnings = normalizedRawMessages.flatMap((m) =>
    m.unsupportedAttachments.map((u) => `${u.name}: ${u.reason}`)
  );

  const lastUserMessage = [...normalizedRawMessages].reverse().find((m) => m.role === 'user');
  const userPromptText = (lastUserMessage?.content || '').trim();

  const persona = resolveActivePersona(input.personaId || 'auto', userPromptText);
  const isAutoMode = !input.personaId || input.personaId === 'auto';

  const customInstruction = (input.customInstruction || '').trim();
  const handoffSummary = (input.handoffSummary || '').trim();
  const codebaseContext = (input.codebaseContext || '').trim();

  const memoryFacts = normalizeMemoryItems(input.userMemory, memoryEnabled);

  const adaptiveDirective = buildAdaptiveConversationDirective({
    prompt: userPromptText,
    history: normalizedRawMessages,
    personaId: persona.id,
    thinkMode: isThinkMode,
  });

  const searchOutcome: SearchGroundingOutcome = input.searchOutcome || {
    requested: false,
    performed: false,
  };
  const searchContextText = formatSearchContextBlock(searchOutcome);

  const systemInstruction = buildFullSystemInstruction({
    personaInstruction: persona.instruction,
    customInstruction,
    memoryFacts,
    handoffSummary,
    codebaseContext,
    adaptiveDirective,
    searchContext: searchContextText,
    thinkMode: isThinkMode,
  });

  const systemTokens = estimateTextTokens(systemInstruction);
  const safeInputBudget = getModelTokenConfig(requestedModel).safeInputBudget;
  // Normal mode uses a tighter history budget to reduce redundant history overhead and speed up TTFT
  const effectiveHistoryBudget = isThinkMode
    ? safeInputBudget
    : Math.min(safeInputBudget, 3000);

  // Preserve images and attachment metadata cleanly across compaction
  const { compactedMessages, wasCompacted, summaryNotes } = compactConversationHistory(
    normalizedRawMessages,
    effectiveHistoryBudget,
    systemTokens
  );

  const orderedMessages: CanonicalMessage[] = (wasCompacted ? compactedMessages : normalizedRawMessages).map(
    (m: any) => ({
      id: m.id,
      role: m.role === 'model' || m.role === 'assistant' ? 'assistant' : m.role === 'system' ? 'system' : 'user',
      content: typeof m.content === 'string' ? m.content : extractRawText(m.content),
      images: Array.isArray(m.images) ? m.images : [],
      textAttachments: Array.isArray(m.textAttachments) ? m.textAttachments : [],
      unsupportedAttachments: Array.isArray(m.unsupportedAttachments) ? m.unsupportedAttachments : [],
    })
  );

  return {
    requestId: input.requestId,
    sessionId: input.sessionId,
    turnId: input.turnId,
    requestedModel,
    primaryProvider,
    thinkMode: isThinkMode,
    reasoningEffort: effortConfig.reasoningEffort,
    maxOutputTokens: effortConfig.maxOutputTokens,
    connectTimeoutMs: effortConfig.connectTimeoutMs,
    idleTimeoutMs: effortConfig.idleTimeoutMs,
    workDeadlineMs: effortConfig.workDeadlineMs,
    maxDeadlineMs: effortConfig.maxDeadlineMs,
    persona,
    isAutoMode,
    customInstruction,
    handoffSummary,
    memoryEnabled,
    memoryFacts,
    codebaseContext,
    adaptiveDirective,
    searchOutcome,
    searchContextText,
    systemInstruction,
    systemTokens,
    orderedMessages,
    wasCompacted,
    compactionSummary: summaryNotes,
    userPromptText,
    attachmentWarnings,
    safeInputBudget,
  };
}

/**
 * Pure Schema Translator: CanonicalContext -> Groq (OpenAI-compatible) request shape.
 */
export function toGroqRequest(
  ctx: CanonicalContext,
  modelOverride?: string
): {
  model: string;
  messages: OpenAI.Chat.ChatCompletionMessageParam[];
  hasImages: boolean;
  maxTokens: number;
  reasoningEffort?: 'low' | 'medium' | 'high';
} {
  const formattedMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: ctx.systemInstruction },
  ];

  let hasImages = false;
  for (const m of ctx.orderedMessages) {
    if (m.role === 'user' && m.images.length > 0) {
      hasImages = true;
      const parts: any[] = [{ type: 'text', text: m.content || 'Please inspect and analyze this image.' }];
      for (const img of m.images) {
        parts.push({
          type: 'image_url',
          image_url: { url: img.dataUrl },
        });
      }
      formattedMessages.push({ role: 'user', content: parts });
    } else {
      formattedMessages.push({
        role: m.role,
        content: m.content || '',
      });
    }
  }

  let targetModel = modelOverride || ctx.requestedModel;
  if (targetModel.startsWith('gemini-')) {
    targetModel = PRIMARY_DEFAULT_MODEL;
  }
  if (hasImages) {
    targetModel = 'qwen/qwen3.8-27b';
  }

  return {
    model: targetModel,
    messages: formattedMessages,
    hasImages,
    maxTokens: ctx.maxOutputTokens,
    reasoningEffort: supportsGroqReasoningEffort(targetModel) ? ctx.reasoningEffort : undefined,
  };
}

/**
 * Pure Schema Translator: CanonicalContext -> Google Gemini @google/genai request shape.
 * Preserves ALL canonical instructions, memories, search context, compaction summaries,
 * ordered turns, text attachments, and base64 inlineData images identically.
 */
export function toGeminiRequest(
  ctx: CanonicalContext,
  modelOverride: string = 'gemini-3-flash-preview'
): {
  model: string;
  contents: Array<{ role: 'user' | 'model'; parts: any[] }>;
  config: {
    systemInstruction: string;
    maxOutputTokens: number;
    thinkingConfig?: { thinkingBudget?: number; thinkingLevel?: ThinkingLevel };
  };
  hasImages: boolean;
} {
  const systemSupplements: string[] = [];
  const contents: Array<{ role: 'user' | 'model'; parts: any[] }> = [];
  let hasImages = false;

  for (const m of ctx.orderedMessages) {
    if (m.role === 'system') {
      // Preserve compaction summary or system context turns cleanly without dropping them
      if (m.content.trim()) {
        systemSupplements.push(m.content.trim());
      }
      continue;
    }

    const parts: any[] = [];
    if (m.content.trim()) {
      parts.push({ text: m.content });
    }
    if (m.role === 'user' && m.images.length > 0) {
      hasImages = true;
      for (const img of m.images) {
        parts.push({
          inlineData: {
            mimeType: img.mimeType,
            data: img.base64Data,
          },
        });
      }
    }

    if (parts.length > 0) {
      contents.push({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts,
      });
    }
  }

  const finalSystemInstruction =
    systemSupplements.length > 0
      ? `${ctx.systemInstruction}\n\n${systemSupplements.join('\n\n')}`
      : ctx.systemInstruction;

  const normalizedGeminiModel =
    modelOverride && modelOverride.startsWith('gemini-')
      ? modelOverride
      : 'gemini-3-flash-preview';

  const config: {
    systemInstruction: string;
    maxOutputTokens: number;
    thinkingConfig?: { thinkingBudget?: number; thinkingLevel?: ThinkingLevel };
  } = {
    systemInstruction: finalSystemInstruction,
    maxOutputTokens: ctx.maxOutputTokens,
  };

  // Model-compatible thinking parameters:
  // Gemini 2.5 uses thinkingBudget; Gemini 3.x / 4.x uses ThinkingLevel
  if (normalizedGeminiModel.startsWith('gemini-2.5')) {
    config.thinkingConfig = { thinkingBudget: ctx.thinkMode ? 2048 : 0 };
  } else if (
    normalizedGeminiModel.startsWith('gemini-3') ||
    normalizedGeminiModel.startsWith('gemini-4')
  ) {
    config.thinkingConfig = {
      thinkingLevel: ctx.thinkMode ? ThinkingLevel.HIGH : ThinkingLevel.LOW,
    };
  }

  return {
    model: normalizedGeminiModel,
    contents,
    config,
    hasImages,
  };
}

export type ProviderFailureCategory =
  | 'auth'
  | 'bad_request'
  | 'client_abort'
  | 'quota_429'
  | 'payload_413'
  | 'model_404'
  | 'tool_failed'
  | 'server_5xx'
  | 'network_timeout'
  | 'unknown';

export interface ClassifiedProviderError {
  category: ProviderFailureCategory;
  statusCode?: number;
  eligibleForGeminiFailover: boolean;
  safeReason: string;
  userMessage: string;
}

/**
 * Classifies provider failures consistently so failover ONLY happens on eligible
 * infrastructure/rate-limit/availability failures and never masks client aborts,
 * malformed requests (400), or rejected credentials (401/403).
 */
export function classifyProviderError(err: any): ClassifiedProviderError {
  const status = typeof err?.status === 'number' ? err.status : typeof err?.code === 'number' ? err.code : undefined;
  const code = String(err?.code || err?.error?.code || '');
  const msg = String(err?.message || err || '');
  const lower = msg.toLowerCase();

  if (err?.name === 'AbortError' || lower.includes('aborted by user') || code === 'ABORT_ERR') {
    return {
      category: 'client_abort',
      statusCode: status,
      eligibleForGeminiFailover: false,
      safeReason: 'Request aborted',
      userMessage: '*(Generation stopped by user)*',
    };
  }

  if (
    status === 401 ||
    status === 403 ||
    code === 'invalid_api_key' ||
    lower.includes('invalid api key') ||
    lower.includes('unauthorized') ||
    lower.includes('api_key_invalid') ||
    lower.includes('unauthenticated') ||
    lower.includes('permission_denied')
  ) {
    return {
      category: 'auth',
      statusCode: status || 401,
      eligibleForGeminiFailover: false,
      safeReason: 'Authentication rejected by provider (401/403)',
      userMessage: '⚠️ **API Authentication Error (401/403):** Provider credentials were rejected. Verify your API key configuration.',
    };
  }

  if (status === 400 && !lower.includes('tool_use_failed') && !lower.includes('tool choice is none') && !lower.includes('reasoning_effort')) {
    return {
      category: 'bad_request',
      statusCode: 400,
      eligibleForGeminiFailover: false,
      safeReason: 'Malformed request (400)',
      userMessage: `⚠️ **Invalid Request (400):** ${msg || 'Malformed request payload.'}`,
    };
  }

  if (
    status === 429 ||
    lower.includes('429') ||
    lower.includes('rate limit') ||
    lower.includes('quota') ||
    lower.includes('resource_exhausted')
  ) {
    return {
      category: 'quota_429',
      statusCode: 429,
      eligibleForGeminiFailover: true,
      safeReason: 'Provider rate limit exceeded (429)',
      userMessage: '⚠️ **Rate Limit Exceeded (429):** Provider per-minute quota reached.',
    };
  }

  if (
    status === 413 ||
    lower.includes('413') ||
    lower.includes('request too large') ||
    lower.includes('tokens per minute') ||
    lower.includes('itpm')
  ) {
    return {
      category: 'payload_413',
      statusCode: 413,
      eligibleForGeminiFailover: true,
      safeReason: 'Provider request token budget exceeded (413)',
      userMessage: '⚠️ **Request Too Large (413):** Context exceeded provider per-request token limit.',
    };
  }

  if (
    status === 404 ||
    code === 'model_not_found' ||
    lower.includes('does not exist') ||
    lower.includes('not have access')
  ) {
    return {
      category: 'model_404',
      statusCode: 404,
      eligibleForGeminiFailover: true,
      safeReason: 'Requested model unavailable (404)',
      userMessage: '⚠️ **Model Unavailable (404):** Requested model is currently unavailable.',
    };
  }

  if (
    code === 'tool_use_failed' ||
    lower.includes('tool_use_failed') ||
    lower.includes('tool choice is none')
  ) {
    return {
      category: 'tool_failed',
      statusCode: status || 400,
      eligibleForGeminiFailover: true,
      safeReason: 'Model attempted unsupported tool call',
      userMessage: '⚠️ The model generated an unsupported tool call.',
    };
  }

  if (status && status >= 500 && status < 600) {
    return {
      category: 'server_5xx',
      statusCode: status,
      eligibleForGeminiFailover: true,
      safeReason: `Upstream provider error (${status})`,
      userMessage: `⚠️ **Upstream Provider Error (${status}):** Temporary service failure.`,
    };
  }

  if (
    code === 'ETIMEDOUT' ||
    code === 'ECONNRESET' ||
    code === 'ECONNREFUSED' ||
    code === 'ENOTFOUND' ||
    code === 'UND_ERR_CONNECT_TIMEOUT' ||
    lower.includes('timeout') ||
    lower.includes('timed out') ||
    lower.includes('network') ||
    lower.includes('fetch failed') ||
    lower.includes('econnreset') ||
    lower.includes('socket hang up')
  ) {
    return {
      category: 'network_timeout',
      statusCode: status,
      eligibleForGeminiFailover: true,
      safeReason: 'Provider network/timeout failure',
      userMessage: '⚠️ **Network/Timeout Error:** Connection to provider timed out.',
    };
  }

  return {
    category: 'unknown',
    statusCode: status,
    eligibleForGeminiFailover: false,
    safeReason: msg || 'Unknown provider failure',
    userMessage: `⚠️ **Error:** ${msg || 'Stream processing failed'}`,
  };
}
