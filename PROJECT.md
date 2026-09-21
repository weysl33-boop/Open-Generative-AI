# Project: Open Generative AI (KoyoSIM AI Studio) 商业发布就绪改造

> 统一权威工程编排与里程碑规范文档  
> 维护者：Project Orchestrator (Generation 2)  
> 状态：Survey 完成，双轨实施启动中

---

## 1. 架构总览 (Architecture)

### 1.1 核心数据与调用闭环全景
```
[前端 C 端用户]
       │
       ├── 1. 登录/注册 ──► 默认邮箱密码注册/登录（短信优雅降级） ──► 自动获赠初始体验额度 (10 credits)
       │
       ├── 2. 套餐充值 ──► 服务端订单额度快照 ──► Stripe Checkout/Webhook 幂等验签 ──► 支付后按订单快照入额度账本
       │
       ├── 3. 工作台创作 ──► 统一收口 POST /api/generations (带 Prompt 敏感词风控)
       │                         │
       │                         ├── [事务原子操作] ──► sys_core 预扣额度 (reserveCredits) + 写入 creations 表 (queued)
       │                         │
       │                         └── 返回 202 Accepted { creation_id, status: 'queued' }
       │
       ├── 4. 后台常驻消费 ──► Systemd 守护进程 koyosim-worker (scripts/generation-worker.mjs)
       │                         │
       │                         ├── SKIP LOCKED 悲观锁拉取任务 ──► 标记 processing ──► 调用 AI Provider 生成
       │                         │
       │                         ├── [生成成功] ──► 转存 S3/OSS 持久化存储 ──► commitCredits 扣减 ──► status='succeeded'
       │                         │
       │                         └── [超时/异常] ──► Watchdog 熔断自愈 ──► voidCredits 全额返还额度 ──► status='failed'
       │
       └── 5. 个人中心与社区 ──► 作品永续沉淀在 /creations ──► 支持高清下载 / 一键分享至 /community / 做同款 Remix 参数带入
```

---

## 2. 功能清单 (Feature Inventory)

根据 Phase 0 深度实地勘测，将全部需求（R1~R5）与验收标准（AC1~AC5）拆解为具体原子特性并分配归属里程碑：

| # | Feature | 核心描述 | 需求映射 | 归属里程碑 | 现状与差距 |
|---|---|---|---|---|---|
| F01 | PG 迁移基石推进 | 备份后将线上 007~013 迁移全部安全应用，解决状态机、模型目录、支付唯一性与退款表结构 | R3 / AC3.1 | **M1** | 线上停留在 006，7 个迁移 Pending |
| F02 | 独立测试库跑通 | 配置 `TEST_DATABASE_URL`，实现全量 `npm run test:db` 6 passed / 0 skipped | R3 / AC3.2 | **M1** | 缺少环境变量配置，命令中断退出 |
| F03 | 迁移与备份恢复演练 | 验证 `migration:drill` 与云端 `backup:restore:drill` 演练无阻断通过 | R3 / AC3.3 | **M1** | 需在云端运行并验证 |
| F04 | Worker 生产常驻守护 | 编写部署 `koyosim-worker.service`，实现开机自启、异常自动重启与平滑退出 | R2 / AC2.1 | **M2** | 生产无 worker 服务，未常驻运行 |
| F05 | 异步任务生成剥离 | `/etc/koyosim.env` 注入 `GENERATION_ASYNC=true`，任务从 Web HTTP 线程彻底剥离 | R2 / AC2.1 | **M2** | 生产未开启，全部在 Web 线程同步阻塞 |
| F06 | Worker 孤儿自愈与断点续跑 | 允许 Worker 启动时安全救援因 `kill -9` 中断的 `processing` 孤儿任务并自动跑完 | R2 / AC2.2 | **M2** | 状态机禁止重试，只查 queued，强杀后任务挂死 |
| F07 | Watchdog 超时熔断自愈 | 针对超时僵尸任务，自动释放预扣额度（voidCredits）并置为超时失败，杜绝账目损失 | R2 / AC2.3 | **M2** | 生产库缺 updated_at 字段导致 SQL 报错 |
| F08 | Studio 前端统一契约接入 | 前端全部 13+ 个 Studio 废除 `/api/api/v1` 代理，统一接入 `POST /api/generations` | R1 / AC1.1 | **M3** | 前端全部走透明反代，完全绕过计费 |
| F09 | 额度原子预扣与释放对账 | 生成时事务预扣额度，失败 100% 自动退还，余额实时一致 | R1 / AC1.2 | **M3** | 后端逻辑已具备，待前端接入打通 |
| F10 | 作品沉淀与做同款 Remix | 生成成功作品自动写入 `/creations`，工作台解析 URL query 支持做同款参数自动带入 | R1 / AC1.3 | **M3** | URL query 未解析，直连代理未写库 |
| F11 | 零额度引导与充值弹窗 | 零额度或额度不足时，拦截生成并弹出标准充值引导弹窗，支持一键购买 | R1 / AC1.4 | **M3** | 仅弹出 toast，未挂载 RechargeModal |
| F12 | 邮箱优先与认证降级 | 默认以邮箱密码为第一入口，未配置短信提供商时优雅屏蔽手机号通道，杜绝破绽弹窗 | R4 / AC4.1 | **M4** | 默认写死为 phone，点击报错破绽 |
| F13 | 新用户赠送初始体验额度 | 新用户注册成功自动发放初始体验算力额度（如 10 额度）并写入账本 | R4 / AC4.2 | **M4** | 代码已实现，需配合登录验证 |
| F14 | Stripe 支付自动发放额度 | 修复 Checkout 丢失 `metadata.credit_amount` 问题，支付成功自动到账算力额度 | R4 / AC4.3 | **M4** | metadata 缺失导致计算为 NaN，无法到账 |
| F15 | Webhook 事件幂等与退款流水 | 相同 Stripe 事件 ID 幂等拦截不重复发额度，退款支持反向记账与待对账留痕 | R4 / AC4.4 | **M4** | 逻辑已具备，需集成验证 |
| F16 | 资产持久化转存管道 | 异步转存模型供应商临时 CDN 链接至 S3/OSS 持久化存储，确保作品永不裂图 | R5 / AC5.1 | **M5** | 全代码库无转存，直接存临时链接 |
| F17 | Prompt 与社区敏感词拦截 | 在生成入口与社区发帖入口增加敏感词过滤守门，防止违规封号封站 | R5 / AC5.2 | **M5** | 两个入口均无任何敏感词风控 |
| F18 | 四大合规政策文本填充 | 将 `/terms`、`/privacy`、`/refund`、`/content-policy` 补齐真实法定主体与法务渠道 | R5 / AC5.3 | **M5** | 当前主体泛化无具体法人与邮箱 |
| F19 | 生产定时自动备份就绪 | 验证服务器 Crontab 定时自动备份任务就绪可用 | R5 / AC5.4 | **M5** | 需在云端配置与验证 |

---

## 3. 里程碑规划与依赖图谱 (Milestones)

| 里程碑 | 名称 | 目标与核心范围 | 依赖项 | 负责人/代理 | 状态 |
|---|---|---|---|---|---|
| **M1** | 数据库迁移与测试底座 | 线上备份并推进 007~013 迁移、配置独立测试库、跑通 `npm run test:db` (6 passed)、演练验证 | 无 | worker_m1_database_1 (bd977f49-f573-46e1-8947-01675b55fe0a) | **IN_PROGRESS** |
| **M2** | Worker 常驻守护与自愈 | 部署 `koyosim-worker.service`、开启 `GENERATION_ASYNC=true`、修复孤儿续跑、激活 Watchdog | M1 | Sub-orch: M2 | **PLANNED** |
| **M3** | 工作台与计费全闭环 | 前端 Studio 统一接入 `/api/generations`、事务原子扣费/返还、作品沉淀、做同款、充值引导弹窗 | M1, M2 | Sub-orch: M3 | **PLANNED** |
| **M4** | 登录降级与 Stripe 充值 | 登录默认邮箱优先与短信优雅隐藏、新用户赠额、Stripe Checkout 注入额度、Webhook 自动发放 | M1 | Sub-orch: M4 | **PLANNED** |
| **M5** | 存储持久化与合规风控 | S3/OSS 资产转存、Prompt 与社区敏感词风控两级守门、四大合规页面真实主体、自动备份任务 | M1, M3 | Sub-orch: M5 | **PLANNED** |
| **E2E** | 独立 E2E 测试套件 | 独立设计黑盒自动化测试套件（Tier 1~Tier 4），涵盖全量 Feature，发布 `TEST_READY.md` | 无 | E2E Testing Orch | **PLANNED** |
| **Final** | 终局全量验收与对抗加固 | 100% 通过 E2E 测试套件（Tier 1~4）+ Tier 5 对抗性加固 + Forensic Auditor 司法完整性终审 | M1~M5, E2E | Top Orchestrator | **PLANNED** |

---

## 4. 跨模块接口契约 (Interface Contracts)

### 4.1 前端工作台 ↔ 后端统一生成契约
- **生成任务提交**: `POST /api/generations`
  - Headers: `Authorization: Bearer <token>` 或 Cookie Session
  - Body:
    ```json
    {
      "model": "nano-fast" | "flux" | "kling" | "pika" | ...,
      "input": {
        "prompt": "a cinematic cyberpunk city...",
        "aspect_ratio": "16:9",
        "image_url": "..."
      },
      "idempotency_key": "optional-uuid"
    }
    ```
  - Response:
    - 成功入队: `202 Accepted`
      ```json
      {
        "id": "creation-uuid",
        "status": "queued",
        "credit_cost": 2,
        "reservation_id": "res-uuid"
      }
      ```
    - 额度不足: `402 Payment Required`
      ```json
      {
        "error": "INSUFFICIENT_CREDITS",
        "message": "当前账户算力额度不足，请前往充值",
        "required": 2,
        "available": 0
      }
      ```
    - 敏感词拦截: `400 Bad Request`
      ```json
      {
        "error": "CONTENT_POLICY_VIOLATION",
        "message": "输入内容包含违规词汇，已被安全守门拦截"
      }
      ```
- **生成任务轮询**: `GET /api/generations?id=<creation_id>`
  - Response:
    ```json
    {
      "id": "creation-uuid",
      "status": "queued" | "processing" | "succeeded" | "failed",
      "progress": 85,
      "result_url": "https://cdn.koyosim.com/persisted-asset.png",
      "error_message": null
    }
    ```

### 4.2 Stripe Checkout ↔ Webhook 额度履约契约
- **Checkout**：客户端只传套餐 ID、支付渠道和幂等键；服务端校验月付、从有效套餐读取价格与 `quotaBase + quotaBonus`，将月付周期和额度快照写入订单。金额由服务端订单传给 Stripe Checkout，不接受客户端 `price_id` 或 `credit_amount`。
- **首次到账**：仅已付款的 `checkout.session.completed` / `checkout.session.async_payment_succeeded` 可核销；Webhook 用订单行校验用户、套餐、金额、币种，并按订单额度快照调用 `grantPerpetualCredits`。
- **订阅续期**：Stripe Subscription metadata 仅保存服务端绑定的订单/用户/套餐 ID；`invoice.paid` 仅履约完整的月度 `subscription_cycle`。系统验证基础订单与实收金额后，按 Stripe invoice ID 建续期订单；支付账本和额度幂等键按续期订单隔离，避免订单级唯一索引阻断后续月份。
- **Fail-closed**：季/年付、手工标记 paid/out-of-band、未匹配订单/订阅、金额或币种不一致、套餐变更/proration 不自动发额，进入拒绝或人工对账路径。退款关联 Stripe PaymentIntent，退款前取消对应订阅。
- **验收边界**：源码具备上述处理；真实 Stripe 测试模式的 Checkout、续期、重复/乱序 Webhook、取消、退款及账本核对仍须在隔离预发布完成，未验收前不得启用生产 Stripe。

---

## 5. 代码规范与文件归属 (Code Layout)

| 目录/文件 | 责任归属 | 修改纪律 |
|---|---|---|
| `lib/db/migrations/` | M1 数据库迁移 | **严禁修改既有 001~006 文件**，严禁对 003 重命名；仅按序推进应用 007~013 |
| `scripts/` | M1, M2 运维与演练 | `generation-worker.mjs`, `run-isolated-pg-tests.mjs`, `db-status.mjs` 等运维工具脚本 |
| `lib/services/taskWorker.js` | M2 Worker 调度 | 队列拉取增加 `SKIP LOCKED`，支持孤儿断点任务自愈 |
| `lib/services/generationCore.js` | M2, M3 生成核心 | 状态机流转、预扣 (reserveCredits)、释放 (voidCredits)、超时巡检 (Watchdog) |
| `packages/studio/src/muapi.js` | M3 前端工作台适配 | 废除直连反代，统一封装调用 `/api/generations` |
| `components/StandaloneShell.js` | M3 工作台外壳 | 挂载 `RechargeModal` 弹窗、解析 URL query `remixPrompt` 参数 |
| `components/AuthModal.js` | M4 登录认证组件 | 默认以邮箱密码为第一 Tab，优雅隐藏未配置的短信通道 |
| `lib/payments/stripeProvider.js` | M4 Stripe 提供商 | 月付 Checkout 用服务端订单金额，Subscription metadata 绑定订单/用户/套餐 |
| `lib/services/webhookDispatcher.js` | M4 Webhook 调度 | 首次支付与 `invoice.paid` 续期均读取服务端订单额度快照并幂等记账 |
| `app/api/generations/route.js` | M3, M5 统一生成路由 | 注入 Prompt 敏感词风控检查与 S3/OSS 持久化转存钩子 |
| `app/terms/`, `app/privacy/` 等 | M5 合规与法律页面 | 注入正式法人企业名称与真实法务联络渠道 |
