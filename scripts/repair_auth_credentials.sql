-- 凭据补齐工具：只修「hash/salt 成对性」，不写入任何具体口令。
-- 重置管理员密码请使用环境变量驱动、会同时作废会话的脚本：
--   ADMIN_EMAIL=admin@koyosim.com ADMIN_RESET_PASSWORD='<至少12位>' node scripts/reset-admin-password.mjs
-- 禁止在本文件（或任何会部署到服务器的脚本）里出现明文口令、hash 或 salt。

BEGIN;

-- 1. users 缺少完整凭据、email 账号有完整凭据 -> 从账号整对复制（禁止只补 salt）
UPDATE auth_usr.users u
SET password_hash = a.password_hash,
    password_salt = a.password_salt,
    updated_at = NOW()
FROM auth_usr.auth_accounts a
WHERE u.id = a.user_id
  AND a.provider = 'email'
  AND a.password_hash IS NOT NULL AND a.password_salt IS NOT NULL
  AND (u.password_hash IS NULL OR u.password_salt IS NULL);

-- 2. email 账号缺少完整凭据、users 有完整凭据 -> 从主表整对复制
UPDATE auth_usr.auth_accounts a
SET password_hash = u.password_hash,
    password_salt = u.password_salt,
    updated_at = NOW()
FROM auth_usr.users u
WHERE a.user_id = u.id
  AND a.provider = 'email'
  AND u.password_hash IS NOT NULL AND u.password_salt IS NOT NULL
  AND (a.password_hash IS NULL OR a.password_salt IS NULL);

COMMIT;

-- 3. 校验：三张口径都应为 0 行
SELECT 'half_credential_users' AS check_name, COUNT(*) FROM auth_usr.users
WHERE (password_hash IS NULL) <> (password_salt IS NULL)
UNION ALL
SELECT 'half_credential_accounts', COUNT(*) FROM auth_usr.auth_accounts
WHERE provider = 'email' AND (password_hash IS NULL) <> (password_salt IS NULL)
UNION ALL
SELECT 'mismatched_pairs', COUNT(*) FROM auth_usr.users u
JOIN auth_usr.auth_accounts a ON a.user_id = u.id AND a.provider = 'email'
WHERE u.password_hash IS DISTINCT FROM a.password_hash
   OR u.password_salt IS DISTINCT FROM a.password_salt;
