# DSH Claude Style Lite 减负改造修改计划 v1.0

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 以固定上游快照 `8cafcacd5aa574faa75b1912b8934bede7936b73` 派生独立插件 `dsh-claude-style-lite`，完成实施书 R1–R7 与 T00–T07 的全部改造、测试、文档、打包和 A/B 验收。

**Architecture:** 上游是双半边 DSH 主题插件：浏览器半边通过 `apply(ctx)` 安装 features，宿主半边注册私有路由和设置，契约包共享类型与常量，engine 提供统一观察总线与帧管线。Lite 保留该架构，只删除四项功能及其独占依赖，并把推理滑块普通填充改为 Canvas 2D；新增独立包名、路由前缀、设置命名空间和发布材料。

**Tech Stack:** Node.js 24（上游 CI；本地至少 22 LTS）、npm workspaces、TypeScript 7、esbuild 0.28、Vitest 5、Playwright 1.63、Canvas 2D、DSH Cordis 插件运行时。

**Design:** `docs/superpowers/specs/2026-11-12-dsh-claude-style-lite-design.md`

## Global Constraints

- 上游提交固定为 `8cafcacd5aa574faa75b1912b8934bede7936b73`。
- 上游版本为 `0.20.3`；Lite 起始版本为 `0.1.0`。
- DSH 最低版本沿用 `>=0.2.2-rc.2`；实施前重新核对固定 manifest。
- npm 包名 `dsh-claude-style-lite`；发布前再次核对 registry。
- 路由前缀 `/dsh-claude-style-lite`。
- 设置命名空间 `dsh-claude-style-lite`。
- skin id `claude-style-lite`；wiring id `ui-skin-claude-style-lite`。
- `$DSH_HOME` 字体目录 `dsh-claude-style-lite/fonts/`。
- 保留 `data-dsh-claude-style` 与 `dsh-claude-*` 类名。
- 保留 `@dsh-claude-style/*` 与 `virtual:dsh-claude-style/*` 源码别名。
- 不删除 `chat-fold`、`effort`、`model`、`chat-follow`、`chat-reveal`。
- 不删除 `shared/composer-caret.ts`。
- 不删除 `fold-toggle.ts`、`fold-glide.ts`、`message-fold.ts`、`process-fold.ts`、`process-summary.ts`。
- 不删除 `/prices`、`/session-cost`、`/usage`。
- 不手改 `lib/`。
- 不把 Anthropic 字体打进 npm。
- 保留 MIT、Sodium PolyForm Shield、NOTICE、THIRD_PARTY_NOTICES、OFL。
- 性能结论必须来自实测；未经实测不得写具体提升百分比。
- 每个 Task 结束时提交一次，提交信息使用 Conventional Commits，中文标题与正文。
- 所有 DSH 运行只允许 `dsh web`（`dsh --profile web`）隔离实例。
- 不得读写用户真实 `$HOME/.dsh` 或 `$HOME/.agents`。
- 所有测试使用 `DSH_HOME`、`DSH_AGENTS_HOME` 指向 `.debug/runs/dsh-web/<run-id>/`。
- 监听地址固定 `127.0.0.1`，端口固定 `0`，并传 `--no-open`。
- 构建也必须在隔离 `DSH_HOME` 下执行，因为 `scripts/build/build.mjs` 会读取 `$DSH_HOME/profiles`。
- 每次真实宿主验证前后运行 `local-home-guard.mjs`；指纹不一致即失败。

### 每次运行前的隔离环境

在 Windows PowerShell 中：

```powershell
$Root = ".debug/runs/dsh-web/$(Get-Date -Format yyyyMMdd-HHmmss)"
New-Item -ItemType Directory -Force "$Root/home", "$Root/agents", "$Root/workspace" | Out-Null
$env:DSH_HOME = (Resolve-Path "$Root/home").Path
$env:DSH_AGENTS_HOME = (Resolve-Path "$Root/agents").Path
$env:DSH_TELEMETRY_DISABLED = "1"
$env:npm_config_store_dir = (Resolve-Path "$Root").Path + "\pnpm-store"
```

在 Git Bash 中：

```bash
ROOT=".debug/runs/dsh-web/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$ROOT/home" "$ROOT/agents" "$ROOT/workspace"
export DSH_HOME="$(pwd)/$ROOT/home"
export DSH_AGENTS_HOME="$(pwd)/$ROOT/agents"
export DSH_TELEMETRY_DISABLED=1
export npm_config_store_dir="$(pwd)/$ROOT/pnpm-store"
```

这些变量只对当前终端会话及其子进程生效：

- 不写用户环境变量。
- 不修改 PowerShell Profile。
- 不修改 `.env`。
- 不删除或写入真实 `~/.dsh` 与 `~/.agents`。

每次运行前验证：

```bash
printf '%s\n' "$DSH_HOME" "$DSH_AGENTS_HOME"
```

Expected: 两个路径都包含 `.debug/runs/dsh-web/`。

---

## 文件结构总览

### 新建

```text
UPSTREAM_COMMIT
UPSTREAM_VERSION
LITE_VERSION
docs/INSTALL.md
docs/AB-PERFORMANCE.md
docs/CHANGES-FROM-UPSTREAM.md
docs/superpowers/specs/2026-11-12-dsh-claude-style-lite-design.md
docs/superpowers/plans/2026-11-12-dsh-claude-style-lite-implementation.md
packages/client/src/features/effort/fill-canvas.ts
packages/host/data/pricing-calendar.json
scripts/data/pricing-calendar.mjs
packages/testing/specs/logic/effort-picker/fill-canvas.spec.ts
packages/testing/specs/behaviour/effort-picker/canvas-fill.spec.mjs
packages/testing/specs/behaviour/reasoning-display/manual-fold.spec.mjs
packages/testing/specs/behaviour/composer-caret/native.spec.mjs
```

### 删除

```text
packages/client/src/features/peakrate/          （整个目录）
packages/client/src/features/chat-send/         （整个目录）
packages/client/src/features/caret/             （整个目录）
packages/client/src/features/chat-fold/reasoning-fold.ts
packages/host/src/peakrate.ts
packages/host/src/peakrate-catalog.ts
packages/host/data/peakrate-catalog.json
packages/contracts/src/peakrate.ts
scripts/build/peakrate-catalog.mjs
scripts/data/fetch-peakrate-catalog.mjs
packages/testing/specs/logic/billing-clock/     （整个目录）
packages/testing/specs/logic/send-flight/       （整个目录）
packages/testing/smoke/probe/model-meter.js
packages/testing/smoke/probe/chat-send.js
packages/testing/smoke/probe/chat-caret.js
packages/testing/faults/patches/chat-send-14ddf739.patch
packages/testing/faults/patches/chat-send-27603238.patch
```

### 修改

```text
package.json
package-lock.json
skin.json
cordis.patch.yml
locale/zh.json
locale/en.json
README.md
README.en.md
CONTRIBUTING.md
LICENSE
docs/NOTICE.md
docs/THIRD_PARTY_NOTICES.md
docs/ARCHITECTURE.md
docs/DEBUGGING.md
packages/contracts/src/package.ts
packages/contracts/src/routes.ts
packages/contracts/src/prefs.ts
packages/client/src/constants.ts
packages/client/src/core/scheduler.ts
packages/client/src/pure.ts
packages/client/src/features/chat-fold/chat-fold.ts
packages/client/src/features/chat-fold/chat-fold.manifest.ts
packages/client/src/features/chat-fold/reasoning-stream.ts
packages/client/src/features/chat-fold/fold-motion.css
packages/client/src/features/chat-fold/message-fold.ts
packages/client/src/features/chat-send/（删除后无修改）
packages/client/src/features/chat-follow/chat-follow.ts
packages/client/src/features/chat-follow/chat-follow.manifest.ts
packages/client/src/features/model/model-picker.ts
packages/client/src/features/model/rows.ts
packages/client/src/features/model/model-picker.manifest.ts
packages/client/src/features/model/model-copy.ts
packages/client/src/features/model/sub-menu.ts
packages/client/src/features/effort/slider.ts
packages/client/src/features/effort/effort-picker.css
packages/client/src/features/settings/settings-cards.css
packages/client/src/theme/chrome.css
packages/client/src/theme/tokens.json
packages/client/src/shared/motion.css
packages/host/src/routes.ts
packages/host/src/prices.ts
packages/host/src/index.ts
packages/host/src/settings.ts
scripts/build/build.mjs
scripts/data/fetch-prices.mjs
.github/workflows/data.yml
packages/testing/smoke/cases/settings.mjs
packages/testing/smoke/cases/peer.mjs
packages/testing/smoke/cases/model.mjs
packages/testing/smoke/cases/chat.mjs
packages/testing/smoke/host-half.mjs
packages/testing/smoke/page.mjs
packages/testing/smoke/stand-in/host-fetch.js
packages/testing/lane.mjs
packages/testing/e2e.mjs
packages/testing/scenarios.mjs
packages/testing/scenarios/importance-audit.mjs
packages/testing/scenarios/reasoning-stream.mjs
packages/testing/specs/behaviour/reasoning-display/choice.spec.mjs
packages/testing/specs/behaviour/model-picker/search.spec.mjs
packages/testing/specs/logic/preferences/stored-values.spec.ts
packages/testing/faults/patches/chat-follow-962c32df.patch
packages/testing/faults/patches/chat-fold-4d2aab06.patch
packages/testing/data/element-collections.json
packages/testing/data/document-lookups.json
packages/testing/data/importance-ledger.json
packages/testing/data/importance-unreachable.json
packages/testing/data/check-numbers.json
packages/testing/data/skin-literals.json
packages/testing/data/appearance.json
packages/testing/data/surface.json
```

---

## 实施顺序

```text
Task 1  冻结基线、初始化 Lite 仓库、建立隔离测试环境
Task 2  改造 dsh-web 隔离启动器与本地零影响门禁
Task 3  独立插件身份与版本固定
Task 4  R1 删除思考自动开合，解耦 reasoning-stream
Task 5  R2 拆除峰谷模块，下沉价格日历
Task 6  R3 删除消息气泡入场动画
Task 7  R4 推理滑块 Canvas 填充
Task 8  R5 删除自绘光标
Task 9  R6/R7 身份、许可证、发布材料复核
Task 10  T06 跨模块清扫与构建修复
Task 11  测试与账本更新
Task 12  视觉回归
Task 13  A/B 与 C/D 性能实测
Task 14  打包、安装、卸载、回退验证
Task 15  最终交付与文档冻结
```

---

### Task 1: 冻结基线、初始化 Lite 仓库、建立隔离测试环境

**Files:**
- Create: `.debug/baseline/environment.md`
- Create: `.debug/baseline/baseline-commands.md`
- Create: `.debug/baseline/dependency-inventory.md`
- Create: `UPSTREAM_COMMIT`
- Create: `UPSTREAM_VERSION`
- Create: `LITE_VERSION`
- Modify: `.gitignore`（只追加 `.debug/baseline/`，如已忽略则不改）

**Interfaces:**
- Consumes: `dsh-claude-style-master.zip`
- Produces: 固定上游 Git 历史、环境记录、依赖清单、原版 A 构建

- [ ] **Step 1: 解压并初始化 Git**

```bash
mkdir -p .debug/baseline
unzip -q dsh-claude-style-master.zip -d .debug/baseline
cd .debug/baseline/dsh-claude-style-master
git init
git add -A
git commit -m "chore: freeze upstream dsh-claude-style 0.20.3"
```

- [ ] **Step 2: 记录上游提交与版本**

```bash
git rev-parse HEAD
```

Expected: `8cafcacd5aa574faa75b1912b8934bede7936b73`

在仓库根写入：

```text
UPSTREAM_COMMIT:
8cafcacd5aa574faa75b1912b8934bede7936b73

UPSTREAM_VERSION:
0.20.3

LITE_VERSION:
0.1.0
```

- [ ] **Step 3: 记录环境**

在 `.debug/baseline/environment.md` 写入：

```text
DSH:
Node:
npm:
OS:
Browser:
GPU:
Scale:
Refresh rate:
```

执行：

```bash
node --version
npm --version
dsh --version
```

Expected: 三条命令都有输出。若 `node` 或 `npm` 缺失，先安装 Node 24（与上游 CI 一致；至少 22 LTS）；若 `dsh` 缺失，在测试机执行，不跳过。

- [ ] **Step 4: 安装依赖并记录基线**

先创建隔离根：

```bash
export DSH_TEST_ROOT=".debug/runs/dsh-web/baseline-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$DSH_TEST_ROOT/home" "$DSH_TEST_ROOT/agents" "$DSH_TEST_ROOT/workspace"
export DSH_HOME="$(pwd)/$DSH_TEST_ROOT/home"
export DSH_AGENTS_HOME="$(pwd)/$DSH_TEST_ROOT/agents"
export DSH_TELEMETRY_DISABLED=1
```

说明：

- 这些变量只作用于当前 shell 和由它启动的子进程。
- 不修改 Windows 用户环境、PowerShell Profile 或 `.env`。
- 不删除、不重命名、不写入真实 `~/.dsh` 与 `~/.agents`。

安装与基线：

```bash
npm ci
npm run build
npm run lint
npm test
npm run verify -- --full
```

Expected:

- `npm ci` 成功。
- `npm run build` 成功。
- `npm run lint` 成功，或记录已有失败。
- `npm test` 成功，或记录已有失败。
- `npm run verify -- --full` 成功，或记录已有失败。

把每条命令的退出码、耗时、`DSH_HOME`、`DSH_AGENTS_HOME` 和失败摘要写入 `.debug/baseline/baseline-commands.md`。

运行 `npm run verify -- --full` 前先执行：

```bash
node packages/testing/local-home-guard.mjs .debug/runs/dsh-web/fingerprint.json --before
```

运行后执行：

```bash
node packages/testing/local-home-guard.mjs .debug/runs/dsh-web/fingerprint.json
```

Expected: `local homes unchanged (...)`。

如果 `local-home-guard.mjs` 尚不存在，先按 Task 2 实现；Task 1 不跳过该门禁。

- [ ] **Step 5: 生成依赖清单**

```bash
rg -n 'createReasoningFold|PeakRateHandle|PEAKRATE_PATH|peakrate-catalog|chatSend|messageEnter|CARET_MOTION|caretMotion|send-flight|fill\.style\.width' packages scripts .github locale README.md README.en.md docs > .debug/baseline/dependency-inventory.txt
```

Expected: 输出覆盖实施书 5 组功能的主要落点。

把分类写入 `.debug/baseline/dependency-inventory.md`：

```text
可删：
被其他功能引用：
公共机制不可删：
```

- [ ] **Step 6: 建立原版 A 构建**

```bash
cd .debug/baseline/dsh-claude-style-master
npm run build
cp -R lib .debug/baseline/lib-upstream
```

Expected: `.debug/baseline/lib-upstream/client.js` 存在。

- [ ] **Step 7: 提交基线文档**

```bash
git add UPSTREAM_COMMIT UPSTREAM_VERSION LITE_VERSION
git commit -m "chore: 固定 Lite 上游基线与测试环境"
```

Expected: 提交成功。`.debug/` 不进入版本库。

---

### Task 2: 改造 dsh-web 隔离启动器与本地零影响门禁

**Files:**
- Modify: `packages/testing/dsh-web.mjs`
- Create: `packages/testing/local-home-guard.mjs`
- Modify: `packages/testing/e2e.mjs`
- Modify: `packages/testing/host-snapshot.mjs`
- Modify: `docs/DEBUGGING.md`
- Modify: `CONTRIBUTING.md`

**Interfaces:**
- Consumes: `packages/testing/dsh-web.mjs` 的 `start()`、`openPage()`；上游 `apps/cli/tests/web-auth.e2e.ts` 的 `cleanEnvironment()` 隔离做法
- Produces: `start()` 每次使用独立 run-id 目录，同时设置 `DSH_HOME` 与 `DSH_AGENTS_HOME`，固定 `127.0.0.1:0` 与 `--no-open`，不继承凭据、浏览器、SSH 变量；`local-home-guard.mjs` 提供真实 home 的运行前后指纹

- [ ] **Step 1: 证明现状缺口**

```bash
rg -n 'DSH_AGENTS_HOME' packages/testing/dsh-web.mjs
```

Expected: 无输出，说明当前没有隔离 `~/.agents`。

```bash
rg -n 'dsh plugin --profile' packages/testing/dsh-web.mjs
```

Expected: 命中 `{ env: { ...process.env, DSH_HOME: home } }`，说明插件安装会继承用户环境。

```bash
rg -n -- '--port|--no-open|--profile' packages/testing/dsh-web.mjs | head
```

Expected: 命中 `--port 0` 与 `--no-open`，这两项已经正确，保留。

- [ ] **Step 2: 新建 local-home-guard.mjs**

新建 `packages/testing/local-home-guard.mjs`：

```js
#!/usr/bin/env node
/**
 * local-home-guard.mjs — fingerprint the reader's real DSH homes before and
 * after a test run, so a leak is evidence rather than a suspicion.
 *
 * The scan is read-only. Symbolic links record their target and are not
 * followed: a `link:` plugin points at a checkout, which is the test tree,
 * not reader state.
 */
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/** The two homes a run must not touch. */
function targets() {
  return {
    dsh: process.env.LOCAL_DSH_HOME ?? path.join(os.homedir(), '.dsh'),
    agents: process.env.LOCAL_DSH_AGENTS_HOME ?? path.join(os.homedir(), '.agents'),
  }
}

/** One file's size, mtime and content hash; symlinks record their target only. */
function fileFact(file) {
  const stat = fs.lstatSync(file, { throwIfNoEntry: false })
  if (stat === undefined) return null
  if (stat.isSymbolicLink()) return { link: fs.readlinkSync(file) }
  if (!stat.isFile()) return { mode: stat.mode, size: stat.size, mtimeMs: stat.mtimeMs }
  const hash = createHash('sha256').update(fs.readFileSync(file)).digest('hex')
  return { mode: stat.mode, size: stat.size, mtimeMs: stat.mtimeMs, hash }
}

/** Every path under one root, keyed by its path relative to that root. */
function scan(root) {
  if (!fs.existsSync(root)) return { root, exists: false, files: {} }
  const files = {}
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isSymbolicLink()) {
        files[path.relative(root, full)] = fileFact(full)
        continue
      }
      if (entry.isDirectory()) {
        walk(full)
        continue
      }
      files[path.relative(root, full)] = fileFact(full)
    }
  }
  walk(root)
  return { root, exists: true, files }
}

/** The fingerprint a before/after pair compares. */
export function fingerprint() {
  const target = targets()
  return { at: new Date().toISOString(), dsh: scan(target.dsh), agents: scan(target.agents) }
}

/** Differences between two fingerprints, as readable lines; [] when nothing moved. */
export function differences(before, after) {
  const out = []
  for (const name of ['dsh', 'agents']) {
    const left = before[name]
    const right = after[name]
    if (left.exists !== right.exists) {
      out.push(`${name}: exists ${left.exists} -> ${right.exists}`)
      continue
    }
    const keys = new Set([...Object.keys(left.files), ...Object.keys(right.files)])
    for (const key of [...keys].sort()) {
      const a = JSON.stringify(left.files[key])
      const b = JSON.stringify(right.files[key])
      if (a !== b) out.push(`${name}/${key}: ${a} -> ${b}`)
    }
  }
  return out
}

if (import.meta.main) {
  const out = process.argv[2]
  if (out === undefined) throw new Error('usage: local-home-guard.mjs <fingerprint.json> [--before]')
  const text = JSON.stringify(fingerprint(), null, 2)
  const nl = String.fromCharCode(10)
  if (process.argv.includes('--before')) {
    fs.mkdirSync(path.dirname(out), { recursive: true })
    fs.writeFileSync(out, text + nl)
  } else {
    const prior = JSON.parse(fs.readFileSync(out, 'utf8'))
    const moved = differences(prior, JSON.parse(text))
    if (moved.length > 0) throw new Error('local home changed during the run:' + nl + moved.join(nl))
    console.log(`local homes unchanged (${prior.dsh.root}, ${prior.agents.root})`)
  }
}
```

- [ ] **Step 3: 在 dsh-web.mjs 中加入隔离环境**

`packages/testing/dsh-web.mjs` 不需要新增 Node 内置模块导入；现有 `fs` 与 `path` 足够。

新增：

```js
/** The run's own directory: every scratch home, npm config and log lives under it. */
function runRoot(home) {
  const id = `${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}`
  return path.join(home, id)
}

/** The environment every `dsh` child starts from: reader credentials and homes never cross. */
function isolatedEnv(root, extra = {}) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) =>
    !/(?:KEY|SECRET|TOKEN|PASSWORD)/iu.test(name)
    && !name.toUpperCase().startsWith('DSH_')
    && !['BROWSER', 'SSH_CONNECTION', 'SSH_TTY', 'NODE_OPTIONS', 'NODE_PATH'].includes(name)))
  const npmrc = path.join(root, 'npmrc')
  if (!fs.existsSync(npmrc)) fs.writeFileSync(npmrc, '')
  return {
    ...env,
    DSH_HOME: path.join(root, 'home'),
    DSH_AGENTS_HOME: path.join(root, 'agents'),
    DSH_TELEMETRY_DISABLED: '1',
    npm_config_userconfig: npmrc,
    npm_config_store_dir: path.join(root, 'pnpm-store'),
    NODE_NO_WARNINGS: '1',
    ...extra,
  }
}
```

删除 `dsh-web.mjs` 中所有 `env: { ...process.env, DSH_HOME: home }`，并在 `start()` 开头、任何 `provisionHome()` 之前改为：

```js
const parent = path.resolve(options.home ?? DEFAULT_HOME)
const root = runRoot(parent)
const home = path.join(root, 'home')
const agents = path.join(root, 'agents')
fs.mkdirSync(home, { recursive: true })
fs.mkdirSync(agents, { recursive: true })
const env = isolatedEnv(root)
```

`provisionHome(home)`、`ensureWorkspace(home)`、字体落点、profile 层、overlay 文件全部继续使用这个新的 `home`；不要把 `parent` 传给它们。

插件安装改为：

```js
run(`dsh plugin --profile ${profile} add "${ROOT}"`, { env })
for (const spec of options.plugins ?? []) run(`dsh plugin --profile ${profile} add ${spec}`, { env })
```

overlay 路径改为：

```js
const overlay = path.join(root, `${profile}.lane.patch.yml`)
```

启动改为：

```js
const launchEnv = isolatedEnv(root, options.env)
launchEnv.DSH_WEB_LIFELINE = '1'
launchEnv.NODE_OPTIONS = `--require "${LIFELINE.split(path.sep).join('/')}"`
const command = [`dsh --profile ${profile} --patch "${overlay}" --host 127.0.0.1 --port ${port} --no-open`, ...options.args ?? []].join(' ')
const child = spawn(command, { env: launchEnv, stdio: ['pipe', 'pipe', 'pipe'], shell: true })
```

原有 `const child = spawn(command, { env, ... })` 必须删除，不能重复声明。

停止逻辑必须只按本测试子进程的 PID 终止：

```js
const stop = () => {
  if (child.exitCode !== null || child.signalCode !== null) return
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
  else child.kill('SIGTERM')
}
```

禁止 `taskkill /IM dsh.exe`、`pkill dsh` 或按 Electron 进程名终止，否则可能影响用户正在使用的 DSH。

把 `start()` 的返回值改为：

```js
return { url, root, home, agents, stop, exited: ended }
```

- [ ] **Step 4: 固定端口与浏览器边界**

`start()` 的默认值保持：

```js
const port = options.port ?? 0
```

在 `start()` 中校验：

```js
if (port !== 0) throw new Error("dsh-web tests use port 0; a fixed port could take the reader's 3080")
```

`openPage()` 保持不变：它调用 `newContextOn()` 创建一次性 context，不设置 `userDataDir`。

在 `start()` 的文档注释中写明：

```text
The host listens on 127.0.0.1 and an OS-assigned port. It never opens the
reader's browser. DSH_HOME, DSH_AGENTS_HOME, the pnpm store and npm userconfig
all live under the run's own root; the reader's home is never read or written.
```

- [ ] **Step 5: 让 e2e 与 snapshot 接受 run 根**

`packages/testing/e2e.mjs`：

- `workerHomes()` 继续以 `--home` 为父目录。
- 每个 worker 的 run root 由 `dsh-web.mjs` 创建，不再复用固定 home。
- 失败截图与 trace 写入 `runsPath(ROOT, 'e2e', runId)`。

`packages/testing/host-snapshot.mjs`：

- 同样使用隔离 `DSH_HOME` 与 `DSH_AGENTS_HOME`。
- 不读取用户真实 home。

- [ ] **Step 6: 启动前记录真实 home 指纹**

在 `packages/testing/e2e.mjs` 主流程开头执行：

```js
import { fingerprint, differences } from './local-home-guard.mjs'

const before = fingerprint()
```

在成功与失败清理后执行：

```js
const moved = differences(before, fingerprint())
if (moved.length > 0) throw new Error(`the run touched a reader home: ${JSON.stringify(moved)}`)
```

- [ ] **Step 7: 运行隔离启动器自检**

```bash
node packages/testing/local-home-guard.mjs .debug/runs/dsh-web/fingerprint.json --before
node packages/testing/dsh-web.mjs --port 0
```

Expected:

- 启动器打印 `dsh web: http://127.0.0.1:<port>/?token=...`。
- 打印的 `DSH_HOME` 位于 `.debug/runs/dsh-web/` 下。
- 不打开用户浏览器。

停止后执行：

```bash
node packages/testing/local-home-guard.mjs .debug/runs/dsh-web/fingerprint.json
```

Expected: `local homes unchanged (...)`。

- [ ] **Step 8: 验证端口与进程边界**

```bash
netstat -ano | findstr ':3080'
tasklist | findstr /i "dsh electron"
```

Expected:

- 测试前后 3080 监听状态相同。
- 不新增持久的 `dsh web` 子进程。
- 只允许测试进程 PID 存在于运行期间。

- [ ] **Step 9: 更新 DEBUGGING.md 与 CONTRIBUTING.md**

`docs/DEBUGGING.md` 写明：

```text
真实宿主测试只使用 `node packages/testing/dsh-web.mjs` 或 `node packages/testing/e2e.mjs`。
它们每次都创建 `.debug/runs/dsh-web/<run-id>/` 下的 DSH_HOME、DSH_AGENTS_HOME、pnpm store 和 npmrc。
不要用 `dsh web` 直接连到自己的 `~/.dsh`。
```

`CONTRIBUTING.md` 写明：

```text
Never test against the reader's `~/.dsh` or `~/.agents`.
Use the scratch dsh-web launcher; it binds 127.0.0.1:0, passes --no-open and
sets both DSH_HOME and DSH_AGENTS_HOME under `.debug/runs/dsh-web/`.
```

- [ ] **Step 10: 提交**

```bash
git add packages/testing/dsh-web.mjs packages/testing/local-home-guard.mjs packages/testing/e2e.mjs packages/testing/host-snapshot.mjs docs/DEBUGGING.md CONTRIBUTING.md
git commit -m "test: 隔离 dsh-web 测试环境并守卫本地 DSH 配置"
```

---

### Task 3: 独立插件身份与版本固定

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `skin.json`
- Modify: `cordis.patch.yml`
- Modify: `locale/zh.json`
- Modify: `locale/en.json`
- Modify: `packages/contracts/src/package.ts`
- Modify: `packages/contracts/src/routes.ts`
- Modify: `packages/client/src/constants.ts`
- Modify: `packages/testing/smoke/cases/_shared.mjs`
- Modify: `README.md`
- Modify: `README.en.md`
- Modify: `CONTRIBUTING.md`
- Create: `docs/INSTALL.md`

**Interfaces:**
- Consumes: Task 1 的 `UPSTREAM_COMMIT`、`UPSTREAM_VERSION`、`LITE_VERSION`
- Produces: `PACKAGE_NAME = 'dsh-claude-style-lite'`、`ROUTE_PREFIX = '/dsh-claude-style-lite'`、独立 skin 与 locale

- [ ] **Step 1: 写失败检查**

```bash
rg -n '"name": "dsh-claude-style"' package.json
rg -n "PACKAGE_NAME = 'dsh-claude-style'" packages/contracts/src/package.ts
rg -n "ROUTE_PREFIX = '/dsh-claude-style'" packages/contracts/src/routes.ts
```

Expected: 三条都命中。当前仍是上游身份。

- [ ] **Step 2: 修改 package.json**

以确定后的 Lite 仓库地址为准。本计划假定：

```text
REPOSITORY_OWNER: guojianlin
REPOSITORY_NAME: dsh-claude-style-lite
```

Task 14 发布前必须用 `git remote get-url origin` 核对；不一致时同步修改 `package.json`、`README` 和 `constants.ts`，不要留下占位地址或错误链接。

把以下字段改为：

```json
{
  "name": "dsh-claude-style-lite",
  "description": "Lite fork of dsh-claude-style: Claude Code Desktop theme without automatic reasoning folds, peak-rate meter, sent-message entrance animations or drawn caret",
  "version": "0.1.0",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/guojianlin/dsh-claude-style-lite.git"
  },
  "homepage": "https://github.com/guojianlin/dsh-claude-style-lite#readme",
  "bugs": {
    "url": "https://github.com/guojianlin/dsh-claude-style-lite/issues"
  },
  "author": "Nwflower (upstream); dsh-claude-style-lite maintainers"
}
```

`dsh.engines.dsh` 保持：

```json
"dsh": ">=0.2.2-rc.2"
```

`files` 保持上游，但删除构建后不存在的条目时必须在 Task 5 同步处理。

- [ ] **Step 3: 修改 package-lock.json**

只改两处根对象：

```text
顶层 name -> dsh-claude-style-lite
顶层 version -> 0.1.0
packages[""].name -> dsh-claude-style-lite
packages[""].version -> 0.1.0
```

不要运行 `npm install` 来顺手升级依赖。改完后执行：

```bash
npm install --package-lock-only --ignore-scripts
git diff -- package-lock.json
```

Expected: 只出现顶层与 `packages[""]` 的 `name` / `version` 四个值变化；若出现任何依赖版本漂移，不保留本次 lock 变更，回到原始 `package-lock.json` 后只手工改这四个值：

```text
顶层 name: dsh-claude-style-lite
顶层 version: 0.1.0
packages[""].name: dsh-claude-style-lite
packages[""].version: 0.1.0
```

- [ ] **Step 4: 修改 contracts 身份**

`packages/contracts/src/package.ts`：

```ts
/** Shared package identity for settings, stylesheets, host storage and logs. */
export const PACKAGE_NAME = 'dsh-claude-style-lite'
```

`packages/contracts/src/routes.ts`：

```ts
export const ROUTE_PREFIX = '/dsh-claude-style-lite'
```

- [ ] **Step 5: 修改客户端样式与设置 ID**

`packages/client/src/constants.ts`：

```ts
export const STYLE_ID = 'dsh-claude-style-lite-style'
export const SURFACE_STYLE_ID = 'dsh-claude-style-lite-surface'
export const WEBFONTS_STYLE_ID = 'dsh-claude-style-lite-webfonts'
export const SETTINGS_ENTRY_FALLBACK = 'ui-skin-claude-style-lite'
export const REPOSITORY_URL = 'https://github.com/guojianlin/dsh-claude-style-lite'
```

保留：

```ts
export const BRAND_ATTR = 'data-dsh-claude-brand'
export const MOTION_ATTR = 'data-dsh-claude-motion'
```

同时修改 `packages/testing/smoke/cases/_shared.mjs` 的 `commonChecks()`：

```js
check("the sheet carries this package's own module-system tags, so no sibling's bookkeeping can take it away",
  r.sheetPlugin === 'dsh-claude-style-lite' && r.sheetPluginCss === 'dsh-claude-style-lite/client.css' && r.sheetClaimable === false,
  JSON.stringify({ plugin: r.sheetPlugin, css: r.sheetPluginCss, claimable: r.sheetClaimable }))
check("a sibling's untagged sheet stays out of this package's bookkeeping, so no reload of this package removes it",
  r.siblingSheetTag === 'dsh-claude-style-lite/foreign-sheet' && r.siblingSheetClaimable === false && r.siblingSheetSurvives === true,
  JSON.stringify({ tag: r.siblingSheetTag, claimable: r.siblingSheetClaimable, survives: r.siblingSheetSurvives }))
check("a sibling's sheet arriving after this bundle is parked before any package can claim it",
  r.lateSheetTag === 'dsh-claude-style-lite/foreign-sheet' && r.lateSheetClaimable === false,
  JSON.stringify({ tag: r.lateSheetTag, claimable: r.lateSheetClaimable }))
```

执行：

```bash
rg -n "dsh-claude-style/(client.css|foreign-sheet)|sheetPlugin === 'dsh-claude-style'" packages/testing
```

Expected: 无输出。

- [ ] **Step 6: 修改 skin.json**

```json
{
  "id": "claude-style-lite",
  "name": "Claude Code Style Lite",
  "tagline": "Claude Code Desktop 深度定制化主题（轻量版）",
  "accent": "#d97757",
  "bodyAttr": "data-dsh-claude-style",
  "package": "dsh-claude-style-lite",
  "wiring": {
    "id": "ui-skin-claude-style-lite"
  }
}
```

- [ ] **Step 7: 修改 cordis.patch.yml**

```yaml
# Claude Code Desktop theme bundle patch: inserts its dsh.client row into the web roster.
- insert:
    - id: ui-skin-claude-style-lite
      name: 'dsh-claude-style-lite'
```

- [ ] **Step 8: 修改 locale**

`locale/zh.json`：

```json
{
  "meta": {
    "title": "Claude Code 风格 Lite",
    "description": "dsh-claude-style 的轻量派生版：保留 Claude / DeepSeek 主题、模型选择、会话与统计能力，移除思考自动开合、峰谷费率、消息入场动画与自绘光标，推理滑块改用 Canvas 填充。"
  }
}
```

`locale/en.json`：

```json
{
  "meta": {
    "title": "Claude Code Style Lite",
    "description": "A lite fork of dsh-claude-style: keeps the Claude / DeepSeek themes, model picker, sessions and statistics, while removing automatic reasoning folds, the peak-rate meter, sent-message entrance animations and the drawn caret; the effort slider paints its fill on a canvas."
  }
}
```

- [ ] **Step 9: 新建 docs/INSTALL.md**

内容必须包含：

```markdown
# 安装与回退

## 安装 Lite
dsh plugin --profile web add dsh-claude-style-lite

## 安装原版
dsh plugin --profile web add dsh-claude-style

## 互斥
同一 DSH Profile 不得同时激活 dsh-claude-style 与 dsh-claude-style-lite。

## 字体
Lite 从 $DSH_HOME/dsh-claude-style-lite/fonts/ 读取用户字体。
从原版迁移时，把 $DSH_HOME/dsh-claude-style/fonts/ 下的文件复制到新目录。

## 卸载
dsh plugin --profile web remove dsh-claude-style-lite

## 回退
停用 Lite，重新启用 dsh-claude-style。

## 设置迁移
仅在宿主公开设置接口可读时执行；否则手动迁移。
删除的设置键不迁移：peakrate、chatSend、messageEnter、caretMotion。

## 测试与验证
不要用真实的 ~/.dsh 或 ~/.agents 测试。
使用 node packages/testing/dsh-web.mjs。
它创建 .debug/runs/dsh-web/<run-id>/ 下的独立 DSH_HOME 与 DSH_AGENTS_HOME，
监听 127.0.0.1 的随机端口并传入 --no-open。
不要连接正在运行的真实 3080 Web 实例。
```

- [ ] **Step 10: 更新 README 与 CONTRIBUTING**

README 增加：

```markdown
> 本地开发与验证只使用 `.debug/runs/dsh-web/` 下的隔离 `DSH_HOME` 与
> `DSH_AGENTS_HOME`，不读取也不写入用户的 `~/.dsh` 与 `~/.agents`。
> 测试 Web 监听 `127.0.0.1` 的随机端口，并使用 `--no-open`。
```

```markdown
> 本包 fork 自 Nwflower/dsh-claude-style，固定上游提交
> `8cafcacd5aa574faa75b1912b8934bede7936b73`（0.20.3）。
> 与上游的差异见 docs/CHANGES-FROM-UPSTREAM.md。
```

同时修改：

- 徽章包名。
- 安装命令。
- 字体目录。
- 互斥说明。
- 文档链接。

CONTRIBUTING 修改：

- 包名。
- 构建命令。
- 上游固定说明。
- Lite 专属测试入口。

- [ ] **Step 11: 运行身份扫描**

```bash
rg -n '"name": "dsh-claude-style"' package.json package-lock.json
rg -n "PACKAGE_NAME = 'dsh-claude-style'" packages/contracts/src/package.ts
rg -n "ROUTE_PREFIX = '/dsh-claude-style'" packages/contracts/src/routes.ts
rg -n 'ui-skin-claude-style\b' skin.json cordis.patch.yml
rg -n "dsh-claude-style/(client.css|foreign-sheet)|sheetPlugin === 'dsh-claude-style'" packages/testing
```

Expected: 全部无输出。

`packages/host/src/settings.ts` 与 `packages/host/src/index.ts` 不写死包名，它们从 `PACKAGE_NAME` 读取；本步不修改它们，只确认没有字面包名：

```bash
rg -n "dsh-claude-style['\"]" packages/host/src/settings.ts packages/host/src/index.ts
```

Expected: 无输出。

- [ ] **Step 12: 提交**

```bash
git add package.json package-lock.json skin.json cordis.patch.yml locale packages/contracts/src/package.ts packages/contracts/src/routes.ts packages/client/src/constants.ts README.md README.en.md CONTRIBUTING.md docs/INSTALL.md packages/testing/smoke/cases/_shared.mjs
git commit -m "feat: 建立 dsh-claude-style-lite 独立插件身份"
```

---

### Task 4: R1 删除思考自动开合，解耦 reasoning-stream

**Files:**
- Delete: `packages/client/src/features/chat-fold/reasoning-fold.ts`
- Modify: `packages/client/src/features/chat-fold/chat-fold.ts`
- Modify: `packages/client/src/features/chat-fold/reasoning-stream.ts`
- Modify: `packages/client/src/features/chat-fold/fold-motion.css`
- Modify: `packages/client/src/features/chat-fold/chat-fold.manifest.ts`
- Modify: `packages/testing/scenarios/reasoning-stream.mjs`
- Modify: `packages/testing/specs/behaviour/reasoning-display/choice.spec.mjs`
- Modify: `packages/testing/smoke/probe/chat-fold.js`
- Create: `packages/testing/specs/behaviour/reasoning-display/manual-fold.spec.mjs`
- Delete: `packages/testing/faults/patches/chat-fold-4d2aab06.patch`
- Modify: `packages/testing/data/element-collections.json`
- Modify: `packages/testing/data/document-lookups.json`
- Modify: `packages/testing/data/check-numbers.json`

**Interfaces:**
- Consumes: `observeMatches<T>(selector, onChange?)` and `subscribeMutations(target, options, callback)` from `@dsh-claude-style/engine/bus`；`requestFrame(task)` from `@dsh-claude-style/engine/frame`
- Produces: `createReasoningStream()` 返回 `{ sync, stop }`，不再返回 `queueRow`

- [ ] **Step 1: 写失败测试**

新建 `packages/testing/specs/behaviour/reasoning-display/manual-fold.spec.mjs`：

```js
/**
 * The host's own reasoning disclosure stays manual in Lite: a running row is
 * not pressed open, and the stepped text window still follows an expanded row
 * without changing its expanded state.
 *
 * @capability reasoning-display
 * @features chat-fold
 * @risk A reader who collapses or expands a thinking row has the skin override that decision, or a streaming row stops updating its stepped window.
 */
import { spec } from '../../fixtures/behaviour.mjs'
import { EXPANDED_ATTRIBUTE, ROW_PHASE_ATTRIBUTE, RUNNING_STATE, THINK_ROW_SELECTOR } from '@dsh-claude-style/contracts/dom'

const WINDOW = '[data-dsh-claude-reason-window]'

export default spec({ page: 'chat-fold' }, ({ test }) => {
  test('a running thinking row is never pressed, and an expanded row still takes a window', async (t) => {
    await t.prefs({ chatAnimations: true, motion: 'full', reasoningDisplay: 'stepped' })
    const result = await t.page.evaluate(([think, phase, running, expanded, windowMark]) => {
      const row = document.querySelector(think)
      if (row === null) throw new Error('the fixture has no thinking row')
      const control = row.querySelector('[role="button"], button')
      if (control === null) throw new Error('the fixture has no thinking control')
      let presses = 0
      control.addEventListener('click', () => { presses += 1 }, true)
      row.setAttribute(phase, running)
      row.removeAttribute(expanded)
      return new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => {
          const afterRunning = presses
          row.setAttribute(expanded, '')
          requestAnimationFrame(() => requestAnimationFrame(() => {
            resolve({ afterRunning, windows: row.querySelectorAll(windowMark).length })
          }))
        }))
      })
    }, [THINK_ROW_SELECTOR, ROW_PHASE_ATTRIBUTE, RUNNING_STATE, EXPANDED_ATTRIBUTE, WINDOW])
    t.expectThat.equal(result.afterRunning, 0, 'the skin does not press a running thinking row')
    t.expectThat.equal(result.windows > 0, true, 'the expanded row takes its stepped window')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
node packages/testing/stand-in.mjs --spec packages/testing/specs/behaviour/reasoning-display/manual-fold.spec.mjs
```

Expected: FAIL，因为当前 `createReasoningFold()` 会点击控件。

- [ ] **Step 3: 删除 reasoning-fold.ts**

```bash
rm packages/client/src/features/chat-fold/reasoning-fold.ts
```

- [ ] **Step 4: 修改 chat-fold.ts**

删除：

```ts
import { createReasoningFold } from './reasoning-fold'
```

把：

```ts
const stream = createReasoningStream()
const stopReasoning = createReasoningFold(rows => {
  for (const row of rows) stream.queueRow(row)
})
```

改为：

```ts
const stream = createReasoningStream()
```

从 teardown 删除：

```ts
stopReasoning()
```

保留：

```ts
stream.stop()
stopProcess()
summary.stop()
messageFold.stop()
stopGlide()
```

- [ ] **Step 5: 修改 reasoning-stream.ts 的订阅**

先把顶部 imports：

```ts
import { observeMatches } from '@dsh-claude-style/engine/bus'
```

改为：

```ts
import { observeMatches, subscribeMutations } from '@dsh-claude-style/engine/bus'
```

再把 `createReasoningStream()` 中：

```ts
const thinkRows = observeMatches<HTMLElement>(THINK_ROW_SELECTOR)
```

改为：

```ts
const thinkRows = observeMatches<HTMLElement>(THINK_ROW_SELECTOR, queueKnownRows)
```

在同一函数内新增：

```ts
/** Queue every thinking row the registry has seen, so a newly arrived row takes its window without the automatic fold's callback. */
function queueKnownRows() {
  for (const row of thinkRows.all()) queue(row)
}
```

在 `queue()` 定义之后、`sync()` 之前，新增子树监听：

```ts
const stopTextWatch = subscribeMutations(document.body, {
  subtree: true,
  childList: true,
  characterData: true,
  attributeFilter: [ROW_PHASE_ATTRIBUTE, EXPANDED_ATTRIBUTE],
}, (records) => {
  for (const record of records) {
    const target = record.target instanceof Element ? record.target : record.target.parentElement
    const row = target?.closest(THINK_ROW_SELECTOR) ?? null
    if (row !== null) queue(row)
    for (const node of record.addedNodes) {
      if (!(node instanceof Element)) continue
      if (node.matches(THINK_ROW_SELECTOR)) queue(node)
      for (const found of node.querySelectorAll(THINK_ROW_SELECTOR)) queue(found)
    }
  }
})
```

在 `stop()` 中新增：

```ts
stopTextWatch()
```

从返回值删除：

```ts
queueRow: queue,
```

返回值变为：

```ts
return {
  sync,
  stop() {
    stopped = true
    if (cancelFrame !== null) cancelFrame()
    cancelFrame = null
    queued = false
    for (const row of [...windows.keys()]) clearWindow(row)
    pending.clear()
    plans.length = 0
    offPrefs()
    stopTextWatch()
    thinkRows.release()
  },
}
```

- [ ] **Step 6: 更新 reasoning-stream.ts 的头部注释**

把“Reuse the fold observer and frame read/write phases (D40)”改为：

```ts
/* Watch thinking rows through the shared match registry and mutation bus, and keep the
   read/write phases on the shared frame pipeline (D40). The window only affects how
   expanded reasoning is laid out; it never changes the host's expanded state. */
```

- [ ] **Step 7: 修改 fold-motion.css**

只删除自动开合专属规则。保留：

```css
body[data-dsh-claude-style] [data-dsh-claude-reason-window] { ... }
body[data-dsh-claude-style] [data-dsh-claude-reason-window][data-dsh-claude-reason-capped] { ... }
body[data-dsh-claude-style] [data-dsh-claude-reason-window] [data-dsh-claude-reason-text] { ... }
body[data-dsh-claude-style][data-dsh-claude-motion="reduced"] [data-dsh-claude-reason-window] { ... }
body[data-dsh-claude-style][data-dsh-claude-motion="reduced"] [data-dsh-claude-reason-window] [data-dsh-claude-reason-text] { ... }
```

如果没有任何选择器依赖 `[data-chat-flow]` 的“自动开合阶段”标记，删除对应规则。执行：

```bash
rg -n 'reason-window|reason-text|reason-capped' packages/client/src/features/chat-fold/fold-motion.css
```

Expected: 只剩保留的窗口排版规则。

- [ ] **Step 8: 修改 chat-fold.manifest.ts**

先运行：

```bash
rg -n 'fold\.expanded|chat\.think-running|fold\.disclosure|chat\.phase' packages/client/src packages/contracts/src packages/testing
```

只删除不再被任何保留功能读取的 contract 条目。若 `fold.expanded` 仍被 `fold-glide-parts.ts` 或 `chat-follow` 使用，则保留。

- [ ] **Step 9: 更新 reasoning-stream 测试**

`reasoning-display/choice.spec.mjs` 中：

- 不再依赖自动展开。
- 在 `prefs({ reasoningDisplay: 'stepped' })` 后，显式设置：

```js
row?.setAttribute(EXPANDED_ATTRIBUTE, '')
```

- 保留：

```js
await t.page.waitForSelector(window, { timeout: 5000 })
```

- 保留 continuous 模式下窗口消失和 transform 归零的断言。

`packages/testing/scenarios/reasoning-stream.mjs` 中：

- 删除“自动开合把行打开”的等待。
- 改为在发送前或 fixture 中显式展开行。
- 保留连续和两行步进的断言。

- [ ] **Step 10: 运行目标测试**

```bash
node packages/testing/stand-in.mjs --spec packages/testing/specs/behaviour/reasoning-display/manual-fold.spec.mjs,packages/testing/specs/behaviour/reasoning-display/choice.spec.mjs
```

Expected: PASS。

- [ ] **Step 11: 运行相关回归**

```bash
node packages/testing/stand-in.mjs --spec packages/testing/specs/behaviour/message-fold/content-only.spec.mjs
node packages/testing/stand-in.mjs --spec packages/testing/specs/behaviour/chat-follow/stuck-thinking-header.spec.mjs
```

Expected: PASS。

- [ ] **Step 12: 更新账本**

```bash
npm run element-collections
node packages/testing/check-numbers.mjs
npm run lint
```

Expected:

- `element-collections.json` 删除 `packages/client/src/features/chat-fold/reasoning-fold.ts` 条目。
- `document-lookups.json` 删除同一文件的整条 `files` 记录。
- `check-numbers.json` 重生成，reasoning 相关 check 数字与删除后的用例一致。
- lint 通过。

- [ ] **Step 13: 提交**

```bash
git add packages/client/src/features/chat-fold packages/testing
git commit -m "refactor: 移除思考自动开合并保留手动折叠"
```

---

### Task 5: R2 拆除峰谷模块，下沉价格日历

**Files:**
- Create: `packages/host/data/pricing-calendar.json`
- Create: `packages/contracts/src/pricing-calendar.ts`
- Create: `scripts/data/pricing-calendar.mjs`
- Create: `packages/testing/specs/logic/pricing-calendar/calendar.spec.ts`
- Modify: `scripts/data/fetch-prices.mjs`
- Modify: `packages/host/src/prices.ts`
- Modify: `packages/host/src/routes.ts`
- Modify: `packages/contracts/src/routes.ts`
- Modify: `packages/contracts/src/prefs.ts`
- Modify: `packages/client/src/core/scheduler.ts`
- Modify: `packages/client/src/constants.ts`
- Modify: `packages/client/src/features/model/model-picker.ts`
- Modify: `packages/client/src/features/model/rows.ts`
- Modify: `packages/client/src/features/model/model-picker.manifest.ts`
- Modify: `packages/client/src/features/model/model-copy.ts`
- Modify: `packages/client/src/pure.ts`
- Modify: `packages/client/src/theme/tokens.json`
- Modify: `scripts/build/build.mjs`
- Modify: `.github/workflows/data.yml`
- Modify: `package.json`（`files` 删除 `lib/peakrate-catalog.json`，如存在）
- Delete: `packages/client/src/features/peakrate/`
- Delete: `packages/host/src/peakrate.ts`
- Delete: `packages/host/src/peakrate-catalog.ts`
- Delete: `packages/host/data/peakrate-catalog.json`
- Delete: `packages/contracts/src/peakrate.ts`
- Delete: `scripts/build/peakrate-catalog.mjs`
- Delete: `scripts/data/fetch-peakrate-catalog.mjs`
- Delete: `packages/testing/specs/logic/billing-clock/`
- Delete: `packages/testing/specs/behaviour/model-picker/rate-refresh.spec.mjs`
- Delete: `packages/testing/smoke/probe/model-meter.js`
- Modify: `packages/testing/smoke/cases/model.mjs`
- Modify: `packages/testing/smoke/cases/settings.mjs`
- Modify: `packages/testing/smoke/host-half.mjs`
- Modify: `packages/testing/smoke/page.mjs`
- Modify: `packages/testing/smoke/stand-in/host-fetch.js`
- Modify: `packages/testing/data/importance-unreachable.json`
- Modify: `packages/testing/data/skin-literals.json`
- Modify: `packages/testing/data/document-lookups.json`

**Interfaces:**
- Consumes: `PriceDocument.schedule` from `packages/contracts/src/prices.ts`
- Produces: `pricing-calendar.json` + `readPricingCalendar()`；`fetch-prices.mjs` 不再依赖峰谷目录

- [ ] **Step 1: 写价格日历失败测试并证明旧依赖**

新建 `packages/testing/specs/logic/pricing-calendar/calendar.spec.ts`：

```ts
/**
 * The independent price calendar accepts the DeepSeek clock the price snapshot
 * needs and refuses every field the snapshot parser would refuse.
 *
 * @capability pricing-calendar
 * @features contracts
 * @risk A removed peak-rate catalog leaves the price generator without its DeepSeek clock, or a malformed calendar reaches the shipped price snapshot.
 */
import { expect, test } from 'vitest'
import { parsePricingCalendar } from '@dsh-claude-style/contracts/pricing-calendar'

const VALID = {
  schemaVersion: 1,
  updatedAt: '2026-11-10',
  source: 'upstream peak catalog at 8cafcacd5aa574faa75b1912b8934bede7936b73',
  deepseek: {
    timeZone: 'UTC',
    holidayZone: 'Asia/Shanghai',
    peakDays: [1, 2, 3, 4, 5],
    peakWindows: [
      { start: '01:00', end: '04:00' },
      { start: '06:00', end: '10:00' },
    ],
    holidays: ['2026-01-01', '2027-01-01'],
  },
}

test('a valid calendar yields the fields the price snapshot carries', () => {
  expect(parsePricingCalendar(VALID)).toEqual(VALID.deepseek)
})

test('a bad time zone, window, weekday or date is refused', () => {
  expect(parsePricingCalendar({ ...VALID, deepseek: { ...VALID.deepseek, timeZone: 'Mars/Olympus' } })).toBeNull()
  expect(parsePricingCalendar({ ...VALID, deepseek: { ...VALID.deepseek, peakWindows: [{ start: '25:00', end: '04:00' }] } })).toBeNull()
  expect(parsePricingCalendar({ ...VALID, deepseek: { ...VALID.deepseek, peakDays: [7] } })).toBeNull()
  expect(parsePricingCalendar({ ...VALID, deepseek: { ...VALID.deepseek, holidays: ['2026-02-30'] } })).toBeNull()
})

test('a calendar with no peak day or no window is refused', () => {
  expect(parsePricingCalendar({ ...VALID, deepseek: { ...VALID.deepseek, peakDays: [] } })).toBeNull()
  expect(parsePricingCalendar({ ...VALID, deepseek: { ...VALID.deepseek, peakWindows: [] } })).toBeNull()
})

test('a missing or unknown schema version is refused', () => {
  expect(parsePricingCalendar({ ...VALID, schemaVersion: 2 })).toBeNull()
  expect(parsePricingCalendar({ ...VALID, schemaVersion: undefined })).toBeNull()
})
```

运行：

```bash
npx vitest run packages/testing/specs/logic/pricing-calendar/calendar.spec.ts
```

Expected: FAIL，因为 `packages/contracts/src/pricing-calendar.ts` 尚不存在。

证明旧依赖：

```bash
rg -n 'peakrate-catalog.json' scripts/data/fetch-prices.mjs
```

Expected: 命中 `const CATALOG = ...`。

- [ ] **Step 2: 新建契约层纯解析器**

新建 `packages/contracts/src/pricing-calendar.ts`：

```ts
/** The DeepSeek clock the independent price snapshot needs, without the removed peak-rate module. */

export interface PricingCalendar {
  timeZone: string
  holidayZone: string
  peakDays: number[]
  peakWindows: { start: string, end: string }[]
  holidays: string[]
}

const CLOCK = /^([01]?\d|2[0-3]):[0-5]\d$/
const DATE = /^\d{4}-\d{2}-\d{2}$/

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function zoneResolves(timeZone: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone })
    return true
  } catch {
    return false
  }
}

function isDate(value: string) {
  if (!DATE.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const at = new Date(Date.UTC(year, month - 1, day))
  return at.getUTCFullYear() === year && at.getUTCMonth() === month - 1 && at.getUTCDate() === day
}

/** Parse and validate one calendar document; null means the price generator must not use it. */
export function parsePricingCalendar(value: unknown): PricingCalendar | null {
  const raw = asRecord(value)
  if (raw === null || raw.schemaVersion !== 1) return null
  const deepseek = asRecord(raw.deepseek)
  if (deepseek === null) return null
  const timeZone = typeof deepseek.timeZone === 'string' ? deepseek.timeZone.trim() : ''
  const holidayZone = typeof deepseek.holidayZone === 'string' ? deepseek.holidayZone.trim() : timeZone
  if (timeZone === '' || holidayZone === '' || !zoneResolves(timeZone) || !zoneResolves(holidayZone)) return null
  const peakDays = Array.isArray(deepseek.peakDays)
    ? [...new Set(deepseek.peakDays.filter((day): day is number => Number.isInteger(day) && day >= 0 && day <= 6))].sort()
    : []
  if (peakDays.length === 0) return null
  const peakWindows: { start: string, end: string }[] = []
  if (Array.isArray(deepseek.peakWindows)) {
    for (const entry of deepseek.peakWindows) {
      const window = asRecord(entry)
      if (window === null) continue
      if (typeof window.start !== 'string' || typeof window.end !== 'string') continue
      if (!CLOCK.test(window.start) || !CLOCK.test(window.end)) continue
      peakWindows.push({ start: window.start, end: window.end })
    }
  }
  if (peakWindows.length === 0) return null
  const holidays: string[] = []
  if (deepseek.holidays !== undefined) {
    if (!Array.isArray(deepseek.holidays)) return null
    for (const entry of deepseek.holidays) {
      if (typeof entry !== 'string' || !isDate(entry)) return null
      if (!holidays.includes(entry)) holidays.push(entry)
    }
    holidays.sort()
  }
  return { timeZone, holidayZone, peakDays, peakWindows, holidays }
}
```

再运行同一测试。

Expected: PASS。

- [ ] **Step 3: 从固定目录提取价格日历**

执行：

```bash
python - <<'PY'
import json
source = 'packages/host/data/peakrate-catalog.json'
target = 'packages/host/data/pricing-calendar.json'
doc = json.load(open(source, encoding='utf-8'))
profile = next(p for p in doc['profiles'] if p['id'] == 'deepseek-v4')
schedule = profile['schedule']
out = {
    'schemaVersion': 1,
    'updatedAt': doc.get('updatedAt'),
    'source': 'packages/host/data/peakrate-catalog.json at upstream 8cafcacd5aa574faa75b1912b8934bede7936b73',
    'deepseek': {
        'timeZone': schedule['timeZone'],
        'holidayZone': schedule.get('publicHolidayTimeZone', schedule['timeZone']),
        'peakDays': schedule['peakDays'],
        'peakWindows': schedule['peakWindows'],
        'holidays': schedule.get('publicHolidayDates', []),
    },
}
open(target, 'w', encoding='utf-8').write(json.dumps(out, indent=2, ensure_ascii=False) + '\n')
PY
```

Expected: `pricing-calendar.json` 含 `timeZone: "UTC"`、`peakDays: [1,2,3,4,5]`、两个窗口 `01:00-04:00` 和 `06:00-10:00`、`holidayZone: "Asia/Shanghai"`、全部节假日。

- [ ] **Step 4: 新建 pricing-calendar.mjs**

```js
/** pricing-calendar.mjs — read the independent DeepSeek price calendar (`pricing-calendar.json`). */
import fs from 'node:fs'
import { parsePricingCalendar } from '../contracts/src/pricing-calendar.ts'

/** Read the calendar the price snapshot uses; the contract parser owns every field rule. */
export function readPricingCalendar(file) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'))
  const calendar = parsePricingCalendar(raw)
  if (calendar === null) throw new Error(`pricing-calendar: ${file} is not a calendar the price snapshot understands`)
  return calendar
}
```

- [ ] **Step 5: 修改 fetch-prices.mjs**

替换 `const CATALOG`：

```js
const CALENDAR = path.join(ROOT, 'packages', 'host', 'data', 'pricing-calendar.json')
```

新增导入：

```js
import { readPricingCalendar } from './pricing-calendar.mjs'
```

把 `scheduleFromCatalog()` 改为：

```js
/** The DeepSeek clock and holidays the price snapshot carries, independent of the removed peak-rate module. */
function scheduleFromCalendar() {
  const calendar = readPricingCalendar(CALENDAR)
  return {
    timeZone: calendar.timeZone,
    holidayZone: calendar.holidayZone,
    peakDays: calendar.peakDays,
    peakWindows: calendar.peakWindows,
    holidays: calendar.holidays,
  }
}
```

把：

```js
schedule: scheduleFromCatalog(),
```

改为：

```js
schedule: scheduleFromCalendar(),
```

把文档头注释改为：

```js
/**
 * fetch-prices.mjs — refresh independent CNY and USD snapshots from official
 * tables. The DeepSeek clock and Chinese public holidays come from
 * packages/host/data/pricing-calendar.json, which is independent of the
 * removed peak-rate feature.
 */
```

- [ ] **Step 6: 运行价格生成离线校验**

```bash
node - <<'JS'
import { readPricingCalendar } from './scripts/data/pricing-calendar.mjs'
const calendar = readPricingCalendar('./packages/host/data/pricing-calendar.json')
console.log(calendar.timeZone, calendar.peakDays.join(','), calendar.peakWindows.length, calendar.holidays.length)
JS
```

Expected: 输出 `UTC 1,2,3,4,5 2 <节假日数量>`。

- [ ] **Step 7: 删除峰谷前端目录**

```bash
rm -rf packages/client/src/features/peakrate
```

- [ ] **Step 8: 修改 scheduler.ts**

删除：

```ts
import type { PeakRateHandle } from '../features/peakrate/peakrate'
```

删除：

```ts
peakrate: PeakRateHandle
```

Expected: `Handles` 不再含 `peakrate`。

- [ ] **Step 9: 修改 model-picker.ts**

删除 `createModelRows` 参数中的：

```ts
rate(provider: string, modelId: string) {
  const peakrate = ui.peakrate
  if (peakrate === undefined) return null
  return peakrate.badge(provider, modelId)
},
```

删除函数：

```ts
function refreshRateBadges() {
  modelRows.refreshRates()
}
```

把 `renderModelBody()` 中：

```ts
if (sig === modelBodySig) {
  modelRows.refreshRates()
  return false
}
```

改为：

```ts
if (sig === modelBodySig) return false
```

把 `subSignature()` 中只与费率相关的注释和变量删除；保留模型、分组、当前选择。

- [ ] **Step 10: 修改 rows.ts**

删除：

```ts
rate: (provider: string, modelId: string) => HTMLElement | null
```

删除：

```ts
interface PaintedRate { ... }
const painted: PaintedRate[] = []
let paintedMinute = -1
const RATE_ANCHOR_ATTRIBUTE = 'data-dsh-claude-rate-badge'
const rateTips = new Map<HTMLElement, HostTooltip>()
function placeRateBadge(...)
function dropRateBadge(...)
function pruneRateBadges(...)
function refreshRates(...)
```

`buildModelRow` 中删除：

```ts
const row: PaintedRate = { item, provider: group.id, modelId: model.id, anchor: null, badge: null }
painted.push(row)
```

删除：

```ts
const meter = rate(group.id, model.id)
if (meter !== null) {
  const placed = placeRateBadge(item, meter, built.check)
  row.anchor = placed.anchor
  row.badge = placed.badge
}
```

删除返回对象中的：

```ts
refreshRates
```

- [ ] **Step 11: 修改 model-picker.manifest.ts**

```ts
reads: ['composer'],
```

- [ ] **Step 12: 修改 pure.ts**

删除：

```ts
export { buildRateBadge, rateDetail, rateName } from './features/peakrate/badge'
export { matchProfile } from './features/peakrate/match'
export { currentRate, forgetRates, formatCountdown } from './features/peakrate/schedule'
```

- [ ] **Step 13: 修改 constants.ts**

删除：

```ts
PEAKRATE_PATH as PEAKRATE_ROUTE,
```

- [ ] **Step 14: 修改 contracts/routes.ts**

删除：

```ts
export const PEAKRATE_PATH = `${ROUTE_PREFIX}/peakrate`
```

- [ ] **Step 15: 修改 contracts/prefs.ts**

删除：

```ts
peakrate: { type: 'boolean', default: true },
```

- [ ] **Step 16: 修改 host/routes.ts**

删除导入：

```ts
PEAKRATE_PATH
createPeakRate
```

删除：

```ts
const peakrate = createPeakRate(ctx)
```

删除 `register('peak rate', { ... })` 整块。

删除 teardown：

```ts
peakrate.dispose()
```

保留：

```ts
const prices = createPrices(ctx)
const sessionCost = createSessionCost(ctx, prices)
const sessionPanel = createSessionPanel(ctx, sessionCost)
sessionCost.ensure()
sessionPanel.ensure()
```

- [ ] **Step 17: 修改 host/prices.ts 注释**

把：

```ts
 * The refresh follows `peakrate.ts`: a timer that starts with the first reader,
```

改为：

```ts
 * The refresh timer starts with the first reader,
```

- [ ] **Step 18: 删除宿主峰谷文件与数据**

```bash
rm packages/host/src/peakrate.ts
rm packages/host/src/peakrate-catalog.ts
rm packages/host/data/peakrate-catalog.json
rm packages/contracts/src/peakrate.ts
rm scripts/build/peakrate-catalog.mjs
rm scripts/data/fetch-peakrate-catalog.mjs
```

- [ ] **Step 19: 修改 build.mjs**

删除：

```ts
import { PEAKRATE_CATALOG, validatePeakCatalog } from './peakrate-catalog.mjs'
```

删除：

```ts
const catalogPath = path.join(HOST_DATA, PEAKRATE_CATALOG)
const catalogText = fs.readFileSync(catalogPath, 'utf8')
const catalogProfiles = validatePeakCatalog(JSON.parse(catalogText), catalogPath)
```

删除：

```ts
fs.writeFileSync(path.join(LIB, PEAKRATE_CATALOG), catalogText)
console.log(`built lib/${PEAKRATE_CATALOG} ...`)
```

保留：

```ts
const pricesPath = path.join(HOST_DATA, PRICES_FILE)
const pricesText = fs.readFileSync(pricesPath, 'utf8')
const pricedModels = validatePrices(JSON.parse(pricesText), pricesPath)
fs.writeFileSync(path.join(LIB, PRICES_FILE), pricesText)
```

- [ ] **Step 20: 修改 data.yml**

删除：

```yaml
      - name: Refresh the peak rate catalog
        run: node scripts/data/fetch-peakrate-catalog.mjs
```

把注释改为：

```yaml
# Commit the validated price snapshot so installs do not scrape upstream.
```

把 commit message 改为：

```text
chore(data): refresh the price snapshot
```

- [ ] **Step 21: 修改设置 smoke**

`packages/testing/smoke/cases/settings.mjs`：

把第 17–23 行的 `expected` 对象改为：

```js
const expected = {
  general: ['brand', 'username', 'pageZoom', 'interfaceFontSize', 'autoPopover', 'sodium', 'soundCues'],
  appearance: ['sidebarBrand', 'brandLockup', 'brandInk', 'palette', 'paletteCards', 'inlineCodeColor', 'backgroundOpacity', 'typeface', 'homeLayout', 'homeSessionScope', 'homeRipple', 'mascot', 'mascotScope'],
  'main-window': ['turnNav', 'messageActions', 'conversationWidth', 'viewTabs', 'headerBand', 'processRows', 'answerAnchor', 'sessionPanel', 'composerScope', 'composerBottomGap', 'questionCard', 'permissionsControl', 'modelPicker', 'effortSlider', 'modelDescriptions', 'quickProviders', 'effortAccent', 'contextDisplay', 'contextNumbers', 'statsPosition', 'statsFooterAlign', 'billingCurrency', 'billingTable'],
  sidebar: ['collapseFooter', 'banLocale', 'sidebarSearch', 'searchStyle', 'sidebarEntries', 'workspaceView', 'sidebarPeek', 'sidebarLayout'],
  motion: ['motion', 'chatAnimations', 'chatWait', 'statusDetail', 'statusMotion', 'chatReveal', 'ongoingIndicator', 'ongoingIndicatorSide', 'reasoningDisplay'],
}
```

把 `mainWindowGroups` 的 Composer 行改为：

```js
{ label: 'Composer', rows: ['composerScope', 'composerBottomGap', 'questionCard', 'permissionsControl', 'modelPicker', 'effortSlider', 'modelDescriptions', 'quickProviders', 'effortAccent'] },
```

把 `parentsOff.mainWindow.disabled` 断言改为：

```js
JSON.stringify(off.mainWindow.disabled) === '["headerBand","effortSlider","modelDescriptions","quickProviders","effortAccent","statsFooterAlign","billingTable"]'
```

把 `requirementsOff.mainWindow.disabled` 断言改为：

```js
JSON.stringify(unmet.mainWindow.disabled) === '["headerBand","composerBottomGap","permissionsControl","modelPicker","effortSlider","modelDescriptions","quickProviders","effortAccent","contextDisplay","contextNumbers","statsPosition","statsFooterAlign","billingCurrency","billingTable"]'
```

- [ ] **Step 22: 删除峰谷测试与探针**

```bash
rm -rf packages/testing/specs/logic/billing-clock
rm packages/testing/specs/behaviour/model-picker/rate-refresh.spec.mjs
git mv packages/testing/smoke/probe/model-meter.js packages/testing/smoke/probe/model-rows.js
```

- [ ] **Step 23: 修改 model-rows 探针**

`packages/testing/smoke/probe/model-rows.js`：

1. 把文件头注释改为：

```js
/**
 * The model menu's rows: the host's model seat is put on the page, the picker's
 * trigger is pressed, and both levels are read back — the name, release tag,
 * description, selected check and row box each carries.
 *
 * The page's model directory puts the model in force in a provider level 1 does
 * not list, so the picker appends the seat's own row at the bottom of that
 * level: the row this case exists for.
 */
```

2. 把 `probe.onlyFor(['model-meter']` 改为 `probe.onlyFor(['model-rows']`。
3. 在 `readRows` 中删除：

```js
var meter = option.querySelector('.dsh-claude-peakrate')
var value = meter === null ? null : meter.querySelector('.dsh-claude-peakrate-value')
var countdown = meter === null ? null : meter.querySelector('.dsh-claude-peakrate-countdown')
var anchor = null
if (meter !== null) {
  for (var child = option.firstElementChild; child !== null; child = child.nextElementSibling) {
    if (child.contains(meter)) { anchor = child; break }
  }
}
var standing = anchor === null ? meter : anchor
```

4. 删除 `rows.push` 中的：

```js
meter: meter === null ? null : { ... },
```

5. 保留：

```js
name: name === null ? '' : name.textContent,
text: (option.textContent || '').replace(/\s+/g, ' ').trim(),
desc: desc === null ? null : desc.textContent,
current: option.getAttribute('aria-checked') === 'true',
box: { ... },
```

6. 把报告字段：

```js
r.modelMeter = { levelOne: ..., levelTwo: ..., currentRow: ... }
```

改为：

```js
r.modelRows = { levelOne: ..., levelTwo: ..., currentRow: ... }
```

7. 删除探针中只读费率的部分：

```js
var rateRefresh = ...
var paintedSecond = ...
var minute = ...
```

保留模型菜单的打开、第二层、当前行、描述开关、press 保持打开和外部 picker 采样。

- [ ] **Step 24: 修改 model.mjs**

删除 `packages/testing/smoke/cases/model.mjs` 中的整个 `'model-meter'(r) { ... }` case，保留 `'model-account'(r)`。

保留并重命名为 `'model-rows'(r)`：

```js
'model-rows'(r) {
  basicChecks(r)
  const rows = r.modelRows || {}
  const levelOne = rows.levelOne || []
  const one = byName(levelOne)
  const two = byName(rows.levelTwo)
  check('the picker draws level 1 with the seat\'s own row under the list',
    levelOne.length === 3 && one['V4.1 Flash'] !== undefined && one['Kimi K3'] !== undefined && one['GLM-5.3'] !== undefined,
    JSON.stringify(levelOne.map((row) => row.name)))
  check('the official Flash row carries the host\'s 1017 release tag, and the other rows do not',
    one['V4.1 Flash'] !== undefined && one['V4.1 Flash'].text.includes('1017') &&
      one['Kimi K3'] !== undefined && !one['Kimi K3'].text.includes('1017'),
    JSON.stringify({ flash: one['V4.1 Flash'], kimi: one['Kimi K3'] }))
  check('the seat\'s row is the current one and the last of that level',
    rows.currentRow !== null && rows.currentRow !== undefined && rows.currentRow.current === true && rows.currentRow.name === 'GLM-5.3',
    JSON.stringify(rows.currentRow))
  check('every row carries no rate meter',
    levelOne.every((row) => Object.hasOwn(row, 'meter') === false),
    JSON.stringify(levelOne.map((row) => Object.keys(row))))
  check('the seat\'s row is drawn as the list rows are: same height, padding, radius and layout',
    rows.currentRow !== null && one['V4.1 Flash'] !== undefined && same(rows.currentRow.box, one['V4.1 Flash'].box),
    JSON.stringify({ current: rows.currentRow, listed: one['V4.1 Flash'] }))
  check('the second level lists its models with no rate meter',
    two['GLM-5.3'] !== undefined && Object.hasOwn(two['GLM-5.3'], 'meter') === false,
    JSON.stringify(two['GLM-5.3']))
  const press = r.modelPress || {}
  check('with the hover preference on, a press on the open model menu keeps it up',
    press.opened === true && press.kept === true,
    JSON.stringify({ opened: press.opened, kept: press.kept }))
  const descriptions = r.modelDescriptions || {}
  check('every row of the first level carries a description line while Model descriptions is on, and turning it off takes the line off that level alone',
    descriptions.listed === 3 && descriptions.lines === 3 &&
      descriptions.bareListed === 3 && descriptions.bareLines === 0 &&
      descriptions.secondLevelLines === 0 && descriptions.bareSecondLevelLines === 0,
    JSON.stringify(descriptions))
  const picker = r.modelPicker || {}
  check('switching the model picker off hands the host\'s own seat back, and on takes it over again',
    picker.off !== undefined && picker.off.trigger === false && picker.off.hostMarked === false &&
      picker.back !== undefined && picker.back.trigger === true && picker.back.hostMarked === true,
    JSON.stringify(picker))
  const seat = r.modelSeat || {}
  check('the seat\'s own line carries the tag with the Flash model in force, on a neutral plate and ink',
    seat.text !== null && seat.text.includes('V4.1 Flash') && seat.text.includes('1017') &&
      seat.tagBg !== null && seat.tagBg !== 'rgba(0, 0, 0, 0)' && neutral(seat.tagBg) && neutral(seat.tagColor),
    JSON.stringify(seat))
  const external = r.externalControls || {}
  check('the control registry mounts an independent model picker, rejects an unknown id and preserves the composer on teardown',
    external.available === true && external.mountedCount === 2 && external.externalPopover === true &&
      external.unknownRejected === true && external.remainingCount === 1 && external.slotClean === true &&
      external.externalStyle != null && external.externalStyle.display === 'flex' && external.externalStyle.height === '28px' &&
      external.externalStyle.border === '0px' && external.externalStyle.background === 'rgba(0, 0, 0, 0)',
    JSON.stringify(external))
}
```

- [ ] **Step 25: 修改 host-half.mjs**

删除 `console.log('\nhost half — the peak rate catalog')` 到 `check('a method the rate route does not take is turned away', ...)` 之间的整个峰谷 block。

保留价格快照和会话成本 block。

新增：

```js
console.log('\nhost half — the peak rate route is gone')
const host = fakeHost(mod, { fenced: true, home: scratchHome })
const absentRate = await request(host, '/dsh-claude-style-lite/peakrate', 'GET', '', browser)
check('the removed peak-rate route is not registered', absentRate.status === 404, `HTTP ${absentRate.status}`)
```

- [ ] **Step 26: 修改 stand-in/host-fetch.js**

删除整个 `/peakrate` 分支：从 `if (url === '/dsh-claude-style/peakrate') {` 开始，到该分支闭合的 `}` 结束。

保留 `/prices`、`/session-cost`、`/usage` 分支。

执行：

```bash
rg -n 'peakrate' packages/testing/smoke/stand-in/host-fetch.js
```

Expected: 无输出。

- [ ] **Step 27: 修改 page.mjs**

从 `PROBE_PARTS` 删除：

```js
'model-meter.js',
```

新增：

```js
'model-rows.js',
```

- [ ] **Step 28: 删除峰谷 token**

`packages/client/src/theme/tokens.json` 删除：

```json
{
  "token": "--dsh-claude-meter-peak",
  ...
},
{
  "token": "--dsh-claude-meter-valley",
  ...
}
```

删除前执行：

```bash
rg -n 'meter-peak|meter-valley' packages/client/src
```

Expected: 只命中 `tokens.json` 和 `peakrate.css`；`peakrate.css` 已删除。

- [ ] **Step 29: 更新账本**

删除 `importance-unreachable.json` 中：

```json
"body[data-dsh-claude-style] .dsh-claude-peakrate[data-period=peak]",
"body[data-dsh-claude-style] .dsh-claude-peakrate[data-period=campaign]",
"body[data-dsh-claude-style] .dsh-claude-peakrate[data-period=offPeak]"
```

删除 `skin-literals.json` 的 `files` 中：

```text
packages/testing/smoke/probe/model-meter.js
```

删除 `document-lookups.json` 中 `model-meter` 相关条目（若有）。

重新生成 `check-numbers.json`：

```bash
node packages/testing/check-numbers.mjs
```

Expected: 记录不再包含 `packages/testing/smoke/probe/model-meter.js`，也不再包含 `model-meter` case 的 check 名称。

- [ ] **Step 30: 运行目标测试**

```bash
npm run build
npm run lint
node packages/testing/stand-in.mjs --spec packages/testing/specs/behaviour/model-picker
node packages/testing/smoke/host-half.mjs
```

Expected:

- build 通过。
- lint 通过。
- model-picker specs 通过。
- host-half 通过，`/peakrate` 不存在。

- [ ] **Step 31: 运行价格与用量回归**

```bash
node packages/testing/stand-in.mjs --case model-rows
node packages/testing/e2e.mjs --scenario statsPosition,statsOverlay,statsFooter
```

Expected: PASS。

- [ ] **Step 32: 提交**

```bash
git add packages/client/src packages/host packages/contracts packages/testing scripts .github package.json
git commit -m "refactor: 完整移除峰谷费率并保留价格日历"
```

---

### Task 6: R3 删除消息气泡入场动画

**Files:**
- Delete: `packages/client/src/features/chat-send/`
- Modify: `packages/client/src/core/scheduler.ts`
- Modify: `packages/client/src/features/chat-follow/chat-follow.ts`
- Modify: `packages/client/src/features/chat-follow/chat-follow.manifest.ts`
- Modify: `packages/client/src/features/chat-fold/message-fold.ts`
- Modify: `packages/client/src/constants.ts`
- Modify: `packages/client/src/pure.ts`
- Modify: `packages/contracts/src/prefs.ts`
- Modify: `packages/client/src/features/settings/settings-cards.css`
- Modify: `packages/client/src/shared/motion.css`（只删确认无其他引用的 `dsh-claude-enter-grow`）
- Modify: `packages/testing/smoke/cases/settings.mjs`
- Modify: `packages/testing/smoke/cases/peer.mjs`
- Modify: `packages/testing/smoke/cases/chat.mjs`
- Modify: `packages/testing/lane.mjs`
- Modify: `packages/testing/e2e.mjs`
- Modify: `packages/testing/scenarios.mjs`
- Modify: `packages/testing/scenarios/importance-audit.mjs`
- Modify: `packages/testing/data/document-lookups.json`
- Modify: `packages/testing/data/importance-unreachable.json`
- Modify: `packages/testing/data/check-numbers.json`
- Modify: `packages/testing/faults/patches/chat-follow-962c32df.patch`
- Delete: `packages/testing/specs/logic/send-flight/`
- Delete: `packages/testing/smoke/probe/chat-send.js`
- Delete: `packages/testing/faults/patches/chat-send-14ddf739.patch`
- Delete: `packages/testing/faults/patches/chat-send-27603238.patch`

**Interfaces:**
- Consumes: `submissionHolds()` from `@dsh-claude-style/engine/scroll-owner`
- Produces: `ChatSendHandle` 与 `ui.chatSend` 消失；`chatFollow` 的 `submissionHeld` 直接读引擎状态

- [ ] **Step 1: 写失败测试**

在 `packages/testing/scenarios.mjs` 的 `send` 场景中新增一条静态期望，先让测试失败：

```js
const marks = await context.page.evaluate(() => ({
  ghost: document.querySelector('[data-dsh-claude-send-ghost]') !== null,
  flying: document.querySelectorAll('[data-dsh-claude-send-flight]').length,
  link: document.querySelectorAll('[data-dsh-claude-send-link]').length,
  enter: document.querySelectorAll('[data-dsh-claude-message-enter]').length,
}))
check('Lite leaves no sent-message entrance mark in the page',
  Object.values(marks).every((count) => count === 0 || count === false),
  JSON.stringify(marks))
```

同时保留真实发送证据：

```js
check('the sent row reaches the page and keeps its words',
  settled !== undefined && (settled.rowWords ?? []).join(' ').includes('hello there'),
  JSON.stringify(settled))
```

- [ ] **Step 2: 运行确认失败**

```bash
node packages/testing/e2e.mjs --scenario send
```

Expected: FAIL，因为当前发送动画会写入 ghost 和 flying 标记。

- [ ] **Step 3: 删除 chat-send 目录**

```bash
rm -rf packages/client/src/features/chat-send
```

- [ ] **Step 4: 修改 scheduler.ts**

删除：

```ts
import type { ChatSendHandle } from '../features/chat-send/send-flight'
```

删除：

```ts
chatSend: ChatSendHandle
```

- [ ] **Step 5: 修改 chat-follow.manifest.ts**

```ts
reads: ['chatFold'],
```

- [ ] **Step 6: 修改 chat-follow.ts**

把：

```ts
submissionHeld: () => (ui.chatSend === undefined ? submissionHolds() : ui.chatSend.isEntering()),
```

改为：

```ts
submissionHeld: () => submissionHolds(),
```

确认 `submissionHolds` 仍从 `@dsh-claude-style/engine/scroll-owner` 导入。

- [ ] **Step 7: 修改 message-fold.ts 注释**

删除：

```ts
/* Fold both the submission echo and durable row: send-flight measures the echo immediately.
```

改为：

```ts
/* Fold both the submission echo and durable row: the echo is clamped before it paints.
```

删除：

```ts
/* This observer is installed before send-flight's, so the echo is clamped before flight measures it. */
```

改为：

```ts
/* The echo is settled in the batch that mounted it, before the next paint. */
```

- [ ] **Step 8: 修改 constants.ts**

删除：

```ts
export const CHAT_FLYING_ATTR = 'data-dsh-claude-send-flight'
export const MESSAGE_ENTER_ATTR = 'data-dsh-claude-message-enter'
```

删除相关注释。

保留：

```ts
export const MESSAGE_FOLD_ATTR = 'data-dsh-claude-message-fold'
```

- [ ] **Step 9: 修改 pure.ts**

删除：

```ts
export {
  CHAT_DRAFT_HANDOFF_AT, CHAT_FLIGHT_MS, ...
} from './features/chat-send/send-shape'
export type { ShapeSample } from './features/chat-send/send-shape'
export { chatSendOpaque } from './features/chat-send/send-snapshot'
```

- [ ] **Step 10: 修改 prefs.ts**

删除：

```ts
export const MESSAGE_ENTER_FLIGHT = 'flight'
export const MESSAGE_ENTER_GROW = 'grow'
export const MESSAGE_ENTER_MODES = [MESSAGE_ENTER_FLIGHT, MESSAGE_ENTER_GROW] as const
```

删除 `PREFS` 中：

```ts
chatSend: { type: 'boolean', default: true },
messageEnter: { type: 'choice', values: MESSAGE_ENTER_MODES, default: MESSAGE_ENTER_FLIGHT },
```

- [ ] **Step 11: 修改 settings-cards.css**

删除以下块：

```css
body[data-dsh-claude-style] .dsh-claude-enter-card { ... }
body[data-dsh-claude-style] .dsh-claude-enter-sample { ... }
body[data-dsh-claude-style] .dsh-claude-enter-stack { ... }
body[data-dsh-claude-style] .dsh-claude-enter-bubble { ... }
body[data-dsh-claude-style] .dsh-claude-enter-card[data-enter="grow"] .dsh-claude-enter-bubble { ... }
body[data-dsh-claude-style] .dsh-claude-enter-card[data-enter="flight"] .dsh-claude-enter-bubble { ... }
@keyframes dsh-claude-enter-card-rise { ... }
body[data-dsh-claude-style] .dsh-claude-enter-bubble[data-standing] { ... }
body[data-dsh-claude-style][data-dsh-claude-motion="reduced"] .dsh-claude-enter-bubble { ... }
body[data-dsh-claude-style][data-dsh-claude-motion="reduced"] .dsh-claude-enter-stack { ... }
body[data-dsh-claude-style][data-dsh-claude-motion="reduced"] .dsh-claude-enter-card[data-enter="grow"] ... { ... }
body[data-dsh-claude-style][data-dsh-claude-motion="reduced"] .dsh-claude-enter-card[data-enter="flight"] ... { ... }
```

从 reduced-motion 的 `:is(...)` 中删除 `.dsh-claude-enter-card`。

- [ ] **Step 12: 修改 motion.css**

先执行：

```bash
rg -n 'dsh-claude-enter-grow' packages/client/src
```

Expected: 只命中 `shared/motion.css` 和已删除的 `settings-cards.css` 引用。

若只被消息入场使用，删除：

```css
@keyframes dsh-claude-enter-grow { ... }
```

若被其他动画使用，保留。

- [ ] **Step 13: 修改 settings smoke**

`packages/testing/smoke/cases/settings.mjs` 的 motion 行删除：

```js
'chatSend',
'messageEnter',
```

`peer.mjs` 的 `ported` 集合改为：

```js
const ported = { motion: ['chatAnimations', 'chatWait', 'chatReveal'] }
```

`showsOwnAnswer` 改为：

```js
const showsOwnAnswer = {
  chatAnimations: (answer) => answer.on === true,
  chatWait: (answer) => answer.on === true,
  chatReveal: (answer) => answer.option === 'on',
}
```

第 54–56 行的 evidence 改为：

```js
JSON.stringify({ chatAnimations: answers('motion').chatAnimations, chatWait: answers('motion').chatWait, chatReveal: answers('motion').chatReveal })
```

把第 22–26 行注释中“sent message's entrance / caret”两处删掉，只保留 chat-area 动画、等待行和渐显。

- [ ] **Step 14: 修改 chat smoke**

删除 `packages/testing/smoke/cases/chat.mjs` 中只验证发送动画的断言：

```js
// The hand-over (send-flight.ts's land)
```

保留真实发送、消息行、滚动和失败断言。

- [ ] **Step 15: 修改 lane.mjs、e2e.mjs、scenarios.mjs**

`lane.mjs` 删除：

```js
sendGhost: '[data-dsh-claude-send-ghost]'
sendLink: '[data-dsh-claude-send-link]'
flyingMark: 'data-dsh-claude-send-flight'
```

`e2e.mjs` 的 `sample()` 删除发送替身相关块：

1. 删除 `const ghost = document.querySelector(host.sendGhost)`。
2. 删除 `const marked = [...document.querySelectorAll(...)]` 以及 `adopted` 的赋值与清理。
3. `last` 改为：

```js
const last = rows.length === 0 ? null : rows[rows.length - 1]
```

4. 删除 `frame.ghost`、`frame.shell`、`frame.shellFill`、`frame.links`、`frame.linkPaints`、`frame.ghostWords`、`frame.rowFlying` 与 `takeOff` 采样块。
5. 保留：

```js
frame.echo
frame.bubble
frame.bubbleFill
frame.rows
frame.rowWords
frame.rowVisible
```

6. 保留 `frame.lag`、`frame.flowTop`、`frame.card`、`frame.cardBottom`、`frame.seat`、`frame.stats`、`frame.statsMode`、`frame.running`，它们是流式跟随与布局的独立证据。

`scenarios.mjs`：

删除只服务飞行动画的 helper：

```js
function flightBoxes(flight)
function flightGap(frame)
function onRowCheck(shown)
async function handoverFrames(context)
```

这四段功能实现整块删除，不是改成空函数。

删除常量：

```js
const LANDING_GIVE = 4
```

新增一个不等待 ghost 的真实发送 helper：

```js
/** The frames after a turn settles, and the last frame carrying a reader row. */
function settledFrames(trace) {
  let settled = trace[trace.length - 1]
  for (let at = trace.length - 1; at >= 0; at -= 1) {
    if ((trace[at].rows ?? 0) > 0) { settled = trace[at]; break }
  }
  return { frames: trace, settled }
}
```

把 `send` 场景改为：

```js
send: {
  script: 'greeting',
  prompt: 'hello there',
  async assert(context) {
    const { page, session, trace } = context
    await page.waitForTimeout(300)
    const later = await page.evaluate(() => window.__e2eTrace ?? [])
    const frames = later.length >= trace.length ? later : trace
    const { settled } = settledFrames(frames)
    const readerRows = frames.filter((frame) => (frame.rows ?? 0) > 0)
    const last = frames[frames.length - 1]
    const stray = await page.evaluate(() => ({
      ghost: document.querySelector('[data-dsh-claude-send-ghost]') !== null,
      flying: document.querySelectorAll('[data-dsh-claude-send-flight]').length,
      link: document.querySelectorAll('[data-dsh-claude-send-link]').length,
      enter: document.querySelectorAll('[data-dsh-claude-message-enter]').length,
    }))
    return [
      check("the reader's message reaches the transcript",
        settled.rows > 0 && settled.rowVisible === true && (settled.rowWords ?? []).includes('hello there'),
        `rows=${settled.rows} visible=${settled.rowVisible} words=${JSON.stringify(settled.rowWords)}`),
      check('one submission leaves one reader row',
        settled.rows === 1 && readerRows.length > 0,
        `settled rows=${settled.rows}, frames carrying a row=${readerRows.length}`),
      check("the reader's words are on screen from the first row-bearing frame",
        readerRows.every((frame) => frame.rowVisible === true && (frame.rowWords ?? []).includes('hello there')),
        JSON.stringify(readerRows.slice(0, 3))),
      check('no entrance stand-in, hidden row or entrance mark is left behind',
        Object.values(stray).every((count) => count === 0 || count === false),
        JSON.stringify(stray)),
      check('the final frame carries no flying mark',
        last !== undefined && last.rowVisible === true,
        JSON.stringify({ last })),
      check('the console carries no problem',
        session.problems.length === 0,
        session.problems.slice(0, 3).join(' | ')),
    ]
  },
},
```

把 `sendFull` 改为：

```js
sendFull: {
  script: 'greeting',
  prompt: 'hello there',
  async afterTurn(context) {
    for (let index = 0; index < 6; index += 1) {
      await sendPrompt(context.page, 'fill the transcript')
      await waitForTurn(context.page)
    }
    await context.page.waitForTimeout(600)
  },
  async assert(context) {
    const { page, session, trace } = context
    await page.waitForTimeout(300)
    const later = await page.evaluate(() => window.__e2eTrace ?? [])
    const frames = later.length >= trace.length ? later : trace
    const { settled } = settledFrames(frames)
    const rows = frames.filter((frame) => (frame.rows ?? 0) > 1)
    const stray = await page.evaluate(() => ({
      ghost: document.querySelector('[data-dsh-claude-send-ghost]') !== null,
      flying: document.querySelectorAll('[data-dsh-claude-send-flight]').length,
      link: document.querySelectorAll('[data-dsh-claude-send-link]').length,
      enter: document.querySelectorAll('[data-dsh-claude-message-enter]').length,
    }))
    return [
      check('a full transcript glides to the new row',
        rows.length > 0 && settled.rows > 1,
        `frames with rows=${rows.length}, settled rows=${settled.rows}`),
      check("the new row is visible and carries the reader's words",
        settled.rowVisible === true && (settled.rowWords ?? []).includes('hello there'),
        JSON.stringify({ rows: settled.rows, visible: settled.rowVisible, words: settled.rowWords })),
      check('no entrance stand-in, hidden row or entrance mark is left behind',
        Object.values(stray).every((count) => count === 0 || count === false),
        JSON.stringify(stray)),
      check('the console carries no problem',
        session.problems.length === 0,
        session.problems.slice(0, 3).join(' | ')),
    ]
  },
},
```

`flightBoxes` / `flightGap` / `onRowCheck` / `handoverFrames` 不再被任何场景引用，删除后执行：

```bash
rg -n 'flightBoxes|flightGap|onRowCheck|handoverFrames|LANDING_GIVE|sendGhost|flyingMark|sendLink' packages/testing/scenarios.mjs packages/testing/e2e.mjs packages/testing/lane.mjs
```

Expected: 无输出。

- [ ] **Step 16: 修改 importance-audit**

删除：

```js
'[data-dsh-claude-send-ghost]',
'[data-dsh-claude-send-flight]',
'[data-dsh-claude-send-link]',
```

- [ ] **Step 17: 删除 send-flight 测试与故障补丁**

```bash
rm -rf packages/testing/specs/logic/send-flight
rm packages/testing/smoke/probe/chat-send.js
rm packages/testing/faults/patches/chat-send-14ddf739.patch
rm packages/testing/faults/patches/chat-send-27603238.patch
```

修改 `packages/testing/faults/patches/chat-follow-962c32df.patch`：

- 该补丁的 `PeakRateHandle` 段与 `ChatSendHandle` 段都属于已删功能的故障注入，两份功能都不再存在，整份补丁删除：

```bash
rm packages/testing/faults/patches/chat-follow-962c32df.patch
```

- 删除后运行：

```bash
node packages/testing/faults.mjs
```

Expected: 通过；没有故障补丁指向不存在的文件。

- [ ] **Step 18: 更新账本**

删除 `document-lookups.json` 的 `files` 中：

```text
packages/client/src/features/chat-send/send-rows.ts
packages/client/src/features/chat-send/send-flight.ts
packages/client/src/features/chat-send/send-grow.ts
```

删除 `importance-unreachable.json` 中 `messageEnter` 相关选择器。

重新生成 `check-numbers.json`：

```bash
node packages/testing/check-numbers.mjs
```

Expected: 记录不再包含 `packages/testing/smoke/probe/chat-send.js`，也不再包含 `send-flight` 的 check 名称。

- [ ] **Step 19: 运行目标测试**

```bash
npm run build
npm run lint
node packages/testing/stand-in.mjs --spec packages/testing/specs/behaviour/chat-follow,packages/testing/specs/behaviour/message-fold
node packages/testing/stand-in.mjs --case peer-chat-ux,settings,late-forms
node packages/testing/e2e.mjs --scenario send,sendFull
```

Expected: PASS。

- [ ] **Step 20: 提交**

```bash
git add packages/client/src packages/contracts/src/prefs.ts packages/testing
git commit -m "refactor: 移除消息气泡入场动画并保留真实发送"
```

---

### Task 7: R4 推理滑块 Canvas 填充

**Files:**
- Create: `packages/client/src/features/effort/fill-canvas.ts`
- Modify: `packages/client/src/features/effort/slider.ts`
- Modify: `packages/client/src/features/effort/effort-picker.css`
- Modify: `packages/client/src/theme/tokens.json`
- Create: `packages/testing/specs/logic/effort-picker/fill-canvas.spec.ts`
- Create: `packages/testing/specs/behaviour/effort-picker/canvas-fill.spec.mjs`
- Modify: `packages/testing/data/surface.json`
- Modify: `packages/testing/data/importance-unreachable.json`
- Modify: `packages/testing/data/check-numbers.json`

**Interfaces:**
- Consumes: `requestFrame(task)`、`motionMs('--dsh-claude-duration-move')`、`motionEaseAt('--dsh-claude-ease-glide', progress)`、`motionReduced()`、`resolveColour(value)`
- Produces: `createFillCanvas({ track, reduced })` 返回 `{ mount, setTarget, draw, pause, resize, dispose }`

- [ ] **Step 1: 写失败测试**

新建 `packages/testing/specs/logic/effort-picker/fill-canvas.spec.ts`：

```ts
/**
 * The effort fill's Canvas geometry as numbers: the right edge a target asks
 * for, the eased distance at the move token's ends, and the reduced-motion
 * answer. The renderer paints what these answer.
 *
 * @capability effort-picker
 * @features effort
 * @risk The canvas fill lands a pixel off the knob, eases past its end, or keeps painting after the reader asked for reduced motion.
 */
import { expect, test } from 'vitest'
import { fillRight, fillWidthDev, fillEased } from '@dsh-claude-style/client/pure'

test('the fill right edge tracks the knob centre', () => {
  expect(fillRight(0, 16)).toBe(8)
  expect(fillRight(100, 16)).toBe(108)
  expect(fillRight(50, 16)).toBe(58)
})

test('the backing store is capped at DPR 2', () => {
  expect(fillWidthDev(320, 1)).toBe(320)
  expect(fillWidthDev(320, 2)).toBe(640)
  expect(fillWidthDev(320, 3)).toBe(640)
})

test('the eased distance lands on both ends', () => {
  const eased = fillEased(0.5, 0, 100)
  expect(eased).toBeGreaterThan(0)
  expect(eased).toBeLessThan(100)
  expect(fillEased(0, 0, 100)).toBe(0)
  expect(fillEased(1, 0, 100)).toBe(100)
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run packages/testing/specs/logic/effort-picker/fill-canvas.spec.ts
```

Expected: FAIL，`fillRight` 等导出不存在。

- [ ] **Step 3: 在 pure.ts 暴露纯函数**

在 `fill-canvas.ts` 导出：

```ts
/** The fill's right edge: the knob's centre, in CSS pixels from the track's left end. */
export function fillRight(travel: number, knobWidth: number) {
  return Math.round(travel) + knobWidth / 2
}

/** The canvas backing store's width in device pixels, capped at DPR 2. */
export function fillWidthDev(width: number, dpr: number) {
  return Math.round(width * Math.min(dpr > 0 ? dpr : 1, 2))
}

/** The eased fill edge between two targets. */
export function fillEased(progress: number, from: number, to: number) {
  const p = Math.max(0, Math.min(1, progress))
  const eased = motionEaseAt('--dsh-claude-ease-glide', p)
  return from + (to - from) * eased
}
```

在 `pure.ts` 新增：

```ts
export { fillEased, fillRight, fillWidthDev } from './features/effort/fill-canvas'
```

- [ ] **Step 4: 实现 fill-canvas.ts**

完整实现：

```ts
import { resolveColour } from '@dsh-claude-style/engine/colour'
import { requestFrame } from '@dsh-claude-style/engine/frame'
import { subscribePageHidden } from '../../core/page-visibility'
import { motionEaseAt, motionMs } from '../../shared/motion'

/** The colour the fill paints: the computed colour of a probe element carrying the old rule. */
const FILL_PROBE_CLASS = 'dsh-claude-effort-fill-probe'
/** The groove's height and left corner, in CSS pixels. */
const FILL_H = 26
const FILL_RADIUS = 8
/** The canvas's device-pixel limit, as matrix.ts keeps it. */
const DPR_LIMIT = 2

export interface FillCanvasTarget {
  right: number
  animate: boolean
  dragging: boolean
}

/** The fill's right edge: the knob's centre, in CSS pixels from the track's left end. */
export function fillRight(travel: number, knobWidth: number) {
  return Math.round(travel) + knobWidth / 2
}

/** The canvas backing store's width in device pixels, capped at DPR 2. */
export function fillWidthDev(width: number, dpr: number) {
  return Math.round(width * Math.min(dpr > 0 ? dpr : 1, DPR_LIMIT))
}

/** The eased fill edge between two targets. */
export function fillEased(progress: number, from: number, to: number) {
  const p = Math.max(0, Math.min(1, progress))
  const eased = motionEaseAt('--dsh-claude-ease-glide', p)
  return from + (to - from) * eased
}

export function createFillCanvas(options: {
  track: HTMLElement
  reduced: () => boolean
}) {
  const canvas = document.createElement('canvas')
  canvas.className = 'dsh-claude-effort-fill-canvas'
  const context = canvas.getContext('2d')
  if (context === null) throw new Error('effort/fill-canvas: the fill canvas has no 2d context')

  let width = 0
  let dpr = 1
  let fill = 'rgba(0, 0, 0, 0.26)'
  let current = 0
  let target: FillCanvasTarget | null = null
  let startedAt = 0
  let from = 0
  let to = 0
  let animating = false
  let disposed = false
  /** The one task the frame pipeline holds: a second object would be a second request in the same frame. */
  const task = { write(now: number) { tick(now) } }
  let frameRequested = false
  let cancelFrame: (() => void) | null = null

  /** Read the colour the old `.dsh-claude-effort-fill` rule computes, once per size or palette change. */
  function readPalette() {
    const probe = document.createElement('span')
    probe.className = FILL_PROBE_CLASS
    probe.style.cssText = 'position:absolute;left:-10000px;top:-10000px;width:0;height:0'
    options.track.appendChild(probe)
    const value = getComputedStyle(probe).backgroundColor.trim()
    probe.remove()
    const colour = value === '' ? null : resolveColour(value)
    if (colour === null) throw new Error(`effort/fill-canvas: the fill probe computed "${value}", which the canvas cannot paint`)
    fill = `rgba(${colour.red}, ${colour.green}, ${colour.blue}, ${colour.alpha})`
  }

  function resize() {
    width = options.track.clientWidth
    dpr = Math.min(window.devicePixelRatio > 0 ? window.devicePixelRatio : 1, DPR_LIMIT)
    canvas.width = fillWidthDev(width, dpr)
    canvas.height = Math.round(FILL_H * dpr)
    canvas.style.width = `${width}px`
    canvas.style.height = `${FILL_H}px`
    drawAt(current)
  }

  function drawAt(right: number) {
    const devW = fillWidthDev(width, dpr)
    const devH = Math.round(FILL_H * dpr)
    const edge = Math.max(0, Math.min(devW, Math.round(right * dpr)))
    context.clearRect(0, 0, devW, devH)
    if (edge <= 0) return
    context.fillStyle = fill
    context.beginPath()
    context.roundRect(0, 0, edge, devH, [FILL_RADIUS * dpr, 0, 0, FILL_RADIUS * dpr])
    context.fill()
  }

  function requestTick() {
    if (frameRequested || disposed) return
    frameRequested = true
    cancelFrame = requestFrame(task)
  }

  function stopFrame() {
    if (cancelFrame !== null) cancelFrame()
    cancelFrame = null
    frameRequested = false
  }

  function tick(now: number) {
    cancelFrame = null
    frameRequested = false
    if (disposed || !animating) return
    const duration = Math.max(1, motionMs('--dsh-claude-duration-move'))
    const progress = Math.min(1, (now - startedAt) / duration)
    current = fillEased(progress, from, to)
    drawAt(current)
    if (progress >= 1) {
      animating = false
      return
    }
    requestTick()
  }

  /** An off-screen page keeps no frame; the return draws the target once instead of replaying the travel. */
  const stopVisibility = subscribePageHidden((hidden) => {
    if (hidden) {
      stopFrame()
      animating = false
      return
    }
    if (target !== null) {
      current = target.right
      drawAt(current)
    }
  })

  return {
    mount() {
      readPalette()
      resize()
      canvas.style.pointerEvents = 'none'
      options.track.prepend(canvas)
    },
    setTarget(next: FillCanvasTarget) {
      if (disposed) return
      target = next
      if (options.reduced() || next.dragging || !next.animate) {
        stopFrame()
        animating = false
        current = next.right
        drawAt(current)
        return
      }
      from = current
      to = next.right
      startedAt = performance.now()
      animating = true
      requestTick()
    },
    draw() {
      drawAt(current)
    },
    pause() {
      stopFrame()
      animating = false
    },
    resize() {
      readPalette()
      resize()
    },
    dispose() {
      disposed = true
      stopVisibility()
      stopFrame()
      animating = false
      target = null
      canvas.remove()
    },
  }
}
```

- [ ] **Step 5: 修改 slider.ts**

删除：

```ts
const fill = buildElement('div', 'dsh-claude-effort-fill')
```

把：

```ts
track.appendChild(fill)
```

改为：

```ts
const fillCanvas = createFillCanvas({ track, reduced: motionReduced })
fillCanvas.mount()
```

`fillCanvas.mount()` 自己把 Canvas 插到轨道第一个子节点，绘制顺序保持：

```text
canvas fill -> ticks -> matrix -> knob
```

在 `measureTrack()` 中新增尺寸缓存，只在值变化时重建 backing store：

```ts
let canvasSig = ''
function measureTrack(): EffortTrackBox {
  const box = { size: knob.offsetWidth || 16, width: track.clientWidth }
  measured = box
  trackLeft = track.getBoundingClientRect().left
  const sig = `${box.width}@${window.devicePixelRatio > 0 ? window.devicePixelRatio : 1}`
  if (sig !== canvasSig) {
    canvasSig = sig
    // The canvas reads its colour from the probe under the live track: resize after a palette or width change.
    fillCanvas.resize()
  }
  return box
}
```

`fillCanvas` must be declared before `measureTrack()` is first called. Put:

```ts
const fillCanvas = createFillCanvas({ track, reduced: motionReduced })
```

immediately after the `track` element is built and before `fillCanvas.mount()`, then keep `measureTrack()` below it.

`place()` 改为：

```ts
function place(x: number, animate: boolean) {
  const px = Math.round(x)
  const value = `${px}px`
  const right = steps.length === 0 ? 0 : fillRight(px, geometry().size)
  if (value === lastTravel && right === lastRight) return
  lastTravel = value
  lastRight = right
  if (!animate && !dragging) {
    withoutTransition([knob], () => { knob.style.translate = value })
  } else {
    knob.style.translate = value
  }
  fillCanvas.setTarget({ right, animate, dragging })
}
```

删除：

```ts
let lastWidth = ''
```

新增：

```ts
let lastRight = 0
```

`paintApex` 中：

```ts
if (want) {
  fillCanvas.pause()
  root.setAttribute('data-apex', '')
  dotMatrix.wake()
} else {
  root.removeAttribute('data-apex')
  fillCanvas.draw()
}
```

`dispose()` 中新增：

```ts
fillCanvas.dispose()
```

- [ ] **Step 6: 修改 effort-picker.css**

删除 `effort-picker.css` 中三处旧填充规则：

```text
body[data-dsh-claude-style] .dsh-claude-effort-fill
body[data-dsh-claude-style] .dsh-claude-effort[data-dragging] .dsh-claude-effort-fill
body[data-dsh-claude-style] .dsh-claude-effort[data-apex] .dsh-claude-effort-fill
```

删除后执行：

```bash
rg -n 'dsh-claude-effort-fill[^-]' packages/client/src/features/effort/effort-picker.css
```

Expected: 无输出。

把原 `.dsh-claude-effort-fill` 的背景与左侧圆角接到一个不上屏的探针类上；Canvas 只读这一个计算值：

```css
body[data-dsh-claude-style] .dsh-claude-effort-fill-probe {
  background: color-mix(in srgb, var(--dsw-alias-label-primary, #161616) 26%, transparent);
  border-radius: 8px 0 0 8px;
}
```

新增 Canvas 元素自身：

```css
body[data-dsh-claude-style] .dsh-claude-effort-fill-canvas {
  position: absolute;
  left: 0;
  top: 50%;
  height: 26px;
  margin-top: -13px;
  border-radius: 8px 0 0 8px;
  pointer-events: none;
}

body[data-dsh-claude-style] .dsh-claude-effort[data-apex] .dsh-claude-effort-fill-canvas {
  opacity: 0;
}
```

探针只由 `fill-canvas.ts` 在读颜色时临时插入并立即移除，CSS 规则不会命中任何常驻节点。

保留：

- `.dsh-claude-effort-knob` 全部规则。
- `.dsh-claude-effort-ticks`。
- `.dsh-claude-effort-matrix`。
- `.dsh-claude-effort[data-apex] .dsh-claude-effort-ticks { opacity: 0 !important; }`。
- `.dsh-claude-effort[data-apex] .dsh-claude-effort-knob { ... }`。
- focus-visible、dragging、empty。

- [ ] **Step 7: 更新 tokens.json**

`--dsh-claude-duration-move` 的 `use` 改为：

```json
"use": "something travelling along its own track: a fold's door, the reasoning slider's knob and canvas fill, a hint moving from one colour disc to the next"
```

保留 token 值 `200ms`。

- [ ] **Step 8: 更新 surface.json**

新增：

```json
{ "id": "effort.fill", "selector": ".dsh-claude-effort-fill-canvas", "feature": "effort", "sees": "the plain fill's canvas: the groove from the track's left end to the knob's centre, drawn on demand" }
```

保留：

```json
{ "id": "effort.particle", ... }
{ "id": "effort.track", ... }
{ "id": "effort.knob", ... }
{ "id": "effort.value", ... }
{ "id": "effort.value-preview", ... }
```

- [ ] **Step 9: 新增行为测试**

新建 `packages/testing/specs/behaviour/effort-picker/canvas-fill.spec.mjs`：

```js
/**
 * The plain effort fill is a canvas that follows the knob, hands the groove to
 * the top rung's matrix and stops painting under reduced motion.
 *
 * @capability effort-picker
 * @features effort
 * @risk The fill lags the knob, keeps painting over the top rung's matrix, or repaints after the card closes.
 */
import { spec } from '../../fixtures/behaviour.mjs'
import { openSlider, stopX } from '../../fixtures/effort-slider.mjs'

export default spec({ page: 'effort' }, ({ test }) => {
  test('the plain fill is a canvas and the DOM fill is gone', async (t) => {
    const { track, knob, y } = await openSlider(t, 4)
    t.expectThat.equal(await t.read.count('.dsh-claude-effort-fill'), 0, 'no DOM fill remains')
    t.expectThat.equal(await t.read.count(t.surface('effort.fill')), 1, 'one fill canvas stands')
    await t.page.mouse.click(stopX(track, knob, 0.5), y)
    await t.settle()
    const before = await t.read.pixels(t.surface('effort.fill'))
    await t.page.mouse.click(stopX(track, knob, 0.1), y)
    await t.settle()
    const after = await t.read.pixels(t.surface('effort.fill'))
    t.expectThat.equal(before !== null && after !== null && before !== after, true, 'the canvas repaints when the level moves')
  })

  test('the top rung hides the plain fill and keeps the matrix', async (t) => {
    const { track, knob, y } = await openSlider(t, 4)
    await t.page.mouse.click(stopX(track, knob, 1), y)
    await t.settle()
    const fill = await t.read.computed(t.surface('effort.fill'), 'opacity')
    t.expectThat.equal(fill, '0', 'the plain fill is transparent at the top rung')
    t.expectThat.equal(await t.read.count(t.surface('effort.particle')), 1, 'the matrix canvas still stands')
  })

  test('reduced motion still draws the fill where the pointer lands', async (t) => {
    await t.prefs({ motion: 'reduced' })
    const { track, knob, y } = await openSlider(t, 4)
    await t.page.mouse.click(stopX(track, knob, 0.5), y)
    await t.settle()
    const pixels = await t.read.pixels(t.surface('effort.fill'))
    t.expectThat.equal(pixels !== null && pixels > 0, true, 'the fill is drawn without a transition')
  })

  test('closing the card leaves the canvas still', async (t) => {
    const { track, knob, y } = await openSlider(t, 4)
    await t.page.mouse.click(stopX(track, knob, 0.8), y)
    await t.settle()
    await t.page.click(t.surface('effort.trigger'))
    await t.settle()
    const open = await t.read.attribute(t.surface('effort.popover'), 'data-open')
    t.expectThat.equal(open, 'false', 'the card is closed')
    const before = await t.read.pixels(t.surface('effort.fill'))
    await t.page.waitForTimeout(120)
    const after = await t.read.pixels(t.surface('effort.fill'))
    t.expectThat.equal(before, after, 'the closed fill canvas paints no new frame')
  })
})
```

- [ ] **Step 10: 运行目标测试**

```bash
npx vitest run packages/testing/specs/logic/effort-picker/fill-canvas.spec.ts
node packages/testing/stand-in.mjs --spec packages/testing/specs/behaviour/effort-picker/canvas-fill.spec.mjs
```

Expected: PASS。

- [ ] **Step 11: 静态检查**

```bash
rg -n 'fill\.style\.width|transition:\s*width' packages/client/src/features/effort
rg -n 'dsh-claude-effort-fill\b' packages/client/src packages/testing
```

Expected:

- 第一条无输出。
- 第二条只命中 `.dsh-claude-effort-fill-canvas` 相关选择器，不命中旧 `.dsh-claude-effort-fill`。

- [ ] **Step 12: 提交**

```bash
git add packages/client/src/features/effort packages/client/src/pure.ts packages/client/src/theme/tokens.json packages/testing
git commit -m "perf: 推理滑块普通填充改为 Canvas 2D"
```

---

### Task 8: R5 删除自绘光标

**Files:**
- Delete: `packages/client/src/features/caret/`
- Modify: `packages/client/src/constants.ts`
- Modify: `packages/contracts/src/prefs.ts`
- Modify: `packages/client/src/theme/tokens.json`
- Modify: `packages/client/src/features/settings/settings-cards.css`
- Modify: `packages/client/src/theme/chrome.css`
- Modify: `packages/client/src/features/model/sub-menu.ts`
- Modify: `packages/testing/smoke/cases/settings.mjs`
- Modify: `packages/testing/smoke/cases/peer.mjs`
- Modify: `packages/testing/smoke/page.mjs`
- Modify: `packages/testing/smoke/probe/shell-palette.js`
- Modify: `packages/testing/specs/logic/preferences/stored-values.spec.ts`
- Modify: `packages/testing/specs/behaviour/model-picker/search.spec.mjs`
- Create: `packages/testing/specs/behaviour/composer-caret/native.spec.mjs`
- Delete: `packages/testing/smoke/probe/chat-caret.js`
- Modify: `packages/testing/data/element-collections.json`
- Modify: `packages/testing/data/document-lookups.json`
- Modify: `packages/testing/data/importance-unreachable.json`
- Modify: `packages/testing/data/skin-literals.json`
- Modify: `packages/testing/data/check-numbers.json`
- Modify: `docs/THIRD_PARTY_NOTICES.md`

**Interfaces:**
- Consumes: 浏览器原生 `caret-color`
- Produces: `caretMotion`、`CARET_MOTION_*`、自绘层和预览全部消失；`shared/composer-caret.ts` 保持不变

- [ ] **Step 1: 写失败测试**

新建 `packages/testing/specs/behaviour/composer-caret/native.spec.mjs`：

```js
/**
 * Lite leaves the browser's caret alone: the composer's caret colour is not
 * transparent, no drawn layer stands in the page, and typing still works.
 *
 * @capability composer-caret
 * @features composer
 * @risk A reader cannot see where typing will land, or the skin keeps a transparent caret after removing its own.
 */
import { spec, host } from '../../fixtures/behaviour.mjs'

const FIELD = host('composer.input')

export default spec({ page: 'composer' }, ({ test }) => {
  test('the composer keeps the native caret', async (t) => {
    await t.page.locator(FIELD).click()
    const reading = await t.page.locator(FIELD).evaluate((element) => ({
      caret: getComputedStyle(element).caretColor,
      layers: document.querySelectorAll('[data-dsh-claude-caret-layer]').length,
      marks: document.querySelectorAll('[data-dsh-claude-caret]').length,
    }))
    t.expectThat.equal(reading.caret !== 'rgba(0, 0, 0, 0)', true, `the native caret is visible (${reading.caret})`)
    t.expectThat.equal(reading.layers, 0, 'no drawn caret layer stands')
    t.expectThat.equal(reading.marks, 0, 'no drawn caret mark stands')
  })
})
```

- [ ] **Step 2: 运行确认失败**

```bash
node packages/testing/stand-in.mjs --spec packages/testing/specs/behaviour/composer-caret/native.spec.mjs
```

Expected: FAIL，因为当前 caret feature 会把 `caret-color` 改为透明并插入 layer。

- [ ] **Step 3: 删除 caret 目录**

```bash
rm -rf packages/client/src/features/caret
```

- [ ] **Step 4: 修改 constants.ts**

删除：

```ts
export const CARET_ATTR = 'data-dsh-claude-caret'
export const CARET_LAYER_ATTR = 'data-dsh-claude-caret-layer'
export const CARET_VISIBLE_ATTR = 'data-dsh-claude-caret-visible'
export const CARET_HOST_ATTR = 'data-dsh-claude-caret-host'
export const CARET_FIELD_ATTR = 'data-dsh-claude-field'
```

删除相关注释。

保留：

```ts
export const QUIET_ATTR = 'data-dsh-claude-quiet'
```

- [ ] **Step 5: 修改 prefs.ts**

删除：

```ts
export const CARET_MOTION_OFF = 'off'
export const CARET_MOTION_TYPING = 'typing'
export const CARET_MOTIONS = [CARET_MOTION_TYPING, CARET_MOTION_OFF] as const
```

删除：

```ts
caretMotion: { type: 'choice', values: CARET_MOTIONS, default: CARET_MOTION_TYPING },
```

- [ ] **Step 6: 修改 tokens.json**

先运行：

```bash
rg -n 'period-preview-caret|period-blink|duration-instant' packages/client/src
```

删除：

```json
{
  "token": "--dsh-claude-period-preview-caret",
  ...
}
```

若 `--dsh-claude-period-blink` 只被 caret 层与预览使用，删除：

```json
{
  "token": "--dsh-claude-period-blink",
  ...
}
```

若 `--dsh-claude-duration-instant` 只被 caret 层与预览使用，删除；否则保留。

- [ ] **Step 7: 修改 settings-cards.css**

删除：

```css
body[data-dsh-claude-style] .dsh-claude-caret-card { ... }
body[data-dsh-claude-style] .dsh-claude-caret-sample { ... }
body[data-dsh-claude-style] .dsh-claude-caret-sample-text { ... }
body[data-dsh-claude-style] .dsh-claude-caret-piece { ... }
body[data-dsh-claude-style] .dsh-claude-caret-piece[data-in] { ... }
body[data-dsh-claude-style] .dsh-claude-caret-sample-bar { ... }
body[data-dsh-claude-style] .dsh-claude-caret-sample-bar[data-typing] { ... }
body[data-dsh-claude-style] .dsh-claude-caret-sample-bar.dsh-claude-caret-typing { ... }
body[data-dsh-claude-style] .dsh-claude-caret-sample-bar.dsh-claude-caret-off { ... }
@keyframes dsh-claude-caret-blink { ... }
```

删除 reduced-motion 中：

```css
.dsh-claude-caret-piece
.dsh-claude-caret-sample-bar
.dsh-claude-caret-typing::before
```

从 `:is(...)` 中删除 `.dsh-claude-caret-card`。

- [ ] **Step 8: 修改 chrome.css**

删除只提及 `caret.css` 的注释。

- [ ] **Step 9: 修改 sub-menu.ts**

删除只说明 caret 的注释。

- [ ] **Step 10: 修改 settings smoke**

`packages/testing/smoke/cases/settings.mjs`：

删除 motion 行：

```js
'caretMotion',
```

删除从：

```js
const caretPreview = settings.caretPreview || {}
```

到包含这两条 check 的整段：

```text
the caret row previews its two answers
the on card's caret glides
```

`peer.mjs`：

- `ported` 已在 Task 6 改为 `['chatAnimations', 'chatWait', 'chatReveal']`，本步不再修改。
- `showsOwnAnswer` 已在 Task 6 删除 `caretMotion`，本步不再修改。

`packages/testing/smoke/probe/shell-palette.js`：

删除从：

```js
// The composer caret's cards: one line of two character pieces and a bar ...
```

到：

```js
r.settings.caretPreview = {
  typing: caretRead(typingCaret),
  standing: caretRead(standingCaret),
  off: caretRead(offCaret),
}
caretHost.remove()
```

整段删除，包括：

```js
var caretHost = document.createElement('div')
var caretCard = function (kind, typing) { ... }
var typingCaret = caretCard('typing', true)
var standingCaret = caretCard('typing', false)
var offCaret = caretCard('off', false)
var caretRead = function (one) { ... }
```

保留紧随其后的新文字渐显预览块：

```js
// The new-text fade row's cards: ...
```

执行：

```bash
rg -n 'caretPreview|caretCard|caretRead|dsh-claude-caret-card|dsh-claude-caret-sample' packages/testing
```

Expected: 无输出。

- [ ] **Step 11: 修改 page.mjs**

从 `PROBE_PARTS` 删除：

```js
'chat-caret.js',
```

- [ ] **Step 12: 修改偏好测试**

`stored-values.spec.ts` 删除：

```ts
test('the caret switch reads the retired explicit-moves tier as on', () => { ... })
```

- [ ] **Step 13: 修改 search.spec.mjs**

删除：

```js
t.expectThat.equal(await t.read.computed(field, 'caret-color'), 'rgba(0, 0, 0, 0)', 'the native caret is pressed down')
```

改为：

```js
t.expectThat.equal(await t.read.computed(field, 'caret-color') !== 'rgba(0, 0, 0, 0)', true, 'the native caret is visible')
```

- [ ] **Step 14: 删除 chat-caret probe**

```bash
rm packages/testing/smoke/probe/chat-caret.js
```

- [ ] **Step 15: 更新账本**

删除 `element-collections.json` 的 `files` 中：

```text
packages/client/src/features/caret/caret.ts
```

删除 `importance-unreachable.json` 中：

```json
"body[data-dsh-claude-style] textarea[data-dsh-claude-caret]",
"body[data-dsh-claude-style] [data-dsh-claude-caret-host]"
```

删除 `skin-literals.json` 的 `files` 中：

```text
packages/testing/smoke/probe/chat-caret.js
```

重新生成 `check-numbers.json`：

```bash
node packages/testing/check-numbers.mjs
```

Expected: 记录不再包含 `chat-caret.js` 的 check 名称，也不再包含 caret preview 的 check 名称。

删除 `document-lookups.json` 中 caret 条目（若有）。

- [ ] **Step 16: 修改第三方声明**

`docs/THIRD_PARTY_NOTICES.md` 把 caret 来源说明改为：

```text
The composer caret was ported from dsh-chat-ux in upstream dsh-claude-style.
dsh-claude-style-lite removes it and uses the browser's native caret.
```

- [ ] **Step 17: 静态检查**

```bash
rg -n 'caretMotion|CARET_MOTION|caret-measure|features/caret|CARET_ATTR|CARET_LAYER_ATTR|CARET_HOST_ATTR|CARET_VISIBLE_ATTR|CARET_FIELD_ATTR' packages scripts locale
rg -n 'caret-color:\s*transparent' packages/client/src
```

Expected: 两条都无输出。

- [ ] **Step 18: 运行目标测试**

```bash
npm run build
npm run lint
node packages/testing/stand-in.mjs --spec packages/testing/specs/behaviour/composer-caret/native.spec.mjs
node packages/testing/stand-in.mjs --spec packages/testing/specs/behaviour/model-picker/search.spec.mjs
npx vitest run packages/testing/specs/logic/composer-caret/caret.spec.ts
```

Expected: PASS。`composer-caret/caret.spec.ts` 保留，测试共享 `composerComposing()`。

- [ ] **Step 19: 提交**

```bash
git add packages/client/src packages/contracts/src/prefs.ts packages/testing docs/THIRD_PARTY_NOTICES.md
git commit -m "refactor: 移除自绘光标并恢复浏览器原生光标"
```

---

### Task 9: R6/R7 身份、许可证、发布材料复核

**Files:**
- Modify: `LICENSE`
- Modify: `docs/NOTICE.md`
- Modify: `docs/THIRD_PARTY_NOTICES.md`
- Modify: `package.json`
- Modify: `README.md`
- Modify: `README.en.md`
- Create: `docs/CHANGES-FROM-UPSTREAM.md`
- Create: `docs/AB-PERFORMANCE.md`（先建空模板，Task 13 填数据）
- Modify: `scripts/release/release-state.mjs`
- Modify: `scripts/release/dist-branch.mjs`
- Modify: `scripts/release/release-pack.mjs`

**Interfaces:**
- Consumes: Task 3 的独立身份
- Produces: 许可证、NOTICE、发布脚本和文档全部指向 Lite；包中不含 Anthropic 字体

- [ ] **Step 1: 修改 LICENSE**

在 MIT 文本之后追加：

```text
---

Fork notice: dsh-claude-style-lite is a fork of dsh-claude-style by Nwflower,
based on commit 8cafcacd5aa574faa75b1912b8934bede7936b73 (version 0.20.3).
The original MIT license and copyright notice above are retained.
```

保留 Sodium PolyForm Shield 段、字体段、Crab artwork 段不变。

- [ ] **Step 2: 修改 docs/NOTICE.md**

在开头增加：

```markdown
# Notice

dsh-claude-style-lite is a fork of dsh-claude-style by Nwflower, based on
commit 8cafcacd5aa574faa75b1912b8934bede7936b73 (0.20.3). The upstream MIT
license and all third-party notices travel with this fork.
```

保留 Sodium 段原文。

- [ ] **Step 3: 新建 docs/CHANGES-FROM-UPSTREAM.md**

```markdown
# Changes from upstream

Upstream: `Nwflower/dsh-claude-style`
Commit: `8cafcacd5aa574faa75b1912b8934bede7936b73`
Version: `0.20.3`

## Removed

- Automatic reasoning expand/collapse.
- Peak / off-peak rate meter, catalog route, cache and refresh timer.
- Sent-message bubble flight and grow entrance animations.
- Drawn composer caret.

## Changed

- Reasoning-effort slider paint: the plain fill is drawn on a Canvas 2D layer.
- Plugin identity: package, route prefix, settings namespace, skin id and locale.
- Price data generation now reads `packages/host/data/pricing-calendar.json`.

## Kept

- Claude / DeepSeek brands, themes and tokens.
- Model picker, descriptions, search and selection.
- Session, navigation, folding, process summary and waiting states.
- Answer text reveal (`chatReveal`).
- Usage, session cost, prices and context statistics.
- Mascots, sound cues, Sodium engine and long-session optimizations.
```

- [ ] **Step 4: 修改 release-state.mjs**

把：

```js
const PACKAGE = 'dsh-claude-style'
```

改为：

```js
const PACKAGE = 'dsh-claude-style-lite'
```

- [ ] **Step 5: 修改 dist-branch.mjs**

把：

```js
'-c', 'user.name=dsh-claude-style release',
```

改为：

```js
'-c', 'user.name=dsh-claude-style-lite release',
'-c', 'user.email=release@invalid',
```

提交信息改为：

```text
chore(release): ${tag}\n\nGenerated by scripts/release/dist-branch.mjs from the ${tag} sources; the files are the npm package's own contents.
```

- [ ] **Step 6: 修改 release-pack.mjs**

`scripts/release/release-pack.mjs` 不写死包名，只通过 `npm pack` 读取根 `package.json`。在 `release-pack: build` 之前新增：

```js
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
if (manifest.name !== 'dsh-claude-style-lite') fail(`package.json names ${manifest.name}; the release packer only carries dsh-claude-style-lite`)
const liteVersion = fs.readFileSync(path.join(ROOT, 'LITE_VERSION'), 'utf8').trim()
if (manifest.version !== liteVersion) fail(`package.json version ${manifest.version} differs from LITE_VERSION ${liteVersion}`)
```

Expected: `node scripts/release/release-pack.mjs --dev 0.1.0-dev.1` 打印两个 tarball 路径，且文件名以 `dsh-claude-style-lite-` 开头。

- [ ] **Step 7: 检查 package.json `files`**

运行：

```bash
npm pack --dry-run --json
```

Expected 包内容包含：

```text
lib/client.js
lib/host/index.js
lib/assets/
lib/fonts/
locale/
skin.json
cordis.patch.yml
README.md
README.en.md
LICENSE
docs/NOTICE.md
docs/THIRD_PARTY_NOTICES.md
docs/STYLE.md
docs/CHANGELOG.md
packages/client/src/features/sodium/LICENSE
```

不包含：

```text
packages/assets/src/fonts/anthropic/
packages/host/data/peakrate-catalog.json
lib/peakrate-catalog.json
lib/**/*.map
```

- [ ] **Step 8: 提交**

```bash
git add LICENSE docs/NOTICE.md docs/THIRD_PARTY_NOTICES.md package.json README.md README.en.md docs/CHANGES-FROM-UPSTREAM.md docs/AB-PERFORMANCE.md scripts/release
git commit -m "docs: 补齐 Lite 许可证、差异与发布身份"
```

---

### Task 10: T06 跨模块清扫与构建修复

**Files:**
- Modify: 所有仍含删除功能引用的源码、测试、文档
- Modify: `packages/testing/data/element-collections.json`
- Modify: `packages/testing/data/document-lookups.json`
- Modify: `packages/testing/data/importance-ledger.json`
- Modify: `packages/testing/data/importance-unreachable.json`
- Modify: `packages/testing/data/check-numbers.json`
- Modify: `packages/testing/data/skin-literals.json`
- Modify: `packages/testing/data/appearance.json`
- Modify: `packages/testing/data/surface.json`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/DEBUGGING.md`
- Modify: `AGENTS.md`（只更新 Lite 命令与布局说明中失真的部分）

**Interfaces:**
- Consumes: Task 4–Task 9 的删除结果
- Produces: 第一轮、第二轮、第三轮扫描全部干净；构建、lint 通过

- [ ] **Step 1: 第一轮扫描**

```bash
rg -n 'createReasoningFold|PeakRateHandle|PEAKRATE_PATH|peakrate-catalog|chatSend|messageEnter|CARET_MOTION|caretMotion|send-flight|fill\.style\.width' packages scripts .github locale README.md README.en.md docs > .debug/baseline/scan-1.txt
```

Expected: 只出现在：

```text
docs/CHANGELOG.md
docs/superpowers/specs/2026-11-12-dsh-claude-style-lite-design.md
docs/superpowers/plans/2026-11-12-dsh-claude-style-lite-implementation.md
docs/CHANGES-FROM-UPSTREAM.md
```

- [ ] **Step 2: 第二轮扫描**

```bash
rg -n 'features/peakrate|features/chat-send|features/caret' packages scripts .github locale > .debug/baseline/scan-2.txt
rg -n 'CHAT_FLYING_ATTR|MESSAGE_ENTER_ATTR|CARET_ATTR|CARET_LAYER_ATTR|CARET_HOST_ATTR|CARET_VISIBLE_ATTR|CARET_FIELD_ATTR' packages > .debug/baseline/scan-3.txt
rg -n 'ui\.peakrate|ui\.chatSend' packages/client/src > .debug/baseline/scan-4.txt
rg -n 'PeakRateHandle|ChatSendHandle' packages/client/src > .debug/baseline/scan-5.txt
rg -n 'peakrate|chatSend|messageEnter|caretMotion' packages/contracts/src/prefs.ts packages/contracts/src/routes.ts > .debug/baseline/scan-6.txt
```

Expected: 全部无输出。

- [ ] **Step 3: 第三轮扫描**

```bash
rg -n 'offpeakclock|peakrate-catalog|/peakrate' packages scripts .github locale README.md README.en.md > .debug/baseline/scan-7.txt
```

Expected: 只允许上游说明、变更记录和测试中“确认不存在”的断言。

- [ ] **Step 4: 修复悬空引用**

按扫描结果逐条：

- 删除无用 import。
- 删除已删 manifest 条目。
- 删除已删设置行。
- 删除已删 locale 键。
- 删除已删 CSS 规则。
- 删除已删资源引用。
- 删除已删测试。
- 更新过期注释。

- [ ] **Step 5: 更新 ARCHITECTURE.md**

把“峰值费率”从宿主半边职责中删除。

把“光标”从浏览器功能列表删除。

把 `chat-send` 从功能列表删除。

把 `peakrate` 从路由列表删除。

新增“价格日历独立于峰谷模块”的说明。

- [ ] **Step 6: 更新 DEBUGGING.md**

删除 caret 和 peakrate 的调试说明。

新增：

```text
reasoning-stream 的窗口只影响排版，不再改变展开状态。
```

- [ ] **Step 7: 更新 AGENTS.md**

只更新失真的内容：

- 包名。
- 构建命令。
- 目录说明中删除 `peakrate`、`chat-send`、`caret`。
- 性能验证说明。

保留上游作者写的行为规范，不整篇重写。

- [ ] **Step 8: 运行构建**

```bash
npm run build
```

Expected: 通过。

- [ ] **Step 9: 运行 lint**

```bash
npm run lint
```

Expected: 通过。若失败，按 lint 输出逐条修复，不跳过规则。

- [ ] **Step 10: 运行单元测试**

```bash
npm test
```

Expected: 通过。

- [ ] **Step 11: 提交**

```bash
git add packages scripts docs AGENTS.md
git commit -m "chore: 清扫已删除功能的跨模块引用"
```

---

### Task 11: 测试与账本更新

**Files:**
- Modify: `packages/testing/data/element-collections.json`
- Modify: `packages/testing/data/document-lookups.json`
- Modify: `packages/testing/data/importance-ledger.json`
- Modify: `packages/testing/data/importance-unreachable.json`
- Modify: `packages/testing/data/check-numbers.json`
- Modify: `packages/testing/data/skin-literals.json`
- Modify: `packages/testing/data/appearance.json`
- Modify: `packages/testing/data/surface.json`
- Modify: `packages/testing/specs/logic/pricing-calendar/calendar.spec.ts`
- Modify: `packages/testing/specs/logic/effort-picker/fill-canvas.spec.ts`
- Modify: `packages/testing/specs/behaviour/effort-picker/canvas-fill.spec.mjs`
- Modify: `packages/testing/specs/behaviour/composer-caret/native.spec.mjs`
- Modify: `packages/testing/specs/behaviour/reasoning-display/manual-fold.spec.mjs`
- Modify: `packages/testing/smoke/probe/model-rows.js`
- Modify: `packages/testing/smoke/cases/settings.mjs`
- Modify: `packages/testing/smoke/cases/model.mjs`
- Modify: `packages/testing/smoke/cases/peer.mjs`
- Modify: `packages/testing/smoke/cases/chat.mjs`
- Modify: `packages/testing/smoke/host-half.mjs`
- Modify: `packages/testing/smoke/stand-in/host-fetch.js`
- Modify: `packages/testing/smoke/page.mjs`

**Interfaces:**
- Consumes: Task 10 的干净源码
- Produces: 测试、账本、surface 表一致

- [ ] **Step 1: 重新生成元素集合账本**

```bash
npm run element-collections
```

Expected: 只收缩，不增长。

- [ ] **Step 2: 检查账本收缩**

```bash
npm run lint
node scripts/ci/ci-scope.mjs --ledgers --tree
```

Expected: 通过，账本无增长。

- [ ] **Step 3: 更新 surface.json**

删除已删功能的条目：

```text
peakrate.*
chat-send.*
caret.*
```

新增：

```json
{ "id": "effort.fill", "selector": ".dsh-claude-effort-fill-canvas", "feature": "effort", "sees": "the plain fill's canvas: the groove from the track's left end to the knob's centre, drawn on demand" }
```

保留：

```text
effort.particle
effort.track
effort.knob
effort.value
effort.value-preview
```

- [ ] **Step 4: 重新生成 check-numbers.json**

```bash
node packages/testing/check-numbers.mjs
node packages/testing/check-numbers.mjs --check
```

Expected: 第二条退出码 0。记录中不再出现已删测试文件和已删 check 名称。

- [ ] **Step 5: 运行 surface 检查**

```bash
npm run lint
```

Expected: 通过。

- [ ] **Step 6: 运行逻辑与机制测试**

```bash
npm test
```

Expected: 通过。

- [ ] **Step 7: 运行 stand-in**

```bash
npm run stand-in
```

Expected: 通过。

- [ ] **Step 8: 运行完整验证**

先确认当前 shell 的隔离变量：

```bash
printf '%s\n' "$DSH_HOME" "$DSH_AGENTS_HOME"
```

Expected: 两者都位于 `.debug/runs/dsh-web/` 下。

运行：

```bash
node packages/testing/local-home-guard.mjs .debug/runs/dsh-web/fingerprint.json --before
npm run verify -- --full
node packages/testing/local-home-guard.mjs .debug/runs/dsh-web/fingerprint.json
```

Expected:

- 验证通过。
- 本地 home 指纹不变。
- 若出现环境性失败，记录 `unjudged` 原因，不伪造通过。

- [ ] **Step 9: 提交**

```bash
git add packages/testing
git commit -m "test: 更新 Lite 测试账本与覆盖"
```

---

### Task 12: 视觉回归

**Files:**
- Create: `.debug/visual/`（不入库）
- Create: `docs/visual-regression.md`
- Modify: `packages/testing/data/appearance.json`

**Interfaces:**
- Consumes: Task 11 的构建产物
- Produces: 视觉回归截图、差异报告、允许变化清单

- [ ] **Step 1: 建立截图矩阵**

```text
Claude + 浅色 + 桌面 + 100%
Claude + 深色 + 桌面 + 100%
DeepSeek + 浅色 + 桌面 + 100%
DeepSeek + 深色 + 桌面 + 100%
Claude + 浅色 + Web + 80%
Claude + 深色 + Web + 125%
DeepSeek + 浅色 + Web + 150%
中文 + 英文
高 DPI（2×）+ 多显示器切换
```

- [ ] **Step 2: 采集原版 A**

只使用隔离启动器，不使用本机真实 DSH Web：

```bash
node packages/testing/dsh-web.mjs
```

或在自动化场景中：

```bash
node packages/testing/e2e.mjs --scenario shots
```

要求：

- `DSH_HOME` 与 `DSH_AGENTS_HOME` 都位于 `.debug/runs/dsh-web/<run-id>/`。
- 使用 Playwright 一次性 headless context。
- 不连接 `127.0.0.1:3080`。
- 不读取用户浏览器 Cookie 或登录态。

按矩阵截图：

```text
首页
对话
模型菜单
滑块卡片：无推理能力模型、首次开启、Off/Low/Medium/High/Max、反向拖动、拖动中途离开、回弹、连续改变档位
设置 Motion 页
设置 Main window 页
```

- [ ] **Step 3: 采集 Lite B**

使用 Lite 构建，按同一矩阵截图，且同样走隔离启动器：

```bash
node packages/testing/dsh-web.mjs
```

Expected:

- 两次采集各自使用独立 run-id 的临时 home。
- 两次采集的浏览器 context 互不共享 storage。
- 没有任何请求发往真实本地 DSH。

- [ ] **Step 4: 逐图对比**

允许差异：

```text
思考不再自动展开/收起
峰谷徽标和设置行消失
消息直接出现，无飞入/增长
滑块普通填充由 Canvas 绘制
原生光标出现
光标设置行消失
```

不允许差异：

```text
布局
间距
颜色
字体
气泡静态样式
模型选择
权限
导航
吉祥物
长会话优化
其他动画
```

- [ ] **Step 5: 写视觉回归报告**

`docs/visual-regression.md` 必须包含：

```text
设备与浏览器
DSH 版本
缩放
主题
语言
截图路径
允许差异
不允许差异
结论
```

- [ ] **Step 6: 更新 appearance.json**

```bash
DSH_APPEARANCE=write node packages/testing/e2e.mjs --scenario importance
```

Expected: 重写 `packages/testing/data/appearance.json`；已删功能的部件读数消失，保留功能的读数仍在。

- [ ] **Step 7: 重写 importance ledger**

```bash
DSH_IMPORTANCE_LEDGER=write node packages/testing/e2e.mjs --scenario importance
```

Expected: 重写 `packages/testing/data/importance-ledger.json`；已删功能的 `!important` 条目消失，保留功能的条目仍在。

- [ ] **Step 8: 检查无法到达的选择器与外观快照**

```bash
node packages/testing/e2e.mjs --scenario importance
```

Expected: 通过；`importance-unreachable.json` 只允许收缩，`appearance.json` 与当前页面一致。

- [ ] **Step 9: 提交**

```bash
git add docs/visual-regression.md packages/testing/data/appearance.json packages/testing/data/importance-ledger.json packages/testing/data/importance-unreachable.json
git commit -m "test: 记录 Lite 视觉回归与允许差异"
```

---

### Task 13: A/B 与 C/D 性能实测

**Files:**
- Create: `.debug/perf/`（不入库）
- Modify: `docs/AB-PERFORMANCE.md`
- Create: `docs/perf/raw/`（原始 trace，按需入库）
- Modify: `packages/testing/data/bounds.json`（仅当新增门槛需要）

**Interfaces:**
- Consumes: 原版 A、Lite B、Lite C（DOM 填充）、Lite D（Canvas 填充）
- Produces: A/B 与 C/D 原始数据、统计结果、结论

- [ ] **Step 1: 准备四个构建**

```text
A: 上游 8cafcacd
B: Lite 全量删除
C: Lite 源码但滑块保留 DOM width 填充
D: Lite 源码且滑块使用 Canvas 填充
```

C 组做法：

- 从 Lite 复制一份源码。
- 只把 `slider.ts` 的 Canvas 调用替换回原 `fill.style.width`。
- 不改变其他删除项。
- 构建后单独保存。

- [ ] **Step 2: 固定隔离环境**

记录：

```text
DSH_HOME（.debug/runs/dsh-web/<run-id>/home）
DSH_AGENTS_HOME（.debug/runs/dsh-web/<run-id>/agents）
监听地址（127.0.0.1）
监听端口（0 分配的端口）
浏览器（一次性 Playwright context）
```

另外记录：

```text
DSH 版本
Node 版本
浏览器版本
OS
GPU
缩放
刷新率
电源模式
后台进程
```

- [ ] **Step 3: 设计采样**

```text
每组 5 次
先预热 1 次
ABBA 或 BAAB 交叉
每次 60 秒
```

场景：

```text
idle-60
thinking-60
typing-1000-200
send-30
slider-30
session-500
session-2000
model-menu-500
model-menu-2000
```

- [ ] **Step 4: 采集指标**

使用 Performance Trace 和页面内采样，记录：

```text
Scripting
Rendering
Painting
Long Tasks
p95 Long Task
dropped frames
input latency p95
slider frame p95
JS heap
DOM nodes
listeners
canvas redraws
bundle size
gzip
brotli
peakrate requests
```

- [ ] **Step 5: 计算**

```text
下降率 = (T0 - T1) / T0 * 100%
速率比 = (T0 / T1 - 1) * 100%
```

分别计算：

- A vs B。
- C vs D。

不得把 A/B 总收益与 C/D 滑块净收益混在一起。

- [ ] **Step 6: 写报告**

`docs/AB-PERFORMANCE.md` 必须包含：

```text
测试环境
构建信息
场景
原始数据表
中位数
p95
下降率
采样方差
负收益
限制
结论
```

- [ ] **Step 7: 对照发布门槛**

```text
功能回归全绿
混合场景下降目标 >= 5%（未达标必须披露，不修改门槛）
长会话主线程忙碌时间退化不得超过 3%
滑块 Canvas 相对 DOM 填充 p95 帧耗时退化不得超过 5%
无峰谷请求
无原生光标不可见
```

若未达标：

- 定位。
- 优化。
- 重跑。
- 不修改结论措辞。

- [ ] **Step 8: 提交**

```bash
git add docs/AB-PERFORMANCE.md docs/perf packages/testing/data/bounds.json
git commit -m "perf: 记录 Lite A/B 与滑块 C/D 实测"
```

---

### Task 14: 打包、安装、卸载、回退验证

**Files:**
- Create: `.debug/release/`（不入库）
- Modify: `docs/INSTALL.md`
- Create: `docs/VALIDATION.md`

**Interfaces:**
- Consumes: Task 13 的最终 Lite 构建
- Produces: npm 包、dist 分支、安装记录、卸载记录、回退记录

- [ ] **Step 1: 构建**

```bash
npm run build
```

Expected: 成功。

- [ ] **Step 2: 打包**

```bash
mkdir -p .debug/release
npm pack --pack-destination .debug/release
```

Expected: 生成 `dsh-claude-style-lite-0.1.0.tgz`。

- [ ] **Step 3: 检查包内容**

```bash
tar -tzf .debug/release/dsh-claude-style-lite-0.1.0.tgz | sort > .debug/release/package-files.txt
```

Expected:

- 无 Anthropic 字体。
- 无 `peakrate-catalog.json`。
- 无 `chat-send`、`caret`、`peakrate` 源码。
- 有 `lib/client.js`、`lib/host/index.js`、`locale`、`skin.json`、`cordis.patch.yml`、README、LICENSE、NOTICE。

- [ ] **Step 4: 在隔离 dsh-web 中安装 Lite**

先建立本次验证根：

```bash
export DSH_VALIDATE_ROOT=".debug/runs/dsh-web/validate-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$DSH_VALIDATE_ROOT/home" "$DSH_VALIDATE_ROOT/agents" "$DSH_VALIDATE_ROOT/workspace"
export DSH_HOME="$(pwd)/$DSH_VALIDATE_ROOT/home"
export DSH_AGENTS_HOME="$(pwd)/$DSH_VALIDATE_ROOT/agents"
export DSH_TELEMETRY_DISABLED=1
export npm_config_store_dir="$(pwd)/$DSH_VALIDATE_ROOT/pnpm-store"
```

安装：

```bash
dsh plugin --profile web add .debug/release/dsh-claude-style-lite-0.1.0.tgz
```

启动隔离 Web：

```bash
dsh --profile web --host 127.0.0.1 --port 0 --no-open
```

Expected:

- 命令行只启动临时 `$DSH_HOME` 下的 Web。
- 打印 `dsh web:` 与 `127.0.0.1` 的随机端口。
- 不打开默认浏览器。
- 不占用 3080。
- 不触碰真实 `~/.dsh` 与 `~/.agents`。

- [ ] **Step 5: 验证加载**

在页面控制台执行：

```js
document.body.getAttribute('data-dsh-claude-style')
```

Expected: 返回 Lite 构建 id。

在网络面板确认：

- 请求前缀为 `/dsh-claude-style-lite`。
- 无 `/peakrate`。
- 无 `offpeakclock.com`。

- [ ] **Step 6: 验证功能**

逐项：

```text
思考手动开合
进程折叠
消息折叠
模型菜单
模型描述
模型搜索
滑块拖动
滑块键盘
滑块提交
原生光标
中文输入法
发送
文件
图片
引用
重新生成
用量
会话成本
价格
上下文统计
吉祥物
声音
```

Expected: 全部正常。

- [ ] **Step 7: 卸载 Lite**

仍在同一个隔离环境中执行：

```bash
dsh plugin --profile web remove dsh-claude-style-lite
```

Expected:

- 卸载成功。
- 页面不再有 Lite 样式和设置。
- 真实 `~/.dsh` 未被卸载或改写。

- [ ] **Step 8: 在另一个隔离 profile 中安装原版**

不要复用 Lite 的 profile：

```bash
export DSH_VALIDATE_UPSTREAM="$DSH_VALIDATE_ROOT/upstream"
mkdir -p "$DSH_VALIDATE_UPSTREAM/home" "$DSH_VALIDATE_UPSTREAM/agents"
export DSH_HOME="$(pwd)/$DSH_VALIDATE_UPSTREAM/home"
export DSH_AGENTS_HOME="$(pwd)/$DSH_VALIDATE_UPSTREAM/agents"
dsh plugin --profile web add dsh-claude-style
dsh --profile web --host 127.0.0.1 --port 0 --no-open
```

Expected:

- 原版使用独立的临时 `$DSH_HOME`。
- 与 Lite 的临时 profile、会话、凭据和缓存完全分开。
- 真实本地原版仍未被启用、停用或升级。

- [ ] **Step 9: 同装互斥测试**

只在一个隔离 `$DSH_HOME` 内完成：

```text
同一个 web profile 中同时安装 Lite 与原版
仅启用 Lite 启动 -> 记录行为
仅启用原版启动 -> 记录行为
两者都启用启动 -> 记录告警或失败
```

Expected:

- 两者的安装、启用、停用只发生在临时 `$DSH_HOME`。
- 真实 `~/.dsh/profiles/web` 不新增、不删除、不改写任何条目。
- 结果记录到 `docs/VALIDATION.md`。

- [ ] **Step 10: 回退测试**

在隔离环境中执行：

```text
停用 Lite -> 启用原版 -> 确认原版设置和主题正常
```

Expected:

- 回退成功。
- 原版读取的是临时 profile 的设置，不是用户真实设置。
- 临时 profile 外的任何 DSH 进程保持不变。

- [ ] **Step 11: 写验证报告**

`docs/VALIDATION.md` 必须包含：

```text
构建 id
安装包 sha256
安装日期
DSH 版本
网页端/桌面端
DSH_HOME（必须位于 .debug/runs/dsh-web/）
DSH_AGENTS_HOME（必须位于 .debug/runs/dsh-web/）
监听地址与端口（必须为 127.0.0.1 与随机端口）
浏览器上下文（必须为一次性 Playwright context）
功能清单
失败项
回退结果
本地 home 指纹对比结果
3080 端口对比结果
```

- [ ] **Step 12: 更新 docs/INSTALL.md 的测试说明**

在 `docs/INSTALL.md` 增加“测试与验证”一节，内容为：

1. 本项目不建议在真实的 `~/.dsh` 中测试 Lite。
2. 本地验证使用 `node packages/testing/dsh-web.mjs`。
3. 该工具在 `.debug/runs/dsh-web/<run-id>/` 下创建独立的 `DSH_HOME` 与 `DSH_AGENTS_HOME`。
4. 它监听 `127.0.0.1` 的随机端口，并传入 `--no-open`。
5. 永远不要把测试指向真实的 `~/.dsh`、`~/.agents` 或正在运行的 3080 Web 实例。

- [ ] **Step 13: 提交**

```bash
git add docs/INSTALL.md docs/VALIDATION.md
git commit -m "docs: 记录 Lite 安装、卸载、回退与互斥验证"
```

---

### Task 15: 最终交付与文档冻结

**Files:**
- Modify: `README.md`
- Modify: `README.en.md`
- Modify: `docs/CHANGES-FROM-UPSTREAM.md`
- Modify: `docs/AB-PERFORMANCE.md`
- Modify: `docs/VALIDATION.md`
- Modify: `CHANGELOG.md`（如不存在则新建）
- Create: `docs/RELEASE-CHECKLIST.md`

**Interfaces:**
- Consumes: Task 1–Task 14 的全部证据
- Produces: 可发布交付物

- [ ] **Step 1: 更新 README 功能差异**

README 必须列出：

```text
移除：
  思考自动展开/收起
  峰谷费率徽标与设置
  消息气泡飞入/增长
  自绘光标
变更：
  滑块普通填充改为 Canvas 2D
保留：
  其余全部功能
```

- [ ] **Step 2: 更新 README 安装与回退**

链接到：

```text
docs/INSTALL.md
docs/CHANGES-FROM-UPSTREAM.md
docs/AB-PERFORMANCE.md
docs/VALIDATION.md
```

- [ ] **Step 3: 更新 CHANGELOG.md**

```markdown
# Changelog

## [0.1.0] - 2026-11-12

### 新增

- 基于 dsh-claude-style 0.20.3 建立独立 Lite 插件。
- 推理滑块普通填充改为 Canvas 2D。

### 移除

- 思考自动展开/收起。
- 峰谷费率模块及其路由、缓存、定时器和设置。
- 消息气泡飞入/增长动画。
- 自绘光标动画。

### 保留

- Claude / DeepSeek 主题、模型选择、会话、统计、折叠、回答渐显、吉祥物、声音和长会话优化。
```

- [ ] **Step 4: 写 RELEASE-CHECKLIST.md**

```markdown
# Release checklist

- [ ] UPSTREAM_COMMIT 与 ZIP 一致
- [ ] UPSTREAM_VERSION 与 package.json 一致
- [ ] npm 包名未被占用
- [ ] 隔离 DSH_HOME 下 npm run build 通过
- [ ] 隔离 DSH_HOME 下 npm run lint 通过
- [ ] 隔离 DSH_HOME 下 npm test 通过
- [ ] 隔离 DSH_HOME 下 npm run verify -- --full 通过
- [ ] 本地 ~/.dsh 与 ~/.agents 指纹一致
- [ ] 3080 监听状态一致
- [ ] 视觉回归通过
- [ ] A/B 报告完成
- [ ] C/D 报告完成
- [ ] 安装验证完成
- [ ] 卸载验证完成
- [ ] 回退验证完成
- [ ] 两插件同装测试完成
- [ ] 所有真实宿主测试使用隔离 dsh-web
- [ ] 本地 ~/.dsh 与 ~/.agents 指纹前后一致
- [ ] 3080 端口监听状态前后一致
- [ ] 无用户浏览器 Profile 或 Cookie 被加载
- [ ] npm pack 内容检查完成
- [ ] 许可证、NOTICE、第三方声明存在
- [ ] Anthropic 字体未进入 npm
- [ ] dist 分支可安装
- [ ] GitHub Release 说明完成
```

- [ ] **Step 5: 运行最终全量验证**

```bash
printf '%s\n' "$DSH_HOME" "$DSH_AGENTS_HOME"
node packages/testing/local-home-guard.mjs .debug/runs/dsh-web/fingerprint.json --before
npm run build
npm run lint
npm test
npm run verify -- --full
node packages/testing/local-home-guard.mjs .debug/runs/dsh-web/fingerprint.json
npm pack --dry-run
```

Expected:

- `DSH_HOME` 与 `DSH_AGENTS_HOME` 均位于 `.debug/runs/dsh-web/` 下。
- 所有命令通过。
- 本地 home 指纹不变。
- `npm pack --dry-run` 不包含受限字体、已删功能源码或本地测试产物。

- [ ] **Step 6: 写最终交付摘要**

在 `docs/VALIDATION.md` 追加：

```text
交付物清单
构建 id
测试证据路径
A/B 报告路径
安装包路径
dist 分支
已知限制
```

- [ ] **Step 7: 提交**

```bash
git add README.md README.en.md docs CHANGELOG.md
git commit -m "docs: 完成 Lite 交付清单与发布说明"
```

- [ ] **Step 8: 打标签**

```bash
git tag v0.1.0
```

Expected: 标签创建成功。

---

## 防误删回归清单

以下场景与行为目录属于实施书“必须保留”清单；每个改动删除项后都要整组跑一次，不能只跑被改功能自己的测试。

执行边界：

- 所有真实宿主场景只通过 `packages/testing/e2e.mjs` 或 `packages/testing/dsh-web.mjs`。
- 两者必须使用 Task 2 的隔离启动器。
- 不使用用户真实 `~/.dsh`、`~/.agents`。
- 不连接真实 `127.0.0.1:3080`。
- 每个批次前后运行 `local-home-guard.mjs`。

推荐每批命令写成：

```bash
FP=".debug/runs/dsh-web/regression-$(date +%Y%m%d-%H%M%S).json"
node packages/testing/local-home-guard.mjs "$FP" --before
node packages/testing/e2e.mjs --scenario <实际场景名>
node packages/testing/local-home-guard.mjs "$FP"
```

### 会话与发送

```bash
node packages/testing/e2e.mjs --scenario conversation,send,sendFull,scroll,readerScroll,doorPin,tool,fileMerge
node packages/testing/stand-in.mjs --spec packages/testing/specs/behaviour/chat-follow,packages/testing/specs/behaviour/message-fold
```

保留判据：

- 宿主消息直接出现，语句完整。
- 连续发送、文件、图片、引用和重新生成可用。
- 跟随、滚动、阅读位置和门钉不退化。

### 折叠与思考

```bash
node packages/testing/e2e.mjs --scenario reasoningStream,reasoningContinuous,processSummary,waitLine,washLine
node packages/testing/stand-in.mjs --spec packages/testing/specs/behaviour/reasoning-display,packages/testing/specs/behaviour/context-stats
```

保留判据：

- 宿主手动展开/收起仍由读者控制。
- stepped 窗口只影响排版。
- 进程摘要、等待行和回答渐显仍工作。

### 模型、输入与统计

```bash
node packages/testing/stand-in.mjs --case model-rows,model-account,chat-fold,settings,late-forms
node packages/testing/stand-in.mjs --spec packages/testing/specs/behaviour/model-picker,packages/testing/specs/behaviour/effort-picker,packages/testing/specs/behaviour/composer-caret,packages/testing/specs/behaviour/context-stats
node packages/testing/e2e.mjs --scenario statsPosition,statsOverlay,statsFooter,composerViewport,narrow
```

保留判据：

- 模型名、release tag、描述、搜索、选择、快捷供应商和 tooltip 不变。
- 滑块档位、提交、键盘、ARIA、吸附和顶档点阵不变。
- 原生光标可见；输入法、选区、粘贴和撤销不变。
- 通用价格、会话成本、用量和上下文统计不变。

### 长会话与性能机制

```bash
node packages/testing/e2e.mjs --scenario longSession,streamPace,streamJitter,streamJitterFooter,streamJitterInline,motion
```

保留判据：

- 长会话离屏跳过、增量扫描和统一帧管线仍生效。
- 流式跟随、等待行动画、回答渐显不退化。

### 品牌、吉祥物与声音

```bash
node packages/testing/e2e.mjs --scenario customBrand,dsBot,shots
node packages/testing/stand-in.mjs --spec packages/testing/specs/behaviour/account-menu,packages/testing/specs/behaviour/custom-brand,packages/testing/specs/behaviour/mascot,packages/testing/specs/behaviour/sound-cues
```

保留判据：

- Claude / DeepSeek 双品牌与自定义色卡不变。
- 吉祥物、声音设置和其他设置行仍在。
- Sodium 渲染引擎仍按其许可证加载。

### 宿主路由与数据

```bash
node packages/testing/smoke/host-half.mjs
node packages/testing/stand-in.mjs --case sync-fault,model-account,late-forms
```

保留判据：

- `/prices`、`/session-cost`、`/usage` 可用。
- `/peakrate` 不存在。
- 设置命名空间、远程设置和模型账户不退化。

## 测试与验收对照表

| 验收项 | 命令 / 证据 | 通过标准 |
| --- | --- | --- |
| 思考自动开合不存在 | `rg -n 'createReasoningFold|reasoning-fold.ts' packages/client/src` | 无输出 |
| 手动开合正常 | `manual-fold.spec.mjs` | PASS |
| 步进窗口仍随流式增长 | `reasoning-display/choice.spec.mjs` | PASS |
| 峰谷前端不存在 | `rg -n 'features/peakrate' packages` | 无输出 |
| 峰谷宿主不存在 | `rg -n 'PeakRateHandle|PEAKRATE_PATH|peakrate-catalog' packages/host packages/contracts` | 无输出 |
| `/peakrate` 不存在 | `packages/testing/smoke/host-half.mjs` | 404 |
| 价格仍可用 | `packages/testing/smoke/host-half.mjs` 价格 block | PASS |
| 会话成本仍可用 | `packages/testing/smoke/host-half.mjs` session-cost block | PASS |
| 用量仍可用 | `packages/testing/smoke/host-half.mjs` usage block | PASS |
| 消息动画不存在 | `rg -n 'chatSend|messageEnter|send-flight' packages/client/src` | 无输出 |
| 真实发送正常 | `e2e.mjs --scenario send,sendFull` | PASS |
| 气泡静态样式不变 | 视觉回归 | 无布局/颜色差异 |
| 滑块无 DOM width 动画 | `rg -n 'fill\.style\.width|transition:\s*width' packages/client/src/features/effort` | 无输出 |
| 滑块 Canvas 存在 | `canvas-fill.spec.mjs` | PASS |
| 滑块交互保留 | `edge-drag.spec.mjs`、`progress.spec.mjs` | PASS |
| 顶档点阵保留 | `top-rung-motion.spec.mjs` | PASS |
| 自绘光标不存在 | `rg -n 'caretMotion|CARET_MOTION|caret-measure' packages` | 无输出 |
| 原生光标可见 | `native.spec.mjs` | PASS |
| 共享输入法工具保留 | `composer-caret/caret.spec.ts` | PASS |
| 独立身份 | `rg -n '"name": "dsh-claude-style"' package.json` | 无输出 |
| 独立路由 | 网络面板 | 全部 `/dsh-claude-style-lite` |
| 独立设置 | 设置页 | Lite 命名空间 |
| 两插件互斥 | `docs/VALIDATION.md`（隔离 profile） | 记录完整 |
| 只用 dsh-web 测试 | `packages/testing/dsh-web.mjs` 启动日志 | `--profile web`、`127.0.0.1`、`--port 0`、`--no-open` |
| 真实 DSH home 零改动 | `local-home-guard.mjs` | 前后指纹一致 |
| 真实 3080 不受影响 | 运行前后 `netstat` | 监听状态一致 |
| 用户浏览器 Profile 未加载 | Playwright 一次性 context 证据 | 无持久化 `userDataDir` |
| 用户凭据未泄漏 | 启动环境快照 | 无 KEY/SECRET/TOKEN/PASSWORD |
| 许可证 | `LICENSE`、`NOTICE`、`THIRD_PARTY_NOTICES` | 存在且正确 |
| 无 Anthropic 字体 | `npm pack --dry-run --json` | 不包含 |
| 构建 | 隔离 `DSH_HOME` 下 `npm run build` | 退出码 0 |
| Lint | 隔离 `DSH_HOME` 下 `npm run lint` | 退出码 0 |
| 单测 | 隔离 `DSH_HOME` 下 `npm test` | 退出码 0 |
| 全量验证 | 隔离 `DSH_HOME` 下 `npm run verify -- --full` | 退出码 0 |
| 构建不读取真实 Profile | `build.mjs` 的 linkedProfiles 日志 | 只指向 scratch home |
| 本地 DSH 配置零改动 | `local-home-guard.mjs` | 前后指纹一致 |
| A/B | `docs/AB-PERFORMANCE.md` | 原始数据 + 百分比 |
| C/D | `docs/AB-PERFORMANCE.md` | 原始数据 + 百分比 |
| 安装 | `docs/VALIDATION.md` | 成功 |
| 卸载 | `docs/VALIDATION.md` | 成功 |
| 回退 | `docs/VALIDATION.md` | 成功 |

---

## 实施书工序映射

| 实施书工序 | 计划 Task | 主要交付 |
| --- | --- | --- |
| T00 冻结基线、建立 A/B 环境 | Task 1、Task 2 | 上游提交、环境记录、隔离 dsh-web 启动器、本地 home 门禁 |
| T01 删除思考自动开合 | Task 4 | R1 删除逻辑、`reasoning-stream` 解耦、手动开合回归 |
| T02 完整拆除峰谷费率 | Task 5 | 前端/宿主/路由/数据删除、价格日历下沉 |
| T03 删除消息入场动画 | Task 6 | `chat-send` 删除、真实发送回归、设置清理 |
| T04 滑块填充 Canvas 化 | Task 7 | `fill-canvas.ts`、slider 接入、C/D 对照 |
| T05 删除自绘光标 | Task 8 | caret 删除、原生光标与 IME 回归 |
| T06 跨模块清扫与构建修复 | Task 9、Task 10、Task 11 | 身份复核、三轮扫描、构建/lint/test、账本 |
| T07 测试、文档、打包与交付 | Task 12–Task 15 | 视觉回归、A/B、安装/卸载/回退、最终交付 |

## 变更文件清单（按需求）

### R1

```text
delete packages/client/src/features/chat-fold/reasoning-fold.ts
modify packages/client/src/features/chat-fold/chat-fold.ts
modify packages/client/src/features/chat-fold/reasoning-stream.ts
modify packages/client/src/features/chat-fold/fold-motion.css
modify packages/client/src/features/chat-fold/chat-fold.manifest.ts
modify packages/testing/scenarios/reasoning-stream.mjs
modify packages/testing/specs/behaviour/reasoning-display/choice.spec.mjs
modify packages/testing/smoke/probe/chat-fold.js
create packages/testing/specs/behaviour/reasoning-display/manual-fold.spec.mjs
delete packages/testing/faults/patches/chat-fold-4d2aab06.patch
modify packages/testing/data/element-collections.json
modify packages/testing/data/document-lookups.json
modify packages/testing/data/check-numbers.json
```

### R2

```text
delete packages/client/src/features/peakrate/
delete packages/host/src/peakrate.ts
delete packages/host/src/peakrate-catalog.ts
delete packages/host/data/peakrate-catalog.json
delete packages/contracts/src/peakrate.ts
delete scripts/build/peakrate-catalog.mjs
delete scripts/data/fetch-peakrate-catalog.mjs
create packages/host/data/pricing-calendar.json
create packages/contracts/src/pricing-calendar.ts
create scripts/data/pricing-calendar.mjs
create packages/testing/specs/logic/pricing-calendar/calendar.spec.ts
modify scripts/data/fetch-prices.mjs
modify scripts/build/build.mjs
modify .github/workflows/data.yml
modify packages/host/src/routes.ts
modify packages/host/src/prices.ts
modify packages/contracts/src/routes.ts
modify packages/contracts/src/prefs.ts
modify packages/client/src/core/scheduler.ts
modify packages/client/src/constants.ts
modify packages/client/src/features/model/model-picker.ts
modify packages/client/src/features/model/rows.ts
modify packages/client/src/features/model/model-picker.manifest.ts
modify packages/client/src/features/model/model-copy.ts
modify packages/client/src/pure.ts
modify packages/client/src/theme/tokens.json
modify packages/testing/data/check-numbers.json
modify packages/testing/data/surface.json
modify packages/testing/data/importance-unreachable.json
modify packages/testing/data/document-lookups.json
```

### R3

```text
delete packages/client/src/features/chat-send/
modify packages/client/src/core/scheduler.ts
modify packages/client/src/features/chat-follow/chat-follow.ts
modify packages/client/src/features/chat-follow/chat-follow.manifest.ts
modify packages/client/src/features/chat-fold/message-fold.ts
modify packages/client/src/constants.ts
modify packages/client/src/pure.ts
modify packages/contracts/src/prefs.ts
modify packages/client/src/features/settings/settings-cards.css
modify packages/client/src/shared/motion.css
modify packages/testing/data/check-numbers.json
modify packages/testing/data/surface.json
modify packages/testing/data/importance-unreachable.json
modify packages/testing/data/document-lookups.json
```

### R4

```text
create packages/client/src/features/effort/fill-canvas.ts
modify packages/client/src/features/effort/slider.ts
modify packages/client/src/features/effort/effort-picker.css
modify packages/client/src/theme/tokens.json
modify packages/client/src/pure.ts
create packages/testing/specs/logic/effort-picker/fill-canvas.spec.ts
create packages/testing/specs/behaviour/effort-picker/canvas-fill.spec.mjs
modify packages/testing/data/surface.json
modify packages/testing/data/importance-unreachable.json
modify packages/testing/data/check-numbers.json
```

### R5

```text
delete packages/client/src/features/caret/
modify packages/client/src/constants.ts
modify packages/contracts/src/prefs.ts
modify packages/client/src/theme/tokens.json
modify packages/client/src/features/settings/settings-cards.css
modify packages/client/src/theme/chrome.css
modify packages/client/src/features/model/sub-menu.ts
create packages/testing/specs/behaviour/composer-caret/native.spec.mjs
modify packages/testing/specs/behaviour/model-picker/search.spec.mjs
modify packages/testing/specs/logic/preferences/stored-values.spec.ts
delete packages/testing/smoke/probe/chat-caret.js
modify packages/testing/data/check-numbers.json
modify packages/testing/data/surface.json
modify packages/testing/data/importance-unreachable.json
modify packages/testing/data/document-lookups.json
```

### R6/R7

```text
modify package.json
modify package-lock.json
modify skin.json
modify cordis.patch.yml
modify locale/zh.json
modify locale/en.json
modify packages/contracts/src/package.ts
modify packages/contracts/src/routes.ts
modify packages/client/src/constants.ts
modify README.md
modify README.en.md
modify CONTRIBUTING.md
modify LICENSE
modify docs/NOTICE.md
modify docs/THIRD_PARTY_NOTICES.md
create docs/INSTALL.md
create docs/CHANGES-FROM-UPSTREAM.md
create docs/AB-PERFORMANCE.md
create docs/VALIDATION.md
create docs/RELEASE-CHECKLIST.md
modify scripts/release/release-state.mjs
modify scripts/release/dist-branch.mjs
modify scripts/release/release-pack.mjs
```

---

## 提交序列

```text
chore: 固定 Lite 上游基线与测试环境
test: 隔离 dsh-web 测试环境并守卫本地 DSH 配置
feat: 建立 dsh-claude-style-lite 独立插件身份
refactor: 移除思考自动开合并保留手动折叠
refactor: 完整移除峰谷费率并保留价格日历
refactor: 移除消息气泡入场动画并保留真实发送
perf: 推理滑块普通填充改为 Canvas 2D
refactor: 移除自绘光标并恢复浏览器原生光标
docs: 补齐 Lite 许可证、差异与发布身份
chore: 清扫已删除功能的跨模块引用
test: 更新 Lite 测试账本与覆盖
test: 记录 Lite 视觉回归与允许差异
perf: 记录 Lite A/B 与滑块 C/D 实测
docs: 记录 Lite 安装、卸载、回退与互斥验证
docs: 完成 Lite 交付清单与发布说明
```

---

## 执行注意事项

1. 每个 Task 开始前重新读当前文件，不依赖本计划中的旧行号。
2. 删除前先运行 `rg` 确认引用。
3. 每次删除后立即运行 `npm run build`，不要积累大量错误后一次性修复。
4. 每完成一个功能运行其目标测试。
5. 每完成一个 Task 更新账本，避免 CI 才发现增长问题。
6. 不手改 `lib/`。
7. 不使用 Git 回滚用户改动。
8. 不在生产环境做安装和性能测试。
9. 不把估算写成实测。
10. 不删除仍被其他功能引用的共享工具。
11. 不在文档中保留临时路径、临时会话或中间产物引用。
12. 发现依赖冲突时，优先做最小保留改造，并在 `docs/CHANGES-FROM-UPSTREAM.md` 记录。
13. 所有真实宿主测试只使用隔离 `dsh-web`，不连接本机 3080，不启动用户 DSH。
14. 每批测试前后运行 `local-home-guard.mjs`；指纹变化即停止并排查。
15. 不按进程名终止 DSH；只终止测试启动器记录的子进程 PID。
16. 构建与测试都继承隔离 `DSH_HOME`，防止构建读取用户 profile。
