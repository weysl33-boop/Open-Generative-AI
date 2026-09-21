# KOYO Studio 全站 UI/UX 审计报告（UI Audit）

**版本**：3.3.0 · **取代** 3.2.0（2026-09-21 08:18 快照）  
**对象**：`https://go.koyosim.com/studio`（线上）+ 本仓库工作树  
**方法**：Runtime Audit（`scripts/ui-spec-audit.mjs`，Playwright 读**计算后样式**，19 条规则）+ Source Static Audit（`scripts/ui-source-census.mjs` 普查 + `scripts/ui-token-guard.mjs` 闸门）+ Primitive 采纳度度量（`scripts/ui-adoption.mjs`）

> **本文是缺陷台账，不是意见集。** 每一条必须有：证据（文件:行或运行时测量）、分级、当前状态、以及"为什么没动"。
> 所有数字可用 §6 的命令复现。**不可复现的数字一律不写。**

---

## 1. 量化总览（本轮口径）

扫描范围与每条正则都固化在 `scripts/ui-source-census.mjs`；要改口径就改脚本，不要在正文里口头换口径（上一版正是这样漂移的）。

| 维度 | 本轮实测（2026-09-21 09:30 快照） | 上一轮（08:18 快照） | 评价 |
| :--- | :--- | :--- | :--- |
| 被扫描源文件 | 672（守卫口径 861，另含 `scripts/`、`tests/`、根配置的 `.mjs`） | 659 / 836 | 两口径分母不同，不可混用；一小时内并行会话净增 13 个文件 |
| 路由页面 / API 路由 | 85 个 `page.js` / 148 个 `route.js`；隔离生产构建后 `app-paths-manifest.json` 计 215 条（73 page + 142 api） | 84 / 142 / 214 | 净增来自 `/pricing` 等并行新增页 |
| 硬编码 HEX | **141 种，466 处** | 141 种 / 476 处 | 种类未动 = 只是删了重复，语义层仍未接上 |
| 同一色值被重复手写 | `#22d3ee` ×74、`#ffffff` ×32、`#06b6d4` ×24、`#3898ec` ×16、`#fff` ×14、`#3b82f6` ×14 | `#22d3ee` ×74、`#ffffff` ×32、`#06b6d4` ×24、`#fff` ×19、`#3898ec` ×16 | 排序变了（`#fff` 19→14、`#3b82f6` 挤进前 6），**头部三个值的重复次数一次没动**——见 §4.3 |
| 手写内联 `<svg>` 开标签 | **382** | 384 | 图标系统撕裂基本未解，需逐页换成 Lucide |
| 业务代码手写 `<button>` | **777 处 / 140 个文件**（UI 层自身已排除） | 786 / 140 | 同期只有 **74 个文件** `import { Button }` —— PART 33 的"按钮已统一"**未达成** |
| 业务代码手写 `<select>` | **52 处 / 32 个文件** | 49 / 31 | `Select` 家族只有 **7 个**消费者，下拉是采纳度最低的一面 |
| 业务代码手写 `<input>` / `<textarea>` | **228 处 / 69 文件**、**27 处 / 23 文件** | 223 / 69、27 / 23 | `Field` 家族 23 个消费者 |
| 可点击但键盘不可达的 `<div>` | **76 处 / 37 个文件**（守卫源码级规则 `div-onclick-not-keyboard`） | 78 / 39 | 并行会话顺手清掉 2 处；键盘用户仍完全用不到其余控件（§4.6） |
| 任意像素类（`h-[38px]`/`w-[240px]`…） | **150 种，346 处** | 同 | 口径变宽：普查脚本另计 `min-w`/`max-w`/`gap`/`inset`/`size`，与旧值不可直接比升降 |
| `rounded-[…]` 任意圆角 | **6 种，16 处**（`1.5rem` `2rem` `2.5rem` `2.5px` `rounded-t/b-[2rem]`） | 同 | 已收敛 |
| `z-[数字]` 任意层级 | **39 处**（`z-[100]` ×28 占大头） | 39 | 仍违反层级契约 |
| `shadow-[…]` 任意阴影 | **36 种，51 处** | 38 / 53 | 含 `shadow-[#22d3ee]` ×10 霓虹残留 |
| **源里请求但不产生任何 CSS 的类名（死类）** | **826 处 / 194 种**（对照真实生产构建产物；成因分类见 §4.6.1） | — | 本轮新增维度；`npm run lint:dead`。最大一类（`var()` 色加 `/alpha`，348 处）已升格为**不需要构建**的守卫规则 |
| **默认字号阶梯 vs 具名阶梯** | **1697 : 651**（同一批目录 `grep -oE` 现测；守卫口径 1926 处 / 149 文件） | — | 本轮新增断言 `off-system-type-ramp`；PART 33 的"字号已统一"**未达成**，见 §1.1 |
| Token 守卫基线（未清偿债） | **14919 处 / 194 个文件** | 12612 / 192 | ratchet 上限，非当前实况；+2307 全部是两条新规则的存量入账，见 §1.1 |
| Token 守卫当前实况 | **5944 处 / 186 个文件** | 3666 / 172 | 涨了 2278，但**不是倒退**：其中 2307 是两条新规则的一次性存量登记，其余 13 条规则的实况同期从 3666 降到 3637 |
| 运行时漂移在架项 | **1586 条**（08:18 快照；`state.json` 累计 1615 条 open / 15 规则 / P1 983·P2 319·P3 313） | 1586 | 测的是 `www.koyosim.com` **生产**，非本地树；本小时未重跑（跑一次要几分钟且只读生产） |
| 运行时漂移覆盖 | 72 条路由，其中 **39 条**有发现；35 个 `/admin` 只测到未登录跳转 | 同 | 需 `UI_AUDIT_KO_SESSION` 才覆盖后台 |
| 视觉回归 | **105 项：97 通过 / 8 故意留红 / 0 跳过**；42 张基线（24 全页 + 18 composer 特写）+ 1 条闸门自审 | 同 | 上一轮"104/104 通过"已在 §4.8 撤回；8 个红全部逐文件归属他路会话 |

> **为什么基线 ≠ 实况**：守卫是 ratchet——只禁止"比基线更差"，所以基线记录的是**允许的上限**，实况是**今天的欠款**。清偿时先改代码再 `--update` 收紧，绝不能反过来（见 `UI_MIGRATION.md` §2）。
> **§1.1 的两个口径各 1 的差**：`z-[…]`/`rounded-[…]`/`shadow-[…]` 来自普查脚本，统计**全文本**出现次数；`ad-hoc-*` 来自守卫，只看**被判定为类名字符串**的部分。39 vs 38、51 vs 44 不是矛盾，是两个口径。
> **为什么快照会漂**：本工作树有并行会话同时在改 `ImageStudio.jsx` / `CinemaStudio.jsx` / palette codemod（`.ui-drift/codemod-*.mjs`）。以上数字带时间戳，复现命令见 §6；引用时**必须重跑**，不要把本文当作实时看板。

### 1.1 违规按规则分布（`npm run lint:ui -- --report`，同一快照）

| 规则 | 实况 | 基线上限 | 含义 |
| :--- | ---: | ---: | :--- |
| **`off-system-type-ramp`** | **1926** | **1926** | `text-xs`/`text-sm`/… —— Tailwind 默认字号阶梯，绕开 `text-display..text-micro` 语义 recipe（本轮新增，§4.6.2） |
| `off-system-palette` | 799 | 3456 | `bg-zinc-900`、`text-gray-400` 等 Tailwind 原色 |
| `pure-white-black` | 733 | 4610 | `text-white`、`bg-black/50` 等绕过 ink/surface 阶梯 |
| `transition-all` | 567 | 582 | 全属性过渡，重排重绘开销；**基线本身在涨，见下** |
| `arbitrary-type` | 519 | 1116 | `text-[13px]` 等绕过字号阶梯 |
| `arbitrary-geometry` | 441 | 451 | 任意尺寸/间距 |
| `alpha-on-var-colour` | 381 | 381 | `bg-primary/10` 这类"透明度修饰"——Tailwind 对 `var()` 色不产出任何 CSS（本轮新增，§4.6.1） |
| `other-arbitrary-value` | 290 | 1036 | 其它任意值 |
| `div-onclick-not-keyboard` | 76 | 78 | 可点击 `<div>` 无 role/tabIndex/键处理（§4.6）；**实况已低于上限，可收紧** |
| `hard-coded-hex` | 67 | 961 | 类名里的十六进制 |
| `ad-hoc-shadow` | 44 | 90 | 任意阴影 |
| `ad-hoc-z-index` | 38 | 47 | 任意层级 |
| `range-without-utility` | 36 | 36 | 滑杆缺 `.range` → thumb 不可见（§4.6） |
| `ad-hoc-radius` | 16 | 60 | 任意圆角 |
| `outline-stripped` | 11 | 89 | **移除焦点环且无替代** |
| **合计** | **5944** | **14919** | 186 个文件仍被命中（08:18 是 172） |

两条 0 位存量规则（`alpha-on-var-colour`、`off-system-type-ramp`）与上轮的 `range-without-utility`、`div-onclick-not-keyboard` 一样，入账时**实况 = 基线上限**：**从这一秒起任何一处新增都会让闸门变红**；存量则被逐文件点名冻结，处置协议见 `UI_MIGRATION.md` §2。`div-onclick-not-keyboard` 是唯一一个实况已低于上限的（76 < 78），收紧它需要闸门全绿，见 §5 的归属规则。

**新规则入账是可核对的**：`npm run lint:ui -- --explain <rule>`（只读）逐条列出每一处；基线总数按 `12612 + 381 + 1926 = 14919` 逐项对齐，没有夹带别的改动。两条规则的入账都在同一小时内被并行会话的编辑改过（字号规则从 2018 → 1960 → 1926），所以**最终写进基线的是入账那一刻的现测值**，不是先前任何一次读数。

**这两条规则都按 config 管辖范围生效**，不是全局正则：`off-system-type-ramp` 只在"该文件的管辖 config 里存在具名字号阶梯"时才报（`workflow-builder`、`agents` 这些子包从来没写过自己的字号阶梯，`text-sm` 对它们是默认而非越界）；`alpha-on-var-colour` 只在"每一个管辖该文件的 config 都把这个颜色注册成 `var()`"时才报（`Open-Poe-AI/packages/agents` 用 `primary: '#3898ec'` 字面量注册过，`bg-primary/10` 在那里**真的**能编译，所以被豁免）。机制见 `UI_DESIGN_SYSTEM.md` §8。

`off-system-palette` + `pure-white-black` 合计 1532 处，占实况 **26%**。这说明真正的大头不是"颜色写错了"，而是**根本没走语义层**——上一轮这个比例是 65%（8255 处），绝对数降到 1532，是最大的结构性变化。但本轮两条新规则一上榜就分别吃掉第 1 和第 7 位（合计 2307 处，占实况 **39%**），说明**语义层被绕开的方式比"颜色"更深**：同一批目录（`app` + `components` + `packages/studio/src`）里，默认字号写了 **1697 次**、具名阶梯只有 **651 次**（`grep -oE`，09:2x 现测），PART 33 的"字号已统一"和按钮一样**未达成**。

**闸门当前不绿**：`npm run lint:ui` 报 3 条回归，全是并行会话新增的 `transition-all`——`packages/Open-Poe-AI/packages/agents/src/components/EditAgent.jsx` 24→25、`packages/studio/src/components/ClippingStudio.jsx` 12→13、`packages/studio/src/components/WorkflowStudio.jsx` 8→10。归属他人、不代改基线（处置协议见 `UI_MIGRATION.md` §2）。



---

## 2. 对 2026-09-16 版的更正

旧报告里有几条被后续文档当成了事实引用，实际不成立。保留这一节，防止它们再被抄回去。

| 旧断言 | 实况 | 影响 |
| :--- | :--- | :--- |
| Design Token 的 Source of Truth 是 `lib/design-tokens.js` | **该文件不存在**（全仓无此路径） | 唯一真源其实是 `app/globals.css` `:root`（145 个自定义属性）；`tailwind.config.js` 是纯 `var()` 映射层，经校验不含颜色字面量 |
| 品牌主色 `#06b6d4` | **实际是 `#22d3ee`** | `#06b6d4` 只存活在 3 个未迁移文件的硬编码里（见 §4.3） |
| 画布基底 `#030303` | **实际是 `#0a0b0d`** | 旧文档描述的是"想要"的配色，不是代码里的配色 |
| 认证卡片必须用洋红主按钮 `#b71676` | **从未上线过**，全站 0 处 | 它作为"规范"存在于旧文档 §2.7，属于制度化的"每页一套系统"缺陷；已删除 |
| 硬编码色"散落超 40 种，780+ 次" | 在同口径（旧 3 目录）下实测为 **156 种 / 1068 处** | 旧数字扫描了 255 个文件且模式不可复现，量级低估约 4 倍 |
| 内联 SVG 276 个 | 旧口径 310 个 / 全口径 396 个 | 同上 |
| 18 种暗色底板 | 成立，且远不止：仅 `#0a0a0a`/`#030303`/`#0c0e14`/`#0d0e12`/`#1f222d`/`#2d313d`/`#151618` 就已各自出现 20+ 次 | 已建立 6 级 surface 阶梯 |
| **（本轮自查）`boxShadow` 是整体替换，所以 `shadow-sm..2xl` 不生成任何 CSS** —— 3.2.0 的 `UI_DESIGN_SYSTEM.md` §4.6 这样写 | **不成立**：配置在 `theme.extend.boxShadow` 下，产物里 `.shadow-2xl{--tw-shadow:0 25px 50px -12px rgb(0 0 0/0.25)}`、`.text-xs{}` 全都在。它们**会生成 CSS**，只是生成的是不在架的字面量 | 机理搞反会让整改方向错（"删掉死类" vs "换成语义类"）。已在 §4.6.1 记下纠正、在规范 §4.6 改写，并把默认字号那一族升格为规则 `off-system-type-ramp`（1926 处）。`fontSize` 同理在 `extend` 下 |

**教训**：文档若不指向可执行来源（真实文件或可复现脚本），它会在几周内变成误导源。这是本次把三道闸写进规范 §8 的原因。

---

## 3. 缺陷台账（P0–P3）

状态图例：✅ 已修 · ◐ 部分 · ❌ 未修 · ⏸ 有意不动（理由必填）

### 🔴 P0 —— 阻断操作 / 移动端不可用（7 条）

| ID | 缺陷 | 状态 | 证据与说明 |
| :--- | :--- | :--- | :--- |
| P0-01 | 移动端 Prompt Composer 控件溢出/消失 | ✅ | 根因是 `PROMPT_CONTROLS_ROW` 这条**从未被任何文件 import 的死 recipe** 携带 `sm:overflow-visible`，而 studio 外壳是 `overflow-hidden`：768px 下 `Draw`/`Generate` 直接不存在，且没有滚动条提示。改为 `flex-wrap` 后，**同一次改动**同时清掉 Image/Video/Cinema 在 1024/768/430/390/375 的 13 条布局债。见规范 §10 |
| P0-02 | `focus:outline-none` 无替代，键盘焦点不可见 | ◐ | 统一 `FOCUS_RING` recipe 已在 primitive 层强制；`globals.css` 另有无条件 `:focus-visible` 兜底。**仍有 91 处 `outline-stripped` 在未迁移文件中** |
| P0-03 | 390px 顶栏控件渲染到 x=578（超出视口 188px） | ✅ | 由 P0-01 的同一共享轨道修复。**注意**：这条能存在这么久，是因为可达性断言本身从不执行（见 P0-04） |
| P0-04 | 视觉闸的"控件可达性"断言从未运行 | ✅ | `tests/visual/responsive.spec.mjs:223` 已声明 `const unexplained`，第二处重名导致 **SyntaxError**，整个断言块从未跑过一次。改名后立刻抓出 P0-03 |
| P0-05 | 陈旧像素基线仍然通过（1% 容差在整页尺度上过于宽松） | ✅ | Image composer 从 40px 圆点变成整宽按钮，全页差异 <1%，对着过期基线照样绿。新增 `[data-prompt-composer]:visible` **特写断言**，容差 0.001，另存 18 张基线 |
| P0-06 | 图标按钮无可访问名 | ✅ | composer 的圆形生成按钮只有 `title`。删除 `title`、改用共享 `PromptAction` + 可见文案。规范 §7.4 已把"只有 title 不算"写成红线 |
| P0-07 | 全仓 `.jsx` 从未被 lint | ✅ | FlatCompat 只为 `.js/.ts` 生成 `files` 模式；`eslint --print-config` 对 `.jsx` 返回 `undefined` 却仍退出 0 —— **绿色 `npm run lint` 从未看过产品最大的 UI 表面**。已扩展文件模式并新增 `lint:packages` 接入 `test:ci`。放开后实测 0 error / 6 warning |

### 🟠 P1 —— 视觉系统并存 / 品牌降级（9 条）

| ID | 缺陷 | 状态 | 证据与说明 |
| :--- | :--- | :--- | :--- |
| P1-01 | 霓虹发光与荧光色泛滥（`#22d3ee`/`#84cc16`/`#b5f500` + 多重 glow） | ◐ | 全部 elevation token 已改为**纯黑 alpha，无彩色光**（`--elevation-1..4`）；recipe 层禁止 glow。**源码里仍有 154 处 `shadow-[…]`、91 处 `ad-hoc-shadow`** |
| P1-02 | 暗色底板 18+ 种微色差，无 surface 阶梯 | ✅（规范层）❌（清偿） | 6 级阶梯 + 玻璃态专用 token 已建立并被 primitive 消费；未迁移文件继续自带背景色 |
| P1-03 | 手写内联 `<svg>` 存量 | ◐ | `ImageStudio` 的模式/绘制按钮、模型缩略图已换成 `lucide-react`（顺带消灭 `group-hover:text-[#22d3ee]`）。**存量 384 个开标签**（09-21 普查；上一轮 396） |
| P1-04 | 主操作按钮 3 种以上外观 | ◐ | `Button variant="primary"` 是唯一主按钮；`PromptAction` 内部就是它。studio 侧仍有手写圆点/渐变按钮 |
| P1-05 | `components/ui/*` 与 studio 内部各一套 Modal/Select/Badge | ✅ | app 侧别名壳已改为**只转发 recipe**（`components/ui/dialog.jsx` 直接 import `SCRIM`/`MODAL_PANEL`），旧文件自带的 `bg-[#181d2a]`、`z-50`、`max-h-[90vh]`、cyan 焦点环与 `focus:shadow-[0_0_10px_…]` 已删除 |
| P1-06 | **`src/` 是死树：Vite 时代遗留的 14 份 studio 组件陈旧副本** | ⏸ | `src/components/{AgentStudio,AuthModal,CinemaStudio,Header,ImageStudio,LipSyncStudio,McpCliStudio,VideoStudio,WorkflowStudio,…}.js` + `src/main.js`、`src/counter.js`、`src/javascript.svg`。**它们被 git 跟踪、被 lint 扫到、污染所有统计**（本文 262 种 HEX 里有相当一部分只存在于这棵树）。**不在本轮删除**：PART 26 要求 UI 重构不动功能面，而删一棵被跟踪的树属于功能面变更，需要单独确认 |
| P1-07 | studio 路由保活全部 10 个 composer 树 | ◐ | 运行时实测：一个 studio 路由挂载 10 个 `[data-prompt-composer]` 节点，其中 9 个 `display:none`（这是特写断言要用 `:visible` 的原因）。对应 `/studio/image` **811 kB First Load JS**。属于架构问题，规范 §8 之外的工单 |
| P1-08 | `tw-animate-css` 已声明、未注册 | ❌ | `package.json:181` 声明 `tw-animate-css@^1.4.0`，但 `app/globals.css` 无 `@import`、`tailwind.config.js` 无插件注册。**09:30 现测：动效族死类 160 处 / 17 种 / 60 个文件**（其中主应用 `app`+`components`+`src`+`packages/studio` 口径 50 个文件），`animate-in` 46、`fade-in` 35、`animate-fade-in-up` 34 居前——即这些"入场动画"从未出现过（`npm run lint:dead -- --report` 可逐条复现，见 §4.6.1）。修复只需两行，但会**同时改变 60 个文件的观感**，属于视觉面批量变更，未与本次迁移混做 |
| P1-09 | `components/ui/` 整个目录未被 git 跟踪 | ⏸ | `git ls-files components/ui` 为空。它承载 10 个别名壳，删除即全站 app 侧 primitive 断供。**风险**：任何"以仓库为准"的部署会丢掉这一层。属发布流程问题，非 UI 问题 |

### 🟡 P2 —— 尺寸/间距/样式漂移（7 条）

| ID | 缺陷 | 状态 | 证据与说明 |
| :--- | :--- | :--- | :--- |
| P2-01 | 控件高度 28/32/34/36/38/40/42/44/46 混用（运行时测过 757 个控件） | ✅（契约）◐（清偿） | `--control-xs..lg` = 28/32/38/44，`md` 为默认；`controlClasses()` 是唯一尺寸入口，且**一次只吐一个高度类**。仍有 149 种任意像素类 / 346 处（普查脚本口径，含 `min-w`/`max-w`/`gap`/`inset`/`size`，比旧文的"82 种"宽） |
| P2-02 | 圆角 12 档并存，composer 外壳 `rounded-[2rem]` 与内部 `rounded-md` 冲突 | ✅（契约）◐ | 6 级 + `rounded-composer`(20px) 语义档；composer 已改用后者。存量 12 种 `rounded-[…]` |
| P2-03 | 间距无 4px 网格约束（`p-[3px]`、`gap-[7px]`） | ◐ | `--space-1..16` + 守卫 `arbitrary-geometry` 458 处 |
| P2-04 | 字号无阶梯（10/11/12/13/14/16 并存，行高手写 `leading-*`） | ✅（契约）◐ | 9 档 recipe **自带字重与行高**（`--lh-*` 随字号走）；`arbitrary-type` 仍 1136 处 |
| P2-05 | 层级 `z-[999]`/`z-[200]`/`z-[100000]` | ◐ | 11 级梯子（规范 §5）；`ApiKeyModal` 的 `z-[200]` 已移除；存量 48 处 |
| P2-06 | 滚动条：Windows 原生粗滚动条 + 部分容器完全隐形 | ◐ | **规范已反转**：旧 §2.6"全局消除原生滚动条"与 PART 23"不要隐藏到用户不知道还能滚动"直接冲突，且它被写进文档后确实造出了不可发现的溢出。现为：全局暗色细滚动条 + `.scrollbar-rail` 白名单；`.no-scrollbar`/`scrollbar-none` 列为遗留、禁止新增。**代价**：`scrollbar-rail` 在横向轨道上正确，但它救不了 `overflow-hidden` 的祖先 |
| P2-07 | 移动端沿用桌面弹窗逻辑，软键盘遮挡提交 | ✅ | `MODAL_PANEL_MOBILE` 使 `max-md` 变底部抽屉；注意它**必须同时释放 translateX 和 translateY**，只改 `left-0` 会把抽屉推出半屏 |

### 🟢 P3 —— 打磨项（6 条）

| ID | 缺陷 | 状态 | 证据与说明 |
| :--- | :--- | :--- | :--- |
| P3-01 | `transition-all` 滥用 | ◐ | recipe 全部改为具属性过渡；存量 **604 处** |
| P3-02 | 禁用态只改透明度 | ✅ | `CONTROL_BASE` 统一 `disabled:pointer-events-none disabled:opacity-40 disabled:cursor-not-allowed` |
| P3-03 | 16px 图标缺外延热区 | ◐ | `IconButton` / `controlClasses(size,{icon:true})` 保证 ≥28px 正方形；存量在未迁移文件里 |
| P3-04 | emoji 充当导航标签 | ⏸→❌ | 曾判定为在架缺陷，**实测证伪**：`messages/*/common.json` 的 `shell.community`（zh 值为 `"🔥 即梦社区"`，en `"🔥 Community"`）与 `shell.myCreations`（`"📁 我的作品"`）在 6 个 locale 全部存在，但**在全仓无任何消费者**（grep `shell.community` 与动态拼键均 0 命中）。降级为：死文案，谁接上就立刻复发缺陷。**同时它违反品牌命名约束**：中文值写的是"即梦社区"，而被删除的第 5 份文档 `docs/UI_SPEC.md` 明确要求"页面名称使用『社区』，不使用『即梦社区』"——两份文档对同一标签各执一词，正是 PART 04"必须只有一个 Source of Truth"要根除的状态。**真实在架 emoji 在别处**：194 行 / 49 文件，例如 `components/credits/CreditsClient.js` 的 🪙🎁🏅🚧 |
| P3-05 | 空状态无动作 | ◐ | `EmptyState` 要求 `action`；存量页面未接入 |
| P3-06 | Tabs/画廊横向溢出无提示 | ✅ | `TabsList` 内建 `.scrollbar-rail`；Radix Select 内建上下 `ScrollButton`（列表被视口裁切是功能故障，不是风格差异） |

**计数**：P0 7 条（✅5 / ◐2）、P1 9 条（✅2 / ◐4 / ❌1 / ⏸2）、P2 7 条（✅2 / ◐5）、P3 6 条（✅2 / ◐3 / ⏸1）。合计 **29 条**，其中 **11 条完全修复、14 条部分、2 条未动、2 条有意不动**。

---

## 4. 本轮新增发现（旧报告未覆盖）

### 4.1 校验体系自身不可信（最严重的一类）

三条闸在被修之前都给出过**假绿**：

1. `ui-token-guard` 依赖的 `npm run lint` 从未看过 `.jsx`（P0-07）。
2. 视觉闸的可达性断言因变量重名 SyntaxError 从未执行（P0-04）。
3. 像素基线在全页尺度上容差过宽，陈旧基线照样通过（P0-05）。

**结论**：绿色不等于有效。任何闸在信任前，先做一次"故意破坏看它会不会红"的验证——本轮每个断言修复后都用一次反向注入确认过它现在会失败。

### 4.2 i18n 泄漏（在英文界面上可见的硬编码中文）

| 位置 | 泄漏 | 状态 |
| :--- | :--- | :--- |
| `ImageStudio.jsx` 批次药丸 | `1张` 写死 | ✅ 改为 `batchCountUnit`，6 个 locale 补齐 |
| `ImageStudio.jsx` 单价 | `11/张` 写死 | ✅ 改为 `creditPerImageOriginal` |
| `ImageStudio.jsx` 积分符号 | 兜底串 `"✦ {cost}/张"` | ✅ 兜底改空串，不再回吐中文 |
| `CreditsClient.js:141` | `'🎉 成功领取今日登录奖励 1 枚 K 币！'` 作为服务端 message 的兜底 | ❌ |
| 模型标签 | `✦ Hailuo 2.3 (海螺电影级)` 中文混入模型名，且截断 | ❌ |
| 模型标签 | `SInfinite Talk` 名称异常/截断 | ❌ |
| 比例选择 | `smartRatio \|\| "智能比例"` 中文兜底 | ❌ |

### 4.3 `#06b6d4` 的真相

旧文档把 `#06b6d4` 当作品牌主色写进规范，实测全仓 **112 处、只分布在 3 个文件**：`LayersStudio.jsx`(80)、`DrawModal.jsx`(30)、`components/account/RechargeModal.js`(2)。也就是说：这不是"全站主色"，而是**三个从未迁移的文件自带的颜色**，被旧文档误读成了系统级事实。真实在架主色是 `#22d3ee`（364 处）。

### 4.4 线上运行时观测（2026-09-20，`go.koyosim.com`）

> ⚠️ 线上跑的是约 420 个未提交文件，**不能用本地仓库状态推断线上**；下列为线上实测，与本地是否复现无关。

| 观测 | 级别 | 说明 |
| :--- | :--- | :--- |
| `/api/health` 返回 503 | P1 | 健康检查端点异常，监控与部署门禁都会读到假信号 |
| `/sitemap.xml` 404 | P2 | SEO 基础设施缺失 |
| 模板 workflow 接口 401 | P2 | 未登录访问返回 401 而非空态，前端渲染为错误 |
| branding logo 资源 404 | P2 | 管理后台配置的 logo 路径失效，顶栏回落 |
| `/workflow` 404 | P3 | 真实路由是 `/workflow/[id]/[tab]`；裸 `/workflow` 无重定向 |
| `McpCliStudio` 从未挂载 | P3 | 导出存在、studio 注册表里无入口 |

### 4.5 `AudioStudio` 没有 composer —— 以及为什么"接上 composer"是错的处方

**旧结论作废**：本节此前（以及 `UI_MIGRATION.md` §6 第一行）把 Audio 的债记成"没接入 composer，先接一级组件"。审计真实页面后这个处方是错的：Audio 的参数面是 **schema 驱动、渲染在左侧栏的表单**（模型 select、时长/步数滑杆、布尔开关），不是 composer 的底部轨道。硬套 composer 会改变信息架构与操作顺序，属于 PART 32 明令禁止的"顺手大改"。

**实际做法**：就地视觉迁移（`UI_MIGRATION.md` §3.2），结构不动，违规 173 → 0。
**仍然成立的事实**：11 个文件 import `PromptComposer`、9 处 `<PromptControls>` 调用点，Audio 一个都没有 —— 这条观测没错，错的是把它当成待办。

### 4.6 迁移过程中抓到的新缺陷类（闸门看不见的七类）

这些都是"截图看着正常、源码看着正常、运行时坏掉"的类别，静态与像素两道闸都覆盖不到：

| 缺陷类 | 表现 | 为什么闸门看不见 | 现状 |
| :--- | :--- | :--- | :--- |
| `appearance:none` 后无 thumb | range 滑杆是**一根拖不动的横条** | 元素存在、有尺寸、像素稳定 —— 基线只会把坏样子固化 | 新增源码级规则 `range-without-utility`，存量 36 处 / 10 文件 |
| `<div onClick>` 当按钮 | 历史条目、上传卡片键盘完全不可达 | 视觉闸只测溢出与错误；无键盘遍历断言 | 新增源码级规则 `div-onclick-not-keyboard`，存量 **76 处 / 37 文件** 已冻结入账（基线上限仍记 78，未收紧）；Audio 已改为真 `<button>` + `aria-current` |
| `hover:` 独占控制 | 触屏设备没有音量条、没有进度操作 | 截图是静态的，hover 态从不触发 | Audio 改为常驻；其余 studio 未查 |
| 行弹性布局 + `w-full` 侧栏 | 手机上结果区**宽度 0**（实测 `resultWidth: 0`） | 全页截图会拍到"页面变矮"，但 1% 容差内不报红 | Audio 加 `lg:` 断点；**同类结构在其他 studio 未排查** |
| **死 Tailwind 类** | `animate-fade-in-up`、`bg-primary/10`、`w-18` —— 源里写着，产物里没有，元素**一条样式都不拿到** | Tailwind 静默跳过未知类，构建零告警；像素基线只会把坏样子当成正确 | **本轮建成两道闸**：`npm run lint:dead` 对照真实构建产物 → **826 处 / 194 种**（成因分类见下表）；其中最大一类已升格为**不需要构建**的守卫规则 `alpha-on-var-colour`（381 处 / 77 文件，实况=上限） |
| 16 份重复 `<Toaster>` 配置 | 每份重述同一个内联样式对象（`position`/`duration`/9 条 style） | 通知只在交互后出现，基线拍不到；且值本身已合规，闸门无事可报 | **硬编码色与 `zIndex: 99999` 已在 08:18 复测中归零**（16 份全部改读 `var(--z-toast)` 等令牌），残留缺陷是**重复**而非越界：收敛为 `<ToastHost>`，**1 / 16 已替换**（仅 `AudioStudio`） |

#### 4.6.1 死类按成因分类（`npm run lint:dead -- --report --top 999`，同一快照、同一构建）

| 成因 | 处 / 种 | 代表类名 | 为什么它是死的 |
| :--- | ---: | :--- | :--- |
| **`var()` 色加 `/alpha`** | **348 / 107** | `bg-primary/10`、`bg-canvas/95`、`border-line-accent/20`、`focus:border-primary/50` | Tailwind v3 要把颜色拆回通道才能改透明度，`var(--x)` 没有通道 → **整条类不产出**。已升格为守卫规则 `alpha-on-var-colour`；守卫口径给出的是 **381 处 / 77 文件**，比这里宽，因为守卫扫 861 个文件而构建只编译 content 名单里的 492 个（两侧都对，口径不同） |
| **未装动效插件** | **160 / 17** | `animate-in`(46)、`fade-in`(35)、`animate-fade-in-up`(34)、`zoom-in-95`(10)、`animate-scale-up`(10)、`slide-in-from-top-2`(5) | 这些名字来自 `tailwindcss-animate`（本仓实际装的是 `tw-animate-css`，见 P1-08），而 `tailwind.config.js` 是 `plugins: []` 且 `globals.css` 没有 `@import`；`animate-fade-in-up` 更是全仓无定义。**后果**：对话框/抽屉写了进出场动画却一条都没有，Radix 的 `data-[state]` 切换是硬跳 |
| **子包私有调色板** | **147 / 12** | `text-secondary-text`、`border-divider`、`bg-bg-card`、`bg-primary-bg`、`bg-bg-page` | 它们只在子包自己的 tailwind config 里注册（`Open-Poe-AI/packages/agents` 甚至用**字面量色** `primary: '#3898ec'`、`divider: '#333333'`）。被主应用挂载时读的是根 config → 无定义。**两套调色板并存本身就是 PART 05"不同页面不同视觉系统"与 PART 06"同一语义同一 token"的违规** |
| 刻度外几何 | 98 / 19 | `w-18`(32)、`h-22`(24)、`h-18`、`py-0.2`、`h-4.5`、`size-4.5`、`shadow-4xl`、`rotate-270`、`bg-zinc-850` | 不在 spacing / 阴影 / 旋转 / 调色板的任何在架刻度上。**注意别搞反**：`shadow-2xl`、`text-xs` 这类默认阶梯**是会正常生成的**（配置在 `theme.extend` 下），它们不属于死类，属于"绕过语义层"——上一版文档把它们当成死类，本轮已按产物纠正，见 `UI_DESIGN_SYSTEM.md` §4.6 |
| 滚动条工具类 | 20 / 5 | `scrollbar-none`、`scrollbar-thin`、`scrollbar-subtle`、`scrollbar-hide` | 来自未安装的 `tailwind-scrollbar`；`app/globals.css` 里也没有同名自定义类（逐条 grep 校验过），所以滚动条样式实际由 `globals.css` 的伪元素规则承担，写这些类名的地方**以为自己做到了其实没有**（PART 23） |
| `prose` 系 | 9 / 6 | `prose-sm`、`prose-invert`、`prose-p:my-2` | `@tailwindcss/typography` 未注册 → Markdown 渲染区没有排版 |
| 自造类名（无处可加载） | 44 / 28 | `glass-panel`、`interactive-glow`、`typing-dots`、`loader-border`、`seek-bar`、`aux-fill`、`quick-starter-btn`、`even:bg-white-[0.02]` | 任何**被加载**的样式表里都没有这个选择器。两种成因：① 定义在**孤儿样式表**里 —— `src/styles/global.css` 确实写了 `.glass-panel`/`.interactive-glow`，但全仓没有任何文件 import 它（`src/main.js` 只 import `./style.css`），旧 Vite 入口死后它就再也不进产物；② 配套 CSS 被删后留下的类名钩子。`even:bg-white-[0.02]` 还写坏了任意值（缺单位，Tailwind 不认） |

**最集中在一个文件**：`packages/Open-AI-Design-Agent/packages/design-agent/src/CreativeCanvas.jsx` **178 处 / 30 种**（第二名 26 处）。它的成因是上面第二、三行叠加 —— 该包自带 `dist/tailwind.css`，但主应用只 `import "ai-agent/dist/tailwind.css"`，**没有引入 design-agent 的那份**，而 `components/StandaloneShell.js:1399` 又把 `DesignAgentStudio` 当 React 组件直接挂在 `/studio` 的 design-agent 页签里（不是 iframe）。所以那 178 条在页签内确实拿不到样式。**证据级别**：源码方向（config + import 图）与产物方向（编译后的 CSS 无同名选择器）双向一致；**运行时未做目测确认**，列为 §7 待办。

#### 4.6.2 具名阶梯被绕开：`text-xs` 会生成 CSS，但生成的是没在架的东西

死类只是"什么都没发生"。更广的一类是**类名有效、值却不在架上**——默认字号阶梯就是最大的一族。三件现测事实（09:2x–09:30，同一快照）：

| 量 | 值 | 口径 |
| :--- | :--- | :--- |
| 默认字号写法 | **1697 次**（`text-xs` 1115、`text-sm` 309、`text-base` 64、`text-xl` 50、`text-2xl` 48、`text-3xl` 38、`text-lg` 33、`text-4xl` 25、`text-5xl` 13、`text-6xl`/`7xl` 各 1） | `grep -oE` 限定 `app` + `components` + `packages/studio/src` |
| 具名阶梯写法 | **651 次**（`text-display`/`page-title`/`section-title`/`card-title`/`body`/`body-sm`/`label`/`caption`/`micro`/`mono`） | 同上 |
| 新规则入账 | **1926 处 / 149 文件**（实况 = 基线上限） | `npm run lint:ui -- --report`，管辖范围见下 |
| 默认 `leading-*` | **0 次** | 行高没有额外漂移，字号 recipe 的行高是目前唯一来源 |
| 默认 `tracking-*` | 267 次 | **暂未入账**：`uppercase tracking-wider` 这类写法在具名 recipe 之外叠字距，属同一族，下一轮与字号一起收 |

**为什么 1926 比 1697 大**：守卫的管辖范围按 **config** 切，不按目录名切。`off-system-type-ramp` 的判据是"**至少一份**编译这个文件的 tailwind config 里存在具名阶梯"（`governingConfigs(rel).some(c => c.namedRamp)`）。根 config 的 `content` 名单覆盖了 `app/`、`components/`、`src/` 和四个子包的 `src/`，所以 `packages/Vibe-Workflow/.../workflow-builder/src` 里的 `text-xs` **照报** —— 它虽然自己那份 config 没有字号阶梯（`extend: {}`），但它被根构建编译进 `/studio` 时用的就是根阶梯。被豁免的是**没有任何 config 的 `content` 认领**的文件：**58 处 / 368 个文件**（`node .agents/measure-ramp-scope.mjs` 现测，368 里绝大多数是 `lib/`、`tests/`、`scripts/` 这种根本不含类名的文件，真正的豁免落在各子包自带的 `client/` 独立应用上 —— 例如 `packages/Open-AI-Design-Agent/client/app/page.js` 一份就占 18 处），它们不进主应用产物，判它们违规没有意义。
同一条 `governingConfigs()` 在 `alpha-on-var-colour` 上的方向是**反的**：那里要"**每一份**管辖该文件的 config 都把这个颜色注册成 `var()`"才报。因为两件事的证明强度不同 —— **死类要求全票**（只要有一份样式表能救活它，它就不是死的），**绕过语义层只要求有得选**（只要有一个具名阶梯在架，`text-xs` 就是选择而非无奈）。守卫里两条规则各自的方向都写在注释里。

**为什么这条值得单独开规则**：`fontSize` 在 `theme.extend` 下，`text-xs` 编译成 `font-size:12px;line-height:16px` —— 一个既不在 13/14/15/16/18/24/32 阶梯上、也不带任何字重与字距的值。它是 PART 33"字号已统一"的真实水位，此前**没有任何闸门看得见**：`arbitrary-type` 只管 `text-[13px]` 这种写死像素的写法。

**共同点**：这几类都不是"颜色不对"，而是**功能面在特定输入方式下不存在，或者根本没实现**。正确的解法是加断言（键盘遍历、hover-free 检查、源码级规则、对照产物的死类闸），不是加基线 —— 基线只会把坏状态变成合法状态。


### 4.7 编码与闸门可靠性

| 发现 | 证据 | 级别 | 处置 |
| :--- | :--- | :--- | :--- |
| `packages/studio/src/models.js` 有 **10 处 CP1251 mojibake**（9× `ΓÇô` = `–`，1× `ΓÇö` = `—`） | 用户可见文案形如 `Range 0Ã§01`；`git show HEAD:` 同样命中 → **线上也在跑** | P1（用户可见） | **仅报告**：修复要先确定原始字节是被二次编码还是解码错，属编码考古，且 `models.js` 是模型定义面（PART 26）。扩散面只有它自己与 `dist/` 副本 |
| 视觉闸对网络抖动敏感 | 同一命令三连跑：**22 红 → 15 红 → 6 红**；4 个 `renders without errors` 的失败原因都是 `net::ERR_CONNECTION_CLOSED` | P2（闸门可信度） | 定性前必须重跑；建议把外部资源在 `open()` 里 abort 或列入 `CONSOLE_NOISE`，否则闸会长期噪声化 |
| 守卫把遗留死树 `src/components/` 计入统计 | `range-without-utility` 的 36 处里有 **4 处在 `src/components/ImageStudio.js`**（Sep 16 的 Vite 演示残留，仍被 git 跟踪） | P2（统计可信度） | 见 §5 第 8 条（删除需单独确认）；本轮先把这 4 处一起登记进基线，避免为它单开豁免机制 |
| `/design-system` 对照表自相矛盾 | 表格把 `--text-disabled` 判成 `fail`，同一张表下方的注释又说它豁免 WCAG 1.4.3 | P3 | **已修**：exempt 令牌渲染 `exempt` 而非 `fail`，比率照旧打印 |
| 生产站新增 2 个 404 入口 | `npm run ui:audit` 于 07:49 实测 `route_unreachable (HTTP 404)`：`/onboarding`、`/admin/forbidden`；同时基线从 1613 降到 1586（生产已随并行部署前进，本地树落后） | P1（死链） | **仅报告**：属路由面（PART 26）。要先确定入口链接是谁发的，再决定补页面还是撤链接 |
| `ui:audit` 是**对生产站的真实网络请求**，且会改写 `.ui-drift/state.json` | `scripts/ui-spec-audit.mjs` 顶层即执行：`node -e "require('./scripts/ui-spec-audit.mjs')"` 这类"只想读规则表"的写法会直接跑完整巡检 | P2（工具误用面） | 本文只把它当命令用（`npm run ui:audit`），不 `import`；若要保持稳态，应把主体包进 `if (import.meta.url === …)` 守卫 |
| **隔离构建把 80 GB 盘写满**，且失败形态是"文档保存报错 / 路由 500" | 本轮 `Edit` 直接 `ENOSPC: no space left on device, write`；`df -h /h` = 0 可用。成因：视觉闸要求每轮 `NEXT_DIST_DIR=.agents/verify-next-*` 独立产物，每个 ≈1 GB，跨会话累积 | P1（阻断写盘，会伪装成代码故障） | 本轮删自己留下的 3 份 scratch 产物（`verify-next-audio`/`-audio2`/`-ds`）回收 3.5 GB。**纪律**：起隔离构建前先 `df -h /h`；用完当场删；只用一个固定目录名复用，不要每次开新的 |

**为什么 mojibake 归到 UI 审计**：它出现在模型描述里，是用户在参数下拉中直接读到的文本。UI 重构不修它，但"UI 已一致"的结论必须带着这条限定。

### 4.8 撤回一条不可复现的结论：上一版的"视觉回归 104/104 通过"

上一版 §1 写着"104/104 通过（连续两次一致）"，本轮按 §6 命令重跑得到 **105 项：97 通过 / 8 留红 / 0 跳过**（80 项结构性全绿 + 24 张基线里的 8 张 + 1 条闸门自审）。差异不是页面坏了，而是**基线归属与第三方媒体**：

| 红项（8 / 24 张基线） | 归属证据（08:5x 全量跑，逐文件 `git status --porcelain` + `git diff --numstat`） | 处置 |
| :--- | :--- | :--- |
| `/studio/image` @1440 | `ImageStudio.jsx` 未提交 **1414+ / 571−** 行，并行会话迁移中 | **不重录**：重录会把别人的中间态固化成契约 |
| `/studio/video` @1440 | `VideoStudio.jsx` **131+ / 166−** | 不重录 |
| `/studio/cinema` @1440 + @390 | `CinemaStudio.jsx` **107+ / 77−** | 不重录 |
| `/studio/lipsync` @1440 | `LipSyncStudio.jsx` **39+ / 35−** | 不重录 |
| `/community` @390 | `CommunityClient.js` **221+ / 293−** | 不重录 |
| `/pricing` @1440 + @390 | `app/pricing/` 与 `components/pricing/` **整目录未跟踪（`??`）**，无 HEAD 可比 —— 见下方协议修正 | 不重录 |

**同一条命令在 30 分钟内给出五种结果**，这才是上一版"连续两次一致"真正错的地方：

| 跑法 | 基线红 | 因第三方网络错误跳过 | 80 项结构性 |
| :--- | ---: | ---: | :--- |
| 接线前（约 08:0x） | **14** | 无此机制 | 全绿 |
| 接线后 A（08:2x，全量 105） | 5 | 6 | 全绿 |
| 只跑基线 B（08:3x） | 8 | 0 | — |
| 只跑基线 C（08:4x） | 4 | **8** | — |
| 接线后 D（08:5x，全量 105） | **8** | 0 | 全绿 |

漂移量由 `cdn.muapi.ai` 的可用性决定（产品面直链它的结果缩略图），它在 10 分钟内从"掐连接 / ORB 拦截"到"正常"反复。上一版的 14 红里有 6 个根本不是 UI。**归因证据**：`.agents/probe-image-net.mjs` 复现了 `net::ERR_BLOCKED_BY_ORB https://cdn.muapi.ai/assets/….png`，与已知债 `404 /uploads/branding/logo-….png` 是两条独立来源。

**本轮为此落的机制**（`tests/visual/responsive.spec.mjs`）：`watchThirdParty(page)` 按 origin 记录网络错误，然后

1. 结构性测试不再把"第三方造成的 `Failed to load resource`"算成错误 —— **本站源同样的报文仍然算**（这就是不放宽 `CONSOLE_NOISE` 的理由）；
2. 基线测试在截图前 `test.skip(true, 原因)`：语义是**该帧不可比较**，不是该帧通过；
3. 每次跳过登记进 `nonComparable`，文件末尾一条自审测试断言**不可比较帧 ≤ 4 / 24**，超预算整条闸变红 —— 跳过因此不能靠"反正不算失败"把闸门掏空。

**所以 PART 33 的"视觉回归基线已存在"现在的准确说法是**：基线存在、能失败、失败可归属；但只要产品面继续直链第三方结果图，它就有一部分时间不可用。真正的修法是让结果缩略图经本站出口（顺带解掉 CSP 宽免与热链），那属数据/网络面（PART 26），本轮只登记不处置。

本轮真正由我改动引起的是 **10 张 `/design-system` 基线 + 5 张 composer 特写**：证据是 `ui/tokens.js` 与原语文件的 mtime 晚于基线，且 DOM 探针显示控件高度 0 处越界、新令牌已生效。这 15 张已重录。

**归属协议**（写进 `UI_MIGRATION.md` §5，此处只留结论）：视觉闸报红时先跑 `git status --porcelain <该路由的源文件>` 再看 `git diff --stat` —— **只看 `git diff` 有盲区：未跟踪文件（`??`）根本不出现在 diff 里**。本轮就因此差点误判 `/pricing`：`git diff --stat -- app/pricing` 返回空，看似"无人改动"，实际 `app/pricing/` 与 `components/pricing/` **整个目录是并行会话新增且从未入库**（`git ls-files` 查无此路径），红项归它。判据必须是"有没有改动"而不是"相对 HEAD 有没有改动"。
若确认有非本会话的改动，红项归对方，**不重录基线**；只有能证明漂移来自本会话编辑的才重录。缺这一步，视觉闸在共享工作树里等价于"谁先跑谁定义正确"。

---

## 5. 仅报告、不处置（PART 26 保护）

以下问题真实存在，但修复会触碰 PART 26 明令保护的面上（生成逻辑 / 数据模型 / 路由 / 认证 / 上传 / 历史 / Workflow / Agent / Local AI），或属于需要单独确认的破坏性动作：

1. `selectedAr === "智能"` —— **数据值与显示文案耦合**。改文案会改行为，必须连带数据迁移。
2. `next.config.js` 遮蔽 `next.config.mjs`（实际生效的是 `.js`）。`.mjs:10-11` 的注释声称相反，是错的；`.mjs` 里的 `withNextIntl` 是死代码（项目未使用 next-intl）。**对 `.mjs` 的任何修改（包括加 `transpilePackages`）在本地不生效** —— 这是踩过的坑。
3. `require-database-url.mjs` 在 `.env.local` 加载前执行，导致 `npm run dev` 直接失败。
4. CSP 仍放行 `fonts.googleapis.com` / `fonts.gstatic.com`，但字体已由 `next/font` 自托管 → 无效宽免。
5. 3 个既有坏导出（构建期暴露），不属 UI 面。
6. **陈旧构建目录：现测 10 个 / 6.9 GB**（07:5x 之后另有 7 个已被并行会话清掉）。可回收的约 5.3 GB：`.next-social-region-check` 1.34、`.agents/verify-next` 1.10、`verify-next-2` 0.95、`verify-next-6` 0.95、`.next-dev-uiaudit` 0.51、`.next-nav-audit` 0.19、`.next_build.tar.gz` 0.23。**全部归属其他会话**，本文只登记不代删（`.next` 1.55 GB 是在用的 dev/build 目标，不能删）。
7. `packages/Open-Poe-AI` 三个组件把 `useUser` 当 prop 注入，造成 **3 处真实 `react-hooks/rules-of-hooks` 违规**。本轮只加了注释说明与定点 disable，未改行为（Agent 面在 PART 32 优先级里排最后）。
8. 删除 `src/` 死树（P1-06）与 `components/ui/` 的 git 跟踪缺失（P1-09）。

---

## 6. 复现命令

```bash
# §1 静态普查（HEX / 内联 svg / 任意值 / 路由数），带时间戳快照的唯一来源
node scripts/ui-source-census.mjs            # 也支持 --json

# 静态 token 守卫（实况、规则分布、Top-N 文件、逐条证据）
npm run lint:ui -- --report
npm run lint:ui -- --top          # 默认 25 行；--top 999 出全量逐文件清单
npm run lint:ui -- --explain <rule> [file]   # 例：--explain div-onclick-not-keyboard
                                  # 条数上限由 UI_EXPLAIN_LIMIT 控制（默认 25）

# 死类闸：源里请求的类名 vs 真实构建产物里生成的类选择器（必须先有一次生产构建）
NEXT_DIST_DIR=.agents/verify-next-ui npm run build
npm run lint:dead -- --dist .agents/verify-next-ui --report --top 999
npm run lint:dead -- --dist .agents/verify-next-ui --report --files 25   # 按文件排名
npm run lint:dead -- --dist .agents/verify-next-ui --explain bg-primary/10
                                  # 去掉 --report 即为 check：有死类就 exit 1（未接入 test:ci，见下）

# 原语采纳度（PART 33 "按钮/表单/下拉/弹窗是否统一" 的验收证据）
node scripts/ui-adoption.mjs                 # 也支持 --list

# 运行时漂移（读生产站计算后样式，`scripts/ui-spec-audit.mjs` 声明 19 条规则，本轮 15 条有在架项）
npm run ui:audit                             # 结果落 .ui-drift/latest.md

# 视觉/响应回归（10 视口 × 8 路由 + composer 特写 + 1 条闸门自审，共 105 项 / 42 张基线）
NEXT_DIST_DIR=.agents/verify-next npm run build
NEXT_DIST_DIR=.agents/verify-next npm start -- -p <port>
VISUAL_BASE_URL=http://localhost:<port> npm run test:visual
```

**口径**：普查脚本只走 `app/ components/ packages/ lib/ src/` 的 `.js/.jsx`（09:30 现测 672 文件），跳过点目录与 `node_modules/dist/coverage/test-results/__snapshots__`；守卫走同样的排除规则但含 `.mjs/.cjs` 与 `tests/`，分母 861。两者不可互相引用分母。`audit-ui-source.mjs` 是更早的窄口径工具（只覆盖 app + components + studio），**不产出本文任何数字**，且它会往仓库根写 `source_ui_audit_result.json`。
**死类闸是第四个口径**：它只扫根 `tailwind.config.js` 的 `content` 名单**真的会编译**的那批文件（09:30 现测 492），并且必须有一份生产构建产物作对照。所以它的分母比守卫小、数字随构建漂移——这也是它**不进 `test:ci`** 的原因：CI 链里 `npm run build` 在最后，产物口径在共享工作树下不可复现（五个会话各自的 dist 不同）。它现在的角色是**测量 + 定位**，可无构建强制的那一部分（`var()` 色加 `/alpha`）已经升格成守卫规则进了 `test:ci`。默认 `--dist` 取 `$NEXT_DIST_DIR`，再退到 `.next`。


---

## 7. 优先级重排（下一步该做什么）

| 序 | 动作 | 为什么是它 | 风险 |
| :--- | :--- | :--- | :--- |
| 1 | ~~迁移 `AudioStudio.jsx` 接入 composer~~ **已完成**（就地视觉迁移，173 → 0；composer 处方本身是错的，见 §4.5） | — | — |
| 1' | **把 §4.6 的七类缺陷变成断言**：~~键盘可达性~~**已入账**（`div-onclick-not-keyboard`）、~~滑杆 thumb~~**已入账**（`range-without-utility`）、~~死 Tailwind 类~~**已建成两道闸**（`npm run lint:dead` 对照产物 + 守卫规则 `alpha-on-var-colour` 不需构建）、~~默认字号绕过具名阶梯~~**已入账**（`off-system-type-ramp`，1926 处冻结）；仍缺 hover-free 检查 | 六道闸门曾对它们全部免疫，而它们才是"用户用不了"的那一类；已落地的四条把"新增即变红"写死 | 低（新增测试，不改产品代码） |
| 2 | `LayersStudio.jsx`(169) + `DrawModal.jsx` + `MotionControlStudio.jsx` / `ModelParameterControls.jsx` / `VideoModelControls.jsx`（均已跌出 Top-16，即 ≤52） | 单文件债按 `--top` 现排：Studio 面里 `LayersStudio` 仍最重，且一家占 **22 / 36** 处无 thumb 滑杆；`DrawModal` 从基线 218 降到 <53，属可直接收口的一档 | 低-中 |
| 3 | `EditAgent.jsx`(215) / `AiAgent.jsx`(185) / `NodeFlow.jsx`(141) / `WorkflowStudio.jsx`(114) | Agent 与 Workflow 包是实况债最集中的两处（PART 32 把它们排在最后，所以此前一直没动）。**`EditAgent`/`WorkflowStudio`/`ClippingStudio` 正被并行会话迁移**（它们同时是 §1.1 三条红的来源），接手前先核对归属 | 低 |
| 4 | 注册 `tw-animate-css`（或删依赖并把用到它的类换成 `animate-fade-in`） | `package.json:181` 装了它，但 `tailwind.config.js` 的 plugins 里**没有**它、`globals.css` 也没有 `@import` —— 动效族 **160 处 / 17 种 / 60 个文件**全是死类（§4.6.1、P1-08）。二选一，不能悬着。**注意**：这一条和第 4.6.2 行的 348 处 `/alpha` 是两个不同的坑，别指望一次改动清掉两个 | 中（批量观感变化） |
| 4' | **`design-agent` 页签的样式来源要定夺**：`CreativeCanvas.jsx` **178 处 / 30 种**死类，因为主应用没引入该包自带的 `dist/tailwind.css`（只引入了 `ai-agent` 那份） | `/studio` 的 design-agent 页签是 React 直挂（`StandaloneShell.js:1399`，不是 iframe），所以那 178 条拿不到任何样式；两条出路：主应用 `import` 它的 css（等于把第二套调色板放进来），或按根 token 重写这个包（正解，但工作量在另一个包）。**运行时目测尚未做**，先补一次浏览器确认再定 | 中（跨包） |
| 5 | `ui:audit` 接入 CI + 视觉闸做成 `test:visual:ci`（自动 build+serve） | 运行时 1586 条漂移目前无人看；视觉闸的第三方资源归因已落地（`watchThirdParty`，§4.8），剩下的是自动化启停 | 低 |
| 6 | 决定 `src/` 死树与 `components/ui/` 跟踪状态 | 统计与部署的可信度问题：`--top` 前 10 名里有 **4 个是 `src/components/*.js` 死文件**（VideoStudio 106、CinemaStudio 100、ImageStudio 92、LipSyncStudio 81，合计 379 处占实况 **10%**），滑杆债里也有 4 处死代码；而整个设计系统仍未入库 | 中（需确认） |
