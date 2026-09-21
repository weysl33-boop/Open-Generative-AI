# koyosim.com 线上环境深度审查报告（实测版）

审查时间：2026-09-20 09:46–09:55 CST
服务器：`43.155.166.90`（VM-0-10-ubuntu，Ubuntu，2 核 / 1.9G 内存 / 50G 磁盘已用 67%）
站点目录：`/home/wwwroot/AI/domain/koyosim.com/web/`
方式：SSH 实机取证 + 外部黑盒比对 + 生产库直查

> 本文替换同日早先那份基于外部黑盒的推测版报告。早先的"nginx 配置缺入口"等根因假设已被实测否定，结论见 §1。

---

## 0. 接入方式（重要，避免下次重蹈覆辙）

- 登录用户是 **`ubuntu`，不是 `root`**（腾讯云默认）。`root` 密码登录被拒属正常。
- 本机 `FlClash` TUN 网卡会劫持出站流量并掐断 SSH（`kex_exchange_identification: Connection closed`），`NO_PROXY` 对 SSH 无效。必须绑定物理网卡源地址：`ssh -b 192.168.3.8 ubuntu@43.155.166.90`。
- `ubuntu` 具备 `sudo NOPASSWD`。
- 复用工具：`.agents/rssh.py`（执行远程命令）、`.agents/rpipe.py`（本地 SQL/脚本内容经 stdin 安全送达，规避三层引号嵌套）、`.agents/audit.sql`、`.agents/audit2.sql`。
- 服务器 **SFTP 子系统不可用**，scp/sftp 均不通，只能走 exec_command。

## 1. 关于"整站 403"：事故成立但已自愈，真正问题是发布方式

外部黑盒在 09:38–09:39 观测到 `/`、`/login`、`/terms`、`/community` 等全部返回 138 字节 nginx 默认 403 页，所有 `/api/*` 返回统一 JSON 403。09:47 复测时已恢复（`/` → 307、`/api/health` → 200）。

实测对齐的时间线证明这是**发布窗口的硬停机**：

| 时刻 (CST) | 事件 |
|---|---|
| 09:31 | 站点目录 mtime |
| 09:32:12 | `koyosim.service` + `koyosim-worker.service` 同时重启 |
| 09:38–09:39 | 我从公网观测到全站 403 |
| 09:42 | `.next` 被替换 |
| 09:47 | 全站恢复 |

根因不是配置错误：nginx 的 `location /` 明确 `proxy_pass http://127.0.0.1:3100`，Next.js 与 worker 都由 systemd 正常托管，`nginx -t` 通过。问题是**部署流程采用停机式重启**，且 `next start` 与 `.next` 产物替换不是原子的，重启窗口内整站对外不可用。

日志显示 24 小时内 `koyosim.service` 重启 **15 次**（全部为 `Deactivated successfully`，即人工/脚本触发，无崩溃、无 OOM）。也就是每天约 15 个中断窗口。

**连带缺陷：vhost 里 `access_log off`**，因此这次 403 无法从日志回溯确证，只能靠时间线推断。生产站点没有访问日志，等于放弃了全部故障取证能力。

待办（P0/P1）：
1. 发布改为蓝绿/软链切换（`releases/<ts>` + `current` 符号链接）或至少 `systemctl reload` 级别的优雅切换，消除停机窗口。
2. 打开 `access_log`（可只保留关键字段格式并做日志轮转），否则任何线上故障都无法定位。
3. 修复 `nginx: [warn] protocol options redefined for 0.0.0.0:443 in koyosim.com-https.conf:3`（`listen 443 ssl http2` 与相邻 server 重复定义，且 `http2` 新语法应改 `http2 on`）。

## 2. 线上代码不可复现（P0）

```
HEAD: 871c1d4 "Revise video content in README.md"   ← 上游 Open-Generative-AI 的历史
git status --porcelain | wc -l  = 420               ← 420 个未提交的脏文件
本地仓库 HEAD: 46d9d99 feat(community)
```

线上跑的是一个**未提交的工作树**，不属于任何提交、没有可复现构建、无法回滚，且与本仓库已经分叉。外部黑盒早先发现"线上 CSP 含 `frame-src ...*.alipay.com / excashier.alipay.com`，而本地仓库 `git grep excashier|frame-src` 零命中"，正是这个分叉的直接证据。

这是当前**最危险的工程问题**：任何基于本地代码的修复、验收和事故复盘都不可靠。

待办：先在服务器上把 420 个脏文件按功能切成提交（或至少 `git stash`/`git diff > patch` 全量落地到本仓库），确定真相来源后再决定合并方向；此后发布必须由 CI/构建产物驱动，禁止直接改线上工作树。

## 3. 数据库与里程碑真实进度（PROJECT.md 已过期）

- 迁移表：`sys_core.schema_migrations`，**已应用 22 条，覆盖 `001_admin_v1` → `021_user_onboarding_and_profile_tags`**（含 `003` 两个并行版本）。
- 结论：**F01 已完成**。PROJECT.md 写的"线上停留在 006，007~013 Pending"严重过期。
- `GENERATION_ASYNC=true` 已在 `/etc/koyosim.env` 生效，`koyosim-worker.service` 由 systemd 常驻托管并正常运行 → **F04/F05 已完成**。
- 敏感词/请求防护存在实现：`lib/security/requestGuard.js`（覆盖面需做代码级确认，不能据此断言 F17 完成）。

生产数据量（`pg_stat_user_tables`）：

| 表 | 行数 |
|---|---|
| `ai_studio.provider_models` | 131 |
| `ai_studio.ai_models` / `model_pricing` / `routing_policies` | 88 |
| `sys_core.auth_events` | 65 |
| `ops_bill.admin_audit_logs` | 46 |
| `auth_usr.sessions` | 38 |
| `auth_usr.users` | **8** |
| `ops_bill.orders` | 3 |
| `ops_bill.credit_ledger_v2` | 9 |
| `ai_studio.creations` | **0** |

**`creations` 为 0 条**是核心风险：整条"生成 → 预扣额度 → 转存 → 沉淀作品 → 社区/Remix"闭环在生产环境从未跑通过一次，M3/F08~F11 与 M5/F16 都缺少任何真实数据支撑。PROJECT.md 的里程碑表（M1 IN_PROGRESS、M2~M5 PLANNED）与实际严重脱节，需要以本次实测为基准重排。

## 4. 未实现的既定需求（实测确认）

| 项 | 实测证据 | 判定 |
|---|---|---|
| **F16 资产持久化转存** | `/etc/koyosim.env` 里 `COS_BUCKET/COS_REGION/COS_ENDPOINT/COS_SECRET_ID/COS_SECRET_KEY/COS_PUBLIC_URL` 与 `R2_*` 全套凭证都在，但 `grep -RIl "process.env.(COS_|R2_)" lib app scripts` **命中 0 个文件**；代码里也搜不到 `PutObject/S3Client/@aws-sdk/oss-cn` | **未实现**，凭证空转。生成结果仍会存模型商临时外链，一旦过期全站作品裂图。因 `creations=0` 尚未暴露 |
| **F19 生产定时自动备份** | `sudo crontab -l` 无 `auto-backup` / `pg_dump` 相关任务；只有腾讯云 stargate、AMH 的 SSL 续期/WAF/日志拆分任务；站点内 `backup/billing-foundation-20260916.tgz` 是 9-16 的手工包 | **未实现**。数据库每天全裸，无异地备份 |
| **F14/F15 支付生产化** | `STRIPE_MODE=test` | 线上支付仍是测试模式，真实收款未切换 |

## 5. 服务器环境层面的问题清单

**磁盘与目录卫生**
- `/home/wwwroot/AI/domain/koyosim.com/` 下存在 `bin dev etc lib lib64 tmp usr`（root 属主，创建于 9-17 05:17），是一次**在错误目录解包 rootfs/备份归档**的残留；该目录总大小 **3.7G**（磁盘已 67% 满）。这些目录在站点根的同级，一旦 vhost 的 `root` 被改到上一层即等于把系统文件暴露到公网。建议确认后归档移位，不要直接 `rm -rf`。
- 同域出现两个目录：`/home/wwwroot/AI/domain/koyosim.com`（真站点）与 `/home/wwwroot/AI/domain/KOYOSIM.COM`（含 `web/`，非运行副本）。AMH 的 cron 注释里也写作 `KOYOSIM.COM`。大小写混用极易导致误配 `root`。
- `/home/wwwroot/AI/domain/koyosim.com/web/backups/` 内是 `codex-*` 历史快照目录（站点内旧构建），与运行时无关，应移出 web 树。

**权限**
- 站点根及 `app components lib scripts public packages docs i18n electron build src` 等**大量目录是 777（world-writable）**。任何本机被攻破的低权限进程（这台机器上还跑着 PHP/Laravel、pm2、多个其他站点）都可以直接改源码，而 `koyosim.service` 又以 `www` 执行这些代码 → 等价于本地提权/供应链投毒通道。应收敛到 `750/640`、文件属主统一。
- `cookies.txt`（666，含会话 Cookie）躺在站点根，是明显的调试残留，应删除。
- `/etc/koyosim.env` 为 `640 root:www`，这一项配置是对的。

**定时任务错误（每分钟失败）**
```
* * * * * cd /home/wwwroot/AI/domain/koyosim.com/web && sudo -u www /usr/bin/php artisan schedule:run >> .../web/storage/logs/scheduler.log
```
koyosim.com 是 Next.js 项目，`web/storage` 与 `artisan` 都不存在（实测 `No such file or directory`）。这条 PHP Laravel 计划任务被错配到了本项目上，**每分钟执行一次、每分钟失败一次**；同机器另有一条指向 `kacal` 的是正常的。应删除或改指向正确项目。

**进程管理双头**
- worker 同时存在 `koyosim-worker.service`（systemd，正常运行）与 pm2 里的 `koyosim-worker`（状态 stopped，历史重启计数已达 129+）。两套管理器管同一个 worker，容易出现双写队列或误判。建议 `pm2 delete koyosim-worker` 并清理 pm2 开机保存，统一由 systemd 管理。
- 同一台 2 核机器还承载 `kacal`（Laravel + `kacal-php84.service`）、`ourslake.com`、`seelucency.com`、`sim.ourslake.com`、`simmekeep`、`model-schedule-api`、`zhongcao-server` 等多个站点/进程。**当前 load average 6.0~6.4（2 核，超载 3 倍），可用内存仅 655M**，CPU 占用前列是 8 个各约 17.5% 的 `php-fpm` worker。koyosim 的 403 类中断与这类资源挤占有直接关系，也应重新评估 Next.js 构建（`next build` 峰值内存）是否该放在本机执行。

**安全头重复与归属冲突**
nginx vhost 里 `add_header X-Content-Type-Options nosniff / X-Frame-Options SAMEORIGIN / Referrer-Policy / HSTS`，而 `middleware.js` 同样在设 `X-Content-Type-Options`、`X-Frame-Options: DENY`、CSP。实测同一响应里出现两份头：
```
x-frame-options: DENY            ← 应用
X-Frame-Options: SAMEORIGIN      ← nginx（更宽松）
x-content-type-options: nosniff  ×2
```
`X-Frame-Options` 取值冲突属配置错误，防护实际由最严格值生效但不可依赖；且 CSP 只在应用层、nginx 层缺失。建议：**安全头统一由 Next.js middleware 负责，nginx 只保留 HSTS**，去掉重复 `add_header`。

**其他配置冗余**
- `koyosim.com-https.conf` 中保留了 PHP `location ~ ^(.+\.php)(.*)$ → fastcgi_pass unix:/tmp/php-cgi-AI-koyosim.com.sock`，本项目不需要 PHP 执行入口，属无谓攻击面，建议删除。
- 第二个 server 块 `server_name go.koyosim.com wwww.koyosim.com;` 里的 `wwww.koyosim.com`（四个 w）是拼写错误。
- vhost 目录留有 `go.koyosim.com.conf.bak`、`.conf.merged_bak`、`koyosim.com-https.conf.bak` 等历史文件；另有 `koyosim_cn/vhost/todo-http-redirect.conf`、`todo-ssl.conf` 这类"待办"命名配置，需确认是否仍被 include。

## 6. 外部可见问题

- `/login` 返回 **404**（实测 `len=7866`）。全站没有 `/login` 路由，登录是 `app/auth/` + `AuthModal` 模态框方案。风险点：所有找回密码邮件、支付回跳、第三方 OAuth 回调、用户手输/收藏夹里的 `/login` 都会落到 404。建议加 `/login → /`（带 `?signin=1` 自动拉起弹窗）的 301/302。
- `robots.txt` 公开列出 `Disallow: /admin/`、`Disallow: /api/`，等于向爬虫标注后台入口。`/admin` 有 `lib/admin/pageAuth.js` + `authz.js` 鉴权（实测未登录访问会被应用层拒绝），因此不是直接泄露，但建议 `pageAuth` 对未授权访问返回 404 语义而非可识别页，减少对后台存在性的探测。
- TLS 正常：`CN=www.koyosim.com`，Let's Encrypt，有效期 `2026-09-16 → 2026-12-15`（剩约 86 天），AMH 的 SSL 续期 cron 存在。
- 裸域 `koyosim.com → https://www.koyosim.com` 301、HTTP → HTTPS 301、HSTS 均已生效。
- 静态资源与构建产物正常：`/_next/static/css/503e19ea0d07de80.css` 200（230KB）、`/favicon.ico` 200。
- 公网侧未泄露源码类文件（`/.env`、`/.git/HEAD`、`/cookies.txt`、`/ecosystem.config.cjs` 全部 404），因为 nginx 只对 `location /` 反代到 Node，静态仅白名单了 `_next/static`、`uploads/`、`favicon.ico`、`robots.txt`。这项保持现状即可，但一旦有人调整 `root` 就会破口，与 §5 的目录卫生问题叠加。

## 7. 建议的处置顺序

1. **恢复可复现性**：把服务器 420 个脏文件落成提交并 push，确定线上真版本；之后禁止直接改线上工作树。（最高优先，其他所有工作的地基）
2. **消除发布停机 + 打开 access_log**：蓝绿/软链发布，日志先于功能修复，否则下次 403 仍无法取证。
3. **补 F16 资产转存**：凭证已在 env，把 worker 成功路径接上 COS/R2 落盘，改成持久域名外链。
4. **补 F19 自动备份**：`pg_dump` + 上传 COS/R2 + 保留策略 + 恢复演练，纳入 crontab。
5. **收敛权限与清理**：777 目录降到 750、删 `cookies.txt`、移走 3.7G rootfs 残留与 `web/backups/`、删错误 artisan cron、清理 pm2 遗留 worker。
6. **安全头归一 + nginx 配置修正**：去重 `add_header`、删 PHP handler、修 `listen` 告警与 `wwww` typo。
7. **加 `/login` 兼容跳转**；把 `STRIPE_MODE` 从 `test` 切生产（需你确认可收款）。
8. **容量决策**：2 核 1.9G 承载 6+ 站点且 load 6.0，建议把 koyosim 的构建搬到 CI 或升配/拆机。

## 8. 需要用户确认的决策点

1. 上线支付：`STRIPE_MODE=test` 是否现在切生产？支付宝（`ALIPAY_APP_ID=2021006156651438`）是否已正式审核通过可收款？
2. §7 第 1 步要在服务器上产生提交并推送，是否授权？（会改动远端仓库状态）
3. 3.7G 误建目录、`web/backups/`、`cookies.txt`、错误 artisan cron、pm2 遗留 worker —— 属于删除类操作，确认后我再逐项执行（默认先移位归档而非删除）。
4. 是否同意调整 nginx（开 access_log、去重复安全头、删 PHP handler）并 `nginx -s reload`？reload 平滑、不中断服务。
