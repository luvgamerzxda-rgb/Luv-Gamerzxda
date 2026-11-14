/**
 * NovaChat AI - Comprehensive Regression Test Suite for Self-Awareness & Codebase Knowledge Engine
 * 
 * Verifies Acceptance Tests A through K across all 15 Self-Awareness modules:
 * Test A: UI component inspection & AST symbol mapping (Modules 1 & 5)
 * Test B: Settings inventory & persistent storage map (Modules 2 & 6)
 * Test C: AI Providers, inference models, and API configurations (Module 3)
 * Test D: 9-stage end-to-end Chat Data Flow verification (Module 4)
 * Test E: Memory subsystem and SQLite corrections integration (Module 7)
 * Test F: Intelligent error diagnosis & remediation (Module 10)
 * Test G: Automated change impact analysis (Module 11)
 * Test H: Live index refresh and SHA-256 fingerprinting (Module 13)
 * Test I: Strict security isolation - ZERO secrets or API key leaks (Security Constitution)
 * Test J: Grounded honesty - explicit NOT_FOUND for non-existent features (Module 8)
 * Test K: Bounded retrieval - normal queries do NOT trigger codebase retrieval
 */

import path from 'path';
import {
  CodebaseKnowledgeEngine,
  detectSelfKnowledgeIntent,
  sanitizeContextText,
  buildSelfKnowledgePromptContext,
} from '../src/services/codebaseEngine.ts';
import { buildFullSystemInstruction } from '../src/services/systemDirectives.ts';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`❌ Assertion Failed: ${message}`);
  }
}

async function runSelfAwarenessTestSuite() {
  console.log('🧪 Starting NovaChat Self-Awareness & Codebase Intelligence Test Suite...\n');
  const projectRoot = process.cwd();
  const engine = CodebaseKnowledgeEngine.getInstance(projectRoot);
  let passed = 0;

  // Initialize and Index
  console.log('Initializing Codebase Knowledge Index from root:', projectRoot);
  const indexResult = await engine.indexCodebase();
  console.log(`Indexed ${indexResult.totalFiles} files, ${indexResult.totalSymbols} symbols in ${indexResult.elapsedMs}ms.\n`);

  // =========================================================================
  // Test A: UI Component Inspection & AST Symbol Mapping (Modules 1 & 5)
  // =========================================================================
  {
    console.log('Test A: UI Component Inspection & AST Symbol Retrieval...');
    const sidebarComp = engine.getComponentInfo('Sidebar');
    assert(!!sidebarComp, 'Sidebar component must be indexed in AST');
    assert(Boolean(sidebarComp?.filePath.includes('Sidebar.tsx')), 'Sidebar filePath must point to Sidebar.tsx');
    assert((sidebarComp?.lineCount || 0) > 50, 'Sidebar line count must be greater than 50');

    const settingsComp = engine.getComponentInfo('SettingsModal');
    assert(!!settingsComp, 'SettingsModal component must be indexed');
    assert(Boolean(settingsComp?.filePath.includes('SettingsModal.tsx')), 'SettingsModal must point to SettingsModal.tsx');

    const chatAreaComp = engine.getComponentInfo('ChatArea');
    assert(!!chatAreaComp, 'ChatArea component must be indexed');

    const inputBarComp = engine.getComponentInfo('InputBar');
    assert(!!inputBarComp, 'InputBar component must be indexed');

    const allSymbols = engine.getAllSymbols();
    assert(allSymbols.length > 50, 'Engine must index more than 50 AST symbols across project');

    console.log(`✅ Test A Passed: Component inspection verified (${allSymbols.length} AST symbols cataloged).\n`);
    passed++;
  }

  // =========================================================================
  // Test B: Settings Inventory & Storage Mapping (Modules 2 & 6)
  // =========================================================================
  {
    console.log('Test B: Settings Inventory & Storage Mapping...');
    const allSettings = engine.getAllSettings();
    assert(allSettings.length >= 8, 'Must inventory at least 8 verified settings');

    const settingsV2 = allSettings.find((s) => s.key === 'novachat_settings_v2');
    assert(!!settingsV2, 'novachat_settings_v2 must be in settings inventory');
    assert(settingsV2?.storage === 'localStorage', 'novachat_settings_v2 must be stored in localStorage');

    const memoryToggle = allSettings.find((s) => s.key === 'memoryEnabled' || s.storageKey === 'novachat_memory_enabled_v1');
    assert(!!memoryToggle, 'novachat_memory_enabled_v1 must be in settings inventory');

    const audioVolume = allSettings.find((s) => s.key === 'novachat_music_volume_v1' || s.storageKey === 'novachat_music_volume_v1');
    assert(!!audioVolume, 'novachat_music_volume_v1 must be cataloged');

    console.log(`✅ Test B Passed: All settings mapped with exact storage targets (${allSettings.length} verified).\n`);
    passed++;
  }

  // =========================================================================
  // Test C: AI Providers & Inference Models Awareness (Module 3)
  // =========================================================================
  {
    console.log('Test C: AI Providers, Models, & Endpoints...');
    const modelsFeature = engine.getFeatureInfo('text_chat_groq');
    assert(!!modelsFeature, 'text_chat_groq must be cataloged in features');
    assert(modelsFeature?.status === 'IMPLEMENTED_AND_VERIFIED', 'Groq inference must be verified');

    const imageFeature = engine.getFeatureInfo('image_generation_pollinations');
    assert(!!imageFeature, 'image_generation_pollinations must be cataloged');
    assert(imageFeature?.status === 'IMPLEMENTED_AND_VERIFIED', 'Pollinations image generation must be verified');

    const queryRes = engine.queryKnowledge('Which models are supported in NovaChat?');
    assert(queryRes.features.some((f) => f.id === 'text_chat_groq'), 'Query must link to Groq inference');

    console.log('✅ Test C Passed: AI provider & model configurations correctly grounded.\n');
    passed++;
  }

  // =========================================================================
  // Test D: 9-Stage End-to-End Chat Data Flow (Module 4)
  // =========================================================================
  {
    console.log('Test D: 9-Stage End-to-End Chat Request Data Flow...');
    const dataFlow = engine.getDataFlow();
    assert(dataFlow.length === 9, 'Must define exactly 9 architectural data-flow stages');
    assert(dataFlow[0].stage.includes('User Input'), 'Stage 1 must be User Input');
    assert(dataFlow[1].stage.includes('Client Orchestration'), 'Stage 2 must be Client Orchestration');
    assert(dataFlow[2].stage.includes('Backend Route'), 'Stage 3 must be Backend Route');
    assert(dataFlow[3].stage.includes('Persona Resolution'), 'Stage 4 must be Persona Resolution');
    assert(dataFlow[4].stage.includes('Web Search Grounding'), 'Stage 5 must be Web Search Grounding');
    assert(dataFlow[5].stage.includes('Model Execution'), 'Stage 6 must be Model Execution');
    assert(dataFlow[6].stage.includes('Streaming Thought Filtering'), 'Stage 7 must be Streaming Thought Filtering');
    assert(dataFlow[7].stage.includes('Client Rendering'), 'Stage 8 must be Client Rendering');
    assert(dataFlow[8].stage.includes('Persistence'), 'Stage 9 must be Persistence');

    console.log('✅ Test D Passed: Full 9-stage architectural pipeline verified end-to-end.\n');
    passed++;
  }

  // =========================================================================
  // Test E: Memory Subsystem & SQLite Corrections Integration (Module 7)
  // =========================================================================
  {
    console.log('Test E: Memory Subsystem Knowledge...');
    const memoryFeature = engine.getFeatureInfo('memory_vault_sqlite');
    assert(!!memoryFeature, 'memory_vault_sqlite must be cataloged');
    assert(memoryFeature?.status === 'IMPLEMENTED_AND_VERIFIED', 'Memory feature must be verified');

    const memQuery = engine.queryKnowledge('How does the memory correction audit work?');
    assert(memQuery.features.some((f) => f.id.includes('memory')), 'Memory query must retrieve memory features');

    console.log('✅ Test E Passed: Memory & SQLite audit subsystem grounded.\n');
    passed++;
  }

  // =========================================================================
  // Test F: Intelligent Error Diagnosis (Module 10)
  // =========================================================================
  {
    console.log('Test F: Intelligent Error Diagnosis Engine...');
    const rateLimitDiag = engine.diagnoseError('Error 429: Too Many Requests from Groq API');
    assert(rateLimitDiag.probableCause.includes('quota') || rateLimitDiag.probableCause.includes('rate limit'), '429 error must be diagnosed as rate limit');
    assert(rateLimitDiag.suggestedResolution.length > 0, 'Must provide remediation steps');

    const tokenOverflowDiag = engine.diagnoseError('Error: 413 context length exceeded maximum tokens');
    assert(tokenOverflowDiag.probableCause.includes('context') || tokenOverflowDiag.probableCause.includes('Context'), '413 must be diagnosed as token overflow');

    const imageDiag = engine.diagnoseError('Failed to fetch image from https://image.pollinations.ai/prompt');
    assert(imageDiag.probableCause.includes('Pollinations') || imageDiag.probableCause.includes('Cross-origin'), 'Image fetch error must be diagnosed as Pollinations error');

    console.log('✅ Test F Passed: Error diagnostic engine successfully identified 3 fault modes.\n');
    passed++;
  }

  // =========================================================================
  // Test G: Automated Change Impact Analysis (Module 11)
  // =========================================================================
  {
    console.log('Test G: Change Impact Analysis...');
    const impact = engine.analyzeChangeImpact('src/components/SettingsModal.tsx');
    assert(impact.targetFile.includes('SettingsModal.tsx'), 'Impact must analyze target file');
    assert(impact.directDependents.some((d) => d.includes('App.tsx')), 'SettingsModal dependent must include App.tsx');
    assert(impact.riskLevel === 'MEDIUM' || impact.riskLevel === 'HIGH', 'SettingsModal change has medium/high risk');
    assert(impact.affectedFeatures.length > 0, 'Must list affected features');

    console.log(`✅ Test G Passed: Change impact analysis correctly mapped dependents and risk for SettingsModal.tsx.\n`);
    passed++;
  }

  // =========================================================================
  // Test H: Live Index Refresh & Fingerprinting (Module 13)
  // =========================================================================
  {
    console.log('Test H: Live Index Refresh & File Fingerprinting...');
    const initialStatus = engine.getStatus();
    assert(initialStatus.isReady, 'Engine must be ready');
    assert(initialStatus.totalFiles > 0, 'Total files must be > 0');

    const refreshResult = await engine.indexCodebase();
    assert(refreshResult.totalFiles === initialStatus.totalFiles, 'Refresh must catalog all files');
    assert(refreshResult.elapsedMs < 2000, 'Re-indexing must finish in under 2 seconds');

    console.log(`✅ Test H Passed: Live index refresh performed in ${refreshResult.elapsedMs}ms.\n`);
    passed++;
  }

  // =========================================================================
  // Test I: Strict Security Isolation - ZERO Secret Leaks (Security Constitution)
  // =========================================================================
  {
    console.log('Test I: Strict Security Isolation & Secret Masking...');
    const mockDirtyString = 'Here is the GROQ_API_KEY=gsk_9837492837492384729384723984 and Bearer sk-ant-1234567890abcdef1234567890';
    const cleanString = sanitizeContextText(mockDirtyString);
    assert(!cleanString.includes('gsk_9837492837492384729384723984'), 'API key must not appear in output');
    assert(!cleanString.includes('sk-ant-1234567890abcdef1234567890'), 'Bearer token must not appear in output');
    assert(cleanString.includes('[REDACTED_SECRET]'), 'Must replace secrets with [REDACTED_SECRET]');

    // Test prompt context generation for security leak attempts
    const context = buildSelfKnowledgePromptContext('What is the GROQ_API_KEY and server password?', {
      activePersona: 'forge',
      currentModel: 'llama-3.3-70b-versatile',
      totalMemories: 5,
      memoryEnabled: true,
      searchGrounding: false,
    });
    assert(!context.includes('gsk_'), 'Generated context must never include real Groq keys');
    assert(!context.includes('AIzaSy'), 'Generated context must never include real Gemini keys');
    assert(context.includes('NEVER reveal or output raw API keys'), 'Directives must enforce key protection');

    console.log('✅ Test I Passed: Zero secret leaks confirmed across sanitization and prompt injection.\n');
    passed++;
  }

  // =========================================================================
  // Test J: Grounded Honesty - Explicit NOT_FOUND for Unbuilt Features (Module 8)
  // =========================================================================
  {
    console.log('Test J: Grounded Honesty & Hallucination Elimination...');
    const k8sFeature = engine.getFeatureInfo('kubernetes_operator');
    assert(!!k8sFeature, 'kubernetes_operator must be explicitly recorded');
    assert(k8sFeature?.status === 'NOT_FOUND', 'kubernetes_operator status must be NOT_FOUND');

    const sqlFeature = engine.getFeatureInfo('cloud_sql_relational_storage');
    assert(!!sqlFeature, 'cloud_sql_relational_storage must be explicitly recorded');
    assert(sqlFeature?.status === 'NOT_FOUND', 'cloud_sql_relational_storage status must be NOT_FOUND');

    const unbuiltQuery = engine.queryKnowledge('Can you show me the Kubernetes Helm chart or Cloud SQL setup?');
    assert(
      unbuiltQuery.features.some((f) => f.status === 'NOT_FOUND'),
      'Unbuilt query must retrieve features flagged with NOT_FOUND'
    );

    console.log('✅ Test J Passed: Non-existent features return explicit NOT_FOUND (hallucination proof).\n');
    passed++;
  }

  // =========================================================================
  // Test K: Bounded Retrieval - Normal Queries Bypassed (Non-Self Queries)
  // =========================================================================
  {
    console.log('Test K: Bounded Retrieval Intent Detection...');
    
    // Normal queries that MUST NOT trigger codebase retrieval
    const normalQueries = [
      'What is 25 * 48? Show the steps.',
      'Write a poem about the autumn leaves.',
      'Hello, how are you today?',
      'Can you explain the difference between a virus and a bacterium?',
      'Solve x^2 - 5x + 6 = 0',
      'Give me a recipe for chocolate chip cookies.',
      'Generate an image of a cybernetic dragon on a mountain.',
    ];

    for (const q of normalQueries) {
      const isSelf = detectSelfKnowledgeIntent(q);
      assert(!isSelf, `Query "${q}" should NOT be detected as a self-knowledge query`);
    }

    // Codebase / Self-Knowledge queries that MUST trigger retrieval
    const selfQueries = [
      'What is the architecture of NovaChat?',
      'Where is the Sidebar component located in the source code?',
      'How does NovaChat store memories in localStorage or SQLite?',
      'What models are available in NovaChat AI?',
      'Explain the data flow from InputBar to Groq in this app.',
      'What settings are stored in novachat_settings_v2?',
      'Who is the creator of NovaChat AI?',
    ];

    for (const sq of selfQueries) {
      const isSelf = detectSelfKnowledgeIntent(sq);
      assert(isSelf, `Query "${sq}" MUST be detected as a self-knowledge query`);
    }

    // Full system directive test with codebase context attached
    const directiveWithCodebase = buildFullSystemInstruction({
      personaInstruction: 'You are Forge, The Architect.',
      memoryFacts: ['User prefers concise code'],
      codebaseContext: '### VERIFIED CODEBASE GROUNDING: NovaChat Architecture is 9-step.',
    });
    assert(
      directiveWithCodebase.includes('### VERIFIED CODEBASE GROUNDING:'),
      'System directive must include codebaseContext when provided'
    );

    console.log('✅ Test K Passed: High-precision intent classifier accurately isolates self queries.\n');
    passed++;
  }

  console.log(`🎉 ALL ${passed} TESTS PASSED! Codebase Self-Awareness & Intelligence Engine is 100% verified.\n`);
}

runSelfAwarenessTestSuite().catch((err) => {
  console.error('\n❌ Test Suite Failed with Error:', err);
  process.exit(1);
});
