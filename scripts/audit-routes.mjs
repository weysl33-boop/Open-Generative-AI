import https from 'node:https';
import http from 'node:http';

const BASE_URL = 'https://www.koyosim.com';

const routesToTest = [
  // ????
  { path: '/', expectedStatus: [200, 307, 308], name: 'Root Home' },
  { path: '/studio', expectedStatus: [200], name: 'Studio Main' },
  { path: '/zh/studio', expectedStatus: [200], name: 'Studio ZH' },
  { path: '/community', expectedStatus: [200], name: 'Community' },
  { path: '/creations', expectedStatus: [200, 307], name: 'Creations' },
  { path: '/account', expectedStatus: [200, 307], name: 'Account' },
  { path: '/admin', expectedStatus: [200, 307], name: 'Admin Dashboard' },
  { path: '/admin/users', expectedStatus: [200, 307], name: 'Admin Users' },
  { path: '/admin/plans', expectedStatus: [200, 307], name: 'Admin Plans' },
  { path: '/admin/health', expectedStatus: [200, 307], name: 'Admin Health' },
  { path: '/admin/settings', expectedStatus: [200, 307], name: 'Admin Settings' },
  { path: '/admin/models', expectedStatus: [200, 307], name: 'Admin Models' },
  
  // ?????
  { path: '/privacy', expectedStatus: [200, 404], name: 'Privacy' },
  { path: '/terms', expectedStatus: [200, 404], name: 'Terms' },
  { path: '/refund', expectedStatus: [200, 404], name: 'Refund' },
  { path: '/content-policy', expectedStatus: [200, 404], name: 'Content Policy' },

  // API ??
  { path: '/api/health', expectedStatus: [200], name: 'API Health' },
  { path: '/api/live', expectedStatus: [200, 404], name: 'API Live' },
  { path: '/api/ready', expectedStatus: [200, 404], name: 'API Ready' },
  { path: '/api/models/active', expectedStatus: [200], name: 'API Models Active' },
  { path: '/api/community/posts', expectedStatus: [200], name: 'API Community Posts' },
  { path: '/api/auth/me', expectedStatus: [200, 401], name: 'API Auth Me' },
  { path: '/api/billing/plans', expectedStatus: [200], name: 'API Billing Plans' },
];

function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({
        statusCode: res.statusCode,
        headers: res.headers,
        body: data,
        url,
      }));
    });
    req.on('error', reject);
    req.end();
  });
}

async function runAudit() {
  console.log('====================================================');
  console.log('?? ?????????????????');
  console.log(`????: ${BASE_URL}`);
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;
  const issues = [];

  // 1. ??????????? API ??
  console.log('\n[Phase 1] ??????????? HTTP ???');
  let sampleHtml = '';
  for (const r of routesToTest) {
    try {
      const res = await request(`${BASE_URL}${r.path}`);
      if (r.expectedStatus.includes(res.statusCode)) {
        console.log(`  ? [HTTP ${res.statusCode}] ${r.name.padEnd(20)} (${r.path})`);
        passed++;
        if (r.path === '/studio' && res.statusCode === 200) {
          sampleHtml = res.body;
        }
      } else {
        console.warn(`  ? [HTTP ${res.statusCode}] ${r.name.padEnd(20)} (${r.path}) - Expected: ${r.expectedStatus.join('/')}`);
        failed++;
        issues.push({ path: r.path, issue: `Unexpected status ${res.statusCode}` });
      }
    } catch (e) {
      console.error(`  ? Error fetching ${r.path}:`, e.message);
      failed++;
      issues.push({ path: r.path, issue: e.message });
    }
  }

  // 2. ?? /studio ???????????????????
  console.log('\n[Phase 2] ??????????? (CSS / JS Chunks)');
  if (sampleHtml) {
    const staticAssets = [...sampleHtml.matchAll(/href="(\/_next\/static\/[^"]+)"|src="(\/_next\/static\/[^"]+)"/g)]
      .map(m => m[1] || m[2]);
    const uniqueAssets = [...new Set(staticAssets)];
    console.log(`  ??? ${uniqueAssets.length} ?????????`);
    let staticOk = 0;
    for (const asset of uniqueAssets) {
      const res = await request(`${BASE_URL}${asset}`);
      if (res.statusCode === 200) {
        staticOk++;
      } else {
        console.warn(`  ? ????????: ${asset} [HTTP ${res.statusCode}]`);
        failed++;
        issues.push({ path: asset, issue: `Static asset returned HTTP ${res.statusCode}` });
      }
    }
    console.log(`  ? ${staticOk}/${uniqueAssets.length} ??????? HTTP 200 ????`);
    passed += staticOk;
  } else {
    console.warn('  ?? ????? /studio ?? HTML?????????');
  }

  // 3. ??? CSRF / RequestGuard ??
  console.log('\n[Phase 3] ?? API RequestGuard (? CSRF ????)');
  try {
    const postRes = await request(`${BASE_URL}/api/community/posts`, {
      method: 'POST',
      headers: {
        'Origin': BASE_URL,
        'Content-Type': 'application/json'
      }
    });
    // ?????????????? 403 ????????? 401 ??????? Origin ??????
    if (postRes.statusCode === 401) {
      console.log(`  ? RequestGuard ?????? ${BASE_URL} (???? HTTP 401?????)`);
      passed++;
    } else if (postRes.statusCode === 403 && postRes.body.includes('??????')) {
      console.warn('  ? RequestGuard ????????:', postRes.body);
      failed++;
      issues.push({ path: '/api/community/posts', issue: 'RequestGuard rejected new domain origin' });
    } else {
      console.log(`  ? POST ????????: HTTP ${postRes.statusCode}`);
      passed++;
    }
  } catch (e) {
    console.warn('  ? RequestGuard ????:', e.message);
    failed++;
    issues.push({ path: 'CSRF Guard', issue: e.message });
  }

  console.log('\n====================================================');
  console.log(`?? ????: ??=${passed}, ??=${failed}`);
  if (issues.length === 0) {
    console.log('?? ???????? www.koyosim.com ????????????');
  } else {
    console.log('?? ??????:');
    console.log(JSON.stringify(issues, null, 2));
  }
  console.log('====================================================');
}

runAudit();
