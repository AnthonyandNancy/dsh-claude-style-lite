# DSH Claude Style Lite —— 减负改造设计与实施书 V1.0

> 文档性质：独立插件开发实施书 / AI Agent 执行依据  
> 编制日期：2026-11-12  
> 上游仓库：/dsh-claude-style
> 暂定新插件：`dsh-claude-style-lite`（发布前核对包名是否被占用）  
> 结论状态：已经结合上游公开的架构、manifest、实现源码及更新日志进行静态设计；**尚未完成本地克隆、构建、运行和 A/B 实测**。百分比均为带前提的工程估算，不得标为实测成绩。

---

## 1. 项目目标与原则

以 `Nwflower/dsh-claude-style` 的**固定上游提交**为基础，派生独立安装、独立维护的轻量版本。准确移除指定的昂贵交互及其所有专属代码，其他外观、业务功能、数据统计、现有交互和兼容性原则上保持不变。

### 1.1 必须完成的五项调整

| 编号 | 原版功能                  | Lite 要求                                                                       | 重要边界                                                                                                                          |
| ---- | ------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| R1   | 思考自动展开/自动收起     | 移除自动判定、模拟点击、监听、状态记忆及专属 CSS                                | **保留宿主原生手动展开/收起**；保留非思考的消息/工具流程折叠；保留思考正文和其他显示能力                                          |
| R2   | 峰谷时段/费率计算与徽标   | 删除峰谷功能的浏览器端、宿主端、数据、定时器、缓存、私有 API、设置和所有调用    | **不可删除一般模型价格、会话账单、用量统计等独立能力**                                                                            |
| R3   | 用户消息气泡发送/入场动画 | 删除飞入与原位增长两种入场动画、过渡替身、动画预览和专属调度                    | 真实的消息发送、气泡外观、布局、滚动及历史消息保持原样；回答文字渐显 `chatReveal` 不属于本项                                      |
| R4   | 推理等级滑块进度填充动画  | 把持续修改 DOM `fill.style.width` 的填充视觉改为 Canvas 2D 按需绘制             | **滑块自身、拖动、吸附、推理等级提交、数值文字、键盘操作和无障碍语义全部保留**；顶档点阵已经是 Canvas，不能重复开发或重复计算收益 |
| R5   | 自绘输入光标动画          | 完整移除自绘光标、光标几何测量、镜像探针、追踪定时器/观察订阅、样式、设置和预览 | 浏览器的原生编辑光标必须正常可见；中文输入法、选区、换行、粘贴、撤销等不变                                                        |

### 1.2 非目标

- 不借机关闭全部动画、整体改 CSS、删除所有折叠功能或精简其他业务模块。
- 不改动模型能力、供应商/模型切换、推理参数提交接口、会话发送协议、消息存储及宿主服务。
- 不使用 `display:none`、`return`、全局 CSS 覆盖来“假装删除”；目标是代码、资源、监听器、配置和构建引用都被真正移除。
- 不因为“Lite”而删除当前上游已经做好的性能优化：统一 MutationObserver 总线、统一帧管线、增量扫描、长会话离屏跳过与 Canvas 点阵等继续保留。

## 2. 上游代码核查：实际实现与风险

核查依据：上游 `docs/ARCHITECTURE.md`、`AGENTS.md`、`packages/client/src/entry.ts`、`core/scheduler.ts`、相关 `features/*`、`packages/host/src/`、`packages/contracts/src/` 及 `docs/CHANGELOG.md`。上游会继续更新，**开发前先固定 SHA，再复查本节对应文件**。

### 2.1 基础架构及执行链

- 浏览器入口：`packages/client/src/entry.ts`，根据 feature manifest 安装/卸载功能；`core/scheduler.ts` 声明功能句柄。
- 浏览器功能：`packages/client/src/features/<feature>/`，包括 `.manifest.ts`、脚本及专属 CSS。
- 运行时：`packages/engine/`，提供共用 DOM 观察总线、帧读写管线、生命周期和宿主服务读取。**不要因为删除个别功能而破坏引擎公共接口。**
- 契约与设置：`packages/contracts/src/{prefs,routes,package,...}.ts`；Host 的 `packages/host/src/{settings,routes,...}.ts`。
- 构建：`scripts/build/build.mjs` 与相关构建/校验脚本，最终由构建生成 `lib/host/index.js`、`lib/client.js` 和资源。**禁止手改 `lib/`。**

### 2.2 精准删除/保留映射表

| 事项           | 已查到的主要入口                                                                                                                                              | 必须清理                                                                  | 必须保留/改造                                                                                                                          |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 思考自动开合   | `features/chat-fold/reasoning-fold.ts`；`chat-fold/chat-fold.ts` 中 `createReasoningFold()`                                                                   | 思考状态自动点击、自动扫描、按阶段记录、相关订阅与专属断言                | `createMessageFold()`、`createProcessFold()`、`createProcessSummary()`、`installChatFoldGlide()`及 `ui.chatFold.isBusy()` 等非思考路径 |
| 思考显示耦合   | `features/chat-fold/reasoning-stream.ts`                                                                                                                      | 与已移除 `createReasoningFold()` 的 `onRows` 回调绑定                     | 独立观察思考行；继续支持 `reasoningDisplay=continuous/stepped`，但不主动改变展开状态                                                   |
| 峰谷功能前端   | `features/peakrate/{peakrate.ts,peakrate.manifest.ts,...}`、`core/scheduler.ts` 中 `PeakRateHandle`                                                           | 价格时段匹配、倒计时/徽标、目录刷新、设置、`ui.peakrate`                  | 模型选择器本身、模型元信息、普通费用统计                                                                                               |
| 峰谷功能宿主   | `packages/host/src/{peakrate.ts,peakrate-catalog.ts,routes.ts}`、`packages/contracts/src/{peakrate.ts,routes.ts}`、`packages/host/data/peakrate-catalog.json` | 峰谷路由、缓存、24 小时刷新定时器、外部目录获取、峰谷构建数据工序         | `/prices`、`/session-cost`、`/usage` 等**非峰谷**路线，不能误删                                                                        |
| 模型选择器耦合 | `features/model/{model-picker.ts,rows.ts,...}`                                                                                                                | `rate()` 回调、`PaintedRate`/模型费率徽标与定时刷新，只在确为峰谷用途时删 | 原有模型选择、描述、分类、模型搜索和费用相关**非峰谷**界面                                                                             |
| 消息发送动画   | `features/chat-send/send-flight.ts`、`send-flight.manifest.ts`、`send-*.ts`、`send-flight.css`、`chat-send.settings.ts`                                       | 飞行动画、增长动画、替身/快照/救援计时器、相关设置与预览                  | 宿主原生发送动作、消息数据、气泡外观、布局及新消息到达                                                                                 |
| 光标动画       | `features/caret/{caret.ts,caret-measure.ts,caret.css,caret.manifest.ts,...}`                                                                                  | 自绘层、透明原生光标、Range/镜像测量、订阅、预览                          | `shared/composer-caret.ts` 等可能被其他功能使用的输入法状态工具，按全仓引用保留                                                        |
| 推理滑块       | `features/effort/{effort-picker.ts,slider.ts,effort-picker.css,matrix.ts}`                                                                                    | `fill.style.width` 及宽度过渡这条视觉更新链                               | 滑块轨道命中区、DOM 滑块拇指、`role=slider`、ARIA、指针捕获、模型等级提交、顶档 Canvas `matrix.ts`                                     |

**决定性发现：**截至核查到的 `docs/CHANGELOG.md` 的 2026-11-10 / `0.20.3` 条目，顶档点阵已经改为 Canvas；`matrix.ts` 源码写明此前 235 块、每块 4 个 CSS 动画，即约 **940 个动画实例**已被上游消除。Lite 的新增 Canvas 改造应针对仍在用 `fill.style.width` 和 CSS `transition: width` 的普通进度填充，而不能算作再消除 940 个动画。

## 3. 新插件身份、发布与兼容性

1. 从上游固定 commit 派生，记录 `UPSTREAM_COMMIT`、fork commit、上游版本、DSH 测试版本、构建命令和校验摘要；不要在实施中混入上游后续自动更新。
2. 暂命名 `dsh-claude-style-lite`。维护唯一插件 ID、npm `name`、宿主名称、配置命名空间、路由前缀 `/dsh-claude-style-lite`、注入资产 URL、`skin.json`、中英 locale、README 和构建产物，**保证不与原插件路径冲突**。
3. 构建期别名 `@dsh-claude-style/*` 和 `virtual:dsh-claude-style/*` 可以经统一构建配置保留为**内部源码别名**，避免不必要的大面积重命名；但所有会暴露到宿主/安装器/网络/设置的包标识必须变更。对全仓做检索验证。`data-dsh-claude-*` CSS class 可在互斥主题前提下保留，避免改坏视觉样式。
4. 原版与 Lite 允许分别安装，但在同一个 DSH Profile **不得同时激活**；启动/设置页需明确互斥提醒，不让两个主题同时接管 DOM。测试“两者同装仅 Lite 启动”和“两者同装仅原版启动”。
5. 设置迁移：在获得合法的旧配置读取接口时，仅一次性**复制保留的设置键**到 Lite 的独立命名空间，不写回/删除原设置；无法安全读取时保留原配置并展示明确的手动迁移说明，严禁私自直接读写原版插件的数据库或配置文件。删除的设置键不迁移。
6. 维护原上游 MIT 版权与许可证文本；继续保留 Sodium 的 PolyForm Shield 等第三方独立许可、NOTICE、版权归属。Anthropic 字体、Clawd 及其他非 MIT 素材不可因改名而视为自由分发；不把受限字体纳入 npm 包。新插件字体投放目录与路由前缀应一致并有迁移说明。
7. 以固定上游 manifest 的 `dsh.engines.dsh` 为基准确定最低 DSH 版本；不能因为新名字而写低兼容版本。当前公开源码显示 `>=0.2.2-rc.1`，应在固定提交后再次核查。

## 4. 详细实施步骤

### T00. 冻结基线、建立真实 A/B 环境

- 克隆仓库，执行 `git rev-parse HEAD`、记录 version、DSH 版本、Node 版本、OS、浏览器版本、显卡、缩放与显示器刷新率。复制一份“原版 A”进行基线测量，独立 fork 作“Lite B”。
- 先执行上游 `npm install`、`npm run build`、`npm run lint`、`npm test`、`npm run verify -- --full`（以该提交实际支持的脚本为准）。有已有失败则记入 baseline，不能归咎于 Lite。
- 生成**功能依赖清单**：对下文 5 组文件、设置键、常量、样式选择器、route、资源、测试、文档做 `rg -n` 全局检索，按“可删 / 被其他功能引用 / 公共机制不可删”分类。
- 限定修改范围，在测试机保留上游对照构建；测试不在生产环境进行。

### T01. 删除思考自动开合，保留宿主原生交互

1. `chat-fold/chat-fold.ts` 移除 `createReasoningFold` 的导入、初始化、停止调用及与自动开合绑定的回调。**不要直接删整个 `chatFold` feature**。
2. 删除 `reasoning-fold.ts` 中专属的阶段检测、模拟 click、`WeakMap`、订阅和等待逻辑；针对 `fold-toggle.ts`、`fold-glide-parts.ts`、`fold-motion.css` 做逐符号引用检查，凡被进程/消息折叠或流式动画使用的部分继续保留。
3. `reasoning-stream.ts` 的 stepped 思考文本窗口如仍需保留，改为自己通过现成的观察总线和帧管线接收思考行变更，**不得新增第二套全页 MutationObserver 或私自独立的常驻 rAF**。它只影响展开后的文本排版，不能再模拟点击展开/收起。
4. 宿主思考展开按钮保留、可手动点击，流式开始/结束时是否自动变化只遵循宿主自身逻辑；Lite 不干预。清理与原自动开合强绑定的逻辑及测试；`reasoningDisplay` 显示设置如果仍可用则保留。
5. 验证持续思考、切换会话、用户中途手动展开/收起、思考结束、工具调用混排、中文输入法同时编辑，均无自动强制开合、焦点丢失、重复点击或 DOM 残留。

### T02. 完整拆除峰谷费率模块

1. 删除 `features/peakrate/` 的独占代码、manifest、CSS、badge、schedule、match、live 等；在 `core/scheduler.ts` 及 feature registry 中去掉 `PeakRateHandle` 和 `ui.peakrate`。
2. 移除模型列表构造器 `rate()`、费率徽标、计时更新/缓存、刷新签名/订阅。注意 `rows.ts` 中它是模型行的附加功能，不能破坏模型行、描述、选择和 Tooltip 的其他用途。
3. 宿主去掉 `createPeakRate()` 相关 store、`PEAKRATE_PATH` route 和注册；删除仅用于峰谷的契约、数据快照、下载 URL、峰谷定时刷新、峰谷缓存文件写入和构建/CI 数据更新工序。移除峰谷配置 `peakrate`，Settings 中不再显示该项。
4. **逐项确认** `PRICES_PATH`、`SESSION_COST_PATH`、`USAGE_PATH`、`createPrices`、`createSessionCost`、`createUsage` 是否独立使用价格表；独立则必须保留。无法在静态引用中确认的共享 helper 先读调用链，不可凭文件名删除。
5. 网络验收：使用 Lite 打开模型菜单、运行 30 分钟，不应发生新的 `/peakrate` 请求，不应获取 `offpeakclock.com` 或峰谷目录文件；原通用用量与结算请求正常。

### T03. 删除用户消息气泡入场动画，但绝不影响发送

1. 删除 `chat-send` 动画 feature 的注册、manifest、CSS、消息飞行/增长、发送前视觉快照、替身/隐藏真实消息、动画完成救援、预览卡片及所有专属依赖。
2. 从契约 `prefs.ts`、`constants.ts`、Settings 及本地化文案删除 `chatSend`、`messageEnter`、`MESSAGE_ENTER_*`（仅在确无其他引用时），移除 `ChatSendHandle` 与读取 `isEntering()` 的耦合；在消费方改为依靠**宿主真实消息状态**，而不是编造一个永久 `false` 的假 feature。
3. 留下 `theme` 的气泡背景、圆角、颜色、间距、消息内容样式；不能把“动画删除”误做“气泡删除”。消息提交后由 React/宿主把真实行直接显示，避免额外透明度、位移和遮挡。
4. `features/chat-reveal/` 的 token 流式文字渐显、`chat-fold` 的其他折叠、消息导航、阅读位置管理等如属独立功能继续保留。
5. 验证连续快速发送、文件上传、图片、引用、重新生成、流式插入、长会话在顶部/底部发送、切换会话、发送失败等；不得出现消息短暂消失、两条重复气泡、发送卡住。

### T04. 推理等级进度填充改为 Canvas 2D

**现状**：`effort/slider.ts` 的 `place()` 同时写 `knob.style.translate` 与 `fill.style.width`，CSS 为填充设置了 `width` 过渡；而 `effort/matrix.ts` 已在顶档用 Canvas 绘制点阵并在卡片关闭、不可见、减少动态效果时停帧。

**目标结构**：

```text
effort/slider.ts
  track div (role=slider, tabindex, pointer/keyboard/ARIA 全部保留)
    progress canvas (新：仅负责普通档位填充与过渡像素)
    ticks DOM (保持刻度)
    matrix div > matrix canvas (原有顶档动画继续保留)
    knob DOM (保留 translate/scale 的合成层动画)
  nameSwap DOM / commit 模型等级 (原逻辑保留)
```

1. 建议新建 `features/effort/fill-canvas.ts`，职责只有 `mount / resize / setTarget / draw / pause / dispose`。`slider.ts` 保存数值与提交状态，Canvas 不参与交互、点击或选中逻辑。
2. 把 `fill` DOM 宽度修改改为 `fillCanvas.setTarget(px + knobHalfWidth, {animate, dragging})`；删除 `fill.style.width` 及 `width` transition，`withoutTransition([knob, fill], ...)` 相应只处理真实 DOM 拇指。普通填充在 Canvas 画 26px 高、左端 8px 圆角的色块；比例和尺寸从原轨道几何计算，保持视觉一比一。
3. **只绘制填充，不把 knob 和语义层一起 Canvas 化**。轨道 `role=slider`、`aria-valuemin/max/now/text`、`tabindex`、键盘增减、pointer capture、吸附 commit、Pending Echo 同步逻辑保持原样。
4. 用引擎共享 `requestFrame()` 调度。拖动时每帧合并最新指针坐标，最多绘制一次；停止、卡片关闭、页面隐藏、无变化时不申请下一帧。过渡动画按已有 motion token 的 `duration-move` 和 `ease-glide` 计算；`prefers-reduced-motion` 或 Lite Reduced 动画开关下直接绘最终状态。
5. 采用 `CanvasRenderingContext2D`，`devicePixelRatio` 上限建议 2（与当前 matrix.ts 一致）；只有轨道宽度/缩放/DPR 变化才调整后备画布大小。主题切换时重新读取一次计算后的颜色，禁止每帧 `getComputedStyle` 或 `getBoundingClientRect`。
6. 进度位置、轨道宽度和颜色读取在帧的 read 阶段，画图在 write 阶段；避免画布尺寸每帧重置；选择无抗锯齿闪烁的像素对齐策略。Canvas 可使用 `pointer-events:none`。
7. 顶档保持现有矩阵 Canvas (`matrix.ts`) 且普通填充在顶档透明/隐藏；确保两层不会同时重画或产生视觉叠层。若后续测量证明第二个 Canvas 增加过多内存，可在不改变外观前提下复用顶档渲染器，但**本次以独立小渲染层为低风险基线**。
8. 对比原版：Off/Low/Medium/High/Max、任意不同档位数量、拖动中途离开、反向拖动、回弹、连续改变档位、首次开启、语言切换、亮/暗/DeepSeek 主题、页面缩放 80%/100%/125%/150%、高 DPI、多显示器切换、键盘操作、无推理能力模型。

**性能约束**：Canvas **不天然比合成层 transform 快**。该改造真正可能减少的是 `width` 引起的布局/样式/绘制链；必须通过同一设备的 Performance Trace 验证。若 Canvas 在指定滑块场景明显变差，应保留用户要求的 Canvas 实现但减少无意义重绘、颜色计算和画布分辨率，不以回退为 DOM 动画作为第一选择。

### T05. 删除自绘光标，恢复浏览器原生光标

1. 注销 `features/caret/caret.manifest.ts`，删除 `caret.ts`、`caret-measure.ts`、`caret.css` 及只供本功能使用的测量/预览文件与测试。
2. 删除编辑输入的自绘层、`caret-color:transparent` 接管、Range 几何测量、textarea 镜像、SelectionChange/Focus/Resize/Scroll 监听、DOM 订阅、timer、frame、样式属性与数据标记；确保卸载时不留下隐藏光标的 CSS。
3. 删除设置 `caretMotion`、`CARET_MOTION_OFF / TYPING` 的**独占部分**及动画预览卡片、对应翻译、CSS token（如无其他引用）。共享 `composerComposing()` 或其他组件输入法协调能力保持原样。
4. 光标完全使用浏览器默认渲染，不额外加新的“模拟光标”补丁；验收中文拼音输入法、组合输入取消/提交、快捷键、长文本、多行和编辑器内滚动、粘贴与撤销。

### T06. 跨模块清扫与构建修复

- 检查 `entry.ts`、feature manifests、`core/scheduler.ts`、`contracts/prefs.ts`、`contracts/routes.ts`、`host/routes.ts`、`host/settings.ts`、`scripts/build/`、生成虚拟模块、设置 UI、i18n、README 中是否仍残留被删除功能。
- `rg -n 'createReasoningFold|PeakRateHandle|PEAKRATE_PATH|peakrate-catalog|chatSend|messageEnter|CARET_MOTION|caretMotion|send-flight|fill\.style\.width' packages scripts docs locale` 作为第一轮扫描；**允许仅在变更历史/说明中引用已删除名称，不允许运行代码存在悬空引用**。
- 删除无用 imports、interfaces、CSS、keyframes、常量、图片/音频资源、preview 定时器、测试和构建产物条目；保留被其他功能共享的工具。不能留下永久不开启的空功能，也不要通过吞错误来通过构建。
- 在 Lite 新 README 记录明确功能差异；原版独立继续存在，不能对其仓库作破坏性更改。

### T07. 测试、文档、打包与交付

- 单元/契约测试、编译和 lint 全绿；更新被删除功能的行为测试，同时保留/增强非目标特性的回归测试。
- A/B 的视觉回归必须同时覆盖 Claude / DeepSeek 配色、浅色 / 深色、桌面 / Web、不同缩放和中文 / 英文。视觉变化**仅允许指定动画与进度条内部绘制路径**，其他布局不可出现可观察差异。
- 交付内容：源码仓库、构建产物、npm 安装包或 GitHub `#dist` 发布分支、`UPSTREAM_COMMIT`、修改清单、许可证及 NOTICE、安装/卸载/回退说明、完整测试结果、A/B 性能报告。不得把“执行过构建”当作“已经安装验证”。

## 5. 必须保留的功能清单（防误删）

| 领域       | 必须保持                                                                                                      |
| ---------- | ------------------------------------------------------------------------------------------------------------- |
| 视觉       | Claude/DeepSeek 双品牌、主题色卡与用户自定义配色、浅色/深色、字体与排版、气泡静态样式、背景、导航与自定义图标 |
| 模型与输入 | 供应商/模型菜单、模型描述、推理等级滑块及真实参数提交、输入区、权限选择、发送功能、附件、代码与 Markdown      |
| 会话       | 侧栏、会话搜索、归档/删除、导航、上下文信息、长会话优化、跟随与滚动定位                                       |
| 展示       | 思考正文及宿主原生展开/收起、工具和进程组展示、与思考开合无关的折叠、等待状态效果、回答文字渐显（若原版启用） |
| 统计       | 通用用量、模型基础价格、会话成本、上下文计量等与“峰谷费率时段”独立的能力                                      |
| 其他       | 吉祥物、保留的品牌动画、声音提示、Sodium 渲染引擎（按原许可证）、设置中其他全部选项、统一性能优化机制         |

如遇实际调用关系与此清单冲突，优先保障“其他保留”；对受删除功能影响的共享模块做小范围改造，而不是整模块砍掉。

## 6. 性能提升推算：估算与实测的严格区分

### 6.1 不存在可信的固定百分比

目前**没有在同一台设备上针对这两个构建运行过 Performance Trace**，因此不能给出“必然提升 X% FPS / Y% CPU”的实测结论。特别是上游近版已经做过长会话增量扫描、减少折叠调度、读写阶段分离和顶档点阵 Canvas 优化；若把旧版数据当对照会夸大 Lite 的收益。

各功能影响范围不同：

- **思考开合**：思考行出现/阶段改变时省去观察、排队和模拟点击；长思考/多思考段效果较明显。若用户从不展开思考，则较小。
- **峰谷**：停止周期下载、时间判断、模型行徽标刷新与额外数据常驻，主要收益在模型菜单和 Host 后台，不是日常每帧巨量 CPU。
- **气泡入场**：发送瞬间省去动画、替身追踪、布局测量和定时器；不发送时几乎无收益。
- **进度 Canvas**：只有滑块打开、拖动或过渡时有差异；可减少宽度布局写入，但增加 Canvas 绘制工作，收益可能小、为零或变差。
- **光标**：持续输入、移动光标、长文本和 IME 组合期间减少定位与观察成本；不输入时很小。

### 6.2 计算公式

取相同测试期间**主线程忙碌时间**为 `T0`（原版）、`T1`（Lite）。

- 主线程工作量下降率：`(T0 - T1) / T0 × 100%`
- 同样工作量的处理速率提升：`(T0 / T1 - 1) × 100%`（仅当运行过程确实被相同 CPU 工作量限制时，不能直接等同 FPS）
- 假设删除的四类开销占原版总主线程工作的比例为 `p`，Canvas 替换产生的净额外负担比例为 `c`（负值表示净节省），则 `T1/T0 = 1 - p + c`，下降率 `=p-c`。

**演算示例（纯假设，非观测值）：**在一个包含长思考、输入、发送和滑块交互的混合测试中，假设原版累计忙碌时间恰为 `100.0 秒`；移除思考开合节省 `7.0 秒`、光标 `5.0 秒`、气泡 `4.0 秒`、峰谷 `1.0 秒`；Canvas 替换后净节省 `1.0 秒`。则 Lite `T1=82.0 秒`；主线程忙碌时间下降 `18.0%`；处理速率理论比值提高 `100/82-1≈21.95%`。**这些 7/5/4/1/1 是人为假设，并非源码分析得出的实测耗时。**

### 6.3 场景敏感性区间（工程规划假设，不是保证值）

下表用于制定验收目标和试算可能收益，不代表可直接写进宣传材料：

| 场景                     | 假设的主线程忙碌时间下降区间 | 依据/限制                                              |
| ------------------------ | ---------------------------: | ------------------------------------------------------ |
| 纯阅读或闲置             |                        0%–2% | 删除项目大多不活跃；主要是少量常驻资源与后台任务       |
| 长文本输入、光标频繁移动 |                       5%–18% | 与原版光标测量调用频次和宿主负载强相关                 |
| 多段持续思考/流式显示    |                       7%–25% | 取决于原版自动开合扫描与宿主的相对负担                 |
| 高频连续发送消息         |                       8%–30% | 主要节省飞行/增长动画时间；仅发送瞬间                  |
| 推理滑块连续拖动         |                       -2%–8% | Canvas 不是零成本；负值表示可能比 CSS 宽度填充更费 CPU |

**混合场景加权例**：假设原版主线程忙碌时间的分布是“思考 30%、输入 25%、发送 10%、滑块 5%、阅读/其他 30%”。

- 保守：`0.30×7% + 0.25×5% + 0.10×8% + 0.05×(-2%) + 0.30×0% = 4.05%`。
- 中位假设：`0.30×15% + 0.25×12% + 0.10×20% + 0.05×3% + 0.30×1% = 9.95%`。
- 乐观：`0.30×25% + 0.25×18% + 0.10×30% + 0.05×8% + 0.30×2% = 16.00%`。

因此，在**上述特定任务分布及假定的各场景节省比例成立时**，混合操作的主线程工作量减少约 **4%–16%，中位演算约 10%**。这是**敏感性模型**，不是声称已经验证“新版快 10%”；更不能据此推出系统 CPU、内存、FPS 或模型回复速度相同百分比的提升。

### 6.4 A/B 实测流程（发布前强制）

1. 原版 A 与 Lite B 用**同一上游 commit**、相同 DSH 版本、同一套可复现对话/模型目录/设置/主题/缩放/分辨率/设备，分别独立装载，不能同时启用。
2. 各场景至少 `5` 次正式采样，先预热；ABBA 或 BAAB 交叉执行，避免温度、缓存、后台进程偏差。DevTools CPU 采样/Performance Trace 开启方式完全一致。
3. 每组覆盖：60 秒闲置；60 秒持续思考（真实或录制可重放的同等 DOM 流）；连续输入 1,000 字、光标移动 200 次；连续发送 30 条消息；滑块往返 30 次；长会话 500/2,000 条消息切换；包含模型目录 500/2,000 行时反复开启模型菜单。
4. 主指标：主线程 `Scripting+Rendering+Painting` 总忙碌时间、Long Tasks 总时长和 p95、掉帧比例、输入延迟 p95、滑块拖动 p95 帧耗时。附指标：JS heap（稳定后强制 GC 取值）、DOM 节点数、事件监听器数、Canvas 重绘次数、打包体积（原始与 gzip/brotli）、峰谷网络请求数量。
5. 对 Canvas 单独做 C/D 比较：C 为相同 Lite 代码但保留原填充宽度渲染的基准测试构建，D 为 Canvas 填充；这样才能确认 Canvas 带来的净变化，不与“删除四项功能”混为一谈。
6. 输出每组**原始数据**与中位数、p95、下降率和采样方差。出现负收益必须披露。不得只给 FPS 平均值而不记录掉帧与 CPU。
7. 建议发布门槛（不是当前成绩）：功能回归全绿；混合场景主线程工作量下降优先目标 `≥5%`；长会话主线程忙碌时间不得退化 `>3%`；滑块 p95 帧耗时不得比 C 组退化 `>5%`；Lite 不再有峰谷请求/监听/页面节点；没有原生光标不可见事件。若低于目标，先定位而非硬改结论。

### 6.5 性能不能混为一谈

- UI 主线程忙碌时间下降 ≠ 模型推理速度上升：云端模型 TTFT/token/s 基本不因主题代码变化。
- 打包体积下降 ≠ 内存占用同比下降：保留的图片、字体、Sodium、页面内容可能是主要体积/内存来源。
- `requestAnimationFrame` 次数下降 ≠ FPS 必然上升：尤其在没有瓶颈时，FPS 已稳定锁在 60/120Hz。
- 若原版的 `chatSend`、光标、峰谷已经手动关闭，Lite 对这些已关闭路径的运行时增益接近零；代码体积和基础维护成本仍可下降。

## 7. 验收清单

### 7.1 必须删除

- [ ] 不再由插件自动展开/收起思考，且 `createReasoningFold` 的代码与关联监听不存在。
- [ ] `/peakrate` 路由、峰谷目录、峰谷缓存读写/轮询、徽标、设置项和构建引用全部不存在。
- [ ] 用户气泡飞行/增长动画不执行；相关代替节点、快照、事件监听和救援定时器不存在。
- [ ] 自绘光标节点、透明原生光标 CSS、光标测量及设置全部不存在。
- [ ] 推理进度填充不再每帧写 `fill.style.width` / CSS `transition: width`。

### 7.2 必须保留

- [ ] 宿主原生思考手动展开/收起、完整思考文本、其他消息/流程折叠正常。
- [ ] 发送、模型选择、推理等级提交、费用及用量统计（除峰谷外）正常。
- [ ] 滑块 Canvas 外观与原版一致；键盘、ARIA、Pointer、吸附及顶档点阵正常。
- [ ] 光标原生可见；中文输入法及全部编辑操作正常。
- [ ] 配色、深浅色、布局、权限、导航、吉祥物、长会话优化等“其他”能力无可观察退化。
- [ ] 两插件安装身份隔离；互斥激活明确；配置/路由不会覆盖原版。
- [ ] 许可证、NOTICE、分发限制全部保留且正确。

### 7.3 性能与交付

- [ ] 真实 A/B 性能报告具有原始 trace、同条件说明和明确的提升/退化百分比。
- [ ] `npm run build`、`npm run lint`、`npm test`、`npm run verify -- --full`（适用时）通过。
- [ ] 可在目标 DSH 网页端/桌面端分别安装、激活、卸载；源码、发布包、版本固定信息和安装说明完整。

## 8. 建议的 Agent 执行指令（可直接复制）

> 以 `https://github.com/Nwflower/dsh-claude-style` 为基础开发独立插件 `dsh-claude-style-lite`，严格执行《DSH Claude Style Lite —— 减负改造设计与实施书 V1.0》。先克隆并固定上游 commit、建立 A/B 基线、读取 `AGENTS.md`、`docs/ARCHITECTURE.md`、关联 ADR、相关 feature manifest 和全部调用链；**完成全部五项功能更改，不分期交付**。
>
> 唯一允许删除的产品功能是：① 插件自行控制思考展开/收起及专属逻辑；② 峰谷费率计算/更新/徽标及专属逻辑；③ 用户消息气泡入场/发送动画及专属逻辑；④ 自绘光标动画及专属逻辑。推理滑块必须保留全部交互，仅把普通进度填充宽度动画改由 Canvas 2D 按需绘制。**任何其他功能、样式、模型选择、会话行为、统计或性能优化不得删除或静默降级**。
>
> 特别注意：不得直接删除整个 `chat-fold`；顶档点阵已经是 Canvas；不能把 `/prices` 和 `/session-cost` 误判为峰谷模块；不能把真实发送逻辑当作发送动画删除；不能隐藏宿主原生光标；不能删除仍被 IME 或其他功能使用的 shared utility。
>
> 完成全仓引用扫描、代码删除、UI 设置及翻译清理、宿主 route 清理、构建清理、独立插件身份迁移、自动化测试、视觉回归、A/B 性能实测、文档与可安装包。交付详细改动文件列表、删除/保留映射表、测试证据、性能原始数据、各指标真实提升百分比和适用限制。发现依赖冲突时优先用最小改动保留其他功能，并在实施报告中记录，不得以禁用整个模块替代精确删除。

## 9. 上游可核查源码及资料

- 源码和 README：<https://github.com/Nwflower/dsh-claude-style>
- 架构：<https://github.com/Nwflower/dsh-claude-style/blob/master/docs/ARCHITECTURE.md>
- 开发规范：<https://github.com/Nwflower/dsh-claude-style/blob/master/AGENTS.md>
- 更新日志：<https://raw.githubusercontent.com/Nwflower/dsh-claude-style/master/docs/CHANGELOG.md>
- 自动思考开合：<https://raw.githubusercontent.com/Nwflower/dsh-claude-style/master/packages/client/src/features/chat-fold/reasoning-fold.ts>
- 折叠功能入口：<https://raw.githubusercontent.com/Nwflower/dsh-claude-style/master/packages/client/src/features/chat-fold/chat-fold.ts>
- 峰谷功能：<https://raw.githubusercontent.com/Nwflower/dsh-claude-style/master/packages/client/src/features/peakrate/peakrate.ts>
- 峰谷宿主：<https://raw.githubusercontent.com/Nwflower/dsh-claude-style/master/packages/host/src/peakrate.ts>
- 消息发送动画：<https://raw.githubusercontent.com/Nwflower/dsh-claude-style/master/packages/client/src/features/chat-send/send-flight.ts>
- 自绘光标：<https://raw.githubusercontent.com/Nwflower/dsh-claude-style/master/packages/client/src/features/caret/caret.ts>
- 滑块本体：<https://raw.githubusercontent.com/Nwflower/dsh-claude-style/master/packages/client/src/features/effort/slider.ts>
- 滑块点阵 Canvas：<https://raw.githubusercontent.com/Nwflower/dsh-claude-style/master/packages/client/src/features/effort/matrix.ts>
- 滑块 CSS：<https://raw.githubusercontent.com/Nwflower/dsh-claude-style/master/packages/client/src/features/effort/effort-picker.css>
- 设置表：<https://raw.githubusercontent.com/Nwflower/dsh-claude-style/master/packages/contracts/src/prefs.ts>
- 私有路由契约：<https://raw.githubusercontent.com/Nwflower/dsh-claude-style/master/packages/contracts/src/routes.ts>

---

**实施完成的判定**：新插件可独立安装运行；四项指定功能的实际执行逻辑及其独占依赖已从发布产物消失；推理滑块视觉进度由 Canvas 绘制，且仍能正确控制 DSH 模型；所有其他原有能力保持；A/B 报告给出真实性能数据。**本文件是设计与实施依据，不是声称已完成源码改造或测得性能提升。**
