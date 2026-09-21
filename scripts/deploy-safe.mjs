import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const rootDir = process.cwd();
const currentNext = path.join(rootDir, '.next');
const previousNext = path.join(rootDir, '.next-previous');
const artifactInput = String(process.env.DEPLOY_ARTIFACT_DIR || '').trim();
const serviceName = String(process.env.DEPLOY_SERVICE_NAME || 'koyosim.service').trim();

function resolveArtifact() {
  if (!artifactInput) throw new Error('DEPLOY_ARTIFACT_DIR is required; deploy a prebuilt, verified Next.js artifact.');
  const artifact = path.resolve(rootDir, artifactInput);
  const relative = path.relative(rootDir, artifact);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('DEPLOY_ARTIFACT_DIR must point to a directory inside the application release root.');
  }
  if (artifact === currentNext || artifact === previousNext) {
    throw new Error('DEPLOY_ARTIFACT_DIR must be a separate staging directory.');
  }
  if (!fs.existsSync(path.join(artifact, 'BUILD_ID'))) {
    throw new Error(`Next.js BUILD_ID is missing from deployment artifact: ${artifact}`);
  }
  return artifact;
}

function switchToArtifact(artifact) {
  fs.rmSync(previousNext, { recursive: true, force: true });
  if (fs.existsSync(currentNext)) fs.renameSync(currentNext, previousNext);
  try {
    fs.renameSync(artifact, currentNext);
  } catch (error) {
    if (fs.existsSync(previousNext) && !fs.existsSync(currentNext)) fs.renameSync(previousNext, currentNext);
    throw error;
  }
}

function rollbackRelease() {
  if (!fs.existsSync(previousNext)) return false;
  const failedNext = path.join(rootDir, `.next-failed-${Date.now()}`);
  if (fs.existsSync(currentNext)) fs.renameSync(currentNext, failedNext);
  fs.renameSync(previousNext, currentNext);
  return true;
}

async function fetchInternal(path, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: 3100,
      path,
      method: 'GET',
      headers: {
        'Host': 'www.koyosim.com',
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

  // 1. Accept only an artifact produced and checked by a sufficiently sized
  // build environment. Production hosts must not compile the application.
  const artifact = resolveArtifact();
  console.log('[Step 1/3] 校验预构建 Next.js 产物:', artifact);
  switchToArtifact(artifact);

  try {
    // 2. Restart only after the artifact has been atomically switched.
    console.log('[Step 2/3] 平滑重载应用服务...');
    execFileSync('sudo', ['systemctl', 'restart', serviceName], { stdio: 'inherit' });
    console.log('✓ ' + serviceName + ' 重启指令执行完毕');

    // 等待服务监听端口
    await new Promise(r => setTimeout(r, 2000));

    // 3. 部署自检
    console.log('[Step 3/3] 正在对新版本进行自动化连通性验收...');
    await verifyDeployment();
    console.log('==============================================');
    console.log('🎉 KoyoSIM AI Studio 预构建产物发布并通过连通性验收；旧版本保留在 .next-previous。');
    console.log('==============================================');
  } catch (err) {
    console.error('❌ 部署自检未通过:', err.message);
    if (rollbackRelease()) {
      try {
        execFileSync('sudo', ['systemctl', 'restart', serviceName], { stdio: 'inherit' });
        console.error('已回滚到 .next-previous 并重启服务；失败版本已保留为 .next-failed-* 供调查。');
      } catch (rollbackError) {
        console.error('自动回滚后重启失败，请立即按 .next-previous 手动恢复:', rollbackError.message);
      }
    } else {
      console.error('没有可用的旧版本目录，无法自动回滚。');
    }
    process.exitCode = 1;
  }
}

main().catch(err => {
  console.error('发布流水线异常终止:', err);
  process.exit(1);
});
