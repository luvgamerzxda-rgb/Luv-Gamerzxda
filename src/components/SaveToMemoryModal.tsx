import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Brain,
  Code2,
  Pin,
  ShieldAlert,
  Check,
  Tag,
} from 'lucide-react';
import { CodeMemoryItem, TextMemoryCategory, UserMemoryItem } from '../types';
import {
  CODE_MEMORY_LANGUAGES,
  TEXT_MEMORY_CATEGORIES,
  detectSensitiveCredentials,
  normalizeFenceLanguageToCodeMemoryLanguage,
} from '../services/memoryService';
import { soundEffects } from '../services/soundEffects';

export interface SaveToMemoryInitialData {
  mode: 'text' | 'code';
  fact?: string;
  category?: TextMemoryCategory;
  title?: string;
  language?: string;
  projectName?: string;
  description?: string;
  code?: string;
  tags?: string[];
  pinned?: boolean;
  editingTextId?: string;
  editingCodeId?: string;
}

interface SaveToMemoryModalProps {
  isOpen: boolean;
  initialData: SaveToMemoryInitialData | null;
  onClose: () => void;
  onSaveTextMemory: (
    data: {
      fact: string;
      category: TextMemoryCategory;
      tags: string[];
      pinned: boolean;
    },
    editingId?: string
  ) => void;
  onSaveCodeMemory: (
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
  ) => void;
}

export const SaveToMemoryModal: React.FC<SaveToMemoryModalProps> = ({
  isOpen,
  initialData,
  onClose,
  onSaveTextMemory,
  onSaveCodeMemory,
}) => {
  const [mode, setMode] = useState<'text' | 'code'>('text');

  // Text Memory state
  const [fact, setFact] = useState('');
  const [category, setCategory] = useState<TextMemoryCategory>('general');

  // Code Memory state
  const [title, setTitle] = useState('');
  const [language, setLanguage] = useState<string>('TypeScript');
  const [projectName, setProjectName] = useState('');
  const [description, setDescription] = useState('');
  const [code, setCode] = useState('');

  // Shared state
  const [tagsInput, setTagsInput] = useState('');
  const [pinned, setPinned] = useState(false);
  const [confirmSecretSave, setConfirmSecretSave] = useState(false);

  useEffect(() => {
    if (!isOpen || !initialData) return;
    setMode(initialData.mode || 'text');
    setFact(initialData.fact || '');
    setCategory(initialData.category || 'general');
    setTitle(initialData.title || '');
    setLanguage(
      initialData.language
        ? CODE_MEMORY_LANGUAGES.includes(initialData.language as any)
          ? initialData.language
          : normalizeFenceLanguageToCodeMemoryLanguage(initialData.language)
        : 'TypeScript'
    );
    setProjectName(initialData.projectName || '');
    setDescription(initialData.description || '');
    setCode(initialData.code || '');
    setTagsInput((initialData.tags || []).join(', '));
    setPinned(Boolean(initialData.pinned));
    setConfirmSecretSave(false);
  }, [isOpen, initialData]);

  const secretScan = useMemo(() => {
    if (mode === 'code') return detectSensitiveCredentials(code);
    return detectSensitiveCredentials(fact);
  }, [mode, code, fact]);

  if (!isOpen || !initialData) return null;

  const parsedTags = tagsInput
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 12);

  const canSubmit =
    (mode === 'text' ? fact.trim().length > 0 : title.trim().length > 0 && code.trim().length > 0) &&
    (!secretScan.hasSecrets || confirmSecretSave);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    soundEffects.playConfirm?.();
    if (mode === 'text') {
      onSaveTextMemory(
        {
          fact: fact.trim(),
          category,
          tags: parsedTags,
          pinned,
        },
        initialData.editingTextId
      );
    } else {
      onSaveCodeMemory(
        {
          title: title.trim(),
          language,
          projectName: projectName.trim(),
          description: description.trim(),
          tags: parsedTags,
          code,
          pinned,
        },
        initialData.editingCodeId
      );
    }
    onClose();
  };

  const isEditing = Boolean(initialData.editingTextId || initialData.editingCodeId);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl max-h-[88vh] rounded-3xl bg-[#090f26]/95 border border-[#1e2f66] shadow-2xl flex flex-col overflow-hidden text-zinc-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#162552] bg-[#070c1e]/90 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              {mode === 'code' ? <Code2 className="w-4 h-4" /> : <Brain className="w-4 h-4" />}
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">
                {isEditing ? 'Edit Memory Entry' : 'Save to Memory Vault'}
              </h3>
              <p className="text-[11px] text-zinc-400">
                Explicitly store facts or reusable snippets for relevant cross-chat retrieval.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-[#14204d] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4 text-xs">
          {/* Mode Switch (disabled when editing existing item) */}
          {!isEditing && (
            <div className="inline-flex p-1 rounded-xl bg-[#070c1e] border border-[#1a2858] gap-1">
              <button
                type="button"
                onClick={() => setMode('text')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-colors flex items-center gap-1.5 cursor-pointer ${
                  mode === 'text'
                    ? 'bg-blue-600/30 text-cyan-300 border border-cyan-500/40'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Brain className="w-3.5 h-3.5" />
                <span>Text Memory</span>
              </button>
              <button
                type="button"
                onClick={() => setMode('code')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-colors flex items-center gap-1.5 cursor-pointer ${
                  mode === 'code'
                    ? 'bg-blue-600/30 text-cyan-300 border border-cyan-500/40'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Code2 className="w-3.5 h-3.5" />
                <span>Code Memory</span>
              </button>
            </div>
          )}

          {mode === 'text' ? (
            <>
              <div>
                <label className="block text-xs font-semibold text-zinc-200 mb-1.5">
                  Memory Content
                </label>
                <textarea
                  rows={4}
                  value={fact}
                  onChange={(e) => setFact(e.target.value)}
                  placeholder="Enter a clear, concise fact, preference, decision, or instruction..."
                  className="w-full p-3 rounded-xl bg-[#070c1e] border border-[#1c2c5c] text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-cyan-400"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-200 mb-1.5">Category</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  {TEXT_MEMORY_CATEGORIES.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setCategory(cat.id)}
                      className={`px-2.5 py-1.5 rounded-xl border text-[11px] font-medium cursor-pointer transition-colors ${
                        category === cat.id
                          ? 'bg-blue-600/25 border-cyan-400/50 text-cyan-200'
                          : 'bg-[#070c1e] border-[#1c2c5c] text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-200 mb-1.5">Title</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g., Auth Middleware Pattern"
                    className="w-full px-3 py-2 rounded-xl bg-[#070c1e] border border-[#1c2c5c] text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-cyan-400"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-200 mb-1.5">Language</label>
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#070c1e] border border-[#1c2c5c] text-zinc-100 focus:outline-none focus:border-cyan-400"
                  >
                    {CODE_MEMORY_LANGUAGES.map((lang) => (
                      <option key={lang} value={lang}>
                        {lang}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-200 mb-1.5">
                    Project Name <span className="text-zinc-500 font-normal">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    placeholder="e.g., NovaChat Web"
                    className="w-full px-3 py-2 rounded-xl bg-[#070c1e] border border-[#1c2c5c] text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-cyan-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-200 mb-1.5">
                    Description <span className="text-zinc-500 font-normal">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="What this code does..."
                    className="w-full px-3 py-2 rounded-xl bg-[#070c1e] border border-[#1c2c5c] text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-cyan-400"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-200 mb-1.5">
                  Code Content <span className="text-zinc-500 font-normal">(stored as non-executable text)</span>
                </label>
                <textarea
                  rows={7}
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value);
                    setConfirmSecretSave(false);
                  }}
                  placeholder="Paste code snippet..."
                  className="w-full p-3 rounded-xl bg-[#060916] border border-[#1c2c5c] text-zinc-100 font-mono text-[12px] placeholder-zinc-500 focus:outline-none focus:border-cyan-400"
                  required
                />
              </div>
            </>
          )}

          {/* Shared Tags & Pin Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
            <div>
              <label className="block text-xs font-semibold text-zinc-200 mb-1.5 flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-cyan-400" />
                <span>Tags (comma-separated)</span>
              </label>
              <input
                type="text"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="e.g., react, ui, api"
                className="w-full px-3 py-2 rounded-xl bg-[#070c1e] border border-[#1c2c5c] text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-cyan-400"
              />
            </div>

            <button
              type="button"
              onClick={() => setPinned(!pinned)}
              className={`px-3.5 py-2 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer transition-colors ${
                pinned
                  ? 'bg-cyan-500/15 border-cyan-400/50 text-cyan-300'
                  : 'bg-[#070c1e] border-[#1c2c5c] text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Pin className={`w-3.5 h-3.5 ${pinned ? 'fill-current' : ''}`} />
              <span>{pinned ? 'Pinned Priority Memory' : 'Pin for Priority Retrieval'}</span>
            </button>
          </div>

          {/* Sensitive Credential Warning */}
          {secretScan.hasSecrets && (
            <div className="p-3.5 rounded-2xl bg-amber-500/15 border border-amber-500/40 text-amber-200 space-y-2">
              <div className="flex items-start gap-2">
                <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-amber-300">
                    Possible Secret or Credential Detected
                  </div>
                  <p className="text-[11px] text-amber-200/90 mt-0.5">
                    Detected patterns: {secretScan.findings.join(', ')}. Storing live API keys or passwords in Memory Vault is discouraged. Consider redacting them first.
                  </p>
                </div>
              </div>
              <label className="flex items-center gap-2 text-[11px] text-amber-100 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={confirmSecretSave}
                  onChange={(e) => setConfirmSecretSave(e.target.checked)}
                  className="rounded border-amber-500/50 accent-amber-400"
                />
                <span>I understand the risk and confirm saving this content to Memory Vault.</span>
              </label>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#162552]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-[#0e1738] hover:bg-[#162456] text-zinc-300 font-medium cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              <Check className="w-3.5 h-3.5 stroke-[3]" />
              <span>{isEditing ? 'Save Changes' : 'Save Memory'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
