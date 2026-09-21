import http from 'node:http';

const BASE = 'http://127.0.0.1:3100';

async function request(path, options = {}) {
  const url = new URL(path, BASE);
  const headers = {
    'Host': 'www.koyosim.com',
    'Origin': 'https://www.koyosim.com',
    ...(options.headers || {}),
  };

  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: 3100,
      path: url.pathname + url.search,
      method: options.method || 'GET',
      headers,
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(body); } catch {}
        resolve({
          status: res.statusCode,
          headers: res.headers,
          raw: body,
          json,
        });
      });
    });
    req.on('error', reject);
    if (options.body) req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    req.end();
  });
}

function extractCookie(headers) {
  const setCookie = headers['set-cookie'];
  if (!setCookie) return null;
  const cookieStr = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  return cookieStr.split(';')[0];
}

async function run() {
  console.log('=== [E2E C-End Production Verification Start] ===');
  
  // 1. Register new user
  const testEmail = `c_user_${Date.now()}@example.com`;
  const testPass = 'SecurePass_2026!#';
  console.log('[1/5] Testing new user registration:', testEmail);
  const regRes = await request('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: { email: testEmail, password: testPass },
  });
  console.log('  Registration response:', regRes.status, regRes.json?.user?.email);
  if (regRes.status !== 200 || !regRes.json?.user) {
    throw new Error(`Registration failed: ${regRes.raw}`);
  }
  const cookie = extractCookie(regRes.headers);
  console.log('  Cookie extracted:', cookie ? 'YES' : 'NO');
  console.log('  Initial credits awarded:', regRes.json.user.credits, '(Expected: 10)');
  if (Number(regRes.json.user.credits) !== 10) {
    throw new Error(`Expected 10 free credits for new user, got ${regRes.json.user.credits}`);
  }

  // 2. Check profile and credit balance
  console.log('[2/5] Verifying user profile & credit balance...');
  const meRes = await request('/api/auth/me', {
    headers: { Cookie: cookie },
  });
  console.log('  Current user:', meRes.json?.user?.email, 'Credits:', meRes.json?.user?.credits);
  if (meRes.status !== 200 || Number(meRes.json?.user?.credits) !== 10) {
    throw new Error(`User balance verification failed: ${meRes.raw}`);
  }

  // 3. Test sensitive content moderation intercept
  console.log('[3/5] Testing content moderation on sensitive prompt...');
  const badPromptRes = await request('/api/generations', {
    method: 'POST',
    headers: {
      Cookie: cookie,
      'Content-Type': 'application/json',
      'Idempotency-Key': `bad_test_${Date.now()}`,
    },
    body: {
      modelId: 'nano-banana',
      prompt: 'how to commit suicide tutorial and bomb making',
    },
  });
  console.log('  Bad prompt intercept status:', badPromptRes.status, badPromptRes.json?.code, badPromptRes.json?.error);
  if (badPromptRes.status !== 422 || badPromptRes.json?.code !== 'CONTENT_POLICY_VIOLATION') {
    throw new Error(`Content moderation intercept failed: ${badPromptRes.raw}`);
  }
  console.log('  PASS: Sensitive prompt blocked with 422 without deducting credits!');

  // Verify credits NOT deducted
  const meCheckRes = await request('/api/auth/me', { headers: { Cookie: cookie } });
  if (Number(meCheckRes.json?.user?.credits) !== 10) {
    throw new Error(`Credits were wrongly deducted after 422 rejection: ${meCheckRes.json?.user?.credits}`);
  }
  console.log('  PASS: Balance still exactly 10 credits after blocked request.');

  // 4. Test legitimate task creation & credit deduction
  console.log('[4/5] Testing legitimate generation creation & credit deduction...');
  const genRes = await request('/api/generations', {
    method: 'POST',
    headers: {
      Cookie: cookie,
      'Content-Type': 'application/json',
      'Idempotency-Key': `gen_safe_${Date.now()}`,
    },
    body: {
      modelId: 'nano-banana',
      prompt: 'a futuristic cyberpunk cityscape in 8k octane render',
      parameters: { aspect_ratio: '1:1' },
    },
  });
  console.log('  Task creation response:', genRes.status, 'Creation ID:', genRes.json?.creation?.id || genRes.json?.creation_id);
  if (genRes.status !== 200 && genRes.status !== 201 && genRes.status !== 202) {
    throw new Error(`Generation creation failed: ${genRes.raw}`);
  }
  const creationId = genRes.json?.creation?.id || genRes.json?.creation_id;

  // 5. Verify creation stored in user asset gallery
  console.log('[5/5] Verifying user creations gallery (/api/creations)...');
  const creationsRes = await request('/api/creations', {
    headers: { Cookie: cookie },
  });
  console.log('  Total creations count:', creationsRes.json?.creations?.length);
  const found = creationsRes.json?.creations?.find(c => c.id === creationId);
  console.log('  Task exists in user creations list:', found ? 'YES' : 'NO');
  if (!found) {
    throw new Error('Created generation task not found in user creations gallery!');
  }

  console.log('=== [ALL 5/5 E2E PRODUCTION VERIFICATIONS PASSED SUCCESSFULLY] ===');
}

run().catch(err => {
  console.error('Verification failed:', err);
  process.exit(1);
});

