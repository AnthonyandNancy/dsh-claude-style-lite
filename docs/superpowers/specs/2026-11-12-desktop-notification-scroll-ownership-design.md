# 桌面通知缺失与回到底部后跳动：根因、解决方案与修改计划

> 文档性质：根因分析、解决方案、逐文件修改计划与验收依据
> 编制日期：2026-11-12
> 适用仓库：`dsh-claude-style-lite`（DeepSeek Harness 桌面主题插件）
> 核查基线：DSH 桌面端 `0.2.2-rc.1`、本仓分支 `feat/session-panel-notification-thinking`
> 案例依据：`docs/superpowers/specs/2026-11-12-notification-github-research.md`
> 状态：方案与计划完成，源码未修改

---

## 0. 结论摘要

| 编号 | 现象 | 根因 | 解决方案 |
| --- | --- | --- | --- |
| P1 | 设置里已有「提示通知窗口」入口，桌面端没有任何系统通知 | 当前实现只调用页面 `Notification`，没有任何证据显示它到达了系统通知中心；桌面壳的主进程没有为应用设置自己的 `AppUserModelID`/`ToastActivatorCLSID`，页面构造器的投递与点击激活依赖 Electron 的默认身份；插件也没有宿主侧发送通道。本次 20:09 启动后，DSH 注册到 Windows 通知系统的标识没有新增历史条目 | 把通知发送移到宿主半，经已有私有路由与 `subprocess` 服务发送 Windows Toast，并复用 DSH 自己在 Windows 上注册的通知身份；点击走插件自定义协议写交接文件，浏览器半轮询同一私有路由领取会话切换 |
| P2 | 读者手动滚上去，点宿主的回到底部按钮，之后响应或操作到达时窗口跳到非预期位置 | 皮肤的手回流程在按钮点击后仍按 100ms 间隔复查最多五轮，每次找到按钮就再次点击；这五次点击任一落在新内容到达之后，都会让宿主跟随与皮肤持有位置之间发生新的竞争。同时 `handBackFollow` 没有把点击与“读者已主动回到底部”合并成一次不可再触发的交接 | 把回到底部改成一次显式、可取消、只执行一次的手回；点击后立即释放读者持有、取消在途复查，并把宿主的跟随状态作为唯一完成条件。新内容到达时按宿主跟随处理，不再由皮肤写入位置 |

两处问题分开交付：通知通道只改宿主半与通知功能；滚动修复只改滚动主人及其调用点。两者没有共享状态。

---

## 1. 已核实事实

### 1.1 插件通知的现状

| 事实 | 证据 |
| --- | --- |
| 通知功能默认开启，设置行已出现 | `packages/contracts/src/prefs.ts` 的 `notifications` 默认 `true`；`notifications.manifest.ts` 的 `settingsRows` |
| 发送方式是页面 `new Notification(...)` | `packages/client/src/features/notifications/notifier.ts:54-78` |
| 点击通知只调用 `window.focus()` 与 `workspace.openSession(sessionId)` | `notifier.ts:66-70` |
| 权限状态只读页面 `Notification.permission` | `notifier.ts:13-15` |
| 测试替身把 `window.Notification` 整体替换为可用构造器 | `packages/testing/specs/behaviour/notifications/host.mjs:12-40` |
| 通知功能没有宿主路由、宿主服务或子进程发送通道 | `notifications.ts` 只读 `uiSession` 与 `sessions` 快照；宿主半没有通知路由 |

测试替身证明的是“页面事件到达后调用了构造器”，不能证明桌面壳把构造器交付到了系统通知中心。

### 1.2 桌面壳的通知投递条件

| 事实 | 证据 |
| --- | --- |
| 桌面主窗口运行在 `dsh-app://app`，协议注册为 `standard` 与 `secure` | DSH 桌面源码 `apps/desktop/src/main.ts:185-193`，`main.ts:282-290` |
| 主窗口 `webPreferences` 关闭 Node 集成、开启沙箱与上下文隔离 | `apps/desktop/src/main.ts:282-290` |
| 桌面壳已安装的权限处理器只对 `media` 做应用帧校验，其他权限回调允许 | `apps/desktop/src/microphone-permissions.ts:16-35`；`main.ts:781` |
| 桌面壳没有给应用设置 `app.setAppUserModelId(...)` | 在 `apps/desktop/src` 与打包产物 `app.asar` 的主进程里检索该调用无结果 |
| 桌面壳对更新提醒使用 Electron 主进程 `Notification`，且先检查 `Notification.isSupported()` | `apps/desktop/src/update-attention.ts:35-54` |
| DSH 开始菜单快捷方式在 Windows 中登记的 AUMID 是 `electron.app.DeepSeek Harness` | 本机 `%APPDATA%\Microsoft\Windows\Start Menu\Programs\DeepSeek Harness.lnk` 的 Shell 扩展属性 `System.AppUserModel.ID`；显示名与目标分别是 `DeepSeek Harness` 与 `D:\Program Files\DeepSeekHarness\DeepSeek Harness.exe`。`Get-StartApps` 对同一快捷方式返回相同 AppID。`WScript.Shell.CreateShortcut().AppUserModelID` 对本机快捷方式返回空，不能用来读取该值 |
| DSH 页面使用的通知身份与快捷方式身份相同 | Windows 通知注册表的历史键也是 `electron.app.DeepSeek Harness`，说明快捷方式的 AUMID 就是 DSH 在当前 Windows 桌面上的通知身份 |
| DSH 的通知身份在 Windows 通知注册表中有历史记录，最近一次为 2026-11-11 16:29:36（本地时间），本次 20:09 启动后没有新增 | `HKCU\Software\Microsoft\Windows\CurrentVersion\Notifications\Settings\electron.app.DeepSeek Harness` 的 `LastNotificationAddedTime` |
| 页面 `Notification.permission === 'granted'` 只表示网页权限层允许，不表示 Windows 已接收 | Electron `notifications` 指南：Windows 的通知必须有开始菜单快捷方式、AppUserModelID 与 ToastActivatorCLSID（[Electron Notifications](https://www.electronjs.org/docs/latest/tutorial/notifications)） |
| 本机没有安装第三方通知插件 | 桌面 profile 的依赖里没有通知插件；全仓只有本插件包含 `new Notification` |

根因落在两层：

1. **通道层**：当前插件没有系统通知的发送通道，完全依赖页面构造器；通知功能的测试替身只证明构造器被调用过，不证明系统收到。
2. **身份层**：桌面壳没有显式调用 `app.setAppUserModelId(...)`，主进程与插件也都没有声明 `ToastActivatorCLSID`；Windows 通知身份由 Electron 的默认值与安装器创建的 `DeepSeek Harness.lnk` 共同登记为 `electron.app.DeepSeek Harness`。产品显示名是 `DeepSeek Harness`，打包 appId 是 `com.deepseek.dsh`；完整 AUMID 不能只凭显示名推断。

两层的后果相同：设置入口和权限状态可以正常显示，系统通知中心没有对应条目。

### 1.3 社区实现给出的可投递路径

| 事实 | 证据 |
| --- | --- |
| `dsh-desktop-notify` 在宿主半取 `subprocess` 服务，启动 PowerShell 发送 WinRT Toast | [参考仓库](https://github.com/VoodooB0Ys/dsh-desktop-notify) 的 `lib/host.js` 的 `runScript`、`toast.ps1` 的 `Show-Toast` |
| 它用独立 AUMID 注册 `HKCU\Software\Classes\AppUserModelId\<id>`，并注册 `CustomActivator` 处理点击 | 参考仓库的 `lib/toast.ps1` 的 `Register-Aumid`、`Register-Activation` |
| 它把点击结果写入交接文件，客户端轮询后切到对应会话 | 参考仓库的 `lib/host.js` 的 activation 路由与交接文件逻辑 |
| 该实现明确说明：宿主是独立 Node 进程，拿不到 Electron 的 `Notification`，因此由宿主启动系统进程 | 参考仓库的 `lib/host.js` 头部注释 |

本插件已有和这条路径相同的基础设施：私有路由、请求栅栏、宿主半加载、设置页与服务端能力。差别只是没有通知路由与发送脚本。

### 1.4 回到底部跳动的代码路径

| 步骤 | 位置 | 行为 |
| --- | --- | --- |
| 1 | 宿主 `ChatView.tsx:272-283` | `followingTail === false` 时渲染「回到底部」按钮 |
| 2 | 宿主 `use-chat-scroll.ts` 的 `returnToBottom` | 取消在途动态、取消导航、调用 `reading.followTail()` |
| 3 | 皮肤 `chat-follow.ts:521-546` | 结构变化与跟随关闭时调用 `handBackFollow('follow', ...)` |
| 4 | `scroll-owner.ts:516-550` | 先把位置滑到末尾，然后每 100ms 复查一次，最多五轮；发现按钮就 `button.click()` 并结束 |
| 5 | 宿主 `use-chat-reading.ts` 的 `onScroll` | 滚动采样间隔 500ms，读者的位置变化可能延迟结算 |
| 6 | `chat-follow.ts:454` | 读者持有期间宿主增长时，皮肤把旧位置写回 |
| 7 | 新内容到达 | 宿主跟随、皮肤写回、按钮点击后的 `followTail()` 三者对同一个 `scrollTop` 各写一次 |

根因有三点，并按同一方向叠加：

1. **重复触发**：`handBackFollow` 把“点击回到底部”当成“继续尝试直到按钮消失”。按钮在点击后几百毫秒内仍可能被 React 留着，下一次复查会再次点击。每次点击都重置宿主的跟随采样窗口。
2. **缺少一次性交接**：点击后没有立即释放 `READER_HOLD_ATTR`，也没有取消已经排队的复查。读者已经明确要求回到底部，皮肤仍把他当作“持有阅读位置的人”，后续增长触发写回。
3. **宿主跟随状态不是唯一真值**：宿主的按钮是否消失取决于其 `followingTail` 状态，而该状态要到 500ms 采样窗口结束才稳定。皮肤用“按钮仍存在”推断“跟随还没恢复”，把宿主的延迟当成需要继续操作的理由。

对应的宿主源码行为是清楚的：`returnToBottom` 只应被调用一次；按钮的消失由宿主自己的跟随状态决定。皮肤的职责是让这一次调用生效，不是反复替读者按按钮。

### 1.5 为什么不是普通滚动误差

- 跳动发生在“响应或别的操作到达时”，也就是新内容改变 `scrollHeight` 的时刻，而不是按钮点击的同一帧。
- 现有机制里只有三个写入方能在那一刻移动位置：宿主跟随、`chat-follow.ts:454` 的读者位置写回、`button.click()` 触发的 `followTail()`。
- 宿主跟随本身是稳定的；问题只在皮肤把读者的意图反复改写。

---

## 2. 解决方案

### 2.1 通知：宿主半发送，浏览器半判断

**目标行为**

- Windows 桌面端发出真实的系统 Toast，进入操作中心；点击 Toast 回到对应会话。
- Web 端保留页面 `Notification`，因为 `dsh web` 没有 Electron 主进程。
- 开关与权限状态的文案保持现有位置；开关关闭时不订阅状态、不申请权限、不启动进程。
- 提示音与提示通知互不依赖，同一事件可同时响铃与弹通知。

**通道选择**

| 场景 | 通道 |
| --- | --- |
| Windows 桌面端（`process.platform === 'win32'` 且宿主有 `subprocess`） | 宿主半启动 `powershell.exe -File <插件目录>/lib/notify/toast.ps1`，运行时从 DSH 自己的开始菜单快捷方式读取 AUMID 并发送 WinRT Toast |
| macOS 桌面端 | 宿主半通过 `osascript -e 'display notification ...'` 发送；点击激活不承诺回到会话，退回打开应用并切到会话需要宿主支持 |
| Linux 桌面端 | 宿主半通过 `notify-send` 发送，缺少命令时报告不可用，由页面构造器补充 |
| Web / 宿主没有 `subprocess` | 页面 `Notification` 作为唯一通道 |
| 桌面端宿主通道启动失败 | 保持宿主通道并在设置行报告失败；不回退到页面构造器，因为当前桌面壳里页面构造器正是不投递的那条路 |

**身份与点击**

- Windows 复用 DSH 当前在 Windows 上注册的通知身份：脚本按“目标路径等于当前 DSH 可执行文件”枚举开始菜单快捷方式，读取 `System.AppUserModel.ID`；不按产品显示名、下载站名或打包 appId 猜名。
- 读取到的身份只用于 `CreateToastNotifier` 与 `History.Remove`；不新建、不覆盖 AUMID 注册表项。找不到 DSH 自己的快捷方式时，能力回答 `browser`，并报告一次“未找到 DSH 通知身份”。
- 点击后的会话交接使用两条路径：


  - 主路径：Toast 的 `launch` 指向插件协议 `dsh-claude-style-lite://open?session=<id>`；协议处理器写入 `$DSH_HOME/dsh-claude-style-lite/notify-activation.json` 并启动 `dsh://open`，浏览器半轮询同一私有路由领取。
  - 兜底：协议点击在真实横幅上不回流时，采用独立 AUMID + COM 激活器；该兜底不在第一版启用。
- 激活文件使用现有临时与缓存规则：写入 `$DSH_HOME` 下的插件目录，读取后立即删除；文件内容只含 `sessionId` 与写入时间。

> 第一版不编译任何程序。`handler.vbs` 作为插件包的静态文件随构建复制到 `lib/notify/`；`toast.ps1` 首次发送时注册 `HKCU\Software\Classes\dsh-claude-style-lite` 的三条键并指向该文件。脚本只写会话 id 与时间，然后启动 `dsh://open`。这与 `dsh-notify-me` 的验证路径一致。

**为什么不让桌面壳自己修**

- 本插件无法修改 `apps/desktop/src/main.ts` 或已签名的 `app.asar`。
- 即使由宿主补上 `app.setAppUserModelId('com.deepseek.dsh')`，也要求桌面壳发行版本更新；插件要立即可用，必须自己拥有发送进程。
- 宿主补修仍应作为上游建议提出：桌面壳设置自己的 AppUserModelID 与 ToastActivatorCLSID，后续可让页面构造器直接工作。

### 2.2 滚动：一次手回，读者持有立即释放

**目标行为**

- 读者点一次回到底部，位置到末尾，宿主跟随恢复。
- 之后新内容到达时，位置继续停在末尾，不出现任何一次跳到中间或旧位置。
- 读者在回到底部后立即再次上滚，跟随再次让给读者；这次上滚是唯一能让位置离开末尾的操作。
- 读者未点按钮时，现有的读者持有、宿主增长写回、按钮显示逻辑不变。

**改动原则**

1. `handBackFollow` 从“轮询并点击”改成“一次请求 + 一次确认”。
2. 请求发出后，先取消同一功能的在途复查与缓动，释放 `READER_HOLD_ATTR`，再执行一次宿主按钮点击。
3. 点击后只观察宿主跟随状态；按钮消失即完成，超时即放弃，期间不再点击。
4. `releaseAtTail` 与 `chat-follow.ts` 的 `ensure` 共用这一入口，避免两处各自实现轮询。
5. `chat-follow.ts` 的读者位置写回在“刚完成手回”的窗口内不再触发；窗口长度取宿主 500ms 采样窗口，窗口结束后仍由宿主跟随负责。

**写入顺序**

```
读者点击按钮
  -> 皮肤 handBackFollow('reader' 请求，一次)
  -> 取消在途复查与缓动
  -> 释放 READER_HOLD_ATTR
  -> 点击宿主按钮（一次）
  -> 宿主 returnToBottom() 生效
  -> 宿主 followingTail = true
  -> 新内容到达 -> 宿主跟随写末尾
```

皮肤不再参与“新内容到达后把位置写回旧处”。

---

## 3. 逐文件修改计划

### 3.1 通知通道

#### Task N1：增加通知能力契约与宿主路由

**Files**

- Modify: `packages/contracts/src/routes.ts`
- Add: `packages/contracts/src/notify.ts`
- Modify: `packages/host/src/routes.ts`
- Add: `packages/host/src/notify.ts`
- Test: `packages/testing/specs/mechanism/notify/route.spec.ts`

**接口**

```ts
// packages/contracts/src/routes.ts
export const NOTIFY_PATH = `${ROUTE_PREFIX}/notify`
export const NOTIFY_ACTIVATION_PATH = `${ROUTE_PREFIX}/notify-activation`

// packages/contracts/src/notify.ts
export interface HostNotifyRequest {
  title: string
  body: string
  sessionId: string
  kind: 'finished' | 'approval' | 'plan-review' | 'question'
}
export type HostNotifyChannel = 'toast' | 'osascript' | 'notify-send' | 'browser'
export interface HostNotifyCapability {
  ok: true
  channel: HostNotifyChannel
  clickReturnsSession: boolean
}
export interface HostNotifyActivation {
  sessionId: string
  at: number
}
```

**实现要点**

- `GET /dsh-claude-style-lite/notify` 回答能力：平台、通道、`clickReturnsSession`。
- `POST /dsh-claude-style-lite/notify` 接收 `{ title, body, sessionId, kind }`，字段长度上限 256，`sessionId` 使用现有 `SESSION_ID_RE`；请求体上限 8 KiB；与现有路由共用 `fenceRefused`。
- Windows：`spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-File', toastScript, '-TitleFile', titleFile, '-BodyFile', bodyFile, '-SessionId', sessionId, '-Kind', kind])`。标题与正文写入 `$DSH_HOME/dsh-claude-style-lite/notify/` 下的临时文件，脚本读完自己删除；不把用户文案拼进命令行。
- macOS：`osascript -e 'display notification ...'`，标题与正文通过 `argv` 传递，脚本内使用 `on run argv` 接收，避免转义。
- Linux：检查 `notify-send` 是否存在；存在则发送，不存在回答 `channel: 'browser'`。
- `GET /dsh-claude-style-lite/notify-activation` 读取并删除交接文件；没有文件回答 `{ ok: true, activation: null }`。
- 宿主无 `subprocess` 时能力回答 `browser`，不报错，页面按现有通道发送。

**测试**

- 路由缺少栅栏时拒绝。
- 超过长度的标题、正文、非法 `sessionId` 回答 400。
- Windows 能力回答 `toast` 且 `clickReturnsSession` 与协议处理器注册状态一致。
- 发送失败回答 500，错误消息不带用户正文。

#### Task N2：增加 Windows Toast 脚本与协议处理器

**Files**

- Add: `packages/host/src/notify/toast.ps1`
- Add: `packages/host/src/notify/handler.vbs`
- Add: `packages/host/src/notify/activation.ts`
- Modify: `scripts/build/build.mjs`
- Test: `packages/testing/specs/mechanism/notify/toast-script.spec.ts`

**实现要点**

- `toast.ps1` 采用 ASCII 源码；标题、正文从 UTF-8 文件读取。
- 通过 Shell 扩展属性从 DSH 开始菜单快捷方式读取 `System.AppUserModel.ID`，再用该值创建 Toast；`WScript.Shell.CreateShortcut().AppUserModelID` 在本机返回空，不能使用。快捷方式由 DSH 安装器维护，插件只读。
- 快捷方式按“目标路径规范化后等于当前 DSH 进程的可执行文件”定位；不按文件名、显示名或包名匹配。
- 首次发送时注册 `HKCU\Software\Classes\dsh-claude-style-lite` 的 `URL Protocol` 与 `shell\open\command`，命令指向包内 `lib/notify/handler.vbs`；不编译任何程序，不要求管理员权限。
- 不注册 `CustomActivator`，不携带 EXE。
- Toast XML 使用 `activationType="protocol"` 与 `launch="dsh-claude-style-lite://open?session=<sessionId>"`，`audio silent="true"`；通知声音由「提示音效」自己决定。
- `handler.vbs` 把 `sessionId` 写入交接文件，再启动 `dsh://open`；只写 `sessionId` 与时间，不记录标题或正文。
- 构建把 `packages/host/src/notify/toast.ps1` 与 `handler.vbs` 复制到 `lib/notify/`；`package.json` 的 `files` 增加 `lib/notify`。

**测试**

- 用桩 `subprocess.spawn` 检查 argv 不含标题正文，标题正文文件路径在插件目录内。
- 交接文件的读写只包含 `sessionId` 与 `at`。
- `toast.ps1` 在 PowerShell 5.1 下语法解析通过（`powershell.exe -NoProfile -Command "[scriptblock]::Create((Get-Content -Raw toast.ps1)) | Out-Null"`）。

#### Task N3：浏览器半改走宿主通道

**Files**

- Modify: `packages/client/src/features/notifications/notifier.ts`
- Modify: `packages/client/src/features/notifications/notifications.ts`
- Modify: `packages/client/src/features/notifications/notifications.settings.ts`
- Modify: `packages/client/src/features/notifications/notifications.copy.json`
- Modify: `packages/testing/specs/behaviour/notifications/host.mjs`
- Modify: `packages/testing/specs/behaviour/notifications/window.spec.mjs`

**接口**

```ts
export type NotificationChannel = 'host' | 'browser' | 'unsupported'

export interface Notifier {
  notify(request: NotificationRequest): Promise<boolean>
  channel(): NotificationChannel
  dispose(): void
}
```

**实现要点**

- 页面启动时 `GET NOTIFY_PATH`，把通道与 `clickReturnsSession` 缓存到通知功能内；宿主能力读取失败时保留 `unsupported` 并在控制台报告一次，页面构造器只在宿主明确回答 `browser` 时启用。
- `host`：每次通知 `POST NOTIFY_PATH`；不申请页面权限，不检查 `Notification.permission`。
- `browser`：保留现有 `Notification` 构造器、权限申请与点击处理。
- `unsupported`：不显示权限行，设置行说明“当前环境没有系统通知通道”。
- 交接轮询：`host` 且 `clickReturnsSession === true` 时，每 1500ms 请求 `NOTIFY_ACTIVATION_PATH`；拿到 `sessionId` 后调用 `workspace.openSession(sessionId)`，然后 `window.focus()`。轮询在功能拆除时停止。
- 权限状态行只对 `browser` 通道显示；`host` 通道显示通道与“点击通知回到会话”的能力，不再显示浏览器权限。
- 文案增加 `notificationChannelHost`、`notificationChannelBrowser`、`notificationClickUnavailable`、`notificationDeliveryFailed`。

**测试**

- `host` 通道不触碰 `window.Notification`，只请求 `NOTIFY_PATH`。
- `browser` 通道沿用现有权限行为。
- `host` 通道的交接轮询只切会话一次；重复的同一 `sessionId` 不再触发。
- 渠道能力读取失败时降级到 `browser`，并在控制台只有一条报告。

#### Task N4：真实桌面验收

**Files**

- Modify: `docs/INSTALL.md`
- Add: `docs/changes/desktop-notifications-and-scroll-return.json`
- Test: `packages/testing/specs/behaviour/notifications/window.spec.mjs`

**验收矩阵**

| 编号 | 操作 | 预期 |
| --- | --- | --- |
| N4.1 | Windows 桌面端，开关开启，完成一次顶层会话 | 右下角出现 Toast，标题「任务完成」，正文为会话标题 |
| N4.2 | 查看 Windows 通知中心 | 能找回同一条通知，应用名显示 `CodeBuddy` |
| N4.3 | 点击通知 | 窗口回到前台并切到对应会话 |
| N4.4 | 触发审批、计划审阅、提问 | 三种标题分别出现 |
| N4.5 | 关闭通知开关后再完成一次 | 不产生 Toast，不启动 PowerShell 进程 |
| N4.6 | 保持同一等待状态 | 只有一条通知 |
| N4.7 | Windows 系统通知关闭或专注助手开启 | 插件报告发送失败；界面不崩溃；设置行显示投递失败状态 |
| N4.8 | `dsh web` 打开同一插件 | 使用页面权限与原行为，点击不切会话时只聚焦窗口 |
| N4.9 | 未安装 PowerShell 5.1 | 能力回答 `browser`，页面通道接管 |

### 3.2 滚动所有权

#### Task S1：把手回改成一次、可取消、可确认

**Files**

- Modify: `packages/engine/src/scroll-owner.ts:35-39, 512-551`
- Modify: `packages/engine/src/chat-dom.ts:35-42`
- Test: `packages/testing/specs/mechanism/scroll-ownership/owner.spec.ts`
- Test: `packages/testing/specs/mechanism/scroll-ownership/return.spec.ts`

**接口**

```ts
export interface HandBackRequest {
  source: ScrollSource
  /** Why the conversation is being handed back; the button's own press is `reader`. */
  reason: 'structure' | 'reader'
  stillWanted?: () => boolean
  onSettled?: () => void
}

export function handBackFollow(request: HandBackRequest): void
```

**实现要点**

- 删除 `FOLLOW_LOOK_ROUNDS` 与“每轮点击”的循环，改为：
  1. 记录 `generation`。
  2. 取消同一容器的在途手回（保存一个 `handBackToken`）。
  3. 释放 `READER_HOLD_ATTR`。
  4. 若位置不在末尾，先 `easeScrollToEndFor(scroller, source, stillWanted)`。
  5. 缓动结束后点击按钮一次；点击前重新确认 `stillWanted()` 与按钮仍存在。
  6. 点击后每 100ms 只看按钮是否消失，最多 5 次；消失或超时都调用 `onSettled()`，不再点击。
- 新增 `handBackPending(container)`，`chat-follow.ts` 的读者位置写回据此跳过。
- `releaseAtTail` 调用 `handBackFollow({ source: 'reader', reason: 'reader', ... })`。
- `chat-follow.ts` 的 `ensure` 调用 `handBackFollow({ source: 'follow', reason: 'structure', ... })`。
- `findFollowTailButton` 改为接受 `HTMLElement` 并返回按钮；保留原导出以免破坏现有测试。

**失败模式**

- 按钮在缓动期间消失：认为宿主已恢复跟随，`onSettled()`。
- 缓动被更高优先级写入打断：不再点击，`onSettled()`。
- 读者在点击后再次上滚：`held` 重新为真，`stillWanted()` 变为 false，本轮结束。

#### Task S2：读者位置写回跳过手回窗口

**Files**

- Modify: `packages/client/src/features/chat-follow/chat-follow.ts:440-470, 521-550`
- Test: `packages/testing/specs/mechanism/scroll-ownership/owner.spec.ts`
- Test: `packages/testing/specs/behaviour/chat-follow/stuck-thinking-header.spec.mjs`

**实现要点**

- `chat-follow.ts` 的读者位置写回条件增加 `!handBackPending(scroller)`。
- `ensure` 中不再自行维护第二个轮询；统一调用 `handBackFollow`。
- 加入 `HAND_BACK_SETTLE_MS = 500`，与宿主滚动采样窗口一致；只在手回结束后的这一窗口内跳过写回，之后恢复原逻辑。
- 不在 `chat-follow.ts` 新增全局状态；`handBackPending` 由 `scroll-owner.ts` 提供。

#### Task S3：补一条从回到底部到流式增长的机制测试

**Files**

- Add: `packages/testing/specs/mechanism/scroll-ownership/return.spec.ts`
- Modify: `packages/testing/fixtures/scroll-owner.ts`

**测试场景**

1. 容器高度不足，按钮不存在；读者滚上去后按钮出现。
2. 点击按钮一次；断言 `button.click` 只调用一次。
3. 在点击后 50ms 增长内容并触发宿主跟随；断言位置仍在末尾。
4. 在点击后 120ms 增长内容，模拟宿主 `followingTail` 尚未更新的窗口；断言位置仍在末尾。
5. 点击后立刻上滚；断言读者重新持有，后续增长不写回。

#### Task S4：真实桌面验收

| 编号 | 操作 | 预期 |
| --- | --- | --- |
| S4.1 | 长会话滚动到中间，点回到底部 | 一次平滑到末尾，按钮消失 |
| S4.2 | 回到底部后立刻发送消息并等待流式响应 | 位置始终在末尾，不跳回旧处 |
| S4.3 | 回到底部后触发工具调用、审批、计划审阅 | 位置始终在末尾 |
| S4.4 | 回到底部过程中再次上滚 | 读者接管，按钮重新出现，本轮不再自动回底 |
| S4.5 | 回到底部后切换会话再切回 | 宿主恢复的记忆位置正确，不额外跳动 |
| S4.6 | 在触屏或滚轮拖动中回到底部 | 只在手指抬起后交接一次，不重复点击 |

---

## 4. 风险、回退与边界

| 风险 | 影响 | 应对 |
| --- | --- | --- |
| 自定义协议点击在真实横幅上不回流 | 点击不能切会话 | 用真实 Toast 验收；不通过时再启用独立 AUMID + COM 激活器兜底 |
| 系统通知被专注助手或系统设置拦截 | Toast 不出现在屏幕 | 宿主在发送后读取 `LastNotificationAddedTime` 或在失败时报告；设置行显示投递状态 |
| Windows Defender 或企业策略阻止 PowerShell | 宿主通道无法启动 | 发送失败回答 500，页面报告一次并保留同一状态；下一次事件重试，不自动改用页面构造器，因为页面构造器在桌面端正是当前失败的那条通道 |
| 桌面壳后续更换 AUMID | 宿主 Toast 的应用名跟随 DSH 变化 | 每次发送前重新读取快捷方式；验收覆盖桌面壳升级后的第一条 Toast |
| `handBackFollow` 改动影响折叠手回 | 折叠后位置回到末尾的时机变化 | 保留 `stillWanted` 与 `onSettled` 签名；折叠场景先跑 `stuck-thinking-header` 与全量机制规范 |
| 宿主改变按钮结构 | 找不到按钮 | 保留 `conversationColumn` 的形状判断；找不到时视为宿主已恢复跟随，不再尝试 |
| 通知与提示音同时开启 | 两次打断 | 通知固定 `silent: true`，声音只由「提示音效」决定 |

**回退**

- 通知：删除 `NOTIFY_PATH` 路由与 `notify` 目录，浏览器半 `channel` 固定回答 `browser`，恢复现有行为。
- 滚动：恢复 `handBackFollow` 的单文件改动；不通过 Git 回滚，按文件手工恢复。

---

## 5. 文档与发布

- `docs/INSTALL.md`：说明 Windows 桌面通知需要 PowerShell 5.1；Web 需要站点通知权限；点击切会话依赖自定义协议处理器。
- `docs/CHANGES-FROM-UPSTREAM.md`：新增“宿主半发送系统通知”与“回到底部只交接一次”。
- `docs/changes/`：新增一个 `fixes` 片段，写明两处修复。
- `README.md` / `README.en.md`：更新功能描述，不写决策编号。
- 需要新 ADR：`D97 桌面通知由宿主发送，身份归插件`。同时把滚动手回的一次性规则写入 D40 的续篇或新 ADR `D98 回到底部是一次交接`。按 D48 的阈值，两者都约束未来实现，值得各写一页。

---

## 6. 待确认项

| 编号 | 选项 | 默认建议 |
| --- | --- | --- |
| Q1 | 通知点击是否必须切回对应会话 | 必须；使用自定义协议处理器与交接文件，不默认编译 EXE |
| Q2 | 是否接受首次发送时生成并注册协议处理器 | 接受；不需要编译，不要求管理员权限 |
| Q3 | macOS / Linux 是否纳入本轮 | Windows 先交付；macOS 只做 `osascript`，点击切会话不承诺 |
| Q4 | 通知失败时设置行是否显示投递状态 | 显示；复用现有 `status` 控件 |
| Q5 | 滚动修复是否同时覆盖折叠手回 | 覆盖；共用 `handBackFollow`，折叠场景作为回归 |

---

## 7. 验收命令

```powershell
$env:PATH = 'D:\Develop\nvm\v24.19.0;' + $env:PATH
npm run build
npx vitest run packages/testing/specs/mechanism/scroll-ownership/owner.spec.ts
npx vitest run packages/testing/specs/mechanism/scroll-ownership/return.spec.ts
node --import ./packages/testing/register.mjs packages/testing/stand-in.mjs --spec notifications
node --import ./packages/testing/register.mjs packages/testing/stand-in.mjs --spec chat-follow
npm run lint
npm run verify
```

真实桌面验收使用 `docs/tests/2026-11-12-desktop-notification-scroll.md` 的表格逐项勾选。
