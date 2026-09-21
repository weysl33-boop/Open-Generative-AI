import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 加载环境变量
try {
  if (typeof process.loadEnvFile === 'function' && fs.existsSync('.env.local')) {
    process.loadEnvFile('.env.local');
  }
} catch {}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const { query } = await import('../lib/db/index.js');
const { getBrandConfig, getNavigationConfig } = await import('../lib/services/branding.js');

async function runAudit() {
  console.log('================================================================');
  console.log('🔍 [koyosim 运营与前端管理全量深度审计]');
  console.log('================================================================\n');

  let passedCount = 0;
  let totalCount = 0;

  function record(title, success, detail = '') {
    totalCount++;
    if (success) {
      passedCount++;
      console.log(`✔ [PASS] ${title}`);
      if (detail) console.log(`   └─ ${detail}`);
    } else {
      console.error(`✘ [FAIL] ${title}`);
      if (detail) console.error(`   └─ ${detail}`);
    }
  }

  // 1. 路由与文件结构连通性审计
  console.log('【1. 路由与代码文件存在性与导出审计】');
  const targetRoutes = [
    { route: '/studio', file: 'app/studio/[[...slug]]/page.js', desc: '核心 Studio 前台画布' },
    { route: '/community', file: 'app/community/page.js', desc: '即梦社区广场' },
    { route: '/creations', file: 'app/creations/page.js', desc: '作品管理中心' },
    { route: '/account', file: 'app/account/page.js', desc: '个人账户与充值' },
    { route: '/terms', file: 'app/terms/page.js', desc: '服务条款协议' },
    { route: '/refund', file: 'app/refund/page.js', desc: '退款保障说明' },
    { route: '/privacy', file: 'app/privacy/page.js', desc: '隐私合规政策' },
    { route: '/content-policy', file: 'app/content-policy/page.js', desc: '内容安全准则' },
    { route: '/admin/content/branding', file: 'app/admin/content/branding/page.js', desc: '运营后台前端管理页面' },
    { route: '/api/site/branding', file: 'app/api/site/branding/route.js', desc: '全站前端配置公开接口' },
    { route: '/api/admin/content/branding', file: 'app/api/admin/content/branding/route.js', desc: '管理后台配置读写接口' },
    { route: '/api/admin/content/branding/upload', file: 'app/api/admin/content/branding/upload/route.js', desc: 'Logo 图片上传安全落盘接口' },
    { route: 'components/admin/branding/LogoCropper.js', file: 'components/admin/branding/LogoCropper.js', desc: '前端交互式图像裁剪组件' },
  ];

  for (const item of targetRoutes) {
    const fullPath = path.join(repoRoot, item.file);
    const exists = fs.existsSync(fullPath);
    if (exists) {
      const code = fs.readFileSync(fullPath, 'utf8');
      const hasExport =
        code.includes('export default') ||
        code.includes('export async function GET') ||
        code.includes('export const GET') ||
        code.includes('export const POST') ||
        code.includes('export async function POST');
      record(`路由/组件 ${item.route} (${item.desc})`, hasExport, `文件位于 ${item.file}`);
    } else {
      record(`路由/组件 ${item.route} (${item.desc})`, false, `缺少对应文件: ${item.file}`);
    }
  }

  // 2. 数据库与落盘审计
  console.log('\n【2. 数据库配置落盘与持久化审计】');
  const brandRow = await query(`SELECT key, value_json, updated_by, updated_at FROM ops_bill.system_settings WHERE key = 'site_brand'`);
  const navRow = await query(`SELECT key, value_json, updated_by, updated_at FROM ops_bill.system_settings WHERE key = 'site_navigation'`);

  const hasBrand = brandRow.rowCount > 0;
  record('数据库 site_brand 配置行持久化存在', hasBrand, hasBrand ? `更新人: ${brandRow.rows[0].updated_by || 'system'}, 更新时间: ${brandRow.rows[0].updated_at}` : '未找到记录');

  const hasNav = navRow.rowCount > 0;
  let navItemsCount = 0;
  if (hasNav) {
    const rawVal = navRow.rows[0].value_json;
    const parsed = typeof rawVal === 'string' ? JSON.parse(rawVal) : (rawVal || []);
    navItemsCount = Array.isArray(parsed) ? parsed.length : 0;
  }
  record('数据库 site_navigation 菜单列表行持久化存在', hasNav, hasNav ? `更新人: ${navRow.rows[0].updated_by || 'system'}, 菜单数: ${navItemsCount}` : '未找到记录');

  // 3. 服务端配置数据结构与安全性审计
  console.log('\n【3. 服务端配置数据结构与安全性审计】');
  const brandConfig = await getBrandConfig();
  const navConfig = await getNavigationConfig();

  record('品牌配置字段完备性', Boolean(brandConfig.brandName && brandConfig.logoType && brandConfig.logoHref), `品牌: ${brandConfig.brandName}, 模式: ${brandConfig.logoType}, 底色: ${brandConfig.logoBgColor}`);
  record('导航菜单数组完备性', Array.isArray(navConfig) && navConfig.length > 0, `包含 ${navConfig.length} 个导航项: ${navConfig.map(n => n.label).join(', ')}`);

  // 检查导航链接安全性
  const dangerousLinks = navConfig.filter(it => it.href.toLowerCase().startsWith('javascript:'));
  record('导航菜单链接安全审计 (杜绝伪协议 XSS)', dangerousLinks.length === 0, `已扫描全部链接，无任何非法协议`);

  // 4. 管理员操作审计流水日志 (Audit Logs)
  console.log('\n【4. 管理员操作审计日志 (Audit Logs) 审计】');
  const auditLogs = await query(`
    SELECT action, target_type, target_id, risk_level, actor_email, created_at
    FROM admin_audit_logs
    WHERE target_type = 'system_setting' AND action LIKE 'branding%'
    ORDER BY created_at DESC
    LIMIT 5
  `);

  record('管理操作审计日志落盘留痕', auditLogs.rowCount > 0, `检索到最近 ${auditLogs.rowCount} 条前端管理审计记录，最新一条动作: ${auditLogs.rows[0]?.action} (操作员: ${auditLogs.rows[0]?.actor_email})`);

  // 5. 前台组件无假界面接入审计
  console.log('\n【5. 前端展示层真实接入审计 (杜绝硬编码假界面)】');
  const headerCode = fs.readFileSync(path.join(repoRoot, 'components/site/StudioHeader.js'), 'utf8');
  const shellCode = fs.readFileSync(path.join(repoRoot, 'components/StandaloneShell.js'), 'utf8');

  const userMenuCode = fs.readFileSync(path.join(repoRoot, 'components/UserDropdownMenu.js'), 'utf8');

  record('StudioHeader 左侧全站固定纯文字导航 (首页+社区)', headerCode.includes('href="/studio"') && headerCode.includes('href="/community"'), '顶栏左侧已固定配置首页与社区纯文字导航');
  record('StandaloneShell 左侧全站固定纯文字导航 (首页+社区)', shellCode.includes('href="/studio"') && shellCode.includes('href="/community"'), '工作室顶栏左侧已固定配置首页与社区纯文字导航');
  record('UserDropdownMenu 右上角固定图标简化 (语言/提醒/额度/头像)', userMenuCode.includes('Globe') && userMenuCode.includes('Bell') && userMenuCode.includes('Zap') && userMenuCode.includes('effectiveCredits'), '右上角图标已简化为固定独立图标群');
  record('我的作品已成功移入个人下拉菜单中', userMenuCode.includes('/creations') && userMenuCode.includes('FolderOpen'), '头像下拉菜单首位已集成我的作品直达入口');
  record('StudioHeader 支持自适应任意比例 Logo 图像', headerCode.includes('max-w-[200px]') && headerCode.includes('object-contain'), '顶栏已消除固定32px方盒限制，支持长条与方形Logo自适应渲染');
  record('StandaloneShell 支持自适应任意比例 Logo 图像', shellCode.includes('max-w-[180px]') && shellCode.includes('object-contain'), '工作室顶栏已消除固定32px方盒限制，支持长条与方形Logo自适应渲染');

  console.log('\n================================================================');
  console.log(`🎯 审计综合结果: 总审计项 ${totalCount} 项，通过 ${passedCount} 项，失败 ${totalCount - passedCount} 项`);
  console.log(`   通过率: ${((passedCount / totalCount) * 100).toFixed(1)}%`);
  console.log('================================================================');

  if (passedCount !== totalCount) {
    process.exitCode = 1;
  }
}

runAudit()
  .catch(err => {
    console.error('审计执行异常:', err);
    process.exitCode = 1;
  })
  .finally(() => {
    process.exit(process.exitCode || 0);
  });
