# KOYO Studio Design System — 主规范（Master Spec）

**版本**：3.4.0 · **取代** 3.3.0（2026-09-23 深度吸收 OiiOii 与即梦设计语言）
**地位**：本文是 KOYO Studio 全站 Web UI 开发的最高优先级视觉规范。任何新增页面、组件、工作室必须无条件遵守；禁止在业务组件中自行发明颜色、字体层级、圆角、阴影、发光或尺寸规则。

> **Token 的唯一事实来源是 `app/globals.css` 的 `:root` 块。**
> 本文引用它的值，不定义它。两者冲突时以 `app/globals.css` 为准，并立即修正本文。
> `tailwind.config.js` 是纯 `var()` 映射层，经校验**不含任何颜色字面量**；新增颜色只能进 `globals.css`。
> 本次 3.4.0 升级深度吸收了 OiiOii.tv 与即梦 (Jimeng) 的高转化商业化模态、一站式扫码、胶囊分段导航、点阵工程底纹与 Switch 设置表单规范，且**严格保留既有中性冷黑与青色品牌调色板**。

| 文档 | 职责 |
| :--- | :--- |
| `UI_DESIGN_SYSTEM.md`（本文） | 视觉原则、Token 契约、禁止项 |
| `UI_COMPONENTS.md` | 共享组件清单与 API |
| `UI_AUDIT.md` | 缺陷台账（P0–P3）与量化证据 |
| `UI_MIGRATION.md` | 迁移阶段、ratchet 进度、单页迁移配方 |

---

## 1. 品牌方向：Premium AI Creative Workspace

产品是一个**生产工具**，不是游戏大厅，也不是营销落地页。七个形容词是可判定标准：

| 原则 | 落地约束 |
| :--- | :--- |
| Professional | 信息密度优先；控件尺寸服从高度契约，不为"大气"而放大 |
| Cinematic | 深色中性冷色基底 + 微弱 surface elevation 制造纵深，禁止大面积亮色 |
| Minimal | 一个界面只有一个视觉主角；装饰性元素默认删除 |
| Quiet | 克制：无霓虹发光、无赛博朋克、无过度渐变、无玻璃拟态堆叠 |
| Technical | 数值、模型名、参数用 `text-mono`；对齐用网格，不用视觉凑齐 |
| Creator-first | 用户生成的图像/视频/音频是画布唯一主角，UI 退居幕后 |
| Precise | 4px 基准网格；像素级工整；同一语义全站同一 token |

**明确禁止（PART 05 红线）**：游戏/电竞风、廉价霓虹、过度渐变、过度 glassmorphism、大面积发光、全紫配色、大面积饱和色、超大圆角、动画过多、Material/Bootstrap 观感、**不同页面呈现不同视觉系统**。

最后一条是本次重构的核心动因：历史上认证卡片被规定使用第二主色洋红（旧文档 `#b71676`），这正是"每页一套系统"的制度化成因，现已废止（见 §2.7）。

---

## 2. Color System

### 2.1 Surface elevation（暗色层级）

中性、无蓝灰塑料感。层级靠明度递进，不靠边框线堆叠。

| Tailwind 类 | CSS 变量 | 值 | 语义 |
| :--- | :--- | :--- | :--- |
| `bg-canvas` | `--bg-canvas` | `#0a0b0d` | 页面最底，全站画布 |
| `bg-base` | `--bg-base` | `#0e1013` | 工作台 / studio 外壳 |
| `bg-surface` | `--bg-surface` | `#131519` | 面板、侧边栏、composer |
| `bg-raised` | `--bg-surface-raised` | `#191c21` | 卡片、可悬浮行 |
| `bg-overlay` | `--bg-overlay` | `#202429` | 模态、popover、菜单、toast |
| `bg-well` | `--bg-subtle` | `#101216` | 输入框空闲底色、内凹区 |
| `bg-surface-inverse` | `--bg-inverse` | `#f4f5f7` | 深底上的浅色小片 |
| `bg-surface-glass` | `--bg-surface-glass` | `rgba(19,21,25,.92)` | Prompt Composer 外壳 |
| `bg-overlay-glass` | `--bg-overlay-glass` | `rgba(32,36,41,.97)` | 浮动层（下拉/气泡） |

**为什么玻璃色是独立 token**：Tailwind v3 无法对 `var()` 颜色施加 `/opacity` 修饰符，所以所有半透明用法必须有自己的 token，而不是 `bg-surface/90`。这是硬约束，不是风格选择。

### 2.2 Text hierarchy

对比度已按 canvas→overlay 全层级实测（非估算）：

| Tailwind 类 | 值 | 对比度（对 surface 全层） | WCAG |
| :--- | :--- | :--- | :--- |
| `text-ink` | `#ededf0` | 13.4 – 16.9 : 1 | AAA |
| `text-ink-muted` | `#a0a4ab` | 6.2 – 7.9 : 1 | AA（任意字号） |
| `text-ink-subtle` | `#868b8f` | 4.5 – 5.7 : 1 | AA（任意字号） |
| `text-ink-disabled` | `#4a4e55` | 1.9 – 2.4 : 1 | 豁免（1.4.3 非活动控件） |
| `text-ink-inverse` | `#0a0b0d` | — | 浅底反色 |
| `text-ink-on-accent` | `#03151a` | ≥ 7.8 : 1（对每个 accent 态） | AAA |

> `--text-tertiary` 原为 `#6e737b`，在 `--bg-overlay` 上只有 3.27:1，**不达标**；已上调为 `#868b8f` 而不是限制其只能用于大字号。改色前请先确认这个前提没被推翻。

### 2.3 Brand accent —— 全站唯一饱和色

| Tailwind 类 | 值 |
| :--- | :--- |
| `bg-brand` / `text-brand` | `#22d3ee` |
| `hover:bg-brand-hover` | `#56dcf5` |
| `active:bg-brand-active` | `#0eb8d1` |
| `bg-brand-soft` | `rgba(34,211,238,.12)` |
| `bg-brand-pressed` | `rgba(34,211,238,.20)` |
| `ring-brand-ring` / `border-brand-ring` | `rgba(34,211,238,.45)` |
| `border-brand-line` | `rgba(34,211,238,.30)` |

**唯一保留的非 token 例外**：登录页 logo 使用其自身品牌色（业务方确认保留），不参与 UI 色板，也不得被复制到任何 UI 控件上。

### 2.4 Feedback 状态色

| 语义 | 值 | 可用变体 |
| :--- | :--- | :--- |
| success | `#34d399` | DEFAULT / soft / line |
| warning | `#fbbf24` | DEFAULT / soft / line |
| **danger** | `#f87171` | DEFAULT / soft / **hover** / **pressed** / line / **ring** |
| info | `#60a5fa` | DEFAULT / soft / line |

> **只有 `danger` 有 hover/pressed/ring**。给 `success`/`warning`/`info` 写 `hover:bg-warning-pressed` 之类的类名不会报错，但**不产生任何样式**（静默失效）。需要交互态时改用 `border-warning` 或先扩展 token。

### 2.5 中性 wash 与遮罩

`bg-wash` `rgba(255,255,255,.04)` · `bg-wash-strong` `.07` · `bg-wash-press` `.10` · `bg-scrim` `rgba(3,4,5,.72)`。
白色透明**只允许**这三个档位；`bg-white/5`、`bg-white/[0.07]` 一律违规。

### 2.6 滚动条：低干扰，但必须可发现

**废止**旧版"全局消除原生滚动条"条款。理由：把滚动条隐藏到用户不知道内容还能滚动，是可发现性缺陷，不是精致。

现行契约：
- 默认继承 `globals.css` base 层的全局滚动条（`--scrollbar-thumb` `rgba(255,255,255,.16)`，hover `.30`，`--scrollbar-size: 10px`）。
- 横向轨道（导航、模型列表）使用 **`.scrollbar-rail`**：细、克制，但**可见**。
- **禁止** `scrollbar-none`、`::-webkit-scrollbar{display:none}`、`[&::-webkit-scrollbar]:hidden` 等写法。

### 2.7 认证卡片：统一入口，但不得有第二主色

保留的硬约束：所有未登录场景必须复用 `<AuthModal>`（模态与 `isInline` 内嵌双模式），禁止手写分裂表单。

**删除的旧约束**：认证卡片强加洋红主按钮（`bg-[#b71676]`）已废止；认证主按钮一律使用 `Button variant="primary"`（品牌青色）。

### 2.8 工程底纹与氛围遮罩（Dot-Grid Canvas & Atmospheric Masking）

吸收自 OiiOii 等专业级 AI Creative Studio 顶栏与画布底板的工程精密感，消除大面积纯黑背景的沉闷感，同时恪守"内容退居幕后、文字可读第一"原则：

1. **工程点阵底纹（`.bg-dot-grid`）**：
   - 步长网格契约：`--dot-grid-size: 24px`（严格服从 4px 基准网格）。
   - 圆点尺寸与颜色：1px 纯正圆点，颜色严格绑定 `--border-strong`（在 `#0a0b0d` 暗底上形成极微弱的约 10% 通透反光）。
   - **禁止**：手写 `background-image`、使用非系统彩色圆点、或者透明度 > 16% 形成视觉干扰。
   - 适用场景：顶栏背景、工作室 Canvas 画布底层、Hero 背景、空状态占位区。
2. **Hero 氛围图暗化遮罩（`.hero-atmospheric-mask`）**：
   - 吸收自 OiiOii 会员定价页顶部电影感氛围图（月夜红枫）：当页面头部引入艺术插画或电影调性宽幅背景时，底部**必须**使用渐变遮罩自然融入画布。
   - 契约：从顶部 40% 起平滑衰减，至 100% 处完全融入 `--bg-canvas`。严禁在下方卡片区出现明显的图片切边硬边缘。

---

## 3. Typography

字体由 `app/layout.js` 的 `next/font` 自托管（Inter + Jost）。**不得**引入 Google Fonts `@import`：对主要中文受众是一次渲染阻塞请求，且与 next/font 已做的 Jost 加载重复。

字号与行高成对定义，因此一个字体工具类是完整的：

| Tailwind 类 | 字号 | 行高 | 字重 | 字距 | 用途 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `text-display` | 32px | 40px | 700 | -0.025em | Landing 大标题 |
| `text-page-title` | 24px | 32px | 600 | -0.02em | 工作室主标题 |
| `text-section-title` | 18px | 26px | 600 | -0.015em | 模块/弹窗标题 |
| `text-card-title` | 15px | 22px | 600 | -0.01em | 模型卡标题、参数组名 |
| `text-body` | 14px | 20px | 400 | -0.005em | 标准正文、按钮、输入 |
| `text-body-sm` | 13px | 18px | 400 | 0 | 次级说明 |
| `text-label` | 12px | 16px | 500 | +0.01em | 表单标签、badge、参数项 |
| `text-caption` | 11px | 14px | 400 | +0.015em | 时间戳、快捷键 |
| `text-micro` | 10px | 14px | 400 | +0.02em | 刻度下限：密集 chip、计数器、缩略图角标 |
| `text-mono` | 12px | 16px | 400 | 0 | Token、seed、API 参数 |

**十级，不是九级。** `text-micro` 是刻意设的下限（"floor of the scale"），用来替代 `text-[10px]`；`packages/studio/src` 里 17 个文件共 170 处在用。删掉它会让这些点全部退回任意像素。
`text-mono` 复用 `--text-label` 的字号与行高，只换 `--font-mono`，所以它和 `text-label` 永远同尺寸 —— 不要为了"看起来更像代码"再叠一个字号类。

> `text-mono` 已捆绑 `--font-mono`，再写 `font-mono` 是冗余。字重由 recipe 携带，不要在文本类上另加 `font-semibold` 制造漂移。

**默认字号阶梯是被禁的，而且它禁得比看起来隐蔽**：`theme.extend.fontSize` 意味着 `text-xs` 照常生成 CSS（12px/16px —— 数值上正好等于 `text-label` 的字号行高），差别只在它**不带字重、不带字距**，所以截图上"看起来差不多"，漂移发生在成对的 recipe 被拆开的那一刻。`text-sm` = 14px/20px 撞上 `text-body` 的字号、行高却是 20→20 但无 `letter-spacing`。实测 `app`+`components`+`packages/studio/src` 里默认写法 **1697 次** 对具名写法 **651 次** —— 这条阶梯事实上没有被采纳。守卫规则 `off-system-type-ramp`（§8）自 2026-09-21 起把 1926 处冻结在基线里，新增即红；`leading-[3-9]` 现测 0 处，`tracking-*` 默认写法 267 处**暂未入账**，与字号一起在下轮收。

---

## 4. Spacing / Radius / Height / Slider / Elevation

### 4.1 间距（4px 基准网格）
`--space-1..16` = 4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48 / 64。
禁止 `p-[17px]`、`gap-[13px]` 等任意像素。

### 4.2 圆角（6 级 + full）
`rounded-xs` 4 · `rounded-sm` 6 · `rounded-md` 8 · `rounded-lg` 12 · `rounded-xl` 16 · `rounded-2xl` 20（composer 外壳专用）· `rounded-full` 9999。
另有语义别名 `rounded-composer`。禁止 `rounded-[2rem]`。
**`rounded-3xl` 是迁移别名，不是第七级**：它塌缩到 `var(--radius-2xl)`，存在的唯一理由是让 15 个未迁移文件不必一次性改写。新代码不得写 `rounded-3xl`（`tailwind.config.js:207-209` 记了这件事）。

### 4.3 控件与面板尺寸契约
`h-control-xs` 28 · `h-control-sm` 32 · **`h-control-md` 38（默认）** · `h-control-lg` 44。
`--header-h` 56 · `--sidebar-w` 240 / 收起 60 · **`--panel-w` 400**（studio 左侧参数栏宽度，工具类 `w-panel` / `lg:w-panel`）。

**Prompt Composer 固定 38px**（PART 14）。任何工作室不得出现 34/36/40/42px 的参数按钮；出现即视为缺陷，除非在 `UI_MIGRATION.md` 记录设计理由。

`--panel-w` 是**桌面专用**宽度：studio 侧栏在 `lg` 以下必须堆叠，写 `w-panel` 而不带 `lg:` 前缀会让右侧结果区在手机上被压成 0 宽 —— `AudioStudio` 迁移前就是这个状态（实测 `resultWidth: 0`）。

### 4.4 浮动层几何
`--modal-w: calc(100vw - 32px)`（桌面永不贴边）· `--modal-max-h: calc(100vh - 64px)` · `--sheet-max-h` 88vh · `--drawer-max-h` 85vh · `--menu-min-w` / `--popover-min-w` 176px · `--toast-w` 340px · `--popover-max-h` 45vh。
这些是视口相对值，**不可能**来自 4px 网格，因此必须留在 token 层，不得在组件里写 `calc()`。

### 4.5 滑杆（原生 range 的唯一合法写法）
`--range-h` 24 · `--range-track` `rgba(255,255,255,.14)`（4px 轨道）· `--range-thumb` `var(--text-primary)` · `--range-thumb-size` 14。
工具类 `.range` 消费这四个值。**任何 `type="range"` 都必须带 `.range`**：`globals.css` 对 range 设了 `appearance:none`，而 `appearance:none` 之后浏览器不再画 thumb —— 不写就是**一根看不见也拖不动的横条**。命中区 24px 靠 `--range-h` 撑，视觉轨道靠伪元素收窄，两者不是一回事。
原生 `range` 自带键盘（←/→ 以 `step` 步进）与读屏语义，**不要**为了"好看"换成 `div` + `onMouseDown`（`AudioStudio` 迁移前的播放条就是后者，键盘完全不可达）。无可见 label 时必须 `aria-label`。

### 4.6 Elevation（中性阴影 + 一个品牌发光例外）
`shadow-elevation-1` `0 1px 2px rgba(0,0,0,.45)` · `-2` `0 4px 12px .50` · `-3` `0 12px 32px .60` · `-4` `0 24px 64px -12px .80`。
`shadow-elevation-brand` `0 8px 14px -4px var(--accent-glow)` —— 唯一允许的青色发光：登录框的图标块与主按钮落在近黑 canvas 上，中性阴影在那里等于不存在。它带负 spread 与向下 offset，只往下漏 ~12px，因此读作"托起"而不是"光晕一圈"。新增彩色阴影一律先回到 `globals.css` 谈 token，不要在组件里写。
`tailwind.config.js` 的 `boxShadow` 写在 `theme.extend` 下，所以 Tailwind 自带的 `shadow-sm/md/lg/xl/2xl` **仍然会生成 CSS**（实测产物里有 `.shadow-2xl{--tw-shadow:0 25px 50px -12px rgb(0 0 0/0.25)}`）。它们的问题不是"不生效"，而是**绕过 elevation 阶梯自带一套字面量阴影**——正是本条契约要消灭的东西。业务代码一律写 `shadow-elevation-N`。
> 存量（09:1x 现测，只算根构建 content 名单内的源文件）：默认阴影阶梯 **91 处 / 22 个文件**（`shadow-sm` 36、`shadow-lg` 29、`shadow-2xl` 13、`shadow-xl` 12、`shadow-md` 1），**大头不在主应用**而在 `packages/Vibe-Workflow/.../workflow-builder/src`（`NodeFlow.jsx` 11、`VideoNode.jsx` 10、`ChatWidget.jsx` 9…），因为该包自己的 tailwind config 是 `extend: {}` —— 它从来就是按默认阶梯写的。这是 §4.6.1 第三行"子包私有体系"的同一种病。
> 上一版这里写的是"`boxShadow` 整体替换，默认阶梯不生成任何 CSS，属于静默死类"——**该结论不成立**，配置在 `extend` 下，产物可查；本轮由 `scripts/ui-dead-classes.mjs`（对照真实构建产物）纠正。同理，`fontSize` 也在 `extend` 下，`text-xs` 等默认字号照样生成 CSS 并**与语义字号阶梯打架**——实测 `text-(xs|sm|base|lg|xl|2xl…)` 在 `app`/`components`/`packages/studio` 里出现 **1697 次**（`text-xs` 独占 1115），而 `leading-[3-9]` 为 0 次，所以新增守卫规则 `off-system-type-ramp` 把默认字号冻结在基线里。
迁移期保留的旧名（`subtle`→1 · `card`→2 · `overlay`→3 · `modal`→4 · `glow`→2 · `3xl`→4）**已去发光**，仅供未迁移文件调用，新代码一律写 `shadow-elevation-N`。
禁止 `shadow-[0_0_15px_#22d3ee]` 之类霓虹发光。
### 4.7 Motion
时长 `duration-fast` 120ms · `duration-base` 180ms · `duration-slow` 240ms · `duration-page` 300ms。
缓动 `--ease-standard` / `--ease-enter` / `--ease-exit`。
**禁止 `transition-all`**：它会把 `scale`/`box-shadow` 一起动画化，是"廉价感"的主要来源。必须写 `transition-[background-color,border-color,color]` 或用具名 recipe。
`@media (prefers-reduced-motion: reduce)` 已全局就位。

### 4.8 顶栏营销通告条契约（Announcement Bar Contract）

吸收自 OiiOii 顶部活动通告横幅，用于运营大促、算力倍增活动与版本更新播报：

| 属性 | 契约值 | 语义说明 |
| :--- | :--- | :--- |
| 高度 | `--announcement-h: 36px` | 极紧凑单行高度，不压缩主视口空间；`h-announcement-h` |
| 背景与色彩 | 统一走自有调色板：<br/>- 常规通报：`bg-surface text-ink-muted border-b border-line-subtle`<br/>- 营销高光：`bg-brand-soft text-brand border-b border-brand-line` 或反色底 `bg-surface-inverse text-ink-inverse` | **严禁**把 OiiOii 的荧光黄绿（`#ccff00`）搬入项目；保持冷黑与青色核心视觉 |
| 排版结构 | 居中单行：`text-body-sm`，强调数字加粗 `font-semibold`；右侧紧凑关闭动作 `IconButton size="xs"` | 严禁多行折行破坏 36px 契约 |
| 交互与记忆 | 用户关闭后记录 `localStorage` 状态，同活动周期不再弹起 | 避免阻碍专业工具使用 |

### 4.9 胶囊分段控制器契约（Pill Segmented Control Contract）

吸收自 OiiOii 顶部场景分类（“个人/自媒体·短漫剧·MV·游戏·电商·广告”）与计费周期双层切换，用于紧凑场景/周期选择：

| 结构 | 尺寸与样式 | 交互态规范 |
| :--- | :--- | :--- |
| **轨槽 (Track)** | 高度 32px (`control-sm`) / 36px / 40px，圆角 `rounded-full`<br/>背景 `bg-well` (`#101216`)，内边距 `p-1` (3~4px) | 固定宽度或内容自适应；内部项目水平排列，gap 为 2px |
| **未选项目** | `px-3.5 py-1 text-label text-ink-muted rounded-full` | `hover:text-ink hover:bg-wash duration-fast` |
| **选中滑块 (Active)** | 纯白反色底：`bg-surface-inverse text-ink-inverse font-medium rounded-full shadow-elevation-1`<br/>或品牌主色底：`bg-brand text-ink-on-accent font-medium rounded-full shadow-elevation-brand` | 带有 `duration-fast ease-standard` 平滑位移；高对比保证阅读效率 |
| **双层嵌套结构** | 上层场景分类（个人/团队/企业）+ 下层周期折扣（年付/季付/月付） | 组间垂直间距 `gap-space-3` (12px)，上下层对齐居中 |

### 4.10 商业化模态与卡片层级规范（Commercial Checkout & Tier Matrix）

商业化充值与购买必须保持极高的信任度与极短的转化链路。统一沉淀为两套经典架构与一套定价矩阵：

#### 4.10.1 模态架构 A：资产状态条 + 通用/专属双层充值网格（OiiOii 范式）
用于复杂代币体系与模型专属算力包选购：
1. **用户资产状态条（Asset Status Strip）**：
   - 位于模态顶部，`h-12` (48px)，圆角 `rounded-xl`，背景 `bg-surface`，边框 `border-line-subtle`。
   - 左侧：圆形头像 + `text-micro` 角色等级 Tag（如 `FREE`）+ 醒目跳转链接 `升级会员 →`。
   - 右侧：当前通用算力余额（大字粗体，如 `通用算力 ✦ 60`）。
2. **通用算力包网格（Generic Pack Grid）**：
   - 4 列等宽卡片，底色 `bg-surface-raised`，圆角 `rounded-xl`，边框 `border-line`。
   - 卡片内容：币种图标 + 额度（大号粗体 `text-page-title`）+ 售价（`text-body-sm text-ink-muted`）。
   - 选中态：青色轮廓高亮 `border-brand ring-1 ring-brand`，卡片内微提亮 `bg-brand-soft`。
3. **专属模型算力包（Exclusive Pack Grid）**：
   - 4 列等宽卡片，顶部内嵌黄色激励胶囊（`首购加赠 100%`，见 §4.11）。
   - 卡片内容：模型徽标与名称（如 `GPT Image 2.5`）+ 划线原额度与大字增赠额度对比（`1,400 2,800`）+ 价格 + `仅限会员` 标识。
4. **模态底部主操作**：
   - 底部提示小字（说明、客服支持、规则跳转）居中或左对齐；
   - 全宽主 CTA：药丸形 `rounded-full h-control-lg`，品牌青色实心按钮 `Button variant="primary"`。

#### 4.10.2 模态架构 B：一站式左选档右扫码分栏模态（即梦范式）
用于极致消除转化漏斗摩擦的即时快捷充值：
1. **高度整合紧凑头部**：
   - 单行排布：左侧头像 + 用户名 + 会员到期时间，右侧余额 `我的算力 ✦ 20` + 垂直分割线 `|` + 关闭按钮 `×`。
   - 节省 50% 顶部纵深，让充值主体第一时间进入视口。
2. **左右双栏分块布局**：
   - **左栏（选档网格，宽 360px）**：2 列 × 3 行卡片网格。卡片内大字额度（`✦ 1,500`）与价格（`¥ 150`），选中态为高对比纯白外框与微亮底色。
   - **右栏（即时支付卡片，宽 240px）**：中间垂直 1px 细分割线 `border-line-subtle`。右侧直接内嵌白色圆角二维码方块（Padding 12px，纯白底黑码保证高扫描率）；下方水平陈列支持的支付方式图标（微信支付、支付宝）以及“请扫码完成支付”提示。
   - **交互原则**：左侧点击任一档位，右侧二维码**无闪烁即时刷新**，无需经历“确认档位 → 弹出二级收银台”的繁琐流程。

#### 4.10.3 订阅层级四档卡片矩阵（Pricing Tier Matrix）
用于 `/pricing` 订阅定价主页：
1. **四档标准分级**：`BASE`、`STAR`、`PRO`、`APEX`。
2. **卡片结构统一**：
   - 顶部：等级名大写粗体 + 紧凑折扣胶囊（如 `限时 6.5折`）。
   - 价格区：超大主价格 `¥ 88 / 月`，伴随中划线划线原价 `¥ 133`。
   - 价值折算锚点：`text-body-sm text-ink-muted` 标注每月总算力与每单元折算单价（如 `1积分 ≈ ¥0.067`），增强购买确定性。
   - 赠送明细与信息 Tooltip 图标。
   - 按钮规范：普通档位统一采用白色反色实心按钮（深色界面下具备极佳层次）；**最高档 APEX 采用青色边框强化高亮，主按钮为品牌青色实心 `Button variant="primary"`**。
   - 下方权益清单：`✓` 对勾符号对齐，模型特权列表，右侧带支持级别胶囊标签（如 `最低4.2折`）。

### 4.11 极精细微徽章与加赠标签系统（Micro Badges & Incentive Pills）

商业化与模型列表中充满紧凑微标签，严禁业务层手写随机 padding 与圆角。建立 4 级语义微标签：

| 标签类型 | 类名与排版 | 视觉示例 | 适用场景 |
| :--- | :--- | :--- | :--- |
| **折扣徽章** | `px-2 py-0.5 rounded-full text-micro font-medium bg-wash-strong text-ink` | `限时 6.7折` | 定价卡片顶部折扣提示 |
| **加赠激励徽章** | `px-2 py-0.5 rounded-full text-micro font-medium bg-warning-soft text-warning border border-warning-line` | `首购加赠 100%` | 充值包专属加赠角标 |
| **特权折扣徽章** | `px-1.5 py-0.5 rounded-xs text-micro text-ink-muted bg-surface border border-line-subtle` | `最低4.2折` | 功能特权列表右侧标注 |
| **门槛限定徽章** | `text-caption text-ink-subtle select-none` | `仅限会员` | 购买卡片底部约束提示 |

### 4.12 设置与合规表单 Switch 复合行规范（Settings Dialog & Switch Row）

吸收自即梦 AI 合规与偏好设置模态，用于长文本说明与功能开关联动表单：

1. **模态几何**：宽度规范 560px，背景 `bg-overlay`，深度阴影 `shadow-elevation-4`，内边距 `p-6` (24px)。
2. **合规说明段落排版**：
   - 标题：`text-section-title font-semibold text-ink mb-4`。
   - 正文：段落间距 `space-y-3`，字体 `text-body-sm`，颜色 `text-ink-muted`，行高 1.6，禁止使用主色高亮正文干扰阅读。
3. **Switch 复合控件行（`SwitchRow`）**：
   - 布局：左对齐 Switch 控件，右侧紧邻主标题（`text-body font-medium text-ink`）；
   - 下方紧随两行辅助解释说明（`text-caption text-ink-subtle leading-normal mt-1`），解释开关影响及撤回路径；
   - 无障碍支持：必须绑定 `htmlFor` 与 `id`，开关必须具备 `aria-checked` 状态并响应 Space/Enter 键盘切换。
4. **底部操作栏**：单向右对齐主按钮 `保存设置`（`Button variant="primary"` 或反色白色按钮），内边距紧凑。

---

## 5. Z-Index 层级契约

禁止 `z-[999]`、`z-[9999]`、`z-[100000]`。梯子共 11 级，`dropdown` 与 `popover` 是两个不同层，不要合并记忆：

| 类 | 值 | 用途 |
| :--- | :--- | :--- |
| `z-base` | 0 | 文档流 |
| `z-raised` | 1 | 卡片内部浮起 |
| `z-sticky` | 10 | 粘性条、composer 停靠层 |
| `z-header` | 40 | 顶栏 |
| `z-drawer` | 50 | 抽屉 |
| `z-dropdown` | 60 | 下拉菜单 |
| `z-popover` | 70 | 参数气泡 |
| `z-overlay` | 80 | 遮罩 |
| `z-modal` | 90 | 模态 |
| `z-toast` | 100 | 通知堆栈 |
| `z-tooltip` | 110 | 工具提示（最高） |

---

## 6. 图标（PART 10）

1. **单一图标体系**：`lucide-react`。禁止复制内联 `<svg>`，禁止混用第二套图标库。
2. **禁止 emoji 充当功能图标**。`🔥 社区`、`📁 我的作品` 这类写在文案里的图标属于违规（现存于 `messages/*/common.json`，见 `UI_AUDIT.md`）。
3. **描边统一**：1.8（控件内 lead 图标 14px、行内 12px，由 recipe 固定，业务代码不得再传 `strokeWidth`）。
4. **图标 ≠ 点击热区**：视觉 16px 的图标必须落在 ≥32px（推荐 38–44px）的目标内。用 `IconButton`，不要手写 `<button><svg/></button>`。

---

## 7. 无障碍（WCAG 2.2 AA）

1. **焦点可见**：绝对禁止只写 `focus:outline-none` 而无 `:focus-visible` 替代。统一使用 `FOCUS_RING` recipe（`packages/studio/src/ui/tokens.js`）。
2. **点击热区**：移动端最小 38px，见 §4.3。
3. **对比度**：见 §2.2，已实测。
4. **图标按钮必须有可访问名**：`IconButton` 缺 `label` 会在开发期告警；只有 `title` 不算（历史缺陷：composer 的圆形生成按钮无可访问名）。
5. **可见文本优先于 `aria-label`**：有可见标签的按钮不要加 `aria-label` 覆盖它（WCAG 2.5.3 标签名一致）。
6. **键盘**：模态需焦点锁定、`Esc` 关闭、点击遮罩关闭 —— 由 `Modal`/`ModalContent` 承担，业务层不要重造。

---

## 8. 强制与校验（PART 31）

规范不可校验就等于不存在。当前有四道互补的闸：

| 闸 | 命令 | 层次 | 基线文件 | CI |
| :--- | :--- | :--- | :--- | :--- |
| 源码 token 守卫 | `npm run lint:ui` | 静态扫描 `.js/.jsx/.mjs`：**14 条类名规则 + 2 条源码级规则** | `scripts/ui-token-baseline.json`（14919 处 / 194 文件） | ✅ `test:ci` |
| 死类对照闸 | `npm run lint:dead` | 源里请求的类名 **vs** 真实生产构建产物里生成的类选择器（`scripts/ui-dead-classes.mjs`） | 无基线（见下"第四道闸为什么不做 ratchet"） | ❌ 需先有构建产物 |
| 运行时漂移审计 | `npm run ui:audit` | Playwright 读取**计算后样式**，契约直接解析自 `globals.css` `:root`（19 条规则，声明于 `scripts/ui-spec-audit.mjs`） | `.ui-drift/state.json` | ❌ 手动 |
| 视觉/响应回归 | `npm run test:visual` | 10 档视口 × 8 条路由：控制台错误、横向溢出、**控件可达性**、像素基线（含 composer 特写）+ 1 条闸门自审 | `tests/visual/__snapshots__/` | ❌ 需先起服务 |

**Ratchet 规则**：守卫基线**只能下降**。任何文件新增违规会让 `lint:ui` 失败；清理后必须 `npm run lint:ui:update` 把下降固化下来，否则下一个人可以悄悄涨回去。但 `lint:ui:update` 写的是**全量快照** —— 场上还有未处理的上升时跑它，等于把别人的回归登记成合法值。**先让 `lint:ui` 全绿，再 update。**

**第四道闸为什么不做 ratchet**：死类闸的分母是**一次具体的构建产物**，而共享工作树里五个会话各自有各自的 dist；把数字冻进基线会得到一个"谁的文件新就谁的数"的假契约。所以它的角色是测量与定位（`--report` / `--files` / `--explain`，check 模式 exit 1 供人在改动后自己跑），而其中**不需要构建也能判死**的那一族已经升格成守卫规则进了 `test:ci`。

**两类规则 + 一条管辖范围原则**：类名规则扫"字符串里出现了什么"，源码级规则扫"元素上缺了什么"。后者是必需的 —— "缺失"在类名字符串里根本不可见，两道类名闸与像素闸对它全部免疫。当前落地的两条源码级规则，各自对应 `UI_AUDIT.md` §4.6 的一类失效模式：

| 规则 | 检查什么 | 放行什么（写进代码里的免责条件） | 存量（2026-09-21 08:18 入账） |
| :--- | :--- | :--- | :--- |
| `range-without-utility` | 每个 `type="range"` 是否带 `.range` —— `appearance:none` 之后浏览器不再画 thumb，代码看起来完全正常，用户面对的是一根拖不动的横条 | 标签内其它位置出现独立 `range` token（如从常量取类） | **36 处 / 10 文件**（其中 4 处在待删的遗留树 `src/components/ImageStudio.js`，见 `UI_AUDIT.md` §7） |
| `div-onclick-not-keyboard` | 带 `onClick` 的 `<div>` 是否对键盘存在 —— 历史条目、上传卡片、卡片整面点击在 Tab 序列里根本不存在 | `role=`／`tabIndex=`／`onKeyDown`／`onKeyUp`；或 `as="button｜Link"` 渲染成语义元素；或 `aria-hidden="true"`（点击遮罩不是控件，键盘路径是对话框自己的 Escape） | **78 处 / 39 文件** |

**两条按 config 划管辖范围的新规则**。它们不能写成一条全局正则，因为"这个类名有没有病"取决于**哪一份 tailwind.config.js 编译这个文件**——本仓有 5 份（根 + `studio` + 三个子包），`content` 名单互相交叠：

| 规则 | 判据 | 为什么会误伤，怎么避免 | 存量（09:30 入账） |
| :--- | :--- | :--- | :--- |
| `alpha-on-var-colour` | 颜色被注册成裸 `var(--x)` 时，`bg-x/10` **整条不产出 CSS**（Tailwind v3 拆不出通道）。要求**每一份**管辖该文件的 config 都把它当 `var()` | `Open-Poe-AI/packages/agents` 用 `primary: '#3898ec'` **字面量**注册过同名颜色 —— 那里 `/10` 真的能编译，报它就是报冤案（实测豁免 19 处） | **381 处 / 77 文件** |
| `off-system-type-ramp` | `text-xs`/`text-sm`/… 会正常生成 `font-size:12px; line-height:16px`，但既不在具名阶梯上、也不带 recipe 的字重与字距。只要**有一份**管辖该文件的 config 声明了具名阶梯就报 | 子包自己没有字号阶梯（`workflow-builder` 是 `extend: {}`），但它被根构建编译进 `/studio` 时用的就是根阶梯 —— 所以照报；只有**没有任何 config 认领**的文件（子包自带的 `client/` 独立应用）豁免（实测 58 处 / 368 文件，绝大多数本来不含类名） | **1926 处 / 149 文件** |

两条方向相反是有意的：**死类要求全票**（一份样式表能救活它，它就不是死的），**绕过语义层只要求有得选**（阶梯在架，`text-xs` 就是选择而非无奈）。

**闸门要做故意破坏验证**（2026-09-21 已做，全部可复现）：

| 注入 | 期望 | 实测 |
| :--- | :--- | :--- |
| `.range` 上加 `h-[37px]` | `lint:ui` 红 | `AudioStudio.jsx arbitrary-geometry: 0 -> 1`，退出码 1 |
| `.range` 上删掉 `range` | `lint:ui` 红 | `AudioStudio.jsx range-without-utility: 0 -> 1` |
| 新建 `div onClick` 且无任何语义标记 | `lint:ui` 红 | `lib/__ui-guard-probe.jsx div-onclick-not-keyboard: 0 -> 1`；同一文件里带 `role`+`tabIndex`+`onKeyDown`、`as="button"`、`aria-hidden="true"` 的三种写法**同时验证为不报**（规则只抓真缺失，不逼业务加装饰属性）。探针文件已删 |
| 两条新规则的 15 组正负样本 | 该报的报、该沉默的沉默 | `node .agents/probe-alpha-rule.mjs`（只读，不写盘）15/15 通过：同一句 `bg-primary/10` 在 `app/layout.js` 报、在 `agents/src/AiAgent.jsx` 不报、在无人认领的子包 `client/` 不报；`bg-white/10`、`bg-primary`（无修饰）、`shadow-black/60`、`text-body`、`text-ink-muted` 全部不报 |
| composer recipe 改 1~2px | 特写断言红 | 页面级 `maxDiffPixelRatio: 0.01` 无反应，`[data-prompt-composer]:visible`（0.001）在 image/video/lipsync 三个面全部报红 |

最后一行不是模拟 —— 它是 recipe 收敛时**真实发生**的一次漂移，被特写闸抓到、被页面闸放过。这两条闸的分工由此得证。

**已知盲区（已修）**：`eslint` 的 FlatCompat 只为 `.js/.ts` 生成 `files` 模式，导致**全仓 `.jsx` 从未被 lint**（`--print-config` 返回 `undefined`，命令仍退出 0）。现已把规则集扩展到 `.jsx` 并新增 `npm run lint:packages` 接入 `test:ci`。

**视觉基线纪律**：必须从**生产构建**录制，绝不用 `next dev`（dev overlay 会把"Errors"角标和 HMR 抖动注入被比较的画面）。标准流程：

```bash
NEXT_DIST_DIR=.agents/verify-next npm run build      # 隔离产物，不抢别人的 .next
node -e "console.log(Object.keys(require('./.agents/verify-next/server/app-paths-manifest.json')).length)"  # 应 ≥ 200
NEXT_DIST_DIR=.agents/verify-next bash .agents/serve.sh <port>
VISUAL_BASE_URL=http://localhost:<port> npm run test:visual
```

另两条纪律：`-g` 过滤**只能用 ASCII**（Git Bash 会破坏非 ASCII 参数，含 `›` 的模式静默匹配 0 个测试并"全绿"）；同一命令**重跑一次再定性**（外部资源偶发 `net::ERR_CONNECTION_CLOSED` 会让多个不相关测试同时红）。重录前必须先定归属，流程见 `UI_MIGRATION.md` §5。

---

## 9. Do / Don't 速查

| 场景 | 🔴 禁止 | 🟢 必须 |
| :--- | :--- | :--- |
| 颜色 | `bg-[#22d3ee]`、`text-white/50`、`bg-zinc-900` | `bg-brand`、`text-ink-muted`、`bg-surface` |
| **半透明** | `bg-primary/10`、`bg-canvas/95`、`border-line/50`（**不产出任何 CSS**，见 §4.6） | `bg-brand-soft`、`bg-surface-glass`、`border-line-subtle`、`bg-wash` |
| **字号** | `text-xs`、`text-sm`、`text-base`、`text-2xl`（会生成 CSS，但值与行高不在架上） | `text-display` / `page-title` / `section-title` / `card-title` / `body` / `body-sm` / `label` / `caption` / `micro` / `mono` |
| 按钮 | 手写 `<button className="px-4 py-2 bg-gradient…">` | `<Button variant size>` / `<IconButton label>` |
| 高度 | `h-9`、`h-[37px]`、`h-[42px]` | `h-control-sm` / `-md` / `-lg` |
| 阴影 | `shadow-[0_0_15px_#22d3ee]`、`shadow-2xl` | `shadow-elevation-1..4` |
| 圆角 | `rounded-[2rem]`、`rounded-[4px]` | `rounded-md` / `-lg` / `-xl` |
| 层级 | `z-[999]`、`z-[100]` | `z-modal` / `z-popover` / `z-toast` |
| 过渡 | `transition-all` | `transition-[background-color,border-color,color] duration-fast` |
| 图标 | 内联 `<svg>`、emoji、无 `label` 的图标按钮 | `lucide-react` + `IconButton` |
| 滑杆 | 裸 `type="range"`（`appearance:none` 后无 thumb）、`div` + `onMouseDown` 自制进度条 | `.range` + `aria-label`（见 §4.5） |
| 开关 | 二值设置用裸 `type="checkbox"`（命中区 13px） | `<Switch>` + 绑定 `htmlFor` 的 `<Label>`；多选框仍用 checkbox |
| 面板宽 | `w-[400px]`、`lg:w-[25rem]` | `lg:w-panel`（`--panel-w` 400） |
| 滚动条 | `scrollbar-none`、隐藏 webkit 滚动条 | 全局滚动条或 `.scrollbar-rail` |
| 文案 | JSX 里硬编码中文（`正在生成中...`、`11/张`） | `messages/<locale>/*.json` + copy key |
| 布局 | 依赖 `overflow-hidden` 裁掉超宽控件 | 让控件换行或用响应式收纳（见 §10） |
| **通告条** | 引入第三方荧光黄绿（`#ccff00`）、高度随机（`h-10`/`h-[42px]`） | `h-announcement-h` (36px)，使用 `bg-brand-soft` 或 `bg-surface-inverse` 反色 |
| **分段器** | 手写方角 Tab、无轨槽单选框 | 胶囊轨槽（`rounded-full bg-well p-1`）+ 高对比实心药丸滑块 |
| **底纹网格** | 手写外链大图、高对比亮白圆点网格 | `.bg-dot-grid`（24px 步长，1px 圆点，`--border-strong`） |
| **充值模态** | 多级跳转收银台、无资产条的生硬表单 | 架构 A（资产条+通用/专属双层网格）或架构 B（左选档右扫码即时联动） |
| **微徽章** | 任意小字（`text-[9px]`）、任意圆角（`rounded-[3px]`） | 4 级语义微标签（`text-micro`，`rounded-xs` 或 `rounded-full`） |

---

## 10. 响应式契约（PART 02）

桌面与移动是**两套分级布局**，不是同一布局的缩放。基线视口共 10 档：

`1920×1080 · 1600×900 · 1440×900 · 1366×768 · 1280×800 · 1024×768 · 768×1024 · 430×932 · 390×844 · 375×812`

**可达性优先于不溢出**。studio 外壳是 `overflow-hidden`，因此"页面没有横向滚动条"完全可能同时意味着"三个控件根本不存在"。视觉闸现在单独断言：任何 `a/button/input/select/textarea` 不得渲染在视口外，除非它位于可滚动容器内。历史教训：390px 顶栏控件一度渲染到 x=578（超出 188px）而旧断言全绿。

收纳策略按优先级：
1. 让控件轨道**换行**（Prompt Composer 参数行即此方案）；
2. 响应式隐藏**重复能力**（顶栏营销胶囊在 `md` 以下隐藏，能力保留在账号菜单与 `/pricing`）；
3. 只有真正的横向轨道（模型列表、画廊）才用 `.scrollbar-rail` 滚动。

禁止用第 2 种手段藏掉唯一入口。
