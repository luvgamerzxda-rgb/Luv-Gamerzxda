import React, { useState } from 'react';
import { ShieldCheck, AlertTriangle, AlertCircle, Info, ChevronDown, Sparkles } from 'lucide-react';
import { TokenEstimate } from '../types';
import { soundEffects } from '../services/soundEffects';

interface ContextUsageIndicatorProps {
  estimate: TokenEstimate;
  onStartNewChatWithContext?: () => void;
  compact?: boolean;
}

export const ContextUsageIndicator: React.FC<ContextUsageIndicatorProps> = ({
  estimate,
  onStartNewChatWithContext,
  compact = false,
}) => {
  const [showDetails, setShowDetails] = useState(false);

  const getStatusColor = () => {
    switch (estimate.status) {
      case 'critical':
        return {
          pill: 'bg-rose-950/40 border-rose-500/50 text-rose-300 hover:border-rose-400',
          dot: 'bg-rose-400 shadow-[0_0_8px_rgba(244,63,94,0.6)] animate-pulse',
          badge: 'text-rose-400',
          label: 'Critical Limit',
        };
      case 'high':
        return {
          pill: 'bg-amber-950/40 border-amber-500/50 text-amber-300 hover:border-amber-400',
          dot: 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]',
          badge: 'text-amber-400',
          label: 'High Usage',
        };
      case 'approaching':
        return {
          pill: 'bg-indigo-950/40 border-indigo-500/40 text-indigo-300 hover:border-indigo-400',
          dot: 'bg-indigo-400',
          badge: 'text-indigo-400',
          label: 'Approaching Limit',
        };
      case 'normal':
      default:
        return {
          pill: 'bg-[#0b1430]/70 border-[#203268]/70 text-zinc-300 hover:border-cyan-500/40',
          dot: 'bg-cyan-400 shadow-[0_0_6px_rgba(0,217,255,0.4)]',
          badge: 'text-cyan-400',
          label: 'Context Safe',
        };
    }
  };

  const statusStyle = getStatusColor();
  const contextPercentage = Math.min(100, Math.round((estimate.totalInputTokens / (estimate.maxContext || 131072)) * 100));
  const displayPercentage = contextPercentage < 1 && estimate.totalInputTokens > 0 ? '<1%' : `${contextPercentage}%`;

  return (
    <div className="relative inline-block">
      {/* Interactive Trigger Pill */}
      <button
        type="button"
        onClick={() => {
          soundEffects.playClick();
          setShowDetails(!showDetails);
        }}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono border backdrop-blur-md transition-all shadow-sm cursor-pointer ${statusStyle.pill}`}
        title="View Token & Context Budget Details"
        aria-label={`Context budget: ${displayPercentage}, Status: ${statusStyle.label}`}
      >
        <span className={`w-2 h-2 rounded-full ${statusStyle.dot}`} />
        <span className="hidden sm:inline font-sans text-[11px] font-medium">
          {compact ? displayPercentage : statusStyle.label}
        </span>
        <span className="text-[10px] text-zinc-400">
          ~{estimate.totalInputTokens.toLocaleString()} / {estimate.maxContext.toLocaleString()} (est.)
        </span>
        <ChevronDown className={`w-3 h-3 text-zinc-400 transition-transform ${showDetails ? 'rotate-180' : ''}`} />
      </button>

      {/* Popover Details Drawer */}
      {showDetails && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setShowDetails(false)}
          />
          <div className="absolute right-0 top-full mt-2 w-80 rounded-2xl bg-[#091129]/95 border border-[#1f2f63] shadow-2xl p-4 z-50 text-xs backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80 mb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-cyan-400" />
                <span className="font-semibold text-zinc-200">Token & Context Budget</span>
              </div>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${statusStyle.pill}`}>
                {displayPercentage} Used (est.)
              </span>
            </div>

            {/* Progress Bar */}
            <div className="w-full bg-zinc-800/80 h-2 rounded-full overflow-hidden mb-3">
              <div
                className={`h-full transition-all duration-500 rounded-full ${
                  estimate.status === 'critical'
                    ? 'bg-rose-500'
                    : estimate.status === 'high'
                    ? 'bg-amber-400'
                    : estimate.status === 'approaching'
                    ? 'bg-indigo-400'
                    : 'bg-cyan-400'
                }`}
                style={{ width: `${Math.max(displayPercentage === '<1%' ? 1 : 0, contextPercentage)}%` }}
              />
            </div>

            {/* Breakdown List */}
            <div className="space-y-1.5 font-mono text-[11px] text-zinc-300 mb-3">
              <div className="flex justify-between items-center py-0.5">
                <span className="text-zinc-400 font-sans">System & Instructions:</span>
                <span>~{estimate.systemTokens.toLocaleString()} tokens</span>
              </div>
              {estimate.memoryTokens > 0 && (
                <div className="flex justify-between items-center py-0.5">
                  <span className="text-zinc-400 font-sans">Memory Vault:</span>
                  <span>~{estimate.memoryTokens.toLocaleString()} tokens</span>
                </div>
              )}
              <div className="flex justify-between items-center py-0.5">
                <span className="text-zinc-400 font-sans">Chat History:</span>
                <span>~{estimate.historyTokens.toLocaleString()} tokens</span>
              </div>
              {estimate.currentMessageTokens > 0 && (
                <div className="flex justify-between items-center py-0.5">
                  <span className="text-zinc-400 font-sans">Pending Message:</span>
                  <span className="text-cyan-300 font-semibold">~{estimate.currentMessageTokens.toLocaleString()} tokens</span>
                </div>
              )}
              <div className="flex justify-between items-center pt-1.5 border-t border-zinc-800 text-zinc-100 font-semibold">
                <span className="font-sans">Total Estimated Request:</span>
                <span className="text-cyan-400">~{estimate.totalInputTokens.toLocaleString()} (est.)</span>
              </div>
              <div className="flex justify-between items-center text-[10px] text-zinc-400 pt-0.5">
                <span className="font-sans">Model Context Limit:</span>
                <span>{estimate.maxContext.toLocaleString()} tokens</span>
              </div>
              <div className="flex justify-between items-center text-[10px] text-zinc-500">
                <span className="font-sans">Safe Per-Minute Target:</span>
                <span>{estimate.safeBudget.toLocaleString()} tokens/req</span>
              </div>
            </div>

            {/* Explanatory Message */}
            <div className="p-2.5 rounded-xl bg-[#0e183a]/70 border border-[#1b2b5c] text-[11px] text-zinc-300 font-sans leading-relaxed mb-3">
              {estimate.explanation}
            </div>

            {/* Context Handoff Action if nearing limit */}
            {onStartNewChatWithContext && (estimate.status === 'high' || estimate.status === 'critical') && (
              <button
                type="button"
                onClick={() => {
                  soundEffects.playSelect();
                  setShowDetails(false);
                  onStartNewChatWithContext();
                }}
                className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-zinc-950 font-bold text-xs shadow-md transition-all cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Start New Chat with Context</span>
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
};
