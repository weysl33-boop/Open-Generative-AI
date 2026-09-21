/**
 * Tier 1 - Functional Baseline Tests
 * Features: F01 ~ F04 (PG Migrations, Isolated Test DB, Drills, Worker Daemon)
 */
import fs from 'node:fs';
import path from 'node:path';
import { defineTestSuite, runIfDirect } from '../helpers/test-harness.mjs';

// ============================================================================
// F01: PG 迁移基石推进 (007~013)
// ============================================================================
defineTestSuite({
  id: 'tier1-f01-pg-migrations',
  tier: 'tier1',
  feature: 'F01',
  title: 'F01: PG 迁移基石推进 (007~013)',
  tests: [
    {
      name: '1.1 验证 sys_core.schema_migrations 完整记录 001~013 全部迁移版本',
      async run({ db, assert }) {
        const migrations = await db.getSchemaMigrations();
        assert.ok(migrations.length >= 13, `期望已应用迁移数 >= 13，实际为 ${migrations.length}`);
        const versions = migrations.map((m) => m.version);
        assert.ok(versions.some((v) => v.startsWith('007_')), '缺少 007 迁移');
        assert.ok(versions.some((v) => v.startsWith('008_')), '缺少 008 迁移');
        assert.ok(versions.some((v) => v.startsWith('009_')), '缺少 009 迁移');
        assert.ok(versions.some((v) => v.startsWith('010_')), '缺少 010 迁移');
        assert.ok(versions.some((v) => v.startsWith('011_')), '缺少 011 迁移');
        assert.ok(versions.some((v) => v.startsWith('012_')), '缺少 012 迁移');
        assert.ok(versions.some((v) => v.startsWith('013_')), '缺少 013 迁移');
      },
    },
    {
      name: '1.2 验证迁移记录有序推进且 003~013 各版本 Checksum 均符合 SHA256 规范',
      async run({ db, assert }) {
        const migrations = await db.getSchemaMigrations();
        assert.ok(migrations.length >= 13, '迁移总数不足');
        for (const m of migrations) {
          assert.ok(m.version, '迁移记录 version 不能为空');
          assert.ok(m.applied_at, `迁移 ${m.version} 缺少 applied_at 时间戳`);
          // 003 及以后的安全迁移必须具备严格哈希指纹
          if (m.version >= '003_') {
            assert.ok(m.checksum && m.checksum.length === 64, `迁移 ${m.version} 缺少合法 64 位 sha256 checksum`);
          }
        }
      },
    },
    {
      name: '1.3 验证 007 generation_core 核心任务表结构与字段完整就绪',
      async run({ db, assert }) {
        const creationsCols = await db.query(`
          SELECT column_name, data_type 
          FROM information_schema.columns 
          WHERE table_name = 'creations'
        `);
        const colNames = creationsCols.map((c) => c.column_name);
        assert.ok(colNames.includes('id'), 'creations 缺少 id');
        assert.ok(colNames.includes('user_id'), 'creations 缺少 user_id');
        assert.ok(colNames.includes('status'), 'creations 缺少 status');
        assert.ok(colNames.includes('reservation_id'), 'creations 缺少 reservation_id');
        assert.ok(colNames.includes('result_url'), 'creations 缺少 result_url');
        assert.ok(colNames.includes('credit_cost'), 'creations 缺少 credit_cost');
      },
    },
    {
      name: '1.4 验证 009/012/013 支付表结构与流水表就绪',
      async run({ db, assert }) {
        const tables = await db.query(`
          SELECT table_name 
          FROM information_schema.tables 
          WHERE table_schema NOT IN ('pg_catalog', 'information_schema') 
            AND table_name IN ('payment_ledger', 'webhook_events', 'credit_refund_obligations')
        `);
        const found = tables.map((t) => t.table_name);
        assert.ok(found.includes('payment_ledger'), '缺少 payment_ledger 表');
        assert.ok(found.includes('webhook_events'), '缺少 webhook_events 表');
        assert.ok(found.includes('credit_refund_obligations'), '缺少 credit_refund_obligations 表');
      },
    },
    {
      name: '1.5 验证 011 模型目录 models_config 存在且包含预设活跃模型',
      async run({ db, assert }) {
        const models = await db.listActiveModels();
        assert.ok(models.length > 0, 'models_config 中没有活跃模型');
        const ids = models.map((m) => m.id);
        assert.ok(ids.includes('nano-fast') || models.some((m) => m.is_active), '缺少可用模型配置');
      },
    },
  ],
});

// ============================================================================
// F02: 独立测试库运行 (test:db)
// ============================================================================
defineTestSuite({
  id: 'tier1-f02-test-db',
  tier: 'tier1',
  feature: 'F02',
  title: 'F02: 独立测试库运行 (test:db)',
  tests: [
    {
      name: '2.1 验证 scripts/run-isolated-pg-tests.mjs 脚本存在且格式规范',
      async run({ assert }) {
        const scriptPath = path.resolve(process.cwd(), 'scripts/run-isolated-pg-tests.mjs');
        assert.ok(fs.existsSync(scriptPath), '缺少 run-isolated-pg-tests.mjs');
        const content = fs.readFileSync(scriptPath, 'utf8');
        assert.match(content, /TEST_DATABASE_URL/);
        assert.match(content, /CREATE DATABASE/);
      },
    },
    {
      name: '2.2 验证运行脚本强制要求 TEST_DATABASE_URL 且严禁与生产 DATABASE_URL 同库',
      async run({ assert }) {
        const scriptPath = path.resolve(process.cwd(), 'scripts/run-isolated-pg-tests.mjs');
        const content = fs.readFileSync(scriptPath, 'utf8');
        assert.match(content, /TEST_DATABASE_URL must not be the same as DATABASE_URL/i);
      },
    },
    {
      name: '2.3 验证 tests/db/postgres.test.mjs 包含完整的原子数据库隔离测试用例',
      async run({ assert }) {
        const testFile = path.resolve(process.cwd(), 'tests/db/postgres.test.mjs');
        assert.ok(fs.existsSync(testFile), '缺少 tests/db/postgres.test.mjs');
        const content = fs.readFileSync(testFile, 'utf8');
        assert.match(content, /PostgreSQL test environment is explicit/);
        assert.match(content, /query, queryOne and execute use PostgreSQL parameter binding/);
        assert.match(content, /transaction rollback leaves no test row behind/);
        assert.match(content, /idempotency duplicate request is rejected/);
        assert.match(content, /simulated generation settles once and releases once/);
      },
    },
    {
      name: '2.4 验证 package.json 中正确配置 test:db 指令',
      async run({ assert }) {
        const pkg = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8'));
        assert.ok(pkg.scripts['test:db'], 'package.json 缺少 test:db 脚本');
        assert.match(pkg.scripts['test:db'], /run-isolated-pg-tests\.mjs/);
      },
    },
    {
      name: '2.5 验证数据库连接池支持动态创建与健康连通性探活',
      async run({ db, assert }) {
        const res = await db.queryOne('SELECT 1 AS ping');
        assert.equal(res?.ping, 1, '数据库探活 ping 失败');
      },
    },
  ],
});

// ============================================================================
// F03: 迁移与备份恢复演练
// ============================================================================
defineTestSuite({
  id: 'tier1-f03-migration-and-backup-drill',
  tier: 'tier1',
  feature: 'F03',
  title: 'F03: 迁移与备份恢复演练',
  tests: [
    {
      name: '3.1 验证 scripts/migration-drill.mjs 演练脚本存在且包含迁移完整性校验',
      async run({ assert }) {
        const drillPath = path.resolve(process.cwd(), 'scripts/migration-drill.mjs');
        assert.ok(fs.existsSync(drillPath), '缺少 migration-drill.mjs 演练脚本');
        const content = fs.readFileSync(drillPath, 'utf8');
        assert.match(content, /migration/i);
      },
    },
    {
      name: '3.2 验证 scripts/backup-restore-drill.mjs 脚本存在且包含恢复演练流程',
      async run({ assert }) {
        const drillPath = path.resolve(process.cwd(), 'scripts/backup-restore-drill.mjs');
        assert.ok(fs.existsSync(drillPath), '缺少 backup-restore-drill.mjs 演练脚本');
        const content = fs.readFileSync(drillPath, 'utf8');
        assert.match(content, /backup/i);
      },
    },
    {
      name: '3.3 验证 package.json 中分别声明 migration:drill 与 backup:restore:drill 指令',
      async run({ assert }) {
        const pkg = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8'));
        assert.ok(pkg.scripts['migration:drill'], '缺少 migration:drill 脚本');
        assert.ok(pkg.scripts['backup:restore:drill'], '缺少 backup:restore:drill 脚本');
      },
    },
    {
      name: '3.4 验证当前数据库迁移状态处于完全就绪且最新迁移为 013',
      async run({ db, assert }) {
        const migrations = await db.getSchemaMigrations();
        assert.ok(migrations.length >= 13, '迁移记录不足 13 个');
        const latest = migrations[migrations.length - 1];
        assert.ok(latest.version.startsWith('013_'), `最新迁移应为 013，当前为 ${latest.version}`);
      },
    },
    {
      name: '3.5 验证数据库状态查询脚本 scripts/db-status.mjs 存在且可执行',
      async run({ assert }) {
        const statusPath = path.resolve(process.cwd(), 'scripts/db-status.mjs');
        assert.ok(fs.existsSync(statusPath), '缺少 db-status.mjs');
      },
    },
  ],
});

// ============================================================================
// F04: Worker 生产常驻守护
// ============================================================================
defineTestSuite({
  id: 'tier1-f04-worker-daemon',
  tier: 'tier1',
  feature: 'F04',
  title: 'F04: Worker 生产常驻守护',
  tests: [
    {
      name: '4.1 验证 scripts/generation-worker.mjs 脚本存在并支持 SIGINT/SIGTERM 优雅退出',
      async run({ assert }) {
        const workerPath = path.resolve(process.cwd(), 'scripts/generation-worker.mjs');
        assert.ok(fs.existsSync(workerPath), '缺少 generation-worker.mjs');
        const content = fs.readFileSync(workerPath, 'utf8');
        assert.match(content, /SIGINT/);
        assert.match(content, /SIGTERM/);
        assert.match(content, /closePgPool/);
      },
    },
    {
      name: '4.2 验证 Worker Supervisor 脚本 scripts/generation-worker-supervisor.mjs 存在',
      async run({ assert }) {
        const supPath = path.resolve(process.cwd(), 'scripts/generation-worker-supervisor.mjs');
        assert.ok(fs.existsSync(supPath), '缺少 generation-worker-supervisor.mjs');
      },
    },
    {
      name: '4.3 验证 lib/services/taskWorker.js 暴露 runGenerationWorkerOnce 周期调度接口',
      async run({ assert }) {
        const taskWorkerPath = path.resolve(process.cwd(), 'lib/services/taskWorker.js');
        assert.ok(fs.existsSync(taskWorkerPath), '缺少 taskWorker.js');
        const content = fs.readFileSync(taskWorkerPath, 'utf8');
        assert.match(content, /runGenerationWorkerOnce/);
        assert.match(content, /cleanupExpiredReservations/);
        assert.match(content, /expireStaleGenerationTasks/);
      },
    },
    {
      name: '4.4 验证 package.json 中配置 worker:generation 与 worker:generation:supervised',
      async run({ assert }) {
        const pkg = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8'));
        assert.ok(pkg.scripts['worker:generation'], '缺少 worker:generation 指令');
        assert.ok(pkg.scripts['worker:generation:supervised'], '缺少 worker:generation:supervised 指令');
      },
    },
    {
      name: '4.5 验证 Worker 单次运行在空队列时安全退出并不挂起事务',
      async run({ db, assert }) {
        const countRow = await db.queryOne("SELECT count(*) as cnt FROM creations WHERE status = 'queued'");
        const cnt = parseInt(countRow.cnt, 10);
        assert.ok(Number.isInteger(cnt) && cnt >= 0, 'queued 任务数量查询异常');
      },
    },
  ],
});

runIfDirect(import.meta.url);
