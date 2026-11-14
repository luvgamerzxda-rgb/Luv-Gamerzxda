/**
 * NovaChat AI - Answer Self-Verification & Quality Engine (Phases A-E)
 * 
 * Implements real backend verification when Think mode is enabled:
 * Phase A — Understand: parse intent, detect constraints & technical domain
 * Phase B — Solve: executed via primary model with reasoning_effort: 'high'
 * Phase C — Verify: evaluate draft for math errors, logic flaws, missing constraints, code syntax bugs
 * Phase D — Correct: revise draft if meaningful flaws are detected
 * Phase E — Respond: produce final coherent, verified answer without exposing private reasoning
 * 
 * BOUNDED & DEADLINE-AWARE:
 * - Skips redundant verification calls for simple greetings, acknowledgments, or trivial questions.
 * - Enforces hard time check: skips optional verification if available time is below safety margin.
 * - Single-pass verification strictly bounded to 1 pass to protect token budgets and rate limits.
 */

import OpenAI from 'openai';
import { PRIMARY_DEFAULT_MODEL, supportsGroqReasoningEffort } from './modelConfig';

export interface VerificationCheckResult {
  needsVerification: boolean;
  taskType: 'math' | 'coding' | 'logic_analysis' | 'factual' | 'conversational';
  reason: string;
}

export interface VerificationOutcome {
  verified: boolean;
  revised: boolean;
  finalContent: string;
  correctionSummary?: string;
  elapsedMs: number;
}

/**
 * Determines whether a user query and draft answer warrant an explicit verification pass.
 * Prevents token waste on trivial conversational inputs while ensuring rigorous checking
 * for mathematics, code, technical architecture, and complex analytical logic.
 */
export function evaluateVerificationRequirement(
  userPrompt: string,
  draftContent: string
): VerificationCheckResult {
  if (!userPrompt || typeof userPrompt !== 'string') {
    return { needsVerification: false, taskType: 'conversational', reason: 'Empty prompt' };
  }

  const promptLower = userPrompt.trim().toLowerCase();

  // 1. Trivial greeting / acknowledgement detection (zero verification needed)
  const isGreetingOrTrivial =
    /^(hi|hello|hey|good\s+(morning|afternoon|evening)|howdy|sup|greetings)[\s!.,?]*$/i.test(promptLower) ||
    /^(thanks|thank\s+you|thx|ok|okay|cool|got\s+it|understood|awesome|great)[\s!.,?]*$/i.test(promptLower) ||
    promptLower.length < 8;

  if (isGreetingOrTrivial) {
    return {
      needsVerification: false,
      taskType: 'conversational',
      reason: 'Simple greeting or acknowledgement does not require self-verification.',
    };
  }

  // 2. Math & Arithmetic task detection
  const isMathTask =
    /\b(calculate|solve|equation|integral|derivative|multiply|divide|square\s+root|algebra|formula|ratio|percentage|factorial|gcd|lcm)\b/i.test(promptLower) ||
    /[-+*\/=^×÷%]\s*\d+/.test(userPrompt) ||
    /\b\d+\s*[-+*\/^×÷%]\s*\d+\b/.test(userPrompt);

  if (isMathTask) {
    return {
      needsVerification: true,
      taskType: 'math',
      reason: 'Mathematical calculation requires precision audit of numerical operations.',
    };
  }

  // 3. Coding & Software Engineering task detection
  const isCodingTask =
    /\b(code|function|class|bug|error|refactor|typescript|javascript|react|python|algorithm|sql|database|api|endpoint|regex|component|hook)\b/i.test(promptLower) ||
    draftContent.includes('```') ||
    userPrompt.includes('```');

  if (isCodingTask) {
    return {
      needsVerification: true,
      taskType: 'coding',
      reason: 'Coding implementation requires syntax, edge case, and typing verification.',
    };
  }

  // 4. Multi-step Logic, Comparison, or Analytical task detection
  const isComplexLogic =
    /\b(compare|differences?|trade-offs?|pros?\s+and\s+cons?|analyze|critique|evaluate|architecture|verify|proof|step-by-step|explain\s+why|root\s+cause)\b/i.test(promptLower) ||
    userPrompt.length > 250 ||
    draftContent.length > 1200;

  if (isComplexLogic) {
    return {
      needsVerification: true,
      taskType: 'logic_analysis',
      reason: 'Multi-step analytical task requires consistency and completeness audit.',
    };
  }

  // 5. Default: If prompt is sufficiently long (> 80 chars) and not purely conversational
  if (userPrompt.length > 80) {
    return {
      needsVerification: true,
      taskType: 'factual',
      reason: 'Substantive inquiry benefits from self-verification in Think mode.',
    };
  }

  return {
    needsVerification: false,
    taskType: 'conversational',
    reason: 'Straightforward conversational inquiry.',
  };
}

/**
 * Runs a bounded single-pass verification and correction pass (Phases C & D).
 * If the proposed answer has logical flaws, calculation errors, or missed constraints,
 * it returns a corrected revision. Otherwise, it preserves the original draft.
 * 
 * DEADLINE ENFORCEMENT:
 * - Checks remaining time against deadline. If < 8 seconds remain, it safely skips
 *   verification and returns the draft immediately.
 */
export async function executeAnswerVerificationPass({
  groqClient,
  model = PRIMARY_DEFAULT_MODEL,
  userPrompt,
  draftAnswer,
  taskType,
  systemInstruction,
  abortSignal,
  startTime,
  workDeadlineMs = 13 * 60 * 1000,
}: {
  groqClient: OpenAI;
  model?: string;
  userPrompt: string;
  draftAnswer: string;
  taskType: string;
  systemInstruction: string;
  abortSignal?: AbortSignal;
  startTime: number;
  workDeadlineMs?: number;
}): Promise<VerificationOutcome> {
  const t0 = Date.now();

  // Safety check: ensure remaining time is sufficient for a model roundtrip
  const elapsedSinceStart = Date.now() - startTime;
  const remainingWorkTime = workDeadlineMs - elapsedSinceStart;

  if (remainingWorkTime < 8000) {
    console.warn(`[Verifier] Skipping verification: insufficient work time remaining (${remainingWorkTime}ms).`);
    return {
      verified: false,
      revised: false,
      finalContent: draftAnswer,
      correctionSummary: 'Verification skipped due to deadline safety margin.',
      elapsedMs: Date.now() - t0,
    };
  }

  if (abortSignal?.aborted) {
    return {
      verified: false,
      revised: false,
      finalContent: draftAnswer,
      elapsedMs: Date.now() - t0,
    };
  }

  try {
    const verifierSystemPrompt = `You are the NovaChat Answer Verification Engine.
Your job is to rigorously review the draft response to the user's prompt (Task Category: ${taskType}).

AUDIT CHECKLIST:
1. Mathematics/Arithmetic: Check every calculation, step, and formula for exact accuracy.
2. Coding/Engineering: Check for syntax bugs, undefined references, type mismatches, missing imports, unhandled edge cases, and ensure clean markdown code blocks.
3. Constraint Satisfaction: Ensure every specific requirement, format, and constraint in the user's prompt is completely addressed.
4. Logical Consistency: Ensure no contradictions or unsupported claims exist.
5. Tone & Safety: Maintain warm, natural clarity without robotic disclaimers or chain-of-thought dumps.

DECISION PROTOCOL:
- If the draft answer is already correct, complete, and high-quality: Output EXACTLY the string: "[VERIFIED_ACCURATE]" with nothing else.
- If you detect any error, calculation mistake, missed constraint, or critical bug: Output the corrected, polished, complete final user-facing response ready to be delivered directly to the user. Do NOT include preambles, meta-commentary, or review marks. Provide the complete revised answer directly.`;

    const verificationMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: verifierSystemPrompt },
      {
        role: 'user',
        content: `USER PROMPT:\n"""\n${userPrompt}\n"""\n\nDRAFT PROPOSED ANSWER:\n"""\n${draftAnswer}\n"""\n\nPerform verification audit:`,
      },
    ];

    const createParams: any = {
      model,
      messages: verificationMessages,
      max_tokens: 3072,
      temperature: 0.2, // Low temperature for strict audit fidelity
    };
    if (supportsGroqReasoningEffort(model)) {
      createParams.reasoning_effort = 'high';
    }

    const verificationCompletion = await groqClient.chat.completions.create(createParams);

    const verificationOutput = verificationCompletion?.choices[0]?.message?.content?.trim();

    if (!verificationOutput || verificationOutput.includes('[VERIFIED_ACCURATE]')) {
      return {
        verified: true,
        revised: false,
        finalContent: draftAnswer,
        elapsedMs: Date.now() - t0,
      };
    }

    // Meaningful revision was provided
    return {
      verified: true,
      revised: true,
      finalContent: verificationOutput,
      correctionSummary: 'Self-verification detected and corrected flaws in draft response.',
      elapsedMs: Date.now() - t0,
    };
  } catch (err: any) {
    console.warn('[Verifier] Verification pass failed or timed out; falling back to initial draft:', err.message);
    return {
      verified: false,
      revised: false,
      finalContent: draftAnswer,
      correctionSummary: `Verification skipped: ${err.message}`,
      elapsedMs: Date.now() - t0,
    };
  }
}
