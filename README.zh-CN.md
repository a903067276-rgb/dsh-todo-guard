# dsh-todo-guard ✅

[English](README.md) | [简体中文](README.zh-CN.md)

![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`dsh`）web 的 **todo 复查插件**：官方 todo 面板原样保留（条目文字只写任务本身，插件的东西一概不塞进去），在其下方外加「复查区」——未完成任务跨轮/重启持续显示（断点续传），完成项的证据由 agent 用插件自己的 `todo_evidence` 工具交到复查区并自动核验（已验证 / 证据异常 / 已交证据 / 未交证据），没交证据**不阻塞勾选**、只标注并留给你**一键确认**（折叠着也能点）。

*非官方项目：社区成员独立开发维护，非 DeepSeek 官方产品。*

## 截图

![dsh-todo-guard 复查区](assets/todo-panel.png)

## 运行要求

- DSH web（≥ 0.1.1-rc.1，推荐跟随最新版）（`npx @deepseek-ai/dsh web` 启动）
- **版本兼容（尽力而为，不保证每个 DSH 版本）**：
  - DSH 0.1.1-rc.1 及以上（含 0.1.1-rc.2 / 0.1.2）：装 `main`（默认）。
  - **DSH 0.1.5-rc.2：v2.1 实测通过**——`tools.register` 工具注册、镜像投影契约（`stateSchema`+`wire`）、`tools/post-execute` 钩子、会话日志 `tool/call` 事件读取均正常。契约点：镜像投影 `stateSchema+wire`（0.1.1-rc.1+）、复查区多 dock 共存（`conversation.input.dock` 多 id）、设置卡片双字段 `key`+`id`（rc.6/rc.7+ 通吃）、工具注册走 `@deepseek-ai/dsh-tools` 的 `defineTool`（peer 依赖，由宿主提供）、`tools/post-execute` 提示（不存在该钩子的旧版自动降级为仅面板标注）
  - DSH 0.1.0-rc.7 / rc.8：**投影契约不同（0.1.1-rc.1 前旧式），复查区数据不保证**；回退 `v0.1.6`（`dsh plugin add github:a903067276-rgb/dsh-todo-guard#v0.1.6`）
  - DSH 0.1.0-rc.6：冻结 `rc6-compat`（不再维护）
  - ✅ **DSH 0.1.7 及以后——装本版（`v2.2.0`）**：它声明了 `peerDependencies: {"@deepseek-ai/dsh": ">=0.1.7-rc.1 <0.2.0"}`，宿主不匹配会明确拒绝加载并说明原因，不再静默出错。配置迁到 0.1.7 的插件 `Config`（`.volatile()` 字段可即时生效），改完不用重启。
  - ⚠️ **DSH 0.1.5 及更早——请装上一版 tag `v2.1.2`**：那条线保持原行为，不含任何 0.1.7 专用 API。
- **维护策略**：本插件将持续跟随 DSH 最新版本演进；对旧版 DSH 的兼容仅是尽力而为、不保证长期有效。

## 功能

- **断点续传**——官方 todo 面板在每轮对话开始（`turn/start`）被清空（官方设计），插件镜像投影 `todo-guard/todos` 不清空：未完成/已完成列表跨 turn、断会话、重启 dsh 后照常显示在复查区（官方组件缺席时兜底）
- **官方面板原样**——不顶替、不替换官方组件与官方数据流。官方 todo 条目只有 `content`/`status` 两个字段，**插件不往条目文字里塞任何东西**（v2.0 及更早把「（证据：…）」写进条目文字的写法已废弃——那会原样显示在官方面板上）；复查区独立挂在官方面板下方（`conversation.input.dock` 追加项）
- **证据走插件通道**（strictMode，默认开）——agent 用 `todo_evidence` 工具交证据；host 核验路径存在性（只 `stat`、不读内容，相对路径按会话工作目录解析）。四种标注：
  - 路径全部存在 → ✅ **已验证**（绿）+ 证据文本（URL 渲染为可点链接）
  - 有路径不存在 → ⚠️ **证据异常**（橙，悬停列出缺失路径）
  - 只交了文字凭据（如「pnpm test 全绿」）→ ⚪ **已交证据**（灰，无法自动核验存在性）
  - 勾完成时没交 → 🟡 **未交证据**（黄）
- **不阻塞**——假证据/没交证据照常写入（无报错）；agent 只收到工具结果里的文字提醒（`⚠ N 项没交证据（请调 todo_evidence）/ N 处证据路径不存在 / 一次勾太多`）
- **渐进勾选提醒**——一次勾选 ≥2 项时提醒"做到哪步勾哪步"
- **一键确认（折叠态也能点）**——复查区默认折叠；折叠时 header 行右侧直接显示「确认 N 项」按钮，**不用展开列表就能确认**；全部完成且无待确认项 → 自动收起（确认态按会话存在浏览器里，刷新不丢）
- **旧写法只读兼容**——升级前写在条目文字里的 `（证据：…）` 仍会在复查区正常显示与核验（历史会话不受影响），但不再推荐这么写

## 证据怎么交

agent 在官方 `todo_write` 里只写干净的任务名，完成后调 `todo_evidence` 交证据：

```
todo_write     { todos: [ { content: "改完按钮", status: "completed" }, … ] }
todo_evidence  { items: [ { content: "改完按钮", evidence: ["lib/index.js"] } ] }
```

- `content` 要照抄 `todo_write` 里的条目文字（对得上才挂得上；对不上工具会回报是哪条，让你重交）
- `evidence` 支持多条：文件 / 产物 / 日志路径，绝对路径与 `~/` 直接用；纯文字凭据（如「pnpm test 全绿」）也可以交，只是不自动核验存在性
- 同一条目重交 = 覆盖旧证据
- 证据落在会话日志的 `tool/call` 事件里：重启、断会话、恢复会话后复查区仍能显示

## 安装

```bash
dsh plugin --profile web add "github:a903067276-rgb/dsh-todo-guard#main"
# 重启 dsh web 生效
```

## 工作原理

- **数据**：镜像投影跟随官方 `todo/write` 事件（last-wins 全量），不被 `turn/start` 清空，随会话投影缓存持久化——恢复会话/重启后仍是"最后有效列表"
- **面板**：复查区注册 `conversation.input.dock` 独立 id（order 10，官方 todo 下方 / queue 上方），纯官方接口，零模型、零 token
- **工具**：`todo_evidence`（host 侧 `tools.register`）把证据写进会话日志，复查区按条目文字关联；host 侧不做额外落盘，重启后从日志重建
- **核验**：复查区调本插件 `/api/dsh-todo-guard/review`（host 聚合证据 + 只 `stat` 存在性，不读内容），相对路径按会话工作目录解析；列表变化立即刷新 + 4s 轮询补上"先勾选、后交证据"的时序
- **提示**：官方 `tools/post-execute` 瀑布在写入成功后追加非阻塞文字提醒（不 Error）；旧版 DSH 无此钩子时自动降级为仅面板标注

## 说明

- 纯本地逻辑：零模型调用，零 token 成本
- "伪造文件"是标注边界：证据文件存在 ≠ 真做了；四态标注 + 人工确认兜底
- strictMode 可关（设置 → todo 严格模式）：关闭后复查区为纯列表（无标注无确认），断点续传保留

## License

MIT
