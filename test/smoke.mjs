/**
 * Render-path smoke test for the dsh-skillcard client bundle.
 *
 * `client.js` is plain browser JavaScript with no build step, so this harness
 * evaluates the real factory with a minimal React stand-in, mounts every slot
 * registration it produces, and re-mounts after clicking the page's own
 * buttons. It proves the component tree builds and that every `t()` key exists
 * in both shipped dictionaries; it is not a visual check.
 *
 * Run: node test/smoke.mjs
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const source = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')

// ------------------------------------------------------------------ React shim
const hooksByPath = new Map()
const effectDeps = new Map()
let hookPath = ''
let cursor = 0

function withHooks(path, run) {
  const previous = hookPath
  const previousCursor = cursor
  hookPath = path
  cursor = 0
  try {
    return run()
  } finally {
    hookPath = previous
    cursor = previousCursor
  }
}

function slot(init) {
  const key = hookPath + '#' + cursor++
  if (!hooksByPath.has(key)) hooksByPath.set(key, typeof init === 'function' ? init() : init)
  return [
    hooksByPath.get(key),
    (next) => {
      const current = hooksByPath.get(key)
      hooksByPath.set(key, typeof next === 'function' ? next(current) : next)
    },
  ]
}

const React = {
  Fragment: Symbol('react.fragment'),
  createElement(type, props, ...children) {
    const config = { ...(props ?? {}) }
    if (children.length === 1) config.children = children[0]
    else if (children.length > 1) config.children = children
    return { type, props: config }
  },
  useState: slot,
  useRef(init) {
    const key = hookPath + '#' + cursor++
    if (!hooksByPath.has(key)) hooksByPath.set(key, { current: init })
    return hooksByPath.get(key)
  },
  useEffect(fn, deps) {
    // Deps are compared like React does, so a state toggle is not clobbered by an
    // unrelated re-render. The disposer is not called: a cleanup would cancel
    // pending async loads.
    const key = hookPath + '#' + cursor++
    const previous = effectDeps.get(key)
    const first = previous === undefined
    const same = Array.isArray(deps) && previous !== undefined
      ? deps.length === previous.length && deps.every((value, index) => Object.is(value, previous[index]))
      : false
    if (!first && Array.isArray(deps) && same) return
    if (Array.isArray(deps)) effectDeps.set(key, deps)
    else effectDeps.delete(key)
    fn()
  },
  useLayoutEffect() {},
  useMemo(factory) {
    return factory()
  },
  useCallback(fn) {
    return fn
  },
  Component: class Component {
    constructor(props) {
      this.props = props
      this.state = {}
    }

    setState(next) {
      this.state = { ...this.state, ...(typeof next === 'function' ? next(this.state) : next) }
    }
  },
}

// ----------------------------------------------------------------- DOM/browser
const documentStub = {
  querySelector: () => null,
  createElement: () => ({ textContent: '', setAttribute() {}, remove() {} }),
  head: { append() {} },
}
const storage = new Map()
const windowStub = {
  localStorage: {
    getItem: (key) => (storage.has(key) ? storage.get(key) : null),
    setItem: (key, value) => storage.set(key, String(value)),
  },
  setTimeout: (fn) => {
    return 0
  },
  clearTimeout: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  setInterval: () => 0,
  clearInterval: () => {},
  fetch: async () => ({ ok: true, status: 200, json: async () => ({ ok: true, value: {} }) }),
}

// -------------------------------------------------------------- module capture
let captured
const loaderHost = {
  __ModuleLoader__: {
    load(registration) {
      captured = registration
    },
  },
}
Object.assign(windowStub, loaderHost)

const cards = [
  {
    id: 'sc_a',
    title: '查天气',
    description: '查某地某天的天气',
    template: '使用天气技能帮我查看${地点}在${日期}的天气',
    variables: [
      { name: '地点', label: '地点', example: '深圳' },
      { name: '日期', label: '日期', example: '明天' },
    ],
    category: '天气',
    skill: 'weather',
    pinned: true,
    uses: 2,
    createdAt: 1,
    updatedAt: 2,
  },
  {
    id: 'sc_b',
    title: '写周报',
    description: '',
    template: '把${周期}的工作整理成周报',
    variables: [{ name: '周期', label: '时间范围', example: '本周' }],
    category: '',
    skill: '',
    pinned: false,
    uses: 0,
    createdAt: 1,
    updatedAt: 1,
  },
]

const fetchStub = async (url, init) => {
  const body = String(url)
  if (body.endsWith('/cards')) return { ok: true, status: 200, json: async () => ({ ok: true, value: { cards, config: {} } }) }
  if (body.includes('/runs/record')) {
    let status = 'unknown'
    try {
      status = JSON.parse(String(init?.body ?? '{}')).run?.status ?? 'unknown'
    } catch {
      status = 'unparseable'
    }
    events.push('record:' + status)
    return { ok: true, status: 200, json: async () => ({ ok: true, value: { run: { id: 'run-1' } } }) }
  }
  if (body.includes('/runs/delete')) {
    return { ok: true, status: 200, json: async () => ({ ok: true, value: { deleted: 1 } }) }
  }
  if (body.includes('/runs')) {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        value: {
          runs: [
            {
              id: 'run-1',
              cardId: 'sc_a',
              cardTitle: '查天气',
              status: 'done',
              prompt: '/weather 使用天气技能帮我查看深圳在明天的天气',
              answer: '深圳明天晴，26℃。',
              finishedAt: 1794066830810,
            },
          ],
        },
      }),
    }
  }
  if (body.endsWith('/skills')) {
    return {
      ok: true,
      status: 200,
      json: async () => ({ ok: true, value: { skills: [{ name: 'weather', description: '天气' }] } }),
    }
  }
  return { ok: true, status: 200, json: async () => ({ ok: true, value: {} }) }
}
windowStub.fetch = fetchStub

const translatorState = { dicts: {}, missing: new Set() }

function translate(key, params) {
  const dict = translatorState.dicts.zh ?? {}
  const en = translatorState.dicts.en ?? {}
  if (!(key in dict) || !(key in en)) translatorState.missing.add(key)
  const template = dict[key] ?? key
  return String(template).replace(/\{([a-zA-Z0-9_]+)\}/g, (match, name) => {
    const value = params?.[name]
    return value === undefined ? match : String(value)
  })
}

const run = new Function(
  'window',
  'document',
  'require',
  'fetch',
  'navigator',
  'crypto',
  'Intl',
  'setTimeout',
  'clearTimeout',
  `${source}\n;return window.__lastRegistration`,
)

let registration
try {
  run(
    windowStub,
    documentStub,
    (id) => {
      if (id === 'react') return React
      throw new Error('unexpected require: ' + id)
    },
    fetchStub,
    { clipboard: { writeText: async () => {} } },
    undefined,
    Intl,
    () => 0,
    () => {},
  )
  registration = captured
} catch (error) {
  console.error('FAIL: evaluating client.js threw:', error)
  process.exit(1)
}

if (registration === undefined || typeof registration.factory !== 'function') {
  console.error('FAIL: client.js did not register a module factory')
  process.exit(1)
}

const product = registration.factory((id) => {
  if (id === 'react') return React
  // The bundle renders floating surfaces through a body portal when react-dom is
  // available; the harness has no DOM, so the inline fallback path is exercised.
  if (id === 'react-dom') return {}
  throw new Error('unexpected require: ' + id)
})

// --------------------------------------------------------------- fake context
const registrations = []
const events = []
const ctx = {
  effect(fn) {
    const disposer = fn()
    return typeof disposer === 'function' ? disposer : () => {}
  },
  on: () => () => {},
  get(name) {
    if (name === 'layout') return { selectPanel: (id) => events.push('selectPanel:' + id) }
    return undefined
  },
  locale: {
    register(_ns, dicts) {
      translatorState.dicts = dicts
      return () => {}
    },
    bind: () => translate,
    getSnapshot: () => ({ active: 'zh', locales: [], revision: 0 }),
  },
  slots: {
    inject(_key, callback) {
      callback()
      return () => {}
    },
    register(options, Component) {
      registrations.push({ options, Component })
      return () => {}
    },
  },
  remote: {
    skills: { list: async () => ({ ok: true, value: { skills: [] } }) },
    agentPresets: {
      list: async () => ({
        ok: true,
        value: {
          presets: [
            { id: 'minimal', isDefault: true, name: '极简模式' },
            { id: 'standard', isDefault: false, name: '标准模式' },
          ],
        },
      }),
    },
    session: {
      modelCatalog: async () => ({
        ok: true,
        value: {
          default: { provider: 'demo', model: 'm1' },
          routableProviders: ['demo'],
          groups: [
            {
              id: 'demo',
              name: 'Demo',
              models: [
                { id: 'm1', name: 'Model one' },
                { id: 'm2', name: 'Model two' },
              ],
            },
          ],
          failures: [],
        },
      }),
      selectModel: async (request) => {
        events.push('selectModel:' + String(request?.provider ?? '-') + '/' + String(request?.model ?? '-'))
        return { ok: true, value: { selected: { provider: request.provider, model: request.model } } }
      },
      create: async (request) => {
        events.push('create:' + String(request?.workspaceId ?? '-') + '/' + String(request?.agentPreset ?? '-'))
        return { ok: true, value: { sessionId: 'session-run' } }
      },
      rename: async () => ({ ok: true, value: { title: '卡片', seq: 1 } }),
      prompt: async (request) => {
        events.push('prompt:' + String(request?.content?.[0]?.text ?? ''))
        return { ok: true, value: { accepted: true } }
      },
      wait: async () => ({
        ok: true,
        value: {
          reason: 'idle',
          state: { cursor: 12, active: false, running: false, queue: null, pendingInput: [] },
          output: {
            truncated: false,
            records: [
              {
                type: 'event',
                event: {
                  type: 'assistant/message',
                  seq: 11,
                  time: 1,
                  surfaceOp: 'append',
                  data: { message: { role: 'assistant', content: [{ type: 'text', text: '深圳明天晴，26℃。' }] } },
                },
              },
            ],
          },
        },
      }),
      cancel: async () => ({ ok: true, value: { accepted: true } }),
    },
  },
  uiWorkspace: { startSession: (...args) => events.push('startSession:' + args.length) },
}

try {
  product.apply(ctx)
} catch (error) {
  console.error('FAIL: apply() threw:', error)
  process.exit(1)
}

const errors = []
let rendered = 0
let collected = []
let collectedOptions = []
let collectedText = []
let collectedExpanded = []
const resetCollectedText = () => { collectedText = [] }

function renderFunction(type, props, path) {
  const element = withHooks(path, () => type(props))
  rendered++
  walk(element, path, type.name || 'anonymous')
}

function renderClass(type, props, path) {
  const instance = new type(props)
  instance.props = props
  const element = instance.render()
  rendered++
  walk(element, path, type.name || 'Class')
}

function walk(node, path, label) {
  if (node === null || node === undefined || node === false || node === true) return
  if (Array.isArray(node)) {
    node.forEach((child, index) => walk(child, path + '[' + index + ']', label))
    return
  }
  if (typeof node === 'string' || typeof node === 'number') {
    collectedText.push(String(node))
    return
  }
  if (typeof node !== 'object' || node.type === undefined) {
    errors.push(`${path}: unexpected node ${typeof node}`)
    return
  }
  const { type, props } = node
  if (type === React.Fragment) {
    walk(props.children, path + '>fragment', label)
    return
  }
  if (typeof type === 'string') {
    if ((type === 'button' || (props.role === 'button' && typeof props.onClick === 'function')) && typeof props.onClick === 'function') {
      collected.push({ text: flattenText(props.children), onClick: props.onClick })
    }
    if (type === 'option' && typeof props.value === 'string') collectedOptions.push(props.value)
    if (typeof props['aria-expanded'] === 'boolean') collectedExpanded.push(props['aria-expanded'])
    walk(props.children, path + '>' + type, label)
    return
  }
  if (typeof type === 'function') {
    const childPath = path + '>' + (type.name || 'anonymous')
    try {
      if (type.prototype && typeof type.prototype.render === 'function') renderClass(type, props, childPath)
      else renderFunction(type, props, childPath)
    } catch (error) {
      errors.push(`${childPath}: ${error instanceof Error ? error.message : String(error)}`)
    }
    return
  }
  errors.push(`${path}: unsupported element type ${String(type)}`)
}

function flattenText(node) {
  if (node === null || node === undefined || node === false) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(flattenText).join('')
  if (typeof node === 'object' && node.props !== undefined) return flattenText(node.props.children)
  return ''
}

function findRegistrations(name) {
  return registrations.filter((entry) => entry.options.name === name)
}

function mount(name, extraProps) {
  const found = findRegistrations(name)
  if (found.length !== 1) {
    errors.push(`${name}: expected exactly one registration, found ${found.length}`)
    return undefined
  }
  const entry = found[0]
  const injected = typeof entry.options.inject === 'function' ? entry.options.inject() : {}
  const props = { ...injected, ...extraProps }
  const path = 'root'
  const renderOnce = () => {
    collected = []
    collectedOptions = []
    collectedText = []
    collectedExpanded = []
    try {
      if (entry.Component.prototype && typeof entry.Component.prototype.render === 'function') {
        renderClass(entry.Component, props, path)
      } else {
        renderFunction(entry.Component, props, path)
      }
    } catch (error) {
      errors.push(`${name}: mount threw ${error instanceof Error ? error.message : String(error)}`)
    }
    return collected
  }
  // The first pass lets the store-backed hooks settle (React would re-render
  // after the state write); the second pass is the observable tree.
  renderOnce()
  const buttons = renderOnce()
  return { entry, injected, buttons, options: collectedOptions, flags: collectedExpanded }
}

// The store loads asynchronously; wait for the bridge responses first.
const main = mount('main', {
  useSessions: () => ({ ids: [], byId: {}, phase: 'ready', projectionsBySession: {} }),
})
const sessionProps = {
  useWorkspaces: () => ({
    items: [
      {
        workspaceId: 'ws1',
        path: 'C:/proj',
        title: '示例工作区',
        sessionIds: ['session-test'],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    archivedSessionIds: [],
    pinnedSessionIds: [],
    state: 'idle',
    phase: 'ready',
    error: null,
  }),
  useSessions: () => ({
    ids: ['session-test'],
    byId: {
      'session-test': { sessionId: 'session-test', updatedAt: 2, projectionValues: { title: '测试会话' } },
    },
    phase: 'ready',
    projectionsBySession: {},
  }),
}
if (main !== undefined) {
  await main.injected.store.refresh()
  hooksByPath.clear()
}
mount('main', sessionProps)

mount('sidebar.panellist', { size: 16, active: false })

// Re-render the panel and click the actions that swap its main pane, so the
// editor, the AI form and a card's detail tree all get built.
const renderedNames = new Set()
const originalRenderFunction = renderFunction
const originalRenderClass = renderClass
renderFunction = function tracked(type, props, path) {
  renderedNames.add(type.name || 'anonymous')
  return originalRenderFunction(type, props, path)
}
renderClass = function tracked(type, props, path) {
  renderedNames.add(type.name || 'Class')
  return originalRenderClass(type, props, path)
}

const clicked = []
function clickButton(buttons, pattern) {
  const found = buttons.find((button) => pattern.test(button.text))
  if (found === undefined) {
    errors.push(`no button matching ${pattern}`)
    return undefined
  }
  clicked.push(found.text)
  try {
    found.onClick()
  } catch (error) {
    errors.push(`button "${found.text}" onClick threw ${error instanceof Error ? error.message : String(error)}`)
  }
  return found
}

let page = mount('main', sessionProps)
await new Promise((resolve) => setTimeout(resolve, 0))
page = mount('main', sessionProps)
clickButton(page.buttons, /查天气/)
// A card without its own skill: any option here must come from the catalog.
page = mount('main', sessionProps)
clickButton(page.buttons, /写周报/)
page = mount('main', sessionProps)
clickButton(page.buttons, /编辑/)
page = mount('main', sessionProps)
if (!page.options.includes('weather')) errors.push('the card editor skill picker does not list the catalog (weather)')
clickButton(page.buttons, /取消/)
page = mount('main', sessionProps)
clickButton(page.buttons, /AI 生成/)
page = mount('main', sessionProps)
if (!page.options.includes('weather')) errors.push('the AI form skill picker does not list the catalog (weather)')
clickButton(page.buttons, /新建/)
page = mount('main', sessionProps)
clickButton(page.buttons, /取消/)
page = mount('main', sessionProps)

// The management panel hands the card to the sidebar popover instead of running it.
if (main !== undefined) {
  main.injected.store.select('sc_a')
  main.injected.store.setValue('sc_a', '地点', '深圳')
  main.injected.store.setValue('sc_a', '日期', '明天')
}
page = mount('main', sessionProps)
clickButton(page.buttons, /在浮层里执行|Run in the quick panel/)
page = mount('main', sessionProps)
if (main.injected.store.get().popoverRequest?.cardId !== 'sc_a') {
  errors.push('the management panel did not hand the card to the popover')
}

// The sidebar-foot popover is the only place that runs a card. The hand-off from
// the panel above already opened it on the handed-over card.
const foot = mount('sidebar.footer.action', { ...sessionProps, wide: true })
await new Promise((resolve) => setTimeout(resolve, 0))
let pickerHost = mount('sidebar.footer.action', { ...sessionProps, wide: true })
if (main.injected.store.get().selectedId !== 'sc_a') errors.push('the handed-over card is not selected in the popover')
// The card picker is a select-with-search: open it, switch cards, switch back.
clickButton(pickerHost.buttons, /^使用的卡片/)
pickerHost = mount('sidebar.footer.action', { ...sessionProps, wide: true })
clickButton(pickerHost.buttons, /写周报/)
pickerHost = mount('sidebar.footer.action', { ...sessionProps, wide: true })
if (main.injected.store.get().selectedId !== 'sc_b') errors.push('the card picker did not select the clicked card')
clickButton(pickerHost.buttons, /^使用的卡片/)
pickerHost = mount('sidebar.footer.action', { ...sessionProps, wide: true })
clickButton(pickerHost.buttons, /查天气/)
pickerHost = mount('sidebar.footer.action', { ...sessionProps, wide: true })
if (main.injected.store.get().selectedId !== 'sc_a') errors.push('the card picker did not select the weather card back')
clickButton(pickerHost.buttons, /^执行$/)
await new Promise((resolve) => setTimeout(resolve, 0))
mount('sidebar.footer.action', { ...sessionProps, wide: true })
const creates = events.filter((event) => event.startsWith('create:'))
if (creates.length !== 1) errors.push(`expected exactly one run session (creates: ${creates.join(', ')})`)
if (!events.includes('selectModel:demo/m1')) {
  errors.push('the run did not pin the default provider/model: ' + events.filter((e) => e.startsWith('selectModel:')).join(', '))
}
if (!creates.every((event) => event === 'create:ws1/standard')) {
  errors.push(`a run used the wrong default target (creates: ${creates.join(', ')})`)
}
const prompts = events.filter((event) => event.startsWith('prompt:'))
if (prompts.length !== 1) errors.push(`expected exactly one run prompt (prompts: ${prompts.length})`)
if (!prompts.every((event) => event === 'prompt:/weather 使用天气技能帮我查看深圳在明天的天气')) {
  errors.push(`the run did not inject the card skill as a /name gesture (prompts: ${prompts.join(' | ')})`)
}
if (!collectedText.includes('深圳明天晴，26℃。')) errors.push('the run answer never reached the view')
// A history row expands and collapses by clicking the row itself.
let hist = mount('sidebar.footer.action', { ...sessionProps, wide: true })
if (collectedText.includes('提问')) errors.push('a history row started expanded')
clickButton(hist.buttons, /▸/)
hist = mount('sidebar.footer.action', { ...sessionProps, wide: true })
if (!collectedText.includes('提问') || !collectedText.includes('回答')) {
  errors.push('clicking a history row did not expand it')
}
clickButton(hist.buttons, /▾/)
hist = mount('sidebar.footer.action', { ...sessionProps, wide: true })
if (collectedText.includes('提问')) errors.push('clicking an expanded history row did not collapse it')

const recorded = events.filter((event) => event.startsWith('record:'))
if (!recorded.includes('record:running')) errors.push('the run was not recorded as running when it started')
if (!recorded.includes('record:done')) errors.push('the finished run was never recorded to history')
if (recorded.filter((event) => event === 'record:done').length !== 1) {
  errors.push('the finished run was recorded more than once: ' + recorded.join(', '))
}

for (const expected of ['CardDetail', 'CardEditor', 'AiForm', 'SkillCardPage', 'SkillCardFooter', 'RunnerTarget', 'RunResult']) {
  if (!renderedNames.has(expected)) errors.push(`component never rendered: ${expected}`)
}

// ------------------------------------------------------------------- report
if (translatorState.missing.size > 0) {
  errors.push('missing locale keys: ' + Array.from(translatorState.missing).join(', '))
}
if (events.length === 0) errors.push('no interaction reached the plugin actions layer (events empty)')

console.log(`rendered components: ${rendered}`)
console.log(`registrations: ${registrations.map((entry) => entry.options.name + '/' + (entry.options.id ?? entry.options.key)).join(', ')}`)
console.log(`clicked: ${clicked.length === 0 ? '(none)' : clicked.join(' | ')}`)
console.log(`events: ${events.join(', ') || '(none)'}`)
if (errors.length > 0) {
  console.error('FAIL:\n - ' + errors.join('\n - '))
  process.exit(1)
}
console.log('OK: client bundle renders every registration without throwing')
