import React, { useState, useRef, useMemo } from 'react';
import {
  X,
  Upload,
  FileText,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  MessageSquare,
  Check,
  Copy,
  Sparkles,
  Loader2,
} from 'lucide-react';
import { ChatImportParseResult, ChatSession, ParsedImportConversation } from '../types';
import { materializeImportedSessions, parseImportedChatFile } from '../services/chatImporter';
import { soundEffects } from '../services/soundEffects';

interface ImportChatsModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingSessions: ChatSession[];
  defaultModel: string;
  defaultSystemInstruction: string;
  onImportSessions: (newSessions: ChatSession[], summaryText: string) => void;
}

export const ImportChatsModal: React.FC<ImportChatsModalProps> = ({
  isOpen,
  onClose,
  existingSessions,
  defaultModel,
  defaultSystemInstruction,
  onImportSessions,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parseResult, setParseResult] = useState<ChatImportParseResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [allowDuplicateImport, setAllowDuplicateImport] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);

  const resetState = () => {
    setFileName(null);
    setParseResult(null);
    setParseError(null);
    setSelectedKeys(new Set());
    setAllowDuplicateImport(false);
    setIsImporting(false);
    setImportSuccess(null);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const processFile = async (file: File) => {
    setParseError(null);
    setImportSuccess(null);
    setFileName(file.name);

    try {
      const content = await file.text();
      const result = parseImportedChatFile(content, file.name, existingSessions);
      setParseResult(result);

      // Skip duplicates by default
      const initialSelected = new Set<string>();
      for (const conv of result.conversations) {
        if (!conv.isDuplicate) {
          initialSelected.add(conv.importKey);
        }
      }
      setSelectedKeys(initialSelected);
      setAllowDuplicateImport(false);
      soundEffects.playConfirm?.();
    } catch (err: any) {
      setParseResult(null);
      setParseError(err?.message || 'Unable to parse file. Please verify the export format.');
      soundEffects.playClick?.();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleToggleConversation = (conv: ParsedImportConversation) => {
    soundEffects.playSelect?.();
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(conv.importKey)) {
        next.delete(conv.importKey);
      } else {
        next.add(conv.importKey);
      }
      return next;
    });
  };

  const handleToggleDuplicateOverride = (includeDups: boolean) => {
    if (!parseResult) return;
    soundEffects.playToggle?.(includeDups);
    setAllowDuplicateImport(includeDups);
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      for (const conv of parseResult.conversations) {
        if (conv.isDuplicate) {
          if (includeDups) next.add(conv.importKey);
          else next.delete(conv.importKey);
        }
      }
      return next;
    });
  };

  const selectedConversations = useMemo(() => {
    if (!parseResult) return [];
    return parseResult.conversations.filter((c) => selectedKeys.has(c.importKey));
  }, [parseResult, selectedKeys]);

  const handleConfirmImport = () => {
    if (!parseResult || selectedConversations.length === 0) return;
    setIsImporting(true);
    try {
      const materialized = materializeImportedSessions({
        selectedConversations,
        existingSessions,
        formatLabel: parseResult.formatLabel,
        defaultModel,
        defaultSystemInstruction,
      });

      const msgTotal = materialized.reduce((acc, s) => acc + s.messages.length, 0);
      const summary = `Imported ${materialized.length} conversation${materialized.length === 1 ? '' : 's'} (${msgTotal} messages) from ${parseResult.formatLabel}.`;
      onImportSessions(materialized, summary);
      setImportSuccess(summary);
      soundEffects.playConfirm?.();
    } finally {
      setIsImporting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
      onClick={handleClose}
    >
      <div
        className="w-full max-w-2xl max-h-[88vh] rounded-3xl bg-[#090f26]/95 border border-[#1e2f66] shadow-2xl flex flex-col overflow-hidden text-zinc-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#162552] flex items-center justify-between shrink-0 bg-[#070c1e]/90">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Upload className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-white">Universal Chat Import</h3>
              <p className="text-[11px] text-zinc-400">
                Import conversations safely without modifying existing history or memory.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-[#14204d] transition-colors cursor-pointer"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 text-xs">
          {/* Supported Formats Guide */}
          <div className="p-3.5 rounded-2xl bg-[#0a112c]/80 border border-[#1c2c5c] space-y-2">
            <div className="font-semibold text-white flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
              <span>Supported Formats</span>
            </div>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              NovaChat JSON · ChatGPT (<code className="text-cyan-300 font-mono">conversations.json</code>) · Claude JSON · Gemini Exports · Generic JSON · Markdown (<code className="text-cyan-300 font-mono">.md</code>) · Plain Text (<code className="text-cyan-300 font-mono">.txt</code>)
            </p>
          </div>

          {/* Dropzone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`p-6 rounded-2xl border-2 border-dashed transition-all text-center cursor-pointer space-y-2.5 ${
              isDragging
                ? 'border-cyan-400 bg-cyan-500/10'
                : 'border-[#22356d] bg-[#070c1e]/80 hover:border-cyan-500/50 hover:bg-[#0a122e]'
            }`}
          >
            <div className="w-11 h-11 rounded-2xl bg-blue-600/20 border border-cyan-500/30 flex items-center justify-center mx-auto text-cyan-400">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-semibold text-white">
                {fileName ? `Selected: ${fileName}` : 'Drop conversation export here'}
              </div>
              <p className="text-[11px] text-zinc-400 mt-1">
                or click to browse a <span className="text-cyan-300 font-mono">.json</span>,{' '}
                <span className="text-cyan-300 font-mono">.md</span>, or{' '}
                <span className="text-cyan-300 font-mono">.txt</span> file
              </p>
            </div>
            <div>
              <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#111f4d] hover:bg-[#1a2e73] text-cyan-300 border border-cyan-500/40 text-xs font-semibold">
                <Upload className="w-3.5 h-3.5" />
                <span>Browse Files</span>
              </span>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,.txt,.md,.markdown,application/json,text/plain,text/markdown"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>

          {/* Error Feedback */}
          {parseError && (
            <div className="p-3.5 rounded-2xl bg-red-500/15 border border-red-500/40 text-red-200 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-red-300">File Validation Failed</div>
                <p className="text-[11px] text-red-200/90 mt-0.5">{parseError}</p>
              </div>
            </div>
          )}

          {/* Success Feedback */}
          {importSuccess && (
            <div className="p-4 rounded-2xl bg-cyan-950/60 border border-cyan-500/40 text-cyan-200 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-5 h-5 text-cyan-400 shrink-0" />
                <div>
                  <div className="font-semibold text-white">Import Complete</div>
                  <p className="text-[11px] text-cyan-200/90 mt-0.5">{importSuccess}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleClose}
                className="px-3.5 py-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold whitespace-nowrap cursor-pointer"
              >
                Done
              </button>
            </div>
          )}

          {/* Preview Section */}
          {parseResult && !importSuccess && (
            <div className="space-y-4">
              {/* Summary Metrics Bar */}
              <div className="grid grid-cols-3 gap-2.5">
                <div className="p-3 rounded-xl bg-[#070c1e] border border-[#182650]">
                  <div className="text-[10px] text-zinc-400 uppercase tracking-wider font-semibold">
                    Detected Format
                  </div>
                  <div className="text-xs font-semibold text-cyan-300 mt-1 truncate">
                    {parseResult.formatLabel}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-[#070c1e] border border-[#182650]">
                  <div className="text-[10px] text-zinc-400 uppercase tracking-wider font-semibold">
                    Conversations
                  </div>
                  <div className="text-base font-bold text-white font-mono tabular-nums mt-0.5">
                    {parseResult.conversations.length}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-[#070c1e] border border-[#182650]">
                  <div className="text-[10px] text-zinc-400 uppercase tracking-wider font-semibold">
                    Total Messages
                  </div>
                  <div className="text-base font-bold text-purple-300 font-mono tabular-nums mt-0.5">
                    {parseResult.totalMessages}
                  </div>
                </div>
              </div>

              {/* Warnings */}
              {parseResult.warnings.length > 0 && (
                <div className="p-3 rounded-xl bg-amber-500/15 border border-amber-500/35 text-amber-200 space-y-1">
                  <div className="font-semibold flex items-center gap-1.5 text-amber-300">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Import Notes</span>
                  </div>
                  <ul className="list-disc list-inside text-[11px] space-y-0.5 text-amber-200/90">
                    {parseResult.warnings.slice(0, 4).map((w, idx) => (
                      <li key={idx}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Duplicate Handling Toggle */}
              {parseResult.duplicateCount > 0 && (
                <div className="p-3.5 rounded-2xl bg-[#0a112c]/80 border border-[#1c2c5c] flex items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold text-white flex items-center gap-1.5">
                      <Copy className="w-3.5 h-3.5 text-amber-400" />
                      <span>
                        {parseResult.duplicateCount} Duplicate{parseResult.duplicateCount > 1 ? 's' : ''} Detected
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-400 mt-0.5">
                      Duplicates are skipped by default to protect existing chats. Toggle to import them as separate copies.
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={allowDuplicateImport}
                    onClick={() => handleToggleDuplicateOverride(!allowDuplicateImport)}
                    className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer shrink-0 ${
                      allowDuplicateImport ? 'bg-cyan-500' : 'bg-[#1a2858]'
                    }`}
                  >
                    <span
                      className={`block w-5 h-5 rounded-full bg-white transition-transform shadow-md ${
                        allowDuplicateImport ? 'translate-x-6' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>
              )}

              {/* Preview List */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px] text-zinc-400 px-0.5">
                  <span className="font-semibold text-zinc-200">
                    Preview ({selectedConversations.length} of {parseResult.conversations.length} selected)
                  </span>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedKeys(new Set(parseResult.conversations.map((c) => c.importKey)))
                      }
                      className="text-cyan-400 hover:underline cursor-pointer"
                    >
                      Select All
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedKeys(new Set())}
                      className="text-zinc-400 hover:text-zinc-200 cursor-pointer"
                    >
                      Deselect All
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                  {parseResult.conversations.map((conv) => {
                    const isChecked = selectedKeys.has(conv.importKey);
                    const firstSnippet = conv.messages[0]?.content?.slice(0, 90) || '';
                    return (
                      <div
                        key={conv.importKey}
                        onClick={() => handleToggleConversation(conv)}
                        className={`p-3 rounded-xl border transition-all cursor-pointer flex items-start gap-3 ${
                          isChecked
                            ? 'bg-blue-600/15 border-cyan-500/40'
                            : 'bg-[#070c1e]/80 border-[#172654] opacity-75 hover:opacity-100'
                        }`}
                      >
                        <div
                          className={`w-4 h-4 rounded mt-0.5 border flex items-center justify-center shrink-0 ${
                            isChecked
                              ? 'bg-cyan-500 border-cyan-400 text-slate-950'
                              : 'border-[#2a3f7e] bg-[#0a112c]'
                          }`}
                        >
                          {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-white truncate">{conv.title}</span>
                            <div className="flex items-center gap-2 shrink-0 text-[10px] font-mono tabular-nums">
                              {conv.isDuplicate && (
                                <span className="text-amber-300">
                                  Duplicate · {isChecked ? 'Copy' : 'Skipped'}
                                </span>
                              )}
                              <span className="text-cyan-300 flex items-center gap-1">
                                <MessageSquare className="w-3 h-3" />
                                {conv.messages.length}
                              </span>
                            </div>
                          </div>
                          {firstSnippet && (
                            <p className="text-[11px] text-zinc-400 truncate mt-0.5">
                              {firstSnippet}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[#162552] bg-[#070c1e]/90 flex items-center justify-between gap-3 shrink-0">
          <div className="text-[11px] text-zinc-400">
            Imported chats remain strictly in Chat History.
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 rounded-xl bg-[#0e1738] hover:bg-[#162456] text-zinc-300 text-xs font-medium cursor-pointer transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!parseResult || selectedConversations.length === 0 || isImporting || Boolean(importSuccess)}
              onClick={handleConfirmImport}
              className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 whitespace-nowrap"
            >
              {isImporting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Importing...</span>
                </>
              ) : (
                <span>
                  Import {selectedConversations.length > 0 ? `${selectedConversations.length} ` : ''}
                  Chat{selectedConversations.length === 1 ? '' : 's'}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
