import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const puppeteer = require('C:/Users/weysl/.gemini/antigravity/brain/a4cff523-e938-46b4-bf8e-7536e7eea510/scratch/node_modules/puppeteer');
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const targetUrl = 'https://www.koyosim.com/studio';
const outputDir = path.join(process.cwd(), 'audit_screenshots', 'interactions');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

async function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

async function run() {
  console.log('Testing interactive states (Modals, Dropdowns, Hover, Focus, Mobile Navigation)...');
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(3000);

  // 1. Capture base state
  await page.screenshot({ path: path.join(outputDir, '01_base_studio.png') });

  // 2. Click on Model Picker / Control Buttons
  console.log('Searching for Model Picker / Prompt controls...');
  const buttons = await page.$$('button');
  console.log(`Found ${buttons.length} buttons on page.`);

  let clickedPicker = false;
  for (const b of buttons) {
    const text = await page.evaluate((el) => el.innerText || el.getAttribute('aria-label') || '', b);
    if (text.toLowerCase().includes('model') || text.includes('Flux') || text.includes('SD') || text.includes('16:9') || text.includes('1:1')) {
      console.log('Clicking control:', text);
      await b.click();
      await sleep(1000);
      clickedPicker = true;
      await page.screenshot({ path: path.join(outputDir, '02_dropdown_popover_open.png') });
      break;
    }
  }

  // 3. Try to find API Key or Settings button
  console.log('Testing Header actions (API key, user settings)...');
  for (const b of buttons) {
    const text = await page.evaluate((el) => el.innerText || el.getAttribute('title') || '', b);
    if (text.includes('API') || text.includes('Key') || text.includes('Settings')) {
      console.log('Clicking action button:', text);
      await b.click();
      await sleep(1000);
      await page.screenshot({ path: path.join(outputDir, '03_modal_open.png') });
      break;
    }
  }

  // 4. Focus on prompt textarea
  const textarea = await page.$('textarea');
  if (textarea) {
    console.log('Focusing and typing in Prompt Composer textarea...');
    await textarea.click();
    await textarea.type('A cinematic photograph of an astronaut in neo-tokyo, 8k resolution');
    await sleep(800);
    await page.screenshot({ path: path.join(outputDir, '04_prompt_typing_focus.png') });
  }

  // 5. Mobile Navigation & Drawers
  console.log('Testing Mobile Viewport & Navigation Drawer...');
  await page.setViewport({ width: 390, height: 844 });
  await sleep(1000);
  await page.screenshot({ path: path.join(outputDir, '05_mobile_layout.png') });

  // Look for mobile hamburger menu
  const menuButtons = await page.$$('header button, nav button');
  for (const mb of menuButtons) {
    const rect = await mb.boundingBox();
    if (rect && rect.x < 100) {
      console.log('Clicking potential mobile menu button...');
      await mb.click();
      await sleep(800);
      await page.screenshot({ path: path.join(outputDir, '06_mobile_drawer_open.png') });
      break;
    }
  }

  await browser.close();
  console.log('Interactive states audit completed. Screenshots saved in', outputDir);
}

run().catch((err) => {
  console.error('Interactive audit error:', err);
  process.exit(1);
});
