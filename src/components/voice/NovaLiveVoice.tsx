import React, { useState, useEffect, useRef, useCallback } from 'react';
import { VoiceSessionState, LiveTranscriptItem, GeminiVoiceItem } from '../../types/voice';
import { DEFAULT_GEMINI_LIVE_VOICE, GEMINI_LIVE_VOICES, STORAGE_KEY_SELECTED_VOICE } from '../../constants/voices';
import { LiveAudioEngine } from '../../services/liveAudioProcessor';
import { LiveWaveform } from './LiveWaveform';
import { VoiceSelectorModal } from './VoiceSelectorModal';
import { TranscriptSaveModal } from './TranscriptSaveModal';
import { NovaChatLogo } from '../NovaChatLogo';
import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  PhoneOff,
  ChevronDown,
  Sparkles,
  ArrowLeft,
  User,
  Clock,
  Subtitles,
  AlertCircle,
  RotateCcw,
} from 'lucide-react';

interface NovaLiveVoiceProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveTranscript: (transcripts: LiveTranscriptItem[]) => void;
  selectedVoiceId?: string;
  onSelectVoiceId?: (voiceId: string) => void;
}

export const NovaLiveVoice: React.FC<NovaLiveVoiceProps> = ({
  isOpen,
  onClose,
  onSaveTranscript,
  selectedVoiceId,
  onSelectVoiceId,
}) => {
  const resolveVoiceItem = useCallback((id?: string): GeminiVoiceItem => {
    const target = id || DEFAULT_GEMINI_LIVE_VOICE;
    return (
      GEMINI_LIVE_VOICES.find((v) => v.id === target) ||
      GEMINI_LIVE_VOICES.find((v) => v.id === DEFAULT_GEMINI_LIVE_VOICE) ||
      GEMINI_LIVE_VOICES[0]
    );
  }, []);

  const [internalVoiceId, setInternalVoiceId] = useState<string>(() => {
    if (selectedVoiceId) return selectedVoiceId;
    try {
      return localStorage.getItem(STORAGE_KEY_SELECTED_VOICE) || DEFAULT_GEMINI_LIVE_VOICE;
    } catch {
      return DEFAULT_GEMINI_LIVE_VOICE;
    }
  });

  const activeVoiceId = selectedVoiceId || internalVoiceId;
  const selectedVoice = resolveVoiceItem(activeVoiceId);

  const [voiceSelectorOpen, setVoiceSelectorOpen] = useState(false);
  const [saveModalOpen, setSaveModalOpen] = useState(false);

  // Session State
  const [sessionState, setSessionState] = useState<VoiceSessionState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sessionSeconds, setSessionSeconds] = useState(0);

  // Controls
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isSpeakerMuted, setIsSpeakerMuted] = useState(false);
  const [showCaptions, setShowCaptions] = useState(true);

  // Live Transcripts
  const [transcripts, setTranscripts] = useState<LiveTranscriptItem[]>([]);

  // Audio Engine & WebSocket references
  const audioEngineRef = useRef<LiveAudioEngine | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const resumptionHandleRef = useRef<string | null>(null);
  const transcriptScrollRef = useRef<HTMLDivElement | null>(null);
  const sessionSecondsRef = useRef(0);
  const sessionStateRef = useRef<VoiceSessionState>('idle');
  const selectedVoiceIdRef = useRef(activeVoiceId);
  const manualCloseRef = useRef(false);

  useEffect(() => {
    sessionSecondsRef.current = sessionSeconds;
  }, [sessionSeconds]);

  useEffect(() => {
    sessionStateRef.current = sessionState;
  }, [sessionState]);

  useEffect(() => {
    selectedVoiceIdRef.current = activeVoiceId;
  }, [activeVoiceId]);

  // Auto-scroll transcript panel
  useEffect(() => {
    if (transcriptScrollRef.current) {
      transcriptScrollRef.current.scrollTop = transcriptScrollRef.current.scrollHeight;
    }
  }, [transcripts]);

  // Session Timer
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    if (
      sessionState === 'listening' ||
      sessionState === 'speaking' ||
      sessionState === 'thinking' ||
      sessionState === 'reconnecting'
    ) {
      timer = setInterval(() => {
        setSessionSeconds((s) => s + 1);
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [sessionState]);

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const cleanupMediaAndSocket = useCallback(() => {
    if (audioEngineRef.current) {
      audioEngineRef.current.stop();
      audioEngineRef.current = null;
    }
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {}
      wsRef.current = null;
    }
  }, []);

  /**
   * Initializes Live Audio Engine & establishes backend WebSocket proxy
   */
  const startLiveSession = useCallback(
    async (overrideVoiceId?: string) => {
      manualCloseRef.current = false;
      cleanupMediaAndSocket();
      setErrorMessage(null);
      setSessionState(resumptionHandleRef.current ? 'reconnecting' : 'connecting');

      const voiceToUse = overrideVoiceId || selectedVoiceIdRef.current || DEFAULT_GEMINI_LIVE_VOICE;

      try {
        // 1. Initialize Audio Engine
        const engine = new LiveAudioEngine();
        audioEngineRef.current = engine;

        // 2. Establish WebSocket connection to backend
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/api/live-ws?voice=${encodeURIComponent(
          voiceToUse
        )}${resumptionHandleRef.current ? `&resume=${encodeURIComponent(resumptionHandleRef.current)}` : ''}`;

        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = async () => {
          setSessionState('listening');

          // Start microphone capture once WebSocket is open
          try {
            await engine.startMicrophone((base64Pcm) => {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ audio: base64Pcm }));
              }
            });
          } catch (micErr: any) {
            console.error('[NovaLiveVoice] Microphone error:', micErr);
            const name = micErr?.name || '';
            if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
              setErrorMessage('Microphone permission required. Please allow microphone access.');
            } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
              setErrorMessage('No microphone found. Please connect a microphone and retry.');
            } else {
              setErrorMessage('Could not access microphone. Please check your audio device.');
            }
            setSessionState('error');
            cleanupMediaAndSocket();
          }
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);

            // 1. Handle incoming model audio chunk
            if (data.audio) {
              setSessionState('speaking');
              engine.playAiAudioChunk(data.audio);
            }

            // 2. Handle Gemini interruption signal
            if (data.interrupted) {
              setSessionState('listening');
              engine.flushPlayback();
            }

            // 3. Handle model turn complete
            if (data.turnComplete) {
              setSessionState('listening');
            }

            // 4. Handle session resumption updates
            if (data.resumptionHandle) {
              resumptionHandleRef.current = data.resumptionHandle;
            }

            // 5. Handle GoAway warning (transparent session resumption)
            if (data.goAway && !manualCloseRef.current) {
              setSessionState('reconnecting');
              setTimeout(() => {
                if (!manualCloseRef.current) {
                  startLiveSession(selectedVoiceIdRef.current);
                }
              }, 250);
            }

            // 6. Handle Real-Time Transcriptions
            if (data.userTranscript) {
              const nowTime = formatTimer(sessionSecondsRef.current);
              setTranscripts((prev) => {
                const last = prev[prev.length - 1];
                if (last && last.role === 'user' && !last.isFinal) {
                  return [
                    ...prev.slice(0, -1),
                    { ...last, text: data.userTranscript, isFinal: Boolean(data.isFinal) },
                  ];
                }
                return [
                  ...prev,
                  {
                    id: 'u_' + Date.now() + '_' + prev.length,
                    role: 'user',
                    text: data.userTranscript,
                    timestamp: nowTime,
                    isFinal: Boolean(data.isFinal),
                  },
                ];
              });
            }

            if (data.aiTranscript) {
              const nowTime = formatTimer(sessionSecondsRef.current);
              setTranscripts((prev) => {
                const last = prev[prev.length - 1];
                if (last && last.role === 'assistant' && !last.isFinal) {
                  return [
                    ...prev.slice(0, -1),
                    { ...last, text: last.text + data.aiTranscript, isFinal: Boolean(data.isFinal) },
                  ];
                }
                return [
                  ...prev,
                  {
                    id: 'a_' + Date.now() + '_' + prev.length,
                    role: 'assistant',
                    text: data.aiTranscript,
                    timestamp: nowTime,
                    isFinal: Boolean(data.isFinal),
                  },
                ];
              });
            }

            // 7. Handle errors from server
            if (data.error) {
              console.warn('[NovaLiveVoice] Server notice:', data.error);
              const errStr = String(data.error);
              if (errStr.includes('quota') || errStr.includes('RESOURCE_EXHAUSTED') || errStr.includes('429')) {
                setErrorMessage('Gemini usage limit reached. Please try again later.');
              } else if (
                errStr.includes('API_KEY') ||
                errStr.includes('401') ||
                errStr.includes('403') ||
                errStr.includes('UNAUTHENTICATED') ||
                errStr.includes('API key')
              ) {
                setErrorMessage('Gemini API key missing or invalid on the server.');
              } else {
                setErrorMessage(errStr || 'Nova Voice encountered a connection issue.');
              }
              sessionStateRef.current = 'error';
              setSessionState('error');
            }
          } catch (e) {
            console.warn('[NovaLiveVoice] Message parse warning:', e);
          }
        };

        ws.onerror = () => {
          if (!manualCloseRef.current) {
            setErrorMessage('Voice connection error. Please check your network and retry.');
            sessionStateRef.current = 'error';
            setSessionState('error');
          }
        };

        ws.onclose = () => {
          if (!manualCloseRef.current && sessionStateRef.current !== 'ended' && sessionStateRef.current !== 'error') {
            setErrorMessage('Voice connection closed.');
            sessionStateRef.current = 'error';
            setSessionState('error');
          }
        };
      } catch (err: any) {
        console.error('[NovaLiveVoice] Session startup error:', err);
        setErrorMessage(err.message || 'Failed to initialize voice session.');
        setSessionState('error');
      }
    },
    [cleanupMediaAndSocket]
  );

  /**
   * End session and trigger post-call transcript save modal
   */
  const handleEndSession = useCallback(() => {
    manualCloseRef.current = true;
    resumptionHandleRef.current = null;
    setSessionState('ended');
    cleanupMediaAndSocket();

    if (transcripts.length > 0) {
      setSaveModalOpen(true);
    } else {
      onClose();
    }
  }, [cleanupMediaAndSocket, onClose, transcripts.length]);

  // Start session on modal open
  useEffect(() => {
    if (isOpen) {
      resumptionHandleRef.current = null;
      setTranscripts([]);
      setSessionSeconds(0);
      startLiveSession(activeVoiceId);
    } else {
      manualCloseRef.current = true;
      cleanupMediaAndSocket();
    }

    return () => {
      manualCloseRef.current = true;
      cleanupMediaAndSocket();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Mute Toggles
  const handleToggleMic = () => {
    setIsMicMuted((prev) => {
      const next = !prev;
      audioEngineRef.current?.setMuted(next);
      return next;
    });
  };

  const handleToggleSpeaker = () => {
    setIsSpeakerMuted((prev) => {
      const next = !prev;
      audioEngineRef.current?.setOutputMuted(next);
      return next;
    });
  };

  // Voice Selection Handler
  const handleSelectVoice = (voice: GeminiVoiceItem) => {
    setInternalVoiceId(voice.id);
    if (onSelectVoiceId) {
      onSelectVoiceId(voice.id);
    }
    try {
      localStorage.setItem(STORAGE_KEY_SELECTED_VOICE, voice.id);
    } catch {}
    setVoiceSelectorOpen(false);

    // Reconnect cleanly with newly chosen voice
    if (
      sessionState === 'listening' ||
      sessionState === 'speaking' ||
      sessionState === 'connecting' ||
      sessionState === 'error'
    ) {
      manualCloseRef.current = true;
      resumptionHandleRef.current = null;
      cleanupMediaAndSocket();
      setTimeout(() => startLiveSession(voice.id), 250);
    }
  };

  if (!isOpen) return null;

  const statusLabel =
    sessionState === 'connecting'
      ? 'Connecting to Nova...'
      : sessionState === 'reconnecting'
      ? 'Reconnecting...'
      : sessionState === 'listening'
      ? 'Listening...'
      : sessionState === 'thinking'
      ? 'Thinking...'
      : sessionState === 'speaking'
      ? 'Nova is speaking...'
      : sessionState === 'interrupted'
      ? 'Listening...'
      : sessionState === 'error'
      ? 'Connection Issue'
      : 'Ready';

  const subtitleLabel =
    sessionState === 'listening'
      ? "I'm listening. Speak naturally."
      : sessionState === 'speaking'
      ? 'Nova is speaking. You can interrupt at any time.'
      : sessionState === 'thinking'
      ? 'Processing response...'
      : sessionState === 'reconnecting'
      ? 'Voice connection lost. Reconnecting...'
      : sessionState === 'connecting'
      ? 'Establishing real-time bidirectional audio stream...'
      : 'Session ready.';

  return (
    <div className="fixed inset-0 z-50 flex bg-[#060914] text-white select-none overflow-hidden animate-in fade-in duration-300">
      {/* Background PS5 Ambient Meshes */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 left-1/4 w-[600px] h-[600px] rounded-full bg-cyan-600/10 blur-[140px]" />
        <div className="absolute -bottom-40 right-1/4 w-[600px] h-[600px] rounded-full bg-purple-600/10 blur-[140px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full bg-blue-600/5 blur-[160px]" />
      </div>

      {/* Main Container */}
      <div className="relative z-10 flex flex-col w-full h-full">
        {/* Top Header Bar */}
        <header className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-blue-500/15 backdrop-blur-md bg-slate-950/40">
          {/* Left: Existing NovaChat Logo & Back Button */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleEndSession}
              className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800/60 transition-colors cursor-pointer"
              title="Back to NovaChat"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2.5">
              <NovaChatLogo size={32} variant="sidebar" showGlow={true} />
              <div className="hidden sm:block">
                <span className="font-bold tracking-tight text-white text-base">NovaChat</span>
                <span className="text-[10px] uppercase tracking-wider text-cyan-400 block font-semibold">
                  Live Voice
                </span>
              </div>
            </div>
          </div>

          {/* Center: NOVA LIVE Pill */}
          <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 shadow-[0_0_15px_rgba(6,182,212,0.15)]">
            <span className="text-cyan-400 text-xs">✦</span>
            <span className="text-xs font-semibold tracking-wider text-cyan-300">NOVA LIVE</span>
            <span className="text-cyan-400 text-xs">✦</span>
          </div>

          {/* Right: Timer & Voice Selector */}
          <div className="flex items-center gap-2.5">
            {/* Session Timer Pill */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900/80 border border-blue-500/20 text-xs font-mono text-slate-300">
              <span
                className={`w-2 h-2 rounded-full ${
                  sessionState === 'error'
                    ? 'bg-red-400'
                    : sessionState === 'speaking'
                    ? 'bg-purple-400 animate-pulse'
                    : 'bg-cyan-400 animate-pulse'
                }`}
              />
              <span>{formatTimer(sessionSeconds)}</span>
            </div>

            {/* Voice Dropdown Button */}
            <button
              onClick={() => setVoiceSelectorOpen(true)}
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-900/80 hover:bg-slate-800 border border-blue-500/25 text-xs text-slate-200 transition-colors shadow-sm cursor-pointer"
              title="Change Gemini Live voice"
            >
              <div className="flex items-center gap-0.5 text-cyan-400">
                <span className="w-0.5 h-2.5 bg-cyan-400 rounded-full" />
                <span className="w-0.5 h-3.5 bg-cyan-400 rounded-full" />
                <span className="w-0.5 h-2 bg-cyan-400 rounded-full" />
              </div>
              <span className="font-medium">{selectedVoice.name}</span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>
          </div>
        </header>

        {/* Central Workspace: Waveform + Conversation Panel */}
        <div className="flex-1 flex flex-col lg:flex-row items-center justify-between p-4 sm:p-6 overflow-hidden gap-4 sm:gap-6">
          {/* Central Waveform Section */}
          <div className="flex-1 flex flex-col items-center justify-center w-full h-full relative min-h-0">
            {/* Status Titles */}
            <div className="text-center mb-2 sm:mb-4 z-20">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white mb-1 drop-shadow-md">
                {statusLabel}
              </h1>
              <p className="text-xs sm:text-sm text-slate-400 font-normal max-w-md">
                {subtitleLabel}
              </p>
            </div>

            {/* Audio-Reactive Waveform */}
            <div className="relative flex items-center justify-center my-auto w-full max-w-[340px] sm:max-w-[440px]">
              <LiveWaveform
                state={sessionState}
                getMetrics={() =>
                  audioEngineRef.current?.getLiveMetrics() || {
                    userVolume: 0,
                    aiVolume: 0,
                    userFreq: new Uint8Array(128),
                    aiFreq: new Uint8Array(128),
                  }
                }
              />
            </div>

            {/* Error Banner */}
            {errorMessage && (
              <div className="mt-2 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-950/60 border border-red-500/40 text-red-300 text-xs shadow-lg max-w-md z-20">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMessage}</span>
                <button
                  onClick={() => startLiveSession(activeVoiceId)}
                  className="ml-auto p-1 text-red-400 hover:text-white rounded cursor-pointer"
                  title="Retry connection"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* Right: Floating Glass Conversation / Transcript Panel */}
          {showCaptions && (
            <div className="w-full lg:w-96 h-52 sm:h-64 lg:h-[75vh] flex flex-col rounded-2xl bg-slate-900/60 backdrop-blur-xl border border-blue-500/20 shadow-2xl shadow-cyan-950/20 overflow-hidden shrink-0">
              {/* Transcript Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-blue-500/15 bg-slate-950/40">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                  <span className="w-2 h-2 rounded-full bg-cyan-400" />
                  <span>Live Transcript</span>
                </div>
                <span className="text-[10px] text-slate-500 uppercase tracking-wider">
                  Real-time
                </span>
              </div>

              {/* Messages Scroll Area */}
              <div
                ref={transcriptScrollRef}
                className="flex-1 p-4 overflow-y-auto space-y-3 custom-scrollbar text-xs"
              >
                {transcripts.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 italic p-6">
                    <Sparkles className="w-6 h-6 text-slate-600 mb-2" />
                    <p>Start speaking to see real-time captions and AI responses...</p>
                  </div>
                ) : (
                  transcripts.map((t) => (
                    <div
                      key={t.id}
                      className={`p-3 rounded-xl border transition-all ${
                        t.role === 'user'
                          ? 'bg-blue-950/25 border-blue-500/20 text-slate-200 ml-4'
                          : 'bg-purple-950/25 border-purple-500/20 text-slate-200 mr-4'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1 text-[10px] text-slate-400">
                        <div className="flex items-center gap-1.5 font-semibold">
                          {t.role === 'user' ? (
                            <>
                              <User className="w-3 h-3 text-cyan-400" />
                              <span className="text-cyan-400">You</span>
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-3 h-3 text-purple-400" />
                              <span className="text-purple-400">{selectedVoice.name} (Nova)</span>
                            </>
                          )}
                        </div>
                        <div className="flex items-center gap-1 text-[10px] text-slate-500">
                          <Clock className="w-2.5 h-2.5" />
                          <span>{t.timestamp}</span>
                        </div>
                      </div>
                      <p className="leading-relaxed whitespace-pre-wrap">{t.text}</p>
                    </div>
                  ))
                )}
              </div>

              {/* Bottom Footer indicator */}
              <div className="px-4 py-2 border-t border-blue-500/10 bg-slate-950/30 flex items-center justify-between text-[10px] text-slate-400">
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                  Continuous dialogue active
                </span>
                <span>{transcripts.length} turns</span>
              </div>
            </div>
          )}
        </div>

        {/* Bottom Floating Control Bar */}
        <footer className="p-4 sm:p-6 flex items-center justify-center">
          <div className="flex items-center gap-4 px-6 py-3 rounded-full bg-slate-900/80 backdrop-blur-2xl border border-blue-500/30 shadow-2xl shadow-cyan-950/50">
            {/* Microphone Mute Toggle */}
            <button
              onClick={handleToggleMic}
              className={`p-3.5 rounded-full transition-all cursor-pointer ${
                isMicMuted
                  ? 'bg-red-500/20 text-red-400 border border-red-500/40 hover:bg-red-500/30'
                  : 'bg-gradient-to-tr from-cyan-500 to-blue-600 text-slate-950 hover:brightness-110 shadow-lg shadow-cyan-500/30'
              }`}
              title={isMicMuted ? 'Unmute microphone' : 'Mute microphone'}
            >
              {isMicMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </button>

            {/* Speaker Mute Toggle */}
            <button
              onClick={handleToggleSpeaker}
              className={`p-3 rounded-full border transition-colors cursor-pointer ${
                isSpeakerMuted
                  ? 'bg-red-500/10 text-red-400 border-red-500/30 hover:bg-red-500/20'
                  : 'bg-slate-800/80 text-slate-300 border-slate-700/60 hover:text-white hover:bg-slate-700'
              }`}
              title={isSpeakerMuted ? 'Unmute AI speaker' : 'Mute AI speaker'}
            >
              {isSpeakerMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
            </button>

            {/* Live Captions Toggle */}
            <button
              onClick={() => setShowCaptions((v) => !v)}
              className={`p-3 rounded-full border transition-colors cursor-pointer ${
                showCaptions
                  ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                  : 'bg-slate-800/80 text-slate-400 border-slate-700/60 hover:text-white'
              }`}
              title={showCaptions ? 'Hide live captions' : 'Show live captions'}
            >
              <Subtitles className="w-5 h-5" />
            </button>

            {/* End Conversation Button */}
            <button
              onClick={handleEndSession}
              className="p-3.5 rounded-full bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-600/30 transition-transform active:scale-95 cursor-pointer"
              title="End voice conversation"
            >
              <PhoneOff className="w-5 h-5" />
            </button>
          </div>
        </footer>
      </div>

      {/* Voice Selector Gallery Modal */}
      <VoiceSelectorModal
        isOpen={voiceSelectorOpen}
        onClose={() => setVoiceSelectorOpen(false)}
        selectedVoiceId={selectedVoice.id}
        onSelectVoice={handleSelectVoice}
      />

      {/* End-Of-Call Transcript Confirmation Modal */}
      <TranscriptSaveModal
        isOpen={saveModalOpen}
        transcripts={transcripts}
        onSave={() => {
          onSaveTranscript(transcripts);
          setSaveModalOpen(false);
          onClose();
        }}
        onDiscard={() => {
          setSaveModalOpen(false);
          onClose();
        }}
      />
    </div>
  );
};
