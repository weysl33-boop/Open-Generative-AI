const puppeteer = (await import('file:///C:/Users/weysl/.gemini/antigravity/brain/a4cff523-e938-46b4-bf8e-7536e7eea510/scratch/node_modules/puppeteer/lib/puppeteer/puppeteer.js')).default;

async function capture() {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--no-sandbox', '--disable-gpu', '--window-size=1280,1024']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 1024 });
  await page.setCookie({
    name: 'ko_session',
    value: '3wsDG9wJ6WFnFN5P27IrabrLItkTSQbbpKG6PzRVHf8',
    domain: 'www.koyosim.com',
    path: '/',
    httpOnly: true,
    secure: true
  });

  await page.goto('https://www.koyosim.com/account', { waitUntil: 'networkidle2', timeout: 20000 });
  await page.screenshot({ path: 'C:/Users/weysl/.gemini/antigravity/brain/d44323ff-291f-4d12-bcbd-df83dc211679/account_preview.png', fullPage: true });
  console.log('Screenshot saved!');
  await browser.close();
}

capture().catch(console.error);
