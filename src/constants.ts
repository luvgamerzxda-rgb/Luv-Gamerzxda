import { ModelOption, PersonaOption } from './types';

export const CUSTOM_LOGO_BASE64 = "data:image/png;base64,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";

export const AVAILABLE_MODELS: ModelOption[] = [
  {
    id: 'openai/gpt-oss-120b',
    name: 'NovaChat AI',
    badge: 'Default',
    description: 'Advanced reasoning, code generation, and self-verification powered by GPT-OSS 120B on Groq.',
    supportsSearch: true,
  },
];

import { PERSONA_LIST } from './services/personaEngine';

export const AVAILABLE_PERSONAS: PersonaOption[] = PERSONA_LIST;

export const STARTER_PROMPTS = [
  {
    title: 'Explain Quantum Computing',
    prompt: 'Explain the core principles of quantum computing and superposition as if I am 15 years old.',
    category: 'Science',
    icon: 'Atom',
  },
  {
    title: 'Write a React Hook',
    prompt: 'Write a custom React TypeScript hook `useDebounce` with full type safety and cleanup logic.',
    category: 'Coding',
    icon: 'Code2',
  },
  {
    title: 'Plan a 3-Day Tokyo Itinerary',
    prompt: 'Create a realistic, food-focused 3-day travel itinerary for a first-time visitor to Tokyo.',
    category: 'Travel',
    icon: 'Compass',
  },
  {
    title: 'Compare Vector vs Relational DBs',
    prompt: 'What are the architectural differences between vector databases (e.g. pgvector, Pinecone) and traditional relational databases?',
    category: 'Architecture',
    icon: 'Database',
  },
];
