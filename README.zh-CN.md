# dsh-todo-guard ✅

[English](README.md) | [简体中文](README.zh-CN.md)

![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`dsh`）web 的 **todo 复查插件**：官方 todo 面板原样保留，在其下方外加「复查区」——未完成任务跨轮/重启持续显示（断点续传），完成项自动核验证据（已验证 / 证据异常 / 未验证），缺证据时**不阻塞勾选**、只标注并留给你人工确认。

*非官方项目：社区成员独立开发维护，非 DeepSeek 官方产品。*

## 截图

![dsh-todo-guard 复查区](assets/todo-panel.png)

## 运行要求

- DSH web（≥ 0.1.1-rc.1，推荐跟随最新版）（`npx @deepseek-ai/dsh web` 启动）
- **版本兼容（尽力而为，不保证每个 DSH 版本）**：
  - DSH 0.1.1-rc.1 及以上（含 0.1.1-rc.2 / 0.1.2）：装 `main`（默认）。
  - **DSH 0.1.5-rc.1：加载实测通过**——镜像投影契约（`stateSchema`+`wire`）在 0.1.5 未变、`tools/post-execute` 钩子仍在；复查区 UI 未逐项肉眼复测。官方 `dsh-tool-todo` 至今没有证据/校验概念，本插件价值独立。契约点：镜像投影 `stateSchema+wire`（0.1.1-rc.1+）、复查区多 dock 共存（`conversation.input.dock` 多 id）、设置卡片双字段 `key`+`id`（rc.6/rc.7+ 通吃）、`tools/post-execute` 提示（不存在该钩子的旧版自动降级为仅面板标注）
  - DSH 0.1.0-rc.7 / rc.8：**投影契约不同（0.1.1-rc.1 前旧式），复查区数据不保证**；回退 `v0.1.6`（`dsh plugin add github:a903067276-rgb/dsh-todo-guard#v0.1.6`）
  - DSH 0.1.0-rc.6：冻结 `rc6-compat`（不再维护）
- **维护策略**：本插件将持续跟随 DSH 最新版本演进；对旧版 DSH 的兼容仅是尽力而为、不保证长期有效。

## 功能

- **断点续传**——官方 todo 面板在每轮对话开始（`turn/start`）被清空（官方设计），插件镜像投影 `todo-guard/todos` 不清空：未完成/已完成列表跨 turn、断会话、重启 dsh 后照常显示在复查区（官方组件缺席时兜底）
- **官方面板原样**——不顶替、不替换官方组件与官方数据流；复查区独立挂在官方面板下方（`conversation.input.dock` 追加项）
- **完成项证据三态**（strictMode，默认开）：
  - 有证据标记 `（证据：路径）` 且路径存在 → ✅ **已验证**（绿）+ 证据文本（URL 渲染为可点链接）
  - 有证据 / 路径锚点但路径不存在 → ⚠️ **证据异常**（橙，悬停列出缺失路径）
  - 无任何可核验痕迹 → 🟡 **未验证**（黄）
- **不阻塞**——假证据/无证据照常写入（无报错）；agent 只收到工具结果里的文字提醒（`⚠ N 项未贴证据 / N 处证据路径不存在 / 一次勾太多`）
- **渐进勾选提醒**——一次勾选 ≥2 项时提醒"做到哪步勾哪步"
- **一键收尾**——复查区默认折叠，折叠时 header 显示「⚠ N 项待确认」提醒、收尾按钮仍可见；全部完成且全部自动验证 → 自动收起；存在待确认项 → 由你点「确认收尾」收起（确认态按会话保存在浏览器，刷新不丢）

## 证据写法

todo 条目内容里写 `（证据：路径）`（支持多条）。相对路径按会话工作目录解析，绝对路径直接用，`~/` 亦可用：

```
改完按钮（证据：lib/index.js）
跑通测试（证据：test/run.log）（证据：docs/结果.md）
```

内容里写的文件路径锚点（绝对路径或含目录分隔符+扩展名）也算"有痕"，会一并核验存在性。

## 安装

```bash
dsh plugin --profile web add "github:a903067276-rgb/dsh-todo-guard#main"
# 重启 dsh web 生效
```

## 工作原理

- **数据**：镜像投影跟随官方 `todo/write` 事件（last-wins 全量），不被 `turn/start` 清空，随会话投影缓存持久化——恢复会话/重启后仍是"最后有效列表"
- **面板**：复查区注册 `conversation.input.dock` 独立 id（order 10，官方 todo 下方 / queue 上方），纯官方接口，零模型、零 token
- **核验**：面板对完成项证据路径调本插件 `/api/dsh-todo-guard/evidence`（host 只 stat 存在性，不读内容），相对路径按会话工作目录解析
- **提示**：官方 `tools/post-execute` 瀑布在写入成功后追加非阻塞文字提醒（不 Error）；旧版 DSH 无此钩子时自动降级为仅面板标注

## 说明

- 纯本地逻辑：零模型调用，零 token 成本
- "伪造文件"是标注边界：证据文件存在 ≠ 真做了；三态标注 + 人工确认兜底
- strictMode 可关（设置 → todo 严格模式）：关闭后复查区为纯列表（无标注无确认），断点续传保留

## License

MIT
