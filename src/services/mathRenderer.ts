/**
 * NovaChat AI - Premium Mathematical & KaTeX Rendering Engine
 * 
 * Provides robust math tokenization, delimiter extraction, KaTeX rendering,
 * and streaming resilience without breaking Markdown formatting or currency symbols.
 */

import katex from 'katex';
import DOMPurify from 'dompurify';

export interface ProcessedMathContent {
  textWithPlaceholders: string;
  mathMap: Map<string, { math: string; displayMode: boolean; html: string }>;
}

/**
 * Checks if a matched string between single dollars is likely currency rather than math.
 * Examples of currency: "100", "5.99", "25,000", "0.50"
 */
function isCurrencyString(str: string): boolean {
  const trimmed = str.trim();
  // Pure numbers, decimals, commas (e.g. "100", "99.95", "1,000,000")
  if (/^[\d,]+(?:\.\d{1,4})?$/.test(trimmed)) {
    return true;
  }
  // Common currency mentions like "50 million", "20k"
  if (/^\d+\s*(?:k|m|b|million|billion|thousand)$/i.test(trimmed)) {
    return true;
  }
  return false;
}

/**
 * Safely renders LaTeX formula using KaTeX with graceful fallback.
 */
export function renderKaTeX(latex: string, displayMode: boolean): string {
  const cleanLatex = latex.trim();
  if (!cleanLatex) return '';

  try {
    return katex.renderToString(cleanLatex, {
      displayMode,
      throwOnError: false,
      output: 'htmlAndMathml',
      strict: false,
      trust: false, // Security: never execute untrusted LaTeX commands
    });
  } catch (err: any) {
    // Graceful fallback: render clean code/span rather than crashing
    console.warn('[KaTeX] Error rendering formula:', err?.message || err);
    const escaped = cleanLatex.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return displayMode
      ? `<div class="katex-error my-2 p-2 rounded-lg bg-rose-950/30 text-rose-300 font-mono text-xs overflow-x-auto">${escaped}</div>`
      : `<code class="katex-error text-rose-300 font-mono text-xs">${escaped}</code>`;
  }
}

/**
 * Extracts math equations ($$, \[, $, \() and replaces them with safe placeholder tokens
 * that survive marked.js processing without markdown interference (e.g. underscores as italics).
 */
export function extractMathPlaceholders(text: string): ProcessedMathContent {
  const mathMap = new Map<string, { math: string; displayMode: boolean; html: string }>();
  let tokenCounter = 0;
  let processed = text;

  // 1. Balance open delimiters if response is actively streaming
  // Handle unclosed display math `$$`
  const displayDollarMatches = processed.match(/\$\$/g);
  if (displayDollarMatches && displayDollarMatches.length % 2 !== 0) {
    processed += '$$';
  }

  // Handle unclosed `\[ ... \]`
  const openBracketMatches = processed.match(/\\\[/g);
  const closeBracketMatches = processed.match(/\\\]/g);
  if (openBracketMatches && (!closeBracketMatches || openBracketMatches.length > closeBracketMatches.length)) {
    processed += '\\]';
  }

  // 2. Extract Display Math: `$$...$$`
  processed = processed.replace(/\$\$([\s\S]*?)\$\$/g, (match, equation) => {
    const tokenId = `KATEXBLOCKTOKEN${tokenCounter++}END`;
    const rendered = renderKaTeX(equation, true);
    const wrapped = `<div class="katex-display-wrapper my-3 py-2 px-3.5 rounded-xl bg-[#09112a]/80 border border-[#1b2b5e]/70 overflow-x-auto text-center shadow-xs select-text">${rendered}</div>`;
    mathMap.set(tokenId, { math: equation, displayMode: true, html: wrapped });
    return `\n\n${tokenId}\n\n`;
  });

  // 3. Extract Display Math: `\[...\]`
  processed = processed.replace(/\\\[([\s\S]*?)\\\]/g, (match, equation) => {
    const tokenId = `KATEXBLOCKTOKEN${tokenCounter++}END`;
    const rendered = renderKaTeX(equation, true);
    const wrapped = `<div class="katex-display-wrapper my-3 py-2 px-3.5 rounded-xl bg-[#09112a]/80 border border-[#1b2b5e]/70 overflow-x-auto text-center shadow-xs select-text">${rendered}</div>`;
    mathMap.set(tokenId, { math: equation, displayMode: true, html: wrapped });
    return `\n\n${tokenId}\n\n`;
  });

  // 4. Extract Inline Math: `\(...\)`
  processed = processed.replace(/\\\(([\s\S]*?)\\\)/g, (match, equation) => {
    const tokenId = `KATEXINLINETOKEN${tokenCounter++}END`;
    const rendered = renderKaTeX(equation, false);
    const wrapped = `<span class="katex-inline-wrapper px-0.5 text-cyan-200 select-text">${rendered}</span>`;
    mathMap.set(tokenId, { math: equation, displayMode: false, html: wrapped });
    return tokenId;
  });

  // 5. Extract Inline Math: `$math$`
  // Exclude escaped dollars (\$), currency figures ($100, $5.99), and empty $$.
  processed = processed.replace(/(?<!\\|\$)\$(?!\s|\$)(.+?)(?<!\s|\$)\$(?!\d|\$)/g, (match, equation) => {
    if (isCurrencyString(equation)) {
      return match; // Keep literal currency e.g. $100
    }
    const tokenId = `KATEXINLINETOKEN${tokenCounter++}END`;
    const rendered = renderKaTeX(equation, false);
    const wrapped = `<span class="katex-inline-wrapper px-0.5 text-cyan-200 select-text">${rendered}</span>`;
    mathMap.set(tokenId, { math: equation, displayMode: false, html: wrapped });
    return tokenId;
  });

  return { textWithPlaceholders: processed, mathMap };
}

/**
 * Replaces placeholder tokens in marked HTML output with rendered KaTeX formulas.
 */
export function restoreMathPlaceholders(html: string, mathMap: Map<string, { math: string; displayMode: boolean; html: string }>): string {
  let restored = html;
  for (const [tokenId, item] of mathMap.entries()) {
    // Replace standalone paragraph tokens (<p>___KATEX_BLOCK_X___</p>) with the wrapped div directly
    const pWrappedRegex = new RegExp(`<p>\\s*${tokenId}\\s*<\\/p>`, 'g');
    if (pWrappedRegex.test(restored)) {
      restored = restored.replace(pWrappedRegex, item.html);
    } else {
      restored = restored.split(tokenId).join(item.html);
    }
  }
  return restored;
}

/**
 * Post-processes Markdown HTML to apply Gemini-inspired final answer callouts and table wrapping.
 */
export function enhanceStructuredAnswerHtml(html: string): string {
  let output = html;

  // 1. Wrap <table> elements in horizontal scroll container if not already wrapped
  output = output.replace(/(<table[\s\S]*?<\/table>)/g, (tableHtml) => {
    return `<div class="table-container my-3.5 overflow-x-auto rounded-xl border border-[#1b2b5e]/70 bg-[#070d22]/50 shadow-xs">${tableHtml}</div>`;
  });

  // 2. Identify "Final Answer" headings or bold tags and style them with a tasteful accent border
  // e.g., <h3>Final Answer</h3> or <p><strong>Final Answer:</strong> ...</p>
  output = output.replace(
    /<h([2-4])>(\s*(?:Verified\s+)?Final\s+Answer(?:\s*:)?\s*)<\/h\1>/gi,
    '<div class="final-answer-callout my-4 p-3.5 rounded-xl border-l-4 border-cyan-400 bg-gradient-to-r from-cyan-950/30 to-blue-950/20 shadow-xs text-zinc-100 font-medium"><div class="text-xs uppercase tracking-wider font-mono text-cyan-400 font-semibold mb-1">Final Answer</div>'
  );

  // Close the final answer callout before the next header or at end
  if (output.includes('class="final-answer-callout')) {
    // If we opened a callout div, ensure it gets closed cleanly
    const calloutCount = (output.match(/class="final-answer-callout/g) || []).length;
    for (let i = 0; i < calloutCount; i++) {
      output += '</div>';
    }
  }

  // Also style inline strong labels like <strong>Final Answer:</strong>
  output = output.replace(
    /<p><strong>(\s*(?:Verified\s+)?Final\s+Answer(?:\s*:)?\s*)<\/strong>([\s\S]*?)<\/p>/gi,
    '<div class="final-answer-inline my-3 p-3 rounded-xl border border-cyan-500/30 bg-cyan-950/20 text-zinc-100"><span class="font-semibold text-cyan-300 font-mono text-xs uppercase tracking-wider block mb-1">Final Answer</span><div class="text-sm">$2</div></div>'
  );

  return output;
}

let purifyInstance: any = null;

function getPurifyInstance() {
  if (purifyInstance) return purifyInstance;
  try {
    if (typeof window !== 'undefined') {
      purifyInstance = typeof (DOMPurify as any) === 'function' ? (DOMPurify as any)(window) : DOMPurify;
    } else if (typeof (DOMPurify as any)?.sanitize === 'function') {
      purifyInstance = DOMPurify;
    } else {
      // In Node.js testing environment without full window object
      purifyInstance = {
        sanitize: (dirty: string) => {
          return dirty
            .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
            .replace(/\bon\w+\s*=\s*(["'])[\s\S]*?\1/gi, '')
            .replace(/\bon\w+\s*=\s*[^>\s]+/gi, '')
            .replace(/href\s*=\s*(["'])javascript:[\s\S]*?\1/gi, 'href="#"');
        },
      };
    }
  } catch {
    purifyInstance = {
      sanitize: (dirty: string) => dirty,
    };
  }
  return purifyInstance;
}

/**
 * Sanitizes generated HTML securely to guard against XSS.
 * Allows safe KaTeX MathML tags and custom citation chips.
 */
export function sanitizeRenderedHtml(html: string): string {
  const purify = getPurifyInstance();
  return purify.sanitize(html, {
    ALLOWED_TAGS: [
      'div', 'span', 'p', 'br', 'hr',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'strong', 'b', 'em', 'i', 'u', 's', 'del', 'mark',
      'ul', 'ol', 'li',
      'blockquote', 'pre', 'code',
      'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
      'a', 'img',
      // KaTeX MathML & SVG tags
      'math', 'semantics', 'annotation', 'annotation-xml',
      'mrow', 'mi', 'mn', 'mo', 'ms', 'mspace', 'mtext',
      'msup', 'msub', 'msubsup',
      'mfrac', 'mroot', 'msqrt',
      'mtable', 'mtr', 'mtd',
      'munder', 'mover', 'munderover',
      'mstyle', 'merror', 'mpadded', 'mphantom',
      'svg', 'path', 'g', 'line', 'circle',
    ],
    ALLOWED_ATTR: [
      'class', 'id', 'style', 'title', 'aria-hidden', 'role',
      'href', 'target', 'rel',
      'src', 'alt', 'width', 'height',
      // MathML & SVG attributes
      'mathvariant', 'encoding', 'display', 'viewBox', 'd', 'fill', 'stroke',
    ],
    ALLOW_DATA_ATTR: false,
  });
}
