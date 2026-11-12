# 与上游的差异

本仓库固定派生自 `Nwflower/dsh-claude-style` 的提交 `8cafcacd5aa574faa75b1912b8934bede7936b73`（版本 `0.20.3`）。

## 独立身份

- npm 包名、宿主路由前缀、设置命名空间与 `$DSH_HOME` 插件目录均为 `dsh-claude-style-lite`。
- 样式表元素与 loader wiring 使用 Lite 自己的 ID。
- 页面内部的主题标记 `data-dsh-claude-style` 与 `dsh-claude-*` 类名保留，避免视觉词汇重命名。

## 移除

- 思考行的自动开合：运行中的思考行不再被皮肤代按，读者手动开合与逐步显示的推理窗口保留。
- 峰谷费率模块：徽标、`/peakrate` 路由、缓存和刷新计时器全部移除；价格快照、会话费用与用量统计保留。
- 已发送消息的飞行动画与原地生长：消息直接以宿主行出现。
- 自绘光标：输入框与搜索框使用浏览器原生光标。

## 变更

- 推理滑块的普通填充改由 Canvas 2D 绘制，旋钮、ARIA、键盘与提交流程不变。
- 价格生成改读独立的 `packages/host/data/pricing-calendar.json`，不再依赖峰谷目录。

## 保留

- Claude / DeepSeek 两套品牌、主题与设计令牌。
- 模型选择、描述、搜索与选择提交。
- 会话、导航、折叠、过程摘要与等待状态。
- 回答文字渐显（`chatReveal`）。
- 用量、会话费用、价格与上下文统计。
- 吉祥物、声音提示、Sodium 引擎与长会话优化。

## 设置

删除的设置键：`peakrate`、`chatSend`、`messageEnter`、`caretMotion`。其余键的迁移方式见 [INSTALL.md](INSTALL.md)。
