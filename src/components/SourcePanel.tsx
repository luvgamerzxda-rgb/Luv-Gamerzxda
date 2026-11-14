import React, { useState } from 'react';
import { Search, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react';
import { GroundingSource } from '../types';

interface SourcePanelProps {
  groundingChunks: GroundingSource[];
  webSearchQueries?: string[];
  searchProvider?: string;
  isStreaming?: boolean;
}

export const SourcePanel: React.FC<SourcePanelProps> = ({
  groundingChunks,
  webSearchQueries,
  searchProvider = 'Web Search',
  isStreaming = false,
}) => {
  // Compact by default to preserve chat space while keeping sources directly accessible
  const [isExpanded, setIsExpanded] = useState<boolean>(false);

  // Filter only genuine chunks with valid URIs
  const validChunks = (groundingChunks || []).filter(
    (chunk) => chunk && chunk.web && typeof chunk.web.uri === 'string' && chunk.web.uri.startsWith('http')
  );

  if (validChunks.length === 0) return null;

  const getHostname = (uri: string): string => {
    try {
      return new URL(uri).hostname.replace(/^www\./, '');
    } catch {
      return 'source';
    }
  };

  return (
    <div className="mb-3 rounded-xl bg-[#080e24]/90 border border-[#1b2b5e] p-2 sm:p-2.5 text-xs shadow-sm transition-all backdrop-blur-xs">
      {/* Header Bar */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <div className="flex items-center gap-1.5 font-medium text-cyan-300">
            <Search className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <span>Sources ({validChunks.length})</span>
          </div>

          {searchProvider && (
            <span className="px-2 py-0.5 rounded-full bg-[#0d183d] text-[10px] text-zinc-300 font-mono border border-[#1e326b] shrink-0">
              {searchProvider}
            </span>
          )}

          {isStreaming && (
            <span className="flex items-center gap-1 text-[10px] text-cyan-400 font-mono shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
              Grounded
            </span>
          )}
        </div>

        {/* Expand / Collapse Toggle Button */}
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-1 text-[11px] text-cyan-400 hover:text-cyan-200 transition-colors cursor-pointer px-2 py-0.5 rounded-md hover:bg-[#121f47] border border-cyan-500/20 shrink-0"
        >
          <span>{isExpanded ? 'Collapse' : 'View all'}</span>
          {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
      </div>

      {/* COMPACT DEFAULT VIEW: Clean horizontal scrollable row of source chips with favicons & citation numbers */}
      {!isExpanded && (
        <div className="flex items-center gap-1.5 mt-2 overflow-x-auto no-scrollbar py-0.5">
          {validChunks.map((chunk, cIdx) => {
            const uri = chunk.web!.uri;
            const hostname = getHostname(uri);
            const title = chunk.web!.title || hostname;
            const citationNumber = cIdx + 1;
            const faviconUrl = `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`;

            return (
              <a
                key={cIdx}
                href={uri}
                target="_blank"
                rel="noopener noreferrer"
                className="group inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-[#0b1433] hover:bg-[#12204c] border border-[#19295c] hover:border-cyan-500/50 text-[11px] text-zinc-300 hover:text-cyan-200 transition-all shrink-0 cursor-pointer shadow-xs"
                title={`${title} - ${uri}`}
              >
                <span className="w-3.5 h-3.5 rounded-full bg-cyan-950 text-cyan-300 font-mono font-bold text-[9px] flex items-center justify-center border border-cyan-500/30 shrink-0">
                  {citationNumber}
                </span>
                <img
                  src={faviconUrl}
                  alt=""
                  className="w-3 h-3 object-contain shrink-0"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
                <span className="max-w-[120px] truncate">{hostname}</span>
                <ExternalLink className="w-2.5 h-2.5 opacity-50 group-hover:opacity-100 text-zinc-400 shrink-0" />
              </a>
            );
          })}
        </div>
      )}

      {/* EXPANDED VIEW: Search queries & full source cards */}
      {isExpanded && (
        <div className="mt-2.5 pt-2 border-t border-[#16234f]/60">
          {webSearchQueries && webSearchQueries.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap mb-2 text-[11px] text-zinc-400">
              <span className="text-zinc-400">Queries:</span>
              {webSearchQueries.map((q, idx) => (
                <span
                  key={idx}
                  className="px-2 py-0.5 rounded-md bg-[#0e193f] text-cyan-200/90 font-mono text-[10px] border border-[#1a2c63]"
                >
                  "{q}"
                </span>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {validChunks.map((chunk, cIdx) => {
              const uri = chunk.web!.uri;
              const hostname = getHostname(uri);
              const title = chunk.web!.title || hostname;
              const citationNumber = cIdx + 1;
              const faviconUrl = `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`;

              return (
                <a
                  key={cIdx}
                  href={uri}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-start gap-2 p-2 rounded-lg bg-[#0b1433]/90 hover:bg-[#111f4d] border border-[#19295c] hover:border-cyan-500/40 transition-all text-xs text-zinc-300 hover:text-white cursor-pointer shadow-xs"
                  title={`${title} - ${uri}`}
                >
                  {/* Citation Number Badge */}
                  <span className="shrink-0 w-4 h-4 rounded-full bg-cyan-950 text-cyan-300 font-mono font-bold text-[10px] flex items-center justify-center border border-cyan-500/30 mt-0.5">
                    {citationNumber}
                  </span>

                  {/* Domain Favicon */}
                  <div className="shrink-0 w-4 h-4 rounded mt-0.5 overflow-hidden flex items-center justify-center bg-[#070c20]">
                    <img
                      src={faviconUrl}
                      alt=""
                      className="w-3.5 h-3.5 object-contain"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />
                  </div>

                  {/* Title & Hostname */}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-[12px] text-zinc-200 group-hover:text-cyan-200 line-clamp-1 transition-colors">
                      {title}
                    </div>
                    <div className="text-[10px] text-zinc-400 font-mono flex items-center gap-1 mt-0.5">
                      <span className="truncate">{hostname}</span>
                      <ExternalLink className="w-2.5 h-2.5 shrink-0 opacity-60 group-hover:opacity-100 group-hover:text-cyan-400 transition-opacity" />
                    </div>
                  </div>
                </a>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
