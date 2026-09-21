import { chromium } from 'playwright';

async function fullTest() {
  console.log('=== 开始全面模拟用户端到端语言切换交互 ===');
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'zh-CN', // 模拟中国用户的浏览器
  });

  const page = await context.newPage();

  // 1. 模拟中国用户第一次输入 www.koyosim.com
  console.log('\n--- 步骤 1: 中文浏览器用户访问 https://www.koyosim.com ---');
  await page.goto('https://www.koyosim.com', { waitUntil: 'networkidle' });
  console.log('当前 URL:', page.url());
  let cookies = await context.cookies();
  console.log('当前 Cookies:', cookies.map(c => `${c.name}=${c.value}`).join('; '));
  let headerText = await page.$eval('header', el => el.innerText.replace(/\s+/g, ' '));
  console.log('当前 Header 文本:', headerText);

  // 2. 查找小地球并点击 (第一次切换: 期望从英文切为中文)
  console.log('\n--- 步骤 2: 点击小地球切换语言 (第 1 次) ---');
  let earthBtn = await page.$('button[aria-label*="Switch"], button[aria-label*="切换"], button[title*="切换"], button[title*="Current"]');
  if (!earthBtn) throw new Error('未找到小地球按钮');
  console.log('点击小地球按钮前的 title:', await earthBtn.getAttribute('title'));
  
  await Promise.all([
    page.waitForNavigation({ timeout: 8000 }).catch(() => console.log('未发生硬导航')),
    earthBtn.click(),
  ]);
  await page.waitForTimeout(2000);
  console.log('第 1 次点击后 URL:', page.url());
  cookies = await context.cookies();
  console.log('第 1 次点击后 Cookies:', cookies.map(c => `${c.name}=${c.value}`).join('; '));
  headerText = await page.$eval('header', el => el.innerText.replace(/\s+/g, ' '));
  console.log('第 1 次点击后 Header 文本:', headerText);

  // 3. 再次查找小地球并点击 (第二次切换: 期望从中文切回英文)
  console.log('\n--- 步骤 3: 再次点击小地球切换语言 (第 2 次，切回英文) ---');
  earthBtn = await page.$('button[aria-label*="Switch"], button[aria-label*="切换"], button[title*="切换"], button[title*="Current"]');
  if (!earthBtn) throw new Error('第 2 次未找到小地球按钮');
  console.log('点击小地球按钮前的 title:', await earthBtn.getAttribute('title'));
  
  await Promise.all([
    page.waitForNavigation({ timeout: 8000 }).catch(() => console.log('未发生硬导航')),
    earthBtn.click(),
  ]);
  await page.waitForTimeout(2000);
  console.log('第 2 次点击后 URL:', page.url());
  cookies = await context.cookies();
  console.log('第 2 次点击后 Cookies:', cookies.map(c => `${c.name}=${c.value}`).join('; '));
  headerText = await page.$eval('header', el => el.innerText.replace(/\s+/g, ' '));
  console.log('第 2 次点击后 Header 文本:', headerText);

  // 4. 再次点击切回中文
  console.log('\n--- 步骤 4: 第 3 次点击小地球 (切回中文) ---');
  earthBtn = await page.$('button[aria-label*="Switch"], button[aria-label*="切换"], button[title*="切换"], button[title*="Current"]');
  await Promise.all([
    page.waitForNavigation({ timeout: 8000 }).catch(() => console.log('未发生硬导航')),
    earthBtn.click(),
  ]);
  await page.waitForTimeout(2000);
  console.log('第 3 次点击后 URL:', page.url());

  // 5. 模拟用户按 F5 刷新
  console.log('\n--- 步骤 5: 用户按 F5 刷新页面 ---');
  await page.reload({ waitUntil: 'networkidle' });
  console.log('刷新后 URL:', page.url());
  headerText = await page.$eval('header', el => el.innerText.replace(/\s+/g, ' '));
  console.log('刷新后 Header 文本:', headerText);

  // 6. 模拟新标签页直接打开 https://www.koyosim.com/
  console.log('\n--- 步骤 6: 打开新标签页访问根路径 https://www.koyosim.com/ ---');
  const page2 = await context.newPage();
  await page2.goto('https://www.koyosim.com/', { waitUntil: 'networkidle' });
  console.log('根路径访问后最终 URL:', page2.url());
  headerText = await page2.$eval('header', el => el.innerText.replace(/\s+/g, ' '));
  console.log('新页面 Header 文本:', headerText);

  // 7. 测试其他页面 (比如 /community)
  console.log('\n--- 步骤 7: 访问社区页面 https://www.koyosim.com/community ---');
  await page2.goto('https://www.koyosim.com/community', { waitUntil: 'networkidle' });
  console.log('社区页面 URL:', page2.url());
  let commHeaderText = await page2.$eval('header', el => el.innerText.replace(/\s+/g, ' '));
  console.log('社区页面 Header 文本:', commHeaderText);

  // 在社区页面点击小地球
  let commEarthBtn = await page2.$('button[aria-label*="Switch"], button[aria-label*="切换"], button[title*="切换"], button[title*="Current"]');
  if (commEarthBtn) {
    console.log('社区页面找到小地球，点击...');
    await Promise.all([
      page2.waitForNavigation({ timeout: 8000 }).catch(() => {}),
      commEarthBtn.click(),
    ]);
    await page2.waitForTimeout(2000);
    console.log('社区点击后 URL:', page2.url());
    cookies = await context.cookies();
    console.log('社区点击后 Cookies:', cookies.map(c => `${c.name}=${c.value}`).join('; '));
  } else {
    console.log('社区页面未找到小地球按钮！');
  }

  await browser.close();
  console.log('\n=== 端到端测试结束 ===');
}

fullTest().catch(err => {
  console.error('测试异常:', err);
  process.exit(1);
});
