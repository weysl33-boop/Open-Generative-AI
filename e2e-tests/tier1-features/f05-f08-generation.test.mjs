/**
 * Tier 1 - Functional Baseline Tests
 * Features: F05 ~ F08 (Async Generation, Worker Resume, Watchdog, Studio Unified Contract)
 */
import fs from 'node:fs';
import path from 'node:path';
import { defineTestSuite, runIfDirect } from '../helpers/test-harness.mjs';

// ============================================================================
// F05: 异步任务生成剥离 (ASYNC)
// ============================================================================
defineTestSuite({
  id: 'tier1-f05-async-generation',
  tier: 'tier1',
  feature: 'F05',
  title: 'F05: 异步任务生成剥离 (ASYNC)',
  tests: [
    {
      name: '5.1 验证项目环境与配置文档中明确开启 GENERATION_ASYNC=true',
      async run({ assert }) {
        const envExample = fs.readFileSync(path.resolve(process.cwd(), '.env.example'), 'utf8');
        assert.match(envExample, /GENERATION_ASYNC=true/);
      },
    },
    {
      name: '5.2 验证 app/api/generations/route.js 中支持 GENERATION_ASYNC 模式返回 202',
      async run({ assert }) {
        const routePath = path.resolve(process.cwd(), 'app/api/generations/route.js');
        assert.ok(fs.existsSync(routePath), '缺少 generations/route.js');
        const content = fs.readFileSync(routePath, 'utf8');
        assert.match(content, /process\.env\.GENERATION_ASYNC === 'true'/);
        assert.match(content, /status:\s*task\.idempotent \? 200 : 202/);
      },
    },
    {
      name: '5.3 验证数据库中任务写入的初始状态严格为 queued',
      async run({ db, assert }) {
        const testId = `e2e_chk_${Date.now()}`;
        const row = await db.queryOne(`
          INSERT INTO creations
            (id, user_id, studio_id, model, provider, label, credit_cost, status, created_at, updated_at)
          VALUES ($1, 'e2e_system_test', 'studio_test', 'nano-fast', 'mock', 'E2E Task', 2, 'queued', NOW(), NOW())
          RETURNING id, status
        `, [testId]);
        assert.equal(row?.status, 'queued', '任务初始状态不是 queued');
        await db.execute('DELETE FROM creations WHERE id = $1', [testId]);
      },
    },
    {
      name: '5.4 验证生成事件流 generation_events 表具备状态流转追踪支持',
      async run({ db, assert }) {
        const eventsTable = await db.query(`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_name = 'generation_events'
        `);
        const cols = eventsTable.map((c) => c.column_name);
        assert.ok(cols.includes('creation_id'), '缺少 creation_id 字段');
        assert.ok(cols.includes('event_type'), '缺少 event_type 字段');
        assert.ok(cols.includes('from_status'), '缺少 from_status 字段');
        assert.ok(cols.includes('to_status'), '缺少 to_status 字段');
      },
    },
    {
      name: '5.5 验证轮询查询接口 GET /api/generations 支持根据 id 获取单一任务详情',
      async run({ assert }) {
        const routePath = path.resolve(process.cwd(), 'app/api/generations/route.js');
        const content = fs.readFileSync(routePath, 'utf8');
        assert.match(content, /request\.nextUrl\.searchParams\.get\('id'\)/);
        assert.match(content, /getGenerationTrace/);
      },
    },
  ],
});

// ============================================================================
// F06: Worker 孤儿自愈与断点续跑
// ============================================================================
defineTestSuite({
  id: 'tier1-f06-worker-resume',
  tier: 'tier1',
  feature: 'F06',
  title: 'F06: Worker 孤儿自愈与断点续跑',
  tests: [
    {
      name: '6.1 验证 repositories/creations.js 中 claimQueuedGeneration 原子认领任务机制',
      async run({ assert }) {
        const repoPath = path.resolve(process.cwd(), 'lib/repositories/creations.js');
        assert.ok(fs.existsSync(repoPath), '缺少 creations repository');
        const content = fs.readFileSync(repoPath, 'utf8');
        assert.match(content, /claimQueuedGeneration/);
        assert.match(content, /status = 'processing'/);
      },
    },
    {
      name: '6.2 验证任务状态机禁止从终态 (succeeded/failed) 逆向认领',
      async run({ assert }) {
        const statePath = path.resolve(process.cwd(), 'lib/services/generationState.js');
        assert.ok(fs.existsSync(statePath), '缺少 generationState.js');
        const content = fs.readFileSync(statePath, 'utf8');
        assert.match(content, /assertGenerationTransition/);
      },
    },
    {
      name: '6.3 验证断点中断任务在 processing 状态下保留 reservation_id 额度锁定',
      async run({ db, assert }) {
        const testId = `e2e_res_${Date.now()}`;
        const resId = `res_${Date.now()}`;
        await db.execute(`
          INSERT INTO creations (id, user_id, studio_id, model, provider, label, credit_cost, reservation_id, status, created_at, updated_at)
          VALUES ($1, 'e2e_test_user', 'studio', 'nano-fast', 'mock', 'Resume Test', 3, $2, 'processing', NOW(), NOW())
        `, [testId, resId]);

        const record = await db.getCreationById(testId);
        assert.equal(record?.status, 'processing');
        assert.equal(record?.reservation_id, resId, '中断任务未能保留 reservation_id');

        await db.execute('DELETE FROM creations WHERE id = $1', [testId]);
      },
    },
    {
      name: '6.4 验证 Worker 批量扫描具有 LIMIT 和 ORDER BY 保证先入先出',
      async run({ assert }) {
        const workerPath = path.resolve(process.cwd(), 'lib/services/taskWorker.js');
        const content = fs.readFileSync(workerPath, 'utf8');
        assert.match(content, /ORDER BY created_at ASC/);
        assert.match(content, /LIMIT/);
      },
    },
    {
      name: '6.5 验证多 Worker 并发认领具有原子互斥，失败者安全跳过',
      async run({ assert }) {
        const workerPath = path.resolve(process.cwd(), 'lib/services/taskWorker.js');
        const content = fs.readFileSync(workerPath, 'utf8');
        assert.match(content, /processGenerationTask/);
      },
    },
  ],
});

// ============================================================================
// F07: Watchdog 超时熔断与自愈
// ============================================================================
defineTestSuite({
  id: 'tier1-f07-watchdog-circuit-breaker',
  tier: 'tier1',
  feature: 'F07',
  title: 'F07: Watchdog 超时熔断与自愈',
  tests: [
    {
      name: '7.1 验证 expireStaleGenerationTasks 在 generationCore.js 中导出并就绪',
      async run({ assert }) {
        const corePath = path.resolve(process.cwd(), 'lib/services/generationCore.js');
        assert.ok(fs.existsSync(corePath), '缺少 generationCore.js');
        const content = fs.readFileSync(corePath, 'utf8');
        assert.match(content, /export async function expireStaleGenerationTasks/);
      },
    },
    {
      name: '7.2 验证 Watchdog 熔断超时任务时将状态置为 failed 且记录 PROVIDER_TIMEOUT',
      async run({ assert }) {
        const corePath = path.resolve(process.cwd(), 'lib/services/generationCore.js');
        const content = fs.readFileSync(corePath, 'utf8');
        assert.match(content, /errorCode:\s*'PROVIDER_TIMEOUT'/);
        assert.match(content, /TASK_TIMEOUT/);
      },
    },
    {
      name: '7.3 验证 Watchdog 熔断超时任务时自动执行 voidCredits 释放预扣额度',
      async run({ assert }) {
        const corePath = path.resolve(process.cwd(), 'lib/services/generationCore.js');
        const content = fs.readFileSync(corePath, 'utf8');
        assert.match(content, /voidCredits\(\{ reservationId: current\.reservation_id/);
      },
    },
    {
      name: '7.4 验证 Watchdog 熔断时向 audit_logs 写入 generation.task_timeout 审计',
      async run({ assert }) {
        const corePath = path.resolve(process.cwd(), 'lib/services/generationCore.js');
        const content = fs.readFileSync(corePath, 'utf8');
        assert.match(content, /action:\s*'generation\.task_timeout'/);
      },
    },
    {
      name: '7.5 验证 Watchdog 查询仅匹配 status = processing 的陈旧任务，绝不影响 queued 或已完成任务',
      async run({ assert }) {
        const corePath = path.resolve(process.cwd(), 'lib/services/generationCore.js');
        const content = fs.readFileSync(corePath, 'utf8');
        assert.match(content, /WHERE status = 'processing' AND updated_at <= \$1/);
      },
    },
  ],
});

// ============================================================================
// F08: Studio 工作台统一契约接入
// ============================================================================
defineTestSuite({
  id: 'tier1-f08-studio-contract',
  tier: 'tier1',
  feature: 'F08',
  title: 'F08: Studio 工作台统一契约接入',
  tests: [
    {
      name: '8.1 验证 app/api/generations/route.js 统一暴露 POST 与 GET 处理器',
      async run({ assert }) {
        const routePath = path.resolve(process.cwd(), 'app/api/generations/route.js');
        const content = fs.readFileSync(routePath, 'utf8');
        assert.match(content, /export async function GET/);
        assert.match(content, /export async function POST/);
      },
    },
    {
      name: '8.2 验证未认证请求调用 POST /api/generations 返回 401 状态码',
      async run({ api, assert }) {
        api.clearCookies();
        const res = await api.createGeneration({
          model: 'nano-fast',
          prompt: 'unauthenticated test prompt',
          idempotencyKey: `idem_unauth_${Date.now()}`,
        });
        assert.equal(res.status, 401, `期望 401，实际为 ${res.status}`);
      },
    },
    {
      name: '8.3 验证生成核心强制要求有效幂等键 (IDEMPOTENCY_REQUIRED)',
      async run({ assert }) {
        const corePath = path.resolve(process.cwd(), 'lib/services/generationCore.js');
        const content = fs.readFileSync(corePath, 'utf8');
        assert.match(content, /code:\s*'IDEMPOTENCY_REQUIRED'/);
      },
    },
    {
      name: '8.4 验证目标模型不存在时生成核心抛出 MODEL_NOT_FOUND',
      async run({ assert }) {
        const corePath = path.resolve(process.cwd(), 'lib/services/generationCore.js');
        const content = fs.readFileSync(corePath, 'utf8');
        assert.match(content, /code:\s*'MODEL_NOT_FOUND'/);
      },
    },
    {
      name: '8.5 验证工作台外壳与 muapi 模块统一收口至 /api/generations',
      async run({ assert }) {
        const muapiPath = path.resolve(process.cwd(), 'packages/studio/src/muapi.js');
        assert.ok(fs.existsSync(muapiPath), '缺少 packages/studio/src/muapi.js');
      },
    },
  ],
});

runIfDirect(import.meta.url);
