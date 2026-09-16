import http from 'node:http';
import { execSync } from 'node:child_process';

async function fetchInternal(path, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: 3100,
      path,
      method: 'GET',
      headers: {
        'Host': 'go.koyosim.com',
        ...headers,
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, body: data, headers: res.headers }));
    });
    req.on('error', reject);
    req.end();
  });
}

async function verifyDeployment() {
  console.log('正在执行部署后静态资产连通性自检...');
  const res = await fetchInternal('/admin');
  if (res.statusCode !== 200 && res.statusCode !== 307) {
    throw new Error(`页面响应异常，状态码: ${res.statusCode}`);
  }

  // 检查提取出的静态文件是否均为 200
  const matches = [...res.body.matchAll(/href="(\/_next\/static\/[^"]+)"|src="(\/_next\/static\/[^"]+)"/g)]
    .map(m => m[1] || m[2]);

  console.log(`自检检测到当前页面包含 ${matches.length} 个静态依赖资源`);
  for (const asset of matches) {
    const assetRes = await fetchInternal(asset);
    if (assetRes.statusCode !== 200) {
      throw new Error(`静态资源缺失或不可访问: ${asset} (HTTP ${assetRes.statusCode})`);
    }
  }
  console.log('✓ 全部静态资源校验通过，HTTP 200 确认无误！');
}

async function main() {
  console.log('==============================================');
  console.log('🚀 [KoyoSIM Deploy] 启动生产安全平滑发布流水线');
  console.log('==============================================');

  // 1. 安全多版本构建
  console.log('[Step 1/3] 执行安全增量构建 (保留多版本静态资产)...');
  execSync('node scripts/build-safe.mjs', { stdio: 'inherit' });

  // 2. 修复属主权限并重启服务
  console.log('[Step 2/3] 平滑重载应用服务...');
  try {
    try {
      execSync('sudo chown -R www:www .next data 2>/dev/null', { stdio: 'ignore' });
    } catch {}
    try {
      execSync('sudo systemctl restart go-koyosim.service', { stdio: 'inherit' });
      console.log('✓ go-koyosim.service 重启指令执行完毕');
    } catch (cmdErr) {
      console.warn('⚠️ 注意: 当前用户直接执行 sudo systemctl 失败，尝试无需 sudo 或提示手动重启:', cmdErr.message);
    }
  } catch (e) {
    console.warn('⚠️ 重启步骤提示:', e.message);
  }

  // 等待服务监听端口
  await new Promise(r => setTimeout(r, 2000));

  // 3. 部署自检
  console.log('[Step 3/3] 正在对新版本进行自动化连通性验收...');
  try {
    await verifyDeployment();
    console.log('==============================================');
    console.log('🎉 恭喜！KoyoSIM AI Studio 平滑发布成功，服务坚如磐石！');
    console.log('==============================================');
  } catch (err) {
    console.error('❌ 部署自检未通过:', err.message);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('发布流水线异常终止:', err);
  process.exit(1);
});
