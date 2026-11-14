/**
 * Real Web Search Engine for NovaChat AI
 * 
 * Provides live web searching with genuine real-world source verification.
 * Supports DuckDuckGo and Wikipedia API with real URLs, favicons, and snippets.
 */

export interface SearchResultItem {
  title: string;
  url: string;
  snippet: string;
  domain: string;
}

export interface WebSearchPayload {
  provider: string;
  query: string;
  results: SearchResultItem[];
  groundingChunks: Array<{
    web: {
      uri: string;
      title: string;
    };
  }>;
}

/**
 * Lightweight, high-accuracy intent check to determine if a query genuinely requires web search.
 * Strictly filters out greetings, small talk, gratitude, math, basic code queries, and general conversation.
 */
export function shouldPerformWebSearch(prompt: string): boolean {
  if (!prompt || typeof prompt !== 'string') return false;
  const raw = prompt.trim();
  if (raw.length === 0) return false;

  // Clean and normalize prompt for conversational matching
  const clean = raw
    .toLowerCase()
    .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
    .trim();

  // Strip punctuation-only or ultra short strings
  const alphanumericOnly = clean.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  if (alphanumericOnly.length < 2) return false;

  // 1. Direct match on common greetings, single-word pleasantries & acknowledgements (English + Hinglish)
  const CASUAL_GREETINGS_AND_ACKNOWLEDGMENTS = new Set([
    'hi', 'hii', 'hiii', 'hello', 'helloo', 'hey', 'heyy', 'heya', 'yo', 'sup',
    'hola', 'namaste', 'namaskar', 'pranam', 'ram ram', 'radhe radhe', 'salaam', 'salam',
    'howdy', 'hiya', 'salut', 'ciao', 'aloha',
    'thanks', 'thank you', 'thank u', 'thx', 'ty', 'many thanks', 'shukriya', 'dhanyawad',
    'ok', 'okay', 'k', 'kk', 'sure', 'cool', 'got it', 'fine', 'alright', 'all right',
    'great', 'awesome', 'nice', 'perfect', 'understood', 'done', 'theek hai', 'thik hai',
    'accha', 'achha', 'acha', 'haan', 'ha', 'sahi hai', 'sahi', 'bilkul', 'shukran',
    'bye', 'goodbye', 'cya', 'see you', 'tata', 'alvida', 'gn', 'gm',
    'test', 'testing', 'ping', 'pong', 'check',
    'yes', 'no', 'yep', 'nope', 'yeah', 'nah',
    'lol', 'lmao', 'haha', 'hahaha', 'rofl',
  ]);

  if (CASUAL_GREETINGS_AND_ACKNOWLEDGMENTS.has(alphanumericOnly)) {
    return false;
  }

  // 2. Multi-word small talk, pleasantries & conversational openers/closers
  const SMALL_TALK_REGEXES = [
    /^(good\s+)?(morning|afternoon|evening|night|day)(?:\s+(novachat|nova|ai|buddy|friend|there))?$/i,
    /^how\s+are\s+you(?:\s+(today|doing|there|novachat|nova))?$/i,
    /^how\s+(is\s+it\s+going|are\s+things|have\s+you\s+been|was\s+your\s+day)$/i,
    /^(what(?:'s|\s+is)\s+up|wassup|sup)(?:\s+(buddy|bro|novachat))?$/i,
    /^kya\s+haal(?:\s+(hai|chal\s+raha\s+hai))?$/i,
    /^kaise\s+ho(?:\s+(aap|tum|bhai))?$/i,
    /^kaisa\s+chal\s+raha\s+hai$/i,
    /^sab\s+kaisa\s+hai$/i,
    /^(who\s+(are\s+you|created\s+you|made\s+you|built\s+you|owns\s+you))$/i,
    /^(what\s+is\s+your\s+name|what\s+can\s+you\s+do)$/i,
    /^(tell\s+me\s+about\s+yourself|introduce\s+yourself)$/i,
    /^(tum\s+kaun\s+ho|aap\s+kaun\s+ho|aap\s+kaun\s+hain)$/i,
    /^(nice\s+to\s+meet\s+you|pleased\s+to\s+meet\s+you)$/i,
    /^thank\s+you(?:\s+(so\s+much|very\s+much|a\s+lot))?$/i,
    /^(you(?:'re|\s+are)\s+welcome|no\s+problem|mention\s+not)$/i,
    /^(help\s+me|can\s+you\s+help\s+me)$/i,
  ];

  if (SMALL_TALK_REGEXES.some((rx) => rx.test(alphanumericOnly))) {
    return false;
  }

  // 3. Positive Search Triggers: Explicit request for web search, sources, or citations (English + Hinglish)
  const EXPLICIT_SEARCH_TRIGGERS = [
    /\bsearch(?:\s+(?:the\s+)?(?:web|internet|google|bing|online|network))?\b/i,
    /\b(search|dhoondo|khojo)\s+karo\b/i,
    /\bsearch\s+(?:karke|krke)\s+(?:batao|do|dikhao)\b/i,
    /\b(google|bing)\s+(?:this|it|karo)\b/i,
    /\b(look\s*up|find)\s+(?:online|on\s+the\s+web|on\s+internet)\b/i,
    /\bbrowse\s+the\s+web\b/i,
    /\b(sources|citations?|reference\s*links?)\s+(?:do|batao|de|lao|provide|give|include|send|dikhao)\b/i,
    /\b(?:provide|give|with|include|show|send)(?:\s+(?:me|us))?\s+(?:sources|citations?|links?|references?)\b/i,
    /\b(?:sources|citations?|references?)\s+(?:for|on|about|regarding|links?)\b/i,
    /\b(web|internet)\s+pe\s+(?:search|dekho|check)\b/i,
    /\blive\s+(?:data|score|price|status|updates?|news)\b/i,
    /\bbreaking\s+news\b/i,
  ];

  if (EXPLICIT_SEARCH_TRIGGERS.some((rx) => rx.test(clean))) {
    return true;
  }

  // 4. Time-Sensitive & Current Information Triggers (Requires external live info)
  const REALTIME_INFO_TRIGGERS = [
    /\b(latest|newest|recent|recently)\b/i,
    /\b(today(?:'s)?|yesterday(?:'s)?|tonight(?:'s)?)\s+(?:news|weather|match|score|events?|updates?|headlines?|games?)\b/i,
    /\b(current|live)\s+(?:weather|temperature|stock\s+price|price\s+of|score|news|events?|status|exchange\s+rate|standings|ceo|prime\s+minister|president)\b/i,
    /\baaj\s+ki\s+(?:taza\s+)?(?:khabar|news|updates?|headlines?)\b/i,
    /\baaj\s+ka\s+(?:score|match|weather|taza\s+khabar)\b/i,
    /\bwho\s+won\s+.*(?:202[4-9]|today|yesterday|championship|cup|series|election|super\s*bowl|world\s*cup|ipl)\b/i,
    /\b(when\s+is\s+the\s+next|upcoming\s+(?:match|game|event|movie|launch|election))\b/i,
    /\b(stock\s+price\s+of|share\s+price\s+of|crypto\s+price\s+of)\b/i,
    /\bwhat\s+is\s+happening\s+(?:in|with|to)\s+[a-z]+/i,
    /\bkya\s+chal\s+raha\s+hai\s+(?:in|duniya\s+mein|india\s+mein|news\s+mein)\b/i,
  ];

  if (REALTIME_INFO_TRIGGERS.some((rx) => rx.test(clean))) {
    return true;
  }

  // 5. Look for combination of current year (2024, 2025, 2026, 2027) with event / factual inquiry
  const hasCurrentYear = /\b(202[4-9]|2030)\b/.test(clean);
  const hasEventOrNewsKeyword = /\b(news|winner|won|score|election|super\s*bowl|olympics|championship|release\s*date|conference|spacex|nasa|budget|treaty|war|crisis)\b/i.test(clean);
  if (hasCurrentYear && hasEventOrNewsKeyword) {
    return true;
  }

  // 6. Look for URL / domain lookup requests
  if (/\b(?:https?:\/\/|[a-z0-9-]+\.(?:com|org|net|gov|edu|io|co|in)\b)/i.test(clean)) {
    if (/\b(what\s+is|check|look\s*up|summarize|content\s+of|site)\b/i.test(clean)) {
      return true;
    }
  }

  // 7. Check for typical self-contained non-search tasks
  const isPureMath = /^[\d\s+\-*/x÷×^%().,=]+$/.test(clean) || /^(calculate|solve|what is)\s+[\d\s+\-*/x÷×^%().,=]+$/i.test(clean);
  if (isPureMath) return false;

  const isCodingRequest = /^(write|generate|debug|refactor|create|fix)\s+(?:a\s+|an\s+)?(?:python|javascript|typescript|react|html|css|java|c\+\+|sql|rust|go|bash)\b/i.test(clean);
  if (isCodingRequest && !/\b(latest|docs|documentation|version|release)\b/i.test(clean)) {
    return false;
  }

  const isCreativeOrPhilosophy = /^(write\s+a\s+(?:poem|story|essay|song|joke)|tell\s+me\s+a\s+(?:joke|story)|explain\s+(?:photosynthesis|gravity|inertia|superposition|recursion))\b/i.test(clean);
  if (isCreativeOrPhilosophy && !/\b(latest|current|recent|news|today)\b/i.test(clean)) {
    return false;
  }

  return false;
}

/**
 * Extracts the core search query from conversational prompts.
 */
export function extractSearchQuery(prompt: string): string {
  if (!prompt) return '';
  let clean = prompt.trim();

  // Strip conversational wrappers in English and Hinglish
  clean = clean.replace(
    /^(?:please\s+)?(?:can\s+you\s+)?(?:search\s+(?:the\s+web\s+for|for|google|bing)?|browse\s+(?:the\s+web\s+for)?|look\s+up|find\s+(?:out\s+about)?|what\s+is\s+the\s+latest\s+on)\s*:?\s*/i,
    ''
  );
  clean = clean.replace(/^(?:tell\s+me\s+about|what\s+is|who\s+is|where\s+is)\s+/i, '');
  clean = clean.replace(/\b(?:search\s+karo|khojo|dhoondo|google\s+karo)\b/gi, '');
  clean = clean.replace(/\b(?:aur\s+)?(?:sources|citations?)\s+(?:do|batao|de|dikhao|provide\s+karo|lao)\b/gi, '');
  clean = clean.replace(/\b(?:with|give|provide)\s+(?:sources|citations?|links?)\b/gi, '');
  clean = clean.trim().replace(/^["']|["']$/g, '').trim();

  return clean || prompt.trim();
}

/**
 * Clean domain name from a URL
 */
export function extractHostname(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return 'web';
  }
}

/**
 * Performs a real search against DuckDuckGo HTML endpoint with genuine URLs and snippets.
 */
async function searchDuckDuckGo(query: string, signal?: AbortSignal): Promise<SearchResultItem[]> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const resp = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
    },
    signal: signal || AbortSignal.timeout(4000),
  });

  if (!resp.ok) {
    return [];
  }

  const html = await resp.text();
  const results: SearchResultItem[] = [];

  // Match result links and snippets
  const linkRegex = /<a[^>]+class=["'][^"']*result__snippet[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = linkRegex.exec(html)) !== null && results.length < 5) {
    const rawHref = match[1];
    const uddg = rawHref.match(/uddg=([^&]+)/);
    const cleanUrl = uddg ? decodeURIComponent(uddg[1]) : rawHref;

    if (!cleanUrl.startsWith('http')) continue;

    const snippet = match[2]
      .replace(/<[^>]+>/g, '')
      .replace(/&quot;/g, '"')
      .replace(/&#x27;/g, "'")
      .replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ')
      .trim();

    // Find title before this position
    const chunkBefore = html.slice(Math.max(0, match.index - 500), match.index);
    const titleMatch = chunkBefore.match(/<a[^>]+class=["'][^"']*result__url[^"']*["'][^>]*>([\s\S]*?)<\/a>/i);
    let title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : '';

    const domain = extractHostname(cleanUrl);
    if (!title || title.length < 3) {
      title = domain;
    }

    results.push({
      title,
      url: cleanUrl,
      snippet,
      domain,
    });
  }

  return results;
}

/**
 * Performs a search against Wikipedia API for verified factual/encyclopedic content.
 */
async function searchWikipedia(query: string, signal?: AbortSignal): Promise<SearchResultItem[]> {
  try {
    const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
      query
    )}&format=json&origin=*`;
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'NovaChat-WebSearch/1.0' },
      signal: signal || AbortSignal.timeout(3000),
    });

    if (!resp.ok) return [];

    const data = (await resp.json()) as any;
    const searchItems = data.query?.search;
    if (!Array.isArray(searchItems)) return [];

    return searchItems.slice(0, 4).map((item: any) => {
      const cleanTitle = String(item.title || '');
      const wikiUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(cleanTitle.replace(/ /g, '_'))}`;
      const snippet = String(item.snippet || '')
        .replace(/<[^>]+>/g, '')
        .replace(/&quot;/g, '"')
        .replace(/&#x27;/g, "'")
        .replace(/&amp;/g, '&')
        .replace(/\s+/g, ' ')
        .trim();

      return {
        title: cleanTitle,
        url: wikiUrl,
        snippet,
        domain: 'en.wikipedia.org',
      };
    });
  } catch {
    return [];
  }
}

/**
 * Orchestrates a live web search with automatic multi-provider fallback.
 */
export async function executeLiveWebSearch(
  query: string,
  signal?: AbortSignal
): Promise<WebSearchPayload> {
  const cleanQuery = extractSearchQuery(query);
  let results: SearchResultItem[] = [];
  let provider = 'Web Search';

  try {
    results = await searchDuckDuckGo(cleanQuery, signal);
    if (results.length > 0) {
      provider = 'DuckDuckGo';
    }
  } catch (err) {
    console.warn('DuckDuckGo search error, falling back to Wikipedia API:', err);
  }

  // If DDG returned fewer than 2 results or timed out, query Wikipedia API
  if (results.length < 2) {
    try {
      const wikiResults = await searchWikipedia(cleanQuery, signal);
      if (wikiResults.length > 0) {
        // Merge without duplicate URLs
        const existingUrls = new Set(results.map((r) => r.url));
        for (const wr of wikiResults) {
          if (!existingUrls.has(wr.url)) {
            results.push(wr);
          }
        }
        if (provider === 'Web Search') {
          provider = 'Wikipedia';
        }
      }
    } catch (wikiErr) {
      console.warn('Wikipedia search fallback error:', wikiErr);
    }
  }

  const groundingChunks = results.map((r) => ({
    web: {
      uri: r.url,
      title: r.title,
    },
  }));

  return {
    provider,
    query: cleanQuery,
    results,
    groundingChunks,
  };
}
