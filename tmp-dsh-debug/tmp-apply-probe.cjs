const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')

const noop = () => {}
const listeners = new Map()
class ClassList { add(){} remove(){} toggle(){} contains(){return false} }
function element(tag='div') {
  const el = {
    tagName: String(tag).toUpperCase(), nodeName: String(tag).toUpperCase(),
    style: { setProperty(){}, removeProperty(){}, getPropertyValue(){return ''} },
    dataset: {}, classList: new ClassList(), children: [], childNodes: [], parentNode: null,
    isConnected: false, textContent: '', innerHTML: '', className: '',
    attributes: new Map(),
    setAttribute(k,v=''){this.attributes.set(k,String(v))}, getAttribute(k){return this.attributes.has(k)?this.attributes.get(k):null},
    hasAttribute(k){return this.attributes.has(k)}, removeAttribute(k){this.attributes.delete(k)},
    toggleAttribute(k,f){const n=f===undefined?!this.hasAttribute(k):!!f;if(n)this.setAttribute(k);else this.removeAttribute(k);return n},
    append(...nodes){for(const n of nodes){this.children.push(n);n.parentNode=this;n.isConnected=this.isConnected}},
    appendChild(n){this.append(n);return n},
    insertBefore(n){this.append(n);return n},
    remove(){}, replaceChildren(...n){this.children=n}, removeChild(n){return n}, insertAdjacentHTML(){},
    querySelector(){return null}, querySelectorAll(){return []}, closest(){return null}, matches(){return false},
    addEventListener(t,f){listeners.set(this,t+':'+String(f),f)}, removeEventListener(){}, dispatchEvent(){return true},
    getBoundingClientRect(){return {x:0,y:0,width:100,height:20,top:0,left:0,right:100,bottom:20}}, getClientRects(){return [{}]}, checkVisibility(){return true},
    focus(){}, blur(){}, scrollIntoView(){}, setSelectionRange(){}, getRootNode(){return document},
  }
  return el
}
const documentElement = element('html')
const body = element('body')
const head = element('head')
const document = {
  documentElement, body, head, readyState: 'complete', visibilityState: 'visible',
  createElement: tag => element(tag), createTextNode: t => ({textContent:String(t)}),
  createRange(){ return {setStart(){},setEnd(){},getBoundingClientRect(){return {x:0,y:0,width:1,height:1,top:0,left:0,right:1,bottom:1}},getClientRects(){return [{}]},collapsed:true} },
  querySelector(){return null}, querySelectorAll(){return []}, addEventListener(){}, removeEventListener(){},
  hasFocus(){return true}, getElementById(){return null}, getSelection(){return null},
}
document.defaultView = null
const media = {matches:false, addEventListener(){}, removeEventListener(){}, addListener(){}, removeListener(){}}
const window = {
  document, matchMedia: () => media, innerWidth: 1400, innerHeight: 900, devicePixelRatio: 1,
  addEventListener(){}, removeEventListener(){}, requestAnimationFrame: cb => 1, cancelAnimationFrame(){}, setTimeout: (cb,ms)=>0, clearTimeout(){}, setInterval: ()=>1, clearInterval(){},
  localStorage: {getItem(){return null},setItem(){},removeItem(){}}, navigator: {language:'zh-CN', platform:'Win32'}, location:{href:'http://localhost/'},
  getComputedStyle(){return {getPropertyValue(){return ''}, color:'rgb(0,0,0)', fontSize:'14px'}},
  MutationObserver: class {observe(){} disconnect(){} takeRecords(){return []}},
  getSelection(){return null}, customElements: {define(){}}, navigator: {language:'zh-CN'}, CSS: {escape:s=>s},
}
window.window = window
const globals = {window, document, navigator: window.navigator, location: window.location, MutationObserver: window.MutationObserver,
  requestAnimationFrame: window.requestAnimationFrame, cancelAnimationFrame: window.cancelAnimationFrame,
  setTimeout: window.setTimeout, clearTimeout: window.clearTimeout, setInterval: window.setInterval, clearInterval: window.clearInterval,
  HTMLElement: class {}, HTMLTextAreaElement: class {}, HTMLBRElement: class {}, Element: class {}, Node: class {}, Text: class {},
  Range: class {}, CSS: {escape:s=>s}, getComputedStyle: window.getComputedStyle, Notification: undefined, ResizeObserver: class {observe(){} disconnect(){}},
  KeyboardEvent: class {}, MouseEvent: class {}, Event: class {}, AnimationEvent: class {}, DOMRect: class {},
  console, process, Buffer, URL, URLSearchParams, TextEncoder, TextDecoder,
}
const context = vm.createContext({...globals})
vm.runInContext('globalThis.window = globalThis.window;', context)

let registration
context.window.__ModuleLoader__ = {load: r => { registration = r }}
const source = fs.readFileSync(path.join(__dirname, 'dist/client.js'), 'utf8')
vm.runInContext(source, context)

function cordisContext({runEffects=true, runSeats=true}={}) {
  const effects = []
  const slotsCalls = []
  const forms = new Map()
  const makeForm = ns => ({
    getSnapshot: () => ({status:'unavailable', value: undefined, base: undefined, user: undefined, revision: 0, writable: false}),
    subscribe: () => () => {},
    set: async () => ({ok:true}), unset: async () => ({ok:true}), mutate: async () => ({ok:true}),
  })
  const services = {
    slots: {
      inject(name, cb) {
        slotsCalls.push(name)
        if (!runSeats) return
        const dispose = cb()
        if (typeof dispose !== 'function') throw new Error(`slots.inject ${name} callback returned ${typeof dispose}`)
      },
      register(options, component) {
        if (!options || typeof options !== 'object') throw new Error('slots.register options missing')
        if (typeof options.name !== 'string') throw new Error('slots.register name missing')
        if (typeof component !== 'function') throw new Error(`slots.register component for ${options.name} is ${typeof component}`)
        return () => {}
      },
    },
    configForms: { get(ns) { if (!forms.has(ns)) forms.set(ns, makeForm(ns)); return forms.get(ns) } },
    reflect: { get: () => undefined },
    get(name) { return getService(name) },
    inject(names, cb) {
      if (runEffects) {
        const scoped = cordisContext({runEffects, runSeats} )
        // provide only if names all "available" in this probe
        const missing = names.filter(n => !['remote','sessions','uiConversation','locale','uiSession','slots','modelDirectories'].includes(n))
        if (missing.length === 0) { const d = cb(scoped); if (typeof d === 'function') effects.push(d) }
      }
      return { dispose: () => {} }
    },
    effect(cb, label) {
      try {
        const d = cb()
        if (typeof d === 'function') effects.push(d)
      } catch (error) {
        console.error('EFFECT THREW:', label)
        throw error
      }
    },
    on(){}, emit(){}, waterfall(){}, parallel(){},
    fiber: {uid:'probe', state:2, dispose: async()=>{}},
  }
  return services
}
function getService(name) { return null }

for (const runSeats of [false, true]) {
  console.log(`\n=== apply probe runSeats=${runSeats} ===`)
  let exports
  try {
    exports = registration.factory(specifier => {
      if (specifier === 'react') return require('react')
      if (specifier === 'react/jsx-runtime') return require('react/jsx-runtime')
      if (specifier === 'react-dom') return {createPortal: () => null}
      if (specifier === 'react-dom/client') return {createRoot: () => ({render(){},unmount(){}})}
      if (specifier === '@deepseek-ai/dsh-client-ui-primitives') return new Proxy({}, {get:()=>()=>null})
      throw new Error('unexpected external '+specifier)
    })
    const ctx = cordisContext({runEffects:true, runSeats})
    exports.apply(ctx)
    console.log('APPLY OK')
  } catch (error) {
    console.error('APPLY FAILED')
    console.error(error && error.stack || error)
  }
}
