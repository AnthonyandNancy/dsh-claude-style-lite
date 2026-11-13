# 发送后初期对话被压回底部问题的解决方案

> 文档性质：缺陷根因记录与修复方案
> 编制日期：2026-11-13
> 适用仓库：`dsh-claude-style-lite`
> 依据：`packages/client/src/features/chat-follow/chat-follow.ts`、`packages/engine/src/scroll-owner.ts`、上游 DSH 0.20.3 的 `use-chat-reading.ts` 与 `use-scroll-follow.ts`
> 状态：方案已定，修改计划见 `docs/superpowers/plans/2026-11-13-send-time-scroll-follow.md`

---

## 1. 现象

对话正在输出时，读者刚发送消息就向上滚轮。第一下滚轮有时完全不起作用，画面在一两秒内持续停在底部；另一些时候滚轮先成功，随后画面突然跳回底部并重新出现“跟随末尾”。

普通流式输出中途滚轮不受影响。差别集中在发送后的短窗口内。

## 2. 根因

### 2.1 宿主在采样窗口内仍会钉底

上游 `packages/client/ui-chat/src/client/chat/use-chat-reading.ts`：

- `SCROLL_SAMPLE_INTERVAL_MS = 500`，`onScroll` 收到读者滚动只启动 `sampleTimer`，`followingTail` 在 `flushSample` 时才重新判定。
- `onResize` 为 `if (this.pending) return; if (this.state.followingTail) this.followTail()`。
- `use-chat-scroll.ts` 的 `processContent` 对读者自己的提交给予 `ownInput` 例外：`if (reading.pending && !ownInput) return`，随后 `reading.followTail('instant')`。
- `use-chat-viewport.ts` 的 `readScroll()` 以 `observation.top` 判 `movedByReader`；宿主自己写末尾时同步更新 `observation`，所以读者被钉回底部后，下一次采样读到的是“在末尾”。

发送消息本身会触发 `ownInput`，所以读者刚滚上去的 500ms 窗口里，每一次内容增长都可能由宿主重新写到末尾。

### 2.2 插件把“宿主采样结算”误判成“布局丢了跟随”

`chat-follow.ts` 的交还判据由两段组成：

- `noteTailIfNear` 在每次看到宿主跟随属性存在或离底不超过 `FOLLOW_THRESHOLD_PX` 时执行 `followSeenAt = performance.now()`。
- `ensure` 以 `readerMovedSince(followSeenAt)` 判断读者是否动过；未动过则 `handBackFollow` 走到底部并点击宿主的“回到底部”按钮。

`noteTailIfNear` 被尺寸批次、变更批次与 `ensure` 自身反复调用。宿主在采样窗口内钉底后，位置回到末尾，`noteTailIfNear` 刷新 `followSeenAt`，读者滚轮的时间戳因此落在基准之前。500ms 后宿主关闭跟随，`ensure` 看到“读者没动过”，把这次正常结算当成布局丢失，主动回底并点击按钮。

双层叠加的结果：

1. 宿主 `followTail()` 把读者压在底部；
2. 插件 `handBackFollow` 在跟随关闭后再压一次，并重新打开跟随，使读者第二次失去位置。

## 3. 解决方向

### 3.1 跟随基准只取宿主标记的真实上升沿

`followSeenAt` 只在一处更新：宿主从没有 `data-chat-following-tail` 变为有它的属性变化。离底读数只用于判断“会话是否曾经跟随后尾”，不再参与交还的时间基准。

理由：宿主写这个属性就是它自己宣告“从现在起由我跟随末尾”。读者滚轮只有发生在这个宣告之后，才可能是读者主动离开；发生在宣告之前的移动不能被后来的钉底改写成“没动过”。

### 3.2 读者意图优先于按钮交还

`ensure` 在发起 `handBackFollow` 之前检查读者自跟随上升沿以来是否移动过。移动过就直接返回，不写位置，不点击按钮。`stillWanted` 继续在每一轮查看时检查同一条件，读者在交还途中滚动也会终止这一轮。

### 3.3 采样窗口内的位置由宿主自己结算

宿主在 `pending` 状态下自己会处理增长：`onResize` 跳过、`processContent` 按 `ownInput` 或 `tipChanged` 规则决定是否 `followTail()`。插件不再在跟随关闭的瞬间补一次回底，避免与宿主的状态机争抢。

检测方式：宿主关闭跟随的那个属性变化发生在读者自上次跟随上升沿之后移动过时，本次交还直接作废。

### 3.4 保持现有写入路径

- 不新增滚动写入来源。
- 不在滚轮事件上调用 `preventDefault()`。
- 不修改 CSS，不依赖 `overflow-anchor`。
- 不保存读者位置，不写回旧位置。
- 过程体的独立跟随逻辑不变。

## 4. 修改点

### 4.1 `packages/client/src/features/chat-follow/chat-follow.ts`

`noteTailIfNear` 改为只回答“曾经跟随后尾”：

```ts
const noteTailIfNear = (scroller: Element | null) => {
  if (scroller === null || seenAtTail) return
  const atTail = scroller.querySelector(FOLLOWING_TAIL_SELECTOR) !== null
    || scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop <= FOLLOW_THRESHOLD_PX
  if (atTail) seenAtTail = true
}
```

`onRecords` 的跟随属性分支保留真实上升沿的 `followSeenAt`：

```ts
if (record.attributeName === FOLLOWING_TAIL_ATTRIBUTE) {
  const following = record.target instanceof Element && record.target.hasAttribute(FOLLOWING_TAIL_ATTRIBUTE)
  if (following) followSeenAt = performance.now()
  else { stopSlide(); guardSeen = true }
  continue
}
```

`ensure` 的交还门槛保持 `readerMovedSince(followSeenAt)` 与 `navigationMovedSince(followSeenAt)`，并继续在 `handBackFollow` 的 `stillWanted` 中复核。新增注释说明基准只来自上升沿，采样窗口内的位置变化不属于布局丢失。

### 4.2 机制规范

新增 `packages/testing/specs/mechanism/scroll-ownership/follow-window.spec.ts`，验证：

1. 离底不超过阈值但读者已滚轮时，`noteTailIfNear` 不刷新交还基准。
2. 宿主跟随属性真实上升沿之后的滚轮会阻止交还。
3. 上升沿之前发生的滚轮不会在宿主关闭跟随时被交还按钮覆盖。
4. 没有读者移动时，属性关闭仍能触发一次交还。

为让机制规范直接检查交还基准，`chat-follow.ts` 将交还判据抽成纯函数：

```ts
export function followHandBackAllowed(input: {
  seenAtTail: boolean
  readerMoved: boolean
  navigationMoved: boolean
  gap: number
  viewport: number
}): boolean
```

`ensure` 使用该函数。纯函数经 `packages/client/src/pure.ts` 暴露给规范，符合 D92 的规范入口规则。

### 4.3 变更记录

新增 `docs/changes/send-time-scroll-intent.json`，记录读者在发送后立即滚轮时位置不再被压回底部。

## 5. 等价与边界

- 没有读者移动时，布局造成的跟随丢失仍由一次按钮交还恢复，`readerScroll` 场景的既有断言不变。
- 读者移动过时，宿主自己负责关闭跟随；插件不写位置、不点击按钮。
- 宿主在采样窗口内对 `ownInput` 的钉底行为保留。插件只消除第二次回底。
- 会话切换、历史恢复、折叠门的交还路径不变。
- 动画、样式、DOM 结构、等待行固定、过程体跟随均不变。

## 6. 验收依据

- 新增机制规范四项全过。
- 既有的 `reader-scroll`、`scroll`、`door-pin` 场景保持通过。
- 替身页复现：发送后滚轮 + 采样窗口内增长，最终 `scrollTop` 停在读者选择的位置，回到底部按钮不被插件点击。
- 对照复现：没有读者移动时，属性关闭后回到底部按钮仍被点击一次。

## 7. 重审条件

- 宿主公开跟随状态变更事件或可替换的跟随策略时，交还基准改为读宿主的公开状态，删除属性观察推断。
- 宿主修改 `data-chat-following-tail` 的写处或取消 500ms 采样窗口时，重新核对交还门槛与 `readerMovedSince` 的时间关系。
