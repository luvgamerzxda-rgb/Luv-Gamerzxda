/**
 * Comprehensive Verification Suite for NovaChat Shared Context & Response Consistency
 * Covers all 14 regression & integration criteria.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { buildCanonicalRequestContext, toGeminiRequest, toGroqRequest, classifyProviderError } from '../src/services/canonicalContext.ts';
import { executeCanonicalChatTurn, type SSEEventEmitter } from '../src/services/chatOrchestrator.ts';
import { selectRelevantMemories } from '../src/services/memoryService.ts';
import { parseImportedChatFile } from '../src/services/chatImporter.ts';
import type { CodeMemoryItem, UserMemoryItem } from '../src/types.ts';

dotenv.config();

async function runTests() {
  let passed = 0;
  const check = async (name: string, fn: () => Promise<void> | void) => {
    await fn();
    passed++;
    console.log(`PASS [${passed}]: ${name}`);
  };

  // Sample Text + Code memories & Custom Instructions & Handoff & Image + Text Attachments
  const textMemories: UserMemoryItem[] = [
    { id: 'tm1', fact: 'User prefers TypeScript strict mode and concise explanations.', category: 'preference', pinned: true, enabled: true, createdAt: 1000 },
    { id: 'tm2', fact: 'Disabled fact that must never leak', category: 'general', pinned: true, enabled: false, createdAt: 1001 },
  ];
  const codeMemories: CodeMemoryItem[] = [
    {
      id: 'cm1',
      title: 'Auth Middleware Helper',
      language: 'typescript',
      projectName: 'NovaCore',
      description: 'Validates JWT tokens cleanly',
      tags: ['auth', 'typescript', 'jwt'],
      code: 'export function verifyToken(t: string) { return Boolean(t); }',
      pinned: true,
      enabled: true,
      createdAt: 1002,
      updatedAt: 1002,
    },
    {
      id: 'cm2',
      title: 'Disabled Secret Snippet',
      language: 'typescript',
      tags: ['auth'],
      code: 'const ignored = true;',
      pinned: true,
      enabled: false,
      createdAt: 1003,
      updatedAt: 1003,
    },
  ];

  // 1. Canonical Context Equivalence between Groq & Gemini adapters
  await check('1. Canonical context sent to Groq and Gemini contains identical instructions, persona, memories, search, history, and attachments', () => {
    const selected = selectRelevantMemories({
      prompt: 'Review verifyToken TypeScript auth helper and summarize README.txt plus image',
      memoryEnabled: true,
      textMemories,
      codeMemories,
    });

    const txtBase64 = Buffer.from('Project NovaCore README line 1\nUse strict mode.', 'utf8').toString('base64');
    const imgBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

    const ctx = buildCanonicalRequestContext({
      requestId: 'req_test_1',
      sessionId: 'sess_test_1',
      turnId: 'turn_test_1',
      model: 'openai/gpt-oss-120b',
      thinkMode: true,
      personaId: 'coder',
      customInstruction: 'Always include complexity notes.',
      handoffSummary: '# CONTINUATION CONTEXT\nContinuing NovaCore auth refactor.',
      memoryEnabled: true,
      userMemory: selected.promptStrings,
      searchOutcome: {
        requested: true,
        performed: true,
        payload: {
          provider: 'DuckDuckGo',
          query: 'TypeScript 5.8 release notes',
          results: [{ title: 'TS Docs', url: 'https://www.typescriptlang.org/', snippet: 'Strict compiler improvements.', domain: 'typescriptlang.org' }],
          groundingChunks: [{ web: { uri: 'https://www.typescriptlang.org/', title: 'TS Docs' } }],
        },
      },
      messages: [
        { id: 'm1', role: 'user', content: 'Turn 1: Initialize NovaCore?' },
        { id: 'm2', role: 'assistant', content: 'Turn 2: Initialized NovaCore cleanly.' },
        {
          id: 'm3',
          role: 'user',
          content: 'Turn 3: Inspect README.txt, screenshot.png, and binary.pdf',
          attachments: [
            { id: 'a1', name: 'README.txt', type: 'text/plain', base64: `data:text/plain;base64,${txtBase64}` },
            { id: 'a2', name: 'screenshot.png', type: 'image/png', base64: imgBase64 },
            { id: 'a3', name: 'binary.pdf', type: 'application/pdf', base64: 'JVBERi0xLjQ=' },
          ],
        },
      ],
    });

    const groqReq = toGroqRequest(ctx);
    const geminiReq = toGeminiRequest(ctx);

    // Identical system instructions (persona + customInstruction + handoff + Text Memory + Code Memory + Search Results)
    assert.equal(groqReq.messages[0].role, 'system');
    assert.equal(groqReq.messages[0].content, ctx.systemInstruction);
    assert.ok(geminiReq.config.systemInstruction.includes(ctx.systemInstruction));

    for (const marker of [
      'Always include complexity notes.',
      'Continuing NovaCore auth refactor.',
      'User prefers TypeScript strict mode',
      'Auth Middleware Helper',
      'https://www.typescriptlang.org/',
      ctx.persona.instruction.slice(0, 24),
    ]) {
      assert.ok(String(groqReq.messages[0].content).includes(marker), `Groq missing: ${marker}`);
      assert.ok(geminiReq.config.systemInstruction.includes(marker), `Gemini missing: ${marker}`);
    }

    // Disabled facts must not appear
    assert.ok(!ctx.systemInstruction.includes('Disabled fact that must never leak'));
    assert.ok(!ctx.systemInstruction.includes('const ignored = true'));

    // Identical ordered turns & attachment normalization
    assert.equal(geminiReq.contents.length, 3);
    assert.equal(groqReq.messages.length, 4); // system + 3 turns
    assert.equal(geminiReq.contents[0].role, 'user');
    assert.equal(geminiReq.contents[1].role, 'model');
    assert.equal(geminiReq.contents[2].role, 'user');

    const groqLastText = (groqReq.messages[3].content as any[]).find((p) => p.type === 'text').text;
    const geminiLastText = geminiReq.contents[2].parts.find((p) => 'text' in p).text;
    assert.equal(groqLastText, geminiLastText);
    assert.ok(groqLastText.includes('Project NovaCore README line 1'));
    assert.ok(groqLastText.includes('binary.pdf'));
    assert.ok(ctx.attachmentWarnings.some((w) => w.includes('binary.pdf')));

    // Both include the image attachment cleanly
    assert.ok((groqReq.messages[3].content as any[]).some((p) => p.type === 'image_url'));
    assert.ok(geminiReq.contents[2].parts.some((p) => p.inlineData?.mimeType === 'image/png'));
  });

  // 2 & 3. Same question & persona/custom instructions consistency across Groq & Gemini
  await check('2 & 3. Groq & Gemini primary execution respect identical prompt, persona, and custom instructions', async () => {
    const capturedPrompts: string[] = [];
    const baseInput = {
      sessionId: 'sess_parity',
      turnId: 'turn_parity',
      personaId: 'sage',
      customInstruction: 'CUSTOM_DIRECTIVE_X42: End with QED.',
      messages: [{ id: 'u1', role: 'user', content: 'Explain binary search.' }],
    };

    const mockDeps = (provider: 'groq' | 'gemini') => ({
      getGroqKey: () => 'fake-groq-key',
      getGroqClient: () => ({
        chat: {
          completions: {
            create: async (opts: any) => {
              capturedPrompts.push(opts.messages[0].content);
              return (async function* () {
                yield { choices: [{ delta: { content: 'Groq answer QED.' } }] };
              })();
            },
          },
        },
      }) as any,
      getGeminiKey: () => 'fake-gemini-key',
      getGeminiClient: () => ({
        models: {
          generateContentStream: async (opts: any) => {
            capturedPrompts.push(opts.config.systemInstruction);
            return (async function* () {
              yield { text: 'Gemini answer QED.' };
            })();
          },
        },
      }) as any,
      runWebSearch: async () => ({ provider: 'DuckDuckGo', query: '', results: [], groundingChunks: [] }),
    });

    const groqRes = await executeCanonicalChatTurn({ ...baseInput, model: 'openai/gpt-oss-120b' }, () => {}, mockDeps('groq'));
    const geminiRes = await executeCanonicalChatTurn({ ...baseInput, model: 'gemini-2.5-flash' }, () => {}, mockDeps('gemini'));

    assert.equal(groqRes.providerUsed, 'groq');
    assert.equal(geminiRes.providerUsed, 'gemini');
    assert.ok(capturedPrompts[0].includes('CUSTOM_DIRECTIVE_X42: End with QED.'));
    assert.equal(capturedPrompts[0], capturedPrompts[1]);
  });

  // 4 & 5 & 12. Relevant Text+Code Memory + Web Search shared once (not Gemini Search generating second independent answer)
  await check('4 & 5 & 12. Single web search retrieval shared with Groq and Gemini fallback (no second assistant)', async () => {
    let webSearchCalls = 0;
    let groqSearchSeen = '';
    let geminiSearchSeen = '';

    const events: any[] = [];
    const sharedSearchDeps = {
      getGroqKey: () => 'fake-groq-key',
      getGroqClient: () => ({
        chat: {
          completions: {
            create: async (opts: any) => {
              groqSearchSeen = opts.messages[0].content;
              const err: any = new Error('Simulated 429 rate limit');
              err.status = 429;
              throw err;
            },
          },
        },
      }) as any,
      getGeminiKey: () => 'fake-gemini-key',
      getGeminiClient: () => ({
        models: {
          generateContentStream: async (opts: any) => {
            geminiSearchSeen = opts.config.systemInstruction;
            return (async function* () {
              yield { text: 'Verified answer grounded in [1].' };
            })();
          },
        },
      }) as any,
      runWebSearch: async (q: string) => {
        webSearchCalls++;
        return {
          provider: 'DuckDuckGo',
          query: q,
          results: [{ title: 'Live Fact', url: 'https://example.org/fact', snippet: 'Verified value = 99.9', domain: 'example.org' }],
          groundingChunks: [{ web: { uri: 'https://example.org/fact', title: 'Live Fact' } }],
        };
      },
    };

    const res = await executeCanonicalChatTurn(
      {
        sessionId: 'sess_search',
        turnId: 'turn_search',
        model: 'openai/gpt-oss-120b',
        searchGrounding: true,
        userMemory: ['[TEXT MEMORY] Favorite framework is Vitest'],
        messages: [{ id: 'u1', role: 'user', content: 'search the web for latest TS updates' }],
      },
      (e) => events.push(e),
      sharedSearchDeps,
      { maxIntraGroqAttempts: 1, retryBaseDelayMs: 10 }
    );

    assert.equal(webSearchCalls, 1, 'Search must run ONCE per turn');
    assert.ok(groqSearchSeen.includes('Verified value = 99.9'));
    assert.equal(groqSearchSeen, geminiSearchSeen, 'Gemini fallback must receive exact same search findings as Groq');
    assert.equal(res.providerUsed, 'gemini');
    assert.equal(res.isFallback, true);
    assert.ok(events.some((e) => e.done && e.providerUsed === 'gemini' && e.isFallback === true));

    // Also test unavailable search honesty notice
    const failedSearchCtx = buildCanonicalRequestContext({
      requestId: 'r_fail',
      sessionId: 's_fail',
      turnId: 't_fail',
      messages: [{ role: 'user', content: 'latest news' }],
      searchOutcome: { requested: true, performed: false, unavailableReason: 'Network unreachable' },
    });
    assert.ok(failedSearchCtx.systemInstruction.includes('[LIVE WEB SEARCH STATUS: UNAVAILABLE]'));
    assert.ok(failedSearchCtx.systemInstruction.includes('Do NOT fabricate URLs'));
  });

  // 7. Memory Toggle OFF prevents all Text & Code memories from entering context
  await check('7. Global Memory Toggle OFF prevents Text & Code memories from leaking into canonicalContext', () => {
    const selectedOff = selectRelevantMemories({
      prompt: 'auth',
      memoryEnabled: false,
      textMemories,
      codeMemories,
    });
    assert.equal(selectedOff.promptStrings.length, 0);

    const ctx = buildCanonicalRequestContext({
      requestId: 'r_mem_off',
      sessionId: 's_mem_off',
      turnId: 't_mem_off',
      memoryEnabled: false,
      userMemory: ['[TEXT MEMORY] Secret fact that should not appear'],
      messages: [{ role: 'user', content: 'hi' }],
    });
    assert.equal(ctx.memoryFacts.length, 0);
    assert.ok(!ctx.systemInstruction.includes('Secret fact that should not appear'));
  });

  // 8 & 9. Chat Import creates History only (not memories) and /api/extract-memory does not auto-extract
  await check('8 & 9. Imported conversations stay in Chat History only; no hidden automatic memory extraction', () => {
    const parsed = parseImportedChatFile(
      'User: My secret project codename is Orion-7.\nAssistant: Understood, noted in this chat.',
      'sample.txt',
      []
    );
    assert.equal(parsed.conversations.length, 1);
    assert.equal(parsed.conversations[0].messages.length, 2);
    // App.tsx handleImportSessions only calls setSessions, never setUserMemories or setCodeMemories
    const appSrc = fs.readFileSync('src/App.tsx', 'utf8');
    assert.ok(!appSrc.includes('/api/extract-memory'), 'App.tsx must not automatically call /api/extract-memory');
  });

  // 10. Simulated Groq 429, 5xx, network timeout, and partial-stream streamReset prevent concatenation
  await check('10. Groq 429 / 5xx / timeout / partial-chunk failover reuses CanonicalContext and emits streamReset cleanly', async () => {
    for (const [label, makeErr] of [
      ['429', () => Object.assign(new Error('Rate limit reached'), { status: 429 })],
      ['503', () => Object.assign(new Error('Upstream gateway down'), { status: 503 })],
      ['ETIMEDOUT', () => Object.assign(new Error('Connection timed out'), { code: 'ETIMEDOUT' })],
    ] as Array<[string, () => any]>) {
      const sse: any[] = [];
      const res = await executeCanonicalChatTurn(
        {
          sessionId: `s_${label}`,
          turnId: `t_${label}`,
          model: 'openai/gpt-oss-120b',
          messages: [{ id: 'u1', role: 'user', content: 'Hello failover test' }],
        },
        (e) => sse.push(e),
        {
          getGroqKey: () => 'fake-groq',
          getGroqClient: () => ({
            chat: {
              completions: {
                create: async () => {
                  throw makeErr();
                },
              },
            },
          }) as any,
          getGeminiKey: () => 'fake-gemini',
          getGeminiClient: () => ({
            models: {
              generateContentStream: async () =>
                (async function* () {
                  yield { text: `Clean Gemini response after ${label}.` };
                })(),
            },
          }) as any,
          runWebSearch: async () => ({ provider: 'DuckDuckGo', query: '', results: [], groundingChunks: [] }),
        },
        { maxIntraGroqAttempts: 1, retryBaseDelayMs: 5 }
      );

      assert.equal(res.providerUsed, 'gemini', `${label} should fail over to Gemini`);
      assert.equal(res.isFallback, true);
      assert.equal(res.emittedText, `Clean Gemini response after ${label}.`);
      assert.equal(sse.filter((e) => e.done).length, 1, 'Exactly one completion event');
    }

    // Partial Groq stream failure -> streamReset=true discards partial fragment!
    const partialEvents: any[] = [];
    let clientAccumulatedText = '';
    const partialRes = await executeCanonicalChatTurn(
      {
        sessionId: 's_partial',
        turnId: 't_partial',
        model: 'openai/gpt-oss-120b',
        messages: [{ id: 'u1', role: 'user', content: 'Mid-stream error test' }],
      },
      (e) => {
        partialEvents.push(e);
        if (e.streamReset) clientAccumulatedText = '';
        if (e.text) clientAccumulatedText += e.text;
      },
      {
        getGroqKey: () => 'fake-groq',
        getGroqClient: () => ({
          chat: {
            completions: {
              create: async () =>
                (async function* () {
                  yield { choices: [{ delta: { content: 'Partial broken Groq chunk that must be wiped---' } }] };
                  const e: any = new Error('Socket hang up');
                  e.code = 'ECONNRESET';
                  throw e;
                })(),
            },
          },
        }) as any,
        getGeminiKey: () => 'fake-gemini',
        getGeminiClient: () => ({
          models: {
            generateContentStream: async () =>
              (async function* () {
                yield { text: 'Complete clean Gemini answer only.' };
              })(),
          },
        }) as any,
        runWebSearch: async () => ({ provider: 'DuckDuckGo', query: '', results: [], groundingChunks: [] }),
      },
      { maxIntraGroqAttempts: 1 }
    );

    assert.equal(partialRes.isFallback, true);
    assert.ok(partialEvents.some((e) => e.streamReset === true), 'Must emit streamReset: true when partial text was emitted');
    assert.equal(clientAccumulatedText, 'Complete clean Gemini answer only.', 'Client text must NOT concatenate partial Groq + Gemini!');

    // Verify 401 and AbortError NEVER silently fail over
    assert.equal(classifyProviderError(Object.assign(new Error('Invalid API Key'), { status: 401 })).eligibleForGeminiFailover, false);
    assert.equal(classifyProviderError(Object.assign(new Error('Request aborted'), { name: 'AbortError' })).eligibleForGeminiFailover, false);
  });

  // 11, 13, 14. Live Express endpoints on port 3000 (health, extract-memory disabled, voices, memory/sessions backwards compatibility, live /api/chat)
  await check('11, 13, 14. Live server HTTP integration checks (health, extract-memory, sessions, memory, voices, live /api/chat)', async () => {
    const base = 'http://127.0.0.1:3000';
    const healthResp = await fetch(`${base}/api/health`);
    assert.equal(healthResp.status, 200);
    const health = (await healthResp.json()) as any;
    assert.equal(health.status, 'ok');

    // Auto memory extraction disabled check
    const extractResp = await fetch(`${base}/api/extract-memory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'My name is Alex and I live in Tokyo' }),
    });
    const extractJson = (await extractResp.json()) as any;
    assert.equal(extractJson.disabled, true);
    assert.deepEqual(extractJson.newMemories, []);

    // Nova Live voices endpoint intact (30 voices)
    const voicesResp = await fetch(`${base}/api/live/voices`);
    assert.equal(voicesResp.status, 200);
    const voicesJson = (await voicesResp.json()) as any;
    assert.equal(voicesJson.voices.length, 30);

    // Backwards-compatible memory & sessions read
    const memResp = await fetch(`${base}/api/memory`);
    assert.equal(memResp.status, 200);
    const memJson = (await memResp.json()) as any;
    assert.ok(Array.isArray(memJson.memories));
    assert.ok(Array.isArray(memJson.codeMemories));

    const sessResp = await fetch(`${base}/api/sessions`);
    assert.equal(sessResp.status, 200);
    const sessJson = (await sessResp.json()) as any;
    assert.ok(Array.isArray(sessJson.sessions));

    // Live /api/chat SSE turn (Groq primary)
    const chatResp = await fetch(`${base}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'verify_live_sess',
        turnId: 'verify_live_turn',
        model: 'openai/gpt-oss-120b',
        personaId: 'auto',
        customInstruction: 'Keep answer under 12 words.',
        memoryEnabled: true,
        userMemory: ['[TEXT MEMORY] Test user token: ALPHA-99'],
        messages: [{ role: 'user', content: 'Reply with ONLY the word READY.' }],
      }),
    });
    assert.equal(chatResp.status, 200);
    const rawSse = await chatResp.text();
    const parsedEvents = rawSse
      .split('\n\n')
      .map((l) => l.trim())
      .filter((l) => l.startsWith('data: '))
      .map((l) => JSON.parse(l.slice(6)));

    const doneEvents = parsedEvents.filter((e) => e.done);
    assert.equal(doneEvents.length, 1, 'Live /api/chat must emit exactly one done event');
    assert.ok(doneEvents[0].providerUsed === 'groq' || doneEvents[0].providerUsed === 'gemini');
    assert.equal(doneEvents[0].turnId, 'verify_live_turn');
    assert.ok(doneEvents[0].requestId);
    console.log(`   Live Groq /api/chat: providerUsed=${doneEvents[0].providerUsed}, modelUsed=${doneEvents[0].modelUsed}, isFallback=${doneEvents[0].isFallback}`);

    // Live Gemini text generation check
    const gemChatResp = await fetch(`${base}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'verify_live_gem_sess',
        turnId: 'verify_live_gem_turn',
        model: 'gemini-3-flash-preview',
        personaId: 'coder',
        customInstruction: 'Include the exact token GEMINI_PARITY_OK in your reply.',
        memoryEnabled: true,
        userMemory: ['[TEXT MEMORY] Preferred language is TypeScript'],
        messages: [{ role: 'user', content: 'What is 6 * 7? Follow your instructions.' }],
      }),
    });
    assert.equal(gemChatResp.status, 200);
    const gemSse = (await gemChatResp.text())
      .split('\n\n')
      .map((l) => l.trim())
      .filter((l) => l.startsWith('data: '))
      .map((l) => JSON.parse(l.slice(6)));
    const gemDone = gemSse.filter((e) => e.done);
    const gemText = gemSse.map((e) => e.text || '').join('');
    assert.equal(gemDone.length, 1);
    assert.equal(gemDone[0].providerUsed, 'gemini');
    assert.ok(!gemDone[0].error, `Live Gemini returned error: ${gemDone[0].error}`);
    assert.ok(gemText.includes('42') && gemText.includes('GEMINI_PARITY_OK'), `Unexpected Gemini reply: ${gemText}`);
    console.log(`   Live Gemini /api/chat: providerUsed=${gemDone[0].providerUsed}, modelUsed=${gemDone[0].modelUsed}, text="${gemText.trim().slice(0, 80)}"`);
  });

  // 15. Live image-understanding parity across Groq and Gemini (32x32 solid blue PNG)
  await check('15. Live image-understanding test with both Groq and Gemini using identical 32x32 PNG', async () => {
    const makeSolidPng = (width: number, height: number, r: number, g: number, b: number) => {
      const crcTable = new Uint32Array(256);
      for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
        crcTable[n] = c >>> 0;
      }
      const crc32 = (buf: Buffer) => {
        let c = 0xffffffff;
        for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
        return (c ^ 0xffffffff) >>> 0;
      };
      const mkChunk = (type: string, data: Buffer) => {
        const len = Buffer.alloc(4);
        len.writeUInt32BE(data.length, 0);
        const t = Buffer.from(type, 'ascii');
        const crc = Buffer.alloc(4);
        crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
        return Buffer.concat([len, t, data, crc]);
      };
      const ihdr = Buffer.alloc(13);
      ihdr.writeUInt32BE(width, 0);
      ihdr.writeUInt32BE(height, 4);
      ihdr[8] = 8;
      ihdr[9] = 2;
      const row = 1 + width * 3;
      const raw = Buffer.alloc(row * height);
      for (let y = 0; y < height; y++) {
        const o = y * row;
        raw[o] = 0;
        for (let x = 0; x < width; x++) {
          raw[o + 1 + x * 3] = r;
          raw[o + 1 + x * 3 + 1] = g;
          raw[o + 1 + x * 3 + 2] = b;
        }
      }
      const png = Buffer.concat([
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        mkChunk('IHDR', ihdr),
        mkChunk('IDAT', zlib.deflateSync(raw)),
        mkChunk('IEND', Buffer.alloc(0)),
      ]);
      return 'data:image/png;base64,' + png.toString('base64');
    };

    const bluePng = makeSolidPng(32, 32, 0, 80, 255);
    const base = 'http://127.0.0.1:3000';

    for (const [label, targetModel, expectedProvider] of [
      ['Groq', 'openai/gpt-oss-120b', 'groq'],
      ['Gemini', 'gemini-3-flash-preview', 'gemini'],
    ] as const) {
      const resp = await fetch(`${base}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: `img_sess_${label}`,
          turnId: `img_turn_${label}`,
          model: targetModel,
          messages: [{
            role: 'user',
            content: 'What dominant color is this 32x32 image? Reply with one word only.',
            attachments: [{ id: 'a_blue', name: 'blue.png', type: 'image/png', base64: bluePng }],
          }],
        }),
      });
      assert.equal(resp.status, 200);
      const events = (await resp.text())
        .split('\n\n')
        .map((l) => l.trim())
        .filter((l) => l.startsWith('data: '))
        .map((l) => JSON.parse(l.slice(6)));
      const done = events.find((e) => e.done);
      const text = events.map((e) => e.text || '').join('').trim();
      assert.ok(done && !done.error, `${label} image request failed: ${done?.error || text}`);
      assert.equal(done.providerUsed, expectedProvider);
      assert.ok(/\bblue\b/i.test(text), `${label} should identify blue PNG, got: "${text}"`);
      console.log(`   Live ${label} Vision: modelUsed=${done.modelUsed}, text="${text}"`);
    }
  });

  // 16. UI provider attribution + manual memory persistence roundtrip
  await check('16. ChatArea UI renders accurate provider/fallback badges and manual /api/memory save works cleanly', async () => {
    const chatAreaSrc = fs.readFileSync('src/components/ChatArea.tsx', 'utf8');
    assert.ok(chatAreaSrc.includes('Gemini fallback ·'));
    assert.ok(chatAreaSrc.includes("message.providerUsed === 'gemini' ? 'Gemini' : 'Groq'"));
    assert.ok(chatAreaSrc.includes('Fallback triggered:'));

    const base = 'http://127.0.0.1:3000';
    const initialResp = await fetch(`${base}/api/memory`);
    const initialData = (await initialResp.json()) as any;
    const origMemories = initialData.memories || [];
    const origCode = initialData.codeMemories || [];

    const testMem = {
      id: 'mem-verify-manual',
      fact: 'Manual verification memory item',
      category: 'general',
      pinned: false,
      enabled: true,
      createdAt: Date.now(),
    };
    try {
      const saveResp = await fetch(`${base}/api/memory`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memories: [...origMemories, testMem], codeMemories: origCode }),
      });
      assert.equal(saveResp.status, 200);
      const verifyResp = await fetch(`${base}/api/memory`);
      const verifyData = (await verifyResp.json()) as any;
      assert.ok(verifyData.memories.some((m: any) => m.id === 'mem-verify-manual'));
    } finally {
      await fetch(`${base}/api/memory`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memories: origMemories, codeMemories: origCode }),
      });
    }
  });

  // 17. Simulated Groq 429, 503, ETIMEDOUT & partial stream reset -> REAL LIVE Gemini failover + live memoryEnabled=false & Nova Live check
  await check('17. Simulated Groq 429/503/ETIMEDOUT & partial-stream failover execute REAL live Gemini generation with identical CanonicalContext', async () => {
    const keyCandidates: string[] = [];
    const pushKey = (k?: string) => {
      const t = k?.trim();
      if (t && !keyCandidates.includes(t)) keyCandidates.push(t);
    };
    pushKey(process.env.GEMINI_API_KEY);
    try {
      if (fs.existsSync('.env')) {
        const parsed = dotenv.parse(fs.readFileSync('.env', 'utf8'));
        pushKey(parsed.GEMINI_API_KEY);
        pushKey(parsed.NOVA_LIVE_API_KEY);
      }
    } catch {}
    pushKey(process.env.NOVA_LIVE_API_KEY);
    assert.ok(keyCandidates.length > 0, 'At least one configured Gemini/Nova Live key must exist for live failover test');

    const rejected = new Set<string>();
    const pickActiveKey = () => keyCandidates.find((k) => !rejected.has(k)) || '';
    const mkClient = (key: string) =>
      new GoogleGenAI({
        apiKey: key,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
      });

    for (const [label, makeErr] of [
      ['429', () => Object.assign(new Error('Rate limit reached'), { status: 429 })],
      ['503', () => Object.assign(new Error('Service unavailable'), { status: 503 })],
      ['ETIMEDOUT', () => Object.assign(new Error('Network timeout'), { code: 'ETIMEDOUT' })],
    ] as Array<[string, () => any]>) {
      const sse: any[] = [];
      const res = await executeCanonicalChatTurn(
        {
          sessionId: `live_failover_${label}`,
          turnId: `live_failover_turn_${label}`,
          model: 'openai/gpt-oss-120b',
          customInstruction: `Always include the token LIVE_FAILOVER_${label} verbatim.`,
          memoryEnabled: true,
          userMemory: ['[TEXT MEMORY] Secret verification code is ORBIT-19'],
          messages: [{ id: 'u1', role: 'user', content: 'What is the secret verification code from memory? Reply in one short sentence.' }],
        },
        (e) => sse.push(e),
        {
          getGroqKey: () => 'fake-groq-key',
          getGroqClient: () => ({
            chat: {
              completions: {
                create: async () => {
                  throw makeErr();
                },
              },
            },
          }) as any,
          getGeminiKey: () => pickActiveKey(),
          getGeminiClient: () => {
            const k = pickActiveKey();
            return k ? mkClient(k) : null;
          },
          rotateGeminiClientAfterAuthFailure: (failedKey: string) => {
            if (failedKey) rejected.add(failedKey);
            const nextKey = pickActiveKey();
            return nextKey ? { apiKey: nextKey, client: mkClient(nextKey) } : null;
          },
          runWebSearch: async () => ({ provider: 'DuckDuckGo', query: '', results: [], groundingChunks: [] }),
        },
        { maxIntraGroqAttempts: 1, retryBaseDelayMs: 5 }
      );

      assert.equal(res.providerUsed, 'gemini', `${label}: should fail over to real Gemini`);
      assert.equal(res.isFallback, true, `${label}: must mark isFallback=true`);
      assert.ok(!res.error, `${label}: live Gemini failover returned error: ${res.error}`);
      assert.ok(res.emittedText.includes('ORBIT-19'), `${label}: live Gemini fallback must receive CanonicalContext userMemory (got "${res.emittedText}")`);
      assert.ok(res.emittedText.includes(`LIVE_FAILOVER_${label}`), `${label}: live Gemini fallback must receive customInstruction`);
      console.log(`   Simulated Groq ${label} -> Live Gemini (${res.modelUsed}): "${res.emittedText.trim().slice(0, 70)}"`);
    }

    // Partial stream failure -> streamReset=true wipes partial Groq chunk before real Gemini streams
    let uiAccumulated = '';
    let sawReset = false;
    const partialLiveRes = await executeCanonicalChatTurn(
      {
        sessionId: 'live_partial_reset',
        turnId: 'live_partial_reset_turn',
        model: 'openai/gpt-oss-120b',
        messages: [{ id: 'u1', role: 'user', content: 'Reply with ONLY the word CLEAN_RESET_OK.' }],
      },
      (e) => {
        if (e.streamReset) {
          sawReset = true;
          uiAccumulated = '';
        }
        if (e.text) uiAccumulated += e.text;
      },
      {
        getGroqKey: () => 'fake-groq-key',
        getGroqClient: () => ({
          chat: {
            completions: {
              create: async () =>
                (async function* () {
                  yield { choices: [{ delta: { content: 'CORRUPT_PARTIAL_GROQ_' } }] };
                  const err: any = new Error('Stream reset');
                  err.code = 'ECONNRESET';
                  throw err;
                })(),
            },
          },
        }) as any,
        getGeminiKey: () => pickActiveKey(),
        getGeminiClient: () => {
          const k = pickActiveKey();
          return k ? mkClient(k) : null;
        },
        rotateGeminiClientAfterAuthFailure: (failedKey: string) => {
          if (failedKey) rejected.add(failedKey);
          const nextKey = pickActiveKey();
          return nextKey ? { apiKey: nextKey, client: mkClient(nextKey) } : null;
        },
        runWebSearch: async () => ({ provider: 'DuckDuckGo', query: '', results: [], groundingChunks: [] }),
      },
      { maxIntraGroqAttempts: 1 }
    );
    assert.ok(sawReset, 'Must emit streamReset=true after partial Groq chunk');
    assert.ok(!uiAccumulated.includes('CORRUPT_PARTIAL_GROQ_'), 'Accumulated UI text must not keep partial Groq chunk');
    assert.ok(uiAccumulated.includes('CLEAN_RESET_OK'), `Live Gemini continuation unexpected: ${uiAccumulated}`);
    assert.equal(partialLiveRes.isFallback, true);

    // Live /api/chat memoryEnabled=false check + Nova Live preview endpoint preservation check
    const base = 'http://127.0.0.1:3000';
    const memOffResp = await fetch(`${base}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'mem_off_live_sess',
        turnId: 'mem_off_live_turn',
        model: 'openai/gpt-oss-120b',
        memoryEnabled: false,
        userMemory: ['[TEXT MEMORY] Secret canary code: ZEBRA-777'],
        messages: [{ role: 'user', content: 'Do you know any secret canary code? Reply YES with the code or NO_CODE.' }],
      }),
    });
    assert.equal(memOffResp.status, 200);
    const memOffText = (await memOffResp.text())
      .split('\n\n')
      .map((l) => l.trim())
      .filter((l) => l.startsWith('data: '))
      .map((l) => JSON.parse(l.slice(6)))
      .map((e) => e.text || '')
      .join('');
    assert.ok(!memOffText.includes('ZEBRA-777'), `Memory OFF leaked into live response: ${memOffText}`);

    const previewResp = await fetch(`${base}/api/live/voice-preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ voiceName: 'Zephyr' }),
    });
    assert.equal(previewResp.status, 200, 'Nova Live voice-preview must remain operational');
    const previewJson = (await previewResp.json()) as any;
    assert.ok(typeof previewJson.audio === 'string' && previewJson.audio.length > 1000, 'Voice preview must return real base64 audio');
  });

  console.log(`\nALL ${passed} TEST GROUPS PASSED SUCCESSFULLY.`);
}

runTests().catch((err) => {
  console.error('TEST FAILURE:', err);
  process.exit(1);
});
