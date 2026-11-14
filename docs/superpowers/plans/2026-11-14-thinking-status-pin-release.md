# 思考状态行上滚停留修复实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 读者在「正在思考」状态行钉住时向上滚动，状态行在下一帧立即离开钉住位置并随内容上移，不再停留在输入框上方等待宿主的 500 毫秒采样。

**Architecture:** 滚动主人把已受理的读者移动广播到下一帧；等待行在对话容器上写 `data-dsh-claude-wait-reader-moved`，钉住规则新增否决；宿主 `data-chat-following-tail` 的上升沿撤下标记，读者回到末尾后钉住恢复。滚动位置仍只由宿主与滚动主人写入。

**Tech Stack:** TypeScript、CSS、MutationObserver、DOM Scroll API、Vitest browser mode、Playwright 替身页、`npm run build`、`npm run lint`、`npm run verify`。

## Global Constraints

- 产品代码只改 `packages/engine/src/scroll-owner.ts` 与 `packages/client/src/features/chat-wait/`；测试改 `packages/testing/`；文档改 `docs/`。
- 不修改 `lib/`；不写滚动位置，不修改 `data-chat-following-tail`，不点击回到底部按钮，不调用 `preventDefault()`。
- 不恢复 `readerPositions`、`readerFloors`、`heldTowardEnd`、`setHeld`、`readerHolds`、`holdReader`、`releaseReader`、`releaseAtEnd`、`data-dsh-claude-reader-hold` 与 `skin.ts` 的 `readerHold` 词汇。
- 新标记只否决状态行钉住，不表示皮肤持有滚动位置。
- 读者移动的受理判据继续使用 `scroll-owner.ts` 的 `isReaderScrollIntent`、`intentReaches`、`pressMovesScroll`；不复制这三段判据。
- 源文件接近 750 行是停线；`chat-follow.ts` 当前 713 行，本计划不向它增加功能。
- 规范放在 `packages/testing/specs/<layer>/<capability>/<name>.spec.(ts|mjs)`，带 `@capability`、`@features`、`@risk` 头；`@capability` 等于目录名。
- 规范只从 `@dsh-claude-style/client/pure`、`@dsh-claude-style/contracts/*`、`@dsh-claude-style/engine/*` 访问产品；皮肤标记从 `packages/testing/data/surface.json` 读取，宿主标记从 `packages/contracts/src/dom.ts` 读取。
- 每个新 `surface.json` 条目必须被至少一个规范读取，属性名必须出现在 `packages/client/src` 里，否则 `npm run lint` 失败。
- 每步先写失败测试，再写实现，再运行受影响测试；每个任务结束运行 `npm run lint`。
- 本机 `dsh.cmd` 报 Harness CLI not found，真实宿主项记录为“待测试机执行”，不得写成通过。

---

### Task 1: 读者移动的广播出口

**Files:**
- Modify: `packages/engine/src/scroll-owner.ts`
- Test: `packages/testing/specs/mechanism/scroll-ownership/reader-move.spec.ts`（新建）

**Interfaces:**
- Produces: `subscribeReaderMove(listener: () => void): () => void`
- 语义：每次被 `noteIntent` 受理的移动意图之后，`listener` 在下一帧的写入阶段运行一次；同一帧内的多次移动合并为一次；退订后不再运行。
- Consumes: 现有 `noteIntent`、`isReaderScrollIntent`、`intentReaches`、`pressMovesScroll`。

- [ ] **Step 1: 写失败规范**

创建 `packages/testing/specs/mechanism/scroll-ownership/reader-move.spec.ts`：

```ts
/**
 * A reader's move reaches the status line's pin on the frame after it happens
 * (D40, D100). The owner keeps the instant and hands it out; the pin's own
 * feature decides what to do with it.
 *
 * @capability scroll-ownership
 * @features engine
 * @risk The status line keeps floating over what the reader went back to read while the host waits out its sample window.
 */
import { expect, test } from 'vitest'
import { adoptSkin } from '@dsh-claude-style/engine/skin'
import { joinScrollOwner, subscribeReaderMove } from '@dsh-claude-style/engine/scroll-owner'
import { COMPOSER_SELECTOR, CONVERSATION_SCROLL_SELECTOR } from '@dsh-claude-style/contracts/dom'
import { hostElement } from '../../fixtures/host-markup'
import { ownedPage } from '../../fixtures/scroll-owner'
import { TEST_SKIN } from '../../fixtures/vocabulary'

adoptSkin(TEST_SKIN)
const cleanups = ownedPage()
const frame = () => new Promise<number>(resolve => requestAnimationFrame(resolve))

function conversation() {
  const box = hostElement(CONVERSATION_SCROLL_SELECTOR)
  box.style.cssText = 'height:100px;overflow:auto;scrollbar-gutter:stable'
  const content = document.createElement('div')
  content.style.height = '600px'
  box.append(content)
  document.body.append(box)
  cleanups.push(() => box.remove())
  box.scrollTop = 200
  return box
}

function listen() {
  const calls: number[] = []
  const stop = subscribeReaderMove(() => calls.push(performance.now()))
  cleanups.push(stop)
  return calls
}

test('a wheel inside the conversation reaches a move listener on the next frame', async () => {
  const leave = joinScrollOwner()
  cleanups.push(leave)
  const box = conversation()
  const calls = listen()
  box.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: -120 }))
  expect(calls).toHaveLength(0)
  await frame()
  expect(calls).toHaveLength(1)
})

test('a wheel inside the composer reaches nobody', async () => {
  const leave = joinScrollOwner()
  cleanups.push(leave)
  const box = conversation()
  const composer = hostElement<HTMLElement>(COMPOSER_SELECTOR)
  box.append(composer)
  const calls = listen()
  composer.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: -120 }))
  await frame()
  await frame()
  expect(calls).toHaveLength(0)
})

test('a left press on the words is a selection, not a move', async () => {
  const leave = joinScrollOwner()
  cleanups.push(leave)
  const box = conversation()
  const calls = listen()
  box.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }))
  await frame()
  await frame()
  expect(calls).toHaveLength(0)
})

test('an upper arrow key with nothing else focused is a move', async () => {
  const leave = joinScrollOwner()
  cleanups.push(leave)
  conversation()
  const calls = listen()
  document.body.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowUp' }))
  await frame()
  expect(calls).toHaveLength(1)
})

test('an unsubscribed listener hears nothing', async () => {
  const leave = joinScrollOwner()
  cleanups.push(leave)
  const box = conversation()
  const calls: number[] = []
  const stop = subscribeReaderMove(() => calls.push(1))
  stop()
  box.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: -120 }))
  await frame()
  await frame()
  expect(calls).toHaveLength(0)
})

test('two wheels inside one frame reach the listener once', async () => {
  const leave = joinScrollOwner()
  cleanups.push(leave)
  const box = conversation()
  const calls = listen()
  box.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: -60 }))
  box.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: -60 }))
  await frame()
  expect(calls).toHaveLength(1)
})
```

- [ ] **Step 2: 运行规范确认失败**

Run: `npx vitest run packages/testing/specs/mechanism/scroll-ownership/reader-move.spec.ts`

Expected: FAIL，`subscribeReaderMove` 未导出。

- [ ] **Step 3: 实现广播**

在 `packages/engine/src/scroll-owner.ts` 顶部增加：

```ts
import { requestFrame } from './frame'
```

在成员计数旁增加：

```ts
/** Called once on the frame after an accepted reader move; the pin's own feature listens here. */
const moveListeners = new Set<() => void>()
/** The frame that will tell the listeners; null while none is queued. */
let moveCancel: (() => void) | null = null

/**
 * Hear a reader move on the frame that follows it (D40, D100). The owner keeps
 * the instant; whether the move releases a pinned row is the row's own feature.
 * @returns unsubscribe.
 */
export function subscribeReaderMove(listener: () => void) {
  moveListeners.add(listener)
  return () => { moveListeners.delete(listener) }
}

function announceMove() {
  if (moveCancel !== null) return
  moveCancel = requestFrame({
    write() {
      moveCancel = null
      for (const listener of moveListeners) listener()
    },
  })
}
```

`noteIntent` 只在受理处调用一次：

```ts
  if (event.type === 'pointerdown' && !pressMovesScroll(scroller, event)) return
  lastMovingIntentAt = performance.now()
  announceMove()
```

`joinScrollOwner` 的最后一个成员离开时撤下待发的一帧与全部监听：

```ts
    if (moveCancel !== null) moveCancel()
    moveCancel = null
    moveListeners.clear()
```

规范直接从 `@dsh-claude-style/engine/scroll-owner` 导入；`packages/client/src/pure.ts` 不需要转出 engine 的机制。

- [ ] **Step 4: 运行规范确认通过**

Run: `npx vitest run packages/testing/specs/mechanism/scroll-ownership/reader-move.spec.ts`

Expected: PASS，六项。

- [ ] **Step 5: 运行滚动的既有规范**

Run: `npx vitest run packages/testing/specs/mechanism/scroll-ownership/`

Expected: PASS，`owner.spec.ts`、`follow-window.spec.ts`、`process-body.spec.ts`、`return.spec.ts` 与新增规范全部通过。

- [ ] **Step 6: 运行 lint**

Run: `npm run lint`

Expected: PASS。新增广播没有复制 `isReaderScrollIntent`、`intentReaches` 或 `pressMovesScroll`。

---

### Task 2: 钉住否决的规则与行为

**Files:**
- Modify: `packages/client/src/features/chat-wait/chat-wait.css:10-42`
- Modify: `packages/testing/data/surface.json`
- Test: `packages/testing/specs/behaviour/chat-wait/reader-move-releases-pin.spec.mjs`（新建）

**Interfaces:**
- Consumes: Task 1 的 `subscribeReaderMove`，在 Task 3 用到。
- Produces: `surface.json` 条目 `chat-wait.reader-moved` 与 `chat-wait.tail`。
- Produces: 钉住规则读取对话容器上的 `data-dsh-claude-wait-reader-moved`。

- [ ] **Step 1: 登记 surface 条目**

在 `packages/testing/data/surface.json` 增加两条：

```json
{ "id": "chat-wait.reader-moved", "attribute": "data-dsh-claude-wait-reader-moved", "feature": "chat-wait", "sees": "the running status line's pin standing down because the reader moved the conversation since the host's follow came on" },
{ "id": "chat-wait.tail", "attribute": "data-dsh-claude-wait-tail", "feature": "chat-wait", "sees": "the running row standing last in the flow, the one the status line's bottom pin is allowed to hold above the composer" }
```

`chat-wait.manifest.ts` 的 `contracts` 已含 `chat.following-tail-attribute`，属性观察不需要新增契约。

- [ ] **Step 2: 写失败行为规范**

创建 `packages/testing/specs/behaviour/chat-wait/reader-move-releases-pin.spec.mjs`：

```js
/**
 * A reader who wheels up from a running turn's status line sees the line travel
 * with the transcript at once, rather than staying pinned over what he went
 * back to read while the host waits out its sample window (D100).
 *
 * @capability chat-wait
 * @features chat-wait, chat-follow
 * @risk The status line floats over the reader's chosen place for the host's whole sampling window and jumps down when the host finally turns its follow off.
 */
import { spec } from '../../fixtures/behaviour.mjs'
import { CHAT_RUNNING_SELECTOR, CONVERSATION_SCROLL_SELECTOR, FOLLOWING_TAIL_ATTRIBUTE, STREAMING_ATTRIBUTE } from '@dsh-claude-style/contracts/dom'

export default spec({ page: 'chat-follow' }, ({ test }) => {
  test('a reader move releases the status line pin on the next frame', async (t) => {
    const runningAttr = CHAT_RUNNING_SELECTOR.slice(1, -1)
    const followingAttr = FOLLOWING_TAIL_ATTRIBUTE
    const movedAttr = t.surface.attribute('chat-wait.reader-moved')
    const waitTailAttr = t.surface.attribute('chat-wait.tail')

    const result = await t.page.evaluate(async ([
      scrollerSel, runningSel, followingAttr, movedAttr, waitTailAttr, streamAttr,
    ]) => {
      const box = document.querySelector(scrollerSel)
      const frame = document.querySelector('#debugFollowing')
      const column = frame === null ? null : frame.querySelector('[data-chat-flow]')
      if (box === null || frame === null || column === null) throw new Error('the chat-follow stand-in page is missing its scroller, frame or flow')
      frame.setAttribute(followingAttr, '')
      column.innerHTML = ''
      column.style.cssText = 'height:648px;display:flex;flex-direction:column'
      const filler = document.createElement('div')
      filler.style.height = '600px'
      const stream = document.createElement('div')
      stream.setAttribute(streamAttr, '')
      stream.style.height = '24px'
      const row = document.createElement('div')
      row.setAttribute(runningSel.slice(1, -1), '')
      row.setAttribute(waitTailAttr, '')
      row.style.cssText = 'height:24px;display:flex;align-items:center'
      row.textContent = '正在思考'
      column.append(filler, stream, row)
      document.body.style.setProperty('--dsh-composer-height', '24px')
      box.scrollTop = box.scrollHeight
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))

      const pinnedBefore = getComputedStyle(row).position === 'sticky'
      const topBefore = row.getBoundingClientRect().top
      box.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: -300 }))
      box.scrollTop = Math.max(0, box.scrollTop - 300)
      await new Promise((resolve) => requestAnimationFrame(resolve))
      const pinnedAfter = getComputedStyle(row).position === 'sticky'
      const topAfter = row.getBoundingClientRect().top
      const marked = box.hasAttribute(movedAttr)

      // The reader comes back to the end; the host's next follow edge says so.
      box.scrollTop = box.scrollHeight
      frame.removeAttribute(followingAttr)
      frame.setAttribute(followingAttr, '')
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      const pinnedAgain = getComputedStyle(row).position === 'sticky'

      column.innerHTML = ''
      return { pinnedBefore, pinnedAfter, pinnedAgain, topBefore, topAfter, marked }
    }, [CONVERSATION_SCROLL_SELECTOR, CHAT_RUNNING_SELECTOR, followingAttr, movedAttr, waitTailAttr, STREAMING_ATTRIBUTE])

    t.expectThat.equal(result.pinnedBefore, true, 'the status line starts pinned at the tail')
    t.expectThat.equal(result.marked, true, 'the reader move is marked on the conversation')
    t.expectThat.equal(result.pinnedAfter, false, 'the pin releases on the frame after the wheel')
    t.expectThat.equal(result.pinnedAgain, true, 'the host follow edge restores the pin')
    t.expectThat.equal(result.topAfter > result.topBefore, true, `the line moves with the transcript (${result.topBefore} → ${result.topAfter})`)
  }, { frames: true })
})
```

标记从 `t.surface.attribute(...)` 读取，宿主属性从 `@dsh-claude-style/contracts/dom` 读取；不在规范里拼写 `data-dsh-claude-*` 或宿主属性名。

- [ ] **Step 3: 运行规范确认失败**

Run: `node packages/testing/stand-in.mjs --spec reader-move-releases-pin`

Expected: FAIL，且失败点必须是 `marked` 为 `false`。`pinnedBefore` 由当前构建的替身页实测为 `true`（容器高 240px、内容高 648px、状态行高 24px、离尾 0px）；若它变回 `false`，先修规范里的构造，再确认 `pinnedAfter` 仍为 `true`。这条前置检查是规范本身的一部分，不能用放宽断言绕过。

- [ ] **Step 4: 写钉住否决**

`packages/client/src/features/chat-wait/chat-wait.css` 的两条钉住规则与两条遮罩规则各加 `:not([data-dsh-claude-wait-reader-moved])`：

```css
body[data-dsh-claude-style][data-dsh-claude-chat-follow] [data-conversation-scroll]:not([data-dsh-claude-wait-reader-moved]) [data-chat-following-tail] [data-chat-running][data-dsh-claude-wait-tail],
body[data-dsh-claude-style][data-dsh-claude-chat-follow] [data-conversation-scroll]:not([data-dsh-claude-wait-reader-moved]) [data-dsh-claude-follow-hold] [data-chat-running][data-dsh-claude-wait-tail] {
  position: sticky;
  bottom: calc(var(--dsh-composer-height, 0px) + var(--dsh-composer-fade-h, 40px) + 16px + 1px);
  z-index: 1;
  background: var(--dsh-claude-canvas, var(--dsw-alias-bg-base, #ffffff));
}
```

`::after` 的两条规则同样加 `:not([data-dsh-claude-wait-reader-moved])`。文件头注释补成：

```text
   The pin needs the body's chat follow mark (CHAT_FOLLOW_ATTR) and the row's own
   tail mark — a card mounted after the row takes the tail mark away and leaves
   both in ordinary flow. Under the follow mark the host's own follow attribute,
   or the glide's hold mark (FOLLOW_HOLD_ATTR) while a door rolls, says the tail
   is followed. The reader's own move stands the pin down on the frame it
   happens, before the host's 500 ms sample closes its follow; the host's own
   follow edge puts the pin back when the reader returns (D9, D100).
```

- [ ] **Step 5: 运行规范确认通过**

Run: `node packages/testing/stand-in.mjs --spec reader-move-releases-pin`

Expected: PASS，五项断言全过。该步依赖 Task 3 的标记写入；Task 2 的失败运行应停在 `marked === false`，Task 3 完成后回到本步验收。

- [ ] **Step 6: 运行 lint**

Run: `npm run lint`

Expected: PASS。两条新 surface 条目都被新规范读取，属性名都在 `packages/client/src` 里出现。

---

### Task 3: 等待行写入标记并在跟随上升沿撤下

**Files:**
- Modify: `packages/client/src/features/chat-wait/chat-wait.ts`
- Test: `packages/testing/specs/mechanism/chat-wait/pin-release.spec.ts`（新建）

**Interfaces:**
- Consumes: `subscribeReaderMove`、`observeMatches`、`observeSession`、`conversationScroller`。
- Produces: 对话容器上的 `data-dsh-claude-wait-reader-moved`：读者移动后写入，宿主跟随上升沿、会话切换与卸载时撤下。

- [ ] **Step 1: 写失败机制规范**

创建 `packages/testing/specs/mechanism/chat-wait/pin-release.spec.ts`：

```ts
/**
 * The waiting line's pin yields to the reader's own move (D100). The mark lives
 * on the conversation scroller and goes away on the host's next follow edge, so
 * a reader who comes back finds the line pinned again.
 *
 * @capability chat-wait
 * @features chat-wait
 * @risk The line stays pinned over the reader's chosen place until the host's sample timer fires, or stays unpinned after the reader returns to the end.
 */
import { expect, test } from 'vitest'
import { adoptSkin } from '@dsh-claude-style/engine/skin'
import { joinScrollOwner, subscribeReaderMove } from '@dsh-claude-style/engine/scroll-owner'
import { CONVERSATION_SCROLL_SELECTOR, FOLLOWING_TAIL_SELECTOR } from '@dsh-claude-style/contracts/dom'
import { hostElement } from '../../fixtures/host-markup'
import { ownedPage } from '../../fixtures/scroll-owner'
import { surfaceAttribute } from '../../fixtures/surface'
import { TEST_SKIN } from '../../fixtures/vocabulary'

adoptSkin(TEST_SKIN)
const cleanups = ownedPage()
const MOVED = surfaceAttribute('chat-wait.reader-moved')
const frame = () => new Promise<number>(resolve => requestAnimationFrame(resolve))

function conversation() {
  const box = hostElement<HTMLElement>(CONVERSATION_SCROLL_SELECTOR)
  box.style.cssText = 'height:100px;overflow:auto;scrollbar-gutter:stable'
  const frameBox = hostElement<HTMLElement>(FOLLOWING_TAIL_SELECTOR)
  const content = document.createElement('div')
  content.style.height = '600px'
  frameBox.append(content)
  box.append(frameBox)
  document.body.append(box)
  cleanups.push(() => box.remove())
  box.scrollTop = 200
  return { box, frameBox }
}

test('a reader move puts the mark on the scroller and the next follow edge takes it off', async () => {
  const leave = joinScrollOwner()
  cleanups.push(leave)
  const { box, frameBox } = conversation()
  const stop = subscribeReaderMove(() => box.setAttribute(MOVED, ''))
  cleanups.push(stop)
  box.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: -120 }))
  await frame()
  expect(box.hasAttribute(MOVED)).toBe(true)
  frameBox.removeAttribute(FOLLOWING_TAIL_SELECTOR.slice(1, -1))
  expect(box.hasAttribute(MOVED)).toBe(false)
  frameBox.setAttribute(FOLLOWING_TAIL_SELECTOR.slice(1, -1), '')
  expect(box.hasAttribute(MOVED)).toBe(false)
})
```

该规范锁定标记的写入与撤下顺序；`observeMatches` 的上升沿、会话切换与卸载三项生命周期在 Step 3 的实现后于同一文件追加可执行断言，不留注释占位。

- [ ] **Step 2: 运行规范确认失败**

Run: `npx vitest run packages/testing/specs/mechanism/chat-wait/pin-release.spec.ts`

Expected: FAIL，`chat-wait.reader-moved` 未被写入对话容器。

- [ ] **Step 3: 实现标记生命周期**

在 `packages/client/src/features/chat-wait/chat-wait.ts` 的 `install` 中增加：

```ts
  /** On the conversation scroller while the reader has moved since the host's last follow edge. */
  const MOVED_ATTR = 'data-dsh-claude-wait-reader-moved'
  /** The scroller the moved mark stands on, or null while no reader move is waiting. */
  let movedScroller: Element | null = null

  const releaseReaderMove = () => {
    if (movedScroller === null) return
    movedScroller.removeAttribute(MOVED_ATTR)
    movedScroller = null
  }

  const noteReaderMove = () => {
    if (stopped) return
    const scroller = conversationScroller()
    if (scroller === null) return
    if (scroller === movedScroller) return
    releaseReaderMove()
    scroller.setAttribute(MOVED_ATTR, '')
    movedScroller = scroller
  }

  // The listener runs on the frame after the move; waiting for the move's own
  // paint would leave one pinned frame behind.
  const stopReaderMove = subscribeReaderMove(noteReaderMove)
  // A follow edge puts the pin back where it stood.
  const following = observeMatches<Element>(FOLLOWING_TAIL_SELECTOR)
  let seenFollowing = following.all().length > 0
  // The page's own mutation watch: a follow going back on is the edge that
  // releases the mark, and it needs no new attribute batch subscription.
  const stopFollowWatch = subscribeMutations(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: [FOLLOWING_TAIL_ATTRIBUTE],
  }, () => {
    const next = following.all().length > 0
    if (next && !seenFollowing) releaseReaderMove()
    seenFollowing = next
  })
  const stopSessionWatch = observeSession(() => { releaseReaderMove() })
```

`stopped` 是现有安装函数的卸载标记。导入为：

```ts
import { observeMatches, subscribeMutations } from '@dsh-claude-style/engine/bus'
import { conversationScroller } from '@dsh-claude-style/engine/chat-dom'
import { observeSession } from '@dsh-claude-style/engine/host'
import { subscribeReaderMove } from '@dsh-claude-style/engine/scroll-owner'
import { FOLLOWING_TAIL_ATTRIBUTE, FOLLOWING_TAIL_SELECTOR } from '@dsh-claude-style/contracts/dom'
```

现有 teardown 里加入：

```ts
    stopReaderMove()
    stopFollowWatch()
    following.release()
    stopSessionWatch()
    releaseReaderMove()
```

`releaseReaderMove` 的幂等性保证宿主在末尾附近的多次属性写入不会重复改 DOM。标记只能写在 `[data-conversation-scroll]` 上，CSS 的 `:not(...)` 就挂在那个节点。`observeMatches` 只负责读当前标记；上升沿用 `subscribeMutations` 的 `FOLLOWING_TAIL_ATTRIBUTE` 批次，与 `chat-follow.ts` 读取同一处契约。

- [ ] **Step 4: 运行规范确认通过**

Run: `npx vitest run packages/testing/specs/mechanism/chat-wait/pin-release.spec.ts`

Expected: PASS。追加的生命周期断言同样通过。

- [ ] **Step 5: 运行等待行的既有规范**

Run: `npx vitest run packages/testing/specs/logic/waiting-line/ packages/testing/specs/mechanism/chat-wait/`

Expected: PASS。

- [ ] **Step 6: 返回 Task 2 Step 5，运行行为规范**

Run: `node packages/testing/stand-in.mjs --spec reader-move-releases-pin`

Expected: PASS。

- [ ] **Step 7: 运行 lint**

Run: `npm run lint`

Expected: PASS。

---

### Task 4: 端到端场景与冒烟读数

**Files:**
- Modify: `packages/testing/scenarios/reader-scroll.mjs`
- Modify: `packages/testing/smoke/probe/chat-wait.js`
- Modify: `packages/testing/smoke/cases/chat.mjs`
- Modify: `packages/testing/data/check-numbers.json`（由工具生成）

**Interfaces:**
- Consumes: Task 2 的 `chat-wait.reader-moved` 与 Task 3 的生命周期。
- Produces: 真实宿主帧序列里的撤钉读数，替身页里的撤钉与恢复读数。

- [ ] **Step 1: 扩展端到端场景的帧读数**

`packages/testing/scenarios/reader-scroll.mjs` 的 `watch` 每帧增加：

```js
        moved: scroller !== null && scroller.hasAttribute('data-dsh-claude-wait-reader-moved'),
```

滚轮后等待的判据改为同时等宿主标记消失与 `moved` 出现：

```js
      await page.waitForFunction((marks) => {
        if (document.querySelector(marks.followingTail) !== null) return false
        const scroller = document.querySelector(marks.scroller)
        if (scroller === null || !scroller.hasAttribute(marks.movedAttr)) return false
        return scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop > 0
      }, { followingTail: FOLLOWING_TAIL, movedAttr: 'data-dsh-claude-wait-reader-moved', ...HOST }, { timeout: 5000 })
```

`assert` 增加两条判定：滚轮后的第一帧起 `pinned` 为 `false`；`left.top` 之后的所有帧 `moved` 为 `true`。判定说明写进 `check` 的字符串，不写进断言阈值。

- [ ] **Step 2: 运行场景**

Run: `node packages/testing/e2e.mjs --scenario readerScroll`

Expected: 本机 FAIL 于 `dsh --version`（Harness CLI not found）。把输出记录到修改说明，状态写“待测试机补跑”，不得写成通过。

- [ ] **Step 3: 扩展冒烟读数**

`packages/testing/smoke/probe/chat-wait.js` 的钉住段增加：

```js
      var movedOf = function () {
        var scroller = row.closest('[data-conversation-scroll]')
        return scroller !== null && scroller.hasAttribute('data-dsh-claude-wait-reader-moved')
      }
      var wheelUp = function () {
        var scroller = row.closest('[data-conversation-scroll]')
        if (scroller === null) return
        scroller.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: -120 }))
        scroller.scrollTop = Math.max(0, scroller.scrollTop - 120)
      }
      wheelUp()
      r.wait.pin.readerMoved = await probe.until(pinOf, function (frames) {
        var last = frames[frames.length - 1]
        return movedOf() && last.pinned === false && last.mask === null
      }, 'the pin standing down for the reader\'s own move')
      waitSession.setAttribute('data-chat-following-tail', '')
      r.wait.pin.readerReturned = await probe.until(pinOf, function (frames) {
        var last = frames[frames.length - 1]
        return !movedOf() && last.pinned === true && last.mask !== null
      }, 'the pin coming back on the host follow edge')
```

`case chat.mjs` 增加：

```js
    check('状态行随读者的上滚在下一帧撤钉，宿主跟随重新出现时钉回输入框上方',
      pin.readerMoved?.pinned === false && pin.readerMoved?.mask === null &&
        pin.readerReturned?.pinned === true && pin.readerReturned?.mask?.position === 'absolute',
      JSON.stringify({ moved: pin.readerMoved, returned: pin.readerReturned }))
```

探针位于宿主替身的页面脚本内，可以直接读标记；这是 `packages/testing/smoke/` 的既有例外，不违反规范入口规则。

- [ ] **Step 4: 运行冒烟与行为规范**

Run: `node packages/testing/stand-in.mjs --case chat-wait --spec chat-wait`

Expected: PASS，包含新增的 `readerMoved` 与 `readerReturned` 读数。

- [ ] **Step 5: 重新生成检查数字记录**

Run: `npm run checks:numbers`

Expected: 写入 `packages/testing/data/check-numbers.json`，新增或变动的检查项出现在差异里。

- [ ] **Step 6: 运行 lint**

Run: `npm run lint`

Expected: PASS。

---

### Task 5: 文档、变更记录与决策

**Files:**
- Create: `docs/changes/reader-moved-releases-status-pin.json`
- Create: `docs/adr/<下一个空号>-reader-move-releases-the-pin.md`（编号取 `docs/adr/` 当前最大号加一，本计划不预占编号）
- Modify: `docs/adr/D100-scroll-follow-belongs-to-host.md`（只在“重审条件”里补指向）
- Modify: `docs/STYLE.md:829`
- Modify: `docs/adr/README.md`（由 `npm run docs:index` 生成）

**Interfaces:**
- Consumes: Task 1–4 的实现与读数。
- Produces: 读者可读的变更记录、方向记录与样式说明。

- [ ] **Step 1: 写变更记录**

创建 `docs/changes/reader-moved-releases-status-pin.json`：

```json
{
  "at": "2026-11-14",
  "group": "fixes",
  "order": 23,
  "external": true,
  "zh": "修复对话运行时向上滚动后「正在思考」状态行仍停在输入框上方数百毫秒才随内容移动的问题",
  "en": "Release the running status line's pin on the frame the reader scrolls up, instead of after the host's sampling window"
}
```

`order` 取当前 `docs/changes/` 中同日 `fixes` 分组的最大值加一；`external` 按读者可见变化取 `true`。

- [ ] **Step 2: 写决策文件**

按 `docs/adr/D48-documentation.md` 的章节顺序创建，正文写完整句子：

```markdown
# D<号>. 读者的移动立即撤下状态行钉住

- **取代**：无

## 背景

宿主把读者移动留到 500 毫秒采样结束才撤下 `data-chat-following-tail`。D100 删除读者位置与写回路径之后，状态行的钉住条件只剩宿主跟随与折叠门，于是读者上滚后行先停在钉住位置，采样结束才落回文档。D100 删除的位置写回仍然正确，需要补的是“读者已经移动”这一即时读数对钉住的否决。

## 决定

- 状态行钉住的条件除宿主跟随与折叠门外，还要没有读者自本次跟随以来的移动。
- 读者移动的读数来自滚动主人的受理判据与下一帧写入，不记录位置、不写滚动。
- 宿主 `data-chat-following-tail` 的上升沿、会话切换与功能卸载撤下标记。
- 标记只否决状态行钉住，不表示皮肤持有滚动位置。

## 后果

- 读者上滚的下一帧状态行回到文档流并随内容移动。
- 宿主采样窗口内的内容增长不会让钉住复活。
- 回到末尾后宿主跟随上升沿恢复钉住。
- 放弃固定时长窗口、轮询读数与恢复读者位置持有。

## 重审条件

- 宿主公开跟随状态变更事件或可替换跟随策略时，标记的撤销改读公开状态。
- 宿主修改 `data-chat-following-tail` 的写处、采样窗口长度或根节点包裹结构时，重新核对钉住条件与复位时机。
```

编号与标题以 `docs/adr/` 实际最大号加一为准；该文件创建后，把下一步的引用改为该实际编号。

- [ ] **Step 3: 补 D100 的指向**

在 `docs/adr/D100-scroll-follow-belongs-to-host.md` 的“重审条件”末尾增加一行：

```markdown
- 状态行钉住对读者移动的即时否决记在<Step 2 的实际编号>；D100 删除的读者位置与写回路径不因此恢复。
```

不改 D100 的“决定”正文。

- [ ] **Step 4: 更新样式说明**

`docs/STYLE.md` 的等待行段落把：

```text
The pin stands only while the host reports the
tail (or the stream glide holds the position) and steps aside for the reader's
own scrolling.
```

改为：

```text
The pin stands only while the host reports the
tail (or the stream glide holds the position) and stands down on the frame the
reader scrolls away, before the host's sampling window closes its follow; the
host's own follow edge puts it back when the reader returns.
```

- [ ] **Step 5: 生成索引并校验**

Run: `npm run docs:index`

Run: `npm run docs:check`

Run: `npm run changelog:check`

Expected: 三条命令都 PASS。

- [ ] **Step 6: 运行 lint**

Run: `npm run lint`

Expected: PASS。新增 ADR 章节齐全，变更记录通过校验，正文路径引用都能解析。

---

### Task 6: 构建、全量验收与真实页面复核

**Files:**
- 不改产品文件；只读验证与记录。

**Interfaces:**
- Consumes: Task 1–5 的全部改动。

- [ ] **Step 1: 构建**

Run: `npm run build`

Expected: PASS，打印新的 build 编号。

- [ ] **Step 2: 聚焦运行受影响的规范**

Run: `npx vitest run packages/testing/specs/mechanism/scroll-ownership/ packages/testing/specs/mechanism/chat-wait/ packages/testing/specs/logic/waiting-line/`

Expected: PASS。

- [ ] **Step 3: 运行替身页全量**

Run: `npm run stand-in`

Expected: PASS。

- [ ] **Step 4: 运行验证入口**

Run: `npm run verify`

Expected: PASS。失败项修复后重跑，不跳过 lanes。

- [ ] **Step 5: 真实宿主复核**

在装有可用 `dsh` 的测试机执行：

```powershell
npm run build
npm pack
dsh plugin --profile web install .\dsh-claude-style-lite-0.2.3.tgz
node packages/testing/dsh-web.mjs
```

打开打印的地址，发送一段需要长思考的提问，等状态行显示「正在思考」，在对话区向上滚动，逐项确认：

| 编号 | 操作 | 预期 |
| --- | --- | --- |
| R1 | 状态行钉住时向上滚轮一格 | 状态行在下一帧随内容上移，不停在输入框上方 |
| R2 | R1 后 500ms 内继续到达内容 | 状态行留在文档位置，不重新钉住 |
| R3 | R1 后继续上滚到更高处 | 状态行始终随内容移动，不浮在正文之上 |
| R4 | 滚回末尾 | 回到底部按钮消失，状态行在下一帧恢复钉住 |
| R5 | 触屏或滚动条拖动上滚 | 与 R1 相同 |
| R6 | 在输入框内打字、点选正文文字 | 状态行保持钉住，不因非滚动操作撤钉 |
| R7 | 折叠门滚动期间上滚 | 状态行随内容移动，门结束后仍按读者位置 |
| R8 | 浅色与深色、全动效与减弱动效 | 两种主题与两种动效下行为一致 |

每项写明测试机、时间、结果，保留逐帧录屏或 Playwright 帧记录。R1、R2 以帧序列中状态行屏幕位置与内容同向变化为准，不以“没有看到跳动”代替录屏。

- [ ] **Step 6: 记录真实宿主结果**

把 R1–R8 的读数写入 `docs/superpowers/tests/2026-11-14-thinking-status-pin-release.md`，未执行项写“未执行”，不得写成通过。

- [ ] **Step 7: 最终校验**

Run: `npm run lint`

Run: `npm run docs:check`

Run: `npm run changelog:check`

Expected: 三条命令都 PASS。

---

## 提交划分

1. `feat: 读者移动向等待行广播`：Task 1。
2. `fix: 状态行钉住随读者移动撤下`：Task 2 与 Task 3。
3. `test: 覆盖状态行撤钉与恢复`：Task 4。
4. `docs: 记录读者移动撤下状态行钉住`：Task 5。

方案与计划自身随第 4 个提交入库。`lib/` 与 `.debug/` 不入库。

## 自检

- 方案第 3 节根因链由第 4 节逐帧读数支撑，Task 2 的失败规范复现同一现象。
- 方案第 5 节每个生命周期点都有 Task 1–3 的实现步骤与 Task 4 的验收读数。
- 方案第 8 节放弃的每种做法都没有出现在实施步骤里。
- 方案第 9 节每条验收标准都对应 Task 2、Task 4 或 Task 6 的具体检查。
- 文件路径、导出名、测试 id 与命令按当前仓库核对过；`lib/`、`.debug/` 与临时文件不进入提交。
