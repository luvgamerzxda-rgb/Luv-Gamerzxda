import React, { useState, useMemo } from 'react';
import hljs from 'highlight.js';
import {
  Brain,
  Code2,
  Plus,
  Search,
  Pin,
  Trash2,
  Edit3,
  Copy,
  Check,
  History,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  CodeMemoryItem,
  MemoryAuditLogEntry,
  MemoryCorrection,
  TextMemoryCategory,
  UserMemoryItem,
} from '../types';
import { CODE_MEMORY_LANGUAGES, TEXT_MEMORY_CATEGORIES } from '../services/memoryService';
import { SaveToMemoryInitialData } from './SaveToMemoryModal';
import { soundEffects } from '../services/soundEffects';

interface MemoryVaultPanelProps {
  memoryEnabled: boolean;
  onToggleMemoryEnabled: (enabled: boolean) => void;
  userMemories: UserMemoryItem[];
  codeMemories: CodeMemoryItem[];
  onToggleTextEnabled: (id: string) => void;
  onToggleTextPinned: (id: string) => void;
  onRemoveMemory: (id: string) => void;
  onClearMemories: () => void;
  onToggleCodeEnabled: (id: string) => void;
  onToggleCodePinned: (id: string) => void;
  onRemoveCodeMemory: (id: string) => void;
  onClearCodeMemories: () => void;
  onOpenSaveMemoryModal: (initial: SaveToMemoryInitialData) => void;
  corrections: MemoryCorrection[];
  auditLogs: MemoryAuditLogEntry[];
  actionLoadingId: string | null;
  onApproveCorrection: (id: string) => void;
  onRejectCorrection: (id: string) => void;
  onProposeCorrection: (payload: {
    memory_key: string;
    original_value: string;
    proposed_value: string;
    evidence: string;
  }) => Promise<boolean>;
}

function renderStaticHighlightedCode(code: string, language: string): string {
  const cleanLang = (language || '').toLowerCase().split(/[\s/]+/)[0];
  try {
    if (cleanLang && hljs.getLanguage(cleanLang)) {
      return hljs.highlight(code, { language: cleanLang, ignoreIllegals: true }).value;
    }
    return hljs.highlightAuto(code).value;
  } catch {
    return code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}

export const MemoryVaultPanel: React.FC<MemoryVaultPanelProps> = ({
  memoryEnabled,
  onToggleMemoryEnabled,
  userMemories,
  codeMemories,
  onToggleTextEnabled,
  onToggleTextPinned,
  onRemoveMemory,
  onClearMemories,
  onToggleCodeEnabled,
  onToggleCodePinned,
  onRemoveCodeMemory,
  onClearCodeMemories,
  onOpenSaveMemoryModal,
  corrections,
  auditLogs,
  actionLoadingId,
  onApproveCorrection,
  onRejectCorrection,
  onProposeCorrection,
}) => {
  const [subTab, setSubTab] = useState<'text' | 'code' | 'audit'>('text');

  // Text filters
  const [textQuery, setTextQuery] = useState('');
  const [textCategoryFilter, setTextCategoryFilter] = useState<string>('all');
  const [confirmClearText, setConfirmClearText] = useState(false);

  // Code filters
  const [codeQuery, setCodeQuery] = useState('');
  const [codeLangFilter, setCodeLangFilter] = useState<string>('all');
  const [codeProjectFilter, setCodeProjectFilter] = useState<string>('all');
  const [expandedCodeIds, setExpandedCodeIds] = useState<Set<string>>(new Set());
  const [copiedCodeId, setCopiedCodeId] = useState<string | null>(null);
  const [confirmClearCode, setConfirmClearCode] = useState(false);

  // Corrections & Audit local UI
  const [proposingCorrection, setProposingCorrection] = useState(false);
  const [correctionKey, setCorrectionKey] = useState('');
  const [correctionOrig, setCorrectionOrig] = useState('');
  const [correctionProp, setCorrectionProp] = useState('');
  const [correctionEvidence, setCorrectionEvidence] = useState('');

  const filteredTextMemories = useMemo(() => {
    const q = textQuery.trim().toLowerCase();
    return [...userMemories]
      .filter((m) => {
        if (textCategoryFilter !== 'all' && (m.category || 'general') !== textCategoryFilter) {
          return false;
        }
        if (!q) return true;
        const hay = `${m.fact} ${m.category || ''} ${(m.tags || []).join(' ')}`.toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt));
  }, [userMemories, textQuery, textCategoryFilter]);

  const availableProjects = useMemo(() => {
    const set = new Set<string>();
    codeMemories.forEach((c) => {
      if (c.projectName && c.projectName.trim()) set.add(c.projectName.trim());
    });
    return Array.from(set).sort();
  }, [codeMemories]);

  const filteredCodeMemories = useMemo(() => {
    const q = codeQuery.trim().toLowerCase();
    return [...codeMemories]
      .filter((c) => {
        if (codeLangFilter !== 'all' && c.language !== codeLangFilter) return false;
        if (codeProjectFilter !== 'all' && (c.projectName || '') !== codeProjectFilter) return false;
        if (!q) return true;
        const hay = `${c.title} ${c.language} ${c.projectName || ''} ${c.description || ''} ${c.tags.join(' ')} ${c.code}`.toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || b.updatedAt - a.updatedAt);
  }, [codeMemories, codeQuery, codeLangFilter, codeProjectFilter]);

  const toggleCodeExpand = (id: string) => {
    setExpandedCodeIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCopyCode = async (id: string, code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCodeId(id);
      setTimeout(() => setCopiedCodeId(null), 1800);
    } catch {}
  };

  const handleProposeForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!correctionKey.trim() || !correctionOrig.trim() || !correctionProp.trim() || !correctionEvidence.trim()) {
      return;
    }
    const ok = await onProposeCorrection({
      memory_key: correctionKey.trim(),
      original_value: correctionOrig.trim(),
      proposed_value: correctionProp.trim(),
      evidence: correctionEvidence.trim(),
    });
    if (ok) {
      setCorrectionKey('');
      setCorrectionOrig('');
      setCorrectionProp('');
      setCorrectionEvidence('');
      setProposingCorrection(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Master Toggle */}
      <div className="p-4 rounded-2xl bg-[#0a112c]/80 border border-[#1c2c5c] flex items-center justify-between gap-4">
        <div>
          <div className="font-semibold text-white text-xs flex items-center gap-2">
            <Brain className="w-4 h-4 text-cyan-400" />
            <span>Memory Vault AI Retrieval</span>
          </div>
          <div className="text-[11px] text-zinc-400 mt-0.5">
            Selectively inject only relevant enabled Text & Code memories into conversations within strict token budgets.
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={memoryEnabled}
          onClick={() => {
            soundEffects.playToggle(!memoryEnabled);
            onToggleMemoryEnabled(!memoryEnabled);
          }}
          className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer focus:outline-none shrink-0 ${
            memoryEnabled ? 'bg-cyan-500' : 'bg-[#1a2858]'
          }`}
        >
          <span
            className={`block w-5 h-5 rounded-full bg-white transition-transform shadow-md ${
              memoryEnabled ? 'translate-x-6' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>

      {/* Sub-tabs */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="inline-flex p-1 rounded-xl bg-[#070c1e] border border-[#1a2858] gap-1">
          <button
            type="button"
            onClick={() => {
              soundEffects.playSelect();
              setSubTab('text');
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              subTab === 'text'
                ? 'bg-blue-600/30 text-cyan-300 border border-cyan-500/40'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Brain className="w-3.5 h-3.5" />
            <span>Text Memory</span>
            <span className="font-mono text-[10px] text-cyan-300 tabular-nums">({userMemories.length})</span>
          </button>

          <button
            type="button"
            onClick={() => {
              soundEffects.playSelect();
              setSubTab('code');
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              subTab === 'code'
                ? 'bg-blue-600/30 text-cyan-300 border border-cyan-500/40'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            <span>Code Memory</span>
            <span className="font-mono text-[10px] text-purple-300 tabular-nums">({codeMemories.length})</span>
          </button>

          <button
            type="button"
            onClick={() => {
              soundEffects.playSelect();
              setSubTab('audit');
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              subTab === 'audit'
                ? 'bg-blue-600/30 text-cyan-300 border border-cyan-500/40'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Corrections & Audit</span>
            {corrections.filter((c) => c.status === 'pending').length > 0 && (
              <span className="font-mono text-[10px] text-amber-300 tabular-nums">
                ({corrections.filter((c) => c.status === 'pending').length})
              </span>
            )}
          </button>
        </div>

        {subTab !== 'audit' && (
          <button
            type="button"
            onClick={() => {
              soundEffects.playClick();
              onOpenSaveMemoryModal({
                mode: subTab === 'code' ? 'code' : 'text',
              });
            }}
            className="px-3.5 py-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs cursor-pointer transition-colors flex items-center gap-1.5 whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>{subTab === 'code' ? 'Add Code Snippet' : 'Add Text Memory'}</span>
          </button>
        )}
      </div>

      {/* SUB-TAB 1: TEXT MEMORY */}
      {subTab === 'text' && (
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={textQuery}
                onChange={(e) => setTextQuery(e.target.value)}
                placeholder="Search facts, preferences, projects, or tags..."
                className="w-full pl-9 pr-3 py-2 text-xs bg-[#070c1e] border border-[#1c2c5c] rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-400"
              />
            </div>
            <select
              value={textCategoryFilter}
              onChange={(e) => setTextCategoryFilter(e.target.value)}
              className="px-3 py-2 text-xs bg-[#070c1e] border border-[#1c2c5c] rounded-xl text-zinc-200 focus:outline-none focus:border-cyan-400"
            >
              <option value="all">All Categories</option>
              {TEXT_MEMORY_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-between text-[11px] text-zinc-400 px-0.5">
            <span>
              Showing <span className="text-zinc-200 font-mono tabular-nums">{filteredTextMemories.length}</span> of{' '}
              <span className="text-zinc-200 font-mono tabular-nums">{userMemories.length}</span> text memories
            </span>
            {userMemories.length > 0 && !confirmClearText && (
              <button
                type="button"
                onClick={() => setConfirmClearText(true)}
                className="text-red-400 hover:underline cursor-pointer"
              >
                Clear All Text
              </button>
            )}
          </div>

          {confirmClearText && (
            <div className="p-3 rounded-xl bg-red-500/15 border border-red-500/40 text-red-200 text-xs flex items-center justify-between gap-2">
              <span>Delete all stored text memories?</span>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    onClearMemories();
                    setConfirmClearText(false);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-red-600 text-white font-semibold cursor-pointer"
                >
                  Confirm
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClearText(false)}
                  className="px-2.5 py-1 rounded-lg bg-[#14204d] text-zinc-300 cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {filteredTextMemories.length === 0 ? (
            <div className="p-6 text-center rounded-2xl bg-[#070c1e] border border-[#16234d] text-zinc-500 text-xs">
              {userMemories.length === 0
                ? 'No text memories saved yet. Add facts manually or click Save on any chat message.'
                : 'No text memories match your search/filter.'}
            </div>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {filteredTextMemories.map((mem) => {
                const isEnabled = mem.enabled !== false;
                return (
                  <div
                    key={mem.id}
                    className={`p-3 rounded-xl border transition-colors space-y-2 ${
                      mem.pinned
                        ? 'bg-[#0b1538] border-cyan-500/40'
                        : 'bg-[#070c1e] border-[#172654]'
                    } ${!isEnabled ? 'opacity-55' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-xs text-zinc-100 leading-relaxed flex-1 break-words">
                        {mem.fact}
                      </p>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => onToggleTextPinned(mem.id)}
                          title={mem.pinned ? 'Unpin memory' : 'Pin priority memory'}
                          className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                            mem.pinned
                              ? 'text-cyan-400 bg-cyan-500/15'
                              : 'text-zinc-500 hover:text-cyan-300 hover:bg-[#111f4d]'
                          }`}
                        >
                          <Pin className={`w-3.5 h-3.5 ${mem.pinned ? 'fill-current' : ''}`} />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            onOpenSaveMemoryModal({
                              mode: 'text',
                              fact: mem.fact,
                              category: (mem.category || 'general') as TextMemoryCategory,
                              tags: mem.tags || [],
                              pinned: Boolean(mem.pinned),
                              editingTextId: mem.id,
                            })
                          }
                          title="Edit memory"
                          className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-[#111f4d] transition-colors cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={isEnabled}
                          onClick={() => onToggleTextEnabled(mem.id)}
                          title={isEnabled ? 'Disable this memory' : 'Enable this memory'}
                          className={`w-8 h-4 rounded-full transition-colors relative cursor-pointer mx-0.5 ${
                            isEnabled ? 'bg-cyan-500' : 'bg-[#1a2858]'
                          }`}
                        >
                          <span
                            className={`block w-3 h-3 rounded-full bg-white transition-transform ${
                              isEnabled ? 'translate-x-4' : 'translate-x-0.5'
                            }`}
                          />
                        </button>
                        <button
                          type="button"
                          onClick={() => onRemoveMemory(mem.id)}
                          title="Delete memory"
                          className="p-1.5 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-[#111f4d] transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 text-[10px] text-zinc-400">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="capitalize font-medium text-cyan-300">
                          {mem.category || 'general'}
                        </span>
                        {mem.tags && mem.tags.length > 0 && (
                          <>
                            <span className="text-zinc-600">·</span>
                            <span className="text-zinc-300 font-mono">
                              {mem.tags.map((t) => `#${t}`).join(' ')}
                            </span>
                          </>
                        )}
                      </div>
                      <span className="font-mono tabular-nums text-zinc-500 shrink-0">
                        {new Date(mem.updatedAt || mem.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB 2: CODE MEMORY */}
      {subTab === 'code' && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
            <div className="relative sm:col-span-2">
              <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={codeQuery}
                onChange={(e) => setCodeQuery(e.target.value)}
                placeholder="Search title, project, tags, or code..."
                className="w-full pl-9 pr-3 py-2 text-xs bg-[#070c1e] border border-[#1c2c5c] rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-400"
              />
            </div>
            <select
              value={codeLangFilter}
              onChange={(e) => setCodeLangFilter(e.target.value)}
              className="px-3 py-2 text-xs bg-[#070c1e] border border-[#1c2c5c] rounded-xl text-zinc-200 focus:outline-none focus:border-cyan-400"
            >
              <option value="all">All Languages</option>
              {CODE_MEMORY_LANGUAGES.map((lang) => (
                <option key={lang} value={lang}>
                  {lang}
                </option>
              ))}
            </select>
            <select
              value={codeProjectFilter}
              onChange={(e) => setCodeProjectFilter(e.target.value)}
              className="px-3 py-2 text-xs bg-[#070c1e] border border-[#1c2c5c] rounded-xl text-zinc-200 focus:outline-none focus:border-cyan-400"
            >
              <option value="all">All Projects</option>
              {availableProjects.map((proj) => (
                <option key={proj} value={proj}>
                  {proj}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-between text-[11px] text-zinc-400 px-0.5">
            <span>
              Showing <span className="text-zinc-200 font-mono tabular-nums">{filteredCodeMemories.length}</span> of{' '}
              <span className="text-zinc-200 font-mono tabular-nums">{codeMemories.length}</span> code memories · Non-executable static vault
            </span>
            {codeMemories.length > 0 && !confirmClearCode && (
              <button
                type="button"
                onClick={() => setConfirmClearCode(true)}
                className="text-red-400 hover:underline cursor-pointer"
              >
                Clear All Code
              </button>
            )}
          </div>

          {confirmClearCode && (
            <div className="p-3 rounded-xl bg-red-500/15 border border-red-500/40 text-red-200 text-xs flex items-center justify-between gap-2">
              <span>Delete all saved code memories?</span>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    onClearCodeMemories();
                    setConfirmClearCode(false);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-red-600 text-white font-semibold cursor-pointer"
                >
                  Confirm
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClearCode(false)}
                  className="px-2.5 py-1 rounded-lg bg-[#14204d] text-zinc-300 cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {filteredCodeMemories.length === 0 ? (
            <div className="p-6 text-center rounded-2xl bg-[#070c1e] border border-[#16234d] text-zinc-500 text-xs">
              {codeMemories.length === 0
                ? 'No code snippets saved yet. Click "Save to Memory" on any code block in chat or add a snippet above.'
                : 'No saved code snippets match your filters.'}
            </div>
          ) : (
            <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
              {filteredCodeMemories.map((item) => {
                const isExpanded = expandedCodeIds.has(item.id);
                const isCopied = copiedCodeId === item.id;
                const previewHtml = isExpanded
                  ? renderStaticHighlightedCode(item.code, item.language)
                  : renderStaticHighlightedCode(
                      item.code.split('\n').slice(0, 6).join('\n'),
                      item.language
                    );

                return (
                  <div
                    key={item.id}
                    className={`rounded-2xl border overflow-hidden transition-colors ${
                      item.pinned
                        ? 'bg-[#0b1538] border-cyan-500/40'
                        : 'bg-[#070c1e] border-[#172654]'
                    } ${!item.enabled ? 'opacity-55' : ''}`}
                  >
                    {/* Header */}
                    <div className="p-3 flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-white truncate">{item.title}</span>
                          <span className="text-[10px] font-mono text-purple-300">
                            {item.language}
                          </span>
                          {item.projectName && (
                            <span className="text-[10px] text-cyan-300">
                              · {item.projectName}
                            </span>
                          )}
                        </div>
                        {item.description && (
                          <p className="text-[11px] text-zinc-400 mt-0.5 line-clamp-2">
                            {item.description}
                          </p>
                        )}
                        <div className="flex items-center gap-2 mt-1 text-[10px] text-zinc-500 font-mono tabular-nums">
                          <span>Updated {new Date(item.updatedAt).toLocaleDateString()}</span>
                          {item.tags.length > 0 && (
                            <>
                              <span>·</span>
                              <span className="text-zinc-300">
                                {item.tags.map((t) => `#${t}`).join(' ')}
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleCopyCode(item.id, item.code)}
                          title="Copy code"
                          className="p-1.5 rounded-lg text-zinc-400 hover:text-cyan-300 hover:bg-[#111f4d] transition-colors cursor-pointer"
                        >
                          {isCopied ? <Check className="w-3.5 h-3.5 text-cyan-400" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => onToggleCodePinned(item.id)}
                          title={item.pinned ? 'Unpin' : 'Pin priority'}
                          className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                            item.pinned
                              ? 'text-cyan-400 bg-cyan-500/15'
                              : 'text-zinc-500 hover:text-cyan-300 hover:bg-[#111f4d]'
                          }`}
                        >
                          <Pin className={`w-3.5 h-3.5 ${item.pinned ? 'fill-current' : ''}`} />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            onOpenSaveMemoryModal({
                              mode: 'code',
                              title: item.title,
                              language: item.language,
                              projectName: item.projectName || '',
                              description: item.description || '',
                              tags: item.tags,
                              code: item.code,
                              pinned: item.pinned,
                              editingCodeId: item.id,
                            })
                          }
                          title="Edit snippet"
                          className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-[#111f4d] transition-colors cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={item.enabled}
                          onClick={() => onToggleCodeEnabled(item.id)}
                          title={item.enabled ? 'Disable snippet' : 'Enable snippet'}
                          className={`w-8 h-4 rounded-full transition-colors relative cursor-pointer mx-0.5 ${
                            item.enabled ? 'bg-cyan-500' : 'bg-[#1a2858]'
                          }`}
                        >
                          <span
                            className={`block w-3 h-3 rounded-full bg-white transition-transform ${
                              item.enabled ? 'translate-x-4' : 'translate-x-0.5'
                            }`}
                          />
                        </button>
                        <button
                          type="button"
                          onClick={() => onRemoveCodeMemory(item.id)}
                          title="Delete snippet"
                          className="p-1.5 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-[#111f4d] transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Static Syntax Highlighted Preview */}
                    <div className="border-t border-[#16234d] bg-[#050814] px-3 py-2">
                      <pre className="m-0 p-0 overflow-x-auto text-[11px] font-mono leading-relaxed">
                        <code
                          className="hljs"
                          dangerouslySetInnerHTML={{ __html: previewHtml }}
                        />
                      </pre>
                      {item.code.split('\n').length > 6 && (
                        <button
                          type="button"
                          onClick={() => toggleCodeExpand(item.id)}
                          className="mt-1.5 text-[10px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1 cursor-pointer"
                        >
                          {isExpanded ? (
                            <>
                              <ChevronUp className="w-3 h-3" />
                              <span>Collapse code</span>
                            </>
                          ) : (
                            <>
                              <ChevronDown className="w-3 h-3" />
                              <span>Show all {item.code.split('\n').length} lines</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB 3: CORRECTIONS & AUDIT LOG (Existing SQLite Workflow) */}
      {subTab === 'audit' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 text-cyan-400" />
              <span>Corrections Workflow ({corrections.length})</span>
            </div>
            <button
              type="button"
              onClick={() => setProposingCorrection(!proposingCorrection)}
              className="px-3 py-1 rounded-xl bg-[#111f4d] hover:bg-[#1a2e73] text-cyan-300 border border-cyan-500/30 text-[11px] font-semibold cursor-pointer"
            >
              {proposingCorrection ? 'Cancel' : '+ Propose Correction'}
            </button>
          </div>

          {proposingCorrection && (
            <form
              onSubmit={handleProposeForm}
              className="p-4 rounded-2xl bg-[#0a112c]/90 border border-[#1e2f66] space-y-2.5 text-xs"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <input
                  type="text"
                  value={correctionKey}
                  onChange={(e) => setCorrectionKey(e.target.value)}
                  placeholder="Memory Key (e.g., user.location)"
                  className="px-3 py-2 rounded-xl bg-[#070c1e] border border-[#1c2c5c] text-white"
                  required
                />
                <input
                  type="text"
                  value={correctionEvidence}
                  onChange={(e) => setCorrectionEvidence(e.target.value)}
                  placeholder="Evidence / Reason"
                  className="px-3 py-2 rounded-xl bg-[#070c1e] border border-[#1c2c5c] text-white"
                  required
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <input
                  type="text"
                  value={correctionOrig}
                  onChange={(e) => setCorrectionOrig(e.target.value)}
                  placeholder="Original Fact"
                  className="px-3 py-2 rounded-xl bg-[#070c1e] border border-[#1c2c5c] text-white"
                  required
                />
                <input
                  type="text"
                  value={correctionProp}
                  onChange={(e) => setCorrectionProp(e.target.value)}
                  placeholder="Proposed Correction"
                  className="px-3 py-2 rounded-xl bg-[#070c1e] border border-[#1c2c5c] text-white"
                  required
                />
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  className="px-3.5 py-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold cursor-pointer"
                >
                  Submit Proposal
                </button>
              </div>
            </form>
          )}

          {corrections.length === 0 ? (
            <div className="p-4 text-center rounded-xl bg-[#070c1e] border border-[#16234d] text-zinc-500 text-xs">
              No pending or past memory corrections recorded.
            </div>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {corrections.map((c) => (
                <div
                  key={c.id}
                  className="p-3 rounded-xl bg-[#070c1e] border border-[#172654] space-y-1.5 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-cyan-300 font-semibold">{c.memory_key}</span>
                    <span
                      className={`text-[10px] uppercase font-mono font-semibold ${
                        c.status === 'approved'
                          ? 'text-cyan-400'
                          : c.status === 'rejected'
                          ? 'text-red-400'
                          : 'text-amber-300'
                      }`}
                    >
                      {c.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-zinc-300 flex-wrap">
                    <span className="line-through text-zinc-500">{c.original_value}</span>
                    <ArrowRight className="w-3 h-3 text-cyan-400" />
                    <span className="text-white font-medium">{c.proposed_value}</span>
                  </div>
                  <div className="text-[10px] text-zinc-400">Evidence: {c.evidence}</div>
                  {c.status === 'pending' && (
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        disabled={actionLoadingId === c.id}
                        onClick={() => onApproveCorrection(c.id)}
                        className="px-2.5 py-1 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 text-[11px] font-semibold cursor-pointer flex items-center gap-1"
                      >
                        <CheckCircle2 className="w-3 h-3" />
                        <span>Approve</span>
                      </button>
                      <button
                        type="button"
                        disabled={actionLoadingId === c.id}
                        onClick={() => onRejectCorrection(c.id)}
                        className="px-2.5 py-1 rounded-lg bg-red-500/15 hover:bg-red-500/25 text-red-300 border border-red-500/30 text-[11px] font-semibold cursor-pointer"
                      >
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Audit Trail */}
          <div className="space-y-2 pt-2 border-t border-[#182859]">
            <div className="text-xs font-semibold text-zinc-200">
              Memory Audit Log ({auditLogs.length})
            </div>
            {auditLogs.length === 0 ? (
              <div className="p-3 text-center rounded-xl bg-[#070c1e] border border-[#16234d] text-zinc-500 text-xs">
                No audit entries yet.
              </div>
            ) : (
              <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
                {auditLogs.slice(0, 20).map((log) => (
                  <div
                    key={log.id}
                    className="px-3 py-2 rounded-xl bg-[#070c1e] border border-[#16234d] flex items-center justify-between gap-2 text-[11px]"
                  >
                    <div className="truncate">
                      <span className="font-mono text-cyan-300 uppercase">{log.action}</span>{' '}
                      <span className="text-zinc-400">by {log.actor}</span>{' '}
                      <span className="text-zinc-300">· {log.details}</span>
                    </div>
                    <span className="text-[10px] font-mono text-zinc-500 shrink-0 tabular-nums">
                      {new Date(log.created_at).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
