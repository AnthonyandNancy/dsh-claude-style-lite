# 桌面通知与回到底部跳动 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 Windows 桌面端真正显示系统通知，并让读者点一次回到底部后不再被后续内容或操作带到非预期位置。

**Architecture:** 通知由宿主半通过 `subprocess` 启动系统发送进程，浏览器半负责事件判断与交接轮询；滚动修复把手回改成一次可取消的交接，读者持有立即释放，后续增长交给宿主跟随。

**Tech Stack:** TypeScript、React 18、esbuild、Vitest（browser mode）、Playwright、PowerShell 5.1、WinRT Toast、DSH 私有路由与 `subprocess` 服务。

## Global Constraints

- 不修改 `lib/`；构建产物只由 `npm run build` 生成。
- 新增行为、文案与规则用编辑工具写入；跨文件机械替换可以脚本化，但脚本放在 `.debug/` 并审阅完整 diff。
- 不引入运行时依赖；React 与 `@deepseek-ai/dsh-client-ui-primitives` 来自宿主。
- 每条私有路由都过 `fenceRefused`（D75）；同一请求体上限与错误格式沿用 `packages/host/src/routes.ts`。
- 失败就地抛出；只有能隔离单个通知失败或单个订阅者的地方才捕获，并在旁边写明原因（D12）。
- 标题、正文、会话标题与 `sessionId` 不拼进 PowerShell 命令行；只走 UTF-8 临时文件与 `argv`。
- 通知固定 `silent: true`；声音只由「提示音效」决定（D89）。
- 滚动位置只有滚动主人可以写（D40）；修复不得新增第二个写入者。
- `packages/client/src/features/chat-follow/chat-follow.ts` 已 728 行，本次不新增功能逻辑到该文件；只做调用替换与条件跳过，新增逻辑落到 `packages/engine/src/scroll-owner.ts`。
- 新行为同步 `docs/changes/`、`docs/INSTALL.md`、双语 README 与验收文档。
- 每个任务结束跑自己的测试；最终跑 `npm run build`、`npm run lint`、`npm run verify`。

---

### Task 1: 通知契约与宿主路由

**Files:**
- Modify: `packages/contracts/src/routes.ts:47-50`
- Add: `packages/contracts/src/notify.ts`
- Modify: `packages/host/src/routes.ts:261-330, 420-435`
- Add: `packages/host/src/notify.ts`
- Test: `packages/testing/smoke/host-half-notify.mjs`

**Interfaces:**
- Consumes: `fenceRefused`, `methodRefused`, `readRequestBody`, `sendJson`, `SESSION_ID_RE`
- Produces: `NOTIFY_PATH`, `NOTIFY_ACTIVATION_PATH`, `HostNotifyRequest`, `HostNotifyCapability`, `HostNotifyActivation`, `createNotifyRoute(ctx)`, `createNotifyActivationRoute(ctx)`

- [ ] **Step 1: Write the failing route test**

```ts
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'
import { NOTIFY_PATH } from '../../contracts/src/routes.ts'
import { createNotifyRoute, createNotifyActivationRoute, desktopAumidFromShortcuts } from '../../host/src/notify.ts'

function request(method: string, body?: unknown, headers: Record<string, string> = {}) {
  const req = Object.assign(new EventEmitter(), {
    method,
    headers: { host: '127.0.0.1:3000', 'sec-fetch-site': 'same-origin', ...headers },
    socket: { remoteAddress: '127.0.0.1' },
    url: NOTIFY_PATH,
  })
  queueMicrotask(() => {
    if (body !== undefined) req.emit('data', Buffer.from(JSON.stringify(body)))
    req.emit('end')
  })
  return req
}

function response() {
  return {
    status: 0,
    body: '',
    headersSent: false,
    writeHead(status: number) { this.status = status; return this },
    end(chunk?: string | Buffer) { this.body += chunk === undefined ? '' : String(chunk) },
  }
}

test('a GET answers the channel capability', async () => {
  const route = createNotifyRoute({ platform: 'win32', subprocess: { spawn: () => ({}) }, home: process.env.DSH_HOME!, scriptPath: 'lib/notify/toast.ps1', notifyAumid: 'DSH-Test', protocolRegistered: false } as never)
  const res = response()
  route.handler(request('GET') as never, res as never)
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.deepEqual(JSON.parse(res.body), {
    ok: true,
    channel: 'toast',
    clickReturnsSession: false,
  })
})

test('the DSH AUMID is read from the shortcut whose target is the running executable', () => {
  const entries = [
    { target: 'C:/Apps/other.exe', aumid: 'Other.App' },
    { target: process.execPath, aumid: 'DSH Runtime Identity' },
  ]
  assert.equal(desktopAumidFromShortcuts(entries, process.execPath), 'DSH Runtime Identity')
  assert.equal(desktopAumidFromShortcuts([{ target: 'C:/Apps/other.exe', aumid: 'Other.App' }], process.execPath), null)
})

test('a POST without the same-origin fence is refused', () => {
  const route = createNotifyRoute({ platform: 'win32', subprocess: { spawn: () => ({}) }, home: process.env.DSH_HOME!, scriptPath: 'lib/notify/toast.ps1', notifyAumid: 'DSH-Test', protocolRegistered: false } as never)
  const res = response()
  route.handler(request('POST', {}, { origin: 'https://evil.example' }) as never, res as never)
  assert.equal(res.status, 403)
})

test('overlong copy is refused before a process starts', async () => {
  const route = createNotifyRoute({ platform: 'win32', subprocess: { spawn: () => ({}) }, home: process.env.DSH_HOME!, scriptPath: 'lib/notify/toast.ps1', notifyAumid: 'DSH-Test', protocolRegistered: false } as never)
  const res = response()
  route.handler(request('POST', { title: 'x'.repeat(257), body: 'b', sessionId: 's', kind: 'finished' }) as never, res as never)
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.equal(res.status, 400)
})

test('the activation route answers null when no click happened', async () => {
  const route = createNotifyActivationRoute({ home: process.env.DSH_HOME! } as never)
  const res = response()
  route.handler(request('GET') as never, res as never)
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.deepEqual(JSON.parse(res.body), { ok: true, activation: null })
})
```

- [ ] **Step 2: Run the route test and confirm it fails**

Run:

```powershell
$env:PATH = 'D:\Develop\nvm\v24.19.0;' + $env:PATH
node packages/testing/stand-in.mjs --host
```

Expected: FAIL because the notify route is not registered.

- [ ] **Step 3: Add the contract**

In `packages/contracts/src/routes.ts`, after `SOUND_PATH`:

```ts
/** `GET` reports the channel; `POST` raises one system notification. */
export const NOTIFY_PATH = `${ROUTE_PREFIX}/notify`

/** `GET` takes the session a clicked notification asked to open, once. */
export const NOTIFY_ACTIVATION_PATH = `${ROUTE_PREFIX}/notify-activation`
```

Create `packages/contracts/src/notify.ts`:

```ts
/** The notification request both halves exchange (D73). */

export const NOTIFY_KINDS = ['finished', 'approval', 'plan-review', 'question'] as const
export type NotifyKind = typeof NOTIFY_KINDS[number]

export const NOTIFY_TITLE_MAX = 128
export const NOTIFY_BODY_MAX = 256

export interface HostNotifyRequest {
  title: string
  body: string
  sessionId: string
  kind: NotifyKind
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

- [ ] **Step 4: Add the host notification module**

Create `packages/host/src/notify.ts`:

```ts
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { NOTIFY_BODY_MAX, NOTIFY_KINDS, NOTIFY_TITLE_MAX } from '@dsh-claude-style/contracts/notify'
import { NOTIFY_ACTIVATION_PATH, NOTIFY_PATH } from '@dsh-claude-style/contracts/routes'
import { fenceRefused, methodRefused, readRequestBody, sendJson } from '@dsh-claude-style/engine/node/http'
import { pluginPath } from './routes'
import type { HostNotifyActivation, HostNotifyRequest } from '@dsh-claude-style/contracts/notify'
import type { DshContext, DshRequest, DshResponse, DshRoute } from '@dsh-claude-style/engine/node/dsh'

const BODY_MAX = 8 * 1024
const ACTIVATION_TTL_MS = 120_000
const SESSION_ID = /^[A-Za-z0-9_-]{1,128}$/

export interface NotifyHost {
  platform: NodeJS.Platform
  subprocess: { spawn(spec: unknown): unknown } | null
  home: string
  /** The copied script under lib/notify; the package root is already resolved by routes.ts. */
  scriptPath: string
  /** The AUMID DSH registered for itself, resolved from its own Start Menu shortcut. */
  notifyAumid: string | null
  /** Whether the toast click protocol is registered; the handler is generated on the first send. */
  protocolRegistered: boolean
}

/**
 * Resolve the AUMID DSH registered for itself: find the Start Menu shortcut
 * whose target is the running executable and read its System.AppUserModel.ID.
 * Never match on a product name or the packaging appId.
 */
export function desktopAumidFromShortcuts(entries: readonly { target: string, aumid: string | null }[], executable: string): string | null {
  const wanted = executable.replaceAll('\\', '/').toLowerCase()
  for (const entry of entries) {
    if (entry.aumid === null || entry.aumid.trim() === '') continue
    if (entry.target.replaceAll('\\', '/').toLowerCase() === wanted) return entry.aumid
  }
  return null
}

export function notifyCapability(host: NotifyHost): { channel: 'toast' | 'osascript' | 'notify-send' | 'browser', clickReturnsSession: boolean } {
  if (host.platform === 'win32' && host.subprocess !== null && host.notifyAumid !== null) return { channel: 'toast', clickReturnsSession: host.protocolRegistered }
  if (host.platform === 'darwin' && host.subprocess !== null) return { channel: 'osascript', clickReturnsSession: false }
  if (host.platform === 'linux' && host.subprocess !== null && existsSync('/usr/bin/notify-send')) return { channel: 'notify-send', clickReturnsSession: false }
  return { channel: 'browser', clickReturnsSession: false }
}

export function notifyRequest(value: unknown): HostNotifyRequest | null {
  if (value === null || typeof value !== 'object') return null
  const row = value as Record<string, unknown>
  if (typeof row.title !== 'string' || row.title.trim() === '' || row.title.length > NOTIFY_TITLE_MAX) return null
  if (typeof row.body !== 'string' || row.body.length > NOTIFY_BODY_MAX) return null
  if (typeof row.sessionId !== 'string' || !SESSION_ID.test(row.sessionId)) return null
  if (typeof row.kind !== 'string' || !(NOTIFY_KINDS as readonly string[]).includes(row.kind)) return null
  return { title: row.title, body: row.body, sessionId: row.sessionId, kind: row.kind as HostNotifyRequest['kind'] }
}

export function activationFile(home: string) {
  return join(home, 'dsh-claude-style-lite', 'notify-activation.json')
}

export function readActivation(home: string): HostNotifyActivation | null {
  const file = activationFile(home)
  if (!existsSync(file)) return null
  const text = readFileSync(file, 'utf8')
  rmSync(file, { force: true })
  const value = JSON.parse(text) as HostNotifyActivation
  if (typeof value.sessionId !== 'string' || !SESSION_ID.test(value.sessionId)) return null
  if (typeof value.at !== 'number' || Date.now() - value.at > ACTIVATION_TTL_MS) return null
  return value
}

export function writeActivation(home: string, sessionId: string) {
  const file = activationFile(home)
  mkdirSync(join(home, 'dsh-claude-style-lite'), { recursive: true })
  writeFileSync(file, JSON.stringify({ sessionId, at: Date.now() }), 'utf8')
}

export function createNotifyRoute(host: NotifyHost): DshRoute {
  return {
    path: NOTIFY_PATH,
    kind: 'exact',
    handler: (req: DshRequest, res: DshResponse) => {
      if (methodRefused(req, res, ['GET', 'POST'])) return
      if (fenceRefused({ get: () => null } as DshContext, req, res)) return
      if (req.method !== 'POST') {
        sendJson(res, 200, { ok: true, ...notifyCapability(host) })
        return
      }
      void (async () => {
        const body = await readRequestBody(req, BODY_MAX)
        if (body === null) {
          sendJson(res, 413, { ok: false, error: 'request body too large' })
          return
        }
        let parsed: unknown
        try { parsed = JSON.parse(body.toString('utf8')) } catch {
          sendJson(res, 400, { ok: false, error: 'request body is not JSON' })
          return
        }
        const request = notifyRequest(parsed)
        if (request === null) {
          sendJson(res, 400, { ok: false, error: 'invalid notification' })
          return
        }
        const capability = notifyCapability(host)
        if (capability.channel === 'browser') {
          sendJson(res, 409, { ok: false, error: 'host channel unavailable' })
          return
        }
        await sendHostNotification(host, capability.channel, request)
        sendJson(res, 200, { ok: true })
      })().catch((error: unknown) => {
        if (res.headersSent) res.destroy()
        else sendJson(res, 500, { ok: false, error: String((error as { message?: string } | null)?.message ?? String(error)) })
      })
    },
  }
}

export function createNotifyActivationRoute(host: NotifyHost): DshRoute {
  return {
    path: NOTIFY_ACTIVATION_PATH,
    kind: 'exact',
    handler: (req: DshRequest, res: DshResponse) => {
      if (methodRefused(req, res, ['GET'])) return
      if (fenceRefused({ get: () => null } as DshContext, req, res)) return
      sendJson(res, 200, { ok: true, activation: readActivation(host.home) })
    },
  }
}

async function sendHostNotification(host: NotifyHost, channel: 'toast' | 'osascript' | 'notify-send', request: HostNotifyRequest) {
  if (host.subprocess === null) throw new Error('subprocess service unavailable')
  const titleFile = join(host.home, 'dsh-claude-style-lite', `notify-title-${process.pid}-${Date.now()}.txt`)
  const bodyFile = join(host.home, 'dsh-claude-style-lite', `notify-body-${process.pid}-${Date.now()}.txt`)
  mkdirSync(join(host.home, 'dsh-claude-style-lite'), { recursive: true })
  writeFileSync(titleFile, request.title, 'utf8')
  writeFileSync(bodyFile, request.body, 'utf8')
  try {
    const script = host.scriptPath
    const argv = channel === 'toast'
      ? ['powershell.exe', '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-File', script, '-TitleFile', titleFile, '-BodyFile', bodyFile, '-SessionId', request.sessionId, '-Kind', request.kind, '-Aumid', host.notifyAumid]
      : channel === 'osascript'
        ? ['osascript', '-e', 'on run argv', '-e', 'display notification (item 2 of argv) with title (item 1 of argv)', '-e', 'end run', request.title, request.body]
        : ['notify-send', request.title, request.body]
    const handle = host.subprocess.spawn({
      argv,
      cwd: host.home,
      stdio: { stdin: 'ignore', stdout: { maxBytes: 4096 }, stderr: { maxBytes: 4096 } },
      graceMs: 5000,
    }) as { waitForExit?: () => Promise<{ exitCode: number | null }> }
    if (typeof handle.waitForExit === 'function') {
      const outcome = await handle.waitForExit()
      if (outcome.exitCode !== 0) throw new Error(`notification process exited ${String(outcome.exitCode)}`)
    }
  } finally {
    rmSync(titleFile, { force: true })
    rmSync(bodyFile, { force: true })
  }
}
```

> `root` is already `packageRoot()` at the top of `registerRoutes`, so reuse it. `existsSync` and `join` are already imported in `routes.ts`; confirm before adding an import.

- [ ] **Step 5: Register both routes**

In `packages/host/src/routes.ts`, inside the `scope.effect` body after the sound route:

```ts
const notifyHost = {
  platform: process.platform,
  subprocess: ctx.get('subprocess') ?? null,
  home: harnessPath(ctx),
  scriptPath: join(root, 'lib', 'notify', 'toast.ps1'),
  notifyAumid: desktopAumidFromShortcuts(readStartMenuShortcuts(), process.execPath),
  protocolRegistered: false,
}
register('notify', createNotifyRoute(notifyHost))
register('notify activation', createNotifyActivationRoute(notifyHost))
```

`harnessPath` is already imported at `packages/host/src/routes.ts:22`; read its current signature before calling.

- [ ] **Step 6: Run the route test and confirm it passes**

Run:

```powershell
node packages/testing/stand-in.mjs --host
```

Expected: PASS, the four notify checks printed beside the existing host-half checks.

- [ ] **Step 7: Run lint**

Run:

```powershell
npm run lint
```

Expected: PASS.

- [ ] **Step 9: Commit**

```powershell
git add packages/contracts/src/routes.ts packages/contracts/src/notify.ts packages/host/src/routes.ts packages/host/src/notify.ts packages/testing/smoke/host-half-notify.mjs packages/testing/smoke/host-half.mjs
git commit -m "feat: 增加宿主通知路由"
```

---

### Task 2: Windows Toast 脚本与协议处理器

**Files:**
- Add: `packages/host/src/notify/toast.ps1`
- Add: `packages/host/src/notify/handler.vbs`
- Modify: `scripts/build/build.mjs`
- Modify: `package.json` 的 `files`
- Modify: `docs/THIRD_PARTY_NOTICES.md`
- Test: `packages/testing/smoke/host-half-notify.mjs`

**Interfaces:**
- Consumes: `NOTIFY_TITLE_MAX`, `NOTIFY_BODY_MAX`, `NOTIFY_KINDS`
- Produces: `lib/notify/toast.ps1`, `lib/notify/handler.vbs`, runtime-read DSH AUMID, protocol `dsh-claude-style-lite`

- [ ] **Step 1: Write the failing script test**

```ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { HOST_NOTIFY_PROTOCOL } from '../../contracts/src/notify.ts'

test('the toast script uses the host-resolved AUMID and the plugin protocol', () => {
  const text = readFileSync('packages/host/src/notify/toast.ps1', 'utf8')
  assert.ok(text.includes('[Parameter(Mandatory = $true)][string]$Aumid'))
  assert.ok(text.includes('CreateToastNotifier($Aumid)'))
  assert.ok(text.includes(HOST_NOTIFY_PROTOCOL))
  assert.ok(text.includes('activationType="protocol"'))
  assert.ok(text.includes('audio silent="true"'))
})

test('the protocol handler carries a session id and never the title or body', () => {
  const text = readFileSync('packages/host/src/notify/handler.vbs', 'utf8')
  assert.ok(text.includes('session'))
  assert.ok(text.includes('notify-activation.json'))
  assert.ok(!text.includes('Title'))
  assert.ok(!text.includes('Body'))
})
```

- [ ] **Step 2: Run the script test and confirm it fails**

Run:

```powershell
node packages/testing/stand-in.mjs --host
```

Expected: FAIL because `toast.ps1` and `handler.vbs` do not exist.

- [ ] **Step 3: Add the fixed identity contracts**

In `packages/contracts/src/notify.ts`:

```ts
/** The protocol the plugin owns for toast clicks. */
export const HOST_NOTIFY_PROTOCOL = 'dsh-claude-style-lite'
```

- [ ] **Step 4: Add the toast script**

Create `packages/host/src/notify/toast.ps1` with UTF-8 BOM, ASCII-only source except the label read from a file:

```powershell
param(
  [Parameter(Mandatory = $true)][string]$TitleFile,
  [Parameter(Mandatory = $true)][string]$BodyFile,
  [string]$SessionId = '',
  [string]$Kind = 'finished',
  [Parameter(Mandatory = $true)][string]$Aumid,
  [string]$Protocol = 'dsh-claude-style-lite'
)

$ErrorActionPreference = 'Stop'

function Read-Text([string]$Path) {
  return (Get-Content -LiteralPath $Path -Raw -Encoding UTF8).Trim()
}


function Register-Protocol([string]$Handler) {
  $root = "HKCU:\Software\Classes\$Protocol"
  New-Item -Path $root -Force | Out-Null
  New-ItemProperty -Path $root -Name 'URL Protocol' -Value '' -PropertyType String -Force | Out-Null
  $command = Join-Path $root 'shell\open\command'
  New-Item -Path $command -Force | Out-Null
  New-ItemProperty -Path $command -Name '(Default)' -Value ('wscript.exe //B //Nologo "' + $Handler + '" "%1"') -PropertyType String -Force | Out-Null
}

function Show-Toast([string]$Title, [string]$Body, [string]$Launch) {
  [void][Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]
  [void][Windows.UI.Notifications.ToastNotification, Windows.UI.Notifications, ContentType = WindowsRuntime]
  [void][Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime]
  $escapedTitle = [System.Security.SecurityElement]::Escape($Title)
  $escapedBody = [System.Security.SecurityElement]::Escape($Body)
  $activation = if ([string]::IsNullOrWhiteSpace($Launch)) { '' } else {
    ' activationType="protocol" launch="' + [System.Security.SecurityElement]::Escape($Launch) + '"'
  }
  $xml = @"
<toast$activation>
  <visual>
    <binding template="ToastGeneric">
      <text>$escapedTitle</text>
      <text>$escapedBody</text>
    </binding>
  </visual>
  <audio silent="true"/>
</toast>
"@
  $doc = New-Object Windows.Data.Xml.Dom.XmlDocument
  $doc.LoadXml($xml)
  $toast = New-Object Windows.UI.Notifications.ToastNotification $doc
  [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($Aumid).Show($toast)
}

$title = Read-Text $TitleFile
$body = Read-Text $BodyFile
$launch = ''
if (-not [string]::IsNullOrWhiteSpace($SessionId)) {
  $handler = Join-Path $PSScriptRoot 'handler.vbs'
  Register-Protocol $handler
  $launch = $Protocol + '://open?session=' + [uri]::EscapeDataString($SessionId)
}
Show-Toast $title $body $launch
```

- [ ] **Step 5: Add the protocol handler**

Create `packages/host/src/notify/handler.vbs`:

```vbscript
' Generated handler for dsh-claude-style-lite toast clicks.
Option Explicit
Dim fso, shell, url, id, dir, file, at
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
url = WScript.Arguments(0)
id = ""
If InStr(url, "session=") > 0 Then id = Mid(url, InStr(url, "session=") + 8)
If InStr(id, "&") > 0 Then id = Left(id, InStr(id, "&") - 1)
If id = "" Then WScript.Quit 0
dir = shell.ExpandEnvironmentStrings("%DSH_HOME%")
If dir = "%DSH_HOME%" Or dir = "" Then dir = shell.ExpandEnvironmentStrings("%USERPROFILE%\.dsh")
dir = dir & "\dsh-claude-style-lite"
If Not fso.FolderExists(dir) Then fso.CreateFolder(dir)
file = dir & "\notify-activation.json"
Set at = fso.CreateTextFile(file, True)
at.Write "{""sessionId"":""" & id & """,""at"":" & DateDiff("s", "1/1/1970", Now()) * 1000 & "}"
at.Close
shell.Run "dsh://open", 0, False
```

- [ ] **Step 6: Copy the script and handler in the build**

In `scripts/build/build.mjs`, after the host half is written:

```js
fs.mkdirSync(path.join(ROOT, 'lib', 'notify'), { recursive: true })
fs.copyFileSync(path.join(ROOT, 'packages', 'host', 'src', 'notify', 'toast.ps1'), path.join(ROOT, 'lib', 'notify', 'toast.ps1'))
fs.copyFileSync(path.join(ROOT, 'packages', 'host', 'src', 'notify', 'handler.vbs'), path.join(ROOT, 'lib', 'notify', 'handler.vbs'))
```

Add `lib/notify` to `package.json`'s `files` array. No compiler step, no platform binary.

- [ ] **Step 7: Run the script test and syntax check**

Run:

```powershell
node packages/testing/stand-in.mjs --host
powershell.exe -NoProfile -Command "[scriptblock]::Create((Get-Content -Raw 'packages/host/src/notify/toast.ps1')) | Out-Null"
```

Expected: PASS and the PowerShell syntax check exits 0.

- [ ] **Step 8: Commit**

```powershell
git add packages/contracts/src/notify.ts packages/host/src/notify packages/testing/smoke/host-half-notify.mjs scripts/build/build.mjs package.json docs/THIRD_PARTY_NOTICES.md
git commit -m "feat: 增加 Windows Toast 与点击协议"
```

---

### Task 3: 浏览器半改走宿主通道

**Files:**
- Modify: `packages/client/src/features/notifications/notifier.ts:35-85`
- Modify: `packages/client/src/features/notifications/notifications.ts:20-41`
- Modify: `packages/client/src/features/notifications/notifications.settings.ts:11-33`
- Modify: `packages/client/src/features/notifications/notifications.copy.json`
- Add: `packages/client/src/features/notifications/channel.ts`
- Modify: `packages/testing/specs/behaviour/notifications/host.mjs`
- Modify: `packages/testing/specs/behaviour/notifications/window.spec.mjs`

**Interfaces:**
- Consumes: `NOTIFY_PATH`, `NOTIFY_ACTIVATION_PATH`, `HostNotifyCapability`, `HostNotifyActivation`
- Produces: `createNotifier({ channel, fetchNotify, fetchActivation, openSession })`, `NotificationChannel`

- [ ] **Step 1: Write the failing browser test**

Append to `packages/testing/specs/behaviour/notifications/window.spec.mjs`:

```js
test('a host channel raises no page Notification and polls the activation route', async (t) => {
  const initial = { a: { running: true } }
  const host = await setup(t, { status: initial, list: sessionList(initial) })
  await host.capability({ channel: 'toast', clickReturnsSession: true })
  await host.status({ a: { running: false } })
  t.expectThat.equal((await host.notifications()).length, 0, 'the host channel does not use window.Notification')
  t.expectThat.equal((await host.sent()).length, 1, 'one host notification is posted')
  await host.activation({ sessionId: 'a', at: Date.now() })
  t.expectThat.equal((await host.opened()).at(-1), 'a', 'the clicked session opens once')
})
```

Add these helpers to `packages/testing/specs/behaviour/notifications/host.mjs`:

```js
capability: (value) => t.page.evaluate((input) => {
  window.__hostNotify = { capability: input, sent: [], activation: null, opened: [] }
}, value),
sent: () => t.page.evaluate(() => window.__hostNotify.sent.slice()),
activation: (value) => t.page.evaluate((input) => { window.__hostNotify.activation = input }, value),
opened: () => t.page.evaluate(() => window.__hostNotify.opened.slice()),
```

The stand-in page's `fetch` must answer `NOTIFY_PATH` from `window.__hostNotify.capability` and record `POST` bodies; the page fixture is `packages/testing/smoke/page.mjs`, so wire the route there beside the existing host routes.

- [ ] **Step 2: Run the browser test and confirm it fails**

Run:

```powershell
node packages/testing/stand-in.mjs --spec notifications
```

Expected: FAIL because the notification feature still calls `new Notification` and never requests the host route.

- [ ] **Step 3: Rewrite the notifier around one channel**

Replace `createNotifier` in `packages/client/src/features/notifications/notifier.ts`:

```ts
export type NotificationChannel = 'host' | 'browser' | 'unsupported'

export interface NotifierDeps {
  channel: NotificationChannel
  notify(request: NotificationRequest): Promise<boolean>
  openSession(sessionId: string): void
}

export function createNotifier(deps: NotifierDeps) {
  if (deps.channel === 'unsupported') {
    return { notify: async () => false, permission: () => 'unsupported' as const, dispose() {} }
  }
  if (deps.channel === 'host') {
    return {
      notify: deps.notify,
      permission: () => 'granted' as const,
      dispose() {},
    }
  }
  const opened = new Set<Notification>()
  let permission = notificationPermission()
  // The browser branch keeps the existing permission gate, request coalescing,
  // click focus, and D12 isolation from the current implementation.
  return {
    notify: async (request: NotificationRequest) => {
      if (permission === 'unsupported' || permission === 'denied') return false
      if (await askPermission() !== 'granted') return false
      const notification = new Notification(request.title, { body: request.body, tag: request.tag, silent: true })
      opened.add(notification)
      notification.onclick = () => {
        window.focus()
        deps.openSession(request.sessionId)
        notification.close()
      }
      return true
    },
    permission: () => permission,
    dispose() {
      for (const notification of [...opened]) notification.close()
      opened.clear()
    },
  }
}
```

- [ ] **Step 4: Read the capability and post on the host channel**

In `packages/client/src/features/notifications/notifications.ts`:

```ts
import { NOTIFY_ACTIVATION_PATH, NOTIFY_PATH } from '@dsh-claude-style/contracts/routes'
import type { HostNotifyActivation, HostNotifyCapability } from '@dsh-claude-style/contracts/notify'

export function install(ctx: HostContext, ui: FeatureUi<typeof manifest>) {
  const workspace = hostUiWorkspace(ctx)
  const openSession = (sessionId: string) => {
    if (typeof workspace?.openSession === 'function') workspace.openSession(sessionId)
  }
  let stopped = false
  let channel: NotificationChannel = 'unsupported'
  let activationTimer: number | null = null
  const seen = new Set<string>()
  /** Requests that arrived before the capability did. */
  const waiting: NotificationRequest[] = []
  let notifier: ReturnType<typeof createNotifier> | null = null
  setNotificationChannel(() => channel)

  void fetch(NOTIFY_PATH, { cache: 'no-store' })
    .then(response => response.ok ? response.json() as Promise<HostNotifyCapability> : null)
    .then((capability) => {
      if (stopped || capability === null) return
      channel = capability.channel === 'toast' || capability.channel === 'osascript' || capability.channel === 'notify-send' ? 'host' : 'browser'
      notifier = channel === 'host'
        ? createNotifier({ channel: 'host', notify: postNotification, openSession })
        : createNotifier({ channel: 'browser', notify: async () => false, openSession })
      setNotificationChannel(() => channel)
      if (capability.clickReturnsSession) startActivationPoll()
      for (const request of waiting.splice(0)) void notifier.notify(request)
    })

  async function postNotification(request: NotificationRequest) {
    const response = await fetch(NOTIFY_PATH, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    })
    return response.ok
  }

  function startActivationPoll() {
    activationTimer = window.setInterval(() => {
      void fetch(NOTIFY_ACTIVATION_PATH, { cache: 'no-store' })
        .then(response => response.ok ? response.json() as Promise<{ activation: HostNotifyActivation | null }> : { activation: null })
        .then((answer) => {
          const activation = answer.activation
          if (activation === null || seen.has(`${activation.sessionId}:${activation.at}`)) return
          seen.add(`${activation.sessionId}:${activation.at}`)
          openSession(activation.sessionId)
          window.focus()
        })
    }, 1500)
  }

  // The feed is installed synchronously and each take posts once the capability is known.
  const feed = createAttentionFeed(ctx, (event, title) => {
    const request: NotificationRequest = {
      title: titleOf(event),
      body: title,
      tag: `dsh-claude-style:${event.sessionId}:${event.kind === 'finished' ? 'finished' : event.pending}`,
      sessionId: event.sessionId,
    }
    if (notifier === null) waiting.push(request)
    else void notifier.notify(request)
  })

  return () => {
    stopped = true
    if (activationTimer !== null) window.clearInterval(activationTimer)
    feed.dispose()
    notifier?.dispose()
  }
}
```

> The capability arrives asynchronously. The sample keeps `notifier: null` until then and queues every event; the queue flushes into the chosen channel once. Do not drop an event that arrives during boot. A host POST that fails stays a host failure: report it once, keep the host channel for the next event, and do not fall back to `window.Notification` on the desktop.

- [ ] **Step 5: Render the channel line instead of the browser permission line**

Create `packages/client/src/features/notifications/channel.ts` with one subscription: `setNotificationChannel(() => channel)` replaces the reader, `subscribeNotificationChannel(listener)` adds a listener, and `notificationChannel()` reads it. `notifications.ts` calls the setter when the capability arrives; `notifications.settings.ts` uses `React.useSyncExternalStore(subscribeNotificationChannel, notificationChannel, notificationChannel)` so the row redraws when the channel changes. The status component renders from that value. It returns:

```ts
if (channel === 'host') return React.createElement('span', { className: 'dsh-claude-settings-row-note' }, copy('notificationChannelHost'))
if (channel === 'unsupported') return React.createElement('span', { className: 'dsh-claude-settings-row-note' }, copy('notificationChannelUnsupported'))
// browser keeps permission line and Allow button
```

Add the three copy keys to `notifications.copy.json`. The settings smoke case's expected note for the general tab changes from the browser permission line to the channel line, so update `packages/testing/smoke/cases/settings.mjs` beside the copy:

```json
"notificationChannelHost": { "zh": "由桌面端直接发送系统通知。", "en": "The desktop app delivers these system notifications directly." },
"notificationChannelUnsupported": { "zh": "当前环境没有可用的系统通知通道。", "en": "This environment has no system notification channel." },
"notificationClickUnavailable": { "zh": "点击通知只会打开窗口，不切换会话。", "en": "Clicking a notification opens the window without switching sessions." }
```

- [ ] **Step 6: Run the notification behaviour spec**

Run:

```powershell
node packages/testing/stand-in.mjs --spec notifications
```

Expected: PASS, existing browser-channel cases plus the new host-channel case.

- [ ] **Step 7: Commit**

```powershell
git add packages/client/src/features/notifications packages/testing/specs/behaviour/notifications packages/testing/smoke/page.mjs packages/testing/smoke/cases/settings.mjs
git commit -m "feat: 通知改走宿主系统通道"
```

---

### Task 4: 把手回改成一次交接

**Files:**
- Modify: `packages/engine/src/scroll-owner.ts:35-39, 512-551`
- Modify: `packages/client/src/features/chat-follow/chat-follow.ts:521-550`
- Test: `packages/testing/specs/mechanism/scroll-ownership/owner.spec.ts`
- Add: `packages/testing/specs/mechanism/scroll-ownership/return.spec.ts`

**Interfaces:**
- Consumes: `easeScrollToEndFor`, `isScrollEasing`, `findFollowTailButton`, `held`
- Produces: `handBackFollow(request: HandBackRequest)`, `handBackPending(container): boolean`

- [ ] **Step 1: Write the failing one-click test**

Create `packages/testing/specs/mechanism/scroll-ownership/return.spec.ts`:

```ts
import { expect, test } from 'vitest'
import { adoptSkin } from '@dsh-claude-style/engine/skin'
import { handBackFollow, handBackPending, readerHolds } from '@dsh-claude-style/engine/scroll-owner'
import { CONVERSATION_SCROLL_SELECTOR } from '@dsh-claude-style/contracts/dom'
import { TEST_SKIN } from '../../fixtures/vocabulary'
import { createScrollOwnerFixture } from '../../fixtures/scroll-owner'

adoptSkin(TEST_SKIN)

test('a hand-back clicks the host button once and stops watching', async () => {
  const pressed: number[] = []
  const button = document.createElement('button')
  button.addEventListener('click', () => { pressed.push(performance.now()) })
  const cleanups: (() => void)[] = []
  const { scrollBox, join } = createScrollOwnerFixture(cleanups)
  join()
  const scroller = scrollBox(CONVERSATION_SCROLL_SELECTOR)
  // findFollowTailButton reads the conversation column's grandparent frame, then
  // the button in the next sibling slot. The fixture mounts the scroller itself
  // as the column; give it the two parents that shape names.
  const frame = document.createElement('div')
  const outer = document.createElement('div')
  const slot = document.createElement('div')
  slot.append(button)
  frame.append(scroller)
  outer.append(frame)
  outer.append(slot)
  document.body.append(outer)
  cleanups.push(() => outer.remove())
  scroller.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: -120 }))
  expect(readerHolds(scroller)).toBe(true)
  handBackFollow({ source: 'reader', reason: 'reader' })
  await new Promise(resolve => setTimeout(resolve, 800))
  for (const cleanup of cleanups.reverse()) cleanup()
  expect(pressed).toHaveLength(1)
  expect(readerHolds(scroller)).toBe(false)
  expect(handBackPending(scroller)).toBe(false)
})
```

- [ ] **Step 2: Run the one-click test and confirm it fails**

Run:

```powershell
node node_modules/vitest/vitest.mjs run packages/testing/specs/mechanism/scroll-ownership/return.spec.ts
```

Expected: FAIL with `handBackPending is not a function`.

- [ ] **Step 3: Replace the loop with one request and one confirmation**

In `packages/engine/src/scroll-owner.ts`, replace `handBackFollow` with:

```ts
const HAND_BACK_SETTLE_MS = 500
const HAND_BACK_LOOK_MS = 100
const HAND_BACK_LOOKS = 5
const handBackTokens = new WeakMap<Element, number>()
const handBackUntil = new WeakMap<Element, number>()

export interface HandBackRequest {
  source: ScrollSource
  reason: 'structure' | 'reader'
  stillWanted?: () => boolean
  onSettled?: () => void
}

function releaseReaderHold(container: Element) {
  setHeld(container, false)
}

export function handBackPending(container: Element) {
  const until = handBackUntil.get(container)
  return until !== undefined && performance.now() < until
}

export function handBackFollow(request: HandBackRequest) {
  const stillWanted = request.stillWanted ?? (() => true)
  const onSettled = request.onSettled ?? null
  const scroller = conversationScroller()
  if (scroller === null) {
    if (onSettled !== null) onSettled()
    return
  }
  const token = (handBackTokens.get(scroller) ?? 0) + 1
  handBackTokens.set(scroller, token)
  handBackUntil.set(scroller, performance.now() + HAND_BACK_SETTLE_MS)
  releaseReaderHold(scroller)
  const button = findFollowTailButton()
  if (button !== null) {
    if (!stillWanted()) {
      if (onSettled !== null) onSettled()
      return
    }
    button.click()
  }
  let looks = 0
  const look = () => {
    if (handBackTokens.get(scroller) !== token || !stillWanted() || looks >= HAND_BACK_LOOKS) {
      if (onSettled !== null) onSettled()
      return
    }
    looks += 1
    if (findFollowTailButton() === null) {
      // The host has switched its follow back on: the one request is done.
      if (onSettled !== null) onSettled()
      return
    }
    window.setTimeout(look, HAND_BACK_LOOK_MS)
  }
  window.setTimeout(look, HAND_BACK_LOOK_MS)
}
```

> `releaseReaderHold` lives beside `setHeld` because the held set is module-private. `handBackUntil` stays set for the full 500ms even after the button disappears, so the reader-position write-back skips that window.

- [ ] **Step 4: Skip the reader write-back while a hand-back is pending**

In `packages/client/src/features/chat-follow/chat-follow.ts`, import `handBackPending` and change the write-back condition at line 454:

```ts
if (!handBackPending(scroller)) writeScroll(scroller, readerScrollPosition(scroller)!, 'reader')
```

Change the `ensure` call at line 546 to the new signature:

```ts
handBackFollow({ source: 'follow', reason: 'structure', stillWanted: () => !stopped && !readerAway() })
```

- [ ] **Step 5: Run the mechanism specs**

Run:

```powershell
node node_modules/vitest/vitest.mjs run packages/testing/specs/mechanism/scroll-ownership
```

Expected: PASS, existing owner and touch-hold cases plus the new one-click case.

- [ ] **Step 6: Run the chat-follow behaviour spec**

Run:

```powershell
node packages/testing/stand-in.mjs --spec chat-follow
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add packages/engine/src/scroll-owner.ts packages/client/src/features/chat-follow/chat-follow.ts packages/testing/specs/mechanism/scroll-ownership
git commit -m "fix: 回到底部只交接一次"
```

---

### Task 5: 文档、变更片段与验收表

**Files:**
- Add: `docs/adr/D97-host-delivers-desktop-notifications.md`
- Add: `docs/adr/D98-hand-back-is-one-request.md`
- Modify: `docs/adr/README.md`
- Add: `docs/changes/desktop-notifications-and-scroll-return.json`
- Modify: `docs/INSTALL.md`
- Modify: `README.md`
- Modify: `README.en.md`
- Add: `docs/tests/2026-11-12-desktop-notification-scroll.md`

- [ ] **Step 1: Write the two ADRs**

Use the shape of `docs/adr/D95-stream-slide-counter-pins.md`: 背景、决定、后果、重审条件. D97 records that the Windows notification identity belongs to the plugin and the host half sends it through a bounded system process. D98 records that a hand-back is one request, one confirmation, and never a repeated click.

- [ ] **Step 2: Regenerate the ADR index**

Run:

```powershell
npm run docs:index
npm run docs:check
```

Expected: PASS.

- [ ] **Step 3: Add the changelog fragment**

Create `docs/changes/desktop-notifications-and-scroll-return.json`:

```json
{
  "at": "2026-11-12",
  "group": "fixes",
  "order": 1,
  "external": true,
  "zh": "修复桌面端提示通知没有系统气泡，以及点回到底部后新内容到达时窗口跳到旧位置的问题",
  "en": "Deliver system notifications from the desktop host and keep the transcript at the end after the reader returns to it"
}
```

- [ ] **Step 4: Update installation and README copy**

`docs/INSTALL.md` adds:

```md
## 桌面通知

- Windows 桌面端由宿主半发送系统通知，需要 PowerShell 5.1；AUMID 从 DSH 自己的开始菜单快捷方式读取，点击协议处理器由首次发送注册。
- 点击通知回到对应会话；协议处理器注册失败时，通知仍会显示，但点击只打开窗口。
- `dsh web` 使用站点通知权限；首次使用需在设置页按「允许通知」。
```

Both READMEs change the notification line to mention the desktop host channel. Follow the existing bilingual structure; do not add decision numbers.

- [ ] **Step 5: Write the acceptance table**

`docs/tests/2026-11-12-desktop-notification-scroll.md` copies the N4 and S4 tables from the design document, adds the exact build and install commands, and records the expected evidence for each row.

- [ ] **Step 6: Run the documentation gates**

Run:

```powershell
npm run changelog
npm run docs:check
npm run agents:check
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add docs/adr docs/changes docs/INSTALL.md README.md README.en.md docs/tests
git commit -m "docs: 记录桌面通知与回到底部的行为"
```

---

### Task 6: 构建与全量验证

**Files:**
- No source edits; verification only.

- [ ] **Step 1: Build the plugin**

Run:

```powershell
npm run build
```

Expected: PASS; `lib/client.js`, `lib/host/index.js` and `lib/notify/*` written.

- [ ] **Step 2: Run the focused mechanism and behaviour lanes**

Run:

```powershell
node node_modules/vitest/vitest.mjs run packages/testing/specs/mechanism/scroll-ownership
node packages/testing/stand-in.mjs --spec notifications
node packages/testing/stand-in.mjs --spec chat-follow
```

Expected: PASS.

- [ ] **Step 3: Run the full verification**

Run:

```powershell
npm run verify
```

Expected: PASS; retain the run's verdict and counts for the handoff.

- [ ] **Step 4: Package and install into the desktop profile**

Run:

```powershell
npm pack
powershell.exe -NoProfile -Command "& 'D:\Program Files\DeepSeekHarness\resources\runtime\cli\bin\dsh.cmd' plugin --profile desktop install .\dsh-claude-style-lite-0.2.1.tgz"
```

Restart DeepSeek Harness, then run the N4 and S4 tables from `docs/tests/2026-11-12-desktop-notification-scroll.md`.

- [ ] **Step 5: Commit the version bump and package metadata**

```powershell
git add package.json package-lock.json docs/CHANGELOG.md
git commit -m "chore: 版本升至 0.2.1"
```
