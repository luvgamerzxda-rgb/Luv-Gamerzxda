import assert from 'assert';
import {
  PRIMARY_DEFAULT_MODEL,
  PRIMARY_MODEL_NAME,
  PRIMARY_ENGINE_LABEL,
  getModelEffortConfig,
  MAX_THINK_APP_DEADLINE_MS,
  WORK_THINK_DEADLINE_MS,
} from '../src/services/modelConfig';
import {
  evaluateVerificationRequirement,
  executeAnswerVerificationPass,
} from '../src/services/answerVerification';
import { StreamTimeoutController } from '../src/services/timeoutManager';

console.log('🧪 Starting Think Mode & Single Model Regression Tests...');

// 1. Primary Model Configuration Tests
console.log('\n--- 1. Single Primary Model Configuration ---');
assert.strictEqual(PRIMARY_DEFAULT_MODEL, 'openai/gpt-oss-120b', 'Primary model must be openai/gpt-oss-120b');
assert.strictEqual(PRIMARY_MODEL_NAME, 'NovaChat AI', 'Primary model name must be NovaChat AI');
assert.strictEqual(PRIMARY_ENGINE_LABEL, 'GPT-OSS 120B (Groq)', 'Engine label must be GPT-OSS 120B (Groq)');
console.log('✅ Single primary model constants validated.');

// 2. Normal Mode vs Think Mode Configuration Tests
console.log('\n--- 2. Normal Mode vs Think Mode Parameters ---');
const normalConfig = getModelEffortConfig(false);
assert.strictEqual(normalConfig.thinkMode, false, 'Normal mode must have thinkMode=false');
assert.strictEqual(normalConfig.reasoningEffort, 'low', 'Normal mode must use reasoning_effort low');
assert.strictEqual(normalConfig.maxOutputTokens, 2048, 'Normal mode max tokens must be 2048');
assert.strictEqual(normalConfig.verificationEnabled, false, 'Normal mode must have verification disabled');
assert.strictEqual(normalConfig.connectTimeoutMs, 60000, 'Normal mode connect timeout must be 60s');
assert.strictEqual(normalConfig.idleTimeoutMs, 30000, 'Normal mode idle timeout must be 30s');

const thinkConfig = getModelEffortConfig(true);
assert.strictEqual(thinkConfig.thinkMode, true, 'Think mode must have thinkMode=true');
assert.strictEqual(thinkConfig.reasoningEffort, 'high', 'Think mode must use reasoning_effort high');
assert.strictEqual(thinkConfig.maxOutputTokens, 4096, 'Think mode max tokens must be 4096');
assert.strictEqual(thinkConfig.verificationEnabled, true, 'Think mode must have verification enabled');
assert.strictEqual(thinkConfig.maxDeadlineMs, 15 * 60 * 1000, 'Think mode must support 15 minute application deadline');
assert.strictEqual(thinkConfig.workDeadlineMs, 13 * 60 * 1000, 'Think mode must have 13 minute internal work limit');
assert.strictEqual(thinkConfig.connectTimeoutMs, 90000, 'Think mode connect timeout must be 90s');
assert.strictEqual(thinkConfig.idleTimeoutMs, 60000, 'Think mode idle timeout must be 60s');
console.log('✅ Two distinct effort modes verified.');

// 3. Verification Requirement Evaluation Tests
console.log('\n--- 3. Verification Requirement Routing ---');

// Trivial greetings must NOT trigger verification
const greeting1 = evaluateVerificationRequirement('hi', '');
assert.strictEqual(greeting1.needsVerification, false, 'Simple "hi" must skip verification');
const greeting2 = evaluateVerificationRequirement('Hello there! How are you?', '');
assert.strictEqual(greeting2.needsVerification, false, 'Greeting must skip verification');
const thanks = evaluateVerificationRequirement('thanks a lot!', '');
assert.strictEqual(thanks.needsVerification, false, '"thanks" must skip verification');

// Math problems MUST trigger verification
const math1 = evaluateVerificationRequirement('Calculate 45 * 18 - 12 / 3', '');
assert.strictEqual(math1.needsVerification, true, 'Math arithmetic calculation must trigger verification');
assert.strictEqual(math1.taskType, 'math', 'Task type should be math');

// Coding questions MUST trigger verification
const code1 = evaluateVerificationRequirement('Write a TypeScript function to debounce an API call', '');
assert.strictEqual(code1.needsVerification, true, 'Coding task must trigger verification');
assert.strictEqual(code1.taskType, 'coding', 'Task type should be coding');

// Multi-step analytical logic MUST trigger verification
const logic1 = evaluateVerificationRequirement('Compare Redis and Memcached in terms of memory efficiency, clustering, and data persistence trade-offs.', '');
assert.strictEqual(logic1.needsVerification, true, 'Complex comparison must trigger verification');
assert.strictEqual(logic1.taskType, 'logic_analysis', 'Task type should be logic_analysis');

console.log('✅ Verification routing properly avoids trivial token waste and targets complex tasks.');

// 4. Deadline Safety & Skip Logic
console.log('\n--- 4. Deadline Safety Guard ---');
async function testDeadlineSafety() {
  const mockGroq: any = {
    chat: {
      completions: {
        create: async () => {
          throw new Error('Should not be called when deadline is exceeded');
        },
      },
    },
  };

  // When workDeadline has only 3000ms left (less than 8000ms threshold)
  const result = await executeAnswerVerificationPass({
    groqClient: mockGroq,
    model: PRIMARY_DEFAULT_MODEL,
    userPrompt: 'Calculate 25 * 4',
    draftAnswer: '100',
    taskType: 'math',
    systemInstruction: '',
    startTime: Date.now() - (13 * 60 * 1000 - 3000), // Only 3s remaining
    workDeadlineMs: 13 * 60 * 1000,
  });

  assert.strictEqual(result.verified, false, 'Verification should be safely skipped when time is low');
  assert.strictEqual(result.finalContent, '100', 'Original draft must be returned intact');
  assert.ok(result.correctionSummary?.includes('deadline safety margin'), 'Summary must reflect deadline safety');
  console.log('✅ Verification safely skips when remaining work time is below threshold.');
}

// 5. StreamTimeoutController Deadline Timer
console.log('\n--- 5. Timeout Manager Deadline Support ---');
function testTimeoutController() {
  let timedOut = false;
  let phase: string = '';

  const controller = new StreamTimeoutController(
    (event) => {
      timedOut = true;
      phase = event.phase;
    },
    100, // connect timeout
    100, // idle timeout
    200  // max deadline
  );

  assert.strictEqual(controller.connectTimeoutMs, 100);
  assert.strictEqual(controller.idleTimeoutMs, 100);
  assert.strictEqual(controller.maxDeadlineMs, 200);

  const remaining = controller.getRemainingWorkTime(1000);
  assert.ok(remaining > 0 && remaining <= 1000, 'Remaining work time must be computed correctly');

  controller.clear();
  assert.strictEqual(controller.getMetrics().isClosed, true);
  console.log('✅ StreamTimeoutController initializes and cleans up deadline timers correctly.');
}

testTimeoutController();

testDeadlineSafety().then(() => {
  console.log('\n🎉 ALL THINK MODE & VERIFICATION REGRESSION TESTS PASSED!');
});
