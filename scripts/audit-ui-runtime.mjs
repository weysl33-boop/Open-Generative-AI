import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const puppeteer = require('C:/Users/weysl/.gemini/antigravity/brain/a4cff523-e938-46b4-bf8e-7536e7eea510/scratch/node_modules/puppeteer');

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const viewports = [
  { name: '1920x1080', width: 1920, height: 1080, type: 'desktop' },
  { name: '1600x900', width: 1600, height: 900, type: 'desktop' },
  { name: '1440x900', width: 1440, height: 900, type: 'desktop' },
  { name: '1366x768', width: 1366, height: 768, type: 'desktop' },
  { name: '1280x800', width: 1280, height: 800, type: 'desktop' },
  { name: '1024x768', width: 1024, height: 768, type: 'tablet' },
  { name: '768x1024', width: 768, height: 1024, type: 'tablet' },
  { name: '430x932', width: 430, height: 932, type: 'mobile' },
  { name: '390x844', width: 390, height: 844, type: 'mobile' },
  { name: '375x812', width: 375, height: 812, type: 'mobile' },
];

const targetBaseUrl = 'https://www.koyosim.com';
const studios = [
  'image',
  'headshot',
  'layers',
  'video',
  'audio',
  'clipping',
  'motion-control',
  'vibe-motion',
  'lipsync',
  'body-swap',
  'cinema',
  'marketing',
  'workflows',
  'agents',
  'design-agent',
  'apps',
  'ai-influencer',
];

const auditResults = {
  testedAt: new Date().toISOString(),
  targetBaseUrl,
  viewportsTested: viewports.length,
  studiosTested: studios.length,
  responsiveAnomalies: [],
  computedStylesSamples: {},
  interactiveElements: {},
};

const outputDir = path.join(process.cwd(), 'audit_screenshots');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

async function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

async function run() {
  console.log('Launching headless browser with system Chrome via Puppeteer...');
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--window-size=1920,1080',
    ],
  });

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36');

  // 1. Visit Studio main page
  console.log('Navigating to', `${targetBaseUrl}/studio`);
  try {
    await page.goto(`${targetBaseUrl}/studio`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(3000);
  } catch (e) {
    console.warn('Navigation note:', e.message);
  }

  // Sample computed styles on Desktop (1920x1080)
  console.log('Sampling computed styles for key components on 1920x1080...');
  await page.setViewport({ width: 1920, height: 1080 });
  const sampledStyles = await page.evaluate(() => {
    function getStyles(sel) {
      const el = document.querySelector(sel);
      if (!el) return null;
      const cs = window.getComputedStyle(el);
      return {
        selector: sel,
        tagName: el.tagName,
        fontFamily: cs.fontFamily,
        fontSize: cs.fontSize,
        fontWeight: cs.fontWeight,
        lineHeight: cs.lineHeight,
        letterSpacing: cs.letterSpacing,
        color: cs.color,
        backgroundColor: cs.backgroundColor,
        borderRadius: cs.borderRadius,
        borderWidth: cs.borderWidth,
        borderColor: cs.borderColor,
        boxShadow: cs.boxShadow,
        height: cs.height,
        width: cs.width,
        padding: cs.padding,
        margin: cs.margin,
        gap: cs.gap,
        zIndex: cs.zIndex,
      };
    }

    return {
      body: getStyles('body'),
      header: getStyles('header') || getStyles('nav'),
      primaryButton: getStyles('button.bg-\\[\\#22d3ee\\]') || getStyles('button[type="submit"]') || getStyles('button:not([disabled])'),
      promptComposer: getStyles('.bottom-4') || getStyles('textarea'),
      dropdown: getStyles('[role="combobox"]') || getStyles('select') || getStyles('[data-radix-popper-content-wrapper]'),
      card: getStyles('.rounded-2xl') || getStyles('.rounded-xl'),
    };
  });
  auditResults.computedStylesSamples = sampledStyles;

  // 2. Responsive scan across 10 viewports
  for (const vp of viewports) {
    console.log(`Scanning viewport: ${vp.name} (${vp.type})`);
    await page.setViewport({ width: vp.width, height: vp.height });
    await sleep(800);

    const overflowInfo = await page.evaluate(() => {
      const docW = document.documentElement.scrollWidth;
      const winW = window.innerWidth;
      const hasHorizontalScroll = docW > winW;
      
      const overflowing = [];
      const all = document.querySelectorAll('*');
      for (const el of all) {
        const rect = el.getBoundingClientRect();
        if (rect.right > winW + 2) {
          overflowing.push({
            tag: el.tagName,
            className: el.className ? String(el.className).slice(0, 80) : '',
            right: Math.round(rect.right),
            windowWidth: winW,
          });
          if (overflowing.length >= 5) break;
        }
      }
      return { hasHorizontalScroll, docW, winW, overflowing };
    });

    if (overflowInfo.hasHorizontalScroll) {
      auditResults.responsiveAnomalies.push({
        viewport: vp.name,
        type: vp.type,
        issue: 'Horizontal overflow detected',
        detail: overflowInfo,
      });
    }

    await page.screenshot({
      path: path.join(outputDir, `studio_${vp.name}.png`),
    });
  }

  // 3. Scan each studio route on desktop and mobile
  console.log('Testing sub-studio routes and tabs...');
  for (const st of studios) {
    const url = `${targetBaseUrl}/studio/${st}`;
    console.log(`Checking Studio: /studio/${st}`);
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await sleep(1200);

      // Desktop
      await page.setViewport({ width: 1440, height: 900 });
      await page.screenshot({
        path: path.join(outputDir, `studio_${st}_desktop.png`),
      });

      // Mobile
      await page.setViewport({ width: 390, height: 844 });
      await page.screenshot({
        path: path.join(outputDir, `studio_${st}_mobile.png`),
      });
    } catch (err) {
      console.warn(`Error scanning /studio/${st}:`, err.message);
    }
  }

  await browser.close();

  fs.writeFileSync(path.join(process.cwd(), 'runtime_ui_audit_result.json'), JSON.stringify(auditResults, null, 2));
  console.log('Runtime UI Audit completed. Anomalies found:', auditResults.responsiveAnomalies.length);
}

run().catch((err) => {
  console.error('Runtime audit error:', err);
  process.exit(1);
});
