import {chromium} from 'file:///D:/code/ai/dsh-claude-style-dist-build/node_modules/playwright/index.mjs'
import {readFileSync} from 'node:fs'

const source = readFileSync('dist/client.js', 'utf8')
const browser = await chromium.launch({headless: true, executablePath: 'C:/Users/guojl/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe'})
const page = await browser.newPage()
const errors = []
page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()) })
page.on('pageerror', err => errors.push(err.stack))
await page.setContent('<!doctype html><html><head></head><body><div id="root"><div data-composer-dock></div></div></body></html>')
await page.evaluate(() => {
  window.__registrations = []
  window.__ModuleLoader__ = {load: r => window.__registrations.push(r)}
  window.React = {
    createElement: () => null, Fragment: Symbol('Fragment'), useEffect(){}, useState(v){return [v,()=>{}]},
    useRef(v){return {current:v}}, useMemo(f){return f()}, useCallback(f){return f}, useSyncExternalStore(){return undefined},
    useId(){return 'id'}, memo(f){return f}, createContext(){return {Provider: ({children})=>children, Consumer:()=>null}},
    forwardRef(f){return f}, useContext(){return undefined}, useLayoutEffect(){}, useReducer(s){return [s,()=>{}]},
    startTransition(f){f()}, Children:{toArray:()=>[]},
  }
  window.ReactJSXRuntime = {jsx:()=>null, jsxs:()=>null, Fragment: Symbol('Fragment')}
  window.ReactDOM = {createPortal: () => null}
  window.ReactDOMClient = {createRoot: () => ({render(){}, unmount(){}})}
})
await page.addScriptTag({content: source})
const result = await page.evaluate(async () => {
  const registration = window.__registrations[0]
  const exports = registration.factory(specifier => {
    if (specifier === 'react') return React
    if (specifier === 'react/jsx-runtime') return ReactJSXRuntime
    if (specifier === 'react-dom') return ReactDOM
    if (specifier === 'react-dom/client') return ReactDOMClient
    if (specifier === '@deepseek-ai/dsh-client-ui-primitives') return new Proxy({}, {get:()=>()=>null})
    throw new Error('external ' + specifier)
  })
  const effects = []
  const fiberDisposers = []
  const listeners = new Set()
  const values = new Map()
  const forms = new Map()
  const formFor = ns => {
    if (!forms.has(ns)) {
      const state = {value: undefined, status: 'ready', base: undefined, user: undefined, revision: 0, writable: true}
      forms.set(ns, {
        getSnapshot: () => ({...state}),
        subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn) },
        set: async (key, value) => { state.value = {...(state.value||{}), [key]: value}; for (const fn of listeners) fn(); return {ok:true} },
        unset: async () => ({ok:true}), mutate: async () => ({ok:true}),
      })
    }
    return forms.get(ns)
  }
  const mkScoped = () => ({
    get: () => undefined, reflect: {get: () => undefined},
    effect: cb => { const d = cb(); if (typeof d === 'function') effects.push(d) },
    slots: {inject(){}, register(){return ()=>{}}},
    configForms: {get: formFor},
    fiber: {uid:'scoped', state:2, dispose: async()=>{}},
  })
  const ctx = {
    get() { return undefined }, reflect: {get: () => undefined},
    effect(cb, label) { try { const d = cb(); if (typeof d === 'function') effects.push(d) } catch (e) { console.error('EFFECT', label, e.stack); throw e } },
    inject(names, cb) { const d = cb(mkScoped()); const f = {dispose: async()=>{ if (typeof d === 'function') await d() }}; fiberDisposers.push(f); return f },
    on(){}, emit(){},
    slots: {inject(name, cb) { const d = cb(); return () => { if (typeof d === 'function') d() } }, register(options, component) { return () => {} }},
    configForms: {get: formFor},
    fiber: {uid:'root', state:2, dispose: async()=>{}},
  }
  exports.apply(ctx)
  const before = {
    root: document.documentElement.getAttribute('data-dsh-claude'),
    style: document.querySelectorAll('style[data-plugin="dsh-claude"]').length,
    effects: effects.length,
    fibers: fiberDisposers.length,
  }
  // disable via the shared settings form
  const form = formFor('dsh-claude')
  await form.set('enabled', false)
  const disabled = {
    root: document.documentElement.getAttribute('data-dsh-claude'),
    theme: document.documentElement.getAttribute('data-dsc-theme'),
  }
  await form.set('enabled', true)
  const reenabled = {root: document.documentElement.getAttribute('data-dsh-claude')}
  for (const dispose of effects.splice(0).reverse()) await dispose()
  for (const f of fiberDisposers) await f.dispose()
  const unloaded = {
    root: document.documentElement.getAttribute('data-dsh-claude'),
    style: document.querySelectorAll('style[data-plugin="dsh-claude"]').length,
  }
  return {before, disabled, reenabled, unloaded}
})
console.log(JSON.stringify({result, errors}, null, 2))
await browser.close()
