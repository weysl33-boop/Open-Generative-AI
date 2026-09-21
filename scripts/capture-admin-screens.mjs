process.env.NO_PROXY = 'localhost,127.0.0.1,::1,192.168.3.8,43.155.166.90,163.7.7.159';
process.env.no_proxy = process.env.NO_PROXY;
delete process.env.HTTP_PROXY;
delete process.env.HTTPS_PROXY;
delete process.env.http_proxy;
delete process.env.https_proxy;
delete process.env.ALL_PROXY;
delete process.env.all_proxy;

import http from 'node:http';
import path from 'node:path';

const puppeteer = (await import('file:///C:/Users/weysl/.gemini/antigravity/brain/a4cff523-e938-46b4-bf8e-7536e7eea510/scratch/node_modules/puppeteer/lib/puppeteer/puppeteer.js')).default;

const ARTIFACT_DIR = 'C:\\Users\\weysl\\.gemini\\antigravity\\brain\\889d3720-84ae-470b-92d9-dd3135dc4281';
const SESSION_TOKEN = 'hfUm--uKgDD6uIFTnBwyjPDSLsygOaZ0qSu9JRUzFkM';

async function getWsEndpoint() {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: 9222,
      path: '/json/version',
      method: 'GET'
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json.webSocketDebuggerUrl);
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  console.log('获取 Chrome CDP WebSocket 端点...');
  const wsUrl = await getWsEndpoint();
  console.log('连接 Chrome CDP:', wsUrl);

  const browser = await puppeteer.connect({
    browserWSEndpoint: wsUrl,
    defaultViewport: { width: 1440, height: 900 }
  });

  const page = await browser.newPage();
  
  // 设置身份 Cookie
  await page.setCookie({
    name: 'ko_session',
    value: SESSION_TOKEN,
    domain: 'www.koyosim.com',
    path: '/',
    httpOnly: true,
    secure: true
  });

  const pagesToCapture = [
    { name: 'admin_dashboard.png', url: 'https://www.koyosim.com/admin' },
    { name: 'admin_users.png', url: 'https://www.koyosim.com/admin/users' },
    { name: 'admin_plans.png', url: 'https://www.koyosim.com/admin/plans' },
    { name: 'admin_settings.png', url: 'https://www.koyosim.com/admin/settings' },
    { name: 'admin_health.png', url: 'https://www.koyosim.com/admin/health' }
  ];

  for (const item of pagesToCapture) {
    console.log(`正在访问: ${item.url} ...`);
    await page.goto(item.url, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 1500));
    const outPath = path.join(ARTIFACT_DIR, item.name);
    await page.screenshot({ path: outPath, fullPage: false });
    console.log(`✓ 截图已保存: ${outPath}`);
  }

  await page.close();
  browser.disconnect();
  console.log('全部截图抓取完成！');
}

main().catch(err => {
  console.error('截图抓取异常:', err);
  process.exit(1);
});
