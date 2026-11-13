# 零视觉变化性能优化实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按收益从高到低减少重复同步、重复测量、重复观察与后台空转，同时保持现有界面、样式、动效、动画、DOM 结构与交互结果不变。

**Architecture:** 先把高频路径拆成“可见结果刷新”和“数据重新计算”，再把能由宿主快照、尺寸订阅或 DOM 变化订阅驱动的功能移出正文批次。所有缓存都绑定明确的失效来源，所有观察器路由都保持原回调顺序与每批一次语义。

**Tech Stack:** TypeScript、浏览器 DOM、MutationObserver、ResizeObserver、requestAnimationFrame、React（宿主提供）、Vitest、Playwright、仓库自带 `npm run build` 与 `npm run verify`。

## Global Constraints

- 不修改 `lib/`；只在 `packages/client/src/`、`packages/engine/src/`、`packages/contracts/src/` 与测试源码中编辑。
- 不修改任何 CSS、设计令牌、动画名称、动画时长、缓动、关键帧、`will-change`、`mask-image`、`content-visibility` 或 `contain-intrinsic-size`。
- 不改变可见 DOM 的顺序、类名、属性、文本、焦点、选中项、滚动位置与无障碍名称。
- 不改变调度器读取、滚动、写入三阶段的顺序，也不改变 `FEATURES` 中的功能顺序。
- 不改变 `WORD_LOCK_MS`、`WAIT_OVERTIME_MS`、等待行 250 毫秒步长、加载器换场周期、侧栏展开与收起延迟、通知 1500 毫秒周期、首页用量 800 毫秒周期。
- 每个任务先写失败测试，再写实现，再运行受影响测试；测试通过后提交一个逻辑改动。
- `packages/client/src/features/account/footer-mirror.ts` 已 745 行，任何新增逻辑先抽到同目录新模块。
- 停止线：任一源文件接近 750 行时停止添加并先拆分；不得为了通过 lint 压缩代码。
- 不做静默回退。缓存未命中时重新计算；订阅不存在时保留原完整路径。
- 不使用系统临时目录；临时脚本与输出放在 `.debug/`。
- 公共文档与提交信息不出现内部决策编号；源码注释引用已有 ADR 时保留原编号。
- 每个任务完成后运行 `npm run build`；最终分支运行 `npm run lint`、`npm run element-collections -- --check` 与 `npm run verify -- --full`。

---

### Task 1: 等待行拆分时钟刷新与完整同步

**Files:**
- Modify: `packages/client/src/features/chat-wait/chat-wait.ts:58-130, 214-315, 360-443`
- Create: `packages/client/src/features/chat-wait/wait-tick.ts`
- Modify: `packages/client/src/pure.ts:20-22`
- Test: `packages/testing/specs/logic/waiting-line/tick.spec.ts`
- Test: `packages/testing/smoke/probe/chat-wait.js`
- Test: `packages/testing/smoke/cases/chat.mjs:321-640`

**Interfaces:**
- Consumes: `CHAT_RUNNING_SELECTOR`、`CHAT_RUNNING_HOLDING_ATTRIBUTE`、`CHAT_RUNNING_TEXT_SELECTOR`、`observeMatches`、`requestFrame`、`formatHostDuration`、`WAIT_OVERTIME_MS`、`wordForPass`、`HostChatTarget`。
- Produces: `waitTickPlan(state: WaitTickState, now: number): WaitTickPlan`；`WaitTickState` 包含 `turnStart: number | null`、`waitStart: number | null`、`wordUntil: number | null`、`followed: boolean`；`WaitTickPlan` 包含 `clock: boolean`、`overtime: boolean`、`full: boolean`。

- [ ] **Step 1: Write the failing pure test**

Create `packages/testing/specs/logic/waiting-line/tick.spec.ts`:

```ts
/**
 * A quarter-second tick is the clock's, not the whole line's: a followed row
 * with no wording lock due writes only its clock and badge, while a row waiting
 * on its wording lock, or with no host target subscription, asks for the full
 * sync the old timer performed.
 *
 * @capability waiting-line
 * @features chat-wait
 * @risk A lightweight tick stops updating the wording after its lock, drops the overtime badge, or stops reclassifying the tail.
 */
import { expect, test } from 'vitest'
import { waitTickPlan } from '@dsh-claude-style/client/pure'

test('a followed row with a future wording lock writes only clock and badge', () => {
  expect(waitTickPlan({ turnStart: 1000, waitStart: null, wordUntil: 3000, followed: true }, 2000))
    .toEqual({ clock: true, overtime: false, full: false })
})

test('a wording lock that has run out asks for the full sync', () => {
  expect(waitTickPlan({ turnStart: 1000, waitStart: null, wordUntil: 2000, followed: true }, 2000).full).toBe(true)
})

test('a row without a host target subscription falls back to the full sync', () => {
  expect(waitTickPlan({ turnStart: null, waitStart: null, wordUntil: null, followed: false }, 2000))
    .toEqual({ clock: false, overtime: false, full: true })
})

test('the overtime badge follows the wait start, not the turn start', () => {
  expect(waitTickPlan({ turnStart: 0, waitStart: 5000, wordUntil: null, followed: true }, 14_999).overtime).toBe(false)
  expect(waitTickPlan({ turnStart: 0, waitStart: 5000, wordUntil: null, followed: true }, 15_000).overtime).toBe(true)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/testing/specs/logic/waiting-line/tick.spec.ts`
Expected: FAIL because `waitTickPlan` is not exported from `@dsh-claude-style/client/pure`.

- [ ] **Step 3: Add the pure tick plan**

Create `packages/client/src/features/chat-wait/wait-tick.ts`:

```ts
import { WAIT_OVERTIME_MS } from './wait-state'

/** The invisible values one waiting line keeps between ticks. */
export interface WaitTickState {
  turnStart: number | null
  waitStart: number | null
  wordUntil: number | null
  followed: boolean
}

/** What one quarter-second tick may write, and whether it needs the full pass. */
export interface WaitTickPlan {
  clock: boolean
  overtime: boolean
  full: boolean
}

/** A followed row keeps its full sync for its wording lock; an unfollowed row keeps the old full tick. */
export function waitTickPlan(state: WaitTickState, now: number): WaitTickPlan {
  return {
    clock: state.turnStart !== null,
    overtime: state.waitStart !== null && now - state.waitStart >= WAIT_OVERTIME_MS,
    full: !state.followed || (state.wordUntil !== null && now >= state.wordUntil),
  }
}
```

Add to `packages/client/src/pure.ts` near the other waiting-line exports:

```ts
export { waitTickPlan } from './features/chat-wait/wait-tick'
export type { WaitTickPlan, WaitTickState } from './features/chat-wait/wait-tick'
```

- [ ] **Step 4: Run the pure test to verify it passes**

Run: `npx vitest run packages/testing/specs/logic/waiting-line/tick.spec.ts`
Expected: PASS, four tests.

- [ ] **Step 5: Add the row state and the branch before the full sync**

In `chat-wait.ts`, extend `WaitLine`:

```ts
  turnStart: number | null
  waitStart: number | null
  wordUntil: number | null
  followed: boolean
```

Change `followRow` to return whether a subscription stands:

```ts
  function followRow(row: HTMLElement, sessionId: string | null, target: HostChatTarget | null) {
    const followed = follows.get(row)
    if (sessionId === null || target === null || typeof target.subscribe !== 'function') {
      if (followed !== undefined) {
        followed.stop()
        follows.delete(row)
      }
      return false
    }
    if (followed !== undefined && followed.sessionId === sessionId) return true
    followed?.stop()
    follows.set(row, { sessionId, stop: target.subscribe(scheduleSync) })
    return true
  }
```

In `lineOf`, initialize the new fields only when a line is first built:

```ts
    const parts: WaitLine = {
      line, loader, label, clock, badge, key,
      turnStart: null,
      waitStart: null,
      wordUntil: null,
      followed: false,
    }
```

In `syncRow`, capture the subscription and turn values:

```ts
    const followed = followRow(row, sessionId, target)
    const snapshot = target === null ? null : target.getSnapshot() ?? null
    const turn = snapshot === null ? undefined : openTurn(snapshot)
    const key: string | HTMLElement = sessionId !== null && turn !== undefined ? `${sessionId}:${turn.turn}` : row
    if (typeof key === 'string') live.add(key)
    const line = lineOf(row, words, key)
    line.followed = followed
    line.turnStart = turn?.start?.time ?? null
    line.wordUntil = wording.get(key)?.standing.until ?? null
    line.waitStart = null
```

When the existing overtime branch computes `began`, assign it:

```ts
      line.waitStart = began
```

Add the lightweight writer before `syncLines`:

```ts
  /** Write only the values a quarter-second can change; wording and ownership stay on their own passes. */
  function writeClock(line: WaitLine, t: HostText, now: number, plan: WaitTickPlan) {
    line.clock.hidden = line.turnStart === null
    if (line.turnStart !== null) writeTextInPlace(line.clock, formatHostDuration(Math.max(1000, now - line.turnStart), t))
    line.badge.hidden = !plan.overtime
    if (plan.overtime) writeTextInPlace(line.badge, copy('chatWaitOvertime'))
  }
```

Replace the timer branch in `syncLines` with one that plans each line and falls back to the full sync when any plan asks for it:

```ts
    if (rows.length > 0 && timer === null) {
      timer = window.setInterval(() => {
        if (cancelTick !== null) return
        const t = hostChatSeat(ctx)
        if (t === null) return
        const now = Date.now()
        const planned = [...lines.values()].filter(line => line.line.isConnected)
          .map(line => ({ line, plan: waitTickPlan({
            turnStart: line.turnStart,
            waitStart: line.waitStart,
            wordUntil: line.wordUntil,
            followed: line.followed,
          }, now) }))
        const full = planned.some(entry => entry.plan.full)
        cancelTick = requestFrame({
          read: readTails,
          write() {
            cancelTick = null
            if (full) {
              syncInFrame()
              return
            }
            for (const entry of planned) writeClock(entry.line, t, now, entry.plan)
            writeTails()
          },
        })
      }, TICK_MS)
```

Pass the running-row change hook and declare the content-only skip:

```ts
  const runningRows = observeMatches<HTMLElement>(CHAT_RUNNING_SELECTOR, scheduleSync)
```

At the handle:

```ts
  ui.chatWait = {
    measure: readTails,
    sync: syncInFrame,
    onCopyChange: sync,
    skipOnContentOnly: true,
  }
```

- [ ] **Step 6: Add the integration assertion for the clock and pass count**

In `packages/testing/smoke/probe/chat-wait.js`, after the existing `working` reading, record the scheduler pass count and the clock text across two ticks:

```js
      var passBefore = window.__dshClaudePasses || 0
      var clockBefore = lineOf().clock
      await sleep(300)
      var clockAfter = lineOf().clock
      r.wait.tick = {
        passes: (window.__dshClaudePasses || 0) - passBefore,
        before: clockBefore,
        after: clockAfter,
      }
```

In `packages/testing/smoke/cases/chat.mjs`, add to the `chat-wait` case:

```js
    const tick = wait.tick || {}
    check('the waiting clock advances without a full scheduler pass while its wording lock stands',
      tick.passes === 0 && /^1m [5-9]s$/.test(tick.before || '') && /^1m [5-9]s$/.test(tick.after || ''),
      JSON.stringify(tick))
```

- [ ] **Step 7: Run the waiting-line and chat-wait tests**

Run: `npm run verify -- --only feature:chat-wait`
Run: `npm run verify -- --only scenario:waitLine`
Expected: both pass; the new clock assertion and the existing wording lock, file call, loader geometry, and overtime checks pass.

- [ ] **Step 8: Build and commit**

Run: `npm run build`
Then:

```bash
git add packages/client/src/features/chat-wait/chat-wait.ts packages/client/src/features/chat-wait/wait-tick.ts packages/client/src/pure.ts packages/testing/specs/logic/waiting-line/tick.spec.ts packages/testing/smoke/probe/chat-wait.js packages/testing/smoke/cases/chat.mjs
git commit -m "perf: 等待行只按时钟刷新可见值"
```

---

### Task 2: 页面级功能在正文批次中停跑

**Files:**
- Create: `packages/client/src/core/pass-scope.ts`
- Modify: `packages/client/src/pure.ts:74-86`
- Modify: `packages/client/src/features/home-ripple/home-ripple.ts:245-256`
- Modify: `packages/client/src/features/mascot/mascot.ts:47-54`
- Modify: `packages/client/src/features/hero-menu/hero-menu.ts:248-260`
- Modify: `packages/client/src/features/permissions/permissions.ts:388-418`
- Modify: `packages/client/src/features/question-card/question-card.ts:265-272`
- Modify: `packages/client/src/features/workspace/workspace-view.ts:194-216`
- Modify: `packages/client/src/features/search/search.ts:529-549`
- Modify: `packages/client/src/features/settings/settings.ts:468-525`
- Modify: `packages/client/src/features/context-stats/meter-ring.ts:355-390`
- Test: `packages/testing/specs/mechanism/page-observation/pass-scope.spec.ts`
- Test: existing feature cases and scenarios listed below

**Interfaces:**
- Consumes: `FeatureHandle.skipOnContentOnly` from `@dsh-claude-style/engine/scheduler`; the existing per-feature host subscriptions and size subscriptions.
- Produces: `CONTENT_ONLY_HANDLES` and `skipsOnContentOnly(name)` in `core/pass-scope.ts`; each listed handle sets `skipOnContentOnly: skipsOnContentOnly('<handle>')`; no public function or DOM change.

- [ ] **Step 1: Write the failing pass-scope test**

Create `packages/testing/specs/mechanism/page-observation/pass-scope.spec.ts`:

```ts
/**
 * The page-wide features that may skip a batch confined to the conversation
 * column, and no others, are named in one place. A feature's own host or size
 * subscription covers each change the batch could have carried.
 *
 * @capability page-observation
 * @features engine
 * @risk A page-wide feature silently stops following a change outside the transcript, or a transcript-bound feature is added to the skip list.
 */
import { expect, test } from 'vitest'
import { CONTENT_ONLY_HANDLES } from '@dsh-claude-style/client/pure'

test('the skip list holds exactly the page-wide handles that own their outside changes', () => {
  expect([...CONTENT_ONLY_HANDLES].sort()).toEqual([
    'heroMenu',
    'homeRipple',
    'mascot',
    'meterRing',
    'permissions',
    'questionCard',
    'search',
    'settingsNav',
    'workspace',
  ])
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/testing/specs/mechanism/page-observation/pass-scope.spec.ts`
Expected: FAIL because `packages/client/src/core/pass-scope.ts` does not exist.

- [ ] **Step 3: Create the central pass-scope list**

Create `packages/client/src/core/pass-scope.ts`:

```ts
import type { HandleName } from './scheduler'

/**
 * The page-wide handles whose inputs lie outside the conversation column. A
 * batch wholly inside the column cannot change what they read; each keeps its
 * own host, preference or size subscription for changes outside it. A handle
 * not named here runs on every pass.
 */
export const CONTENT_ONLY_HANDLES: ReadonlySet<HandleName> = new Set<HandleName>([
  'heroMenu',
  'homeRipple',
  'mascot',
  'meterRing',
  'permissions',
  'questionCard',
  'search',
  'settingsNav',
  'workspace',
])

/** Whether one handle may skip a batch confined to the conversation column. */
export function skipsOnContentOnly(name: HandleName) {
  return CONTENT_ONLY_HANDLES.has(name)
}
```

Export the set through the spec surface in `packages/client/src/pure.ts`:

```ts
export { CONTENT_ONLY_HANDLES } from './core/pass-scope'
```

- [ ] **Step 4: Read the opt-out from the list in the nine handles**

Add the import to each file:

```ts
import { skipsOnContentOnly } from '../../core/pass-scope'
```

Use these exact handle declarations:

```ts
// home-ripple.ts
ui.homeRipple = { sync, skipOnContentOnly: skipsOnContentOnly('homeRipple') }
```

```ts
// mascot.ts
ui.mascot = { sync, onActivity, skipOnContentOnly: skipsOnContentOnly('mascot') }
```

```ts
// hero-menu.ts
ui.heroMenu = { sync: syncHeroMenu, reposition: repositionHeroMenu, skipOnContentOnly: skipsOnContentOnly('heroMenu') }
```

```ts
// permissions.ts
ui.permissions = {
  measure() { if (segments !== null && segments.isConnected) segmentPill.measure(segments) },
  sync() {
    if (catalog.error() !== null) throw catalog.error()
    if (submitError !== null) throw submitError
    syncSegments()
    for (const slot of slots.values()) slot.card.placeOpen()
  },
  skipOnContentOnly: skipsOnContentOnly('permissions'),
}
```

```ts
// question-card.ts
ui.questionCard = {
  sync: questionCards.sync,
  onInput: questionCards.sync,
  onCopyChange: questionCards.sync,
  skipOnContentOnly: skipsOnContentOnly('questionCard'),
}
```

```ts
// workspace-view.ts
ui.workspace = {
  measure,
  sync,
  onCopyChange() { list.copyChanged() },
  skipOnContentOnly: skipsOnContentOnly('workspace'),
}
```

```ts
// search.ts
ui.search = { measure, sync, onFocusIn: takeover.onFocusIn, skipOnContentOnly: skipsOnContentOnly('search') }
```

```ts
// settings.ts
ui.settingsNav = {
  sync: syncSettingsNav,
  onPointerDown() { syncSettingsNav() },
  onKey(e: KeyboardEvent) {
    if (!(e.ctrlKey || e.metaKey) || e.key !== ',') return
    e.preventDefault()
    hostSettings.openSettings()
  },
  skipOnContentOnly: skipsOnContentOnly('settingsNav'),
}
```

```ts
// meter-ring.ts
ui.meterRing = {
  sync: syncRing,
  measure() {
    const main = primaryFace()
    let primary: PieColours | null = null
    for (const face of faces.values()) {
      const colours = readColoursFor(face)
      if (face === main) primary = colours
    }
    return primary
  },
  root() {
    const face = primaryFace()
    return face === null || !face.ring.isConnected ? null : face.ring
  },
  skipOnContentOnly: skipsOnContentOnly('meterRing'),
}
```

Use each file's existing method bodies; append only the flag. The `settingsNav` handle keeps its `onPointerDown` and `onKey` routes.

- [ ] **Step 5: Run the pass-scope test and the affected feature lanes**

Run: `npx vitest run packages/testing/specs/mechanism/page-observation/pass-scope.spec.ts`

Run each command separately:

```text
npm run verify -- --only feature:home-ripple
npm run verify -- --only feature:mascot
npm run verify -- --only feature:hero-menu
npm run verify -- --only feature:permissions
npm run verify -- --only feature:question-card
npm run verify -- --only feature:workspace
npm run verify -- --only feature:search
npm run verify -- --only feature:settings
npm run verify -- --only feature:context-stats
```

Expected: each passes. Pay special attention to `permissions/multiple-composers.spec.mjs`, `workspace-archive/list.spec.mjs`, `model-picker/search.spec.mjs` and `context-stats/meter-ring.spec.mjs`.

- [ ] **Step 6: Build and commit**

Run: `npm run build`
Then:

```bash
git add packages/client/src/core/pass-scope.ts packages/client/src/pure.ts packages/client/src/features/home-ripple/home-ripple.ts packages/client/src/features/mascot/mascot.ts packages/client/src/features/hero-menu/hero-menu.ts packages/client/src/features/permissions/permissions.ts packages/client/src/features/question-card/question-card.ts packages/client/src/features/workspace/workspace-view.ts packages/client/src/features/search/search.ts packages/client/src/features/settings/settings.ts packages/client/src/features/context-stats/meter-ring.ts packages/testing/specs/mechanism/page-observation/pass-scope.spec.ts
git commit -m "perf: 页面级功能跳过正文流式批次"
```

---

### Task 3: 页脚镜像缓存固定层判定

**Files:**
- Create: `packages/client/src/features/account/footer-fixed.ts`
- Modify: `packages/client/src/features/account/footer-mirror.ts:178-215, 700-720`
- Test: `packages/testing/specs/mechanism/footer-mirror/fixed-cache.spec.ts`

**Interfaces:**
- Consumes: `subscribeMutations` from `@dsh-claude-style/engine/bus`; `Element[]` entries from `footerEntriesIn`; `isOverlay` remains in `footer-mirror.ts`.
- Produces: `createFooterFixedCache(footArea: Element): { fixed(el: Element): boolean; stop(): void }`；缓存命中时不再调用 `getComputedStyle`。

- [ ] **Step 1: Write the failing measurement-count test**

Create `packages/testing/specs/mechanism/footer-mirror/fixed-cache.spec.ts`:

```ts
/**
 * A footer whose entries have not changed is measured once: the second pass
 * reuses each node's fixed-position answer. A class change invalidates the
 * answer and reads the node again.
 *
 * @capability footer-mirror
 * @features account
 * @risk A footer panel that becomes fixed after a class change is collapsed as an ordinary entry, or every pass reads every descendant's computed style.
 */
import { afterEach, expect, test, vi } from 'vitest'
import { footerMirrorHarness } from '../../fixtures/footer-mirror'

afterEach(() => {
  vi.restoreAllMocks()
  document.body.replaceChildren()
})

test('the second measure reads no computed style and a class change invalidates the answer', async () => {
  const { footArea, slot, mirror } = footerMirrorHarness()
  const entry = document.createElement('div')
  const child = document.createElement('span')
  child.textContent = 'Remote'
  entry.append(child)
  slot.append(entry)
  // cost: D9 — the cache's whole point is that a repeated measure reads no computed style.
  const style = vi.spyOn(window, 'getComputedStyle')
  mirror.measure(footArea)
  const first = style.mock.calls.length
  expect(first).toBeGreaterThan(0)
  mirror.measure(footArea)
  expect(style.mock.calls.length).toBe(first)
  entry.className = 'is-fixed'
  await new Promise(resolve => setTimeout(resolve, 0))
  mirror.measure(footArea)
  expect(style.mock.calls.length).toBeGreaterThan(first)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/testing/specs/mechanism/footer-mirror/fixed-cache.spec.ts`
Expected: FAIL because the second `measure` calls `getComputedStyle` again.

- [ ] **Step 3: Create the cache module**

Create `packages/client/src/features/account/footer-fixed.ts`:

```ts
import { subscribeMutations } from '@dsh-claude-style/engine/bus'

/**
 * The fixed-position answer for one footer subtree. A node's position is read
 * once; a class, style, role or structural change under the footer drops the
 * answers because the host has rebuilt or reclassified a node. The map is
 * replaced rather than cleared so old nodes leave with the old generation.
 */
export function createFooterFixedCache(footArea: Element) {
  let answers = new WeakMap<Element, boolean>()
  const stop = subscribeMutations(footArea, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'style', 'role', 'open', 'aria-expanded', 'aria-hidden'],
  }, () => {
    answers = new WeakMap()
  })

  return {
    fixed(el: Element) {
      const kept = answers.get(el)
      if (kept !== undefined) return kept
      const next = window.getComputedStyle(el).position === 'fixed'
      answers.set(el, next)
      return next
    },
    stop,
  }
}
```

- [ ] **Step 4: Use the cache in `footer-mirror.ts`**

Add the import:

```ts
import { createFooterFixedCache } from './footer-fixed'
```

Add one lazy field beside `fixedRead`:

```ts
  let fixedCache: ReturnType<typeof createFooterFixedCache> | null = null
```

In `measure`, create the cache for the foot area and use it:

```ts
  function measure(footArea: Element) {
    fixedCache ??= createFooterFixedCache(footArea)
    const fixed = new Set<Element>()
    const measured = new Set<Element>()
    for (const entry of footerEntriesIn(footArea)) {
      const nodes = entryNodes(entry)
      for (let i = 0; i < nodes.length; i++) {
        const el = nodes[i]
        measured.add(el)
        if (!isOverlay(el) && fixedCache.fixed(el)) fixed.add(el)
      }
    }
    fixedRead = { footArea, fixed, measured }
  }
```

In `stop`, release it:

```ts
  function stop() {
    fixedCache?.stop()
    fixedCache = null
    document.removeEventListener('pointerdown', onPressStart, true)
    document.removeEventListener('pointerup', onPressEnd, true)
    document.removeEventListener('pointercancel', onPressCleared, true)
    window.removeEventListener('blur', onPressCleared)
    pressing.clear()
  }
```

`isFixedPanelForSync` still calls `isFixedPanel` for a node mounted after the read phase; that node is not in the cache, so the late-panel test remains valid.

- [ ] **Step 5: Run the footer tests**

Run: `npx vitest run packages/testing/specs/mechanism/footer-mirror`
Run: `npm run verify -- --only feature:account`
Expected: the cache test, `late-fixed-panel.spec.ts`, `block-entry.spec.ts`, and the account cases pass.

- [ ] **Step 6: Build and commit**

Run: `npm run build`
Then:

```bash
git add packages/client/src/features/account/footer-fixed.ts packages/client/src/features/account/footer-mirror.ts packages/testing/specs/mechanism/footer-mirror/fixed-cache.spec.ts
git commit -m "perf: 页脚镜像复用固定层读数"
```

---

### Task 4: 尺寸观察器按目标路由条目

**Files:**
- Modify: `packages/engine/src/bus.ts:553-628`
- Test: `packages/testing/specs/mechanism/page-observation/bus.spec.ts:152-212`

**Interfaces:**
- Consumes: 原生 `ResizeObserver`、`reportError`、现有 `SizeSubscription` 与 `SizeRegistry`。
- Produces: `SizeRegistry.routes: Map<Element, Set<SizeSubscription>>`；`observeSize` 签名、`afterHost` 语义、初次报告与取消订阅行为不变。

- [ ] **Step 1: Write the failing routing test**

Append to `bus.spec.ts`:

```ts
test('a size batch routes each entry only to the subscriptions watching its target', async () => {
  const a = host()
  const b = host()
  for (const element of [a, b]) element.style.height = '10px'
  const seen: string[][] = []
  cleanups.push(observeSize(a, entries => seen.push(['a', ...entries.map(entry => (entry.target as HTMLElement).id)])))
  cleanups.push(observeSize(b, entries => seen.push(['b', ...entries.map(entry => (entry.target as HTMLElement).id)])))
  a.id = 'a'
  b.id = 'b'
  await nextFrame()
  seen.length = 0
  a.style.height = '20px'
  b.style.height = '20px'
  await nextFrame()
  expect(seen).toEqual([['a', 'a'], ['b', 'b']])
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/testing/specs/mechanism/page-observation/bus.spec.ts`
Expected: FAIL before the route map because each subscription receives the other subscription's entries in the filtered list before the callback. The assertion shows the observable contract; the performance change itself is reviewed in the next step.

- [ ] **Step 3: Add the route map and stable dispatch**

Update the types and registry:

```ts
interface SizeRegistry {
  observer: ResizeObserver | null
  subscriptions: SizeSubscription[]
  watchers: Map<Element, number>
  /** Every subscription watching one target, so a batch reads only its own entries. */
  routes: Map<Element, Set<SizeSubscription>>
}

const early: SizeRegistry = { observer: null, subscriptions: [], watchers: new Map(), routes: new Map() }
const afterHost: SizeRegistry = { observer: null, subscriptions: [], watchers: new Map(), routes: new Map() }
```

Replace `makeSizeObserver`:

```ts
function makeSizeObserver(registry: SizeRegistry) {
  return new ResizeObserver(entries => {
    const owned = new Map<SizeSubscription, ResizeObserverEntry[]>()
    for (const entry of entries) {
      const watchers = registry.routes.get(entry.target)
      if (watchers === undefined) continue
      for (const subscription of watchers) {
        const kept = owned.get(subscription)
        if (kept === undefined) owned.set(subscription, [entry])
        else kept.push(entry)
      }
    }
    for (const subscription of registry.subscriptions) {
      const own = owned.get(subscription)
      if (own === undefined) continue
      try { subscription.callback(own) } catch (error) { reportError(error) }
    }
  })
}
```

Add and remove routes in `observeSize`:

```ts
  for (const target of subscription.targets) {
    registry.watchers.set(target, (registry.watchers.get(target) ?? 0) + 1)
    let watched = registry.routes.get(target)
    if (watched === undefined) {
      watched = new Set()
      registry.routes.set(target, watched)
    }
    watched.add(subscription)
  }
```

In the unsubscribe, remove the subscription from every target's route set and delete the target's route when it becomes empty:

```ts
    for (const target of subscription.targets) {
      const count = registry.watchers.get(target)! - 1
      const watched = registry.routes.get(target)
      watched?.delete(subscription)
      if (watched !== undefined && watched.size === 0) registry.routes.delete(target)
      if (count > 0) {
        registry.watchers.set(target, count)
        continue
      }
      registry.watchers.delete(target)
      registry.observer?.unobserve(target)
    }
```

Add an `active` flag to the subscription type and use it for removal during dispatch:

```ts
interface SizeSubscription {
  targets: Element[]
  lookup: Set<Element>
  callback: (entries: ResizeObserverEntry[]) => void
  /** False once the owner lets go, so a subscription removed inside a callback hears no later subscription's batch. */
  active: boolean
}
```

Create the subscription with `active: true`. Set `subscription.active = false` before removing it from the registry, and skip inactive entries in the dispatch loop:

```ts
    for (const subscription of registry.subscriptions) {
      if (!subscription.active) continue
      const own = owned.get(subscription)
      if (own === undefined) continue
      try { subscription.callback(own) } catch (error) { reportError(error) }
    }
```

- [ ] **Step 4: Run the size tests**

Run: `npx vitest run packages/testing/specs/mechanism/page-observation/bus.spec.ts`
Expected: all tests pass, including the current-size first report, `afterHost` order, one batch over several elements, and last-unsubscribe behavior.

- [ ] **Step 5: Build and commit**

Run: `npm run build`
Then:

```bash
git add packages/engine/src/bus.ts packages/testing/specs/mechanism/page-observation/bus.spec.ts
git commit -m "perf: 尺寸观察器按目标路由条目"
```

---

### Task 5: 消息折叠使用共享尺寸订阅

**Files:**
- Modify: `packages/engine/src/bus.ts:553-628`
- Modify: `packages/client/src/features/chat-fold/message-fold.ts:1-135, 246-294`
- Test: `packages/testing/specs/mechanism/page-observation/bus.spec.ts`
- Test: `packages/testing/specs/behaviour/message-fold/content-only.spec.mjs`

**Interfaces:**
- Consumes: Task 4 的 `SizeRegistry.routes`；`observeSizes` 的新增、删除与停止接口。
- Produces: `observeSizes(callback, options?): { add(target: Element): void; delete(target: Element): void; has(target: Element): boolean; stop(): void }`；`observeSize` 保留原签名并委托给它。

- [ ] **Step 1: Write the failing shared-subscription test**

Append to `bus.spec.ts`:

```ts
test('one shared subscription adds and removes targets and hears their entries once per batch', async () => {
  const a = host()
  const b = host()
  for (const element of [a, b]) element.style.height = '10px'
  const seen: Element[] = []
  const shared = observeSizes(entries => seen.push(...entries.map(entry => entry.target)))
  cleanups.push(shared.stop)
  shared.add(a)
  shared.add(b)
  await nextFrame()
  seen.length = 0
  a.style.height = '20px'
  b.style.height = '20px'
  await nextFrame()
  expect(seen).toEqual([a, b])
  shared.delete(a)
  seen.length = 0
  a.style.height = '30px'
  b.style.height = '30px'
  await nextFrame()
  expect(seen).toEqual([b])
})
```

Import `observeSizes` in the spec:

```ts
import { batchAdditions, observeMarker, observeMatches, observeSize, observeSizes, subscribeMutations } from '@dsh-claude-style/engine/bus'
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/testing/specs/mechanism/page-observation/bus.spec.ts`
Expected: FAIL because `observeSizes` is not exported.

- [ ] **Step 3: Add the shared API**

After `observeSize` in `bus.ts`, add:

```ts
/** A size subscription whose target set can grow and shrink without rebuilding the shared observer. */
export function observeSizes(callback: (entries: ResizeObserverEntry[]) => void, options?: { afterHost?: boolean }) {
  const registry = options?.afterHost === true ? afterHost : early
  const subscription: SizeSubscription = { targets: [], lookup: new Set(), callback, active: true }
  registry.subscriptions.push(subscription)
  if (registry === afterHost) {
    registry.observer?.disconnect()
    registry.observer = makeSizeObserver(registry)
    for (const element of registry.watchers.keys()) registry.observer.observe(element)
  } else if (registry.observer === null) {
    registry.observer = makeSizeObserver(registry)
  }

  function add(target: Element) {
    if (!subscription.active || subscription.lookup.has(target)) return
    subscription.targets.push(target)
    subscription.lookup.add(target)
    registry.watchers.set(target, (registry.watchers.get(target) ?? 0) + 1)
    let watched = registry.routes.get(target)
    if (watched === undefined) {
      watched = new Set()
      registry.routes.set(target, watched)
    }
    watched.add(subscription)
    // A new subscription hears the current size first, as `observeSize` does.
    if (registry.watchers.get(target)! > 1) registry.observer?.unobserve(target)
    registry.observer?.observe(target)
  }

  function remove(target: Element) {
    if (!subscription.lookup.delete(target)) return
    subscription.targets = subscription.targets.filter(one => one !== target)
    const watched = registry.routes.get(target)
    watched?.delete(subscription)
    if (watched !== undefined && watched.size === 0) registry.routes.delete(target)
    const count = registry.watchers.get(target)! - 1
    if (count > 0) {
      registry.watchers.set(target, count)
      return
    }
    registry.watchers.delete(target)
    registry.observer?.unobserve(target)
  }

  return {
    add,
    delete: remove,
    has: (target: Element) => subscription.lookup.has(target),
    stop() {
      if (!subscription.active) return
      subscription.active = false
      const at = registry.subscriptions.indexOf(subscription)
      if (at !== -1) registry.subscriptions.splice(at, 1)
      for (const target of [...subscription.targets]) remove(target)
      subscription.targets = []
      subscription.lookup.clear()
      if (registry.subscriptions.length === 0) {
        registry.observer?.disconnect()
        registry.observer = null
      }
    },
  }
}
```

Make `observeSize` delegate to `observeSizes`, preserving the returned stop function:

```ts
export function observeSize(targets: Element | Element[], callback: (entries: ResizeObserverEntry[]) => void, options?: { afterHost?: boolean }) {
  const list = Array.isArray(targets) ? [...targets] : [targets]
  const shared = observeSizes(callback, options)
  for (const target of list) shared.add(target)
  return () => shared.stop()
}
```

- [ ] **Step 4: Migrate message fold to one subscription**

Replace the per-bubble `sizes` map with a shared subscription:

```ts
  /** Every bubble one shared observer watches, and the bubbles a size change touched. */
  const sizes = observeSizes(entries => {
    for (const entry of entries) {
      const bubble = entry.target as HTMLElement
      decided.delete(bubble)
      touched.add(bubble)
      requestPass()
    }
  })
```

Change `release`:

```ts
  function release(bubble: Element) {
    sizes.delete(bubble)
    decided.delete(bubble)
    dropToggle(bubble)
  }
```

Change `watchSize`:

```ts
  function watchSize(bubble: HTMLElement) {
    if (sizes.has(bubble)) return
    sizes.add(bubble)
  }
```

Change the teardown:

```ts
      sizes.stop()
```

The `prune` loop becomes:

```ts
  function prune() {
    for (const row of rows.all()) {
      const bubble = bubbles.get(row)
      if (bubble !== undefined && !bubble.isConnected) release(bubble)
    }
  }
```

This removes the `sizes.keys()` iteration; the registry has no public target list, so `prune` walks the row registry, which holds the same bubbles. The `release` path remains idempotent.

- [ ] **Step 5: Run the fold and bus tests**

Run: `npx vitest run packages/testing/specs/mechanism/page-observation/bus.spec.ts`
Run: `npm run verify -- --only feature:chat-fold`
Expected: all pass, including `message-fold/content-only.spec.mjs` and the new shared-subscription test.

- [ ] **Step 6: Build and commit**

Run: `npm run build`
Then:

```bash
git add packages/engine/src/bus.ts packages/client/src/features/chat-fold/message-fold.ts packages/testing/specs/mechanism/page-observation/bus.spec.ts
git commit -m "perf: 消息折叠共享尺寸订阅"
```

---

### Task 6: 问候语使用标题组标记订阅

**Files:**
- Modify: `packages/client/src/features/home/greeting-copy.ts:12-55`
- Modify: `packages/client/src/features/home/home-layout.ts:42, 231-250`
- Modify: `packages/engine/src/bus.ts:503-551`
- Test: `packages/testing/specs/mechanism/page-observation/bus.spec.ts`
- Test: `packages/testing/specs/behaviour/home-layout/preview.spec.mjs`

**Interfaces:**
- Consumes: `observeMarker`、`HOME_LAYOUT_STUDIO`、`readPrefs`、`getUsername`、`pickHeroGreeting`、`pickStudioGreeting`。
- Produces: `createGreetingCopy(requestPass?: () => void)` 的 `sync(hero)`、`restore()`、`stop()`；标题组集合来自标记注册表，不再每次调用 `querySelectorAll`。

- [ ] **Step 1: Write the failing query test**

Append to `bus.spec.ts`:

```ts
test('a marker registry hears a marker that arrives by attribute and reports one change', async () => {
  const root = host()
  const child = document.createElement('span')
  child.setAttribute(PROBE, '')
  root.append(child)
  let changed = 0
  const marks = observeMarker<HTMLElement>(`[${PROBE}]`, () => { changed += 1 })
  cleanups.push(() => marks.release())
  await settle()
  expect(marks.all()).toEqual([child])
  child.removeAttribute(PROBE)
  await settle()
  expect(marks.all()).toEqual([])
  expect(changed).toBe(1)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/testing/specs/mechanism/page-observation/bus.spec.ts`
Expected: FAIL because `observeMarker` takes no callback.

- [ ] **Step 3: Add the optional marker listener**

Change the signature and callback body in `bus.ts`:

```ts
export function observeMarker<T extends Element>(selector: string, onChange?: () => void): MarkerList<T> {
  const matches = new Set<Element>(document.querySelectorAll(selector))
  const stop = subscribeMutations(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: markerAttributes(selector),
  }, records => {
    let changed = false
    for (const record of records) {
      if (record.type === 'attributes') {
        const target = record.target
        if (!(target instanceof Element)) continue
        if (target.matches(selector)) {
          if (!matches.has(target)) { matches.add(target); changed = true }
        } else if (matches.delete(target)) changed = true
        continue
      }
      for (const node of record.removedNodes) if (node instanceof Element && matches.delete(node)) changed = true
      for (const node of record.addedNodes) {
        if (!(node instanceof Element)) continue
        if (node.matches(selector) && !matches.has(node)) { matches.add(node); changed = true }
        for (const found of node.querySelectorAll(selector)) if (!matches.has(found)) { matches.add(found); changed = true }
      }
    }
    if (changed) onChange?.()
  })
  return {
    all() {
      for (const element of matches) if (!element.isConnected) matches.delete(element)
      return [...matches] as T[]
    },
    release() {
      stop()
      matches.clear()
    },
  }
}
```

- [ ] **Step 4: Use the marker registry in the greeting**

Rewrite `createGreetingCopy` to own the subscription:

```ts
import { observeMarker } from '@dsh-claude-style/engine/bus'

export function createGreetingCopy(requestPass?: () => void) {
  let draw = Math.random()
  let wasHero = false
  const replaced = new Map<Element, { host: string, written: string }>()
  const groups = observeMarker<HTMLElement>('[data-dsh-claude-part~="hero-title-group"]', requestPass)

  return {
    sync(hero: boolean) {
      if (hero && !wasHero) draw = Math.random()
      wasHero = hero
      for (const span of replaced.keys()) if (!span.isConnected) replaced.delete(span)
      const titleGroups = groups.all()
      if (!hero && replaced.size === 0 && titleGroups.length === 0) return
      const greeting = readPrefs().homeLayout === HOME_LAYOUT_STUDIO
        ? pickStudioGreeting(getUsername())
        : pickHeroGreeting(getUsername(), draw)
      for (let i = 0; i < titleGroups.length; i++) {
        const spans = titleGroups[i].children
        for (let j = 0; j < spans.length; j++) {
          const span = spans[j]
          const cls = span.getAttribute('class') || ''
          if (cls.includes('previewBadge')) continue
          if (span.textContent !== greeting) {
            const before = replaced.get(span)
            const host = before === undefined || span.textContent !== before.written ? span.textContent ?? '' : before.host
            span.textContent = greeting
            replaced.set(span, { host, written: greeting })
          }
          break
        }
      }
    },
    restore() {
      for (const [span, line] of replaced) {
        if (span.isConnected && span.textContent === line.written) span.textContent = line.host
      }
      replaced.clear()
    },
    stop() {
      groups.release()
    },
  }
}
```

In `home-layout.ts`, pass the scheduler request and release the marker:

```ts
  const greeting = createGreetingCopy(() => ui.schedule?.())
```

```ts
    greeting.stop()
```

Add the skip flag after the marker subscription is live:

```ts
  ui.homeLayout = { sync, skipOnContentOnly: true }
```

- [ ] **Step 5: Run the home tests**

Run: `npm run verify -- --only feature:home`
Run: `npm run verify -- --only scenario:mobileHome`
Expected: the greeting, layout preview, hero mount, and mobile home checks pass.

- [ ] **Step 6: Build and commit**

Run: `npm run build`
Then:

```bash
git add packages/engine/src/bus.ts packages/client/src/features/home/greeting-copy.ts packages/client/src/features/home/home-layout.ts packages/testing/specs/mechanism/page-observation/bus.spec.ts
git commit -m "perf: 问候语跟随标题组标记"
```

---

### Task 7: 首页概览数据按输入记忆化

**Files:**
- Modify: `packages/client/src/features/home/home-figures.ts:251-400`
- Modify: `packages/client/src/features/home/home-layout.ts:88-108`
- Modify: `packages/client/src/pure.ts:55-70`
- Test: `packages/testing/specs/logic/home-panel/panel-memo.spec.ts`

**Interfaces:**
- Consumes: `HomeUsageState`、`ListSummary`、`homePanelData`。
- Produces: `createHomePanelMemo(): (state: HomeUsageState, listed: ListSummary | null, range: string, bookPick: number) => HomePanel`；相同输入返回同一对象，任一输入对象身份变化返回新对象。

- [ ] **Step 1: Write the failing memo test**

Create `packages/testing/specs/logic/home-panel/panel-memo.spec.ts`:

```ts
/**
 * The home panel's figures are a pure function of the usage report, the session
 * list summary, the range and the book draw. A store notification that changes
 * none of them must not rebuild the heat grid or the model chart.
 *
 * @capability home-panel
 * @features home
 * @risk Reusing a figure set after the range, the report or the list summary changed shows stale numbers.
 */
import { expect, test } from 'vitest'
import { createHomePanelMemo } from '@dsh-claude-style/client/pure'
import type { HomeUsageState, ListSummary } from '@dsh-claude-style/client/pure'

const state: HomeUsageState = { value: null, computing: false, error: null, loading: false, answeredAt: null }
const listed: ListSummary = { tokens: 0, sessions: 0, activeDays: 0, model: null, models: [], days: [], entries: [] }

test('the same four inputs reuse the computed panel', () => {
  const memo = createHomePanelMemo()
  const first = memo(state, listed, 'all', 0.25)
  expect(memo(state, listed, 'all', 0.25)).toBe(first)
  expect(memo(state, listed, '7d', 0.25)).not.toBe(first)
  expect(memo(state, { ...listed }, 'all', 0.25)).not.toBe(first)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/testing/specs/logic/home-panel/panel-memo.spec.ts`
Expected: FAIL because `createHomePanelMemo` is not exported.

- [ ] **Step 3: Add the memo factory**

Append to `home-figures.ts` after `homePanelData`:

```ts
/**
 * One panel's computed figures, reused until one of the four inputs changes
 * identity. The store mutates its state object in place, so the report value,
 * the list summary object, the range and the book draw are the cache key.
 */
export function createHomePanelMemo() {
  let stateValue: HomeUsageState['value'] | undefined
  let listed: ListSummary | null | undefined
  let range: string | undefined
  let bookPick: number | undefined
  let kept: HomePanel | null = null

  return (nextState: HomeUsageState, nextListed: ListSummary | null, nextRange: string, nextBookPick: number) => {
    if (kept !== null && nextState.value === stateValue && nextListed === listed && nextRange === range && nextBookPick === bookPick) return kept
    stateValue = nextState.value
    listed = nextListed
    range = nextRange
    bookPick = nextBookPick
    kept = homePanelData(nextState, nextListed, nextRange, nextBookPick)
    return kept
  }
}
```

Export it from `pure.ts` beside `homePanelData`:

```ts
export { createHomePanelMemo, homePanelData } from './features/home/home-figures'
export type { HomePanel } from './features/home/home-figures'
export type { HomeUsageState, ListSummary } from './features/home/home-store'
```

- [ ] **Step 4: Use the memo in the React component**

In `home-layout.ts`:

```ts
  const panelMemo = React.useRef<ReturnType<typeof createHomePanelMemo> | null>(null)
```

Inside `HomeUsagePanel`, before the data read:

```ts
    panelMemo.current ??= createHomePanelMemo()
    const data = panelMemo.current(state, usage.list(), range, bookPick)
```

Remove the direct `homePanelData` call. The `reveal` effect and all JSX stay unchanged.

- [ ] **Step 5: Run the home tests**

Run: `npx vitest run packages/testing/specs/logic/home-panel/panel-memo.spec.ts`
Run: `npm run verify -- --only feature:home`
Expected: the memo test passes; the preview and mobile-home cases pass with the same six stats, 126 heat cells, range behavior and panel reveal classes.

- [ ] **Step 6: Build and commit**

Run: `npm run build`
Then:

```bash
git add packages/client/src/features/home/home-figures.ts packages/client/src/features/home/home-layout.ts packages/client/src/pure.ts packages/testing/specs/logic/home-panel/panel-memo.spec.ts
git commit -m "perf: 首页概览数据按输入复用"
```

---

### Task 8: 搜索静态来源行缓存

**Files:**
- Modify: `packages/client/src/features/search/sources.ts:42-470`
- Modify: `packages/client/src/pure.ts:58-66`
- Test: `packages/testing/specs/logic/search/sections-cache.spec.ts`
- Test: `packages/testing/specs/behaviour/model-picker/search.spec.mjs`

**Interfaces:**
- Consumes: `HostSnapshotSource` 的 `getSnapshot()` 身份、`hostSessions`、`hostWorkspaces`、`hostShortcuts`、`hostSlots`、`hostUiWorkspace`、`hostPluginNavigation`、`hostLayout`、`hostLocale`、`profileBundles`。
- Produces: `createSearchSources(ctx, reveal)` 的 `open/close/sections/searchContent/pending` 保持原签名；内部新增 `clearCache()`，每次 `open()` 调用。

- [ ] **Step 1: Write the failing source-identity test**

Create `packages/testing/specs/logic/search/sections-cache.spec.ts`:

```ts
/**
 * The rows that do not depend on the query are built once for one host
 * snapshot. Two keystrokes over the same snapshot reuse the session rows while
 * the query still filters and orders them.
 *
 * @capability search
 * @features search
 * @risk A cached row set survives a session-list update or a language switch and the palette lists a deleted session or stale copy.
 */
import { expect, test } from 'vitest'
import { createSearchSources } from '@dsh-claude-style/client/pure'
import type { HostContext } from '@dsh-claude-style/engine/host'

test('two sections over one snapshot read the session list once', () => {
  let reads = 0
  const list = { ids: ['a'], byId: { a: { id: 'a', displayTitle: 'Alpha', updatedAt: 1 } }, projectionsBySession: {} }
  const sessions = { list: { getSnapshot: () => { reads += 1; return list }, subscribe: () => () => {} } }
  const workspaces = { list: { getSnapshot: () => ({ items: [], archivedSessionIds: [] }), subscribe: () => () => {} } }
  const ctx = { get: (name: string) => name === 'sessions' ? sessions : name === 'workspaces' ? workspaces : undefined } as unknown as HostContext
  const sources = createSearchSources(ctx, () => {})
  sources.sections('a', 'session', [])
  sources.sections('al', 'session', [])
  expect(reads).toBe(1)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/testing/specs/logic/search/sections-cache.spec.ts`
Expected: FAIL because `createSearchSources` is not exported and the second call reads the snapshot again.

- [ ] **Step 3: Export the factory and add the snapshot cache**

Add to `pure.ts`:

```ts
export { createSearchSources } from './features/search/sources'
export type { SearchFilter, SearchKind, SearchRow, SearchSection } from './features/search/sources'
```

Add `HostSessionListSnapshot` to the existing contracts import in `sources.ts`, then add cache state near `generation`:

```ts
  /** The session rows for one pair of host snapshots and one shown session. */
  let sessionsCache: {
    sessions: HostSessionListSnapshot
    workspaces: HostWorkspaceListSnapshot
    current: string | null
    rows: { summary: HostSessionSummary, workspace: string }[]
  } | null = null
```

Replace `openableSessions`:

```ts
  function openableSessions() {
    const sessions = hostSessions(ctx)
    const workspaces = hostWorkspaces(ctx)
    if (!sessions || !workspaces) return []
    const list = sessions.list.getSnapshot()
    const archive = workspaces.list.getSnapshot()
    const current = currentSessionId(ctx)
    if (sessionsCache !== null && sessionsCache.sessions === list && sessionsCache.workspaces === archive && sessionsCache.current === current) {
      return sessionsCache.rows
    }
    const archived = new Set(archive.archivedSessionIds)
    const titles = workspaceTitles(archive)
    const rows: { summary: HostSessionSummary, workspace: string }[] = []
    for (let i = 0; i < list.ids.length; i++) {
      const summary = list.byId[list.ids[i]]
      if (summary === undefined || summary.blank || summary.origin === 'subagent' || archived.has(summary.id)) continue
      rows.push({ summary, workspace: titles[summary.id] || '' })
    }
    rows.sort((a, b) => b.summary.updatedAt - a.summary.updatedAt)
    sessionsCache = { sessions: list, workspaces: archive, current, rows }
    return rows
  }
```

Add the same identity-keyed cache to `projectRows`, `pluginRows`, `skillRows`, `shortcutRows` and `actionRows`. Use this helper to keep one shape:

```ts
  type RowCache<T> = { key: readonly unknown[]; rows: T[] }
  function cachedRows<T>(kept: RowCache<T> | null, key: readonly unknown[], make: () => T[]): { cache: RowCache<T>; rows: T[] } {
    if (kept !== null && kept.key.length === key.length && kept.key.every((value, index) => value === key[index])) {
      return { cache: kept, rows: kept.rows }
    }
    const rows = make()
    return { cache: { key, rows }, rows }
  }
```

Use one `let projectsCache`, `pluginsCache`, `skillsCache`, `shortcutsCache`, `actionsCache` in the factory. `projectRows` key is `[workspaces.list.getSnapshot(), hostUiWorkspace(ctx)]`; `pluginRows` key is `[plugins, hostLocale(ctx)]`; `skillRows` key is `[skills, skillSessionId, hostSessions(ctx)]`; `shortcutRows` key is `[shortcuts.catalog.getSnapshot(), shortcuts.fixedCatalog.getSnapshot()]`; `actionRows` key is `[hostLocale(ctx), hostPluginNavigation(ctx), slotStore('sidebar.settings')]`.

`open()` resets every cache before loading plugins and skills:

```ts
    sessionsCache = null
    projectsCache = null
    pluginsCache = null
    skillsCache = null
    shortcutsCache = null
    actionsCache = null
```

Do not cache the query-specific arrays returned by `matchSessions`, `ranked`, `slice` or `sections`.

- [ ] **Step 4: Run the search tests**

Run: `npx vitest run packages/testing/specs/logic/search/sections-cache.spec.ts`
Run: `npm run verify -- --only feature:search`
Expected: the cache test passes; `model-picker/search.spec.mjs` and the shell search case still show the same sections, counts, snippets, active row and clear behavior.

- [ ] **Step 5: Build and commit**

Run: `npm run build`
Then:

```bash
git add packages/client/src/features/search/sources.ts packages/client/src/pure.ts packages/testing/specs/logic/search/sections-cache.spec.ts
git commit -m "perf: 搜索静态来源按快照复用"
```

---

### Task 9: 归档列表缓存排序与签名

**Files:**
- Modify: `packages/client/src/features/workspace/archived-list.ts:150-181, 410-430`
- Test: `packages/testing/specs/logic/workspace-archive/list.spec.ts`

**Interfaces:**
- Consumes: `archivedOrder`、`HostSessionListSnapshot`、`HostWorkspaceListSnapshot`。
- Produces: no public change; `read()` 在快照身份与当前会话未变时复用 `order`，在游标未变时复用 `sig`。

- [ ] **Step 1: Write the failing repeated-read test**

Append to `workspace-archive/list.spec.ts`:

```ts
test('two syncs over the same snapshots do not sort the archive twice', () => {
  let reads = 0
  const archived = ['a', 'b']
  const byId = {
    a: { id: 'a', displayTitle: 'A', updatedAt: 2 },
    b: { id: 'b', displayTitle: 'B', updatedAt: 1 },
  }
  for (const id of archived) {
    Object.defineProperty(byId[id as 'a' | 'b'], 'updatedAt', {
      get() { reads += 1; return id === 'a' ? 2 : 1 },
      configurable: true,
    })
  }
  const root = document.createElement('div')
  document.body.append(root)
  const workspaces = { list: { getSnapshot: () => ({ items: [], archivedSessionIds: archived }), subscribe: () => () => {} }, unarchiveSession: async () => {} }
  const sessions = { list: { getSnapshot: () => ({ ids: archived, byId, projectionsBySession: {} }), subscribe: () => () => {} }, binding: () => undefined, refresh: async () => {} }
  const list = createArchivedList({
    host: { workspaces: () => workspaces, sessions: () => sessions, currentSession: () => null },
    actions: { open: () => {}, unarchive: () => {}, remove: () => {} },
    schedule: () => {},
  })
  list.mount(root)
  const first = reads
  list.sync()
  expect(reads).toBe(first)
  list.dispose()
  root.remove()
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/testing/specs/logic/workspace-archive/list.spec.ts`
Expected: FAIL because the second `sync()` reads `updatedAt` again.

- [ ] **Step 3: Add the read cache**

In `archived-list.ts`, add fields beside `signature`:

```ts
  /** The snapshots and cursor the last read used, so a repeated pass reuses its sorted order. */
  let readCache: {
    archived: readonly string[]
    sessions: unknown
    workspaces: unknown
    current: string | null
    order: string[]
    byId: Record<string, HostSessionSummary>
    sigCursor: number
    sig: string
  } | null = null
```

Replace `read()`:

```ts
  function read() {
    const workspaces = deps.host.workspaces()
    const sessions = deps.host.sessions()
    const workspaceSnapshot = workspaces?.list.getSnapshot() ?? null
    const sessionSnapshot = sessions?.list.getSnapshot() ?? null
    const archived = workspaceSnapshot?.archivedSessionIds ?? []
    const byId = sessionSnapshot?.byId ?? {}
    const current = deps.host.currentSession()
    let order: string[]
    if (readCache !== null && readCache.archived === archived && readCache.workspaces === workspaceSnapshot && readCache.sessions === sessionSnapshot && readCache.current === current) {
      order = readCache.order
    } else {
      order = archivedOrder(archived, byId, current)
    }
    const sig = readCache !== null && readCache.order === order && readCache.sigCursor === cursor
      ? readCache.sig
      : JSON.stringify([
        current,
        cursor,
        order.slice(0, cursor).map((id) => [id, byId[id]?.updatedAt, byId[id]?.displayTitle]),
      ])
    readCache = { archived, sessions: sessionSnapshot, workspaces: workspaceSnapshot, current, order, byId, sigCursor: cursor, sig }
    return { order, byId, sig }
  }
```

In `unmount()`, clear `readCache = null` with the other page state.

- [ ] **Step 4: Run the archive tests**

Run: `npx vitest run packages/testing/specs/logic/workspace-archive/list.spec.ts`
Run: `npm run verify -- --only feature:workspace`
Expected: all archive ordering, append, unmount/remount and action tests pass.

- [ ] **Step 5: Build and commit**

Run: `npm run build`
Then:

```bash
git add packages/client/src/features/workspace/archived-list.ts packages/testing/specs/logic/workspace-archive/list.spec.ts
git commit -m "perf: 归档列表复用排序与签名"
```

---

### Task 10: 过程摘要缓存头部样式读数

**Files:**
- Create: `packages/client/src/features/chat-fold/summary-width.ts`
- Modify: `packages/client/src/features/chat-fold/process-summary.ts:153-280, 352-405, 482-500`
- Test: `packages/testing/specs/mechanism/process-fold/width-cache.spec.ts`

**Interfaces:**
- Consumes: `getComputedStyle`、`inPagePixels`、`summaryForm`、`summaryText`、`observeSizes`。
- Produces: `createSummaryWidthCache()` 的 `available(header, summary)` 与 `invalidateAll()`；缓存头部间距、内边距与边框，宽度和子元素矩形仍每次读取。

- [ ] **Step 1: Write the failing style-read test**

Create `packages/testing/specs/mechanism/process-fold/width-cache.spec.ts`:

```ts
/**
 * A header whose own padding, border and gap have not changed keeps those
 * readings between flushes, while the parent width and child boxes are still
 * read for each form decision.
 *
 * @capability process-fold
 * @features chat-fold
 * @risk A cached style makes a narrow header choose the full sentence after the panel's padding changed, or hides a genuine width change.
 */
import { afterEach, expect, test, vi } from 'vitest'
import { createSummaryWidthCache } from '@dsh-claude-style/client/pure'

afterEach(() => {
  vi.restoreAllMocks()
  document.body.replaceChildren()
})

test('the style half of the available width is read once and the child boxes are still read', () => {
  const header = document.createElement('div')
  header.style.cssText = 'display:flex;gap:4px;padding:0 8px;border:1px solid transparent'
  const summary = document.createElement('span')
  summary.textContent = 'summary'
  header.append(summary)
  document.body.append(header)
  // cost: D9 — the cache's whole point is that a repeated form decision reads no header style.
  const style = vi.spyOn(window, 'getComputedStyle')
  const cache = createSummaryWidthCache()
  cache.available(header, summary)
  const first = style.mock.calls.length
  cache.available(header, summary)
  expect(style.mock.calls.length).toBe(first)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/testing/specs/mechanism/process-fold/width-cache.spec.ts`
Expected: FAIL because `summary-width.ts` does not exist.

- [ ] **Step 3: Create the width cache**

Create `packages/client/src/features/chat-fold/summary-width.ts`:

```ts
import { inPagePixels } from '../../shared/page-zoom'

interface HeaderMetrics {
  gap: number
  paddingLeft: number
  paddingRight: number
  borderLeft: number
  borderRight: number
  parentPaddingLeft: number
  parentPaddingRight: number
}

/** The header's own style values, read once per invalidation. */
export function createSummaryWidthCache() {
  let metrics = new WeakMap<HTMLElement, HeaderMetrics>()

  function metricsOf(header: HTMLElement) {
    const kept = metrics.get(header)
    if (kept !== undefined) return kept
    const style = getComputedStyle(header)
    const parent = header.parentElement
    const parentStyle = parent === null ? null : getComputedStyle(parent)
    const next: HeaderMetrics = {
      gap: parseFloat(style.columnGap) || 0,
      paddingLeft: parseFloat(style.paddingLeft) || 0,
      paddingRight: parseFloat(style.paddingRight) || 0,
      borderLeft: parseFloat(style.borderLeftWidth) || 0,
      borderRight: parseFloat(style.borderRightWidth) || 0,
      parentPaddingLeft: parentStyle === null ? 0 : parseFloat(parentStyle.paddingLeft) || 0,
      parentPaddingRight: parentStyle === null ? 0 : parseFloat(parentStyle.paddingRight) || 0,
    }
    metrics.set(header, next)
    return next
  }

  return {
    available(header: HTMLElement, summary: HTMLElement) {
      const own = metricsOf(header)
      const parent = header.parentElement
      const limit = parent === null
        ? header.clientWidth
        : parent.clientWidth - own.parentPaddingLeft - own.parentPaddingRight
      let room = limit - own.paddingLeft - own.paddingRight - own.borderLeft - own.borderRight
      for (const child of header.children) {
        if (child === summary) continue
        const width = inPagePixels(child.getBoundingClientRect().width)
        if (width > 0) room -= width + own.gap
      }
      return Math.max(0, room)
    },
    invalidateAll() {
      metrics = new WeakMap()
    },
  }
}
```

Export the factory through `packages/client/src/pure.ts`:

```ts
export { createSummaryWidthCache } from './features/chat-fold/summary-width'
```

- [ ] **Step 4: Wire it into `process-summary.ts`**

Import the factory:

```ts
import { createSummaryWidthCache } from './summary-width'
```

Create one cache in `createProcessSummary`:

```ts
  const widthCache = createSummaryWidthCache()
```

Replace `availableWidth` with a call:

```ts
  function availableWidth(header: HTMLElement, summary: HTMLElement) {
    return widthCache.available(header, summary)
  }
```

Invalidate on the existing face and copy changes:

```ts
  const onFacesLoaded = () => {
    faceEpoch += 1
    fitWidths.clear()
    widthCache.invalidateAll()
  }
```

Call `widthCache.invalidateAll()` in the existing font-face listener and in `stop()` beside `fitWidths.clear()`. The exact points are `process-summary.ts:484-487` and `process-summary.ts:495-506`. In `rewrite()`, queueing every group is sufficient because the cache holds style metrics only; the sentence and its natural width are still recomputed through the existing `fitWidths` key.

- [ ] **Step 5: Run the process-fold tests**

Run: `npx vitest run packages/testing/specs/mechanism/process-fold/width-cache.spec.ts`
Run: `npm run verify -- --only feature:chat-fold`
Expected: the width cache test and the existing process summary and message fold tests pass.

- [ ] **Step 6: Build and commit**

Run: `npm run build`
Then:

```bash
git add packages/client/src/features/chat-fold/summary-width.ts packages/client/src/features/chat-fold/process-summary.ts packages/testing/specs/mechanism/process-fold/width-cache.spec.ts
git commit -m "perf: 过程摘要复用头部样式读数"
```

---

### Task 11: 后台轮询等待可见页面

**Files:**
- Create: `packages/client/src/shared/visibility-gate.ts`
- Modify: `packages/client/src/features/notifications/notifications.ts:40-155`
- Modify: `packages/client/src/features/home/home-store.ts:44-190, 287-305`
- Modify: `packages/client/src/pure.ts:74-82`
- Modify: `packages/testing/smoke/stand-in/host-fetch.js:40-44`
- Test: `packages/testing/specs/logic/page-visibility/gate.spec.ts`
- Test: `packages/testing/specs/behaviour/notifications/window.spec.mjs`
- Test: `packages/testing/specs/behaviour/page-visibility/hold-still.spec.mjs`

**Interfaces:**
- Consumes: `pageHidden()` 与 `subscribePageHidden()`。
- Produces: `createVisibilityGate({ hidden, subscribe }): { run(task: () => void): boolean; pending(): boolean; stop(): void }`；隐藏期间 `run` 保存最后任务，回到可见时执行一次。

- [ ] **Step 1: Write the failing gate test**

Create `packages/testing/specs/logic/page-visibility/gate.spec.ts`:

```ts
/**
 * A background poll does not run while the page is hidden, keeps only the
 * latest task, and runs one task when the page returns. The gate is the one
 * piece both the notification and usage pollers use.
 *
 * @capability page-visibility
 * @features notifications, home
 * @risk A hidden page keeps polling, or a return to the page replays every skipped request.
 */
import { expect, test } from 'vitest'
import { createVisibilityGate } from '@dsh-claude-style/client/pure'

test('a hidden gate holds the latest task and runs one task on return', () => {
  let hidden = false
  let listener: ((hidden: boolean) => void) | null = null
  const gate = createVisibilityGate({
    hidden: () => hidden,
    subscribe: (next) => {
      listener = next
      return () => { listener = null }
    },
  })
  const calls: string[] = []
  expect(gate.run(() => calls.push('a'))).toBe(true)
  hidden = true
  expect(gate.run(() => calls.push('b'))).toBe(false)
  expect(gate.run(() => calls.push('c'))).toBe(false)
  expect(calls).toEqual(['a'])
  expect(gate.pending()).toBe(true)
  hidden = false
  listener?.(false)
  expect(calls).toEqual(['a', 'c'])
  expect(gate.pending()).toBe(false)
  gate.stop()
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/testing/specs/logic/page-visibility/gate.spec.ts`
Expected: FAIL because `createVisibilityGate` is not exported.

- [ ] **Step 3: Create the gate**

Create `packages/client/src/shared/visibility-gate.ts`:

```ts
import { pageHidden, subscribePageHidden } from '../core/page-visibility'

export interface VisibilityGateOptions {
  hidden(): boolean
  subscribe(listener: (hidden: boolean) => void): () => void
}

/** One queued task that waits for the page to come back. */
export function createVisibilityGate(options: VisibilityGateOptions = { hidden: pageHidden, subscribe: subscribePageHidden }) {
  let queued: (() => void) | null = null
  let stopped = false
  const off = options.subscribe(hidden => {
    if (hidden || stopped) return
    const task = queued
    queued = null
    task?.()
  })

  return {
    run(task: () => void) {
      if (stopped) return false
      if (options.hidden()) {
        queued = task
        return false
      }
      task()
      return true
    },
    pending() { return queued !== null },
    stop() {
      stopped = true
      queued = null
      off()
    },
  }
}
```

Export from `pure.ts`:

```ts
export { createVisibilityGate } from './shared/visibility-gate'
export type { VisibilityGateOptions } from './shared/visibility-gate'
```

- [ ] **Step 4: Gate the notification activation poll**

In `notifications.ts`, import the gate:

```ts
import { createVisibilityGate } from '../../shared/visibility-gate'
```

Add `const activationGate = createVisibilityGate()` beside `activationTimer`, and extract the fetch into a named function:

```ts
  function pollActivation() {
    void fetch(NOTIFY_ACTIVATION_PATH, { cache: 'no-store' })
      .then((response) => response.ok ? response.json() as Promise<{ activation: HostNotifyActivation | null }> : null)
      .then((answer) => {
        if (stopped || answer === null || answer.activation === null) return
        const activation = answer.activation
        const key = `${activation.sessionId}:${activation.at}`
        if (seen.has(key)) return
        seen.add(key)
        openSession(activation.sessionId)
        window.focus()
      })
      .catch((error: unknown) => {
        console.warn('notifications: the activation read failed', error)
      })
  }

  function startActivationPoll() {
    if (activationTimer !== null) return
    activationTimer = window.setInterval(() => {
      activationGate.run(pollActivation)
    }, ACTIVATION_POLL_MS)
  }
```

In the teardown, before clearing the timer:

```ts
    activationGate.stop()
```

- [ ] **Step 5: Gate the home usage poll**

In `home-store.ts`, import:

```ts
import { createVisibilityGate } from '../../shared/visibility-gate'
```

Create the gate inside `createHomeUsage`:

```ts
  const pollGate = createVisibilityGate()
```

Change the poll scheduling:

```ts
        pollTimer = setTimeout(() => {
          pollTimer = null
          pollGate.run(read)
        }, HOME_POLL_MS)
```

In `stop()`, add `pollGate.stop()` before `stopPolling()`.

- [ ] **Step 6: Record activation reads and add the hidden-page behavior assertion**

In `packages/testing/smoke/stand-in/host-fetch.js`, count every activation read:

```js
    if (url === '/dsh-claude-style-lite/notify-activation') {
      window.__activationReads = (window.__activationReads || 0) + 1
      var activation = hostNotify ? hostNotify.activation : null
      if (hostNotify) hostNotify.activation = null
      return Promise.resolve(jsonResponse({ ok: true, activation: activation }))
    }
```

In `packages/testing/specs/behaviour/notifications/host.mjs`, expose the count:

```js
    activationReads: () => t.page.evaluate(() => window.__activationReads ?? 0),
```

Append to `packages/testing/specs/behaviour/notifications/window.spec.mjs`:

```js
  test('a hidden page performs no activation poll until it returns', async (t) => {
    const initial = { a: { running: true } }
    const host = await setup(t, { status: initial, list: sessionList(initial), capability: { ok: true, channel: 'toast', clickReturnsSession: true } })
    await t.page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    const before = await host.activationReads()
    await t.page.waitForTimeout(1800)
    t.expectThat.equal(await host.activationReads(), before, 'the hidden page asks for no activation')
    await t.page.evaluate(() => {
      delete document.visibilityState
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await t.page.waitForTimeout(1800)
    t.expectThat.equal((await host.activationReads()) > before, true, 'the visible page resumes the poll')
  })
```

- [ ] **Step 7: Run the visibility tests**

Run: `npx vitest run packages/testing/specs/logic/page-visibility/gate.spec.ts`
Run: `npm run verify -- --only feature:notifications`
Run: `npm run verify -- --only feature:home`
Run: `npm run verify -- --only case:page-visibility`
Expected: gate test passes, visible notification timing remains, hidden-page request count does not grow, and the existing hold-still case passes.

- [ ] **Step 8: Build and commit**

Run: `npm run build`
Then:

```bash
git add packages/client/src/shared/visibility-gate.ts packages/client/src/features/notifications/notifications.ts packages/client/src/features/home/home-store.ts packages/client/src/pure.ts packages/testing/smoke/stand-in/host-fetch.js packages/testing/specs/behaviour/notifications/host.mjs packages/testing/specs/logic/page-visibility/gate.spec.ts packages/testing/specs/behaviour/notifications/window.spec.mjs
git commit -m "perf: 后台轮询等待可见页面"
```

---

### Task 12: 指针活动合并到一帧

**Files:**
- Modify: `packages/engine/src/scheduler.ts:128-168, 202-228, 421-449`
- Test: `packages/testing/specs/mechanism/page-observation/activity.spec.ts`

**Interfaces:**
- Consumes: `requestFrame`、`dispatch('onActivity')`、`FeatureHandle.onActivity`。
- Produces: `pointermove` 活动每帧最多派发一次；`pointerdown` 与 `keydown` 仍即时派发；调度器停止时取消未执行帧。

- [ ] **Step 1: Write the failing coalescing test**

Create `packages/testing/specs/mechanism/page-observation/activity.spec.ts`:

```ts
/**
 * A pointer sweep is one activity per frame: the mascot updates its quiet
 * clock once, while a press or a key still reaches the feature immediately.
 *
 * @capability page-observation
 * @features engine
 * @risk The mascot never wakes, wakes several times for one sweep, or a press stops reaching it.
 */
import { afterEach, expect, test } from 'vitest'
import { installScheduler } from '@dsh-claude-style/engine/scheduler'
import type { HostContext } from '@dsh-claude-style/engine/host'

const cleanups: (() => void)[] = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup()
})

const ctx = { get: () => undefined } as unknown as HostContext
const frame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))

test('two pointer moves in one frame reach onActivity once, and a press reaches it at once', async () => {
  let calls = 0
  const ui = { retire: () => {} } as Record<string, unknown> & { schedule?: () => void; retire: () => void }
  cleanups.push(installScheduler(ctx, ui as never, ['mascot'], {
    copyChange: [],
    refresh: [],
    start() {},
    systemMotionChanged() {},
  }))
  ui.mascot = { onActivity() { calls += 1 } }
  ui.schedule?.()
  await frame()
  calls = 0
  document.dispatchEvent(new PointerEvent('pointermove'))
  document.dispatchEvent(new PointerEvent('pointermove'))
  expect(calls).toBe(0)
  await frame()
  expect(calls).toBe(1)
  calls = 0
  document.dispatchEvent(new PointerEvent('pointerdown'))
  expect(calls).toBe(1)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/testing/specs/mechanism/page-observation/activity.spec.ts`
Expected: FAIL because the second move calls `onActivity` synchronously and `calls` is already one or two before the frame.

- [ ] **Step 3: Coalesce the move event**

In `scheduler.ts`, add a frame state beside `cancelViewportFrame`:

```ts
  /** The pending pointer sweep, one activity dispatch per frame. */
  let cancelActivityFrame: (() => void) | null = null
  function onPointerMove() {
    if (cancelActivityFrame !== null) return
    cancelActivityFrame = requestFrame({
      write() {
        cancelActivityFrame = null
        dispatch('onActivity')
      },
    })
  }
```

Replace the listener:

```ts
  document.addEventListener('pointermove', onPointerMove, { passive: true })
```

Replace both cleanup calls:

```ts
    document.removeEventListener('pointermove', onPointerMove)
```

Cancel the pending frame in the teardown before removing listeners:

```ts
    if (cancelActivityFrame !== null) cancelActivityFrame()
    cancelActivityFrame = null
```

`onGlobalPointerDown` and `onGlobalKeyDown` keep calling `onGlobalActivity()` immediately.

- [ ] **Step 4: Run the activity test**

Run: `npx vitest run packages/testing/specs/mechanism/page-observation/activity.spec.ts`
Expected: PASS; two moves coalesce, a press is immediate.

- [ ] **Step 5: Run mascot behavior**

Run: `npm run verify -- --only feature:mascot`
Run: `npm run verify -- --only scenario:sidebarPeek`
Expected: mascot waking and sleeping checks pass; no pointer activity warning appears.

- [ ] **Step 6: Build and commit**

Run: `npm run build`
Then:

```bash
git add packages/engine/src/scheduler.ts packages/testing/specs/mechanism/page-observation/activity.spec.ts
git commit -m "perf: 指针活动每帧派发一次"
```

---

### Task 13: 侧栏预览指针判定合并到一帧

**Files:**
- Modify: `packages/client/src/features/sidebar-peek/sidebar-peek.ts:207-315`
- Test: `packages/testing/scenarios/sidebar-peek.mjs`

**Interfaces:**
- Consumes: `requestFrame`、现有 `inside()`、`held()`、`judge()`、`LEAVE_DELAY_MS`、`OPEN_DELAY_MS`。
- Produces: `pointermove` 只保存最新坐标与按键状态；同一帧只执行一次 `inside()` 与离开计时器更新。

- [ ] **Step 1: Add the frame-reading assertion to the scenario**

In `packages/testing/scenarios/sidebar-peek.mjs`, record the open and leave timers around a burst of pointer moves:

```js
    const before = await page.evaluate(() => ({ open: document.querySelector('[data-dsh-claude-sidebar-peek]')?.getAttribute('data-dsh-claude-sidebar-peek') ?? null }))
    await page.mouse.move(620, 320)
    await page.mouse.move(621, 321)
    await page.mouse.move(622, 322)
    await page.waitForTimeout(350)
    const after = await page.evaluate(() => ({ open: document.querySelector('[data-dsh-claude-sidebar-peek]')?.getAttribute('data-dsh-claude-sidebar-peek') ?? null }))
    check('a pointer sweep keeps the peek state to one frame decision', before.open === after.open, JSON.stringify({ before, after }))
```

Place it after the existing hover-open assertion, before the leave assertion, so the scenario still exercises the real open and close paths.

- [ ] **Step 2: Run the scenario to verify the current behavior**

Run: `npm run verify -- --only scenario:sidebarPeek`
Expected: the existing checks pass; the new assertion also passes on the old implementation because the final pointer position has the same result. This assertion is the regression guard for the frame path, not evidence that the old code was slow.

- [ ] **Step 3: Replace the per-event judge with a frame task**

Add a pending frame field beside `pointer`:

```ts
  let pointerFrame: (() => void) | null = null
```

Replace `onPointerMove`:

```ts
  function onPointerMove(event: PointerEvent) {
    pointer = { x: event.clientX, y: event.clientY }
    const pressed = event.buttons !== 0
    if (pointerFrame !== null) return
    pointerFrame = requestFrame({
      read() {
        pointerFrame = null
        const insideNow = inside()
        const heldNow = held(pressed)
        if (phase !== 'open' || insideNow || heldNow) {
          window.clearTimeout(leaveTimer)
          leaveTimer = undefined
          return
        }
        if (leaveTimer !== undefined) return
        leaveTimer = window.setTimeout(() => {
          leaveTimer = undefined
          if (!inside() && !held(false)) close()
        }, LEAVE_DELAY_MS)
      },
    })
  }
```

Import `requestFrame` at the top of the file if it is not already imported. If `requestFrame` is already imported, leave the import unchanged.

In the teardown, cancel the pending frame:

```ts
    pointerFrame?.()
    pointerFrame = null
```

- [ ] **Step 4: Run the sidebar peek scenario**

Run: `npm run verify -- --only scenario:sidebarPeek`
Expected: the scenario passes, including the existing 120ms open, 300ms leave and pin checks.

- [ ] **Step 5: Build and commit**

Run: `npm run build`
Then:

```bash
git add packages/client/src/features/sidebar-peek/sidebar-peek.ts packages/testing/scenarios/sidebar-peek.mjs
git commit -m "perf: 侧栏预览每帧判定指针"
```

---

### Task 14: 调度器维护事件钩子索引

**Files:**
- Modify: `packages/engine/src/scheduler.ts:20-75, 106-168, 332-411`
- Modify: `packages/client/src/entry.ts:236-270, 318-338, 401-421`
- Modify: `packages/client/src/core/scheduler.ts:73-81`
- Test: `packages/testing/specs/mechanism/page-observation/hooks.spec.ts`

**Interfaces:**
- Consumes: `SchedulerCalls`、`FeatureHandle`、`FEATURES`、`ui`、`install`、`retire`、`applySwitch`。
- Produces: `SchedulerCalls.refreshHandles?: () => void`；调度器按钩子保存有效句柄，按 `FEATURES` 顺序派发；句柄被删除后不再收到事件。

- [ ] **Step 1: Write the failing refresh contract test**

Create `packages/testing/specs/mechanism/page-observation/hooks.spec.ts`:

```ts
/**
 * A feature installed after the scheduler has started is reached by the next
 * event only after the registry announces the change; a feature dropped from
 * the registry is never called again.
 *
 * @capability page-observation
 * @features engine
 * @risk A late deferred feature misses events, or a retired feature keeps writing after its teardown.
 */
import { afterEach, expect, test } from 'vitest'
import { installScheduler } from '@dsh-claude-style/engine/scheduler'
import type { HostContext } from '@dsh-claude-style/engine/host'

const cleanups: (() => void)[] = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup()
})

const ctx = { get: () => undefined } as unknown as HostContext

test('refreshHandles brings a late feature into the event index and removes a retired one', () => {
  let calls = 0
  const ui = { retire: () => {} } as Record<string, unknown> & { schedule?: () => void; refreshHandles?: () => void; retire: () => void }
  cleanups.push(installScheduler(ctx, ui as never, ['mascot'], {
    copyChange: [],
    refresh: [],
    start() {},
    systemMotionChanged() {},
  }))
  ui.mascot = { onActivity() { calls += 1 } }
  ui.refreshHandles?.()
  document.dispatchEvent(new PointerEvent('pointerdown'))
  expect(calls).toBe(1)
  delete ui.mascot
  ui.refreshHandles?.()
  document.dispatchEvent(new PointerEvent('pointerdown'))
  expect(calls).toBe(1)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/testing/specs/mechanism/page-observation/hooks.spec.ts`
Expected: FAIL because `refreshHandles` is undefined and the first event does not reach the newly registered handle.

- [ ] **Step 3: Add the registry hook**

In `packages/engine/src/scheduler.ts`, extend `SchedulerCalls`:

```ts
  /** Rebuild the hook indexes after an install, retirement or switch. */
  refreshHandles?: () => void
```

Add typed index state after `passContentOnly`:

```ts
  type IndexedHook = Exclude<FeatureHook, 'teardown'>
  const hookNames: IndexedHook[] = ['sync', 'measure', 'owns', 'onPointerDown', 'close', 'onInput', 'onFocusIn', 'reposition', 'measureReposition', 'onCopyChange', 'onKey', 'onActivity']
  let hookIndex = new Map<IndexedHook, { name: Name, handle: FeatureHandle }[]>()
  let passSync: { name: Name, handle: FeatureHandle }[] = []
  let passMeasure: { name: Name, handle: FeatureHandle }[] = []

  function refreshHandles() {
    const next = new Map<IndexedHook, { name: Name, handle: FeatureHandle }[]>()
    for (const hook of hookNames) next.set(hook, [])
    passSync = []
    passMeasure = []
    for (const name of features) {
      const handle = handleOf(name)
      if (handle === undefined) continue
      for (const hook of hookNames) {
        if (typeof handle[hook] === 'function') next.get(hook)!.push({ name, handle })
      }
      if (typeof handle.sync === 'function') passSync.push({ name, handle })
      if (typeof handle.measure === 'function') passMeasure.push({ name, handle })
    }
    hookIndex = next
  }
  ui.refreshHandles = refreshHandles
  refreshHandles()
```

Change `dispatch` to iterate the index, filtering stale handles:

```ts
  function dispatch<K extends FeatureHook>(hook: K, ...args: Parameters<NonNullable<FeatureHandle[K]>>) {
    const indexed = hookIndex.get(hook as IndexedHook)
    if (indexed === undefined) return
    for (const entry of indexed) {
      if (ui[entry.name] !== entry.handle) continue
      const call = entry.handle[hook] as ((...args: unknown[]) => void) | undefined
      if (typeof call !== 'function') continue
      try { call.apply(entry.handle, args) } catch (error) { reportError(error) }
    }
  }
```

Replace the pass loops with `passMeasure` and `passSync`, still reading `skipOnContentOnly` from the live handle:

```ts
        for (const entry of passMeasure) {
          if (content && entry.handle.skipOnContentOnly === true) continue
          runMeasure(entry.name)
        }
```

and:

```ts
        for (const entry of passSync) {
          if (content && entry.handle.skipOnContentOnly === true) continue
          runSync(entry.name)
        }
```

Use the same `passMeasure` loop in the `!measured` branch.

At the end of `installScheduler`, call `ui.refreshHandles = refreshHandles`; in the teardown delete it:

```ts
    delete ui.refreshHandles
```

- [ ] **Step 4: Announce every registry change from the entry**

In `entry.ts`, after each `installed.push`, `installed.splice`, `delete ui[handle]`, deferred arrival and `applySwitch`, call:

```ts
    if (typeof ui.refreshHandles === 'function') ui.refreshHandles()
```

The exact locations are the `install` function's successful push, `retire`'s splice, `applySwitch`'s delete and splice, and the deferred arrival after `install(...)`. The scheduler is installed after the initial feature installs, so its own `refreshHandles()` covers the initial state.

- [ ] **Step 5: Run the hook and feature tests**

Run: `npx vitest run packages/testing/specs/mechanism/page-observation/hooks.spec.ts`
Run: `npm run verify -- --only case:chat-wait`
Run: `npm run verify -- --only case:chat-fold`
Expected: hook test passes; scheduler pass, event, retirement and deferred-install checks remain green.

- [ ] **Step 6: Build and commit**

Run: `npm run build`
Then:

```bash
git add packages/engine/src/scheduler.ts packages/client/src/entry.ts packages/client/src/core/scheduler.ts packages/testing/specs/mechanism/page-observation/hooks.spec.ts
git commit -m "perf: 调度器按钩子维护句柄索引"
```

---

### Task 15: 非 Claude 品牌下等待加载器使用虚拟状态（条件任务）

**Decision gate:** 本任务在品牌切换恰好落入 300 毫秒换场窗口时无法保证像素级等价，必须先获得读者对这处边界的明确同意。未同意时跳过本任务，第 1 至 14 项仍独立完成并通过零视觉变化验收。

**Files:**
- Modify: `packages/client/src/features/chat-wait/wait-loader.ts:1-419`
- Modify: `packages/client/src/features/chat-wait/chat-wait.ts:139-192`
- Test: `packages/testing/specs/logic/waiting-line/loader-state.spec.ts`
- Test: `packages/testing/smoke/probe/chat-wait.js`
- Test: `packages/testing/smoke/cases/chat.mjs`

**Interfaces:**
- Consumes: `LANES`、`nextMotion`、`timelineNow`、`motionMs`、`startWaitLoader`、`releaseWaitLoader`。
- Produces: `createVirtualLoader(start: number, random: () => number): { motion: WaitLoaderMotion; startedAt: number; handOverAt: number | null }`；`startWaitLoader(loader, options?: { virtual?: boolean })`；`resumeWaitLoader(loader, virtual, now)`。

- [ ] **Step 1: Write the failing virtual-state test**

Create `packages/testing/specs/logic/waiting-line/loader-state.spec.ts`:

```ts
/**
 * A loader hidden under a non-Claude brand keeps the same random motion and
 * rotation clock without building ten dots or measuring hand-over pairs. When
 * the brand returns, the visible lane starts at the phase the hidden clock
 * reached.
 *
 * @capability waiting-line
 * @features chat-wait
 * @risk The loader jumps to a new motion when the brand changes, or a hidden loader keeps a timer and dot work alive.
 */
import { expect, test } from 'vitest'
import { createVirtualLoader } from '@dsh-claude-style/client/pure'

test('the virtual loader keeps one motion and advances its rotation from the given clock', () => {
  const loader = createVirtualLoader(1000, () => 0.5)
  expect(loader.motion).toMatch(/bounce|line|orbit/)
  expect(loader.startedAt).toBe(1000)
  expect(loader.handOverAt).toBe(1000 + 10000)
  loader.advance(10_500)
  expect(loader.handOverAt).toBe(10_500 + 10000)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/testing/specs/logic/waiting-line/loader-state.spec.ts`
Expected: FAIL because `createVirtualLoader` is not exported.

- [ ] **Step 3: Add the virtual loader state**

In `wait-loader.ts`, add:

```ts
export interface VirtualLoader {
  readonly created: number
  readonly motion: WaitLoaderMotion
  handOverAt: number
  advance(now: number): void
}

export function createVirtualLoader(start: number, random: () => number = Math.random): VirtualLoader {
  const opening = LANES[Math.floor(random() * LANES.length)].motion
  const period = motionMs('--dsh-claude-period-dot-rotate')
  return {
    created: start,
    motion: opening,
    handOverAt: start + period,
    advance(now: number) {
      while (now >= this.handOverAt) {
        this.motion = nextMotion(this.motion)
        this.handOverAt += period
      }
    },
  }
}
```

Export from `pure.ts`:

```ts
export { createVirtualLoader } from './features/chat-wait/wait-loader'
export type { VirtualLoader } from './features/chat-wait/wait-loader'
```

- [ ] **Step 4: Gate DOM and animation work in the loader**

Add a virtual path to `startWaitLoader`:

```ts
const virtualLoaders = new WeakMap<HTMLElement, VirtualLoader>()

export function startWaitLoader(loader: HTMLElement, options?: { virtual?: boolean }) {
  if (options?.virtual === true) {
    if (virtualLoaders.has(loader)) return
    const virtual = createVirtualLoader(timelineNow())
    virtualLoaders.set(loader, virtual)
    const tick = () => {
      const state = virtualLoaders.get(loader)
      if (state === undefined || !loader.isConnected) return
      state.advance(timelineNow())
      window.setTimeout(tick, Math.max(0, state.handOverAt - timelineNow()))
    }
    window.setTimeout(tick, Math.max(0, virtual.handOverAt - timelineNow()))
    return
  }
  if (loaders.has(loader)) return
  // Existing DOM path unchanged.
  const opening = LANES[Math.floor(Math.random() * LANES.length)].motion
  const state: LoaderState = { motion: opening, timer: null, handOvers: 0 }
  loaders.set(loader, state)
  handOver(loader, state, null, opening)
  if (!motionReduced()) rotate(loader, state)
}

export function releaseWaitLoader(loader: HTMLElement) {
  virtualLoaders.delete(loader)
  const state = loaders.get(loader)
  if (state === undefined) return
  if (state.timer !== null) window.clearTimeout(state.timer)
  loaders.delete(loader)
}
```

In `chat-wait.ts`, build the loader as today but decide the start mode from the brand:

```ts
    const claude = readPrefs().brand === BRAND_CLAUDE
    startWaitLoader(loader, { virtual: !claude })
```

Keep the loader DOM built in both brands so `.dsh-claude-chat-wait-loader` remains present and the existing `display:none` rule receives the same node. On a brand change, the existing `subscribePrefs` callback calls `sync()`; add a loader sync there:

```ts
    for (const line of lines.values()) {
      if (readPrefs().brand === BRAND_CLAUDE) startWaitLoader(line.loader)
      else startWaitLoader(line.loader, { virtual: true })
    }
```

When switching from virtual to visible, `startWaitLoader` builds the DOM path. The visible loader must not replay the opening fade: set the current lane active, set every other lane resting, and set each dot's CSS animation `startTime` to the virtual loader's lane start. If the switch lands inside the 300 milliseconds after `handOverAt`, rebuild that one hand-over with its recorded start and leave the resulting animations at the elapsed frame. The hidden virtual clock keeps the chosen motion and the hand-over deadline. The existing loader smoke case asserts the visible lane, dots, animation name, duration, and seat after the switch; keep those assertions unchanged.

- [ ] **Step 5: Add the virtual/visible smoke assertion**

In `packages/testing/smoke/probe/chat-wait.js`, after the existing deepseek and claude-again readings, record:

```js
      r.wait.loaderSwitch = {
        deepseekDots: (r.wait.deepseek?.loader?.lanes || []).reduce(function (sum, lane) { return sum + (lane.opacity || []).length }, 0),
        claudeDots: (r.wait.claudeAgain?.loader?.lanes || []).reduce(function (sum, lane) { return sum + (lane.opacity || []).length }, 0),
      }
```

In `packages/testing/smoke/cases/chat.mjs`, add:

```js
    const switched = wait.loaderSwitch || {}
    check('the hidden loader comes back with the same three lanes and ten dots', switched.deepseekDots === 0 && switched.claudeDots === 10, JSON.stringify(switched))
```

The DeepSeek page hides the loader with CSS, so the visible reading still has the loader node; the virtual path has no dot children while hidden, and the Claude path has all ten after the switch. This assertion is part of the conditional task and does not change the strict acceptance of Tasks 1 to 14.

- [ ] **Step 6: Run the waiting line tests**

Run: `npx vitest run packages/testing/specs/logic/waiting-line/loader-state.spec.ts`
Run: `npm run verify -- --only feature:chat-wait`
Run: `npm run verify -- --only scenario:waitLine`
Expected: the virtual state test passes; the existing loader lane, dot count, animation name, duration, shadow, seat, reduced-motion and brand-switch checks pass.

- [ ] **Step 7: Build and commit**

Run: `npm run build`
Then:

```bash
git add packages/client/src/features/chat-wait/wait-loader.ts packages/client/src/features/chat-wait/chat-wait.ts packages/client/src/pure.ts packages/testing/specs/logic/waiting-line/loader-state.spec.ts packages/testing/smoke/probe/chat-wait.js packages/testing/smoke/cases/chat.mjs
git commit -m "perf: 非 Claude 品牌下等待加载器只走虚拟状态"
```

---

### Task 16: 统一测量与性能记录

**Files:**
- Modify: `docs/AB-PERFORMANCE.md:1-200`
- Test: none

**Interfaces:**
- Consumes: 前 15 个任务全部通过后的构建产物；现有 `idle-60`、`thinking-60`、`typing-1000-200`、`session-500` 场景。
- Produces: 同一机器、同一窗口尺寸下改动前后四项指标记录；未实测的格子保持 `待实测`。

- [ ] **Step 1: Run the four scenarios on the unmodified baseline**

Create a branch point note in `.debug/` with the commit hash and machine details. Run each scenario through the existing scenario runner and save the report under `.debug/`:

```text
node packages/testing/scenarios.mjs --scenario idle-60
node packages/testing/scenarios.mjs --scenario thinking-60
node packages/testing/scenarios.mjs --scenario typing-1000-200
node packages/testing/scenarios.mjs --scenario session-500
```

If the runner takes a different selector, use the exact names printed by `node packages/testing/scenarios.mjs --help`; record the command in the note.

- [ ] **Step 2: Run the same four scenarios on the finished branch**

Use the same machine, window size, page and build. Save the reports beside the baseline.

- [ ] **Step 3: Write only the measured values**

Update the eight `待实测` cells in `docs/AB-PERFORMANCE.md` with the measured main-thread busy time, long-task count, p95 frame time and scheduler pass count. Leave any cell that was not measured as `待实测`; do not estimate or interpolate.

- [ ] **Step 4: Record the comparison**

Add a short table under the existing measurement section with baseline and finished values, the ratio and the command names. Do not add a claim that a change is faster unless the table has the matching measured pair.

- [ ] **Step 5: Run the final gates**

Run:

```text
npm run build
npm run lint
npm run element-collections -- --check
npm run verify -- --full
```

Expected: all four commands exit 0. If `element-collections` fails because a new element-keyed collection was added, update `packages/testing/data/element-collections.json` with `npm run element-collections` and state the lifetime level in the source comment.

- [ ] **Step 6: Commit the measurements**

```bash
git add docs/AB-PERFORMANCE.md packages/testing/data/element-collections.json
git commit -m "docs: 记录零视觉变化性能改造结果"
```

If no element collection changed, leave the JSON file out of the commit.

---

## 计划自检

- 规格覆盖：15 个改造项分别对应 Task 1 至 Task 15；Task 15 带明确决策门，未确认时只执行前 14 项；排除项在第 4 节逐项记录，不进入实现。
- 占位扫描：计划中没有 `TBD`、`TODO`、`实现后续` 或 `补测试` 一类占位步骤；每个代码变更都有具体文件、代码片段和命令。
- 类型一致性：`waitTickPlan`、`createHomePanelMemo`、`createSearchSources`、`createVisibilityGate`、`createVirtualLoader` 的名称在设计与计划中一致；`observeSizes` 只在 Task 4 引入，Task 5 使用同一签名。
- 依赖顺序：Task 1 先于 Task 2 的 `chatWait` 跳过；Task 4 先于 Task 5 的共享订阅；Task 6 先于 `homeLayout` 跳过；Task 14 在 Task 2 之后，避免同时改动调度与句柄行为。
- 视觉约束：Task 1 至 14 不修改 CSS、动画参数、DOM 文本、焦点、滚动位置与首屏呈现；每个缓存都有失效来源，无法证明的条目进入排除表。Task 15 的换场窗口边界单独确认。

