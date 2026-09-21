const puppeteer = (await import('file:///C:/Users/weysl/.gemini/antigravity/brain/a4cff523-e938-46b4-bf8e-7536e7eea510/scratch/node_modules/puppeteer/lib/puppeteer/puppeteer.js')).default;

async function checkLoggedIn() {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--no-sandbox', '--disable-gpu']
  });

  const page = await browser.newPage();
  await page.setCookie({
    name: 'ko_session',
    value: '3wsDG9wJ6WFnFN5P27IrabrLItkTSQbbpKG6PzRVHf8',
    domain: 'www.koyosim.com',
    path: '/',
    httpOnly: true,
    secure: true
  });

  page.on('console', msg => {
    if (msg.type() === 'error') console.log(`[Console Error]: ${msg.text()}`);
  });

  page.on('pageerror', err => {
    console.log(`[PageError]: ${err.stack || err.message}`);
  });

  const res = await page.goto('https://www.koyosim.com/account', { waitUntil: 'networkidle2', timeout: 20000 });
  console.log(`Status: ${res?.status()}, URL: ${page.url()}`);
  const text = await page.evaluate(() => document.body.innerText);
  console.log('登录态个人中心前 300 字:');
  console.log(text.slice(0, 300).replace(/\n/g, ' '));
  await browser.close();
}

checkLoggedIn().catch(console.error);
