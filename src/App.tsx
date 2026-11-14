import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Sidebar } from './components/Sidebar';
import { ChatArea } from './components/ChatArea';
import { InputBar } from './components/InputBar';
import { SettingsModal } from './components/SettingsModal';
import {
  ChatSession,
  ChatMessage,
  Attachment,
  GroundingSource,
  UserMemoryItem,
  CodeMemoryItem,
  TextMemoryCategory,
} from './types';
import { AVAILABLE_MODELS, AVAILABLE_PERSONAS } from './constants';
import { PRIMARY_DEFAULT_MODEL } from './services/modelConfig';
import { BackgroundMusicProvider } from './context/BackgroundMusicContext';
import { AmbientWaves } from './components/AmbientWaves';
import { HomeScreen } from './components/HomeScreen';
import { estimateFullRequestTokens, buildHandoffSummary } from './services/tokenEngine';
import { ContextHandoffModal } from './components/ContextHandoffModal';
import { soundEffects } from './services/soundEffects';
import { classifyPersonaIntent, PERSONAS } from './services/personaEngine';
import { NOVACHAT_DEFAULT_SYSTEM_PROMPT } from './services/conversationEngine';
import { NovaLiveVoice } from './components/voice/NovaLiveVoice';
import { LiveTranscriptItem } from './types/voice';
import { ImportChatsModal } from './components/ImportChatsModal';
import { SaveToMemoryModal, SaveToMemoryInitialData } from './components/SaveToMemoryModal';
import {
  buildMemoryExportPayload,
  normalizeCodeMemory,
  normalizeFenceLanguageToCodeMemoryLanguage,
  normalizeTextMemory,
  selectRelevantMemories,
} from './services/memoryService';
import {
  DEFAULT_GEMINI_LIVE_VOICE,
  GEMINI_LIVE_VOICES,
  STORAGE_KEY_SELECTED_VOICE,
} from './constants/voices';

const STORAGE_KEY_SESSIONS = 'novachat_sessions_v2';
const STORAGE_KEY_SETTINGS = 'novachat_settings_v2';
const STORAGE_KEY_MEMORY = 'novachat_user_memory_v1';
const STORAGE_KEY_CODE_MEMORY = 'novachat_code_memory_v1';
const STORAGE_KEY_MEMORY_ENABLED = 'novachat_memory_enabled_v1';
const STORAGE_KEY_AMBIENT_WAVES = 'novachat_ambient_waves_enabled';
const LEGACY_STORAGE_KEY_THINK_MODE = 'novachat_think_mode';

/**
 * Sanitizes system instructions and shields against bloated legacy dumps or accidental recursion
 */
function sanitizeInstruction(raw?: string): string {
  if (!raw || typeof raw !== 'string') {
    return AVAILABLE_PERSONAS[0].instruction;
  }
  const trimmed = raw.trim();
  if (
    trimmed.length > 2500 ||
    trimmed.includes('[CONVERSATION CONTINUATION') ||
    trimmed.includes('PRIOR CONVERSATION CONTEXT') ||
    (trimmed.match(/MASTER SYSTEM PROMPT/g) || []).length > 1
  ) {
    return AVAILABLE_PERSONAS[0].instruction;
  }
  return trimmed;
}

function AppContent() {
  // Console-inspired Ambient Waves & View State
  const [ambientWavesEnabled, setAmbientWavesEnabled] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_AMBIENT_WAVES);
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });
  const [currentView, setCurrentView] = useState<'home' | 'chat'>('home');

  // Single default AI model and per-request Think mode (always OFF by default)
  const [activeModel, setActiveModel] = useState<string>(PRIMARY_DEFAULT_MODEL);
  const [thinkMode, setThinkMode] = useState<boolean>(false);
  const [searchGrounding, setSearchGrounding] = useState<boolean>(true);
  const [systemPersonaId, setSystemPersonaId] = useState<string>('auto');
  const [activeRoutedPersonaId, setActiveRoutedPersonaId] = useState<string>('nova');
  const [customInstruction, setCustomInstruction] = useState<string>(
    AVAILABLE_PERSONAS[0].instruction
  );

  // Clear any legacy persisted Think Mode flag so it always starts OFF
  useEffect(() => {
    try {
      localStorage.removeItem(LEGACY_STORAGE_KEY_THINK_MODE);
    } catch {}
  }, []);

  const handleToggleThinkMode = useCallback(() => {
    setThinkMode((prev) => {
      const next = !prev;
      soundEffects.playToggle?.(next);
      return next;
    });
  }, []);

  // Long-Term Memory Vault State (Text + Code)
  const [userMemories, setUserMemories] = useState<UserMemoryItem[]>([]);
  const [codeMemories, setCodeMemories] = useState<CodeMemoryItem[]>([]);
  const [memoryEnabled, setMemoryEnabled] = useState<boolean>(true);
  const memoryHydratedRef = useRef<boolean>(false);

  // Chat Sessions & UI state
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [input, setInput] = useState<string>('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<string>('general');
  const [importChatsOpen, setImportChatsOpen] = useState<boolean>(false);
  const [saveMemoryModal, setSaveMemoryModal] = useState<{
    isOpen: boolean;
    initialData: SaveToMemoryInitialData | null;
  }>({ isOpen: false, initialData: null });
  const [handoffModalOpen, setHandoffModalOpen] = useState<boolean>(false);
  const [handoffSummaryText, setHandoffSummaryText] = useState<string>('');
  const [isGeneratingHandoff, setIsGeneratingHandoff] = useState<boolean>(false);
  const [isVoiceOpen, setIsVoiceOpen] = useState<boolean>(false);
  const [selectedVoice, setSelectedVoice] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_SELECTED_VOICE);
      if (saved && GEMINI_LIVE_VOICES.some((v) => v.id === saved)) {
        return saved;
      }
    } catch {}
    return DEFAULT_GEMINI_LIVE_VOICE;
  });

  const abortControllerRef = useRef<AbortController | null>(null);

  const handleSelectVoice = useCallback((voiceId: string) => {
    setSelectedVoice(voiceId);
    try {
      localStorage.setItem(STORAGE_KEY_SELECTED_VOICE, voiceId);
    } catch {}
  }, []);

  const handleSaveVoiceTranscript = useCallback((voiceTranscripts: LiveTranscriptItem[]) => {
    if (!voiceTranscripts || voiceTranscripts.length === 0) return;

    const now = Date.now();
    const dialogue = voiceTranscripts
      .map((t) => `**${t.role === 'user' ? 'You' : 'Nova'}** (${t.timestamp}):\n${t.text}`)
      .join('\n\n');

    const formattedMessage: ChatMessage = {
      id: 'msg_voice_' + now.toString(36),
      role: 'assistant',
      content: `**Live Voice Conversation Transcript** (${voiceTranscripts.length} turns):\n\n${dialogue}`,
      createdAt: now,
      modelUsed: 'gemini-3.8-live',
    };

    setSessions((prev) => {
      if (prev.length === 0 || !activeSessionId) {
        const newSession: ChatSession = {
          id: 'session_' + now.toString(36),
          title: 'Live Voice Conversation',
          messages: [formattedMessage],
          createdAt: now,
          updatedAt: now,
          model: activeModel,
          systemInstruction: customInstruction,
          searchGrounding,
        };
        setActiveSessionId(newSession.id);
        setCurrentView('chat');
        return [newSession, ...prev];
      }

      return prev.map((s) => {
        if (s.id === activeSessionId) {
          return {
            ...s,
            messages: [...s.messages, formattedMessage],
            updatedAt: now,
          };
        }
        return s;
      });
    });

    soundEffects.playConfirm?.();
  }, [activeSessionId, activeModel, customInstruction, searchGrounding]);

  const handleToggleAmbientWaves = (enabled: boolean) => {
    setAmbientWavesEnabled(enabled);
    try {
      localStorage.setItem(STORAGE_KEY_AMBIENT_WAVES, String(enabled));
    } catch {}
  };

  // Load initial settings, sessions, and memory from localStorage and backend
  useEffect(() => {
    try {
      const validModelIds = AVAILABLE_MODELS.map((m) => m.id);
      const savedSettings = localStorage.getItem(STORAGE_KEY_SETTINGS);
      if (savedSettings) {
        const parsed = JSON.parse(savedSettings);
        if (parsed.activeModel && validModelIds.includes(parsed.activeModel)) {
          setActiveModel(parsed.activeModel);
        } else {
          setActiveModel(PRIMARY_DEFAULT_MODEL);
        }
        if (typeof parsed.searchGrounding === 'boolean') setSearchGrounding(parsed.searchGrounding);
        if (parsed.systemPersonaId) {
          const validPersonaIds = ['auto', 'nova', 'forge', 'cipher', 'muse', 'sage'];
          setSystemPersonaId(validPersonaIds.includes(parsed.systemPersonaId) ? parsed.systemPersonaId : 'auto');
        }
        if (parsed.customInstruction) setCustomInstruction(sanitizeInstruction(parsed.customInstruction));
        if (parsed.selectedVoice && GEMINI_LIVE_VOICES.some((v) => v.id === parsed.selectedVoice)) {
          setSelectedVoice(parsed.selectedVoice);
        }
      }

      const savedMemEnabled = localStorage.getItem(STORAGE_KEY_MEMORY_ENABLED);
      if (savedMemEnabled !== null) {
        setMemoryEnabled(savedMemEnabled === 'true');
      }

      const savedMemory = localStorage.getItem(STORAGE_KEY_MEMORY);
      if (savedMemory) {
        const parsedMem = JSON.parse(savedMemory);
        if (Array.isArray(parsedMem)) {
          setUserMemories(
            parsedMem
              .map((m, idx) => normalizeTextMemory(m, idx))
              .filter((m): m is UserMemoryItem => m !== null)
          );
        }
      }

      const savedCodeMemory = localStorage.getItem(STORAGE_KEY_CODE_MEMORY);
      if (savedCodeMemory) {
        const parsedCode = JSON.parse(savedCodeMemory);
        if (Array.isArray(parsedCode)) {
          setCodeMemories(
            parsedCode
              .map((c, idx) => normalizeCodeMemory(c, idx))
              .filter((c): c is CodeMemoryItem => c !== null)
          );
        }
      }

      const savedSessions = localStorage.getItem(STORAGE_KEY_SESSIONS);
      if (savedSessions) {
        const parsed = JSON.parse(savedSessions);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const sanitized = parsed
            .filter((s: any) => (s.messages && s.messages.length > 0) || s.handoffSummary)
            .map((s: any) => ({
              ...s,
              systemInstruction: sanitizeInstruction(s.systemInstruction),
              model: validModelIds.includes(s.model) ? s.model : PRIMARY_DEFAULT_MODEL,
            }));
          setSessions(sanitized);
          // Keep activeSessionId null so startup view stays purely on Home/New draft
        }
      }
    } catch (e) {
      console.error('Failed to load local data:', e);
    }

    // Sync from backend persistence (/api/sessions & /api/memory)
    fetch('/api/sessions')
      .then((res) => res.json())
      .then((data) => {
        if (data.sessions && Array.isArray(data.sessions) && data.sessions.length > 0) {
          setSessions((prev) => {
            const validBackend = data.sessions.filter(
              (s: any) => (s.messages && s.messages.length > 0) || s.handoffSummary
            );
            if (prev.length === 0) {
              return validBackend;
            }
            // Merge sessions keeping existing ones prioritized
            const existingIds = new Set(prev.map((s) => s.id));
            const merged = [...prev];
            for (const s of validBackend) {
              if (!existingIds.has(s.id)) {
                merged.push(s);
              }
            }
            return merged;
          });
        }
      })
      .catch((err) => console.warn('Could not sync sessions from backend:', err));

    fetch('/api/memory')
      .then((res) => res.json())
      .then((data) => {
        if (data.memories && Array.isArray(data.memories) && data.memories.length > 0) {
          const normalizedBackend = data.memories
            .map((m: any, idx: number) => normalizeTextMemory(m, idx))
            .filter((m: UserMemoryItem | null): m is UserMemoryItem => m !== null);

          setUserMemories((prev) => {
            const existingIds = new Set(prev.map((m) => m.id));
            const merged = [...prev];
            for (const m of normalizedBackend) {
              if (!existingIds.has(m.id)) {
                merged.push(m);
              }
            }
            return merged;
          });
        }

        if (data.codeMemories && Array.isArray(data.codeMemories) && data.codeMemories.length > 0) {
          const normalizedBackendCode = data.codeMemories
            .map((c: any, idx: number) => normalizeCodeMemory(c, idx))
            .filter((c: CodeMemoryItem | null): c is CodeMemoryItem => c !== null);

          setCodeMemories((prev) => {
            const existingIds = new Set(prev.map((c) => c.id));
            const merged = [...prev];
            for (const c of normalizedBackendCode) {
              if (!existingIds.has(c.id)) {
                merged.push(c);
              }
            }
            return merged;
          });
        }
      })
      .catch((err) => console.warn('Could not sync memory from backend:', err))
      .finally(() => {
        memoryHydratedRef.current = true;
      });

    // Auto-close sidebar on mobile
    if (window.innerWidth < 768) {
      setSidebarOpen(false);
    }
  }, []);

  // Persist sessions to localStorage and backend
  useEffect(() => {
    if (sessions.length === 0) return;

    try {
      // Create a lightweight copy for localStorage to prevent quota exhaustion
      const safeSessions = sessions.map((s) => ({
        ...s,
        messages: s.messages.map((m) => ({
          ...m,
          attachments: m.attachments?.map((a) => ({
            id: a.id,
            name: a.name,
            type: a.type,
            // Keep small base64 or strip huge raw strings in localStorage
            base64: a.base64 && a.base64.length < 50000 ? a.base64 : '',
            size: a.size,
          })),
        })),
      }));
      localStorage.setItem(STORAGE_KEY_SESSIONS, JSON.stringify(safeSessions));
    } catch (e) {
      console.warn('LocalStorage save failed, falling back to backend storage:', e);
    }

    // Debounce save to backend file storage
    const timer = setTimeout(() => {
      fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessions }),
      }).catch((e) => console.warn('Backend session save warning:', e));
    }, 1000);

    return () => clearTimeout(timer);
  }, [sessions]);

  // Persist settings
  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY_SETTINGS,
        JSON.stringify({
          activeModel,
          searchGrounding,
          systemPersonaId,
          customInstruction,
          selectedVoice,
        })
      );
      localStorage.setItem(STORAGE_KEY_SELECTED_VOICE, selectedVoice);
    } catch (e) {
      console.error('Failed to save settings:', e);
    }
  }, [activeModel, searchGrounding, systemPersonaId, customInstruction, selectedVoice]);

  // Persist User Memory Vault (Text + Code)
  useEffect(() => {
    if (!memoryHydratedRef.current) return;
    try {
      localStorage.setItem(STORAGE_KEY_MEMORY, JSON.stringify(userMemories));
      localStorage.setItem(STORAGE_KEY_CODE_MEMORY, JSON.stringify(codeMemories));
      localStorage.setItem(STORAGE_KEY_MEMORY_ENABLED, String(memoryEnabled));
    } catch (e) {
      console.warn('Failed to save memory to localStorage:', e);
    }

    fetch('/api/memory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memories: userMemories, codeMemories }),
    }).catch((e) => console.warn('Backend memory save warning:', e));
  }, [userMemories, codeMemories, memoryEnabled]);

  // Memory Vault management helpers (Text + Code)
  const handleAddMemory = (fact: string) => {
    const newItem: UserMemoryItem = {
      id: `mem-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      fact: fact.trim(),
      category: 'general',
      tags: [],
      pinned: false,
      enabled: true,
      createdAt: Date.now(),
    };
    setUserMemories((prev) => [newItem, ...prev]);
  };

  const handleSaveTextMemoryModal = (
    data: {
      fact: string;
      category: TextMemoryCategory;
      tags: string[];
      pinned: boolean;
    },
    editingId?: string
  ) => {
    const now = Date.now();
    if (editingId) {
      setUserMemories((prev) =>
        prev.map((m) =>
          m.id === editingId
            ? {
                ...m,
                fact: data.fact,
                category: data.category,
                tags: data.tags,
                pinned: data.pinned,
                updatedAt: now,
              }
            : m
        )
      );
      return;
    }

    const newItem: UserMemoryItem = {
      id: `mem-${now}-${Math.random().toString(36).substring(2, 7)}`,
      fact: data.fact,
      category: data.category,
      tags: data.tags,
      pinned: data.pinned,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    };
    setUserMemories((prev) => [newItem, ...prev]);
  };

  const handleSaveCodeMemoryModal = (
    data: {
      title: string;
      language: string;
      projectName: string;
      description: string;
      tags: string[];
      code: string;
      pinned: boolean;
    },
    editingId?: string
  ) => {
    const now = Date.now();
    if (editingId) {
      setCodeMemories((prev) =>
        prev.map((c) =>
          c.id === editingId
            ? {
                ...c,
                title: data.title,
                language: data.language,
                projectName: data.projectName,
                description: data.description,
                tags: data.tags,
                code: data.code,
                pinned: data.pinned,
                updatedAt: now,
              }
            : c
        )
      );
      return;
    }

    const newCodeItem: CodeMemoryItem = {
      id: `code-${now}-${Math.random().toString(36).substring(2, 7)}`,
      title: data.title,
      language: data.language,
      projectName: data.projectName,
      description: data.description,
      tags: data.tags,
      code: data.code,
      pinned: data.pinned,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    };
    setCodeMemories((prev) => [newCodeItem, ...prev]);
  };

  const handleToggleTextMemoryEnabled = (id: string) => {
    setUserMemories((prev) =>
      prev.map((m) => (m.id === id ? { ...m, enabled: m.enabled === false } : m))
    );
  };

  const handleToggleTextMemoryPinned = (id: string) => {
    setUserMemories((prev) =>
      prev.map((m) => (m.id === id ? { ...m, pinned: !m.pinned } : m))
    );
  };

  const handleRemoveMemory = (id: string) => {
    setUserMemories((prev) => prev.filter((m) => m.id !== id));
  };

  const handleClearMemories = () => {
    setUserMemories([]);
  };

  const handleToggleCodeMemoryEnabled = (id: string) => {
    setCodeMemories((prev) =>
      prev.map((c) => (c.id === id ? { ...c, enabled: !c.enabled } : c))
    );
  };

  const handleToggleCodeMemoryPinned = (id: string) => {
    setCodeMemories((prev) =>
      prev.map((c) => (c.id === id ? { ...c, pinned: !c.pinned } : c))
    );
  };

  const handleRemoveCodeMemory = (id: string) => {
    setCodeMemories((prev) => prev.filter((c) => c.id !== id));
  };

  const handleClearCodeMemories = () => {
    setCodeMemories([]);
  };

  const handleOpenSaveMessageToMemory = (message: ChatMessage) => {
    setSaveMemoryModal({
      isOpen: true,
      initialData: {
        mode: 'text',
        fact: message.content.slice(0, 1200),
        category: message.role === 'user' ? 'preference' : 'general',
      },
    });
  };

  const handleOpenSaveCodeToMemory = (code: string, language: string) => {
    const firstLine = code.split('\n').find((l) => l.trim().length > 0) || '';
    const guessedTitle = firstLine
      .replace(/^(\/\/|#|\/\*)\s*/, '')
      .slice(0, 50)
      .trim() || `${normalizeFenceLanguageToCodeMemoryLanguage(language)} Snippet`;

    setSaveMemoryModal({
      isOpen: true,
      initialData: {
        mode: 'code',
        title: guessedTitle,
        language: normalizeFenceLanguageToCodeMemoryLanguage(language),
        code,
      },
    });
  };

  const handleImportSessions = (newSessions: ChatSession[]) => {
    if (!newSessions || newSessions.length === 0) return;
    setSessions((prev) => {
      const combined = [...newSessions, ...prev];
      return combined.sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt));
    });
  };

  const handleExportMemories = () => {
    try {
      const payload = buildMemoryExportPayload(userMemories, codeMemories);
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: 'application/json;charset=utf-8;',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `novachat-memories-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Failed to export memories:', e);
    }
  };

  const handleImportMemories = (payload: {
    memories: UserMemoryItem[];
    codeMemories: CodeMemoryItem[];
  }) => {
    if (payload.memories.length > 0) {
      setUserMemories((prev) => {
        const existingFacts = new Set(prev.map((m) => m.fact.trim().toLowerCase()));
        const additions = payload.memories.filter(
          (m) => !existingFacts.has(m.fact.trim().toLowerCase())
        );
        return [...additions, ...prev];
      });
    }
    if (payload.codeMemories.length > 0) {
      setCodeMemories((prev) => {
        const existingHashes = new Set(
          prev.map((c) => `${c.title.trim().toLowerCase()}::${c.code.trim()}`)
        );
        const additions = payload.codeMemories.filter(
          (c) => !existingHashes.has(`${c.title.trim().toLowerCase()}::${c.code.trim()}`)
        );
        return [...additions, ...prev];
      });
    }
  };

  // Active Session object
  const activeSession = sessions.find((s) => s.id === activeSessionId) || null;
  const currentMessages = activeSession ? activeSession.messages : [];

  // Live Token & Context Budget Estimation for the active conversation (reflecting selective memory retrieval)
  const currentTokenEstimate = useMemo(() => {
    let effectiveInstruction = customInstruction;
    if (!systemPersonaId || systemPersonaId === 'auto') {
      const routed = input.trim() ? classifyPersonaIntent(input.trim()) : 'nova';
      effectiveInstruction = PERSONAS[routed]?.instruction || NOVACHAT_DEFAULT_SYSTEM_PROMPT;
    } else if (PERSONAS[systemPersonaId as keyof typeof PERSONAS]) {
      effectiveInstruction = PERSONAS[systemPersonaId as keyof typeof PERSONAS].instruction;
    }

    const selectivePreview = selectRelevantMemories({
      prompt: input,
      memoryEnabled,
      textMemories: userMemories,
      codeMemories,
    });

    return estimateFullRequestTokens({
      model: activeModel,
      systemInstruction: sanitizeInstruction(effectiveInstruction),
      userMemories: selectivePreview.promptStrings,
      messages: currentMessages,
      pendingInput: input,
      pendingAttachments: attachments,
      handoffSummary: activeSession?.handoffSummary,
    });
  }, [
    activeModel,
    customInstruction,
    systemPersonaId,
    memoryEnabled,
    userMemories,
    codeMemories,
    currentMessages,
    input,
    attachments,
    activeSession?.handoffSummary,
  ]);

  const handleDismissTokenWarning = () => {
    if (!activeSessionId) return;
    setSessions((prev) =>
      prev.map((s) => (s.id === activeSessionId ? { ...s, dismissedTokenWarning: true } : s))
    );
  };

  const handleContinueCurrentChat = () => {
    handleDismissTokenWarning();
  };

  const handleOpenHandoffModal = async () => {
    if (!activeSession) return;
    setHandoffModalOpen(true);
    setIsGeneratingHandoff(true);

    const fallbackBrief = buildHandoffSummary(activeSession.messages, activeSession.title);
    setHandoffSummaryText(fallbackBrief);

    try {
      const res = await fetch('/api/summarize-context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: activeSession.messages,
          sessionTitle: activeSession.title,
          model: activeModel,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.summary) {
          setHandoffSummaryText(data.summary);
        }
      }
    } catch (e) {
      console.log('Error calling /api/summarize-context:', e);
    } finally {
      setIsGeneratingHandoff(false);
    }
  };

  const handleConfirmHandoff = (customSummary: string) => {
    if (!activeSession) return;
    const newId = `session-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const newSession: ChatSession = {
      id: newId,
      title: `Continuation: ${activeSession.title.slice(0, 24)}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
      model: activeModel,
      systemInstruction: customInstruction,
      searchGrounding,
      handoffSummary: customSummary,
      parentSessionId: activeSession.id,
      parentSessionTitle: activeSession.title,
    };

    setSessions((prev) => [newSession, ...prev]);
    setActiveSessionId(newId);
    setHandoffModalOpen(false);
    setCurrentView('chat');
  };

  // Navigate to shared Home startup screen cleanly
  const handleNavigateHome = useCallback(() => {
    soundEffects.playSelect();
    if (isStreaming) {
      abortControllerRef.current?.abort();
      setIsStreaming(false);
    }
    // Clear active session selection so Home is in fresh draft mode
    setActiveSessionId(null);
    setCurrentView('home');
  }, [isStreaming]);

  // Start fresh New Chat (navigates to shared startup screen without creating empty session)
  const handleNewChat = useCallback(() => {
    soundEffects.playConfirm();
    if (isStreaming) {
      abortControllerRef.current?.abort();
      setIsStreaming(false);
    }
    // Navigate to shared startup screen, clear active session selection and empty draft
    setActiveSessionId(null);
    setCurrentView('home');
    setInput('');
    setAttachments([]);

    // On mobile, collapse sidebar
    if (window.innerWidth < 768) {
      setSidebarOpen(false);
    }
  }, [isStreaming]);

  // Global keyboard shortcut for ⌘N / Ctrl+N
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        handleNewChat();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleNewChat]);

  // Switch chat session
  const handleSelectSession = (id: string) => {
    if (isStreaming) {
      abortControllerRef.current?.abort();
      setIsStreaming(false);
    }
    setActiveSessionId(id);
    setInput('');
    setAttachments([]);
    setCurrentView('chat');

    if (window.innerWidth < 768) {
      setSidebarOpen(false);
    }
  };

  // Delete chat session
  const handleDeleteSession = (id: string) => {
    setSessions((prev) => {
      const filtered = prev.filter((s) => s.id !== id);
      if (activeSessionId === id) {
        setActiveSessionId(null);
        setCurrentView('home');
      }
      return filtered;
    });
  };

  // Rename chat session
  const handleRenameSession = (id: string, newTitle: string) => {
    setSessions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, title: newTitle, updatedAt: Date.now() } : s))
    );
  };

  // Add attachment
  const handleAddAttachment = (attachment: Attachment) => {
    setAttachments((prev) => [...prev, attachment]);
  };

  // Remove attachment
  const handleRemoveAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  // Stop streaming
  const handleStopStreaming = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
    if (activeSessionId) {
      setSessions((prev) =>
        prev.map((s) => {
          if (s.id !== activeSessionId) return s;
          const updatedMsgs = s.messages.map((m) => {
            if (m.isStreaming) {
              return {
                ...m,
                content: m.content || '*(Generation stopped by user)*',
                isStreaming: false,
                searchStatus: 'done' as const,
              };
            }
            return m;
          });
          return { ...s, messages: updatedMsgs };
        })
      );
    }
  };

  // Send message
  const handleSendMessage = async (customPrompt?: string, customAttachments?: Attachment[]) => {
    const textToSend = typeof customPrompt === 'string' ? customPrompt : input;
    const attsToSend = customAttachments || attachments;
    if (!textToSend.trim() && attsToSend.length === 0) return;
    if (isStreaming) return;

    // Determine target session:
    // If originating from Home screen or draft mode (activeSessionId is null),
    // ALWAYS instantiate a fresh new conversation so it NEVER merges into an old conversation.
    const isNewConversation = currentView === 'home' || !activeSessionId;

    let targetSession: ChatSession;
    let targetSessionId: string;

    if (isNewConversation) {
      const newId = `session-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const cleanTitle = textToSend.slice(0, 36).trim() || 'New Chat';
      targetSession = {
        id: newId,
        title: cleanTitle,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: [],
        model: activeModel,
        systemInstruction: customInstruction,
        searchGrounding,
      };
      targetSessionId = newId;
      setSessions((prev) => [targetSession, ...prev]);
      setActiveSessionId(newId);
    } else {
      const existing = sessions.find((s) => s.id === activeSessionId);
      if (existing) {
        targetSession = existing;
        targetSessionId = existing.id;
      } else {
        const newId = `session-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        targetSession = {
          id: newId,
          title: textToSend.slice(0, 36).trim() || 'New Chat',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          messages: [],
          model: activeModel,
          systemInstruction: customInstruction,
          searchGrounding,
        };
        targetSessionId = newId;
        setSessions((prev) => [targetSession, ...prev]);
        setActiveSessionId(newId);
      }
    }

    setCurrentView('chat');

    const userText = textToSend.trim();
    const hasAttachments = attsToSend.length > 0;
    const finalContent = userText || (hasAttachments ? 'Please inspect and analyze the attached image.' : '');

    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}-u`,
      role: 'user',
      content: finalContent,
      attachments: attsToSend.map((att) => ({
        id: att.id,
        name: att.name,
        type: att.type || 'application/octet-stream',
        base64: att.base64,
        size: att.size,
      })),
      createdAt: Date.now(),
    };

    const aiMessageId = `msg-${Date.now()}-a`;
    const placeholderAiMessage: ChatMessage = {
      id: aiMessageId,
      role: 'assistant',
      content: '',
      createdAt: Date.now(),
      modelUsed: activeModel,
      isStreaming: true,
    };

    const updatedMessages = [...targetSession.messages, userMessage, placeholderAiMessage];

    setSessions((prev) =>
      prev.map((s) =>
        s.id === targetSessionId
          ? {
              ...s,
              messages: updatedMessages,
              updatedAt: Date.now(),
            }
          : s
      )
    );

    // Reset inputs
    setInput('');
    setAttachments([]);
    setIsStreaming(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;
    let accumulatedText = '';

    try {
      const allMessages = [...targetSession.messages, userMessage];

      const historyPayload = allMessages.map((m, idx) => {
        const isCurrentTurn = idx === allMessages.length - 1;
        const hasImages = Array.isArray(m.attachments) && m.attachments.length > 0;

        let content = m.content || '';
        if (!isCurrentTurn && hasImages) {
          const names = m.attachments!.map((a) => a.name).join(', ');
          content = `${content} [Prior attachment: ${names}]`.trim();
        }

        return {
          role: m.role,
          content,
          // Only send full base64 attachment data for the current turn to avoid resending large payloads
          attachments: isCurrentTurn && hasImages
            ? m.attachments!.map((att) => ({
                id: att.id,
                name: att.name,
                type: att.type || 'application/octet-stream',
                base64: att.base64,
              }))
            : undefined,
        };
      });

      // Selective Cross-Chat Memory Retrieval (Text + Code within strict token budget)
      const relevantMemories = selectRelevantMemories({
        prompt: userText,
        memoryEnabled,
        textMemories: userMemories,
        codeMemories,
      });
      const memoryFactsToSend = relevantMemories.promptStrings;

      // Apply Think mode ONLY to this intended request, then immediately reset to OFF
      const requestThinkMode = Boolean(thinkMode);
      if (requestThinkMode) {
        setThinkMode(false);
      }

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: targetSessionId,
          turnId: aiMessageId,
          messages: historyPayload,
          model: activeModel || PRIMARY_DEFAULT_MODEL,
          thinkMode: requestThinkMode,
          systemInstruction: customInstruction,
          customInstruction,
          handoffSummary: targetSession.handoffSummary || '',
          searchGrounding,
          memoryEnabled,
          userMemory: memoryFactsToSend,
          personaId: systemPersonaId,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Server responded with ${res.status}`);
      }

      if (!res.body) {
        throw new Error('ReadableStream not supported by response');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      accumulatedText = '';
      let accumulatedGrounding: GroundingSource[] = [];
      let accumulatedQueries: string[] = [];
      let currentSearchProvider: string | undefined = undefined;
      let currentSearchStatus: 'searching' | 'reading' | 'preparing' | 'done' | undefined = undefined;
      let currentStatusNotice: string | undefined = undefined;
      let currentPersonaUsed: string | undefined = undefined;
      let currentPersonaName: string | undefined = undefined;
      let currentPersonaRole: string | undefined = undefined;
      let currentProviderUsed: 'groq' | 'gemini' | undefined = undefined;
      let currentModelUsed: string | undefined = undefined;
      let currentIsFallback: boolean | undefined = undefined;
      let currentFallbackReason: string | undefined = undefined;
      let currentRequestId: string | undefined = undefined;
      let currentTurnId: string | undefined = aiMessageId;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data: ')) {
            const dataStr = trimmed.slice(6);
            try {
              const parsed = JSON.parse(dataStr);
              const isFinished = !!(parsed.done || parsed.error);

              if (parsed.streamReset) {
                // Discard any partial primary-provider text cleanly before fallback streams
                accumulatedText = '';
              }

              if (parsed.personaUsed) {
                currentPersonaUsed = parsed.personaUsed;
                setActiveRoutedPersonaId(parsed.personaUsed);
              }
              if (parsed.personaName) {
                currentPersonaName = parsed.personaName;
              }
              if (parsed.personaRole) {
                currentPersonaRole = parsed.personaRole;
              }
              if (parsed.providerUsed) {
                currentProviderUsed = parsed.providerUsed;
              }
              if (parsed.modelUsed) {
                currentModelUsed = parsed.modelUsed;
              }
              if (typeof parsed.isFallback === 'boolean') {
                currentIsFallback = parsed.isFallback;
              }
              if (parsed.fallbackReason) {
                currentFallbackReason = parsed.fallbackReason;
              }
              if (parsed.requestId) {
                currentRequestId = parsed.requestId;
              }
              if (parsed.turnId) {
                currentTurnId = parsed.turnId;
              }

              if (parsed.text) {
                accumulatedText += parsed.text;
              } else if (parsed.error) {
                accumulatedText = (accumulatedText ? accumulatedText + '\n\n' : '') + `⚠️ **Error:** ${parsed.error}`;
              }

              if (parsed.groundingChunks && Array.isArray(parsed.groundingChunks)) {
                accumulatedGrounding = parsed.groundingChunks;
              }
              if (parsed.webSearchQueries && Array.isArray(parsed.webSearchQueries)) {
                accumulatedQueries = parsed.webSearchQueries;
              }
              if (parsed.searchProvider) {
                currentSearchProvider = parsed.searchProvider;
              }
              if (parsed.searchStatus) {
                currentSearchStatus = parsed.searchStatus;
              }
              if (parsed.statusNotice) {
                currentStatusNotice = parsed.statusNotice;
              }
              if (isFinished) {
                currentSearchStatus = 'done';
              }

              // Update AI message live (preserving session activeModel preference cleanly)
              setSessions((prev) =>
                prev.map((s) => {
                  if (s.id !== targetSessionId) return s;
                  const msgs = s.messages.map((m) => {
                    if (m.id === aiMessageId) {
                      return {
                        ...m,
                        content: accumulatedText,
                        groundingChunks:
                          accumulatedGrounding.length > 0
                            ? accumulatedGrounding
                            : m.groundingChunks,
                        webSearchQueries:
                          accumulatedQueries.length > 0
                            ? accumulatedQueries
                            : m.webSearchQueries,
                        searchProvider: currentSearchProvider || m.searchProvider,
                        searchStatus: currentSearchStatus || m.searchStatus,
                        statusNotice: currentStatusNotice || m.statusNotice,
                        personaUsed: currentPersonaUsed || m.personaUsed,
                        personaName: currentPersonaName || m.personaName,
                        personaRole: currentPersonaRole || m.personaRole,
                        providerUsed: currentProviderUsed || m.providerUsed,
                        modelUsed: currentModelUsed || m.modelUsed,
                        isFallback: currentIsFallback !== undefined ? currentIsFallback : m.isFallback,
                        fallbackReason: currentFallbackReason || m.fallbackReason,
                        requestId: currentRequestId || m.requestId,
                        turnId: currentTurnId || m.turnId,
                        isAutoMode: systemPersonaId === 'auto',
                        isStreaming: !isFinished,
                      };
                    }
                    return m;
                  });
                  return { ...s, messages: msgs, updatedAt: Date.now() };
                })
              );

              if (isFinished) {
                setIsStreaming(false);
              }
            } catch {
              // Ignore partial JSON chunks
            }
          }
        }
      }

      // Guarantee final state cleanup for the assistant message
      setSessions((prev) =>
        prev.map((s) => {
          if (s.id !== targetSessionId) return s;
          const msgs = s.messages.map((m) => {
            if (m.id === aiMessageId) {
              return {
                ...m,
                content: accumulatedText || m.content || '*(No response received)*',
                isStreaming: false,
                searchStatus: 'done' as const,
              };
            }
            return m;
          });
          return { ...s, messages: msgs, updatedAt: Date.now() };
        })
      );

      // Auto-generate title for first exchange
      if (targetSession.messages.length === 0 && userText && targetSessionId) {
        generateConversationTitle(targetSessionId, userText);
      }
    } catch (err: any) {
      const isAbort = err.name === 'AbortError' || err.message?.includes('aborted');
      if (isAbort) {
        console.log('[ChatStream] Stream aborted by user or timeout');
      } else {
        console.error('[ChatStream] Error:', err);
      }

      // Preserve the user's unsent message and attachments so it remains recoverable upon failure
      if (!accumulatedText.trim() && userText && !isAbort) {
        setInput(userText);
        if (attsToSend.length > 0) {
          setAttachments(attsToSend);
        }
      }

      setSessions((prev) =>
        prev.map((s) => {
          if (s.id !== targetSessionId) return s;
          const msgs = s.messages.map((m) => {
            if (m.id === aiMessageId) {
              const baseContent = accumulatedText || m.content;
              const finalContent = isAbort
                ? (baseContent || '*(Generation stopped by user)*')
                : (baseContent ? baseContent + '\n\n' : '') +
                  (err.message?.startsWith('⚠️')
                    ? err.message
                    : `⚠️ **Error:** ${err.message || 'Failed to complete request. Please try again.'}`);
              return {
                ...m,
                content: finalContent,
                isStreaming: false,
                searchStatus: 'done' as const,
              };
            }
            return m;
          });
          return { ...s, messages: msgs, updatedAt: Date.now() };
        })
      );
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  };

  // Generate conversation title via backend
  const generateConversationTitle = async (sessionId: string, promptText: string) => {
    try {
      const res = await fetch('/api/generate-title', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: promptText }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.title) {
          handleRenameSession(sessionId, data.title);
        }
      }
    } catch (err) {
      console.warn('Failed to generate title:', err);
    }
  };

  // Regenerate last message
  const handleRegenerate = async () => {
    if (!activeSession || activeSession.messages.length < 2 || isStreaming) return;
    const msgs = [...activeSession.messages];
    const lastUserIndex = msgs.map((m) => m.role).lastIndexOf('user');
    if (lastUserIndex === -1) return;

    const lastUserPrompt = msgs[lastUserIndex].content;
    const truncated = msgs.slice(0, lastUserIndex);

    setSessions((prev) =>
      prev.map((s) => (s.id === activeSession.id ? { ...s, messages: truncated } : s))
    );

    setTimeout(() => {
      handleSendMessage(lastUserPrompt);
    }, 50);
  };

  // Clear all chats
  const handleClearAllChats = () => {
    setSessions([]);
    setActiveSessionId(null);
    localStorage.removeItem(STORAGE_KEY_SESSIONS);
    fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessions: [] }),
    }).catch((e) => console.warn(e));
  };

  // Export all chats as JSON
  const handleExportAllChats = () => {
    try {
      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(sessions, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', dataStr);
      downloadAnchor.setAttribute('download', `novachat-export-${new Date().toISOString().slice(0, 10)}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
    } catch (e) {
      console.error('Export failed:', e);
    }
  };

  // Export single conversation
  const handleExportChat = (sessionId: string) => {
    const session = sessions.find((s) => s.id === sessionId);
    if (!session) return;
    let md = `# ${session.title}\n*Created: ${new Date(session.createdAt).toLocaleString()}*\n\n---\n\n`;
    session.messages.forEach((m) => {
      md += `### ${m.role === 'user' ? 'User' : 'NovaChat'}\n\n${m.content}\n\n---\n\n`;
    });
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${session.title.toLowerCase().replace(/[^a-z0-9]/gi, '_')}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  // Persona change
  const handleSelectPersona = (id: string) => {
    setSystemPersonaId(id);
    const persona = AVAILABLE_PERSONAS.find((p) => p.id === id);
    if (persona) {
      setCustomInstruction(persona.instruction);
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#060914] text-zinc-100 font-sans antialiased selection:bg-cyan-500/25 selection:text-cyan-200 relative">
      {/* Real Continuously Animated Ambient Waves in Background */}
      <AmbientWaves enabled={ambientWavesEnabled} />

      {/* Sidebar Component */}
      <Sidebar
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelectSession={handleSelectSession}
        onNewChat={handleNewChat}
        onDeleteSession={handleDeleteSession}
        onRenameSession={handleRenameSession}
        isOpen={sidebarOpen}
        onToggleOpen={() => setSidebarOpen(!sidebarOpen)}
        onOpenSettings={(tab) => {
          setSettingsInitialTab(tab || 'general');
          setSettingsOpen(true);
        }}
        onOpenMusicSettings={() => {
          setSettingsInitialTab('music');
          setSettingsOpen(true);
        }}
        onOpenVoice={() => setIsVoiceOpen(true)}
        currentView={currentView}
        onNavigateHome={handleNavigateHome}
      />

      {/* Main Workspace */}
      <main className="flex-1 flex flex-col h-full min-w-0 bg-transparent relative z-10 transition-all duration-300 ease-in-out">
        {currentView === 'home' ? (
          <HomeScreen
            onSendMessage={(text, atts) => handleSendMessage(text, atts)}
            thinkMode={thinkMode}
            onToggleThinkMode={handleToggleThinkMode}
            activeModel={activeModel}
            onSelectModel={setActiveModel}
            availableModels={AVAILABLE_MODELS}
            searchGrounding={searchGrounding}
            onToggleSearchGrounding={() => setSearchGrounding(!searchGrounding)}
            sidebarOpen={sidebarOpen}
            onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
            onOpenSettings={(tab) => {
              setSettingsInitialTab(tab || 'general');
              setSettingsOpen(true);
            }}
            onOpenVoice={() => setIsVoiceOpen(true)}
          />
        ) : (
          <>
            <ChatArea
              messages={currentMessages}
              isStreaming={isStreaming}
              onSelectPrompt={(prompt) => {
                setInput(prompt);
                handleSendMessage(prompt);
              }}
              onRegenerate={handleRegenerate}
              onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
              sidebarOpen={sidebarOpen}
              activeModel={activeModel}
              searchGrounding={searchGrounding}
              systemPersonaId={systemPersonaId}
              activeRoutedPersonaId={activeRoutedPersonaId}
              onSelectPersona={handleSelectPersona}
              onNewChat={handleNewChat}
              onExportChat={() => activeSessionId && handleExportChat(activeSessionId)}
              onOpenMusicSettings={() => {
                setSettingsInitialTab('music');
                setSettingsOpen(true);
              }}
              onOpenVoice={() => setIsVoiceOpen(true)}
              tokenEstimate={currentTokenEstimate}
              onStartNewChatWithContext={handleOpenHandoffModal}
              onContinueCurrentChat={handleContinueCurrentChat}
              onDismissTokenWarning={handleDismissTokenWarning}
              showTokenWarning={
                !activeSession?.dismissedTokenWarning &&
                (currentTokenEstimate.status === 'high' || currentTokenEstimate.status === 'critical')
              }
              handoffSummary={activeSession?.handoffSummary}
              parentTitle={activeSession?.parentSessionTitle}
              parentSessionId={activeSession?.parentSessionId}
              onNavigateToParent={handleSelectSession}
              onSaveMessageToMemory={handleOpenSaveMessageToMemory}
              onSaveCodeToMemory={handleOpenSaveCodeToMemory}
            />

            {/* Fixed Bottom Input Bar */}
            <InputBar
              input={input}
              setInput={setInput}
              onSendMessage={() => handleSendMessage()}
              isStreaming={isStreaming}
              onStopStreaming={handleStopStreaming}
              attachments={attachments}
              onAddAttachment={handleAddAttachment}
              onRemoveAttachment={handleRemoveAttachment}
              searchGrounding={searchGrounding}
              onToggleSearchGrounding={() => setSearchGrounding(!searchGrounding)}
              thinkMode={thinkMode}
              onToggleThinkMode={handleToggleThinkMode}
              activeModel={activeModel}
              onSelectModel={setActiveModel}
              availableModels={AVAILABLE_MODELS}
              tokenEstimate={currentTokenEstimate}
              onStartNewChatWithContext={handleOpenHandoffModal}
              sidebarOpen={sidebarOpen}
            />
          </>
        )}
      </main>

      {/* Settings Modal */}
      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        initialTab={settingsInitialTab}
        systemPersonaId={systemPersonaId}
        onSelectPersona={handleSelectPersona}
        customInstruction={customInstruction}
        onSaveCustomInstruction={setCustomInstruction}
        defaultModel={activeModel}
        onSelectDefaultModel={setActiveModel}
        defaultSearchGrounding={searchGrounding}
        onToggleDefaultSearchGrounding={setSearchGrounding}
        onClearAllChats={handleClearAllChats}
        onExportAllChats={handleExportAllChats}
        onOpenImportChats={() => setImportChatsOpen(true)}
        totalChatsCount={sessions.length}
        userMemories={userMemories}
        codeMemories={codeMemories}
        onAddMemory={handleAddMemory}
        onToggleTextMemoryEnabled={handleToggleTextMemoryEnabled}
        onToggleTextMemoryPinned={handleToggleTextMemoryPinned}
        onRemoveMemory={handleRemoveMemory}
        onClearMemories={handleClearMemories}
        onToggleCodeMemoryEnabled={handleToggleCodeMemoryEnabled}
        onToggleCodeMemoryPinned={handleToggleCodeMemoryPinned}
        onRemoveCodeMemory={handleRemoveCodeMemory}
        onClearCodeMemories={handleClearCodeMemories}
        onOpenSaveMemoryModal={(initial) =>
          setSaveMemoryModal({ isOpen: true, initialData: initial })
        }
        onExportMemories={handleExportMemories}
        onImportMemories={handleImportMemories}
        memoryEnabled={memoryEnabled}
        onToggleMemoryEnabled={setMemoryEnabled}
        ambientWavesEnabled={ambientWavesEnabled}
        onToggleAmbientWaves={handleToggleAmbientWaves}
        selectedVoice={selectedVoice}
        onSelectVoice={handleSelectVoice}
      />

      {/* Universal Chat Import Modal */}
      <ImportChatsModal
        isOpen={importChatsOpen}
        onClose={() => setImportChatsOpen(false)}
        existingSessions={sessions}
        defaultModel={activeModel}
        defaultSystemInstruction={customInstruction}
        onImportSessions={(imported) => handleImportSessions(imported)}
      />

      {/* Save to Memory Vault Modal */}
      <SaveToMemoryModal
        isOpen={saveMemoryModal.isOpen}
        initialData={saveMemoryModal.initialData}
        onClose={() => setSaveMemoryModal({ isOpen: false, initialData: null })}
        onSaveTextMemory={handleSaveTextMemoryModal}
        onSaveCodeMemory={handleSaveCodeMemoryModal}
      />

      {/* Context Continuation Modal */}
      <ContextHandoffModal
        isOpen={handoffModalOpen}
        onClose={() => setHandoffModalOpen(false)}
        originalTitle={activeSession?.title || 'Current Chat'}
        originalMessagesCount={currentMessages.length}
        initialSummary={handoffSummaryText}
        isGeneratingSummary={isGeneratingHandoff}
        onConfirmHandoff={handleConfirmHandoff}
        onStartBlankChat={() => {
          setHandoffModalOpen(false);
          handleNewChat();
        }}
      />

      {/* Gemini Live Real-Time Voice Conversation */}
      <NovaLiveVoice
        isOpen={isVoiceOpen}
        onClose={() => setIsVoiceOpen(false)}
        onSaveTranscript={handleSaveVoiceTranscript}
        selectedVoiceId={selectedVoice}
        onSelectVoiceId={handleSelectVoice}
      />
    </div>
  );
}

export default function App() {
  return (
    <BackgroundMusicProvider>
      <AppContent />
    </BackgroundMusicProvider>
  );
}
