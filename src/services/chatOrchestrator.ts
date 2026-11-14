/**
 * NovaChat AI - Unified Single-Assistant Chat Orchestrator
 *
 * Implements:
 *   1. Shared single-pass Web Search Grounding (never runs Gemini Search as a second assistant).
 *   2. One CanonicalContext built once per user turn.
 *   3. Pure provider execution adapters: callGroq(...) & callGemini(...).
 *   4. Eligible failover (429, 5xx, 413, 404, network/timeout, primary unconfigured)
 *      reusing the EXACT same CanonicalContext & turnId, with explicit streamReset if any
 *      partial output was already emitted so providers never concatenate partial fragments.
 *   5. Normalized SSE metadata reporting exact providerUsed, modelUsed, isFallback, fallbackReason.
 */

import type OpenAI from 'openai';
import type { GoogleGenAI } from '@google/genai';
import {
  buildCanonicalRequestContext,
  classifyProviderError,
  toGeminiRequest,
  toGroqRequest,
  type CanonicalAttachment,
  type CanonicalContext,
  type ProviderId,
  type SearchGroundingOutcome,
} from './canonicalContext';
import { PRIMARY_DEFAULT_MODEL, supportsGroqReasoningEffort } from './modelConfig';
import {
  evaluateVerificationRequirement,
  executeAnswerVerificationPass,
} from './answerVerification';
import { StreamTimeoutController } from './timeoutManager';
import { shouldPerformWebSearch, type WebSearchPayload } from './webSearch';
import type { CodeMemoryItem, UserMemoryItem } from '../types';

export interface OrchestratorSSEEvent {
  text?: string;
  error?: string;
  done?: boolean;
  streamReset?: boolean;
  statusNotice?: string;
  searchStatus?: 'searching' | 'reading' | 'preparing' | 'done';
  groundingChunks?: Array<{ web: { uri: string; title: string } }>;
  webSearchQueries?: string[];
  searchProvider?: string;
  personaUsed?: string;
  personaName?: string;
  personaRole?: string;
  isAutoMode?: boolean;
  providerUsed?: ProviderId;
  modelUsed?: string;
  isFallback?: boolean;
  fallbackReason?: string;
  requestId?: string;
  turnId?: string;
  generationId?: string;
  seed?: number;
  imageUrl?: string;
  latency?: {
    ttftMs: number | null;
    modelResponseMs: number;
  };
}

export type SSEEventEmitter = (event: OrchestratorSSEEvent) => void;

export interface ChatOrchestratorDeps {
  getGroqKey: () => string;
  getGroqClient: () => OpenAI;
  getGeminiKey: () => string;
  getGeminiClient: () => GoogleGenAI | null;
  rotateGeminiClientAfterAuthFailure?: (failedKey: string) => { apiKey: string; client: GoogleGenAI | null } | null;
  runWebSearch: (query: string, signal?: AbortSignal) => Promise<WebSearchPayload>;
  resolveCodebaseContext?: (userPromptText: string, meta: {
    activeModel: string;
    searchGrounding: boolean;
    systemPersonaId: string;
    memoryEnabled: boolean;
    memoryCount: number;
  }) => string | undefined;
  isSelfKnowledgeQuery?: (prompt: string) => boolean;
  enhanceImagePrompt?: (subject: string) => Promise<string>;
}

/**
 * Stateful stream thought filter to eliminate reasoning blocks, planning text,
 * and internal thought tags even when split across streaming chunks.
 */
export class StreamThoughtFilter {
  private buffer = '';
  private insideTag = false;
  private currentEndTag = '';
  private isAtStart = true;

  private readonly tags = [
    { start: '<think>', end: '</think>' },
    { start: '<thought>', end: '</thought>' },
    { start: '<thoughts>', end: '</thoughts>' },
    { start: '<reasoning>', end: '</reasoning>' },
    { start: '<scratchpad>', end: '</scratchpad>' },
    { start: '<plan>', end: '</plan>' },
    { start: '<planning>', end: '</planning>' },
    { start: '<internal>', end: '</internal>' },
    { start: '<analysis>', end: '</analysis>' },
    { start: '<reflection>', end: '</reflection>' },
    { start: '```thought', end: '```' },
    { start: '```thinking', end: '```' },
    { start: '```plan', end: '```' },
  ];

  feed(chunk: string): string {
    if (!chunk) return '';
    this.buffer += chunk;
    let output = '';

    while (this.buffer.length > 0) {
      if (!this.insideTag) {
        if (this.isAtStart) {
          const trimmed = this.buffer.trimStart();
          const thoughtHeaderMatch = trimmed.match(
            /^(thinking process|internal thoughts?|reasoning|plan|scratchpad):/i
          );
          if (thoughtHeaderMatch) {
            const doubleNewlineIdx = this.buffer.indexOf('\n\n');
            if (doubleNewlineIdx !== -1) {
              this.buffer = this.buffer.slice(doubleNewlineIdx + 2).trimStart();
              this.isAtStart = false;
              continue;
            } else if (this.buffer.length < 500) {
              break;
            }
          } else if (trimmed.length > 20) {
            this.isAtStart = false;
          }
        }

        let earliestStart = -1;
        let matchedTag: { start: string; end: string } | null = null;

        for (const t of this.tags) {
          const idx = this.buffer.toLowerCase().indexOf(t.start.toLowerCase());
          if (idx !== -1 && (earliestStart === -1 || idx < earliestStart)) {
            earliestStart = idx;
            matchedTag = t;
          }
        }

        if (earliestStart === -1) {
          const maxTagLen = 15;
          const safeLen = Math.max(0, this.buffer.length - maxTagLen);
          output += this.buffer.slice(0, safeLen);
          this.buffer = this.buffer.slice(safeLen);
          break;
        } else {
          output += this.buffer.slice(0, earliestStart);
          this.buffer = this.buffer.slice(earliestStart + matchedTag!.start.length);
          this.insideTag = true;
          this.currentEndTag = matchedTag!.end;
        }
      } else {
        const endIdx = this.buffer.toLowerCase().indexOf(this.currentEndTag.toLowerCase());
        if (endIdx === -1) {
          const keepLen = this.currentEndTag.length;
          this.buffer = this.buffer.slice(Math.max(0, this.buffer.length - keepLen));
          break;
        } else {
          this.buffer = this.buffer.slice(endIdx + this.currentEndTag.length);
          this.insideTag = false;
          this.currentEndTag = '';
        }
      }
    }

    return output;
  }

  flush(): string {
    if (this.insideTag) {
      this.buffer = '';
      return '';
    }
    const rem = this.buffer;
    this.buffer = '';
    return rem;
  }
}

class RequestLimiter {
  private activeCount = 0;
  private readonly maxConcurrent = 3;
  private queue: (() => void)[] = [];

  async acquire(): Promise<() => void> {
    if (this.activeCount < this.maxConcurrent) {
      this.activeCount++;
      let released = false;
      return () => {
        if (!released) {
          released = true;
          this.activeCount--;
          const next = this.queue.shift();
          if (next) {
            this.activeCount++;
            next();
          }
        }
      };
    }

    return new Promise<() => void>((resolve) => {
      this.queue.push(() => {
        let released = false;
        resolve(() => {
          if (!released) {
            released = true;
            this.activeCount--;
            const next = this.queue.shift();
            if (next) {
              this.activeCount++;
              next();
            }
          }
        });
      });
    });
  }
}

const groqLimiter = new RequestLimiter();

export const DEFAULT_FALLBACK_MODEL = 'qwen/qwen3.8-27b';

export const MODEL_FALLBACK_CHAINS: Record<string, string[]> = {
  'openai/gpt-oss-120b': ['openai/gpt-oss-20b', 'qwen/qwen3.8-27b'],
  'openai/gpt-oss-20b': ['openai/gpt-oss-120b', 'qwen/qwen3.8-27b'],
  'llama-3.3-70b-versatile': ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'qwen/qwen3.8-27b'],
  'qwen/qwen3.8-27b': ['openai/gpt-oss-120b', 'openai/gpt-oss-20b'],
  default: [PRIMARY_DEFAULT_MODEL, 'openai/gpt-oss-20b', 'qwen/qwen3.8-27b'],
};

const unavailableModelCooldowns = new Map<string, number>();

export function isModelCoolingDown(modelId: string): boolean {
  const expiry = unavailableModelCooldowns.get(modelId);
  if (!expiry) return false;
  if (Date.now() > expiry) {
    unavailableModelCooldowns.delete(modelId);
    return false;
  }
  return true;
}

export function markModelUnavailable(modelId: string, durationMs: number = 10 * 60 * 1000): void {
  unavailableModelCooldowns.set(modelId, Date.now() + durationMs);
}

export function resolveModelCandidates(requestedModel: string): string[] {
  const candidates: string[] = [];
  if (!isModelCoolingDown(requestedModel)) {
    candidates.push(requestedModel);
  }
  const chain = MODEL_FALLBACK_CHAINS[requestedModel] || MODEL_FALLBACK_CHAINS.default;
  for (const m of chain) {
    if (!candidates.includes(m) && !isModelCoolingDown(m)) {
      candidates.push(m);
    }
  }
  if (candidates.length === 0) {
    candidates.push(DEFAULT_FALLBACK_MODEL);
  }
  return candidates;
}

export interface ProviderTurnResult {
  providerUsed: ProviderId;
  modelUsed: string;
  emittedText: string;
  ttftMs: number | null;
  modelResponseMs: number;
}

export interface ProviderExecutionError extends Error {
  originalError?: any;
  partialOutputEmitted?: boolean;
}

/**
 * Pure Groq Execution Adapter: consumes CanonicalContext via toGroqRequest(ctx)
 * without rebuilding prompts, filtering memories, or changing history order.
 */
export async function callGroq(
  ctx: CanonicalContext,
  deps: ChatOrchestratorDeps,
  emit: SSEEventEmitter,
  options: {
    abortSignal?: AbortSignal;
    timeoutController?: StreamTimeoutController | null;
    maxIntraProviderAttempts?: number;
    retryBaseDelayMs?: number;
  } = {}
): Promise<ProviderTurnResult> {
  const releaseLimiter = await groqLimiter.acquire();
  let emittedText = '';
  const callStartAt = Date.now();
  let firstTokenAt: number | null = null;

  try {
    const groqKey = deps.getGroqKey();
    if (!groqKey) {
      const err: any = new Error('GROQ_API_KEY is not configured in server environment.');
      err.status = 503;
      err.code = 'primary_unconfigured';
      throw err;
    }

    const baseGroqReq = toGroqRequest(ctx);
    const modelCandidates = resolveModelCandidates(baseGroqReq.model);
    let currentModelIndex = 0;
    let modelToUse = baseGroqReq.hasImages ? baseGroqReq.model : modelCandidates[currentModelIndex];

    const verificationCheck = ctx.thinkMode
      ? evaluateVerificationRequirement(ctx.userPromptText, '')
      : { needsVerification: false, taskType: 'conversational' as const, reason: '' };
    const willRunVerification = ctx.thinkMode && verificationCheck.needsVerification;

    if (willRunVerification) {
      emit({ statusNotice: 'Understanding the task...' });
      emit({ statusNotice: 'Working through the problem...' });
    }

    const groqClient = deps.getGroqClient();
    let stream: AsyncIterable<OpenAI.Chat.ChatCompletionChunk> | null = null;
    let attempt = 0;
    const maxAttempts = options.maxIntraProviderAttempts ?? 2;

    while (attempt < maxAttempts) {
      attempt++;
      if (options.abortSignal?.aborted) {
        const abortErr: any = new Error('Request aborted by user');
        abortErr.name = 'AbortError';
        throw abortErr;
      }

      const groqReq = toGroqRequest(ctx, modelToUse);
      modelToUse = groqReq.model;

      try {
        const createOptions: any = {
          model: modelToUse,
          messages: groqReq.messages,
          stream: true,
          max_tokens: groqReq.maxTokens,
        };
        if (groqReq.reasoningEffort && supportsGroqReasoningEffort(modelToUse)) {
          createOptions.reasoning_effort = groqReq.reasoningEffort;
        }

        stream = (await groqClient.chat.completions.create(createOptions)) as any;
        break;
      } catch (err: any) {
        if (err.message?.includes('reasoning_effort') || err.param === 'reasoning_effort') {
          stream = (await groqClient.chat.completions.create({
            model: modelToUse,
            messages: groqReq.messages,
            stream: true,
            max_tokens: groqReq.maxTokens,
          })) as any;
          break;
        }

        const classified = classifyProviderError(err);

        if (classified.category === 'auth' || classified.category === 'bad_request' || classified.category === 'client_abort') {
          throw err;
        }

        if (classified.category === 'model_404') {
          markModelUnavailable(modelToUse);
          currentModelIndex++;
          if (currentModelIndex < modelCandidates.length) {
            modelToUse = modelCandidates[currentModelIndex];
            continue;
          }
          throw err;
        }

        // One quick bounded intra-provider retry on 429 before surfacing to Gemini failover
        if (classified.category === 'quota_429' && attempt < maxAttempts) {
          const retryAfterHeader = err.headers?.get?.('retry-after') || err.response?.headers?.['retry-after'];
          const rawDelay = retryAfterHeader
            ? Math.round(parseFloat(retryAfterHeader) * 1000)
            : (options.retryBaseDelayMs ?? 1200);
          const backoffMs = Math.min(Math.max(rawDelay, 50), 3000);
          emit({ statusNotice: `Rate limit reached on primary provider. Retrying briefly...` });
          await new Promise((r) => setTimeout(r, backoffMs));
          continue;
        }

        // On 413, 5xx, network/timeout, or exhausted 429: throw up to orchestrator for Gemini failover
        // using the EXACT SAME CanonicalContext (do NOT strip context!)
        throw err;
      }
    }

    if (!stream) {
      throw new Error('Failed to initialize stream from Groq.');
    }

    options.timeoutController?.notifyStreamStarted();
    const thoughtFilter = new StreamThoughtFilter();
    let draftAnswer = '';

    try {
      for await (const chunk of stream) {
        if (options.abortSignal?.aborted) break;
        options.timeoutController?.notifyDataReceived();

        const delta = chunk.choices?.[0]?.delta as any;
        if (!delta) continue;

        if (delta.channel === 'analysis' || delta.channel === 'thought' || delta.channel === 'internal') {
          continue;
        }
        if (delta.reasoning || delta.reasoning_content || delta.thought) {
          continue;
        }

        const rawContent = delta.content || '';
        const sanitized = thoughtFilter.feed(rawContent);
        if (sanitized) {
          if (willRunVerification) {
            draftAnswer += sanitized;
          } else {
            if (firstTokenAt === null) firstTokenAt = Date.now();
            emittedText += sanitized;
            emit({ text: sanitized, providerUsed: 'groq', modelUsed: modelToUse });
          }
        }
      }
    } catch (streamErr: any) {
      const errWrapper: ProviderExecutionError = new Error(streamErr?.message || 'Groq stream interrupted');
      errWrapper.originalError = streamErr;
      (errWrapper as any).status = streamErr?.status;
      (errWrapper as any).code = streamErr?.code;
      errWrapper.partialOutputEmitted = emittedText.length > 0;
      throw errWrapper;
    }

    const remaining = thoughtFilter.flush();
    if (remaining) {
      if (willRunVerification) {
        draftAnswer += remaining;
      } else {
        if (firstTokenAt === null) firstTokenAt = Date.now();
        emittedText += remaining;
        emit({ text: remaining, providerUsed: 'groq', modelUsed: modelToUse });
      }
    }

    if (willRunVerification && !options.abortSignal?.aborted) {
      emit({ statusNotice: 'Checking the answer...' });

      const verificationOutcome = await executeAnswerVerificationPass({
        groqClient,
        model: PRIMARY_DEFAULT_MODEL,
        userPrompt: ctx.userPromptText,
        draftAnswer,
        taskType: verificationCheck.taskType,
        systemInstruction: ctx.systemInstruction,
        abortSignal: options.abortSignal,
        startTime: options.timeoutController ? options.timeoutController.getMetrics().startTime : Date.now(),
        workDeadlineMs: ctx.workDeadlineMs,
      });

      if (!options.abortSignal?.aborted) {
        emit({ statusNotice: 'Preparing the response...' });
        const finalResponseText = verificationOutcome.finalContent || draftAnswer;
        const chunkSize = 48;
        for (let i = 0; i < finalResponseText.length; i += chunkSize) {
          if (options.abortSignal?.aborted) break;
          options.timeoutController?.notifyDataReceived();
          const chunkSlice = finalResponseText.slice(i, i + chunkSize);
          if (firstTokenAt === null) firstTokenAt = Date.now();
          emittedText += chunkSlice;
          emit({ text: chunkSlice, providerUsed: 'groq', modelUsed: modelToUse });
          if (i + chunkSize < finalResponseText.length) {
            await new Promise((r) => setTimeout(r, 8));
          }
        }
      }
    }

    return {
      providerUsed: 'groq',
      modelUsed: modelToUse,
      emittedText,
      ttftMs: firstTokenAt !== null ? firstTokenAt - callStartAt : null,
      modelResponseMs: Date.now() - callStartAt,
    };
  } catch (err: any) {
    if (err && typeof err === 'object') {
      if (err.partialOutputEmitted === undefined) {
        err.partialOutputEmitted = emittedText.length > 0;
      }
      if (!err.actualModelAttempted) {
        err.actualModelAttempted = toGroqRequest(ctx).model;
      }
    }
    throw err;
  } finally {
    releaseLimiter();
  }
}

export const GEMINI_CANDIDATE_MODELS = [
  'gemini-3-flash-preview',
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash',
  'gemini-3.8-flash',
  'gemini-2.5-flash',
];

export function resolveGeminiCandidates(requestedModel?: string): string[] {
  const ordered: string[] = [];
  if (requestedModel && requestedModel.startsWith('gemini-') && !isModelCoolingDown(requestedModel)) {
    ordered.push(requestedModel);
  }
  for (const m of GEMINI_CANDIDATE_MODELS) {
    if (!ordered.includes(m) && !isModelCoolingDown(m)) {
      ordered.push(m);
    }
  }
  if (ordered.length === 0) {
    ordered.push('gemini-3-flash-preview');
  }
  return ordered;
}

/**
 * Pure Gemini Execution Adapter: consumes CanonicalContext via toGeminiRequest(ctx)
 * ensuring identical system instructions, persona, memories, search findings,
 * ordered turns, compaction summaries, and attachments as Groq.
 */
export async function callGemini(
  ctx: CanonicalContext,
  deps: ChatOrchestratorDeps,
  emit: SSEEventEmitter,
  options: {
    abortSignal?: AbortSignal;
    timeoutController?: StreamTimeoutController | null;
    modelOverride?: string;
    isFallback?: boolean;
    fallbackReason?: string;
  } = {}
): Promise<ProviderTurnResult> {
  let geminiKey = deps.getGeminiKey();
  let activeGeminiClient = deps.getGeminiClient();

  if (!geminiKey || !activeGeminiClient) {
    const err: any = new Error('Missing GEMINI_API_KEY environment variable');
    err.status = 401;
    err.code = 'missing_gemini_key';
    throw err;
  }

  const preferredModel =
    options.modelOverride ||
    (ctx.requestedModel.startsWith('gemini-') ? ctx.requestedModel : 'gemini-3-flash-preview');
  const candidates = resolveGeminiCandidates(preferredModel);

  let authRotated = false;
  let lastError: any = null;

  for (let i = 0; i < candidates.length; i++) {
    const candidateModel = candidates[i];
    const geminiReq = toGeminiRequest(ctx, candidateModel);
    let emittedText = '';
    const callStartAt = Date.now();
    let firstTokenAt: number | null = null;

    const candidateAbort = new AbortController();
    let connectTimedOut = false;
    const onUserAbort = () => candidateAbort.abort();
    options.abortSignal?.addEventListener('abort', onUserAbort, { once: true });
    const connectTimer = setTimeout(() => {
      connectTimedOut = true;
      candidateAbort.abort();
    }, 12000);

    try {
      const responseStream = await activeGeminiClient.models.generateContentStream({
        model: geminiReq.model,
        contents: geminiReq.contents,
        config: {
          ...geminiReq.config,
          abortSignal: candidateAbort.signal,
        },
      });

      options.timeoutController?.notifyStreamStarted();
      const thoughtFilter = new StreamThoughtFilter();

      for await (const chunk of responseStream) {
        clearTimeout(connectTimer);
        if (options.abortSignal?.aborted) break;
        options.timeoutController?.notifyDataReceived();

        const text = chunk.text;
        if (text) {
          const sanitized = thoughtFilter.feed(text);
          if (sanitized) {
            if (firstTokenAt === null) firstTokenAt = Date.now();
            emittedText += sanitized;
            emit({
              text: sanitized,
              providerUsed: 'gemini',
              modelUsed: geminiReq.model,
              isFallback: Boolean(options.isFallback),
              fallbackReason: options.fallbackReason,
            });
          }
        }
      }

      clearTimeout(connectTimer);
      const remaining = thoughtFilter.flush();
      if (remaining) {
        if (firstTokenAt === null) firstTokenAt = Date.now();
        emittedText += remaining;
        emit({
          text: remaining,
          providerUsed: 'gemini',
          modelUsed: geminiReq.model,
          isFallback: Boolean(options.isFallback),
          fallbackReason: options.fallbackReason,
        });
      }

      return {
        providerUsed: 'gemini',
        modelUsed: geminiReq.model,
        emittedText,
        ttftMs: firstTokenAt !== null ? firstTokenAt - callStartAt : null,
        modelResponseMs: Date.now() - callStartAt,
      };
    } catch (err: any) {
      clearTimeout(connectTimer);
      lastError = connectTimedOut ? Object.assign(new Error(`Gemini model ${geminiReq.model} timed out connecting`), { code: 'ETIMEDOUT' }) : err;
      const classified = classifyProviderError(lastError);

      // Never swallow explicit user aborts
      if (options.abortSignal?.aborted) {
        throw err;
      }

      // If primary GEMINI_API_KEY was rejected with 401/403 and an alternate configured Google key exists, rotate once cleanly
      if (classified.category === 'auth' && !authRotated && deps.rotateGeminiClientAfterAuthFailure && emittedText.length === 0) {
        const rotated = deps.rotateGeminiClientAfterAuthFailure(geminiKey);
        if (rotated?.client && rotated.apiKey && rotated.apiKey !== geminiKey) {
          authRotated = true;
          geminiKey = rotated.apiKey;
          activeGeminiClient = rotated.client;
          i--; // Retry same candidate with rotated key
          continue;
        }
      }

      // If this Gemini model is deprecated/404, rate-limited (429), overloaded (503), or stalled connecting before any chunks emitted, advance to next candidate
      const isModelUnavailableErr =
        classified.category === 'model_404' ||
        classified.category === 'quota_429' ||
        classified.statusCode === 503 ||
        (connectTimedOut && emittedText.length === 0);

      if (isModelUnavailableErr && emittedText.length === 0 && i < candidates.length - 1) {
        const cooldownMs =
          classified.category === 'model_404'
            ? 60 * 60 * 1000
            : classified.category === 'quota_429'
            ? 30 * 1000
            : 2 * 60 * 1000;
        markModelUnavailable(candidateModel, cooldownMs);
        continue;
      }

      if (lastError && typeof lastError === 'object') {
        lastError.actualModelAttempted = geminiReq.model;
      }
      throw lastError;
    } finally {
      clearTimeout(connectTimer);
      options.abortSignal?.removeEventListener('abort', onUserAbort);
    }
  }

  throw lastError || new Error('Gemini generation failed across all candidate models.');
}

export function isImagePrompt(prompt: string): boolean {
  if (!prompt || typeof prompt !== 'string') return false;
  const lower = prompt.trim().toLowerCase();
  const triggers = [
    /^(?:please\s+)?generate\s+(?:an?\s+)?(?:image|picture|photo|illustration|art)/i,
    /^(?:please\s+)?genrate\s+(?:an?\s+)?(?:image|picture|photo|illustration|art)/i,
    /^(?:please\s+)?create\s+(?:an?\s+)?(?:image|picture|photo|illustration|art)/i,
    /^(?:please\s+)?make\s+(?:an?\s+)?(?:image|picture|photo|illustration|art)/i,
    /^(?:please\s+)?draw\s+(?:me\s+)?(?:an?\s+)?(?:image|picture|photo|illustration|art)?/i,
    /^(?:please\s+)?paint\s+(?:an?\s+)?(?:image|picture|photo|illustration|art)?/i,
    /^(?:please\s+)?render\s+(?:an?\s+)?(?:image|picture|photo|illustration|art)?/i,
    /^(?:please\s+)?produce\s+(?:an?\s+)?(?:image|picture|photo)?/i,
    /^(?:please\s+)?show\s+me\s+(?:an?\s+)?(?:image|picture|photo|illustration)\s+of\b/i,
    /^(?:an?\s+)?(?:picture|photo|illustration|image|painting)\s+of\b/i,
  ];
  return triggers.some((rgx) => rgx.test(lower));
}

export function extractSubjectFromPrompt(prompt: string): string {
  if (!prompt) return 'artwork';
  let cleaned = prompt.trim();
  cleaned = cleaned.replace(
    /^(?:please\s+)?(?:can\s+you\s+)?(?:generate|genrate|create|make|draw|paint|render|produce|show\s+me)\s+(?:an?\s+)?(?:image|picture|photo|illustration|art|painting|drawing)?(?:\s+of)?(?:\s*:)?\s*/i,
    ''
  );
  cleaned = cleaned.replace(/^(?:picture|photo|illustration|image|painting)\s+of(?:\s*:)?\s*/i, '');
  cleaned = cleaned.trim().replace(/^["']|["']$/g, '').trim();
  return cleaned || prompt.trim();
}

export interface ExecuteTurnInput {
  requestId?: string;
  sessionId?: string;
  turnId?: string;
  messages: Array<{ id?: string; role: string; content: any; attachments?: CanonicalAttachment[] }>;
  model?: string;
  thinkMode?: boolean;
  systemInstruction?: string;
  customInstruction?: string;
  handoffSummary?: string;
  searchGrounding?: boolean;
  memoryEnabled?: boolean;
  userMemory?: Array<string | UserMemoryItem | CodeMemoryItem>;
  personaId?: string;
}

export interface ExecuteTurnResult {
  canonicalContext: CanonicalContext;
  providerUsed: ProviderId;
  modelUsed: string;
  isFallback: boolean;
  fallbackReason?: string;
  emittedText: string;
  requestId: string;
  turnId: string;
  error?: string;
}

/**
 * Orchestrates ONE single-assistant turn:
 *   - Executes web search ONCE if needed
 *   - Builds ONE CanonicalContext
 *   - Routes cleanly to primary provider (Groq by default, or Gemini if explicitly selected)
 *   - Fails over to Gemini ONLY on eligible failures reusing the EXACT same CanonicalContext
 *   - Emits normalized SSE events with explicit provider attribution
 */
export async function executeCanonicalChatTurn(
  input: ExecuteTurnInput,
  emit: SSEEventEmitter,
  deps: ChatOrchestratorDeps,
  options: {
    abortSignal?: AbortSignal;
    timeoutController?: StreamTimeoutController | null;
    maxIntraGroqAttempts?: number;
    retryBaseDelayMs?: number;
  } = {}
): Promise<ExecuteTurnResult> {
  const requestId =
    input.requestId || 'req_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
  const sessionId = input.sessionId || 'session_default';
  const turnId =
    input.turnId || 'turn_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
  const requestedModel = input.model || PRIMARY_DEFAULT_MODEL;

  const lastUserRaw = [...(input.messages || [])].reverse().find((m) => m.role === 'user');
  const prelimPrompt =
    typeof lastUserRaw?.content === 'string'
      ? lastUserRaw.content.trim()
      : Array.isArray(lastUserRaw?.content)
      ? String(lastUserRaw.content.find((p: any) => p.type === 'text')?.text || '').trim()
      : '';

  // Image generation branch (kept intact and attributed cleanly)
  if (isImagePrompt(prelimPrompt) && deps.enhanceImagePrompt) {
    const cleanSubject = extractSubjectFromPrompt(prelimPrompt);
    const enhancedPrompt = await deps.enhanceImagePrompt(cleanSubject);
    const seed = Math.floor(Math.random() * 2147483647);
    const genId = 'img_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
    const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(enhancedPrompt)}?seed=${seed}&width=1024&height=1024&nologo=true&model=flux`;
    const imageResponse = `Here is your generated image: \n\n![${cleanSubject}](${imageUrl})\n\n*Prompt:* ${cleanSubject} *(Seed: ${seed})*`;

    const imageCtx = buildCanonicalRequestContext({
      requestId,
      sessionId,
      turnId,
      messages: input.messages,
      model: requestedModel,
      thinkMode: input.thinkMode,
      personaId: input.personaId,
      customInstruction: input.customInstruction ?? input.systemInstruction,
      handoffSummary: input.handoffSummary,
      memoryEnabled: input.memoryEnabled,
      userMemory: input.userMemory,
    });

    emit({
      personaUsed: imageCtx.persona.id,
      personaName: imageCtx.persona.name,
      personaRole: imageCtx.persona.role,
      isAutoMode: imageCtx.isAutoMode,
      requestId,
      turnId,
    });
    emit({
      text: imageResponse,
      generationId: genId,
      seed,
      imageUrl,
      personaUsed: imageCtx.persona.id,
      personaName: imageCtx.persona.name,
      personaRole: imageCtx.persona.role,
      providerUsed: 'groq',
      modelUsed: 'flux-image',
      isFallback: false,
      requestId,
      turnId,
    });
    emit({
      done: true,
      providerUsed: 'groq',
      modelUsed: 'flux-image',
      isFallback: false,
      requestId,
      turnId,
    });
    return {
      canonicalContext: imageCtx,
      providerUsed: 'groq',
      modelUsed: 'flux-image',
      isFallback: false,
      emittedText: imageResponse,
      requestId,
      turnId,
    };
  }

  // Optional codebase self-knowledge lookup
  let codebaseContext: string | undefined = undefined;
  const effectiveMemoryList = input.memoryEnabled === false ? [] : input.userMemory || [];
  if (deps.isSelfKnowledgeQuery && deps.resolveCodebaseContext && deps.isSelfKnowledgeQuery(prelimPrompt)) {
    codebaseContext = deps.resolveCodebaseContext(prelimPrompt, {
      activeModel: requestedModel,
      searchGrounding: Boolean(input.searchGrounding),
      systemPersonaId: input.personaId || 'auto',
      memoryEnabled: input.memoryEnabled !== false && effectiveMemoryList.length > 0,
      memoryCount: effectiveMemoryList.length,
    });
  }

  // Shared single-pass Web Search Grounding BEFORE building CanonicalContext
  const isSearchRequested = Boolean(input.searchGrounding && shouldPerformWebSearch(prelimPrompt));
  let searchOutcome: SearchGroundingOutcome = {
    requested: isSearchRequested,
    performed: false,
  };

  if (isSearchRequested) {
    emit({
      statusNotice: 'Searching the web...',
      searchStatus: 'searching',
      requestId,
      turnId,
    });

    try {
      const searchData = await deps.runWebSearch(prelimPrompt, options.abortSignal);
      searchOutcome = {
        requested: true,
        performed: true,
        payload: searchData,
      };

      if (searchData.results.length > 0) {
        emit({
          statusNotice: `Reading ${searchData.results.length} verified sources...`,
          searchStatus: 'reading',
          groundingChunks: searchData.groundingChunks,
          webSearchQueries: [searchData.query],
          searchProvider: searchData.provider,
          requestId,
          turnId,
        });
      }

      emit({
        statusNotice: 'Preparing answer...',
        searchStatus: 'preparing',
        requestId,
        turnId,
      });
    } catch (searchErr: any) {
      searchOutcome = {
        requested: true,
        performed: false,
        unavailableReason: searchErr?.message || 'Web search service failed',
      };
    }
  }

  // Build ONE CanonicalContext shared across primary and any fallback provider
  const canonicalContext = buildCanonicalRequestContext({
    requestId,
    sessionId,
    turnId,
    messages: input.messages,
    model: requestedModel,
    thinkMode: input.thinkMode,
    personaId: input.personaId,
    customInstruction: input.customInstruction ?? input.systemInstruction,
    handoffSummary: input.handoffSummary,
    memoryEnabled: input.memoryEnabled,
    userMemory: input.userMemory,
    codebaseContext,
    searchOutcome,
  });

  // Notify client immediately of resolved persona and turn identifiers
  emit({
    personaUsed: canonicalContext.persona.id,
    personaName: canonicalContext.persona.name,
    personaRole: canonicalContext.persona.role,
    isAutoMode: canonicalContext.isAutoMode,
    requestId,
    turnId,
  });

  const sharedSearchMeta =
    searchOutcome.performed && searchOutcome.payload && searchOutcome.payload.results.length > 0
      ? {
          groundingChunks: searchOutcome.payload.groundingChunks,
          webSearchQueries: [searchOutcome.payload.query],
          searchProvider: searchOutcome.payload.provider,
        }
      : {};

  // Single primary provider path
  if (canonicalContext.primaryProvider === 'gemini') {
    try {
      const geminiResult = await callGemini(canonicalContext, deps, emit, {
        abortSignal: options.abortSignal,
        timeoutController: options.timeoutController,
      });

      emit({
        done: true,
        providerUsed: 'gemini',
        modelUsed: geminiResult.modelUsed,
        isFallback: false,
        requestId,
        turnId,
        personaUsed: canonicalContext.persona.id,
        personaName: canonicalContext.persona.name,
        personaRole: canonicalContext.persona.role,
        searchStatus: 'done',
        latency: {
          ttftMs: geminiResult.ttftMs,
          modelResponseMs: geminiResult.modelResponseMs,
        },
        ...sharedSearchMeta,
      });

      return {
        canonicalContext,
        providerUsed: 'gemini',
        modelUsed: geminiResult.modelUsed,
        isFallback: false,
        emittedText: geminiResult.emittedText,
        requestId,
        turnId,
      };
    } catch (geminiErr: any) {
      const classified = classifyProviderError(geminiErr);
      const attemptedModel = (geminiErr as any)?.actualModelAttempted || canonicalContext.requestedModel || 'gemini-3.8-flash';
      emit({
        text: classified.userMessage,
        error: classified.safeReason,
        done: true,
        providerUsed: 'gemini',
        modelUsed: attemptedModel,
        isFallback: false,
        requestId,
        turnId,
        searchStatus: 'done',
      });
      return {
        canonicalContext,
        providerUsed: 'gemini',
        modelUsed: attemptedModel,
        isFallback: false,
        emittedText: classified.userMessage,
        requestId,
        turnId,
        error: classified.safeReason,
      };
    }
  }

  // Primary provider: Groq, with seamless same-context failover to Gemini when eligible
  try {
    const groqResult = await callGroq(canonicalContext, deps, emit, {
      abortSignal: options.abortSignal,
      timeoutController: options.timeoutController,
      maxIntraProviderAttempts: options.maxIntraGroqAttempts,
      retryBaseDelayMs: options.retryBaseDelayMs,
    });

    emit({
      done: true,
      providerUsed: 'groq',
      modelUsed: groqResult.modelUsed,
      isFallback: false,
      requestId,
      turnId,
      personaUsed: canonicalContext.persona.id,
      personaName: canonicalContext.persona.name,
      personaRole: canonicalContext.persona.role,
      searchStatus: 'done',
      latency: {
        ttftMs: groqResult.ttftMs,
        modelResponseMs: groqResult.modelResponseMs,
      },
      ...sharedSearchMeta,
    });

    return {
      canonicalContext,
      providerUsed: 'groq',
      modelUsed: groqResult.modelUsed,
      isFallback: false,
      emittedText: groqResult.emittedText,
      requestId,
      turnId,
    };
  } catch (groqErr: any) {
    const classified = classifyProviderError(groqErr);
    const isPrimaryUnconfigured = groqErr?.code === 'primary_unconfigured';
    const hasGeminiBackup = Boolean(deps.getGeminiKey() && deps.getGeminiClient());
    const canFailOver =
      hasGeminiBackup &&
      !options.abortSignal?.aborted &&
      (classified.eligibleForGeminiFailover || isPrimaryUnconfigured);

    if (canFailOver) {
      const fallbackReason = isPrimaryUnconfigured
        ? 'Groq primary unavailable (key not configured)'
        : classified.safeReason;
      const hadPartial = Boolean(groqErr?.partialOutputEmitted);

      console.warn(
        `[UnifiedRouter] [${requestId}] Failing over Groq -> Gemini using canonicalContext (${fallbackReason}, partialReset=${hadPartial})`
      );

      // Signal client to discard any partial fragment before streaming Gemini's full answer
      emit({
        streamReset: hadPartial,
        statusNotice: 'Primary provider unavailable; continuing with Gemini fallback...',
        providerUsed: 'gemini',
        isFallback: true,
        fallbackReason,
        requestId,
        turnId,
      });

      try {
        const geminiFallbackResult = await callGemini(canonicalContext, deps, emit, {
          abortSignal: options.abortSignal,
          timeoutController: options.timeoutController,
          modelOverride: 'gemini-3-flash-preview',
          isFallback: true,
          fallbackReason,
        });

        emit({
          done: true,
          providerUsed: 'gemini',
          modelUsed: geminiFallbackResult.modelUsed,
          isFallback: true,
          fallbackReason,
          requestId,
          turnId,
          personaUsed: canonicalContext.persona.id,
          personaName: canonicalContext.persona.name,
          personaRole: canonicalContext.persona.role,
          searchStatus: 'done',
          latency: {
            ttftMs: geminiFallbackResult.ttftMs,
            modelResponseMs: geminiFallbackResult.modelResponseMs,
          },
          ...sharedSearchMeta,
        });

        return {
          canonicalContext,
          providerUsed: 'gemini',
          modelUsed: geminiFallbackResult.modelUsed,
          isFallback: true,
          fallbackReason,
          emittedText: geminiFallbackResult.emittedText,
          requestId,
          turnId,
        };
      } catch (geminiFallbackErr: any) {
        const geminiClassified = classifyProviderError(geminiFallbackErr);
        const attemptedModel = (geminiFallbackErr as any)?.actualModelAttempted || 'gemini-3-flash-preview';
        const combinedMsg = `⚠️ **Both primary (Groq) and Gemini fallback failed:** ${geminiClassified.safeReason}`;
        emit({
          streamReset: hadPartial,
          text: combinedMsg,
          error: geminiClassified.safeReason,
          done: true,
          providerUsed: 'gemini',
          modelUsed: attemptedModel,
          isFallback: true,
          fallbackReason,
          requestId,
          turnId,
          searchStatus: 'done',
        });
        return {
          canonicalContext,
          providerUsed: 'gemini',
          modelUsed: attemptedModel,
          isFallback: true,
          fallbackReason,
          emittedText: combinedMsg,
          requestId,
          turnId,
          error: geminiClassified.safeReason,
        };
      }
    }

    // No failover permitted (auth rejection, bad request, user abort, or no Gemini key configured)
    let userMsg = classified.userMessage;
    if (isPrimaryUnconfigured && !hasGeminiBackup) {
      userMsg = `⚠️ **API Authentication Required (401):** Neither **GROQ_API_KEY** nor **GEMINI_API_KEY** is configured in the server environment.`;
    } else if (classified.category === 'auth' && hasGeminiBackup) {
      userMsg = `⚠️ **API Authentication Error (401):** The **GROQ_API_KEY** was rejected by Groq. Please verify your **GROQ_API_KEY** secret, or switch directly to Gemini.`;
    }

    const attemptedGroqModel = (groqErr as any)?.actualModelAttempted || canonicalContext.requestedModel;

    emit({
      text: userMsg,
      error: classified.safeReason,
      done: true,
      providerUsed: 'groq',
      modelUsed: attemptedGroqModel,
      isFallback: false,
      requestId,
      turnId,
      searchStatus: 'done',
    });

    return {
      canonicalContext,
      providerUsed: 'groq',
      modelUsed: attemptedGroqModel,
      isFallback: false,
      emittedText: userMsg,
      requestId,
      turnId,
      error: classified.safeReason,
    };
  }
}
