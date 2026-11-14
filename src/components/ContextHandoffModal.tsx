import React, { useState, useEffect } from 'react';
import { Sparkles, MessageSquare, Plus, Check, X, ArrowRight, Loader2, ShieldCheck, FileText } from 'lucide-react';
import { soundEffects } from '../services/soundEffects';

interface ContextHandoffModalProps {
  isOpen: boolean;
  onClose: () => void;
  originalTitle: string;
  originalMessagesCount: number;
  initialSummary: string;
  isGeneratingSummary: boolean;
  onConfirmHandoff: (customSummary: string) => void;
  onStartBlankChat: () => void;
}

export const ContextHandoffModal: React.FC<ContextHandoffModalProps> = ({
  isOpen,
  onClose,
  originalTitle,
  originalMessagesCount,
  initialSummary,
  isGeneratingSummary,
  onConfirmHandoff,
  onStartBlankChat,
}) => {
  const [summaryText, setSummaryText] = useState(initialSummary);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    setSummaryText(initialSummary);
  }, [initialSummary]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-xl rounded-3xl bg-[#091129] border border-[#203268] shadow-2xl p-6 text-zinc-100 flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Start New Chat with Context</h3>
              <p className="text-xs text-zinc-400">
                Continue your discussion seamlessly without carrying oversized token weights
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              soundEffects.playClick();
              onClose();
            }}
            className="p-1.5 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800/60 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Source Chat Context Pill */}
        <div className="mt-4 p-3 rounded-2xl bg-[#0e193c]/70 border border-[#1d2d5e] flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-zinc-300 truncate">
            <FileText className="w-4 h-4 text-cyan-400 shrink-0" />
            <span className="font-semibold text-white truncate max-w-[240px] sm:max-w-xs">
              "{originalTitle}"
            </span>
            <span className="text-zinc-500">·</span>
            <span className="text-zinc-400 font-mono text-[11px] shrink-0">
              {originalMessagesCount} turns
            </span>
          </div>
          <span className="text-[11px] text-cyan-300 shrink-0 font-medium bg-cyan-950/60 px-2 py-0.5 rounded-full border border-cyan-800/50">
            Saved to History
          </span>
        </div>

        {/* Generated Continuation Summary Section */}
        <div className="flex-1 overflow-y-auto my-4 space-y-2">
          <div className="flex items-center justify-between text-xs font-medium text-zinc-300">
            <span>Carried Context Brief:</span>
            {!isGeneratingSummary && (
              <button
                type="button"
                onClick={() => setIsEditing(!isEditing)}
                className="text-[11px] text-cyan-400 hover:text-cyan-300 transition-colors cursor-pointer"
              >
                {isEditing ? 'Preview Summary' : 'Edit Brief'}
              </button>
            )}
          </div>

          {isGeneratingSummary ? (
            <div className="p-8 rounded-2xl bg-[#0a122e]/80 border border-[#1b2b5c] flex flex-col items-center justify-center text-center gap-3">
              <Loader2 className="w-6 h-6 text-cyan-400 animate-spin" />
              <p className="text-xs text-zinc-300 font-medium">
                Synthesizing essential goals, technical choices, and active context...
              </p>
            </div>
          ) : isEditing ? (
            <textarea
              rows={8}
              value={summaryText}
              onChange={(e) => setSummaryText(e.target.value)}
              className="w-full rounded-2xl bg-[#080e24] border border-[#1f2f63] p-3 text-xs font-mono text-zinc-200 focus:outline-none focus:border-cyan-500/60 resize-none leading-relaxed"
              placeholder="Edit the context carried into the new chat..."
            />
          ) : (
            <div className="p-3.5 rounded-2xl bg-[#080e24]/90 border border-[#1b2b5c] text-xs font-mono text-zinc-300 whitespace-pre-wrap max-h-56 overflow-y-auto leading-relaxed select-text">
              {summaryText || 'Generating context brief...'}
            </div>
          )}

          <div className="flex items-center gap-1.5 text-[11px] text-zinc-400 px-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>
              Your original conversation will remain completely untouched and accessible in the sidebar.
            </span>
          </div>
        </div>

        {/* Modal Action Buttons */}
        <div className="pt-3 border-t border-zinc-800/80 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => {
              soundEffects.playClick();
              onClose();
              onStartBlankChat();
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-zinc-300 hover:text-white hover:bg-zinc-800/80 text-xs font-medium transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Start Fresh Blank Chat Instead</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                soundEffects.playClick();
                onClose();
              }}
              className="px-3 py-2 rounded-xl text-zinc-400 hover:text-zinc-200 text-xs transition-colors cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="button"
              disabled={isGeneratingSummary || !summaryText.trim()}
              onClick={() => {
                soundEffects.playConfirm();
                onConfirmHandoff(summaryText);
              }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-400 to-blue-600 hover:from-cyan-300 hover:to-blue-500 text-zinc-950 font-bold text-xs shadow-lg shadow-cyan-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Create Chat with Context</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
