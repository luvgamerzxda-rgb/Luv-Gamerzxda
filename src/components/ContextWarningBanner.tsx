import React from 'react';
import { AlertTriangle, AlertCircle, Sparkles, MessageSquare, X } from 'lucide-react';
import { soundEffects } from '../services/soundEffects';

interface ContextWarningBannerProps {
  onContinueCurrent: () => void;
  onStartNewWithContext: () => void;
  onDismiss: () => void;
  tokensCount?: number;
  safeBudget?: number;
}

export const ContextWarningBanner: React.FC<ContextWarningBannerProps> = ({
  onContinueCurrent,
  onStartNewWithContext,
  onDismiss,
  tokensCount = 0,
  safeBudget = 5500,
}) => {
  const isOverBudget = tokensCount >= safeBudget;

  const config = isOverBudget
    ? {
        title: 'Safe Request Budget Exceeded',
        bannerBg: 'bg-gradient-to-r from-[#220d18]/95 via-[#160a22]/95 to-[#0b1430]/95 border-rose-500/50',
        iconBg: 'bg-rose-500/15 border-rose-500/30 text-rose-400',
        badge: 'text-rose-300 bg-rose-500/20 border-rose-500/40',
        description:
          'This conversation has reached the provider safe per-request rate limit. To prevent 413 or 429 errors, start a new chat with context continuation or NovaChat will automatically compact older turns.',
        icon: <AlertCircle className="w-4 h-4" />,
      }
    : {
        title: 'Conversation Approaching Safe Token Budget',
        bannerBg: 'bg-gradient-to-r from-[#17142b]/95 via-[#0e1633]/95 to-[#0b1430]/95 border-amber-500/40',
        iconBg: 'bg-amber-500/15 border-amber-500/30 text-amber-400',
        badge: 'text-amber-300 bg-amber-500/20 border-amber-500/30',
        description:
          'This conversation is getting long. To prevent provider rate-limit errors and keep NovaChat responsive, we recommend starting a new chat with carried context.',
        icon: <AlertTriangle className="w-4 h-4" />,
      };

  return (
    <div className="w-full max-w-3xl mx-auto px-4 py-2 animate-in fade-in slide-in-from-top-2 duration-200">
      <div className={`relative rounded-2xl border p-3.5 sm:p-4 shadow-xl backdrop-blur-xl text-zinc-200 ${config.bannerBg}`}>
        <div className="flex items-start gap-3">
          <div className={`p-2 rounded-xl border shrink-0 mt-0.5 ${config.iconBg}`}>
            {config.icon}
          </div>

          <div className="flex-1 min-w-0 pr-6">
            <h4 className="text-xs sm:text-sm font-semibold text-zinc-100 flex flex-wrap items-center gap-2">
              <span>{config.title}</span>
              {tokensCount > 0 && safeBudget > 0 && (
                <span className={`font-mono text-[10px] px-2 py-0.5 rounded-full border ${config.badge}`}>
                  ~{tokensCount.toLocaleString()} / {safeBudget.toLocaleString()} tokens
                </span>
              )}
            </h4>

            <p className="text-xs text-zinc-300 mt-1 leading-relaxed">
              {config.description}
            </p>

            <div className="flex flex-wrap items-center gap-2.5 mt-3">
              <button
                type="button"
                onClick={() => {
                  soundEffects.playSelect();
                  onStartNewWithContext();
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-cyan-400 to-blue-600 hover:from-cyan-300 hover:to-blue-500 text-zinc-950 font-bold text-xs shadow-md transition-all cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Start New Chat with Context</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  soundEffects.playClick();
                  onContinueCurrent();
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#14204d]/80 hover:bg-[#1a2b66] border border-[#23356f] text-zinc-300 hover:text-white text-xs font-medium transition-colors cursor-pointer"
              >
                <MessageSquare className="w-3.5 h-3.5 text-cyan-400" />
                <span>Continue Current Chat</span>
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              soundEffects.playClick();
              onDismiss();
            }}
            className="absolute top-3 right-3 p-1 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 transition-colors cursor-pointer"
            title="Dismiss notice"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
