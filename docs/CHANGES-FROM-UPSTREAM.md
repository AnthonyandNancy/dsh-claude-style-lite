# 与上游的差异

本仓库固定派生自 `Nwflower/dsh-claude-style` 的提交 `8cafcacd5aa574faa75b1912b8934bede7936b73`（版本 `0.20.3`）。

## 独立身份

- npm 包名、宿主路由前缀、设置命名空间与 `$DSH_HOME` 插件目录均为 `dsh-claude-style-lite`。
- 样式表元素与 loader wiring 使用 Lite 自己的 ID。
- 页面内部的主题标记 `data-dsh-claude-style` 与 `dsh-claude-*` 类名保留，避免视觉词汇重命名。

## 功能差异

R1–R5 的最终行为差异在本轮改造完成后补入本节：

- R1：取消思考行的自动开合，保留读者手动开合。
- R2：移除峰谷费率模块，保留价格、会话费用与用量。
- R3：移除已发送消息的入场动画，保留真实发送。
- R4：推理滑块填充改用 Canvas 2D，保留滑块旋钮、键盘、ARIA 与提交行为。
- R5：移除自绘光标，保留浏览器原生光标与 IME 辅助。

## 设置

删除的设置键：`peakrate`、`chatSend`、`messageEnter`、`caretMotion`。其余键的迁移方式见 [INSTALL.md](INSTALL.md)。
