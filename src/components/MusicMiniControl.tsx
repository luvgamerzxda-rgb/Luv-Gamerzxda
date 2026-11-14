import React from 'react';
import { Music, Play, Pause, Volume2, VolumeX } from 'lucide-react';
import { useBackgroundMusic } from '../context/BackgroundMusicContext';
import { soundEffects } from '../services/soundEffects';

interface MusicMiniControlProps {
  onOpenMusicSettings: () => void;
}

export const MusicMiniControl: React.FC<MusicMiniControlProps> = ({ onOpenMusicSettings }) => {
  const { currentTrack, isPlaying, isEnabled, isMuted, volume, togglePlay, toggleMute } = useBackgroundMusic();

  if (!isEnabled) return null;

  return (
    <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#0a1026]/90 border border-[#203166]/80 text-xs text-zinc-300 shadow-md backdrop-blur-md animate-in fade-in duration-200">
      <button
        type="button"
        onClick={() => {
          soundEffects.playClick();
          onOpenMusicSettings();
        }}
        className="flex items-center gap-1.5 hover:text-cyan-300 transition-colors cursor-pointer min-w-0"
        title="Open Audio & Sound Settings"
      >
        <span className="w-2 h-2 rounded-full bg-cyan-400 shrink-0 animate-pulse" />
        <Music className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
        <span className="font-medium text-[11px] truncate max-w-[120px] hidden sm:inline">
          {currentTrack?.name || 'Home Menu'}
        </span>
      </button>

      <div className="h-3 w-px bg-zinc-700/60 mx-0.5" />

      <button
        type="button"
        onClick={() => {
          soundEffects.playClick();
          togglePlay();
        }}
        className="p-1 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
        title={isPlaying ? 'Pause music' : 'Play music'}
        aria-label={isPlaying ? 'Pause music' : 'Play music'}
      >
        {isPlaying ? (
          <Pause className="w-3 h-3 fill-current text-cyan-400" />
        ) : (
          <Play className="w-3 h-3 fill-current" />
        )}
      </button>

      <button
        type="button"
        onClick={() => {
          soundEffects.playClick();
          toggleMute();
        }}
        className="p-1 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
        title={isMuted ? 'Unmute' : 'Mute'}
        aria-label={isMuted ? 'Unmute' : 'Mute'}
      >
        {isMuted || volume === 0 ? (
          <VolumeX className="w-3 h-3 text-red-400" />
        ) : (
          <Volume2 className="w-3 h-3 text-cyan-400" />
        )}
      </button>
    </div>
  );
};
