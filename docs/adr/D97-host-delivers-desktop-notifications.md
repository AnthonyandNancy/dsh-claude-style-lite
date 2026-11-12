# D97. 桌面通知由宿主半以已安装的 DSH 身份发送

## 背景

DSH 桌面端设置里已有「提示通知窗口」，但插件的发送路径只调用页面 `Notification`。在本机的实测中，页面构造器没有在 Windows 通知中心留下新条目，`Notification.permission === 'granted'` 只说明网页权限层放行。桌面壳没有向插件提供发送通知或接收通知点击的扩展点，插件要立即得到系统 Toast，只能由宿主半启动自己的发送进程。

通知的应用身份属于已安装的 DSH，不能由插件按目录名或包名推测。本机已安装的快捷方式是 `DeepSeek Harness.lnk`，目标是 `D:\Program Files\DeepSeekHarness\DeepSeek Harness.exe`，其 Shell 扩展属性 `System.AppUserModel.ID` 的值是 `electron.app.DeepSeek Harness`。`WScript.Shell.CreateShortcut().AppUserModelID` 对这个快捷方式返回空，读取 AUMID 必须使用 Shell 扩展属性。这个值不能从安装目录名或打包 appId `com.deepseek.dsh` 推断。

点击需要把对应会话交回页面。桌面壳没有向插件暴露通知点击事件，页面在后台时也无法可靠收到平台通知的点击。

## 决定

- Windows 桌面端的通知由宿主半发送。浏览器半判断何时通知，把标题、正文、会话标识与会话种类交给私有路由；宿主半启动一个有界的系统进程，把标题与正文写入 `$DSH_HOME/dsh-claude-style-lite/` 下的 UTF-8 临时文件，命令行走固定参数，不携带用户文案。
- 发送前按当前 DSH 进程的可执行文件枚举开始菜单快捷方式，读取目标相同的快捷方式的 Shell 扩展属性 `System.AppUserModel.ID`，用该值创建 Toast。身份在运行时读取，插件不新建或覆盖 AUMID 注册表项。
- Toast 的启动地址是插件自己的协议 `dsh-claude-style-lite://open?session=<id>`。协议处理器把 `sessionId` 与写入时间写进 `$DSH_HOME/dsh-claude-style-lite/notify-activation.json`，再启动 `dsh://open`。
- 浏览器半轮询私有路由领取交接；读到有效会话后打开该会话并把窗口带回前台，交接文件只被领取一次。
- Web 端的 `dsh web` 没有 Electron 主进程，继续使用页面 `Notification` 构造器与站点通知权限。
- 第一版不捆绑 COM 激活器，也不带平台二进制。点击协议在首次发送时注册到 `HKCU\Software\Classes\dsh-claude-style-lite`。
- 发送进程有输出上限与超时。发送失败由私有路由报告给浏览器半。

## 后果

- Windows 桌面通知需要 PowerShell 5.1；缺少 PowerShell 或读不到 DSH 的快捷方式时，宿主能力回答 `browser`，页面通道接管。
- 点击协议在首次成功发送时注册；在第一次发送之前，能力里的 `clickReturnsSession` 为 false。注册失败时 Toast 仍可显示，点击只打开窗口。
- 桌面端宿主发送失败会报告投递失败，设置行保留这个状态。浏览器半不用页面构造器替换一次失败的桌面发送，因为桌面壳里页面构造器正是不投递的那条路。
- 通知固定静音，声音只由「提示音效」决定（D89）。
- 交接文件只含会话标识与时间，读取后立即删除；标题与正文留在临时文件中并在发送结束后删除。
- 放弃的方案：由插件新建独立 AUMID 并注册 COM 激活器（第一版需要分发并维护平台二进制）；把 AUMID 写死为某个安装上的值；把用户文案拼进 PowerShell 命令行；在桌面端把发送失败静默改走页面构造器。

## 重审条件

- DSH 提供通知发送或通知点击的扩展点时，宿主半改接该扩展点，并删去自有协议与交接文件的发送路径。
- 真实横幅上的协议点击无法回到会话时，重新评估独立 AUMID 与 COM 激活器；第一版不启用该兜底。
