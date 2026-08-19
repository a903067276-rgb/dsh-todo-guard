/**
 * dsh-todo-guard — Host 半
 *
 * todo 完成校验（证据三态）：
 * 1. 监听 tools/pre-execute：todo_write 提交时比对官方投影旧列表，
 *    本次新完成的条目逐条查证据标记（证据：路径）存在性
 * 2. 有证据且存在 → 放行；有证据查无此物 → deny（agent 可见失败原因）；
 *    无证据 → 放行（宽松，面板黄标"未验证"由 client 展示）
 * 3. 证据路径相对会话 cwd 解析（绝对路径直接用），支持多条证据
 *
 * 纯本地逻辑，零模型调用。Client 半负责顶替官方面板（conversation.input.dock
 * id:'todo'），修复官方重启后不显示的问题。
 *
 * 设置（settings.plugin.item 卡片可切，运行时生效）：
 * - verifyEnabled=true（默认）：完整校验（三态 + 拦截）
 * - verifyEnabled=false：关校验，走官方逻辑——只保留面板显示修复
 */
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'

const NS = settingsNamespace('todo-guard')

export const name = 'dsh-todo-guard'
export const inject = ['sessionProjections', 'webServer']

export function apply(ctx) {
  // 注册持久化设置（settings 可用时；不可用时默认全开）
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.register(
      NS,
      z.object({ verifyEnabled: z.boolean().required(false) }),
    )
  })

  // 读校验开关（默认开）
  const verifyEnabled = () => {
    const settings = ctx.get('settings')
    if (!settings) return true
    try {
      const v = settings.get(NS)
      return !v || v.verifyEnabled !== false
    } catch (e) {
      return true
    }
  }

  // 配置读写路由（client 设置卡片用）
  const webServer = ctx.get('webServer')
  if (webServer) {
    ctx.effect(() => webServer.register({
      kind: 'prefix',
      path: '/api/dsh-todo-guard',
      handler: async (req, res) => {
        try {
          const url = new URL(req.url ?? '/', 'http://dsh.local')
          const pathname = url.pathname.replace(/\/+$/, '')
          const writeJson = (code, obj) => {
            const body = JSON.stringify(obj)
            res.writeHead(code, { 'content-type': 'application/json' })
            res.end(body)
          }
          if (pathname !== '/api/dsh-todo-guard/config') {
            writeJson(404, { ok: false, error: 'not found' })
            return
          }
          if (req.method === 'GET' || req.method === 'HEAD') {
            writeJson(200, { ok: true, verifyEnabled: verifyEnabled() })
            return
          }
          if (req.method === 'POST' || req.method === 'PUT') {
            let bodyText = ''
            for await (const chunk of req) bodyText += chunk
            let next
            try {
              next = JSON.parse(bodyText || '{}').verifyEnabled
            } catch (e) { /* 走下方校验 */ }
            if (typeof next !== 'boolean') {
              writeJson(400, { ok: false, error: 'verifyEnabled 必须是布尔值' })
              return
            }
            const settings = ctx.get('settings')
            if (!settings) {
              writeJson(500, { ok: false, error: 'settings 服务不可用' })
              return
            }
            await settings.update(NS, { verifyEnabled: next })
            writeJson(200, { ok: true, verifyEnabled: next })
            return
          }
          writeJson(405, { ok: false, error: 'method not allowed' })
        } catch (e) {
          try {
            res.writeHead(500, { 'content-type': 'application/json' })
            res.end(JSON.stringify({ ok: false, error: String(e) }))
          } catch (e2) { /* 响应已关闭 */ }
        }
      },
    }), 'dsh-todo-guard: /api config route')
  }

  // 解析 todo 条目里的证据标记：（证据：路径）或（证据: 路径），支持多条
  function parseProofs(content) {
    const out = []
    const re = /[(（]\s*证据\s*[:：]\s*([^)）]+)[)）]/g
    let m
    while ((m = re.exec(content)) !== null) {
      const p = m[1].trim()
      if (p) out.push(p)
    }
    return out
  }

  // 证据存在性检查：相对会话 cwd 解析（绝对路径直接用），查无此物或解析失败返回 false
  async function exists(fs, path, cwd) {
    try {
      const target = await fs.resolve(path, { cwd: cwd || undefined })
      const info = await fs.stat(target)
      return info !== undefined
    } catch (e) {
      return false
    }
  }

  // 预热 todos 投影：新建会话（session/created）与恢复会话（agent/session-start，
  // 此时 in-memory log 已加载）都强制折叠，让 client 打开/重连/恢复会话时
  // 初始快照就有 todo 值——否则要等下一次 todo 事件驱动才渲染面板
  // （官方同源 bug：CC issue #50656，面板挂载由写事件触发而非数据存在触发）
  const warm = (session) => {
    try {
      ctx.sessionProjections.snapshot(session)
    } catch (e) { /* 投影未就绪时忽略，事件驱动仍会兜底 */ }
  }
  ctx.on('session/created', (session) => {
    warm(session)
  })
  ctx.on('agent/session-start', (payload) => {
    if (payload && payload.agent) warm(payload.agent.session)
  })

  ctx.on('tools/pre-execute', async (exec, next) => {
    try {
      if (exec.name !== 'todo_write') return next()
      const args = exec.arguments
      if (!args || !Array.isArray(args.todos)) return next()
      const agent = exec.agent
      if (!agent) return next()
      if (!verifyEnabled()) return next() // 开关关：走官方逻辑（只修显示）
      const fs = ctx.get('fs')
      if (!fs) return next()

      // 旧列表（官方投影，last-wins 全量）
      let oldList = []
      try {
        const snap = ctx.sessionProjections.snapshot(agent.session)
        if (snap && Array.isArray(snap.values.todos)) oldList = snap.values.todos
      } catch (e) { /* 投影未就绪时视作无旧列表 */ }

      const oldStatus = new Map(oldList.map((t) => [t.content, t.status]))
      // 会话工作目录：Session 对象没有 cwd 属性，可靠来源是 header.cwd
      // （会话创建时的工作目录，绝对路径）——之前误用 agent.session.cwd
      // 恒为 undefined，相对路径证据全部解析失败（fallback 到宿主目录）
      let cwd = ''
      try {
        if (agent.session.header && typeof agent.session.header.cwd === 'string') cwd = agent.session.header.cwd
      } catch (e) { /* header 缺失时保持空 */ }
      const fails = []
      for (const t of args.todos) {
        if (t.status !== 'completed') continue
        if (oldStatus.get(t.content) === 'completed') continue // 本来就已完成，跳过
        const proofs = parseProofs(t.content)
        for (const p of proofs) {
          if (!(await exists(fs, p, cwd))) {
            fails.push('「' + t.content + '」的证据（' + p + '）不存在')
          }
        }
      }
      if (fails.length === 0) return next()
      return {
        kind: 'deny',
        reason: 'todo 完成校验失败：' + fails.join('；') +
          '。请确认该任务真的完成、修正证据路径（相对会话目录）后重新提交 todo。',
      }
    } catch (e) {
      return next()
    }
  })
}
