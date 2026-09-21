import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const puppeteer = require('C:/Users/weysl/.gemini/antigravity/brain/a4cff523-e938-46b4-bf8e-7536e7eea510/scratch/node_modules/puppeteer');
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const targetBaseUrl = 'https://www.koyosim.com';
const outputDir = path.join(process.cwd(), 'tests', 'visual_baselines');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

async function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

const keyPages = [
  { name: 'image_studio', path: '/studio/image' },
  { name: 'video_studio', path: '/studio/video' },
  { name: 'cinema_studio', path: '/studio/cinema' },
  { name: 'audio_studio', path: '/studio/audio' },
  { name: 'lipsync_studio', path: '/studio/lipsync' },
  { name: 'workflows_studio', path: '/studio/workflows' },
];

async function captureBaselines() {
  console.log('Generating Visual Regression Baselines...');
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  const page = await browser.newPage();

  for (const item of keyPages) {
    console.log(`Capturing baseline for: ${item.name} (${item.path})`);
    try {
      await page.goto(`${targetBaseUrl}${item.path}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await sleep(2000);

      // 1. Desktop Baseline (1920x1080)
      await page.setViewport({ width: 1920, height: 1080 });
      await page.screenshot({
        path: path.join(outputDir, `baseline_${item.name}_desktop.png`),
      });

      // 2. Mobile Baseline (390x844)
      await page.setViewport({ width: 390, height: 844 });
      await page.screenshot({
        path: path.join(outputDir, `baseline_${item.name}_mobile.png`),
      });
    } catch (err) {
      console.warn(`Failed capturing ${item.name}:`, err.message);
    }
  }

  await browser.close();
  console.log('Visual baselines successfully saved in:', outputDir);
}

captureBaselines().catch((err) => {
  console.error('Visual regression error:', err);
  process.exit(1);
});
