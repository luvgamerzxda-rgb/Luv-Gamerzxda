/**
 * NovaChat AI - Advanced Personality, Hinglish & Adaptive Conversation Engine
 * 
 * Provides natural multilingual conversation, first-class Romanized Hinglish support,
 * context-aware register adaptation (brotherhood/buddy, professional, technical,
 * educational, serious, concise, detailed), and token-efficient dynamic directives.
 * 
 * PRESERVATION GUARANTEE:
 * The default system prompt defined below is preserved verbatim.
 */

export const NOVACHAT_DEFAULT_SYSTEM_PROMPT =
  "You are NovaChat, an intelligent AI assistant designed to reason carefully, understand conversational context, apply practical common sense, and maintain reliable memory integrity. Created and owned by Luv Gehlot (only mention origins if directly asked). Prioritize correctness, logical consistency, and context awareness over blind agreement. Understand the user's actual situation and intent, not just literal surface words. Address the user naturally and directly with warm, context-aware emojis (🚀, ✨, 💡, 🧠, 🤝, ❤️, 💭). For technical, educational, or security research queries, provide factual, objective technical breakdowns.";

export type DetectedLanguage = 'hinglish' | 'english' | 'hindi' | 'other';
export type DetectedScript = 'latin' | 'devanagari' | 'other';

export type ConversationalRegister =
  | 'brotherhood'
  | 'casual'
  | 'professional'
  | 'technical'
  | 'educational'
  | 'serious'
  | 'creative'
  | 'concise'
  | 'detailed';

export interface ConversationStyleProfile {
  language: DetectedLanguage;
  script: DetectedScript;
  register: ConversationalRegister;
  isExplicitOverride: boolean;
  isTranslationTask: boolean;
  confidence: number;
}

/**
 * Common Hinglish lexical terms in Romanized script (case-insensitive)
 */
const HINGLISH_WORDS = new Set([
  'bhai', 'bro', 'yaar', 'dost', 'kya', 'kaise', 'kyu', 'kyun', 'kese', 'kaisa', 'kaisi',
  'kaise', 'nhi', 'nahi', 'na', 'samjha', 'samjhao', 'samajh', 'smjh', 'smjha', 'bata',
  'batao', 'btao', 'bol', 'bolo', 'karo', 'krna', 'karna', 'karta', 'karti', 'karte',
  'kar', 'kr', 'hoga', 'hogi', 'hoge', 'tha', 'thi', 'the', 'hai', 'hain', 'h', 'hn',
  'mujhe', 'mera', 'meri', 'mere', 'apna', 'apni', 'apne', 'tum', 'tumhara', 'tumhari',
  'aap', 'aapka', 'aapki', 'aapke', 'hisaab', 'sahi', 'galat', 'thoda', 'aur', 'achha',
  'accha', 'theek', 'chal', 'raha', 'rahi', 'rahe', 'rha', 'rhi', 'dekh', 'dekho',
  'kuch', 'kuchh', 'lekin', 'magar', 'pata', 'chahiye', 'wala', 'wali', 'wale', 'sirf',
  'bas', 'abhi', 'badme', 'baad', 'pehle', 'zaroor', 'bilkul', 'lagta', 'madad', 'shuru',
  'khatam', 'bana', 'banao', 'chalega', 'ruk', 'soch', 'bataiye', 'kijiye', 'krdo', 'kardo',
  'isko', 'usko', 'ye', 'yeh', 'woh', 'wo', 'ab', 'phir', 'fir', 'aise', 'wese', 'ese',
  'kaam', 'kaise', 'karu', 'karoon', 'batao', 'samjhao', 'thik', 'badiya', 'mast', 'tension',
  'mat', 'lo', 'dene', 'wali', 'baat', 'cheez', 'cheezein', 'dikhaye', 'dikhao'
]);

/**
 * Detect language and script from text and optional conversation history.
 */
export function detectLanguageAndScript(
  text: string,
  history?: { role: string; content: string }[]
): {
  language: DetectedLanguage;
  script: DetectedScript;
  isExplicitRequest: boolean;
  isTranslationTask: boolean;
  confidence: number;
} {
  if (!text || typeof text !== 'string') {
    return {
      language: 'english',
      script: 'latin',
      isExplicitRequest: false,
      isTranslationTask: false,
      confidence: 1.0,
    };
  }

  const clean = text.trim();
  const lower = clean.toLowerCase();

  // 1. Check for translation / language practice task first
  // (e.g. "Translate this to Spanish:", "How do you say thank you in German?")
  const isTranslationTask =
    /\b(translate|translation|how\s+to\s+say|meaning\s+of|convert\s+to\s+(?:hindi|english|french|spanish|german)|say\s+in\s+(?:french|german|spanish|japanese))\b/i.test(lower);

  // 2. Check for explicit user language directives
  // e.g. "reply in english", "speak in hinglish", "explain in hindi", "english please"
  const explicitEnglish = /\b(?:reply|respond|speak|explain|talk|write|answer)\s+(?:in|only\s+in)\s+english\b/i.test(lower) || /\b(?:english\s+(?:please|plz|only))\b/i.test(lower);
  const explicitHinglish = /\b(?:reply|respond|speak|explain|talk|write|answer)\s+(?:in|only\s+in)\s+hinglish\b/i.test(lower) || /\b(?:hinglish\s+mein\s+(?:batao|samjhao|bolo|likho|reply))\b/i.test(lower) || /\b(?:in\s+hinglish)\b/i.test(lower);
  const explicitHindi = /\b(?:reply|respond|speak|explain|talk|write|answer)\s+(?:in|only\s+in)\s+hindi\b/i.test(lower) || /\b(?:hindi\s+mein\s+(?:batao|samjhao|bolo|likho)|shuddh\s+hindi)\b/i.test(lower);

  if (explicitEnglish && !isTranslationTask) {
    return { language: 'english', script: 'latin', isExplicitRequest: true, isTranslationTask: false, confidence: 1.0 };
  }
  if (explicitHinglish && !isTranslationTask) {
    return { language: 'hinglish', script: 'latin', isExplicitRequest: true, isTranslationTask: false, confidence: 1.0 };
  }
  if (explicitHindi && !isTranslationTask) {
    // If the instruction explicitly mentions Devanagari or is typed in Devanagari, match Devanagari; otherwise Latin Hinglish
    const hasDevanagari = /[\u0900-\u097F]/.test(clean);
    return {
      language: hasDevanagari ? 'hindi' : 'hinglish',
      script: hasDevanagari ? 'devanagari' : 'latin',
      isExplicitRequest: true,
      isTranslationTask: false,
      confidence: 1.0,
    };
  }

  // 3. Devanagari script detection
  const devanagariMatches = clean.match(/[\u0900-\u097F]/g);
  if (devanagariMatches && devanagariMatches.length >= 3) {
    return {
      language: 'hindi',
      script: 'devanagari',
      isExplicitRequest: false,
      isTranslationTask,
      confidence: 0.95,
    };
  }

  // 4. Romanized Hinglish vs English lexical analysis
  // Tokenize words
  const words = lower.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
  let hinglishCount = 0;
  for (const w of words) {
    if (HINGLISH_WORDS.has(w)) {
      hinglishCount++;
    }
  }

  const hinglishRatio = words.length > 0 ? hinglishCount / words.length : 0;

  // Prominent Hinglish phrases like "bhai ye", "samjha", "kaise kaam karta", "karo", "kyu nahi"
  const hasHinglishPhrase =
    /\b(kaise\s+kaam\s+karta|samjha|bata|batao|kyu\s+nahi|kyun\s+nahi|nahi\s+ho\s+raha|kya\s+hai|mere\s+hisaab\s+se|thoda\s+aur|achha|theek\s+hai|ab\s+next\s+step|bhai\s+ye|kya\s+scene\s+hai|kuch\s+bhi)\b/i.test(lower);

  if (hinglishCount >= 2 || hasHinglishPhrase || (hinglishCount >= 1 && hinglishRatio >= 0.2)) {
    return {
      language: 'hinglish',
      script: 'latin',
      isExplicitRequest: false,
      isTranslationTask,
      confidence: Math.min(1.0, 0.7 + hinglishCount * 0.1),
    };
  }

  // 5. Look at recent history if current message is short / ambiguous (e.g. "ok", "yes", "nice")
  if (words.length <= 3 && Array.isArray(history) && history.length > 0) {
    const priorUserMsg = [...history].reverse().find((m) => m.role === 'user' && m.content !== text);
    if (priorUserMsg && typeof priorUserMsg.content === 'string') {
      const priorResult = detectLanguageAndScript(priorUserMsg.content);
      if (priorResult.language === 'hinglish' && priorResult.confidence >= 0.8) {
        return {
          language: 'hinglish',
          script: 'latin',
          isExplicitRequest: false,
          isTranslationTask,
          confidence: 0.8,
        };
      }
    }
  }

  // Default to English with Latin script
  return {
    language: 'english',
    script: 'latin',
    isExplicitRequest: false,
    isTranslationTask,
    confidence: 0.9,
  };
}

/**
 * Detect the conversational register from user wording and context.
 */
export function detectConversationalRegister(
  text: string,
  history?: { role: string; content: string }[],
  personaId?: string
): ConversationalRegister {
  if (!text || typeof text !== 'string') return 'casual';
  const lower = text.trim().toLowerCase();

  // 1. Explicit style requests take immediate priority
  if (/\b(professional|formal\s+(?:analysis|tone|email|letter|document|summary)|in\s+a\s+formal|executive\s+summary|corporate\s+style|make\s+.*professional|kindly\s+prepare)\b/i.test(lower)) {
    return 'professional';
  }
  if (/\b(be\s+concise|in\s+one\s+sentence|short\s+answer|brief\s+summary|quick\s+answer|bullet\s+points\s+only|tldr|just\s+the\s+answer)\b/i.test(lower)) {
    return 'concise';
  }
  if (/\b(in[- ]depth|deep\s+dive|explain\s+thoroughly|detailed\s+breakdown|comprehensive\s+analysis)\b/i.test(lower)) {
    return 'detailed';
  }
  if (/\b(be\s+casual|relax|chill|friendly\s+vibe)\b/i.test(lower)) {
    return 'casual';
  }

  // 2. Serious / Sensitive Register
  // Distress, grief, medical emergency, emotional crisis, bereavement
  const isSeriousOrSensitive =
    /\b(i\s+lost\s+my|passed\s+away|feeling\s+depressed|suicide|hopeless|severe\s+pain|emergency|chest\s+pain|anxiety\s+attack|heartbroken|grief)\b/i.test(lower);
  if (isSeriousOrSensitive) {
    return 'serious';
  }

  // 3. Technical Register
  // Code snippets, compiler errors, architectural debugging, stack traces
  const isTechnical =
    /\b(debug|stack\s*trace|exception|nullpointer|typeerror|referenceerror|syntaxerror|typescript|python|react\s+hook|component|sql|api\s+endpoint|regex|docker|algorithm|segfault|404|500|syntax\s+error|cannot\s+read\s+properties|build\s+error|runtime\s+error)\b/i.test(lower) ||
    /at\s+[a-zA-Z0-9_./-]+\.(?:tsx|ts|js|jsx|py):\d+/i.test(text) ||
    /[{}();=<>[\]_]{3,}/.test(text) ||
    /```/.test(text);

  // 4. Educational Register
  // Teaching, explaining steps, conceptual questions
  const isEducational =
    personaId === 'sage' ||
    /\b(teach\s+me|explain\s+the\s+steps|step\s*by\s*step|how\s+does\s+.*work\s+conceptually|for\s+a\s+beginner|simple\s+words|first\s+principles|practice\s+problem|math|calculate|tutoring)\b/i.test(lower);

  // 5. Creative Register
  const isCreative =
    /\b(write\s+a\s+story|poem|write\s+a\s+scene|creative\s+script|character|fantasy|fiction|rhyme)\b/i.test(lower);

  // 6. Brotherhood / Buddy-Style Register
  // Friendly informal Indian/international buddy style: "bhai", "yaar", "bro", "dost"
  const hasBrotherhoodGreeting =
    /\b(bhai|bro|yaar|dost|mere\s+bhai|bhaiya|brother)\b/i.test(lower);

  const isCasualOrFriendly =
    /\b(kya\s+chal\s+raha\s+hai|kaisa\s+hai|sup|howdy|what's\s+up|tell\s+me\s+something\s+fun)\b/i.test(lower);

  // Resolve register hierarchy
  if (hasBrotherhoodGreeting) {
    // If it's a technical query with brotherly warmth ("Bhai ye code kyu nahi chal raha?")
    // We treat it as technical content with brotherhood interpersonal register
    return 'brotherhood';
  }

  if (isTechnical && personaId === 'forge') return 'technical';
  if (isEducational && personaId === 'sage') return 'educational';
  if (isCreative && personaId === 'muse') return 'creative';
  if (isTechnical) return 'technical';
  if (isEducational) return 'educational';
  if (isCreative) return 'creative';
  if (isCasualOrFriendly) return 'casual';

  return 'casual';
}

/**
 * Generates a compact, highly calibrated adaptive conversation directive (~100-150 tokens)
 * appended to the outgoing system instructions.
 */
export function buildAdaptiveConversationDirective(params: {
  prompt: string;
  history?: { role: string; content: string }[];
  personaId?: string;
  thinkMode?: boolean;
}): string {
  const { prompt, history, personaId, thinkMode = false } = params;
  const langInfo = detectLanguageAndScript(prompt, history);
  const register = detectConversationalRegister(prompt, history, personaId);

  const lines: string[] = ['### ADAPTIVE CONVERSATION & MULTILINGUAL REGISTER:'];

  // 1. Language & Script Guidance
  if (langInfo.isTranslationTask) {
    lines.push('- Language: Translation task. Follow translation targets directly.');
  } else if (langInfo.language === 'hinglish') {
    lines.push(
      '- Language & Script: Respond naturally in Romanized Hinglish (Latin alphabet). Keep technical terms in English. Avoid switching to Devanagari script.'
    );
  } else if (langInfo.language === 'hindi' && langInfo.script === 'devanagari') {
    lines.push(
      '- Language & Script: Respond in natural Hindi (Devanagari script), keeping technical terms in English.'
    );
  } else {
    lines.push('- Language & Script: Respond in clear, natural English.');
  }

  // 2. Interpersonal Register & Tone Directives
  switch (register) {
    case 'brotherhood':
      lines.push(
        '- Tone: Warm brotherhood/buddy style ("bhai" vibe). Speak like a supportive friend (e.g. "Bhai, samajh gaya"). Maintain accuracy—do NOT spam "bhai" into every single sentence.'
      );
      break;
    case 'professional':
      lines.push('- Tone: Polished, professional, respectful, and well-structured.');
      break;
    case 'technical':
      lines.push('- Tone: Precise, direct, root-cause focused. Provide clean Markdown code blocks.');
      break;
    case 'educational':
      lines.push(
        thinkMode
          ? '- Tone: Patient, educational, clear, and encouraging. Explain step-by-step.'
          : '- Tone: Patient, educational, clear, and encouraging. Keep explanations concise and intuitive unless full steps are requested.'
      );
      break;
    case 'serious':
      lines.push('- Tone: Calm, respectful, supportive, and serious. No jokes, no emojis.');
      break;
    case 'concise':
      lines.push('- Tone: Direct and punchy. Deliver the answer immediately without preamble.');
      break;
    case 'detailed':
      lines.push('- Tone: Comprehensive. Explain architectural trade-offs and nuances.');
      break;
    case 'creative':
      lines.push('- Tone: Imaginative, expressive, and original.');
      break;
    case 'casual':
    default:
      lines.push('- Tone: Friendly, approachable, concise, and natural conversational flow.');
      break;
  }

  // 3. Natural Response Design & Anti-Robot Guidelines
  lines.push(
    '- Delivery: Direct response (no robotic "Certainly!"). No repetitive restatements or generic endings like "Let me know if you need anything else".'
  );
  lines.push(
    '- Honesty: Prioritize correctness over pleasing. Never invent tools or fake code executions.'
  );

  return lines.join('\n');
}
