# DSH Claude Style Lite 减负改造设计与解决方案 v1.0

> 文档性质：逐项解决方案（Design / Solution Spec）
> 编制日期：2026-11-12
> 实施依据：`DSH-Claude-Style-Lite-减负改造设计与实施书-v1.0.md`
> 上游快照：`dsh-claude-style-master.zip`
> 上游提交：`8cafcacd5aa574faa75b1912b8934bede7936b73`
> 上游版本：`0.20.3`
> 目标插件：`dsh-claude-style-lite`
> 状态：静态审计与方案设计完成；源码改造、构建、安装验证与 A/B 实测尚未执行

---

## 0. 结论摘要

本方案把实施书拆成 15 个需求项：R1–R5 五项产品调整，T00–T07 八项实施工序，以及 R6 独立身份、R7 许可证与发布两个横切需求。每一项都有独立的解决方案、删除/保留边界、依赖处理和验收证据。

五项产品调整的核心判定如下：

| 编号 | 结论 | 关键实现路径 |
| --- | --- | --- |
| R1 | 删除思考自动开合，保留手动开合与其他折叠 | 删除 `reasoning-fold.ts` 及其调用；`reasoning-stream.ts` 改由共享 `observeMatches` 驱动；保留 `fold-toggle.ts`、`fold-glide.ts`、消息折叠和进程折叠 |
| R2 | 完整拆除峰谷模块，保留通用价格与用量 | 删除 `peakrate` 前端、宿主、路由、契约、目录、缓存和定时器；把价格生成所需的 DeepSeek 日历下沉为独立 `pricing-calendar.json`，只供 `fetch-prices.mjs` 使用 |
| R3 | 删除消息气泡入场动画，保留真实发送 | 删除 `chat-send` 整目录；从 `chat-follow` 移除 `chatSend` 句柄依赖，改回引擎的 `submissionHolds()`；删除 `chatSend`、`messageEnter` 设置键和预览 |
| R4 | 推理滑块填充改为 Canvas 2D | 新建 `fill-canvas.ts`；`slider.ts` 只负责数值、手势和提交；Canvas 仅画普通填充，DOM knob、刻度、ARIA、指针捕获和顶档 `matrix.ts` 全部保留 |
| R5 | 删除自绘光标，恢复浏览器原生光标 | 删除 `features/caret/`；保留 `shared/composer-caret.ts`；删除 `caretMotion` 设置键、预览卡片、专属 CSS/属性/翻译 |
| R6 | 独立安装身份与互斥 | 新包名、插件 ID、配置命名空间、路由前缀、资源 URL、skin ID、locale、README 全部隔离；类名与源码别名可保留 |
| R7 | 许可证、发布与交付 | 保留 MIT、Sodium PolyForm Shield、NOTICE、第三方声明；不把 Anthropic 字体打进 npm；建立 `UPSTREAM_COMMIT`、可安装包和 A/B 报告 |

最重要的两个“不能按文件名直接删”的发现：

1. `fold-toggle.ts` 不是思考自动开合专属文件。`process-fold.ts`、`fold-glide.ts`、`chat-reveal/reveal-engine.ts` 都依赖它的程序点击标记；删除会导致进程折叠和回答渐显回归。
2. `packages/host/data/peakrate-catalog.json` 不只服务峰谷徽标。`scripts/data/fetch-prices.mjs` 从它读取 DeepSeek 的高峰时段、时区和节假日，用来生成独立的价格快照。必须先建立独立价格日历，再删除峰谷目录。

---

## 1. 基线事实与约束

### 1.1 已核实事实

| 项目 | 事实 | 证据 |
| --- | --- | --- |
| 上游提交 | ZIP 注释为 `8cafcacd5aa574faa75b1912b8934bede7936b73` | `unzip -z dsh-claude-style-master.zip` |
| 版本 | `package.json` 与 `package-lock.json` 均为 `0.20.3` | 上游快照 |
| DSH 引擎约束 | `dsh.engines.dsh = ">=0.2.2-rc.2"` | `package.json` |
| peer 依赖 | `@deepseek-ai/dsh-client-ui-primitives >=0.2.2-rc.2`，`@deepseek-ai/schemastery >=3.18.0` | `package.json` |
| 顶档点阵 | 已由 `features/effort/matrix.ts` 使用 Canvas 2D，DPR 上限 2 | `matrix.ts` |
| 峰谷目录依赖价格 | `fetch-prices.mjs` 依赖 `peakrate-catalog.json` 中的 DeepSeek 日历 | `scripts/data/fetch-prices.mjs` |
| 价格快照自带日历 | `PriceDocument.schedule` 已包含 `timeZone/peakDays/peakWindows/holidays/holidayZone` | `packages/contracts/src/prices.ts` |
| 自动开合耦合 | `reasoning-fold.ts` 通过回调把行交给 `reasoning-stream.ts`，两者共用同一扫描批次 | `chat-fold.ts` |
| 发送动画耦合 | `chat-follow` 读取 `ui.chatSend.isEntering()` | `chat-follow.ts:683` |
| 模型菜单耦合 | 模型选择器读取 `ui.peakrate.badge()` | `model-picker.ts:180` |
| 光标共享工具 | `shared/composer-caret.ts` 被 composer、process-fold、reasoning-fold 使用 | 全仓检索 |
| 本地环境 | 当前目录无 `.git`、无 `node_modules`，shell 中无 `node`/`npm` | 运行检查 |
| npm 包名 | `dsh-claude-style-lite` 在 npm registry 返回 404，可作为候选名 | registry 查询 |

### 1.2 本次文档的边界

本文件不宣称已完成源码改造。以下证据必须在实施阶段生成：

- `npm install`、`npm run build`、`npm run lint`、`npm test`、`npm run verify -- --full` 的真实输出。
- `stand-in`、`behaviour`、`e2e` 的真实结果。
- 在目标 DSH 网页端和桌面端的安装、激活、卸载记录。
- A/B 性能 Trace、原始采样数据和计算后的真实百分比。
- 视觉回归截图和差异结论。

### 1.3 不可违反的全局约束

1. 不删除整个 `chat-fold`、`effort`、`model`、`chat-follow` 或 `chat-reveal`。
2. 不把 `/prices`、`/session-cost`、`/usage` 误删。
3. 不把真实发送逻辑当动画删除。
4. 不隐藏浏览器原生光标。
5. 不删除仍被 IME 或其他功能使用的 `shared/composer-caret.ts`。
6. 不通过 `display:none`、提前 `return`、全局 CSS 覆盖伪造删除。
7. 不破坏统一 MutationObserver 总线、统一帧管线、长会话离屏跳过和顶档 Canvas。
8. 不手改 `lib/`；它只由构建生成。
9. 不直接读写原插件数据库或配置文件；设置迁移只能经宿主公开接口。
10. 所有受限素材、字体和第三方许可按原条件保留，不因改名重新授权。

---

## 2. 总体架构方案

### 2.1 改造后的模块拓扑

```text
packages/client/src/features/
  chat-fold/
    chat-fold.ts            保留；组装消息折叠、进程折叠、进程摘要、fold glide、reasoning stream
    message-fold.ts         保留
    process-fold.ts         保留
    process-summary.ts      保留
    fold-glide.ts           保留
    fold-glide-parts.ts     保留
    fold-toggle.ts          保留（程序点击标记仍被进程折叠和回答渐显使用）
    reasoning-stream.ts     保留并解耦：自行订阅 THINK_ROW_SELECTOR，不再由自动开合回调喂行
    reasoning-fold.ts       删除
    fold.css                保留
    message-fold.css        保留
    fold-motion.css         删除思考窗口专属段；保留门滚动、disclosure 入场和 reduced motion 规则
  effort/
    slider.ts               保留交互与提交；删除 fill DOM 宽度动画
    fill-canvas.ts          新建；普通填充 Canvas 渲染器
    matrix.ts               保留
    matrix-field.ts         保留
    effort-picker.ts        保留
    effort-picker.css       删除 .dsh-claude-effort-fill 与 width transition；保留 knob/ticks/matrix/ARIA
  model/
    model-picker.ts         删除 rate() 注入与 refreshRateBadges 调用链
    rows.ts                 删除 PaintedRate、rate badge、rate tooltip 和 rate 刷新
    model-picker.manifest.ts 从 reads 移除 peakrate
  删除目录：
    peakrate/
    chat-send/
    caret/
```

### 2.2 宿主侧拓扑

```text
packages/host/src/
  routes.ts                 删除 PEAKRATE_PATH 导入、createPeakRate、路由注册和 dispose
  peakrate.ts               删除
  peakrate-catalog.ts       删除
  prices.ts                 保留；把注释中“跟随 peakrate”的耦合说明改为独立价格快照说明
  session-cost.ts           保留
  usage.ts                  保留
  session-panel.ts          保留
packages/contracts/src/
  routes.ts                 删除 PEAKRATE_PATH
  prefs.ts                  删除 peakrate、chatSend、messageEnter、caretMotion
  peakrate.ts               删除
  pricing-calendar.ts       新建；价格日历的纯解析与校验
packages/host/data/
  peakrate-catalog.json     删除
  prices.json               保留
  pricing-calendar.json     新建；只保存价格生成所需的 DeepSeek 日历
```

### 2.3 数据流变化

```text
改造前：peakrate-catalog.json -> host peakrate store -> /peakrate -> client peakrate ->
        model rows badge / countdown / refresh

改造后：peakrate 链路全部消失

改造前：peakrate-catalog.json -> fetch-prices.mjs -> prices.json -> /prices -> session cost
改造后：pricing-calendar.json  -> fetch-prices.mjs -> prices.json -> /prices -> session cost
```

### 2.4 身份命名方案

| 物件 | 上游值 | Lite 值 |
| --- | --- | --- |
| npm `name` | `dsh-claude-style` | `dsh-claude-style-lite` |
| `PACKAGE_NAME` | `dsh-claude-style` | `dsh-claude-style-lite` |
| `ROUTE_PREFIX` | `/dsh-claude-style` | `/dsh-claude-style-lite` |
| `skin.json.id` | `claude-style` | `claude-style-lite` |
| `skin.json.package` | `dsh-claude-style` | `dsh-claude-style-lite` |
| `cordis.patch.yml` 条目 ID | `ui-skin-claude-style` | `ui-skin-claude-style-lite` |
| settings namespace | `dsh-claude-style` | `dsh-claude-style-lite` |
| `$DSH_HOME` 字体目录 | `dsh-claude-style/fonts` | `dsh-claude-style-lite/fonts` |
| 样式表元素 ID | `dsh-claude-style-style` | `dsh-claude-style-lite-style` |
| 数据属性 | `data-dsh-claude-style` | 保留 |
| CSS 类前缀 | `dsh-claude-*` | 保留 |
| 源码别名 | `@dsh-claude-style/*` | 保留 |
| 虚拟模块别名 | `virtual:dsh-claude-style/*` | 保留 |

身份变更的理由：

- 包名、插件 ID、路由、存储目录和设置命名空间会暴露给宿主、安装器、网络和配置系统，必须唯一。
- `data-dsh-claude-*` 和 `dsh-claude-*` 属于页面内部视觉词汇，保留可以避免大范围改样式导致视觉回归。
- 源码别名保留可以避免数百处机械重命名，降低引入错误的机会。

### 2.5 互斥激活方案

同装原版与 Lite 时，页面 DOM 互斥由既有机制承担：

1. 两个插件都使用 `data-dsh-claude-style` 作为页面主题标记。
2. `entry.ts` 的 `parkForeignSheets()` 与 `mountStylesheet()` 会停掉其他主题样式表。
3. `shared/peer-plugin.ts` 只处理 `dsh-chat-ux`，不处理原版主题互斥。
4. 因此 Lite 必须新增显式的“同主题互斥提醒”能力，而不是假设既有机制会阻止两个主题同时接管。

方案：

- 在宿主设置页与插件详情页显示静态互斥说明：`dsh-claude-style` 与 `dsh-claude-style-lite` 不得同时激活。
- 在 Lite 的 README、locale 描述和首次加载日志中写明互斥要求。
- 不通过代码强制禁用原版；DSH 没有提供跨插件启停 API。
- 测试矩阵必须覆盖“两者同装，仅 Lite 启动”和“两者同装，仅原版启动”。

### 2.6 设置迁移方案

允许迁移的键：删除项之外、Lite 仍保留的全部设置键。

禁止迁移的键：

- `peakrate`
- `chatSend`
- `messageEnter`
- `caretMotion`

事实约束：

- `createSettingsBinding()` 的候选命名空间是 `ctx.fiber.entry.id`、`PACKAGE_NAME` 和 `SETTINGS_ENTRY_FALLBACK`，都是当前插件自己的命名空间。
- 它没有跨插件读取另一个命名空间的公开入口。
- DSH 的 settings form 快照只服务当前注册的 Config；Lite 不能直接构造原版命名空间的 controller。

因此方案分两级：

1. **默认不自动迁移。** 在 `docs/INSTALL.md` 给出保留键清单、删除键清单和手动迁移步骤。
2. **只有宿主明确提供跨命名空间只读 API 时才自动迁移。** 该 API 需满足：
   - 可以按命名空间读取快照；
   - 只读，不写回原插件；
   - 有稳定的错误语义。
   若不存在该 API，不通过文件系统、宿主缓存或注入私有模块绕过。

自动迁移（仅条件成立时）的约束：

1. 读取原命名空间值，只挑选 Lite 仍保留的键。
2. 通过 Lite 的 `createSettingsBinding().save()` 写入。
3. 不写回原设置，不删除原设置。
4. 迁移只执行一次。由于 PREFS 只承载用户可见的 `Prefs` 值，一次性标记不得塞进 PREFS；只有宿主提供独立的插件级存储 API 时才使用它，否则每次启动先读原命名空间、按 Lite 当前值去重后再写。
5. 无法读取时展示手动迁移说明，不猜测文件位置。
6. 默认发布不包含自动迁移写入逻辑，除非真实宿主验证了跨命名空间只读 API。

### 2.7 dsh-web 隔离测试环境与本地零影响

#### 2.7.1 强制边界

Lite 的全部构建、安装、激活、行为、E2E、视觉和性能测试只允许使用 `dsh web`（等价 `dsh --profile web`）的隔离实例。不得启动、停止、修改或读取用户本地的 DSH 应用实例，不得改动用户真实 Profile、插件、会话、设置、凭据、字体、日志和缓存。

“本地 DSH 应用”包括：

- 用户真实运行的 `dsh web`、Desktop、headless、ACP 或 SDK 进程。
- `$DSH_HOME` 默认为 `~/.dsh` 下的 profiles、插件、sessions、storages、settings、cache、logs、`.credentials.yaml`。
- `$DSH_AGENTS_HOME` 默认为 `~/.agents` 下的 AGENTS.md、skills 和共享 agent 配置。
- 用户浏览器的登录态、Cookie、Local Storage、IndexedDB 和扩展。
- 用户级 pnpm/npm store、`.npmrc`、registry token 和代理证书。
- 用户已安装的 Anthropic 字体副本与本地品牌图片。

#### 2.7.2 隔离矩阵

| 资源 | 测试值 | 隔离理由 |
| --- | --- | --- |
| `DSH_HOME` | `.debug/runs/dsh-web/<run-id>/home` | Profile、插件、会话、设置、凭据、字体、日志、缓存全部落在临时目录 |
| `DSH_AGENTS_HOME` | `.debug/runs/dsh-web/<run-id>/agents` | 不读取用户的 `~/.agents`、AGENTS.md 与 skills |
| 工作目录 | `.debug/runs/dsh-web/<run-id>/workspace` | 调用目录即 DSH 默认 workspace；不把仓库根或用户项目暴露给测试 agent |
| 监听地址 | `127.0.0.1` | 仅本机回环，不监听局域网 |
| 端口 | `0` | OS 分配空闲端口，不占用 3080，不与本地 DSH 冲突 |
| 自动开浏览器 | `--no-open` | 不接管用户的默认浏览器 |
| 浏览器上下文 | Playwright 一次性 headless context | 不加载用户 Chrome Profile、Cookie 与扩展 |
| `DSH_TELEMETRY_DISABLED` | `1` | 测试不产生产品遥测 |
| 模型凭据 | 只注入脚本化模型 mock key | 不读取用户真实 API Key |
| 代理与 registry 凭据 | 从子进程环境中移除 | 不让测试安装或请求携带用户凭据 |
| pnpm store | `.debug/runs/dsh-web/<run-id>/pnpm-store` | 不写用户全局 store 与缓存 |
| npm/pnpm 用户配置 | `.debug/runs/dsh-web/<run-id>/npmrc` | 不读取用户 `.npmrc` 与 registry 登录 |
| 字体落点 | `<scratch-home>/dsh-claude-style-lite/fonts` | 只使用仓库中的受限字体副本，不读取用户字体目录 |
| 日志与 Trace | `.debug/runs/dsh-web/<run-id>/` | 不写用户 DSH 日志目录 |

#### 2.7.3 启动契约

测试启动器必须同时满足：

```text
DSH_HOME=<scratch>/home
DSH_AGENTS_HOME=<scratch>/agents
DSH_TELEMETRY_DISABLED=1
npm_config_userconfig=<scratch>/npmrc
npm_config_store_dir=<scratch>/pnpm-store
dsh --profile web --host 127.0.0.1 --port 0 --no-open
```

并在启动前从子进程环境删除：

- 名称匹配 `KEY|SECRET|TOKEN|PASSWORD` 的变量。
- 所有 `DSH_*` 变量，除启动契约明确设置的变量。
- `SSH_CONNECTION`、`SSH_TTY`，避免 Web 启动走 SSH 分支。
- `BROWSER`，避免 `--no-open` 之外的任何浏览器接管。
- `NODE_OPTIONS` 与 `NODE_PATH` 中继承的用户级预加载和模块路径；启动器按需追加自己的 lifeline。

`dsh plugin --profile web add <local-checkout>` 与后续插件安装必须使用同一隔离环境；不能只给启动命令设置 `DSH_HOME`。

#### 2.7.4 现有工具缺口

上游 `packages/testing/dsh-web.mjs` 已做对的部分：

- 默认 `$DSH_HOME` 位于 `.debug/runs/e2e/`。
- `--port 0`。
- `--no-open`。
- 生命周期 lifeline。
- Playwright 一次性浏览器 context。

必须补齐的部分：

1. 当前启动环境只设置 `DSH_HOME`，没有设置 `DSH_AGENTS_HOME`。
2. `dsh plugin --profile web add` 只传 `DSH_HOME`，继承用户全局凭据变量。
3. 没有把 pnpm store 与 npm user config 指向 scratch 目录。
4. 没有自动记录“运行前后真实 `~/.dsh` 与 `~/.agents` 未变化”的证据。
5. 默认 home 是固定 `.debug/runs/e2e/home`，不是每次 run-id 独立目录。

#### 2.7.5 本地零影响门禁

每次测试运行前后记录以下指纹：

```text
$HOME/.dsh 下所有文件的路径、大小、mtime、hash（只读扫描）
$HOME/.agents 下所有文件的路径、大小、mtime、hash（只读扫描）
运行中的 dsh/electron 进程列表
3080 端口监听状态
默认浏览器进程启动记录（可选）
```

运行后断言：

- 两个目录的指纹完全一致。
- 运行前的本地 `dsh`/Electron 进程 PID 仍存在且未被重启。
- 3080 端口监听状态与运行前一致。
- 测试日志中的 `DSH_HOME`、`DSH_AGENTS_HOME` 均指向 `.debug/runs/dsh-web/<run-id>/`。
- 测试日志中没有用户真实的 `~/.dsh` 或 `~/.agents` 路径。
- 指纹工具：`packages/testing/local-home-guard.mjs` 在运行前后分别生成指纹并比较。
- 建议保留每次运行的指纹 JSON 作为证据：`.debug/runs/dsh-web/<run-id>/local-home-*.json`。

若用户允许，可通过文件系统审计工具（Windows 可用 Sysinternals Process Monitor）补充“实际打开/写入路径”证据；没有该证据时，指纹门禁仍是必选。

#### 2.7.6 浏览器与账号隔离

- Playwright 使用 `browser.newContext()`，默认无持久化 storage。
- 不设置 `userDataDir`，不加载用户 Chrome/Edge Profile。
- 不访问用户真实 DSH 的 3080 URL。
- 测试账号只使用 mock platform 或脚本化登录，不读取用户 cookie。
- 视觉回归与 A/B 使用同一隔离启动器。

#### 2.7.7 失败与清理

- 启动器在 `afterAll`/进程退出时停止子进程并清理 run 目录。
- 失败日志保留在 `.debug/runs/dsh-web/<run-id>/`，不写用户目录。
- 若清理失败，报告具体 PID、端口与路径；不通过 `taskkill /F` 杀全局 `dsh` 或 Electron 进程。
- Windows 终止时只按测试子进程 PID 执行 `taskkill /PID <pid> /T /F`，不按进程名终止。

#### 2.7.8 验证清单

- `dsh --version` 与构建产物版本一致。
- 启动命令包含 `--profile web --host 127.0.0.1 --port 0 --no-open`。
- 进程环境包含正确的隔离变量。
- 本地 home 指纹前后一致。
- 3080 端口未新增监听。
- 无用户 API Key 被读取。
- 无用户浏览器 Profile 被加载。
- 测试结束无遗留 `dsh web` 子进程。

### 2.8 性能与 A/B 方案

性能结论只能来自实测。建议的 C/D 对照：

- A：原版 `8cafcacd`。
- B：Lite 全量删除。
- C：Lite 源码但滑块普通填充仍用原 DOM width 渲染。
- D：Lite 源码且滑块普通填充使用 Canvas。

比较 B 与 A 得到五项功能调整的总收益；比较 D 与 C 得到 Canvas 的净收益。不得把两者混成一个百分比。

---

## 3. 逐项解决方案

### R1：删除思考自动展开/自动收起

#### 3.1.1 目标

- 删除插件自动判定思考阶段、自动点击开合、状态记忆和专属监听。
- 保留宿主原生手动展开/收起。
- 保留思考正文、连续/两行步进显示、消息折叠、进程折叠、门滚动和回答渐显。

#### 3.1.2 根因与耦合

`chat-fold.ts` 当前流程：

```text
createReasoningStream()
createReasoningFold(rows => stream.queueRow(row))
```

`reasoning-fold.ts` 做四件事：

1. 用 `subscribeMutations` 扫描思考行。
2. 根据 `ROW_PHASE_ATTRIBUTE` 和 `EXPANDED_ATTRIBUTE` 判断是否需要按阶段开合。
3. 用 `control.click()` 模拟点击。
4. 通过 `onRows` 把同一批行交给 `reasoning-stream.ts`。

`reasoning-stream.ts` 依赖 `queueRow(row)` 获知思考文本变化。若直接删除 `reasoning-fold.ts` 而不改 `reasoning-stream.ts`，两行步进窗口将不再随流式文本增长。

`fold-toggle.ts` 还承载以下共享职责：

- `process-fold.ts` 自动开合进程组时使用 `beginChatFoldToggle()` / `endChatFoldToggle()`。
- `fold-glide.ts` 用 `isChatFoldToggle()` 区分程序点击与读者点击。
- `chat-reveal/reveal-engine.ts` 用 `isChatFoldToggle()` 防止程序开合触发渐显抑制。

因此 `fold-toggle.ts` 不能删除。

#### 3.1.3 解决方案

1. 删除 `features/chat-fold/reasoning-fold.ts`。
2. `chat-fold.ts` 删除 `createReasoningFold` 导入、初始化和 teardown。
3. `reasoning-stream.ts` 自己订阅思考行变化：
   - 用 `observeMatches<HTMLElement>(THINK_ROW_SELECTOR, queueKnownRows)` 获得全部思考行并在集合变化时把行加入 pending。
   - 继续用 `subscribeMutations` 监听思考行子树内的 `childList`、`characterData`、`ROW_PHASE_ATTRIBUTE`、`EXPANDED_ATTRIBUTE`，但只服务于窗口排版，不再点击任何控件。
   - 如果 `observeMatches` 的集合变化回调已覆盖新行到达，则子树监听只补“同一行内文本增长”和“属性翻转”。
   - 不新增第二套全页 MutationObserver；统一走引擎 `subscribeMutations`，它复用同一观察总线。
   - 不新增常驻 rAF；继续用 `requestFrame()`，无变化时不申请下一帧。
4. `reasoning-stream.ts` 的 `onCopyChange` 行为保留：由 `chat-fold.ts` 在 `onCopyChange` 中调用 `stream.sync()`。
5. `fold-motion.css` 只删除思考窗口专属规则中与自动开合状态绑定的选择器；`[data-dsh-claude-reason-window]`、`[data-dsh-claude-reason-text]`、capped mask 和 reduced motion 规则继续保留。
6. `chat-fold.manifest.ts` 保留 `reasoningDisplay` 设置行；删除 `contracts` 中只由自动开合读取的条目，特别是 `fold.expanded`、`chat.think-running`、`fold.disclosure` 若其他功能仍使用则保留，逐条按引用核对。
7. 删除 `packages/testing/faults/patches/chat-fold-4d2aab06.patch` 中只针对 `createReasoningStream` 的旧故障补丁；若补丁仍覆盖保留路径，则重写为只覆盖 `reasoning-stream.ts` 的当前行为。
8. 保留 `packages/testing/scenarios/reasoning-stream.mjs`，但删除其中“自动展开后读取窗口”的前置动作，改为显式把行设为 expanded 后再验证步进窗口。

#### 3.1.4 保留边界

- `createMessageFold()` 及其 `.dsh-claude-message-fold-toggle` 保留。
- `createProcessFold()`、`createProcessSummary()`、`installChatFoldGlide()` 保留。
- `ui.chatFold.isBusy()` 保留，`chat-follow` 继续读取。
- `chat-reveal` 继续读取 `isChatFoldToggle()`。
- 宿主原生 `aria-expanded` 按钮继续由宿主管辖；Lite 不再代按。
- 流式开始/结束时是否自动变化由宿主自行决定。

#### 3.1.5 风险与缓解

| 风险 | 缓解 |
| --- | --- |
| 删除 `reasoning-fold.ts` 后步进窗口不更新 | 用显式 `observeMatches` + 子树监听替代 `onRows`，并保留 `reasoning-display/choice.spec.mjs` |
| 误删 `fold-toggle.ts` 导致进程折叠和渐显回归 | 全仓引用检查，保留文件；新增进程折叠与揭示回归测试 |
| 误删 `EXPANDED_ATTRIBUTE` 读取导致手动开合失效 | 手动开合不经过 Lite 代码；只删除 Lite 的“代按”逻辑，不删除宿主属性 |
| 中文输入法组合期间焦点被抢 | 自动点击删除后风险消失；保留 `composerComposing()` 供其他折叠使用 |

#### 3.1.6 验收证据

- `rg -n 'createReasoningFold|reasoning-fold\.ts' packages/client/src packages/contracts/src` 返回空。
- 静态断言：`reasoning-fold.ts` 不存在；`fold-toggle.ts` 存在。
- `reasoning-display/choice.spec.mjs` 通过，且不依赖自动展开。
- 新增 `reasoning-manual` 行为测试：
  - 宿主原生按钮手动展开后可读全文。
  - 流式增长时窗口随文本增长，但不会自行改变展开状态。
  - 切换会话、中文输入法组合、结束后无自动点击。
- `chat-fold` 的进程折叠和消息折叠用例全部通过。

---

### R2：完整拆除峰谷费率模块

#### 3.2.1 目标

- 删除峰谷功能的浏览器端、宿主端、契约、数据、定时器、缓存、私有 API、设置和构建引用。
- 保留模型选择器、模型描述、通用价格、会话成本、用量统计和结算能力。

#### 3.2.2 全量落点

浏览器端：

```text
packages/client/src/features/peakrate/
  badge.ts
  copy.ts
  live.ts
  match.ts
  peakrate.copy.json
  peakrate.css
  peakrate.manifest.ts
  peakrate.ts
  schedule.ts
```

调用点：

```text
packages/client/src/core/scheduler.ts
  PeakRateHandle 导入
  Handles.peakrate

packages/client/src/features/model/model-picker.manifest.ts
  reads: ['composer', 'peakrate']

packages/client/src/features/model/model-picker.ts
  rate() 注入
  refreshRateBadges()
  subSignature 中的费率签名依赖

packages/client/src/features/model/rows.ts
  PaintedRate
  painted / paintedMinute / rateTips
  placeRateBadge / dropRateBadge / pruneRateBadges
  refreshRates
  buildModelRow 中的 meter 插入

packages/client/src/pure.ts
  buildRateBadge / rateDetail / rateName / matchProfile / currentRate / forgetRates / formatCountdown

packages/client/src/constants.ts
  PEAKRATE_ROUTE 导出
```

宿主端：

```text
packages/host/src/peakrate.ts
packages/host/src/peakrate-catalog.ts
packages/host/src/routes.ts
  PEAKRATE_PATH 导入
  createPeakRate 导入
  const peakrate = createPeakRate(ctx)
  register('peak rate', ...)
  peakrate.dispose()

packages/contracts/src/routes.ts
  PEAKRATE_PATH
```

数据与构建：

```text
packages/host/data/peakrate-catalog.json
scripts/build/peakrate-catalog.mjs
scripts/data/fetch-peakrate-catalog.mjs
scripts/build/build.mjs
  PEAKRATE_CATALOG 导入
  validatePeakCatalog 导入
  catalogPath / catalogText / catalogProfiles
  fs.writeFileSync(lib/peakrate-catalog.json)
.github/workflows/data.yml
  Refresh the peak rate catalog 步骤
```

测试：

```text
packages/testing/specs/logic/billing-clock/
  match.spec.ts
  schedule.spec.ts
  wording.spec.ts
packages/testing/specs/behaviour/model-picker/rate-refresh.spec.mjs
packages/testing/smoke/cases/model.mjs 的 model-meter
packages/testing/smoke/probe/model-meter.js
packages/testing/smoke/stand-in/host-fetch.js 中的 /peakrate
packages/testing/smoke/host-half.mjs 中的 peak rate block
packages/testing/smoke/cases/settings.mjs 的 peakrate 行
packages/testing/data/importance-unreachable.json 的 peakrate 选择器
packages/testing/data/skin-literals.json 的 model-meter 条目
packages/testing/data/document-lookups.json 的 model-meter 条目（若有）
```

#### 3.2.3 价格生成依赖的保留改造

这是 R2 的关键设计。

`fetch-prices.mjs` 当前调用 `scheduleFromCatalog()`：

```text
peakrate-catalog.json
  -> profile id deepseek-v4
  -> schedule.timeZone / peakDays / peakWindows / publicHolidayDates / publicHolidayTimeZone
  -> prices.json.schedule
```

如果直接删除 `peakrate-catalog.json`，价格生成脚本会失败，`prices.json` 的日历字段将无法更新。

解决方案：

1. 新建 `packages/host/data/pricing-calendar.json`，只保存价格生成需要的字段：

```json
{
  "schemaVersion": 1,
  "updatedAt": "YYYY-MM-DD",
  "source": "upstream peak catalog snapshot at 8cafcacd...",
  "deepseek": {
    "timeZone": "UTC",
    "holidayZone": "Asia/Shanghai",
    "peakDays": [1, 2, 3, 4, 5],
    "peakWindows": [{ "start": "01:00", "end": "04:00" }],
    "holidays": ["YYYY-MM-DD"]
  }
}
```

字段值必须从固定上游目录中原样迁移，不允许凭记忆填写。

2. 新增 `packages/contracts/src/pricing-calendar.ts`，提供纯函数：

```text
parsePricingCalendar(value: unknown)
  -> { timeZone, holidayZone, peakDays, peakWindows, holidays } | null
  -> 校验 schemaVersion、IANA 时区、HH:mm、星期 0-6、IsoDate
```

3. 新增 `scripts/data/pricing-calendar.mjs`，只负责读文件并调用该纯函数：

```text
readPricingCalendar(sourcePath)
  -> JSON.parse(fs.readFileSync(sourcePath))
  -> parsePricingCalendar(value)
  -> null 时抛出带文件名的错误
```

4. `fetch-prices.mjs` 改为读取 `pricing-calendar.json`，不再读取 `peakrate-catalog.json`。
5. `prices.json` 的 `schedule` 字段继续由 `fetch-prices.mjs` 生成；`parsePriceDocument` 继续校验它。
6. 删除 `peakrate-catalog.json`、`fetch-peakrate-catalog.mjs`、`peakrate-catalog.mjs` 和构建复制步骤。
7. `data.yml` 只保留价格快照刷新；如果后续需要刷新日历，可单独增加一个受控来源，但不得恢复峰谷运行时链路。
8. 新增 `packages/testing/specs/logic/pricing-calendar/calendar.spec.ts`，覆盖合法日历、坏时区、坏窗口、坏日期、空节假日和 schema 版本。

#### 3.2.4 模型选择器的最小改造

`model-picker.ts` 当前：

```text
createModelRows({ rate(provider, modelId) { return ui.peakrate?.badge(...) } })
```

改为：

1. `createModelRows` 参数删除 `rate`。
2. `rows.ts` 删除 `PaintedRate` 与费率刷新注册表。
3. `buildModelRow` 不再插入 meter，`built.check` 仍然是选中标记。
4. `renderModelBody` 的签名去掉费率 generation 依赖。
5. `subSignature` 只保留模型分组、当前模型和 provider 列表。
6. `onOpen` 不再调用 `refreshRateBadges()`。
7. `model-picker.manifest.ts` 的 `reads` 改为 `['composer']`。
8. `scheduler.ts` 删除 `peakrate` 句柄、`PeakRateHandle` 导入和 `Handles.peakrate`。
9. `model-copy.ts` 的注释若只提 `peakrate/match.ts`，改为通用 `normalizeModelId` 说明或删除注释。

不得改动：

- 模型选择、模型描述、模型搜索、分组、快捷供应商、release tag、tooltip 的其他用途。
- 当前模型行、选中的 check、`aria-checked`。
- `modelCatalog` 的目录、warm-up、snapshot 和 selection 提交。

#### 3.2.5 宿主路由最小改造

`routes.ts`：

1. 从 `@dsh-claude-style/contracts/routes` 导入中删除 `PEAKRATE_PATH`。
2. 删除 `import { createPeakRate } from './peakrate.js'`。
3. 删除 `const peakrate = createPeakRate(ctx)`。
4. 删除 `register('peak rate', { ... })` 整块。
5. teardown 删除 `peakrate.dispose()`。
6. 保留 `createPrices`、`createSessionCost`、`createUsage`、`createSessionPanel` 和 `prices.ensure()` / `sessionCost.ensure()`。

#### 3.2.6 删除边界与保留清单

| 能力 | 处理 | 理由 |
| --- | --- | --- |
| `/peakrate` 路由 | 删除 | 峰谷专属 |
| 峰谷目录下载 | 删除 | 峰谷专属 |
| 峰谷缓存 `peakrate.json` | 删除 | 峰谷专属 |
| 24 小时峰谷定时器 | 删除 | 峰谷专属 |
| 模型行费率徽标 | 删除 | 峰谷专属 |
| `peakrate` 设置键 | 删除 | 峰谷专属 |
| `/prices` | 保留 | 通用价格快照 |
| `/session-cost` | 保留 | 会话成本 |
| `/usage` | 保留 | 用量统计 |
| `prices.ts` 定时刷新 | 保留 | 通用价格刷新，不是峰谷刷新 |
| `prices.json` | 保留 | 通用价格数据 |
| `session-cost.ts` | 保留 | 使用 `PriceDocument.schedule` 做峰谷价格判断，但这是结算能力，不是 UI 峰谷模块 |
| `usage.ts` | 保留 | 与峰谷无关 |
| 模型基础价格 | 保留 | `PriceDocument` 和 `prices.ts` |
| 峰谷 UI 文案 | 删除 | 峰谷专属 |
| 峰谷颜色 token | 删除 `--dsh-claude-meter-peak` / `--dsh-claude-meter-valley` | 只被峰谷徽标使用；删除前用 `rg` 再确认 |

#### 3.2.7 风险与缓解

| 风险 | 缓解 |
| --- | --- |
| 误删 `prices` / `session-cost` / `usage` | 在删除前先画调用图，删除后运行 host-half 价格和成本用例 |
| 价格脚本因失去日历失败 | 新建 `pricing-calendar.json` 并让 `fetch-prices.mjs` 改读它 |
| 模型行布局因删除 badge 改变 | 视觉回归重点检查模型菜单行高、check 位置、tooltip 和描述行 |
| `/peakrate` 请求仍由缓存或 service worker 发出 | 网络验收覆盖 30 分钟空闲和反复打开模型菜单 |
| 旧设置中的 `peakrate` 键残留 | 不迁移；`clampPrefs` 删除该键后自然忽略 |
| 重要性账本中峰谷选择器残留 | 重新生成并提交 shrink-only ledger |

#### 3.2.8 验收证据

- `rg -n 'peakrate|PeakRate|PEAKRATE|offpeakclock|peak-rate|peakRate' packages scripts .github locale README.md README.en.md docs/NOTICE.md` 仅允许出现在变更历史或说明性文档中。
- `packages/client/src/features/peakrate/`、`packages/host/src/peakrate.ts`、`packages/host/src/peakrate-catalog.ts`、`packages/contracts/src/peakrate.ts`、`packages/host/data/peakrate-catalog.json`、`scripts/data/fetch-peakrate-catalog.mjs`、`scripts/build/peakrate-catalog.mjs` 均不存在。
- `/peakrate` 在 host-half 测试中返回 404 或不再注册。
- 模型菜单打开、搜索、切换、描述、release tag、快捷供应商测试通过。
- `/prices`、`/session-cost`、`/usage` 测试通过。
- `fetch-prices.mjs` 在无网络条件下可用本地 `pricing-calendar.json` 校验并通过。
- 30 分钟网络观察中无 `offpeakclock.com`、无 `peakrate-catalog.json`、无 `/peakrate` 请求。

---

### R3：删除用户消息气泡入场动画，保留真实发送

#### 3.3.1 目标

- 删除飞入动画、原位增长动画、替身、快照、隐藏真实消息、救援定时器和预览。
- 保留真实发送、消息数据、气泡静态样式、布局、滚动、历史消息和失败处理。
- 保留 `chatReveal` 回答文字渐显。

#### 3.3.2 全量落点

删除目录：

```text
packages/client/src/features/chat-send/
  chat-send.copy.json
  chat-send.settings.ts
  copy.ts
  send-flight.css
  send-flight.manifest.ts
  send-flight.ts
  send-grow.ts
  send-morph.ts
  send-rows.ts
  send-shape.ts
  send-snapshot.ts
```

调用点：

```text
packages/client/src/core/scheduler.ts
  ChatSendHandle 导入
  Handles.chatSend

packages/client/src/features/chat-follow/chat-follow.manifest.ts
  reads: ['chatFold', 'chatSend'] -> ['chatFold']

packages/client/src/features/chat-follow/chat-follow.ts
  submissionHeld: () => (ui.chatSend === undefined ? submissionHolds() : ui.chatSend.isEntering())
  -> submissionHeld: () => submissionHolds()

packages/client/src/features/chat-fold/message-fold.ts
  删除 “send-flight measures the echo immediately” 的注释
  删除 “This observer is installed before send-flight's” 的注释
  保留 echo 的立即 clamp 行为

packages/client/src/constants.ts
  CHAT_FLYING_ATTR
  MESSAGE_ENTER_ATTR
  注释中 send flight 的说明

packages/client/src/pure.ts
  send-shape 导出
  send-snapshot 导出

packages/contracts/src/prefs.ts
  MESSAGE_ENTER_FLIGHT
  MESSAGE_ENTER_GROW
  MESSAGE_ENTER_MODES
  PREFS.chatSend
  PREFS.messageEnter

packages/client/src/shared/motion.css
  dsh-claude-enter-grow keyframes（仅当只被发送动画使用）

packages/client/src/features/settings/settings-cards.css
  dsh-claude-enter-card / enter-sample / enter-stack / enter-bubble / enter 动画
  reduced-motion 中 enter-card 相关规则
```

测试：

```text
packages/testing/specs/logic/send-flight/
  bubble-fill.spec.ts
  curves.spec.ts
  opaque-fill.spec.ts
  text-steps.spec.ts
packages/testing/smoke/probe/chat-send.js
packages/testing/smoke/cases/chat.mjs 中 chat-send 专用断言
packages/testing/smoke/cases/settings.mjs 中 chatSend/messageEnter 行
packages/testing/smoke/cases/peer.mjs 中 chatSend/caretMotion 的 ported 集合
packages/testing/scenarios.mjs 的 send / sendFull 场景（若只验证飞行动画，改为验证真实发送）
packages/testing/e2e.mjs 中 ghost/sendLink/flyingMark 采样
packages/testing/lane.mjs 中 sendGhost/sendLink/flyingMark
packages/testing/scenarios/importance-audit.mjs 中 send ghost/flight/link 选择器
packages/testing/data/document-lookups.json 中 chat-send 文件条目
packages/testing/data/importance-unreachable.json 中 messageEnter 相关条目
packages/testing/data/check-numbers.json 中 send-flight 相关条目
packages/testing/faults/patches/chat-send-*.patch
packages/testing/faults/patches/chat-follow-962c32df.patch 中 chatSend 相关段
```

#### 3.3.3 chat-follow 的替代方案

改造前：

```text
submissionHeld() =
  ui.chatSend === undefined
    ? submissionHolds()
    : ui.chatSend.isEntering()
```

改造后：

```text
submissionHeld() = submissionHolds()
```

保留 `submissionHolds()` 的语义：

- 读者消息提交后，宿主的跳转和滚动仍然是真实状态。
- 流式 slide 在真实提交期间仍可按宿主状态站下。
- 不再人为制造一个永远返回 `false` 的假 feature。

`chat-follow.manifest.ts` 的 `reads` 必须同步改，否则类型检查会失败。

#### 3.3.4 设置与翻译清理

删除设置键：

```text
chatSend
messageEnter
```

同时删除：

- `chat-send.copy.json` 全部键。
- `settings-cards.css` 的消息入场卡片样式。
- `settings-tab-motion` 中若引用 `messageEnter` 的说明。
- `peer.mjs` 中 `chatSend` 和 `caretMotion` 的 ported 集合；后者由 R5 处理。
- `settings.mjs` 的 motion 预期行。

保留：

- `chatAnimations` 总开关。
- `chatWait` 等待行动画。
- `chatReveal` 回答文字渐显。
- `motion` 全局动效设置。

#### 3.3.5 真实发送回归重点

必须覆盖：

- 连续快速发送。
- 文件上传、图片、引用。
- 重新生成。
- 流式插入。
- 长会话在顶部/底部发送。
- 切换会话。
- 发送失败。
- 中文输入法组合中按 Enter。

验收断言：

- 发送后没有 `data-dsh-claude-send-ghost`、`data-dsh-claude-send-link`、`data-dsh-claude-send-flight`、`data-dsh-claude-message-enter`。
- 真实消息行由宿主直接出现，不经过 Lite 的透明、位移、遮挡。
- 气泡背景、圆角、颜色、间距保持不变。
- 快速连续发送不出现消息消失、两条重复气泡或发送卡住。

#### 3.3.6 风险与缓解

| 风险 | 缓解 |
| --- | --- |
| 把真实发送逻辑删掉 | 只删除 `features/chat-send/` 与读它的 UI 状态；保留宿主发送按钮、输入和消息数据 |
| `chat-follow` 类型失败 | 同步修改 `reads` 和调用处 |
| `submissionHolds()` 语义不同 | 先读 engine `scroll-owner.ts`，确认它覆盖真实提交；保留原 fallback |
| 删除 `MESSAGE_ENTER_ATTR` 影响 `message-fold` | 用 `rg` 确认 `message-fold` 只读 `MESSAGE_FOLD_ATTR`，不读 enter 属性 |
| `motion.css` 的 `dsh-claude-enter-grow` 被其他动画复用 | 删除前按选择器引用检查；若被复用则保留 |
| 设置页行数变化导致 smoke 失败 | 更新 `settings.mjs` 的 motion 行与父行禁用列表 |

#### 3.3.7 验收证据

- `features/chat-send/` 不存在。
- `rg -n 'chatSend|messageEnter|MESSAGE_ENTER|send-flight|ChatSendHandle|isEntering' packages scripts locale` 返回空。
- `chat-follow.manifest.ts` 的 `reads` 为 `['chatFold']`。
- `chat-follow` 的 `submissionHeld` 使用 `submissionHolds()`。
- 真实发送场景全部通过。
- 视觉回归只允许消息出现方式变化；气泡静态外观无变化。

---

### R4：推理等级滑块进度填充改为 Canvas 2D

#### 3.4.1 目标

- 把持续修改 DOM `fill.style.width` 的普通填充改为 Canvas 2D 按需绘制。
- 保留滑块自身、拖动、吸附、推理等级提交、数值文字、键盘操作、ARIA 和顶档点阵。
- 不把 knob 和语义层 Canvas 化。

#### 3.4.2 现状

`slider.ts` 的 `place()`：

```text
const px = Math.round(x)
const width = steps.length === 0 ? '0px' : `${px + 8}px`
if (animate || dragging) {
  knob.style.translate = px + 'px'
  fill.style.width = width
  return
}
withoutTransition([knob, fill], () => {
  knob.style.translate = px + 'px'
  fill.style.width = width
})
```

`effort-picker.css`：

```text
.dsh-claude-effort-fill {
  transition: width var(--dsh-claude-duration-move) var(--dsh-claude-ease-glide), opacity ...;
}
```

#### 3.4.3 目标结构

```text
track div (role=slider, tabindex, pointer/keyboard/ARIA 全部保留)
  progress canvas (新：普通档位填充与过渡像素)
  ticks DOM
  matrix div > matrix canvas
  knob DOM
```

绘制顺序：

1. Canvas 填充在轨道背景之上。
2. ticks 在 Canvas 之上。
3. matrix 在 ticks 之上。
4. knob 在最上。

CSS 中 `.dsh-claude-effort-fill` 删除；新增 `.dsh-claude-effort-fill-canvas`，并设置 `pointer-events: none`。

#### 3.4.4 `fill-canvas.ts` 接口

```ts
export interface FillCanvasTarget {
  /** 填充右端的 x 坐标，CSS 像素，相对轨道左端。 */
  right: number
  /** 是否从当前值动画到目标值。 */
  animate: boolean
  /** 拖动中：直接跟随，不补间。 */
  dragging: boolean
}

export interface FillCanvasOptions {
  /** 轨道元素，用于读取几何与颜色。 */
  track: HTMLElement
  /** 读取运动是否减弱。 */
  reduced: () => boolean
}

export function createFillCanvas(options: FillCanvasOptions): {
  mount(): void
  setTarget(target: FillCanvasTarget): void
  draw(): void
  pause(): void
  resize(): void
  dispose(): void
}
```

职责约束：

- 只负责绘制普通填充。
- 不读取指针、不绑定点击、不修改 `selected`、不提交等级。
- 不读 ARIA、不碰 knob、不碰 ticks、不碰 matrix。
- 颜色由一个带旧填充规则的 CSS 探针一次性读得计算值，再由 `resolveColour()` 转成 Canvas 可绘通道；不每帧读样式。
- 几何缓存；只在尺寸、DPR、主题变化时重读。
- 帧任务复用同一个 `FrameTask` 对象，避免同一帧重复请求；完成、暂停、隐藏和 dispose 都会取消该任务。

#### 3.4.5 几何与视觉

- 轨道高度 26px，左端圆角 8px，右侧方角。
- 填充右端 = knob 中心 = `px + knobWidth / 2`，与现有 `+8px` 等价。
- `26px` 高、左端 8px 圆角的色块。
- 颜色从 `.dsh-claude-effort-fill` 原来的 `color-mix(in srgb, var(--dsw-alias-label-primary, #161616) 26%, transparent)` 迁移到 Canvas 可读的计算颜色。
- DPR 上限 2，与 `matrix.ts` 一致。
- Canvas backing store 只在轨道宽度、页面缩放、DPR 变化时调整。
- 每帧不调用 `getComputedStyle` 或 `getBoundingClientRect`；几何在 read 阶段读取，绘制在 write 阶段。

#### 3.4.6 帧调度方案

`fill-canvas.ts` 内部：

```text
setTarget(target):
  if target == current && !animating: return
  current = target
  if target.dragging: stopAnimation(); scheduleDraw()
  else if target.animate: startAnimation()
  else: stopAnimation(); scheduleDraw()

startAnimation():
  from = currentRight
  to = target.right
  start = performance.now()
  scheduleFrame()

frame(now):
  progress = clamp((now - start) / duration)
  eased = motionEaseAt('--dsh-claude-ease-glide', progress)
  right = from + (to - from) * eased
  draw(right)
  if progress >= 1: stopAnimation(); return
  scheduleFrame()
```

约束：

- 拖动时每帧合并最新指针坐标，最多绘制一次。
- 停止、卡片关闭、页面隐藏、无变化时不申请下一帧。
- 过渡动画按 `--dsh-claude-duration-move` 和 `--dsh-claude-ease-glide` 计算。
- `prefers-reduced-motion` 或 Lite Reduced 动画开关下直接绘最终状态，不启动补间。
- 页面隐藏时暂停；恢复时直接绘目标状态，不补播隐藏期间的移动。
- 卡片关闭时 `pause()`；下次打开或下一次目标变化时再按需恢复。
- 帧任务必须复用同一个 `FrameTask` 对象；每次新建对象会在同一帧触发 `requestFrame` 的重复请求错误。
- 颜色读取使用临时 CSS 探针加 `resolveColour()`，每个尺寸/主题代只读一次；不在拖动帧里读 `getComputedStyle`。

#### 3.4.7 `slider.ts` 改造

新签名：

```text
const fillCanvas = createFillCanvas({ track, reduced: motionReduced })
```

`place()` 改为：

```text
const px = Math.round(x)
const right = steps.length === 0 ? 0 : px + 8
fillCanvas.setTarget({ right, animate, dragging })
knob.style.translate = `${px}px`
```

`withoutTransition([knob, fill], ...)` 改为 `withoutTransition([knob], ...)`。

需要保留的现有状态：

- `lastTravel` 和 `lastWidth` 的 same-value guard：把 `lastWidth` 改成 `lastRight`，避免重复 setTarget。
- `paintApex` 中的 `dotMatrix.ensure(trackBox())` 不变。
- 顶档时 Canvas 填充透明或隐藏：
  - 首选：`root[data-apex]` 下 CSS 设置 `.dsh-claude-effort-fill-canvas { opacity: 0; }`。
  - 同时 `fillCanvas.pause()`，避免顶档时无意义绘制。
- 退出顶档时 `fillCanvas.draw()` 恢复。
- `dispose()` 调用 `fillCanvas.dispose()`。
- `measure` 仍返回 `EffortTrackBox`；Canvas resize 由 `measureTrack()` 或 `update()` 中的尺寸变化触发。

#### 3.4.8 ARIA、键盘和指针保留

以下逻辑不放 Canvas：

- `track.setAttribute('role', 'slider')`
- `track.setAttribute('tabindex', '0')`
- `aria-valuemin/max/now/text`
- `aria-disabled`
- `pointerdown/pointermove/pointerup/pointercancel`
- `setPointerCapture`
- `keydown` 的 Arrow/Home/End
- `commit()` 和 `pendingEcho`
- `nearest()`、`dampTravel()`、`DRAG_THRESHOLD_PX`
- `nameSwap`
- `paintApex`
- `paintTicks`
- `paintValue`

#### 3.4.9 测试

新增 `packages/testing/specs/logic/effort-picker/fill-canvas.spec.ts`，测试纯几何与缓动：

- `targetRight` 在 0、50%、100% 三种轨道宽度下的结果。
- `eased` 的 0/0.5/1 边界。
- reduced motion 下直接返回最终值。
- DPR 上限 2 的 backing store 尺寸计算。

新增 `packages/testing/specs/behaviour/effort-picker/canvas-fill.spec.mjs`：

- 打开滑块后普通档位有 Canvas 且宽高正确。
- 拖动时 Canvas 像素变化，DOM `fill` 不存在。
- 顶档时 Canvas 隐藏且 matrix Canvas 仍在。
- 键盘 Arrow 改变 ARIA 和 Canvas 填充。
- reduced motion 下无持续帧。
- 页面隐藏时无持续帧。

保留并加强：

- `progress.spec.mjs`
- `top-rung-motion.spec.mjs`
- `edge-drag.spec.mjs`
- `card-steadiness.spec.mjs`
- `seat-handback.spec.mjs`
- `seat-parts.spec.mjs`
- `tone.spec.mjs`

#### 3.4.10 风险与缓解

| 风险 | 缓解 |
| --- | --- |
| Canvas 反而更慢 | C/D 对照；减少无意义重绘、缓存颜色与几何、降低 DPR、无变化不帧 |
| 两层 Canvas 同时绘制 | 顶档暂停 fill Canvas；matrix 只在顶档播放 |
| 拖动时 Canvas 与 knob 不同步 | 同一帧内先 set knob translate，再 setTarget；都用同一 `px` |
| 主题切换颜色不更新 | 订阅 prefs 或主题属性，重新读取一次颜色；不每帧读取 |
| 页面缩放后尺寸错 | 在 `measureTrack()` 的 read 阶段更新 Canvas backing store |
| Canvas 无 2D context | 与 `matrix.ts` 一致，抛出明确错误；由安装隔离边界报告 |
| 删除 `.dsh-claude-effort-fill` 影响其他选择器 | 全仓 CSS 与测试检索；只删除专属规则 |

#### 3.4.11 验收证据

- `rg -n 'fill\\.style\\.width|transition: width' packages/client/src/features/effort` 返回空。
- `.dsh-claude-effort-fill` 不再存在。
- 新增 `.dsh-claude-effort-fill-canvas`。
- `progress`、`edge-drag`、`top-rung-motion`、`card-steadiness` 全部通过。
- 键盘、ARIA、pointer capture、吸附、提交、Pending Echo 全部通过。
- 顶档 matrix Canvas 仍存在且行为不变。
- C/D 性能对比报告包含原始 trace 和 p95 帧耗时。

---

### R5：删除自绘光标，恢复浏览器原生光标

#### 3.5.1 目标

- 完整移除自绘光标、几何测量、镜像探针、追踪定时器/观察订阅、样式、设置和预览。
- 浏览器原生编辑光标正常可见。
- 中文输入法、选区、换行、粘贴、撤销等不变。

#### 3.5.2 全量落点

删除目录：

```text
packages/client/src/features/caret/
  caret-measure.ts
  caret.copy.json
  caret.css
  caret.manifest.ts
  caret.settings.ts
  caret.ts
  copy.ts
```

调用点：

```text
packages/client/src/constants.ts
  CARET_ATTR
  CARET_LAYER_ATTR
  CARET_VISIBLE_ATTR
  CARET_HOST_ATTR
  CARET_FIELD_ATTR
  相关注释

packages/contracts/src/prefs.ts
  CARET_MOTION_OFF
  CARET_MOTION_TYPING
  CARET_MOTIONS
  PREFS.caretMotion

packages/client/src/theme/tokens.json
  --dsh-claude-period-preview-caret
  --dsh-claude-period-blink（仅当无其他引用）
  --dsh-claude-duration-instant（仅当无其他引用）

packages/client/src/features/settings/settings-cards.css
  caret card / sample / piece / bar / typing / off / reduced-motion
  dsh-claude-caret-blink keyframes（仅当无其他引用）

packages/client/src/theme/chrome.css
  只提及 caret.css 的注释
```

测试与文档：

```text
packages/testing/smoke/probe/chat-caret.js
packages/testing/smoke/probe/shell-palette.js 中 caretHost / caretCard / caretRead / caretPreview 段
packages/testing/smoke/cases/settings.mjs 中 caretPreview
packages/testing/smoke/cases/peer.mjs 中 caretMotion
packages/testing/specs/logic/preferences/stored-values.spec.ts 中 caretMotion 断言
packages/testing/data/element-collections.json 中 caret.ts
packages/testing/data/importance-unreachable.json 中 caret 选择器
packages/testing/data/skin-literals.json 中 chat-caret
packages/testing/data/check-numbers.json 中 caret preview
packages/testing/data/document-lookups.json 中 caret.ts（若有）
docs/THIRD_PARTY_NOTICES.md 中 caret 来源说明（改为“上游版本包含，Lite 已移除”）
```

#### 3.5.3 必须保留的共享能力

保留：

```text
packages/client/src/shared/composer-caret.ts
  captureComposerCaret
  composerComposing
  focusKeepingComposerCaret
```

理由：

- `composer.ts` 用 `composerComposing` 控制 placeholder 文案。
- `process-fold.ts` 用 `composerComposing` 防止组合输入期间聚焦。
- `reasoning-fold.ts` 删除后，`process-fold.ts` 仍需要它。
- `pure.ts` 仍导出这三个函数供机制/逻辑测试使用。

#### 3.5.4 CSS 与设置清理

删除：

- `caret.css` 整个文件。
- `caret-color: transparent` 的自绘接管规则。
- `[data-dsh-claude-caret]`、`[data-dsh-claude-caret-layer]`、`[data-dsh-claude-caret-host]`、`[data-dsh-claude-caret-visible]`。
- `caretMotion` 设置行与预览卡片。
- `caretOn` / `caretOff` / `caretSample` / `caretTitle` 翻译。
- `--dsh-claude-period-preview-caret`。
- 若 `--dsh-claude-period-blink` 只被 caret 预览使用，删除；若被其他闪烁效果使用，保留。

保留：

- 浏览器原生光标。
- `caret-color` 由宿主或浏览器决定；Lite 不覆盖。
- 输入区、选区、IME 的既有行为。

#### 3.5.5 模型子菜单搜索框的修复

`packages/client/src/features/model/sub-menu.ts` 当前依赖 caret：

- 搜索框的 `caret-color` 被 caret feature 改为透明。
- 测试 `search.spec.mjs` 断言 `caret-color` 为 `rgba(0, 0, 0, 0)`。

改造后：

- 搜索框使用浏览器原生光标。
- 删除 `search.spec.mjs` 中“native caret is pressed down”的断言。
- 改为断言 `caret-color` 不是透明的，或删除该断言并保留搜索行为断言。
- 删除 `sub-menu.ts` 中只说明 caret 的注释。

#### 3.5.6 风险与缓解

| 风险 | 缓解 |
| --- | --- |
| 误删 `composerComposing` 导致进程折叠和 composer placeholder 回归 | 保留 `shared/composer-caret.ts`；用全仓引用检查 |
| 残留透明光标 CSS | 删除 `caret.css` 和所有 `caret-color: transparent` 来源；新增静态断言 |
| 设置页预览卡片残留 | 删除 caret 设置行、copy、CSS、check-numbers 记录 |
| IME 组合输入回归 | 行为测试覆盖 composition start/end、取消、提交、长文本、多行 |
| 模型搜索框光标不可见 | 更新 `search.spec.mjs` 并做视觉回归 |

#### 3.5.7 验收证据

- `features/caret/` 不存在。
- `rg -n 'caretMotion|CARET_MOTION|caret-measure|features/caret|CARET_ATTR|CARET_LAYER_ATTR|CARET_HOST_ATTR|CARET_VISIBLE_ATTR|CARET_FIELD_ATTR' packages scripts locale` 返回空。
- `rg -n 'caret-color:\\s*transparent' packages/client/src` 返回空。
- `shared/composer-caret.ts` 存在，`pure.ts` 仍导出其函数。
- 原生光标在 composer、搜索框、问题卡片和排队行中可见。
- 中文输入法、选区、换行、粘贴、撤销通过。
- 设置页无光标动画行。
- `chat-caret` probe 删除，相关 smoke 用例更新。

---

### R6：独立插件身份与互斥

#### 3.6.1 目标

- 独立 npm 包、插件 ID、宿主名称、配置命名空间、路由前缀、资产 URL、skin ID、locale 和 README。
- 不与原插件路径冲突。
- 两者可分别安装，但同一 Profile 不得同时激活。

#### 3.6.2 身份变更清单

必须修改：

```text
package.json
  name
  description
  version
  repository / homepage / bugs
  dsh.engines.dsh（保持 >=0.2.2-rc.2 或按固定提交复核）
  files
  exports
  icon
  keywords
  author（增加 fork 说明，保留上游版权）

package-lock.json
  name
  version
  根包 workspaces 名称

packages/contracts/src/package.ts
  PACKAGE_NAME = 'dsh-claude-style-lite'

packages/contracts/src/routes.ts
  ROUTE_PREFIX = '/dsh-claude-style-lite'

packages/client/src/constants.ts
  STYLE_ID
  SURFACE_STYLE_ID
  WEBFONTS_STYLE_ID
  SETTINGS_ENTRY_FALLBACK
  REPOSITORY_URL

skin.json
  id
  name
  tagline
  package
  wiring.id

cordis.patch.yml
  id
  name

locale/zh.json
locale/en.json
  meta.title / meta.description

packages/testing/smoke/cases/_shared.mjs
  sheetPlugin / sheetPluginCss / siblingSheetTag / lateSheetTag 的 Lite 字面值

README.md
README.en.md
CONTRIBUTING.md
docs/ARCHITECTURE.md
docs/DEBUGGING.md
  fork 身份、安装命令、互斥说明、差异说明
```

可以保留：

```text
@dsh-claude-style/* 源码别名
virtual:dsh-claude-style/* 虚拟模块别名
data-dsh-claude-* 数据属性
dsh-claude-* CSS 类
```

但必须验证：

- 这些内部别名不会出现在宿主、安装器、网络请求或设置命名空间中。
- `data-dsh-claude-style` 作为主题标记可能被原版和 Lite 共用；互斥提醒必须依赖插件安装身份，而不是该属性。

#### 3.6.3 设置命名空间

- `PACKAGE_NAME` 改为 `dsh-claude-style-lite`。
- `SETTINGS_ENTRY_FALLBACK` 改为 `ui-skin-claude-style-lite`。
- 配置命名空间由宿主按 `PACKAGE_NAME` 和 loader entry id 解析；必须确认 Lite 的命名空间不与原版重叠。
- 旧配置迁移只通过宿主 settings form API。

#### 3.6.4 路由与资产

- `ROUTE_PREFIX` 改为 `/dsh-claude-style-lite`。
- `ASSETS_ROUTE` 改为 `/dsh-claude-style-lite/assets/`。
- 字体目录改为 `$DSH_HOME/dsh-claude-style-lite/fonts/`。
- 品牌图片、usage 缓存、session panel 缓存等所有 `pluginPath(ctx, ...)` 自动跟随 `PACKAGE_NAME`，无需逐个改路径。
- host 缓存文件 `cachePath(ctx, 'peakrate.json')` 随 R2 删除；其他缓存文件前缀跟随 `PACKAGE_NAME`。

#### 3.6.5 互斥激活

实施：

1. README 与设置页显示互斥说明。
2. locale 描述中写明“同一 Profile 只能启用一个”。
3. 新增 `docs/INSTALL.md`，包含：
   - 原版与 Lite 的安装命令。
   - 同一 Profile 不得同时激活。
   - 切换主题的步骤。
   - 回退到原版的步骤。
4. 测试：
   - 两者同装，仅 Lite 启动。
   - 两者同装，仅原版启动。
   - 两者都激活时，后启动者的行为与告警。
5. 不在 Lite 中自动停用原版，因为 DSH 没有跨插件启停 API。

#### 3.6.6 版本与上游固定

新增仓库根文件：

```text
UPSTREAM_COMMIT
  8cafcacd5aa574faa75b1912b8934bede7936b73

UPSTREAM_VERSION
  0.20.3

LITE_VERSION
  0.1.0

DSH_TESTED_VERSION
  填写实际测试的 DSH 版本

NODE_VERSION
  填写构建所用 Node 版本

BUILD_SHA256
  填写构建产物 SHA-256
```

构建脚本可在 `lib/` 生成 `metadata.json`，但不得手写。

#### 3.6.7 验收证据

- `rg -n '"name": "dsh-claude-style"|PACKAGE_NAME = .dsh-claude-style.|ROUTE_PREFIX = ./dsh-claude-style.'` 只允许出现在上游说明或迁移文档中。
- `npm pack --dry-run` 显示的包名为 `dsh-claude-style-lite`。
- 安装后 `document.body.getAttribute('data-dsh-claude-style')` 的 build id 来自 Lite 构建。
- 网络请求全部以 `/dsh-claude-style-lite` 开头。
- 设置命名空间为 Lite 独立命名空间。
- 两者同装测试通过。

---

### R7：许可证、发布与交付

#### 3.7.1 目标

- 保留 MIT 版权与许可证文本。
- 保留 Sodium 的 PolyForm Shield 许可、NOTICE 和版权归属。
- Anthropic 字体、Clawd 及其他受限素材不因改名而自由分发。
- 新插件字体投放目录与路由前缀一致。
- 交付源码、构建产物、npm 包或 GitHub `#dist`、`UPSTREAM_COMMIT`、修改清单、许可证、NOTICE、安装/卸载/回退说明、测试结果和 A/B 报告。

#### 3.7.2 许可证处理

保留：

- `LICENSE` 的 MIT 文本和 `Copyright (c) 2026 Nwflower`。
- `docs/NOTICE.md` 的 Sodium PolyForm Shield 说明。
- `packages/client/src/features/sodium/LICENSE`。
- `docs/THIRD_PARTY_NOTICES.md`。
- `packages/assets/src/fonts/OFL.txt`。

新增：

- `LICENSE` 中增加 fork 说明：

```text
This package is a fork of dsh-claude-style by Nwflower,
based on commit 8cafcacd5aa574faa75b1912b8934bede7936b73.
The original MIT license and copyright notice are retained.
```

- `docs/NOTICE.md` 中增加 Lite 的修改说明。
- `README.md` 中增加上游归属和 Lite 差异。

不得：

- 删除原版权人。
- 把 Sodium 改成 MIT。
- 把 Anthropic 字体打进 npm。
- 把 Clawd 素材重新授权。
- 因改名删除 NOTICE。

#### 3.7.3 字体与素材

- Anthropic 字体继续只放在仓库，不进入 npm `files`。
- `FONT_FILES` 路由白名单继续拒绝未知文件。
- 用户字体目录改为 `$DSH_HOME/dsh-claude-style-lite/fonts/`。
- 文档中给出从原版目录复制字体的迁移说明。
- 品牌图标、吉祥物、Sodium 资源保持原有许可与归属。

#### 3.7.4 发布

- npm 包名：`dsh-claude-style-lite`。
- 版本：`0.1.0` 起。
- GitHub 分支：`dist`。
- `package.json` 的 `files` 与上游一致，删除项对应删除。
- `prepublishOnly` 继续执行 `npm run build`。
- `UPSTREAM_COMMIT`、`UPSTREAM_VERSION`、`LITE_VERSION`、`BUILD_SHA256` 随包发布。
- `npm pack --dry-run` 检查内容，确认：
  - 无源码之外的测试缓存。
  - 无 Anthropic 字体。
  - 无 `peakrate-catalog.json`。
  - 无 `chat-send` / `caret` / `peakrate` 构建产物。
  - 有 `lib/client.js`、`lib/host/index.js`、`locale`、`skin.json`、`cordis.patch.yml`、README、LICENSE、NOTICE。

#### 3.7.5 安装、卸载与回退

`docs/INSTALL.md` 必须包含：

```text
安装 Lite
dsh plugin --profile web add dsh-claude-style-lite

安装原版
dsh plugin --profile web add dsh-claude-style

同一 Profile 只启用一个
切换前先停用另一个

卸载 Lite
dsh plugin --profile web remove dsh-claude-style-lite

回退原版
停用 Lite，启用 dsh-claude-style

字体迁移
把 $DSH_HOME/dsh-claude-style/fonts/ 复制到
$DSH_HOME/dsh-claude-style-lite/fonts/

设置迁移
仅当宿主公开接口可读时执行；否则手动迁移
```

#### 3.7.6 验收证据

- `npm pack --dry-run --json` 内容清单。
- `LICENSE`、`docs/NOTICE.md`、`docs/THIRD_PARTY_NOTICES.md`、`packages/client/src/features/sodium/LICENSE`、`packages/assets/src/fonts/OFL.txt` 存在。
- npm 包中无 Anthropic 字体。
- `UPSTREAM_COMMIT` 与 ZIP 注释一致。
- 安装、卸载、回退记录。
- A/B 报告与原始 Trace。

---

### T00：冻结基线、建立真实 A/B 环境

#### 3.8.1 目标

- 固定上游提交。
- 建立原版 A 与 Lite B 两套独立构建。
- 记录环境。
- 生成功能依赖清单。

#### 3.8.2 步骤

1. 从 ZIP 解压到工作目录，初始化 Git 仓库。
2. 创建 `baseline` 分支，提交原始快照。
3. 记录：

```text
git rev-parse HEAD
package.json version
dsh --version
node --version
npm --version
OS 版本
浏览器版本
显卡
缩放
显示器刷新率
```

4. 安装依赖：

```bash
npm install
```

5. 基线门禁：

```bash
npm run build
npm run lint
npm test
npm run verify -- --full
```

6. 记录已有失败，不归咎于 Lite。
7. 生成依赖清单：

```bash
rg -n 'createReasoningFold|PeakRateHandle|PEAKRATE_PATH|peakrate-catalog|chatSend|messageEnter|CARET_MOTION|caretMotion|send-flight|fill\.style\.width' packages scripts .github locale README.md README.en.md docs
```

8. 按“可删 / 被其他功能引用 / 公共机制不可删”分类。
9. 保留原版 A 构建用于 A/B。
10. 所有测试在测试机进行，不使用生产环境。

#### 3.8.3 验收证据

- `UPSTREAM_COMMIT` 文件。
- 基线环境记录。
- 基线测试输出。
- 依赖清单。
- 原版 A 与 Lite B 的独立构建目录。

---

### T01–T05：功能改造

T01–T05 分别对应 R1–R5，执行顺序建议：

```text
T01 R1 思考自动开合
T02 R2 峰谷模块
T03 R3 消息气泡入场
T04 R4 Canvas 填充
T05 R5 自绘光标
```

理由：

- R1 先处理共享折叠，避免后续修改 `chat-fold` 时混淆。
- R2 涉及宿主、契约、构建、数据，单独处理。
- R3 依赖 R2 的设置清理节奏，但两者文件不重叠。
- R4 独立于删除项，放在四项删除之后，便于 C/D 对照。
- R5 最后处理，避免光标共享工具影响其他折叠。

---

### T06：跨模块清扫与构建修复

#### 3.9.1 目标

- 检查所有入口、manifest、scheduler、contracts、routes、settings、build、virtual modules、settings UI、i18n、README 是否仍有残留。
- 删除无用 imports、interfaces、CSS、keyframes、常量、资源、preview timers、测试和构建产物条目。
- 保留共享工具。
- 不留永久不开启的空功能。
- 不吞错误通过构建。

#### 3.9.2 第一轮扫描

```bash
rg -n 'createReasoningFold|PeakRateHandle|PEAKRATE_PATH|peakrate-catalog|chatSend|messageEnter|CARET_MOTION|caretMotion|send-flight|fill\.style\.width' packages scripts .github locale README.md README.en.md docs
```

允许残留：

- `docs/CHANGELOG.md` 的历史记录。
- `docs/upstream/` 中的上游说明。
- 本设计与计划文档。

不允许残留：

- 运行代码中的悬空 import。
- manifest 中的已删除句柄。
- 设置行中的已删除键。
- 路由中的已删除路径。
- 构建脚本中的已删除数据。
- locale 中的孤儿文案。

#### 3.9.3 第二轮扫描

```bash
rg -n 'features/peakrate|features/chat-send|features/caret' packages scripts .github locale
rg -n 'CHAT_FLYING_ATTR|MESSAGE_ENTER_ATTR|CARET_ATTR|CARET_LAYER_ATTR|CARET_HOST_ATTR|CARET_VISIBLE_ATTR|CARET_FIELD_ATTR' packages
rg -n 'ui\.peakrate|ui\.chatSend' packages/client/src
rg -n 'PeakRateHandle|ChatSendHandle' packages/client/src
rg -n 'peakrate|chatSend|messageEnter|caretMotion' packages/contracts/src/prefs.ts packages/contracts/src/routes.ts
```

#### 3.9.4 构建与类型检查

```bash
npm run build
npm run lint
npm test
npm run verify -- --full
```

预期：

- `npm run build` 通过 types、manifests、contracts、cycles、lists、CSS scope、assets 检查。
- `npm run lint` 通过文件行数、依赖方向、文档链接、决策引用、prose paths、feature UI、copied code、document lookups、bounds、spec contracts、surface table、skin literals、ledgers。
- `npm test` 通过 logic 和 mechanism specs。
- `npm run verify -- --full` 通过 stand-in 和 e2e。

#### 3.9.5 账本与快照

必须重新生成或更新：

```text
packages/testing/data/element-collections.json
packages/testing/data/document-lookups.json
packages/testing/data/importance-ledger.json
packages/testing/data/importance-unreachable.json
packages/testing/data/check-numbers.json
packages/testing/data/skin-literals.json
packages/testing/data/appearance.json
packages/testing/data/surface.json
```

注意：

- `importance-unreachable.json` 只允许收缩。
- `document-lookups.json` 只允许收缩。
- `skin-literals.json` 只允许收缩。
- `appearance.json` 必须随客户端源码变化一起提交。
- `surface.json` 删除已移除功能的条目，保留保留功能的条目。

#### 3.9.6 验收证据

- 三轮扫描结果。
- 构建、lint、test、verify 输出。
- 账本更新 diff。
- 无 `lib/` 手改痕迹。

---

### T07：测试、文档、打包与交付

#### 3.10.1 单元与契约测试

必须通过：

```text
logic specs
mechanism specs
contracts build checks
manifest checks
settings row checks
```

必须更新：

```text
preferences/stored-values.spec.ts
  删除 caretMotion 断言
  删除 peakrate / chatSend / messageEnter 断言

billing-clock/
  整目录删除

send-flight/
  整目录删除

caret/
  若有逻辑 spec，删除

reasoning-display/choice.spec.mjs
  改为手动 expanded 后验证窗口

model-picker/search.spec.mjs
  原生光标断言

settings smoke
  motion 行、parent disabled 列表
```

#### 3.10.2 视觉回归

覆盖矩阵：

```text
Claude / DeepSeek
浅色 / 深色
桌面 / Web
80% / 100% / 125% / 150% 缩放
中文 / 英文
```

允许变化：

- 思考自动开合消失。
- 峰谷徽标和设置项消失。
- 消息气泡入场方式变为宿主直接出现。
- 滑块普通填充由 Canvas 绘制。
- 自绘光标消失，原生光标出现。
- 设置页对应行消失。

不允许变化：

- 布局、间距、颜色、字体、气泡静态样式。
- 模型选择、权限、导航、吉祥物、长会话优化。
- 其他动画、折叠、等待状态、回答渐显。

#### 3.10.3 性能测试

场景：

```text
60 秒闲置
60 秒持续思考
连续输入 1000 字、光标移动 200 次
连续发送 30 条消息
滑块往返 30 次
长会话 500 / 2000 条消息切换
模型目录 500 / 2000 行反复打开
```

采样：

- 至少 5 次正式采样。
- 先预热。
- ABBA 或 BAAB 交叉。
- 相同 DSH 版本、设置、主题、缩放、分辨率、设备。
- 不能同时启用两个插件。

指标：

```text
主线程 Scripting + Rendering + Painting 总忙碌时间
Long Tasks 总时长和 p95
掉帧比例
输入延迟 p95
滑块拖动 p95 帧耗时
JS heap（稳定后强制 GC）
DOM 节点数
事件监听器数
Canvas 重绘次数
打包体积（原始、gzip、brotli）
峰谷网络请求数量
```

C/D 对照：

- C：Lite 代码，普通填充仍用 DOM width。
- D：Lite 代码，普通填充用 Canvas。

输出：

- 每组原始数据。
- 中位数、p95、下降率、采样方差。
- 负收益必须披露。

#### 3.10.4 发布门槛

```text
功能回归全绿
混合场景主线程工作量下降目标 >= 5%（未达标必须披露，不修改门槛）
长会话主线程忙碌时间退化不得超过 3%
滑块 Canvas 相对 DOM 填充 p95 帧耗时退化不得超过 5%
Lite 不再有峰谷请求 / 监听 / 页面节点
没有原生光标不可见事件
```

低于目标时先定位，不硬改结论。

#### 3.10.5 交付内容

```text
源码仓库
构建产物
npm 安装包或 GitHub #dist 发布分支
UPSTREAM_COMMIT
UPSTREAM_VERSION
LITE_VERSION
BUILD_SHA256
修改清单
删除/保留映射表
LICENSE
NOTICE
THIRD_PARTY_NOTICES
安装/卸载/回退说明
完整测试结果
A/B 性能报告
视觉回归截图
已知限制
```

---

## 4. 需求追踪矩阵

| 需求 | 解决方案节 | 修改计划节 | 主要文件 | 验收证据 |
| --- | --- | --- | --- | --- |
| R1 思考自动开合 | 3.1 | Task 4 | `chat-fold.ts`、`reasoning-fold.ts`、`reasoning-stream.ts`、`fold-motion.css` | 静态扫描、reasoning-display spec、手动开合行为测试 |
| R2 峰谷 | 3.2 | Task 5 | `features/peakrate/`、`host/peakrate*`、`contracts/peakrate.ts`、`routes.ts`、`prices.ts`、`pricing-calendar.json` | rg 扫描、host-half、价格/成本/用量回归、网络观察 |
| R3 气泡入场 | 3.3 | Task 6 | `features/chat-send/`、`chat-follow.ts`、`prefs.ts`、`settings-cards.css` | rg 扫描、真实发送回归、视觉回归 |
| R4 Canvas 填充 | 3.4 | Task 7 | `slider.ts`、`fill-canvas.ts`、`effort-picker.css` | 静态断言、effort specs、C/D 性能 |
| R5 自绘光标 | 3.5 | Task 8 | `features/caret/`、`prefs.ts`、`settings-cards.css`、`constants.ts`、`composer-caret.ts` | rg 扫描、原生光标测试、IME 测试 |
| R6 独立身份 | 3.6 | Task 3、Task 9 | `package.json`、`package.ts`、`routes.ts`、`skin.json`、`cordis.patch.yml`、locale、README | npm pack、安装测试、网络前缀、同装测试 |
| R7 许可证与发布 | 3.7 | Task 9、Task 14 | `LICENSE`、`NOTICE`、`THIRD_PARTY_NOTICES`、`UPSTREAM_COMMIT`、`docs/INSTALL.md`、发布脚本 | 包内容清单、许可文件、安装/回退记录 |
| T00 基线 | 2.7、3.8 | Task 1、Task 2 | Git、环境记录、隔离 dsh-web 启动器、本地 home 指纹 | 基线输出、依赖清单、前后指纹一致 |
| T01 思考 | 3.1 | Task 4 | 同 R1 | 同 R1 |
| T02 峰谷 | 3.2 | Task 5 | 同 R2 | 同 R2 |
| T03 发送 | 3.3 | Task 6 | 同 R3 | 同 R3 |
| T04 滑块 | 3.4 | Task 7 | 同 R4 | 同 R4 |
| T05 光标 | 3.5 | Task 8 | 同 R5 | 同 R5 |
| T06 清扫 | 3.9 | Task 9、Task 11 | 全仓 | 三轮扫描、构建、lint、账本 |
| T07 测试与交付 | 3.10 | Task 12–Task 15 | 测试、文档、发布 | 测试矩阵、A/B、包清单、隔离验证 |

---

## 5. 全局测试策略

### 5.1 单元与契约

- `clampPrefs` 不再包含删除键。
- 删除键被旧配置携带时被忽略，不导致启动失败。
- `PriceDocument` 的 `schedule` 仍能验证。
- `fill-canvas` 的纯函数几何与缓动。
- `reasoning-stream` 的窗口状态机。

### 5.2 机制测试

- 共享 MutationObserver 总线仍只有一个。
- 帧管线仍只有一个。
- `observeMatches` 与 `requestFrame` 的 teardown 正确。
- Canvas 的 `dispose()` 取消帧与订阅。
- 原生光标无透明 CSS。

### 5.3 行为测试

- 思考手动开合、流式窗口、进程折叠、消息折叠。
- 模型菜单、搜索、描述、release tag。
- 滑块拖动、键盘、ARIA、吸附、提交、顶档。
- 原生光标、IME、选区、粘贴、撤销。
- 真实发送、快速连续发送、文件、图片、引用、重新生成、失败。

### 5.4 端到端

- 两者同装，仅 Lite 启动。
- 两者同装，仅原版启动。
- Lite 安装、激活、卸载、回退。
- `/prices`、`/session-cost`、`/usage` 可用。
- `/peakrate` 不存在。
- 无 `offpeakclock.com` 请求。

### 5.5 性能

- A/B 全套场景。
- C/D 滑块对照。
- 原始 trace 与计算结果一起交付。

---

## 6. 风险登记

| 编号 | 风险 | 概率 | 影响 | 缓解 | 触发条件 |
| --- | --- | --- | --- | --- | --- |
| K1 | 误删共享折叠模块 | 中 | 高 | 保留 `fold-toggle.ts`、`fold-glide.ts`、`message-fold.ts`、`process-fold.ts`；全仓引用检查 | 删除前未做引用图 |
| K2 | 价格生成因峰谷目录删除而失败 | 高 | 高 | 新建 `pricing-calendar.json`；`fetch-prices.mjs` 改读它 | 直接删除目录 |
| K3 | `chat-follow` 类型或行为回归 | 中 | 中 | 同步改 `reads` 与 `submissionHeld()`；运行 chat-follow specs | 只删 `chat-send` 不改调用点 |
| K4 | Canvas 填充与 knob 不同步 | 中 | 中 | 同一 `px`、同一帧、同一几何；行为测试 | 分别计算几何 |
| K5 | Canvas 性能反而退化 | 中 | 中 | C/D 对照；减少重绘；缓存颜色和尺寸；DPR 上限 2 | 未做 C/D |
| K6 | 原生光标不可见 | 低 | 高 | 删除所有 `caret-color: transparent`；视觉与 IME 测试 | 残留 CSS |
| K7 | 设置迁移越界写原配置 | 低 | 高 | 默认只提供手动迁移文档；只有宿主提供跨命名空间只读 API 时才自动迁移，且只写 Lite 命名空间 | 直接读写文件或注入私有模块 |
| K8 | 两插件同时激活 | 中 | 高 | 明确互斥文档与设置页提示；同装测试 | 未测试 |
| K9 | 受限字体进入 npm | 低 | 高 | `files` 白名单；`npm pack --dry-run` 检查 | 误加 `packages/assets/src/fonts/anthropic` |
| K10 | 账本增长导致 CI 失败 | 中 | 低 | 只收缩账本；重新生成 appearance；更新 surface | 忘记更新 ledger |
| K11 | 视觉回归被误判为允许变化 | 中 | 中 | 明确允许变化清单；逐图对比 | 未定义允许差异 |
| K12 | A/B 百分比被误当成实测 | 高 | 中 | 报告中区分估算与实测；附原始数据 | 只写结论 |

---

## 7. 未决问题与实施前确认

以下问题不影响方案结构，但必须在 Task 1 或 Task 2 中确认：

1. **DSH 实测版本**：实施书要求固定 DSH 版本。当前环境没有 DSH 可执行文件，需在测试机记录 `dsh --version`。
2. **Node 版本**：当前 shell 无 `node`/`npm`。需安装 Node 并记录版本。
3. **原版设置读取 API**：仅在宿主公开 settings form API 可见时执行迁移；否则只提供手动迁移说明。
4. **两插件同时激活的宿主行为**：需在真实 DSH 上测试后补充告警文案；当前方案不假设宿主会强制互斥。
5. **`fold-motion.css` 中思考窗口规则的精确删除范围**：需在 R1 实施时按选择器引用逐条核对，避免误删仍在使用的 disclosure 入场规则。
6. **`--dsh-claude-period-blink` 是否有其他引用**：R5 实施时用 `rg` 确认；若有其他用途则保留。
7. **`dsh-claude-enter-grow` 是否只被消息入场使用**：R3 实施时用 `rg` 确认；若有其他用途则保留。
8. **`fold.expanded`、`chat.think-running` 等 contract 条目是否仍被保留功能使用**：R1 实施时逐条核对 `table.ts` 与 manifest。
9. **`peakrate` 颜色 token 是否只被峰谷使用**：R2 实施时用 `rg` 确认。
10. **`model-meter` smoke 是否完全删除或改为纯模型行布局测试**：建议删除峰谷断言，保留模型行布局、描述、选择、tooltip 断言。
11. **`send` / `sendFull` e2e 场景**：若仅验证飞行动画，删除；若还验证真实发送和滚动，改写为真实发送回归。
12. **`pricing-calendar.json` 的更新来源**：首版从固定快照迁移；后续是否需要自动刷新由维护者决定，但不得恢复峰谷运行时链路。

---

## 8. 结论

本方案满足实施书的核心边界：

- 四项功能真实删除，不是隐藏或提前返回。
- 推理滑块只替换普通填充绘制路径，交互与语义全部保留。
- 删除项之外的视觉、模型、会话、统计、动画和性能优化保持不变。
- 独立身份、互斥安装、许可证和发布均有明确方案。
- 所有性能结论以实测为准，不以估算替代。

下一步是按配套修改计划逐项实施，并在每个 Task 结束时保存测试证据。
