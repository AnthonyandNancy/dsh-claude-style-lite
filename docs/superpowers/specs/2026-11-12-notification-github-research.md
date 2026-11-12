# GitHub 桌面通知案例研究

> 研究日期：2026-11-12
> 范围：GitHub 上公开的 DSH / DeepSeek Harness 通知插件，以及 Tauri 版桌面端的原生通知实现
> 目的：判断“桌面端没有系统通知”的根因与最小可靠修复路径
> 结论：页面 `Notification` 不是所有桌面端的可靠通道；宿主半发送 WinRT Toast 是当前 Windows 桌面端的主流做法。点击回会话有“壳已有 identity + 自定义协议处理器”与“独立 AUMID + COM 激活器”两条实证路径，前者不需要插件自带 EXE。

---

## 1. 案例总表

| 仓库 | 通道 | 点击回会话 | 实测版本 | 关键限制 |
| --- | --- | --- | --- | --- |
| [Ycet/dsh-notifications](https://github.com/Ycet/dsh-notifications) | 页面 `Notification` | 页面 `onclick` + `uiWorkspace.openSession` | `0.2.1-rc.2+` | 自己承认“测试通知未抛错不等于系统横幅已显示” |
| [lixiangdong122333/dsh-notify](https://github.com/lixiangdong122333/dsh-notify) | 宿主 `powershell.exe` + WinRT Toast | `dsh://notify` 协议 | Windows 10/11 | 依赖开始菜单快捷方式；没有快捷方式就不发送 |
| [chromoany/dsh-notify-me](https://github.com/chromoany/dsh-notify-me) | 页面 `Notification` 为主；Windows 审批 Toast 走宿主 + WinRT | 自定义 `dsh-notify-me://` 协议处理器 + 页面轮询 | `0.1.1-rc.2` 到 `0.2.2-rc.1` 逐版实测 | 普通通知仍走页面构造器；只有审批走原生 Toast |
| [VoodooB0Ys/dsh-desktop-notify](https://github.com/VoodooB0Ys/dsh-desktop-notify) | 宿主 `powershell.exe` + WinRT Toast / WPF 卡片 | 独立 AUMID + COM 激活器 + 交接文件 | `^0.2.0-rc.2` | 仅 Windows；自带 x64 EXE；全屏时用自绘卡片 |
| [Mi-liu/dsh-desktop-notifier](https://github.com/Mi-liu/dsh-desktop-notifier) | 宿主 `powershell.exe` + WPF 卡片 | 卡片进程写交接 + 页面长轮询 | 未写明确版本门 | 卡片不是通知中心 Toast；选择/审批可接管 |
| [Zhiyi-Zhao/dsh-notify](https://github.com/Zhiyi-Zhao/dsh-notify) | 页面 `Notification` | 页面 `onclick` | Windows / macOS / Linux | 无宿主通道 |
| [chongyi/dsh-notify](https://github.com/chongyi/dsh-notify) | 页面 `Notification` | 页面 `onclick` | Web / 桌面 | 每次页面加载后第一次通知前要点击页面一次 |
| [hotpot-labs/dsh-notifier-plugin](https://github.com/hotpot-labs/dsh-notifier-plugin) | 页面 `Notification`；Tauri 变体用 `@tauri-apps/plugin-notification` | Tauri 用原生点击事件 | Web / Tauri | Tauri 变体是另一套壳，普通 Electron 桌面不适用 |
| [This-is-XiaoDeng/dsh-plugin-notify](https://github.com/This-is-XiaoDeng/dsh-plugin-notify) | 页面 `Notification` + 外部推送 | 页面 `onclick` | Web / 桌面 | 明确说明页面通知的权限限制 |
| [dsh-tauri/deepseek-harness-desktop](https://github.com/dsh-tauri/deepseek-harness-desktop) | Tauri 原生通知 | `dsh://notification-clicked` 事件 | Tauri 壳 | 不是 Electron 壳，不能直接照搬到本插件 |

---

## 2. 关键发现

### 2.1 页面 `Notification` 能否在桌面端显示

- `Ycet/dsh-notifications` 把它作为桌面端与 Web 的共同通道，且兼容到 `0.2.1-rc.2+`。这说明“页面构造器在桌面壳里完全不可用”不是普遍事实。
- 同一仓库又明确写下：“授权状态来自 Notification API，无法判断系统是否拦截了横幅或声音”“测试通知发送未抛错不等于系统横幅已显示”。因此页面构造器是否真的投递，需要以通知中心条目或系统截图为准，不能用构造器调用成功代替。
- `dsh-notify-me` 的更新记录给出一个确定边界：在 macOS 上，`dsh-app://app` 里的 `new Notification()` 进不了通知中心，所以它改用宿主助手；在 Windows 上，它仍用页面构造器发送普通通知，只有需要按钮的审批才改由宿主发原生 Toast。这个边界比“桌面端 Notification 全部失效”准确。
- 本机在 2026-11-12 20:09 启动 DSH 桌面端后，它在 Windows 通知系统中的记录没有新增条目；同时本插件只调用页面构造器，权限状态无法证明系统收到。这个事实支持“当前环境投递失败”，不能单独证明“所有桌面端页面构造器都失败”。
- DSH 的通知身份由安装器快捷方式登记：本机 `%APPDATA%\Microsoft\Windows\Start Menu\Programs\DeepSeek Harness.lnk` 的 Shell 扩展属性 `System.AppUserModel.ID` 是 `electron.app.DeepSeek Harness`，`Get-StartApps` 与 Windows 通知注册表也返回同一标识；产品显示名是 `DeepSeek Harness`，官方打包配置的 `DSH_DESKTOP_APP_ID` 是 `com.deepseek.dsh`。`WScript.Shell.CreateShortcut().AppUserModelID` 对本机快捷方式返回空，读取时必须使用 Shell 扩展属性。发送脚本不能把任一安装上的 AUMID 当作跨版本常量。

### 2.2 Windows Toast 的主流实现

- `lixiangdong122333/dsh-notify` 用开始菜单快捷方式的标识调用 `ToastNotificationManager.CreateToastNotifier($shortcut)`。脚本每次发送前写 `HKCU\Software\Classes\AppUserModelId\<快捷方式路径>` 的 `DisplayName` 与 `IconUri`，并把显示名放在 `ToastGeneric` 的 `binding` 上。
- `chromoany/dsh-notify-me` 直接使用 DSH 已有的 AUMID 作为通知身份，不注册新的身份，也不需要管理员权限或编译；它写死为 `electron.app.DeepSeek Harness`，该值属于其实测环境。本机当前安装的 AUMID 是 `electron.app.DeepSeek Harness`，因此写死值不能直接复用。
- `VoodooB0Ys/dsh-desktop-notify` 用独立 AUMID `DeepSeekHarness.DesktopNotify`，并注册 `CustomActivator`，由 COM 本地服务器处理点击。
- 三者共同点：发送者是宿主进程，不是页面；都通过 `powershell.exe` 调 WinRT，不引入原生 Node 依赖。

### 2.3 点击回会话的三条路径

| 路径 | 代表实现 | 前提 | 优点 | 代价 |
| --- | --- | --- | --- | --- |
| 页面 `onclick` | `dsh-notifications`、`dsh-notify` | 通知由页面构造器创建 | 无额外进程、无注册 | 只对页面构造器创建的通知有效 |
| 自定义协议 + 交接文件 | `dsh-notify-me` | Toast 的 `launch` 指向自定义协议；`HKCU\Software\Classes\<protocol>` 由脚本注册 | 宿主 Toast 也能带会话；不需要 EXE | 只保证拉起应用与写交接；窗口抬到前台在 Windows 上另需宿主路由 |
| 独立 AUMID + COM 激活器 | `dsh-desktop-notify` | 注册 `CustomActivator` 与 `LocalServer32`；随包带 x64 EXE | 点击直接进入激活器，可靠携带参数 | 需要构建并分发平台二进制；卸载与更新要维护注册 |

`dsh-desktop-notify` 的 README 还记录了两个实测失败路径：`activationType="protocol"` 手动执行成功，但真实点击横幅从未到达处理器；常驻 PowerShell 进程也收不到 WinRT `Activated` 事件。它的结论是“未打包 Win32 应用点击横幅需要 COM 激活器”。这与 `dsh-notify-me` 使用协议处理器看似矛盾，差别在于：`dsh-notify-me` 把协议只用在**按钮**与**正文 click**的 `launch`，并且宿主发送时使用 DSH 已有的通知身份；`dsh-desktop-notify` 使用自己新建的 AUMID。这个差异需要在实现前用小样验证，不能只凭 README 断言。

### 2.4 窗口抬前

- `dsh-notify-me` 实测：Windows 上 `dsh://open` 深链在 `0.2.1-rc.2` 复测 3/3 无效，因此改用宿主路由启动 `focus-window.ps1` 做 Win32 激活。
- 同一实现记录：macOS / Linux 的 `dsh://open` 深链可用；Windows 上不可用。
- `dsh-desktop-notifier` 的 `activate-window.ps1` 记录：不能对已显示窗口调用 `SW_SHOW`，否则在这个 Electron 版本上会把窗口隐藏；最小化用 `SW_RESTORE`，托盘隐藏用 `SW_SHOWNOACTIVATE`，可见窗口只调整 z-order。
- 本机安装的 `dsh` 协议确实注册到 `DeepSeek Harness.exe "%1"`；官方桌面源码的 `open-url` 只处理 `dsh://open`，没有 `dsh://notify`。所以 `lixiangdong` 的 `dsh://notify` 只能依赖协议启动应用，不能依赖壳对 URL 路径做额外处理。

### 2.5 Tauri 桌面端

- Tauri 版不是 Electron，它把 `window.Notification` 替换为桥接构造器，把标题、正文、tag 与 `sessionId` 转发给原生侧；原生点击事件走 `dsh://notification-clicked`，页面再调用 `openSession`。
- 这条路径说明正确的分层是“页面提交通知请求，壳持有原生点击事件”；Electron 壳没有向插件开放等价事件，所以插件要自己补宿主通道或协议交接。
- Tauri 的实现不能直接用于本插件，因为本插件运行在 Electron 桌面壳与 `dsh web` 两种环境。

---

## 3. 对本插件方案的修订

### 3.1 不再默认自带 COM 激活器

原方案为了让点击切回会话，默认构建 `DshClaudeStyleLite.NotifyActivator.exe` 并注册 `CustomActivator`。案例研究后改为：

- **首选**：宿主在运行时从 DSH 自己的开始菜单快捷方式读取 AUMID 并发送 Toast；点击走插件注册的自定义协议 `dsh-claude-style-lite://open?session=<id>`，协议处理器把会话写入交接文件并唤醒应用；页面轮询交接路由后 `openSession`。不新增 AUMID，不编译 EXE。
- **兜底**：如果小样验证发现自定义协议点击在真实横幅上不回流，再启用独立 AUMID + COM 激活器。该兜底保留在方案里，但不进入第一版默认实现。
- 这样可去掉 `activator.cs`、`csc.exe` 构建步骤、`CustomActivator` 注册与平台二进制，显著缩小改动面。

### 3.2 Toast 发送改用宿主路由

- 新增 `NOTIFY_PATH` 与 `NOTIFY_ACTIVATION_PATH`，沿用现有 `fenceRefused` 与请求体上限。
- Windows 发送脚本按“目标路径等于当前 DSH 可执行文件”枚举开始菜单快捷方式，读取 `System.AppUserModel.ID`；优先复用 DSH 已有身份，避免新建 AUMID 带来的点击差异。
- 脚本必须用 UTF-8 BOM（`lixiangdong` 的实测：PowerShell 5.1 无 BOM 会把中文读成乱码）；标题、正文走 UTF-8 文件，不拼进命令行。
- 正文 click 与按钮 click 都声明 `activationType="protocol"`，`launch` 指向插件协议；注册 `HKCU\Software\Classes\dsh-claude-style-lite` 的三条键。
- 协议处理器只写 `{ sessionId, at }` 到 `$DSH_HOME/dsh-claude-style-lite/notify-activation.json`，再启动 `dsh://open` 或 `DeepSeek Harness.exe`；不记录标题与正文。

### 3.3 窗口抬前单独判定

- 通知点击先把会话写入交接文件，页面在获得焦点后轮询领取并 `openSession`。
- Windows 上如果 `dsh://open` 不能把窗口抬到前台，增加宿主路由 `focus-window`，由脚本做 `EnumWindows` + `SetForegroundWindow`。这与 `dsh-notify-me` 的实测一致，且不依赖通知点击本身是否在用户手势中。
- 不在第一版把 `focus-window` 与通知发送绑死：先保证通知到达与点击写交接，窗口抬前作为独立验收项。

### 3.4 页面通道的保留范围

- Web、非 Windows 桌面端、宿主没有 `subprocess` 时保留页面 `Notification`。
- Windows 桌面端只要宿主路由可用，就走宿主 Toast；不把页面权限状态当作投递成功的证据。
- 设置行按通道显示状态；宿主通道失败时报告失败，桌面端不回退到页面构造器。

---

## 4. 仍需现场验证的两点

1. **自定义协议点击是否在真实 Toast 横幅上回流**：`dsh-notify-me` 的协议处理器结论支持“可以”，但它主要用于按钮；`dsh-desktop-notify` 的结论是“正文点击的 protocol 路径对新建 AUMID 不可靠”。实现第一版后，用真实点击分别验收正文与按钮两条路径。
2. **运行时读取的 DSH AUMID 是否足够**：`dsh-notify-me` 在其测试环境中写死 `electron.app.DeepSeek Harness` 发送审批 Toast；本机快捷方式、`Get-StartApps` 与通知注册表当前都是 `electron.app.DeepSeek Harness`。若发出一条测试 Toast 后通知中心出现条目，即确认运行时读取的标识可用。

验证方法：在设置页加一个“发送测试通知”按钮；点击后检查 `ToastNotificationManager.History.GetHistory(<运行时读到的 AUMID>)` 是否出现新条目，再真实点击横幅，检查交接文件与页面是否切到对应会话。

---

## 5. 结论

- 页面 `Notification` 在桌面端并非一律失效，但它的投递不可观测，且点击与按钮能力受 Electron 实现限制。
- 对 Windows 桌面端，GitHub 上多个实现共同选择“宿主半发 WinRT Toast”。这是当前最可靠、也最容易验证的通道。
- 点击回会话不必先引入 COM 激活器：复用 DSH 已有通知身份，加自定义协议处理器与交接文件，是更小的第一版。COM 激活器保留为实测不通过时的兜底方案。
- 原方案中的第二点（随包编译 COM 激活器 EXE）可以从默认计划中删除；如需要，后面作为独立任务提出。

---

## 6. 参考链接

- [Ycet/dsh-notifications](https://github.com/Ycet/dsh-notifications)
- [lixiangdong122333/dsh-notify](https://github.com/lixiangdong122333/dsh-notify)
- [chromoany/dsh-notify-me](https://github.com/chromoany/dsh-notify-me)
- [VoodooB0Ys/dsh-desktop-notify](https://github.com/VoodooB0Ys/dsh-desktop-notify)
- [Mi-liu/dsh-desktop-notifier](https://github.com/Mi-liu/dsh-desktop-notifier)
- [Zhiyi-Zhao/dsh-notify](https://github.com/Zhiyi-Zhao/dsh-notify)
- [chongyi/dsh-notify](https://github.com/chongyi/dsh-notify)
- [hotpot-labs/dsh-notifier-plugin](https://github.com/hotpot-labs/dsh-notifier-plugin)
- [This-is-XiaoDeng/dsh-plugin-notify](https://github.com/This-is-XiaoDeng/dsh-plugin-notify)
- [dsh-tauri/deepseek-harness-desktop](https://github.com/dsh-tauri/deepseek-harness-desktop)
- [Electron Notifications](https://www.electronjs.org/docs/latest/tutorial/notifications)
- [ToastNotificationManager 历史查询（Windows 通知中心验证）](https://learn.microsoft.com/uwp/api/windows.ui.notifications.toastnotificationmanager)
