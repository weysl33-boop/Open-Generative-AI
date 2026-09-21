import { chromium } from 'playwright';

async function test() {
  console.log('1. 启动 Chromium 浏览器...');
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'zh-CN',
  });

  const page = await context.newPage();

  const consoleLogs = [];
  page.on('console', msg => {
    consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
    console.log(`[Console ${msg.type()}]:`, msg.text());
  });

  page.on('pageerror', err => {
    console.log('[PageError]:', err.message);
  });

  console.log('2. 访问 https://www.koyosim.com ...');
  const res = await page.goto('https://www.koyosim.com', { waitUntil: 'networkidle' });
  console.log('响应状态码:', res.status());
  console.log('重定向后最终 URL:', page.url());

  const cookies = await context.cookies();
  console.log('当前 Cookies:', cookies.map(c => `${c.name}=${c.value}`).join('; '));

  // 获取页面 Title
  console.log('页面标题:', await page.title());

  // 获取页面上的主要导航文字
  const navLinks = await page.$$eval('header a, header nav, aside nav', els => els.map(e => e.innerText.trim()).filter(Boolean));
  console.log('导航区域文字:', navLinks);

  // 寻找语言切换按钮
  console.log('3. 查找所有按钮...');
  const buttonsInfo = await page.$$eval('button', btns => btns.map((b, idx) => ({
    idx,
    text: b.innerText.trim(),
    ariaLabel: b.getAttribute('aria-label'),
    title: b.getAttribute('title'),
    className: b.className,
    visible: b.offsetWidth > 0 && b.offsetHeight > 0,
  })));
  console.log('所有可见按钮数量:', buttonsInfo.filter(b => b.visible).length);
  console.log('所有按钮详情:', JSON.stringify(buttonsInfo.filter(b => b.visible), null, 2));

  // 寻找小地球按钮
  const earthButton = await page.$('button[aria-label*="切换语言"], button[aria-label*="Switch"], button[title*="切换"], button[title*="Current"]');
  if (earthButton) {
    const btnTitle = await earthButton.getAttribute('title');
    const btnAria = await earthButton.getAttribute('aria-label');
    console.log(`4. 找到小地球按钮: title="${btnTitle}", aria-label="${btnAria}"`);
    console.log('准备点击小地球按钮...');
    
    // 点击并等待页面变化
    await Promise.all([
      page.waitForNavigation({ timeout: 5000 }).catch(() => console.log('未发生传统页面导航，可能是客户端路由跳转')),
      earthButton.click(),
    ]);

    await page.waitForTimeout(3000);
    console.log('点击后 URL:', page.url());
    const cookiesAfter = await context.cookies();
    console.log('点击后 Cookies:', cookiesAfter.map(c => `${c.name}=${c.value}`).join('; '));

    const navLinksAfter = await page.$$eval('header a, header nav, aside nav', els => els.map(e => e.innerText.trim()).filter(Boolean));
    console.log('点击后导航区域文字:', navLinksAfter);
  } else {
    console.log('4. 警告: 未找到小地球语言按钮！');
  }

  // 检查头像下拉菜单
  console.log('5. 检查登录/头像按钮...');
  const loginOrAvatar = await page.$('button[aria-label*="用户菜单"], button:has-text("登录"), button:has-text("Log in")');
  if (loginOrAvatar) {
    console.log('找到用户相关按钮:', await loginOrAvatar.innerText());
  }

  await browser.close();
  console.log('测试结束！');
}

test().catch(err => {
  console.error('测试失败:', err);
  process.exit(1);
});
