# 会话总览、提示通知与思考显示 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让会话详情入口常驻并可默认打开，新增默认开启的系统通知，删掉思考行上的代按逻辑让折叠保持宿主状态，并删除「思考内容显示」及其逐步窗口逻辑。

**Architecture:** 四项改动各自独立：会话详情把功能安装与初始开合拆开；通知新增独立功能并共享注意力读取；思考行删除代按标题的模块，开合交回宿主与读者；逐步窗口连同偏好、样式、契约与测试整体删除。所有状态仍来自宿主已有快照，不新增宿主路由或私有接口。

**Tech Stack:** TypeScript、React 18、esbuild、Vitest（browser mode）、Playwright、DSH client primitives、项目自带的清单／偏好／测试生成工具。

## Global Constraints

- 不修改 `lib/`；构建产物只由 `npm run build` 生成。
- 新增行为、文案与规则用编辑工具写入；跨文件机械替换可以脚本化，但脚本放在 `.debug/` 并审阅完整 diff。
- 决策编号引用遵循 D3、D9、D12、D40、D72／D76、D89、D92；结构性方向变化先写 ADR。
- 偏好表 `packages/contracts/src/prefs.ts` 是客户端与宿主配置的唯一声明来源。
- 每个设置行只能登记在一个功能清单里，且每个偏好只能被一行绑定。
- 不引入运行时依赖；React 与 `@deepseek-ai/dsh-client-ui-primitives` 来自宿主。
- 不手写通知中心、窗口管理器或新的事件总线；系统通知只用浏览器 `Notification`，状态读取复用共享的 mutation/snapshot 机制。
- 失败要就地抛出；只有能隔离单个订阅者或单个通知失败的地方才捕获，并在旁边写明原因。
- 思考行不再有任何代按逻辑；折叠状态由宿主的 `ReasoningRow` 与读者决定。
- 删除 `reasoningDisplay` 后，旧设置中的该键必须被忽略，不导致启动失败。

---

### Task 1: 删除思考内容显示偏好与逐步窗口

**Files:**
- Modify: `packages/contracts/src/prefs.ts:55-62, 320-330`
- Modify: `packages/client/src/features/chat-fold/chat-fold.manifest.ts`
- Modify: `packages/client/src/features/chat-fold/chat-fold.copy.json`
- Modify: `packages/client/src/features/chat-fold/chat-fold.ts`
- Delete: `packages/client/src/features/chat-fold/reasoning-stream.ts`
- Modify: `packages/client/src/features/chat-fold/fold-motion.css:25-62`
- Modify: `packages/testing/data/surface.json:120-126`
- Modify: `packages/testing/scenarios/importance-audit.mjs:50-58`
- Delete: `packages/testing/specs/behaviour/reasoning-display/choice.spec.mjs`
- Modify: `packages/testing/specs/behaviour/reasoning-display/manual-fold.spec.mjs`
- Modify: `packages/testing/scenarios/reasoning-stream.mjs`
- Modify: `packages/testing/scenarios.mjs:515-523`
- Modify: `packages/contracts/src/timing.ts:7`
- Modify: `packages/testing/smoke/probe/chat-fold.js:140-215`
- Modify: `packages/testing/smoke/cases/chat.mjs:170-220`
- Modify: `packages/testing/smoke/cases/settings.mjs:22`
- Modify: `packages/testing/specs/logic/preferences/stored-values.spec.ts:125-140`
- Modify: `packages/testing/specs/behaviour/chat-follow/stuck-thinking-header.spec.mjs:25`
- Modify: `packages/testing/specs/behaviour/message-fold/content-only.spec.mjs:13`
- Modify: `docs/INSTALL.md:65-90`
- Modify: `docs/CHANGES-FROM-UPSTREAM.md:10-16`
- Modify: `docs/THIRD_PARTY_NOTICES.md:68-75`
- Modify: `docs/DEBUGGING.md:58-62`
- Test: `packages/testing/specs/behaviour/reasoning-display/manual-fold.spec.mjs`
- Test: `packages/testing/specs/logic/preferences/stored-values.spec.ts`

**Interfaces:**
- Consumes: `THINK_ROW_SELECTOR`, `ROW_PHASE_ATTRIBUTE`, `RUNNING_STATE`, `REASONING_TEXT_SELECTOR` from `@dsh-claude-style/contracts/dom`
- Produces: no `reasoningDisplay` preference; no `createReasoningStream()`; no `[data-dsh-claude-reason-window]` / `[data-dsh-claude-reason-text]` / `[data-dsh-claude-reason-capped]` marks.

- [ ] **Step 1: Write the failing preference test**

Replace the `reasoningDisplay` block in `packages/testing/specs/logic/preferences/stored-values.spec.ts` with:

```ts
test('the retired reasoning display key is ignored without changing the default read', () => {
  const stored = clampPrefs({ reasoningDisplay: 'stepped' })
  expect(Object.hasOwn(stored, 'reasoningDisplay')).toBe(false)
  expect(clampPrefs({})).toEqual(PREF_DEFAULTS)
})
```

- [ ] **Step 2: Run the preference test and confirm it fails**

Run:

```powershell
$env:PATH = 'D:\Develop\nvm\v24.19.0;' + $env:PATH
node node_modules/vitest/vitest.mjs run packages/testing/specs/logic/preferences/stored-values.spec.ts
```

Expected: FAIL with an assertion that `reasoningDisplay` is still present in `clampPrefs({})`.

- [ ] **Step 3: Remove the preference and its settings row**

In `packages/contracts/src/prefs.ts`:

```ts
// delete these declarations
export const REASONING_DISPLAY_CONTINUOUS = 'continuous'
export const REASONING_DISPLAY_STEPPED = 'stepped'
export const REASONING_DISPLAYS = [REASONING_DISPLAY_CONTINUOUS, REASONING_DISPLAY_STEPPED] as const

// inside PREFS, delete
reasoningDisplay: { type: 'choice', values: REASONING_DISPLAYS, default: REASONING_DISPLAY_STEPPED },
```

In `packages/client/src/features/chat-fold/chat-fold.manifest.ts`, delete the whole `settingsRows` property and remove `'chat.reasoning-text'` from `contracts`.

In `packages/client/src/features/chat-fold/chat-fold.copy.json`, delete `reasoningDisplayTitle`, `reasoningDisplayDesc`, `reasoningDisplayContinuous`, `reasoningDisplayStepped`.

- [ ] **Step 4: Delete the window module and its wiring**

Delete `packages/client/src/features/chat-fold/reasoning-stream.ts`.

In `packages/client/src/features/chat-fold/chat-fold.ts`:

```ts
// delete
import { createReasoningStream } from './reasoning-stream'
const stream = createReasoningStream()
stream.sync()
stream.stop()
```

After deletion, the handle becomes:

```ts
ui.chatFold = {
  isBusy: isChatFoldBusy,
  measure: () => messageFold.measure(),
  sync: () => messageFold.sync(),
  skipOnContentOnly: true,
  onCopyChange: () => {
    summary.rewrite()
    messageFold.onCopyChange()
  },
  measureReposition: () => messageFold.measureColumn(),
  reposition: () => {
    messageFold.reposition()
  },
}
```

- [ ] **Step 5: Delete the window styles**

In `packages/client/src/features/chat-fold/fold-motion.css`, delete every rule from the comment beginning `/* reasoning-stream.ts writes the measured height;` through the final reduced-motion rule for `[data-dsh-claude-reason-window]`. Keep the disclosure entrance and `[data-dsh-claude-rolling]` rules above it.

- [ ] **Step 6: Delete the window surface entries and audit selector**

In `packages/testing/data/surface.json`, delete:

```json
{ "id": "chat.reason-window", "selector": "[data-dsh-claude-reason-window]", "feature": "chat-fold", "sees": "the optional two-line reasoning window while the stepped display is active" },
{ "id": "chat.reason-capped", "attribute": "data-dsh-claude-reason-capped", "feature": "chat-fold", "sees": "the stepped reasoning window once its text reaches the cap and its edge masks appear" },
```

In `packages/testing/scenarios/importance-audit.mjs`, delete `'[data-dsh-claude-reason-window]',` from `TRANSIENT_SELECTORS`.

- [ ] **Step 7: Delete the window test and E2E scenario**

Delete `packages/testing/specs/behaviour/reasoning-display/choice.spec.mjs`.

In `packages/testing/scenarios/reasoning-stream.mjs`, delete `reasoningStreamScenario` and everything from `export { reasoningStreamScenario, reasoningContinuousScenario }` becomes:

```js
export { reasoningContinuousScenario }
```

In `packages/testing/scenarios.mjs`, remove the `reasoningStreamScenario` import and the `reasoningStream` registration; keep `reasoningContinuous`.

In `packages/contracts/src/timing.ts`, remove `'reasoningStream',` from `E2E_SCENARIOS`.

- [ ] **Step 8: Update the thinking-row fixture and smoke checks**

In `packages/testing/smoke/probe/chat-fold.js`:

- delete the `windowOf()` helper and all `reasonGrow`, `reasonWindow`, `reasonStopped`, `reasonClosed`, `reasonGrewClosed`, `reasonOpen` readings;
- delete `window.__pushForm({ reasoningDisplay: 'stepped' })`;
- replace `foldThink.hasAttribute('data-expanded')` with `foldThink.querySelector('[aria-expanded="true"]') !== null`;
- replace the two uses of `window.__foldClicks.think` with `foldThink.querySelector('[aria-expanded="true"]') !== null` when reporting open state.

In `packages/testing/smoke/cases/chat.mjs`, delete the checks that mention `reasonGrow`, `reasonWindow`, `reasonClosed`, `reasonOpen`, `reasonGrewClosed`, and `reasonStopped`.

In `packages/testing/smoke/page.mjs`, replace the debug thinking row markup:

```js
'<div data-variant="think" data-state="running" id="debugThink"><button type="button" id="debugThinkRow" aria-expanded="false">Thinking</button>' +
  '<div id="debugThinkBody">' +
    '<div data-markdown-variant="compact" id="debugThinkText">' + foldReasoning + '</div>' +
  '</div>' +
'</div>' +
'<div data-variant="think" data-state="running" id="debugGrow"><button type="button" id="debugGrowRow" aria-expanded="false">Thinking</button>' +
  '<div id="debugGrowBody">' +
    '<div data-markdown-variant="compact" id="debugGrowText">' + longReasoning + '</div>' +
  '</div>' +
'</div>'
```

and change the think-row click handler:

```js
var row = this.parentElement;
var open = row.querySelector('[aria-expanded="true"]') !== null;
row.querySelector('button').setAttribute('aria-expanded', open ? 'false' : 'true');
```

- [ ] **Step 9: Update settings smoke and preference fixtures**

In `packages/testing/smoke/cases/settings.mjs`, remove `'reasoningDisplay'` from the `motion` row list.

In `packages/testing/specs/behaviour/chat-follow/stuck-thinking-header.spec.mjs` and `packages/testing/specs/behaviour/message-fold/content-only.spec.mjs`, remove `reasoningDisplay: 'continuous'` from the `t.prefs(...)` patch, leaving the other keys.

- [ ] **Step 10: Remove the documentation of the window**

In `docs/INSTALL.md`, remove `reasoningDisplay` from the retained migration keys and add it to the deleted keys list.

In `docs/CHANGES-FROM-UPSTREAM.md`, change the first bullet under 移除 to:

```md
- 思考行的完整自动开合与逐步显示窗口：思考正文随内容到达直接显示，读者仍可手动开合，插件不代按标题。
```

In `docs/THIRD_PARTY_NOTICES.md`, delete the paragraph that begins `The "Reasoning stream" transition` and remove `reasoning-stream` from the transitions.dev source list.

In `docs/DEBUGGING.md`, delete the final line that begins `` `reasoning-stream` 的窗口 ``.

- [ ] **Step 11: Run focused checks**

Run:

```powershell
$env:PATH = 'D:\Develop\nvm\v24.19.0;' + $env:PATH
node node_modules/vitest/vitest.mjs run packages/testing/specs/logic/preferences/stored-values.spec.ts
node packages/testing/behaviour.mjs --list --feature reasoning-display
```

Expected: the preference test passes; the behaviour list contains only the rewritten `manual-fold` spec, with no `choice` spec.

- [ ] **Step 12: Commit**

```powershell
git add packages/contracts/src/prefs.ts packages/client/src/features/chat-fold packages/testing packages/contracts/src/timing.ts docs/INSTALL.md docs/CHANGES-FROM-UPSTREAM.md docs/THIRD_PARTY_NOTICES.md docs/DEBUGGING.md
git commit -m "refactor: 删除思考内容显示与逐步窗口"
```

---

### Task 2: 删除思考行上的代按逻辑

**Files:**
- Delete: `packages/client/src/features/chat-fold/reasoning-open.ts`
- Modify: `packages/client/src/features/chat-fold/chat-fold.ts`
- Modify: `packages/client/src/features/chat-fold/chat-fold.manifest.ts`
- Modify: `packages/client/src/features/chat-fold/fold-glide.ts`
- Modify: `packages/client/src/features/chat-follow/chat-follow.ts:310-330`
- Modify: `packages/client/src/features/process-column/process-column.css:55-62`
- Modify: `packages/client/src/features/process-column/process-column.ts`
- Modify: `packages/contracts/src/dom.ts:230-234`
- Modify: `packages/contracts/src/table.ts:64`
- Modify: `packages/testing/specs/behaviour/reasoning-display/manual-fold.spec.mjs`
- Delete: `packages/testing/specs/behaviour/reasoning-display/first-frame.spec.mjs`
- Modify: `packages/testing/smoke/page.mjs`
- Modify: `packages/testing/smoke/probe/chat-fold.js`
- Modify: `packages/testing/smoke/cases/chat.mjs`
- Test: `packages/testing/specs/behaviour/reasoning-display/manual-fold.spec.mjs`

**Interfaces:**
- Consumes: `THINK_ROW_SELECTOR`, `ROW_PHASE_ATTRIBUTE`, `RUNNING_STATE` from `@dsh-claude-style/contracts/dom`
- Produces: no `createReasoningOpen()`; no press on a thinking row's control; the row keeps the folded state the host gave it and the reader's own presses are not rewritten.

- [ ] **Step 1: Rewrite the behaviour test**

Replace `packages/testing/specs/behaviour/reasoning-display/manual-fold.spec.mjs` with a spec that mounts a running thinking row, waits three frames, and asserts:

- the control's `aria-expanded` is still `false`, so the skin never pressed it;
- the recorded press count is `0`;
- after the reader presses the control, `aria-expanded` is `true` and the skin leaves it there;
- the state stays `true` after the row's phase changes to `ok`.

Delete `packages/testing/specs/behaviour/reasoning-display/first-frame.spec.mjs`: it asserts the removed press.

- [ ] **Step 2: Delete the module and its wiring**

Delete `packages/client/src/features/chat-fold/reasoning-open.ts`, remove the `createReasoningOpen` import, the `const reasoningOpen = createReasoningOpen()` line and the `reasoningOpen.stop()` call from `packages/client/src/features/chat-fold/chat-fold.ts`.

- [ ] **Step 3: Drop the contracts the module alone read**

- From `chat-fold.manifest.ts`, delete `chat.think-row` and `chat.think-running`.
- In `fold-glide.ts`, the marked-press guard becomes `if (isChatFoldToggle()) return` and `THINK_ROW_SELECTOR` leaves the import.
- In `table.ts`, the `chat.think-row` use text becomes 「one thinking row, whose own state the skin reads and never presses: it stays folded as the host draws it」.

- [ ] **Step 4: Keep the state readings the rest of the skin still needs**

- `chat-follow.ts` reads `aria-expanded` on the row or its control for `stuckThinkHeaders()`.
- `process-column.ts` projects that state onto `data-dsh-claude-think-open`, and `process-column.css` reads the attribute instead of `data-expanded`.
- `contracts/src/dom.ts` drops `EXPANDED_ATTRIBUTE`; `table.ts` drops `fold.expanded`.

- [ ] **Step 5: Update the smoke fixture and its readings**

- `packages/testing/smoke/page.mjs`: the fixture comment says thinking rows are never pressed.
- `packages/testing/smoke/probe/chat-fold.js`: the comment says the row keeps the folded state the host drew; `thinkOpen` and `clicks.think` are read as before.
- `packages/testing/smoke/cases/chat.mjs`: both checks expect `thinkOpen === false` and `clicks.think === 0`, before and after the phase settles.

- [ ] **Step 6: Run the focused spec and the smoke case**

```powershell
$env:PATH = 'D:\Develop
vm24.19.0;' + $env:PATH
node packages/testing/stand-in.mjs --spec reasoning-display/manual-fold
node packages/testing/stand-in.mjs --case chat-fold
```

Expected: both PASS, with no press recorded.

- [ ] **Step 7: Commit**

```powershell
git add packages/client/src/features/chat-fold packages/client/src/features/chat-follow/chat-follow.ts packages/client/src/features/process-column packages/contracts/src/dom.ts packages/contracts/src/table.ts packages/testing/specs/behaviour/reasoning-display packages/testing/smoke
git commit -m "refactor: 思考行不再代按标题"
```

---

### Task 3: 会话详情入口常驻，开关只决定默认打开

**Files:**
- Modify: `packages/contracts/src/prefs.ts:316-320`
- Modify: `packages/client/src/features/session-panel/session-panel.manifest.ts`
- Modify: `packages/client/src/features/session-panel/session-panel.copy.json`
- Modify: `packages/client/src/features/session-panel/session-panel-state.ts`
- Modify: `packages/client/src/features/session-panel/session-panel-button.ts`
- Modify: `packages/client/src/features/session-panel/session-panel-rail.ts`
- Modify: `packages/testing/scenarios/session-panel.mjs`
- Create: `packages/testing/specs/behaviour/session-panel/default-open.spec.mjs`
- Modify: `packages/testing/smoke/cases/settings.mjs`
- Test: `packages/testing/specs/behaviour/session-panel/default-open.spec.mjs`
- Test: `packages/testing/scenarios/session-panel.mjs`

**Interfaces:**
- Consumes: `readPrefs`, `subscribePrefs` from `../../core/prefs`; `findRightbarToggle`; `RIGHTBAR_COLUMN_SELECTOR`; `observeMarker`; `observeSize`.
- Produces:
  - Preference `sessionPanelOpenByDefault: boolean` (default `true`).
  - `setSessionAvailable(available: boolean)`, `sessionAvailable()`, `subscribeSessionAvailable(listener)` in `session-panel-state.ts`.
  - `useRailReading()` mode `'default' | 'open' | 'closed'`.

- [ ] **Step 1: Write the failing behaviour test**

Create `packages/testing/specs/behaviour/session-panel/default-open.spec.mjs`:

```js
/**
 * The details control stays in the header whether the panel opens by default
 * or not; the preference only chooses the first state of each session.
 *
 * @capability session-panel
 * @features session-panel
 * @risk Turning the default off removes the entry, or a reader’s close is overridden in the same session.
 */
import { spec } from '../../fixtures/behaviour.mjs'

export default spec({ page: 'conversation' }, ({ test }) => {
  test('the entry stays while the default decides the opening state', async (t) => {
    await t.prefs({ sessionPanelOpenByDefault: true })
    await t.settle()
    const opened = await t.page.evaluate(() => ({
      control: document.querySelector('.dsh-claude-session-panel-button') !== null,
      rail: document.querySelector('.dsh-claude-details') !== null,
    }))
    t.expectThat.equal(opened.control, true, 'the header control stands with the default on')
    t.expectThat.equal(opened.rail, true, 'the rail opens by default')

    await t.prefs({ sessionPanelOpenByDefault: false })
    await t.settle()
    const closed = await t.page.evaluate(() => ({
      control: document.querySelector('.dsh-claude-session-panel-button') !== null,
      pressed: document.querySelector('.dsh-claude-session-panel-button')?.getAttribute('aria-pressed'),
      rail: document.querySelector('.dsh-claude-details') !== null,
    }))
    t.expectThat.equal(closed.control, true, 'the header control stays with the default off')
    t.expectThat.equal(closed.pressed, 'false', 'the control reports the rail as closed')
    t.expectThat.equal(closed.rail, false, 'the rail stays closed')
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run:

```powershell
$env:PATH = 'D:\Develop\nvm\v24.19.0;' + $env:PATH
node packages/testing/stand-in.mjs --spec session-panel/default-open
```

Expected: FAIL because `.dsh-claude-session-panel-button` is absent when the old `sessionPanel` feature is torn down, or the rail does not follow `sessionPanelOpenByDefault`.

- [ ] **Step 3: Change the preference**

In `packages/contracts/src/prefs.ts`, replace:

```ts
sessionPanel: { type: 'boolean', default: true },
```

with:

```ts
sessionPanelOpenByDefault: { type: 'boolean', default: true },
```

- [ ] **Step 4: Make the manifest ungated and keep its settings row**

In `packages/client/src/features/session-panel/session-panel.manifest.ts`:

```ts
export default {
  id: 'sessionPanel',
  order: 267,
  ungated: '会话详情入口常驻在会话头部；设置只决定每个会话是否默认展开，栏本身随入口安装',
  contracts: ['conversation.session-attribute', 'conversation.session', 'sidebar.chat', 'chat.scroller', 'chat.user-row', 'header.action-chips', 'shell.rightbar-column', 'shell.rightbar-toggle'],
  stylesheets: [{ file: 'session-panel.css', rank: 122 }],
  settingsRows: [{
    tab: 'conversation',
    rank: 85,
    pref: 'sessionPanelOpenByDefault',
    title: 'sessionPanelOpenByDefaultTitle',
    desc: 'sessionPanelOpenByDefaultDesc',
  }],
  cases: [],
  scenarios: ['sessionPanel'],
} satisfies FeatureManifest
```

- [ ] **Step 5: Add the new copy**

In `packages/client/src/features/session-panel/session-panel.copy.json`, replace `sessionPanelTitle` and `sessionPanelDesc` with:

```json
"sessionPanelOpenByDefaultTitle": {
  "zh": "默认打开会话总览面板",
  "en": "Open the session overview panel by default"
},
"sessionPanelOpenByDefaultDesc": {
  "zh": "开启后，每个会话默认展开右侧的会话详情栏；关闭后入口仍在，可按需打开。",
  "en": "With this on, each session opens the details rail; with it off the header control stays and opens it on demand."
},
```

- [ ] **Step 6: Track whether a session is available**

In `packages/client/src/features/session-panel/session-panel-state.ts`, add:

```ts
let available = false
const availabilityListeners = new Set<Listener>()

/** Whether the conversation currently holds a session the rail can describe. */
export function sessionAvailable() {
  return available
}

/** Record the conversation's own answer; a changed value wakes the header's control. */
export function setSessionAvailable(next: boolean) {
  if (available === next) return
  available = next
  for (const listener of availabilityListeners) listener()
}

/** Follow the conversation's answer. */
export function subscribeSessionAvailable(listener: Listener) {
  availabilityListeners.add(listener)
  return () => availabilityListeners.delete(listener)
}

/** Clear the answer with the generation that wrote it. */
export function clearSessionPanelState() {
  setSessionAvailable(false)
  setRailOpen(false)
  setRailToggle(null)
}
```

- [ ] **Step 7: Disable the header control on the hero page**

In `packages/client/src/features/session-panel/session-panel-button.ts`:

```tsx
import { copy } from './copy'
import { railOpen, sessionAvailable, subscribeRail, subscribeSessionAvailable, toggleRail } from './session-panel-state'

export function SessionPanelButton() {
  const label = copy('detailsToggle')
  const open = React.useSyncExternalStore(subscribeRail, railOpen, railOpen)
  const available = React.useSyncExternalStore(subscribeSessionAvailable, sessionAvailable, sessionAvailable)
  return React.createElement(primitives.Tooltip, {
    label,
    side: 'bottom',
    delayMs: 500,
    children: React.createElement(primitives.Button, {
      variant: 'ghost',
      size: 'sm',
      className: 'dsh-claude-session-panel-button',
      'aria-label': label,
      'aria-disabled': available ? undefined : 'true',
      'aria-pressed': open ? 'true' : 'false',
      disabled: !available,
      icon: React.createElement(primitives.IconFlatListOutlineRegular, { size: 16 }),
      onClick() { if (available) toggleRail() },
    }) as unknown as React.ReactElement,
  })
}
```

- [ ] **Step 8: Rewrite the rail's opening model**

In `packages/client/src/features/session-panel/session-panel-rail.ts`:

1. Import `readPrefs`, `subscribePrefs` from `../../core/prefs`.
2. Import `setSessionAvailable` from `./session-panel-state`.
3. Replace `choice` type and logic:

```ts
const choice = React.useRef<{ session: string | null, mode: 'default' | 'open' | 'closed' }>({ session: null, mode: 'default' })
```

Inside `measure()`:

```ts
if (choice.current.session !== session) choice.current = { session, mode: 'default' }
hostColumn.current = host !== null && host.isConnected && host.getBoundingClientRect().width > 0
const preferred = readPrefs().sessionPanelOpenByDefault
const mode = choice.current.mode
setOpen(!hostColumn.current && (
  mode === 'open' || (mode === 'default' && session !== null && preferred)
))
```

Delete `OPEN_WINDOW`, `OPEN_COLUMN`, `CLOSE_WINDOW`, `CLOSE_COLUMN` and the `windowWide / columnWide / windowNarrow / columnNarrow` branches.

4. Subscribe to preferences inside the effect:

```ts
const offPrefs = subscribePrefs(measure)
return () => {
  offPrefs()
  stopParts()
  columns.release()
  hostColumns.release()
  window.removeEventListener('resize', bind)
  if (stopSize !== null) stopSize()
  if (stopHostSize !== null) stopHostSize()
}
```

5. Set availability from `useConversationSession()`:

```ts
React.useEffect(() => {
  setSessionAvailable(session !== null && live)
  return () => setSessionAvailable(false)
}, [session, live])
```

6. Keep the reader's toggle:

```ts
const flip = () => {
  if (open) {
    choice.current = { session, mode: 'closed' }
    setOpen(false)
    return
  }
  if (hostColumn.current) findRightbarToggle()?.click()
  choice.current = { session, mode: 'open' }
  setOpen(!hostColumn.current)
}
```

- [ ] **Step 9: Reset state on teardown**

In `packages/client/src/features/session-panel/session-panel.ts`, import `clearSessionPanelState` and call it before/after `root.unmount()`:

```ts
return () => {
  root.unmount()
  container.remove()
  clearSessionPanelState()
  clearPanelContext(ctx)
  if (fiber !== null && fiber !== undefined && typeof fiber.dispose === 'function') fiber.dispose()
}
```

- [ ] **Step 10: Update the scenario**

In `packages/testing/scenarios/session-panel.mjs`:

- Change the expected header entry check so it does not depend on `sessionPanel` being a live preference.
- Add a second prompt after closing the rail and assert the entry still stands.
- Replace the narrow/wide assertions:

```js
check('the rail follows the default preference rather than the frame width',
  notes.narrow === true && notes.wide === true,
  JSON.stringify({ narrow: notes.narrow, wide: notes.wide }))
```

where `notes.narrow` and `notes.wide` are taken after resizing without the reader changing the choice.

- [ ] **Step 11: Update settings smoke**

In `packages/testing/smoke/cases/settings.mjs`:

```js
'main-window': ['turnNav', 'messageActions', 'conversationWidth', 'viewTabs', 'headerBand', 'processRows', 'answerAnchor', 'sessionPanelOpenByDefault', 'composerScope', 'composerBottomGap', 'questionCard', 'permissionsControl', 'modelPicker', 'effortSlider', 'modelDescriptions', 'quickProviders', 'effortAccent', 'contextDisplay', 'contextNumbers', 'statsPosition', 'statsFooterAlign', 'billingCurrency', 'billingTable'],
```

and:

```js
{ label: 'Conversation', rows: ['turnNav', 'messageActions', 'conversationWidth', 'viewTabs', 'headerBand', 'processRows', 'answerAnchor', 'sessionPanelOpenByDefault'] },
```

- [ ] **Step 12: Run focused checks**

Run:

```powershell
$env:PATH = 'D:\Develop\nvm\v24.19.0;' + $env:PATH
node packages/testing/stand-in.mjs --spec session-panel/default-open
node packages/testing/stand-in.mjs --spec settings
```

Expected: both PASS. `settings` must list `sessionPanelOpenByDefault` in the conversation group and nowhere else.

- [ ] **Step 13: Commit**

```powershell
git add packages/contracts/src/prefs.ts packages/client/src/features/session-panel packages/testing/scenarios/session-panel.mjs packages/testing/specs/behaviour/session-panel packages/testing/smoke/cases/settings.mjs
git commit -m "feat: 会话详情入口常驻并按设置默认打开"
```

---

### Task 4: 新增系统通知功能

**Files:**
- Create: `packages/client/src/shared/attention.ts`
- Create: `packages/client/src/features/notifications/notifications.manifest.ts`
- Create: `packages/client/src/features/notifications/notifications.ts`
- Create: `packages/client/src/features/notifications/notifications.copy.json`
- Create: `packages/client/src/features/notifications/notifications.settings.ts`
- Create: `packages/client/src/features/notifications/notifier.ts`
- Delete: `packages/client/src/features/sound-cues/attention.ts`
- Delete: `packages/client/src/features/sound-cues/attention-feed.ts`
- Modify: `packages/client/src/features/sound-cues/sound-cues.ts`
- Modify: `packages/client/src/features/sound-cues/sound-cues.manifest.ts`
- Modify: `packages/client/src/features/sound-cues/sound-cues.copy.json`
- Modify: `packages/client/src/pure.ts:87-88`
- Modify: `packages/contracts/src/prefs.ts:326-330`
- Modify: `packages/client/src/core/scheduler.ts:58`
- Modify: `packages/testing/specs/logic/sound-cues/attention.spec.ts`
- Create: `packages/testing/specs/logic/notifications/attention.spec.ts`
- Create: `packages/testing/specs/behaviour/notifications/window.spec.mjs`
- Create: `packages/testing/specs/behaviour/notifications/host.mjs`
- Modify: `packages/testing/specs/behaviour/sound-cues/cues.spec.mjs`
- Modify: `packages/testing/smoke/cases/settings.mjs`
- Modify: `locale/zh.json`, `locale/en.json`, `package.json`
- Test: `packages/testing/specs/logic/notifications/attention.spec.ts`
- Test: `packages/testing/specs/behaviour/notifications/window.spec.mjs`

**Interfaces:**
- Consumes:
  - `hostUiWorkspace` from `@dsh-claude-style/engine/host`
  - Browser `Notification`, `Notification.permission`, `Notification.requestPermission()`
- Produces:
  - Preference `notifications: boolean` (default `true`).
  - `attentionReading(status, list): Map<string, AttentionReading>` with `pendingKind`.
  - `attentionEvents(previous, next): AttentionEvent[]` with `{ kind: 'blocked', pending: 'approval' | 'plan-review' | 'question', sessionId }` and `{ kind: 'finished', sessionId }`.
  - `createAttentionFeed(ctx, onEvent: (event: AttentionEvent, title: string) => void)`.
  - `createNotifier(openSession: (sessionId: string) => void): { notify(request): Promise<void>, permission(): NotificationPermissionState, dispose(): void }`.
  - `notifications` feature handle registered on `ui`.

- [ ] **Step 1: Write the failing logic test**

Create `packages/testing/specs/logic/notifications/attention.spec.ts`:

```ts
/**
 * The attention reading keeps the host's three interaction kinds apart, so a
 * notification can say what the task is waiting on.
 *
 * @capability notifications
 * @features notifications
 * @risk Every pending interaction reads as approval, a repeated status publishes twice, or a subagent's finish reads as the task's.
 */
import { expect, test } from 'vitest'
import { attentionEvents, attentionReading } from '@dsh-claude-style/client/pure'
import type { AttentionReading } from '@dsh-claude-style/client/pure'
import type { HostSessionListSnapshot, HostSessionStatusSnapshot } from '@dsh-claude-style/contracts/services'

function readings(entries: Record<string, Partial<AttentionReading>>): Map<string, AttentionReading> {
  return new Map(Object.entries(entries).map(([id, entry]) => [id, {
    pending: entry.pending ?? false,
    pendingKind: entry.pendingKind ?? null,
    running: entry.running ?? false,
    topLevel: entry.topLevel !== false,
  }]))
}

function status(entries: Record<string, { running?: boolean, pendingInteraction?: unknown }>): HostSessionStatusSnapshot {
  return new Map(Object.entries(entries)) as unknown as HostSessionStatusSnapshot
}

function list(ids: string[], rows: Record<string, { running?: boolean, origin?: string }>): HostSessionListSnapshot {
  return {
    phase: 'ready',
    ids,
    byId: Object.fromEntries(ids.map(id => [id, { id, displayTitle: id, updatedAt: 1, ...rows[id] }])),
    projectionsBySession: {},
  }
}

test('the first reading is the baseline', () => {
  expect(attentionEvents(readings({}), readings({ a: { pending: true, pendingKind: 'approval', running: true } }))).toEqual([])
  expect(attentionEvents(readings({ a: { running: true } }), readings({ a: { pending: true, pendingKind: 'approval', running: true } }))).toEqual([
    { kind: 'blocked', sessionId: 'a', pending: 'approval' },
  ])
})

test('the host’s three pending kinds stay apart', () => {
  for (const pending of ['approval', 'plan-review', 'question'] as const) {
    expect(attentionEvents(readings({ a: { running: true } }), readings({ a: { pending: true, pendingKind: pending, running: true } }))).toEqual([
      { kind: 'blocked', sessionId: 'a', pending },
    ])
  }
})

test('a repeated status publishes nothing, and a changed kind publishes once', () => {
  const waiting = readings({ a: { pending: true, pendingKind: 'approval', running: true } })
  expect(attentionEvents(waiting, waiting)).toEqual([])
  expect(attentionEvents(waiting, readings({ a: { pending: true, pendingKind: 'question', running: true } }))).toEqual([
    { kind: 'blocked', sessionId: 'a', pending: 'question' },
  ])
})

test('a top-level stop finishes, a subagent stop does not', () => {
  expect(attentionEvents(readings({ a: { running: true, topLevel: true } }), readings({ a: { running: false, topLevel: true } }))).toEqual([
    { kind: 'finished', sessionId: 'a' },
  ])
  expect(attentionEvents(readings({ s: { running: true, topLevel: false } }), readings({ s: { running: false, topLevel: false } }))).toEqual([])
})

test('the reading lays the live status over the list and keeps unknown sessions below top level', () => {
  const snapshot = attentionReading(
    status({ a: { running: false }, s: { running: true, pendingInteraction: 'question' } }),
    list(['a', 'b'], { a: { running: true }, b: { running: true, origin: 'subagent' } }),
  )
  expect(snapshot.get('a')).toEqual({ pending: false, pendingKind: null, running: false, topLevel: true })
  expect(snapshot.get('b')).toEqual({ pending: false, pendingKind: null, running: true, topLevel: false })
  expect(snapshot.get('s')).toEqual({ pending: true, pendingKind: 'question', running: true, topLevel: false })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run:

```powershell
$env:PATH = 'D:\Develop\nvm\v24.19.0;' + $env:PATH
node node_modules/vitest/vitest.mjs run packages/testing/specs/logic/notifications/attention.spec.ts
```

Expected: FAIL because `attentionEvents` still returns an array of strings with no `pendingKind`.

- [ ] **Step 3: Write the shared attention reader**

Create `packages/client/src/shared/attention.ts`:

```ts
import type { HostSessionListSnapshot, HostSessionStatusSnapshot } from '@dsh-claude-style/contracts/services'

/** The host's blocking interaction kinds: approval, plan review and question. */
export type PendingKind = 'approval' | 'plan-review' | 'question'

/** The two readings a session's state has for the cues and notifications. */
export interface AttentionReading {
  /** The session waits on the reader right now. */
  pending: boolean
  /** What it waits on, or null while it does not wait. */
  pendingKind: PendingKind | null
  /** The session runs, as the live status or the list's summary says. */
  running: boolean
  /** The session is a top-level conversation, not a subagent. */
  topLevel: boolean
}

/** What a reading changed: a prompt the reader has not answered, or a finished run. */
export type AttentionEvent =
  | { kind: 'blocked', sessionId: string, pending: PendingKind }
  | { kind: 'finished', sessionId: string }

/** The host's pending value, read as one of its three kinds. */
function pendingKindOf(raw: unknown): PendingKind | null {
  if (raw === 'approval' || raw === 'plan-review' || raw === 'question') return raw
  if (raw === undefined) return null
  // Earlier hosts carried a bare object here; its only blocking meaning is approval.
  return 'approval'
}

/**
 * One reading of every session the cues watch: the list's top-level rows first,
 * with the live status laid over them, then any session the status carries that
 * the list has not reached (a subagent, or a list still loading). A session the
 * list does not prove top-level counts as a child, so only its prompt can cue.
 */
export function attentionReading(status: HostSessionStatusSnapshot | null, list: HostSessionListSnapshot | null): Map<string, AttentionReading> {
  const readings = new Map<string, AttentionReading>()
  if (list !== null) {
    for (let i = 0; i < list.ids.length; i++) {
      const id = list.ids[i]
      const row = list.byId[id]
      const live = status?.get(id)
      const pendingKind = pendingKindOf(live?.pendingInteraction)
      readings.set(id, {
        pending: pendingKind !== null,
        pendingKind,
        running: live?.running ?? row?.running === true,
        topLevel: row?.origin !== 'subagent',
      })
    }
  }
  if (status !== null) {
    for (const [id, live] of status) {
      if (readings.has(id)) continue
      const pendingKind = pendingKindOf(live.pendingInteraction)
      readings.set(id, {
        pending: pendingKind !== null,
        pendingKind,
        running: live.running === true,
        topLevel: false,
      })
    }
  }
  return readings
}

/**
 * The events two consecutive readings ask for. A session's first reading is its
 * baseline: a prompt already pending or a run already going makes no event
 * until it changes. A session that stops running while a new prompt waits
 * answers both events here.
 */
export function attentionEvents(previous: ReadonlyMap<string, AttentionReading>, next: ReadonlyMap<string, AttentionReading>): AttentionEvent[] {
  const events: AttentionEvent[] = []
  for (const [id, now] of next) {
    const before = previous.get(id)
    if (before === undefined) continue
    if (now.pendingKind !== null && now.pendingKind !== before.pendingKind) {
      events.push({ kind: 'blocked', sessionId: id, pending: now.pendingKind })
    }
    if (now.topLevel && before.running && !now.running) events.push({ kind: 'finished', sessionId: id })
  }
  return events
}
```

- [ ] **Step 4: Write the shared attention feed**

Create `packages/client/src/shared/attention-feed.ts`:

```ts
import { hostSessions, hostUiSession } from '@dsh-claude-style/engine/host'
import { attentionEvents, attentionReading } from './attention'
import type { AttentionEvent, AttentionReading } from './attention'
import type { HostContext } from '@dsh-claude-style/engine/host'
import type { HostSessionListSnapshot, HostSessionStatusSnapshot, HostSnapshotSource } from '@dsh-claude-style/contracts/services'

/**
 * Watch the two host snapshots the cues read and answer each publication with
 * the events since the last one. The first reading is the baseline.
 *
 * The services can mount after this feature (the page boots it before the
 * shell finishes), so `ctx.inject` waits for both where the host offers it; a
 * host without the wait reads what stands now.
 */
export function createAttentionFeed(ctx: HostContext, onEvent: (event: AttentionEvent, title: string) => void) {
  let previous: Map<string, AttentionReading> | null = null
  let statusSource: HostSnapshotSource<HostSessionStatusSnapshot> | undefined
  let listSource: HostSnapshotSource<HostSessionListSnapshot> | undefined
  let stopStatus: (() => void) | null = null
  let stopList: (() => void) | null = null
  let disposed = false

  function read() {
    if (disposed) return
    const status = typeof statusSource?.getSnapshot === 'function' ? statusSource.getSnapshot() : null
    const list = typeof listSource?.getSnapshot === 'function' ? listSource.getSnapshot() : null
    const next = attentionReading(status, list)
    if (previous !== null) {
      const events = attentionEvents(previous, next)
      for (let i = 0; i < events.length; i++) {
        const event = events[i]
        const title = list?.byId[event.sessionId]?.displayTitle ?? event.sessionId
        onEvent(event, title)
      }
    }
    previous = next
  }

  function bind(scope: HostContext) {
    if (disposed) return
    const status = hostUiSession(scope)?.sessionStatus
    const list = hostSessions(scope)?.list
    if (status !== statusSource) {
      if (stopStatus !== null) stopStatus()
      statusSource = status
      stopStatus = typeof status?.subscribe === 'function' ? status.subscribe(read) : null
    }
    if (list !== listSource) {
      if (stopList !== null) stopList()
      listSource = list
      stopList = typeof list?.subscribe === 'function' ? list.subscribe(read) : null
    }
    read()
  }

  const fiber = typeof ctx.inject === 'function' ? ctx.inject(['uiSession', 'sessions'], bind) : null
  if (fiber === null) bind(ctx)

  return {
    dispose() {
      disposed = true
      if (stopStatus !== null) stopStatus()
      if (stopList !== null) stopList()
      fiber?.dispose()
    },
  }
}
```

- [ ] **Step 5: Update the sound cues to the shared reader**

Delete `packages/client/src/features/sound-cues/attention.ts` and `packages/client/src/features/sound-cues/attention-feed.ts`.

In `packages/client/src/features/sound-cues/sound-cues.ts`:

```ts
import { SOUND_CUE_COMPLETION, SOUND_CUE_PERMISSION, SOUND_GAIN } from '@dsh-claude-style/contracts/sound'
import { readPrefs } from '../../core/prefs'
import { createAttentionFeed } from '../../shared/attention-feed'
import { createSoundPlayer } from './player'
import type { AttentionEvent } from '../../shared/attention'
import type { HostContext } from '@dsh-claude-style/engine/host'
import type { FeatureUi } from '../../core/feature'
import type manifest from './sound-cues.manifest'

const CUE_WINDOW_MS = 200

export function install(ctx: HostContext, ui: FeatureUi<typeof manifest>) {
  const player = createSoundPlayer()
  let disposed = false
  let timer: number | null = null
  let pending = new Set<'blocked' | 'finished'>()

  function flush() {
    timer = null
    if (disposed) return
    const events = pending
    pending = new Set()
    const kind = events.has('blocked') ? 'blocked' : events.has('finished') ? 'finished' : null
    if (kind === null) return
    const name = kind === 'blocked' ? SOUND_CUE_PERMISSION : SOUND_CUE_COMPLETION
    void player.play(name, SOUND_GAIN[readPrefs().soundCues])
  }

  function queue(event: AttentionEvent) {
    if (disposed) return
    pending.add(event.kind)
    if (timer === null) timer = window.setTimeout(flush, CUE_WINDOW_MS)
  }

  const feed = createAttentionFeed(ctx, queue)
  ui.soundCues = {}

  return () => {
    disposed = true
    if (timer !== null) window.clearTimeout(timer)
    timer = null
    feed.dispose()
    player.dispose()
    delete ui.soundCues
  }
}
```

In `packages/client/src/features/sound-cues/sound-cues.manifest.ts`, keep the existing row and `pref`. No notification key here.

In `packages/client/src/features/sound-cues/sound-cues.copy.json`, update `soundCuesDesc` to:

```json
"soundCuesDesc": { "zh": "任务完成或受阻时，播放提示音", "en": "Play a cue when a task finishes or is blocked" }
```

(no change in wording unless the final review finds it inaccurate).

- [ ] **Step 6: Export the shared reader from `pure.ts`**

In `packages/client/src/pure.ts`, replace:

```ts
export { attentionEvents, attentionReading } from './features/sound-cues/attention'
export type { AttentionEvent, AttentionReading } from './features/sound-cues/attention'
```

with:

```ts
export { attentionEvents, attentionReading } from './shared/attention'
export type { AttentionEvent, AttentionReading, PendingKind } from './shared/attention'
```

- [ ] **Step 7: Add the notification preference**

In `packages/contracts/src/prefs.ts`, after `soundCues` add:

```ts
/** Whether task completion and blocked interactions raise a system notification. */
notifications: { type: 'boolean', default: true },
```

- [ ] **Step 8: Create the notification feature manifest and copy**

Create `packages/client/src/features/notifications/notifications.manifest.ts`:

```ts
import type { FeatureManifest } from '../../core/feature'

export default {
  id: 'notifications',
  order: 51,
  pref: 'notifications',
  contracts: [],
  stylesheets: [],
  settingsRows: [{
    tab: 'general',
    rank: 61,
    pref: 'notifications',
    title: 'notificationsTitle',
    desc: 'notificationsDesc',
    status: 'notification-permission',
  }],
  cases: ['settings'],
  scenarios: [],
} satisfies FeatureManifest
```

Create `packages/client/src/features/notifications/notifications.copy.json`:

```json
{
  "notificationsTitle": { "zh": "提示通知窗口", "en": "Notification window" },
  "notificationsDesc": { "zh": "任务完成或等待你处理时，用系统通知提醒", "en": "Show a system notification when a task finishes or waits on you" },
  "notificationFinished": { "zh": "任务完成", "en": "Task finished" },
  "notificationApproval": { "zh": "等待审批", "en": "Waiting for approval" },
  "notificationPlanReview": { "zh": "等待计划审阅", "en": "Waiting for plan review" },
  "notificationQuestion": { "zh": "等待回答", "en": "Waiting for an answer" },
  "notificationPermissionRequest": { "zh": "允许通知", "en": "Allow notifications" },
  "notificationPermissionDefault": { "zh": "浏览器尚未允许通知。", "en": "The browser has not allowed notifications yet." },
  "notificationPermissionDenied": { "zh": "浏览器已拒绝通知，请在站点设置里开启。", "en": "Notifications are blocked. Turn them on in the site settings." },
  "notificationUnsupported": { "zh": "当前页面不能显示系统通知。", "en": "This page cannot show system notifications." }
}
```

Create `packages/client/src/features/notifications/copy.ts`:

```ts
import COPY from './notifications.copy.json'
import { createCopy } from '../../core/i18n'

export type CopyKey = keyof typeof COPY

export const copy = createCopy(COPY)
```

- [ ] **Step 9: Create the notifier**

Create `packages/client/src/features/notifications/notifier.ts`:

```ts
/** One system notification the skin asks for. */
export interface NotificationRequest {
  title: string
  body: string
  tag: string
  sessionId: string
}

/** The browser's own permission state, without asking for it. */
export type NotificationPermissionState = 'default' | 'granted' | 'denied' | 'unsupported'

/** What this page can do with system notifications right now. */
export function notificationPermission(): NotificationPermissionState {
  if (typeof globalThis.Notification !== 'function') return 'unsupported'
  return globalThis.Notification.permission
}

/** Ask for permission once; a denied answer is kept by the browser and never asked again. */
export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  if (typeof globalThis.Notification !== 'function') return 'unsupported'
  if (globalThis.Notification.permission !== 'default') return globalThis.Notification.permission
  try {
    return await globalThis.Notification.requestPermission()
  } catch {
    // The request can be refused by the embedding page; the cue is decorative
    // and the next event must not throw into the status subscription (D12).
    return globalThis.Notification.permission
  }
}

/**
 * Create the page's notifier: one notification per event, the browser's own
 * permission gate, and a click that asks the host to open the session.
 */
export function createNotifier(openSession: (sessionId: string) => void) {
  const opened = new Set<Notification>()
  let permission = notificationPermission()

  function close(notification: Notification) {
    opened.delete(notification)
    notification.close()
  }

  async function notify(request: NotificationRequest) {
    if (permission === 'unsupported' || permission === 'denied') return
    if (permission === 'default') permission = await requestNotificationPermission()
    if (permission !== 'granted') return
    const notification = new Notification(request.title, {
      body: request.body,
      tag: request.tag,
      silent: true,
    })
    opened.add(notification)
    notification.onclick = () => {
      window.focus()
      openSession(request.sessionId)
      close(notification)
    }
    notification.onclose = () => { opened.delete(notification) }
  }

  return {
    notify,
    permission: () => permission,
    dispose() {
      for (const notification of [...opened]) close(notification)
      opened.clear()
    },
  }
}
```

- [ ] **Step 10: Create the notification feature install**

Create `packages/client/src/features/notifications/notifications.ts`:

```ts
import { hostUiWorkspace } from '@dsh-claude-style/engine/host'
import { createAttentionFeed } from '../../shared/attention-feed'
import { copy } from './copy'
import { createNotifier } from './notifier'
import type { HostContext } from '@dsh-claude-style/engine/host'
import type { FeatureUi } from '../../core/feature'
import type { AttentionEvent } from '../../shared/attention'
import type manifest from './notifications.manifest'

/** One notification title per event; the body names the session it belongs to. */
function titleOf(event: AttentionEvent) {
  if (event.kind === 'finished') return copy('notificationFinished')
  if (event.pending === 'approval') return copy('notificationApproval')
  if (event.pending === 'plan-review') return copy('notificationPlanReview')
  return copy('notificationQuestion')
}

export function install(ctx: HostContext, ui: FeatureUi<typeof manifest>) {
  const workspace = hostUiWorkspace(ctx)
  const notifier = createNotifier((sessionId) => {
    if (typeof workspace?.openSession === 'function') workspace.openSession(sessionId)
  })

  function take(event: AttentionEvent, title: string) {
    void notifier.notify({
      title: titleOf(event),
      body: title,
      tag: `dsh-claude-style:${event.sessionId}:${event.kind === 'finished' ? 'finished' : event.pending}`,
      sessionId: event.sessionId,
    })
  }

  const feed = createAttentionFeed(ctx, take)
  ui.notifications = {}

  return () => {
    feed.dispose()
    notifier.dispose()
    delete ui.notifications
  }
}
```

The feature is installed only while the preference is true; a flip installs or tears it down through the scheduler, so this install does not subscribe to preferences.

- [ ] **Step 11: Register the handle**

In `packages/client/src/core/scheduler.ts`, add to `Handles`:

```ts
notifications: FeatureHandle
```

- [ ] **Step 12: Add the permission status control**

Create `packages/client/src/features/notifications/notifications.settings.ts`:

```tsx
import * as React from 'react'
import { copy } from './copy'
import { notificationPermission, requestNotificationPermission } from './notifier'
import type { SettingsControlsOf } from '../../core/feature'
import type manifest from './notifications.manifest'

export const controls: SettingsControlsOf<typeof manifest> = {
  'notification-permission': NotificationPermission,
}

function NotificationPermission() {
  const state = React.useState(notificationPermission())
  const permission = state[0]
  const setPermission = state[1]
  if (permission === 'granted') return null
  const line = permission === 'unsupported'
    ? copy('notificationUnsupported')
    : permission === 'denied'
      ? copy('notificationPermissionDenied')
      : copy('notificationPermissionDefault')
  return React.createElement(
    'span',
    { className: 'dsh-claude-settings-row-note' },
    line,
    permission === 'default'
      ? React.createElement('button', {
        type: 'button',
        className: 'dsh-claude-notification-permission',
        onClick: () => { void requestNotificationPermission().then(setPermission) },
      }, copy('notificationPermissionRequest'))
      : null,
  )
}
```

- [ ] **Step 13: Update the settings smoke**

In `packages/testing/smoke/cases/settings.mjs`, change the general row list:

```js
general: ['brand', 'username', 'pageZoom', 'interfaceFontSize', 'autoPopover', 'sodium', 'soundCues', 'notifications'],
```

- [ ] **Step 14: Write the behaviour test and its stand-in**

Create `packages/testing/specs/behaviour/notifications/host.mjs`:

```js
/**
 * A notification stand-in records every constructor and lets the spec press a
 * notification's click handler. The host supplies the same two services the
 * attention feed reads.
 */
export async function setup(t, { status, list }) {
  await t.page.evaluate(({ initialStatus, initialList }) => {
    window.__dispose()
    const notifications = []
    function FakeNotification(title, options) {
      this.title = title
      this.options = options
      this.onclick = null
      this.onclose = null
      notifications.push(this)
    }
    FakeNotification.permission = 'granted'
    FakeNotification.requestPermission = () => Promise.resolve(FakeNotification.permission)
    window.Notification = FakeNotification

    const channels = { list: new Set(), status: new Set(), opened: [] }
    const subscribe = (key) => (listener) => { channels[key].add(listener); return () => channels[key].delete(listener) }
    const emit = (key) => { for (const listener of [...channels[key]]) listener() }
    let statusNow = new Map(Object.entries(initialStatus))
    let listNow = initialList
    const uiSession = {
      current: { value: { key: 'a' }, subscribe: () => () => {} },
      sessionStatus: { getSnapshot: () => statusNow, subscribe: subscribe('status') },
    }
    const sessions = {
      list: { getSnapshot: () => listNow, subscribe: subscribe('list') },
      binding: () => null,
      refresh: () => Promise.resolve(),
    }
    const uiWorkspace = { openSession: (id) => channels.opened.push(id) }
    const services = { uiSession, sessions, uiWorkspace }
    const originalGet = window.__ctx.get.bind(window.__ctx)
    window.__ctx.get = (name) => Object.hasOwn(services, name) ? services[name] : originalGet(name)
    window.__ctx.inject = (_dependencies, callback) => {
      const disposers = []
      callback({
        get: window.__ctx.get,
        effect: (effect) => {
          const dispose = effect()
          if (typeof dispose === 'function') disposers.push(dispose)
          return dispose
        },
      })
      return { dispose: () => { for (const dispose of disposers.splice(0).reverse()) dispose() } }
    }
    window.__notificationsHost = {
      notifications,
      opened: channels.opened,
      setStatus(next) { statusNow = new Map(Object.entries(next)); emit('status') },
      setList(next) { listNow = next; emit('list') },
    }
    window.__skin.apply(window.__ctx)
    window.__serveNamespace()
  }, { initialStatus: status, initialList: list })

  await t.settle()
  return {
    notifications: () => t.page.evaluate(() => window.__notificationsHost.notifications.map((notification) => ({
      title: notification.title,
      body: notification.options.body,
      tag: notification.options.tag,
      silent: notification.options.silent,
    }))),
    click: (index) => t.page.evaluate((at) => window.__notificationsHost.notifications[at].onclick(), index),
    opened: () => t.page.evaluate(() => window.__notificationsHost.opened),
    async status(next, waitMs = 350) {
      await t.page.evaluate((entries) => window.__notificationsHost.setStatus(entries), next)
      if (waitMs > 0) await t.page.waitForTimeout(waitMs)
    },
  }
}

export function sessionList(status, { subagents = [] } = {}) {
  const ids = Object.keys(status).filter(id => !subagents.includes(id))
  return {
    phase: 'ready',
    ids,
    byId: Object.fromEntries(ids.map(id => [id, { id, displayTitle: `Session ${id}`, updatedAt: 1, running: status[id].running === true }])),
    projectionsBySession: {},
  }
}
```

Create `packages/testing/specs/behaviour/notifications/window.spec.mjs`:

```js
/**
 * The notification switch is on by default; completion and all three blocked
 * interactions raise one notification, and a click opens the session.
 *
 * @capability notifications
 * @features notifications
 * @risk A blocked interaction publishes repeatedly, the switch off still asks for permission, or a click opens the wrong session.
 */
import { spec } from '../../fixtures/behaviour.mjs'
import { sessionList, setup } from './host.mjs'

export default spec({ page: 'late-forms' }, ({ test }) => {
  test('completion and the three blocked kinds each notify once', async (t) => {
    const initial = { a: { running: true } }
    const host = await setup(t, { status: initial, list: sessionList(initial) })
    t.expectThat.equal(await host.notifications(), [], 'a run already going at load is the baseline')

    await host.status({ a: { running: true, pendingInteraction: 'approval' } })
    await host.status({ a: { running: true, pendingInteraction: 'question' } })
    await host.status({ a: { running: true, pendingInteraction: 'plan-review' } })
    await host.status({ a: { running: false, pendingInteraction: 'plan-review' } })

    const rows = await host.notifications()
    t.expectThat.equal(rows.map((row) => row.title), ['等待审批', '等待回答', '等待计划审阅', '任务完成'], 'each change has its own title')
    t.expectThat.equal(rows.map((row) => row.body), ['Session a', 'Session a', 'Session a', 'Session a'], 'the body names the session')
    t.expectThat.equal(rows.every((row) => row.silent === true), true, 'the notification does not add its own sound')

    await host.click(0)
    t.expectThat.equal(await host.opened(), ['a'], 'the click opens the session')
  })

  test('the switch off leaves no notifier and asks for no permission', async (t) => {
    await t.prefs({ notifications: false })
    const initial = { a: { running: true } }
    const host = await setup(t, { status: initial, list: sessionList(initial) })
    await host.status({ a: { running: true, pendingInteraction: 'question' } })
    t.expectThat.equal(await host.notifications(), [], 'off publishes nothing')
  })
})
```

- [ ] **Step 15: Run the notification tests**

Run:

```powershell
$env:PATH = 'D:\Develop\nvm\v24.19.0;' + $env:PATH
node node_modules/vitest/vitest.mjs run packages/testing/specs/logic/notifications/attention.spec.ts
node packages/testing/stand-in.mjs --spec notifications/window
```

Expected: both PASS.

- [ ] **Step 16: Run the sound-cue regression**

Run:

```powershell
$env:PATH = 'D:\Develop\nvm\v24.19.0;' + $env:PATH
node packages/testing/stand-in.mjs --spec sound-cues
```

Expected: PASS; the cue still plays once per window and the permission cue wins.

- [ ] **Step 17: Update the plugin description**

In `locale/zh.json` and `locale/en.json`, change the description to name system notifications and the current reasoning behavior. Use:

```json
"zh": "dsh-claude-style 的轻量派生版：保留 Claude / DeepSeek 主题、模型选择、会话与统计能力；思考正文随内容到达直接显示，思考行保持宿主默认的折叠；任务完成或等待处理时可用提示音与系统通知提醒；不保留逐段步进窗口、峰谷费率、消息入场动画与自绘光标。"
```

```json
"en": "A lite fork of dsh-claude-style: keeps the Claude / DeepSeek themes, model picker, sessions and statistics; reasoning text arrives directly and the running row opens once; sound cues and system notifications can mark a task that finishes or waits on you; the stepped reasoning window, peak-rate meter, sent-message entrance animations and drawn caret are removed."
```

Update `package.json` `description` to the English sentence.

- [ ] **Step 18: Commit**

```powershell
git add packages/client/src/shared packages/client/src/features/notifications packages/client/src/features/sound-cues packages/client/src/core/scheduler.ts packages/client/src/pure.ts packages/contracts/src/prefs.ts packages/testing/specs/logic/notifications packages/testing/specs/logic/sound-cues packages/testing/specs/behaviour/notifications packages/testing/specs/behaviour/sound-cues packages/testing/smoke/cases/settings.mjs locale package.json
git commit -m "feat: 新增默认开启的提示通知窗口"
```

---

### Task 5: 清理生成记录与跨文件引用

**Files:**
- Modify: `packages/testing/data/check-numbers.json`
- Modify: `packages/testing/data/element-collections.json`
- Modify: `packages/testing/data/importance-ledger.json`
- Modify: `docs/CHANGELOG.md` or add `docs/changes/*.json`
- Delete: `docs/adr/D94-session-overview-details-rail.md`
- Create: `docs/adr/D96-session-panel-default-open.md`
- Modify: `docs/adr/README.md`
- Test: `npm run checks:numbers -- --check`
- Test: `npm run element-collections`
- Test: `npm run lint`

**Interfaces:**
- Consumes: every source change from Tasks 1-4.
- Produces: generated records that match the tree; an ADR that states the new default-open direction; no stale references to `reasoningDisplay`, `reasoning-stream`, `data-expanded`, or `sessionPanel` as an installation preference.

- [ ] **Step 1: Regenerate the check numbers**

Run:

```powershell
$env:PATH = 'D:\Develop\nvm\v24.19.0;' + $env:PATH
node packages/testing/check-numbers.mjs
```

Expected: it writes `packages/testing/data/check-numbers.json` and reports the new counts.

- [ ] **Step 2: Regenerate element collections**

Run:

```powershell
$env:PATH = 'D:\Develop\nvm\v24.19.0;' + $env:PATH
node packages/testing/element-collections.mjs
```

Expected: `reasoning-stream.ts` is gone; no new collection was added except the ones the plan names.

- [ ] **Step 3: Add the changelog fragments**

Create `docs/changes/session-panel-default-open.json`:

```json
{
  "at": "2026-11-12",
  "group": "changes",
  "order": 0,
  "external": true,
  "zh": "会话详情入口常驻在会话头部，设置改为「默认打开会话总览面板」：开启时每个会话默认展开，关闭时入口仍在、按需打开；栏不再按窗口宽度自动收起",
  "en": "Keep the details control in the conversation header and make its setting Open the session overview panel by default: each session opens the rail when on, the control stays and opens it on demand when off, and the rail no longer retreats by frame width"
}
```

Create `docs/changes/notifications.json`:

```json
{
  "at": "2026-11-12",
  "group": "new",
  "order": 1,
  "external": true,
  "zh": "新增「提示通知窗口」开关，默认开启；任务完成、等待审批、等待计划审阅与等待回答时用系统通知提醒，点击通知回到对应会话",
  "en": "Add a Notification window switch, on by default, raising a system notification when a task finishes, waits for approval, waits for plan review or waits for an answer, with a click returning to that session"
}
```

Create `docs/changes/reasoning-display-removal.json`:

```json
{
  "at": "2026-11-12",
  "group": "removals",
  "order": 3,
  "external": true,
  "zh": "删除「思考内容显示」设置与两行步进窗口，思考正文按宿主流式到达直接显示",
  "en": "Remove the Reasoning display setting and the two-line stepped window; reasoning text now shows as the host streams it"
}
```

- [ ] **Step 4: Update the ADR**

Create `docs/adr/D96-session-panel-default-open.md` with:

```md
# D96. 会话详情入口常驻，默认打开由读者决定

- **取代**：D94

## 背景

D94 把详情栏的出现交给窗口宽度：窗口够宽时自己展开，窄时自动退避，会话头部的按钮只在窄窗口或读者想收起时使用。读者现在要求入口一直在会话头部，并把「每个会话是否默认打开」交给自己的一项设置。随着入口常驻，宽度阈值不再决定栏是否存在，也不再决定读者看到的初始状态；它只会让读者刚设置的开关在窗口缩放时失效。

数据仍由宿主半边的私有路由折叠，栏仍是皮肤自绘的固定列，宿主右栏仍优先占用这一侧。这些 D94 的其余方向不变。

## 决定

- 详情栏的入口常驻会话头部：入口随功能安装而安装，不随「默认打开」开关卸载。没有真实会话时入口可见但不接受按下，并说明开始会话后可用。
- 一项「默认打开会话总览面板」的偏好决定每个会话的初始状态，默认打开。开启时，进入一个有回合的会话即展开；关闭时，进入会话保持收起，入口仍可按下打开。
- 读者在某个会话里手动收起或打开后，本次运行内的该会话保持自己的选择；切到别的会话时重新按偏好决定。新会话在没有回合时保持收起，出现第一轮对话后按偏好展开。
- 栏不再按窗口宽度或对话列宽度自动收起。宿主右栏占用右侧时仍优先让位；读者手动打开时先收起宿主右栏，宽度回来后再打开自己的栏。
- 展开时继续挤压对话宽度：样式按页面标记给中心列加 320px 右侧内边距，标题、转录与输入框一起变窄；收起后标记摘掉，布局复原。
- 栏内各节、数据读取、轮询、会话隔离、统计与费用跟随计费币种等方向沿用 D94，未在此重述的部分仍以 D94 为来源。

## 后果

- 窄窗口里栏不会自动让开：读者要么自己收起，要么由宿主右栏优先占位。入口始终在头部，读者不会失去回来的路。
- 开关关闭时功能仍然安装，入口仍在；源码不订阅状态、不轮询，除非栏实际展开。功能与数据读取的开关因此不是同一个。
- 挤压对话会重排转录与标题行：开合由读者按下入口或进入会话时发生，窗口缩放不再触发；长会话的一次重排成本仍在。
- 宿主在流式输出期间重建列节点时，栏仍只按自身观察到的宽度与结构变化重算位置。
- 放弃的方案：继续用宽度阈值作为唯一的自动规则；把「默认打开」做成 `sessionPanel` 偏好上的第二个取值，使入口随开关卸载；把入口移到侧栏或 guide 卡片，读者在会话里找不到它。

## 重审条件

- 读者要求窄窗口也能自动退避时，把宽度阈值作为一种可选的默认策略重新引入，入口常驻与偏好默认打开的方向保留。
- 宿主为右侧详情列提供官方槽位或宽度策略时，改用宿主的，删掉自绘的定位与挤压规则。
- 宿主把会话统计与用量作为已推送的会话投影交给页面时，改为读投影，删掉路由里的计时与计价折叠。
```

Delete `docs/adr/D94-session-overview-details-rail.md`. The new ADR must name D94 on its `**取代**` line; `docs/adr/retired.txt` is not changed because D94 has a successor.

- [ ] **Step 5: Update the ADR index**

Run:

```powershell
$env:PATH = 'D:\Develop\nvm\v24.19.0;' + $env:PATH
node scripts/checks/decisions-index.mjs
```

Expected: `docs/adr/README.md` is regenerated with D96's new title.

- [ ] **Step 6: Run lint and the generated-record checks**

Run:

```powershell
$env:PATH = 'D:\Develop\nvm\v24.19.0;' + $env:PATH
node packages/testing/check-numbers.mjs --check
node scripts/checks/lint.mjs
```

Expected: PASS. If lint names a stale reference, fix it at the named file and rerun.

- [ ] **Step 7: Commit**

```powershell
git add packages/testing/data docs/changes docs/adr docs/adr/README.md
git commit -m "chore: 同步生成记录与决策文档"
```

---

### Task 6: 完整验证与回归

**Files:**
- No source changes expected.
- Test: `npm run build`, `npm test`, `npm run stand-in`, `npm run verify`

**Interfaces:**
- Consumes: Tasks 1-5 complete.
- Produces: a verified tree with no new failures.

- [ ] **Step 1: Build**

Run:

```powershell
$env:PATH = 'D:\Develop\nvm\v24.19.0;' + $env:PATH
node scripts/build/build.mjs
```

Expected: build finishes with the new bundle id; no type errors.

- [ ] **Step 2: Run the logic specs**

Run:

```powershell
$env:PATH = 'D:\Develop\nvm\v24.19.0;' + $env:PATH
node node_modules/vitest/vitest.mjs run
```

Expected: PASS. If a test fails on a removed key, update that test rather than reintroducing the key.

- [ ] **Step 3: Run the stand-in lane**

Run:

```powershell
$env:PATH = 'D:\Develop\nvm\v24.19.0;' + $env:PATH
node packages/testing/stand-in.mjs
```

Expected: PASS for the host-half checks, installation checks and behaviour specs.

- [ ] **Step 4: Run the selected end-to-end scenarios**

Run:

```powershell
$env:PATH = 'D:\Develop\nvm\v24.19.0;' + $env:PATH
node packages/testing/e2e.mjs --scenario sessionPanel
node packages/testing/e2e.mjs --scenario reasoningContinuous
```

Expected: both PASS. `sessionPanel` shows the rail open by default at the wide viewport; `reasoningContinuous` shows no window marks and continuous growth.

- [ ] **Step 5: Run the full verify selector**

Run:

```powershell
$env:PATH = 'D:\Develop\nvm\v24.19.0;' + $env:PATH
node scripts/checks/verify.mjs
```

Expected: the staged gates pass for the changed tree.

- [ ] **Step 6: Clean the work order and commit evidence**

If a work order was opened, run:

```powershell
$env:PATH = 'D:\Develop\nvm\v24.19.0;' + $env:PATH
node scripts/dev/work.mjs close <id>
```

Then commit any final generated records or documentation that the verification changed:

```powershell
git add .
git commit -m "test: 验证会话详情、通知与思考显示改造"
```

Only stage files this change wrote; leave the unrelated `dsh-claude-style-lite-0.1.0.tgz` untracked.
```
