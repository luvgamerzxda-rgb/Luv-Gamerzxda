/**
 * NovaChat AI - Unified Master System Directives & Request Prompt Builder
 * 
 * Provides single source of truth for base system instructions,
 * formatting directives, and context assembly across both client
 * and server to prevent prompt duplication and ensure exact token estimation.
 */

import { NOVACHAT_DEFAULT_SYSTEM_PROMPT } from './conversationEngine';

export { NOVACHAT_DEFAULT_SYSTEM_PROMPT };

export const NOVACHAT_CORE_DIRECTIVES = `# MASTER SYSTEM PROMPT: NOVACHAT AI CORE ARCHITECTURE
- Identity: NovaChat AI, created and owned by Luv Gehlot (mention creator only if directly asked).
- Accuracy & Context: Prioritize correctness, logical consistency, stored user memories, and real conversational intent over blind agreement.
- Conciseness: Keep normal answers concise, direct, and conversational; expand depth only when the user asks or Think mode is active.
- Formatting: Use '$...$' (inline) and '$$...$$' (display) for math; language-tagged Markdown blocks for code; clean tables for comparisons; natural emojis where fitting (avoid in formal proofs).
- Strict Output Rule: Never output internal reasoning, scratchpads, or tags like <think>, <thought>, or "Thinking Process:". Deliver only the clean user-facing response.`;

export interface BuildSystemInstructionParams {
  personaInstruction?: string;
  customInstruction?: string;
  memoryFacts?: string[] | string;
  handoffSummary?: string;
  codebaseContext?: string;
  adaptiveDirective?: string;
  searchContext?: string;
  thinkMode?: boolean;
}

/**
 * Builds the canonical system instruction block sent to the AI model.
 * Deduplicates any directives to prevent prompt bloat while preserving
 * both the active persona and any distinct user custom instructions.
 */
export function buildFullSystemInstruction(params: BuildSystemInstructionParams): string {
  const parts: string[] = [];

  // 1. Persona Instruction (User-selected persona, custom prompt, or default prompt)
  const persona = (params.personaInstruction || '').trim();
  if (persona) {
    parts.push(
      `=== ACTIVE PERSONA SYSTEM DIRECTIVES ===\n${persona}\nEmbody this persona's voice, tone, and rules.`
    );
  } else {
    parts.push(NOVACHAT_DEFAULT_SYSTEM_PROMPT);
  }

  // 1b. User Custom Instructions (preserved separately when distinct from persona/default prompt)
  const custom = (params.customInstruction || '').trim();
  const normalizedDefault = NOVACHAT_DEFAULT_SYSTEM_PROMPT.trim();
  if (
    custom &&
    custom !== persona &&
    custom !== normalizedDefault &&
    !persona.includes(custom)
  ) {
    parts.push(`=== USER CUSTOM INSTRUCTIONS ===\n${custom}`);
  }

  // 2. Verified Codebase Knowledge Context (if self-inquiry detected)
  const codebaseCtx = (params.codebaseContext || '').trim();
  if (codebaseCtx) {
    parts.push(codebaseCtx);
  }

  // 3. Adaptive Conversation & Multilingual Layer
  const adaptive = (params.adaptiveDirective || '').trim();
  if (adaptive) {
    parts.push(adaptive);
  }

  // 4. Core Directives (only append if not already present in persona)
  if (!persona.includes('MASTER SYSTEM PROMPT') && !persona.includes('CORE OPERATIONAL DIRECTIVES')) {
    parts.push(NOVACHAT_CORE_DIRECTIVES);
  }

  // 5. User Memories (Memory Vault — Text & Code memories)
  let memoryText = '';
  if (Array.isArray(params.memoryFacts)) {
    const uniqueFacts = Array.from(new Set(params.memoryFacts.map((f) => f.trim()).filter(Boolean)));
    if (uniqueFacts.length > 0) {
      memoryText = uniqueFacts.join('\n');
    }
  } else if (typeof params.memoryFacts === 'string' && params.memoryFacts.trim()) {
    memoryText = params.memoryFacts.trim();
  }

  if (memoryText) {
    parts.push(
      `CROSS-CHAT USER MEMORY & KNOWN PROFILE (Memory Vault):\n${memoryText}\nNaturally tailor your answers according to these remembered facts and saved code context.`
    );
  }

  // 6. Think Mode Deep Systematic Reasoning Protocol (ONLY when explicitly enabled)
  if (params.thinkMode) {
    parts.push(
      `=== THINK MODE ACTIVE: RIGOROUS DEEP REASONING PROTOCOL ===\nDeep reasoning is enabled for this request. Before presenting your response:\n1. Scrutinize underlying assumptions, technical definitions, and mathematical details.\n2. Work through derivations, constraints, and code logic systematically to ensure precision.\n3. Verify edge cases and error conditions before presenting the solution.\n4. Deliver a direct, verified, and complete final response without exposing private internal reasoning.`
    );
  }

  // 7. Handoff Summary (if this chat is a continuation from a previous chat)
  const handoff = (params.handoffSummary || '').trim();
  if (handoff) {
    parts.push(handoff);
  }

  // 8. Shared Search Grounding Context (when search grounding was executed for this turn)
  const searchCtx = (params.searchContext || '').trim();
  if (searchCtx) {
    parts.push(searchCtx);
  }

  return parts.join('\n\n');
}
