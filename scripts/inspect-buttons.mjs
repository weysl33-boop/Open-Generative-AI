import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto('https://www.koyosim.com/zh/studio', { waitUntil: 'networkidle' });
  
  const buttons = await page.$$eval('button', btns => btns.map((b, i) => ({
    i,
    text: b.innerText.trim().slice(0, 30),
    ariaLabel: b.getAttribute('aria-label'),
    title: b.getAttribute('title'),
    visible: b.offsetWidth > 0 && b.offsetHeight > 0,
    disabled: b.disabled,
    html: b.outerHTML.slice(0, 150),
  })));

  console.log('所有按钮列表 (共 ' + buttons.length + ' 个):');
  buttons.forEach(b => {
    console.log(`[#${b.i}] text="${b.text}" aria="${b.ariaLabel}" title="${b.title}" visible=${b.visible}`);
  });

  await browser.close();
}

main().catch(console.error);
