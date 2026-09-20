import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';

// --- IP 转换工具函数 ---

export function ipToInt(ip) {
  if (!ip || typeof ip !== 'string') return null;
  const parts = ip.trim().split('.');
  if (parts.length !== 4) return null;
  const n0 = Number(parts[0]), n1 = Number(parts[1]), n2 = Number(parts[2]), n3 = Number(parts[3]);
  if ([n0, n1, n2, n3].some((n) => isNaN(n) || n < 0 || n > 255)) return null;
  return ((n0 << 24) | (n1 << 16) | (n2 << 8) | n3) >>> 0;
}

export function intToIp(int) {
  return [
    (int >>> 24) & 255,
    (int >>> 16) & 255,
    (int >>> 8) & 255,
    int & 255,
  ].join('.');
}

export function ipv6ToBigInt(ip) {
  if (!ip || typeof ip !== 'string') return null;
  const clean = ip.trim();
  if (!clean.includes(':')) return null;
  const parts = clean.split('::');
  if (parts.length > 2) return null;

  let full = [];
  if (parts.length === 2) {
    const left = parts[0] ? parts[0].split(':') : [];
    const right = parts[1] ? parts[1].split(':') : [];
    const missing = 8 - (left.length + right.length);
    if (missing < 0) return null;
    full = [...left, ...Array(missing).fill('0'), ...right];
  } else {
    full = clean.split(':');
  }

  if (full.length !== 8) return null;

  try {
    let big = 0n;
    for (let i = 0; i < 8; i++) {
      const val = parseInt(full[i] || '0', 16);
      if (isNaN(val) || val < 0 || val > 0xffff) return null;
      big = (big << 16n) | BigInt(val);
    }
    return big;
  } catch {
    return null;
  }
}

// --- 预编译 IP 范围加载与内存缓存 ---

let cachedV4Ranges = null;
let cachedV6Ranges = null;
let cachedMetadata = null;

function getRangesFilePaths() {
  return [
    path.join(process.cwd(), 'data', 'china_ip_ranges.json'),
    path.join(process.cwd(), 'lib', 'security', 'china_ip_ranges.json'),
  ];
}

export function loadChinaIpRanges(forceReload = false) {
  if (!forceReload && cachedV4Ranges && cachedV6Ranges) {
    return { v4Ranges: cachedV4Ranges, v6Ranges: cachedV6Ranges, metadata: cachedMetadata };
  }

  let foundPath = null;
  for (const p of getRangesFilePaths()) {
    if (fs.existsSync(p)) {
      foundPath = p;
      break;
    }
  }

  if (!foundPath) {
    return { v4Ranges: [], v6Ranges: [], metadata: null };
  }

  try {
    const content = fs.readFileSync(foundPath, 'utf-8');
    const data = JSON.parse(content);
    cachedV4Ranges = data.v4Ranges || [];
    cachedV6Ranges = (data.v6Ranges || []).map(([sHex, eHex]) => [
      BigInt('0x' + sHex),
      BigInt('0x' + eHex),
    ]);
    cachedMetadata = {
      updatedAt: data.updatedAt,
      source: data.source,
      rawV4Count: data.rawV4Count,
      mergedV4Count: data.mergedV4Count,
      rawV6Count: data.rawV6Count,
      mergedV6Count: data.mergedV6Count,
    };
    return { v4Ranges: cachedV4Ranges, v6Ranges: cachedV6Ranges, metadata: cachedMetadata };
  } catch (err) {
    console.error('[chinaIpBlock] 加载 china_ip_ranges.json 失败:', err);
    return { v4Ranges: [], v6Ranges: [], metadata: null };
  }
}

// 首次加载
loadChinaIpRanges();

// --- 快速二分查找 ---

export function isIpV4InChina(ipStr) {
  const int = ipToInt(ipStr);
  if (int === null) return false;

  const { v4Ranges } = loadChinaIpRanges();
  if (!v4Ranges || v4Ranges.length === 0) return false;

  let low = 0;
  let high = v4Ranges.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const [start, end] = v4Ranges[mid];
    if (int < start) {
      high = mid - 1;
    } else if (int > end) {
      low = mid + 1;
    } else {
      return true;
    }
  }
  return false;
}

export function isIpV6InChina(ipStr) {
  const big = ipv6ToBigInt(ipStr);
  if (big === null) return false;

  const { v6Ranges } = loadChinaIpRanges();
  if (!v6Ranges || v6Ranges.length === 0) return false;

  let low = 0;
  let high = v6Ranges.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const [start, end] = v6Ranges[mid];
    if (big < start) {
      high = mid - 1;
    } else if (big > end) {
      low = mid + 1;
    } else {
      return true;
    }
  }
  return false;
}

// --- 请求头与真实 IP 提取 ---

export function getClientIp(headers) {
  if (!headers) return '127.0.0.1';

  const getHeader = (name) => {
    if (typeof headers.get === 'function') return headers.get(name);
    return headers[name] || headers[name.toLowerCase()];
  };

  // 0. 支持开发测试或模拟特定 IP 进行拦截自测 (x-test-ip)
  const testIp = getHeader('x-test-ip');
  if (testIp) return testIp.trim();

  // 1. Cloudflare 真实客户端 IP
  const cfIp = getHeader('cf-connecting-ip');
  if (cfIp) return cfIp.trim();

  // 2. Nginx 反向代理真实客户端 IP ($remote_addr)
  const realIp = getHeader('x-real-ip');
  if (realIp) return realIp.trim();

  // 3. X-Forwarded-For (多层代理遍历首个非局域网公网 IP)
  const forwarded = getHeader('x-forwarded-for');
  if (forwarded) {
    const list = forwarded.split(',').map((s) => s.trim()).filter(Boolean);
    const nonPrivate = list.find((ip) => !isLoopbackOrPrivate(ip));
    if (nonPrivate) return nonPrivate;
    if (list[0]) return list[0];
  }

  // 4. 其他客户端标头备用
  const clientIp = getHeader('x-client-ip');
  if (clientIp) return clientIp.trim();

  return '127.0.0.1';
}

// --- 内网与回环地址放行判定 ---

export function isLoopbackOrPrivate(ip) {
  if (!ip) return true;
  const clean = ip.trim();

  // IPv6 回环与私网
  if (clean === '::1' || clean === '::' || clean.toLowerCase().startsWith('fc') || clean.toLowerCase().startsWith('fd') || clean.toLowerCase().startsWith('fe80')) {
    return true;
  }

  // IPv4 回环与私有地址
  const int = ipToInt(clean);
  if (int === null) return false;

  // 127.0.0.0/8 (127.0.0.0 - 127.255.255.255)
  if ((int >>> 24) === 127) return true;
  // 10.0.0.0/8 (10.0.0.0 - 10.255.255.255)
  if ((int >>> 24) === 10) return true;
  // 172.16.0.0/12 (172.16.0.0 - 172.31.255.255)
  if ((int >>> 20) === ((172 << 4) | 1)) return true;
  // 192.168.0.0/16 (192.168.0.0 - 192.168.255.255)
  if ((int >>> 16) === ((192 << 8) | 168)) return true;
  // 169.254.0.0/16 Link-Local
  if ((int >>> 16) === ((169 << 8) | 254)) return true;
  // 0.0.0.0
  if (int === 0) return true;

  return false;
}

// --- 白名单校验支持 (单IP与CIDR) ---

export function isIpInWhitelist(ip, whitelistStr) {
  if (!whitelistStr || typeof whitelistStr !== 'string') return false;
  const targetInt = ipToInt(ip);

  const entries = whitelistStr
    .split(/[\n,;]/)
    .map((s) => s.trim())
    .filter(Boolean);

  for (const entry of entries) {
    if (entry === ip) return true;

    // 支持 IPv4 CIDR 比对
    if (entry.includes('/') && targetInt !== null) {
      const [subnet, prefixStr] = entry.split('/');
      const prefix = parseInt(prefixStr, 10);
      const subnetInt = ipToInt(subnet);
      if (subnetInt !== null && !isNaN(prefix) && prefix >= 0 && prefix <= 32) {
        const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
        if ((targetInt & mask) === (subnetInt & mask)) {
          return true;
        }
      }
    }
  }

  return false;
}

// --- 综合中国大陆 IP 探测 ---

export function isChinaIp(clientIp, headers = null) {
  if (!clientIp) return false;

  // 1. 优先检测 Cloudflare / CDN 国家标识头 (0 延迟极速判定)
  if (headers) {
    const getHeader = (name) => {
      if (typeof headers.get === 'function') return headers.get(name);
      return headers[name] || headers[name.toLowerCase()];
    };
    const cfCountry = getHeader('cf-ipcountry');
    if (cfCountry && cfCountry.toUpperCase() === 'CN') return true;

    const xCountry = getHeader('x-country-code') || getHeader('x-geoip-country');
    if (xCountry && xCountry.toUpperCase() === 'CN') return true;
  }

  // 2. 内网或回环地址永不视为中国大陆外网阻断 IP
  if (isLoopbackOrPrivate(clientIp)) return false;

  // 3. IPv4 二分匹配
  if (clientIp.includes('.')) {
    return isIpV4InChina(clientIp);
  }

  // 4. IPv6 二分匹配
  if (clientIp.includes(':')) {
    return isIpV6InChina(clientIp);
  }

  return false;
}

// --- 配置缓存与持久化 ---

let configCache = null;
let configCacheTime = 0;
const CONFIG_CACHE_TTL_MS = 2000; // 2 秒内存缓存

export function invalidateChinaIpConfigCache() {
  configCache = null;
  configCacheTime = 0;
}

export function updateCachedConfig(newConfig) {
  configCache = newConfig;
  configCacheTime = Date.now();
}

function getStateFilePaths() {
  return [
    path.join(process.cwd(), 'data', 'ip_block_state.json'),
    path.join(process.cwd(), 'lib', 'security', 'ip_block_state.json'),
  ];
}

export function saveChinaIpBlockStateToFile(state) {
  for (const file of getStateFilePaths()) {
    try {
      const dir = path.dirname(file);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(file, JSON.stringify(state, null, 2));
    } catch (err) {
      console.warn('[chinaIpBlock] 写入 state 文件失败:', err.message);
    }
  }
  updateCachedConfig(state);
}

export function getChinaIpBlockConfig() {
  const now = Date.now();
  if (configCache && now - configCacheTime < CONFIG_CACHE_TTL_MS) {
    return configCache;
  }

  const defaultConfig = {
    enabled: true, // 默认开启以保障境内访问控制
    action: 'forbidden', // 'forbidden' | 'icp_notice'
    custom_message: '',
    block_api: true,
    whitelist_ips: '127.0.0.1',
    last_synced_at: cachedMetadata?.updatedAt || null,
    total_cidrs: (cachedMetadata?.rawV4Count || 8792) + (cachedMetadata?.rawV6Count || 2043),
  };

  for (const p of getStateFilePaths()) {
    if (fs.existsSync(p)) {
      try {
        const raw = fs.readFileSync(p, 'utf-8');
        const parsed = JSON.parse(raw);
        configCache = { ...defaultConfig, ...parsed };
        configCacheTime = now;
        return configCache;
      } catch (err) {
        console.warn('[chinaIpBlock] 解析 state 文件失败:', err.message);
      }
    }
  }

  configCache = defaultConfig;
  configCacheTime = now;
  return configCache;
}

// --- HTML 拦截响应模板 ---

// 返回浏览器/服务器默认标准的 403 Forbidden 页面，不包含任何备案、ICP、品牌或自定义提示
export function renderForbiddenHtml() {
  return `<html>
<head><title>403 Forbidden</title></head>
<body>
<center><h1>403 Forbidden</h1></center>
<hr><center>nginx</center>
</body>
</html>`;
}

export function renderIcpNoticeHtml(customMessage) {
  const msg = customMessage || '网站正在办理工信部ICP备案审核，暂不对中国大陆境内用户提供访问服务。备案通过后将正式开放，敬请期待。';
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow, noarchive">
  <title>网站备案审核中 · 暂停访问公告</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
      background-color: #050505;
      color: #ffffff;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      overflow-x: hidden;
    }
    .container {
      position: relative;
      max-width: 540px;
      width: 90%;
      margin: 40px auto;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 28px;
      padding: 48px 36px;
      backdrop-filter: blur(24px);
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7);
      text-align: center;
    }
    .icon-box {
      width: 64px;
      height: 64px;
      margin: 0 auto 24px;
      border-radius: 20px;
      background: rgba(34, 211, 238, 0.1);
      border: 1px solid rgba(34, 211, 238, 0.3);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #22d3ee;
    }
    .tag {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.2em;
      color: #22d3ee;
      margin-bottom: 8px;
    }
    h1 {
      font-size: 26px;
      font-weight: 900;
      letter-spacing: -0.02em;
      margin: 0 0 16px 0;
      color: #ffffff;
    }
    .desc {
      font-size: 14px;
      line-height: 1.7;
      color: rgba(255, 255, 255, 0.65);
      margin: 0 0 32px 0;
    }
    .info-panel {
      background: rgba(0, 0, 0, 0.4);
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 16px;
      padding: 16px 20px;
      text-align: left;
      font-size: 12px;
      color: rgba(255, 255, 255, 0.5);
      line-height: 1.6;
      margin-bottom: 28px;
    }
    .info-row {
      display: flex;
      justify-content: space-between;
      padding: 4px 0;
    }
    .info-label { color: rgba(255, 255, 255, 0.4); }
    .info-value { color: rgba(255, 255, 255, 0.8); font-weight: 500; }
    .footer {
      font-size: 12px;
      color: rgba(255, 255, 255, 0.3);
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon-box">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        <path d="m9 12 2 2 4-4"/>
      </svg>
    </div>

    <div class="tag">ICP Filing Review in Progress</div>
    <h1>网站备案建设中</h1>
    <p class="desc">${escapeHtml(msg)}</p>

    <div class="info-panel">
      <div class="info-row">
        <span class="info-label">监管合规事项</span>
        <span class="info-value">中华人民共和国工业和信息化部网站备案</span>
      </div>
      <div class="info-row">
        <span class="info-label">访问控制范围</span>
        <span class="info-value">中国大陆地区 (Mainland China)</span>
      </div>
      <div class="info-row">
        <span class="info-label">当前开放状态</span>
        <span class="info-value" style="color: #fbbf24;">待管局核准后开放</span>
      </div>
    </div>

    <div class="footer">
      © ${new Date().getFullYear()} KoyoSIM AI Studio · 备案前暂停境内服务
    </div>
  </div>
</body>
</html>`;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// --- 公域最新 IP 库在线拉取与同步 ---

function httpsGetText(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return httpsGetText(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error('HTTP status ' + res.statusCode + ' for ' + url));
      }
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

export async function syncLatestChinaIpList() {
  const sources = [
    {
      name: 'GitHub Raw (mayaxcn/china-ip-list)',
      v4: 'https://raw.githubusercontent.com/mayaxcn/china-ip-list/master/chn_ip.txt',
      v6: 'https://raw.githubusercontent.com/mayaxcn/china-ip-list/master/chn_ip_v6.txt',
    },
    {
      name: 'jsDelivr CDN Mirror',
      v4: 'https://cdn.jsdelivr.net/gh/mayaxcn/china-ip-list@master/chn_ip.txt',
      v6: 'https://cdn.jsdelivr.net/gh/mayaxcn/china-ip-list@master/chn_ip_v6.txt',
    },
  ];

  let v4Text = '';
  let v6Text = '';
  let usedSource = '';

  for (const src of sources) {
    try {
      v4Text = await httpsGetText(src.v4);
      v6Text = await httpsGetText(src.v6);
      usedSource = src.name;
      break;
    } catch (err) {
      console.warn(`[chinaIpBlock] 从 ${src.name} 拉取失败，尝试备选镜像:`, err.message);
    }
  }

  if (!v4Text) {
    throw new Error('无法连接公域 IP 库源，请检查服务器网络。');
  }

  // 解析并合并 IPv4
  const v4Lines = v4Text.split('\n').map((l) => l.trim()).filter(Boolean);
  const rawV4 = [];
  for (const l of v4Lines) {
    const [s, e] = l.split(/\s+/);
    if (s && e) {
      const sInt = ipToInt(s);
      const eInt = ipToInt(e);
      if (sInt !== null && eInt !== null) {
        rawV4.push([sInt, eInt]);
      }
    }
  }
  rawV4.sort((a, b) => a[0] - b[0]);
  const mergedV4 = [];
  for (const r of rawV4) {
    if (!mergedV4.length) {
      mergedV4.push(r);
      continue;
    }
    const prev = mergedV4[mergedV4.length - 1];
    if (r[0] <= prev[1] + 1) {
      prev[1] = Math.max(prev[1], r[1]);
    } else {
      mergedV4.push(r);
    }
  }

  // 解析并合并 IPv6
  const v6Lines = v6Text.split('\n').map((l) => l.trim()).filter(Boolean);
  const rawV6 = [];
  for (const l of v6Lines) {
    const [s, e] = l.split(/\s+/);
    if (s && e) {
      const sBig = ipv6ToBigInt(s);
      const eBig = ipv6ToBigInt(e);
      if (sBig !== null && eBig !== null) {
        rawV6.push([sBig, eBig]);
      }
    }
  }
  rawV6.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const mergedV6 = [];
  for (const r of rawV6) {
    if (!mergedV6.length) {
      mergedV6.push(r);
      continue;
    }
    const prev = mergedV6[mergedV6.length - 1];
    if (r[0] <= prev[1] + 1n) {
      if (r[1] > prev[1]) prev[1] = r[1];
    } else {
      mergedV6.push(r);
    }
  }

  const v6HexRanges = mergedV6.map(([s, e]) => [s.toString(16), e.toString(16)]);

  const updatedData = {
    updatedAt: new Date().toISOString(),
    source: `${usedSource} (APNIC Delegated)`,
    rawV4Count: rawV4.length,
    mergedV4Count: mergedV4.length,
    rawV6Count: rawV6.length,
    mergedV6Count: mergedV6.length,
    v4Ranges: mergedV4,
    v6Ranges: v6HexRanges,
  };

  for (const filePath of getRangesFilePaths()) {
    try {
      const dirPath = path.dirname(filePath);
      if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(updatedData));
    } catch (err) {
      console.warn('[chinaIpBlock] 写入 IP 网段文件失败:', err.message);
    }
  }

  // 热重载内存缓存
  loadChinaIpRanges(true);

  return {
    success: true,
    updatedAt: updatedData.updatedAt,
    source: updatedData.source,
    rawV4Count: rawV4.length,
    mergedV4Count: mergedV4.length,
    rawV6Count: rawV6.length,
    mergedV6Count: mergedV6.length,
    totalCidrs: rawV4.length + rawV6.length,
  };
}
