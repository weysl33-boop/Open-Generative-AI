const puppeteer = (await import('file:///C:/Users/weysl/.gemini/antigravity/brain/a4cff523-e938-46b4-bf8e-7536e7eea510/scratch/node_modules/puppeteer/lib/puppeteer/puppeteer.js')).default;

async function check(url) {
  console.log(`\nTesting URL: ${url}`);
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--no-sandbox', '--disable-gpu']
  });

  const page = await browser.newPage();
  const errors = [];

  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log(`[Console Error]: ${msg.text()}`);
      errors.push(msg.text());
    }
  });

  page.on('pageerror', err => {
    console.log(`[PageError]: ${err.stack || err.message}`);
    errors.push(err.message);
  });

  page.on('response', res => {
    if (res.status() >= 400) {
      console.log(`[HTTP ${res.status()}] ${res.url()}`);
    }
  });

  try {
    const res = await page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 });
    console.log(`Status: ${res?.status()}, Final URL: ${page.url()}`);
    const text = await page.evaluate(() => document.body.innerText);
    if (text.includes('页面同步或运行异常')) {
      console.log('❌ 页面依然显示“页面同步或运行异常”！');
      console.log('全文片段:', text.slice(0, 300));
    } else {
      console.log('✅ 页面正常渲染！');
      console.log('页面前 200 字:', text.slice(0, 200).replace(/\n/g, ' '));
    }
  } catch (e) {
    console.error('加载异常:', e.message);
  } finally {
    await browser.close();
  }
}

async function run() {
  await check('https://www.koyosim.com/account');
  await check('https://www.koyosim.com/community');
  await check('https://www.koyosim.com/creations');
}

run().catch(console.error);
