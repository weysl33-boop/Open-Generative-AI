# KOYO Studio UI 迁移与债务台账（Migration Ledger）

**版本**：3.2.0 · **取代** 3.1.0（2026-09-21）  
**职责**：记录"做到哪了、还差多少、下一个动谁、怎么动"。规范见 `UI_DESIGN_SYSTEM.md`，组件见 `UI_COMPONENTS.md`，缺陷见 `UI_AUDIT.md`。**本文不定义视觉值。**

> 旧版本文声称 `Design Tokens Source of Truth = lib/design-tokens.js` —— **该文件不存在**。真源是 `app/globals.css` 的 `:root`。旧版还声称主色收敛为 `#06b6d4` —— 实际在架主色是 `#22d3ee`，而 `#06b6d4` 到 08:18 只剩源码树 2 个文件（`LayersStudio.jsx` 22 处、`DrawModal.jsx` 2 处；曾经点名的 `RechargeModal` 已清零）。合计 24 处，与 §1 的普查值精确对上；另有 `packages/studio/dist/` 两份编译副本（67 + 23 处）**不算源**。两条均已更正，别再抄回去。

---

## 0. 部署状态警告（先读）

截至本文更新时（2026-09-21），**设计系统本身不在 git 里**：

```
?? packages/studio/src/ui/      ← 全部 primitive 与 recipe，未跟踪
?? components/ui/               ← 全部 app 侧别名壳，未跟踪
?? docs/UI_*.md                 ← 四份规范，未跟踪
?? scripts/ui-token-guard.mjs   ← 守卫，未跟踪
?? scripts/ui-token-baseline.json · scripts/ui-spec-audit.mjs · tests/visual/
```

也就是说：**"一次以仓库为准的部署会把整个设计系统删干净，只留下引用它的业务代码。"** 这是当前最高优先级的工程风险，优先级高于任何页面迁移。任何后续会话在提交前必须先确认这些路径已入库。

另：这是**五路会话并发写入的共享工作树**，`git status` 里的改动不一定属于 UI 重构。提交前逐文件核对归属。

---

## 1. PART 32 顺序的执行状态

规范指定的落地顺序是 `Tokens → Primitive → Shell → Prompt Composer → Dropdown → Button → Input → Modal → Image/Video/Audio/LipSync/Cinema → Workflow/Agent/Marketing/Apps`。逐段核对：

| 段 | 状态 | 证据 |
| :--- | :--- | :--- |
| Design Tokens | ✅ 已落地 | `app/globals.css` `:root` 共 **145 个自定义属性**（484 行）；`tailwind.config.js` 为纯 `var()` 映射，经校验**零颜色字面量** |
| Primitive | ✅ 已落地 | `packages/studio/src/ui/` 8 个文件；`packages/studio/package.json` 暴露 9 个 `./ui/*` 子路径 |
| Shell（`StandaloneShell`） | ✅ | Header 56px / 侧栏 240-60px 走 token；发光与渐变条已移除 |
| Prompt Composer | ✅ | 全部视觉值 import 自 `ui/tokens`；`data-prompt-composer` 作为回归锚点 |
| Dropdown / Select / Popover / Modal | ✅ | recipe 单一处定义；app 侧 `components/ui/dialog.jsx`、`select.jsx` 改为纯转发 |
| Button / Input | ✅（库层） | `Button`/`IconButton`/`Input`/`Textarea`/`Label`/`FieldMessage` |
| Image Studio | ◐ 打样 | 见 §3.1 |
| Audio Studio | ✅ 深度迁移 | 见 §3.2 —— 该文件违规 **173 → 0**，是 `packages/` 内部第一个清零的业务文件 |
| Video / Cinema / LipSync | ◐ 他路会话在动 | 三者的页面基线正与其未提交 diff 冲突，见 §6 末尾 |
| Workflow / Agent / Marketing / Apps | ❌ 未动 | PART 32 明确排在最后，PART 26 保护其功能面 |

**"✅ 已落地"的含义要说清楚**：指**规范与库层**已可用，不等于**业务代码已在用**。二者的差距见 §4。

---

## 2. Ratchet 进度

守卫基线 `scripts/ui-token-baseline.json`：**194 个文件 / 14919 处**（2026-09-21 09:30 现测）。

| 时点 | 基线总数 | 变化 | 来源 |
| :--- | ---: | :--- | :--- |
| 本轮开始前 | 12793 | — | — |
| Image 打样结束 | 12768 | −25 | `ImageStudio.jsx` 367 → 342 |
| Audio 迁移结束 | 12498 | −270 | `AudioStudio.jsx` 173 → 0（该条已手工删除）；**其余 −97 无法逐条归因** —— 基线是全量快照，并行会话跑过一次 `lint:ui:update`，把当时的所有下降与上升一起写平了 |
| 滑杆规则入账 | **12534** | **+36** | 新增 `range-without-utility` 规则的**存量登记**，10 个文件；`node -e` 可验证：`12534 − 36 = 12498` |
| 键盘可达规则入账 | **12612** | **+78** | 新增 `div-onclick-not-keyboard` 规则的**存量登记**，39 个文件；`12612 − 78 = 12534`。完整逐文件清单可复现：`UI_EXPLAIN_LIMIT=500 npm run lint:ui -- --explain div-onclick-not-keyboard`（只读，不写盘）。Top-5：`MarketingStudio.jsx` 8、`NodeFlow.jsx` 6、`ImageStudio.jsx` 4、`AiAgent/Cinema/LipSync/MotionControl/Recast/VibeMotion/Workflow` 各 3 |
| 死颜色修饰规则入账 | **12993** | **+381** | 新增 `alpha-on-var-colour`（`bg-primary/10` 这类对 `var()` 颜色加 `/alpha`，**整条不产出 CSS**），77 个文件；`12993 − 381 = 12612`。判据按 config 划管辖范围，`Open-Poe-AI/packages/agents` 用字面量注册过 `primary` 的那 19 处被豁免 —— 15 组正负样本可复跑：`node .agents/probe-alpha-rule.mjs` |
| 默认字号规则入账 | **14919** | **+1926** | 新增 `off-system-type-ramp`（`text-xs`/`text-sm`… 会生成 CSS 但绕开具名阶梯），149 个文件；`14919 − 1926 = 12993`。**入账瞬间的现测值才是写进基线的那个数**：同一条规则在这一小时内的三次读数分别是 2018 → 1960 → 1926（并行会话在同时改文件） |

**基线只降不升是硬规则，唯一的例外是新规则的入账** —— 它记录的是"闸门今天多看见了多少"，不是"代码今天多坏了几处"。入账必须逐文件点名并写进本表，否则与偷偷 `--update` 无法区分。

−25 是单面推进，−270 是五路会话并行推进的合计。下降不等于安全：`AudioStudio` 那条是**手工删除**的，不是 `lint:ui:update` 写出来的 —— 因为当时该命令会顺手把另外几条**上升**一起固化成合法值。

**当前 `npm run lint:ui` 是红的**，3 条回归全部由他路会话引入，本文不替它们背书：

```
packages/Open-Poe-AI/packages/agents/src/components/EditAgent.jsx     transition-all: 24 -> 25
packages/studio/src/components/ClippingStudio.jsx                     transition-all: 12 -> 13
packages/studio/src/components/WorkflowStudio.jsx                     transition-all:  8 -> 10
```

（上一版列出的第 4 条 `components/account/tabs/SettingsTab.js  pure-white-black: 14 -> 16` 现已不再复现 —— 归属会话自己清掉了。这正是不替别人 `--update` 的理由：红项会随对方推进自然消失。）

**规则**：基线只能下降。清理后必须 `npm run lint:ui:update` 把下降固化，否则下一个人可以悄悄涨回来。新增违规会让 `lint:ui` 直接失败（已接入 `test:ci`）。但 `lint:ui:update` 是**全量快照**：只要场上有任何一条上升没被处理就跑它，就等于把别人的回归写进合法值。共享工作树里跑这条命令前，先确认 `lint:ui` 已经全绿。

`raw-color-function`（`rgb()`/`rgba()` 写在类名里）规则数为 **0** —— 唯一一条清零的规则。

---

## 3. 深度打样：两个旗舰

按约定，本轮对**旗舰 studio 做深度打样**而非全站铺开。打样不是"改好看"，而是把 §5 配方在两个结构完全不同的文件上跑通：Image 有 composer，Audio 没有。

### 3.1 Image Studio

| 部位 | 迁移前 | 迁移后 |
| :--- | :--- | :--- |
| 模式药丸 | 自带 `text-cyan-400 border-cyan-500/20 bg-cyan-500/10 hover:bg-cyan-500/15` + 手写 `<svg>` | `promptControlClassName({active})` + `lucide-react` `ImageIcon` + `PROMPT_CONTROL_LABEL_CLASS` |
| 生成按钮 | `w-10 h-10 rounded-full bg-white hover:bg-cyan-400 shadow-lg`，只有 `title` | 共享 `PromptAction`（内含 `BUTTON_VARIANTS.primary`），可见文案 + `ArrowUp` |
| 模型缩略图槽 | `w-4 h-4 bg-white/5`、`text-[9px] font-bold text-white/80` | `size-4 rounded-xs border-line bg-well`、`text-caption text-ink-muted` |
| 积分/批次文案 | `11/张`、`1张`、`"✦ {cost}/张"` 中文硬编码 | 6 个 locale 新增 `creditPerImageOriginal`、`batchCountUnit` |
| 右侧信息簇 | `text-white/50`、`text-white/30 text-[10px]` | `text-label text-ink-muted`、`text-caption text-ink-subtle` |

**一处未动**：`ImageStudio.jsx` 携带一个大型未提交功能 diff（非 UI）。本轮只在其之上叠加样式层改动，没有触碰生成逻辑、参数装配或请求路径（PART 26）。

### 3.2 Audio Studio（2026-09-21，173 → 0）

**先纠正一件事**：`UI_AUDIT.md` 旧版把 Audio 记作"接入 composer"。这是错的，且错得有意义 —— Audio 的参数面是 **schema 驱动、渲染在左侧栏的表单**，不是 composer 的底部轨道。给它套 composer 会改变信息架构，属于 PART 32 禁止的"顺手大改"。Audio 走的是**就地视觉迁移**：结构不动，把每个面换成 primitive。

| 部位 | 迁移前 | 迁移后 |
| :--- | :--- | :--- |
| 手写 SVG 图标 | 6 个内联 `<svg>`，描边宽度各不相同 | `lucide-react` 单一图标源，`strokeWidth={1.8}` 图标 / `{2}` 操作 |
| 参数下拉 | 三套自制 click-listener 菜单（点外面靠 `document` 监听关闭，无键盘） | Radix `Select` 家族，`SelectItem description` 承载副文案 |
| 布尔开关 | `type="checkbox"` 裸控件 | `<Switch>`（44px 命中区，需配 `Label htmlFor`） |
| 数值滑杆 | `appearance:none` 后**没有** thumb 样式 → 看不见也拖不动 | `.range` + `--range-*` token |
| 上传 | 只有 hover 态的假按钮，键盘不可达 | `sr-only` 原生 input + `focus-visible` 卡片，`Progress` 显示上传进度 |
| 播放条 | 只有 `hover:` 才出现的音量与手写进度条 | 原生 `range` seek + 常驻音量；触屏设备不再丢失控制 |
| 历史条目 | `<div onClick>`，Tab 不可达 | 真 `<button>` + `aria-current`，`CARD_SURFACE` 三态 |
| 空态 / 头部 | 硬编码 class 与 `alert()` | `EmptyState size="lg"`、`Badge tone="success"`、`Alert`、`toast.error` |
| 通知 | 自带 `<Toaster position="top-right" zIndex={99999}>` 配置 | 共享 `<ToastHost />` |
| 移动端 | 行弹性布局 + `w-full` 侧栏 → 结果区**宽度 0** | `lg:` 以下堆叠；实测 `resultWidth` 0 → 390，无横向溢出 |

**PART 26 边界**：`generateAudio` / `uploadFile` 调用、模型 schema、历史读写、`activeResultUrl` 状态机全部未改；diff 里 325 增 / 402 删全部落在 class、图标与控件元素上。

---

## 4. 采纳度真相（差距清单）

两个互补的测量，都可复现：

```bash
node scripts/ui-adoption.mjs        # 谁 import 了 UI 层（正向：采纳面）
node scripts/ui-source-census.mjs   # 业务代码里还剩多少手写原生控件（反向：未采纳面）
```

### 4.1 正向：谁在用（`ui-adoption.mjs`，2026-09-21 08:18）

| 家族 | 消费者文件 | 家族 | 消费者文件 |
| :--- | ---: | :--- | ---: |
| Button | **74** | Tabs | 10 |
| Badge | 42 | Select | **7** |
| Card | 29 | Overlay（Modal/Drawer/Popover/Tooltip/Menu） | **5** |
| Field（Input/Textarea/Label/Switch） | 23 | Feedback（Spinner/Skeleton/Progress/Alert/Empty/Toast） | 17 |

全仓 1073 个源文件里 **89** 个消费 UI 层，其中 **只有 4 个在 `packages/` 内部** —— `prompt/PromptComposer.jsx`、`ImageStudio.jsx`、`AudioStudio.jsx`、`ModelParameterControls.jsx`。**注意口径**：更早版本记的"71 + 2 = 73"把 `components/ui/*` 的 11 个转发文件也算成了消费方，且分母是 788；不可直接比较，趋势以脚本为准。

### 4.2 反向：还剩多少手写（同一快照）

统计业务代码中的原生元素标签，**排除 `ui/` 目录自身**（原语内部当然可以渲染 `<button>`）：

| 元素 | 处数 / 文件数 | 对照 |
| :--- | ---: | :--- |
| `<button>` | **786 / 140** | `Button` 家族 74 个消费者 |
| `<input>` | 223 / 69 | `Field` 家族 23 |
| `<select>` | **49 / 31** | `Select` 家族 7 |
| `<textarea>` | 27 / 23 | 同上 |

**只看 §4.1 会得出错误结论。** "74 个文件用 Button"听起来像已统一，但同一时刻屏幕上还写着 786 个 `<button>`。PART 33 的"按钮/表单/下拉/弹窗是否统一"这一项，**答案是未达成**，且最薄的两处正好是最难的两处：`Overlay` 5 个消费者 vs 手写弹窗/抽屉/浮层遍布全站，`Select` 7 个 vs 49 个原生 `<select>`。

**结论没变的那一半**：app 侧（顶栏、账号、社区、定价、模型中心、`/design-system`）已实质接入；**变了的那一半**：studio 包内部从"孤岛"变成"有 4 个点，但仍然孤岛"。这不是"设计系统没建成"，而是"建成的部分还没被消费"—— 区分这两者决定了下一步是修库还是迁移。`UI_COMPONENTS.md` §0.2 记的是同一件事，三处必须一起更新。


---

## 5. 单页迁移配方（照抄可用）

以下 9 步在 Image 与 Audio 两个结构不同的旗舰上完整走通，并被 104 个视觉测试验证。**每次只迁移一个文件的一类面。**

1. **先跑基线**：`npm run lint:ui -- --top` 记下该文件当前违规数；`git diff --stat <file>` 确认没有别人的未提交改动混在里面。
2. **确认导入方式**：用**相对路径**（`../ui/Feedback`），不要用 `studio/ui/...`。原因：实际生效的配置是 `next.config.js`，它**没有** `transpilePackages`；而 `next.config.mjs` 里的任何配置（包括加 `transpilePackages`）都不生效（见 `UI_AUDIT.md` §5.2）。
3. **替换顺序固定**：主操作按钮 → 参数药丸 → 图标 → 文本层级 → 表面/边框 → 阴影/层级。文本与颜色类永远放在交互控件之后，因为控件 recipe 自带字号。
4. **每次替换后检查最终 class 串**：`cn` 不去重。确认没有两个 `h-*`、两个 `bg-*`、两个 `px-*`（`UI_COMPONENTS.md` §1）。
5. **禁止 `className` 打补丁**：需要不同的颜色/尺寸，说明缺 recipe 或缺 token —— 回 `globals.css` + `tokens.js` 补，再消费。反向污染业务代码是本次重构要根除的头号行为。
6. **本地化**：任何被删掉的硬编码文案必须落到 `packages/studio/src/messages/<locale>/*.json`（studio 面）或 `messages/<locale>/common.json`（app 面），**6 个 locale 一起补**，带 `{count}` 之类占位。
7. **验证**：`NEXT_DIST_DIR=.agents/verify-next npm run build` → 起服务 → `npm run test:visual`（受影响页面重录基线，**必须用生产构建录**，`next dev` 的 overlay 会把差异注入被比较画面）。
8. **固化**：`npm run lint:ui:update` 记录下降；更新 `UI_COMPONENTS.md` 采纳表与本文 §2/§4。

**第 7 步的四条现场约束**（每一条都踩过）：

- **产物可用性要单独验**：退出码 0 不代表产物能跑。查 `.agents/verify-next/app-paths-manifest.json` 的路由数（应 ≥ 200），再用 `NEXT_DIST_DIR=<dist> bash .agents/serve.sh <port>` 起真实路由冒烟。
- **构建会因外网字体抖动失败**：`NextFontError: Failed to fetch Jost` 是到 `fonts.googleapis.com` 的间歇 TLS 重置，与代码无关 —— 重跑即可，别去改 `next/font` 配置。
- **`-g` 过滤只能用 ASCII**：Git Bash 传 argv 会破坏非 ASCII 字节，`-g "/studio/audio › baseline"` 静默匹配 0 个测试并"全绿"。写 `-g "studio/audio.*baseline"`。同一类坑另有 `curl -d` 发中文污染线上数据。
- **视觉闸对网络抖动敏感**：`renders without errors` 用 `page.on('response')` 收 ≥400 与 console error，外部资源偶发 `net::ERR_CONNECTION_CLOSED` 会让 4 个不相关测试同时红。**同一命令重跑一次再定性** —— 本轮 22 红 → 15 红 → 6 红，只有最后 6 个是真的。

9. **故意破坏验证**（针对闸门本身）：临时给被迁移元素加一个 `h-[37px]`，确认 `lint:ui` 变红；改一个 composer 尺寸，确认特写断言变红。闸门不验证就不可信 —— 本轮三条闸里有两条曾长期假绿（`UI_AUDIT.md` §4.1）。

**本轮已做的破坏验证（2026-09-21，结果可复现）**：在 `AudioStudio.jsx:450` 的 `.range` 上临时插入 `h-[37px]` → `ui-token-guard` 报 `packages/studio/src/components/AudioStudio.jsx arbitrary-geometry: 0 -> 1` 且**进程退出码 1**（不是只打印）；撤掉后回到 3 条他路回归、文件字节数复原（回归条数随时点变，见 §2）。

composer 特写这一条**不需要人为破坏就已经自证**：本轮 recipe 收敛让 composer 在 1440 上只变了 1~2px，页面级 `maxDiffPixelRatio: 0.01` 完全没反应，而 `[data-prompt-composer]:visible` 特写（0.001）在 image/video/lipsync 三个面上全部报红。**这就是那条特写断言存在的理由**，也是它已被验证在工作的证据。

第三条源码级规则 `div-onclick-not-keyboard` 也做了同样的破坏验证（08:1x）：临时新建 `lib/__ui-guard-probe.jsx`，四个 `<div>` 分别写成"裸 onClick"/"带 `role`+`tabIndex`+`onKeyDown`"/"`as="button"`"/"`aria-hidden="true"` 遮罩" —— 结果**恰好 1 条**报红（`div-onclick-not-keyboard: 0 -> 1`），三种被规范承认的写法全部不报，探针已删。这条"负样本也要过"的验证是必要的：一条见 div+onClick 就报的规则会被业务用 `// eslint-disable` 式的心态整体绕掉。

**重录基线前先定归属**。`--update-snapshots` 会把"当前渲染"变成"合法渲染"，在五路并发的共享工作树里，这等于替别人的未提交 diff 背书。判定顺序：

1. 看 `test-results/<case>/error-context.md` 里失败的是**页面**快照还是 `[data-prompt-composer]` **特写**快照（先断言页面，所以报 composer 就说明页面已过）。
2. 比对 `ls -lt packages/studio/src/ui/*` 与快照 mtime：特写漂移若只可能来自共享 recipe（`ui/tokens.js` 05:34 改，快照 01:02 录），那是**自己的**改动 —— 肉眼看 actual/expected 两张图确认无回归后重录。
3. 页面漂移且该文件正被别人迁移（`git status --porcelain <路径>` 有 `M` **或** `??`，`git diff --stat` 有几百行非本次改动），**不重录**，写进台账交给归属方。**只跑 `git diff` 不够**：未跟踪文件不进 diff —— 本轮 `/pricing` 因此一度看起来"无人改动"，实际 `app/pricing/` 与 `components/pricing/` 整目录是并行会话新增且从未入库（`git ls-files --error-unmatch components/pricing/PricingClient.js` 报"did not match any file(s)"）。判据是"有没有改动"，不是"相对 HEAD 有没有改动"。
4. 只想重录特写时用能唯一命中该测试的 `-g`，并核对输出里"re-generated"的行**只有** composer 文件 —— 页面快照未被改写才说明没顺手固化别人的面。

本轮按此规则重录了 `/design-system`（10 页 + 10 特写）与 image/video/lipsync 的 5 张 composer 特写，**留下 8 个红**：`/studio/image` 1440、`/studio/video` 1440、`/studio/cinema` 1440+390、`/studio/lipsync` 1440、`/community` 390、`/pricing` 1440+390 —— 逐文件归属：`ImageStudio.jsx` 1414+/571−、`VideoStudio.jsx` 131+/166−、`CinemaStudio.jsx` 107+/77−、`LipSyncStudio.jsx` 39+/35−、`CommunityClient.js` 221+/293−，`app/pricing/` 与 `components/pricing/` 整目录未跟踪。全部是他路会话的在飞改动，本会话未替它们重录任何一张。

---

## 6. 待迁移台账（按债从重排）

**两列都是必需的**：`实况` 是 `node scripts/ui-token-guard.mjs --top 999` 的今天欠款，`上限` 是 `scripts/ui-token-baseline.json` 里该文件的允许值（闸门只比这个）。只看实况会低估剩余工作量（上限才是别人能悄悄涨回去的地方），只看上限会看不见清偿进度。快照 **2026-09-21 09:30**，**引用前必须重跑** —— 上一版（08:1x）同一张表里 `LayersStudio` 的实况还是 169，两条新规则一入账就变成 295，**排序本身都会变**，别把这张表当稳定优先级。

| 优先 | 文件 | 实况 / 上限 | 备注 |
| :--- | :--- | ---: | :--- |
| 1 | `packages/studio/src/components/LayersStudio.jsx` | **295** / 941 | **上限最重**（941 = 全仓 6.3%）；`#06b6d4` 剩下的 22 处与 **22 / 36** 无 thumb 滑杆都在这一份文件里；新规则里它独占 100 处默认字号 + 26 处 `/alpha` |
| 2 | `packages/Open-Poe-AI/packages/agents/src/components/EditAgent.jsx` | **273** / 355 | 含 `transition-all` 24→25 上升（他路会话引入，见 §2 的三条红）与 3 处 hooks 违规 |
| 3 | `packages/Open-Poe-AI/packages/agents/src/AiAgent.jsx` | **208** / 226 | Agent 面，PART 32 排最后 |
| 4 | `packages/Vibe-Workflow/.../NodeFlow.jsx` | **179** / 297 | Workflow 画布，溢出与命中区规则不同于表单面；另占键盘不可达 `<div>` **6 处**（现测，`--explain div-onclick-not-keyboard` 可逐条点名） |
| 5 | `components/credits/CreditsClient.js` | 159 / 575 | 含在架 emoji（🪙🎁🏅🚧 08:1x 现测仍在 `:262/:750/:777/:781`，本小时未重测）与 `:141` 中文兜底 toast |
| 6 | `packages/studio/src/components/WorkflowStudio.jsx` | 143 / 260 | PART 26 保护面，只动样式；**当前带 `transition-all` 8→10 上升** |
| 7 | `packages/studio/src/components/ImageStudio.jsx` | 125 / 400 | 已打样；**他路会话正在大改该文件**；死类 25 处（studio 面第一） |
| 8–10 | `src/components/VideoStudio.js` **125 / 125** · `LipSyncStudio.js` **113 / 113** · `ImageStudio.js` **111 / 111** | 见左 | **legacy 死树**：实况恰好等于上限（这两条新规则给它们记的新账），没有任何 UI 入口会渲染它们。处置不在迁移而在 §7 序 6 的"决定 `src/` 死树"；在决定之前它们会一直占着台账前三排 |
| 11 | `packages/Open-AI-Design-Agent/packages/design-agent/src/CreativeCanvas.jsx` | 118 / 163 | **另见下方"design-agent 页签"一条**：守卫口径 118 处，死类口径 **178 处 / 30 种** —— 两个数都是真的，量的是不同的东西 |
| 12 | `src/components/CinemaStudio.js` | 110 / 110 | 同 8–10，legacy 死树 |
| 13 | `packages/Vibe-Workflow/.../ChatWidget.jsx` | 103 / 153 | workflow 面 |
| 14 | `app/admin/content/branding/BrandingManagerClient.js` | 87 / 266 | 后台面；`UI_AUDIT_KO_SESSION` 缺失时运行时闸完全不覆盖它 |
| 15 | `packages/studio/src/components/CinemaStudio.jsx` | 83 / 219 | **他路会话在改**（视觉闸 8 个红里占 2 个） |
| 16 | `packages/studio/src/components/DrawModal.jsx` | 75 / 251 | 从基线 251 降下来的一档，`#06b6d4` 仅剩 2 处 |
| 17 | `packages/studio/src/components/MotionControlStudio.jsx` | 73 / 268 | |
| 18 | `packages/studio/src/components/VibeMotionStudio.jsx` · `RecastStudio.jsx` · `ClippingStudio.jsx` | 57 / 145 · 51 / 133 · 71 / 196 | studio 面中段；`ClippingStudio` 当前带 `transition-all` 12→13 上升（见 §2） |
| 19 | `components/creations/CreationsClient.js` · `components/community/CommunityClient.js` | 56 / 210 · 52 / 107 | app 侧，走 primitive 最快；**两者正被其他会话迁移**（上一版记的是 21 / 16，一小时内涨到 56 / 52 —— 别人的进度，不是本文的账） |
| 20 | `VideoModelControls.jsx` · `ModelParameterControls.jsx` | 13 / 34 · 1 / 26 | composer 的直接下游，债不重但杠杆高 —— 它们决定参数气泡在两成的 studio 里长什么样 |
| ✓ | `components/account/tabs/ProfileTab.js` | **0** / 257 | 已清零（归属他路会话），基线条目留着，等 `lint:ui` 全绿时随下一次 `--update` 收紧 |
| ✓ | `packages/studio/src/components/AudioStudio.jsx` | **1** / 1 | §3.2 的 173 → 0 仍然成立；这 1 处是**键盘规则入账带来的**（上传格子 `<div onClick>`），非回归。详见下方"关于 AudioStudio 的第 1 处" |

**四行"实况 = 上限"的 0 位文件**：新规则入账之后，这些文件的闸门状态是"再加一处就红"，但它们**同时**是 legacy 死树或无人认领的改动热点 —— 台账顺序 ≠ 施工顺序，施工顺序仍按 PART 32（Tokens → Primitive → Shell → Composer → Dropdown → Button → Input → Modal → 五个媒体 Studio → Workflow/Agent/Marketing/Apps）。

**design-agent 页签是本轮新认下来的一条独立债**（不属于单个 ledger 行）：`CreativeCanvas.jsx` 在死类口径下有 **178 处 / 30 种**类名拿不到任何样式，因为主应用引入了 `ai-agent/dist/tailwind.css` 却**没引入 design-agent 自己那份**，而 `StandaloneShell.js:1399` 是 React 直挂（不是 iframe）。两条出路都不该由 UI 重构单方面定：① 主应用 import 它的 css（等于把第二套私有调色板正式放进来，与 PART 05/06 冲突）；② 按根 token 重写这个包（正解，工作量在另一个包）。**运行时目测尚未做**，动手前先补一次浏览器确认。详见 `UI_AUDIT.md` §4.6.1 末段与 §7 序 4'。


**关于 AudioStudio 的第 1 处**（`div-onclick-not-keyboard`，`:166`）：键盘路径其实**存在** —— 格子内嵌了可聚焦的 `<input type=file>`，并用 `has-[:focus-visible]` 把焦点环画在格子上。规则只看开标签、不看嵌套子树，所以这是一次**有意的保守命中**：不做子树推断是为了不让"碰巧里面有个控件"成为免死金牌。处置是保留在基线里（实况 1 / 上限 1，闸门绿），真正的清掉要把格子换成 `<label htmlFor>` 并保住 `uploadState !== IDLE` 时不许打开选择器的行为 —— 那是上传逻辑面（PART 26），本轮不动。

**三件跨文件收尾债**（不属于单个文件，别指望迁移顺路清掉；数字为 2026-09-21 08:1x `grep` 现测）：

1. **`ToastHost` 只替换了 1 / 16 处**。UI 层之外还有 **16 个文件**各挂一份自己的 `<Toaster>`（`packages/studio` 10 个：AiInfluencer、Apps、Clipping、Image、Layers、LipSync、MotionControl、Recast、VibeMotion、Video；`Open-Poe-AI` 3 处；`Open-AI-Design-Agent` 2 处；`Vibe-Workflow` 1 处）。**注意缺陷已换形**：内联样式里的硬编码色与 `zIndex: 99999` 在本轮复测中已归零（16 份全部改读 `var(--z-toast)` 等令牌），残留问题是**同一份配置被重复声明 16 次** —— 所以它不再被任何闸拦住，只能靠替换。一次批量替换即可清完，且**不动生成逻辑**（`UI_COMPONENTS.md` §7.1）。
2. **`<Switch>` 零采纳**。`packages/studio/src` 已无裸 checkbox，app 侧仍有裸 `type="checkbox"` **24 处 / 13 个文件**（集中在 `app/admin/**` 与 `components/account`、`components/onboarding`）。
3. **`.range` 只覆盖了 Audio 的 3 个滑杆**，其余全部 **36 处 / 10 个文件**在账（`UI_EXPLAIN_LIMIT=200 npm run lint:ui -- --explain range-without-utility` 复现）：`LayersStudio` 22、死树 `src/components/ImageStudio.js` 4、`workflow-builder` 的 `VideoPlayer` / `AudioPlayer` 各 2、`Clipping` / `DrawModal` / `MotionControl` / `RenderField` / `RenderApiField` / `components/admin/branding/LogoCropper` 各 1 —— 在 Chrome 上表现为看不见也拖不动。

**当前视觉闸留着的 8 个红**（有意不重录，等归属方）：`/studio/image` 1440、`/studio/video` 1440、`/studio/cinema` 1440+390、`/studio/lipsync` 1440、`/community` 390、`/pricing` 1440+390。逐文件归属证据与"同一命令三次跑出三种结果"的第三方媒体分析见 `UI_AUDIT.md` §4.8，判定过程见 §5。

---

## 7. 兼容性策略

1. **prop 词汇只翻译不删除**：`ghost`/`destructive`/`accent`/`default` 等旧名在 `components/ui/*` 别名层继续可用，映射到新 variant。调用点无需批量改写。
2. **导出名与签名冻结**：`PromptComposer.jsx` 的 20 个导出是 11 个文件的编译契约，本轮只增不改不删（`data-prompt-composer` 是唯一新增属性）。
3. **不合并 `dropdown` 与 `popover` 层级**：它们在 Radix 里有真实的堆叠差异，合并会让参数气泡盖住菜单。
4. **`.no-scrollbar` / `scrollbar-none` 保留定义但禁止新增**：直接删会让 40+ 未迁移容器突然长出滚动条，属于批量观感变更，须单独排期。
5. **`transition-all` 逐个换成具属性过渡**，不做全局 find-replace —— 有些元素确实依赖 `all` 才能过渡 `transform`。

---

## 8. 回滚

设计系统的每一层都可独立回滚，这是分层的目的：

| 层 | 回滚动作 | 影响 |
| :--- | :--- | :--- |
| 单个 studio | `git checkout -- <file>`（**先确认该文件没有别人的改动**） | 只回退该页视觉，primitive 与 token 不受影响 |
| composer recipe | 恢复 `PROMPT_CONTROLS_ROW` | 会立刻让 13 条 `LAYOUT_DEBT` 回来 —— 视觉闸会以"控件在视口外"失败，不会静默 |
| 别名壳 | 恢复 `components/ui/*.jsx` | app 侧 71 个调用点回到旧外观，studio 不受影响 |
| token | 删 `globals.css` 条目 | `tailwind.config.js` 的 `var()` 引用会静默解析为空 —— **必须先删 token 的消费方** |

**不可回滚项**：6 个 locale 新增的两个 copy key。留着无害。

---

## 9. 长期强制约束

1. **动手前必读** `docs/UI_DESIGN_SYSTEM.md` + `docs/UI_COMPONENTS.md`。
2. **优先复用 primitive**；缺什么补什么，补在库层，不补在业务层。
3. **禁止** `#xxxxxx` / 类名里的 `rgb()` / 任意 `px` / `rounded-[…]` / `shadow-[…]` / `z-[数字]`。
4. **同一语义全站同一 token**；两个页面用两种方法表达一个状态即缺陷。
5. **文档只引用真源**：任何写进文档的数值必须能在 `globals.css` 或代码里指到；指不到的删掉。旧版四份文档里有三个"事实"是这种情况（`lib/design-tokens.js`、`#06b6d4`、`#b71676`），它们各自存活了数周才被抓到。
6. **闸门要做故意破坏验证**。绿色 + 未验证 = 未知。
7. **UI 与功能不同批改**（PART 32）。一个 commit 只属于一类。
