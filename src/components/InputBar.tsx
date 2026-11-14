import React, { useRef, useEffect, useState } from 'react';
import {
  ArrowUp,
  Square,
  Plus,
  Globe,
  X,
  FileText,
  Image as ImageIcon,
  Sparkles,
  AlertTriangle,
  Brain,
} from 'lucide-react';
import { Attachment, TokenEstimate } from '../types';
import { NovaChatLogo } from './NovaChatLogo';
import { soundEffects } from '../services/soundEffects';
import { ContextUsageIndicator } from './ContextUsageIndicator';
import { checkSingleMessageSize } from '../services/tokenEngine';

interface InputBarProps {
  input: string;
  setInput: (value: string) => void;
  onSendMessage: () => void;
  isStreaming: boolean;
  onStopStreaming: () => void;
  attachments: Attachment[];
  onAddAttachment: (attachment: Attachment) => void;
  onRemoveAttachment: (id: string) => void;
  searchGrounding: boolean;
  onToggleSearchGrounding: () => void;
  thinkMode: boolean;
  onToggleThinkMode: () => void;
  activeModel?: string;
  onSelectModel?: (model: string) => void;
  availableModels?: { id: string; name: string; badge: string; supportsSearch: boolean }[];
  tokenEstimate?: TokenEstimate;
  onStartNewChatWithContext?: () => void;
  sidebarOpen?: boolean;
}

export const InputBar: React.FC<InputBarProps> = ({
  input,
  setInput,
  onSendMessage,
  isStreaming,
  onStopStreaming,
  attachments,
  onAddAttachment,
  onRemoveAttachment,
  searchGrounding,
  onToggleSearchGrounding,
  thinkMode,
  onToggleThinkMode,
  tokenEstimate,
  onStartNewChatWithContext,
  sidebarOpen = true,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = `${Math.min(scrollHeight, 180)}px`;
    }
  }, [input]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isStreaming && (input.trim() || attachments.length > 0)) {
        soundEffects.playConfirm();
        onSendMessage();
      }
    }
  };

  const processFile = (file: File): Promise<Attachment> => {
    return new Promise((resolve) => {
      const isImage = file.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp)$/i.test(file.name);
      const reader = new FileReader();

      if (!isImage) {
        reader.onload = () => {
          resolve({
            id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
            name: file.name,
            type: file.type || 'text/plain',
            base64: reader.result as string,
            size: file.size,
          });
        };
        reader.readAsDataURL(file);
        return;
      }

      // Downscale images to max 1024px to prevent 413 token limit errors
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        const img = new Image();
        img.onload = () => {
          const maxDim = 1024;
          let { width, height } = img;
          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            const mimeType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
            const compressed = canvas.toDataURL(mimeType, 0.85);
            resolve({
              id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
              name: file.name,
              type: mimeType,
              base64: compressed,
              size: Math.round(compressed.length * 0.75),
            });
            return;
          }
          resolve({
            id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
            name: file.name,
            type: file.type || 'image/png',
            base64: dataUrl,
            size: file.size,
          });
        };
        img.onerror = () => {
          resolve({
            id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
            name: file.name,
            type: file.type || 'image/png',
            base64: dataUrl,
            size: file.size,
          });
        };
        img.src = dataUrl;
      };
      reader.readAsDataURL(file);
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    soundEffects.playClick();
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.size > 20 * 1024 * 1024) {
        alert(`File "${file.name}" exceeds the 20MB limit.`);
        continue;
      }
      try {
        const att = await processFile(file);
        onAddAttachment(att);
      } catch (err) {
        console.error('File read error:', err);
      }
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const canSend = !isStreaming && (input.trim().length > 0 || attachments.length > 0);

  return (
    <div
      className={`w-full mx-auto px-4 sm:px-6 md:px-8 pb-4 pt-1 shrink-0 z-10 transition-all duration-300 ease-in-out ${
        sidebarOpen
          ? 'max-w-4xl xl:max-w-5xl'
          : 'max-w-4xl lg:max-w-5xl xl:max-w-6xl'
      }`}
    >
      {/* Attachment Previews */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2 p-2 rounded-2xl bg-[#091026]/90 border border-[#1b2b5c] backdrop-blur-md">
          {attachments.map((att) => (
            <div
              key={att.id}
              className="relative group flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-[#0e1738] border border-[#23356e] text-xs text-zinc-200"
            >
              {att.type.startsWith('image/') && att.base64 ? (
                <div className="w-6 h-6 rounded-md overflow-hidden bg-black shrink-0">
                  <img src={att.base64} alt={att.name || 'attachment'} className="w-full h-full object-cover" />
                </div>
              ) : (
                <FileText className="w-4 h-4 text-cyan-400 shrink-0" />
              )}
              <span className="truncate max-w-[130px]">{att.name}</span>
              <button
                type="button"
                onClick={() => {
                  soundEffects.playClick();
                  onRemoveAttachment(att.id);
                }}
                className="text-zinc-400 hover:text-red-400 p-0.5 rounded-full transition-colors cursor-pointer"
                title="Remove attachment"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Main Glass Composer Container */}
      <div className="relative flex flex-col w-full rounded-2xl sm:rounded-3xl bg-[#080e24]/80 border border-[#1f2f63]/80 shadow-2xl backdrop-blur-xl focus-within:border-cyan-500/60 focus-within:ring-2 focus-within:ring-cyan-500/20 transition-all">
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,.txt,.md,.json,.js,.ts,.py,.csv"
          multiple
          className="hidden"
          onChange={handleFileUpload}
        />

        {/* Oversized Single Message Check & Guidance */}
        {(() => {
          const singleSize = checkSingleMessageSize(input);
          if (singleSize.isOversized) {
            return (
              <div className="mx-3.5 mt-2.5 p-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
                <span className="text-[11px] leading-tight">{singleSize.recommendation}</span>
              </div>
            );
          }
          return null;
        })()}

        {/* Text Area */}
        <div className="flex flex-row items-center w-full min-w-0 px-3.5 sm:px-4 pt-3 pb-1">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message NovaChat..."
            rows={1}
            className="w-full flex-1 min-w-0 px-2 sm:px-2.5 py-1 bg-transparent text-sm sm:text-[15px] text-zinc-100 placeholder:text-zinc-500 focus:outline-none resize-none leading-relaxed whitespace-pre-wrap break-words max-h-[180px] overflow-y-auto block"
          />
        </div>

        {/* Action Controls Toolbar at Bottom of Box */}
        <div className="flex flex-row items-center justify-between w-full px-3.5 pb-2.5 pt-1">
          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Attachment Button */}
            <button
              type="button"
              onClick={() => {
                soundEffects.playClick();
                fileInputRef.current?.click();
              }}
              className="p-1.5 rounded-xl text-zinc-400 hover:text-cyan-300 hover:bg-[#111c42] transition-colors cursor-pointer"
              title="Attach images or documents"
            >
              <Plus className="w-4 h-4" />
            </button>

            {/* Google Search Grounding Toggle */}
            <button
              type="button"
              onClick={() => {
                soundEffects.playToggle(!searchGrounding);
                onToggleSearchGrounding();
              }}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                searchGrounding
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-xs'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#111c42] border border-transparent'
              }`}
              title={
                searchGrounding
                  ? 'Search Grounding enabled: model will browse real-time Google Search'
                  : 'Enable Google Search Grounding'
              }
            >
              <Globe className={`w-3.5 h-3.5 ${searchGrounding ? 'text-cyan-400 animate-pulse' : ''}`} />
              <span className="hidden sm:inline">Search</span>
            </button>

            {/* ChatGPT-Style Think Button */}
            <button
              type="button"
              role="switch"
              aria-checked={thinkMode}
              aria-label="Toggle Think Mode"
              onClick={() => {
                soundEffects.playToggle(!thinkMode);
                onToggleThinkMode();
              }}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-medium transition-all cursor-pointer select-none ${
                thinkMode
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 shadow-xs shadow-cyan-500/25 font-semibold'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#111c42] border border-transparent'
              }`}
              title="Think mode: Uses high reasoning effort and answer self-verification for difficult tasks. May take longer and use more tokens."
            >
              <Brain className={`w-3.5 h-3.5 ${thinkMode ? 'text-cyan-400 animate-pulse' : 'text-zinc-400'}`} />
              <span>Think</span>
              {thinkMode && <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />}
            </button>

            {/* Single Default AI Model Indicator */}
            <div
              className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-medium text-zinc-300 bg-[#0c1430]/70 border border-[#203166]/70 shadow-xs select-none"
              title="Primary Model: NovaChat AI (GPT-OSS 120B on Groq LPU)"
            >
              <NovaChatLogo size={14} showGlow={false} />
              <span>NovaChat AI</span>
            </div>

            {/* Live Context & Token Usage Indicator */}
            {tokenEstimate && (
              <ContextUsageIndicator
                estimate={tokenEstimate}
                onStartNewChatWithContext={onStartNewChatWithContext}
              />
            )}
          </div>

          {/* Send / Stop Streaming Button */}
          <div>
            {isStreaming ? (
              <button
                type="button"
                onClick={() => {
                  soundEffects.playClick();
                  onStopStreaming();
                }}
                className="w-8 h-8 rounded-full bg-zinc-100 hover:bg-white text-zinc-950 flex items-center justify-center transition-transform hover:scale-105 shadow-md cursor-pointer"
                title="Stop response"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  soundEffects.playConfirm();
                  onSendMessage();
                }}
                disabled={!canSend}
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                  canSend
                    ? 'bg-gradient-to-r from-cyan-400 to-blue-600 hover:from-cyan-300 hover:to-blue-500 text-zinc-950 shadow-md shadow-cyan-950/50 hover:scale-105 cursor-pointer'
                    : 'bg-zinc-800 text-zinc-500 cursor-not-allowed opacity-60'
                }`}
                title="Send message (Enter)"
              >
                <ArrowUp className="w-4 h-4 stroke-[2.5]" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Subtle Bottom Disclaimer */}
      <div className="mt-2 text-center text-[10px] sm:text-[11px] text-zinc-500 font-mono">
        NovaChat AI · Critical Thinking & Reliable Memory Integrity
      </div>
    </div>
  );
};
