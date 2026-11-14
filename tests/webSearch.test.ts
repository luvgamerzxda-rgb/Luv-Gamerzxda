/**
 * Automated Regression Test Suite for NovaChat AI Web Search, Intent Filtering & Citations
 */

import { extractSearchQuery, extractHostname, executeLiveWebSearch, shouldPerformWebSearch } from '../src/services/webSearch.ts';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion Failed: ${message}`);
  }
}

async function runWebSearchTests() {
  console.log('🧪 Starting NovaChat Web Search, Intent Filter & Citations Test Suite...\n');
  let passed = 0;

  // Test 1: Query Extraction & Cleaning (English & Hinglish)
  {
    assert(
      extractSearchQuery('Please search the web for latest space news') === 'latest space news',
      'Should strip search wrappers'
    );
    assert(
      extractSearchQuery('can you look up James Webb telescope discoveries?') === 'James Webb telescope discoveries?',
      'Should strip conversational openers'
    );
    const cleanedHinglish = extractSearchQuery('India ki latest news search karo aur sources do');
    assert(
      cleanedHinglish === 'India ki latest news',
      `Should cleanly strip Hinglish search wrappers (got: "${cleanedHinglish}")`
    );
    console.log('✅ Test 1: Search query extraction and cleaning passed.');
    passed++;
  }

  // Test 2: Domain Extraction
  {
    assert(extractHostname('https://en.wikipedia.org/wiki/Earth') === 'en.wikipedia.org', 'Extract wikipedia domain');
    assert(extractHostname('https://www.espn.com/nfl/scores') === 'espn.com', 'Strip www prefix cleanly');
    console.log('✅ Test 2: Domain extraction passed.');
    passed++;
  }

  // Test 3: Lightweight Intent Classification (shouldPerformWebSearch)
  {
    // Must NOT search for greetings, small talk, gratitude, math, or self-contained code requests
    const nonSearchQueries = [
      'hi',
      'hi!',
      'Hii',
      'hello',
      'hello there',
      'hey',
      'heya',
      'good morning',
      'good morning NovaChat',
      'how are you?',
      'how are you doing today',
      'thanks',
      'thank you so much!',
      'thx',
      'ok',
      'okay',
      'got it',
      'theek hai',
      'accha',
      'who created you?',
      'who are you',
      'what is your name',
      '2 + 2',
      'calculate 15 * 80',
      'write a python function to sort a list',
      'write a react hook for local storage',
      'explain photosynthesis',
      'tell me a joke',
    ];

    for (const q of nonSearchQueries) {
      assert(
        !shouldPerformWebSearch(q),
        `Query "${q}" should NOT trigger web search`
      );
    }

    // MUST search for explicit search commands, live info, latest news, Hinglish search requests
    const searchQueries = [
      'India ki latest news search karo aur sources do',
      'who won super bowl 2024',
      'what is the current weather in Tokyo',
      'search the web for electric vehicle trends 2025',
      'latest James Webb telescope discoveries',
      'aaj ki taza khabar',
      'breaking news today',
      'current stock price of Apple',
      'search karo Elon Musk news',
      'give me sources on quantum computing breakthroughs 2024',
    ];

    for (const q of searchQueries) {
      assert(
        shouldPerformWebSearch(q),
        `Query "${q}" MUST trigger web search`
      );
    }

    console.log('✅ Test 3: High-accuracy intent detection passed (100% precision on conversational vs search queries).');
    passed++;
  }

  // Test 4: Live Web Search Execution & Real URLs
  {
    const searchResult = await executeLiveWebSearch('who won super bowl 2024');
    assert(searchResult.results.length > 0, 'Should return real search results');
    assert(searchResult.groundingChunks.length > 0, 'Should return groundingChunks');
    for (const item of searchResult.results) {
      assert(item.url.startsWith('http://') || item.url.startsWith('https://'), `URL must be real HTTP/S: ${item.url}`);
      assert(item.title.length > 0, 'Title must not be empty');
      assert(item.snippet.length > 0, 'Snippet must not be empty');
      assert(item.domain.length > 0, 'Domain must not be empty');
    }
    console.log(`✅ Test 4: Live search executed (${searchResult.provider}, ${searchResult.results.length} sources).`);
    passed++;
  }

  // Test 5: Live API Test: "hi" with searchGrounding: true must NOT trigger web search or return source cards
  {
    const resp = await fetch('http://localhost:3000/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'hi' }],
        searchGrounding: true, // Toggle is ON, but intent is greeting
      }),
    });

    assert(resp.status === 200, `/api/chat must respond with 200 OK (got ${resp.status})`);
    const reader = resp.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';
    const events: any[] = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('data: ')) {
          try {
            const json = JSON.parse(trimmed.slice(6));
            events.push(json);
            if (json.text) fullText += json.text;
          } catch {}
        }
      }
    }

    const hasSearchState = events.some((e) => e.searchStatus === 'searching' || e.searchStatus === 'reading');
    const hasGroundingChunks = events.some((e) => Array.isArray(e.groundingChunks) && e.groundingChunks.length > 0);

    assert(!hasSearchState, 'Sending "hi" must NOT emit search activity states');
    assert(!hasGroundingChunks, 'Sending "hi" must NOT return grounding chunks or source cards');
    assert(fullText.length > 0, 'Sending "hi" must return a conversational greeting');

    console.log('✅ Test 5: "hi" conversational query verified with ZERO web searches and ZERO source cards.');
    passed++;
  }

  // Test 6: Live API Test: "India ki latest news search karo aur sources do" triggers real search and sources
  {
    const resp = await fetch('http://localhost:3000/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'India ki latest news search karo aur sources do' }],
        searchGrounding: true,
      }),
    });

    assert(resp.status === 200, `/api/chat must respond with 200 OK (got ${resp.status})`);
    const reader = resp.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';
    const events: any[] = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('data: ')) {
          try {
            const json = JSON.parse(trimmed.slice(6));
            events.push(json);
            if (json.text) fullText += json.text;
          } catch {}
        }
      }
    }

    const searchingEvt = events.find((e) => e.searchStatus === 'searching');
    const readingEvt = events.find((e) => e.searchStatus === 'reading');
    const doneEvt = events.find((e) => e.done);

    assert(!!searchingEvt, 'Must emit searching activity state for search prompt');
    assert(!!readingEvt, 'Must emit reading sources activity state');
    assert(!!doneEvt, 'Must emit done event');
    assert(
      readingEvt.groundingChunks && readingEvt.groundingChunks.length > 0,
      'Must contain genuine groundingChunks'
    );
    assert(
      /\[[1-9]\]/.test(fullText),
      `Answer must contain inline citation bracket like [1], [2] (got: ${fullText.slice(0, 150)})`
    );

    console.log('✅ Test 6: "India ki latest news search karo aur sources do" verified with real search & citations.');
    passed++;
  }

  // Test 7: Verify Search Toggle Disabled (searchGrounding: false) Never Searches
  {
    const resp = await fetch('http://localhost:3000/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'what is the latest news today?' }],
        searchGrounding: false, // Explicitly disabled
      }),
    });

    const reader = resp.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const events: any[] = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            events.push(JSON.parse(line.slice(6)));
          } catch {}
        }
      }
    }

    const fakeSearch = events.some((e) => e.searchStatus === 'searching' || e.searchStatus === 'reading');
    assert(!fakeSearch, 'Should not emit searching or reading states when searchGrounding is false');
    console.log('✅ Test 7: Disabled search toggle verified clean of search activity.');
    passed++;
  }

  console.log(`\n🎉 All ${passed} web search, intent filtering, and citation regression tests passed successfully!`);
}

runWebSearchTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
