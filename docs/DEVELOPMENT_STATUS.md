# koyosim.com 开发状态

更新时间：2026-09-20（本轮：P0 安全与资金链路修复 + 线上发布准备）

## 1. 门禁状态（本地实测）

| 门禁 | 结果 | 说明 |
| --- | --- | --- |
| `format:check` | 通过 | 迁移 SQL 的字节完整性豁免见 `scripts/check-format.mjs` |
| `check:imports` | 通过（632 文件） | 本轮新增，见下方"新增门禁" |
| `security:secrets` | 通过 | 明文凭据已从仓库与工作目录清除 |
| `test:p0` | 21/23 | 失败项：`app/components` 直连仓储、服务层直写 SQL（分层收敛，进行中） |
| `test:p2` `test:p3` `test:p4` `test:p6` `test:p7` `test:admin` | 全绿 | — |
| `test:p5` | 3 项失败 | StandaloneShell 懒加载分包、workflow 404 兜底、模型目录 error 态 |
| `next build` | 通过 | 必须做产物完整性校验，见"发布纪律" |

新增门禁 `npm run check:imports`（`scripts/check-imports.mjs`）：`next build` 对"命名导入在目标模块并不存在"只给 **warning**，构建仍然成功，运行时才炸成 `undefined is not a function`。本轮用该方法抓到 4 个真实线上缺陷，因此把它固化为失败项。

## 2. 本轮已修复

- **认证入口断链**：`app/api/generation/quote/route.js` 调用不存在的 `findUserActiveSubscription`，异常被空 `catch` 吞掉 → 付费用户报价一律按 free 档计算。改为服务层 `getSubscription`，删除空 catch。
- **入驻问卷从未落库**：`app/api/user/onboarding/route.js` 通过命名空间引用了仓储层根本不存在的 `addUserTag` / `updateUserOnboarding`，且路由里没有任何写 021 迁移字段的 SQL → 提交即 500。现补齐 `lib/repositories/auth.js#updateUserOnboarding`，业务编排（字段长度校验、行业/偏好画像标签映射、事务）上移到 `lib/services/auth.js#submitUserOnboarding`，路由回归薄壳。
- **OAuth 回调重复实现**：`app/auth/**` 三条历史路由各自持有一份回调逻辑，且引用了不存在的 `bindUserOAuth` / `getPublicAppOrigin`，还向 `window.opener` 广播 `postMessage(msg, "*")`。现在它们只做同域转发到唯一实现 `/api/auth/oauth/<provider>/callback`，重复实现（`lib/services/oauthCallback.js`）删除。
- **`/login` 全站 404**：找回密码邮件、支付回跳、用户收藏夹普遍写死 `/login`，站点却只有 `/account` → 面板式登录。新增 `app/login/route.js` 302 到 `/account`；同时把 `ProfileTab` 注销后跳转从 `/login` 改为 `/account`。
- **`/workflow` 全部为死链**（admin 快捷入口、call-api 页导航、页脚、功能卡片 4 处）：实际路由是 `/studio/workflows`，已改齐。
- **Edge 运行时不可打包的依赖**：`lib/locales.js` 被 `middleware.js` 引用，却用 `createRequire('node:module')` 读 JSON，webpack 直接 `UnhandledSchemeError`。恢复静态 `import ... from '../messages/*/common.json'`。
- 支付验签 fail-open、钱包双花/死锁、管理端权限守卫、原始异常文本外泄等（详见 git log）。

## 3. 线上现状与发布准备

- `https://www.koyosim.com/api/health` = `degraded`：`database.ok = true`，`migrations.ok = false`。根因是线上 `005_seed_defaults.sql` 的实际字节与 `sys_core.schema_migrations.checksum` 漂移；本轮源码里的迁移文件已与账本逐字节核对，发布后应恢复 200。
- 全站 3851 个文件做过内容+时间双向比对：41 处差异**全部是本地更新**，另有 2 个仅存在于服务器的文件（覆盖式 tar 不会删除它们），因此叠加式发布安全。
- 上传通道限制：本机 FlClash TUN 会掐断长连接、服务器无 SFTP 子系统，故用 `.agents/rput_chunked.py`（240 KB 分片、分片长度为 3 的倍数以免 base64 中段填充、逐片 `stat` 校验 + `truncate` 重试 + 远端 md5 比对）。
- 发布纪律：`remote-deploy.sh` 做 `.next` 原子替换并保留 `.next-previous`，随后重启 `koyosim.service` 与 `koyosim-worker.service`。**禁止 git push**（未获授权）。

## 4. DEV QUEUE（按优先级）

1. P0 完成发布并复验：`/api/health` 回到 200、`/login` 与 `/studio/workflows` 可达、静态资源 200。
2. P0 轮换暴露过的凭据：管理员密码、火山 ARK Key、Provider KEK（需用户决策；明文凭据副本已隔离在服务器 `/root/cred-quarantine`，权限 600，未删除以便回滚）。
3. P1 分层收敛：约 40 个 `app/`、`components/` 文件直连 `@/lib/repositories|db`，服务层仍有裸 `query*`（对应 `test:p0` 两个失败项）。
4. P1 补齐 `test:p5`：StandaloneShell 懒加载分包 + 模型目录 error 态 + `packages/studio/src/muapi.js` 的 404 → `[]` 兜底。
5. P1 迁移演练：`migration:drill`、`db:migrate:test`、`backup:restore:drill`。
6. P2 遗留：F16 Storage Adapter 接线、F19 定时备份 + 异地副本 + 恢复演练、零停机发布、nginx `access_log` 复位与头部去重、`listen 443 ssl http2` 弃用告警、`wwww.koyosim.com` 拼写、PHP handler 清理、失效的 `artisan schedule:run` cron、残留 pm2 worker、webroot 777 权限、11 处 `alert()` 占位与 2 份 mock 数据、死配置 `next.config.js`、以及把剩余约 420 个脏文件按逻辑分组提交。

## 5. 已知风险

- 迁移账本 `sys_core.schema_migrations` 只存 sha256 校验和、不存 SQL 文本，已应用字节不可复原；漂移只能靠重新登记校验和修复。005 的回滚语句：
  `UPDATE sys_core.schema_migrations SET checksum='bc7557ad9038eb2387e6a18f8afad4d021aed65ed9d72c74dcf8baa5e9dce580' WHERE version='005_seed_defaults';`
- 仓库此前无 `.gitattributes`，而 `core.autocrlf=true` 会在检出时静默改写迁移文件字节、连带污染校验和；本轮已加 `.gitattributes`（`lib/db/migrations/** -text` 等）。
- 本地 `.next` 曾出现"构建 exit 0 但 `server/app-paths-manifest.json` 为空"的坏产物（95 个页面全部 404）。打包前必须校验该清单非空。
