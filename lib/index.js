/**
 * dsh-todo-guard — Host 半（v2.1）
 *
 * 定位：官方 todo 组件与官方数据流**原样不动**；插件的东西全部待在「复查区」里：
 * 1. 镜像投影 todo-guard/todos：官方 todos 单元在 turn/start 时清空为 null，
 *    本镜像不清空（last-wins 全量替换），作为复查区/断点续传数据源
 * 2. todo_evidence 工具（v2.1 新增）：agent 交证据的**唯一通道**——证据不再写进
 *    todo 条目文字。原因（v2.0 的历史残留）：官方 todo 条目只有 content/status
 *    两个字段（additionalProperties:false），写什么官方面板就显示什么；把
 *    「（证据：xxx）」写进条目文字 = 污染官方面板。证据改落在会话日志的
 *    tool/call 事件里（重启/断会话后仍能从日志重建），复查区按条目文字关联
 * 3. GET /api/dsh-todo-guard/review：复查区数据源——证据 + 路径存在性核验
 *    （host 只 stat 不读内容；相对路径按会话 header.cwd 解析）+ 旧式内联标记
 *    「（证据：xxx）」兼容读取（升级前的历史会话仍能正常显示）
 * 4. post-execute 提示：todo_write 成功后（非阻塞、非 Error），若本次新完成项
 *    没交证据/证据路径不存在/一次勾太多，在工具结果文本后追加 ⚠ 提示（agent 可见）
 * 5. strictMode 设置（默认开，旧 verifyEnabled 兼容迁移）：
 *    开 = 复查区标注（已验证/证据异常/未交证据）+ 一键确认；关 = 复查区纯列表
 * 不再拦截：假证据/无证据照常写入（v1 的 deny 退役，"防漏做"由标注 + 提示 + 人工确认承担）
 */

import z from '@deepseek-ai/schemastery'
import { z as zz } from 'zod'
import { homedir } from 'node:os'
import { defineTool } from '@deepseek-ai/dsh-tools'

const NS = 'todo-guard'

// 条目文字归一：证据靠它跟 todo 条目关联（host/client 必须同一套规则）。
// 来龙去脉：踩坑-证据解析正则不一致——两端各解析一套 = 标注错乱。
const normContent = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim()

// 证据串是"路径"还是"说明文字"：含空格 → 说明文字；否则像绝对路径/相对路径/带扩展名 → 路径。
// 只有路径才核验存在性（"pnpm test 全绿"这类凭据只标"已交证据"，不误判成证据异常）
function looksLikePath(v) {
  const t = String(v == null ? '' : v).trim()
  if (t === '' || t.length > 300) return false
  if (t.includes('://') || t.startsWith('www.')) return false
  if (/\s/.test(t)) return false
  if (/^(?:\/|~\/)/.test(t) || /^[A-Za-z]:[\\/]/.test(t)) return true
  if (t.includes('/') || t.includes('\\')) return true
  return /\.[A-Za-z0-9]{1,8}$/.test(t.replace(/[.。，,;；]+$/, ''))
}

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

// ── 配置（v2.2.0 起：随 profile 条目 id 走）──
// 0.1.7 起宿主移除了 settings 命名空间的老 API（register/get 全没了），配置改为
// 「插件导出 Config schema + profile patch 里按条目 id 存 config」。字段加
// .volatile() = 设置页改完即时生效、不重挂插件（宿主 schemastery 需 ≥3.18.3）。
// strictMode 默认开；verifyEnabled 是 v0.1.x 的旧字段（迁移源，优先级低于 strictMode）。
export const Config = z.object({
  strictMode: z.boolean().default(true).volatile(),
  verifyEnabled: z.boolean().volatile(),
})

export function apply(ctx, config) {
  const cfg = config ?? {}

  // 读 volatile 引用：新宿主给的是 { get() }，普通值/缺失时原样返回
  const refValue = (ref) => {
    try {
      if (ref !== null && typeof ref === 'object' && typeof ref.get === 'function') return ref.get()
      return ref
    } catch (e) {
      return undefined
    }
  }

  // strictMode 读取：优先新字段；旧 verifyEnabled 迁移（true→开，false→关）；默认开
  const strictMode = () => {
    const primary = refValue(cfg.strictMode)
    if (typeof primary === 'boolean') return primary
    const legacy = refValue(cfg.verifyEnabled)
    if (typeof legacy === 'boolean') return legacy
    return true
  }

  // 本插件在 profile 里的条目 id（设置写入按条目 id 定位；拿不到时回落 NS）
  const entryId = () => {
    try {
      const id = ctx.fiber && ctx.fiber.entry && ctx.fiber.entry.options ? ctx.fiber.entry.options.id : undefined
      return typeof id === 'string' && id !== '' ? id : NS
    } catch (e) {
      return NS
    }
  }

  // 写配置：0.1.7 的 settings.update(ns, patch)，ns = profile 条目 id
  const writeStrictMode = async (next) => {
    const settings = ctx.get('settings')
    if (!settings || typeof settings.update !== 'function') {
      throw new Error('settings 服务不可用（写配置需要 DSH ≥0.1.7）')
    }
    try {
      await settings.update(entryId(), { strictMode: next })
    } catch (error) {
      // 条目 id 与预期不符（用户自定义挂载）时回落默认 id 再试一次
      if (entryId() === NS) throw error
      await settings.update(NS, { strictMode: next })
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
    const base = {
      key: 'todo-guard/todos',
      init: () => null,
      apply: (state, event) => {
        if (event.type === 'todo/write') return event.data.todos
        return state // 不清空：turn/start 等事件保持最后有效列表
      },
      stateVersion: 1,
    }
    // 投影契约双语法：0.1.1-rc.1+ 用 stateSchema+wire；0.1.0-rc.8（旧线）用 schema+view
    // （0.1.0 线为旧契约，hud 同因投影失效；双分支只救"加载不崩"，数据不保证）
    try {
      projectionCtx.sessionProjections.register({
        ...base,
        stateSchema: todosProjectionSchema,
        wire: { viewSchema: todosProjectionSchema, view: (state) => state },
      })
    } catch (e) {
      try {
        projectionCtx.sessionProjections.register({
          ...base,
          schema: todosProjectionSchema,
          view: (state) => state,
        })
      } catch (e2) { /* 静默：投影不可用时复查区无数据（best-effort 声明范围） */ }
    }
  })

  // ── 证据表（插件通道）──────────────────────────────────────────────
  // 证据的权威来源 = 会话日志里的 tool/call 事件（name === 'todo_evidence'）：
  // 重启 / 断会话 / 换进程后仍能重建，不额外落盘。
  // liveEvidence 是本进程内的实时表：工具刚调用完即可见（也兜底 PTC 等
  // 日志形态差异的情况）；evidenceCache 按 session.seq 缓存重建结果。
  const liveEvidence = new Map() // sessionId → Map<normContent, { content, paths }>
  const evidenceCache = new Map() // sessionId → { seq, map }

  function ingestEvidence(map, args) {
    // 会话日志里的 tool/call 把 arguments 存成 **JSON 字符串**（appender 直接落模型给的
    // 原文），进程内也可能是对象——两种形态都要接。v2.1.2 修：只认对象会让"重启后从
    // 日志重建证据"静默失效（重启后面板一律变"未交证据"），而单元测试喂对象测不出来。
    let parsed = args
    if (typeof parsed === 'string') {
      try { parsed = JSON.parse(parsed) } catch (e) { return }
    }
    const items = parsed && Array.isArray(parsed.items) ? parsed.items : []
    for (const raw of items) {
      if (!raw || typeof raw !== 'object') continue
      const content = typeof raw.content === 'string' ? raw.content.trim() : ''
      const key = normContent(content)
      const paths = (Array.isArray(raw.evidence) ? raw.evidence : [])
        .map((p) => String(p == null ? '' : p).trim())
        .filter((p) => p.length > 0)
      if (key === '' || paths.length === 0) continue
      map.set(key, { content, paths }) // last-wins：同一条目重交 = 覆盖
    }
  }

  function evidenceOf(session) {
    let seq = -1
    try { seq = Number(session.seq) } catch (e) { /* 拿不到游标就不缓存 */ }
    const cached = evidenceCache.get(session.id)
    if (cached && cached.seq === seq && seq >= 0) return cached.map
    const map = new Map()
    try {
      for (const ev of session.ownEvents()) {
        if (!ev || ev.type !== 'tool/call') continue
        const data = ev.data || {}
        if (data.name !== 'todo_evidence') continue
        ingestEvidence(map, data.arguments)
      }
    } catch (e) { /* 日志不可读时退化为实时表 */ }
    const live = liveEvidence.get(session.id)
    if (live) for (const [k, v] of live) map.set(k, v)
    if (seq >= 0) evidenceCache.set(session.id, { seq, map })
    return map
  }

  // 当前复查列表（镜像投影）：证据按它的条目文字关联；投影没就绪时返回空数组
  function mirrorTodos(session) {
    try {
      const snap = ctx.sessionProjections.snapshot(session)
      const values = snap && snap.values ? snap.values : {}
      const list = values['todo-guard/todos'] || values.todos
      if (Array.isArray(list)) return list
    } catch (e) { /* 投影未就绪 */ }
    return []
  }

  // 旧式内联标记兼容：「（证据：xxx）」「(证据: xxx)」，支持多条。
  // v2.1 起 agent 不该再这么写（会污染官方面板），这里只保证升级前的历史会话
  // 在复查区仍有证据可看。
  function parseLegacyProofs(content) {
    const out = []
    const re = /[(（]\s*证据\s*[:：]\s*([^)）]+)[)）]/g
    let m
    while ((m = re.exec(String(content))) !== null) {
      const p = m[1].trim()
      if (p) out.push(p)
    }
    return out
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

  function sessionCwd(session) {
    try {
      if (session && session.header && typeof session.header.cwd === 'string') return session.header.cwd
    } catch (e) { /* 保持空 */ }
    return ''
  }

  // ── todo_evidence 工具：agent 交证据的唯一通道 ──────────────────────
  // 官方 todo 条目没有证据字段（写进 content 就会显示在官方面板上），
  // 所以证据走这个工具：落会话日志 → 复查区按条目文字关联 + 核验路径存在性。
  ctx.inject(['tools'], (toolsCtx) => {
    toolsCtx.effect(() => toolsCtx.tools.register(defineTool({
      name: 'todo_evidence',
      description: '把完成项的证据交到 dsh-todo-guard 的「复查区」（人工复核用）。证据只走这个通道，**不要写进 todo 条目文字**（官方 todo 面板会原样显示条目文字，写了就是污染面板）。做到哪步交哪步：content 照抄 todo_write 里的条目文字（须一致），evidence 给能证明这步真做完的凭据（改动的文件、产物、日志等路径，多条就给多个；纯文字说明也可以交）。host 会立刻核验路径是否存在并回报，复查区据此标注 已验证 / 证据异常 / 未交证据。同一条目重交 = 覆盖旧证据。',
      parameters: {
        items: {
          type: 'array',
          required: true,
          description: '本次要交证据的条目（可一次交多项）',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              content: { type: 'string', required: true, description: '该 todo 条目的文字，须与 todo_write 里的 content 完全一致' },
              evidence: { type: 'array', required: true, description: '证据：文件/产物/日志路径，或其他可核验的凭据（至少一条）', items: { type: 'string' } },
            },
          },
        },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            ok: { type: 'boolean', required: true },
            count: { type: 'integer', required: true },
            text: { type: 'string', required: true },
          },
        },
        render: (_args, value) => [{ type: 'text', text: (value && value.text) ? value.text : 'todo_evidence: 已记录' }],
      },
      execute: async (args, exec) => {
        const session = exec && exec.agent ? exec.agent.session : undefined
        if (!session) {
          return { ok: false, count: 0, text: 'todo_evidence: 没有归属会话，无法记录（本工具只在会话内由 agent 调用）' }
        }
        const items = args && Array.isArray(args.items) ? args.items : []
        const known = new Map() // normContent → 列表里的原始条目文字
        for (const t of mirrorTodos(session)) {
          if (t && typeof t.content === 'string') known.set(normContent(t.content), t.content)
        }
        const fs = ctx.get('fs')
        const cwd = sessionCwd(session)
        const accepted = []
        const unmatched = []
        for (const raw of items) {
          if (!raw || typeof raw !== 'object') continue
          const content = typeof raw.content === 'string' ? raw.content.trim() : ''
          const key = normContent(content)
          const paths = (Array.isArray(raw.evidence) ? raw.evidence : [])
            .map((p) => String(p == null ? '' : p).trim())
            .filter((p) => p.length > 0)
          if (key === '' || paths.length === 0) continue
          // 列表已知时校验条目对得上（防止证据挂空）；投影没就绪时不校验
          if (known.size > 0 && !known.has(key)) { unmatched.push(content); continue }
          accepted.push({ key, content: known.get(key) || content, paths })
        }
        if (accepted.length === 0) {
          const why = unmatched.length > 0
            ? 'content 与当前 todo 列表对不上：' + unmatched.slice(0, 3).map((s) => '「' + s + '」').join('、') + '——请照抄 todo_write 里的条目文字'
            : 'items 里每项都要有 content 和非空 evidence'
          return { ok: false, count: 0, text: 'todo_evidence: 没有记录任何证据（' + why + '）' }
        }
        let map = liveEvidence.get(session.id)
        if (!map) { map = new Map(); liveEvidence.set(session.id, map) }
        const lines = []
        const badPaths = []
        for (const it of accepted) {
          map.set(it.key, { content: it.content, paths: it.paths.slice() })
          const marks = []
          for (const p of it.paths) {
            if (!looksLikePath(p)) { marks.push('· ' + p); continue }
            const ok = fs ? await exists(fs, p, cwd) : false
            if (!ok) badPaths.push(p)
            marks.push((ok ? '✓ ' : '✗ ') + p)
          }
          lines.push('「' + it.content + '」' + marks.join('；'))
        }
        evidenceCache.delete(session.id) // 让复查区下一次拉取就能看到新证据
        let text = '复查区已记录 ' + accepted.length + ' 项证据：\n' + lines.join('\n')
        if (badPaths.length > 0) {
          text += '\n⚠ ' + badPaths.length + ' 处路径不存在：' + badPaths.slice(0, 3).join('、')
            + (badPaths.length > 3 ? '…' : '') + '（复查区已标"证据异常"，请核对路径或重交同一条目）'
        }
        if (unmatched.length > 0) {
          text += '\n⚠ ' + unmatched.length + ' 项 content 与 todo 列表对不上，未记录：' + unmatched.slice(0, 3).join('、')
        }
        return { ok: true, count: accepted.length, text }
      },
    })), 'dsh-todo-guard.todo_evidence')
  })

  // 配置与复查数据路由（client 复查区/设置卡片用）
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
              try {
                await writeStrictMode(next)
              } catch (error) {
                writeJson(500, { ok: false, error: error instanceof Error ? error.message : String(error) })
                return
              }
              writeJson(200, { ok: true, strictMode: strictMode() })
              return
            }
            writeJson(405, { ok: false, error: 'method not allowed' })
            return
          }
          if (pathname === '/api/dsh-todo-guard/review') {
            if (req.method !== 'GET' && req.method !== 'HEAD') {
              writeJson(405, { ok: false, error: 'method not allowed' })
              return
            }
            const sessionId = url.searchParams.get('session') ?? ''
            // 会话不存在/未加载（如已归档历史会话）→ 返回空证据，复查区退化为"未交证据"
            let session
            try { session = ctx.get('sessions')?.get(sessionId) } catch (e) { /* 会话服务不可用 */ }
            const fs = ctx.get('fs')
            const cwd = sessionCwd(session)
            const channel = session ? evidenceOf(session) : new Map()
            const entries = []
            const seen = new Set()
            const push = async (content, paths, source) => {
              const key = normContent(content)
              if (key === '' || seen.has(key)) return
              seen.add(key)
              const out = []
              for (const p of paths) {
                const isPath = looksLikePath(p)
                const existsFlag = isPath && fs ? await exists(fs, p, cwd) : false
                out.push({ text: p, isPath, exists: existsFlag })
              }
              entries.push({ content, source, paths: out })
            }
            const list = session ? mirrorTodos(session) : []
            if (list.length > 0) {
              // 以复查列表为准：每条挂上证据（通道优先，旧式内联标记兜底）
              for (const t of list) {
                if (!t || typeof t.content !== 'string') continue
                const hit = channel.get(normContent(t.content))
                if (hit && hit.paths.length > 0) {
                  await push(t.content, hit.paths, 'channel')
                  continue
                }
                const legacy = parseLegacyProofs(t.content)
                if (legacy.length > 0) await push(t.content, legacy, 'legacy')
              }
            } else {
              for (const [, item] of channel) await push(item.content, item.paths, 'channel')
            }
            writeJson(200, { ok: true, session: sessionId, cwd: cwd || null, entries })
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
    }), 'dsh-todo-guard: /api config+review route')
  }

  // 预热 todos 投影：新建会话（session/created）与恢复会话（agent/created，
  // 此时 in-memory log 已加载）都强制折叠，让 client 打开/重连/恢复会话时
  // 初始快照就有 todo 值——否则要等下一次 todo 事件驱动才渲染（官方同源 bug：
  // 面板挂载由写事件触发而非数据存在触发）。恢复旧会话时日志可能尚未加载完，
  // 首次 snapshot 会拿到空快照——延迟补两次（300ms / 1.5s）兜底覆盖日志加载窗口。
  // 事件改名（v2.2.0）：0.1.7 移除了 agent/session-start，同一时机改发
  // agent/created（payload 仍是 { agent, source, signal }，恢复/新建/清空/压缩都发）。
  // 注意它走 ctx.serial 且监听器抛错会让 agent 创建失败——warm/warmLater 内部已全 try/catch。
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
  ctx.on('agent/created', (payload) => {
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
        // 旧列表以**镜像投影**为准：官方 todos 每轮 turn/start 被清成 null，
        // 拿官方的会把"上一轮已完成"全当成"本轮新完成"→ 每轮误报
        //「本次一次勾选 N 项」。镜像恰恰不清空，才是跨轮正确基线
        // （v2.1.1 修；官方投影仅在镜像尚未有值时兜底）。
        const snap = ctx.sessionProjections.snapshot(agent.session)
        const values = snap && snap.values ? snap.values : {}
        const list = values['todo-guard/todos'] || values.todos
        if (Array.isArray(list)) oldList.push(...list)
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
  // 提示项：① 新完成项没交证据 ② 证据路径不存在 ③ 一次勾 ≥2 项（渐进勾选）
  ctx.on('tools/post-execute', async (exec, result, next) => {
    try {
      const args = exec.arguments
      if (exec.name !== 'todo_write' || !args || !Array.isArray(args.todos)) return next()
      if (!result || result.isError) return next()
      if (!strictMode()) return next()
      const oldStatus = exec.__tgOldStatus instanceof Map ? exec.__tgOldStatus : new Map()
      const fs = ctx.get('fs')
      const agent = exec.agent
      const cwd = agent ? sessionCwd(agent.session) : ''

      const newly = args.todos.filter((t) => t.status === 'completed' && oldStatus.get(t.content) !== 'completed')
      const msgs = []
      if (newly.length > 0 && agent && agent.session) {
        let map = new Map()
        try { map = evidenceOf(agent.session) } catch (e) { /* 退化：按未交证据提示 */ }
        let noEvidence = 0
        const badPaths = []
        for (const t of newly) {
          const hit = map.get(normContent(t.content))
          const paths = hit && hit.paths.length > 0 ? hit.paths : parseLegacyProofs(t.content)
          if (paths.length === 0) {
            noEvidence++
            continue
          }
          if (fs) {
            for (const p of paths) {
              if (looksLikePath(p) && !(await exists(fs, p, cwd))) badPaths.push(p)
            }
          }
        }
        if (noEvidence > 0) {
          msgs.push(`${noEvidence} 项没交证据：请调用 todo_evidence 交证据（证据不要写进 todo 条目文字，官方面板会原样显示）`)
        }
        if (badPaths.length > 0) {
          msgs.push(`${badPaths.length} 处证据路径不存在（复查区已标"证据异常"）：${badPaths.slice(0, 3).join('、')}${badPaths.length > 3 ? '…' : ''}`)
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
