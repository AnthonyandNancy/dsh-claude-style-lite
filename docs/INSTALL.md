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

## 桌面通知

- Windows 桌面端由宿主半发送系统通知，需要 PowerShell 5.1；AUMID 从 DSH 自己的开始菜单快捷方式读取，点击协议处理器由首次发送注册。
- 通知身份属于已安装的 DSH。本机安装的快捷方式是 `DeepSeek Harness.lnk`，目标是 `D:\Program Files\DeepSeekHarness\DeepSeek Harness.exe`，Shell 扩展属性 `System.AppUserModel.ID` 的值是 `electron.app.DeepSeek Harness`。宿主按目标路径定位该快捷方式并读取这个属性；`WScript.Shell.CreateShortcut().AppUserModelID` 对该快捷方式返回空，不能用来读取通知身份。这个值不能从安装目录名或打包 appId `com.deepseek.dsh` 推断。
- 点击通知回到对应会话；协议处理器注册失败时，通知仍会显示，但点击只打开窗口。
- `dsh web` 使用站点通知权限；首次使用需在设置页按「允许通知」。

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
- `processRows`
- `statsPosition`
- `statsMode`
- `searchStyle`
- `manualUnread`
- `notifications`

删除的设置键不迁移：

- `peakrate`
- `chatSend`
- `messageEnter`
- `caretMotion`
- `reasoningDisplay`
- `sessionPanel`（改由「默认打开会话总览面板」的 `sessionPanelOpenByDefault` 决定）

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
