# 恢复宿主自有的滚动跟随：解决方案

- 日期：2026-11-13
- 范围：`packages/engine/src/scroll-owner.ts`、`packages/client/src/features/{chat-follow,chat-anchor,chat-fold,turn-nav,composer,question-card,chat-wait,chat-fold}`
- 取代：D99

## 1. 结论

皮肤把「滚动跟随」这件事整条归还宿主。皮肤不再记录读者的位置，不再在内容增长时写回任何旧位置，也不再维护第二套「读者持有」状态。留下的只有三件宿主做不到的事：流式增长的合成器位移（D95）、折叠门的高度动画（D40 的来源排序）、以及用宿主自己的「回到底部」按钮把跟随交还宿主。

一次改动解决三件事：

1. 手动滚到上方后点「回到底部」，后续响应不再把窗口拉回旧位置。
2. 读者滚到上方后，流式输出、工具调用、过程组开合都不再把他拉回末尾，除非他自己回到末尾。
3. 皮肤与宿主的跟随状态只剩宿主一份，二者不可能再各说各话。

## 2. 现象与根因

读者的操作序列：滚动到上方 → 点宿主中间按钮 → 输入并发送 → 响应到达 → 窗口跳回上一次滚动的位置。

根因是皮肤维护了与宿主并行的第二套跟随状态：

- `scroll-owner.ts` 的 `held`、`readerPositions`、`readerFloors`、`heldTowardEnd` 记录「读者持有某容器」和他的位置，并向跟随来源（`composer`、`follow`、`process`）返回拒绝。
- `chat-follow.ts` 的 `holdGrowth` 在宿主把末尾写好之后，把 `readerScrollPosition(scroller)` 写回容器。
- 宿主按钮位于滚动容器之外，它既不是容器上的读者意图，也不产生读者位移。D99 用文档捕获阶段的 `click` 监听把这次点击翻译成 `setHeld(scroller, false)`。

D99 的翻译只在按钮能被找到、且找到的正是读者按下的那一个按钮时成立。`findFollowTailButton()` 从 `conversationColumn()` 出发按形状取按钮，而 `conversationColumn()` 与 `conversationScroller()` 都是「文档中第一个匹配元素」的缓存。页面上存在更早的对话节点时，形状查询与容器缓存会指向那一个，真实按钮的点击成为漏判，`held` 与 `readerPositions` 继续存在，下一次增长把旧位置写回容器。这就是窗口跳回顶部的那一步。

即使按钮命中，这套结构也要求皮肤的持有状态与宿主的 `followingTail` 在每个时刻同步。两套状态同步是这件事的根本代价，而不是某一次查询的写法。

## 3. 宿主的跟随语义（DSH 0.2.2-rc.2 源码）

摘自 `@deepseek-ai/dsh-client-ui-chat` 的 `chat/`：

| 位置 | 事实 |
| --- | --- |
| `use-chat-reading.ts:159` `onScroll` | 跟随期间收到非读者位移的 scroll，直接 `followTail()`；读者位移落在末尾 1px 内同样回到末尾；其他读者位移挂起 500 ms 采样 |
| `use-chat-reading.ts:175` `onScrollEnd` | 原生跟随动画结束时结算；不再接近末尾则 `publish({ followingTail: false })` |
| `use-chat-reading.ts:193` `onResize` | 采样挂起时不动；`followingTail` 为真时 `followTail()` 把新的末尾写下来 |
| `use-chat-reading.ts:211` `commit` | `followingTail` 为真时 `store.save(null)`，读者位置被删除；否则保存语义锚点 |
| `use-chat-reading.ts:83` `followTail` | 写末尾、取消采样、`commit(landing, true)` |
| `use-scroll-follow.ts:67` `nearBottom` | 跟随阈值 25px（`use-chat-reading.ts` 传 `FOLLOW_THRESHOLD + 1`） |
| `use-scroll-follow.ts:90` `sample` | 只有 `movedByReader` 才改跟随意图；到达阈值内即重新跟随 |
| `use-chat-scroll.ts:70` `processContent` | 自己的输入、结尾变化、跟随期间的内容增长都走 `reading.followTail()`，没有第二条写位置的路径 |
| `use-chat-scroll.ts:193` `returnToBottom` | `cancelPendingFollow(); navigation.cancel(); reading.followTail()` |
| `use-chat-navigation.ts:103` | 跳到某一轮之前调用 `reading.pauseFollowing()`，跟随由宿主自己关掉 |
| `ChatView.tsx:242` | 根节点上写 `data-chat-following-tail`，它就是「跟随中」这一个事实 |
| `ChatView.tsx:302` | 按钮只在 `followingTail === false` 时渲染，`onClick` 即 `returnToBottom` |

宿主只有一份跟随状态 `followingTail`，只有一条写末尾的路径 `followTail()`，并且每次写到末尾都删除保存的位置。它没有「读者持有」这个概念：读者滚到上方，采样把 `followingTail` 关掉，之后内容增长不再移动位置；读者回到末尾或按下按钮，跟随重新打开。

皮肤要跟原版一致，就是只读这两个事实：根节点上的 `data-chat-following-tail`，以及容器的几何。

## 4. 决定

### 4.1 删除读者持有

`packages/engine/src/scroll-owner.ts` 保留「谁可以移动位置」的来源排序、缓动、提交观测与回到底部交接；删除读者持有的全部状态与入口：

- 状态：`held`、`readerPositions`、`readerFloors`、`heldTowardEnd`、`markedScrollers`、`scrollbarDrag`、`touchContactY`、`PROCESS_RELEASE_THRESHOLD_PX`、`FOLLOW_TAIL_ACTIVATION_TYPE`。
- 函数：`setHeld`、`syncHoldMark`、`isHostGrowthPin`、`readerHolds`、`releaseReader`、`releaseAtTail`、`holdReader`、`readerScrollPosition`、`noteScroll`、`noteFollowTailActivation`、`endScrollbarDrag`、`beginScrollbarDrag`、`floorOf`、`forgetDetached` 的标记清理、`contactY`。
- 来源：`ScrollSource` 去掉 `'reader'`，`claim` 不再按持有拒绝跟随来源。
- 词汇：`skin.ts` 的 `readerHold` 字段、`entry.ts` 的交接、`constants.ts` 的 `READER_HOLD_ATTR`、`scripts/build/source-tree.mjs` 的 `HANDED_OVER` 条目一并删除。

保留 `noteIntent` 的意图时钟：它只把「读者做了一次会移动位置的动作」记成 `lastMovingIntentAt`，供 `readerMovedSince` 查询。会移动位置的动作是滚轮、触摸的开始、落在滚动条上或按下中键的指针按压、滚动按键；落在一段文字上的按压只选中文字，不算移动。它不记录位置，不拒绝任何来源，不写任何属性。

### 4.2 皮肤唯一的跟随判据是宿主的标记与意图时钟

`chat-follow.ts` 的跟随交还改为：

- `slideWanted` 只要求 `column.closest(FOLLOWING_TAIL_SELECTOR) !== null`，删去 `readerAway()`。
- 删去 `holdGrowth`、`readerAway`、`READER_HOLD_ATTR` 的变更分支与 `attributeFilter` 条目。
- 新增 `followSeenAt`：宿主的跟随标记在场时记下时刻（属性到达时与每次内容到达时的 `noteTailIfNear`）。
- 滚动主人新增 `lastNavigationAt` 与 `navigationMovedSince(since)`：走 `jump` 来源的写入（轮次跳转、答案第一行）记下时刻。宿主的采样把这种写入读成读者的移动并关掉跟随；没有这个时钟，交还守卫会在答案刚开始时立刻把位置按回末尾。
- `ensure` 的条件从「读者仍在持有」改为「读者自 `followSeenAt` 起没有做过移动意图，也没有功能把他带到他挑的位置」：

```ts
const ensure = (attempt?: number) => {
  if (stopped) return
  const scroller = conversationScroller()
  if (scroller === null) return
  noteTailIfNear(scroller)
  if (!seenAtTail) return
  // 读者自跟随最后一次在场之后自己动过，或功能把他带到他挑的位置：位置是他的，交还不属于皮肤。
  if (readerMovedSince(followSeenAt) || navigationMovedSince(followSeenAt)) return
  ...
  handBackFollow('follow', { stillWanted: () => !stopped && !readerMovedSince(followSeenAt) && !navigationMovedSince(followSeenAt) })
}
```

这与宿主的 `movedByReader` 归因同构：读者动过，跟随的开关是读者的事；读者没动过而跟随丢了，那一次丢失是布局引起的，用宿主自己的按钮交还。

`holdCheck` 的 `!readerAway()` 条件删除，门滚动期间标记照旧。

### 4.3 上限过程体按末尾几何跟随

`process-follow.ts` 用逐体的末尾读数替换读者持有：

```ts
/** 上一次观察到的「这个体在自己的末尾」，按体记录。 */
const atEnd = new WeakMap<Element, boolean>()

/** 体自己的滚动：读者把它移开末尾或移回末尾，都在这里读。 */
const onBodyScroll = (event: Event) => {
  const body = event.currentTarget
  if (body instanceof Element) atEnd.set(body, gapOf(body) <= CATCH_UP_GAP_PX)
}

const catchUp = (body: Element) => {
  if (!followable(body)) return
  const gap = gapOf(body)
  const wasAtEnd = atEnd.get(body) ?? gap <= CATCH_UP_GAP_PX
  atEnd.set(body, gap <= CATCH_UP_GAP_PX)
  if (!wasAtEnd || gap <= CATCH_UP_GAP_PX) return
  easeScrollToEndFor(body, 'process', () => !stopped && followable(body))
}
```

内容增长发生在体停在末尾时，增长被缓动补回末尾；读者把体滚开之后，增长不再追他，他回到末尾时下一个增长重新跟随。这对应宿主在过程体上使用的 `nearBottom` 规则（阈值 1px，这里用 `CATCH_UP_GAP_PX` 之前的读数，含义相同）。

### 4.4 其余写位置的功能

| 文件 | 改动 | 理由 |
| --- | --- | --- |
| `features/turn-nav/turn-nav.ts` | 删去 `holdReader(scroller)` 与其注释 | 宿主 `navigateToTurn` 已经 `pauseFollowing()`，跟随由宿主关掉 |
| `features/chat-anchor/chat-anchor.ts` | 删去 `holdReader`，`grow` 的门改为 `readerMovedSince(anchoredAt)` | 锚点自己的写入就是读者选择的位置，宿主采样后关掉自己的跟随 |
| `features/composer/composer.ts` | 删去 `followTranscript` 与其调用 | 宿主观察 composer 并在 `followingTail` 时 `followTail()`；皮肤 150px 的带宽比宿主宽，会把读者拉回 |
| `features/question-card/question-card.ts` | 删去末尾写入 | 同一原因：卡片插入后的高度变化由宿主观察 |
| `features/chat-wait/chat-wait.css` | 两条规则删去 `:not([data-dsh-claude-reader-hold])` | 标记不再存在；钉住只由 `data-chat-following-tail` 与门的标记决定 |

`ScrollSource` 因此只剩 `'jump' | 'fold' | 'follow' | 'process'`，排序为 `process < follow < fold < jump`。

## 5. 影响范围

### 5.1 直接修改

```
packages/engine/src/scroll-owner.ts
packages/engine/src/skin.ts
packages/client/src/constants.ts
packages/client/src/entry.ts
packages/client/src/features/chat-follow/chat-follow.ts
packages/client/src/features/chat-follow/process-follow.ts
packages/client/src/features/chat-anchor/chat-anchor.ts
packages/client/src/features/turn-nav/turn-nav.ts
packages/client/src/features/composer/composer.ts
packages/client/src/features/question-card/question-card.ts
packages/client/src/features/chat-wait/chat-wait.css
scripts/build/source-tree.mjs
```

### 5.2 测试与观测

```
packages/testing/specs/mechanism/scroll-ownership/owner.spec.ts
packages/testing/specs/mechanism/scroll-ownership/return.spec.ts
packages/testing/specs/mechanism/scroll-ownership/touch-hold.spec.ts   (删除)
packages/testing/specs/fixtures/vocabulary.ts
packages/testing/smoke/probe/chat-follow.js
packages/testing/smoke/cases/chat.mjs
packages/testing/scenarios/reader-scroll.mjs
packages/testing/scenarios/door-pin.mjs
packages/testing/data/bounds.json
packages/testing/data/element-collections.json   (npm run element-collections 生成)
```

### 5.3 文档

```
docs/adr/D100-scroll-follow-belongs-to-host.md   (新增，取代 D99)
docs/adr/D95-stream-slide-counter-pins.md        (修订：删去增长写回)
docs/adr/D84-answer-first-line.md                (修订：删去持有)
docs/adr/README.md                               (npm run docs:index 生成)
docs/ARCHITECTURE.md                             (引擎词汇表删去「持有」)
docs/changes/host-owned-scroll-follow.json       (新增)
docs/tests/2026-11-12-desktop-notification-scroll.md  (S4.7、S4.8、E-S4.1、E-S4.7、E-S4.8)
```

## 6. 保持不变

- 流式输出的位移与吸附元素的抵消（D95）：位移是合成器上的 `transform`，不写位置。
- 折叠门的高度动画与滑动（D40、D95）：门滚动期间的位置补偿与门的标记不变。
- 会话切换时清除提交窗口（`claimConversation`）。
- 轮次导航的跳跃与滑行（`glideLanding`，来源 `jump`）。
- 正式回答第一行的接管（D84）：接管本身与逐次增长的目标写入保留。
- 通知、侧栏、设置等与滚动无关的功能。

## 7. 放弃的做法

- 继续加按钮点击的补丁（D99 的做法）：它要求两套跟随状态在每个时刻一致，而状态的同步才是问题的本体。
- 保留 `held`，只把按钮查询改成按点击目标解析：同一棵形状查询在页面上有第二个对话节点时仍然脆弱。
- 皮肤自己实现采样窗口来模拟 `followingTail`：宿主已经有一份，第二份必然再次分叉。
- 用固定时长窗口替代意图判断：窗口长度是猜的，读者在那之后仍读着上方。
- 读者持有期间由皮肤把位置写回：位置的所有权在宿主，宿主每次写到末尾都会删掉保存的位置，写回必然与它冲突。

## 8. 验证

### 8.1 构建与静态检查

1. `npm run build`：类型检查、来源检查、契约检查、清单检查全部通过。
2. `npm run element-collections`：`process-follow.ts` 的元素键集合计数更新为 2，`scroll-owner.ts` 减少。
3. `npm run lint`：源文件行数、决策编号、被引用的路径、bounds 表、检查记录一致。
4. `npm run docs:index`：`docs/adr/README.md` 出现 D100，D99 进入作废行。

### 8.2 机制规格

`npx vitest run packages/testing/specs/mechanism/scroll-ownership` 覆盖：

| 规格 | 断言 |
| --- | --- |
| `owner.spec.ts` | 来源排序；写入终止排序更低的缓动；提交窗口由新会话清除；减少动效时缓动即目标；`readerMovedSince` 只认会移动位置的动作；离开滚动主人后不再记录意图 |
| `return.spec.ts` | 位置在末尾时交接只按一次宿主按钮；位置离末尾时先缓动到末尾再按；`stillWanted` 为假时一次也不按；按下之后的内容增长停留在宿主写下的末尾 |

### 8.3 冒烟与场景

| 入口 | 断言 |
| --- | --- |
| `packages/testing/smoke/cases/chat.mjs` | 结构时刻把 60px 的差距交还到末尾；读者自己滚开后的 60px 保持不动；宿主按钮按下后增长的末尾距离为 0；上限体的追赶从末尾开始逐帧走回 |
| `packages/testing/scenarios/reader-scroll.mjs` | 读者滚动之后宿主的跟随标记消失，位置停在读者处，状态行不再钉住 |
| `packages/testing/scenarios/door-pin.mjs` | 门滚动期间状态行钉住，且这些帧里宿主的跟随标记在场 |

### 8.4 真机

1. 长会话滚到上方，点中间按钮，发送消息并等待完整流式响应：位置一直在末尾。
2. 同样序列中，在响应到达后复制文本、再点按钮：不再跳回。
3. 滚到上方不动，等待工具调用与过程组开合：位置保持。
4. 滚到上方后自己滚回末尾：跟随恢复，后续增长停在末尾。

## 9. 风险与回退

| 风险 | 处理 |
| --- | --- |
| 读者按在末尾不动（触屏按住）时的增长会把他推走 | 这是宿主的原生行为：按住不发滚动，宿主的跟随保持打开。接受，作为与宿主一致的一部分 |
| 宿主的跟随标记因布局变化短暂消失 | 意图时钟能区分：读者没动过就交还一次，动过就不交还 |
| 上限过程体在读者滚开后不再跟随 | 读者回到末尾后下一个增长重新跟随，与宿主 `nearBottom` 一致 |
| 回退 | 按本文件第 4 节反向手工恢复：把 `held`、`readerPositions`、`holdGrowth` 与 D99 的按钮监听按原样写回，并恢复 `readerHold` 词汇；`lib/` 由 `npm run build` 重新生成 |
