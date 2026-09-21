# AI 交接文档（AI_HANDOFF）

面向下一个上下文窗口。当前执行的是"持续自主开发"总指令：`SCAN → FIX → BUILD → TEST → VERIFY → CONTINUE`，不得停在分析或计划上，不得擅自 `git push`。

## 0. 此刻正在做的事（最重要）

线上发布进行到一半。已完成：本地构建、内容比对、分片上传通道重建。待完成：打包 → 上传 → 执行远端脚本 → 线上复验。

顺序（勿跳过校验）：

1. **隔离构建**：`NEXT_DIST_DIR=.agents/verify-next npm run build`。这个工作树被多个会话共用（见第 7 节），直接构建到 `.next` 会被别人的并发构建 prune 掉，表现为 `Cannot find module for page: /_not-found` 或 `Cannot find module './5611.js'`，与源码无关。
2. **产物完整性校验**：`node -e "console.log(Object.keys(require('./.agents/verify-next/server/app-paths-manifest.json')).length)"` 必须 ≥ 200。构建 exit 0 也可能得到全 404 的坏产物（曾实测：清单为 0，`/` 与 `/api/health` 全 404，但 middleware 头仍在）。
3. `NEXT_DIST_DIR=.agents/verify-next bash .agents/serve.sh 3124` 本地冒烟，脚本末尾打印 `non_2xx_3xx=N`，必须为 0（覆盖 `/ /login /account /zh /zh/pricing /ja-JP /ko-KR /es /pricing /studio /studio/workflows /community /creations /call-api /agents /admin /auth/google /robots.txt /sitemap.xml /this-route-does-not-exist /api/health /api/live`）。
4. 打包两个归档（源码归档范围与旧包一致：`app components lib messages packages/studio public scripts middleware.js next.config.mjs package.json tailwind.config.js index.html`）。
5. `python .agents/rput_chunked.py <本地文件> <远端路径>` 逐个上传，脚本会打印 `remote md5=... match=True`，必须为 True。
6. `python .agents/rssh.py "sudo bash /home/ubuntu/remote-deploy.sh"`。
7. 线上复验：`/api/health` 期望 `status:ok` 且 `migrations.ok:true`；`/login` 期望 302；`/studio/workflows`、`/zh/pricing`、首页标题与 `_next/static` 资源期望 200。

## 1. 环境与访问约束

- 站点：`https://www.koyosim.com`（`go.koyosim.com` 已彻底停用，不再服务，也不保留 301）。服务器 `43.155.166.90`，登录用户 `ubuntu`（非 root，运维操作走 `sudo bash`），网站根目录 `/home/wwwroot/AI/domain/koyosim.com/web/`，属主 `www:www`。
- 本机代理 FlClash TUN 会掐断长 SSH 数据通道：**所有 SSH 必须绑定物理网卡源 IP `192.168.3.8`**；服务器**没有 SFTP 子系统**；MB 级传输用 `.agents/rput_chunked.py`（分片长度必须是 3 的倍数，否则 base64 中段填充会让远端解码报 `invalid input`）。
- Git Bash 需要 `export MSYS_NO_PATHCONV=1`，否则 `/tmp`、`/home/...` 会被改写成 Windows 路径；临时文件统一放 `.agents/`（Windows 版 Python 与 Git Bash 对 `/tmp` 认知不一致）。
- `.agents/` 已被 gitignore，内含服务器口令，**不要提交、不要在回复里复述凭据**。
- 本地构建需要 `DATABASE_URL`（取自 `.env.local`）；`next build` 不带它也能过，但 `db-status`/迁移类脚本会失败。

## 2. 数据库与迁移纪律

- PostgreSQL 16，schema：`auth_usr` / `ai_studio` / `ops_bill` / `sys_core`。
- 迁移只前进、按 sha256 记账：`checksum = sha256(去掉 BOM 的 utf8 字节)`，账本 `sys_core.schema_migrations` 不存 SQL 文本。已确认 001/002 校验和为 NULL，005/006/017/022 与线上账本逐字节一致。
- 005 漂移回滚语句：`UPDATE sys_core.schema_migrations SET checksum='bc7557ad9038eb2387e6a18f8afad4d021aed65ed9d72c74dcf8baa5e9dce580' WHERE version='005_seed_defaults';`
- `.gitattributes` 已固定 `lib/db/migrations/** -text`：仓库 `core.autocrlf=true`，缺这一行会在检出时批量污染校验和。

## 3. 代码结构要点

- Next.js 15.5.25 App Router（JavaScript，非 TS），`next start` 监听 `127.0.0.1:3100`，多语言是 `app/[locale]/` + `app/zh/...` 自建注册表（`lib/locales.js`），**没有 next-intl 运行时**。⚠️ 本机实际生效的是**未提交**的 `next.config.js`（Next 的配置文件查找顺序是 `.js` 优先于 `.mjs`，已用 `next/dist/server/config.js` 的 `loadConfig` 探针确认）；已提交的 `next.config.mjs` 里的 `transpilePackages` 与 `withNextIntl` 在本地根本不参与构建。两个文件内容不一致，收敛前不要往 `.mjs` 里加东西。
- 分层：路由 → `lib/services/*` → `lib/repositories/*` → `lib/db`。`test:p0` 正在把约 40 个越层直连仓储的文件收敛回来。
- 错误出口统一走 `lib/security/publicError.js`：`publicErrorMessage`（错误码白名单，app/api 下不得出现 `error.message` 字样，连日志也不行）与 `diagnosticErrorMessage`（管理端诊断，脱敏 + 截断）。
- 管理端鉴权在 `lib/admin/authz.js`（`withAdminErrorBoundary` / `requirePermission` / `guardMutation` / `ADMIN_ENABLED` 总开关）与 `lib/admin/pageAuth.js`。
- 资金：`lib/financial/*`（钱包双边加锁按 `user_id` 排序 `FOR UPDATE`）、`lib/payments/*`（验签缺公钥一律 fail-closed）。

## 4. 门禁

`npm run test:ci` 已加入 `check:imports`（含 `studio/*` 子路径 exports 契约）与 `check:react-imports`（React API 只能从 `react` 取）。当前已知红：`test:p0` 2 项（分层，且随其他会话新增 `app/admin/models/**`、`lib/services/{smartRouter,pricingEngine,circuitBreaker,content,analyticsFinancial}.js` 继续增长）、`test:p5` 3 项（懒加载分包 / workflow 404 兜底 / 模型目录 error 态）。除此之外全绿。

禁止的捷径：删测试、注释报错、大范围 `any`、`@ts-ignore`、`eslint-disable`、空 catch、假返回、mock 生产接口。

## 5. 待用户决策

1. 轮换已暴露的管理员密码、火山 ARK Key、Provider KEK（明文凭据副本已隔离在 `/root/cred-quarantine`，600 权限，未删除以便回滚）。
2. 服务器上约 600 MB 旧 tar 包、1.1 GB `.next/cache`、webroot 777 权限、666 权限文件：都**刻意保留**（回滚安全网），清理需要授权。
3. 大量脏文件（约 420）按逻辑分组提交的范围确认，以及是否允许推送到远端（当前**不推**）。

## 6. 已完成提交（本轮）

`01a42d3` API 错误出口收敛 · `4728fe1` 管理端权限守卫 · `2cddb38` 支付验签 fail-closed · `bf0220f` 迁移与 `.gitattributes` · `21af8e8` 钱包双边锁。其后：认证入口断链、OAuth 回调去重、`/login`、`/workflow` 死链、Edge 依赖、`check:imports` 门禁（提交信息见 `git log`）。
