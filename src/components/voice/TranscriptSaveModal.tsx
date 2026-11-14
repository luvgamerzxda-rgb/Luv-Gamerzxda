import React from 'react';
import { LiveTranscriptItem } from '../../types/voice';
import { FileText, Trash2, ArrowRight, Clock, User, Sparkles } from 'lucide-react';

interface TranscriptSaveModalProps {
  isOpen: boolean;
  transcripts: LiveTranscriptItem[];
  onSave: () => void;
  onDiscard: () => void;
}

export const TranscriptSaveModal: React.FC<TranscriptSaveModalProps> = ({
  isOpen,
  transcripts,
  onSave,
  onDiscard,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg flex flex-col bg-[#080d1e] border border-blue-500/20 rounded-2xl shadow-2xl shadow-cyan-950/40 overflow-hidden">
        {/* Header */}
        <div className="p-6 pb-4 border-b border-blue-500/15">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white tracking-wide">
                Voice Call Ended
              </h2>
              <p className="text-xs text-slate-400">
                Would you like to save this voice transcript into your current NovaChat conversation?
              </p>
            </div>
          </div>
        </div>

        {/* Transcript Preview */}
        <div className="p-6 max-h-64 overflow-y-auto space-y-3 custom-scrollbar bg-slate-950/40">
          {transcripts.length === 0 ? (
            <p className="text-xs text-slate-500 italic text-center py-4">
              No spoken conversation recorded in this session.
            </p>
          ) : (
            transcripts.map((item) => (
              <div
                key={item.id}
                className={`p-3 rounded-xl border text-xs ${
                  item.role === 'user'
                    ? 'bg-blue-950/30 border-blue-500/20 text-slate-200'
                    : 'bg-purple-950/30 border-purple-500/20 text-slate-200'
                }`}
              >
                <div className="flex items-center justify-between mb-1 text-[10px] text-slate-400 font-medium">
                  <div className="flex items-center gap-1.5">
                    {item.role === 'user' ? (
                      <>
                        <User className="w-3 h-3 text-cyan-400" />
                        <span className="text-cyan-400 font-semibold">You</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3 h-3 text-purple-400" />
                        <span className="text-purple-400 font-semibold">Nova</span>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock className="w-2.5 h-2.5" />
                    <span>{item.timestamp}</span>
                  </div>
                </div>
                <p className="leading-relaxed">{item.text}</p>
              </div>
            ))
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 p-5 border-t border-blue-500/15 bg-slate-900/40">
          <button
            type="button"
            onClick={onDiscard}
            className="flex items-center gap-2 px-4 py-2.5 text-xs font-medium text-slate-400 hover:text-white bg-slate-800/80 hover:bg-slate-800 rounded-xl transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Discard
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={transcripts.length === 0}
            className="flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-slate-950 bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-cyan-300 hover:to-blue-400 rounded-xl shadow-lg shadow-cyan-500/20 disabled:opacity-50 transition-all"
          >
            <span>Save to Current Chat</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
