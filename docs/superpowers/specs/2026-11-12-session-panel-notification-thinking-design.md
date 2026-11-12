# 会话总览、提示通知与思考显示改造设计与解决方案

> 文档性质：根因分析、解决方案与验收依据
> 编制日期：2026-11-12
> 适用仓库：`dsh-claude-style-lite`（DSH / CodeBuddy 主题插件）
> 依据：仓库当前源码、DSH `0.2.2-rc.1` 兼容基线、截图 `6cc00636…`（934×149）
> 状态：方案与修改计划已完成，尚未修改源码

---

## 0. 结论摘要

四项请求共享同一类问题：偏好键既承担「功能是否存在」，又承担「功能默认怎么工作」，而部分行为又被宿主自己的实现固定在旧形态。要得到请求中的结果，必须把安装与否、默认行为与读者选择拆成三层。

| 编号 | 请求 | 根因 | 结论 |
| --- | --- | --- | --- |
| R1 | 「会话总览面板」改为「默认打开会话总览面板」，入口常驻顶部，开关只决定每个会话是否默认打开 | `sessionPanel` 同时是功能开关和交互状态：关掉即拆除入口、栏和轮询；`useRailReading()` 的 `choice.mode` 只有 `auto/open/closed`，且以窗口阈值和宿主右栏为前置条件 | 把入口从偏好开关中解耦，功能改为 `ungated` 常驻安装；新增单独的默认打开偏好；栏的每次会话初始状态读取该偏好，读者的手动开合只覆盖当前会话 |
| R2 | 「提示音效」下方新增「提示通知窗口」，默认打开；任务完成或受阻时发送系统通知 | 现有 `soundCues` 只消费 `permission/finished` 两类注意力事件，并仅调用宿主声音路由；仓库没有任何 `window.Notification` 调用、权限申请或通知点击路由；DSH 的 `pendingInteraction` 实际有 `approval / plan-review / question` 三型，现有代码只把它归并为一个 `permission` 布尔 | 新增独立通知功能，共用同一份注意力读取；偏好默认 `true`；事件拆成完成、受阻两类，受阻保留宿主三型细分；用 `Notification` API，权限在第一次真实通知时申请，拒绝后静默降级并保留开关；点击通知回到对应会话 |
| R3 | 思考过程刚开始不能及时显示，只看到「思考」两个字（图一） | 宿主 `ReasoningRow` 的展开状态是组件内 `useState(false)`；皮肤在行进入运行阶段时替读者按开标题，行因此不再保持宿主默认的折叠；页面下方「正在思考 1 秒」来自等待行，不是思考正文。另有 `data-expanded` 契约实际由旧皮肤写入/读取，宿主当前源码只写 `aria-expanded` 与 `data-open` | 删掉这段代按逻辑，思考行保持宿主自身的折叠形态，读者按标题自行开合；开合状态的读取改用宿主稳定的 `aria-expanded` |
| R4 | 删除「思考内容显示」及其逻辑，默认逐字跟随 | `reasoningDisplay` 是 `PREFS` 中的正式选择，默认 `stepped`；`chat-fold` 设置行、`reasoning-stream.ts` 的窗口/步进时钟、`fold-motion.css`、surface 表、行为测试、E2E 场景与生成记录全部围绕它 | 删除偏好键、设置行、文案、窗口逻辑、样式、surface 条目与测试；保留宿主的原始流式文本显示；同步删除安装文档中的迁移键与上游差异说明中的窗口保留表述 |

---

## 1. 已核实事实

### 1.1 会话总览

| 事实 | 证据 |
| --- | --- |
| 功能清单以 `sessionPanel` 为 `pref`，关掉时整个功能不安装 | `packages/client/src/features/session-panel/session-panel.manifest.ts` |
| 偏好默认是 `true`，但这是「功能安装」默认，不是「每个会话默认打开」 | `packages/contracts/src/prefs.ts` |
| 入口注册在 `conversation.session.header.utilities`，由功能安装时注册；功能卸载时 `fiber.dispose()` 一并移除 | `session-panel.ts` |
| 栏的开合状态只有 `auto / open / closed`，`auto` 依赖 `OPEN_WINDOW / OPEN_COLUMN / CLOSE_WINDOW / CLOSE_COLUMN`，并且宿主右栏有宽度时强制关闭 | `session-panel-rail.ts` |
| 读者的手动收起只对当前会话生效，换会话回到 `auto` | `session-panel-rail.ts` 的 `choice.current.session` 逻辑 |
| `SESSION_PANEL_ATTR` 只在栏实际展开并挂载时写到 `body`，`view-tabs` 与挤压对话宽度的样式依赖它 | `session-panel-rail.ts`、`session-panel.css`、`view-tabs.ts` |
| 入口按钮已经有 `aria-pressed`，但只在功能安装后才存在 | `session-panel-button.ts` |

### 1.2 提示音与通知

| 事实 | 证据 |
| --- | --- |
| 现有提醒只读 `uiSession.sessionStatus` 与 `sessions.list` | `sound-cues/attention-feed.ts` |
| 事件只有 `permission` 与 `finished`，其中 `permission` 是所有 `pendingInteraction !== undefined` 的合并 | `sound-cues/attention.ts` |
| 声音由宿主 `/dsh-claude-style-lite/sound` 播放，浏览器没有声音时的合成声只覆盖声音，不覆盖通知 | `packages/host/src/sound.ts`、`sound-cues/player.ts` |
| DSH `0.2.2-rc.1` 的 `PendingInteractionStatus` 是 `'approval' \| 'plan-review' \| 'question'` | 本机 DSH 运行时 `dsh-client-runtime` 的 `sessions/pending.ts`（只作宿主契约核对，不属于本仓库依赖） |
| 宿主列表已带 `pendingInteraction`、`completed`，状态快照已带 `running`、`pendingInteraction`、`completionUnread` | `packages/contracts/src/services.ts`、宿主运行时 `sessions/service.ts` |
| 仓库没有任何 `new Notification(...)`、`Notification.requestPermission()` 或通知点击处理 | 全仓检索无结果 |
| `soundCues` 关闭时功能不安装，不订阅状态，也不播放 | `sound-cues.manifest.ts` 的 `prefValues` 与 `entry.ts` 的 `isWanted` |
| `t.prefs()`/`window.__pushForm()` 在替身页可即时改偏好，可用于通知行为测试 | `packages/testing/behaviour.mjs` |

### 1.3 思考过程

| 事实 | 证据 |
| --- | --- |
| 宿主 `ReasoningRow` 初始 `expanded = false`；展开由该组件自己的 `useState` 控制 | DSH 运行时 `ReasoningRow.tsx` |
| 折叠摘要 `summary = running ? latestLine(text) : firstLine(text)`；运行中只显示最后一行 | 同上 |
| 摘要水平跟随经 `useThrottledVisualUpdate`，默认间隔 3 帧；首段没有换行时摘要可能只有空串 | 同上、`use-throttled-visual-update.ts` |
| 宿主 DisclosureRow 写 `data-open`、`data-disclosure-row`、`data-expandable`、`aria-expanded`；当前源码不写 `data-expanded` | DSH 运行时 `DisclosureRow.tsx` |
| Lite 的 `reasoning-stream.ts` 与 `chat-follow.ts` 仍读 `data-expanded`，该标记在宿主当前渲染中不存在 | 本仓库两处读取；宿主源码无写入 |
| 上一版移除的 `reasoning-fold.ts` 用真实 `control.click()` 自动开合，并带有读者阶段记忆、输入法保护、底部跟随和高度读数 | Git 提交 `99d317cb` 中的被删文件 |
| 等待行 `正在思考 1 秒` 由 `chat-wait` 绘制，依附在宿主的运行行，不代表思考正文是否已渲染 | `chat-wait.ts`、截图下半部分 |

### 1.4 思考显示偏好

| 事实 | 证据 |
| --- | --- |
| `reasoningDisplay` 的取值是 `continuous / stepped`，默认 `stepped` | `packages/contracts/src/prefs.ts` |
| 设置行排在「动效」页末尾 | `chat-fold.manifest.ts` |
| 文案有四个键：标题、说明、逐字跟随、两行步进 | `chat-fold.copy.json` |
| `reasoning-stream.ts` 只为 `stepped` 创建窗口、遮罩和步进时钟；连续模式本来就不创建窗口 | `reasoning-stream.ts` 的两处 `readPrefs().reasoningDisplay === REASONING_DISPLAY_STEPPED` |
| 窗口标记与样式集中在 `fold-motion.css`，窗口状态机在 `reasoning-stream.ts`，测试散布在 surface、行为、E2E、preferences、安装文档与上游差异文档 | 全仓 `reasoningDisplay` / `reason-window` / `reason-capped` 检索 |

---

## 2. 目标行为

### 2.1 R1 会话总览

1. 页面上只要存在一段真实会话（有 session id 且对话区可见），会话头部就有「会话详情」入口。
2. 设置页的标题改为「默认打开会话总览面板」，默认打开。
3. 开关打开时：
   - 进入一个尚未被读者改过开合状态的会话，栏自动展开。
   - 新会话在没有回合时仍不展开；出现第一轮对话后展开。
4. 开关关闭时：
   - 入口仍在头部。
   - 进入会话时栏默认收起，读者可以手动打开。
5. 读者在某个会话里手动收起或打开后：
   - 本次运行内的同一个会话保持该选择。
   - 切到另一个会话时重新按开关的默认值决定。
6. 宿主右栏占用右侧时：
   - 栏不自动展开。
   - 读者手动打开时仍先收起宿主右栏，再打开自己的栏。
7. 窄窗口下，栏不再因为 `OPEN_WINDOW / CLOSE_WINDOW` 自动决定是否出现；只在宿主右栏冲突时退让。栏展开时保持 320px 宽的固定列，并继续挤压对话列。
8. 开关关闭不等于卸载功能：轮询只在栏实际展开时发生，收起时停止取数；这一点保持现状。

### 2.2 R2 提示通知窗口

1. 设置页「常规」页在「提示音效」下方新增开关「提示通知窗口」，默认打开。
2. 开关打开时，以下时刻发系统通知：
   - 顶层会话从「运行」变为「不运行」：任务完成。
   - 会话从「没有待处理交互」变为 `pendingInteraction` 存在：任务受阻，等待审批、计划审阅或回答。
3. 受阻通知按宿主 `pendingInteraction` 的三型分文案：
   - `approval`：等待审批
   - `plan-review`：等待计划审阅
   - `question`：等待回答
4. 同一个会话的同一次受阻只通知一次；受阻状态持续期间不重复。
5. 子智能体结束不通知「任务完成」；子智能体等待读者时照常通知受阻。
6. 页面打开时的第一次读数是基线，已经在等或已经在跑的状态不补通知。
7. 阅读器所在页面处于前台且当前会话就是发生事件的那个会话时：
   - 仍发通知，但系统通知平台通常会自行抑制；代码不额外判断焦点。
   - 声音与通知互不替代；声音按自己的开关决定。
8. 通知点击：
   - 有 `uiWorkspace.openSession(id)` 时打开对应会话。
   - 宿主没有这个服务时不绑定点击，通知仍显示。
9. 通知权限：
   - 第一次需要发通知时申请 `Notification.requestPermission()`。
   - 权限是 `denied` 时不反复申请、不抛错、不弹第二条提示；设置页的开关保持读者所选值。
   - 浏览器没有 `Notification` API 时不创建通知器，不报错。
10. 设置开关关闭时：
    - 不创建通知器，不申请权限，不订阅额外状态。
    - 声音提示仍按「提示音效」的档位工作。

### 2.3 R3 思考行保持宿主的折叠

1. 思考行以宿主默认的折叠状态出现，皮肤不按它的标题。
2. 读者自己按标题展开或收起，状态由宿主保存，皮肤不改写。
3. 推理结束、进入下一阶段或下一回合，行都不代开代收。
4. 皮肤对思考行标题的点击次数为 0。
5. 开合状态的读取使用宿主稳定的 `aria-expanded`，不再依赖不存在的 `data-expanded`。
6. 思考正文按宿主的流式节奏写入，没有皮肤自己的摘要行或窗口。

### 2.4 R4 删除思考内容显示

1. 设置页不再有「思考内容显示」。
2. 思考文字始终按宿主流式到达直接显示，不创建两行窗口、不遮罩、不位移、不按两行步进。
3. 删除偏好键后：
   - 旧设置文件中的 `reasoningDisplay` 被忽略。
   - 不因为未知键导致读取失败。
4. 删除窗口后：
   - `chat-fold` 不再需要 `REASONING_TEXT_SELECTOR` 与 `reasoning-stream` 模块。
   - `fold-motion.css` 不再有思考窗口段落。
   - `process-column` 与 `chat-follow` 的展开判断改为读 `aria-expanded`；`view-tabs` 不读展开标记。
   - 长思考的跟随滚动仍由现有 `chat-follow` 与流式文本处理承担。

---

## 3. 方案设计

### 3.1 R1 会话总览：把「功能」与「默认打开」拆开

#### 3.1.1 清单与偏好

- `session-panel.manifest.ts`
  - 把 `pref: 'sessionPanel'` 改为：
    - `ungated: '会话详情入口常驻在会话头部；开关只决定每个会话是否默认展开，栏本身与数据读取随入口安装'`
  - 保留 `settingsRows`，把该行的 `pref` 改为 `sessionPanelOpenByDefault`，标题与说明改用新文案键；功能本身由运行时读取该偏好决定初始开合，不再由它决定安装与否。
- `packages/contracts/src/prefs.ts`
  - 删除 `sessionPanel` 键。
  - 新增 `sessionPanelOpenByDefault: { type: 'boolean', default: true }`。
- 文案放在 `session-panel.copy.json`：
  - `sessionPanelOpenByDefaultTitle`
  - `sessionPanelOpenByDefaultDesc`
- 设置页文案：
  - 标题：默认打开会话总览面板
  - 说明：开启后，每个会话默认展开右侧的会话详情栏；关闭后入口仍在，读者可按需打开。
  - 英文：Open the session overview panel by default / With this on, each session opens the details rail; with it off the header control stays and opens it on demand.

> 选择 `ungated` 而不是给 `sessionPanel` 加 `prefValues`：`prefValues` 只能决定「装不装」，无法表达「装了但默认收起」；而请求要求入口在两种设置下都存在。设置行仍登记在这个常驻功能上，因为那一行描述的就是这个栏自己的初始状态（D76）。

#### 3.1.2 栏的开合模型

把 `useRailReading(session)` 的 `choice` 从：

```ts
{ session: string | null, mode: 'auto' | 'open' | 'closed' }
```

改为：

```ts
{ session: string | null, mode: 'default' | 'open' | 'closed' }
```

- `mode === 'default'`：
  - `desired = readPrefs().sessionPanelOpenByDefault && !hostColumn.current`
  - 没有真实会话（`session === null`）时不展开。
  - 不做窗口宽度与对话列宽度判断。
- `mode === 'open'`：`desired = !hostColumn.current`
- `mode === 'closed'`：`desired = false`
- `measure()` 每次重新读取偏好：
  - 用 `subscribePrefs()` 在栏组件内订阅偏好变化，偏好改变时重新执行 `setOpen`。
  - 不依赖 `readPrefs()` 的模块级快照被 React 重新渲染捕获。
- 读者点击入口：
  - 当前展开：`mode = 'closed'`，收起。
  - 当前收起：若宿主右栏有宽度，先按现状点击 `findRightbarToggle()`；`mode = 'open'`。
- 切换会话：
  - `choice.current.session !== session` 时重置为 `mode: 'default'`。
- 保留「宿主右栏优先」：只要 `hostColumn.current` 为真，自动与手动都不展开；右栏关闭后回到读者的 `mode`。

> 结论：`OPEN_WINDOW / OPEN_COLUMN / CLOSE_WINDOW / CLOSE_COLUMN` 和两个尺寸观察器里只为自动开合服务的部分删除；`center` 的尺寸观察仍用于 `box` 定位。

#### 3.1.3 入口常驻

入口已经由功能安装时注册到头部 utilities。功能改为 `ungated` 后：

- 入口在功能常驻安装的每个页面上都安装。
- 新会话页面（hero）也显示入口，按下时：
  - 没有 session id：按钮可显示但禁用，`aria-disabled="true"`，标题说明「开始会话后可用」。
  - 有 session id 且栏未挂载：正常打开。
- `SessionPanelButton` 不直接调用 rail 的 hook；新增 `session-panel-state.ts` 中的 `sessionAvailable` 状态：
  - rail 的 `useConversationSession()` 在读到 id/live 时调用 `setSessionAvailable(Boolean(id && live))`。
  - 按钮 `useSyncExternalStore` 读取该值；teardown 时重置。
- 头部按钮的 `aria-pressed` 继续表示栏是否展开。
- 不新增第二个入口，不把入口移到侧栏或 guide 卡片。

#### 3.1.4 样式与标记

- `SESSION_PANEL_ATTR` 继续只在栏实际展开时写入。
- `view-tabs` 对 `SESSION_PANEL_ATTR` 的读取保持不变。
- 删除与窗口阈值相关的规则不需要改动 CSS；CSS 只负责展开后的挤压与定位。
- 窄窗口下入口仍可见；栏展开时如果窗口太小导致对话不可用，读者可手动收起。方案不新增自动退避，因为请求把「默认打开」交给开关。

#### 3.1.5 测试调整

- `session-panel.mjs` 场景：
  - 宽窗口下默认打开：保留。
  - 窄窗口下不再自动收起：改为断言入口仍在、栏仍展开（除非宿主右栏占用）。
  - 关闭开关后再进入会话：入口存在、栏收起；按入口可打开。
- 设置页 smoke：
  - `sessionPanel` 从主窗口行列表移除。
  - 新增 `sessionPanelOpenByDefault` 行，位置在会话页 `rank: 85`。
- 行为级新增 spec：
  - `packages/testing/specs/behaviour/session-panel/default-open.spec.mjs`
  - 覆盖：入口常驻、开关默认打开、关掉后入口仍在、读者手动收起后本次会话不再自动打开、换会话恢复默认。

### 3.2 R2 提示通知窗口：与声音共用一次状态读取

#### 3.2.1 偏好与设置行

- `packages/contracts/src/prefs.ts` 新增：
  ```ts
  notifications: { type: 'boolean', default: true }
  ```
  命名用 `notifications` 而不是 `notificationWindow`，因为它是通知总开关，窗口是系统的呈现方式。
- 新建 `features/notifications/` 功能，由 `notifications` 偏好单独安装：
  ```ts
  {
    tab: 'general',
    rank: 61,
    pref: 'notifications',
    title: 'notificationsTitle',
    desc: 'notificationsDesc',
    status: 'notification-permission',
  }
  ```
  这一行排在 `soundCues` 后一位，视觉上在「提示音效」下方。
- `notifications.copy.json` 新增：
  - `notificationsTitle`: 提示通知窗口 / Notification window
  - `notificationsDesc`: 任务完成或等待你处理时，用系统通知提醒 / Show a system notification when a task finishes or waits on you
  - `notificationFinished`: 任务完成 / Task finished
  - `notificationApproval`: 等待审批 / Waiting for approval
  - `notificationPlanReview`: 等待计划审阅 / Waiting for plan review
  - `notificationQuestion`: 等待回答 / Waiting for an answer
- 声音功能的 `soundCues` 与 `prefValues` 保持原样。通知不能挂在 `soundCues` 上，否则「提示音效：关闭」会连带关掉通知；两者各自安装，共用 `packages/client/src/shared/attention.ts` 与 `shared/attention-feed.ts`。

#### 3.2.2 新功能目录 `features/notifications/`

```text
features/notifications/
  notifications.manifest.ts
  notifications.ts
  notifications.copy.json
  notifier.ts
  attention.ts        （从 sound-cues 移出并扩展）
  attention-feed.ts   （从 sound-cues 移出并复用）
```

- `attention.ts`：
  - `PendingKind = 'approval' | 'plan-review' | 'question'`
  - `AttentionReading` 增加 `pendingKind: PendingKind | null`
  - `AttentionEvent` 改为：
    ```ts
    type AttentionEvent =
      | { kind: 'blocked', sessionId: string, pending: PendingKind }
      | { kind: 'finished', sessionId: string }
    ```
  - `pending` 的读取：
    ```ts
    const raw = live?.pendingInteraction
    const pendingKind = raw === 'approval' || raw === 'plan-review' || raw === 'question'
      ? raw
      : raw === undefined ? null : 'approval'
    ```
    最后一个分支用于兼容旧宿主把 `pendingInteraction` 传成对象的情况；当前运行时的值是字符串。
  - 事件生成规则保持：
    - 第一次读数只建立基线。
    - `pendingKind` 从 `null` 变为非空：`blocked`。
    - 顶层会话 `running` 从真变假：`finished`。
    - 同一个 `pendingKind` 持续不变：不重复。
    - `pendingKind` 从一种变为另一种：新的 `blocked`。
- `attention-feed.ts`：
  - 保持现有 `ctx.inject(['uiSession', 'sessions'])`。
  - 回调 `onEvent(event, sessionTitle)`；标题从 `sessions.list` 的 `byId[id].displayTitle` 读取，缺省时用 `id`。
- `notifier.ts`：
  - 构造时检查 `'Notification' in window` 与 `Notification.permission`。
  - 第一次 `notify(options)`：
    - `permission === 'default'` 时调用 `Notification.requestPermission()`。
    - 结果为 `granted`：创建通知。
    - 结果为 `denied`：记录一次，不重复申请，不抛错。
  - `notify` 的参数：
    ```ts
    { title: string, body: string, tag: string, sessionId: string, onClick(): void }
    ```
  - 用 `tag: 'dsh-claude-style:<sessionId>:<kind>'` 合并同一会话同类的多条通知。
  - `new Notification(title, { body, tag, icon?: undefined, silent: true })`：
    - `silent: true`：通知不额外播放系统提示音，声音由「提示音效」单独决定。
    - 不设置 `icon`，避免额外路由与隐私扫描。
  - `notification.onclick`：
    - `window.focus()`，然后 `onClick()`。
    - `notification.close()`。
  - 返回 `dispose()`：关闭本代仍打开的通知。
- `notifications.ts`：
  - 功能只由 `notifications` 偏好安装：关闭时整个功能拆除，不创建通知器与 feed。
  - 安装时创建 `notifier` 与 `attention-feed`，不为第二个偏好另开订阅。
  - 事件到通知的映射：
    - `finished` → `notificationFinished`，body 为会话标题。
    - `blocked` + `approval` → `notificationApproval`
    - `blocked` + `plan-review` → `notificationPlanReview`
    - `blocked` + `question` → `notificationQuestion`
  - 标题/正文：
    - title：`notification...` 文案
    - body：会话标题。标题为空时用 `id`。
  - 点击：
    ```ts
    const workspace = hostUiWorkspace(ctx)
    if (typeof workspace?.openSession === 'function') workspace.openSession(sessionId)
    ```
- `notifications.manifest.ts`：
  - `id: 'notifications'`, `order: 51`, `pref: 'notifications'`, `stylesheets: []`
  - `settingsRows: [{
      tab: 'general',
      rank: 61,
      pref: 'notifications',
      title: 'notificationsTitle',
      desc: 'notificationsDesc',
      status: 'notification-permission',
    }]`
  - `notifications.settings.ts` 导出 `notification-permission` 控件：
    - 权限 `default`：显示「浏览器尚未允许通知」与一个按钮，按钮按下去调用 `Notification.requestPermission()`。
    - 权限 `granted`：不显示额外行。
    - 权限 `denied`：显示「浏览器已拒绝通知，请在站点设置里开启」。
    - 页面没有 `Notification`：显示「当前页面不能显示系统通知」。
    - 控件只读，不写偏好；它不改变开关的值。
  - `cases: ['settings']`
  - `scenarios: []`
- `sound-cues` 改造：
  - 删除 `attention.ts` 与 `attention-feed.ts` 的本地副本；两个功能都从 `packages/client/src/shared/attention.ts` 与 `shared/attention-feed.ts` 导入读取器，避免跨功能目录互相依赖。
  - `sound-cues.ts` 的 `queue` 改为消费新的事件形状：
    - `blocked` → 权限音
    - `finished` → 完成音
    - 200ms 合并窗口保留；同窗口内 `blocked` 优先。
  - `sound-cues.manifest.ts` 不新增行，避免一个设置行被两个功能登记。
- `pure.ts` 的导出改为从 `shared/attention` 导出，测试同步改导入路径。

> 选择「新功能」而不是在 `sound-cues` 内加开关：D76 要求每个功能二选一地声明安装开关；一个功能只能有一个 `pref`。两个开关若不拆功能，只能靠 `install()` 内手写第二个偏好的订阅，而关闭时无法让整个功能不安装。拆开后两个开关语义独立，声音关闭不影响通知。

#### 3.2.3 系统通知的平台差异

- Windows / macOS 桌面壳使用 Electron 的页面 `Notification` 能力，呈现为系统通知中心气泡。
- 普通浏览器页面：
  - `Notification.permission === 'default'` 时，`requestPermission()` 必须由用户手势触发才可靠。第一次通知是状态变化，不是点击，可能被浏览器拒绝。
  - 设置页「提示通知窗口」开关旁，当权限是 `default` 时显示一行状态与一个「允许通知」按钮；按下按钮时调用 `Notification.requestPermission()`。这行由 `notifications` 功能自己的 `settings` 模块作为 `status` 控件提供。
  - 如果用户从未按过「允许通知」，第一次真实通知仍尝试申请；失败时静默降级。
- `Notification` 在非安全上下文（`file:`、部分 http 远程页）不可用：
  - 不创建通知器。
  - 设置行说明「当前页面无法显示系统通知」。
- 代码不依赖宿主私有通知服务。

#### 3.2.4 受阻状态的完整清单

DSH 的受阻状态就是 `pendingInteraction` 的三型：

| 宿主值 | 含义 | 通知文案 |
| --- | --- | --- |
| `approval` | 工具请求越权执行，等待允许/拒绝 | 等待审批 |
| `plan-review` | 计划审阅卡片等待批准 | 等待计划审阅 |
| `question` | 提问卡片等待回答 | 等待回答 |

此外：
- `completionUnread`：完成未读提醒。它由宿主在「非当前会话」结束时置位；通知不需要它，因为 `running` 真→假已经覆盖。若以后宿主只在 `completionUnread` 上暴露完成，可在 `attentionReading` 中补 `completed`，但当前版本不新增。
- 任务失败、停止：当前状态快照没有「结束原因」字段；`running` 真→假仍会发「任务完成」。若要区分失败/停止，需要读会话事件流的 `turn/end` 原因。本方案不引入第二条事件订阅，保持与声音提示相同的粒度。

#### 3.2.5 测试

- 逻辑测试 `packages/testing/specs/logic/notifications/attention.spec.ts`：
  - 三种 `pendingInteraction` 各自产生对应 `blocked.pending`。
  - 持续同一状态不重复。
  - 从 `approval` 变 `plan-review` 产生新事件。
  - 顶层会话结束产生 `finished`；子代理结束不产生。
  - 第一次读数是基线。
- 行为测试 `packages/testing/specs/behaviour/notifications/window.spec.mjs`：
  - 宿主 stand-in 暴露 `Notification` 桩，记录构造参数与 `onclick`。
  - 默认开关打开：完成与三种受阻各一条。
  - 关闭开关：不构造通知、不订阅状态。
  - 同一受阻持续：只有一条。
  - 点击通知调用 `uiWorkspace.openSession(id)`。
  - 权限 `denied`：不重复申请、不抛错。
- 设置 smoke：
  - 常规页行列表在 `soundCues` 后新增 `notifications`。
- 声音测试：
  - 现有 `sound-cues` 测试仍通过；事件形状改变后，断言声音仍按 `blocked/finished` 播放。

### 3.3 R3 思考行保持宿主的折叠

#### 3.3.1 删掉代按标题的模块

`features/chat-fold/reasoning-open.ts` 是皮肤唯一主动点击思考行标题的地方：它订阅思考行的插入与阶段变化，在行进入 `running` 时找到行内的 `aria-expanded` 控件并按一次，再按阶段记住读者的手动开合。整段行为与请求相反，因此删除该文件，连同 `chat-fold.ts` 里的 `createReasoningOpen()` 与它的 `stop()` 调用。

删除后剩下的是宿主自己的行为：`ReasoningRow` 以自己的 `useState(false)` 决定开合，读者按标题时宿主自己改状态；皮肤只读这个状态来排版。

#### 3.3.2 标记读取统一

把以下位置的 `data-expanded` 读取改为 `aria-expanded`：

- `reasoning-stream.ts`：本方案删除整个模块，不再处理。
- `chat-follow.ts` 的 `stuckThinkHeaders()`：
  - 展开判定改为读行上的 `aria-expanded` 或行内披露控件的 `aria-expanded`。
- `process-column.css` 的 `[data-variant="think"]:not([data-expanded])`：
  - 由 `process-column.ts` 按 `aria-expanded` 投影 `data-dsh-claude-think-open`，避免 `:has()` 在旧 WebView 的成本。
  - `process-column.css` 的选择器改为 `[data-variant="think"]:not([data-dsh-claude-think-open])`。
- `contracts/src/dom.ts` 的 `EXPANDED_ATTRIBUTE`：
  - 删除该常量与 `fold.expanded` 契约条目，避免继续把不存在的宿主标记当作契约。
- `contracts/src/table.ts` 的 `chat.think-row` 说明改为「皮肤只读它的状态，从不代按」。
- 行为 spec `manual-fold.spec.mjs` 与 `choice.spec.mjs`：
  - 改为在 fixture 中写 `aria-expanded`，与宿主一致。
  - `manual-fold` 的标题改为「运行中的思考行从不被代按，状态由读者与宿主决定」。

#### 3.3.3 折叠状态下的显示

宿主收起时不渲染正文，标题行只显示它自己的标题与折叠摘要；摘要何时有字、写到哪一行为止都由宿主决定，皮肤不补字、不挪位置。读者展开后才出现正文，正文按宿主流式写入。

因此：

- 皮肤不写摘要文字，也不为摘要建立额外的观察或写入。
- 皮肤不在 `data-state` 变化时点击控件。
- 等待行已经承担「正在思考」这层信息，标题旁不再加皮肤自己的说法。

#### 3.3.4 测试

- 更新 `packages/testing/specs/behaviour/reasoning-display/manual-fold.spec.mjs`：
  - 构造一个运行中的折叠思考行。
  - 断言插入后 `aria-expanded` 仍是 `false`，且控件没有被皮肤按过。
  - 读者自己按开，断言皮肤不改写这个状态；阶段变为 `ok` 后状态保留。
- 删除 `packages/testing/specs/behaviour/reasoning-display/first-frame.spec.mjs`：它断言的正是被删除的代按行为。
- `chat-fold` smoke 的 `fold.thinkOpen` 断言保持 `false`，`clicks.think` 保持 `0`，阶段结束后同样如此。
- 保留 `reasoningContinuous` E2E 场景，作为长思考逐字跟随、跟随滚动与无窗口的回归；删除 `reasoningStream` 场景（见 R4）。

### 3.4 R4 删除思考内容显示

#### 3.4.1 偏好与设置

- `packages/contracts/src/prefs.ts`
  - 删除 `REASONING_DISPLAY_CONTINUOUS`、`REASONING_DISPLAY_STEPPED`、`REASONING_DISPLAYS`。
  - 删除 `reasoningDisplay` 键。
- `packages/client/src/features/chat-fold/chat-fold.manifest.ts`
  - 删除 `settingsRows`。
  - 从 `contracts` 删除 `chat.reasoning-text`。
- `packages/client/src/features/chat-fold/chat-fold.copy.json`
  - 删除 `reasoningDisplayTitle`、`reasoningDisplayDesc`、`reasoningDisplayContinuous`、`reasoningDisplayStepped`。
- `docs/INSTALL.md`
  - 从「仍然保留、可手动迁移的键」删除 `reasoningDisplay`。
  - 在「删除的设置键不迁移」加入 `reasoningDisplay`。

#### 3.4.2 删除窗口模块与样式

- 删除 `packages/client/src/features/chat-fold/reasoning-stream.ts`。
- `chat-fold.ts`
  - 删除 `createReasoningStream` 导入、`stream` 常量、`stream.sync()` 调用、`stream.stop()`。
- `fold-motion.css`
  - 删除 `[data-dsh-claude-reason-window]`、`[data-dsh-claude-reason-text]`、`[data-dsh-claude-reason-capped]`、`--dsh-claude-reason-*` 全部规则。
  - 保留 disclosure 入场、门滚动与 reduced motion 规则。
- `packages/testing/data/surface.json`
  - 删除 `chat.reason-window` 与 `chat.reason-capped`。
- `packages/testing/data/element-collections.json`
  - 重新生成；`reasoning-stream.ts` 条目消失。
- `packages/testing/data/importance-ledger.json`
  - 运行 importance 场景后重新生成；窗口相关规则消失。
- `packages/testing/scenarios/importance-audit.mjs`
  - 从 `TRANSIENT_SELECTORS` 删除 `[data-dsh-claude-reason-window]`。

#### 3.4.3 测试与场景

- 删除 `packages/testing/specs/behaviour/reasoning-display/choice.spec.mjs`。
- 保留并重写 `manual-fold.spec.mjs` 为「从不代按，状态由读者与宿主决定」。
- 删除 `packages/testing/scenarios/reasoning-stream.mjs` 中的 `reasoningStreamScenario`，保留 `reasoningContinuousScenario`。
- `packages/testing/scenarios.mjs`
  - 删除 `reasoningStream` 注册；保留 `reasoningContinuous`。
- `packages/contracts/src/timing.ts`
  - 从 `E2E_SCENARIOS` 删除 `reasoningStream`；保留 `reasoningContinuous`。
- `packages/testing/data/check-numbers.json`
  - 运行 `npm run checks:numbers` 重新生成。
- `packages/testing/mock-llm.mjs`
  - `think` 脚本保留，供 `reasoningContinuous` 使用。
- `packages/testing/smoke/probe/chat-fold.js`
  - 删除窗口相关读数与 `window.__pushForm({ reasoningDisplay: 'stepped' })`。
  - 把 `data-expanded` 的读数改为 `aria-expanded`。
- `packages/testing/smoke/cases/chat.mjs`
  - 删除窗口断言；保留「思考行从未被代按、读者开合保持」的断言。
- `packages/testing/smoke/cases/settings.mjs`
  - 从 `motion` 行列表删除 `reasoningDisplay`。
- `packages/testing/specs/logic/preferences/stored-values.spec.ts`
  - 删除 `reasoningDisplay` 的存储断言；改为断言未知键被忽略。
- `packages/testing/specs/behaviour/chat-follow/stuck-thinking-header.spec.mjs`
  - 删除 `reasoningDisplay: 'continuous'` 传参；该偏好不再存在。
- `packages/testing/specs/behaviour/message-fold/content-only.spec.mjs`
  - 同上。
- `docs/CHANGES-FROM-UPSTREAM.md`
  - 删除「逐步显示的推理窗口保留」表述。
- `docs/THIRD_PARTY_NOTICES.md`
  - 删除 transitions.dev "Reasoning stream" 的署名段落；该动画不再使用。
- `docs/DEBUGGING.md`
  - 删除最后一行关于 `reasoning-stream` 窗口的说明。

#### 3.4.4 流式文本的显示

删除窗口后，思考正文直接使用宿主 `thinkBody`：

- `white-space: pre-wrap`，随文本到达增长。
- 长文本超出 `max-height` 时由宿主自己的滚动容器处理；Lite 不再加遮罩或位移。
- `chat-follow` 仍负责在读者位于底部时跟随。

---

## 4. 影响范围

### 4.1 新增文件

```text
packages/client/src/features/notifications/
  notifications.manifest.ts
  notifications.ts
  notifications.copy.json
  notifier.ts
  notifications.settings.ts        （权限状态与「允许通知」按钮）
packages/client/src/shared/attention.ts
packages/testing/specs/logic/notifications/attention.spec.ts
packages/testing/specs/behaviour/notifications/window.spec.mjs
packages/testing/specs/behaviour/session-panel/default-open.spec.mjs
```

### 4.2 修改文件

```text
packages/contracts/src/prefs.ts
packages/contracts/src/dom.ts
packages/contracts/src/table.ts
packages/contracts/src/timing.ts
packages/client/src/core/scheduler.ts
packages/client/src/pure.ts
packages/client/src/features/session-panel/session-panel.manifest.ts
packages/client/src/features/session-panel/session-panel-state.ts
packages/client/src/features/session-panel/session-panel-button.ts
packages/client/src/features/session-panel/session-panel-rail.ts
packages/client/src/features/session-panel/session-panel.copy.json
packages/client/src/features/chat-fold/chat-fold.manifest.ts
packages/client/src/features/chat-fold/chat-fold.ts
packages/client/src/features/chat-fold/chat-fold.copy.json
packages/client/src/features/chat-fold/fold-motion.css
packages/client/src/features/chat-fold/fold-toggle.ts        （仅注释/读取标记）
packages/client/src/features/chat-follow/chat-follow.ts
packages/client/src/features/process-column/process-column.ts
packages/client/src/features/process-column/process-column.css
packages/client/src/features/sound-cues/sound-cues.ts
packages/client/src/features/sound-cues/sound-cues.manifest.ts
packages/client/src/features/sound-cues/sound-cues.copy.json
packages/client/src/features/sound-cues/attention.ts        （迁出）
packages/client/src/features/sound-cues/attention-feed.ts   （迁出）
packages/testing/data/surface.json
packages/testing/data/element-collections.json
packages/testing/data/importance-ledger.json
packages/testing/data/check-numbers.json
packages/testing/scenarios.mjs
packages/testing/scenarios/session-panel.mjs
packages/testing/scenarios/importance-audit.mjs
packages/testing/smoke/page.mjs
packages/testing/smoke/probe/chat-fold.js
packages/testing/smoke/cases/chat.mjs
packages/testing/smoke/cases/settings.mjs
packages/testing/specs/behaviour/reasoning-display/manual-fold.spec.mjs
packages/testing/specs/behaviour/chat-follow/stuck-thinking-header.spec.mjs
packages/testing/specs/behaviour/message-fold/content-only.spec.mjs
packages/testing/specs/specs/logic/preferences/stored-values.spec.ts
docs/INSTALL.md
docs/CHANGES-FROM-UPSTREAM.md
docs/THIRD_PARTY_NOTICES.md
docs/DEBUGGING.md
locale/zh.json
locale/en.json
package.json
```

### 4.3 删除文件

```text
packages/client/src/features/chat-fold/reasoning-stream.ts
packages/client/src/features/sound-cues/attention.ts        （迁移到 shared）
packages/client/src/features/sound-cues/attention-feed.ts   （迁移到 shared）
packages/testing/specs/behaviour/reasoning-display/choice.spec.mjs
packages/testing/scenarios/reasoning-stream.mjs
```

---

## 5. 决策与兼容性

### 5.1 为什么「会话总览」入口不随开关卸载

请求明确「入口改成一直存在于顶部」，所以入口的安装与默认开合必须分离。`ungated` 正是 D76 为「不设开关的功能」提供的声明；这里功能本身常驻，设置行由另一个只登记偏好的功能承担，避免一个功能同时声明两个开关。

### 5.2 为什么通知不挂在「提示音效」上

声音与通知是两个独立的中断渠道。用户可能只要通知不要声音，或只要声音不要通知。把通知挂在 `soundCues` 的 `prefValues` 上会使「提示音效：关闭」同时关掉通知，违背请求「在提示音效下方新增开关」。

### 5.3 为什么通知只覆盖完成与受阻

宿主状态快照没有结束原因。要区分失败/停止，需要跟 `sessions.binding(id).eventSource` 的 `turn/end` 原因，代价是第二条订阅和新的权限/生命周期。请求说「比如任务是待回答的时候，这个你要看 dsh 提供多少个状态了」，当前 DSH 提供的待回答状态就是 `approval / plan-review / question` 三型，方案完整覆盖；完成与停止仍统一为「任务完成」。

### 5.4 为什么思考行不代按

任何代按都要先读行状态、再造一次真实点击，然后处理焦点、输入法组合、与折叠门和渐显的竞争；阶段一变就要重来。请求要的是折叠形态本身，宿主 `ReasoningRow` 已经把它画好了，读者按标题就能开合。皮肤只读 `aria-expanded` 用于排版，行因此停在宿主给的状态上，也不再需要这套状态机。

### 5.5 为什么删除窗口而不是把默认改成 `continuous`

请求要求删除字段及其逻辑，并且默认逐字跟随。保留 `stepped` 的代码会让设置、窗口、遮罩、时钟、测试和文档继续存在。直接删除：
- 去掉一条设置行与一个偏好键；
- 去掉 `reasoning-stream.ts` 的窗口状态机与重复定时器；
- 去掉 `fold-motion.css` 的窗口样式；
- 让思考正文完全回到宿主的 `thinkBody`。

---

## 6. 根因汇总

| 现象 | 直接原因 | 深层原因 |
| --- | --- | --- |
| 会话总览入口消失、栏不再自动打开 | `sessionPanel` 偏好关掉即卸载功能 | 偏好键同时承担安装开关与交互状态，缺少独立的「默认打开」设置 |
| 宽窗口才自动打开、窄窗口自动收起 | `useRailReading()` 用窗口与列宽阈值决定 `auto` | 代码把「是否默认打开」写成了响应式布局规则，读者无法用开关覆盖 |
| 无系统通知 | 没有任何 `Notification` 调用 | 提醒功能只实现了声音，没有把同一个注意力事件接到第二个渠道 |
| 通知缺少「受阻」细分 | `pendingInteraction` 被压成一个布尔 `pending` | 读取器丢失了宿主提供的 `approval / plan-review / question` 三型 |
| 思考行不保持折叠 | 皮肤在行进入 `running` 时替读者按开标题 | 折叠状态被外部逻辑接管，宿主自己的开合不再是唯一来源 |
| 折叠摘要不及时 | `latestLine` + 3 帧节流；首段未换行时可能为空 | 摘要属于宿主；皮肤不应另造摘要行 |
| `data-expanded` 读取失效 | 宿主当前只写 `aria-expanded` / `data-open` | 契约常量沿用了旧宿主标记，没有随宿主实现更新 |
| 「思考内容显示」仍存在 | `reasoningDisplay` 偏好、设置行、窗口模块未删除 | 需求从「保留两种显示」变为「只保留逐字跟随」，旧能力未退场 |

---

## 7. 验收标准

### 7.1 R1

- [ ] 设置页显示「默认打开会话总览面板」，默认开启。
- [ ] 关闭该开关后，会话头部仍显示「会话详情」入口。
- [ ] 开关开启时，进入有回合的会话，栏自动展开。
- [ ] 开关关闭时，进入会话，栏收起；按入口可打开。
- [ ] 读者在会话 A 收起栏，切到会话 B，再回会话 A：A 保持收起；B 按默认值。
- [ ] 窄窗口下栏不因宽度自动收起；仅宿主右栏占用时退让。
- [ ] 栏收起时没有轮询请求。

### 7.2 R2

- [ ] 设置页「提示音效」下方显示「提示通知窗口」，默认开启。
- [ ] 顶层会话结束：出现「任务完成」系统通知。
- [ ] `pendingInteraction = approval`：出现「等待审批」通知。
- [ ] `pendingInteraction = plan-review`：出现「等待计划审阅」通知。
- [ ] `pendingInteraction = question`：出现「等待回答」通知。
- [ ] 同一受阻持续：只有一条通知。
- [ ] 关闭开关：没有通知、没有权限申请、没有状态订阅。
- [ ] 点击通知：打开对应会话。
- [ ] 权限拒绝：不抛错、不重复申请。
- [ ] 声音开关与通知开关互不影响。

### 7.3 R3

- [ ] 运行中的思考行以宿主默认的折叠状态出现。
- [ ] 插件对思考行标题的点击次数为 0。
- [ ] 读者按标题可以展开、收起，宿主状态不被插件改写。
- [ ] 推理结束与下一阶段开始时，行的开合状态保持原样。
- [ ] 皮肤只读 `aria-expanded`，不再依赖 `data-expanded`。

### 7.4 R4

- [ ] 设置页不再显示「思考内容显示」。
- [ ] 思考正文按宿主流式到达直接显示，没有窗口、遮罩、位移或两行步进。
- [ ] 旧设置中的 `reasoningDisplay` 被忽略，不影响启动。
- [ ] `reasoning-stream.ts`、窗口 CSS、surface 条目、行为测试与 E2E 场景全部删除。
- [ ] `npm run build`、`npm run lint`、`npm test`、`npm run verify` 通过。

---

## 8. 风险与回退

| 风险 | 影响 | 缓解 |
| --- | --- | --- |
| 通知权限被浏览器拒绝 | 读者看不到通知 | 设置行显示权限状态与「允许通知」按钮；拒绝后静默，不反复弹窗 |
| Electron 页面 `Notification` 在窗口后台仍不显示 | 通知不可见 | 与声音一样，宿主声音仍可工作；通知是附加渠道，不承诺替代 |
| 删除 `reasoningDisplay` 后旧设置残留 | 无影响 | `clampPrefs` 只读取已知键；未知键被忽略 |
| 删除窗口后长思考不可读 | 读者需要自己滚动 | 宿主 `thinkBody` 自带 `max-height` 与滚动；`chat-follow` 保持跟随 |
| 拆出 `notifications` 功能增加安装顺序复杂度 | 状态订阅重复 | 共享 `attention-feed` 单例读取；两个功能各自订阅同一份宿主快照，成本与现有声音功能相同 |

回退方式：
- R1：恢复 `sessionPanel` 偏好与 `auto` 模式；保留新偏好作为未使用键。
- R2：关闭新功能或删除 `notifications.manifest.ts` 的注册；声音功能不受影响。
- R3：无；思考行保持宿主自己的折叠，皮肤不参与。
- R4：从 Git 历史恢复 `reasoning-stream.ts` 与 `reasoningDisplay` 相关文件；不通过 Git 回滚，按文件手工恢复。

---

## 9. 文档同步

- `docs/INSTALL.md`
  - 设置迁移：删除 `reasoningDisplay`；新增 `sessionPanelOpenByDefault`、`notifications`；删除 `sessionPanel`（若旧键保留迁移说明，写明「旧键不再读取」）。
- `docs/CHANGES-FROM-UPSTREAM.md`
  - 「移除」：加入思考逐步显示窗口。
  - 「保留」：声音提示改为「声音与系统通知」。
  - 删除「逐步显示的推理窗口保留」。
- `docs/THIRD_PARTY_NOTICES.md`
  - 删除 transitions.dev "Reasoning stream" 段落。
- `docs/DEBUGGING.md`
  - 删除 `reasoning-stream` 窗口说明。
- `locale/zh.json`、`locale/en.json`、`package.json` 的插件描述
  - 把「移除思考自动开合」改为准确表述：「思考行保持宿主自己的折叠，读者按标题手动开合；不保留逐步显示窗口」。
  - 增加「系统通知」。
- `docs/CHANGELOG.md` 或 `docs/changes/` 片段
  - 一条 R1 变更。
  - 一条 R2 新功能。
  - 一条 R3 变更。
  - 一条 R4 移除。
  - 四条各自独立，便于回退与审阅。

---

## 10. 实施顺序

1. R4 先删除窗口与偏好，减少后续改动面。
2. R3 删掉思考行上的代按逻辑，并把展开判定改读 `aria-expanded`。
3. R1 拆分会话总览的安装与默认打开。
4. R2 新增通知功能与共享注意力读取器。
5. 同步生成记录、文档、locale 与变更片段。
6. 运行构建、lint、单测、stand-in、behaviour、e2e 与 verify。

> 顺序理由：R4 删除的 `reasoning-stream.ts` 与 R3 要改的思考行标记在同一目录，先删窗口可以让 R3 只处理标记读取；R1 与 R2 互不依赖，可以并行实施。
