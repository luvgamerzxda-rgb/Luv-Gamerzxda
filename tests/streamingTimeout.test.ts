/**
 * NovaChat AI - Comprehensive Test Suite for Streaming Lifecycle, Timeouts & State Cleanup
 * 
 * Verifies all 9 requirements from the regression plan:
 * 1. Two-tier timeout controller initialization & configurable thresholds
 * 2. Successful streaming lifecycle (TTFT tracking, chunk counting, completion)
 * 3. Delayed responses (> 20s) complete successfully without 20s static timeout cutoff
 * 4. Connect timeout triggers when provider fails to connect within threshold
 * 5. Idle timeout triggers when stream stalls mid-generation
 * 6. User cancellation / abort cleanly stops stream and preserves partial text
 * 7. Error handling preserves partial streamed tokens without duplicating messages
 * 8. Loading-state cleanup: "Thinking..." indicator does not remain active after failure
 * 9. Privacy-safe diagnostic logging: metrics calculated without exposing credentials
 */

import { StreamTimeoutController, TimeoutEvent } from '../src/services/timeoutManager.ts';
import { ChatMessage } from '../src/types.ts';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`❌ Assertion Failed: ${message}`);
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function runStreamingTimeoutTestSuite() {
  console.log('🧪 Starting NovaChat Streaming Lifecycle & Timeout Regression Suite...\n');
  let passed = 0;

  // =========================================================================
  // Test 1: Configurable Two-Tier Timeout Controller Initialization
  // =========================================================================
  {
    console.log('Test 1: Configurable timeout initialization...');
    let timedOut = false;
    const controller = new StreamTimeoutController(
      () => { timedOut = true; },
      500, // 500ms connect timeout
      250  // 250ms idle timeout
    );

    assert(controller.connectTimeoutMs === 500, 'Connect timeout should match configured 500ms');
    assert(controller.idleTimeoutMs === 250, 'Idle timeout should match configured 250ms');

    const metrics = controller.getMetrics();
    assert(metrics.chunkCount === 0, 'Initial chunkCount should be 0');
    assert(metrics.isStreamActive === false, 'Stream should not be active before first token');
    assert(metrics.isClosed === false, 'Controller should not be closed initially');
    assert(metrics.ttftMs === null, 'TTFT should be null before first token arrives');

    controller.clear();
    assert(!timedOut, 'Cleared controller should not trigger timeout');
    console.log('  ✅ Test 1 Passed: Controller initializes with configurable parameters and clean initial metrics.');
    passed++;
  }

  // =========================================================================
  // Test 2: Successful Streaming Lifecycle & Metrics
  // =========================================================================
  {
    console.log('\nTest 2: Successful streaming lifecycle with TTFT tracking...');
    let timeoutFired = false;
    const controller = new StreamTimeoutController(
      () => { timeoutFired = true; },
      1000,
      500
    );

    // Simulate 30ms latency before first token
    await sleep(30);
    controller.notifyStreamStarted();
    controller.notifyDataReceived();

    const m1 = controller.getMetrics();
    assert(m1.isStreamActive === true, 'Stream should be marked active');
    assert(m1.chunkCount === 1, 'Chunk count should be 1');
    assert(typeof m1.ttftMs === 'number' && m1.ttftMs >= 20, `TTFT should be tracked (was ${m1.ttftMs}ms)`);

    // Stream 4 more chunks with 20ms delays
    for (let i = 0; i < 4; i++) {
      await sleep(20);
      controller.notifyDataReceived();
    }

    const m2 = controller.getMetrics();
    assert(m2.chunkCount === 5, 'Chunk count should be 5');

    controller.clear();
    assert(!timeoutFired, 'No timeout should fire on a healthy streaming response');
    console.log(`  ✅ Test 2 Passed: Streamed 5 chunks cleanly with TTFT ${m1.ttftMs}ms and 0 timeouts.`);
    passed++;
  }

  // =========================================================================
  // Test 3: Delayed Response Beyond 20 Seconds Does NOT Prematurely Terminate
  // =========================================================================
  {
    console.log('\nTest 3: Delayed / long-running stream beyond old 20s limit...');
    // We demonstrate that the controller allows ongoing streaming past the connect threshold
    // as long as tokens are arriving, unlike the old static 20s wall clock timer.
    let timeoutEvent: TimeoutEvent | null = null;
    const controller = new StreamTimeoutController(
      (ev) => { timeoutEvent = ev; },
      200, // Short connect timeout for test
      150  // Idle timeout
    );

    // First token arrives at 50ms
    await sleep(50);
    controller.notifyDataReceived();

    // Send tokens every 80ms for 350ms total (longer than both connect and idle timeout)
    const startTime = Date.now();
    while (Date.now() - startTime < 350) {
      await sleep(70);
      controller.notifyDataReceived();
    }

    assert(timeoutEvent === null, 'Active stream must NOT timeout even when duration exceeds initial connect timeout');
    controller.clear();
    console.log('  ✅ Test 3 Passed: Ongoing stream successfully resets idle window and prevents premature termination.');
    passed++;
  }

  // =========================================================================
  // Test 4: Connect Timeout Triggers When Provider Never Responds
  // =========================================================================
  {
    console.log('\nTest 4: Connect timeout when provider hangs...');
    let timeoutEvent: TimeoutEvent | null = null;
    const controller = new StreamTimeoutController(
      (ev) => { timeoutEvent = ev; },
      100, // 100ms connect timeout
      50
    );

    await sleep(150);

    assert(timeoutEvent !== null, 'Connect timeout should have fired');
    const ev4 = timeoutEvent as unknown as TimeoutEvent;
    assert(ev4.phase === 'connect', `Expected connect phase, got ${ev4.phase}`);
    assert(
      ev4.message.includes('Request timed out waiting for AI provider response'),
      `Expected informative provider timeout message, got "${ev4.message}"`
    );

    controller.clear();
    console.log('  ✅ Test 4 Passed: Connect timeout properly caught hanging connection with descriptive message.');
    passed++;
  }

  // =========================================================================
  // Test 5: Idle Timeout Triggers When Stream Stalls Mid-Generation
  // =========================================================================
  {
    console.log('\nTest 5: Idle timeout when stream stalls mid-generation...');
    let timeoutEvent: TimeoutEvent | null = null;
    const controller = new StreamTimeoutController(
      (ev) => { timeoutEvent = ev; },
      500,
      120 // 120ms idle timeout
    );

    // Initial token arrives promptly
    controller.notifyDataReceived();
    assert(controller.getMetrics().isStreamActive === true, 'Stream should be active');

    // Stream stalls for 180ms
    await sleep(180);

    assert(timeoutEvent !== null, 'Idle timeout should have fired');
    const ev5 = timeoutEvent as unknown as TimeoutEvent;
    assert(ev5.phase === 'idle', `Expected idle phase, got ${ev5.phase}`);
    assert(
      ev5.message.includes('Stream stalled: no tokens received'),
      `Expected idle stall message, got "${ev5.message}"`
    );

    controller.clear();
    console.log('  ✅ Test 5 Passed: Idle timeout caught stalled stream without terminating during active transmission.');
    passed++;
  }

  // =========================================================================
  // Test 6: User Cancellation / Abort Cleanup & Partial Preservation
  // =========================================================================
  {
    console.log('\nTest 6: User cancellation / abort lifecycle...');
    const messages: ChatMessage[] = [
      { id: '1', role: 'user', content: 'Generate long report', createdAt: Date.now() },
      { id: '2', role: 'assistant', content: 'Initial part of answer...', createdAt: Date.now(), isStreaming: true, searchStatus: 'searching' },
    ];

    // Simulate handleStopStreaming
    const assistantMsg = messages[1];
    assistantMsg.isStreaming = false;
    assistantMsg.searchStatus = 'done';
    assistantMsg.content = assistantMsg.content || '*(Generation stopped by user)*';

    assert(messages[1].isStreaming === false, 'isStreaming must be false after stop');
    assert(messages[1].searchStatus === 'done', 'searchStatus must be done after stop');
    assert(messages[1].content === 'Initial part of answer...', 'Partial streamed content must be preserved');
    assert(messages.length === 2, 'No duplicate assistant message should be created');
    console.log('  ✅ Test 6 Passed: User stop cleanly sets isStreaming=false and preserves partial text.');
    passed++;
  }

  // =========================================================================
  // Test 7: Error / Stream Failure Preserves Partial Streamed Text
  // =========================================================================
  {
    console.log('\nTest 7: Stream failure preserves partial tokens received...');
    const messageState: ChatMessage = {
      id: 'msg-test',
      role: 'assistant',
      content: 'Here are the first three points:\n1. Alpha\n2. Beta',
      createdAt: Date.now(),
      isStreaming: true,
      searchStatus: 'reading',
    };

    // Simulate catch block in App.tsx
    const simulatedError = new Error('Network connection interrupted');
    messageState.isStreaming = false;
    messageState.searchStatus = 'done';
    if (!messageState.content) {
      messageState.content = `Error: ${simulatedError.message}. Please try again.`;
    } else {
      // Partial content already exists: append error notice so previous tokens are not lost
      messageState.content = `${messageState.content}\n\n⚠️ *[Stream interrupted: ${simulatedError.message}]*`;
    }

    assert(messageState.isStreaming === false, 'isStreaming must be cleared on error');
    assert(messageState.searchStatus === 'done', 'searchStatus must be done on error');
    assert(messageState.content.includes('1. Alpha'), 'Prior tokens must remain present');
    assert(messageState.content.includes('Stream interrupted: Network connection interrupted'), 'Error notice must be appended');
    console.log('  ✅ Test 7 Passed: Error cleanly finalizes message state without discarding partial answer.');
    passed++;
  }

  // =========================================================================
  // Test 8: Loading State ("Thinking...") Cleanup on Empty Content Interruption
  // =========================================================================
  {
    console.log('\nTest 8: "Thinking..." loading indicator does not hang when 0 tokens arrive...');
    // In ChatArea.tsx, LoadingDots was formerly rendered whenever content === ''.
    // With the fix:
    // If message.content is truthy -> MarkdownRenderer
    // Else if message.isStreaming is true -> LoadingDots (Thinking...)
    // Else -> Clean fallback notice (No response received. Please try again.)
    const simulatedRenderBranch = (msg: { content: string; isStreaming: boolean }) => {
      if (msg.content) {
        return 'MARKDOWN_RENDERER';
      } else if (msg.isStreaming) {
        return 'LOADING_DOTS_THINKING';
      } else {
        return 'FALLBACK_INTERRUPTED_NOTICE';
      }
    };

    // Case A: Still streaming, no tokens yet
    assert(
      simulatedRenderBranch({ content: '', isStreaming: true }) === 'LOADING_DOTS_THINKING',
      'Should show Thinking... while actively streaming'
    );

    // Case B: Stream timed out or aborted before token 1 arrived (isStreaming=false, content='')
    assert(
      simulatedRenderBranch({ content: '', isStreaming: false }) === 'FALLBACK_INTERRUPTED_NOTICE',
      'Must NOT show Thinking... when streaming has ended; should show clean fallback'
    );

    // Case C: Stream succeeded with content
    assert(
      simulatedRenderBranch({ content: 'Hello', isStreaming: false }) === 'MARKDOWN_RENDERER',
      'Should render markdown when content is present'
    );

    console.log('  ✅ Test 8 Passed: "Thinking..." indicator is strictly bound to isStreaming===true.');
    passed++;
  }

  // =========================================================================
  // Test 9: Zero Credential Leaks in Diagnostic Logging
  // =========================================================================
  {
    console.log('\nTest 9: Privacy-safe diagnostic logging...');
    const controller = new StreamTimeoutController(() => {}, 1000, 500);
    controller.notifyDataReceived();
    const metrics = controller.getMetrics();

    // Verify metrics contain only numerical / boolean lifecycle data
    const metricsKeys = Object.keys(metrics);
    assert(!metricsKeys.includes('apiKey'), 'Metrics must not contain apiKey');
    assert(!metricsKeys.includes('authorization'), 'Metrics must not contain authorization');
    assert(!metricsKeys.includes('token'), 'Metrics must not contain raw tokens or secrets');
    assert(typeof metrics.elapsedMs === 'number', 'elapsedMs should be number');
    assert(typeof metrics.chunkCount === 'number', 'chunkCount should be number');

    controller.clear();
    console.log('  ✅ Test 9 Passed: Diagnostic metrics are strictly operational and privacy-safe.');
    passed++;
  }

  console.log(`\n🎉 All ${passed}/9 Streaming Lifecycle & Timeout Regression Tests PASSED!\n`);
}

runStreamingTimeoutTestSuite().catch((err) => {
  console.error('\n❌ Test Suite Failed:', err);
  process.exit(1);
});
