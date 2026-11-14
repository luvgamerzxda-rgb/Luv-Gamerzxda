import React, { useState, useEffect } from 'react';
import {
  X,
  Sparkles,
  Trash2,
  Download,
  Bot,
  Sliders,
  Info,
  ShieldCheck,
  Brain,
  Plus,
  Check,
  CheckCircle2,
  History,
  AlertCircle,
  ArrowRight,
  Music,
  Palette,
  Volume2,
  VolumeX,
  Volume1,
  RotateCcw,
  Waves,
  Eye,
  Sun,
  Moon,
  Monitor,
  Disc,
  Cpu,
  Terminal,
  Activity,
  Layers,
  RefreshCw,
  Mic,
  Search,
  Loader2,
  Upload,
  FolderGit2,
  ShieldAlert,
} from 'lucide-react';
import { AVAILABLE_PERSONAS, AVAILABLE_MODELS } from '../constants';
import { GEMINI_LIVE_VOICES, DEFAULT_GEMINI_LIVE_VOICE } from '../constants/voices';
import { LiveAudioEngine } from '../services/liveAudioProcessor';
import {
  CodeMemoryItem,
  UserMemoryItem,
  MemoryCorrection,
  MemoryAuditLogEntry,
} from '../types';
import { BackgroundMusicSettings } from './BackgroundMusicSettings';
import { NovaChatLogo } from './NovaChatLogo';
import { MemoryVaultPanel } from './MemoryVaultPanel';
import { SaveToMemoryInitialData } from './SaveToMemoryModal';
import { parseMemoryImportPayload } from '../services/memoryService';
import { soundEffects } from '../services/soundEffects';

export type SettingsTab =
  | 'general'
  | 'voice'
  | 'system'
  | 'appearance'
  | 'music'
  | 'models'
  | 'memory'
  | 'data'
  | 'security'
  | 'about';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: string;
  systemPersonaId: string;
  onSelectPersona: (id: string) => void;
  customInstruction: string;
  onSaveCustomInstruction: (instruction: string) => void;
  defaultModel: string;
  onSelectDefaultModel: (model: string) => void;
  defaultSearchGrounding: boolean;
  onToggleDefaultSearchGrounding: (enabled: boolean) => void;
  onClearAllChats: () => void;
  onExportAllChats: () => void;
  onOpenImportChats: () => void;
  totalChatsCount: number;
  userMemories: UserMemoryItem[];
  codeMemories: CodeMemoryItem[];
  onAddMemory: (fact: string) => void;
  onToggleTextMemoryEnabled: (id: string) => void;
  onToggleTextMemoryPinned: (id: string) => void;
  onRemoveMemory: (id: string) => void;
  onClearMemories: () => void;
  onToggleCodeMemoryEnabled: (id: string) => void;
  onToggleCodeMemoryPinned: (id: string) => void;
  onRemoveCodeMemory: (id: string) => void;
  onClearCodeMemories: () => void;
  onOpenSaveMemoryModal: (initial: SaveToMemoryInitialData) => void;
  onExportMemories: () => void;
  onImportMemories: (payload: { memories: UserMemoryItem[]; codeMemories: CodeMemoryItem[] }) => void;
  memoryEnabled: boolean;
  onToggleMemoryEnabled: (enabled: boolean) => void;
  ambientWavesEnabled?: boolean;
  onToggleAmbientWaves?: (enabled: boolean) => void;
  selectedVoice?: string;
  onSelectVoice?: (voiceId: string) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  initialTab = 'general',
  systemPersonaId,
  onSelectPersona,
  customInstruction,
  onSaveCustomInstruction,
  defaultModel,
  onSelectDefaultModel,
  defaultSearchGrounding,
  onToggleDefaultSearchGrounding,
  onClearAllChats,
  onExportAllChats,
  onOpenImportChats,
  totalChatsCount,
  userMemories,
  codeMemories,
  onAddMemory,
  onToggleTextMemoryEnabled,
  onToggleTextMemoryPinned,
  onRemoveMemory,
  onClearMemories,
  onToggleCodeMemoryEnabled,
  onToggleCodeMemoryPinned,
  onRemoveCodeMemory,
  onClearCodeMemories,
  onOpenSaveMemoryModal,
  onExportMemories,
  onImportMemories,
  memoryEnabled,
  onToggleMemoryEnabled,
  ambientWavesEnabled = true,
  onToggleAmbientWaves,
  selectedVoice = DEFAULT_GEMINI_LIVE_VOICE,
  onSelectVoice,
}) => {
  const mapInitialTab = (tabStr?: string): SettingsTab => {
    if (tabStr === 'persona') return 'general';
    if (tabStr === 'voice' || tabStr === 'live') return 'voice';
    if (tabStr === 'system' || tabStr === 'intel' || tabStr === 'codebase') return 'system';
    if (tabStr === 'music' || tabStr === 'audio') return 'music';
    if (tabStr === 'memory') return 'memory';
    if (tabStr === 'appearance') return 'appearance';
    if (tabStr === 'models') return 'models';
    if (tabStr === 'data') return 'data';
    if (tabStr === 'security') return 'security';
    if (tabStr === 'about') return 'about';
    return 'general';
  };

  const [activeTab, setActiveTab] = useState<SettingsTab>(mapInitialTab(initialTab));
  const [instructionDraft, setInstructionDraft] = useState(customInstruction);
  const [confirmClear, setConfirmClear] = useState(false);
  const [themeMode, setThemeMode] = useState<'auto' | 'dark' | 'light'>('dark');
  const [backgroundStyle, setBackgroundStyle] = useState<'cosmic' | 'nebula' | 'horizon'>('cosmic');

  // Memory Import state in Data & Storage
  const memoryFileInputRef = React.useRef<HTMLInputElement>(null);
  const [memoryImportError, setMemoryImportError] = useState<string | null>(null);
  const [memoryImportSuccess, setMemoryImportSuccess] = useState<string | null>(null);
  const [pendingMemoryImport, setPendingMemoryImport] = useState<{
    memories: UserMemoryItem[];
    codeMemories: CodeMemoryItem[];
    secretFindings: { title: string; findings: string[] }[];
  } | null>(null);

  // Codebase Intelligence & System Knowledge State (Module 15)
  const [codebaseStatus, setCodebaseStatus] = useState<any>(null);
  const [codebaseFeatures, setCodebaseFeatures] = useState<any[]>([]);
  const [codebaseArchitecture, setCodebaseArchitecture] = useState<any[]>([]);
  const [codebaseSettings, setCodebaseSettings] = useState<any[]>([]);
  const [isRefreshingIndex, setIsRefreshingIndex] = useState(false);
  const [refreshSuccessMessage, setRefreshSuccessMessage] = useState<string | null>(null);
  const [featureFilter, setFeatureFilter] = useState<'all' | 'verified' | 'other'>('all');

  // UI Sounds State
  const [uiSoundSettings, setUiSoundSettings] = useState(() => soundEffects.getSettings());

  // Gemini Live Voice Gallery State
  const [voiceSearchQuery, setVoiceSearchQuery] = useState('');
  const [previewLoadingVoiceId, setPreviewLoadingVoiceId] = useState<string | null>(null);
  const [previewPlayingVoiceId, setPreviewPlayingVoiceId] = useState<string | null>(null);
  const [voicePreviewError, setVoicePreviewError] = useState<string | null>(null);

  const handlePlayVoicePreview = async (e: React.MouseEvent, voiceId: string) => {
    e.stopPropagation();
    if (previewLoadingVoiceId || previewPlayingVoiceId) return;
    setVoicePreviewError(null);

    try {
      setPreviewLoadingVoiceId(voiceId);
      const resp = await fetch('/api/live/voice-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voiceName: voiceId }),
      });
      const data = await resp.json();
      setPreviewLoadingVoiceId(null);

      if (!resp.ok) {
        setVoicePreviewError(data.error || `Preview failed (HTTP ${resp.status})`);
        return;
      }

      if (data.audio) {
        setPreviewPlayingVoiceId(voiceId);
        await LiveAudioEngine.playGoogleVoicePreview(data.audio, data.mimeType || 'audio/wav');
        setPreviewPlayingVoiceId(null);
      }
    } catch (err: any) {
      setPreviewLoadingVoiceId(null);
      setPreviewPlayingVoiceId(null);
      setVoicePreviewError(err?.message || 'Unable to play voice preview.');
    }
  };

  useEffect(() => {
    if (isOpen) {
      setActiveTab(mapInitialTab(initialTab));
      setUiSoundSettings(soundEffects.getSettings());
    }
  }, [isOpen, initialTab]);

  // Codebase data fetcher
  const fetchCodebaseData = async () => {
    try {
      const [statusRes, featRes, archRes, settRes] = await Promise.all([
        fetch('/api/codebase/status'),
        fetch('/api/codebase/features'),
        fetch('/api/codebase/architecture'),
        fetch('/api/codebase/settings'),
      ]);
      if (statusRes.ok) setCodebaseStatus((await statusRes.json()).status);
      if (featRes.ok) setCodebaseFeatures((await featRes.json()).features || []);
      if (archRes.ok) setCodebaseArchitecture((await archRes.json()).dataFlow || []);
      if (settRes.ok) setCodebaseSettings((await settRes.json()).settings || []);
    } catch (e: any) {
      console.warn('Error fetching codebase data:', e.message);
    }
  };

  useEffect(() => {
    if (isOpen && activeTab === 'system') {
      fetchCodebaseData();
    }
  }, [isOpen, activeTab]);

  const handleRefreshCodebase = async () => {
    setIsRefreshingIndex(true);
    setRefreshSuccessMessage(null);
    try {
      soundEffects.playSelect();
      const res = await fetch('/api/codebase/refresh', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setCodebaseStatus(data.status);
        setRefreshSuccessMessage(
          `Re-indexed ${data.result?.totalFiles || 0} files & ${data.result?.totalSymbols || 0} symbols in ${data.result?.elapsedMs || 0}ms.`
        );
        soundEffects.playConfirm();
        setTimeout(() => setRefreshSuccessMessage(null), 4000);
      }
    } catch (e: any) {
      console.warn('Reindex error:', e.message);
    } finally {
      setIsRefreshingIndex(false);
    }
  };

  // Memory corrections & audit log state (memory_corrections.db)
  const [corrections, setCorrections] = useState<MemoryCorrection[]>([]);
  const [auditLogs, setAuditLogs] = useState<MemoryAuditLogEntry[]>([]);
  const [showAuditTrail, setShowAuditTrail] = useState(false);
  const [proposingCorrection, setProposingCorrection] = useState(false);
  const [correctionKey, setCorrectionKey] = useState('');
  const [correctionOrig, setCorrectionOrig] = useState('');
  const [correctionProp, setCorrectionProp] = useState('');
  const [correctionEvidence, setCorrectionEvidence] = useState('');
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const fetchCorrectionsAndAudit = async () => {
    try {
      const res = await fetch('/api/memory/corrections');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.corrections)) setCorrections(data.corrections);
      }
      const auditRes = await fetch('/api/memory/audit-log');
      if (auditRes.ok) {
        const data = await auditRes.json();
        if (Array.isArray(data.audit_log)) setAuditLogs(data.audit_log);
      }
    } catch (e) {
      console.warn('Error fetching corrections:', e);
    }
  };

  useEffect(() => {
    if (isOpen && activeTab === 'memory') {
      fetchCorrectionsAndAudit();
    }
  }, [isOpen, activeTab]);

  const handleApproveCorrection = async (id: string) => {
    setActionLoadingId(id);
    soundEffects.playConfirm();
    try {
      const res = await fetch(`/api/memory/corrections/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved_by: 'UserAdmin' }),
      });
      if (res.ok) {
        await fetchCorrectionsAndAudit();
      }
    } catch (e) {
      console.error('Failed to approve correction:', e);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleRejectCorrection = async (id: string) => {
    setActionLoadingId(id);
    soundEffects.playClick();
    try {
      const res = await fetch(`/api/memory/corrections/${id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved_by: 'UserAdmin' }),
      });
      if (res.ok) {
        await fetchCorrectionsAndAudit();
      }
    } catch (e) {
      console.error('Failed to reject correction:', e);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleProposeCorrectionPayload = async (payload: {
    memory_key: string;
    original_value: string;
    proposed_value: string;
    evidence: string;
  }): Promise<boolean> => {
    soundEffects.playConfirm();
    try {
      const res = await fetch('/api/memory/corrections/propose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        await fetchCorrectionsAndAudit();
        return true;
      }
    } catch (e) {
      console.error('Failed to propose correction:', e);
    }
    return false;
  };

  const handleMemoryFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (memoryFileInputRef.current) memoryFileInputRef.current.value = '';
    if (!file) return;

    setMemoryImportError(null);
    setMemoryImportSuccess(null);
    setPendingMemoryImport(null);

    try {
      const raw = await file.text();
      const parsed = parseMemoryImportPayload(raw);
      if (parsed.secretFindings.length > 0) {
        setPendingMemoryImport(parsed);
        return;
      }
      onImportMemories({ memories: parsed.memories, codeMemories: parsed.codeMemories });
      setMemoryImportSuccess(
        `Imported ${parsed.memories.length} text and ${parsed.codeMemories.length} code memories.`
      );
      soundEffects.playConfirm();
    } catch (err: any) {
      setMemoryImportError(err?.message || 'Failed to parse memory export file.');
    }
  };

  const handleTestUiSound = () => {
    soundEffects.playConfirm();
    setTimeout(() => soundEffects.playSelect(), 120);
  };

  const handleUiSoundVolumeChange = (vol: number) => {
    soundEffects.setVolume(vol);
    setUiSoundSettings(soundEffects.getSettings());
  };

  const handleToggleUiSound = (enabled: boolean) => {
    soundEffects.setEnabled(enabled);
    setUiSoundSettings(soundEffects.getSettings());
    if (enabled) {
      soundEffects.playToggle(true);
    }
  };

  if (!isOpen) return null;

  const tabsConfig = [
    { id: 'general', label: 'General', icon: <Bot className="w-4 h-4" /> },
    { id: 'voice', label: 'Nova Live Voice', icon: <Mic className="w-4 h-4" /> },
    { id: 'system', label: 'System Intel', icon: <Cpu className="w-4 h-4" /> },
    { id: 'appearance', label: 'Appearance', icon: <Palette className="w-4 h-4" /> },
    { id: 'music', label: 'Audio & Sounds', icon: <Music className="w-4 h-4" /> },
    { id: 'models', label: 'AI Models', icon: <Sliders className="w-4 h-4" /> },
    { id: 'memory', label: 'Memory', icon: <Brain className="w-4 h-4" />, badge: userMemories.length + codeMemories.length },
    { id: 'data', label: 'Data & Storage', icon: <Download className="w-4 h-4" /> },
    { id: 'security', label: 'Security', icon: <ShieldCheck className="w-4 h-4" /> },
    { id: 'about', label: 'About', icon: <Info className="w-4 h-4" /> },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className="w-full max-w-4xl h-[90vh] max-h-[720px] rounded-3xl bg-[#090f26]/95 border border-[#1e2f66] shadow-2xl flex flex-col md:flex-row overflow-hidden text-zinc-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left Sidebar inside Settings Modal */}
        <div className="w-full md:w-60 bg-[#060a1a] border-b md:border-b-0 md:border-r border-[#1a2858] p-4 flex flex-col shrink-0">
          <div className="flex items-center gap-2.5 px-2 py-2 mb-4 border-b border-[#16234d]/80">
            <NovaChatLogo size={28} variant="sidebar" showGlow={false} />
            <span className="font-bold text-sm tracking-tight text-white">NovaChat AI</span>
          </div>

          <div className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible pb-2 md:pb-0">
            {tabsConfig.map((tab) => {
              const isSelected = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    soundEffects.playSelect();
                    setActiveTab(tab.id as SettingsTab);
                  }}
                  className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all whitespace-nowrap cursor-pointer ${
                    isSelected
                      ? 'bg-blue-600/25 text-cyan-300 border border-cyan-500/40 shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#0c1430]'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    {tab.icon}
                    <span>{tab.label}</span>
                  </div>
                  {tab.badge !== undefined && tab.badge > 0 && (
                    <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-cyan-500/20 text-cyan-300 font-mono">
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="hidden md:block mt-auto pt-4 text-[10px] text-zinc-500 font-mono">
            PS5 Console UI · v2.4.0
          </div>
        </div>

        {/* Right Settings Body */}
        <div className="flex-1 flex flex-col h-full min-w-0 bg-[#080d22]/80">
          {/* Header */}
          <div className="px-6 py-4 border-b border-[#162552] flex items-center justify-between shrink-0">
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white capitalize">
                {activeTab === 'music'
                  ? 'Audio & Sounds'
                  : activeTab === 'data'
                  ? 'Data & Storage'
                  : activeTab === 'voice'
                  ? 'Nova Live Voice'
                  : activeTab === 'system'
                  ? 'System Intel'
                  : activeTab === 'models'
                  ? 'AI Models'
                  : activeTab}{' '}
                Settings
              </h2>
              <p className="text-[11px] text-zinc-400">
                Customize your NovaChat AI experience.
              </p>
            </div>
            <button
              onClick={() => {
                soundEffects.playClick();
                onClose();
              }}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-[#14204d] transition-colors cursor-pointer"
              title="Close settings"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs text-zinc-300">
            {/* 1. GENERAL TAB */}
            {activeTab === 'general' && (
              <div className="space-y-5">
                <div>
                  <label className="block text-xs font-semibold text-zinc-100 mb-2">
                    Assistant Persona
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {AVAILABLE_PERSONAS.map((p) => {
                      const isSelected = p.id === systemPersonaId;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            soundEffects.playSelect();
                            onSelectPersona(p.id);
                            setInstructionDraft(p.instruction);
                          }}
                          className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                            isSelected
                              ? 'bg-blue-600/20 border-cyan-400/50 text-cyan-200'
                              : 'bg-[#0a112c]/70 border-[#1c2c5c] hover:border-zinc-700 text-zinc-300'
                          }`}
                        >
                          <div>
                            <div className="font-semibold text-white flex items-center justify-between">
                              <span>{p.name}</span>
                              {isSelected && (
                                <span className="w-2 h-2 rounded-full bg-cyan-400 shadow-sm" />
                              )}
                            </div>
                            <div className="text-[11px] text-zinc-400 mt-1 line-clamp-2">
                              {p.description}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-zinc-100">
                      Custom Prompt Instructions
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        soundEffects.playClick();
                        const p = AVAILABLE_PERSONAS.find((item) => item.id === systemPersonaId);
                        if (p) setInstructionDraft(p.instruction);
                      }}
                      className="text-[11px] text-cyan-400 hover:underline cursor-pointer"
                    >
                      Reset to Persona Default
                    </button>
                  </div>
                  <textarea
                    rows={4}
                    value={instructionDraft}
                    onChange={(e) => setInstructionDraft(e.target.value)}
                    className="w-full p-3 rounded-xl bg-[#070c1e] border border-[#1b2b5c] text-zinc-200 text-xs focus:outline-none focus:border-cyan-400"
                  />
                  <div className="flex justify-end mt-2">
                    <button
                      type="button"
                      onClick={() => {
                        soundEffects.playConfirm();
                        onSaveCustomInstruction(instructionDraft);
                      }}
                      className="px-4 py-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-zinc-950 font-semibold text-xs cursor-pointer shadow-sm transition-colors"
                    >
                      Save Instructions
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* SYSTEM INTEL / CODEBASE SELF-AWARENESS TAB */}
            {activeTab === 'system' && (
              <div className="space-y-5 animate-in fade-in duration-150">
                {/* Index Status & Action Header */}
                <div className="p-4 rounded-2xl bg-gradient-to-r from-[#0d163a] to-[#0a122e] border border-[#21356e] shadow-lg space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                        <Cpu className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-bold text-white tracking-tight">Codebase Knowledge Engine</h4>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            Live AST Grounded
                          </span>
                        </div>
                        <p className="text-[11px] text-zinc-400">
                          Real-time AST parsing, symbol indexing & verified architecture map
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={isRefreshingIndex}
                      onClick={handleRefreshCodebase}
                      className="px-3.5 py-1.5 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 active:bg-cyan-500/30 text-cyan-300 border border-cyan-500/30 text-xs font-semibold cursor-pointer transition-colors flex items-center gap-1.5 self-start sm:self-auto disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingIndex ? 'animate-spin' : ''}`} />
                      <span>{isRefreshingIndex ? 'Re-Indexing...' : 'Re-Index Codebase'}</span>
                    </button>
                  </div>

                  {refreshSuccessMessage && (
                    <div className="p-2.5 rounded-xl bg-cyan-950/60 border border-cyan-500/40 text-cyan-200 text-xs flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0" />
                      <span>{refreshSuccessMessage}</span>
                    </div>
                  )}

                  {/* Metrics Row */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
                    <div className="p-2.5 rounded-xl bg-[#060a1d]/80 border border-[#182650]">
                      <div className="text-[10px] text-zinc-400 uppercase tracking-wider font-semibold">Indexed Files</div>
                      <div className="text-lg font-bold text-cyan-300 font-mono">
                        {codebaseStatus?.totalFiles ?? '...'}
                      </div>
                    </div>
                    <div className="p-2.5 rounded-xl bg-[#060a1d]/80 border border-[#182650]">
                      <div className="text-[10px] text-zinc-400 uppercase tracking-wider font-semibold">AST Symbols</div>
                      <div className="text-lg font-bold text-purple-300 font-mono">
                        {codebaseStatus?.totalSymbols ?? '...'}
                      </div>
                    </div>
                    <div className="p-2.5 rounded-xl bg-[#060a1d]/80 border border-[#182650]">
                      <div className="text-[10px] text-zinc-400 uppercase tracking-wider font-semibold">Features Catalog</div>
                      <div className="text-lg font-bold text-emerald-300 font-mono">
                        {codebaseFeatures.length || '14'}
                      </div>
                    </div>
                    <div className="p-2.5 rounded-xl bg-[#060a1d]/80 border border-[#182650]">
                      <div className="text-[10px] text-zinc-400 uppercase tracking-wider font-semibold">Security Level</div>
                      <div className="text-sm font-bold text-blue-300 mt-1 flex items-center gap-1">
                        <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
                        <span>Zero Key Leaks</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Section 1: Architecture Data-Flow */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-cyan-400" />
                    <h5 className="text-xs font-bold text-white uppercase tracking-wider">End-to-End Chat Data Flow</h5>
                  </div>
                  <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                    {codebaseArchitecture.length > 0 ? (
                      codebaseArchitecture.map((step) => (
                        <div
                          key={step.step}
                          className="p-2.5 rounded-xl bg-[#080d24] border border-[#172552] flex items-start gap-3 text-xs hover:border-cyan-500/40 transition-colors"
                        >
                          <div className="w-6 h-6 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 font-mono font-bold flex items-center justify-center shrink-0 text-[11px]">
                            {step.step}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-zinc-100">{step.name || step.stage}</span>
                              <span className="text-[10px] font-mono text-cyan-400/90 truncate">[{step.component || step.componentOrModule}]</span>
                            </div>
                            <p className="text-[11px] text-zinc-400 mt-0.5 leading-snug">{step.description || step.responsibility}</p>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="p-3 text-center text-xs text-zinc-500">Loading architecture flow...</div>
                    )}
                  </div>
                </div>

                {/* Section 2: Verified Features Inventory */}
                <div className="space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Layers className="w-4 h-4 text-purple-400" />
                      <h5 className="text-xs font-bold text-white uppercase tracking-wider">Verified Feature Registry</h5>
                    </div>
                    {/* Filter Pills */}
                    <div className="flex items-center gap-1.5 text-[11px]">
                      <button
                        type="button"
                        onClick={() => {
                          soundEffects.playSelect();
                          setFeatureFilter('all');
                        }}
                        className={`px-2 py-0.5 rounded-lg border transition-colors cursor-pointer ${
                          featureFilter === 'all'
                            ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50'
                            : 'bg-zinc-800/40 text-zinc-400 border-zinc-700/50 hover:text-zinc-200'
                        }`}
                      >
                        All ({codebaseFeatures.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          soundEffects.playSelect();
                          setFeatureFilter('verified');
                        }}
                        className={`px-2 py-0.5 rounded-lg border transition-colors cursor-pointer ${
                          featureFilter === 'verified'
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
                            : 'bg-zinc-800/40 text-zinc-400 border-zinc-700/50 hover:text-zinc-200'
                        }`}
                      >
                        Verified ({codebaseFeatures.filter((f) => f.status === 'IMPLEMENTED_AND_VERIFIED').length})
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          soundEffects.playSelect();
                          setFeatureFilter('other');
                        }}
                        className={`px-2 py-0.5 rounded-lg border transition-colors cursor-pointer ${
                          featureFilter === 'other'
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                            : 'bg-zinc-800/40 text-zinc-400 border-zinc-700/50 hover:text-zinc-200'
                        }`}
                      >
                        Other / Demo
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
                    {codebaseFeatures
                      .filter((f) => {
                        if (featureFilter === 'verified') return f.status === 'IMPLEMENTED_AND_VERIFIED';
                        if (featureFilter === 'other') return f.status !== 'IMPLEMENTED_AND_VERIFIED';
                        return true;
                      })
                      .map((feat) => {
                        const isVerified = feat.status === 'IMPLEMENTED_AND_VERIFIED';
                        return (
                          <div
                            key={feat.id}
                            className="p-2.5 rounded-xl bg-[#070c20] border border-[#16244f] flex flex-col justify-between text-xs hover:border-cyan-500/30 transition-colors"
                          >
                            <div>
                              <div className="flex items-center justify-between gap-1 mb-1">
                                <span className="font-semibold text-zinc-100 truncate">{feat.name}</span>
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider shrink-0 ${
                                    isVerified
                                      ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                                      : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                                  }`}
                                >
                                  {isVerified ? 'Verified' : 'Demo/Not Found'}
                                </span>
                              </div>
                              <p className="text-[11px] text-zinc-400 line-clamp-2 leading-tight">{feat.description || feat.purpose}</p>
                            </div>
                            <div className="mt-2 pt-1 border-t border-[#131e42] flex items-center justify-between text-[10px] font-mono text-zinc-500">
                              <span className="truncate">{feat.primaryFile || feat.frontendComponents?.[0] || feat.backendEndpoints?.[0] || 'Core'}</span>
                              <span className="text-zinc-400 shrink-0 ml-1">{feat.category || 'Verified'}</span>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>

                {/* Section 3: Verified Settings & Storage Map */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-emerald-400" />
                    <h5 className="text-xs font-bold text-white uppercase tracking-wider">Verified Settings & Storage Map</h5>
                  </div>
                  <div className="p-3 rounded-2xl bg-[#070c20] border border-[#16244f] overflow-x-auto">
                    <table className="w-full text-left text-[11px]">
                      <thead>
                        <tr className="border-b border-[#182855] text-zinc-400">
                          <th className="pb-1.5 font-semibold">Setting Key</th>
                          <th className="pb-1.5 font-semibold">Storage</th>
                          <th className="pb-1.5 font-semibold">Default</th>
                          <th className="pb-1.5 font-semibold">Description</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#131f45] text-zinc-300 font-mono">
                        {codebaseSettings.map((s) => {
                          const formattedDefault =
                            s.defaultValue === undefined || s.defaultValue === null
                              ? '—'
                              : typeof s.defaultValue === 'string'
                              ? s.defaultValue
                              : typeof s.defaultValue === 'number' || typeof s.defaultValue === 'boolean'
                              ? String(s.defaultValue)
                              : JSON.stringify(s.defaultValue);
                          return (
                            <tr key={s.key} className="hover:bg-cyan-500/5">
                              <td className="py-1.5 pr-2 text-cyan-300 font-semibold">{String(s.key)}</td>
                              <td className="py-1.5 pr-2 text-purple-300">{String(s.storage || 'localStorage')}</td>
                              <td className="py-1.5 pr-2 text-zinc-400 truncate max-w-[120px]" title={formattedDefault}>
                                {formattedDefault}
                              </td>
                              <td className="py-1.5 font-sans text-zinc-400 text-[10px]">{s.description || s.purpose || ''}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Security Redaction & Privacy Notice */}
                <div className="p-3 rounded-2xl bg-[#060a1e] border border-[#192754] flex items-start gap-3 text-xs">
                  <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <div className="font-semibold text-white">Strict Secret Isolation & Grounded Honesty</div>
                    <p className="text-[11px] text-zinc-400 leading-relaxed">
                      API keys (including <span className="font-mono text-zinc-300">GROQ_API_KEY</span> and <span className="font-mono text-zinc-300">GEMINI_API_KEY</span>) are masked at the server boundary with <span className="font-mono text-amber-300">[REDACTED_SECRET]</span>. Non-existent components (e.g., Kubernetes operator, Cloud SQL) are strictly acknowledged as unbuilt (<span className="font-mono text-red-300">NOT_FOUND</span>) to eliminate hallucinations.
                    </p>
                  </div>
                </div>
              </div>
            )}
            {activeTab === 'appearance' && (
              <div className="space-y-5">
                {/* Theme Selector */}
                <div>
                  <label className="block text-xs font-semibold text-zinc-100 mb-2">
                    Theme
                  </label>
                  <div className="grid grid-cols-3 gap-2.5">
                    {[
                      { id: 'auto', label: 'Auto', sub: 'Follows system', icon: <Monitor className="w-4 h-4 text-cyan-400" /> },
                      { id: 'dark', label: 'Dark', sub: 'Always dark', icon: <Moon className="w-4 h-4 text-blue-400" /> },
                      { id: 'light', label: 'Light', sub: 'Always light', icon: <Sun className="w-4 h-4 text-amber-400" /> },
                    ].map((th) => (
                      <button
                        key={th.id}
                        type="button"
                        onClick={() => {
                          soundEffects.playSelect();
                          setThemeMode(th.id as any);
                        }}
                        className={`p-3 rounded-2xl border text-center transition-all cursor-pointer flex flex-col items-center gap-1.5 ${
                          themeMode === th.id
                            ? 'bg-blue-600/20 border-cyan-400/50 text-cyan-200'
                            : 'bg-[#0a112c]/70 border-[#1c2c5c] text-zinc-300'
                        }`}
                      >
                        {th.icon}
                        <div className="font-semibold text-white text-xs">{th.label}</div>
                        <div className="text-[10px] text-zinc-400">{th.sub}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Animated Ambient Waves Real Toggle */}
                <div className="p-4 rounded-2xl bg-[#0a112c]/80 border border-[#1c2c5c] flex items-center justify-between">
                  <div className="pr-4">
                    <div className="font-semibold text-white flex items-center gap-2">
                      <Waves className="w-4 h-4 text-cyan-400" />
                      <span>Animated Ambient Waves</span>
                      {ambientWavesEnabled && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                          Active
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-400 mt-1">
                      Enable or disable the flowing blue and violet background lighting.
                    </p>
                  </div>

                  <button
                    type="button"
                    role="switch"
                    aria-checked={ambientWavesEnabled}
                    onClick={() => {
                      if (onToggleAmbientWaves) {
                        soundEffects.playToggle(!ambientWavesEnabled);
                        onToggleAmbientWaves(!ambientWavesEnabled);
                      }
                    }}
                    className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer focus:outline-none ${
                      ambientWavesEnabled ? 'bg-cyan-500' : 'bg-[#1a2858]'
                    }`}
                  >
                    <span
                      className={`block w-5 h-5 rounded-full bg-white transition-transform shadow-md ${
                        ambientWavesEnabled ? 'translate-x-6' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>

                {/* Background Style Options */}
                <div>
                  <label className="block text-xs font-semibold text-zinc-100 mb-2">
                    Background Style
                  </label>
                  <div className="grid grid-cols-3 gap-2.5">
                    {[
                      { id: 'cosmic', label: 'Cosmic Waves', desc: 'Flowing cyan-violet ribbons' },
                      { id: 'nebula', label: 'Deep Nebula', desc: 'Atmospheric deep sapphire' },
                      { id: 'horizon', label: 'Cyber Horizon', desc: 'Electric blue gradient' },
                    ].map((style) => (
                      <button
                        key={style.id}
                        type="button"
                        onClick={() => {
                          soundEffects.playSelect();
                          setBackgroundStyle(style.id as any);
                        }}
                        className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                          backgroundStyle === style.id
                            ? 'bg-blue-600/20 border-cyan-400/50 text-cyan-200'
                            : 'bg-[#0a112c]/70 border-[#1c2c5c] text-zinc-300'
                        }`}
                      >
                        <div className="font-semibold text-white text-xs">{style.label}</div>
                        <div className="text-[10px] text-zinc-400 mt-1">{style.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Live Preview Box */}
                <div className="p-4 rounded-2xl bg-[#050816] border border-[#1d2d60] flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <NovaChatLogo size={36} showGlow={true} />
                    <div>
                      <div className="font-semibold text-white">NovaChat AI</div>
                      <div className="text-[10px] text-cyan-400">Cinematic Console Preview</div>
                    </div>
                  </div>
                  <span className="text-[10px] text-zinc-400 font-mono">Live Rendering</span>
                </div>
              </div>
            )}

            {/* 1B. NOVA LIVE VOICE SELECTION TAB */}
            {activeTab === 'voice' && (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-white flex items-center gap-2">
                      <Mic className="w-4 h-4 text-cyan-400" />
                      <span>Gemini Live Voice Selection</span>
                    </div>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      Choose from all 30 officially supported Gemini Live prebuilt voices for real-time speech.
                    </p>
                  </div>
                  <div className="text-xs text-cyan-300 font-medium bg-cyan-500/10 border border-cyan-500/30 px-3 py-1.5 rounded-xl shrink-0">
                    Active: <span className="font-semibold text-white">{selectedVoice}</span>
                  </div>
                </div>

                {/* Search Input */}
                <div className="relative">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                  <input
                    type="text"
                    value={voiceSearchQuery}
                    onChange={(e) => setVoiceSearchQuery(e.target.value)}
                    placeholder="Search all 30 Gemini Live voices by name or style (e.g., Zephyr, Bright, Smooth)..."
                    className="w-full pl-10 pr-4 py-2.5 text-xs bg-[#0a112c]/90 border border-[#1c2c5c] rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-400/60 transition-colors"
                  />
                </div>

                {voicePreviewError && (
                  <div className="p-3 rounded-xl bg-red-950/50 border border-red-500/30 text-xs text-red-300 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{voicePreviewError}</span>
                  </div>
                )}

                {/* 30 Official Prebuilt Voices Gallery */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {GEMINI_LIVE_VOICES.filter(
                    (v) =>
                      v.name.toLowerCase().includes(voiceSearchQuery.toLowerCase()) ||
                      v.description.toLowerCase().includes(voiceSearchQuery.toLowerCase())
                  ).map((voice) => {
                    const isSelected = voice.id === selectedVoice;
                    const isLoading = previewLoadingVoiceId === voice.id;
                    const isPlaying = previewPlayingVoiceId === voice.id;

                    return (
                      <div
                        key={voice.id}
                        onClick={() => {
                          soundEffects.playSelect();
                          onSelectVoice?.(voice.id);
                        }}
                        className={`flex items-center justify-between p-3 rounded-2xl border cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-cyan-950/40 border-cyan-400/60 shadow-[0_0_15px_rgba(6,182,212,0.12)]'
                            : 'bg-[#0a112c]/70 border-[#1c2c5c] hover:bg-[#101b42]/80 hover:border-blue-500/40'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`w-8 h-8 rounded-xl flex items-center justify-center font-semibold text-xs shrink-0 ${
                              isSelected
                                ? 'bg-cyan-500 text-slate-950'
                                : 'bg-[#13204a] text-zinc-200'
                            }`}
                          >
                            {voice.name[0]}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-semibold text-white truncate">
                                {voice.name}
                              </span>
                              {voice.recommended && (
                                <span className="text-[9px] uppercase tracking-wider font-semibold text-cyan-300">
                                  · Default
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-zinc-400 truncate">
                              {voice.description}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={(e) => handlePlayVoicePreview(e, voice.id)}
                            disabled={isLoading || isPlaying}
                            title={`Preview ${voice.name}`}
                            className={`p-2 rounded-xl transition-colors cursor-pointer ${
                              isPlaying
                                ? 'bg-cyan-500/20 text-cyan-300 animate-pulse'
                                : 'text-zinc-400 hover:text-cyan-300 hover:bg-[#162452]'
                            }`}
                          >
                            {isLoading ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                            ) : (
                              <Volume2 className="w-3.5 h-3.5" />
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
              </div>
            )}

            {/* 3. AUDIO & SOUNDS TAB */}
            {activeTab === 'music' && (
              <div className="space-y-6">
                {/* Background Music Section */}
                <div className="space-y-3">
                  <div className="text-xs font-semibold text-zinc-100 flex items-center gap-1.5">
                    <Music className="w-4 h-4 text-cyan-400" />
                    <span>Background Music (003. Home Menu.mp3)</span>
                  </div>
                  <BackgroundMusicSettings />
                </div>

                {/* UI Sound Effects Section */}
                <div className="space-y-3 pt-4 border-t border-[#182859]">
                  <div className="text-xs font-semibold text-zinc-100 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Volume2 className="w-4 h-4 text-cyan-400" />
                      <span>UI Sound Effects</span>
                    </span>
                    <button
                      type="button"
                      onClick={handleTestUiSound}
                      className="px-2.5 py-1 rounded-lg bg-[#111f4d] hover:bg-[#1a2e73] text-cyan-300 border border-cyan-500/30 text-[11px] font-medium transition-colors cursor-pointer flex items-center gap-1"
                    >
                      <span>Test Sound</span>
                    </button>
                  </div>

                  <div className="p-4 rounded-2xl bg-[#0a112c]/80 border border-[#1c2c5c] space-y-4">
                    {/* Enable Toggle */}
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-white text-xs">Interaction Clicks & Chimes</div>
                        <div className="text-[11px] text-zinc-400">Play subtle, tactical sounds for button clicks and menu actions.</div>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={uiSoundSettings.enabled}
                        onClick={() => handleToggleUiSound(!uiSoundSettings.enabled)}
                        className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer focus:outline-none ${
                          uiSoundSettings.enabled ? 'bg-cyan-500' : 'bg-[#1a2858]'
                        }`}
                      >
                        <span
                          className={`block w-5 h-5 rounded-full bg-white transition-transform shadow-md ${
                            uiSoundSettings.enabled ? 'translate-x-6' : 'translate-x-0.5'
                          }`}
                        />
                      </button>
                    </div>

                    {/* Volume Slider */}
                    <div className="pt-2 border-t border-[#172552] space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-zinc-400">Sound Effects Volume</span>
                        <span className="font-mono text-zinc-300 font-medium tabular-nums">
                          {uiSoundSettings.isMuted ? 'Muted' : `${Math.round(uiSoundSettings.volume * 100)}%`}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            soundEffects.toggleMute();
                            setUiSoundSettings(soundEffects.getSettings());
                          }}
                          className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-[#14204d] transition-colors cursor-pointer"
                        >
                          {uiSoundSettings.isMuted || uiSoundSettings.volume === 0 ? (
                            <VolumeX className="w-4 h-4 text-red-400" />
                          ) : (
                            <Volume2 className="w-4 h-4 text-cyan-400" />
                          )}
                        </button>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          step="1"
                          value={uiSoundSettings.isMuted ? 0 : Math.round(uiSoundSettings.volume * 100)}
                          onChange={(e) => handleUiSoundVolumeChange(Number(e.target.value) / 100)}
                          className="flex-1 h-1.5 bg-[#0e1738] rounded-lg appearance-none cursor-pointer accent-cyan-400"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 4. AI ENGINE & REASONING MODES TAB */}
            {activeTab === 'models' && (
              <div className="space-y-4">
                <label className="block text-xs font-semibold text-zinc-100 mb-1">
                  Primary AI Architecture
                </label>
                
                {/* Single Default AI Engine Card */}
                <div className="p-4 rounded-2xl bg-blue-600/15 border border-cyan-400/40 text-cyan-200">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <NovaChatLogo size={20} showGlow={false} />
                      <span className="font-bold text-white text-sm">NovaChat AI</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 font-mono">
                        Primary Default
                      </span>
                    </div>
                    <span className="text-[10px] font-mono text-cyan-300">Active</span>
                  </div>
                  <p className="text-[12px] text-zinc-300 leading-relaxed mb-3">
                    Powered by <span className="font-mono text-cyan-300 font-semibold">openai/gpt-oss-120b</span> on Groq LPUs. Fast, objective, highly capable reasoning engine with reliable memory continuity.
                  </p>
                  
                  {/* Two Effort Modes Breakdown */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-cyan-500/20 text-[11px]">
                    <div className="p-2.5 rounded-xl bg-[#070c20]/80 border border-[#1b2b5c]">
                      <div className="font-semibold text-white flex items-center gap-1.5 mb-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-zinc-400" />
                        <span>Normal Mode (Default)</span>
                      </div>
                      <p className="text-zinc-400 leading-tight">
                        Standard reasoning effort (<span className="font-mono text-zinc-300">low</span>) prioritized for rapid conversational responses and token efficiency.
                      </p>
                    </div>

                    <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30">
                      <div className="font-semibold text-cyan-300 flex items-center gap-1.5 mb-1">
                        <Brain className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Think Mode (User Toggle)</span>
                      </div>
                      <p className="text-zinc-400 leading-tight">
                        High reasoning effort (<span className="font-mono text-cyan-300">high</span>), multi-step self-verification (Phases A-E), and safe 15-minute deadline guard.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Web Search Grounding Toggle */}
                <div className="p-4 rounded-2xl bg-[#0a112c]/80 border border-[#1c2c5c] flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-white text-xs">Web Search Grounding</div>
                    <div className="text-[11px] text-zinc-400">Search the real-time web for current facts & verified citations.</div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={defaultSearchGrounding}
                    onClick={() => {
                      soundEffects.playToggle(!defaultSearchGrounding);
                      onToggleDefaultSearchGrounding(!defaultSearchGrounding);
                    }}
                    className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer focus:outline-none ${
                      defaultSearchGrounding ? 'bg-cyan-500' : 'bg-[#1a2858]'
                    }`}
                  >
                    <span
                      className={`block w-5 h-5 rounded-full bg-white transition-transform shadow-md ${
                        defaultSearchGrounding ? 'translate-x-6' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>
              </div>
            )}

            {/* 5. MEMORY VAULT TAB */}
            {activeTab === 'memory' && (
              <MemoryVaultPanel
                memoryEnabled={memoryEnabled}
                onToggleMemoryEnabled={onToggleMemoryEnabled}
                userMemories={userMemories}
                codeMemories={codeMemories}
                onToggleTextEnabled={onToggleTextMemoryEnabled}
                onToggleTextPinned={onToggleTextMemoryPinned}
                onRemoveMemory={onRemoveMemory}
                onClearMemories={onClearMemories}
                onToggleCodeEnabled={onToggleCodeMemoryEnabled}
                onToggleCodePinned={onToggleCodeMemoryPinned}
                onRemoveCodeMemory={onRemoveCodeMemory}
                onClearCodeMemories={onClearCodeMemories}
                onOpenSaveMemoryModal={onOpenSaveMemoryModal}
                corrections={corrections}
                auditLogs={auditLogs}
                actionLoadingId={actionLoadingId}
                onApproveCorrection={handleApproveCorrection}
                onRejectCorrection={handleRejectCorrection}
                onProposeCorrection={handleProposeCorrectionPayload}
              />
            )}

            {/* 6. DATA & STORAGE TAB */}
            {activeTab === 'data' && (
              <div className="space-y-4">
                {/* Chat Data Section */}
                <div className="p-4 rounded-2xl bg-[#0a112c]/80 border border-[#1c2c5c] space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-semibold text-white text-xs flex items-center gap-2">
                      <FolderGit2 className="w-4 h-4 text-cyan-400" />
                      <span>Chat Data</span>
                    </div>
                    <span className="text-[11px] text-zinc-400 font-mono tabular-nums">
                      Total conversations: <span className="font-bold text-cyan-300">{totalChatsCount}</span>
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-400">
                    Import chats from ChatGPT, Claude, Gemini, NovaChat JSON, Markdown, or TXT without overwriting existing history.
                  </p>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        soundEffects.playClick();
                        onOpenImportChats();
                      }}
                      className="px-3.5 py-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold cursor-pointer transition-colors flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>Import Chats</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        soundEffects.playConfirm();
                        onExportAllChats();
                      }}
                      className="px-3.5 py-1.5 rounded-xl bg-[#111f4d] hover:bg-[#1a2e73] text-cyan-300 border border-cyan-500/40 text-xs font-semibold cursor-pointer transition-colors flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Export All Chats</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        soundEffects.playClick();
                        setConfirmClear(true);
                      }}
                      className="px-3.5 py-1.5 rounded-xl bg-red-500/15 hover:bg-red-500/25 text-red-300 border border-red-500/30 text-xs font-semibold cursor-pointer transition-colors flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Clear All History</span>
                    </button>
                  </div>

                  {confirmClear && (
                    <div className="p-3 rounded-xl bg-red-500/15 border border-red-500/40 text-red-200 text-xs space-y-2 mt-2">
                      <p>Are you sure you want to delete all chat history? This action cannot be undone.</p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            soundEffects.playConfirm();
                            onClearAllChats();
                            setConfirmClear(false);
                          }}
                          className="px-3 py-1 bg-red-600 text-white rounded-lg font-bold cursor-pointer"
                        >
                          Yes, Delete All
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmClear(false)}
                          className="px-3 py-1 bg-[#14204d] text-zinc-200 rounded-lg cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Memory Data Section */}
                <div className="p-4 rounded-2xl bg-[#0a112c]/80 border border-[#1c2c5c] space-y-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="font-semibold text-white text-xs flex items-center gap-2">
                      <Brain className="w-4 h-4 text-purple-400" />
                      <span>Memory Data</span>
                    </div>
                    <div className="text-[11px] text-zinc-400 font-mono tabular-nums flex items-center gap-3">
                      <span>
                        Text: <span className="font-bold text-cyan-300">{userMemories.length}</span>
                      </span>
                      <span>
                        Code: <span className="font-bold text-purple-300">{codeMemories.length}</span>
                      </span>
                    </div>
                  </div>
                  <p className="text-[11px] text-zinc-400">
                    Manage, export, or restore your Text and Code Memory Vault independently from your chat sessions.
                  </p>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        soundEffects.playSelect();
                        setActiveTab('memory');
                      }}
                      className="px-3.5 py-1.5 rounded-xl bg-blue-600/25 hover:bg-blue-600/35 text-cyan-200 border border-cyan-500/40 text-xs font-semibold cursor-pointer transition-colors flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <Brain className="w-3.5 h-3.5" />
                      <span>Manage Memory Vault</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        soundEffects.playConfirm();
                        onExportMemories();
                      }}
                      className="px-3.5 py-1.5 rounded-xl bg-[#111f4d] hover:bg-[#1a2e73] text-cyan-300 border border-cyan-500/40 text-xs font-semibold cursor-pointer transition-colors flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Export Memories</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        soundEffects.playClick();
                        memoryFileInputRef.current?.click();
                      }}
                      className="px-3.5 py-1.5 rounded-xl bg-[#111f4d] hover:bg-[#1a2e73] text-zinc-200 border border-[#243875] text-xs font-semibold cursor-pointer transition-colors flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <Upload className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Import Memories</span>
                    </button>
                    <input
                      ref={memoryFileInputRef}
                      type="file"
                      accept=".json,application/json"
                      onChange={handleMemoryFileImport}
                      className="hidden"
                    />
                  </div>

                  {memoryImportError && (
                    <div className="p-2.5 rounded-xl bg-red-500/15 border border-red-500/40 text-red-200 text-xs flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                      <span>{memoryImportError}</span>
                    </div>
                  )}

                  {memoryImportSuccess && (
                    <div className="p-2.5 rounded-xl bg-cyan-950/60 border border-cyan-500/40 text-cyan-200 text-xs flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0" />
                      <span>{memoryImportSuccess}</span>
                    </div>
                  )}

                  {pendingMemoryImport && (
                    <div className="p-3 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-200 text-xs space-y-2">
                      <div className="font-semibold text-amber-300 flex items-center gap-1.5">
                        <ShieldAlert className="w-4 h-4 shrink-0" />
                        <span>Credential Patterns Detected in Imported Code Memory</span>
                      </div>
                      <p className="text-[11px] text-amber-100/90">
                        Snippets flagged: {pendingMemoryImport.secretFindings.map((f) => `${f.title} (${f.findings.join(', ')})`).join('; ')}. Confirm before importing?
                      </p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            onImportMemories({
                              memories: pendingMemoryImport.memories,
                              codeMemories: pendingMemoryImport.codeMemories,
                            });
                            setMemoryImportSuccess(
                              `Imported ${pendingMemoryImport.memories.length} text and ${pendingMemoryImport.codeMemories.length} code memories.`
                            );
                            setPendingMemoryImport(null);
                            soundEffects.playConfirm();
                          }}
                          className="px-3 py-1 rounded-lg bg-amber-500 text-slate-950 font-bold cursor-pointer"
                        >
                          Confirm Import
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingMemoryImport(null)}
                          className="px-3 py-1 rounded-lg bg-[#14204d] text-zinc-200 cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 7. SECURITY & PRIVACY TAB */}
            {activeTab === 'security' && (
              <div className="space-y-4">
                <div className="p-4 rounded-2xl bg-[#0a112c]/80 border border-[#1c2c5c] space-y-2">
                  <div className="font-semibold text-white text-xs flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <span>Privacy & Data Sovereignty</span>
                  </div>
                  <p className="text-[11px] text-zinc-400 leading-relaxed">
                    NovaChat AI operates with client-first privacy. Conversation memories and settings are stored locally on your device or safely persisted in local SQLite with audit logs. No telemetry, third-party trackers, or personal advertising cookies are used.
                  </p>
                </div>
              </div>
            )}

            {/* 8. ABOUT TAB */}
            {activeTab === 'about' && (
              <div className="space-y-4 text-center py-4">
                <NovaChatLogo size={64} showGlow={true} className="mx-auto mb-2" />
                <h3 className="text-lg font-bold text-white">NovaChat AI</h3>
                <p className="text-xs text-zinc-400 max-w-sm mx-auto">
                  A modern, futuristic, cinematic AI assistant combining common-sense reasoning, persistent memory, and immersive console sound & visuals.
                </p>
                <div className="p-3 rounded-xl bg-[#070c1e] border border-[#172552] max-w-xs mx-auto text-[11px] text-zinc-400 font-mono space-y-1 text-left">
                  <div>Creator & Owner: <span className="text-cyan-300">Luv Gehlot</span></div>
                  <div>Inference: <span className="text-zinc-200">Groq LPU (LLaMA 3.3 70B, GPT-OSS 120B)</span></div>
                  <div>Audio Engine: <span className="text-zinc-200">003. Home Menu.mp3 @ 20% vol</span></div>
                  <div>UI Sounds: <span className="text-zinc-200">Web Audio API @ 10% vol</span></div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
