/**
 * The notification routes and their Windows toast handoff.
 *
 * The browser half sends one copy request at a time; the host writes the copy
 * to short-lived files so no user text reaches a command line. Windows reads
 * the installed DSH shortcut's AppUserModel ID at runtime, because the toast
 * must use the identity the Start Menu registration actually carries.
 */
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { NOTIFY_BODY_MAX, NOTIFY_KINDS, NOTIFY_TITLE_MAX } from '@dsh-claude-style/contracts/notify'
import { NOTIFY_ACTIVATION_PATH, NOTIFY_PATH } from '@dsh-claude-style/contracts/routes'
import { failAnswer, fenceRefused, methodRefused, readRequestBody, sendJson } from '@dsh-claude-style/engine/node/http'
import type { HostNotifyActivation, HostNotifyCapability, HostNotifyChannel, HostNotifyRequest } from '@dsh-claude-style/contracts/notify'
import type { DshContext, DshRequest, DshResponse, DshRoute } from '@dsh-claude-style/engine/node/dsh'

/** The largest request body either route reads; a target request is a few hundred bytes. */
const BODY_MAX = 8 * 1024
/** A click older than this is no longer the reader's intent. */
const ACTIVATION_TTL_MS = 120_000
/** The session ids a click may name; the same shape the browser writes into the protocol URL. */
const SESSION_ID = /^[A-Za-z0-9_-]{1,128}$/
/** This plugin's directory under the harness home, holding the activation handoff. */
const PLUGIN_DIRECTORY = 'dsh-claude-style-lite'
/** How much output the notification process may leave in its pipes. */
const PROCESS_OUTPUT_MAX = 4 * 1024
/** How long the host waits for a notification process before the subprocess service ends it. */
const PROCESS_GRACE_MS = 5_000

/** One shortcut returned by the Start Menu shell reader. */
export interface StartMenuShortcut {
  /** The executable the shortcut points at, as the Shell resolves it. */
  target: string
  /** The application identity Windows uses to attribute the toast. */
  aumid: string
}

/** The host's real subprocess surface, typed where this module uses it. */
export interface NotifySpawnSpec {
  argv: string[]
  cwd: string
  stdio: {
    stdin: 'ignore'
    stdout: { maxBytes: number }
    stderr: { maxBytes: number }
  }
  graceMs: number
}

/** The process outcome the subprocess handle carries. */
export interface NotifyExit {
  exitCode: number | null
  signal: string | null
}

/** The host subprocess handle; `done` is the process outcome. */
export interface NotifySubprocessHandle {
  done: Promise<NotifyExit>
  waitForExit(signal?: AbortSignal): Promise<boolean>
}

/** The host subprocess service this route starts notification processes through. */
export interface NotifySubprocess {
  spawn(spec: NotifySpawnSpec): NotifySubprocessHandle
}

/** The state and processes a notification route reads. */
export interface NotifyHost {
  platform: NodeJS.Platform
  subprocess: NotifySubprocess | null
  /** The harness home, which holds the activation handoff and the temporary copy files. */
  home: string
  /** The copied script under lib/notify; the package root is already resolved by routes.ts. */
  scriptPath: string
  /** The AUMID DSH registered for itself, resolved from its own Start Menu shortcut. */
  notifyAumid: string | null
  /** Whether a successful toast send has registered the click protocol. */
  protocolRegistered: boolean
}

/** The host channels that run a process; `browser` never reaches the spawn surface. */
type HostNotificationChannel = Exclude<HostNotifyChannel, 'browser'>

/**
 * The PowerShell 5.1 reader for the running executable's shortcut.
 *
 * `WScript.Shell.CreateShortcut()` resolves the target path, which is all this
 * scan matches on. Its `AppUserModelID` field is empty for the real DSH
 * shortcut, so the AUMID comes from the Shell namespace's
 * `System.AppUserModel.ID` extended property, read only for the shortcut whose
 * target already matched. The executable arrives in the environment so no path
 * reaches a command line.
 */
const START_MENU_SCRIPT = String.raw`
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'
$rows = @()
$wanted = [string]$env:DSH_CLAUDE_STYLE_NOTIFY_EXECUTABLE
if ([string]::IsNullOrWhiteSpace($wanted)) {
  ConvertTo-Json -InputObject @($rows) -Compress -Depth 3
  exit 0
}
$wanted = $wanted.Replace('\', '/').ToLowerInvariant()
$wscript = New-Object -ComObject WScript.Shell
$shell = New-Object -ComObject Shell.Application
$roots = @(
  [Environment]::GetFolderPath('StartMenu'),
  [Environment]::GetFolderPath('CommonStartMenu')
)
foreach ($root in $roots) {
  if ([string]::IsNullOrWhiteSpace($root) -or -not (Test-Path -LiteralPath $root)) { continue }
  foreach ($file in @(Get-ChildItem -LiteralPath $root -Filter *.lnk -Recurse -File -ErrorAction SilentlyContinue)) {
    $target = [string]$wscript.CreateShortcut($file.FullName).TargetPath
    if ([string]::IsNullOrWhiteSpace($target)) { continue }
    if ($target.Replace('\', '/').ToLowerInvariant() -ne $wanted) { continue }
    $folder = $shell.Namespace($file.DirectoryName)
    if ($null -eq $folder) { continue }
    $item = $folder.ParseName($file.Name)
    if ($null -eq $item) { continue }
    $aumid = [string]$item.ExtendedProperty('System.AppUserModel.ID')
    if (-not [string]::IsNullOrWhiteSpace($aumid)) {
      $rows += [pscustomobject]@{ target = $target; aumid = $aumid }
    }
  }
}
ConvertTo-Json -InputObject @($rows) -Compress -Depth 3
`

/** The shortcut scans already made, keyed by normalized executable. */
const shortcutScans = new Map<string, readonly StartMenuShortcut[]>()

/** Compare executables the way the Windows Start Menu records them. */
function comparablePath(value: string): string {
  return value.replaceAll('\\', '/').toLowerCase()
}

/**
 * Read the Start Menu shortcut whose target is the running executable.
 *
 * The scan is memoized for the host process: a plugin relink or several route
 * registrations do not start PowerShell again. A PowerShell failure leaves the
 * list empty, which makes the Windows capability fall back to the browser
 * instead of failing registration.
 */
export function readStartMenuShortcuts(executable: string = process.execPath): readonly StartMenuShortcut[] {
  const key = comparablePath(executable)
  const cached = shortcutScans.get(key)
  if (cached !== undefined) return cached
  if (process.platform !== 'win32') {
    shortcutScans.set(key, [])
    return []
  }
  let entries: readonly StartMenuShortcut[]
  try {
    const output = execFileSync('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      START_MENU_SCRIPT,
    ], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 15_000,
      maxBuffer: 4 * 1024 * 1024,
      env: { ...process.env, DSH_CLAUDE_STYLE_NOTIFY_EXECUTABLE: executable },
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    entries = parseShortcutJson(output)
  } catch {
    // A host where PowerShell cannot be started still registers every route;
    // the Windows capability reads an empty list and answers `browser`.
    entries = []
  }
  shortcutScans.set(key, entries)
  return entries
}

/** Turn the Shell reader's JSON into the pure resolver's entries. */
function parseShortcutJson(output: string): readonly StartMenuShortcut[] {
  const parsed = JSON.parse(output.replace(/^\uFEFF/, '').trim()) as unknown
  if (!Array.isArray(parsed)) return []
  const entries: StartMenuShortcut[] = []
  for (const value of parsed) {
    if (value === null || typeof value !== 'object') continue
    const row = value as Record<string, unknown>
    if (typeof row.target !== 'string' || row.target.trim() === '') continue
    if (typeof row.aumid !== 'string' || row.aumid.trim() === '') continue
    entries.push({ target: row.target, aumid: row.aumid })
  }
  return entries
}

/**
 * Resolve the AUMID of the shortcut whose target is the running executable.
 * Separators and case are normalized so the Start Menu and process spellings
 * compare equal on Windows.
 */
export function desktopAumidFromShortcuts(entries: readonly { target: string, aumid: string | null }[], executable: string): string | null {
  const wanted = comparablePath(executable)
  for (const entry of entries) {
    if (entry.aumid === null || entry.aumid.trim() === '') continue
    if (comparablePath(entry.target) === wanted) return entry.aumid
  }
  return null
}

/** The channel this host can use, and whether its click hands a session back. */
export function notifyCapability(host: NotifyHost): Omit<HostNotifyCapability, 'ok'> {
  if (host.platform === 'win32' && host.subprocess !== null && host.notifyAumid !== null && host.notifyAumid.trim() !== '') {
    return { channel: 'toast', clickReturnsSession: host.protocolRegistered }
  }
  if (host.platform === 'darwin' && host.subprocess !== null) return { channel: 'osascript', clickReturnsSession: false }
  if (host.platform === 'linux' && host.subprocess !== null && existsSync('/usr/bin/notify-send')) {
    return { channel: 'notify-send', clickReturnsSession: false }
  }
  return { channel: 'browser', clickReturnsSession: false }
}

/** Validate one notification request against the shared limits and id shape. */
export function notifyRequest(value: unknown): HostNotifyRequest | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  if (typeof row.title !== 'string' || row.title.trim() === '' || row.title.length > NOTIFY_TITLE_MAX) return null
  if (typeof row.body !== 'string' || row.body.length > NOTIFY_BODY_MAX) return null
  if (typeof row.sessionId !== 'string' || !SESSION_ID.test(row.sessionId)) return null
  if (typeof row.kind !== 'string' || !(NOTIFY_KINDS as readonly string[]).includes(row.kind)) return null
  return { title: row.title, body: row.body, sessionId: row.sessionId, kind: row.kind as HostNotifyRequest['kind'] }
}

/** The activation handoff file under the harness home. */
export function activationFile(home: string): string {
  return join(home, PLUGIN_DIRECTORY, 'notify-activation.json')
}

/**
 * Read and delete the waiting activation once.
 *
 * The file is removed before its contents are trusted: a malformed, stale or
 * path-shaped handoff is consumed rather than handed to the page repeatedly.
 */
export function readActivation(home: string): HostNotifyActivation | null {
  const file = activationFile(home)
  if (!existsSync(file)) return null
  const text = readFileSync(file, 'utf8')
  rmSync(file, { force: true })
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return null
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  if (typeof row.sessionId !== 'string' || !SESSION_ID.test(row.sessionId)) return null
  if (typeof row.at !== 'number' || !Number.isFinite(row.at)) return null
  if (Date.now() - row.at > ACTIVATION_TTL_MS) return null
  return { sessionId: row.sessionId, at: row.at }
}

/** Write one activation handoff; the toast protocol handler owns this shape in production. */
export function writeActivation(home: string, sessionId: string): void {
  const directory = join(home, PLUGIN_DIRECTORY)
  mkdirSync(directory, { recursive: true })
  writeFileSync(activationFile(home), JSON.stringify({ sessionId, at: Date.now() }), 'utf8')
}

/**
 * `GET` reports the notification channel; `POST` starts one host notification.
 * A host without a usable channel answers 409, so the page keeps its browser
 * fallback instead of attempting a page constructor through this route.
 */
export function createNotifyRoute(ctx: DshContext, host: NotifyHost): DshRoute {
  return {
    path: NOTIFY_PATH,
    kind: 'exact',
    handler: (req: DshRequest, res: DshResponse) => {
      if (methodRefused(req, res, ['GET', 'POST'])) return
      if (fenceRefused(ctx, req, res)) return
      if (req.method === 'POST') {
        void sendNotifyPost(host, req, res).catch((error: unknown) => failAnswer(res, error))
        return
      }
      sendJson(res, 200, { ok: true, ...notifyCapability(host) })
    },
  }
}

/** Decode the request JSON and run the shared field validation. */
function decodeNotifyBody(body: Buffer): { request: HostNotifyRequest } | { error: string } {
  let value: unknown
  try {
    value = JSON.parse(body.toString('utf8'))
  } catch {
    // The request's own malformed body is answered 400; no host state is touched.
    return { error: 'request body is not JSON' }
  }
  const request = notifyRequest(value)
  return request === null ? { error: 'invalid notification' } : { request }
}

/** Read, validate and hand one POST to the channel; every client error is answered here. */
async function sendNotifyPost(host: NotifyHost, req: DshRequest, res: DshResponse): Promise<void> {
  const body = await readRequestBody(req, BODY_MAX)
  if (body === null) {
    sendJson(res, 413, { ok: false, error: 'request body too large' })
    return
  }
  const decoded = decodeNotifyBody(body)
  if ('error' in decoded) {
    sendJson(res, 400, { ok: false, error: decoded.error })
    return
  }
  const request = decoded.request
  const capability = notifyCapability(host)
  if (capability.channel === 'browser') {
    sendJson(res, 409, { ok: false, error: 'host notification channel unavailable' })
    return
  }
  await sendHostNotification(host, capability.channel, request)
  if (capability.channel === 'toast') host.protocolRegistered = true
  sendJson(res, 200, { ok: true })
}

/**
 * `GET` takes the one activation a clicked notification left behind. A missing
 * or invalid handoff answers `{ ok: true, activation: null }`.
 */
export function createNotifyActivationRoute(ctx: DshContext, host: NotifyHost): DshRoute {
  return {
    path: NOTIFY_ACTIVATION_PATH,
    kind: 'exact',
    handler: (req: DshRequest, res: DshResponse) => {
      if (methodRefused(req, res, ['GET'])) return
      if (fenceRefused(ctx, req, res)) return
      sendJson(res, 200, { ok: true, activation: readActivation(host.home) })
    },
  }
}

/** Start the platform's notification process and await its `done` outcome. */
async function sendHostNotification(host: NotifyHost, channel: HostNotificationChannel, request: HostNotifyRequest): Promise<void> {
  if (host.subprocess === null) throw new Error('subprocess service unavailable')
  const directory = join(host.home, PLUGIN_DIRECTORY)
  const titleFile = channel === 'toast' ? join(directory, `notify-title-${randomUUID()}.txt`) : null
  const bodyFile = channel === 'toast' ? join(directory, `notify-body-${randomUUID()}.txt`) : null
  try {
    if (titleFile !== null && bodyFile !== null) {
      mkdirSync(directory, { recursive: true })
      writeFileSync(titleFile, request.title, 'utf8')
      writeFileSync(bodyFile, request.body, 'utf8')
    }
    const argv = channel === 'toast'
      ? [
          'powershell.exe',
          '-NoProfile',
          '-NonInteractive',
          '-WindowStyle',
          'Hidden',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          host.scriptPath,
          '-TitleFile',
          titleFile ?? '',
          '-BodyFile',
          bodyFile ?? '',
          '-SessionId',
          request.sessionId,
          '-Kind',
          request.kind,
          '-Aumid',
          host.notifyAumid ?? '',
        ]
      : channel === 'osascript'
        ? ['osascript', '-e', 'on run argv', '-e', 'display notification (item 2 of argv) with title (item 1 of argv)', '-e', 'end run', request.title, request.body]
        : ['notify-send', request.title, request.body]
    const handle = host.subprocess.spawn({
      argv,
      cwd: host.home,
      stdio: {
        stdin: 'ignore',
        stdout: { maxBytes: PROCESS_OUTPUT_MAX },
        stderr: { maxBytes: PROCESS_OUTPUT_MAX },
      },
      graceMs: PROCESS_GRACE_MS,
    })
    const outcome = await handle.done
    if (outcome.exitCode !== 0) {
      throw new Error(`notification process exited ${outcome.exitCode === null ? String(outcome.signal) : String(outcome.exitCode)}`)
    }
  } finally {
    if (titleFile !== null) rmSync(titleFile, { force: true })
    if (bodyFile !== null) rmSync(bodyFile, { force: true })
  }
}
