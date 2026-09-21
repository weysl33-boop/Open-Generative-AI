import path from 'node:path';

const puppeteer = (await import('file:///C:/Users/weysl/.gemini/antigravity/brain/a4cff523-e938-46b4-bf8e-7536e7eea510/scratch/node_modules/puppeteer/lib/puppeteer/puppeteer.js')).default;

const ARTIFACT_DIR = 'C:\\Users\\weysl\\.gemini\\antigravity\\brain\\889d3720-84ae-470b-92d9-dd3135dc4281';
const SESSION_TOKEN = 'E1Ct471WQqNIHueTt1BXvawrzZka8fctZgovmPcZBds';

async function main() {
  console.log('正在启动隔离 Headless Chrome 实例...');
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--window-size=1440,900'
    ]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  // 1. 设置身份验证 Cookie
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
    { name: 'admin_generations.png', url: 'https://www.koyosim.com/admin/generations' },
    { name: 'admin_settings.png', url: 'https://www.koyosim.com/admin/settings' },
    { name: 'admin_health.png', url: 'https://www.koyosim.com/admin/health' }
  ];

  for (const item of pagesToCapture) {
    console.log(`正在访问并渲染页面: ${item.url} ...`);
    try {
      await page.goto(item.url, { waitUntil: 'networkidle2', timeout: 35000 });
      await new Promise(r => setTimeout(r, 2000));
      const outPath = path.join(ARTIFACT_DIR, item.name);
      await page.screenshot({ path: outPath, fullPage: false });
      console.log(`✓ 截图已保存: ${item.name}`);
    } catch (e) {
      console.error(`访问 ${item.url} 失败:`, e.message);
    }
  }

  await page.close();
  await browser.close();
  console.log('所有管理后台视图截图抓取完毕！');
}

main().catch(err => {
  console.error('任务异常:', err);
  process.exit(1);
});
