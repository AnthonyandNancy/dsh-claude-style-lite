# Lite 性能实测

本文件记录 dsh-claude-style-lite 相对上游的 A/B 实测，以及推理滑块 Canvas 填充相对 DOM 宽度填充的 C/D 实测。数据在 Task 13 的隔离实测完成后填入；在此之前不写入任何测量结论。

## 测试环境

待实测。

## 构建信息

| 组 | 来源 | 说明 |
| --- | --- | --- |
| A | 上游 `8cafcacd5aa574faa75b1912b8934bede7936b73` | 原版 |
| B | Lite 全量删除 | 本仓库当前源码 |
| C | Lite 源码，滑块保留 DOM 宽度填充 | 仅替换滑块实现 |
| D | Lite 源码，滑块使用 Canvas 填充 | 本仓库当前源码 |

## 场景

- `idle-60`
- `thinking-60`
- `typing-1000-200`
- `send-30`
- `slider-30`
- `session-500`
- `session-2000`
- `model-menu-500`
- `model-menu-2000`

## 采样设计

每组 5 次，先预热 1 次，按 ABBA 或 BAAB 交叉，每次 60 秒。

## 指标

Scripting、Rendering、Painting、Long Tasks、p95 Long Task、dropped frames、input latency p95、slider frame p95、JS heap、DOM nodes、listeners、canvas redraws、bundle size、gzip、brotli、peakrate requests。

## 原始数据

待实测。

## 结果

### A vs B

待实测。

### C vs D

待实测。

## 采样方差

待实测。

## 负收益

待实测。

## 限制

待实测。

## 发布门槛

- 功能回归全绿。
- 混合场景主线程忙碌时间下降目标 ≥ 5%，未达标时如实披露，不改门槛。
- 长会话主线程忙碌时间退化不得超过 3%。
- 滑块 Canvas 相对 DOM 填充的 p95 帧耗时退化不得超过 5%。
- 无峰谷请求。
- 浏览器原生光标可见。

## 结论

待实测。
