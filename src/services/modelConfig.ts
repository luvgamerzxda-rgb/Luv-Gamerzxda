/**
 * NovaChat AI - Centralized Model & Reasoning Effort Architecture
 * 
 * Provides single-source-of-truth configuration for:
 * 1. Default primary AI model ('openai/gpt-oss-120b' on Groq LPU)
 * 2. Two distinct effort modes:
 *    - Normal Mode: fast, responsive, standard token usage, reasoning_effort: 'low'
 *    - Think Mode: deep reasoning, reasoning_effort: 'high', answer self-verification
 * 3. 15-minute maximum safe application deadline architecture (900s total, 780s work limit)
 */

export const PRIMARY_DEFAULT_MODEL = 'openai/gpt-oss-120b';
export const PRIMARY_MODEL_NAME = 'NovaChat AI';
export const PRIMARY_ENGINE_LABEL = 'GPT-OSS 120B (Groq)';

export const MAX_THINK_APP_DEADLINE_MS = 15 * 60 * 1000; // 15 minutes (900 seconds)
export const WORK_THINK_DEADLINE_MS = 13 * 60 * 1000;    // 13 minutes (780 seconds)
export const NORMAL_APP_DEADLINE_MS = 90 * 1000;         // 90 seconds normal safety limit

export type ReasoningEffortLevel = 'low' | 'high';

export interface ModelEffortConfig {
  model: string;
  displayName: string;
  engineName: string;
  thinkMode: boolean;
  reasoningEffort: ReasoningEffortLevel;
  maxOutputTokens: number;
  verificationEnabled: boolean;
  workDeadlineMs: number;
  maxDeadlineMs: number;
  connectTimeoutMs: number;
  idleTimeoutMs: number;
}

/**
 * Returns the exact configuration for the chosen reasoning mode.
 * Centralized so updating primary model or parameters affects the entire application consistently.
 */
export function getModelEffortConfig(thinkMode: boolean = false): ModelEffortConfig {
  if (thinkMode) {
    return {
      model: PRIMARY_DEFAULT_MODEL,
      displayName: PRIMARY_MODEL_NAME,
      engineName: PRIMARY_ENGINE_LABEL,
      thinkMode: true,
      reasoningEffort: 'high',
      maxOutputTokens: 4096, // Higher token budget allocated for deep thinking & verification
      verificationEnabled: true,
      workDeadlineMs: WORK_THINK_DEADLINE_MS,
      maxDeadlineMs: MAX_THINK_APP_DEADLINE_MS,
      connectTimeoutMs: 90000, // 90s connection window for complex reasoning starts
      idleTimeoutMs: 60000,    // 60s stream idle window between token chunks
    };
  }

  return {
    model: PRIMARY_DEFAULT_MODEL,
    displayName: PRIMARY_MODEL_NAME,
    engineName: PRIMARY_ENGINE_LABEL,
    thinkMode: false,
    reasoningEffort: 'low',
    maxOutputTokens: 2048,
    verificationEnabled: false,
    workDeadlineMs: 60000,
    maxDeadlineMs: NORMAL_APP_DEADLINE_MS,
    connectTimeoutMs: 60000,
    idleTimeoutMs: 30000,
  };
}

/**
 * Returns true only for Groq-hosted models that support the `reasoning_effort` parameter.
 * Prevents 400 errors on models like LLaMA 3.3 or Qwen that reject `reasoning_effort`.
 */
export function supportsGroqReasoningEffort(modelId: string): boolean {
  if (!modelId || typeof modelId !== 'string') return false;
  const normalized = modelId.trim().toLowerCase();
  return /^openai\/gpt-oss-(120b|20b)$/.test(normalized) || normalized.includes('gpt-oss');
}

