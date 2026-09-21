import crypto from 'node:crypto';
import pg from 'pg';

const { Pool } = pg;
const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}
const pool = new Pool({ connectionString: dbUrl });

console.log('--- 1. 检查环境变量 ---');
console.log('ADMIN_SECRET_KEY:', process.env.ADMIN_SECRET_KEY ? '存在' : '缺失(致命)');
console.log('PROVIDER_SECRETS_ENCRYPTION_KEY:', process.env.PROVIDER_SECRETS_ENCRYPTION_KEY ? '存在' : '缺失');
console.log('BILLING_SESSION_SECRET:', process.env.BILLING_SESSION_SECRET ? '存在' : '缺失');

console.log('\n--- 2. 检查数据库连接与 provider_secrets 表 ---');
try {
  const client = await pool.connect();
  console.log('数据库连接成功！');
  
  // 检查 search_path
  const pathRes = await client.query('SHOW search_path');
  console.log('Current search_path:', pathRes.rows[0]);

  // 检查 provider_secrets 表是否存在
  const tableRes = await client.query(`
    SELECT table_schema, table_name 
    FROM information_schema.tables 
    WHERE table_name = 'provider_secrets'
  `);
  console.log('provider_secrets 表位置:', tableRes.rows);

  // 尝试查询已有数据
  const dataRes = await client.query('SELECT provider, name, updated_at FROM ops_bill.provider_secrets');
  console.log('已有 provider_secrets 记录数量:', dataRes.rowCount);
  console.table(dataRes.rows);

  client.release();
} catch (err) {
  console.error('数据库测试失败:', err.message);
} finally {
  await pool.end();
}
