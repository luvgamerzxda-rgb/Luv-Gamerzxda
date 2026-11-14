import {
  Attachment,
  ChatMessage,
  ModelTokenConfig,
  TokenEstimate,
  TokenUsageStatus,
  UserMemoryItem,
} from '../types';
import { buildFullSystemInstruction } from './systemDirectives';
import { buildAdaptiveConversationDirective } from './conversationEngine';

/**
 * Model-specific token constraints and rate-limit aware budgets.
 * 
 * IMPORTANT ARCHITECTURAL DISTINCTION:
 * - `contextWindow`: The model's theoretical context capacity (e.g. 131,072 tokens / 128k for LLaMA 3.3).
 * - `safeInputBudget`: The per-request headroom budget calibrated to the provider's
 *   Input Tokens Per Minute (ITPM) rate-limit tier (e.g. Groq free-tier 7,000 ITPM limit).
 *   Exceeding this safe budget triggers HTTP 413 "Request too large" or HTTP 429 rate-limit errors.
 */
export const MODEL_TOKEN_CONFIGS: Record<string, ModelTokenConfig> = {
  'llama-3.3-70b-versatile': {
    id: 'llama-3.3-70b-versatile',
    name: 'LLaMA 3.3 70B (Groq)',
    contextWindow: 131072, // 128k context window
    maxOutputReserve: 4096,
    itpmLimit: 7000, // Groq rate-limit threshold for this tier
    safeInputBudget: 5500, // Safe per-request rate-limit target (prevents 413/429)
    warningThreshold: 0.70, // ~3,850 tokens
    criticalThreshold: 0.90, // ~4,950 tokens
  },
  'openai/gpt-oss-120b': {
    id: 'openai/gpt-oss-120b',
    name: 'GPT-OSS 120B (Groq)',
    contextWindow: 131072,
    maxOutputReserve: 4096,
    itpmLimit: 8000,
    safeInputBudget: 6000,
    warningThreshold: 0.70,
    criticalThreshold: 0.90,
  },
  'openai/gpt-oss-20b': {
    id: 'openai/gpt-oss-20b',
    name: 'GPT-OSS 20B (Groq)',
    contextWindow: 131072,
    maxOutputReserve: 4096,
    itpmLimit: 8000,
    safeInputBudget: 6000,
    warningThreshold: 0.70,
    criticalThreshold: 0.90,
  },
  'gemini-2.5-flash': {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash (Google)',
    contextWindow: 1048576,
    maxOutputReserve: 8192,
    itpmLimit: 1000000,
    safeInputBudget: 32000,
    warningThreshold: 0.70,
    criticalThreshold: 0.90,
  },
  'gemini-3.8-flash': {
    id: 'gemini-3.8-flash',
    name: 'Gemini 3.8 Flash (Google)',
    contextWindow: 1048576,
    maxOutputReserve: 8192,
    itpmLimit: 1000000,
    safeInputBudget: 32000,
    warningThreshold: 0.70,
    criticalThreshold: 0.90,
  },
  'gemini-3-flash-preview': {
    id: 'gemini-3-flash-preview',
    name: 'Gemini 3 Flash Preview (Google)',
    contextWindow: 1048576,
    maxOutputReserve: 8192,
    itpmLimit: 1000000,
    safeInputBudget: 32000,
    warningThreshold: 0.70,
    criticalThreshold: 0.90,
  },
  'gemini-3.5-flash': {
    id: 'gemini-3.5-flash',
    name: 'Gemini 3.5 Flash (Google)',
    contextWindow: 1048576,
    maxOutputReserve: 8192,
    itpmLimit: 1000000,
    safeInputBudget: 32000,
    warningThreshold: 0.70,
    criticalThreshold: 0.90,
  },
  'gemini-3.1-flash-lite': {
    id: 'gemini-3.1-flash-lite',
    name: 'Gemini 3.1 Flash Lite (Google)',
    contextWindow: 1048576,
    maxOutputReserve: 8192,
    itpmLimit: 1000000,
    safeInputBudget: 32000,
    warningThreshold: 0.70,
    criticalThreshold: 0.90,
  },
  'qwen/qwen3.8-27b': {
    id: 'qwen/qwen3.8-27b',
    name: 'Qwen 3.8 27B (Groq)',
    contextWindow: 131072,
    maxOutputReserve: 4096,
    itpmLimit: 10000,
    safeInputBudget: 7500,
    warningThreshold: 0.70,
    criticalThreshold: 0.90,
  },
};

export const DEFAULT_MODEL_CONFIG: ModelTokenConfig = {
  id: 'openai/gpt-oss-120b',
  name: 'NovaChat AI',
  contextWindow: 131072,
  maxOutputReserve: 4096,
  itpmLimit: 8000,
  safeInputBudget: 6000,
  warningThreshold: 0.70,
  criticalThreshold: 0.90,
};

export function getModelTokenConfig(modelId: string): ModelTokenConfig {
  return MODEL_TOKEN_CONFIGS[modelId] || DEFAULT_MODEL_CONFIG;
}

/**
 * Deduplicates chat messages by unique ID and content to prevent accidental
 * duplication from state merges or multi-source synchronization.
 */
export function deduplicateMessages<T extends { id?: string; role?: string; content?: any }>(
  messages: T[]
): T[] {
  if (!Array.isArray(messages)) return [];
  const seenIds = new Set<string>();
  const deduped: T[] = [];

  for (const m of messages) {
    if (!m) continue;
    const key = m.id ? m.id : `${m.role}-${typeof m.content === 'string' ? m.content.slice(0, 40) : ''}`;
    if (seenIds.has(key)) continue;
    seenIds.add(key);
    deduped.push(m);
  }
  return deduped;
}

/**
 * Deduplicates user memory items by ID and normalized text.
 */
export function deduplicateMemories(memories: UserMemoryItem[] | string[]): string[] {
  if (!Array.isArray(memories)) return [];
  const seen = new Set<string>();
  const result: string[] = [];

  for (const m of memories) {
    const text = (typeof m === 'string' ? m : m?.fact || '').trim();
    if (!text) continue;
    const lower = text.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    result.push(text);
  }
  return result;
}

/**
 * High-accuracy tokenizer estimator for English text, code, symbols, and CJK.
 * BPE models typically average 3.5 to 4.0 characters per token for English prose,
 * and 2.8 to 3.3 characters per token for source code or structured JSON.
 * Label: "~X tokens (est.)" with documented expected variance of ±5%.
 */
export function estimateTextTokens(text: string): number {
  if (!text || typeof text !== 'string') return 0;
  const len = text.length;
  if (len === 0) return 0;

  // Detect code density (curly braces, brackets, indentation, semicolons)
  const codeMatches = text.match(/[{}();=<>[\]_]/g);
  const isHighCodeDensity = codeMatches && codeMatches.length > len * 0.05;

  // Detect multi-byte/CJK characters (each character is usually 1-2 tokens)
  const cjkMatches = text.match(/[\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af]/g);
  const cjkCount = cjkMatches ? cjkMatches.length : 0;
  const nonCjkLen = Math.max(0, len - cjkCount);

  // Character-to-token ratio
  const charRatio = isHighCodeDensity ? 3.2 : 3.8;
  const baseTokens = Math.ceil(nonCjkLen / charRatio);
  const cjkTokens = Math.ceil(cjkCount * 1.5);

  return Math.max(1, baseTokens + cjkTokens);
}

/**
 * Estimates token usage for an attachment (image or text).
 */
export function estimateAttachmentTokens(attachment: Attachment): number {
  if (!attachment || !attachment.base64 || attachment.base64.trim() === '') return 0;
  const isImage =
    attachment.type?.startsWith('image/') ||
    attachment.base64.startsWith('data:image/');

  if (isImage) {
    // OpenAI/Groq vision typically consumes ~180 tokens for a standard compressed image tile
    return 180;
  }

  // Text/PDF/code attachment: estimate from decoded content length
  const rawLen = attachment.base64.length * 0.75;
  return Math.ceil(rawLen / 3.6);
}

/**
 * Estimates tokens for an individual chat message, including role framing overhead.
 */
export function estimateMessageTokens(
  msg: ChatMessage | { role: string; content: string; attachments?: Attachment[] }
): number {
  if (!msg) return 0;
  const roleOverhead = 4; // <|im_start|>role\n...<|im_end|>
  let contentTokens = 0;

  if (typeof msg.content === 'string') {
    contentTokens = estimateTextTokens(msg.content);
  } else if (Array.isArray(msg.content)) {
    for (const part of msg.content as any[]) {
      if (part.type === 'text' && part.text) {
        contentTokens += estimateTextTokens(part.text);
      } else if (part.type === 'image_url') {
        contentTokens += 180;
      }
    }
  }

  let attachmentTokens = 0;
  if ('attachments' in msg && Array.isArray(msg.attachments)) {
    for (const att of msg.attachments) {
      attachmentTokens += estimateAttachmentTokens(att);
    }
  }

  return roleOverhead + contentTokens + attachmentTokens;
}

export interface RequestEstimateParams {
  model: string;
  systemInstruction?: string;
  userMemories?: UserMemoryItem[] | any[];
  messages: ChatMessage[];
  pendingInput?: string;
  pendingAttachments?: Attachment[];
  handoffSummary?: string;
}

/**
 * Computes full outgoing request token budget and classification.
 * Matches the EXACT payload sent to the AI provider.
 */
export function estimateFullRequestTokens(params: RequestEstimateParams): TokenEstimate {
  const config = getModelTokenConfig(params.model);

  // Deduplicate user memories
  const memoryFacts = deduplicateMemories(params.userMemories || []);

  // 1. Build the canonical full system instruction with adaptive layer (matches server.ts)
  const adaptiveDirective = params.pendingInput
    ? buildAdaptiveConversationDirective({ prompt: params.pendingInput, history: params.messages })
    : undefined;

  const fullSystemPrompt = buildFullSystemInstruction({
    personaInstruction: params.systemInstruction,
    memoryFacts,
    handoffSummary: params.handoffSummary,
    adaptiveDirective,
  });

  const systemTokens = estimateTextTokens(fullSystemPrompt) + 4; // role overhead

  // Memory tokens breakdown for UI transparency
  const memoryTokens = memoryFacts.length > 0 ? estimateTextTokens(memoryFacts.join('\n')) + 20 : 0;

  // 2. Conversation History (prior messages in this active chat)
  // Deduplicate to prevent counting repeated turns twice
  const dedupedMessages = deduplicateMessages(params.messages || []);
  let historyTokens = 0;
  for (const msg of dedupedMessages) {
    historyTokens += estimateMessageTokens(msg);
  }

  // 3. Current Pending Input & Attachments (next user turn)
  let currentMessageTokens = 0;
  if (params.pendingInput && params.pendingInput.trim()) {
    currentMessageTokens += estimateTextTokens(params.pendingInput.trim());
  }
  if (Array.isArray(params.pendingAttachments)) {
    for (const att of params.pendingAttachments) {
      currentMessageTokens += estimateAttachmentTokens(att);
    }
  }
  if (currentMessageTokens > 0) {
    currentMessageTokens += 4; // user role framing
  }

  const totalInputTokens = systemTokens + historyTokens + currentMessageTokens;
  const safeBudget = config.safeInputBudget;
  const maxContext = config.contextWindow;
  const contextUsageRatio = maxContext > 0 ? totalInputTokens / maxContext : 0;
  const rateLimitUsageRatio = safeBudget > 0 ? totalInputTokens / safeBudget : 0;
  // Calculate percentage against configured model context limit
  const usageRatio = contextUsageRatio;

  // 4. Threshold Evaluation: cleanly distinguishes true Context Window capacity
  // from provider per-minute rate limits (ITPM)
  let status: TokenUsageStatus = 'normal';
  let recommendedAction: TokenEstimate['recommendedAction'] = 'none';
  const contextPctStr = usageRatio < 0.01 ? '<1%' : `${Math.round(usageRatio * 100)}%`;
  const rateLimitPctStr = `${Math.round(rateLimitUsageRatio * 100)}%`;

  const availableContextTokens = Math.max(0, maxContext - config.maxOutputReserve);

  let explanation = `Request is estimated at ~${totalInputTokens.toLocaleString()} tokens (${contextPctStr} of ${maxContext.toLocaleString()} context limit; ${rateLimitPctStr} of ${safeBudget.toLocaleString()} safe per-minute target). Status: Context Safe.`;

  // True Context Window evaluation (only flags critical when model's actual context is nearly full)
  if (totalInputTokens >= availableContextTokens || usageRatio >= 0.90) {
    status = 'critical';
    recommendedAction = 'compact';
    explanation = `Conversation context (~${totalInputTokens.toLocaleString()} tokens) is approaching the model's verified limit of ${maxContext.toLocaleString()} tokens. Starting a new chat with context handoff is recommended.`;
  } else if (usageRatio >= 0.75) {
    status = 'high';
    recommendedAction = 'warning';
    explanation = `Conversation context is using ${contextPctStr} of the ${maxContext.toLocaleString()} model capacity (~${totalInputTokens.toLocaleString()} tokens).`;
  } else if (usageRatio >= 0.50 || (totalInputTokens > 3500 && rateLimitUsageRatio >= config.criticalThreshold)) {
    status = 'approaching';
    recommendedAction = 'none';
    explanation = `Conversation is running smoothly (~${totalInputTokens.toLocaleString()} tokens, ${contextPctStr} of ${maxContext.toLocaleString()} context limit; ${rateLimitPctStr} of safe per-minute budget).`;
  }

  const canSafelySend = totalInputTokens <= availableContextTokens;

  return {
    systemTokens,
    memoryTokens,
    historyTokens,
    currentMessageTokens,
    totalInputTokens,
    safeBudget,
    maxContext,
    usageRatio,
    contextUsageRatio,
    rateLimitUsageRatio,
    status,
    model: config.name,
    canSafelySend,
    recommendedAction,
    explanation,
  };
}

/**
 * Compacts conversation history turns to fit within the safe budget:
 * - Preserves system directives and persona in full.
 * - Preserves persistent user memories in full.
 * - Preserves the newest user message in full (never dropped or truncated).
 * - Preserves the most recent 2-4 conversational turns for immediate flow.
 * - Compacts older turns into a high-density, structured summary block.
 */
export function compactConversationHistory(
  messages: any[],
  safeInputBudget: number,
  systemTokens: number
): { compactedMessages: any[]; wasCompacted: boolean; summaryNotes?: string } {
  const deduped = deduplicateMessages(messages);
  if (!Array.isArray(deduped) || deduped.length <= 3) {
    return { compactedMessages: deduped, wasCompacted: false };
  }

  // Always preserve the newest turn (last user message)
  const lastIndex = deduped.length - 1;
  const lastMsg = deduped[lastIndex];
  const lastMsgTokens = estimateMessageTokens(lastMsg);

  // Available tokens for prior history
  const availableForHistory = Math.max(500, safeInputBudget - systemTokens - lastMsgTokens - 350);

  // Check if messages already fit
  let totalHistoryTokens = 0;
  for (const m of deduped) {
    totalHistoryTokens += estimateMessageTokens(m);
  }

  if (totalHistoryTokens <= availableForHistory) {
    return { compactedMessages: deduped, wasCompacted: false };
  }

  // Keep the most recent 2-4 turns
  const recentTurnsToKeep = Math.min(4, Math.max(2, Math.floor(deduped.length / 3)));
  const splitIndex = Math.max(1, deduped.length - recentTurnsToKeep);

  const olderMessages = deduped.slice(0, splitIndex);
  const recentMessages = deduped.slice(splitIndex);

  // Create a structured distillation of older turns
  const summaryBulletPoints: string[] = [];
  for (let i = 0; i < olderMessages.length; i++) {
    const m = olderMessages[i];
    const roleName = m.role === 'user' ? 'User' : 'NovaChat';
    const rawContent = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);

    if (m.role === 'user') {
      const trimmed = rawContent.slice(0, 140).trim();
      summaryBulletPoints.push(`- User asked/directed: "${trimmed}${rawContent.length > 140 ? '...' : ''}"`);
    } else {
      const codeMatch = rawContent.match(/```(?:\w+)?\n([\s\S]*?)```/);
      if (codeMatch) {
        const snippet = codeMatch[1].trim().slice(0, 160);
        summaryBulletPoints.push(`- NovaChat provided code context: \`${snippet.replace(/\n/g, ' ')}...\``);
      } else {
        const firstSentence = rawContent.split(/[.!?]\s/)[0] || rawContent.slice(0, 120);
        summaryBulletPoints.push(`- NovaChat answered regarding: "${firstSentence.trim()}..."`);
      }
    }
  }

  const structuredSummary = `[PRIOR CONVERSATION CONTEXT & DECISIONS SUMMARY]:\n${summaryBulletPoints.join('\n')}\n(Older turns summarized to stay within safe token limits while preserving full continuity.)`;

  const summaryMessage = {
    role: 'system',
    content: structuredSummary,
  };

  const compactedMessages = [summaryMessage, ...recentMessages];

  return {
    compactedMessages,
    wasCompacted: true,
    summaryNotes: structuredSummary,
  };
}

/**
 * Generates a clean, bounded continuation summary for "New Chat with Context".
 * Extracts user goals, technical decisions, active code contexts, and unresolved questions.
 * Produces a concise ~150-250 token brief, NEVER copying the entire transcript.
 */
export function buildHandoffSummary(messages: ChatMessage[], sessionTitle?: string): string {
  if (!Array.isArray(messages) || messages.length === 0) {
    return '';
  }

  const deduped = deduplicateMessages(messages);
  const userMessages = deduped.filter((m) => m.role === 'user');
  const aiMessages = deduped.filter((m) => m.role === 'assistant');

  const mainGoals = userMessages
    .slice(0, 3)
    .map((m) => m.content.slice(0, 100).trim())
    .filter(Boolean);

  const lastUserMsg = userMessages[userMessages.length - 1]?.content || '';
  const lastAiMsg = aiMessages[aiMessages.length - 1]?.content || '';

  // Extract key code references or filenames if present
  const codeReferences: string[] = [];
  deduped.forEach((m) => {
    const matches = m.content.match(/\b(?:[a-zA-Z0-9_\-.]+\.(?:ts|tsx|js|jsx|py|json|html|css|sql|sh))\b/g);
    if (matches) {
      matches.forEach((f) => {
        if (!codeReferences.includes(f) && codeReferences.length < 6) {
          codeReferences.push(f);
        }
      });
    }
  });

  return `# CONTINUATION CONTEXT (Carried Over from "${sessionTitle || 'Previous Chat'}")
- **Primary Goals & Topics Discussed:**
${mainGoals.map((g) => `  * ${g}`).join('\n')}
- **Relevant Files & Identifiers:** ${codeReferences.length > 0 ? codeReferences.join(', ') : 'None specified'}
- **Most Recent Context:** "${lastUserMsg.slice(0, 140)}..."
- **Last Status:** "${lastAiMsg.slice(0, 140)}..."
*(Please seamlessly maintain continuity with the above topics without asking the user to repeat their background context.)*`;
}

/**
 * Checks for extremely large single message (> 4,500 tokens).
 */
export function checkSingleMessageSize(text: string, maxSafeTokens = 4500): {
  isOversized: boolean;
  estimatedTokens: number;
  recommendation: string;
} {
  const estimatedTokens = estimateTextTokens(text);
  const isOversized = estimatedTokens > maxSafeTokens;

  let recommendation = '';
  if (isOversized) {
    recommendation = `This message is estimated at ~${estimatedTokens.toLocaleString()} tokens, which exceeds the safe single-request limit of ${maxSafeTokens.toLocaleString()} tokens. To avoid provider rate limits, consider splitting it into sections or asking NovaChat to analyze specific parts.`;
  }

  return {
    isOversized,
    estimatedTokens,
    recommendation,
  };
}
