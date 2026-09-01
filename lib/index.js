/**
 * dsh-todo-guard — Host 半（v2）
 *
 * 定位：官方 todo 组件原样不动，插件在官方数据流外加"复查区 + 非阻塞提示"：
 * 1. 镜像投影 todo-guard/todos：官方 todos 单元在 turn/start 时清空为 null，
 *    本镜像不清空（last-wins 全量替换），作为复查区/断点续传数据源
 * 2. post-execute 提示：todo_write 成功写入后（非阻塞、非 Error），若本次新完成项
 *    缺证据/证据路径不存在/一次勾太多，在工具结果文本后追加 ⚠ 提示（agent 可见）
 * 3. evidence API：GET /api/dsh-todo-guard/evidence —— client 面板核验证据路径
 *    存在性（只 stat，不读内容），相对路径按会话 header.cwd 解析
 * 4. strictMode 设置（默认开，旧 verifyEnabled 兼容迁移）：
 *    开 = 复查区标注（已验证/未验证/证据异常）+ 收尾确认；关 = 复查区纯列表（断点续传保留）
 * 不再拦截：假证据/无证据照常写入（v1 的 deny 退役，"防漏做"由黄标 + 提示 + 人工确认承担）
 */

import z from '@deepseek-ai/schemastery'
import { z as zz } from 'zod'
import { homedir } from 'node:os'

const NS = 'todo-guard'

// 官方 todo 投影同构 schema（zod：投影引擎要求 stateSchema/viewSchema 带
// .parse；schemastery 的 z 没有 parse，不可用于投影注册）
const todosProjectionSchema = zz.union([
  zz.array(zz.object({
    content: zz.string(),
    status: zz.union([
      zz.literal('pending'),
      zz.literal('in_progress'),
      zz.literal('completed'),
    ]),
  })),
  zz.null(),
])

export const name = 'dsh-todo-guard'
export const inject = ['sessionProjections', 'webServer', 'sessions']

export function apply(ctx) {
  // 注册持久化设置（settings 可用时；不可用时默认开）
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.register(
      NS,
      z.object({
        strictMode: z.boolean().required(false),
        // 兼容旧字段（v0.1.x verifyEnabled 迁移源，读时优先 strictMode）
        verifyEnabled: z.boolean().required(false),
      }),
    )
  })

  // strictMode 读取：优先新字段；旧 verifyEnabled 迁移（true→开，false→关）；默认开
  const strictMode = () => {
    const settings = ctx.get('settings')
    if (!settings) return true
    try {
      const v = settings.get(NS)
      if (!v) return true
      if (typeof v.strictMode === 'boolean') return v.strictMode
      if (typeof v.verifyEnabled === 'boolean') return v.verifyEnabled
      return true
    } catch (e) {
      return true
    }
  }

  // 镜像投影：「最后有效 todo」保留单元（v2 为复查区数据源）。
  // 官方 todos 单元在 turn/start 时把状态清成 null（每轮开始要求 agent 重写；
  // 面板与恢复会话在 null 时整块不渲染——官方设计语义）。本单元镜像官方
  // todo/write 的 last-wins 全量替换，但不清空：复查区跨 turn 延续显示，
  // 断会话/恢复会话后仍带出上次的 todo 列表。投影缓存（session_projcache
  // domain）持久化所有注册单元，恢复会话时随历史页 projections 块一并给到
  // client（coldSnapshot/restore 遍历注册表，无需额外改动）。
  ctx.inject(['sessionProjections'], (projectionCtx) => {
    projectionCtx.sessionProjections.register({
      key: 'todo-guard/todos',
      stateSchema: todosProjectionSchema,
      init: () => null,
      apply: (state, event) => {
        if (event.type === 'todo/write') return event.data.todos
        return state // 不清空：turn/start 等事件保持最后有效列表
      },
      wire: {
        viewSchema: todosProjectionSchema,
        view: (state) => state,
      },
      stateVersion: 1,
    })
  })

  // 配置与证据核验路由（client 复查区/设置卡片用）
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
          if (pathname === '/api/dsh-todo-guard/config') {
            if (req.method === 'GET' || req.method === 'HEAD') {
              writeJson(200, { ok: true, strictMode: strictMode() })
              return
            }
            if (req.method === 'POST' || req.method === 'PUT') {
              let bodyText = ''
              for await (const chunk of req) bodyText += chunk
              let next
              try {
                next = JSON.parse(bodyText || '{}').strictMode
              } catch (e) { /* 走下方校验 */ }
              if (typeof next !== 'boolean') {
                writeJson(400, { ok: false, error: 'strictMode 必须是布尔值' })
                return
              }
              const settings = ctx.get('settings')
              if (!settings) {
                writeJson(500, { ok: false, error: 'settings 服务不可用' })
                return
              }
              await settings.update(NS, { strictMode: next })
              writeJson(200, { ok: true, strictMode: next })
              return
            }
            writeJson(405, { ok: false, error: 'method not allowed' })
            return
          }
          if (pathname === '/api/dsh-todo-guard/evidence') {
            if (req.method !== 'GET' && req.method !== 'HEAD') {
              writeJson(405, { ok: false, error: 'method not allowed' })
              return
            }
            const sessionId = url.searchParams.get('session') ?? ''
            const raw = url.searchParams.get('paths') ?? ''
            const paths = raw.split(',').map((p) => p.trim()).filter((p) => p.length > 0)
            if (paths.length === 0 || paths.length > 50) {
              writeJson(400, { ok: false, error: 'paths 参数缺失或过多（1-50 条）' })
              return
            }
            // 会话工作目录：Session 对象 head 的 header.cwd（绝对路径）；
            // 会话不存在/无 header 时相对路径按解析失败处理
            let cwd = ''
            try {
              const session = ctx.get('sessions')?.get(sessionId)
              if (session && session.header && typeof session.header.cwd === 'string') {
                cwd = session.header.cwd
              }
            } catch (e) { /* 会话服务不可用时保持空 */ }
            const fs = ctx.get('fs')
            if (!fs) {
              writeJson(503, { ok: false, error: 'fs 服务不可用' })
              return
            }
            const results = []
            for (const p of paths) {
              results.push({ path: p, exists: await exists(fs, p, cwd) })
            }
            writeJson(200, { ok: true, cwd: cwd || null, results })
            return
          }
          writeJson(404, { ok: false, error: 'not found' })
        } catch (e) {
          try {
            res.writeHead(500, { 'content-type': 'application/json' })
            res.end(JSON.stringify({ ok: false, error: String(e) }))
          } catch (e2) { /* 响应已关闭 */ }
        }
      },
    }), 'dsh-todo-guard: /api config+evidence route')
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

  // v2 证据分级（沿用）：从完成项内容里提取高置信文件路径锚点（保守规则，
  // 宁可不提（黄标）也不错判）。形态：绝对路径（/、~/、C:\）或
  // 含目录分隔符且有扩展名；排除 URL、纯域名 token 与超长 token。
  function extractAnchors(content) {
    const out = []
    const stripped = content
      .replace(/\w+:\/\/\S+/g, ' ')
      .replace(/[(（]\s*证据\s*[:：][^)）]*[)）]/g, ' ')
    for (const t of stripped.split(/[\s,，;；："'`<>（）()\[\]【】]+/)) {
      if (!t || t.length > 300) continue
      if (t.includes('://') || t.startsWith('www.')) continue
      if (!t.includes('/') && !t.includes('\\')) continue
      const isAbs = /^(?:\/|~\/)/.test(t) || /^[A-Za-z]:[\\/]/.test(t)
      const hasExt = /\.[A-Za-z0-9]{1,8}$/.test(t.replace(/[.。，,;；]+$/, ''))
      if (!isAbs && !hasExt) continue
      out.push(t)
    }
    return out
  }

  // 有痕判断（文本级，无 fs）：格式证据或路径锚点任一即"有痕"
  function hasTrace(content) {
    if (parseProofs(content).length > 0) return true
    return extractAnchors(content).length > 0
  }

  // 证据存在性检查：相对会话 cwd 解析（绝对路径直接用，~/ 展开），
  // 查无此物或解析失败返回 false
  async function exists(fs, path, cwd) {
    try {
      const expanded = path.startsWith('~/') ? homedir() + path.slice(1) : path
      const target = await fs.resolve(expanded, { cwd: cwd || undefined })
      const info = await fs.stat(target)
      return info !== undefined
    } catch (e) {
      return false
    }
  }

  // 预热 todos 投影：新建会话（session/created）与恢复会话（agent/session-start，
  // 此时 in-memory log 已加载）都强制折叠，让 client 打开/重连/恢复会话时
  // 初始快照就有 todo 值——否则要等下一次 todo 事件驱动才渲染（官方同源 bug：
  // 面板挂载由写事件触发而非数据存在触发）。恢复旧会话时日志可能尚未加载完，
  // 首次 snapshot 会拿到空快照——延迟补两次（300ms / 1.5s）兜底覆盖日志加载窗口。
  const warm = (session) => {
    try {
      ctx.sessionProjections.snapshot(session)
    } catch (e) { /* 投影未就绪时忽略，事件驱动仍会兜底 */ }
  }
  const warmLater = (session, ms) => {
    try {
      ctx.setTimeout(() => warm(session), ms)
    } catch (e) { /* ctx 已销毁则放弃 */ }
  }
  ctx.on('session/created', (session) => {
    warm(session)
    warmLater(session, 300)
    warmLater(session, 1500)
  })
  ctx.on('agent/session-start', (payload) => {
    if (payload && payload.agent) {
      warm(payload.agent.session)
      warmLater(payload.agent.session, 300)
      warmLater(payload.agent.session, 1500)
    }
  })

  // pre-execute：v2 只做旧列表快照（供 post-execute 计算"本次新完成项"），
  // 不再拦截（deny 退役）。快照挂在 exec 上（post-execute 时 exec 未冻结）。
  ctx.on('tools/pre-execute', async (exec, next) => {
    try {
      if (exec.name !== 'todo_write') return next()
      const args = exec.arguments
      if (!args || !Array.isArray(args.todos)) return next()
      const agent = exec.agent
      if (!agent) return next()
      const oldList = []
      try {
        const snap = ctx.sessionProjections.snapshot(agent.session)
        if (snap && Array.isArray(snap.values.todos)) oldList.push(...snap.values.todos)
      } catch (e) { /* 投影未就绪时视作无旧列表 */ }
      try {
        exec.__tgOldStatus = new Map(oldList.map((t) => [t.content, t.status]))
      } catch (e) { /* exec 只读时忽略（post-execute 走空快照） */ }
      return next()
    } catch (e) {
      return next()
    }
  })

  // post-execute：非阻塞提示——成功写入后追加 ⚠ 文本（不 Error）。
  // 提示项：① 新完成项缺证据 ② 新完成项证据路径不存在 ③ 一次勾 ≥2 项（渐进勾选）
  ctx.on('tools/post-execute', async (exec, result, next) => {
    try {
      const args = exec.arguments
      if (exec.name !== 'todo_write' || !args || !Array.isArray(args.todos)) return next()
      if (!result || result.isError) return next()
      if (!strictMode()) return next()
      const oldStatus = exec.__tgOldStatus instanceof Map ? exec.__tgOldStatus : new Map()
      const fs = ctx.get('fs')
      let cwd = ''
      try {
        if (exec.agent && exec.agent.session && exec.agent.session.header && typeof exec.agent.session.header.cwd === 'string') {
          cwd = exec.agent.session.header.cwd
        }
      } catch (e) { /* 保持空 */ }

      const newly = args.todos.filter((t) => t.status === 'completed' && oldStatus.get(t.content) !== 'completed')
      const msgs = []
      if (newly.length > 0) {
        let noTrace = 0
        const badPaths = []
        for (const t of newly) {
          const proofs = parseProofs(t.content)
          if (proofs.length === 0 && extractAnchors(t.content).length === 0) {
            noTrace++
            continue
          }
          // 有痕但存在性存疑：格式证据与路径锚点都核验（fs 可用时；不可用不判异常）
          if (fs) {
            const suspects = proofs.length > 0 ? proofs : extractAnchors(t.content)
            for (const p of suspects) {
              if (!(await exists(fs, p, cwd))) badPaths.push(p)
            }
          }
        }
        if (noTrace > 0) {
          msgs.push(`${noTrace} 项未贴证据（面板已标"未验证"）`)
        }
        if (badPaths.length > 0) {
          msgs.push(`${badPaths.length} 处证据路径不存在（面板已标"证据异常"）：${badPaths.slice(0, 3).join('、')}${badPaths.length > 3 ? '…' : ''}`)
        }
      }
      if (newly.length >= 2) {
        msgs.push(`本次一次勾选 ${newly.length} 项，建议做到哪步勾哪步，方便人工核对`)
      }
      if (msgs.length === 0) return next()
      const content = Array.isArray(result.content) ? result.content : []
      return {
        kind: 'accept',
        content: [...content, { type: 'text', text: '⚠ ' + msgs.join('；') }],
      }
    } catch (e) {
      return next()
    }
  })
}
