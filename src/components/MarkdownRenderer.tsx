import React, { useMemo } from 'react';
import { marked } from 'marked';
import { CodeBlock } from './CodeBlock';
import { GroundingSource } from '../types';
import {
  extractMathPlaceholders,
  restoreMathPlaceholders,
  enhanceStructuredAnswerHtml,
  sanitizeRenderedHtml,
} from '../services/mathRenderer';

interface MarkdownRendererProps {
  content: string;
  sources?: GroundingSource[];
  onSaveCodeToMemory?: (code: string, language: string) => void;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, sources, onSaveCodeToMemory }) => {
  const parts = useMemo(() => {
    if (!content) return [];

    let textToParse = content;

    // Handle open code fences during streaming
    const fenceMatches = textToParse.match(/```/g);
    const isInsideFence = fenceMatches && fenceMatches.length % 2 !== 0;
    if (isInsideFence) {
      textToParse += '\n```';
    }

    // Split text by code fence blocks: ```lang\ncode\n```
    const codeBlockRegex = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;
    const elements: { type: 'markdown' | 'code'; content: string; language?: string }[] = [];

    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = codeBlockRegex.exec(textToParse)) !== null) {
      const markdownBefore = textToParse.substring(lastIndex, match.index);
      if (markdownBefore.trim()) {
        elements.push({ type: 'markdown', content: markdownBefore });
      }

      elements.push({
        type: 'code',
        language: match[1] || 'text',
        content: match[2].replace(/\n$/, ''),
      });

      lastIndex = match.index + match[0].length;
    }

    const remaining = textToParse.substring(lastIndex);
    if (remaining.trim()) {
      elements.push({ type: 'markdown', content: remaining });
    }

    return elements;
  }, [content]);

  return (
    <div className="markdown-body select-text space-y-1.5 leading-relaxed">
      {parts.map((part, index) => {
        if (part.type === 'code') {
          return (
            <CodeBlock
              key={`code-${index}`}
              language={part.language || 'text'}
              code={part.content}
              onSaveToMemory={onSaveCodeToMemory}
            />
          );
        }

        // 1. Extract LaTeX mathematical expressions into safe placeholders
        const { textWithPlaceholders, mathMap } = extractMathPlaceholders(part.content);

        // 2. Configure marked renderer for links and images
        const renderer = new marked.Renderer();
        const origImage = renderer.image.bind(renderer);
        renderer.image = (token: any) => {
          const href = typeof token === 'string' ? token : token?.href;
          if (!href || typeof href !== 'string' || href.trim() === '') {
            return '';
          }
          return origImage(token);
        };

        // Open external links safely in new tab
        const origLink = renderer.link.bind(renderer);
        renderer.link = (token: any) => {
          const href = typeof token === 'string' ? token : token?.href;
          const title = token?.title ? ` title="${token.title}"` : '';
          const text = token?.text || href;
          return `<a href="${href}" target="_blank" rel="noopener noreferrer"${title} class="text-cyan-400 hover:text-cyan-300 underline underline-offset-3 font-medium transition-colors">${text}</a>`;
        };

        // 3. Format inline citations like [1], [2], [1, 2] with interactive badge chips
        let processedMarkdown = textWithPlaceholders;
        if (sources && sources.length > 0) {
          processedMarkdown = processedMarkdown.replace(/\[([0-9]+(?:,\s*[0-9]+)*)\]/g, (fullMatch, numsGroup) => {
            const numbers = numsGroup.split(',').map((n: string) => parseInt(n.trim(), 10));
            const validPills = numbers.map((n: number) => {
              const srcIdx = n - 1;
              const src = sources[srcIdx];
              if (src?.web?.uri) {
                let domain = '';
                try {
                  domain = new URL(src.web.uri).hostname.replace('www.', '');
                } catch {
                  domain = 'source';
                }
                const title = src.web.title || domain;
                return `<a href="${src.web.uri}" target="_blank" rel="noopener noreferrer" class="inline-citation-chip inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-cyan-950/80 hover:bg-cyan-800 text-cyan-300 hover:text-white border border-cyan-500/40 hover:border-cyan-400 text-[10px] font-mono font-medium mx-0.5 align-super no-underline shadow-xs transition-colors cursor-pointer" title="${title} (${domain})">${n}</a>`;
              }
              return null;
            }).filter(Boolean);

            if (validPills.length > 0) {
              return validPills.join('');
            }
            return fullMatch;
          });
        }

        // 4. Parse Markdown to HTML
        const rawHtml = marked.parse(processedMarkdown, {
          gfm: true,
          breaks: true,
          renderer,
        }) as string;

        // 5. Restore math placeholders with KaTeX rendered HTML
        const mathRestoredHtml = restoreMathPlaceholders(rawHtml, mathMap);

        // 6. Enhance structured answer presentation (tables, final answer callouts)
        const enhancedHtml = enhanceStructuredAnswerHtml(mathRestoredHtml);

        // 7. Security: Sanitize output HTML
        const safeHtml = sanitizeRenderedHtml(enhancedHtml);

        return (
          <div
            key={`md-${index}`}
            dangerouslySetInnerHTML={{ __html: safeHtml }}
          />
        );
      })}
    </div>
  );
};

