# 恢复宿主自有的滚动跟随 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把滚动跟随整条交还 DSH 宿主：皮肤删去读者持有与增长写回，只保留流式位移、门的高度动画与一次按钮交还，使「回到底部后跳回旧位置」不再可能。

**Architecture:** 跟随的唯一真相是宿主写在根节点上的 `data-chat-following-tail` 与容器几何。`packages/engine/src/scroll-owner.ts` 收缩为来源排序、缓动与交还三件事；`chat-follow.ts` 用宿主标记加 `readerMovedSince` 的意图时钟决定何时交还；上限过程体改用逐体的末尾读数。

**Tech Stack:** TypeScript、esbuild、Vitest（浏览器模式）、Playwright、CSS。

## Global Constraints

- 不新增运行时依赖（D36）；React 与宿主包在运行时由宿主提供。
- 断言失败即抛错，不吞错，不静默回退（D12）；唯一的 try/catch 例外是宿主半的 schemastery 导入。
- 宿主选择器只写在 `packages/contracts/src/dom.ts`（D3）；皮肤自己的标记跟着它的功能走。
- 时间、缓动曲线与高于 9 的 z-index 从 `packages/client/src/theme/tokens.json` 读（D9）。
- 单个源文件 750 行是停止线；`chat-follow.ts` 现为 728 行，本次只减不增，新增逻辑放进 `packages/engine/`。
- 每个元素为键的集合要在 `packages/testing/data/element-collections.json` 留下记录（C1）。
- `lib/` 是构建产物，不手工编辑，也不提交（D47）。
- 改动以中文写提交信息，使用 conventional 前缀。
- 不运行验收；构建与打包完成后等待用户命令。

---

### Task 1: 滚动主人删去读者持有

**Files:**
- Modify: `packages/engine/src/scroll-owner.ts`
- Modify: `packages/engine/src/skin.ts:13`
- Modify: `packages/client/src/constants.ts:140`
- Modify: `packages/client/src/entry.ts:36`
- Modify: `scripts/build/source-tree.mjs:11`
- Test: `packages/testing/specs/mechanism/scroll-ownership/owner.spec.ts`

**Interfaces:**
- Consumes: `packages/engine/src/scroll-ease.ts` 的 `easeScroll`、`isScrollEasing`、`scrollEasePosition`、`scrollEnd`、`stopScrollEase`；`packages/engine/src/chat-dom.ts` 的 `conversationScroller`、`findFollowTailButton`。
- Produces: `ScrollSource = 'jump' | 'fold' | 'follow' | 'process'`；`joinScrollOwner()`、`writeScroll(container, value, source)`、`easeScrollFor(container, source, destination, wanted, lead?)`、`easeScrollToEndFor(container, source, wanted)`、`stopScrollFor(container, source?)`、`scrollPositionFor(container)`、`handBackFollow(source, options?)`、`readerMovedSince(since)`、`navigationMovedSince(since)`、`submissionHolds()`。除新增的 `navigationMovedSince` 外，名字与签名保持现状，调用处不需要跟着改。

- [ ] **Step 1: 写失败的规格**

`packages/testing/specs/mechanism/scroll-ownership/owner.spec.ts` 的开头注释改成新的主语：

```ts
/**
 * Who may move the conversation (D40, D95): writes and eases are ranked by source,
 * and the reader's own move is only a clock — the host owns whether content follows
 * the end. The skin never keeps a position of the reader's.
 *
 * @capability scroll-ownership
 * @features engine
 * @risk The skin writes a position the reader left back over the tail, or the reader's own scrolling stops the host from following again.
 */
import { afterEach, expect, test } from 'vitest'
import { adoptSkin } from '@dsh-claude-style/engine/skin'
import { easeScrollFor, easeScrollToEndFor, readerMovedSince, submissionHolds, writeScroll } from '@dsh-claude-style/engine/scroll-owner'
```

从 `owner.spec.ts` 删去这五个用例（它们断言的就是被删掉的状态）：`the reader holds the conversation until they come back to its end; only following sources are refused meanwhile`、`a jump to a turn holds the follow off until the reader comes back to the end, and marks the container`、`a hold whose position lands at the end stands until the reader moves toward it`、`the reader position survives the host pinning a growing stream to its end`、`a process body is held by a drag of its scrollbar, not by a press on its content`。

把 `scrollbar drag upward, upward keys, and content clicks keep the hold across growth pins` 换成只读意图时钟的版本：

```ts
test('a move that changes the position is the reader taking the scroll over, and a growth pin is not', async () => {
  setMotion(MOTION_FULL)
  join()
  const scroller = scrollBox(CONVERSATION_SCROLL_SELECTOR)
  scroller.scrollTop = scroller.scrollHeight
  await settledScroll(scroller)
  const since = performance.now()
  while (performance.now() === since) { /* wait for the next tick */ }

  // The host's own growth pin moves the position with no reader behind it.
  ;(scroller.firstElementChild as HTMLElement).style.height = '3200px'
  scroller.scrollTop = scroller.scrollHeight
  await settledScroll(scroller)
  expect(readerMovedSince(since)).toBe(false)

  // The reader's own wheel, scrollbar drag and upward key do move it.
  scroller.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: -120 }))
  expect(readerMovedSince(since)).toBe(true)
})
```

- [ ] **Step 2: 运行规格确认失败**

```bash
npx vitest run packages/testing/specs/mechanism/scroll-ownership/owner.spec.ts
```

Expected: FAIL，`@dsh-claude-style/engine/scroll-owner` 不再导出 `holdReader`／`readerHolds`／`readerScrollPosition`／`releaseReader`（此时这些导出还在，规格先因断言「持有」的行为失败；两种失败都说明规格先于实现）。

- [ ] **Step 3: 删去状态与入口**

`packages/engine/src/scroll-owner.ts` 里删去下列声明与函数（整段删除，不留注释残片）：`PROCESS_RELEASE_THRESHOLD_PX`、`FOLLOW_TAIL_ACTIVATION_TYPE`、`TOUCH_END_TYPES`、`UPWARD_SCROLL_KEYS`、`held`、`readerPositions`、`readerFloors`、`heldTowardEnd`、`markedScrollers`、`touchContactY`、`scrollbarDrag`、`contactY`、`forgetDetached`、`syncHoldMark`、`setHeld`、`floorOf`、`isHostGrowthPin`、`readerHolds`、`releaseReader`、`releaseAtTail`、`holdReader`、`noteScroll`、`noteFollowTailActivation`、`endScrollbarDrag`、`beginScrollbarDrag`。

`noteIntent` 收缩成只记时钟：

```ts
/**
 * The reader moved the page himself: a wheel, a touch, a pointer or a scroll
 * key. Only the clock is kept — the host owns whether content follows the end,
 * and the skin answers `readerMovedSince` from this reading alone.
 * @param event - the document's intent, read in the capture phase.
 */
function noteIntent(event: Event) {
  if (!isReaderScrollIntent(event)) return
  if (!MOVING_INTENT_TYPES.has(event.type)) return
  const scroller = conversationScroller()
  if (scroller === null || !intentReaches(scroller, event)) return
  if (event.type === 'pointerdown' && !pressMovesScroll(scroller, event)) return
  lastMovingIntentAt = performance.now()
}
```

`intentReaches` 与 `pressMovesScroll` 沿用上游的判定：指针或滚轮要落在对话滚动容器内，按键要在没有别的东西获得焦点时发生；指针按压只认滚动条上的那一按与中键，落在一段文字上的一按是选择文字。`isScrollbarStrip` 因此保留在 `packages/engine/src/chat-dom.ts`，它的规格也保留。

`isReaderScrollIntent` 保留；`INTENT_TYPES` 保留原值（`beforematch`、`touchmove` 等仍要进时钟的窗口判断，其中只有 `MOVING_INTENT_TYPES` 记时刻）。

`claim` 删去跟随来源的拒绝：

```ts
/** Whether `source` may move `container` now. */
function claim(container: Element, source: ScrollSource) {
  claimConversation()
  const running = runningSource(container)
  return running === undefined || SCROLL_SOURCE_RANK[source] >= SCROLL_SOURCE_RANK[running]
}
```

`easeScrollFor` 的 `wanted` 包装删去持有判断：

```ts
easeScroll(container, destination, wanted, lead)
```

`FOLLOWING_SOURCES` 删去（没有调用者了）。

`writeScroll` 与 `easeScrollFor` 在来源为 `jump` 时记下 `lastNavigationAt = performance.now()`：

```ts
/** When a feature last took the position to a place the reader picked: a turn, the answer's first line. */
let lastNavigationAt = 0

/** Whether a feature put the position somewhere the reader picked after `since` (a performance.now() reading). */
export function navigationMovedSince(since: number) {
  return lastNavigationAt > since
}
```

`joinScrollOwner` 只留意图、提交观测与挥手：

```ts
export function joinScrollOwner() {
  members += 1
  if (members === 1) {
    for (const type of INTENT_TYPES) document.addEventListener(type, noteIntent, { capture: true, passive: true })
    stopSubmissionWatch = subscribeMutations(document.body, { childList: true, subtree: true }, noteBodyChanges)
  }
  let left = false
  return () => {
    if (left) return
    left = true
    members -= 1
    if (members > 0) return
    ownerGeneration += 1
    for (const type of INTENT_TYPES) document.removeEventListener(type, noteIntent, true)
    if (stopSubmissionWatch !== null) stopSubmissionWatch()
    stopSubmissionWatch = null
  }
}
```

`ScrollSource` 与排序：

```ts
export type ScrollSource = 'jump' | 'fold' | 'follow' | 'process'

/** Each source's rank; a higher rank's claim stands over a lower one's. */
const SCROLL_SOURCE_RANK: Record<ScrollSource, number> = {
  process: 1,
  follow: 2,
  fold: 3,
  jump: 4,
}
```

模块注释改成：

```ts
/**
 * The chat area's scroll positions have one writer (D40): features ask, this module decides on the spring of scroll-ease.ts. Sources rank jump > fold > follow > process, and a request below the ease running is refused.
 * Whether content follows the end belongs to the host alone (D100): nothing here records a reader position, and the reader's own wheel is kept only as an instant (`readerMovedSince`) so a hand-back can tell a layout's loss of the follow from his choice to read higher up. While content streams, the host's follow pins the end and the follow feature slides what the pin pushed up (D95).
 */
```

`skin.ts` 删去 `readerHold` 字段与它的注释；`constants.ts` 删去 `READER_HOLD_ATTR` 及其注释；`entry.ts` 删去 `READER_HOLD_ATTR` 的导入项与 `readerHold: READER_HOLD_ATTR,` 一行；`scripts/build/source-tree.mjs` 的 `HANDED_OVER` 改成：

```js
const HANDED_OVER = new Set(['quiet', 'part', 'holds', 'account', 'hero'])
```

- [ ] **Step 4: 更新滚动主人的词汇规格**

`packages/testing/specs/fixtures/vocabulary.ts` 删去 `READER_HOLD_ATTR` 的导出与 `readerHold` 字段：

```ts
export const TEST_SKIN: SkinSeam = {
  packageName: 'dsh-test-skin',
  quiet: QUIET_ATTR,
  motionReduced: () => document.body.getAttribute(MOTION_ATTR) === MOTION_REDUCED,
}
```

- [ ] **Step 5: 运行规格确认通过**

```bash
npx vitest run packages/testing/specs/mechanism/scroll-ownership/owner.spec.ts
```

Expected: PASS，全部用例通过。

- [ ] **Step 6: 提交**

```bash
git add packages/engine/src/scroll-owner.ts packages/engine/src/skin.ts packages/client/src/constants.ts packages/client/src/entry.ts scripts/build/source-tree.mjs packages/testing/specs/fixtures/vocabulary.ts packages/testing/specs/mechanism/scroll-ownership/owner.spec.ts
git commit -m "refactor: 滚动主人删去读者持有，跟随归宿主"
```

---

### Task 2: 跟随的交还改按意图时钟

**Files:**
- Modify: `packages/client/src/features/chat-follow/chat-follow.ts:140-547`
- Test: `packages/testing/specs/mechanism/scroll-ownership/return.spec.ts`

**Interfaces:**
- Consumes: Task 1 的 `readerMovedSince`、`handBackFollow`、`joinScrollOwner`、`submissionHolds`。
- Produces: `createChatFollowGuard(options: { foldBusy: () => boolean, submissionHeld: () => boolean })` 签名不变；`FOLLOW_MIN_INTERVAL_MS`、`FOLLOW_ACTIVITY_GRACE_MS`、`FOLLOW_FOLD_WAIT_MS`、`FOLLOW_FOLD_WAIT_ATTEMPTS`、`FOLLOW_TAIL_ATTR`、`FOLLOW_TAIL_AIR_PX` 保持不变。

- [ ] **Step 1: 写失败的规格**

`return.spec.ts` 整体改写成宿主标记与按钮交还的规格：

```ts
/**
 * The skin hands the follow back to the host's own control (D40, D100): while the
 * reader has not moved the page himself, a lost follow is given back by pressing
 * the host's back-to-end button once, and the growth after it stays at the tail.
 *
 * @capability scroll-ownership
 * @features engine
 * @risk After a layout change takes the host's follow away, content keeps growing above the tail; or the skin presses the host's button while the reader is reading higher up.
 */
import { afterEach, expect, test } from 'vitest'
import { adoptSkin } from '@dsh-claude-style/engine/skin'
import { handBackFollow } from '@dsh-claude-style/engine/scroll-owner'
import { FOLLOWING_TAIL_ATTRIBUTE } from '@dsh-claude-style/contracts/dom'
import { TEST_SKIN } from '../../fixtures/vocabulary'
import { createScrollOwnerFixture } from '../../fixtures/scroll-owner'

adoptSkin(TEST_SKIN)

const wait = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds))
const cleanups: (() => void)[] = []
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()!()
})

const { scrollBox, join } = createScrollOwnerFixture(cleanups)

/**
 * The host's frame around the follow button: the column fills the scroller and
 * the button stands beside the frame, outside the scroller (engine/chat-dom.ts's
 * findFollowTailButton). Its click is the host's returnToBottom: the follow mark
 * comes on and the position goes to the tail.
 */
function followFrame() {
  join()
  const scroller = scrollBox()
  const column = document.createElement('div')
  column.setAttribute('data-chat-flow', '')
  column.style.height = '2000px'
  scroller.replaceChildren(column)
  const button = document.createElement('button')
  button.type = 'button'
  const presses: number[] = []
  button.addEventListener('click', () => {
    presses.push(performance.now())
    column.parentElement?.parentElement?.parentElement?.setAttribute(FOLLOWING_TAIL_ATTRIBUTE, '')
  })
  const frame = document.createElement('div')
  const slot = document.createElement('div')
  const outer = document.createElement('div')
  slot.append(button)
  frame.append(scroller)
  outer.append(frame, slot)
  document.body.append(outer)
  cleanups.push(() => outer.remove())
  return { scroller, column, button, presses }
}

test('a lost follow is handed back by one press of the host button', async () => {
  const { scroller, button, presses } = followFrame()
  scroller.scrollTop = 0
  handBackFollow('follow')
  await wait(700)
  expect(presses).toHaveLength(1)
  expect(button.isConnected).toBe(true)
})

test('the reader who moved the page himself gets no press', async () => {
  const { scroller, presses } = followFrame()
  scroller.scrollTop = 0
  handBackFollow('follow', { stillWanted: () => false })
  await wait(700)
  expect(presses).toHaveLength(0)
})

test('the hand-back walks the position to the end before it presses', async () => {
  const { scroller, button, presses } = followFrame()
  scroller.scrollTop = 0
  handBackFollow('follow')
  await wait(700)
  expect(presses).toHaveLength(1)
  expect(scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop).toBe(0)
})
```

- [ ] **Step 2: 运行规格确认失败**

```bash
npx vitest run packages/testing/specs/mechanism/scroll-ownership/return.spec.ts
```

Expected: FAIL，原来的用例从 `scroll-owner` 导入已删除的 `readerHolds`/`readerScrollPosition`，模块加载就失败。

- [ ] **Step 3: 删去增长写回与持有判断**

`packages/client/src/features/chat-follow/chat-follow.ts`：

导入行改成（去掉 `readerHolds`、`readerScrollPosition`，加入 `readerMovedSince` 与 `navigationMovedSince`）：

```ts
import { SCROLL_EASE_LEAD_PX, handBackFollow, joinScrollOwner, navigationMovedSince, readerMovedSince, submissionHolds } from '@dsh-claude-style/engine/scroll-owner'
```

第一行的常量导入去掉 `READER_HOLD_ATTR`：

```ts
import { CHAT_FOLLOW_ATTR, FOLLOW_HOLD_ATTR } from '../../constants'
```

删去 `readerAway`（原 `:158-162`）、`holdGrowth`（原 `:437-455`），并把 `slideWanted` 的最后一段改成：

```ts
    // The host's own mark that it follows the end, an attribute read: without
    // it this frame's growth was not pinned, and sliding would move content
    // that never went up.
    return column.closest(FOLLOWING_TAIL_SELECTOR) !== null
```

`onSlideResize` 的后半段改成：

```ts
    holdCheck()
    if (column === null || grew === 0) return
    if (!slideWanted(column)) return
    if (moved < 0) stopSlide()
    if (moved > 0) startSlide(column, scroller, moved)
```

`holdCheck` 改成：

```ts
  const holdCheck = () => {
    if (foldBusy()) {
      slideSync()
      if (slideColumn !== null) markHold(slideColumn)
      return
    }
    releaseHold()
  }
```

新增跟随标记的时刻与交还的门：

```ts
  /** When the host last said it follows the end; the clock a hand-back is measured against. */
  let followSeenAt = 0

  /** Take the host's word for its follow, and the moment it was taken. */
  const noteFollowSeen = (atTail: boolean) => {
    if (atTail) followSeenAt = performance.now()
  }
```

`noteTailIfNear` 改成同时记时刻：

```ts
  /** Whether the conversation scroller currently stands at or follows its tail, and when that was last true. */
  const noteTailIfNear = (scroller: Element | null) => {
    if (scroller === null) return
    const atTail = scroller.querySelector(FOLLOWING_TAIL_SELECTOR) !== null
      || scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop <= FOLLOW_THRESHOLD_PX
    noteFollowSeen(atTail)
    if (seenAtTail || !atTail) return
    seenAtTail = true
  }
```

`ensure` 改成：

```ts
  const ensure = (attempt?: number) => {
    if (stopped) return
    const scroller = conversationScroller()
    if (scroller === null) return
    noteTailIfNear(scroller)
    // A conversation opened onto a saved historical position has never followed the tail.
    if (!seenAtTail) return
    // The reader moved the page himself since the host last followed, or a
    // feature took it to a place he picked: where he reads is his answer, and
    // the skin does not press the host's button.
    if (readerMovedSince(followSeenAt) || navigationMovedSince(followSeenAt)) return
    // More than a screen off the end is the reader reading higher up, not a follow that fell one step behind.
    if (scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop > scroller.clientHeight) return
    if (foldBusy()) {
      const tries = typeof attempt === 'number' ? attempt : 0
      if (tries >= FOLLOW_FOLD_WAIT_ATTEMPTS) return
      if (foldWaitTimer !== null) window.clearTimeout(foldWaitTimer)
      foldWaitTimer = window.setTimeout(() => {
        foldWaitTimer = null
        ensure(tries + 1)
      }, FOLLOW_FOLD_WAIT_MS)
      return
    }
    const now = performance.now()
    if (now - lastEnsureAt < FOLLOW_MIN_INTERVAL_MS) return
    lastEnsureAt = now
    handBackFollow('follow', { stillWanted: () => !stopped && !readerMovedSince(followSeenAt) && !navigationMovedSince(followSeenAt) })
  }
```

`onRecords` 里删去 `READER_HOLD_ATTR` 分支，并把 `attributeFilter` 改成：

```ts
    attributeFilter: [ROW_PHASE_ATTRIBUTE, FOLLOWING_TAIL_ATTRIBUTE],
```

`FOLLOWING_TAIL_ATTRIBUTE` 的到达也要记时刻，在原有分支前加一行：

```ts
        if (record.attributeName === FOLLOWING_TAIL_ATTRIBUTE) {
          if (record.target instanceof Element && record.target.hasAttribute(FOLLOWING_TAIL_ATTRIBUTE)) followSeenAt = performance.now()
          else guardSeen = true
          continue
        }
```

模块注释里删去「the reader's own message is still taking its place」之外与持有相关的句子，并把 `createChatFollowGuard` 的说明改成：

```ts
/**
 * Watch the whole page for the moments that lose the host's follow, and hand
 * the position back at each of them while the reader has not moved it himself;
 * while content streams, slide what the host's pin pushed up instead of letting
 * it jump in one frame (D95). Every position write goes through the scroll owner
 * (D40).
 */
```

- [ ] **Step 4: 运行规格确认通过**

```bash
npx vitest run packages/testing/specs/mechanism/scroll-ownership/return.spec.ts
```

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add packages/client/src/features/chat-follow/chat-follow.ts packages/testing/specs/mechanism/scroll-ownership/return.spec.ts
git commit -m "fix: 跟随交还改按读者意图时钟，删去增长写回"
```

---

### Task 3: 上限过程体按末尾读数跟随

**Files:**
- Modify: `packages/client/src/features/chat-follow/process-follow.ts`
- Delete: `packages/testing/specs/mechanism/scroll-ownership/touch-hold.spec.ts`
- Modify: `packages/testing/data/element-collections.json`
- Modify: `packages/testing/smoke/probe/chat-follow.js:298-330`
- Modify: `packages/testing/smoke/cases/chat.mjs:118-124`
- Modify: `packages/testing/data/bounds.json:93-98`

**Interfaces:**
- Consumes: `easeScrollToEndFor(container, 'process', wanted)`、`joinScrollOwner()`、`stopScrollFor(container, 'process')`。
- Produces: `CATCH_UP_GAP_PX = 40` 不变；`createChatProcessFollow()` 签名不变。

- [ ] **Step 1: 写失败的规格**

新建 `packages/testing/specs/mechanism/scroll-ownership/process-body.spec.ts`。规格从 `@dsh-claude-style/client/pure` 读被测函数，因此先把它加进 `packages/client/src/pure.ts` 的导出：

```ts
export { CATCH_UP_GAP_PX, createChatProcessFollow } from './features/chat-follow/process-follow'
```

规格本体：

```ts
/**
 * A capped process body follows its own end while the content streams (D40,
 * D100). The reader who scrolls it away is not chased; once he brings it back to
 * its end, the next growth follows again.
 *
 * @capability scroll-ownership
 * @features engine
 * @risk A streaming tool body leaves the reader's own reading of it dragged to its end, or stops following after the reader scrolled back.
 */
import { afterEach, expect, test } from 'vitest'
import { adoptSkin } from '@dsh-claude-style/engine/skin'
import { CATCH_UP_GAP_PX, createChatProcessFollow } from '@dsh-claude-style/client/pure'
import { PROCESS_BODY_SELECTOR, PROCESS_CONTENT_SELECTOR } from '@dsh-claude-style/contracts/dom'
import { attach } from '../../fixtures/host-markup'
import { TEST_SKIN } from '../../fixtures/vocabulary'

adoptSkin(TEST_SKIN)
const wait = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds))
const cleanups: (() => void)[] = []
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()!()
})

/** A capped body with a 2000px content layer, the shape the host mounts. */
function bodyFixture() {
  const body = attach(document.body, PROCESS_BODY_SELECTOR)
  body.style.cssText = 'height:100px;overflow-y:auto'
  const content = attach(body, PROCESS_CONTENT_SELECTOR)
  content.style.height = '2000px'
  cleanups.push(() => body.remove())
  return { body, content }
}

const gapOf = (body: HTMLElement) => Math.round(body.scrollHeight - body.clientHeight - body.scrollTop)

test('content growing under a body at its end is walked back to the end', async () => {
  const stop = createChatProcessFollow()
  cleanups.push(stop)
  const { body, content } = bodyFixture()
  body.scrollTop = body.scrollHeight
  await wait(80)
  content.style.height = '3000px'
  await wait(600)
  expect(gapOf(body)).toBeLessThanOrEqual(CATCH_UP_GAP_PX)
})

test('a body the reader scrolled away is left where he put it', async () => {
  const stop = createChatProcessFollow()
  cleanups.push(stop)
  const { body, content } = bodyFixture()
  body.scrollTop = body.scrollHeight
  await wait(80)
  body.scrollTop = 300
  await wait(80)
  content.style.height = '3000px'
  await wait(600)
  expect(body.scrollTop).toBe(300)
})
```

- [ ] **Step 2: 运行规格确认失败**

```bash
npx vitest run packages/testing/specs/mechanism/scroll-ownership/process-body.spec.ts
```

Expected: FAIL，`body the reader scrolled away` 用例里位置被追到末尾（`process-follow.ts` 尚未接入末尾读数）。

- [ ] **Step 3: 接入末尾读数**

`packages/client/src/features/chat-follow/process-follow.ts` 的导入改成：

```ts
import { easeScrollToEndFor, joinScrollOwner, stopScrollFor } from '@dsh-claude-style/engine/scroll-owner'
```

删去 `catchUp` 里的持有判断，新增读数与滚动监听：

```ts
  /** Whether each body was at its own end when it was last read. */
  const atEnd = new WeakMap<Element, boolean>()

  /** The body followed its end before this growth, so this growth is walked back to it. */
  const catchUp = (body: Element) => {
    if (!followable(body)) return
    const gap = gapOf(body)
    const wasAtEnd = atEnd.get(body) ?? gap <= CATCH_UP_GAP_PX
    atEnd.set(body, gap <= CATCH_UP_GAP_PX)
    if (!wasAtEnd || gap <= CATCH_UP_GAP_PX) return
    // Ease rather than jump; reduced motion writes the position directly.
    easeScrollToEndFor(body, 'process', () => !stopped && followable(body))
  }

  /**
   * The reader's own reading of a body: away from the end, the next growth is
   * his to keep; back at the end, the body follows again from the growth after.
   * The host reads the outer scroller the same way (use-scroll-follow.ts);
   * a body has no follow button of its own, so this reading stands in for it.
   */
  const onBodyScroll = (event: Event) => {
    const body = event.currentTarget
    if (body instanceof Element) atEnd.set(body, gapOf(body) <= CATCH_UP_GAP_PX)
  }
```

`syncBody` 里登记与撤回监听：

```ts
  const syncBody = (body: Element) => {
    const content = body.querySelector(PROCESS_CONTENT_SELECTOR)
    let entry = watched.get(body)
    if (entry === undefined) {
      entry = { content: null, stopBody: observeSize(body, onResize), stopContent: null }
      body.addEventListener('scroll', onBodyScroll, { passive: true })
      watched.set(body, entry)
    } else if (entry.content === content) {
      return
    }
    if (entry.stopContent !== null) entry.stopContent()
    entry.content = content
    entry.stopContent = content === null ? null : observeSize(content, onResize)
  }
```

`sync` 与拆除里一并摘掉监听与读数：

```ts
      watched.delete(body)
      body.removeEventListener('scroll', onBodyScroll)
      atEnd.delete(body)
      entry.stopBody()
```

```ts
    for (const [body, entry] of watched) {
      body.removeEventListener('scroll', onBodyScroll)
      atEnd.delete(body)
      entry.stopBody()
      if (entry.stopContent !== null) entry.stopContent()
      stopScrollFor(body, 'process')
    }
```

模块注释改成：

```ts
/**
 * Keep a capped process body at its end while content streams. Beyond the
 * threshold the scroll owner eases past the host's slow smooth scroll (D40);
 * the body follows only while its own last reading was its end, so a reader who
 * scrolled it away keeps his place (D100).
 */
```

删去 `touch-hold.spec.ts`：它的七个用例全部以读者持有为前提（触屏方向、按住不滑动、过程体拖动持有），这些状态已不存在。

- [ ] **Step 4: 更新冒烟探针与上限记录**

`packages/testing/smoke/probe/chat-follow.js` 删去 `holdBlock` 一段（原 `:296-330`，从 `// A reader holding the conversation himself (#230).` 到 `runningRow.remove()` 之前），只留清理部分，并把 `r.chatFollow.hold` 的赋值整行删去。

`packages/testing/smoke/cases/chat.mjs` 删去 hold 检查：

```js
    // The capped body walks to its end instead of jumping: the recording starts
    // far off, every frame closes on it, and the last one is at the end.
```

同时删去 `follow.hold` 相关的 `const hold` 与那条 `check(...)`。

`packages/testing/data/bounds.json` 删去这一条：

```json
    {
      "name": "followHoldGrowthPx",
      "value": 100,
      "reason": "The growth a reader holding the conversation keeps. The probe presses on the column, grows it by a 120px block and pins the end the way the host's own follow does, so the position put back under him reads most of that block; a hold the pin won reads the end, where the pin left it."
    },
```

`packages/testing/scenarios/reader-scroll.mjs` 把持有一节换成宿主标记：

```js
/** The host's own mark that content follows the end (FOLLOWING_TAIL_SELECTOR, contracts/dom.ts). */
const FOLLOWING_TAIL = '[data-chat-following-tail]'
```

`READER_HOLD` 常量删去；`duringTurn` 的等待改成

```js
      await page.waitForFunction((marks) => {
        if (document.querySelector(marks.followingTail) !== null) return false
        const scroller = document.querySelector(marks.scroller)
        return scroller !== null && scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop > 0
      }, { followingTail: FOLLOWING_TAIL, ...HOST }, { timeout: 5000 })
```

断言里两处 `heldNow` 改成

```js
      const followingNow = await page.evaluate((marks) => document.querySelector(marks.followingTail) !== null, { followingTail: FOLLOWING_TAIL })
```

```js
        check('滚动之后宿主不再跟随末尾', left !== null && !followingNow, `the host follows the end at the end of the turn: ${followingNow}`),
```

```js
        check('宿主的跟随一直关着', left !== null && !followingNow, `the host follows the end at the end of the turn: ${followingNow}`),
```

`packages/testing/scenarios/door-pin.mjs` 的 `SKIN.readerHold` 删去，`watch` 里 `reader: scroller !== null && scroller.matches(marks.readerHold)` 改成 `following: document.querySelector('[data-chat-following-tail]') !== null`，`doorFrames` 的过滤条件 `!frame.reader` 改成 `frame.following`。

- [ ] **Step 5: 更新元素集合记录**

```bash
npm run element-collections
```

Expected: `process-follow.ts` 由 1 变为 2（`watched` 与 `atEnd`），`scroll-owner.ts` 由 2 变为 0。

- [ ] **Step 6: 运行规格确认通过**

```bash
npx vitest run packages/testing/specs/mechanism/scroll-ownership
```

Expected: PASS，`process-body.spec.ts` 两个用例通过，`owner.spec.ts` 与 `return.spec.ts` 全部通过。

- [ ] **Step 7: 提交**

```bash
git add packages/client/src/features/chat-follow/process-follow.ts packages/testing/specs/mechanism/scroll-ownership packages/testing/smoke/probe/chat-follow.js packages/testing/smoke/cases/chat.mjs packages/testing/data/bounds.json packages/testing/data/element-collections.json packages/testing/scenarios/reader-scroll.mjs packages/testing/scenarios/door-pin.mjs
git commit -m "fix: 上限过程体按末尾读数跟随，删去触屏持有规格"
```

---

### Task 4: 其余写位置的入口交还宿主

**Files:**
- Modify: `packages/client/src/features/chat-anchor/chat-anchor.ts:110`, `:79`
- Modify: `packages/client/src/features/turn-nav/turn-nav.ts:11`, `:487`
- Modify: `packages/client/src/features/composer/composer.ts:454-459`, `:487`
- Modify: `packages/client/src/features/question-card/question-card.ts:121`
- Modify: `packages/client/src/features/chat-wait/chat-wait.css:15-16`, `:32-33`

**Interfaces:**
- Consumes: Task 1 的 `writeScroll`、`easeScrollFor`、`readerMovedSince`、`joinScrollOwner`。
- Produces: 三个功能都不再调用 `holdReader`；`chat-anchor.ts` 的 `grow` 门只剩结束与读者移动两个条件。

- [ ] **Step 1: 改 `chat-anchor.ts`**

导入改成：

```ts
import { joinScrollOwner, readerMovedSince, writeScroll } from '@dsh-claude-style/engine/scroll-owner'
```

`grow` 的门改成：

```ts
    if (readerMovedSince(anchoredAt)) return stopFollow()
```

`frame.scroll` 删去 `holdReader(scroller)` 一行，并把注释改成：

```ts
      // The write is the reader's own place: the host reads it as his movement
      // and turns its own follow off, so nothing stands beside it (D100).
      anchored = intent.row
      anchoredAt = performance.now()
      writeScroll(scroller, intent.top, 'jump')
```

模块注释里删去「and a hold after it, so the following sources and the stream slide leave the position where the answer begins」，改成：

```ts
 * The move is the owner's: a jump, the way the turn navigator's walk to a turn
 * the reader picked is. The host's sampling reads the write as the reader's own
 * movement and turns its follow off, so the stream slide leaves the position
 * where the answer begins (D40, D95). A reader away from the tail is not moved
 * at all. One anchor per answer row.
```

D84 规格里的两处「持有」也随之失效；规格文件树里没有 `chat-anchor` 的机制规格，行为由 `packages/testing/smoke/cases/chat-anchor.mjs` 与 D84 的 bounds 承担。

- [ ] **Step 2: 改 `turn-nav.ts`**

导入行删去 `holdReader`：

```ts
import { easeScrollFor, scrollPositionFor, writeScroll } from '@dsh-claude-style/engine/scroll-owner'
```

`jumpTo` 改成：

```ts
  function jumpTo(turn: number) {
    host.jumpToTurn(turn, (scroller, before) => {
      // The host's own navigation turns its follow off before it lands
      // (use-chat-navigation.ts's pauseFollowing), so the next burst of output
      // cannot drag the reader back to the end (D100). Landing at the end turns
      // it back on from the host's own scroll reading.
      glideLanding(scroller, before)
      landing = { turn, since: Date.now() }
      // A loaded turn has landed by now; one outside the window lands when
      // its rows arrive, which a pass sees.
      stampLanding()
      scheduleRefresh()
    })
  }
```

- [ ] **Step 3: 删去 composer 的末尾写入**

`packages/client/src/features/composer/composer.ts` 删去 `followTranscript` 整个函数与其注释（`:447-459`），并删去 `reposition` 里的调用：

```ts
  ui.composer = {
    sync: syncComposer,
    /** Whether the page shows the hero composer, as of this pass. */
    isHero() { return hero },
    /** The hero page's composer card as of this pass, or null off the hero page. */
    heroCard() { return heroCard },
    /** Every composer card on the page, the sidebar's own included. */
    cards() { return cards.all() },
    /** Whether the composer restyle applies to the page shown, as of this pass. */
    isActive() { return active },
    /** Whether the studio home layout owns the hero page. */
    isStudioHome() { return studioHome },
    /** Whether the composer is restyled but the chat tab is not up, as of this pass. */
    isChatHidden() { return chatHidden },
```

`reposition` 改成：

```ts
    /** The composer card changed size: measure the card, and let the host's own follow decide the transcript. */
    reposition(reason: 'viewport' | 'composer') {
      responsive.measure()
    },
```

`.dsh-claude-chat-follow` 的注释里那句「回到底部按钮落在输入框上方」保持；`composer.manifest.ts` 的 `contracts` 里 `chat.scroller` 若因此没有读者，保留（同一清单还读 `chat.content` 的位置）；构建的契约检查会指出未使用者，按提示删。

- [ ] **Step 4: 删去问题卡片的末尾写入**

`packages/client/src/features/question-card/question-card.ts` 的 `place` 里删去：

```ts
    const followsTail = scroller !== null && scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 150
```

与

```ts
    if (followsTail && scroller !== null) writeScroll(scroller, scroller.scrollHeight, 'composer')
```

以及 `writeScroll` 的导入项。卡片的插入位置不变，高度变化由宿主的 `ResizeObserver` 交给它自己的跟随。

- [ ] **Step 5: 改等待行的钉住条件**

`packages/client/src/features/chat-wait/chat-wait.css` 的两组选择器删去 `:not([data-dsh-claude-reader-hold])`：

```css
body[data-dsh-claude-style][data-dsh-claude-chat-follow] [data-conversation-scroll] [data-chat-following-tail] [data-chat-running][data-dsh-claude-wait-tail],
body[data-dsh-claude-style][data-dsh-claude-chat-follow] [data-conversation-scroll] [data-dsh-claude-follow-hold] [data-chat-running][data-dsh-claude-wait-tail] {
```

```css
body[data-dsh-claude-style][data-dsh-claude-chat-follow] [data-conversation-scroll] [data-chat-following-tail] [data-chat-running][data-dsh-claude-wait-tail]::after,
body[data-dsh-claude-style][data-dsh-claude-chat-follow] [data-conversation-scroll] [data-dsh-claude-follow-hold] [data-chat-running][data-dsh-claude-wait-tail]::after {
```

文件头的注释改成：

```css
   The pin needs the body's chat follow mark (CHAT_FOLLOW_ATTR) and the row's own
   tail mark — a card mounted after the row takes the tail mark away and leaves
   both in ordinary flow. Under the follow mark the host's own follow attribute,
   or the glide's hold mark (FOLLOW_HOLD_ATTR) while a door rolls, says the tail
   is followed; the reader's own reading turns the host's follow off, and the pin
   goes with it (D100). */
```

- [ ] **Step 6: 构建，看契约与清单检查**

```bash
npm run build
```

Expected: 构建通过。若 `chat-dom.ts` 的 `isScrollbarStrip` 不再有使用者，`npm run lint` 会在下一步指出；此时从 `chat-dom.ts` 删去它与 `chat-dom.spec.ts` 里的第三个用例。

- [ ] **Step 7: 提交**

```bash
git add packages/client/src/features/chat-anchor/chat-anchor.ts packages/client/src/features/turn-nav/turn-nav.ts packages/client/src/features/composer/composer.ts packages/client/src/features/question-card/question-card.ts packages/client/src/features/chat-wait/chat-wait.css
git commit -m "refactor: 锚点、轮次跳转与输入框增长交还宿主的跟随"
```

---

### Task 5: 文档与决策

**Files:**
- Create: `docs/adr/D100-scroll-follow-belongs-to-host.md`
- Modify: `docs/adr/D95-stream-slide-counter-pins.md`
- Modify: `docs/adr/D84-answer-first-line.md`
- Modify: `docs/ARCHITECTURE.md`
- Create: `docs/changes/host-owned-scroll-follow.json`
- Modify: `docs/tests/2026-11-12-desktop-notification-scroll.md`

**Interfaces:**
- Consumes: Task 1 到 Task 4 的最终行为。
- Produces: `docs/adr/README.md` 由 `npm run docs:index` 重新生成。

- [ ] **Step 1: 写 D100**

```markdown
# D100. 滚动跟随归宿主，皮肤不保存读者的位置

- **取代**：D99

## 背景

读者在长会话里滚到上方，按下宿主的「回到底部」按钮，再发送消息。D99 让滚动主人在文档捕获阶段听见这次点击并结束读者持有，其余行为保持上游 0.20.3 的写法：读者持有某容器期间，增长写回按 `readerPositions` 把旧位置写回容器。

这套结构要求皮肤与宿主各持一份跟随状态，并在每个时刻保持一致。二者之间只有一次点击可以被听见，按钮的定位、容器的定位与随后的增长都在它之后。宿主每次都把末尾写到容器并删除保存的位置，皮肤每次都按旧位置写回，两条写入互相覆盖。

宿主的跟随状态是唯一的：`use-chat-reading.ts` 的 `followingTail`、根节点上的 `data-chat-following-tail`、`followTail()` 一条写末尾的路径，以及每次写到末尾时 `store.save(null)`。它没有读者持有这个概念，读者滚开时由 `onScroll` 的采样把跟随关掉。

## 决定

- 皮肤删去读者持有的全部状态与入口：`held`、`readerPositions`、`readerFloors`、`heldTowardEnd`、`setHeld`、`readerHolds`、`holdReader`、`releaseReader`、`releaseAtTail`、增长写回 `holdGrowth`，以及 `skin.ts` 的 `readerHold` 词汇。
- 滚动主人的来源缩为 `jump > fold > follow > process`；跟随来源不再按持有被拒绝。
- 读者自己的移动只留一个时刻：`noteIntent` 记 `lastMovingIntentAt`，`readerMovedSince(since)` 回答「此后读者动过没有」。它不记位置，不写属性。
- 跟随的交还（`handBackFollow`）只在读者自宿主最后一次跟随以来没有移动过时发出。读者动过，位置归他；读者没动而跟随丢了，那一次丢失是布局引起的，用宿主自己的按钮交还。
- 上限过程体按逐体的末尾读数跟随：内容增长时，只有增长前它自己在末尾才缓动回末尾；读者把它滚开之后，增长不再追他。
- 正式回答第一行的接管、轮次跳转与折叠门保留各自的写入与动画；它们不再调用 `holdReader`，跟随由宿主的采样关掉。
- 等待行的钉住只读宿主的跟随标记与门的标记，不再读皮肤自己的持有标记。

## 后果

- 回到底部之后的内容增长由宿主写末尾，皮肤没有第二条写回路径。
- 读者滚开之后，内容增长不移动位置；回到末尾或按下按钮，跟随重新打开，两件事都由宿主判定。
- 触屏读者按住不滑动时的增长会跟着宿主走到末尾：按住不发滚动，宿主的跟随一直打开。这是宿主的原生行为。
- 上限过程体在读者滚开后不再跟随，直到他自己回到末尾；这对应宿主过程体上的 `nearBottom`。
- 放弃的做法：在按钮点击上加更多补丁；保留持有、只把按钮查询改成按点击目标解析；皮肤自己实现采样窗口；用固定时长窗口代替意图判断；读者持有期间由皮肤写回位置。

## 重审条件

- 宿主提供可替换的滚动跟随策略，或公开跟随状态变更事件时，`readerMovedSince` 与按钮交还都改为读该状态（D40）。
- 宿主改变 `data-chat-following-tail` 的写处或「回到底部」按钮的结构时，重新核对交还路径与等待行的钉住。
```

- [ ] **Step 2: 修订 D95 与 D84**

`docs/adr/D95-stream-slide-counter-pins.md` 的第三处决定（读者持有期间由皮肤写回）整条删去，改为：

```markdown
- 读者自己的滚动由宿主判定：位置离开末尾，宿主关掉跟随，位移随之停止（D100）。皮肤不写回任何位置。
```

并在「后果」里把「读者持有期间每次增长有一次位置写入与一次布局」改成：

```markdown
- 位移只在宿主的跟随打开时运行；跟随关掉之后增长直接落在新的布局里，没有第二次位置写入。
```

`docs/adr/D84-answer-first-line.md` 的第 13、14、19 条删去「取持有」与「持有让跟随来源与流式位移都让开」，改成：

```markdown
- 移动的目标是答案行的顶部与滚动容器顶部之间的差；写入走滚动主人的跳转来源，宿主把它读成读者的移动并关掉自己的跟随，位移随之停止（D40、D100）。答案刚开始输出时这一行还敌不过一屏，差值超出可滚动的范围，浏览器把写入收到末尾，读者照旧跟着末尾长；此后行每长高一次，都按同一个目标再写一次，行高越过一屏时写入真正落在第一行上，读者停在答案开头，后文落在屏幕下方。
```

```markdown
- 一条回答只接手一次；读者自己移动之后停止这次重写。回到末尾时跟随由宿主重新打开（D40 的结算）。
```

```markdown
- 接手之后读者停在答案开头，流式输出在他的下方继续长；宿主不再把末尾钉上来，增长落在读者读的位置下方。
```

- [ ] **Step 3: 改 ARCHITECTURE 的词汇行**

`docs/ARCHITECTURE.md:25` 的括号去掉「持有」：

```markdown
- 引擎不认识皮肤：它写的属性名（部件、静默）连同两处菜单锚点，由皮肤在装载前通过 `engine/src/skin.ts` 与 `installParts` 的词汇交进去；没交接就问起，直接抛出。样式表的 id、包名与文本，延后块的共享模块表，都是每次调用时交进去的。
```

同一文件里其它提到读者持有的段落按同一处删去。

- [ ] **Step 4: 写变化片段**

`docs/changes/host-owned-scroll-follow.json`：

```json
{
  "at": "2026-11-13",
  "group": "fixes",
  "order": 0,
  "external": true,
  "zh": "修复点回到底部后新内容到达时对话跳回旧位置的问题",
  "en": "Keep the transcript where the host's own follow puts it after the reader returns to the bottom"
}
```

- [ ] **Step 5: 改验收记录**

`docs/tests/2026-11-12-desktop-notification-scroll.md`：

```markdown
| S4.7 | 回到底部后等待新内容到达，期间不滚动、不点按 | 位置一直在末尾，按钮不重新出现 |
| S4.8 | 回到底部后，在新内容到达前再次上滚 | 宿主的跟随关闭，此后的增长停在读者选择处 |
```

```markdown
| E-S4.1 | S4.1 | 从会话中间回到底部的录屏；只出现一次平滑移动，结束后按钮消失。开发侧保留 `packages/testing/specs/mechanism/scroll-ownership/return.spec.ts` 对一次按钮交还的断言记录。 | 待填 |
```

```markdown
| E-S4.7 | S4.7 | 点击后不产生任何输入、等待下一段内容到达的录屏；逐帧读出末尾距离保持为 0。 | 待填 |
| E-S4.8 | S4.8 | 点击后立刻上滚再等待新内容的录屏；位置停在读者滚到的高度，宿主跟随的按钮重新出现。 | 待填 |
```

同一文件中「判定」一节的 S4.7 一句去掉「持有标记」：

```markdown
- S4.7 的通过与失败按同一段录屏的连续帧判定，不以「没有看到跳动」代替录屏。
```

- [ ] **Step 6: 重新生成索引并检查**

```bash
npm run docs:index
npm run docs:check
```

Expected: `decisions index: wrote ... to docs/adr/README.md`，随后 `up to date`。

- [ ] **Step 7: 提交**

```bash
git add docs/adr docs/ARCHITECTURE.md docs/changes/host-owned-scroll-follow.json docs/tests/2026-11-12-desktop-notification-scroll.md
git commit -m "docs: 记录滚动跟随归宿主的决定"
```

---

### Task 6: 清理生成记录并构建

**Files:**
- Modify: `packages/testing/data/skin-literals.json`
- Modify: `packages/testing/data/element-collections.json`
- Modify: `packages/testing/data/check-numbers.json`
- Modify: `scripts/checks/lint.mjs:18`（仅当需要）
- Modify: `packages/engine/src/chat-dom.ts`（仅当 `isScrollbarStrip` 失去使用者）

**Interfaces:**
- Consumes: Task 1 到 Task 5 的最终树。
- Produces: 可构建、可打包的源树。

- [ ] **Step 1: 让 lint 报出记录差异**

```bash
npm run lint
```

Expected: 按输出改 `skin-literals.json` 与 `element-collections.json` 的数字；`check-numbers.json` 由下一步生成。

- [ ] **Step 2: 生成检查数字记录**

```bash
node packages/testing/check-numbers.mjs
```

Expected: 写出 `packages/testing/data/check-numbers.json`，其中 `smoke/cases/chat` 少了 `followHoldGrowthPx` 一项。

- [ ] **Step 3: 再次 lint 与构建**

```bash
npm run lint
npm run build
```

Expected: 两者都通过，`lib/` 重新生成。

- [ ] **Step 4: 提交**

```bash
git add packages/testing/data scripts/checks/lint.mjs packages/engine/src/chat-dom.ts packages/testing/specs/mechanism/host-lookup/chat-dom.spec.ts
git commit -m "chore: 同步滚动记录并重新构建"
```

---

### Task 7: 打包插件

**Files:**
- Create: `dsh-claude-style-lite-0.2.3.tgz`（仓库根目录）

**Interfaces:**
- Consumes: Task 6 的 `lib/`。
- Produces: 可安装的插件压缩包。

- [ ] **Step 1: 确认版本与构建产物**

```bash
grep -n '"version"' package.json && cat LITE_VERSION && ls -la lib/client.js
```

Expected: 两处版本一致，`lib/client.js` 存在且是本次构建。

- [ ] **Step 2: 打包**

```bash
npm pack
```

Expected: 仓库根目录出现 `dsh-claude-style-lite-0.2.3.tgz`。

- [ ] **Step 3: 记录包内容**

```bash
tar -tzf dsh-claude-style-lite-0.2.3.tgz | head -40
```

Expected: 包含 `package/lib/client.js`、`package/lib/host/index.js`、`package/package.json`。

- [ ] **Step 4: 不运行验收**

按用户要求，到这里停下：报告两份文档、改动清单与包的路径，等待验收命令。
