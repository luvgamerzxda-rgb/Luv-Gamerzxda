import {
  ChatImportFormat,
  ChatImportParseResult,
  ChatMessage,
  ChatSession,
  ParsedImportConversation,
} from '../types';

interface RawParsedConversation {
  sourceId?: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
  warnings: string[];
}

function normalizeTimestamp(val: any, fallback: number): number {
  if (typeof val === 'number' && Number.isFinite(val) && val > 0) {
    // Unix seconds vs milliseconds
    return val < 1e12 ? Math.round(val * 1000) : Math.round(val);
  }
  if (typeof val === 'string' && val.trim()) {
    const num = Number(val);
    if (Number.isFinite(num) && num > 0) {
      return num < 1e12 ? Math.round(num * 1000) : Math.round(num);
    }
    const parsed = Date.parse(val);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return fallback;
}

function normalizeRole(roleRaw: any): 'user' | 'assistant' | null {
  if (!roleRaw || typeof roleRaw !== 'string') return null;
  const r = roleRaw.trim().toLowerCase();
  if (['user', 'human', 'you', 'me', 'prompt'].includes(r)) return 'user';
  if (['assistant', 'model', 'ai', 'bot', 'nova', 'novachat', 'chatgpt', 'claude', 'gemini', 'response'].includes(r)) {
    return 'assistant';
  }
  return null;
}

function extractTextFromContent(content: any, warnings: string[]): string {
  if (typeof content === 'string') return content;
  if (!content) return '';

  if (Array.isArray(content)) {
    const pieces: string[] = [];
    for (const part of content) {
      if (typeof part === 'string') {
        pieces.push(part);
      } else if (part && typeof part === 'object') {
        if (typeof part.text === 'string') {
          pieces.push(part.text);
        } else if (typeof part.content === 'string') {
          pieces.push(part.content);
        } else if (part.type === 'code' && typeof part.code === 'string') {
          const lang = part.language || '';
          pieces.push(`\`\`\`${lang}\n${part.code}\n\`\`\``);
        } else if (part.type === 'image_url' || part.content_type === 'image_asset_pointer' || part.inlineData) {
          warnings.push('Unsupported binary/image attachment omitted from imported text.');
          pieces.push('[Attachment omitted during import]');
        }
      }
    }
    return pieces.filter(Boolean).join('\n').trim();
  }

  if (typeof content === 'object') {
    if (Array.isArray(content.parts)) {
      return extractTextFromContent(content.parts, warnings);
    }
    if (typeof content.text === 'string') return content.text;
    if (typeof content.value === 'string') return content.value;
    if (typeof content.code === 'string') {
      return `\`\`\`${content.language || ''}\n${content.code}\n\`\`\``;
    }
  }

  return '';
}

export function buildConversationFingerprint(title: string, messages: ChatMessage[]): string {
  const normTitle = (title || 'untitled').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 80);
  const first = messages[0]?.content?.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 120) || '';
  const last = messages[messages.length - 1]?.content?.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 120) || '';
  return `${normTitle}::${messages.length}::${first}::${last}`;
}

function makeMessage(
  role: 'user' | 'assistant',
  content: string,
  createdAt: number,
  index: number,
  extra?: Partial<ChatMessage>
): ChatMessage {
  return {
    id: `imp_msg_${createdAt}_${index}_${Math.random().toString(36).slice(2, 6)}`,
    role,
    content: content.trim(),
    createdAt,
    ...extra,
  };
}

function parseNovaChatJson(data: any): RawParsedConversation[] | null {
  const items = Array.isArray(data)
    ? data
    : data && typeof data === 'object' && Array.isArray(data.sessions)
    ? data.sessions
    : null;

  if (!items) return null;

  // Check if array matches NovaChat session shape
  const looksLikeNovaChat = items.some(
    (s: any) =>
      s &&
      typeof s === 'object' &&
      Array.isArray(s.messages) &&
      ('systemInstruction' in s || 'searchGrounding' in s || 'model' in s || 'handoffSummary' in s)
  );
  if (!looksLikeNovaChat) return null;

  const now = Date.now();
  const parsed: RawParsedConversation[] = [];

  for (let i = 0; i < items.length; i++) {
    const s = items[i];
    if (!s || !Array.isArray(s.messages)) continue;
    const warnings: string[] = [];
    const createdAt = normalizeTimestamp(s.createdAt, now);
    const messages: ChatMessage[] = [];

    s.messages.forEach((m: any, idx: number) => {
      const role = normalizeRole(m?.role);
      if (!role) return;
      const text = extractTextFromContent(m?.content, warnings);
      if (!text.trim()) {
        warnings.push(`Skipped empty ${role} message at index ${idx}.`);
        return;
      }
      if (Array.isArray(m?.attachments) && m.attachments.some((a: any) => !a?.base64)) {
        warnings.push('One or more attachments had stripped binary data and were not fully restored.');
      }
      messages.push({
        id: typeof m.id === 'string' && m.id ? m.id : `imp_msg_${createdAt}_${idx}`,
        role,
        content: text,
        createdAt: normalizeTimestamp(m.createdAt, createdAt + idx * 1000),
        modelUsed: typeof m.modelUsed === 'string' ? m.modelUsed : undefined,
        personaName: typeof m.personaName === 'string' ? m.personaName : undefined,
        personaRole: typeof m.personaRole === 'string' ? m.personaRole : undefined,
      });
    });

    if (messages.length > 0) {
      parsed.push({
        sourceId: typeof s.id === 'string' ? s.id : undefined,
        title: (typeof s.title === 'string' && s.title.trim()) || `Imported Chat ${i + 1}`,
        messages,
        createdAt,
        updatedAt: normalizeTimestamp(s.updatedAt, messages[messages.length - 1].createdAt),
        warnings: Array.from(new Set(warnings)),
      });
    }
  }

  return parsed;
}

function parseChatGptJson(data: any): RawParsedConversation[] | null {
  const items = Array.isArray(data) ? data : data && typeof data === 'object' && data.mapping ? [data] : null;
  if (!items) return null;
  if (!items.some((c: any) => c && typeof c === 'object' && c.mapping && typeof c.mapping === 'object')) {
    return null;
  }

  const now = Date.now();
  const parsed: RawParsedConversation[] = [];

  for (let i = 0; i < items.length; i++) {
    const conv = items[i];
    if (!conv || !conv.mapping || typeof conv.mapping !== 'object') continue;

    const warnings: string[] = [];
    const mapping = conv.mapping as Record<string, any>;
    const createdAt = normalizeTimestamp(conv.create_time, now);

    // Traverse active branch from current_node backward via parent links
    let orderedNodes: any[] = [];
    if (conv.current_node && mapping[conv.current_node]) {
      const visited = new Set<string>();
      let cursor: string | null = conv.current_node;
      while (cursor && mapping[cursor] && !visited.has(cursor)) {
        visited.add(cursor);
        orderedNodes.push(mapping[cursor]);
        cursor = mapping[cursor].parent || null;
      }
      orderedNodes.reverse();
    } else {
      // Fallback: topological traversal from root(s)
      const roots = Object.values(mapping).filter((n: any) => !n.parent || !mapping[n.parent]);
      const visited = new Set<string>();
      const walk = (node: any) => {
        if (!node || !node.id || visited.has(node.id)) return;
        visited.add(node.id);
        orderedNodes.push(node);
        if (Array.isArray(node.children)) {
          for (const childId of node.children) {
            if (mapping[childId]) walk(mapping[childId]);
          }
        }
      };
      roots.forEach(walk);
    }

    // Detect if conversation has branching (multiple children on any node)
    const branchCount = Object.values(mapping).filter(
      (n: any) => Array.isArray(n.children) && n.children.length > 1
    ).length;
    if (branchCount > 0) {
      warnings.push(`Preserved active conversation branch (${branchCount} branched edit${branchCount > 1 ? 's' : ''} detected).`);
    }

    const messages: ChatMessage[] = [];
    orderedNodes.forEach((node: any, idx: number) => {
      const msg = node?.message;
      if (!msg) return;
      const role = normalizeRole(msg.author?.role);
      if (!role) return;

      // Skip hidden system/visually-hidden metadata nodes
      if (msg.metadata?.is_visually_hidden_from_conversation) return;

      const text = extractTextFromContent(msg.content, warnings);
      if (Array.isArray(msg.metadata?.attachments) && msg.metadata.attachments.length > 0) {
        warnings.push(`Message included ${msg.metadata.attachments.length} attachment reference(s) that could not be embedded.`);
      }
      if (!text.trim()) return;

      const msgTime = normalizeTimestamp(msg.create_time, createdAt + idx * 1000);
      messages.push(
        makeMessage(role, text, msgTime, idx, {
          modelUsed: typeof msg.metadata?.model_slug === 'string' ? msg.metadata.model_slug : undefined,
        })
      );
    });

    if (messages.length > 0) {
      parsed.push({
        sourceId: typeof conv.id === 'string' ? conv.id : typeof conv.conversation_id === 'string' ? conv.conversation_id : undefined,
        title: (typeof conv.title === 'string' && conv.title.trim()) || `ChatGPT Conversation ${i + 1}`,
        messages,
        createdAt,
        updatedAt: normalizeTimestamp(conv.update_time, messages[messages.length - 1].createdAt),
        warnings: Array.from(new Set(warnings)),
      });
    }
  }

  return parsed;
}

function parseClaudeJson(data: any): RawParsedConversation[] | null {
  const items = Array.isArray(data)
    ? data
    : data && typeof data === 'object' && (Array.isArray(data.chat_messages) || Array.isArray(data.conversations))
    ? Array.isArray(data.conversations)
      ? data.conversations
      : [data]
    : null;

  if (!items) return null;
  if (!items.some((c: any) => c && typeof c === 'object' && Array.isArray(c.chat_messages))) {
    return null;
  }

  const now = Date.now();
  const parsed: RawParsedConversation[] = [];

  for (let i = 0; i < items.length; i++) {
    const conv = items[i];
    if (!conv || !Array.isArray(conv.chat_messages)) continue;
    const warnings: string[] = [];
    const createdAt = normalizeTimestamp(conv.created_at, now);
    const messages: ChatMessage[] = [];

    conv.chat_messages.forEach((m: any, idx: number) => {
      const role = normalizeRole(m?.sender || m?.role);
      if (!role) return;
      const text = extractTextFromContent(m?.text ?? m?.content, warnings);
      if (Array.isArray(m?.attachments) && m.attachments.length > 0) {
        const extra = m.attachments
          .map((a: any) => (a?.extracted_content ? `\n\n[Attached: ${a.file_name || 'file'}]\n${a.extracted_content}` : ''))
          .filter(Boolean)
          .join('');
        if (!extra) {
          warnings.push('Claude file attachment metadata present without text body.');
        }
        const combined = `${text}${extra}`.trim();
        if (combined) {
          messages.push(makeMessage(role, combined, normalizeTimestamp(m.created_at, createdAt + idx * 1000), idx));
        }
        return;
      }
      if (Array.isArray(m?.files) && m.files.length > 0) {
        warnings.push('External file references in Claude export are listed by filename only.');
      }
      if (text.trim()) {
        messages.push(makeMessage(role, text, normalizeTimestamp(m.created_at, createdAt + idx * 1000), idx));
      }
    });

    if (messages.length > 0) {
      parsed.push({
        sourceId: typeof conv.uuid === 'string' ? conv.uuid : typeof conv.id === 'string' ? conv.id : undefined,
        title: (typeof conv.name === 'string' && conv.name.trim()) || (typeof conv.title === 'string' && conv.title.trim()) || `Claude Conversation ${i + 1}`,
        messages,
        createdAt,
        updatedAt: normalizeTimestamp(conv.updated_at, messages[messages.length - 1].createdAt),
        warnings: Array.from(new Set(warnings)),
      });
    }
  }

  return parsed;
}

function parseGeminiJson(data: any): RawParsedConversation[] | null {
  const candidates: any[] = Array.isArray(data)
    ? data
    : data && typeof data === 'object'
    ? Array.isArray(data.conversations)
      ? data.conversations
      : Array.isArray(data.chats)
      ? data.chats
      : [data]
    : [];

  const isGeminiShape = candidates.some((c: any) => {
    if (!c || typeof c !== 'object') return false;
    const list = c.turns || c.contents || c.messages || c.history;
    if (Array.isArray(list)) {
      return list.some(
        (m: any) =>
          m &&
          typeof m === 'object' &&
          (m.role === 'model' ||
            m.author === 'model' ||
            Array.isArray(m.parts) ||
            ('userPrompt' in m && 'modelResponse' in m))
      );
    }
    return 'prompt' in c && 'response' in c;
  });

  if (!isGeminiShape) return null;

  const now = Date.now();
  const parsed: RawParsedConversation[] = [];

  for (let i = 0; i < candidates.length; i++) {
    const conv = candidates[i];
    if (!conv || typeof conv !== 'object') continue;
    const warnings: string[] = [];
    const createdAt = normalizeTimestamp(conv.createdAt || conv.createTime || conv.timestamp, now);
    const messages: ChatMessage[] = [];
    const list = conv.turns || conv.contents || conv.messages || conv.history;

    if (Array.isArray(list)) {
      list.forEach((m: any, idx: number) => {
        if (m && 'userPrompt' in m && 'modelResponse' in m) {
          const ts = normalizeTimestamp(m.timestamp || m.createTime, createdAt + idx * 2000);
          if (typeof m.userPrompt === 'string' && m.userPrompt.trim()) {
            messages.push(makeMessage('user', m.userPrompt, ts, idx * 2));
          }
          if (typeof m.modelResponse === 'string' && m.modelResponse.trim()) {
            messages.push(makeMessage('assistant', m.modelResponse, ts + 500, idx * 2 + 1));
          }
          return;
        }
        const role = normalizeRole(m?.role || m?.author);
        if (!role) return;
        const text = extractTextFromContent(m?.parts ?? m?.content ?? m?.text, warnings);
        if (text.trim()) {
          messages.push(makeMessage(role, text, normalizeTimestamp(m.createdAt || m.timestamp, createdAt + idx * 1000), idx));
        }
      });
    } else if ('prompt' in conv && 'response' in conv) {
      const promptText = extractTextFromContent(conv.prompt, warnings);
      const respText = extractTextFromContent(conv.response, warnings);
      if (promptText) messages.push(makeMessage('user', promptText, createdAt, 0));
      if (respText) messages.push(makeMessage('assistant', respText, createdAt + 1000, 1));
    }

    if (messages.length > 0) {
      parsed.push({
        sourceId: typeof conv.id === 'string' ? conv.id : undefined,
        title: (typeof conv.title === 'string' && conv.title.trim()) || (typeof conv.name === 'string' && conv.name.trim()) || `Gemini Conversation ${i + 1}`,
        messages,
        createdAt,
        updatedAt: normalizeTimestamp(conv.updatedAt || conv.updateTime, messages[messages.length - 1].createdAt),
        warnings: Array.from(new Set(warnings)),
      });
    }
  }

  return parsed;
}

function parseGenericJson(data: any): RawParsedConversation[] | null {
  const now = Date.now();
  const warnings: string[] = [];

  // Case 1: Flat array of messages [{ role, content }]
  if (Array.isArray(data) && data.length > 0 && data.every((m) => m && typeof m === 'object' && ('role' in m || 'sender' in m) && ('content' in m || 'text' in m))) {
    const messages: ChatMessage[] = [];
    data.forEach((m: any, idx: number) => {
      const role = normalizeRole(m.role || m.sender);
      if (!role) return;
      const text = extractTextFromContent(m.content ?? m.text, warnings);
      if (text.trim()) {
        messages.push(makeMessage(role, text, normalizeTimestamp(m.createdAt || m.timestamp, now + idx * 1000), idx));
      }
    });
    if (messages.length > 0) {
      return [
        {
          title: 'Imported JSON Chat',
          messages,
          createdAt: messages[0].createdAt,
          updatedAt: messages[messages.length - 1].createdAt,
          warnings: Array.from(new Set(warnings)),
        },
      ];
    }
  }

  // Case 2: Array of session objects or { conversations / sessions / messages }
  const convList = Array.isArray(data)
    ? data
    : data && typeof data === 'object'
    ? Array.isArray(data.sessions)
      ? data.sessions
      : Array.isArray(data.conversations)
      ? data.conversations
      : Array.isArray(data.messages)
      ? [data]
      : null
    : null;

  if (!convList) return null;

  const parsed: RawParsedConversation[] = [];
  convList.forEach((c: any, idx: number) => {
    if (!c || typeof c !== 'object' || !Array.isArray(c.messages)) return;
    const convWarnings: string[] = [];
    const createdAt = normalizeTimestamp(c.createdAt || c.created_at, now);
    const messages: ChatMessage[] = [];

    c.messages.forEach((m: any, mIdx: number) => {
      const role = normalizeRole(m?.role || m?.sender || m?.author);
      if (!role) return;
      const text = extractTextFromContent(m?.content ?? m?.text ?? m?.parts, convWarnings);
      if (text.trim()) {
        messages.push(
          makeMessage(role, text, normalizeTimestamp(m?.createdAt || m?.timestamp, createdAt + mIdx * 1000), mIdx)
        );
      }
    });

    if (messages.length > 0) {
      parsed.push({
        sourceId: typeof c.id === 'string' ? c.id : undefined,
        title: (typeof c.title === 'string' && c.title.trim()) || (typeof c.name === 'string' && c.name.trim()) || `Imported Chat ${idx + 1}`,
        messages,
        createdAt,
        updatedAt: normalizeTimestamp(c.updatedAt || c.updated_at, messages[messages.length - 1].createdAt),
        warnings: Array.from(new Set(convWarnings)),
      });
    }
  });

  return parsed.length > 0 ? parsed : null;
}

function parseDialogueLines(rawText: string, fileName: string, isMarkdown: boolean): RawParsedConversation[] {
  const lines = rawText.replace(/\r\n/g, '\n').split('\n');
  let title = fileName.replace(/\.(md|markdown|txt)$/i, '').replace(/[_-]+/g, ' ').trim() || 'Imported Transcript';
  let insideFence = false;
  let currentRole: 'user' | 'assistant' | null = null;
  let currentBuffer: string[] = [];
  const messages: ChatMessage[] = [];
  const now = Date.now();

  const flush = () => {
    if (!currentRole) return;
    const content = currentBuffer.join('\n').replace(/^\s*---\s*$/gm, '').trim();
    if (content) {
      messages.push(makeMessage(currentRole, content, now + messages.length * 1000, messages.length));
    }
    currentBuffer = [];
  };

  const mdHeadingRegex = /^#{1,6}\s*(?:\*\*)?(User|You|Human|Me|Assistant|NovaChat|Nova|AI|ChatGPT|Claude|Gemini|Model)(?:\*\*)?\s*:?\s*(.*)$/i;
  const boldSpeakerRegex = /^\*\*(User|You|Human|Me|Assistant|NovaChat|Nova|AI|ChatGPT|Claude|Gemini|Model)\s*:?\*\*\s*:?\s*(.*)$/i;
  const plainSpeakerRegex = /^(User|You|Human|Me|Assistant|NovaChat|Nova|AI|ChatGPT|Claude|Gemini|Model)\s*:\s*(.*)$/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (/^```/.test(trimmed)) {
      insideFence = !insideFence;
      if (currentRole) currentBuffer.push(line);
      continue;
    }

    if (!insideFence) {
      // Top-level markdown H1 title before messages start
      if (isMarkdown && messages.length === 0 && !currentRole && /^#\s+(.+)/.test(trimmed)) {
        const h1 = trimmed.replace(/^#\s+/, '').trim();
        if (h1 && !normalizeRole(h1)) {
          title = h1;
          continue;
        }
      }

      // Skip NovaChat exported metadata line (*Created: ...*) and horizontal rules between turns
      if (!currentRole && /^\*Created:/i.test(trimmed)) continue;
      if (trimmed === '---') continue;

      const match =
        (isMarkdown ? trimmed.match(mdHeadingRegex) || trimmed.match(boldSpeakerRegex) : null) ||
        trimmed.match(plainSpeakerRegex);

      if (match) {
        const matchedRole = normalizeRole(match[1]);
        if (matchedRole) {
          flush();
          currentRole = matchedRole;
          if (match[2] && match[2].trim()) {
            currentBuffer.push(match[2].trim());
          }
          continue;
        }
      }
    }

    if (currentRole) {
      currentBuffer.push(line);
    }
  }

  flush();

  if (messages.length === 0) {
    throw new Error(
      isMarkdown
        ? 'No recognizable conversation turns found in Markdown file. Use headings or labels like "### User" / "### Assistant" or "User:" / "Assistant:".'
        : 'No recognizable speaker turns found in text file. Expected labels like "User:" / "Assistant:" (or "You:" / "AI:").'
    );
  }

  return [
    {
      title,
      messages,
      createdAt: messages[0].createdAt,
      updatedAt: messages[messages.length - 1].createdAt,
      warnings: [],
    },
  ];
}

const FORMAT_LABELS: Record<ChatImportFormat, string> = {
  'novachat-json': 'NovaChat JSON Export',
  'chatgpt-json': 'ChatGPT Export (conversations.json)',
  'claude-json': 'Claude Export JSON',
  'gemini-json': 'Gemini Conversation Export JSON',
  'generic-json': 'Generic Conversation JSON',
  markdown: 'Markdown Conversation (.md)',
  text: 'Plain Text Transcript (.txt)',
};

export function parseImportedChatFile(
  rawContent: string,
  fileName: string,
  existingSessions: ChatSession[]
): ChatImportParseResult {
  if (!rawContent || !rawContent.trim()) {
    throw new Error('The selected file is empty.');
  }

  const ext = (fileName.split('.').pop() || '').toLowerCase();
  const trimmed = rawContent.trim();
  const looksLikeJson = ext === 'json' || trimmed.startsWith('{') || trimmed.startsWith('[');

  let format: ChatImportFormat;
  let rawConversations: RawParsedConversation[] | null = null;

  if (looksLikeJson) {
    let jsonData: any;
    try {
      jsonData = JSON.parse(trimmed);
    } catch (err: any) {
      throw new Error(`Invalid or corrupted JSON file: ${err?.message || 'Syntax error'}`);
    }

    const novaParsed = parseNovaChatJson(jsonData);
    if (novaParsed) {
      format = 'novachat-json';
      rawConversations = novaParsed;
    } else {
      const gptParsed = parseChatGptJson(jsonData);
      if (gptParsed) {
        format = 'chatgpt-json';
        rawConversations = gptParsed;
      } else {
        const claudeParsed = parseClaudeJson(jsonData);
        if (claudeParsed) {
          format = 'claude-json';
          rawConversations = claudeParsed;
        } else {
          const geminiParsed = parseGeminiJson(jsonData);
          if (geminiParsed) {
            format = 'gemini-json';
            rawConversations = geminiParsed;
          } else {
            const genericParsed = parseGenericJson(jsonData);
            if (genericParsed) {
              format = 'generic-json';
              rawConversations = genericParsed;
            } else {
              throw new Error(
                'Unsupported JSON structure. Expected NovaChat, ChatGPT, Claude, Gemini, or standard { role, content } message history.'
              );
            }
          }
        }
      }
    }
  } else if (ext === 'md' || ext === 'markdown') {
    format = 'markdown';
    rawConversations = parseDialogueLines(rawContent, fileName, true);
  } else if (ext === 'txt' || ext === '') {
    format = 'text';
    rawConversations = parseDialogueLines(rawContent, fileName, false);
  } else {
    throw new Error(`Unsupported file extension ".${ext}". Please choose a .json, .md, or .txt export file.`);
  }

  if (!rawConversations || rawConversations.length === 0) {
    throw new Error('No valid conversations containing messages were found in this file.');
  }

  // Build duplicate lookup indexes from existing sessions
  const existingIdSet = new Set(existingSessions.map((s) => s.id));
  const existingFingerprintSet = new Set(
    existingSessions.map((s) => buildConversationFingerprint(s.title, s.messages || []))
  );

  const conversations: ParsedImportConversation[] = rawConversations.map((conv, idx) => {
    const fp = buildConversationFingerprint(conv.title, conv.messages);
    let isDuplicate = false;
    let duplicateReason: string | undefined;

    if (conv.sourceId && existingIdSet.has(conv.sourceId)) {
      isDuplicate = true;
      duplicateReason = 'Matches existing conversation ID';
    } else if (existingFingerprintSet.has(fp)) {
      isDuplicate = true;
      duplicateReason = 'Matches existing conversation title and messages';
    }

    return {
      importKey: `import_${idx}_${conv.sourceId || fp.slice(0, 16)}`,
      sourceId: conv.sourceId,
      title: conv.title,
      messages: conv.messages,
      createdAt: conv.createdAt,
      updatedAt: conv.updatedAt,
      warnings: conv.warnings,
      fingerprint: fp,
      isDuplicate,
      duplicateReason,
    };
  });

  const allWarnings = Array.from(new Set(conversations.flatMap((c) => c.warnings)));
  const totalMessages = conversations.reduce((acc, c) => acc + c.messages.length, 0);
  const duplicateCount = conversations.filter((c) => c.isDuplicate).length;

  return {
    format,
    formatLabel: FORMAT_LABELS[format],
    conversations,
    warnings: allWarnings,
    totalMessages,
    duplicateCount,
  };
}

export function materializeImportedSessions(params: {
  selectedConversations: ParsedImportConversation[];
  existingSessions: ChatSession[];
  formatLabel: string;
  defaultModel: string;
  defaultSystemInstruction: string;
}): ChatSession[] {
  const existingIds = new Set(params.existingSessions.map((s) => s.id));
  const now = Date.now();

  return params.selectedConversations.map((conv, idx) => {
    // Never overwrite existing conversations: allocate a fresh ID if sourceId collides or is missing
    let finalId = conv.sourceId && !existingIds.has(conv.sourceId)
      ? conv.sourceId
      : `imp_${now}_${idx}_${Math.random().toString(36).slice(2, 7)}`;
    while (existingIds.has(finalId)) {
      finalId = `imp_${now}_${idx}_${Math.random().toString(36).slice(2, 8)}`;
    }
    existingIds.add(finalId);

    const title = conv.isDuplicate ? `${conv.title} (Imported)` : conv.title;

    return {
      id: finalId,
      title,
      createdAt: conv.createdAt,
      updatedAt: conv.updatedAt,
      messages: conv.messages,
      model: params.defaultModel,
      systemInstruction: params.defaultSystemInstruction,
      searchGrounding: false,
      importedFrom: params.formatLabel,
      importedAt: now,
    };
  });
}
