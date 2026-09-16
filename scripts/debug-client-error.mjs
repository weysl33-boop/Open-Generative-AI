const puppeteer = (await import('file:///C:/Users/weysl/.gemini/antigravity/brain/a4cff523-e938-46b4-bf8e-7536e7eea510/scratch/node_modules/puppeteer/lib/puppeteer/puppeteer.js')).default;

async function testUrl(desc, cookies = []) {
  console.log(`\n=== 测试场景: ${desc} ===`);
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--no-sandbox', '--disable-gpu']
  });

  const page = await browser.newPage();

  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log(`[Browser Console Error]: ${msg.text()}`);
    }
  });

  page.on('pageerror', err => {
    console.log(`[Browser PageError Uncaught]: ${err.stack || err.message}`);
  });

  if (cookies.length) {
    await page.setCookie(...cookies);
  }

  try {
    const res = await page.goto('https://go.koyosim.com/admin', { waitUntil: 'networkidle2', timeout: 25000 });
    console.log(`当前页面最终 URL: ${page.url()}, 响应状态: ${res.status()}`);
    const bodyText = await page.evaluate(() => document.body.innerText);
    if (bodyText.includes('Application error')) {
      console.log('>>> 触发了 Application error 界面！');
    } else {
      console.log('页面主体摘要:', bodyText.slice(0, 150).replace(/\n/g, ' '));
    }
  } catch (e) {
    console.error('页面加载异常:', e.message);
  } finally {
    await browser.close();
  }
}

async function main() {
  // 1. 无 Cookie 访问
  await testUrl('未登录无 Cookie 访问 /admin');

  // 2. 有管理员 Cookie 访问
  await testUrl('已登录管理员 Cookie 访问 /admin', [{
    name: 'ko_session',
    value: 'pd22H1-ceVCTMe5KHcbSHAEeqWF821_3hbWUBDMBIxk',
    domain: 'go.koyosim.com',
    path: '/',
    httpOnly: true,
    secure: true
  }]);
}

main().catch(console.error);
