import React, { useRef, useState } from 'react';
import {
  Music,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Volume1,
  Upload,
  Trash2,
  Disc,
  AlertCircle,
  Radio,
  Check,
  RotateCcw,
  Sparkles,
  Sliders,
} from 'lucide-react';
import { useBackgroundMusic, DEFAULT_HOME_MENU_TRACK } from '../context/BackgroundMusicContext';

export const BackgroundMusicSettings: React.FC = () => {
  const {
    tracks,
    currentTrack,
    isPlaying,
    isEnabled,
    volume,
    isMuted,
    autoplayBlocked,
    isLoading,
    error,
    isDefaultTrack,
    play,
    togglePlay,
    setVolume,
    toggleMute,
    selectTrack,
    restoreDefaultTrack,
    toggleEnabled,
    uploadUserTrack,
    deleteUserTrackItem,
  } = useBackgroundMusic();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const userTracks = tracks.filter((t) => t.type === 'user');

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadError(null);
    setIsUploading(true);

    try {
      await uploadUserTrack(file);
    } catch (err: any) {
      setUploadError(err.message || 'Failed to import audio file.');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    const mb = bytes / (1024 * 1024);
    if (mb < 1) {
      return `${(bytes / 1024).toFixed(0)} KB`;
    }
    return `${mb.toFixed(1)} MB`;
  };

  const volumePercent = Math.round(volume * 100);

  return (
    <div className="space-y-4 text-zinc-200">
      {/* Master Background Music Switch Card */}
      <div className="p-4 rounded-2xl bg-[#0a112c]/80 border border-[#1c2c5c] flex items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-white flex items-center gap-2 text-xs">
            <Music className="w-4 h-4 text-cyan-400 shrink-0" />
            <span>Background Music</span>
            {isPlaying && isEnabled && (
              <span className="text-[10px] font-mono text-cyan-300">
                · Playing
              </span>
            )}
            {!isPlaying && isEnabled && (
              <span className="text-[10px] font-mono text-zinc-400">
                · Paused
              </span>
            )}
          </div>
          <div className="text-[11px] text-zinc-400 mt-1">
            Calm ambient atmosphere inspired by the PS5 home menu for long chatting sessions.
          </div>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={isEnabled}
          aria-label="Toggle background music"
          onClick={() => toggleEnabled(!isEnabled)}
          className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer focus:outline-none focus:ring-2 focus:ring-cyan-500/40 shrink-0 ${
            isEnabled ? 'bg-cyan-500' : 'bg-[#1a2858]'
          }`}
        >
          <span
            className={`block w-5 h-5 rounded-full bg-white transition-transform shadow-md ${
              isEnabled ? 'translate-x-6' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>

      {/* Autoplay Blocked Notification Banner */}
      {autoplayBlocked && isEnabled && (
        <div className="p-3.5 rounded-2xl bg-amber-500/15 border border-amber-500/35 text-amber-200 text-xs flex items-center justify-between gap-3 animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>Browser autoplay restriction active. Click Play to start listening.</span>
          </div>
          <button
            type="button"
            onClick={play}
            className="px-3.5 py-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs transition-colors shrink-0 cursor-pointer flex items-center gap-1 whitespace-nowrap"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Play Music</span>
          </button>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="p-3 rounded-2xl bg-red-500/15 border border-red-500/35 text-red-200 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Primary Track Controller Card */}
      <div
        className={`p-4 rounded-2xl bg-[#0a112c]/80 border border-[#1c2c5c] transition-opacity ${
          !isEnabled ? 'opacity-50 pointer-events-none' : ''
        }`}
      >
        <div className="flex items-center gap-3.5 mb-4">
          {/* Disc Graphic */}
          <div
            className={`w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-600/25 to-cyan-500/15 border border-cyan-500/35 flex items-center justify-center shrink-0 ${
              isPlaying && isEnabled ? 'animate-[spin_12s_linear_infinite]' : ''
            }`}
          >
            <Disc className="w-6 h-6 text-cyan-400" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-white truncate">
                {currentTrack?.name || 'Home Menu'}
              </span>
              <span className="text-[10px] font-mono text-cyan-300 shrink-0">
                · {isDefaultTrack ? 'PS5 Default' : currentTrack?.type === 'user' ? 'My Music' : 'Ambient'}
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 truncate mt-0.5">
              {currentTrack?.description || (isPlaying ? 'Playing continuously (looping)' : 'Paused')}
            </p>
          </div>

          {/* Quick Play/Pause on Header */}
          <button
            type="button"
            onClick={togglePlay}
            disabled={!isEnabled || isLoading}
            className="p-3 rounded-full bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold transition-all transform hover:scale-105 active:scale-95 shadow-lg shadow-cyan-500/20 disabled:opacity-40 cursor-pointer shrink-0"
            title={isPlaying ? 'Pause' : 'Play'}
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? (
              <Pause className="w-4 h-4 fill-current" />
            ) : (
              <Play className="w-4 h-4 fill-current ml-0.5" />
            )}
          </button>
        </div>

        {/* Volume Slider & Mute Row */}
        <div className="pt-3 border-t border-[#172552] space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-zinc-400 flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-cyan-400" />
              <span>Music Volume</span>
            </span>
            <span className="font-mono text-zinc-200 font-medium tabular-nums">
              {isMuted ? 'Muted' : `${volumePercent}%`}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={toggleMute}
              className={`p-2 rounded-xl transition-colors cursor-pointer ${
                isMuted || volume === 0
                  ? 'text-red-400 bg-red-500/15'
                  : 'text-zinc-400 hover:text-white hover:bg-[#14204d]'
              }`}
              title={isMuted ? 'Unmute' : 'Mute'}
              aria-label={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted || volume === 0 ? (
                <VolumeX className="w-4 h-4" />
              ) : volume < 0.5 ? (
                <Volume1 className="w-4 h-4" />
              ) : (
                <Volume2 className="w-4 h-4 text-cyan-400" />
              )}
            </button>

            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={isMuted ? 0 : volumePercent}
              onChange={(e) => setVolume(Number(e.target.value) / 100)}
              className="flex-1 h-1.5 bg-[#0e1738] rounded-lg appearance-none cursor-pointer accent-cyan-400 focus:outline-none"
              aria-label="Background music volume"
            />
          </div>
        </div>
      </div>

      {/* Supplied PS5 Default Track Showcase Card */}
      <div className="space-y-2">
        <div className="text-xs font-semibold text-zinc-200 flex items-center justify-between px-0.5">
          <span className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            <span>Default Music Asset</span>
          </span>
          {!isDefaultTrack && (
            <button
              type="button"
              onClick={restoreDefaultTrack}
              className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1 cursor-pointer font-medium"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Restore Default</span>
            </button>
          )}
        </div>

        <div
          onClick={() => selectTrack(DEFAULT_HOME_MENU_TRACK.id)}
          className={`p-3.5 rounded-2xl border cursor-pointer transition-all flex items-center justify-between ${
            isDefaultTrack
              ? 'bg-blue-600/20 border-cyan-400/50 text-cyan-100'
              : 'bg-[#070c1e] border-[#1c2c5c] hover:border-blue-500/40 text-zinc-300'
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                isDefaultTrack
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                  : 'bg-[#111c44] text-zinc-400'
              }`}
            >
              {isDefaultTrack && isPlaying ? (
                <Radio className="w-4 h-4 text-cyan-400" />
              ) : (
                <Disc className="w-4 h-4" />
              )}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold truncate flex items-center gap-1.5 text-white">
                <span>{DEFAULT_HOME_MENU_TRACK.name}</span>
                <span className="text-[10px] text-cyan-300/80 font-mono">(003. Home Menu.mp3)</span>
              </div>
              <div className="text-[11px] text-zinc-400 truncate mt-0.5">
                {DEFAULT_HOME_MENU_TRACK.description}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isDefaultTrack ? (
              <span className="text-[11px] font-semibold text-cyan-300 flex items-center gap-1">
                <Check className="w-3.5 h-3.5" />
                Active
              </span>
            ) : (
              <span className="text-[11px] text-zinc-300 px-2.5 py-1 rounded-lg bg-[#111f4d] border border-[#1c2c5c]">
                Select
              </span>
            )}
          </div>
        </div>
      </div>

      {/* User Custom Audio Section */}
      <div className="space-y-2.5 pt-3 border-t border-[#182859]">
        <div className="flex items-center justify-between px-0.5 gap-2">
          <div className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
            <Radio className="w-3.5 h-3.5 text-cyan-400" />
            <span>Custom Tracks ({userTracks.length})</span>
          </div>

          <div className="flex items-center gap-2">
            {!isDefaultTrack && (
              <button
                type="button"
                onClick={restoreDefaultTrack}
                className="px-2.5 py-1.5 rounded-xl text-zinc-400 hover:text-cyan-300 text-xs transition-colors cursor-pointer flex items-center gap-1"
                title="Restore original Home Menu track"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Restore Default</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="px-3.5 py-1.5 rounded-xl bg-[#111f4d] hover:bg-[#1a2e73] text-cyan-300 border border-cyan-500/40 text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-40 whitespace-nowrap"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>{isUploading ? 'Importing...' : 'Upload My Music'}</span>
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="audio/mp3,audio/mpeg,audio/wav,audio/ogg,audio/m4a,audio/aac,audio/flac,.mp3,.wav,.ogg,.m4a,.aac,.flac"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>

        {uploadError && (
          <div className="p-2.5 rounded-xl bg-red-500/15 border border-red-500/35 text-red-300 text-xs flex items-center justify-between">
            <span>{uploadError}</span>
            <button
              type="button"
              onClick={() => setUploadError(null)}
              className="text-red-400 hover:text-red-200 text-xs font-bold cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* User Track List or Empty State */}
        {userTracks.length === 0 ? (
          <div className="p-4 rounded-2xl border border-dashed border-[#1e2f66] bg-[#070c1e]/70 text-center space-y-1 text-zinc-500">
            <p className="text-xs font-medium text-zinc-300">No custom tracks uploaded yet.</p>
            <p className="text-[11px] max-w-sm mx-auto text-zinc-400">
              Upload an MP3, WAV, or OGG file. It will be stored safely in IndexedDB without overwriting the default track.
            </p>
          </div>
        ) : (
          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
            {userTracks.map((track) => {
              const isSelected = currentTrack?.id === track.id;
              return (
                <div
                  key={track.id}
                  className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 transition-colors ${
                    isSelected
                      ? 'bg-blue-600/20 border-cyan-400/50 text-cyan-100'
                      : 'bg-[#070c1e] border-[#172654] hover:border-blue-500/40 text-zinc-300'
                  }`}
                >
                  <div
                    onClick={() => selectTrack(track.id)}
                    className="flex-1 min-w-0 cursor-pointer flex items-center gap-2.5"
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isSelected) {
                          togglePlay();
                        } else {
                          selectTrack(track.id);
                        }
                      }}
                      className="p-1.5 rounded-lg bg-[#111f4d] hover:bg-[#1a2e73] text-cyan-300 transition-colors cursor-pointer shrink-0"
                    >
                      {isSelected && isPlaying ? (
                        <Pause className="w-3.5 h-3.5 fill-current" />
                      ) : (
                        <Play className="w-3.5 h-3.5 fill-current" />
                      )}
                    </button>

                    <div className="min-w-0">
                      <div className="text-xs font-medium truncate text-white">{track.name}</div>
                      <div className="text-[10px] text-zinc-400 font-mono tabular-nums">
                        {formatFileSize(track.size)}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {confirmDeleteId === track.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            deleteUserTrackItem(track.id);
                            setConfirmDeleteId(null);
                          }}
                          className="px-2 py-0.5 rounded-lg bg-red-600 text-white text-[10px] font-semibold hover:bg-red-500 transition-colors cursor-pointer"
                        >
                          Confirm
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="px-1.5 py-0.5 rounded-lg text-zinc-400 hover:text-zinc-200 text-[10px] cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(track.id)}
                        className="p-1.5 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-[#111f4d] transition-colors cursor-pointer"
                        title="Remove custom track and return to default"
                        aria-label="Remove track"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
