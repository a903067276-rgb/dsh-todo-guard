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
 */
export const name = 'dsh-todo-guard'
export const inject = ['sessionProjections']

export function apply(ctx) {
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

  ctx.on('session/created', (session) => {
    // 会话发布/恢复时预热 todos 投影：强制折叠（lazy fold 触发），
    // 让 client 打开/刷新恢复会话时初始快照就有 todo 值（否则要等
    // 下一次 todo 事件驱动才渲染面板——官方同源 bug）
    try {
      ctx.sessionProjections.snapshot(session)
    } catch (e) { /* 投影未就绪时忽略，事件驱动仍会兜底 */ }
  })

  ctx.on('tools/pre-execute', async (exec, next) => {
    try {
      if (exec.name !== 'todo_write') return next()
      const args = exec.arguments
      if (!args || !Array.isArray(args.todos)) return next()
      const agent = exec.agent
      if (!agent) return next()
      const fs = ctx.get('fs')
      if (!fs) return next()

      // 旧列表（官方投影，last-wins 全量）
      let oldList = []
      try {
        const snap = ctx.sessionProjections.snapshot(agent.session)
        if (snap && Array.isArray(snap.values.todos)) oldList = snap.values.todos
      } catch (e) { /* 投影未就绪时视作无旧列表 */ }

      const oldStatus = new Map(oldList.map((t) => [t.content, t.status]))
      const cwd = agent.session.cwd || ''
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
