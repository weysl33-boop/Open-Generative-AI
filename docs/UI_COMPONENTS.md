# KOYO Studio 共享组件清单（Component Reference）

**版本**：3.3.0 · **取代** 3.2.0（2026-09-23 增补商业化、一站式扫码、胶囊分段器与 Switch 复合行）
**地位**：`UI_DESIGN_SYSTEM.md` 的配套实现清单。规范定义"必须是什么样"，本文定义"用什么拿到它"。
**校验方式**：本文所有 API 逐字段读自源码，所有采纳数字由脚本扫描本仓库当前工作树得出。新增组件与 Recipe 必须同步本文，否则视为未交付。

---

## 0. 位置与导入路径（先读这一节）

Primitive 的**唯一实现位置**是 `packages/studio/src/ui/`：

| 文件 | 职责 |
| :--- | :--- |
| `tokens.js` | 全部 class recipe（唯一 recipe 定义处） |
| `cn.js` | 零依赖 class 拼接器 |
| `Button.jsx` | `Button`, `IconButton` |
| `Field.jsx` | `Input`, `Textarea`, `Label`, `FieldMessage` |
| `Overlay.jsx` | `Select*`, `Menu*`, `Popover*`, `Tooltip`, `Modal*`, `Drawer*` |
| `Surface.jsx` | `Card`, `CardHeader`, `CardMedia`, `Badge`, `StatusBadge` |
| `Feedback.jsx` | `Spinner`, `Skeleton`, `Progress`, `Alert`, `EmptyState` |
| `Navigation.jsx` | `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`, `SegmentedControl` |

`packages/studio/package.json` 的 `exports` 提供子路径，**按需从子路径导入**，不要从 barrel 拉整个 UI 层：

```js
import { Button } from "studio/ui/button";
import { Modal, ModalContent } from "studio/ui/overlay";
import { PROMPT_PANEL, controlClasses } from "studio/ui/tokens";
```

### 0.1 `components/ui/*` 是别名壳，不是实现

仓库根目录 `components/ui/`（`button.jsx`、`card.jsx`、`badge.jsx`、`dialog.jsx`、`select.jsx`、`input.jsx`、`textarea.jsx`、`tabs.jsx`、`skeleton.jsx`、`alert-dialog.jsx`）现在只做两件事：**把 primitive 的 recipe 接过来** + **翻译历史 prop 词汇**。它们不含任何视觉值。

| 别名壳 | 旧名 | 现解析为 |
| :--- | :--- | :--- |
| `components/ui/button.jsx` | `ghost` | primitive `tertiary` |
| | `destructive` | primitive `danger` |
| `components/ui/badge.jsx` | `default` / `secondary` / `neutral` | 同一个 `neutral` tone |
| | `accent` | `brand` |
| | `destructive` | `danger` |
| `components/ui/card.jsx` | — | `padding` 默认 `none`（历史契约：由 `CardHeader`/`CardContent` 自带内边距） |
| `components/ui/dialog.jsx` | — | 复用 `SCRIM` / `MODAL_PANEL` recipe，保持 shadcn 式复合 API |

> **Git 状态警告**：`components/ui/` 整个目录**未被 git 跟踪**（`git ls-files components/ui` 返回空）。它是宿主 app 的组成部分，**不得删除**；如需清理，移动到 `.agents/ui-unused-backup/`。

### 0.2 当前真实采纳度（这是差距，不是成绩）

由 `node scripts/ui-adoption.mjs` 得出（2026-09-21 08:18 刷新；口径写死在脚本里：一个文件只有在 `import { … } from "<…>/ui…"` 里点名了该家族的导出才算消费方，`components/ui/*` 别名壳自身不算；`--list` 出文件清单）：

| 组件家族 | 引用它的源文件数 |
| :--- | ---: |
| `Button` / `IconButton` | **74** |
| `Badge` / `StatusBadge` | 42 |
| `Card` 家族 | 29 |
| `Field` 家族（含 `Switch`） | 23 |
| `Feedback` 家族（含 `ToastHost`） | 17 |
| `Tabs` 家族 | 10 |
| `Select` 家族 | **7** |
| `Overlay` 家族（Modal / Drawer / Menu / Popover / Tooltip） | **5** |

**关键事实 A**：1073 个源文件里只有 **89** 个消费 UI 层，其中 **只有 4 个在 `packages/` 内** —— `AudioStudio.jsx`、`ImageStudio.jsx`、`ModelParameterControls.jsx`、`prompt/PromptComposer.jsx`。

**关键事实 B（比 A 更难看，也必须写在这里）**：`node scripts/ui-source-census.mjs` 同快照统计业务代码里剩下的原生元素（排除 `ui/` 目录自身）—— `<button>` **786 处 / 140 个文件**、`<input>` 223 / 69、`<select>` **49 / 31**、`<textarea>` 27 / 23。所以"74 个文件用 Button"**不等于**按钮已统一；按元素数算，绝大多数可点击元素仍是手写的。采纳度表只能证明**通路已铺好**，不能证明**路面已铺完**。

结论：**app 侧（顶栏、账号、社区、定价、模型中心）已实质接入；studio 包内部仍是手写 class 的孤岛，`AudioStudio` 是第一个被完整迁过去的旗舰 studio。** 这就是 `UI_MIGRATION.md` §3 的 Phase 2 清单存在的原因。任何"设计系统已落地"的表述都必须带上这两句限定。刷新数字请重跑两个脚本，不要手填。



---

## 1. `cn` —— 先理解它不是什么

```js
import { cn } from "studio/ui/cn";
```

`cn` 是**纯拼接器**：它不合并、不去重、不理解 Tailwind 语义（未安装 `tailwind-merge`）。

由此产生 **NO-CONFLICT INVARIANT**（写在 `tokens.js` 顶部注释里）：

1. 一个 class 字符串里出现两个 `h-*`、两个 `bg-*`、两个 `px-*` 时，**胜者由 Tailwind 的产物顺序决定，而不是你的书写顺序**。尤其反直觉的是高度工具类按刻度逆序发射，`.h-control-xs` 排在 `.h-control-lg` **之后**，也就是"小的赢"。
2. 因此 `tokens.js` 里的 base recipe **刻意不带**高度、水平内边距、圆角、字号 —— 这些只能由 `controlClasses()` 一次性给出。
3. 推论：**每个元素只允许一个尺寸类、一个表面类**。业务代码里 `className="h-9 …"` 叠加到一个已经自带 `h-control-md` 的 recipe 上，不是"覆盖"，是掷骰子。

写业务组件时的检查动作：组合出的最终字符串里，每个属性只应出现一次。

---

## 2. `controlClasses` —— 尺寸的唯一入口

```js
controlClasses(size, { icon = false, text, pad } = {})
```

| `size` | 高度 | 图标态宽度 | 水平内边距 | 圆角 | 字号 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `xs` | 28px | `w-control-xs` | `px-2` | `rounded-sm` | `text-label` |
| `sm` | 32px | `w-control-sm` | `px-2.5` | `rounded-md` | `text-label` |
| `md`（默认） | 38px | `w-control-md` | `px-3` | `rounded-md` | `text-body` |
| `lg` | 44px | `w-control-lg` | `px-4` | `rounded-md` | `text-body` |

- `icon: true` → 丢掉水平内边距，换成 `px-0` + 与高度等宽的 `w-control-*`，得到正方形热区。
- `text` / `pad` 是**覆盖**而非追加：需要更密的字或更宽的盒就传进来，这样最终字符串仍只含一个 `text-*` / 一个 `px-*`。
- 非法 `size` 静默回落 `md`。

**禁止**在业务代码里写 `h-[38px]`。需要新尺寸 → 先在 `globals.css` 加 token、在 `CONTROL_HEIGHT` 加档，再来用。

---

## 3. Button / IconButton

```js
import { Button, IconButton } from "studio/ui/button";
```

### 3.1 `<Button>` props

| Prop | 类型 | 值 | 默认 | 说明 |
| :--- | :--- | :--- | :--- | :--- |
| `variant` | string | `primary` \| `secondary` \| `tertiary` \| `outline` \| `danger` | `secondary` | 未知值回落 `secondary` |
| `size` | string | `xs` \| `sm` \| `md` \| `lg` \| `icon` \| `icon-sm` \| `icon-md` \| `icon-lg` | `md` | `icon*` 自动进入正方形态 |
| `loading` | boolean | | `false` | 渲染 `Spinner`、`aria-busy`、`cursor-progress`，并强制 disabled；**尺寸不缩放** |
| `disabled` | boolean | | `false` | |
| `fullWidth` | boolean | | `false` | `w-full` |
| `as` | element/string | | `"button"` | 渲染成别的宿主元素 |
| `asChild` | boolean | | `false` | 用 Radix `Slot` 把 recipe 交给唯一子元素（Link / Radix trigger），避免交互节点嵌套 |
| `type` | string | | `"button"` | 仅在宿主是 `<button>` 时下发（防止误提交表单） |

`icon*` 尺寸的存在理由：历史上 12 个调用点请求了 `xs` 与 `icon-*`，而旧 cva 映射表**没有这些键**，于是它们静默拿到一个无样式控件。现在非法值显式回落，合法值齐全。

```jsx
<Button variant="primary" size="lg" loading={generating} onClick={run}>
  Generate
</Button>

<Button asChild variant="outline">
  <Link href="/pricing">查看积分</Link>
</Button>
```

`asChild` 时不注入 `Spinner`（Slot 只接受单个子元素），加载态由调用方自己画。

### 3.2 `<IconButton>`

| Prop | 说明 |
| :--- | :--- |
| `icon` | 组件引用（不是元素），内部固定渲染为 `size-4 / strokeWidth 1.8 / aria-hidden` |
| `label` | **必填**，成为 `aria-label`。缺失时开发环境 `console.warn` |
| `size` | 走高度契约，正方形热区，最小 28px |

```jsx
<IconButton icon={Settings} size="sm" label="打开设置" onClick={open} />
```

> 只有 `title` 不算可访问名（历史缺陷：composer 圆形生成按钮）。参见规范 §7.4。

### 3.3 variant 视觉契约

| variant | 表面 | 语义 |
| :--- | :--- | :--- |
| `primary` | `bg-brand` + `text-ink-on-accent` + `font-semibold` | 一个视图**只能有一个**：Generate / Create / Run / Submit |
| `secondary` | `bg-raised` → hover `bg-overlay` | 默认次级动作 |
| `tertiary` | 透明 → hover `bg-wash` | 工具栏、图标按钮 |
| `outline` | 透明 + `border-line` | 弱化的第三选择 |
| `danger` | `bg-danger-soft` + `text-danger` | 破坏性动作，唯一带 danger 焦点环的变体 |

层级由**选哪个 variant** 表达，不许用 `className` 打补丁改颜色 —— 那会绕过 `cn` 并产生两个 `bg-*`。

---

## 4. 表单控件

```js
import { Input, Textarea, Label, FieldMessage, Switch } from "studio/ui/field";
```

### 4.1 `<Input>`

| Prop | 说明 |
| :--- | :--- |
| `size` | 同高度契约；输入族水平内边距比按钮紧一档（`px-2`→`px-3.5`），因为要贴着文字 |
| `invalid` | 下 `aria-invalid`，由 `FIELD_BASE` 的 `aria-[invalid=true]:border-danger` 上色 |
| `icon` | 组件引用；绝对定位在左侧并把输入内缩进 `pl-9` |

### 4.2 `<Textarea>`

`rows` 决定大小，**没有高度契约**；但共享 `FIELD_BASE`，所以边框、颜色、焦点、错误态不可能与 `<Input>` 漂移。

### 4.3 `<Label>` / `<FieldMessage>`

- `<Label required>`：自动 `htmlFor`（无显式 id 时用 `useId`），`required` 追加 `text-danger` 星号。
- `<FieldMessage tone="muted|danger|success">`：`danger` 时带 `role="alert"`。**红框永远不能是唯一载体**，必须配文案。

```jsx
<Label htmlFor="seed" required>Seed</Label>
<Input id="seed" value={seed} onChange={setSeed} invalid={!ok} />
<FieldMessage tone={ok ? "muted" : "danger"}>{ok ? "留空则随机" : "只接受整数"}</FieldMessage>
```

### 4.4 `<Switch>`

```jsx
<Label htmlFor={id}>Instruments only</Label>
<Switch id={id} checked={!!params[key]} onCheckedChange={set} />
```

Radix `Switch.Root`：`h-6 w-11` + `p-1` + `size-4` 滑块，轨道位移 20px —— 4+16+20+4=44，落在 4px 栅格上。**命中区只有 44×24**，竖向不达标，所以只有配了 `<Label htmlFor>`（点击文字即切换）才算可用的控件；裸用必须自己补 `aria-label`。选中态是 `border-brand-line bg-brand-soft` + 滑块变 `bg-brand`，**颜色不是唯一载体**：`data-state` 同时驱动 `aria-checked`。

### 4.5 范围滑块：`className="range"`，不是 Tailwind 堆

`<input type="range">` 一旦 `appearance: none`，Chromium 就不会画滑块 —— 只靠工具类拼出来的滑块是**看不见也拖不动**的。几何全在 `globals.css` 的 `.range` 里（`--range-h` `--range-track` `--range-thumb` `--range-thumb-size`），轨道/滑块伪元素与 `:focus-visible` 光环都在其中。调用点只写 `className="range min-w-0 flex-1"`，并**必须**给 `aria-label`（值域标签不是 labelable 关联）。禁用态由 `.range:disabled` 统一降透明度。

**这条有闸门**：`ui-token-guard` 的 `range-without-utility` 逐元素检查 `type="range"` 是否带 `range` 类，漏写即 `lint:ui` 红（`UI_DESIGN_SYSTEM.md` §8）。它也是守卫里唯一一条**源码级**规则 —— "缺了一个类"在类名字符串扫描里不可见。

---

## 5. 浮层（Overlay）

```js
import { Select, SelectTrigger, SelectContent, SelectItem, Menu, MenuContent, MenuItem,
         PopoverTrigger, PopoverContent, Tooltip, Modal, ModalContent, ModalFooter,
         Drawer, DrawerContent } from "studio/ui/overlay";
```

统一由 `radix-ui`（单一包，不是散装的 `@radix-ui/react-*`）构建，键盘导航、焦点锁定、`aria` 契约由 Radix 提供，**不要重造**。

### 5.1 Select

`SelectTrigger` 走高度契约（`size`）、`bg-well`、open 时 `border-brand`。`SelectContent` 内建上下两个 `ScrollButton` —— Radix 会裁掉超出视口的列表，滚动指示属于 recipe 而不是可选项。列表层：`OVERLAY_PANEL` + `z-dropdown` + `max-h-popover` + `min-w-menu`。

`<SelectItem description>` 是给"第二行决定选择"的模型选择器用的：传 `description` 时行高从固定 `h-control-sm` 换成 `min-h-control-sm` 并放开 `truncate`。**说明文字必须是 `ItemText` 的兄弟节点**：Radix 只在"该项被选中且 trigger 没有自带 value 子节点"时把 `ItemText` 传送进 trigger（源码里的 `context.valueNodeHasChildren` 分支），把说明写进 `ItemText` 会让它出现在触发按钮里。

```jsx
<Select value={model} onValueChange={setModel}>
  <SelectTrigger aria-label="模型"><SelectValue placeholder="选择模型" /></SelectTrigger>
  <SelectContent>
    <SelectGroup>
      <SelectLabel>图像</SelectLabel>
      <SelectItem value="flux-pro">FLUX.1 Pro</SelectItem>
    </SelectGroup>
    <SelectSeparator />
    <SelectItem value="sd-35">Stable Diffusion 3.5</SelectItem>
  </SelectContent>
</Select>
```

### 5.2 Menu

`MenuContent` = `OVERLAY_PANEL` + `z-popover` + `min-w-menu`，`sideOffset` 默认 6。`MenuItem` 接受 `inset`：内缩项用 `pl-8 pr-2.5`（给勾选标记留槽），普通项 `px-2.5`。二者**互斥**，因为 `pl-*` 与 `px-*` 同串无定义胜者。

### 5.3 Tooltip

`<Tooltip content="…">{children}</Tooltip>` **自带 Provider**。理由：`Tooltip.Root` 缺 Provider 会抛错，一个依赖隐形祖先配置的 primitive 一定会被误用。

### 5.4 Modal / Drawer

`Modal` = `Dialog.Root`；`<ModalContent title description size showClose>` 内部已含 portal、`SCRIM`、标题区、关闭按钮。`size` ∈ `sm|md|lg|xl` → `max-w-sm|lg|2xl|4xl`。

- 桌面：`w-modal = calc(100vw - 32px)` 上限、`max-h-modal = calc(100vh - 64px)`，永不贴边。
- 移动（`max-md`）：**变底部抽屉**。`MODAL_PANEL_MOBILE` 必须同时释放 `translateX` 和 `translateY` —— 只改 `left-0` 会让居中变换继续生效，把抽屉推出一半屏幕。

`Drawer` + `DrawerContent side="right|left|bottom"`，正文区自带 `overflow-y-auto`。

---

## 6. 表面与状态（Surface）

```js
import { Card, CardHeader, CardMedia, Badge, StatusBadge } from "studio/ui/surface";
```

### 6.1 `<Card>`

| Prop | 值 | 说明 |
| :--- | :--- | :--- |
| `as` | 默认 `div` | 需要语义时用 `article`/`section` |
| `padding` | `none` \| `sm` \| `md` \| `lg` | recipe 内边距 |
| `interactive` | boolean | 加 cursor + hover 边框/表面 |
| `selected` | boolean | **替换**表面为 `bg-brand-soft border-brand`，并写 `data-selected` |
| `flat` | boolean | 去边框 |
| `media` | boolean | 归零内边距（图满铺） |

只有四个修饰符，不要发明第五个。`CARD_BASE` 不含背景与边框色：选中态必须同时替换两者，而一个字符串里两个 `bg-*` 没有定义胜者。

`<CardHeader title description action>` 为扁平 props（不是复合子元素）；`<CardMedia src ratio>` 用 `aspect-ratio` 内联值占位。

### 6.2 `<Badge>` / `<StatusBadge>`

`Badge tone` ∈ `neutral|brand|success|warning|danger|info|outline`，也接受**直接传入 recipe 字符串**（`StatusBadge` 就是这样把 `STATUS_TONE` 递进来的，避免两处各写一份颜色）。

`<StatusBadge status>` 覆盖生成生命周期的七个状态：`queued`（warning）、`uploading`（info）、`generating`/`processing`（brand）、`completed`（success）、`failed`（danger）、`cancelled`（neutral）。这是全站唯一的状态配色，工作室不要再自带一套。

---

## 7. 反馈（Feedback）

```js
import { Spinner, Skeleton, Progress, Alert, EmptyState, ToastHost } from "studio/ui/feedback";
```

| 组件 | 关键 props | 备注 |
| :--- | :--- | :--- |
| `Spinner` | `size` xs/sm/md/lg, `label` | `role="status"` + `aria-live` + `sr-only` 文案；默认 label `Loading` |
| `Skeleton` | | `aria-hidden`，永不承载含义 |
| `Progress` | `value` 0–100, `size`, `tone`, `label`, `showValue` | `role="progressbar"` + `aria-valuenow`；过渡只作用于 `width` |
| `Alert` | `tone` info/success/warning/danger, `icon`, `title`, `action` | `danger` → `role="alert"`，其余 `role="status"` |
| `EmptyState` | `icon`, `title`, `description`, `action`, `size` md/lg, `compact` | **必须给 `action`**。空状态是下一步，不是耸肩 |
| `ToastHost` | `position`, `duration` | 全站唯一的 `react-hot-toast` 挂载点 |

### 7.1 `<ToastHost>` 为什么必须是组件

`Toast` 的样式挂在 provider 上，不在调用点。迁移前 8 个 studio 各写一份 `<Toaster>`，每份都自带 `zIndex: 99999` 与 `background: '#18181b'` —— 同一层语义（`--z-toast`）被写死成 8 个魔法数，且 8 份配色互不相同。`ToastHost` 把 `TOAST_STYLE` 收成一个导出：全部取值来自 `var(--…)`（表面、边框、`--radius-lg`、`--elevation-4`、`--text-body-sm`、`--toast-w`），`success` / `error` 只换边框色。

**一个页面只能挂一个 `<ToastHost>`**，且必须落在 layout 层；studio 组件里再挂一份会让 toast 双份出现。业务侧只调用 `toast.error(...)` / `toast.success(...)`。`alert()` 不是 toast —— 迁移中在 `AudioStudio` 删掉的 4 处 `alert()` 属于同一类缺陷：阻塞主线程、无法本地化、无法样式化。


---

## 8. 导航（Navigation）

```js
import { Tabs, TabsList, TabsTrigger, TabsContent, SegmentedControl } from "studio/ui/navigation";
```

`Tabs` 与 `SegmentedControl` 都是 Radix Tabs：方向键遍历、漫游焦点、`aria-selected` 免费获得。区别只在外观 —— `TabsList variant="underline"`（页面级下划线轨道）与 `variant="segmented"`（面板内胶囊组）。

**variant 与 size 由列表下发**（`TabsScope` context）。只给 trigger 传 `variant`、不给 list 传，是一个静默样式 bug；现在 trigger 自动继承，只有真实覆盖才需要显式传。

横向溢出使用 `.scrollbar-rail`（PART 23 允许的例外：轨道可拖、可键盘滚动，affordance 没丢）。

`<SegmentedControl options value onValueChange ariaLabel>` 用于**不挂 tab 面板**的模式切换；`options` 接受字符串或 `{ value, label, icon, disabled }`。

---

## 9. Prompt Composer —— 产品一级组件

**路径**：`packages/studio/src/components/prompt/PromptComposer.jsx`，导出子路径 `studio/prompt`。

这是唯一有**双重视觉身份**的组件（停靠浮层 + 内联面板），所以它有自己的 recipe 组（`tokens.js` 的 `PROMPT_*`）。它不含任何自声明的视觉值，全部 import 自 `ui/tokens`。

### 9.1 结构

```jsx
<PromptComposer className={PROMPT_COMPOSER_POSITION_CLASS}>
  <PromptTextarea value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="…" />
  <PromptFooter>
    <PromptControls>
      <button className={promptControlClassName({ active: ratio !== "auto" })}>
        <PromptAspectRatioIcon />
        <span className={PROMPT_CONTROL_LABEL_CLASS}>16:9</span>
        <PromptChevronIcon />
      </button>
      <button className={promptMediaButtonClassName()} aria-label="上传参考图">
        <Upload size={14} strokeWidth={1.8} aria-hidden />
      </button>
    </PromptControls>
    <PromptAction onClick={generate} disabled={generating}>
      {generating ? <Spinner size="sm" /> : <span>生成</span>}
    </PromptAction>
  </PromptFooter>
</PromptComposer>
```

### 9.2 API

| 导出 | 类型 | 契约 |
| :--- | :--- | :--- |
| `PromptComposer` | 组件 | `positionClassName`（默认绝对停靠）+ `panelClassName`（作用于面板）。渲染 `data-prompt-composer`，视觉回归用它定位 |
| `PROMPT_COMPOSER_POSITION_CLASS` | 常量 | `absolute bottom-4 z-sticky w-full max-w-composer-mobile lg:max-w-4xl` |
| `PromptTextarea` | 组件 | 自动增高；上限走 token（移动 152px / `md`+ 256px），`maxHeightMobile`/`maxHeightDesktop` 可覆写 |
| `PromptFooter` | 组件 | `sm` 以下 `flex-col`，以上 `justify-between` |
| `PromptControls` | 组件 | **`flex-wrap`，不是滚动轨道**（见 §9.4） |
| `PromptAction` | 组件 | 主按钮：`controlClasses("lg")` + `BUTTON_VARIANTS.primary`，移动 `w-full`、`sm+` 自适应宽 |
| `promptControlClassName({active, compact, iconOnly, className})` | 函数 | 参数药丸：38px 高 + `text-label` |
| `promptMediaButtonClassName({active, className})` | 函数 | 38px **正方形**媒体槽。忘记传尺寸类也不会退化成无热区图标 |
| `PROMPT_MEDIA_PREVIEW_CLASS` | 常量 | 已上传缩略图 |
| `PROMPT_CONTROL_LABEL_CLASS` | 常量 | `truncate text-current`，文案永不撑破药丸 |
| `PromptPopover` / `PromptPopoverHeader` / `PromptMenuList` / `PromptMenuItem` | 组件 | 参数气泡与列表项；`PromptMenuItem` 是 `role="menuitemradio"` + `aria-checked`，支持 `description` 副文案 |
| `PromptSegmentedControl` / `PromptSegmentOption` | 组件 | 气泡内的 28px 分段选择 |
| `PromptChevronIcon` / `PromptAspectRatioIcon` / `PromptDurationIcon` / `PromptQualityIcon` | 组件 | **图标尺寸与描边在这里固定**（lead 14px / 行内 12px / `strokeWidth 1.8`），业务层不得再传 `strokeWidth` |

### 9.3 `fitViewport`

`<PromptPopover fitViewport>` 用 `useLayoutEffect` 沿祖先链找 `overflow: auto|scroll|hidden|clip` 的容器，把气泡夹回视口与容器内（含 16px 安全边距），必要时压缩高度。studio 外壳是 `overflow-hidden`，所以这不是锦上添花 —— 没有它，靠右/靠下的参数气泡会直接被裁掉且无滚动条可提示。

### 9.4 参数行为什么必须换行

第一版实现用 `overflow-x-auto` 横向轨道。它在手机上正是 PART 23 点名的失败：超出边缘的药丸，**看起来和用起来都像不存在**。更早的版本是裁切，而 studio 外壳 `overflow-hidden` 让 768px 下的 `Draw` 与 `Generate` 直接消失，没有任何滚动条暗示。

现在 `PROMPT_CONTROLS_ROW = flex min-w-0 flex-wrap items-center gap-2`。代价是窄屏多一行；收益是十档视口全部控件可达。**已验证的杠杆**：只改这一条 recipe，同时清掉了 Image / Video / Cinema 在 1024 / 768 / 430 / 390 / 375 上的全部 13 条布局债 —— 因为它们是同一个共享 recipe 的消费者。

不要加 `flex-1`：footer 在 `sm` 以下是 `flex-col`，增长会变成纵向，把 composer 拉变形。

### 9.5 现状

11 个文件 import composer（9 个 studio + `ModelParameterControls.jsx` + `VideoModelControls.jsx`），`<PromptControls>` 共 9 处调用点。**`AudioStudio.jsx` 不使用 composer**，1440 下也测不到可见 composer（见 `UI_AUDIT.md`）。

---

## 10. Recipe 清单（`studio/ui/tokens`）

需要组合但**不需要组件**时，直接拿 recipe。这是逃生舱，不是日常：能选 primitive 就别拼 class。

| 组 | 导出 |
| :--- | :--- |
| 控件 | `CONTROL_BASE` `CONTROL_HEIGHT` `controlClasses()` `BUTTON_VARIANTS` `BUTTON_WEIGHT` |
| 焦点 | `FOCUS_RING` `FOCUS_RING_DANGER` |
| 表单 | `FIELD_BASE` |
| 浮层 | `OVERLAY_PANEL` `MENU_ITEM` `MENU_ITEM_PAD` `MENU_ITEM_INSET` |
| 模态 | `SCRIM` `MODAL_PANEL` `MODAL_PANEL_MOBILE` `MODAL_SIZE` `SHEET_PANEL` `DIALOG_TITLE` `DIALOG_DESCRIPTION` `DIALOG_FOOTER` `DIALOG_HEADER` `DIALOG_CLOSE_BUTTON` |
| 卡片 | `CARD_BASE` `CARD_SURFACE` `CARD_INTERACTIVE` |
| 状态 | `STATUS_TONE` |
| Composer | `PROMPT_PANEL` `PROMPT_TEXTAREA` `PROMPT_FOOTER` `PROMPT_CONTROLS_ROW` `PROMPT_CONTROL_IDLE` `PROMPT_CONTROL_ACTIVE` `PROMPT_MEDIA_SQUARE` `PROMPT_MEDIA_IDLE` `PROMPT_MEDIA_ACTIVE` `PROMPT_POPOVER` `PROMPT_POPOVER_ANCHOR` `PROMPT_POPOVER_SECTION` |

Recipe 的两条硬约束：

1. **维度无关**：base recipe 不得含高度/水平内边距/圆角/字号（见 §1）。
2. **不含状态色**：base 只写 idle，hover/active/selected 由调用方拼上，否则无法组合。

---

## 11. `/design-system` 可视化画廊

`app/design-system/page.js`（768 行）是组件的活体清单，共 15 个区块：

`ds-color`（token 全色板）· `ds-contrast`（逐对实测对比度）· `ds-type`（字号阶梯）· `ds-geometry`（圆角/高度/层级）· `ds-controls` · `ds-buttons`（5 variant × 4 size × loading/disabled）· `ds-fields` · `ds-overlays`（Select/Menu/Popover/Tooltip/Modal 实挂）· `ds-selection` · `ds-status`（七个生命周期态）· `ds-composer`（真实 Prompt Composer）。

视觉回归对它在**十档视口全量截图**（其他路由只截 1440 与 390），所以这里的像素变化会直接进基线。

**规则**：改任何 primitive，必须同时改这页；否则画廊与实现分叉，画廊就变成误导源。新 primitive 若这页没有条目，视为未完成。

---

## 12. 添加/修改 primitive 的流程

1. 先确认现有 recipe 组合不出来 —— 大部分"缺组件"其实是缺 token。
2. 颜色/尺寸/层级/时长只能进 `app/globals.css` `:root`；`tailwind.config.js` 只做 `var()` 映射，**不得出现颜色字面量**。
3. 在 `packages/studio/src/ui/` 对应文件加 recipe 或组件，遵守 §10 两条约束。
4. 从 `packages/studio/package.json` 导出子路径（如新增文件）。
5. 在 `app/design-system/page.js` 挂上条目。
6. 更新本文。
7. `npm run lint:ui` + `NEXT_DIST_DIR=.agents/verify-next npm run build` + 重截受影响基线。
8. **禁止反向污染**：为了让业务页面少写点代码，就往业务组件里塞 `className` 打补丁 —— 这等于回到重构前。

---

## 13. 商业化、导航与设置组件模式（Commercial, Navigation & Settings Patterns）

深度吸收 OiiOii 与即梦的生产级商业化与设置场景，统一为 8 个标准模式：

### 13.1 营销通告横幅（`AnnouncementBar`）
```jsx
<AnnouncementBar
  variant="highlight" // "neutral" | "highlight"
  onClose={() => setVisible(false)}
>
  双节限时特惠，年付会员享 3 倍算力，<span className="font-semibold text-ink">Seedance 2.5 720p</span> 低至 0.03 积分/秒
</AnnouncementBar>
```
- **结构契约**：全宽单行，高度严格绑定 `h-announcement-h` (36px)。
- **样式 Recipe**：
  - `neutral`: `bg-surface text-ink-muted border-b border-line-subtle text-body-sm flex items-center justify-center px-4`
  - `highlight`: `bg-brand-soft text-brand border-b border-brand-line text-body-sm flex items-center justify-center px-4`
- **操作**：右侧内置 `IconButton variant="ghost" size="xs"` 关闭按钮。

### 13.2 胶囊分段控制器（`PillSegmentedControl`）
```jsx
<PillSegmentedControl
  size="md" // "sm" (32px) | "md" (36px) | "lg" (40px)
  options={[
    { label: '个人/自媒体', value: 'creator' },
    { label: '短漫剧', value: 'comic' },
    { label: 'MV', value: 'mv' },
    { label: '广告', value: 'ad' },
  ]}
  value={tab}
  onChange={setTab}
/>
```
- **结构契约**：
  - 外层 Track：`inline-flex items-center p-1 bg-well rounded-full border border-line-subtle gap-0.5`
  - 未选 Option：`px-3.5 py-1 text-label text-ink-muted rounded-full hover:text-ink hover:bg-wash transition-colors duration-fast`
  - 选中 Option：`px-3.5 py-1 text-label font-medium text-ink-inverse bg-surface-inverse rounded-full shadow-elevation-1 transition-all duration-fast`（或品牌高亮态 `text-ink-on-accent bg-brand`）

### 13.3 用户资产展示条（`AssetStatusBar`）
用于充值与个人中心弹窗头部：
```jsx
<AssetStatusBar
  user={{ name: '用户昵称', avatarUrl: '...', tier: 'FREE' }}
  balance={{ amount: 60, unit: '通用算力' }}
  upgradeLink="/pricing"
/>
```
- **结构契约**：高度 48px，`bg-surface border border-line-subtle rounded-xl px-4 flex items-center justify-between`。
- **左侧簇**：`size-7 rounded-full` 头像 + 用户昵称 + `rounded-xs px-1.5 py-0.5 text-micro bg-wash font-semibold` 身份标签 + `text-brand hover:underline` 升级入口。
- **右侧簇**：`text-body-sm text-ink-muted` + 粗体代币读数 `text-page-title font-semibold text-ink font-mono`。

### 13.4 算力充值包卡片（`PackCard`）
```jsx
<PackCard
  credits={1400}
  bonusCredits={1400} // 可选，展示首购加赠
  price={140}
  selected={selectedId === 'pack-1400'}
  badgeText="首购加赠 100%"
  modelName="GPT Image 2.5"
  memberOnly={false}
  onClick={() => setSelectedId('pack-1400')}
/>
```
- **结构契约**：
  - 底色：`bg-surface-raised border border-line rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer transition-all duration-fast`
  - 选中态：`border-brand ring-1 ring-brand-ring bg-brand-soft`
  - 悬浮态：`hover:border-line-strong hover:bg-wash`
  - 加赠徽章：绝对定位顶部居中 `px-2 py-0.5 rounded-full text-micro font-medium bg-warning-soft text-warning border border-warning-line`
  - 额度显示：原额度 `line-through text-ink-disabled text-caption` + 加赠后总额 `text-card-title font-bold text-ink`

### 13.5 一站式即时扫码支付模态（`SplitPanePaymentModal`）
吸收自即梦支付弹窗，极致消除充值漏斗二次跳转：
- **布局分栏**：
  - 模态总宽 640px，居中无内边距（由左右两栏自带内边距）；
  - 左栏（宽 380px，`p-6`）：充值档位 2×3 网格，单选交互，点击无刷新联动右栏；
  - 右栏（宽 260px，`p-6 bg-surface border-l border-line-subtle flex flex-col items-center justify-center`）：
    - 纯白二维码方块：`size-40 bg-white p-2.5 rounded-xl flex items-center justify-center shadow-elevation-2`；
    - 支付提示：`text-caption text-ink-muted mt-3 mb-2`；
    - 渠道图标栈：支付宝、微信支付小图标水平平铺（`size-4`）；
    - 协议勾选小字：`text-micro text-ink-subtle text-center leading-relaxed`。

### 13.6 四档订阅定价卡片（`PricingTierCard`）
```jsx
<PricingTierCard
  tier="APEX"
  price={1319}
  originalPrice={2394}
  discount="限时 5.5折"
  creditsPerMonth="19860 / 月"
  creditRateAnchor="1积分 ≈ ¥0.066"
  isFlagship={true} // APEX 强化态
  features={[
    { title: 'Seedance 2.5 独占模型', discount: '最低4.2折' },
    { title: '极速生成通道与专属算力池' },
  ]}
  ctaLabel="立即订阅"
  onSubscribe={() => {}}
/>
```
- **结构契约**：
  - 卡片：`w-full max-w-[280px] bg-surface-raised rounded-2xl p-6 flex flex-col justify-between border border-line`
  - APEX 旗舰态：`border-brand ring-1 ring-brand-ring shadow-elevation-brand`
  - 按钮分工：普通档采用反色实心按钮 `Button variant="secondary" className="bg-surface-inverse text-ink-inverse hover:opacity-90"`；APEX 旗舰采用 `Button variant="primary"`（青色高光按钮）。

### 13.7 设置与合规表单 Switch 复合行（`SwitchRow`）
```jsx
<SwitchRow
  id="remove-watermark"
  checked={removeWatermark}
  onCheckedChange={setRemoveWatermark}
  label="导出内容去除 AI 生成水印"
  description="打开开关并保存设置后，您使用当前账号所创作、生成的 AI 内容在导出后将不再添加显式水印。"
  subDescription="后续可以在「侧边栏 -> 设置 -> 水印设置」中随时修改此项偏好。"
/>
```
- **无障碍契约**：
  - Switch 控件（`h-6 w-11 rounded-full p-0.5 bg-subtle`，激活态 `bg-brand`）；
  - 内部圆钮：`size-5 rounded-full bg-white transition-transform`（激活态 `translate-x-5`）；
  - 强制声明 `role="switch" aria-checked={checked}`，关联 `htmlFor="remove-watermark"`。

### 13.8 4 级语义微标签（`MicroBadge`）
```jsx
<MicroBadge variant="discount">限时 6.7折</MicroBadge>
<MicroBadge variant="bonus">首购加赠 100%</MicroBadge>
<MicroBadge variant="privilege">最低4.2折</MicroBadge>
<MicroBadge variant="membership">仅限会员</MicroBadge>
```
- **尺寸与间距硬规则**：
  - `discount`: `inline-flex items-center px-2 py-0.5 rounded-full text-micro font-medium bg-wash-strong text-ink`
  - `bonus`: `inline-flex items-center px-2 py-0.5 rounded-full text-micro font-medium bg-warning-soft text-warning border border-warning-line`
  - `privilege`: `inline-flex items-center px-1.5 py-0.5 rounded-xs text-micro text-ink-muted bg-surface border border-line-subtle`
  - `membership`: `inline-flex items-center text-caption text-ink-subtle select-none`
