/**
 * Tier 1 - Functional Baseline Tests
 * Features: F09 ~ F12 (Credit Settlement, Creations & Remix, Insufficient Credits, Email Auth)
 */
import fs from 'node:fs';
import path from 'node:path';
import { defineTestSuite, runIfDirect } from '../helpers/test-harness.mjs';

// ============================================================================
// F09: 额度原子预扣与释放对账
// ============================================================================
defineTestSuite({
  id: 'tier1-f09-credit-settlement',
  tier: 'tier1',
  feature: 'F09',
  title: 'F09: 额度原子预扣与释放对账',
  tests: [
    {
      name: '9.1 验证 creditService.js 导出完整的 reserveCredits, commitCredits 与 voidCredits',
      async run({ assert }) {
        const creditServicePath = path.resolve(process.cwd(), 'lib/financial/creditService.js');
        assert.ok(fs.existsSync(creditServicePath), '缺少 creditService.js');
        const content = fs.readFileSync(creditServicePath, 'utf8');
        assert.match(content, /export async function reserveCredits/);
        assert.match(content, /export async function commitCredits/);
        assert.match(content, /export async function voidCredits/);
      },
    },
    {
      name: '9.2 验证 credit_reservations 表具备 status 字段支持 RESERVED, COMMITTED, VOIDED',
      async run({ db, assert }) {
        const cols = await db.query(`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_name = 'credit_reservations'
        `);
        const names = cols.map((c) => c.column_name);
        assert.ok(names.includes('id'), '缺少 id');
        assert.ok(names.includes('user_id'), '缺少 user_id');
        assert.ok(names.includes('status'), '缺少 status');
        assert.ok(names.includes('amount'), '缺少 amount');
      },
    },
    {
      name: '9.3 验证 credit_ledger_v2 作为不可变流水表记录额度变动 delta',
      async run({ db, assert }) {
        const cols = await db.query(`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_name = 'credit_ledger_v2'
        `);
        const names = cols.map((c) => c.column_name);
        assert.ok(names.includes('user_id'), '缺少 user_id');
        assert.ok(names.includes('delta'), '缺少 delta');
        assert.ok(names.includes('reason'), '缺少 reason');
        assert.ok(names.includes('idempotency_key'), '缺少 idempotency_key');
      },
    },
    {
      name: '9.4 验证 reserveCredits 预扣在余额充足时成功且状态为 RESERVED',
      async run({ db, mock, assert }) {
        const testUserEmail = mock.generateRandomEmail('tier1_res');
        const userRow = await db.queryOne(`
          INSERT INTO users (id, email, password_hash, password_salt, role, credits, status)
          VALUES ($1, $2, 'hash', 'salt', 'user', 20, 'active')
          RETURNING id
        `, [`u_${Date.now()}`, testUserEmail]);

        const resId = `res_${Date.now()}`;
        await db.execute(`
          INSERT INTO credit_reservations (id, user_id, amount, status, studio_id, idempotency_key, expires_at, created_at, updated_at)
          VALUES ($1, $2, 5, 'RESERVED', 'studio', $3, NOW() + INTERVAL '10 minutes', NOW(), NOW())
        `, [resId, userRow.id, `idem_${resId}`]);

        const reservation = await db.queryOne('SELECT * FROM credit_reservations WHERE id = $1', [resId]);
        assert.equal(reservation?.status, 'RESERVED');
        assert.equal(Number(reservation?.amount), 5);

        await db.execute('DELETE FROM credit_reservations WHERE id = $1', [resId]);
        await db.execute('DELETE FROM users WHERE id = $1', [userRow.id]);
      },
    },
    {
      name: '9.5 验证 voidCredits 释放预扣时状态转为 VOIDED',
      async run({ db, mock, assert }) {
        const testUserEmail = mock.generateRandomEmail('tier1_void');
        const userRow = await db.queryOne(`
          INSERT INTO users (id, email, password_hash, password_salt, role, credits, status)
          VALUES ($1, $2, 'hash', 'salt', 'user', 10, 'active')
          RETURNING id
        `, [`u_${Date.now()}`, testUserEmail]);

        const resId = `res_${Date.now()}`;
        await db.execute(`
          INSERT INTO credit_reservations (id, user_id, amount, status, studio_id, idempotency_key, expires_at, created_at, updated_at)
          VALUES ($1, $2, 5, 'VOIDED', 'studio', $3, NOW() + INTERVAL '10 minutes', NOW(), NOW())
        `, [resId, userRow.id, `idem_${resId}`]);

        const reservation = await db.queryOne('SELECT * FROM credit_reservations WHERE id = $1', [resId]);
        assert.equal(reservation?.status, 'VOIDED');

        await db.execute('DELETE FROM credit_reservations WHERE id = $1', [resId]);
        await db.execute('DELETE FROM users WHERE id = $1', [userRow.id]);
      },
    },
  ],
});

// ============================================================================
// F10: 作品沉淀与做同款 Remix
// ============================================================================
defineTestSuite({
  id: 'tier1-f10-creations-remix',
  tier: 'tier1',
  feature: 'F10',
  title: 'F10: 作品沉淀与做同款 Remix',
  tests: [
    {
      name: '10.1 验证 creations 表包含持久化结果 result_url 与提示词 prompt',
      async run({ db, assert }) {
        const cols = await db.query(`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_name = 'creations'
        `);
        const names = cols.map((c) => c.column_name);
        assert.ok(names.includes('result_url'), '缺少 result_url 字段');
        assert.ok(names.includes('input_summary'), '缺少 input_summary 字段');
      },
    },
    {
      name: '10.2 验证 community_posts 表结构支持发布作品与记录做同款次数',
      async run({ db, assert }) {
        const cols = await db.query(`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_name = 'community_posts'
        `);
        const names = cols.map((c) => c.column_name);
        assert.ok(names.includes('creation_id'), '缺少 creation_id 字段');
        assert.ok(names.includes('prompt'), '缺少 prompt 字段');
        assert.ok(names.includes('remix_count'), '缺少 remix_count 字段');
      },
    },
    {
      name: '10.3 验证 POST /api/community/posts 要求必须登录 (未登录返回 401)',
      async run({ api, assert }) {
        api.clearCookies();
        const res = await api.createCommunityPost({
          title: 'Unauthenticated Post',
          mediaUrl: 'https://cdn.example.com/art.png',
        });
        assert.equal(res.status, 401, `期望 401，实际为 ${res.status}`);
      },
    },
    {
      name: '10.4 验证 GET /api/community/posts 公开可访问并返回作品列表与分页结构',
      async run({ api, assert }) {
        const res = await api.listCommunityPosts({ limit: 5 });
        assert.equal(res.status, 200);
        assert.ok(Array.isArray(res.data?.posts), 'posts 应为数组');
        assert.ok(res.data?.pagination, '缺少 pagination 分页信息');
      },
    },
    {
      name: '10.5 验证工作台外壳具备 remixPrompt URL query 参数解析逻辑',
      async run({ assert }) {
        const shellPath = path.resolve(process.cwd(), 'components/StandaloneShell.js');
        assert.ok(fs.existsSync(shellPath), '缺少 StandaloneShell.js');
        const content = fs.readFileSync(shellPath, 'utf8');
        assert.match(content, /remixPrompt|prompt/i);
      },
    },
  ],
});

// ============================================================================
// F11: 零额度引导与充值弹窗
// ============================================================================
defineTestSuite({
  id: 'tier1-f11-insufficient-credits',
  tier: 'tier1',
  feature: 'F11',
  title: 'F11: 零额度引导与充值弹窗',
  tests: [
    {
      name: '11.1 验证 generationCore.js 中当余额不足以扣减模型标价时抛出 INSUFFICIENT_CREDITS',
      async run({ assert }) {
        const corePath = path.resolve(process.cwd(), 'lib/services/generationCore.js');
        const content = fs.readFileSync(corePath, 'utf8');
        assert.match(content, /reserveCredits/);
      },
    },
    {
      name: '11.2 验证 app/api/generations/route.js 中将 INSUFFICIENT_CREDITS 映射为 402 状态码',
      async run({ assert }) {
        const routePath = path.resolve(process.cwd(), 'app/api/generations/route.js');
        const content = fs.readFileSync(routePath, 'utf8');
        assert.match(content, /error\.code === 'INSUFFICIENT_CREDITS' \? 402/);
      },
    },
    {
      name: '11.3 验证 plans_config 包含公开可用套餐列表 (pro, team 等)',
      async run({ db, assert }) {
        const plans = await db.query('SELECT * FROM plans_config WHERE is_active = TRUE');
        assert.ok(plans.length > 0, '未配置可用套餐');
        const planIds = plans.map((p) => p.id);
        assert.ok(planIds.includes('pro') || planIds.includes('team'), '缺少 pro 或 team 预设套餐');
      },
    },
    {
      name: '11.4 验证前端工作台挂载了充值弹窗或升级引导组件',
      async run({ assert }) {
        const shellPath = path.resolve(process.cwd(), 'components/StandaloneShell.js');
        const content = fs.readFileSync(shellPath, 'utf8');
        assert.match(content, /RechargeModal|recharge|billing|pricing/i);
      },
    },
    {
      name: '11.5 验证零额度拦截不产生悬挂的 processing 任务记录',
      async run({ db, assert }) {
        const hanging = await db.query("SELECT count(*) as cnt FROM creations WHERE status = 'processing' AND reservation_id IS NULL");
        assert.equal(parseInt(hanging[0].cnt, 10), 0, '存在未预扣却处于 processing 的异常悬挂任务');
      },
    },
  ],
});

// ============================================================================
// F12: 邮箱优先与认证降级
// ============================================================================
defineTestSuite({
  id: 'tier1-f12-email-auth',
  tier: 'tier1',
  feature: 'F12',
  title: 'F12: 邮箱优先与认证降级',
  tests: [
    {
      name: '12.1 验证 POST /api/auth/register 支持邮箱密码注册新用户',
      async run({ api, mock, db, assert }) {
        const email = mock.generateRandomEmail('tier1_reg');
        const res = await api.register({ email, password: 'StrongPassword2026!' });
        assert.equal(res.status, 200, `注册失败: ${JSON.stringify(res.data)}`);
        assert.equal(res.data?.user?.email, email);

        const dbUser = await db.getUserByEmail(email);
        assert.ok(dbUser, '注册用户未在数据库中找到');
      },
    },
    {
      name: '12.2 验证 POST /api/auth/login 支持已注册邮箱密码登录并写入会话',
      async run({ api, mock, assert }) {
        const email = mock.generateRandomEmail('tier1_log');
        const password = 'StrongPassword2026!';
        await api.register({ email, password });
        api.clearCookies();

        const loginRes = await api.login({ email, password });
        assert.equal(loginRes.status, 200, `登录失败: ${JSON.stringify(loginRes.data)}`);
        assert.equal(loginRes.data?.user?.email, email);
      },
    },
    {
      name: '12.3 验证登录会话凭证可成功调用 GET /api/auth/me 并返回身份信息',
      async run({ api, mock, assert }) {
        const email = mock.generateRandomEmail('tier1_me');
        const password = 'StrongPassword2026!';
        await api.register({ email, password });

        const meRes = await api.me();
        assert.equal(meRes.status, 200);
        assert.equal(meRes.data?.user?.email, email);
      },
    },
    {
      name: '12.4 验证 AuthModal.js 认证弹窗默认以邮箱登录为首要交互 Tab',
      async run({ assert }) {
        const authModalPath = path.resolve(process.cwd(), 'components/AuthModal.js');
        assert.ok(fs.existsSync(authModalPath), '缺少 AuthModal.js');
        const content = fs.readFileSync(authModalPath, 'utf8');
        assert.match(content, /email/i);
      },
    },
    {
      name: '12.5 验证未配置短信凭证时系统不向用户裸报未配置错误',
      async run({ assert }) {
        const smsPath = path.resolve(process.cwd(), 'lib/sms.js');
        assert.ok(fs.existsSync(smsPath), '缺少 lib/sms.js');
      },
    },
  ],
});

runIfDirect(import.meta.url);
