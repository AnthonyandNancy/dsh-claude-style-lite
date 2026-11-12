import {chromium} from 'file:///D:/code/ai/dsh-claude-style-dist-build/node_modules/playwright/index.mjs'
import {readFileSync} from 'node:fs'

const installed = 'C:/Users/guojl/.dsh/profiles/desktop/node_modules/dsh-claude/dist/client.js'
const source = readFileSync(installed, 'utf8')
const browser = await chromium.launch({headless: true, executablePath: 'C:/Users/guojl/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe'})
try {
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.setContent('<!doctype html><html><head></head><body><div data-composer-dock></div></body></html>')
  await page.evaluate(() => {
    window.__registrations = []
    window.__ModuleLoader__ = {load: registration => window.__registrations.push(registration)}
    window.React = {
      createElement: () => null, Fragment: Symbol('Fragment'), useEffect() {}, useState(value) { return [value, () => {}] },
      useRef(value) { return {current: value} }, useMemo(callback) { return callback() }, useCallback(callback) { return callback },
      useSyncExternalStore() { return undefined }, useId() { return 'id' }, memo(component) { return component },
      createContext() { return {Provider: ({children}) => children, Consumer: () => null} }, forwardRef(component) { return component },
      useContext() { return undefined }, useLayoutEffect() {}, useReducer(state) { return [state, () => {}] },
      startTransition(callback) { callback() }, Children: {toArray: () => []},
    }
    window.ReactJSXRuntime = {jsx: () => null, jsxs: () => null, Fragment: Symbol('Fragment')}
    window.ReactDOM = {createPortal: () => null}
    window.ReactDOMClient = {createRoot: () => ({render() {}, unmount() {}})}
  })
  await page.addScriptTag({content: source})
  const result = await page.evaluate(() => {
    const registration = window.__registrations[0]
    const exports = registration.factory(specifier => {
      if (specifier === 'react') return React
      if (specifier === 'react/jsx-runtime') return ReactJSXRuntime
      if (specifier === 'react-dom') return ReactDOM
      if (specifier === 'react-dom/client') return ReactDOMClient
      if (specifier === '@deepseek-ai/dsh-client-ui-primitives') return new Proxy({}, {get: () => () => null})
      throw new Error(`unexpected external ${specifier}`)
    })
    const disposers = []
    const listeners = new Set()
    const forms = new Map()
    const formFor = namespace => {
      if (!forms.has(namespace)) {
        const state = {value: undefined, status: 'ready', base: undefined, user: undefined, revision: 0, writable: true}
        forms.set(namespace, {
          getSnapshot: () => ({...state}),
          subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener) },
          set: async (key, value) => { state.value = {...(state.value ?? {}), [key]: value}; for (const listener of listeners) listener(); return {ok: true} },
          unset: async () => ({ok: true}), mutate: async () => ({ok: true}),
        })
      }
      return forms.get(namespace)
    }
    const scoped = () => ({
      get: () => undefined, reflect: {get: () => undefined},
      effect: callback => { const dispose = callback(); if (typeof dispose === 'function') disposers.push(dispose) },
      slots: {inject() {}, register() { return () => {} }},
      configForms: {get: formFor}, fiber: {uid: 'scoped', state: 2, dispose: async () => {}},
    })
    const ctx = {
      get() { return undefined }, reflect: {get: () => undefined},
      effect(callback) { const dispose = callback(); if (typeof dispose === 'function') disposers.push(dispose) },
      inject(names, callback) { const dispose = callback(scoped()); return {dispose: async () => { if (typeof dispose === 'function') await dispose() }} },
      on() {}, emit() {},
      slots: {inject(name, callback) { const dispose = callback(); return () => { if (typeof dispose === 'function') dispose() } }, register() { return () => {} }},
      configForms: {get: formFor}, fiber: {uid: 'root', state: 2, dispose: async () => {}},
    }
    exports.apply(ctx)
    return {root: document.documentElement.getAttribute('data-dsh-claude'), style: document.querySelectorAll('style[data-plugin="dsh-claude"]').length}
  })
  console.log({result, errors})
} finally {
  await browser.close()
}
