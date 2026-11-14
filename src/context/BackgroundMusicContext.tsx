import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { MusicTrack, MusicSettings, MusicRepeatMode } from '../types';
import { AmbientSynthesizer } from '../services/ambientSynthesizer';
import {
  saveUserAudioTrack,
  getAllUserAudioTracks,
  deleteUserAudioTrack,
  StoredAudioRecord,
} from '../services/musicDb';

const STORAGE_SETTINGS_KEY = 'novachat.backgroundMusic.settings.v2';

export const DEFAULT_AUDIO_URL = '/audio/003.%20Home%20Menu.mp3';
export const FALLBACK_AUDIO_URL = '/assets/aistudio/003._Home_Menu_3d83cd60.mp3';

export const DEFAULT_HOME_MENU_TRACK: MusicTrack = {
  id: 'default-home-menu',
  name: 'Home Menu',
  type: 'default',
  url: DEFAULT_AUDIO_URL,
  description: 'Authentic PS5-style Home Menu ambient background music (003. Home Menu.mp3).',
};

export const BUILTIN_PRESET_TRACKS: MusicTrack[] = [
  DEFAULT_HOME_MENU_TRACK,
  {
    id: 'preset-cosmic',
    name: 'Cosmic Drift (PS5 Ambient Synth)',
    type: 'preset',
    presetStyle: 'cosmic-ps5',
    description: 'Warm evolving synthesized pads with breathing filter swells.',
  },
  {
    id: 'preset-starlight',
    name: 'Starlight Reverie',
    type: 'preset',
    presetStyle: 'starlight',
    description: 'Deep tranquil drone with soft celestial harmonics.',
  },
  {
    id: 'preset-zen',
    name: 'Zen Focus Sanctuary',
    type: 'preset',
    presetStyle: 'zen-sanctuary',
    description: 'Crystalline harmonic atmosphere designed for prolonged coding & writing.',
  },
];

interface BackgroundMusicContextValue {
  tracks: MusicTrack[];
  currentTrack: MusicTrack;
  isPlaying: boolean;
  isEnabled: boolean;
  volume: number; // 0.0 to 1.0 (default 0.20)
  isMuted: boolean;
  repeatMode: MusicRepeatMode;
  autoplayBlocked: boolean;
  isLoading: boolean;
  error: string | null;
  isDefaultTrack: boolean;
  play: () => Promise<void>;
  pause: () => void;
  togglePlay: () => void;
  setVolume: (vol: number) => void;
  toggleMute: () => void;
  selectTrack: (trackId: string) => Promise<void>;
  restoreDefaultTrack: () => Promise<void>;
  nextTrack: () => void;
  prevTrack: () => void;
  setRepeatMode: (mode: MusicRepeatMode) => void;
  toggleEnabled: (enabled: boolean) => void;
  uploadUserTrack: (file: File) => Promise<string>;
  deleteUserTrackItem: (trackId: string) => Promise<void>;
}

const BackgroundMusicContext = createContext<BackgroundMusicContextValue | null>(null);

export const BackgroundMusicProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Saved Preferences state with defaults: 20% default volume & default Home Menu track
  const [isEnabled, setIsEnabled] = useState<boolean>(false);
  const [volume, setVolumeState] = useState<number>(0.20); // 20% default as specified
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [repeatMode, setRepeatModeState] = useState<MusicRepeatMode>('repeat-one');
  const [selectedTrackId, setSelectedTrackId] = useState<string>(DEFAULT_HOME_MENU_TRACK.id);

  // Dynamic state
  const [userTracks, setUserTracks] = useState<MusicTrack[]>([]);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Single persistent audio engine references
  const synthRef = useRef<AmbientSynthesizer | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const triedFallbackUrlRef = useRef<boolean>(false);

  // Initialize single HTMLAudioElement once
  if (!audioRef.current && typeof window !== 'undefined') {
    const audio = new Audio();
    audio.preload = 'auto';
    audio.loop = true;
    audio.crossOrigin = 'anonymous';
    audioRef.current = audio;
  }
  if (!synthRef.current) {
    synthRef.current = new AmbientSynthesizer();
  }

  // Combined tracks list
  const allTracks: MusicTrack[] = [...BUILTIN_PRESET_TRACKS, ...userTracks];
  const currentTrack: MusicTrack =
    allTracks.find((t) => t.id === selectedTrackId) || DEFAULT_HOME_MENU_TRACK;

  const isDefaultTrack = currentTrack.id === DEFAULT_HOME_MENU_TRACK.id;

  // Helper: compute effective volume (0 if muted or zero volume)
  const getEffectiveVolume = useCallback(() => {
    if (isMuted) return 0;
    return Math.max(0, Math.min(1, volume));
  }, [isMuted, volume]);

  // Load user tracks from IndexedDB
  const loadUserTracks = useCallback(async () => {
    try {
      const records = await getAllUserAudioTracks();
      const mapped: MusicTrack[] = records.map((rec) => ({
        id: rec.id,
        name: rec.name,
        type: 'user',
        size: rec.size,
        createdAt: rec.createdAt,
        blobUrl: URL.createObjectURL(rec.blob),
        description: `Custom audio (${(rec.size / (1024 * 1024)).toFixed(1)} MB)`,
      }));
      setUserTracks(mapped);
    } catch (e) {
      console.warn('Failed to load user tracks from IndexedDB:', e);
    }
  }, []);

  // Restore saved preferences on mount
  useEffect(() => {
    try {
      const savedRaw = localStorage.getItem(STORAGE_SETTINGS_KEY);
      if (savedRaw) {
        const parsed: Partial<MusicSettings> = JSON.parse(savedRaw);
        if (typeof parsed.enabled === 'boolean') setIsEnabled(parsed.enabled);
        if (typeof parsed.volume === 'number' && !isNaN(parsed.volume)) {
          setVolumeState(Math.max(0, Math.min(1, parsed.volume)));
        }
        if (typeof parsed.isMuted === 'boolean') setIsMuted(parsed.isMuted);
        if (parsed.selectedTrackId) setSelectedTrackId(parsed.selectedTrackId);
        if (parsed.repeatMode === 'repeat-one' || parsed.repeatMode === 'repeat-all') {
          setRepeatModeState(parsed.repeatMode);
        }
      }
    } catch (err) {
      console.warn('Error reading music preferences:', err);
    }

    loadUserTracks();
  }, [loadUserTracks]);

  // Persist preferences whenever they change
  useEffect(() => {
    try {
      const settingsToSave: MusicSettings = {
        enabled: isEnabled,
        volume,
        isMuted,
        selectedTrackId,
        repeatMode,
      };
      localStorage.setItem(STORAGE_SETTINGS_KEY, JSON.stringify(settingsToSave));
    } catch (err) {
      console.warn('Failed to persist music settings:', err);
    }
  }, [isEnabled, volume, isMuted, selectedTrackId, repeatMode]);

  // Update volume on active playback engines immediately without restarting or seeking
  useEffect(() => {
    const effVol = getEffectiveVolume();
    if (audioRef.current) {
      audioRef.current.volume = effVol;
    }
    if (synthRef.current) {
      synthRef.current.setVolume(effVol, true);
    }
  }, [getEffectiveVolume]);

  // Stop all playback engines
  const stopAllPlayback = useCallback((fadeOut: boolean = true) => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    if (synthRef.current) {
      synthRef.current.stop(fadeOut);
    }
    setIsPlaying(false);
  }, []);

  // Play implementation
  const playTrack = useCallback(
    async (trackToPlay: MusicTrack) => {
      setError(null);
      setIsLoading(true);
      const effVol = getEffectiveVolume();

      try {
        if (trackToPlay.type === 'default' || trackToPlay.type === 'user') {
          // Stop synth if it was playing
          synthRef.current?.stop(false);

          const audio = audioRef.current;
          if (!audio) throw new Error('Audio element not initialized');

          const targetUrl =
            trackToPlay.type === 'default'
              ? (triedFallbackUrlRef.current ? FALLBACK_AUDIO_URL : DEFAULT_AUDIO_URL)
              : trackToPlay.blobUrl || '';

          if (!targetUrl) {
            throw new Error('No audio URL found for selected track.');
          }

          // Only change src if different to avoid restarting existing playback
          const currentSrcNormalized = audio.src.replace(window.location.origin, '');
          const targetUrlNormalized = targetUrl.replace(window.location.origin, '');

          if (currentSrcNormalized !== targetUrlNormalized && audio.src !== targetUrl) {
            audio.src = targetUrl;
            audio.load();
          }

          audio.volume = effVol;
          audio.loop = repeatMode === 'repeat-one';

          // Attempt play with promise catch
          await audio.play();
          setIsPlaying(true);
          setAutoplayBlocked(false);
        } else if (trackToPlay.type === 'preset') {
          // Stop audio element
          if (audioRef.current) {
            audioRef.current.pause();
          }

          // Start Web Audio Ambient Synth
          const started = await synthRef.current!.start(trackToPlay.presetStyle || 'cosmic-ps5', effVol);
          if (started) {
            setIsPlaying(true);
            setAutoplayBlocked(false);
          } else {
            setIsPlaying(false);
            setAutoplayBlocked(true);
          }
        }
      } catch (err: any) {
        console.warn('Playback error / autoplay restricted:', err);
        if (err.name === 'NotAllowedError') {
          setAutoplayBlocked(true);
        } else {
          // If default audio failed on primary URL, try fallback URL once
          if (trackToPlay.type === 'default' && !triedFallbackUrlRef.current && audioRef.current) {
            console.log('Retrying default Home Menu track with fallback URL...');
            triedFallbackUrlRef.current = true;
            try {
              audioRef.current.src = FALLBACK_AUDIO_URL;
              audioRef.current.volume = effVol;
              audioRef.current.loop = repeatMode === 'repeat-one';
              await audioRef.current.play();
              setIsPlaying(true);
              setAutoplayBlocked(false);
              return;
            } catch (fallbackErr: any) {
              console.warn('Fallback audio playback error:', fallbackErr);
            }
          }
          setError(err.message || 'Unable to play selected audio track.');
        }
        setIsPlaying(false);
      } finally {
        setIsLoading(false);
      }
    },
    [getEffectiveVolume, repeatMode]
  );

  // Monitor audio element events for errors and looping
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleEnded = () => {
      if (repeatMode === 'repeat-one') {
        audio.currentTime = 0;
        audio.play().catch((e) => console.warn('Audio loop restart error:', e));
      } else if (repeatMode === 'repeat-all') {
        // Advance to next track
        const currentIndex = allTracks.findIndex((t) => t.id === selectedTrackId);
        const nextIndex = (currentIndex + 1) % allTracks.length;
        const next = allTracks[nextIndex];
        if (next) {
          setSelectedTrackId(next.id);
          playTrack(next);
        }
      }
    };

    const handleError = () => {
      console.warn('Audio element error event fired:', audio.error);
      if (selectedTrackId === DEFAULT_HOME_MENU_TRACK.id && !triedFallbackUrlRef.current) {
        triedFallbackUrlRef.current = true;
        audio.src = FALLBACK_AUDIO_URL;
        audio.load();
        if (isPlaying) {
          audio.play().catch(() => {});
        }
      } else {
        setError('Audio asset failed to decode or load.');
        setIsPlaying(false);
      }
    };

    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);

    return () => {
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
    };
  }, [allTracks, selectedTrackId, repeatMode, playTrack, isPlaying]);

  // Master Enable Toggle
  const toggleEnabled = useCallback(
    (nextEnabled: boolean) => {
      setIsEnabled(nextEnabled);
      if (!nextEnabled) {
        stopAllPlayback(true);
        setAutoplayBlocked(false);
      } else {
        // User turned on background music: play current track
        playTrack(currentTrack);
      }
    },
    [stopAllPlayback, playTrack, currentTrack]
  );

  // Play Action
  const play = useCallback(async () => {
    if (!isEnabled) {
      setIsEnabled(true);
    }
    await playTrack(currentTrack);
  }, [isEnabled, playTrack, currentTrack]);

  // Pause Action
  const pause = useCallback(() => {
    stopAllPlayback(true);
  }, [stopAllPlayback]);

  // Toggle Play / Pause
  const togglePlay = useCallback(() => {
    if (isPlaying) {
      pause();
    } else {
      play();
    }
  }, [isPlaying, pause, play]);

  // Select Track
  const selectTrack = useCallback(
    async (trackId: string) => {
      const track = allTracks.find((t) => t.id === trackId);
      if (!track) return;

      setSelectedTrackId(trackId);
      if (isPlaying || isEnabled) {
        await playTrack(track);
      }
    },
    [allTracks, isPlaying, isEnabled, playTrack]
  );

  // Restore Default Track
  const restoreDefaultTrack = useCallback(async () => {
    triedFallbackUrlRef.current = false;
    setSelectedTrackId(DEFAULT_HOME_MENU_TRACK.id);
    if (isPlaying || isEnabled) {
      await playTrack(DEFAULT_HOME_MENU_TRACK);
    }
  }, [isPlaying, isEnabled, playTrack]);

  // Next Track
  const nextTrack = useCallback(() => {
    const currentIndex = allTracks.findIndex((t) => t.id === selectedTrackId);
    const nextIndex = (currentIndex + 1) % allTracks.length;
    selectTrack(allTracks[nextIndex].id);
  }, [allTracks, selectedTrackId, selectTrack]);

  // Previous Track
  const prevTrack = useCallback(() => {
    const currentIndex = allTracks.findIndex((t) => t.id === selectedTrackId);
    const prevIndex = (currentIndex - 1 + allTracks.length) % allTracks.length;
    selectTrack(allTracks[prevIndex].id);
  }, [allTracks, selectedTrackId, selectTrack]);

  // Volume Change
  const setVolume = useCallback(
    (val: number) => {
      const clamped = Math.max(0, Math.min(1, val));
      setVolumeState(clamped);
      if (isMuted && clamped > 0) {
        setIsMuted(false);
      }
    },
    [isMuted]
  );

  // Toggle Mute
  const toggleMute = useCallback(() => {
    setIsMuted((prev) => !prev);
  }, []);

  // Set Repeat Mode
  const setRepeatMode = useCallback((mode: MusicRepeatMode) => {
    setRepeatModeState(mode);
    if (audioRef.current) {
      audioRef.current.loop = mode === 'repeat-one';
    }
  }, []);

  // Upload User Audio Track
  const uploadUserTrack = useCallback(
    async (file: File): Promise<string> => {
      // Validate format
      const supportedTypes = [
        'audio/mpeg',
        'audio/mp3',
        'audio/wav',
        'audio/x-wav',
        'audio/ogg',
        'audio/aac',
        'audio/m4a',
        'audio/x-m4a',
        'audio/flac',
      ];
      const hasValidExt = /\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(file.name);
      const hasValidType =
        file.type &&
        supportedTypes.some((t) => file.type.startsWith(t) || file.type.includes('audio'));

      if (!hasValidType && !hasValidExt) {
        throw new Error(
          `Unsupported audio format (${file.name}). Please select MP3, WAV, OGG, or M4A files.`
        );
      }

      if (file.size > 80 * 1024 * 1024) {
        throw new Error('Audio file exceeds 80MB size limit.');
      }

      const id = `user-track-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const cleanName =
        file.name.replace(/\.[^/.]+$/, '').trim() || 'Custom Ambient Track';

      const record: StoredAudioRecord = {
        id,
        name: cleanName,
        blob: file,
        mimeType: file.type || 'audio/mpeg',
        size: file.size,
        createdAt: Date.now(),
      };

      await saveUserAudioTrack(record);

      const newTrack: MusicTrack = {
        id,
        name: cleanName,
        type: 'user',
        size: file.size,
        blobUrl: URL.createObjectURL(file),
        createdAt: record.createdAt,
        description: `Custom upload (${(file.size / (1024 * 1024)).toFixed(1)} MB)`,
      };

      setUserTracks((prev) => [newTrack, ...prev]);

      // Automatically select newly uploaded track
      await selectTrack(id);
      return id;
    },
    [selectTrack]
  );

  // Delete User Track
  const deleteUserTrackItem = useCallback(
    async (trackId: string) => {
      // If currently playing the deleted track, restore default Home Menu track
      if (selectedTrackId === trackId) {
        stopAllPlayback(false);
        setSelectedTrackId(DEFAULT_HOME_MENU_TRACK.id);
        if (isEnabled) {
          playTrack(DEFAULT_HOME_MENU_TRACK);
        }
      }

      await deleteUserAudioTrack(trackId);

      setUserTracks((prev) => {
        const target = prev.find((t) => t.id === trackId);
        if (target?.blobUrl) {
          try {
            URL.revokeObjectURL(target.blobUrl);
          } catch {}
        }
        return prev.filter((t) => t.id !== trackId);
      });
    },
    [selectedTrackId, stopAllPlayback, isEnabled, playTrack]
  );

  return (
    <BackgroundMusicContext.Provider
      value={{
        tracks: allTracks,
        currentTrack,
        isPlaying,
        isEnabled,
        volume,
        isMuted,
        repeatMode,
        autoplayBlocked,
        isLoading,
        error,
        isDefaultTrack,
        play,
        pause,
        togglePlay,
        setVolume,
        toggleMute,
        selectTrack,
        restoreDefaultTrack,
        nextTrack,
        prevTrack,
        setRepeatMode,
        toggleEnabled,
        uploadUserTrack,
        deleteUserTrackItem,
      }}
    >
      {children}
    </BackgroundMusicContext.Provider>
  );
};

export const useBackgroundMusic = (): BackgroundMusicContextValue => {
  const context = useContext(BackgroundMusicContext);
  if (!context) {
    throw new Error('useBackgroundMusic must be used within a BackgroundMusicProvider');
  }
  return context;
};
