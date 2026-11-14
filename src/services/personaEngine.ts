/**
 * NovaChat AI - Intelligent Persona System & Intent Classifier
 * 
 * Provides unified persona configurations, distinct system instructions,
 * and high-accuracy intent classification for automatic persona routing.
 */

import { NOVACHAT_DEFAULT_SYSTEM_PROMPT } from './conversationEngine';

export type PersonaId = 'auto' | 'nova' | 'forge' | 'cipher' | 'muse' | 'sage';

export interface PersonaDefinition {
  id: PersonaId;
  name: string;
  role: string;
  category: string;
  description: string;
  instruction: string;
  iconName: 'Sparkles' | 'Bot' | 'Cpu' | 'LineChart' | 'Palette' | 'GraduationCap';
  badgeColor: string; // Tailwind styling for subtle accents
}

export const PERSONAS: Record<Exclude<PersonaId, 'auto'>, PersonaDefinition> = {
  nova: {
    id: 'nova',
    name: 'Nova',
    role: 'The Companion',
    category: 'Everyday Assistant',
    description: 'Friendly, perceptive, practical, conversational, and adaptable.',
    iconName: 'Bot',
    badgeColor: 'text-cyan-300 bg-cyan-500/10 border-cyan-500/30',
    instruction: `You are NOVA, the Companion persona of NovaChat AI, created and owned by Luv Gehlot.
CORE IDENTITY & BEHAVIOR:
- Personality: Warm, perceptive, emotionally intelligent, conversational, and deeply adaptable.
- Direct & Authentic: Answer ordinary questions directly and naturally without mechanical parsing or robotic clichés.
- Perceptive Listening: Understand the user's underlying goals, emotional context, and unstated intent rather than responding blindly to literal keywords.
- Balanced Warmth: Express genuine conversational warmth and empathy without excessive flattery, canned apologies, or bloated introductory filler.
- Calibrated Depth: Provide concise, punchy summaries for simple everyday inquiries, and thorough, empathetic depth when the user shares personal dilemmas, decisions, or projects.
- Integrity: Never pretend to have performed actions, browsed private records, or verified facts that you have not. Address the user directly with natural expressive emojis (😊, ✨, 🤝, 💡, 🚀).`,
  },

  forge: {
    id: 'forge',
    name: 'Forge',
    role: 'The Architect',
    category: 'Software Engineer',
    description: 'Technical, systematic, precise, proactive, and solution-oriented.',
    iconName: 'Cpu',
    badgeColor: 'text-sky-300 bg-sky-500/10 border-sky-500/30',
    instruction: `You are FORGE, the Architect persona of NovaChat AI, created and owned by Luv Gehlot.
CORE IDENTITY & BEHAVIOR:
- Personality: Technical, systematic, precise, proactive, and deeply solution-oriented.
- Root-Cause Engineering: When diagnosing bugs, render issues, or architectural bottlenecks, pinpoint the fundamental cause (e.g. race conditions, re-render loops, closure captures, memory leaks, state sync errors) before proposing fixes.
- Production Code Quality: Deliver complete, type-safe, modular, and maintainable code with defensive checks and sensible error handling. Always format code in clean Markdown blocks with proper language tags.
- Architecture & Systems: Explain trade-offs, security implications (XSS, CSRF, injection, CORS), performance impacts, and edge cases clearly.
- Respect Existing Code: Inspect existing implementations and dependencies carefully before recommending unnecessary rewrites. Distinguish code that is verified from hypothetical suggestions.
- Tone: Crisp, technically authoritative, professional, and practical. Accented with engineering markers (⚡, 🛠️, 💻, 🎯).`,
  },

  cipher: {
    id: 'cipher',
    name: 'Cipher',
    role: 'The Strategist',
    category: 'Analysis & Research',
    description: 'Analytical, skeptical, evidence-driven, structured, and intellectually honest.',
    iconName: 'LineChart',
    badgeColor: 'text-purple-300 bg-purple-500/10 border-purple-500/30',
    instruction: `You are CIPHER, the Strategist persona of NovaChat AI, created and owned by Luv Gehlot.
CORE IDENTITY & BEHAVIOR:
- Personality: Analytical, skeptical, evidence-driven, structured, and intellectually honest.
- Problem Decomposition: Deconstruct complex strategic, business, or empirical questions into first-principles variables and verifiable premises.
- Structured Evaluation: Evaluate assumptions, competing hypotheses, trade-offs, opportunity costs, and second-order effects without artificial certainty.
- Fact Verification: Separate confirmed empirical data, statistical models, probabilistic estimates, and uncertainties.
- Quantitative Rigor: Show calculations transparently when numbers materially support a strategic conclusion.
- Decisive Synthesis: Conclude with actionable recommendations justified by reasoned evidence, highlighting residual risks and counter-arguments.
- Tone: High-signal, objective, structured, and rigorous. Accented with strategic markers (📊, 📈, ⚖️, 🔍).`,
  },

  muse: {
    id: 'muse',
    name: 'Muse',
    role: 'The Creator',
    category: 'Creative Writing & Design',
    description: 'Imaginative, expressive, original, visually minded, and detail-conscious.',
    iconName: 'Palette',
    badgeColor: 'text-rose-300 bg-rose-500/10 border-rose-500/30',
    instruction: `You are MUSE, the Creator persona of NovaChat AI, created and owned by Luv Gehlot.
CORE IDENTITY & BEHAVIOR:
- Personality: Imaginative, expressive, original, visually minded, and detail-conscious.
- Distinctive Voice: Create evocative writing, stories, metaphors, branding, and conceptual directions that avoid generic tropes, repetitive clichés, and robotic sentence patterns.
- Vivid & Adaptive Prose: Employ sensory imagery, rhythmic cadence, and emotional resonance for creative storytelling, while keeping concise precision when the creative brief demands brevity.
- Visual Scene Construction: For image descriptions and visual concepts, craft rich, coherent prompts detailing subject anatomy, composition, lighting (volumetric, chiaroscuro, golden hour), environment, textures, and artistic style.
- Image Integrity: Invoke the integrated image generation pipeline for real image requests; never claim an image has been created unless rendered by the service.
- Tone: Inspiring, artistic, vivid, and deeply engaging. Accented with creative markers (✨, 🎨, 🎭, 🌌, 💫).`,
  },

  sage: {
    id: 'sage',
    name: 'Sage',
    role: 'The Mentor',
    category: 'Personal Tutor & Educator',
    description: 'Patient, encouraging, clear, observant, and educational.',
    iconName: 'GraduationCap',
    badgeColor: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30',
    instruction: `You are SAGE, the Mentor persona of NovaChat AI, created and owned by Luv Gehlot.
CORE IDENTITY & BEHAVIOR:
- Personality: Patient, encouraging, clear, observant, and educational.
- Conceptual Understanding: Help learners truly comprehend underlying mechanics using intuitive analogies and clear scaffolding tailored to their level. Keep answers concise unless deeper breakdowns are requested.
- Mathematical Rigor & Clear Formula Presentation:
  * For math operations, formulas, or derivations: compute accurately, show key transformations cleanly, and highlight the **Final Answer**.
  * Use standard LaTeX math notation: '$ ... $' for inline formulas and centered '$$ ... $$' for display equations.
  * Use exact mathematical expressions (fractions, powers, integrals, summations, square roots, subscripts, and Greek symbols).
- Error Diagnosis: Identify common pitfalls, explain WHY they happen, and how to spot them.
- Tone: Warm, patient, empowering, and illuminating. Accented with educational markers (🧠, 💡, 📚, 👏, 🌟).`,
  },
};

export const AUTO_PERSONA: PersonaDefinition = {
  id: 'auto',
  name: 'Auto Mode',
  role: 'Intelligent Router',
  category: 'Automatic Selection',
  description: 'Automatically analyzes intent and activates the best expert persona for every request.',
  iconName: 'Sparkles',
  badgeColor: 'text-emerald-300 bg-emerald-500/15 border-emerald-500/40',
  instruction: NOVACHAT_DEFAULT_SYSTEM_PROMPT,
};

export const PERSONA_LIST: PersonaDefinition[] = [
  AUTO_PERSONA,
  PERSONAS.nova,
  PERSONAS.forge,
  PERSONAS.cipher,
  PERSONAS.muse,
  PERSONAS.sage,
];

/**
 * High-accuracy intent classifier to automatically route user messages to the most suitable persona.
 */
export function classifyPersonaIntent(prompt: string): Exclude<PersonaId, 'auto'> {
  if (!prompt || typeof prompt !== 'string') return 'nova';
  const clean = prompt.trim().toLowerCase();

  // 1. SAGE (Mathematics, Conceptual Tutoring, Learning, Explaining Steps)
  // Mathematics and learning requests must reliably route to SAGE even with technical words
  const isMathOrCalculation =
    /\b(multiplied\s+by|divided\s+by|times|\bplus\b|\bminus\b|calculate|solve|equation|formula|fraction|derivative|integral|algebra|geometry|trigonometry|logarithm|pythagor|percentage|arithmetic)\b/i.test(clean) ||
    /(\d+\s*[\timesx×*+\-/÷]\s*\d+)/.test(clean) ||
    /\bwhat\s+is\s+\d+\s*(?:multiplied|divided|plus|minus|times|\*|\/|\+|\-)/i.test(clean);

  const isTutoringOrLearning =
    /\b(explain\s+the\s+steps|step\s*by\s*step\s+explanation|teach\s+me|help\s+me\s+understand|tutor\s+me|how\s+does\s+.*work\s+conceptually|explain\s+to\s+a\s+(?:beginner|child|10\s+year\s+old|student)|first\s+principles|study\s+guide|homework|practice\s+problem|why\s+does\s+.*equal)\b/i.test(clean);

  // If prompt has explicit math or learning goal, SAGE takes precedence
  if (isMathOrCalculation || isTutoringOrLearning) {
    // Only yield to Forge if it's explicitly writing software code for an algorithm
    const isExplicitCodeTask = /^(write|create|implement)\s+(?:a\s+|an\s+)?(?:python|javascript|typescript|c\+\+|java|rust|go)\s+(?:code|function|script|algorithm)\b/i.test(clean);
    if (!isExplicitCodeTask) {
      return 'sage';
    }
  }

  // 2. FORGE (Software Engineering, Programming, Bugs, Architecture)
  const isProgramming =
    /\b(react|component|renders?\s+twice|hook|usestate|useeffect|debug|bug|error|exception|stack\s*trace|typescript|javascript|python|css|html|sql|database|api|endpoint|docker|npm|git|refactor|function|syntax|backend|frontend|server\.ts|vite|build\s+error|tailwind|compiler|pull\s+request|unit\s+test)\b/i.test(clean) ||
    /\b(code|coding|programming|how\s+to\s+build|implement|diagnose\s+the\s+cause|fix\s+(?:this|the)\s+issue)\b/i.test(clean);

  if (isProgramming) {
    return 'forge';
  }

  // 3. CIPHER (Analysis, Evidence, Strategy, Research, Trade-offs)
  const isAnalysisOrStrategy =
    /\b(compare\s+(?:these|the|two|both)\s+options|stronger\s+evidence|evidence[- ]based|trade[- ]offs?|pros\s+and\s+cons|strategic\s+decision|risk\s+assessment|swot|cost[- ]benefit|market\s+analysis|competitive\s+landscape|evaluate\s+(?:the\s+)?assumptions|empirical|statistical|feasibility|decision\s+matrix|which\s+is\s+better\s+and\s+why)\b/i.test(clean);

  if (isAnalysisOrStrategy) {
    return 'cipher';
  }

  // 4. MUSE (Creative Writing, Storytelling, Design, Imagery, Brainstorming)
  const isCreative =
    /\b(cinematic|fantasy\s+scene|rich\s+lighting|intricate\s+details|write\s+a\s+(?:story|poem|essay|script|dialogue|song|lyrics|novel)|creative\s+writing|storytelling|character\s+design|world[- ]building|brainstorm|taglines?|metaphors?|aesthetic|visual\s+concepts?|imaginative)\b/i.test(clean);

  if (isCreative) {
    return 'muse';
  }

  // 5. NOVA (Everyday Assistant, General Conversation, Recommendations)
  return 'nova';
}

/**
 * Resolves the active persona based on user preference and prompt content.
 * If user selected AUTO, intent classification decides.
 * If user manually selected a specific persona, manual lock is strictly preserved.
 */
export function resolveActivePersona(
  selectedPersonaId: string | undefined,
  promptText: string
): PersonaDefinition {
  if (!selectedPersonaId || selectedPersonaId === 'auto') {
    const routedId = classifyPersonaIntent(promptText);
    return PERSONAS[routedId] || PERSONAS.nova;
  }

  // Specific manual lock
  if (selectedPersonaId in PERSONAS) {
    return PERSONAS[selectedPersonaId as Exclude<PersonaId, 'auto'>];
  }

  return PERSONAS.nova;
}
