// 一次性写入 Volcengine/ARK provider 凭据；密钥只从环境读取，不落盘。
// 用法：VOLCENGINE_API_KEY=ark-xxx node scripts/save-volcengine-secret.mjs
import crypto from 'node:crypto';
import fs from 'node:fs';
import pg from 'pg';

const ENCRYPTION_ALGO = 'aes-256-gcm';

try {
  if (typeof process.loadEnvFile === 'function' && fs.existsSync('.env.local')) process.loadEnvFile('.env.local');
} catch {}

// 与 lib/repositories/providers.js 的 getWrappingKey() 保持同一解析顺序，
// 否则脚本写入的密文运行时无法解密。
function getWrappingKey() {
  const secret = process.env.PROVIDER_SECRETS_ENCRYPTION_KEY
    || process.env.ADMIN_SECRET_KEY
    || process.env.BILLING_SESSION_SECRET
    || process.env.OAUTH_STATE_SECRET;
  if (!secret) throw new Error('缺少 provider secret 加密密钥（PROVIDER_SECRETS_ENCRYPTION_KEY / ADMIN_SECRET_KEY）');
  return crypto.createHash('sha256').update(secret).digest();
}

function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGO, getWrappingKey(), iv);
  return {
    ciphertext: cipher.update(text, 'utf8', 'hex') + cipher.final('hex'),
    nonce: iv.toString('hex'),
    auth_tag: cipher.getAuthTag().toString('hex'),
  };
}

async function main() {
  const databaseUrl = String(process.env.DATABASE_URL || '').trim();
  if (!databaseUrl) throw new Error('缺少 DATABASE_URL');
  const apiKey = String(process.env.VOLCENGINE_API_KEY || process.env.ARK_API_KEY || '').trim();
  if (!apiKey) throw new Error('缺少 VOLCENGINE_API_KEY（或 ARK_API_KEY）');

  const pool = new pg.Pool({ connectionString: databaseUrl });
  const enc = encrypt(apiKey);
  const now = new Date().toISOString();
  const client = await pool.connect();
  try {
    // 写入 volcengine 与 ark 两种 provider 别名
    for (const provider of ['volcengine', 'ark']) {
      await client.query(`
        INSERT INTO ops_bill.provider_secrets (provider, name, ciphertext, nonce, auth_tag, key_version, updated_at)
        VALUES ($1, 'api_key', $2, $3, $4, 1, $5)
        ON CONFLICT (provider, name) DO UPDATE SET
          ciphertext = EXCLUDED.ciphertext,
          nonce = EXCLUDED.nonce,
          auth_tag = EXCLUDED.auth_tag,
          updated_at = EXCLUDED.updated_at
      `, [provider, enc.ciphertext, enc.nonce, enc.auth_tag, now]);
      console.log(`[OK] Saved secret for provider: ${provider}`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Error saving secret:', err.message);
  process.exit(1);
});
