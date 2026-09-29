// 复查区（conversation.input.dock）渲染冒烟测试（2026-09-29 新增）
//
// 背景：v2.5.0 重构把 `const todosKey = ...` 挪到了使用它的依赖数组之后，
// 渲染时先求值 `[todosKey]` → TDZ ReferenceError → 复查区在浏览器里整块不渲染
// （用户"从来没看见过复查区"的真因）。当时没有渲染级测试，所以没拦住。
//
// 本测试用「模拟 React + 假 ctx」把 lib/client.js 真正 apply 一遍，并真渲染组件一次：
//   ① 有未完成待办 → 必须渲染出节点（抓 TDZ / 未定义变量这类"渲染即炸"的错）
//   ② 没有待办 → 返回 null（不占位）
//   ③ dock 注册带 inject(sessionId)（组件靠它拿会话 id 查证据；官方 queue dock 同款写法）
// 纯离线：不联网、不触碰任何运行中的 dsh 实例。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const SRC = fileURLToPath(new URL('../lib/client.js', import.meta.url))
const source = readFileSync(SRC, 'utf8')

/** 最小 React 替身：hooks 按调用顺序返回稳定值，createElement 产出可检查的树节点。 */
function mockReact() {
  let hookIndex = 0
  const state = []
  const effects = []
  const api = {
    Fragment: Symbol('Fragment'),
    createElement(type, props, ...children) {
      const flat = children.flat()
      const merged = Object.assign({}, props || {})
      if (flat.length > 0) merged.children = flat.length === 1 ? flat[0] : flat
      return { type, props: merged, children: flat }
    },
    useState(initial) {
      const i = hookIndex++
      if (!(i in state)) state[i] = typeof initial === 'function' ? initial() : initial
      return [state[i], (next) => { state[i] = typeof next === 'function' ? next(state[i]) : next }]
    },
    useRef(initial) { hookIndex++; return { current: initial } },
    useEffect(fn) { hookIndex++; effects.push(fn) },
    useSyncExternalStore(_subscribe, getSnapshot) { hookIndex++; return getSnapshot() },
    __reset() { hookIndex = 0; effects.length = 0 },
  }
  return api
}

/** 假 ctx：记录插件对 slots 做了什么。 */
function fakeCtx() {
  const calls = { injects: [], registrations: [], ctxInjects: [], effects: [] }
  const slots = {
    inject(name, fn) { calls.injects.push(name); return fn() },
    register(options, component) {
      calls.registrations.push({ name: options.name, id: options.id, order: options.order, inject: options.inject, component })
      return () => {}
    },
  }
  const ctx = {
    get(name) { return name === 'slots' ? slots : undefined },
    inject(deps, callback) {
      const names = Array.isArray(deps) ? deps : [deps]
      calls.ctxInjects.push(names)
      if (names.some((name) => ctx.get(name) === undefined)) return undefined
      const scope = {}
      for (const name of names) scope[name] = ctx.get(name)
      return callback(scope)
    },
    effect(fn) { calls.effects.push(fn); return fn() },
  }
  return { ctx, calls }
}

/** 在受控的 window/document/fetch 下加载 lib/client.js，拿到 { apply, inject }。 */
function loadClient() {
  const store = new Map()
  let captured = null
  const win = {
    __ModuleLoader__: { load(def) { captured = def } },
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
    },
    addEventListener() {}, removeEventListener() {},
    dispatchEvent() { return true },
  }
  const doc = { getElementById: () => null, createElement: () => ({ id: '', textContent: '', style: {} }), head: { appendChild() {} } }
  const previous = { window: globalThis.window, document: globalThis.document, fetch: globalThis.fetch }
  globalThis.window = win
  globalThis.document = doc
  // 组件会打两个只读接口（config / review）；测试里返回空对象即可
  globalThis.fetch = async () => ({ ok: true, json: async () => ({}) })
  try {
    new Function('window', 'document', source)(win, doc)
    assert.ok(captured !== null, '客户端模块没有通过 __ModuleLoader__ 注册')
    const react = mockReact()
    const mod = captured.factory((name) => {
      if (name === 'react') return react
      throw new Error('意外的 require: ' + name)
    })
    return { mod, react }
  } finally {
    globalThis.window = previous.window
    globalThis.document = previous.document
    globalThis.fetch = previous.fetch
  }
}

/** 注册出来的组件是 (props) => createElement(ReviewPanelView, ...)，要再往里走一层才算真渲染。 */
function render(react, component, props) {
  react.__reset()
  let tree = component(props)
  if (tree && typeof tree.type === 'function') tree = tree.type(tree.props)
  return tree
}

test('复查区：有未完成待办时必须渲染出面板（抓"渲染即炸"）', () => {
  const { mod, react } = loadClient()
  const { ctx, calls } = fakeCtx()
  mod.apply(ctx)

  const dock = calls.registrations.find((r) => r.name === 'conversation.input.dock')
  assert.ok(dock, '应注册 conversation.input.dock（复查区）')
  assert.equal(typeof dock.inject, 'function', 'dock 注册应带 inject 回调（用于拿 sessionId）')

  const todos = [{ content: '写回归测试', status: 'pending' }]
  const tree = render(react, dock.component, {
    useProjection: () => todos,
    ...dock.inject('session-1'),
  })
  assert.ok(tree, '有未完成待办时不应返回 null')
  assert.equal(tree.type, 'div', '应渲染出面板外壳节点')
})

test('复查区：没有待办时不渲染', () => {
  const { mod, react } = loadClient()
  const { ctx, calls } = fakeCtx()
  mod.apply(ctx)
  const dock = calls.registrations.find((r) => r.name === 'conversation.input.dock')
  const tree = render(react, dock.component, {
    useProjection: () => [],
    ...(typeof dock.inject === 'function' ? dock.inject('session-1') : {}),
  })
  assert.equal(tree, null, '空列表应不渲染')
})

test('复查区：inject 必须把 sessionId 交到组件手里', () => {
  const { mod } = loadClient()
  const { ctx, calls } = fakeCtx()
  mod.apply(ctx)
  const dock = calls.registrations.find((r) => r.name === 'conversation.input.dock')
  const props = dock.inject('session-42')
  assert.equal(props.sessionId, 'session-42', 'inject(sessionId) 应回传 sessionId，组件靠它按会话查证据')
})
