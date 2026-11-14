import React, { useState, useRef, useEffect } from 'react';
import {
  Sparkles,
  Paperclip,
  Image as ImageIcon,
  Code2,
  Globe,
  ArrowRight,
  Send,
  User,
  Music,
  Play,
  Pause,
  Sliders,
  Compass,
  FileText,
  Lightbulb,
  PenTool,
  Volume2,
  VolumeX,
  Volume1,
  ChevronDown,
  AlertTriangle,
  Brain,
  PanelLeft,
} from 'lucide-react';
import { NovaChatLogo } from './NovaChatLogo';
import { useBackgroundMusic } from '../context/BackgroundMusicContext';
import { soundEffects } from '../services/soundEffects';
import { ModelOption, Attachment } from '../types';
import { checkSingleMessageSize } from '../services/tokenEngine';

interface HomeScreenProps {
  onSendMessage: (text: string, attachments?: Attachment[]) => void;
  thinkMode: boolean;
  onToggleThinkMode: () => void;
  searchGrounding: boolean;
  onToggleSearchGrounding: () => void;
  onOpenSettings: (tab?: 'general' | 'appearance' | 'music' | 'memory' | 'data' | 'security' | 'about') => void;
  onOpenVoice?: () => void;
  activeModel?: string;
  onSelectModel?: (modelId: string) => void;
  availableModels?: ModelOption[];
  sidebarOpen?: boolean;
  onToggleSidebar?: () => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  onSendMessage,
  thinkMode,
  onToggleThinkMode,
  searchGrounding,
  onToggleSearchGrounding,
  onOpenSettings,
  onOpenVoice,
  sidebarOpen = true,
  onToggleSidebar,
}) => {
  const [promptInput, setPromptInput] = useState('');
  const [attachedFiles, setAttachedFiles] = useState<Attachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const {
    currentTrack,
    isPlaying,
    isEnabled,
    volume,
    isMuted,
    togglePlay,
    toggleMute,
  } = useBackgroundMusic();

  const handlePromptClick = (starterPrompt: string) => {
    soundEffects.playSelect();
    setPromptInput(starterPrompt);
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  const handleSend = () => {
    if (!promptInput.trim() && attachedFiles.length === 0) return;
    soundEffects.playConfirm();
    onSendMessage(promptInput.trim(), attachedFiles);
    setPromptInput('');
    setAttachedFiles([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleAttachClick = () => {
    soundEffects.playClick();
    fileInputRef.current?.click();
  };

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    soundEffects.playClick();
    const newAttachments: Attachment[] = [];
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        setAttachedFiles((prev) => [
          ...prev,
          {
            id: `att-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            name: file.name,
            type: file.type || 'application/octet-stream',
            base64: reader.result as string,
            size: file.size,
          },
        ]);
      };
      reader.readAsDataURL(file);
    });
  };

  const promptSuggestions = [
    {
      title: 'Explain a topic',
      subtext: 'in simple terms',
      icon: <Lightbulb className="w-4 h-4 text-amber-400" />,
      prompt: 'Explain how neural network attention mechanisms work in simple, intuitive terms with relatable real-world analogies.',
    },
    {
      title: 'Help me write',
      subtext: 'something creative',
      icon: <PenTool className="w-4 h-4 text-emerald-400" />,
      prompt: 'Help me draft an engaging, cinematic announcement for a cutting-edge futuristic tech product launch.',
    },
    {
      title: 'Summarize',
      subtext: 'this content',
      icon: <FileText className="w-4 h-4 text-sky-400" />,
      prompt: 'Please provide a clear executive summary with key takeaways and strategic action points.',
    },
    {
      title: 'Help me brainstorm',
      subtext: 'original ideas',
      icon: <Sparkles className="w-4 h-4 text-purple-400" />,
      prompt: 'Brainstorm 5 innovative, high-impact concepts for next-generation AI workspace interfaces.',
    },
    {
      title: 'Assist with coding',
      subtext: 'syntax & logic',
      icon: <Code2 className="w-4 h-4 text-cyan-400" />,
      prompt: 'Write clean, production-grade TypeScript code implementing an asynchronous task queue with concurrency limits.',
    },
  ];

  return (
    <div className="relative flex-1 flex flex-col h-full overflow-y-auto px-4 sm:px-8 py-6 z-10 text-zinc-100">
      {/* Top Navbar Row */}
      <header className="flex items-center justify-between w-full max-w-6xl mx-auto mb-8 sm:mb-12">
        <div className="flex items-center gap-3">
          {!sidebarOpen && onToggleSidebar && (
            <button
              onClick={() => {
                soundEffects.playClick();
                onToggleSidebar();
              }}
              className="p-2 rounded-xl text-zinc-400 hover:text-cyan-300 hover:bg-[#121e47] transition-colors cursor-pointer"
              title="Open sidebar"
            >
              <PanelLeft className="w-4 h-4" />
            </button>
          )}

          {/* Subtle status label */}
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-[#0c1430]/70 border border-[#1f2d5a]/60 text-xs text-zinc-300 backdrop-blur-md shadow-sm">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            <span className="font-medium text-[11px] text-cyan-300">NovaChat AI</span>
            <span className="text-zinc-500">·</span>
            <span className="text-[10px] text-zinc-400 font-mono">Console Engine</span>
          </div>
        </div>

        {/* Right Top Status Controls: Live Voice, Music Pill & Profile */}
        <div className="flex items-center gap-2.5">
          {onOpenVoice && (
            <button
              type="button"
              onClick={() => {
                soundEffects.playSelect?.();
                onOpenVoice();
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gradient-to-r from-cyan-500/20 to-blue-500/20 hover:from-cyan-500/30 hover:to-blue-500/30 border border-cyan-500/40 text-cyan-300 text-xs font-semibold shadow-[0_0_12px_rgba(6,182,212,0.2)] transition-all cursor-pointer"
              title="Start Nova Live Voice Conversation"
            >
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
              <span className="hidden sm:inline">✦ NOVA LIVE</span>
              <span className="sm:hidden">LIVE</span>
            </button>
          )}

          {/* Background Music Top Pill */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#0a1026]/80 border border-[#203166]/70 text-xs backdrop-blur-md shadow-md hover:border-cyan-500/40 transition-colors">
            <button
              type="button"
              onClick={() => {
                soundEffects.playClick();
                onOpenSettings('music');
              }}
              className="flex items-center gap-1.5 text-zinc-300 hover:text-cyan-300 transition-colors cursor-pointer"
              title="Configure Background Music"
            >
              <Music className="w-3.5 h-3.5 text-cyan-400" />
              <span className="font-medium text-[11px] truncate max-w-[130px]">
                {currentTrack?.name || 'Home Menu'}
              </span>
            </button>

            <div className="h-3 w-px bg-zinc-700/60" />

            <button
              type="button"
              onClick={() => {
                soundEffects.playClick();
                togglePlay();
              }}
              className="p-1 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-800/80 transition-colors cursor-pointer"
              title={isPlaying && isEnabled ? 'Pause music' : 'Play music'}
            >
              {isPlaying && isEnabled ? (
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
              className="p-1 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-800/80 transition-colors cursor-pointer"
              title={isMuted || volume === 0 ? 'Unmute' : 'Mute'}
            >
              {isMuted || volume === 0 ? (
                <VolumeX className="w-3 h-3 text-red-400" />
              ) : volume < 0.5 ? (
                <Volume1 className="w-3 h-3 text-zinc-400" />
              ) : (
                <Volume2 className="w-3 h-3 text-cyan-400" />
              )}
            </button>

            <span className="text-[10px] font-mono text-zinc-400">
              {isMuted ? '0%' : `${Math.round(volume * 100)}%`}
            </span>
          </div>

          {/* User Profile / Quick Settings Button */}
          <button
            type="button"
            onClick={() => {
              soundEffects.playClick();
              onOpenSettings('general');
            }}
            className="p-2 rounded-full bg-[#0a1026]/80 border border-[#203166]/70 hover:border-cyan-500/50 text-zinc-300 hover:text-cyan-300 transition-colors shadow-md backdrop-blur-md cursor-pointer"
            title="User Profile & Settings"
          >
            <User className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Center Hero Content */}
      <div
        className={`flex-1 flex flex-col items-center justify-center mx-auto w-full my-auto text-center transition-all duration-300 ease-in-out ${
          sidebarOpen ? 'max-w-4xl xl:max-w-5xl' : 'max-w-4xl lg:max-w-5xl xl:max-w-6xl'
        }`}
      >
        {/* Glowing Logo Display */}
        <div className="mb-4 relative group cursor-pointer" onClick={() => soundEffects.playSelect()}>
          <div className="absolute inset-0 bg-cyan-500/20 blur-3xl rounded-full scale-125 pointer-events-none animate-pulse" />
          <NovaChatLogo size={92} variant="hero" showGlow={true} />
        </div>

        {/* Title & Tagline */}
        <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white mb-2 flex items-center justify-center gap-2.5">
          <span>NovaChat</span>
          <span className="bg-gradient-to-r from-cyan-400 via-blue-500 to-indigo-400 bg-clip-text text-transparent drop-shadow-[0_0_20px_rgba(0,217,255,0.4)]">
            AI
          </span>
        </h1>
        <p className="text-sm sm:text-base text-zinc-400 max-w-lg mb-8 font-normal tracking-wide">
          Your AI Companion in a Smarter World
        </p>

        {/* Cinematic Large Glass Message Composer */}
        <div className="w-full relative rounded-3xl bg-[#080e24]/75 border border-[#1f2f63]/80 p-3 sm:p-4 backdrop-blur-xl shadow-2xl shadow-cyan-950/20 focus-within:border-cyan-500/60 focus-within:ring-2 focus-within:ring-cyan-500/20 transition-all text-left mb-8">
          {(() => {
            const singleSize = checkSingleMessageSize(promptInput);
            if (singleSize.isOversized) {
              return (
                <div className="mb-2 p-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
                  <span className="text-[11px] leading-tight">{singleSize.recommendation}</span>
                </div>
              );
            }
            return null;
          })()}

          <textarea
            ref={textareaRef}
            rows={2}
            value={promptInput}
            onChange={(e) => setPromptInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask me anything..."
            className="w-full bg-transparent text-sm sm:text-base text-zinc-100 placeholder-zinc-500 focus:outline-none resize-none px-2 py-1"
          />

          {/* Attached Files Preview */}
          {attachedFiles.length > 0 && (
            <div className="flex flex-wrap gap-2 px-2 py-1.5 border-t border-zinc-800/60 mb-2">
              {attachedFiles.map((file, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-zinc-800/80 text-[11px] text-zinc-300 border border-zinc-700/60"
                >
                  <Paperclip className="w-3 h-3 text-cyan-400" />
                  <span className="truncate max-w-[120px]">{file.name}</span>
                  <button
                    type="button"
                    onClick={() => {
                      soundEffects.playClick();
                      setAttachedFiles((prev) => prev.filter((_, i) => i !== idx));
                    }}
                    className="text-zinc-400 hover:text-red-400 text-xs ml-1 cursor-pointer"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Composer Bottom Action Row */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#1a254d]/60">
            {/* Left Action Shortcuts */}
            <div className="flex items-center gap-1.5 sm:gap-2">
              {/* Attach Button */}
              <button
                type="button"
                onClick={handleAttachClick}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-[#0d1636]/80 hover:bg-[#14204d] text-zinc-300 hover:text-white border border-[#213268]/70 text-xs font-medium transition-colors cursor-pointer"
                title="Attach image or file"
              >
                <Paperclip className="w-3.5 h-3.5 text-cyan-400" />
                <span className="hidden sm:inline">Attach</span>
              </button>

              {/* Generate Image Shortcut */}
              <button
                type="button"
                onClick={() => {
                  soundEffects.playClick();
                  setPromptInput('Generate an image of ');
                  textareaRef.current?.focus();
                }}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-[#0d1636]/80 hover:bg-[#14204d] text-zinc-300 hover:text-white border border-[#213268]/70 text-xs font-medium transition-colors cursor-pointer"
                title="Create an image with Pollinations AI"
              >
                <ImageIcon className="w-3.5 h-3.5 text-purple-400" />
                <span className="hidden sm:inline">Image</span>
              </button>

              {/* Code Shortcut */}
              <button
                type="button"
                onClick={() => {
                  soundEffects.playClick();
                  setPromptInput('Write high-performance code to ');
                  textareaRef.current?.focus();
                }}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-[#0d1636]/80 hover:bg-[#14204d] text-zinc-300 hover:text-white border border-[#213268]/70 text-xs font-medium transition-colors cursor-pointer"
                title="Code generation helper"
              >
                <Code2 className="w-3.5 h-3.5 text-sky-400" />
                <span className="hidden sm:inline">Code</span>
              </button>

              {/* Web Grounding Toggle */}
              <button
                type="button"
                onClick={() => {
                  soundEffects.playToggle(!searchGrounding);
                  onToggleSearchGrounding();
                }}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-medium transition-colors cursor-pointer ${
                  searchGrounding
                    ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300'
                    : 'bg-[#0d1636]/80 border-[#213268]/70 text-zinc-400 hover:text-zinc-200'
                }`}
                title="Toggle Web Search Grounding"
              >
                <Globe className={`w-3.5 h-3.5 ${searchGrounding ? 'text-cyan-400' : 'text-zinc-400'}`} />
                <span className="hidden sm:inline">Web</span>
              </button>

              {/* Think Mode Toggle (ChatGPT-style) */}
              <button
                type="button"
                role="switch"
                aria-checked={thinkMode}
                aria-label="Toggle Think Mode"
                onClick={() => {
                  soundEffects.playToggle(!thinkMode);
                  onToggleThinkMode();
                }}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
                  thinkMode
                    ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300 shadow-xs shadow-cyan-500/25 font-semibold'
                    : 'bg-[#0d1636]/80 border-[#213268]/70 text-zinc-400 hover:text-zinc-200'
                }`}
                title="Think mode: Uses high reasoning effort and answer self-verification for difficult tasks. May take longer and use more tokens."
              >
                <Brain className={`w-3.5 h-3.5 ${thinkMode ? 'text-cyan-400 animate-pulse' : 'text-zinc-400'}`} />
                <span>Think</span>
                {thinkMode && <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />}
              </button>
            </div>

            {/* Hidden native file input */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,text/*,.pdf,.json,.py,.js,.ts"
              onChange={handleFileSelected}
              className="hidden"
            />

            {/* Right: Clean Default Model Badge & Glowing Send Button */}
            <div className="flex items-center gap-2 relative">
              {/* Single Default AI Model Indicator */}
              <div
                className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-[#0d1636]/80 text-zinc-300 border border-[#213268]/70 text-xs font-medium select-none"
                title="Primary Model: NovaChat AI (GPT-OSS 120B on Groq LPU)"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                <span>NovaChat AI</span>
              </div>

              {/* Glowing Round Send Button */}
              <button
                type="button"
                onClick={handleSend}
                disabled={!promptInput.trim() && attachedFiles.length === 0}
                className="w-9 h-9 rounded-full bg-gradient-to-r from-cyan-400 to-blue-600 hover:from-cyan-300 hover:to-blue-500 text-zinc-950 flex items-center justify-center font-bold shadow-lg shadow-cyan-500/30 hover:scale-105 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shrink-0"
                title="Send Message"
              >
                <Send className="w-4 h-4 fill-current ml-0.5" />
              </button>
            </div>
          </div>
        </div>

        {/* "Try these prompts" 5-Card Row */}
        <div className="w-full">
          <div className="text-xs text-zinc-400 font-medium mb-3 flex items-center justify-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            <span>Try these prompts</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-2.5 w-full">
            {promptSuggestions.map((item, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handlePromptClick(item.prompt)}
                className="group p-3 rounded-2xl bg-[#091026]/70 hover:bg-[#101b42]/80 border border-[#1b2b5c]/70 hover:border-cyan-500/50 text-left transition-all backdrop-blur-md shadow-sm hover:shadow-cyan-950/20 hover:-translate-y-0.5 cursor-pointer flex flex-col justify-between"
              >
                <div className="mb-2 p-1.5 w-fit rounded-lg bg-[#14204d]/70 group-hover:bg-cyan-500/20 transition-colors">
                  {item.icon}
                </div>
                <div>
                  <div className="text-xs font-semibold text-zinc-200 group-hover:text-cyan-300 transition-colors">
                    {item.title}
                  </div>
                  <div className="text-[11px] text-zinc-400 group-hover:text-zinc-300 transition-colors">
                    {item.subtext}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom Footer Credits */}
      <footer className="mt-auto pt-6 text-center text-[11px] text-zinc-500 font-mono">
        NovaChat AI · Futuristic Console Interface · Powered by Groq LPU & Gemini
      </footer>
    </div>
  );
};
