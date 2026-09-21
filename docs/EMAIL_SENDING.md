# 邮件发信（SMTP）设置与统计

单一入口：后台「系统与安全 → 邮件发信设置」`/admin/system/email`。凭据、连接检查、测试发信、
发信统计与逐封内容明细都在这一个页面上，不再拆成登录页的分段标签或多张卡片。

旧地址 `/admin/email` 与 `/admin/providers/email` 一律重定向到本页。

## 通道约束

- 固定 `smtp.exmail.qq.com : 465 · SSL/TLS`，`rejectUnauthorized: true`，不提供自定义 host/port。
- 客户端专用密码只写入 `ops_bill.provider_secrets`（AES-GCM），读取接口不返回明文；
  表单里留空表示保留现有密码。
- 改密与配置同一请求提交：一旦填写了新密码，必须同时通过 `verifyAdminPassword` 重新验证管理员身份。
- 测试发信按管理员维度限流（每小时 3 次），并带 `Idempotency-Key`。

## 发信明细

`auth_usr.email_send_logs`（迁移 `029_email_send_logs.sql`）逐封记录投递事实：
收件人、收件域名、类型、主题、正文摘要、成功/失败、错误码、耗时、关联用户与操作人。

写入路径统一在 `lib/emailService.js` 的 `deliverEmail()`：成功与失败都留痕，
写日志失败绝不阻断发信本身。

**脱敏红线**：正文摘要入库前经 `redactSecrets()` 处理，验证码一类的 6 位数字一律替换为
`******`。明细表可以被任意具备 `providers.read` 的后台账号检索，因此绝不能成为验证码的副本。

`purpose` 取值 `verification | test | system | marketing`，由 CHECK 约束固定。

## 邮件营销系统（待定计划，尚未开工）

结构已预留，产品能力**未实现**，页面上以「待定计划」卡片明示：

- 受众分群：复用「用户运营管理」的运营标签，不另建名单体系。
- 模板与排期：主题/正文模板、定时发送、按收件域名限速。
- 合规：退订链接与订阅状态必须先于任何群发上线（境内备案与营销邮件合规口径待确认）。
- 回执：投递结果回流同一张 `email_send_logs`，`purpose = 'marketing'` 已可用，无需再改表。

开工前需确认：发送配额与风控（避免企业邮箱被判定为垃圾邮件源）、退订存储、以及是否复用
当前 SMTP 通道或改用独立发信域名。
