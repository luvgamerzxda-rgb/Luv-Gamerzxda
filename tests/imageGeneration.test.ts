/**
 * Comprehensive Automated Test Suite for Image Generation,
 * Uniqueness / Seed Variation, Prompt Enhancement, and Secure Download Proxy
 */

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion Failed: ${message}`);
  }
}

async function runImageTestSuite() {
  console.log('🧪 Starting NovaChat Image Generation & Download Test Suite...\n');
  let passed = 0;

  // Test 1: Generate an image of Lord Shiva (Scenario A)
  let firstShivaUrl = '';
  let firstSeed = 0;
  let firstGenId = '';
  {
    console.log('Testing Scenario A: Generating image of Lord Shiva...');
    const resp = await fetch('http://localhost:3000/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Generate an image of Lord Shiva' }],
      }),
    });

    assert(resp.status === 200, `Chat endpoint must respond with 200 OK (got ${resp.status})`);
    const text = await resp.text();
    assert(text.includes('data: '), 'Must be SSE event stream');

    const lines = text.split('\n\n');
    let foundImage = false;

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const json = JSON.parse(line.slice(6));
          if (json.imageUrl) {
            firstShivaUrl = json.imageUrl;
            firstSeed = json.seed;
            firstGenId = json.generationId;
            foundImage = true;
          }
          if (json.text && json.text.includes('![Lord Shiva](')) {
            foundImage = true;
            const match = json.text.match(/!\[([^\]]*)\]\((https:\/\/[^)]+)\)/);
            if (match) firstShivaUrl = match[2];
          }
        } catch {}
      }
    }

    assert(foundImage, 'Must return generated image in response');
    assert(firstShivaUrl.startsWith('https://image.pollinations.ai/prompt/'), 'Must use Pollinations AI endpoint');
    assert(firstShivaUrl.includes('model=flux'), 'Must specify high quality model=flux');
    assert(firstShivaUrl.includes('seed='), 'Must include explicit random seed parameter');
    assert(firstShivaUrl.includes('nologo=true'), 'Must include nologo=true');
    console.log(`✅ Scenario A Passed: Lord Shiva image generated successfully with seed ${firstSeed}.`);
    passed++;
  }

  // Test 2: Generate another Lord Shiva image in a new chat (Scenario B)
  // Must return a DIFFERENT fresh seed, DIFFERENT generation ID, and DIFFERENT URL
  {
    console.log('Testing Scenario B: Generating second Lord Shiva image in new chat...');
    const resp = await fetch('http://localhost:3000/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Generate an image of Lord Shiva' }],
      }),
    });

    const text = await resp.text();
    const lines = text.split('\n\n');
    let secondShivaUrl = '';
    let secondSeed = 0;
    let secondGenId = '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const json = JSON.parse(line.slice(6));
          if (json.imageUrl) {
            secondShivaUrl = json.imageUrl;
            secondSeed = json.seed;
            secondGenId = json.generationId;
          }
          if (json.text && json.text.includes('![Lord Shiva](')) {
            const match = json.text.match(/!\[([^\]]*)\]\((https:\/\/[^)]+)\)/);
            if (match) secondShivaUrl = match[2];
          }
        } catch {}
      }
    }

    assert(secondShivaUrl.length > 0, 'Second request must return image');
    assert(secondShivaUrl !== firstShivaUrl, 'Second image URL MUST be different from first (no stale caching)');
    assert(secondSeed !== firstSeed, `Second seed (${secondSeed}) MUST differ from first seed (${firstSeed})`);
    assert(secondGenId !== firstGenId, `Second genId (${secondGenId}) MUST differ from first genId (${firstGenId})`);
    console.log(`✅ Scenario B Passed: Independent image request generated fresh seed ${secondSeed} != ${firstSeed}.`);
    passed++;
  }

  // Test 3: Test Download Endpoint (Scenario C & E)
  {
    console.log('Testing Scenario C & E: Image Download Endpoint /api/download-image...');
    const filename = 'novachat-lord-shiva-20261023.png';
    const downloadUrl = `http://localhost:3000/api/download-image?url=${encodeURIComponent(firstShivaUrl)}&filename=${encodeURIComponent(filename)}`;

    const resp = await fetch(downloadUrl);
    assert(resp.status === 200, `Download proxy must return 200 OK (got ${resp.status})`);
    const disposition = resp.headers.get('content-disposition') || '';
    assert(disposition.includes('attachment'), 'Content-Disposition must specify attachment');
    assert(disposition.includes(filename), `Content-Disposition must include filename "${filename}"`);

    const contentType = resp.headers.get('content-type') || '';
    assert(contentType.startsWith('image/'), `Content-Type must be image format (got ${contentType})`);

    const arrayBuffer = await resp.arrayBuffer();
    assert(arrayBuffer.byteLength > 1000, `Downloaded file must contain real image bytes (got ${arrayBuffer.byteLength} bytes)`);
    console.log(`✅ Scenario C & E Passed: Successfully downloaded ${arrayBuffer.byteLength} bytes with attachment header.`);
    passed++;
  }

  // Test 4: Download Security & Invalid Host Handling (Scenario G)
  {
    console.log('Testing Scenario G: Security checks on download proxy...');
    const maliciousResp = await fetch('http://localhost:3000/api/download-image?url=https://malicious-site.com/evil.exe');
    assert(maliciousResp.status === 403, `Must reject untrusted external domains (got ${maliciousResp.status})`);

    const missingParamResp = await fetch('http://localhost:3000/api/download-image');
    assert(missingParamResp.status === 400, `Must reject missing url parameter (got ${missingParamResp.status})`);
    console.log('✅ Scenario G Passed: Security and validation properly reject invalid download requests.');
    passed++;
  }

  // Test 5: Verify Normal Text Chat Still Works (Scenario H)
  {
    console.log('Testing Scenario H: Verifying normal Groq text chat...');
    const resp = await fetch('http://localhost:3000/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'What is 12 multiplied by 12?' }],
      }),
    });

    assert(resp.status === 200, `/api/chat must respond with 200 OK for text`);
    const text = await resp.text();
    assert(!text.includes('https://image.pollinations.ai'), 'Text query must NOT trigger image generation');
    assert(text.includes('144'), 'Must correctly compute 12 * 12 = 144');
    console.log('✅ Scenario H Passed: Groq text completion works cleanly without triggering image generation.');
    passed++;
  }

  console.log(`\n🎉 All ${passed} image generation, seed uniqueness, and download tests passed successfully!`);
}

runImageTestSuite().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
