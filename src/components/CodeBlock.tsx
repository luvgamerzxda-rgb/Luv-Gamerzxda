import React, { useState } from 'react';
import { Check, Copy, BookmarkPlus } from 'lucide-react';
import hljs from 'highlight.js';

interface CodeBlockProps {
  language: string;
  code: string;
  onSaveToMemory?: (code: string, language: string) => void;
}

export const CodeBlock: React.FC<CodeBlockProps> = ({ language, code, onSaveToMemory }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy code:', err);
    }
  };

  const cleanLang = (language || 'text').trim().toLowerCase();
  
  // Highlight with highlight.js
  let highlightedHtml = '';
  try {
    if (cleanLang && hljs.getLanguage(cleanLang)) {
      highlightedHtml = hljs.highlight(code, { language: cleanLang, ignoreIllegals: true }).value;
    } else {
      highlightedHtml = hljs.highlightAuto(code).value;
    }
  } catch {
    highlightedHtml = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  return (
    <div className="relative my-4 rounded-xl overflow-hidden border border-[#1c2c5c] bg-[#060916] shadow-lg">
      <div className="flex items-center justify-between px-4 py-2 bg-[#0a112c] border-b border-[#1c2c5c] text-xs text-zinc-400 font-mono select-none gap-2">
        <span className="font-medium tracking-wide uppercase text-cyan-300">
          {cleanLang || 'code'}
        </span>
        <div className="flex items-center gap-1.5">
          {onSaveToMemory && (
            <button
              type="button"
              onClick={() => onSaveToMemory(code, cleanLang || 'text')}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md hover:bg-[#142254] text-cyan-300 hover:text-cyan-200 transition-colors cursor-pointer"
              title="Save snippet to Code Memory"
            >
              <BookmarkPlus className="w-3.5 h-3.5" />
              <span className="font-sans">Save to Memory</span>
            </button>
          )}
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md hover:bg-[#142254] text-zinc-300 hover:text-zinc-100 transition-colors cursor-pointer"
            title="Copy code"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-cyan-400" />
                <span className="text-cyan-400 font-sans">Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span className="font-sans">Copy code</span>
              </>
            )}
          </button>
        </div>
      </div>
      <div className="p-4 overflow-x-auto text-[13px] leading-relaxed font-mono">
        <pre className="m-0 p-0">
          <code
            className={`hljs ${cleanLang ? `language-${cleanLang}` : ''}`}
            dangerouslySetInnerHTML={{ __html: highlightedHtml }}
          />
        </pre>
      </div>
    </div>
  );
};
