import React, { useState, useMemo } from 'react';
import {
  Plus,
  MessageSquare,
  Search,
  Trash2,
  Edit2,
  Check,
  X,
  Settings,
  PanelLeftClose,
  Sparkles,
  Home,
  Music,
  Compass,
  ShieldCheck,
  Radio,
  Clock,
  ExternalLink,
} from 'lucide-react';
import { ChatSession } from '../types';
import { NovaChatLogo } from './NovaChatLogo';
import { useBackgroundMusic } from '../context/BackgroundMusicContext';
import { soundEffects } from '../services/soundEffects';

interface SidebarProps {
  sessions: ChatSession[];
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewChat: () => void;
  onDeleteSession: (id: string) => void;
  onRenameSession: (id: string, newTitle: string) => void;
  isOpen: boolean;
  onToggleOpen: () => void;
  onOpenSettings: (tab?: 'general' | 'appearance' | 'music' | 'memory' | 'data' | 'security' | 'about') => void;
  onOpenMusicSettings?: () => void;
  onOpenVoice?: () => void;
  currentView?: 'home' | 'chat';
  onNavigateHome?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  sessions,
  activeSessionId,
  onSelectSession,
  onNewChat,
  onDeleteSession,
  onRenameSession,
  isOpen,
  onToggleOpen,
  onOpenSettings,
  onOpenMusicSettings,
  onOpenVoice,
  currentView = 'home',
  onNavigateHome,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchInput, setShowSearchInput] = useState(false);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  const { isPlaying, isEnabled, currentTrack } = useBackgroundMusic();

  // Filter sessions by search query
  const filteredSessions = useMemo(() => {
    if (!searchQuery.trim()) return sessions;
    return sessions.filter((s) =>
      s.title.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [sessions, searchQuery]);

  const handleStartRename = (session: ChatSession, e: React.MouseEvent) => {
    e.stopPropagation();
    soundEffects.playClick();
    setEditingSessionId(session.id);
    setEditingTitle(session.title);
  };

  const handleSaveRename = (sessionId: string, e: React.MouseEvent | React.FormEvent) => {
    e.stopPropagation();
    if (editingTitle.trim()) {
      soundEffects.playConfirm();
      onRenameSession(sessionId, editingTitle.trim());
    }
    setEditingSessionId(null);
    setEditingTitle('');
  };

  const handleCancelRename = (e: React.MouseEvent) => {
    e.stopPropagation();
    soundEffects.playClick();
    setEditingSessionId(null);
    setEditingTitle('');
  };

  const formatRelativeTime = (timestamp?: number) => {
    if (!timestamp) return '';
    const diffMs = Date.now() - timestamp;
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return `${Math.floor(diffDays / 7)}w ago`;
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-xs z-40 md:hidden transition-opacity"
          onClick={() => {
            soundEffects.playClick();
            onToggleOpen();
          }}
        />
      )}

      {/* Futuristic Console Dark Sidebar */}
      <aside
        className={`fixed md:relative inset-y-0 left-0 z-50 flex flex-col h-full shrink-0 overflow-hidden bg-[#070b1a]/95 backdrop-blur-xl transition-[width,transform] duration-300 ease-in-out ${
          isOpen
            ? 'w-[280px] translate-x-0 border-r border-[#192754]/80 opacity-100 pointer-events-auto shadow-2xl md:shadow-none'
            : 'w-0 -translate-x-full md:translate-x-0 border-r-0 border-transparent opacity-0 md:opacity-100 pointer-events-none'
        }`}
        aria-hidden={!isOpen}
      >
        <div className="w-[280px] h-full flex flex-col shrink-0 min-w-[280px]">
          {/* Top Header Branding */}
        <div className="p-3.5 flex items-center justify-between border-b border-[#16234d]/70">
          <div
            className="flex items-center gap-2.5 px-2 py-1 cursor-pointer group"
            onClick={() => {
              soundEffects.playSelect();
              if (onNavigateHome) onNavigateHome();
            }}
          >
            <NovaChatLogo size={32} variant="sidebar" showGlow={true} />
            <div>
              <h1 className="text-sm font-bold text-white tracking-tight flex items-center gap-1.5">
                NovaChat
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                  AI
                </span>
              </h1>
            </div>
          </div>

          <button
            onClick={() => {
              soundEffects.playClick();
              onToggleOpen();
            }}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-cyan-300 hover:bg-[#131f45] transition-colors cursor-pointer"
            title="Collapse sidebar"
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        </div>

        {/* Primary Navigation Menu */}
        <div className="p-3 space-y-1 border-b border-[#16234d]/70">
          {/* Home Screen Nav Button */}
          <button
            onClick={() => {
              soundEffects.playSelect();
              if (onNavigateHome) onNavigateHome();
            }}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer ${
              currentView === 'home'
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/25 border border-blue-400/40'
                : 'text-zinc-300 hover:text-white hover:bg-[#101b3d]/70'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Home className={`w-4 h-4 ${currentView === 'home' ? 'text-white' : 'text-cyan-400'}`} />
              <span>Home</span>
            </div>
            {currentView === 'home' && (
              <span className="w-1.5 h-1.5 rounded-full bg-white shadow-sm" />
            )}
          </button>

          {/* New Chat Button */}
          <button
            onClick={() => {
              soundEffects.playConfirm();
              onNewChat();
            }}
            className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-zinc-300 hover:text-white hover:bg-[#101b3d]/70 text-xs font-medium transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2.5">
              <Plus className="w-4 h-4 text-cyan-400" />
              <span>New Chat</span>
            </div>
            <kbd className="text-[10px] font-mono text-zinc-400 bg-[#0c1430] px-1.5 py-0.5 rounded border border-[#203166]">
              ⌘N
            </kbd>
          </button>

          {/* Nova Live Voice Button */}
          <button
            onClick={() => {
              soundEffects.playSelect();
              if (onOpenVoice) onOpenVoice();
            }}
            className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer bg-gradient-to-r from-cyan-950/40 to-blue-950/40 hover:from-cyan-900/50 hover:to-blue-900/50 text-cyan-300 border border-cyan-500/30 shadow-[0_0_12px_rgba(6,182,212,0.15)] group"
            title="Start real-time Gemini Live voice conversation"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
              <span>Nova Live Voice</span>
            </div>
            <span className="text-[9px] font-semibold tracking-wider uppercase px-1.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
              LIVE
            </span>
          </button>

          {/* Search Chats Button / Toggle */}
          <button
            onClick={() => {
              soundEffects.playClick();
              setShowSearchInput(!showSearchInput);
            }}
            className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-zinc-300 hover:text-white hover:bg-[#101b3d]/70 text-xs font-medium transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2.5">
              <Search className="w-4 h-4 text-cyan-400" />
              <span>Search Chats</span>
            </div>
            {searchQuery && (
              <span className="text-[10px] font-mono text-cyan-400">
                {filteredSessions.length}
              </span>
            )}
          </button>

          {/* Search Input Box */}
          {showSearchInput && (
            <div className="px-2 py-1.5 animate-in fade-in duration-150">
              <input
                type="text"
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter conversation titles..."
                className="w-full px-2.5 py-1.5 rounded-lg bg-[#0b1229] border border-[#213268] text-zinc-200 text-xs placeholder-zinc-500 focus:outline-none focus:border-cyan-400/70"
              />
            </div>
          )}

          {/* Background Music Nav Button */}
          <button
            onClick={() => {
              soundEffects.playClick();
              if (onOpenMusicSettings) onOpenMusicSettings();
              else onOpenSettings('music');
            }}
            className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-zinc-300 hover:text-white hover:bg-[#101b3d]/70 text-xs font-medium transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2.5">
              <Music className={`w-4 h-4 ${isEnabled && isPlaying ? 'text-cyan-400' : 'text-zinc-400'}`} />
              <span>Background Music</span>
            </div>
            {isEnabled && isPlaying ? (
              <span className="text-[10px] text-cyan-400 font-mono flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                Live
              </span>
            ) : (
              <span className="text-[10px] text-zinc-500 font-mono truncate max-w-[80px]">
                {currentTrack?.name || 'Home Menu'}
              </span>
            )}
          </button>

          {/* Settings & Personas */}
          <button
            onClick={() => {
              soundEffects.playClick();
              onOpenSettings('general');
            }}
            className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-zinc-300 hover:text-white hover:bg-[#101b3d]/70 text-xs font-medium transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2.5">
              <Settings className="w-4 h-4 text-cyan-400" />
              <span>Settings & Personas</span>
            </div>
          </button>

          {/* AI Explorer (Memory Vault) */}
          <button
            onClick={() => {
              soundEffects.playClick();
              onOpenSettings('memory');
            }}
            className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-zinc-300 hover:text-white hover:bg-[#101b3d]/70 text-xs font-medium transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2.5">
              <Compass className="w-4 h-4 text-purple-400" />
              <span>AI Explorer</span>
            </div>
            <span className="text-[10px] font-mono text-purple-300 bg-purple-500/15 px-1.5 py-0.2 rounded border border-purple-500/20">
              Vault
            </span>
          </button>

          {/* Security & Privacy */}
          <button
            onClick={() => {
              soundEffects.playClick();
              onOpenSettings('security');
            }}
            className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-zinc-300 hover:text-white hover:bg-[#101b3d]/70 text-xs font-medium transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Security & Privacy</span>
            </div>
            <span className="text-[10px] font-mono text-emerald-400">Active</span>
          </button>
        </div>

        {/* Recent Chats Section */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          <div className="flex items-center justify-between px-2 py-1 mb-1 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
            <span>Recent Chats</span>
            <button
              onClick={() => {
                soundEffects.playConfirm();
                onNewChat();
              }}
              className="text-zinc-500 hover:text-cyan-400 transition-colors cursor-pointer"
              title="New Chat"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          {filteredSessions.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-zinc-500 space-y-1">
              <MessageSquare className="w-5 h-5 mx-auto text-zinc-600 opacity-60" />
              <p>No chats found.</p>
            </div>
          ) : (
            filteredSessions.map((session) => {
              const isActive = currentView === 'chat' && session.id === activeSessionId;
              const isEditing = session.id === editingSessionId;

              return (
                <div
                  key={session.id}
                  onClick={() => {
                    soundEffects.playSelect();
                    onSelectSession(session.id);
                  }}
                  className={`group relative flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-all cursor-pointer ${
                    isActive
                      ? 'bg-[#101c40] text-cyan-200 border border-cyan-500/40 shadow-sm'
                      : 'text-zinc-300 hover:text-white hover:bg-[#0c1430]/70 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <MessageSquare
                      className={`w-3.5 h-3.5 shrink-0 ${
                        isActive ? 'text-cyan-400' : 'text-zinc-500 group-hover:text-zinc-400'
                      }`}
                    />

                    {isEditing ? (
                      <form
                        onSubmit={(e) => handleSaveRename(session.id, e)}
                        className="flex-1 flex items-center gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="text"
                          value={editingTitle}
                          onChange={(e) => setEditingTitle(e.target.value)}
                          autoFocus
                          className="w-full px-1.5 py-0.5 rounded bg-zinc-900 border border-cyan-500 text-xs text-white focus:outline-none"
                        />
                        <button
                          type="submit"
                          className="p-1 text-emerald-400 hover:text-emerald-300 cursor-pointer"
                          title="Save"
                        >
                          <Check className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={handleCancelRename}
                          className="p-1 text-zinc-400 hover:text-white cursor-pointer"
                          title="Cancel"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </form>
                    ) : (
                      <div className="flex-1 truncate">
                        <div className="truncate font-medium flex items-center gap-1.5">
                          <span className="truncate">{session.title}</span>
                          {session.handoffSummary && (
                            <span
                              className="text-[9px] text-cyan-400 bg-cyan-950/70 px-1.5 py-0.2 rounded border border-cyan-800/50 shrink-0 font-mono font-normal"
                              title="Continued with carried context"
                            >
                              Cont.
                            </span>
                          )}
                        </div>
                        {session.updatedAt && (
                          <div className="text-[10px] text-zinc-500 flex items-center gap-1 mt-0.5">
                            <Clock className="w-2.5 h-2.5" />
                            <span>{formatRelativeTime(session.updatedAt)}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Actions on hover */}
                  {!isEditing && (
                    <div className="hidden group-hover:flex items-center gap-1 shrink-0 ml-1">
                      <button
                        onClick={(e) => handleStartRename(session, e)}
                        className="p-1 text-zinc-400 hover:text-cyan-300 hover:bg-zinc-800 rounded transition-colors"
                        title="Rename chat"
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          soundEffects.playClick();
                          onDeleteSession(session.id);
                        }}
                        className="p-1 text-zinc-400 hover:text-red-400 hover:bg-zinc-800 rounded transition-colors"
                        title="Delete chat"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Bottom Section: Futuristic Badge Card */}
        <div className="p-3 border-t border-[#16234d]/70 bg-[#060a18]/90">
          <div className="p-2.5 rounded-xl bg-[#091026]/90 border border-[#1d2d60]/70 flex items-center gap-2.5 shadow-sm">
            <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse shrink-0" />
            <div className="min-w-0">
              <div className="text-xs font-semibold text-zinc-200 truncate">NovaChat AI</div>
              <div className="text-[10px] text-zinc-400 font-mono truncate">
                Clean · Modern · Futuristic
              </div>
            </div>
          </div>
        </div>
      </div>
      </aside>
    </>
  );
};
