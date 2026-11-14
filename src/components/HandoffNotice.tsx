import React, { useState } from 'react';
import { Sparkles, ChevronDown, ChevronUp, ExternalLink, ArrowRight } from 'lucide-react';
import { soundEffects } from '../services/soundEffects';

interface HandoffNoticeProps {
  parentTitle?: string;
  parentSessionId?: string;
  handoffSummary: string;
  onNavigateToParent?: (sessionId: string) => void;
}

export const HandoffNotice: React.FC<HandoffNoticeProps> = ({
  parentTitle,
  parentSessionId,
  handoffSummary,
  onNavigateToParent,
}) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="w-full max-w-3xl mx-auto mb-4 animate-in fade-in duration-200">
      <div className="rounded-2xl bg-gradient-to-r from-[#0b1430]/80 via-[#0e193c]/80 to-[#121636]/80 border border-cyan-500/30 p-3 shadow-md backdrop-blur-md text-xs text-zinc-300">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="p-1 rounded-lg bg-cyan-500/15 text-cyan-400 shrink-0">
              <Sparkles className="w-3.5 h-3.5" />
            </span>
            <span className="font-semibold text-white">Carried Context</span>
            <span className="text-zinc-500">·</span>
            <span className="truncate text-zinc-300 text-[11px]">
              Carried over from <span className="font-medium text-cyan-300">"{parentTitle || 'Previous Chat'}"</span>
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {parentSessionId && onNavigateToParent && (
              <button
                type="button"
                onClick={() => {
                  soundEffects.playSelect();
                  onNavigateToParent(parentSessionId);
                }}
                className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-cyan-300 transition-colors cursor-pointer"
                title="Open previous conversation"
              >
                <span>Original Chat</span>
                <ExternalLink className="w-3 h-3" />
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                soundEffects.playClick();
                setExpanded(!expanded);
              }}
              className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-[#14204d] hover:bg-[#1a2b66] border border-[#203268] text-[11px] text-cyan-300 transition-colors cursor-pointer"
            >
              <span>{expanded ? 'Hide Brief' : 'View Brief'}</span>
              {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          </div>
        </div>

        {expanded && (
          <div className="mt-3 pt-2.5 border-t border-zinc-800/80 font-mono text-[11px] text-zinc-300 whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto bg-[#070d22]/90 p-3 rounded-xl border border-[#1b2b5c]">
            {handoffSummary}
          </div>
        )}
      </div>
    </div>
  );
};
