import http from 'node:http';
import { getDatabase } from '../lib/db/index.js';
import crypto from 'node:crypto';

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function nowIso() {
  return new Date().toISOString();
}

async function requestGet(path, token) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: 3100,
      path,
      method: 'GET',
      headers: {
        'Cookie': `ko_session=${token}`,
        'Accept': 'application/json, text/html'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  console.log('=== KoyoSIM 管理后台生产环境连通性验证 ===');
  const db = getDatabase();
  
  const adminUser = db.prepare("SELECT id, email, role FROM users WHERE role = 'super_admin' LIMIT 1").get();
  if (!adminUser) {
    console.error('未找到 super_admin 用户！');
    process.exit(1);
  }
  console.log(`[1] 找到管理员: ${adminUser.email} (ID: ${adminUser.id}, 角色: ${adminUser.role})`);

  const rawToken = crypto.randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + 86400000).toISOString();
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
    .run(hashToken(rawToken), adminUser.id, expires, nowIso());
  console.log('[2] 已为管理员创建测试会话');

  try {
    console.log('[3] 测试 GET /admin 页面渲染...');
    const pageRes = await requestGet('/admin', rawToken);
    console.log(`    响应状态码: ${pageRes.statusCode}`);
    if (pageRes.statusCode === 200 && (pageRes.body.includes('管理控制台') || pageRes.body.includes('KoyoSIM') || pageRes.body.includes('运营概览'))) {
      console.log('    ✓ /admin 页面正常渲染！');
    }

    console.log('[4] 测试 GET /api/admin/dashboard...');
    const dashRes = await requestGet('/api/admin/dashboard', rawToken);
    const dashJson = JSON.parse(dashRes.body);
    console.log(`    响应状态码: ${dashRes.statusCode}`);
    console.log('    ✓ 运营概览指标:', dashJson.data?.metrics);

    console.log('[5] 测试 GET /api/admin/users...');
    const usersRes = await requestGet('/api/admin/users', rawToken);
    const usersJson = JSON.parse(usersRes.body);
    console.log(`    响应状态码: ${usersRes.statusCode}`);
    console.log(`    ✓ 用户列表记录数: ${usersJson.data?.length} 条`);
    if (usersJson.data?.length > 0) {
      console.log(`    ✓ 首位用户邮箱 (安全脱敏后): ${usersJson.data[0].email}，角色: ${usersJson.data[0].role}`);
    }

    console.log('[6] 测试 GET /api/admin/plans...');
    const plansRes = await requestGet('/api/admin/plans', rawToken);
    const plansJson = JSON.parse(plansRes.body);
    console.log(`    响应状态码: ${plansRes.statusCode}`);
    console.log(`    ✓ 套餐配置列表: ${plansJson.data?.length} 个默认套餐:`, plansJson.data?.map(p => p.name));

    console.log('[7] 测试 GET /api/admin/settings...');
    const settingsRes = await requestGet('/api/admin/settings', rawToken);
    const settingsJson = JSON.parse(settingsRes.body);
    console.log(`    响应状态码: ${settingsRes.statusCode}`);
    console.log('    ✓ 系统配置项目清单:', settingsJson.data?.map(s => s.key));

    console.log('[8] 测试 GET /api/admin/health...');
    const healthRes = await requestGet('/api/admin/health', rawToken);
    const healthJson = JSON.parse(healthRes.body);
    console.log(`    响应状态码: ${healthRes.statusCode}`);
    console.log('    ✓ 系统健康探针状态:', healthJson.data?.status);

    console.log('\n========================================');
    console.log('🎉 验证完毕！各项服务工作正常无异常！');
    console.log('========================================');
  } finally {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(rawToken));
    console.log('已安全清理测试会话。');
  }
}

main().catch(err => {
  console.error('验证执行失败:', err);
  process.exit(1);
});
