import React, { useState } from 'react';
import { GEMINI_LIVE_VOICES } from '../../constants/voices';
import { GeminiVoiceItem } from '../../types/voice';
import { LiveAudioEngine } from '../../services/liveAudioProcessor';
import { Search, X, Volume2, Check, Sparkles, Loader2, AlertCircle } from 'lucide-react';

interface VoiceSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedVoiceId: string;
  onSelectVoice: (voice: GeminiVoiceItem) => void;
}

export const VoiceSelectorModal: React.FC<VoiceSelectorModalProps> = ({
  isOpen,
  onClose,
  selectedVoiceId,
  onSelectVoice,
}) => {
  const [search, setSearch] = useState('');
  const [loadingPreviewId, setLoadingPreviewId] = useState<string | null>(null);
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  if (!isOpen) return null;

  const filteredVoices = GEMINI_LIVE_VOICES.filter(
    (v) =>
      v.name.toLowerCase().includes(search.toLowerCase()) ||
      v.description.toLowerCase().includes(search.toLowerCase())
  );

  const handlePlayPreview = async (e: React.MouseEvent, voice: GeminiVoiceItem) => {
    e.stopPropagation();
    if (loadingPreviewId || playingVoiceId) return;

    setPreviewError(null);
    try {
      setLoadingPreviewId(voice.id);
      const resp = await fetch('/api/live/voice-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voiceName: voice.id }),
      });

      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(data.error || `Preview returned HTTP ${resp.status}`);
      }

      setLoadingPreviewId(null);

      if (data.audio) {
        setPlayingVoiceId(voice.id);
        await LiveAudioEngine.playGoogleVoicePreview(data.audio, data.mimeType || 'audio/wav');
        setPlayingVoiceId(null);
      } else {
        throw new Error('No audio returned for voice preview.');
      }
    } catch (err: any) {
      console.warn('[VoiceSelector] Could not fetch preview:', err);
      setPreviewError(err?.message || 'Could not play voice preview.');
      setLoadingPreviewId(null);
      setPlayingVoiceId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl max-h-[85vh] flex flex-col bg-[#080d1e] border border-blue-500/20 rounded-2xl shadow-2xl shadow-cyan-950/40 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-blue-500/15">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white tracking-wide">
                Gemini Live Voice Selection
              </h2>
              <p className="text-xs text-slate-400">
                Choose from all 30 officially supported Google Gemini Live prebuilt voices
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Input */}
        <div className="px-6 py-3 border-b border-blue-500/10 bg-slate-900/30 space-y-2.5">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search voices by name or style (e.g. Zephyr, Bright, Smooth)..."
              className="w-full pl-10 pr-4 py-2 text-sm bg-slate-950/60 border border-slate-700/50 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400/60 transition-colors"
            />
          </div>
          {previewError && (
            <div className="px-3 py-2 rounded-xl bg-red-950/50 border border-red-500/30 text-xs text-red-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span className="truncate">{previewError}</span>
            </div>
          )}
        </div>

        {/* Voices Grid */}
        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-2 gap-3 custom-scrollbar">
          {filteredVoices.map((voice) => {
            const isSelected = voice.id === selectedVoiceId;
            const isLoading = loadingPreviewId === voice.id;
            const isPlaying = playingVoiceId === voice.id;

            return (
              <div
                key={voice.id}
                onClick={() => onSelectVoice(voice)}
                className={`group relative flex items-center justify-between p-3.5 rounded-xl border cursor-pointer transition-all ${
                  isSelected
                    ? 'bg-cyan-950/40 border-cyan-500/60 shadow-[0_0_15px_rgba(6,182,212,0.15)] ring-1 ring-cyan-400/40'
                    : 'bg-slate-900/40 border-slate-800/80 hover:bg-slate-800/40 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center font-medium text-sm transition-colors ${
                      isSelected
                        ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/30'
                        : 'bg-slate-800 text-slate-300 group-hover:bg-slate-700'
                    }`}
                  >
                    {voice.name[0]}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-white">{voice.name}</span>
                      {voice.recommended && (
                        <span className="text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                          Default
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400">{voice.description}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={(e) => handlePlayPreview(e, voice)}
                    disabled={isLoading || isPlaying}
                    title="Play voice preview sample"
                    className={`p-2 rounded-lg transition-colors ${
                      isPlaying
                        ? 'bg-cyan-500/20 text-cyan-300 animate-pulse'
                        : 'text-slate-400 hover:text-cyan-400 hover:bg-slate-800/80'
                    }`}
                  >
                    {isLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
                    ) : (
                      <Volume2 className="w-4 h-4" />
                    )}
                  </button>

                  {isSelected && (
                    <div className="w-5 h-5 rounded-full bg-cyan-500 flex items-center justify-center text-slate-950">
                      <Check className="w-3 h-3 stroke-[3]" />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-blue-500/15 bg-slate-950/40">
          <p className="text-xs text-slate-400">
            Selected voice preference is automatically applied to your live sessions.
          </p>
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
