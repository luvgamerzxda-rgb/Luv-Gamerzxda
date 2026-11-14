import React, { useRef, useEffect, useState } from 'react';
import {
  Sparkles,
  Bot,
  User,
  PanelLeft,
  Share2,
  Copy,
  Check,
  RotateCcw,
  Volume2,
  VolumeX,
  ExternalLink,
  Search,
  Globe,
  ArrowDown,
  Atom,
  Code2,
  Compass,
  Database,
  Plus,
  Download,
  Loader2,
  Cpu,
  LineChart,
  Palette,
  GraduationCap,
  Lock,
  AlertCircle,
  BookmarkPlus
} from 'lucide-react';
import { ChatMessage, GroundingSource, Attachment, TokenEstimate } from '../types';
import { MarkdownRenderer } from './MarkdownRenderer';
import { LoadingDots } from './LoadingDots';
import { STARTER_PROMPTS, AVAILABLE_PERSONAS, CUSTOM_LOGO_BASE64 } from '../constants';
import { MusicMiniControl } from './MusicMiniControl';
import { NovaChatLogo } from './NovaChatLogo';
import { soundEffects } from '../services/soundEffects';
import { ContextUsageIndicator } from './ContextUsageIndicator';
import { ContextWarningBanner } from './ContextWarningBanner';
import { HandoffNotice } from './HandoffNotice';
import { SourcePanel } from './SourcePanel';

interface ChatAreaProps {
  messages: ChatMessage[];
  isStreaming: boolean;
  onSelectPrompt: (prompt: string) => void;
  onRegenerate: () => void;
  onToggleSidebar: () => void;
  sidebarOpen: boolean;
  activeModel: string;
  searchGrounding: boolean;
  systemPersonaId: string;
  activeRoutedPersonaId?: string;
  onSelectPersona: (personaId: string) => void;
  onNewChat: () => void;
  onExportChat: () => void;
  onOpenMusicSettings?: () => void;
  onOpenVoice?: () => void;
  tokenEstimate?: TokenEstimate;
  onStartNewChatWithContext?: () => void;
  onContinueCurrentChat?: () => void;
  onDismissTokenWarning?: () => void;
  showTokenWarning?: boolean;
  handoffSummary?: string;
  parentTitle?: string;
  parentSessionId?: string;
  onNavigateToParent?: (sessionId: string) => void;
  onSaveMessageToMemory?: (message: ChatMessage) => void;
  onSaveCodeToMemory?: (code: string, language: string) => void;
}

/**
 * Safely extracts generated image URL and descriptive alt text from a message.
 */
function extractGeneratedImageUrl(content: string): { url: string; altText: string } | null {
  if (!content) return null;
  const match = content.match(/!\[([^\]]*)\]\((https:\/\/[^)]+)\)/);
  if (match) {
    return {
      altText: match[1] || 'generated-image',
      url: match[2],
    };
  }
  return null;
}

export const ChatArea: React.FC<ChatAreaProps> = ({
  messages,
  isStreaming,
  onSelectPrompt,
  onRegenerate,
  onToggleSidebar,
  sidebarOpen,
  activeModel,
  searchGrounding,
  systemPersonaId,
  activeRoutedPersonaId,
  onSelectPersona,
  onNewChat,
  onExportChat,
  onOpenMusicSettings,
  onOpenVoice,
  tokenEstimate,
  onStartNewChatWithContext,
  onContinueCurrentChat,
  onDismissTokenWarning,
  showTokenWarning,
  handoffSummary,
  parentTitle,
  parentSessionId,
  onNavigateToParent,
  onSaveMessageToMemory,
  onSaveCodeToMemory,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const bottomAnchorRef = useRef<HTMLDivElement>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const [downloadingMessageId, setDownloadingMessageId] = useState<string | null>(null);
  const [downloadedMessageId, setDownloadedMessageId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<{ id: string; message: string } | null>(null);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [personaMenuOpen, setPersonaMenuOpen] = useState(false);

  // Auto-scroll when new messages arrive or stream updates
  useEffect(() => {
    if (!showScrollBottom) {
      bottomAnchorRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isStreaming, showScrollBottom]);

  // Monitor scroll position
  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    const distanceToBottom = scrollHeight - scrollTop - clientHeight;
    setShowScrollBottom(distanceToBottom > 120);
  };

  const scrollToBottom = () => {
    bottomAnchorRef.current?.scrollIntoView({ behavior: 'smooth' });
    setShowScrollBottom(false);
  };

  const handleCopyMessage = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedMessageId(id);
      setTimeout(() => setCopiedMessageId(null), 2000);
    } catch (err) {
      console.error('Failed to copy message:', err);
    }
  };

  const handleToggleSpeak = (id: string, text: string) => {
    if (!('speechSynthesis' in window)) return;

    if (speakingMessageId === id) {
      window.speechSynthesis.cancel();
      setSpeakingMessageId(null);
      return;
    }

    window.speechSynthesis.cancel();
    // Clean markdown syntax for speech
    const cleanText = text
      .replace(/```[\s\S]*?```/g, 'Code block omitted.')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/[*_#>[\]]/g, '');

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = 1.05;
    utterance.onend = () => setSpeakingMessageId(null);
    utterance.onerror = () => setSpeakingMessageId(null);

    setSpeakingMessageId(id);
    window.speechSynthesis.speak(utterance);
  };

  const handleDownloadImage = async (imageUrl: string, altText: string, messageId: string) => {
    if (downloadingMessageId) return; // Prevent duplicate concurrent downloads
    setDownloadingMessageId(messageId);
    setDownloadError(null);

    try {
      soundEffects.playClick?.();

      // Generate safe descriptive filename e.g. novachat-lord-shiva-20261023.png
      const cleanSubject = altText
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 32) || 'image';
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const filename = `novachat-${cleanSubject}-${dateStr}.png`;

      // Fetch image bytes via server proxy to bypass cross-origin browser restrictions
      const proxyUrl = `/api/download-image?url=${encodeURIComponent(imageUrl)}&filename=${encodeURIComponent(filename)}`;
      const response = await fetch(proxyUrl);

      if (!response.ok) {
        throw new Error(`Download failed with status ${response.status}`);
      }

      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);

      // Trigger native download to user's device
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Clean up temporary blob URL after starting download
      setTimeout(() => {
        window.URL.revokeObjectURL(blobUrl);
      }, 1500);

      setDownloadedMessageId(messageId);
      setTimeout(() => {
        setDownloadedMessageId((curr) => (curr === messageId ? null : curr));
      }, 2500);
    } catch (err: any) {
      console.error('Image download error:', err);
      setDownloadError({ id: messageId, message: 'Download failed. Click to retry.' });
      setTimeout(() => {
        setDownloadError((curr) => (curr?.id === messageId ? null : curr));
      }, 5000);
    } finally {
      setDownloadingMessageId(null);
    }
  };

  const isAutoMode = !systemPersonaId || systemPersonaId === 'auto';
  const selectedPersona = AVAILABLE_PERSONAS.find((p) => p.id === systemPersonaId) || AVAILABLE_PERSONAS[0];
  const activeRoutedPersona = AVAILABLE_PERSONAS.find((p) => p.id === activeRoutedPersonaId) || AVAILABLE_PERSONAS[1]; // Nova

  const getPersonaIcon = (iconName?: string, className = "w-3.5 h-3.5") => {
    switch (iconName) {
      case 'Sparkles':
        return <Sparkles className={`${className} text-emerald-400`} />;
      case 'Bot':
        return <Bot className={`${className} text-cyan-400`} />;
      case 'Cpu':
        return <Cpu className={`${className} text-sky-400`} />;
      case 'LineChart':
        return <LineChart className={`${className} text-purple-400`} />;
      case 'Palette':
        return <Palette className={`${className} text-rose-400`} />;
      case 'GraduationCap':
        return <GraduationCap className={`${className} text-emerald-400`} />;
      default:
        return <Bot className={`${className} text-cyan-400`} />;
    }
  };

  const getStarterIcon = (iconName: string) => {
    switch (iconName) {
      case 'Atom':
        return <Atom className="w-4 h-4 text-emerald-400" />;
      case 'Code2':
        return <Code2 className="w-4 h-4 text-sky-400" />;
      case 'Compass':
        return <Compass className="w-4 h-4 text-amber-400" />;
      case 'Database':
        return <Database className="w-4 h-4 text-purple-400" />;
      default:
        return <NovaChatLogo size={16} showGlow={false} />;
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-transparent relative overflow-hidden">
      {/* Top Navbar */}
      <header className="h-14 border-b border-[#182755]/80 px-4 flex items-center justify-between bg-[#060a18]/85 backdrop-blur-xl z-20 shrink-0">
        <div className="flex items-center gap-2 sm:gap-3">
          {!sidebarOpen && (
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

          {/* Persona / Role Selector Pill */}
          <div className="relative">
            <button
              onClick={() => {
                soundEffects.playClick();
                setPersonaMenuOpen(!personaMenuOpen);
              }}
              title={
                isAutoMode
                  ? `Auto Mode: Intelligently routing to ${activeRoutedPersona.name} (${activeRoutedPersona.role})`
                  : `Locked to ${selectedPersona.name} (${selectedPersona.role}). Click to change or switch to Auto Mode.`
              }
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs transition-colors cursor-pointer border ${
                isAutoMode
                  ? 'bg-[#0c1533]/90 hover:bg-[#121f4a] text-zinc-200 border-emerald-500/40 shadow-sm shadow-emerald-950/20'
                  : 'bg-[#151326]/90 hover:bg-[#1d1a38] text-zinc-200 border-amber-500/40 shadow-sm shadow-amber-950/20'
              }`}
            >
              {isAutoMode ? (
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                getPersonaIcon(selectedPersona.iconName)
              )}
              <span className="font-medium hidden xs:inline">
                {isAutoMode ? 'Auto' : selectedPersona.name}
              </span>
              <span className="text-[10px] hidden sm:inline text-zinc-400">
                ({isAutoMode ? activeRoutedPersona.name : selectedPersona.role})
              </span>
              {!isAutoMode && (
                <Lock className="w-2.5 h-2.5 text-amber-400/90 ml-0.5" />
              )}
            </button>

            {personaMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-30"
                  onClick={() => setPersonaMenuOpen(false)}
                />
                <div className="absolute top-full left-0 mt-2 w-80 rounded-2xl bg-[#18181c] border border-zinc-700/80 shadow-2xl p-2 z-40 text-xs backdrop-blur-xl">
                  <div className="flex items-center justify-between px-2.5 py-1 text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
                    <span>Persona Mode & Roles</span>
                    {!isAutoMode && (
                      <span className="flex items-center gap-1 text-[10px] text-amber-400 font-normal lowercase tracking-normal">
                        <Lock className="w-2.5 h-2.5" /> locked
                      </span>
                    )}
                  </div>

                  {/* AUTO MODE */}
                  <button
                    onClick={() => {
                      soundEffects.playClick();
                      onSelectPersona('auto');
                      setPersonaMenuOpen(false);
                    }}
                    className={`w-full text-left px-2.5 py-2 rounded-xl transition-all cursor-pointer flex flex-col gap-0.5 mb-1 ${
                      isAutoMode
                        ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                        : 'text-zinc-300 hover:bg-zinc-800/80 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 font-medium">
                        <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Auto Mode</span>
                        <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300 font-normal">
                          Default
                        </span>
                      </div>
                      {isAutoMode && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                    </div>
                    <p className="text-[11px] text-zinc-400 leading-snug pl-5">
                      Dynamically detects intent and activates the best persona for every request.
                    </p>
                  </button>

                  <div className="px-2.5 py-1 text-[9px] font-semibold text-zinc-400 uppercase tracking-wider border-t border-zinc-800/80 my-1 pt-1.5">
                    Specific Personas (Lock)
                  </div>

                  {/* 5 Distinct Personas */}
                  {AVAILABLE_PERSONAS.filter((p) => p.id !== 'auto').map((p) => {
                    const isSelected = systemPersonaId === p.id;
                    return (
                      <button
                        key={p.id}
                        onClick={() => {
                          soundEffects.playClick();
                          onSelectPersona(p.id);
                          setPersonaMenuOpen(false);
                        }}
                        className={`w-full text-left px-2.5 py-1.5 rounded-xl transition-all cursor-pointer flex flex-col gap-0.5 ${
                          isSelected
                            ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-medium'
                            : 'text-zinc-300 hover:bg-zinc-800/80 border border-transparent'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 font-medium">
                            {getPersonaIcon(p.iconName)}
                            <span>{p.name}</span>
                            <span className="text-[10px] text-zinc-400 font-normal">({p.role})</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400 font-mono hidden sm:inline">
                              {p.category}
                            </span>
                            {isSelected && (
                              <div className="flex items-center gap-0.5 text-amber-400" title="Locked">
                                <Lock className="w-3 h-3 text-emerald-400" />
                              </div>
                            )}
                          </div>
                        </div>
                        <p className="text-[11px] text-zinc-400 leading-snug pl-5">{p.description}</p>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {/* Search Grounding Indicator */}
          {searchGrounding && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-sky-500/15 border border-sky-500/30 text-sky-400 text-xs">
              <Globe className="w-3 h-3" />
              <span className="hidden md:inline font-mono text-[11px]">Web Grounding</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {tokenEstimate && (
            <div className="hidden sm:inline-block">
              <ContextUsageIndicator
                estimate={tokenEstimate}
                onStartNewChatWithContext={onStartNewChatWithContext}
                compact={true}
              />
            </div>
          )}

          {onOpenVoice && (
            <button
              onClick={() => {
                soundEffects.playSelect?.();
                onOpenVoice();
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gradient-to-r from-cyan-500/20 to-blue-500/20 hover:from-cyan-500/30 hover:to-blue-500/30 border border-cyan-500/40 text-cyan-300 text-xs font-semibold shadow-[0_0_12px_rgba(6,182,212,0.2)] transition-all cursor-pointer"
              title="Start Nova Live Voice Conversation"
            >
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
              <span className="hidden xs:inline">✦ NOVA LIVE</span>
              <span className="xs:hidden">LIVE</span>
            </button>
          )}

          {onOpenMusicSettings && (
            <MusicMiniControl onOpenMusicSettings={onOpenMusicSettings} />
          )}

          {messages.length > 0 && (
            <button
              onClick={onExportChat}
              className="p-2 rounded-xl text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
              title="Export chat as Markdown"
            >
              <Share2 className="w-4 h-4" />
            </button>
          )}

          <button
            onClick={onNewChat}
            className="md:hidden p-2 rounded-xl text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
            title="New Chat"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Message List Scroll Container */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 sm:px-6 md:px-8 py-6 w-full min-w-0"
      >
        <div
          className={`w-full mx-auto space-y-6 transition-all duration-300 ease-in-out ${
            sidebarOpen
              ? 'max-w-4xl xl:max-w-5xl'
              : 'max-w-4xl lg:max-w-5xl xl:max-w-6xl'
          }`}
        >
          {/* Handoff Context Banner (if this chat was created via context continuation) */}
          {handoffSummary && (
            <HandoffNotice
              parentTitle={parentTitle}
              parentSessionId={parentSessionId}
              handoffSummary={handoffSummary}
              onNavigateToParent={onNavigateToParent}
            />
          )}

          {/* Pre-Limit Warning Banner when approaching or exceeding safe budget */}
          {showTokenWarning && onStartNewChatWithContext && onContinueCurrentChat && onDismissTokenWarning && (
            <ContextWarningBanner
              onContinueCurrent={onContinueCurrentChat}
              onStartNewWithContext={onStartNewChatWithContext}
              onDismiss={onDismissTokenWarning}
              tokensCount={tokenEstimate?.totalInputTokens}
              safeBudget={tokenEstimate?.safeBudget}
            />
          )}

          {messages.length === 0 ? (
            /* Welcome Empty State */
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
              <div className="w-16 h-16 rounded-full bg-[#080e24] border border-cyan-500/40 flex items-center justify-center mb-5 shadow-lg shadow-cyan-950/40 overflow-hidden shrink-0">
                <NovaChatLogo size={42} showGlow={true} />
              </div>
              <h2 className="text-2xl sm:text-3xl font-semibold text-zinc-100 mb-2">
                What can I help with today?
              </h2>
              <p className="text-sm text-zinc-400 max-w-md mb-8">
                Powered by high-speed Groq models with multi-turn memory, code syntax highlighting, and live Google Search grounding.
              </p>

              {/* Starter Prompt Cards */}
              <div
                className={`grid grid-cols-1 sm:grid-cols-2 gap-3.5 w-full mx-auto transition-all duration-300 ease-in-out ${
                  sidebarOpen
                    ? 'max-w-2xl lg:max-w-3xl'
                    : 'max-w-2xl lg:max-w-3xl xl:max-w-4xl'
                }`}
              >
                {STARTER_PROMPTS.map((item, idx) => (
                  <button
                    key={idx}
                    onClick={() => onSelectPrompt(item.prompt)}
                    className="p-3.5 rounded-2xl bg-zinc-900/80 hover:bg-zinc-800/90 border border-zinc-800 hover:border-zinc-700/80 text-left transition-all group flex flex-col justify-between cursor-pointer hover:shadow-md"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div className="p-1.5 rounded-lg bg-zinc-800 group-hover:bg-zinc-700 transition-colors">
                        {getStarterIcon(item.icon)}
                      </div>
                      <span className="text-[11px] font-mono text-zinc-400 uppercase tracking-wide">
                        {item.category}
                      </span>
                    </div>
                    <div>
                      <div className="text-xs sm:text-sm font-medium text-zinc-200 group-hover:text-emerald-300 transition-colors">
                        {item.title}
                      </div>
                      <div className="text-xs text-zinc-500 line-clamp-2 mt-0.5">
                        {item.prompt}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* Messages Thread */
            messages.map((message, idx) => {
              const isUser = message.role === 'user';
              const isLastAi = !isUser && idx === messages.length - 1;

              return (
                <div
                  key={message.id || idx}
                  className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} group`}
                >
                  <div className={`flex gap-3 max-w-full ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
                    {/* Avatar */}
                    {!isUser ? (
                      <div className="w-8 h-8 rounded-full bg-[#080e24] border border-cyan-500/40 flex items-center justify-center shrink-0 mt-0.5 shadow-md shadow-cyan-950/40 overflow-hidden">
                        <NovaChatLogo size={24} showGlow={false} />
                      </div>
                    ) : null}

                    {/* Message Bubble & Content */}
                    <div
                      className={`relative flex flex-col ${
                        isUser
                          ? 'max-w-[85%] sm:max-w-[75%] items-end w-fit'
                          : 'max-w-full flex-1 min-w-0'
                      }`}
                    >
                      {/* Attachments if any */}
                      {message.attachments && message.attachments.length > 0 && (
                        <div className={`flex flex-wrap gap-2 mb-2 ${isUser ? 'justify-end' : 'justify-start'}`}>
                          {message.attachments.map((att) => (
                            <div
                              key={att.id}
                              onClick={() => {
                                if (att.type.startsWith('image/')) {
                                  setPreviewImage(att.base64);
                                }
                              }}
                              className="relative rounded-xl overflow-hidden border border-[#213268] bg-[#0c1430] cursor-pointer shadow-sm hover:opacity-90 transition-opacity"
                            >
                              {att.type.startsWith('image/') && att.base64 ? (
                                <img
                                  src={att.base64}
                                  alt={att.name || 'Attachment'}
                                  className="max-h-48 max-w-xs object-cover rounded-xl"
                                />
                              ) : (
                                <div className="p-2.5 flex items-center gap-2 text-xs text-zinc-300">
                                  <div className="w-6 h-6 rounded bg-[#13204a] flex items-center justify-center text-cyan-400">
                                    📄
                                  </div>
                                  <span className="truncate max-w-[140px]">{att.name}</span>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Text Body */}
                      {isUser ? (
                        <div className="flex flex-col items-end gap-1">
                          <div className="w-fit min-w-[3.5rem] max-w-full px-5 py-3 rounded-3xl bg-[#101e4a]/90 border border-[#223b82]/80 text-white text-[15px] leading-relaxed break-words whitespace-pre-wrap shadow-md backdrop-blur-md">
                            {message.content}
                          </div>
                          {message.content && (
                            <div className="flex items-center gap-1.5 text-zinc-400 opacity-75 group-hover:opacity-100 transition-opacity px-1">
                              <button
                                type="button"
                                onClick={() => handleCopyMessage(message.id, message.content)}
                                className="p-1 rounded-lg hover:bg-[#13204a] hover:text-zinc-200 transition-colors text-[11px] flex items-center gap-1 cursor-pointer"
                                title="Copy message"
                              >
                                {copiedMessageId === message.id ? (
                                  <>
                                    <Check className="w-3 h-3 text-cyan-400" />
                                    <span className="text-cyan-400">Copied</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3 h-3" />
                                    <span>Copy</span>
                                  </>
                                )}
                              </button>
                              {onSaveMessageToMemory && (
                                <button
                                  type="button"
                                  onClick={() => onSaveMessageToMemory(message)}
                                  className="p-1 rounded-lg hover:bg-[#13204a] hover:text-cyan-300 transition-colors text-[11px] flex items-center gap-1 cursor-pointer"
                                  title="Save message to Memory Vault"
                                >
                                  <BookmarkPlus className="w-3 h-3" />
                                  <span>Save to Memory</span>
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div
                          className="text-[15px] leading-relaxed text-zinc-200"
                          onClick={(e) => {
                            const target = e.target as HTMLElement;
                            if (target.tagName === 'IMG' && target.getAttribute('src')) {
                              setPreviewImage(target.getAttribute('src'));
                            }
                          }}
                        >
                          {/* Active Persona & Provider Attribution Indicator */}
                          {(message.personaName || (!message.isStreaming && (message.providerUsed || message.modelUsed))) && (
                            <div className="flex items-center flex-wrap gap-1.5 mb-1.5 text-[11px] text-zinc-400">
                              {message.personaName && (
                                <>
                                  <span className="font-medium text-zinc-300">{message.personaName}</span>
                                  <span className="text-zinc-600">·</span>
                                  <span className="text-zinc-400">{message.personaRole}</span>
                                  {message.isAutoMode && (
                                    <span className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.2 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
                                      <Sparkles className="w-2.5 h-2.5" /> Auto
                                    </span>
                                  )}
                                </>
                              )}
                              {!message.isStreaming && (message.providerUsed || message.modelUsed) && (
                                <span
                                  className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md font-mono border ${
                                    message.isFallback
                                      ? 'bg-amber-500/10 text-amber-300 border-amber-500/25'
                                      : 'bg-[#0e193d]/80 text-zinc-400 border-[#213268]/80'
                                  }`}
                                  title={
                                    message.isFallback && message.fallbackReason
                                      ? `Fallback triggered: ${message.fallbackReason}`
                                      : `Answered by ${message.providerUsed === 'gemini' ? 'Google Gemini' : 'Groq'} (${message.modelUsed || ''})`
                                  }
                                >
                                  {message.isFallback
                                    ? `Gemini fallback · ${message.modelUsed || 'gemini-3-flash-preview'}`
                                    : `${message.providerUsed === 'gemini' ? 'Gemini' : 'Groq'} · ${message.modelUsed || ''}`}
                                </span>
                              )}
                            </div>
                          )}

                          {/* Search Grounding Sources Cards */}
                          {message.groundingChunks && message.groundingChunks.length > 0 && (
                            <SourcePanel
                              groundingChunks={message.groundingChunks}
                              webSearchQueries={message.webSearchQueries}
                              searchProvider={message.searchProvider}
                              isStreaming={message.isStreaming}
                            />
                          )}

                          {/* Markdown or Loading */}
                          {message.content ? (
                            <>
                              {message.isStreaming && message.searchStatus && message.searchStatus !== 'done' && (
                                <div className="mb-2">
                                  <LoadingDots
                                    label={message.statusNotice || 'Processing search'}
                                    status={message.searchStatus as any}
                                    query={message.webSearchQueries?.[0]}
                                  />
                                </div>
                              )}
                              <MarkdownRenderer
                                content={message.content}
                                sources={message.groundingChunks}
                                onSaveCodeToMemory={onSaveCodeToMemory}
                              />
                            </>
                           ) : message.isStreaming ? (
                            <LoadingDots
                              label={message.statusNotice || 'Thinking'}
                              status={(message.searchStatus as any) || 'thinking'}
                              query={message.webSearchQueries?.[0]}
                            />
                          ) : (
                            <div className="flex items-center gap-2 text-zinc-400 italic text-sm py-1">
                              <AlertCircle className="w-4 h-4 text-zinc-500 shrink-0" />
                              <span>No response received. Please try again.</span>
                            </div>
                          )}

                          {/* AI Action Toolbar */}
                          {!message.isStreaming && message.content && (
                            <div className="flex items-center gap-2 mt-3 text-zinc-400 opacity-90 transition-opacity flex-wrap">
                              <button
                                onClick={() => handleCopyMessage(message.id, message.content)}
                                className="p-1.5 rounded-lg hover:bg-zinc-800 hover:text-zinc-200 transition-colors text-xs flex items-center gap-1 cursor-pointer"
                                title="Copy response"
                              >
                                {copiedMessageId === message.id ? (
                                  <>
                                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                                    <span className="text-emerald-400 text-[11px]">Copied</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3.5 h-3.5" />
                                    <span className="text-[11px]">Copy</span>
                                  </>
                                )}
                              </button>

                              <button
                                onClick={() => handleToggleSpeak(message.id, message.content)}
                                className="p-1.5 rounded-lg hover:bg-zinc-800 hover:text-zinc-200 transition-colors text-xs flex items-center gap-1 cursor-pointer"
                                title={speakingMessageId === message.id ? 'Stop audio' : 'Read aloud'}
                              >
                                {speakingMessageId === message.id ? (
                                  <>
                                    <VolumeX className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                                    <span className="text-emerald-400 text-[11px]">Speaking</span>
                                  </>
                                ) : (
                                  <>
                                    <Volume2 className="w-3.5 h-3.5" />
                                    <span className="text-[11px]">Listen</span>
                                  </>
                                )}
                              </button>

                              {/* Download Button (Alongside Copy and Listen for Generated Images) */}
                              {(() => {
                                const imgData = extractGeneratedImageUrl(message.content);
                                if (!imgData) return null;

                                const isDownloading = downloadingMessageId === message.id;
                                const isDownloaded = downloadedMessageId === message.id;

                                return (
                                  <button
                                    onClick={() => handleDownloadImage(imgData.url, imgData.altText, message.id)}
                                    disabled={isDownloading}
                                    className="p-1.5 rounded-lg hover:bg-zinc-800 hover:text-zinc-200 transition-colors text-xs flex items-center gap-1 cursor-pointer disabled:opacity-50"
                                    title="Download generated image to device"
                                  >
                                    {isDownloading ? (
                                      <>
                                        <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                                        <span className="text-cyan-400 text-[11px]">Downloading...</span>
                                      </>
                                    ) : isDownloaded ? (
                                      <>
                                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                                        <span className="text-emerald-400 text-[11px]">Saved</span>
                                      </>
                                    ) : (
                                      <>
                                        <Download className="w-3.5 h-3.5" />
                                        <span className="text-[11px]">Download</span>
                                      </>
                                    )}
                                  </button>
                                );
                              })()}

                              {onSaveMessageToMemory && (
                                <button
                                  type="button"
                                  onClick={() => onSaveMessageToMemory(message)}
                                  className="p-1.5 rounded-lg hover:bg-[#13204a] hover:text-cyan-300 transition-colors text-xs flex items-center gap-1 cursor-pointer"
                                  title="Save message to Memory Vault"
                                >
                                  <BookmarkPlus className="w-3.5 h-3.5" />
                                  <span className="text-[11px]">Save to Memory</span>
                                </button>
                              )}

                              {isLastAi && (
                                <button
                                  onClick={onRegenerate}
                                  className="p-1.5 rounded-lg hover:bg-zinc-800 hover:text-zinc-200 transition-colors text-xs flex items-center gap-1 cursor-pointer"
                                  title="Regenerate response or new variation"
                                >
                                  <RotateCcw className="w-3.5 h-3.5" />
                                  <span className="text-[11px]">Retry</span>
                                </button>
                              )}

                              {/* Download Error Feedback */}
                              {downloadError && downloadError.id === message.id && (
                                <span className="text-red-400 text-[11px] ml-1">
                                  {downloadError.message}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={bottomAnchorRef} />
        </div>
      </div>

      {/* Floating Scroll to Bottom Button */}
      {showScrollBottom && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-20 right-6 p-2 rounded-full bg-zinc-800/95 hover:bg-zinc-700 text-zinc-200 shadow-xl border border-zinc-700 transition-all z-20 cursor-pointer"
          title="Scroll to bottom"
        >
          <ArrowDown className="w-4 h-4" />
        </button>
      )}

      {/* Image Preview Modal */}
      {previewImage && previewImage.trim().length > 0 && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 cursor-pointer"
          onClick={() => setPreviewImage(null)}
        >
          <img
            src={previewImage}
            alt="Preview"
            className="max-h-[90vh] max-w-[90vw] object-contain rounded-xl shadow-2xl"
          />
        </div>
      )}
    </div>
  );
};
