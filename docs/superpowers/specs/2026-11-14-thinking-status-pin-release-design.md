# 思考状态行上滚停留问题的解决方案

> 文档性质：缺陷根因记录与修复方案
> 编制日期：2026-11-14
> 适用仓库：`dsh-claude-style-lite`
> 依据：`packages/client/src/features/chat-wait/chat-wait.css`、`packages/client/src/features/chat-follow/chat-follow.ts`、`packages/engine/src/scroll-owner.ts`、上游 DSH 0.20.3 的 `use-chat-reading.ts` 与 `use-scroll-follow.ts`、按该时序制作的替身页复现
> 状态：方案已定，修改计划见 `docs/superpowers/plans/2026-11-14-thinking-status-pin-release.md`

---

## 1. 现象

对话正在输出、状态行显示「正在思考」时，读者在对话区向上滚动。状态行没有立即跟着内容离开钉住位置，先停在输入框上方一段可感知的时间，随后才退到它在文档里的位置并随内容向上移动。这段停留里状态行浮在读者正在回看的内容之上。

用户可观察的顺序固定为：滚轮向上 → 对话内容立即上移 → 状态行留在原位 → 数百毫秒后状态行落到文档位置并继续上移。

## 2. 影响范围

- 只在实时回合的运行行走廊上出现：宿主写了 `[data-chat-running]`，等待行把宿主自己的文字换成皮肤的状态行，并写 `data-dsh-claude-wait-tail`。
- 只在聊天区跟随开启时出现：皮肤写了 `data-dsh-claude-chat-follow`，宿主写了 `data-chat-following-tail`，或者流式滑动的保持标记 `data-dsh-claude-follow-hold` 正在。
- 滚轮、触屏拖动、滚动条拖动、按上方向键与翻页都以同一路径进入；差别只在宿主撤下跟随标记的时机。
- 流式输出中的内容增长不改变结论。复现中上滚后的增长只把离尾距离从 384px 增加到 432px，状态行仍留在钉住位置，说明停留不是增长重新钉底造成的。

## 3. 根因

### 3.1 钉住的唯一条件来自宿主的跟随标记

`packages/client/src/features/chat-wait/chat-wait.css` 的钉住规则只有两个入口：

```css
body[data-dsh-claude-style][data-dsh-claude-chat-follow]
  [data-conversation-scroll] [data-chat-following-tail]
  [data-chat-running][data-dsh-claude-wait-tail],
body[data-dsh-claude-style][data-dsh-claude-chat-follow]
  [data-conversation-scroll] [data-dsh-claude-follow-hold]
  [data-chat-running][data-dsh-claude-wait-tail] {
  position: sticky;
  bottom: calc(...);
}
```

状态行是否钉住，只由宿主当前的 `data-chat-following-tail` 与折叠门的 `data-dsh-claude-follow-hold` 决定。读者的滚动意图不在其中。

### 3.2 宿主把读者移动留到采样结束才结算

上游 `packages/client/ui-chat/src/client/chat/use-chat-reading.ts`：

- `SCROLL_SAMPLE_INTERVAL_MS = 500`。
- `onScroll` 在读者移动后只执行 `this.sampleTimer ??= window.setTimeout(this.flushSample, SCROLL_SAMPLE_INTERVAL_MS)`，`followingTail` 仍在 `true`。
- `flushSample` 才执行 `this.follow.sample(scroll.metrics, scroll.movedByReader)`，按新位置判定 `followingTail`，然后 `publish` 让根节点的 `data-chat-following-tail` 消失。

上游 `ChatView.tsx` 把 `scroll.followingTail` 写成根节点的 `data-chat-following-tail`。因此从滚轮发生到属性消失之间，最多存在约 500 毫秒的窗口。

### 3.3 两条链叠加成停留

1. 读者滚轮向上，浏览器立即改变 `scrollTop`，内容立即上移。
2. 宿主收到 `scroll`，只启动采样计时，`data-chat-following-tail` 仍在。
3. 状态行的 `position: sticky; bottom: …` 仍成立，行被钉在输入框上方，不随内容移动。
4. 采样计时到点，宿主执行 `flushSample`，把 `followingTail` 判为 `false`，`data-chat-following-tail` 消失。
5. 钉住规则不再匹配，状态行回到普通流，落在它当前文档位置并随内容上移。

停留长度即宿主采样窗口的剩余时间，加上采样回调到下一帧绘制的时间。

### 3.4 为什么现在才暴露

D100 之前的钉住规则带有 `:not([data-dsh-claude-reader-hold])`，读者的滚轮被皮肤记为持有，钉住规则在同一帧失效。D100 删除了读者持有与 `READER_HOLD_ATTR`，把跟随状态完全交给宿主；删除范围包括钉住规则里的即时否决，于是只剩宿主的延迟采样。

D100 删除的是读者位置与写回路径，这些删除仍然正确。被误删的是“读者已经移动”这一即时读数对底部钉住的否决。`packages/engine/src/scroll-owner.ts` 仍保留 `lastMovingIntentAt`、`noteIntent` 与 `readerMovedSince(since)`，它们只记时刻，不记位置，也不写滚动。

## 4. 已复现的证据

### 4.1 页面结构

在 `chat-follow` 替身页使用该页自带的宿主包裹，构造与宿主相同的层级：

```text
#debugScroller[data-conversation-scroll]
  #debugFollowing[data-chat-following-tail]
    [data-chat-flow]
      filler 600px
      [data-streaming]
      [data-chat-running][data-dsh-claude-wait][data-dsh-claude-wait-tail]
```

容器高 240px，内容高 648px，状态行高 24px，`--dsh-composer-height` 设为 24px。替身页运行当前构建 `0056691b8e67`，皮肤已在 body 写 `data-dsh-claude-chat-follow`。

### 4.2 读数

位置在末尾时 `scrollTop = 408`，离尾距离 0px，状态行 `position` 计算值为 `sticky`，`rowTop = 240`。

在对话容器上派发向上滚轮，把 `scrollTop` 改到 108，离尾距离 300px。逐帧读数：

| 阶段 | 离尾距离 | 状态行顶部 | 钉住 | 跟随标记 | 否决标记 |
| --- | --- | --- | --- | --- | --- |
| 末尾 | 0px | 240 | 是 | 在 | 不在 |
| 上滚后第 1 帧 | 300px | 240 | 是 | 在 | 不在 |
| 上滚后第 2 帧 | 300px | 240 | 是 | 在 | 不在 |
| 上滚后 350ms | 300px | 240 | 是 | 在 | 不在 |

内容已经上移 300px，状态行仍停在输入框上方的 240。替身页没有宿主采样计时器，`data-chat-following-tail` 在整段读数里保持存在；真实宿主在 `flushSample` 后撤下它，状态行才落回文档位置。读到的现象与用户描述一致：行先停住，之后才随内容移动。

### 4.3 对照

- 不写 `data-dsh-claude-wait-tail` 时钉住从不生效，行始终在文档中随内容走。这排除了钉住之外的全部原因。
- 只增长内容、不写滚动位置时，离尾距离增加 48px，说明增长不会把读者带回末尾，停留与重新钉底无关。
- 读者滚轮之后，`readerMovedSince(wheelAt)` 立即为真。皮肤已有这个读数，不需要新状态。
- 本机 `dsh` 命令不可用，真实宿主的 500 毫秒采样由上游源码 `use-chat-reading.ts` 的 `onScroll` 与 `flushSample` 佐证；真实宿主逐帧复核列入修改计划 Task 6。

## 5. 方案

### 5.1 用读者移动时刻否决底部钉住

钉住规则新增一个由皮肤维护的标记：读者在本次宿主跟随期间移动过，标记在对话容器上；读者回到末尾、宿主重新跟随之后，标记撤下。

规则的判定顺序保持现状：宿主跟随或折叠门保持存在时，才可能钉住；这两个条件之后，再看读者是否已经移动。读者移动过的状态里，行回到文档流。

### 5.2 标记的生命周期

- 设置：读者在对话容器内发出 `wheel`、`touchstart`、`touchmove`、`pointerdown`、可滚动的 `keydown` 或 `beforematch`，并且 `noteIntent` 接受了这次意图，皮肤在随后的帧写入里把标记放到当前对话容器上。
- 撤下：宿主重新给出 `data-chat-following-tail`，或对话容器换了会话、被替换、功能卸载。
- 不设置：指针或键盘事件发生在输入框内、点击文字做选择、普通左键点在非滚动区域。判据沿用 `scroll-owner.ts` 的 `isReaderScrollIntent`、`intentReaches` 与 `pressMovesScroll`，不另造一套。
- 不写位置，不改变宿主的跟随状态，不点击回到底部按钮，不阻止滚轮默认行为。

### 5.3 为什么由宿主标记撤销来复位

读者滚回末尾时，宿主的 `onScroll` 看到位置在阈值以内，直接执行 `followTail()` 并把 `followingTail` 写回 `true`，同步给出 `data-chat-following-tail`。这个上升沿是“读者回到末尾”的权威读数，皮肤用属性观察即可复位标记。读者停在中途时，标记保留，行留在文档流。

### 5.4 不恢复 D100 删除的内容

- 不恢复 `readerPositions`、`readerFloors`、`heldTowardEnd`、`setHeld`、`readerHolds`、`holdReader`、`releaseReader`、`releaseAtEnd`、增长写回与 `skin.ts` 的 `readerHold` 词汇。
- 不恢复 `data-dsh-claude-reader-hold` 这个表示“皮肤持有滚动”的名字。
- 新标记只表示“读者在本次跟随期间移动过”，不表示“位置归皮肤写”。
- 滚动写入仍只有宿主的跟随与滚动主人 `jump > fold > follow > process` 这几条路径。

### 5.5 与流式滑动、折叠门的关系

- 流式滑动 `startSlide` 只在 `slideWanted` 为真时运行；`slideWanted` 已经要求宿主的 `data-chat-following-tail` 存在，读者移动后标记存在，但宿主标记仍在的窗口里仍可能滑动。滑动只动合成器位移，不写滚动位置，状态行的位移由 `runningRows` 的反向动画抵消；钉住撤下后反向动画仍成立，行的屏幕位置保持不变，直到滑动结束。
- 折叠门 `markHold` 期间宿主标记可能已消失，`data-dsh-claude-follow-hold` 单独让钉住成立。读者移动时新标记同样否决它，门滚动期间行回到文档流，与 D100 的读者优先原则一致。
- 读者回到末尾并触发宿主标记上升沿后，两个钉住入口都恢复，状态行重新钉住。

### 5.6 与宿主升级的关系

方案读的是 D100 已经记录的宿主契约：`data-chat-following-tail` 写在根节点，`followingTail` 由宿主的采样决定。宿主提供可替换跟随策略或公开跟随状态变更事件时，把标记的撤销条件改为读该公开状态（D40 的重审条件）。

## 6. 改动清单

### 6.1 `packages/engine/src/scroll-owner.ts`

- 新增读者移动的订阅出口，供功能层登记“读者移动后调用我”的回调；回调在某次被接受的移动意图之后、下一帧写入阶段运行一次。
- 沿用 `noteIntent` 的受理判据，不复制 `isReaderScrollIntent`、`intentReaches`、`pressMovesScroll`。
- 保持 `readerMovedSince` 的现有语义不变，已有调用方 `chat-anchor.ts`、`chat-follow.ts`、`fold-glide-parts.ts` 不受影响。
- 模块仍然只在第一个功能 `joinScrollOwner()` 时挂监听，最后一个功能离开时撤监听；订阅本身随 `joinScrollOwner()` 的返回函数释放。

### 6.2 `packages/client/src/features/chat-wait/`

- 在 `install` 中订阅读者移动；把标记写到当前 `[data-conversation-scroll]` 上。
- 用 `observeMatches` 观察 `[data-chat-following-tail]`，在上升沿撤下标记；用 `observeSession` 在会话切换时撤下并释放。
- 卸载时撤下标记与全部订阅。
- `chat-wait.css` 的两条钉住规则和两条遮罩规则各加 `:not([data-dsh-claude-wait-reader-moved])`。
- 注释说明标记只否决钉住，不持有位置，并引用 D100 与本次决策。
- `chat-wait.manifest.ts` 的 `contracts` 增加 `chat.following-tail` 与 `chat.following-tail-attribute`，`surface` 登记新标记。

### 6.3 `packages/testing/data/surface.json`

新增条目：

```json
{
  "id": "chat-wait.reader-moved",
  "attribute": "data-dsh-claude-wait-reader-moved",
  "feature": "chat-wait",
  "sees": "the running status line's pin standing down because the reader moved the conversation since the host's follow came on"
}
```

### 6.4 验收测试

- 机制规范：`scroll-owner` 的读者移动订阅在受理与拒绝的事件上各断言一次；`chat-wait` 的钉住判定在新的纯函数或类上断言四个输入组合。
- 行为规范：在 `chat-follow` 替身页构造状态行，滚轮后宿主标记仍在的帧里断言 `position` 不是 `sticky`；回到末尾并写回标记后断言恢复 `sticky`；增长 48px 后断言行的屏幕位置随内容上移。
- 端到端场景：`reader-scroll` 的既有断言保持，新增“滚轮后的第一帧起行不再钉住”的读数；真实宿主不可用时记录为未执行，由计划中的命令在测试机补跑。
- 冒烟检查：`chat-wait` 的钉住开关断言保留；新增“读者移动后钉住撤下、跟随上升沿后恢复”的读数。

### 6.5 文档

- 新增 `docs/changes/reader-moved-releases-status-pin.json`，写明读者上滚时状态行立即离开钉住位置。
- 更新 `docs/STYLE.md` 的等待行段落，说明钉住会在宿主采样窗口内被读者移动否决。
- 本次缺陷的决策约束写入新的 ADR，取代或补充 D100 的钉住条款；文件号在实施时按 `docs/adr/README.md` 的当前最大号顺延。

## 7. 边界与等价

- 宿主跟随关闭、行在文档里的现有行为不变。
- 没有读者移动时，宿主采样结算后行才离开钉住位置的现有行为不变；这条路径由宿主跟随丢失触发，属于布局变化，不是读者移动。
- 会话打开在历史位置、读者没有移动时，行只在宿主跟随成立时钉住，行为不变。
- 读者回到末尾时，宿主标记上升沿撤下新标记，行的钉住恢复；恢复发生在宿主跟随打开之后的下一帧写入阶段，晚于宿主自己的写入。
- 触屏按住不滑动、指针点选文字、输入框内按键都不算读者移动，钉住保持。
- 滚动条拖动、触屏拖动、上方向键、翻页与 `beforematch` 都算读者移动。
- 屏读与键盘焦点不受影响：新标记是纯视觉状态，不加 `aria`，不改 DOM 结构。
- 浅色与深色主题共用同一条规则，不新增颜色或动效。

## 8. 放弃的做法

- 在滚轮事件上直接写 `scrollTop` 或调用 `preventDefault()`：抢走宿主的原生滚动，触屏与惯性滚动会变差。
- 把宿主 `data-chat-following-tail` 删除：皮肤写宿主的标记，宿主下一次渲染会把状态写回，两条写入互相覆盖，正是 D100 记录的问题形状。
- 用固定时长（例如 500ms）在滚轮后强制撤钉：时长猜测会随机器负载与宿主版本漂移，还会在宿主已经结算之后继续错误地撤钉。
- 让 `position: sticky` 自己跟随内容：钉住的条件仍来自宿主标记，问题没有从条件上解决。
- 把状态行改成 `position: fixed` 或绝对定位：行会脱离文档流，离开末尾后的位置、行高与宿主剪辑都要重算，还会影响 `followedByContent` 的判定。
- 在宿主采样窗口内轮询 `scrollTop` 判断读者移动：每帧读取布局，成本落在长会话热路径上，且与滚动主人的意图读数重复。
- 恢复 `data-dsh-claude-reader-hold` 与整套读者持有：D100 已证明两条跟随状态互相覆盖，删除是对的。

## 9. 验收标准

- 读者在状态行钉住时向上滚动，下一帧状态行不再满足 `position: sticky`，屏幕位置随内容上移。
- 状态行的屏幕位置在滚动后的第一帧与内容同向移动，不再停留在输入框上方。
- 滚轮后 500ms 内到达的新内容不会让状态行重新钉住。
- 读者回到末尾后，宿主跟随标记重新出现，状态行在下一帧恢复钉住。
- 没有读者移动时，宿主跟随丢失后的钉住撤下与 `reader-scroll` 场景的既有断言不变。
- 滚动位置、`data-chat-following-tail` 与回到底部按钮的点击次数都不因新标记改变。
- 浅色与深色、全动效与减弱动效下行为一致。
- 控制台无异常，lint、build、机制规范、行为规范与端到端场景的结论按计划记录。

## 10. 重审条件

- 宿主公开跟随状态变更事件或可替换跟随策略时，新标记的撤销改读公开状态，删除属性观察。
- 宿主修改 `data-chat-following-tail` 的写处、采样窗口长度或根节点的包裹结构时，重新核对钉住条件与复位时机。
- 宿主把底部跟随改成 CSS 无法观察的状态时，重新评估状态行的钉住是否还该由皮肤实现。
