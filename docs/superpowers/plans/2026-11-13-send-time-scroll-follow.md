# 发送后初期滚动跟随修复实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让读者在对话发送后的宿主采样窗口内向上滚动时保持自己的位置，不再被插件交还逻辑压回底部。

**Architecture:** 交还基准只取宿主 `data-chat-following-tail` 的真实上升沿；离底读数只回答“曾经跟随后尾”。交还判据抽成纯函数，由机制规范直接检查。写入路径、CSS、动画与过程体逻辑不变。

**Tech Stack:** TypeScript、MutationObserver、DOM Scroll API、Vitest browser mode、仓库自带 `npm run build`。

## Global Constraints

- 只在 `packages/client/src/features/chat-follow/`、`packages/client/src/pure.ts`、`packages/testing/specs/mechanism/scroll-ownership/`、`packages/testing/data/surface.json`、`docs/` 中编辑。
- 不修改 `lib/`；打包由 `npm run build` 与 `pack` 产出。
- 不新增滚动写入来源，不改滚轮事件，不写 `preventDefault()`。
- 不修改 CSS、动画与过程体跟随。
- 规范文件放在 `packages/testing/specs/mechanism/<capability>/<name>.spec.ts`，带 `@capability`、`@features`、`@risk` 头。
- 规范只通过 `@dsh-claude-style/client/pure`、`@dsh-claude-style/contracts/*`、`@dsh-claude-style/engine/*` 访问产品，不拼宿主标记。
- 源文件接近 750 行先拆分；交还判据放进同目录独立模块 `follow-hand-back.ts`，`chat-follow.ts` 保持低于停线。
- 每步先写失败测试，再写实现，再运行受影响测试。

---

### Task 1: 交还判据抽成纯函数

**Files:**
- Create: `packages/client/src/features/chat-follow/follow-hand-back.ts`
- Modify: `packages/client/src/features/chat-follow/chat-follow.ts`
- Modify: `packages/client/src/pure.ts`
- Test: `packages/testing/specs/mechanism/scroll-ownership/follow-window.spec.ts`

**Interfaces:**
- Produces: `followHandBackAllowed(input: FollowHandBackInput): boolean`
- `FollowHandBackInput` 字段：`seenAtTail`、`readerMoved`、`navigationMoved`、`gap`、`viewport`
- 语义：仅当会话曾跟随后尾、读者没有移动、功能没有把位置带到读者选择处、离底不超过一屏时返回 `true`

- [x] **Step 1: 写失败规范**

创建 `packages/testing/specs/mechanism/scroll-ownership/follow-window.spec.ts`：

```ts
/**
 * The skin hands the follow back only when the host's own follow was the writer
 * the reader lost, not when the reader took the position himself (D40, D100).
 * A reader who moved inside the host's sampling window keeps his place.
 *
 * @capability scroll-ownership
 * @features chat-follow
 * @risk The skin presses the host's back-to-end button while the reader is reading higher up, or stops handing back a follow that a layout change lost.
 */
import { expect, test } from 'vitest'
import { followHandBackAllowed } from '@dsh-claude-style/client/pure'

const base = { seenAtTail: true, readerMoved: false, navigationMoved: false, gap: 0, viewport: 600 }

test('a lost follow with no reader move is handed back', () => {
  expect(followHandBackAllowed(base)).toBe(true)
})

test('a reader who moved outranks the hand-back', () => {
  expect(followHandBackAllowed({ ...base, readerMoved: true, gap: 300 })).toBe(false)
})

test('a feature taking the position to the reader\'s choice outranks the hand-back', () => {
  expect(followHandBackAllowed({ ...base, navigationMoved: true })).toBe(false)
})

test('a conversation that never followed the tail is not handed back', () => {
  expect(followHandBackAllowed({ ...base, seenAtTail: false })).toBe(false)
})

test('more than a screen off the end is the reader reading higher up', () => {
  expect(followHandBackAllowed({ ...base, gap: 601, viewport: 600 })).toBe(false)
})
```

- [x] **Step 2: 运行规范确认失败**

Run: `npx vitest run packages/testing/specs/mechanism/scroll-ownership/follow-window.spec.ts`
Expected: FAIL，`followHandBackAllowed` 未导出。

- [x] **Step 3: 实现纯函数**

创建 `packages/client/src/features/chat-follow/follow-hand-back.ts`：

```ts
/** What a hand-back needs to know, read at the moment it would run. */
export interface FollowHandBackInput {
  /** The conversation has stood at or followed its tail at least once. */
  seenAtTail: boolean
  /** The reader moved the conversation after the host's follow last came on. */
  readerMoved: boolean
  /** A feature took the position to a place the reader picked. */
  navigationMoved: boolean
  /** How far the position stands from the end. */
  gap: number
  /** The scroller's own height: more than this off the end is reading higher up. */
  viewport: number
}

/**
 * Whether a lost follow belongs to a layout change (D100). The reader's own
 * move outranks the hand-back: inside the host's sampling window a growth can
 * pin the end again after the wheel, and that pin must not turn the wheel into
 * "he did not move".
 */
export function followHandBackAllowed(input: FollowHandBackInput) {
  if (!input.seenAtTail) return false
  if (input.readerMoved || input.navigationMoved) return false
  return input.gap <= input.viewport
}
```

在 `ensure` 中使用：

```ts
const gap = scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop
if (!followHandBackAllowed({
  seenAtTail,
  readerMoved: readerMovedSince(followSeenAt),
  navigationMoved: navigationMovedSince(followSeenAt),
  gap,
  viewport: scroller.clientHeight,
})) return
```

在 `packages/client/src/pure.ts` 的 `chat-follow` 导出旁加入：

```ts
export { followHandBackAllowed } from './features/chat-follow/follow-hand-back'
export type { FollowHandBackInput } from './features/chat-follow/follow-hand-back'
```

- [x] **Step 4: 运行规范确认通过**

Run: `npx vitest run packages/testing/specs/mechanism/scroll-ownership/follow-window.spec.ts`
Expected: PASS，五项。

---

### Task 2: 跟随基准只取真实上升沿

**Files:**
- Modify: `packages/client/src/features/chat-follow/chat-follow.ts:248-258`
- Test: `packages/testing/specs/mechanism/scroll-ownership/follow-window.spec.ts`

**Interfaces:**
- Consumes: `followHandBackAllowed`
- Produces: `noteTailIfNear` 只写 `seenAtTail`，不再写 `followSeenAt`

- [x] **Step 1: 写失败规范**

在同一规范追加：

```ts
test('a pin after the wheel does not re-arm the hand-back clock', () => {
  const followSeen = 1000
  const wheelAt = 1200
  // The host pinned the end again after the wheel. The hand-back is measured
  // against the follow edge, so the wheel still counts as the reader's move.
  expect(followHandBackAllowed({
    seenAtTail: true,
    readerMoved: wheelAt > followSeen,
    navigationMoved: false,
    gap: 0,
    viewport: 600,
  })).toBe(false)
})
```

- [x] **Step 2: 运行规范确认失败**

Run: `npx vitest run packages/testing/specs/mechanism/scroll-ownership/follow-window.spec.ts`
Expected: FAIL，新增项的 `readerMoved` 若被写成 `false` 则返回 `true`；实现必须让读者移动压过末尾位置。

- [x] **Step 3: 改 `noteTailIfNear`**

把 248–258 行改为：

```ts
/**
 * Whether the conversation has stood at or followed its tail at least once.
 * The reading is not a follow edge: the host turns its follow off and on
 * through the attribute, and only that edge may become the clock a hand-back
 * is measured against. A reader who wheeled just before a growth pinned the
 * end again would otherwise be read as never having moved.
 */
const noteTailIfNear = (scroller: Element | null) => {
  if (scroller === null || seenAtTail) return
  const atTail = scroller.querySelector(FOLLOWING_TAIL_SELECTOR) !== null
    || scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop <= FOLLOW_THRESHOLD_PX
  if (atTail) seenAtTail = true
}
```

- [x] **Step 4: 运行规范确认通过**

Run: `npx vitest run packages/testing/specs/mechanism/scroll-ownership/follow-window.spec.ts`
Expected: PASS，六项。

---

### Task 3: 复核交还途中的读者移动

**Files:**
- Modify: `packages/client/src/features/chat-follow/chat-follow.ts:520-522`
- Test: `packages/testing/specs/mechanism/scroll-ownership/follow-window.spec.ts`

**Interfaces:**
- Consumes: `followHandBackAllowed` 的输入语义
- Produces: `handBackFollow` 的 `stillWanted` 在每轮查看时重新读读者意图

- [x] **Step 1: 写失败规范**

追加：

```ts
test('a reader move during the hand-back ends it', () => {
  let moved = false
  const wanted = () => followHandBackAllowed({
    seenAtTail: true,
    readerMoved: moved,
    navigationMoved: false,
    gap: 0,
    viewport: 600,
  })
  expect(wanted()).toBe(true)
  moved = true
  expect(wanted()).toBe(false)
})
```

- [x] **Step 2: 运行规范确认通过**

Run: `npx vitest run packages/testing/specs/mechanism/scroll-ownership/follow-window.spec.ts`
Expected: PASS。该测试锁定 `stillWanted` 的语义；若把 `readerMoved` 在启动时固定，测试会失败。

- [x] **Step 3: 复核实现**

确认 `ensure` 的 `handBackFollow` 调用仍为：

```ts
handBackFollow('follow', {
  stillWanted: () => !stopped && !readerMovedSince(followSeenAt) && !navigationMovedSince(followSeenAt),
})
```

若 `ensure` 已改用 `followHandBackAllowed`，`stillWanted` 仍保留逐轮读取，不改成常量。

- [x] **Step 4: 运行全部滚动机制规范**

Run: `npx vitest run packages/testing/specs/mechanism/scroll-ownership/`
Expected: PASS，`owner`、`process-body`、`return`、`follow-window` 四份规范全过。

---

### Task 4: 变更记录与文档同步

**Files:**
- Create: `docs/changes/send-time-scroll-intent.json`
- Modify: `docs/ARCHITECTURE.md`（仅当不变量表述需要补一句时）
- Test: `npm run changelog:check`
- Test: `npm run docs:check`

- [x] **Step 1: 写变更记录**

```json
{
  "at": "2026-11-13",
  "group": "fixes",
  "order": 22,
  "external": true,
  "zh": "修复发送消息后立即向上滚动时对话被压回底部的问题",
  "en": "Keep the reader's own scroll position when content arrives just after a message is sent"
}
```

- [x] **Step 2: 若架构说明已准确则不编辑 `docs/ARCHITECTURE.md`**

现有说明已写明“跟随由宿主判定、读者移动只留一个时刻”，本次修复不改变该方向。

- [x] **Step 3: 运行文档检查**

Run: `npm run changelog:check && npm run docs:check`
Expected: 两项通过。

---

### Task 5: 构建与打包

**Files:**
- Build output: `lib/`（不提交）
- Package: `dsh-claude-style-lite-0.2.3.tgz`

- [x] **Step 1: 构建**

Run: `npm run build`
Expected: 退出码 0，打印构建编号。

- [x] **Step 2: 运行机制规范与替身页**

Run: `npx vitest run packages/testing/specs/mechanism/scroll-ownership/`
Expected: PASS。

Run: `node packages/testing/behaviour.mjs --list --spec scroll-ownership`
Expected: 列出滚动机制的可读规范；若该选择没有行为规范，改跑 `npm run stand-in -- --spec chat-follow`。

- [x] **Step 3: 打包**

Run: `npm pack --pack-destination .`
Expected: 生成 `dsh-claude-style-lite-0.2.3.tgz`，包含 `lib/` 与 `locale/`，不含 `lib/**/*.map`。

- [x] **Step 4: 核对包内容**

Run: `tar -tzf dsh-claude-style-lite-0.2.3.tgz | grep -E 'package/(lib/client.js|lib/host/index.js|package.json|locale/zh.json)'`
Expected: 四项都在。

---

### Task 6: 验收留待读者命令

**Files:** 无

- [ ] **Step 1: 报告待验收项**

报告内容：改动文件、构建编号、包路径、机制规范结果、替身页结果。验收动作（真实宿主、替身页、安装包）等读者下令后执行。

- [ ] **Step 2: 不主动提交或推送**

提交与推送等读者验收完成后再做。

---

## 执行记录

- 新增判据 `packages/client/src/features/chat-follow/follow-hand-back.ts`，经 `packages/client/src/pure.ts` 暴露；`chat-follow.ts` 改为只调用它。
- `noteTailIfNear` 不再刷新 `followSeenAt`；基准只来自 `data-chat-following-tail` 的真实上升沿。
- `packages/testing/specs/mechanism/scroll-ownership/follow-window.spec.ts`：8 项通过，其中第 1 项在实现前以“未导出”失败。
- `npx vitest run packages/testing/specs/mechanism/scroll-ownership/`：4 份规范、26 项通过。
- `npm test`：104 个文件、701 项通过。
- `npm run lint`、`npm run changelog:check`、`npm run docs:check`：通过。
- `node packages/testing/stand-in.mjs --case chat-follow --jobs 1`：全部通过，新增两项采样窗口断言通过。
- `node packages/testing/stand-in.mjs --case chat-follow,chat-wait,chat-anchor --jobs 2`：3 个页面全部通过。
- `node packages/testing/stand-in.mjs --spec stuck-thinking-header`：1 项行为规范通过。
- `npm run build`：构建编号 `0056691b8e67`。
- `npm pack`：`dsh-claude-style-lite-0.2.3.tgz`，1.9 MB，100 个文件，入口与构建编号已在包内核对。

