#!/usr/bin/env node
/**
 * E2E Test Suite - Master Test Runner
 * 遵循 TEST_INFRA.md 设定的 4-Tier 体系与黑盒契约原则
 *
 * 支持参数：
 *   --tier=all | --tier=1 | --tier=2 | --tier=3 | --tier=4
 *   --feature=F01 ~ F19
 *   --filter=<keyword>
 *   --port=<port> (默认自动探测 3000 或 3100)
 *   --no-server (跳过 Web 服务自启探测)
 *   --help
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { getRegisteredSuites, clearRegisteredSuites, createTestContext } from './helpers/test-harness.mjs';
import * as dbVerifier from './helpers/db-verifier.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// 1. 加载环境变量
function loadEnv() {
  const envFiles = ['.env.local', '.env'];
  for (const file of envFiles) {
    const fullPath = path.join(projectRoot, file);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx > 0) {
          const k = trimmed.slice(0, eqIdx).trim();
          const v = trimmed.slice(eqIdx + 1).trim();
          if (!process.env[k]) process.env[k] = v;
        }
      }
    }
  }
}

loadEnv();

// 2. 解析 CLI 参数
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    tier: 'all',
    feature: null,
    filter: null,
    port: 3100,
    noServer: false,
    help: false,
  };

  for (const arg of args) {
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg.startsWith('--tier=')) {
      options.tier = arg.slice('--tier='.length).toLowerCase();
    } else if (arg.startsWith('--feature=')) {
      options.feature = arg.slice('--feature='.length).toUpperCase();
    } else if (arg.startsWith('--filter=')) {
      options.filter = arg.slice('--filter='.length);
    } else if (arg.startsWith('--port=')) {
      options.port = parseInt(arg.slice('--port='.length), 10);
    } else if (arg === '--no-server') {
      options.noServer = true;
    }
  }

  return options;
}

// 3. 递归探测测试文件
function findTestFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  let files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files = files.concat(findTestFiles(full));
    } else if (entry.isFile() && (entry.name.endsWith('.test.mjs') || entry.name.endsWith('.spec.mjs'))) {
      files.push(full);
    }
  }
  return files;
}

// 4. 服务健康与就绪探测
async function checkUrl(url) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1500);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    return res.status < 500;
  } catch {
    return false;
  }
}

async function ensureWebServer(requestedPort, noServer) {
  // 先探测常见端口 3000 和 requestedPort
  if (await checkUrl('http://127.0.0.1:3000/api/health') || await checkUrl('http://127.0.0.1:3000/terms')) {
    return { url: 'http://127.0.0.1:3000', spawnedProcess: null };
  }
  if (requestedPort !== 3000 && (await checkUrl(`http://127.0.0.1:${requestedPort}/api/health`) || await checkUrl(`http://127.0.0.1:${requestedPort}/terms`))) {
    return { url: `http://127.0.0.1:${requestedPort}`, spawnedProcess: null };
  }

  if (noServer) {
    console.log(`[runner] --no-server 指定，使用预设地址 http://127.0.0.1:${requestedPort}`);
    return { url: `http://127.0.0.1:${requestedPort}`, spawnedProcess: null };
  }

  console.log(`[runner] 未检测到运行中的 Web 服务，正在自动启动测试服务器 (端口 ${requestedPort})...`);
  const child = spawn('node', ['scripts/require-database-url.mjs'], {
    cwd: projectRoot,
    env: { ...process.env },
    stdio: 'ignore',
  });
  await new Promise((r) => setTimeout(r, 200));

  const nextBin = path.join(projectRoot, 'node_modules', 'next', 'dist', 'bin', 'next');
  const serverProc = spawn(process.execPath, [nextBin, 'start', '-p', String(requestedPort)], {
    cwd: projectRoot,
    env: {
      ...process.env,
      PORT: String(requestedPort),
      PUBLIC_APP_URL: `http://127.0.0.1:${requestedPort}`,
      NO_PROXY: 'localhost,127.0.0.1,::1,192.168.*,10.*,172.16.*,172.17.*,172.18.*,172.19.*,172.2*,172.30.*,172.31.*,43.155.166.90,163.7.7.159,192.168.3.8',
      no_proxy: 'localhost,127.0.0.1,::1,192.168.*,10.*,172.16.*,172.17.*,172.18.*,172.19.*,172.2*,172.30.*,172.31.*,43.155.166.90,163.7.7.159,192.168.3.8',
    },
    stdio: 'ignore',
  });

  const testUrl = `http://127.0.0.1:${requestedPort}/terms`;
  const startTime = Date.now();
  let ready = false;
  while (Date.now() - startTime < 15000) {
    if (await checkUrl(testUrl)) {
      ready = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  if (!ready) {
    console.warn(`[runner] 警告：Web 服务在 15 秒内未就绪，继续以 http://127.0.0.1:${requestedPort} 执行`);
  } else {
    console.log(`[runner] Web 服务就绪: http://127.0.0.1:${requestedPort}`);
  }

  return { url: `http://127.0.0.1:${requestedPort}`, spawnedProcess: serverProc };
}

// 5. 核心测试执行器
export async function runSuites(suitesToRun, baseURL = 'http://127.0.0.1:3000') {
  const stats = {
    total: 0,
    passed: 0,
    failed: 0,
    durationMs: 0,
    tierBreakdown: {
      tier1: { total: 0, passed: 0, failed: 0, durationMs: 0 },
      tier2: { total: 0, passed: 0, failed: 0, durationMs: 0 },
      tier3: { total: 0, passed: 0, failed: 0, durationMs: 0 },
      tier4: { total: 0, passed: 0, failed: 0, durationMs: 0 },
    },
    failures: [],
  };

  const runnerStart = Date.now();

  console.log(`\n===============================================================`);
  console.log(`  KoyoSIM E2E Test Suite Runner (4-Tier Architecture)`);
  console.log(`  Base URL: ${baseURL}`);
  console.log(`  Active Suites: ${suitesToRun.length}`);
  console.log(`===============================================================\n`);

  for (const suite of suitesToRun) {
    const tierKey = suite.tier.toLowerCase().startsWith('tier') ? suite.tier.toLowerCase() : `tier${suite.tier}`;
    if (!stats.tierBreakdown[tierKey]) {
      stats.tierBreakdown[tierKey] = { total: 0, passed: 0, failed: 0, durationMs: 0 };
    }

    const featureTag = suite.feature ? ` [${suite.feature}]` : '';
    console.log(`\n▶ Suite: [${suite.tier.toUpperCase()}]${featureTag} ${suite.title}`);

    for (const testCase of suite.tests) {
      stats.total++;
      stats.tierBreakdown[tierKey].total++;

      const testCtx = createTestContext(baseURL);
      const testStart = Date.now();

      try {
        await testCase.run(testCtx);
        const elapsed = Date.now() - testStart;
        stats.passed++;
        stats.tierBreakdown[tierKey].passed++;
        stats.tierBreakdown[tierKey].durationMs += elapsed;

        console.log(`  ✔ ${testCase.name} (${elapsed}ms)`);
      } catch (err) {
        const elapsed = Date.now() - testStart;
        stats.failed++;
        stats.tierBreakdown[tierKey].failed++;
        stats.tierBreakdown[tierKey].durationMs += elapsed;

        console.log(`  ✖ ${testCase.name} (${elapsed}ms)`);
        console.log(`    ↳ Error: ${err.message}`);

        stats.failures.push({
          suiteTitle: suite.title,
          tier: suite.tier,
          feature: suite.feature,
          testName: testCase.name,
          error: err,
        });
      }
    }
  }

  stats.durationMs = Date.now() - runnerStart;

  // 打印综合报告
  printSummary(stats);

  return stats;
}

function printSummary(stats) {
  console.log(`\n===============================================================`);
  console.log(`                      E2E TEST EXECUTION SUMMARY               `);
  console.log(`===============================================================`);
  console.log(`  Tier     | Total | Passed | Failed | Duration (s) `);
  console.log(`-----------+-------+--------+--------+--------------`);

  const tiers = ['tier1', 'tier2', 'tier3', 'tier4'];
  const tierLabels = {
    tier1: 'Tier 1 (Baseline)  ',
    tier2: 'Tier 2 (Boundary)  ',
    tier3: 'Tier 3 (Composite) ',
    tier4: 'Tier 4 (Scenarios) ',
  };

  for (const t of tiers) {
    const data = stats.tierBreakdown[t] || { total: 0, passed: 0, failed: 0, durationMs: 0 };
    const durSec = (data.durationMs / 1000).toFixed(2);
    console.log(`  ${tierLabels[t]} | ${String(data.total).padStart(5)} | ${String(data.passed).padStart(6)} | ${String(data.failed).padStart(6)} | ${durSec.padStart(12)}s`);
  }

  console.log(`-----------+-------+--------+--------+--------------`);
  const totalDurSec = (stats.durationMs / 1000).toFixed(2);
  console.log(`  TOTAL    | ${String(stats.total).padStart(5)} | ${String(stats.passed).padStart(6)} | ${String(stats.failed).padStart(6)} | ${totalDurSec.padStart(12)}s`);
  console.log(`===============================================================`);

  if (stats.failed > 0) {
    console.log(`\n[FAIL] 失败详情汇总 (${stats.failed} 个异常):`);
    for (const [idx, fail] of stats.failures.entries()) {
      console.log(`  ${idx + 1}. [${fail.tier.toUpperCase()}] ${fail.suiteTitle} -> ${fail.testName}`);
      console.log(`     ${fail.error.stack || fail.error.message}\n`);
    }
    console.log(`>>> 状态: FAILED (Exit code: 1)\n`);
  } else {
    console.log(`\n>>> 状态: ALL PASSED (Exit code: 0)\n`);
  }
}

// 6. 主执行入口
async function main() {
  const options = parseArgs();

  if (options.help) {
    console.log(`
使用方式: node e2e-tests/runner.mjs [选项]

选项:
  --tier=all|1|2|3|4     运行指定层级 (默认: all)
  --feature=F01~F19      仅运行指定特性相关测试
  --filter=<keyword>     按名称关键字过滤用例
  --port=<port>          指定 Web 服务端口 (默认: 3100)
  --no-server            跳过本地 Web 服务探测自启
  --help, -h             显示帮助信息
    `);
    process.exit(0);
  }

  // 校验数据库连通性
  try {
    const pool = dbVerifier.getDbPool();
    const res = await pool.query('SELECT current_database(), current_user');
    console.log(`[runner] 数据库连接就绪: 数据库=${res.rows[0].current_database}, 用户=${res.rows[0].current_user}`);
  } catch (err) {
    console.error(`[runner] 数据库连接失败: ${err.message}`);
    process.exit(1);
  }

  // 发现测试文件
  const testDirs = [
    path.join(__dirname, 'tier1-features'),
    path.join(__dirname, 'tier2-boundaries'),
    path.join(__dirname, 'tier3-combinations'),
    path.join(__dirname, 'tier4-scenarios'),
  ];

  let testFiles = [];
  for (const d of testDirs) {
    testFiles = testFiles.concat(findTestFiles(d));
  }

  clearRegisteredSuites();
  for (const file of testFiles) {
    await import(pathToFileURL(file).href);
  }

  let allSuites = getRegisteredSuites();

  // 应用过滤器
  if (options.tier !== 'all') {
    const normalizedTier = options.tier.startsWith('tier') ? options.tier : `tier${options.tier}`;
    allSuites = allSuites.filter((s) => s.tier.toLowerCase() === normalizedTier);
  }

  if (options.feature) {
    allSuites = allSuites.filter((s) => s.feature && s.feature.toUpperCase() === options.feature);
  }

  if (options.filter) {
    const kw = options.filter.toLowerCase();
    allSuites = allSuites.map((s) => ({
      ...s,
      tests: s.tests.filter((t) => t.name.toLowerCase().includes(kw) || s.title.toLowerCase().includes(kw)),
    })).filter((s) => s.tests.length > 0);
  }

  if (allSuites.length === 0) {
    console.warn('[runner] 未匹配到任何满足过滤条件的测试套件。');
    await dbVerifier.closeDbPool();
    process.exit(0);
  }

  const { url: serverUrl, spawnedProcess } = await ensureWebServer(options.port, options.noServer);

  let stats;
  try {
    stats = await runSuites(allSuites, serverUrl);
  } finally {
    await dbVerifier.closeDbPool();
    if (spawnedProcess) {
      console.log('[runner] 正在清理后台测试服务器...');
      try {
        spawnedProcess.kill('SIGTERM');
      } catch {}
    }
  }

  process.exit(stats.failed > 0 ? 1 : 0);
}

// 若作为主脚本启动
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error('[runner] 执行遇到未捕获异常:', err);
    process.exit(1);
  });
}
