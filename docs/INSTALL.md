# 安装与回退

## 安装 Lite

```bash
dsh plugin --profile web add dsh-claude-style-lite
```

## 安装原版

```bash
dsh plugin --profile web add dsh-claude-style
```

## 互斥

同一 DSH Profile 不得同时激活 `dsh-claude-style` 与 `dsh-claude-style-lite`。两者共用主题标记与页面词汇，但包名、路由、设置命名空间和宿主存储目录各自独立；同时启用会让两套样式表争用同一个页面。

切换主题时先停用当前主题，再启用另一套：

```bash
dsh plugin --profile web remove dsh-claude-style-lite
dsh plugin --profile web add dsh-claude-style
```

## 字体

Lite 从 `$DSH_HOME/dsh-claude-style-lite/fonts/` 读取用户字体。

从原版迁移时，把 `$DSH_HOME/dsh-claude-style/fonts/` 下的文件复制到新目录：

```powershell
Copy-Item "$env:DSH_HOME\dsh-claude-style\fonts\*" "$env:DSH_HOME\dsh-claude-style-lite\fonts\" -Recurse -Force
```

```bash
mkdir -p "$DSH_HOME/dsh-claude-style-lite/fonts"
cp -a "$DSH_HOME/dsh-claude-style/fonts/." "$DSH_HOME/dsh-claude-style-lite/fonts/"
```

## 卸载

```bash
dsh plugin --profile web remove dsh-claude-style-lite
```

## 回退

停用 Lite，重新启用 `dsh-claude-style`：

```bash
dsh plugin --profile web remove dsh-claude-style-lite
dsh plugin --profile web add dsh-claude-style
```

Lite 的宿主目录（`$DSH_HOME/dsh-claude-style-lite/`）、设置命名空间和缓存留在原位；回退不删除用户数据。需要彻底清理时，在确认不再回退后自行删除该目录。

## 设置迁移

Lite 默认不自动读取原版的设置命名空间。原版与 Lite 的设置命名空间分别是 `dsh-claude-style` 与 `dsh-claude-style-lite`，只有在宿主公开跨命名空间只读接口时才做自动迁移；否则手动迁移。

仍然保留、可手动迁移的键：

- `brand`
- `palette`
- `paletteCard`
- `typeface`
- `motion`
- `composer`
- `composerGap`
- `mascot`
- `mascotScope`
- `sidebarBrand`
- `sidebarLayout`
- `interfaceFontSize`
- `backgroundOpacity`
- `pageZoom`
- `chatReveal`
- `reasoningDisplay`
- `processRows`
- `statsPosition`
- `statsMode`
- `searchStyle`
- `manualUnread`

删除的设置键不迁移：

- `peakrate`
- `chatSend`
- `messageEnter`
- `caretMotion`

## 测试与验证

不要用真实的 `~/.dsh` 或 `~/.agents` 测试。

使用隔离启动器：

```bash
node --import ./packages/testing/register.mjs packages/testing/dsh-web.mjs
```

它创建 `.debug/runs/e2e/<run-id>/` 下的独立 `DSH_HOME` 与 `DSH_AGENTS_HOME`，把本检出以 `file:` 装入隔离 profile，监听 `127.0.0.1` 的随机端口并传入 `--no-open`。不要连接正在运行的真实 3080 Web 实例。

端到端验证：

```bash
node --import ./packages/testing/register.mjs packages/testing/e2e.mjs --scenario conversation
```

真实 home 指纹门禁：

```bash
node packages/testing/local-home-guard.mjs .debug/runs/dsh-web/fingerprint.json --before
node packages/testing/local-home-guard.mjs .debug/runs/dsh-web/fingerprint.json
```
