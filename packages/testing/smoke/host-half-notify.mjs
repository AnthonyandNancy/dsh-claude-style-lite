/**
 * The smoke's notification routes, in Node: the capability and fence, the
 * request contract, a toast send through the host's real subprocess handle
 * shape, a failed process, and the one-shot activation file. The Start Menu
 * resolver is checked with fake shortcut entries only, so the run does not
 * depend on this machine's installed shortcut. The two Windows files are
 * checked at source level because running them would show a real toast and
 * change the reader's protocol registration.
 */
import fs from 'fs'
import path from 'path'
import { pathToFileURL } from 'url'
import { HOST_NOTIFY_PROTOCOL } from '../../contracts/src/notify.ts'
import { runsPath } from '../../../scripts/shared/debug-paths.mjs'
import { ROOT, check } from './shared.mjs'

const NOTIFY = '/dsh-claude-style-lite/notify'
const ACTIVATION = '/dsh-claude-style-lite/notify-activation'

/** Check the Windows toast script and its protocol handler without running a toast. */
function checkNotifyScripts() {
  console.log('\nhost half — notification script and protocol handler source')
  const scriptPath = path.join(ROOT, 'packages', 'host', 'src', 'notify', 'toast.ps1')
  const handlerPath = path.join(ROOT, 'packages', 'host', 'src', 'notify', 'handler.vbs')
  const hasScript = fs.existsSync(scriptPath)
  const hasHandler = fs.existsSync(handlerPath)
  check('the toast script ships at packages/host/src/notify/toast.ps1', hasScript, scriptPath)
  check('the protocol handler ships beside it', hasHandler, handlerPath)
  if (!hasScript || !hasHandler) return

  const bytes = fs.readFileSync(scriptPath)
  const hasBom = bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF
  const script = (hasBom ? bytes.subarray(3) : bytes).toString('utf8')
  const parameters = [...(script.match(/param\(([\s\S]*?)\n\)/)?.[1] ?? '').matchAll(/\[string\]\$([A-Za-z]+)/g)]
    .map((match) => match[1])
  check('toast.ps1 starts with a UTF-8 BOM and is ASCII below it',
    hasBom && [...script].every((character) => character.charCodeAt(0) <= 0x7F), `BOM ${hasBom}`)
  check('the toast script takes the six process arguments in order',
    parameters.join(',') === 'TitleFile,BodyFile,SessionId,Kind,Aumid,Protocol', parameters.join(','))
  check('the AUMID argument is mandatory', script.includes('[Parameter(Mandatory = $true)][string]$Aumid'))
  check('the toast reads its title and body from UTF-8 files',
    script.includes('Get-Content -LiteralPath $Path -Raw -Encoding UTF8'))
  check('the toast uses the host-resolved AUMID without a fixed identity',
    script.includes('CreateToastNotifier($Aumid)') && !script.includes('electron.app') && !script.includes('DeepSeek Harness'))
  check('the toast names the protocol shared by both halves', script.includes(HOST_NOTIFY_PROTOCOL))
  check('a session click carries the protocol launch',
    script.includes('activationType="protocol"') && script.includes('[uri]::EscapeDataString($SessionId)') &&
      script.includes("$Protocol + '://open?session='"))
  check('the toast is silent', script.includes('audio silent="true"'))
  check('the toast registers the protocol for its handler',
    script.includes('HKCU:\\Software\\Classes\\$Protocol') && script.includes("'URL Protocol'") &&
      script.includes('handler.vbs') && script.includes('wscript.exe //B //Nologo') && script.includes('shell\\open\\command'))

  const handler = fs.readFileSync(handlerPath, 'utf8')
  check('the handler parses the session query parameter', handler.includes('"session"') && handler.includes('Function SessionFromUrl'))
  check('the handler URL-decodes the value before writing',
    handler.includes('Function Decode') && handler.includes('Function HexValue'))
  check('the handler accepts only session-id characters',
    handler.includes('^[A-Za-z0-9_-]{1,128}$') && handler.includes('re.IgnoreCase = False'))
  check('the handler escapes a JSON string', handler.includes('Function JsonString') && handler.includes('Chr(92)'))
  check('the handler writes the activation file under the harness home',
    handler.includes('%DSH_HOME%') && handler.includes('%USERPROFILE%\\.dsh') &&
      handler.includes('dsh-claude-style-lite') && handler.includes('notify-activation.json'))
  check('the handler records the session id and epoch milliseconds',
    handler.includes('""sessionId""') && handler.includes('""at""') &&
      handler.includes('DateDiff("s", "1/1/1970", Now()) * 1000'))
  check('the handler starts the DSH protocol after writing', handler.includes('shell.Run "dsh://open", 0, False'))
  check('the handler carries neither the toast title nor its body',
    !handler.includes('Title') && !handler.includes('Body') &&
      !handler.includes('electron.app') && !handler.includes('DeepSeek Harness'))
}

/**
 * Run the notification route checks.
 *
 * @param options.mod - the host-half module (lib/host/index.js).
 * @param options.fakeHost - the fake cordis context (host-half.mjs).
 * @param options.request - one request through a registered route (host-half.mjs).
 * @param options.browser - the headers of a same-origin loopback page.
 * @param options.crossSite - the headers of a page from another origin.
 */
async function hostNotify({ mod, fakeHost, request, browser, crossSite }) {
  checkNotifyScripts()
  console.log('\nhost half — notification routes: capability, request contract, toast and activation')
  const notify = await import(pathToFileURL(path.join(ROOT, 'lib', 'host', 'notify.js')).href)
  const home = runsPath(ROOT, 'smoke', 'notify-home')
  fs.rmSync(home, { recursive: true, force: true })
  try {
    const spawned = []
    let exitCode = 0
    // The host's real subprocess contract: spawn resolves to a handle whose
    // `done` promise carries the process outcome. `waitForExit` is present on
    // the real handle but is not an exit outcome; the route must await `done`.
    const subprocess = {
      spawn(spec) {
        spawned.push(spec)
        return {
          done: Promise.resolve({ exitCode, signal: null }),
          waitForExit: () => Promise.resolve(true),
        }
      },
    }
    const contextHost = fakeHost(mod, { fenced: true, home, subprocess })
    check('the fake host supplies the optional subprocess service', contextHost.ctx.get('subprocess') === subprocess)

    check('the notification routes are registered',
      contextHost.routes[NOTIFY] !== undefined && contextHost.routes[ACTIVATION] !== undefined,
      JSON.stringify(Object.keys(contextHost.routes).filter((route) => route.includes('notify'))))
    const registered = await request(contextHost, NOTIFY, 'GET', '', browser)
    const registeredCapability = registered.status === 200 ? JSON.parse(registered.body) : null
    check('the registered notification route answers a capability',
      registeredCapability?.ok === true && ['toast', 'osascript', 'notify-send', 'browser'].includes(registeredCapability.channel) &&
        registeredCapability.clickReturnsSession === false,
      JSON.stringify(registeredCapability))

    const direct = { routes: {} }
    const host = {
      platform: 'win32',
      subprocess,
      home,
      scriptPath: path.join(ROOT, 'lib', 'notify', 'toast.ps1'),
      notifyAumid: 'Dsh.Notify.Test',
      protocolRegistered: false,
    }
    direct.routes[NOTIFY] = notify.createNotifyRoute(contextHost.ctx, host)
    direct.routes[ACTIVATION] = notify.createNotifyActivationRoute(contextHost.ctx, host)
    const payload = (patch = {}) => JSON.stringify({
      title: 'Notify smoke title',
      body: 'Notify smoke body',
      sessionId: 'session-notify-smoke',
      kind: 'finished',
      ...patch,
    })

    const capability = JSON.parse((await request(direct, NOTIFY, 'GET', '', browser)).body)
    check('a Windows host with subprocess and an AUMID reports toast before the first send',
      capability.ok === true && capability.channel === 'toast' && capability.clickReturnsSession === false,
      JSON.stringify(capability))

    const unavailableHost = { ...host, subprocess: null }
    const unavailable = { routes: { [NOTIFY]: notify.createNotifyRoute(contextHost.ctx, unavailableHost) } }
    const noChannelCapability = JSON.parse((await request(unavailable, NOTIFY, 'GET', '', browser)).body)
    check('a host without the subprocess service reports the browser channel',
      noChannelCapability.ok === true && noChannelCapability.channel === 'browser' && noChannelCapability.clickReturnsSession === false,
      JSON.stringify(noChannelCapability))
    const noChannel = await request(unavailable, NOTIFY, 'POST', payload(), browser)
    check('a host without a notification channel answers 409 and starts no process',
      noChannel.status === 409 && JSON.parse(noChannel.body).ok === false && spawned.length === 0,
      `HTTP ${noChannel.status} ${noChannel.body}`)

    const refused = await request(direct, NOTIFY, 'POST', payload(), crossSite)
    check('a notification without the same-origin fence is refused', refused.status === 403 && spawned.length === 0, `HTTP ${refused.status}`)

    const malformed = await request(direct, NOTIFY, 'POST', '{', browser)
    check('a malformed notification body is refused', malformed.status === 400 && spawned.length === 0, `HTTP ${malformed.status}`)
    const oversized = await request(direct, NOTIFY, 'POST', 'x'.repeat(8 * 1024 + 1), browser)
    check('an oversized notification body is refused', oversized.status === 413 && spawned.length === 0, `HTTP ${oversized.status}`)
    const longTitle = await request(direct, NOTIFY, 'POST', payload({ title: 'x'.repeat(129) }), browser)
    check('a title over 128 characters is refused', longTitle.status === 400 && spawned.length === 0, `HTTP ${longTitle.status}`)
    const longBody = await request(direct, NOTIFY, 'POST', payload({ body: 'x'.repeat(257) }), browser)
    check('a body over 256 characters is refused', longBody.status === 400 && spawned.length === 0, `HTTP ${longBody.status}`)
    const badKind = await request(direct, NOTIFY, 'POST', payload({ kind: 'other' }), browser)
    check('a kind outside the shared list is refused', badKind.status === 400 && spawned.length === 0, `HTTP ${badKind.status}`)
    const badSession = await request(direct, NOTIFY, 'POST', payload({ sessionId: '../escape' }), browser)
    check('a session id with path characters is refused', badSession.status === 400 && spawned.length === 0, `HTTP ${badSession.status}`)

    const sent = await request(direct, NOTIFY, 'POST', payload(), browser)
    const commandLine = spawned[0] === undefined ? '' : JSON.stringify(spawned[0].argv)
    check('a valid notification starts the toast script through the host spawn surface',
      sent.status === 200 && JSON.parse(sent.body).ok === true && spawned.length === 1 &&
        spawned[0].argv[0] === 'powershell.exe' && spawned[0].argv.includes('-NoProfile') &&
        spawned[0].argv.includes('-NonInteractive') && spawned[0].cwd === home &&
        spawned[0].stdio.stdin === 'ignore' && spawned[0].stdio.stdout.maxBytes > 0 &&
        spawned[0].stdio.stderr.maxBytes > 0 && spawned[0].graceMs > 0,
      `HTTP ${sent.status} ${JSON.stringify(spawned[0])}`)
    check('the command line never carries the title or body',
      commandLine.includes('Notify smoke title') === false && commandLine.includes('Notify smoke body') === false,
      commandLine)
    const afterSend = JSON.parse((await request(direct, NOTIFY, 'GET', '', browser)).body)
    check('a successful toast send records that clicking returns to the session',
      afterSend.channel === 'toast' && afterSend.clickReturnsSession === true, JSON.stringify(afterSend))

    exitCode = 1
    spawned.length = 0
    const failed = await request(direct, NOTIFY, 'POST', payload({ title: 'Failed title', body: 'Failed body' }), browser)
    check('a failed toast process answers 500', failed.status === 500 && JSON.parse(failed.body).ok === false, `HTTP ${failed.status} ${failed.body}`)
    check('a failed toast answer does not echo the title or body',
      failed.body.includes('Failed title') === false && failed.body.includes('Failed body') === false, failed.body)

    fs.mkdirSync(path.dirname(notify.activationFile(home)), { recursive: true })
    fs.writeFileSync(notify.activationFile(home), JSON.stringify({ sessionId: 'session-clicked', at: Date.now() }), 'utf8')
    const firstRead = JSON.parse((await request(direct, ACTIVATION, 'GET', '', browser)).body)
    check('the activation route returns the waiting click',
      firstRead.ok === true && firstRead.activation?.sessionId === 'session-clicked' && typeof firstRead.activation.at === 'number',
      JSON.stringify(firstRead))
    check('the activation file is deleted when it is read', fs.existsSync(notify.activationFile(home)) === false)
    const secondRead = JSON.parse((await request(direct, ACTIVATION, 'GET', '', browser)).body)
    check('a second activation read answers null', secondRead.ok === true && secondRead.activation === null, JSON.stringify(secondRead))

    fs.writeFileSync(notify.activationFile(home), JSON.stringify({ sessionId: 'session-stale', at: Date.now() - 120_001 }), 'utf8')
    const stale = JSON.parse((await request(direct, ACTIVATION, 'GET', '', browser)).body)
    check('an activation older than 120 seconds answers null and is consumed',
      stale.ok === true && stale.activation === null && fs.existsSync(notify.activationFile(home)) === false,
      JSON.stringify(stale))
    fs.writeFileSync(notify.activationFile(home), JSON.stringify({ sessionId: '../stale', at: Date.now() }), 'utf8')
    const invalid = JSON.parse((await request(direct, ACTIVATION, 'GET', '', browser)).body)
    check('an activation with an invalid session id answers null and is consumed',
      invalid.ok === true && invalid.activation === null && fs.existsSync(notify.activationFile(home)) === false,
      JSON.stringify(invalid))

    const executableWithSlashes = process.execPath.replaceAll('\\', '/').toUpperCase()
    check('the AUMID resolver matches the running executable after separator and case normalization',
      notify.desktopAumidFromShortcuts([
        { target: 'C:/Applications/Other.exe', aumid: 'Other.Application' },
        { target: executableWithSlashes, aumid: 'Running.Application' },
      ], process.execPath) === 'Running.Application')
    check('the AUMID resolver refuses a shortcut that targets another executable',
      notify.desktopAumidFromShortcuts([
        { target: 'C:/Applications/Other.exe', aumid: 'Other.Application' },
      ], process.execPath) === null)
  } finally {
    fs.rmSync(home, { recursive: true, force: true })
  }
}

export { checkNotifyScripts, hostNotify }
