# dsh-todo-guard ✅

[English](README.md) | [简体中文](README.zh-CN.md)

![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`dsh`）web 的**可靠 todo 面板**插件：重启后照常显示（绕过官方面板重启后不显示的 bug），勾"完成"时自动校验证据。

*非官方项目：社区成员独立开发维护，非 DeepSeek 官方产品。*

## 截图

![dsh-todo-guard 任务面板](assets/todo-panel.png)

## 运行要求

- DSH web（仅 0.1.0-rc.6，冻结兼容分支，不再维护；请使用 ≥ 0.1.0-rc.7 的维护版本）

## 功能

- **重启不丢显示**——顶替官方 todo 面板（`conversation.input.dock` 格子，`priority: -1` shadow）；重启 dsh 后重新打开会话，todo 列表照常显示
- **完成校验三态**——agent 勾"完成"时自动检查证据：
  - `（证据：路径）` 且文件存在 → ✅ 绿勾（已验证）
  - `（证据：路径）` 但查无此物 → 🚫 拦截，agent 收到明确报错并需修正
  - 无证据标记 → ⚠️ 放行，面板黄标"未验证"（不误伤"做了但忘写证据"；未验证项肉眼可查）

## 证据写法

todo 条目内容里写 `（证据：路径）`（支持多条）。相对路径按会话工作目录解析，绝对路径直接用：

```
改完按钮（证据：lib/index.js）
跑通测试（证据：test/run.log）（证据：docs/结果.md）
```

## 安装

```bash
dsh plugin --profile web add "github:a903067276-rgb/dsh-todo-guard#main"
# 重启 dsh web 生效
```

## 工作原理（为什么重启后能显示）

- **数据**：todo 存于会话事件流（官方 `todo/write`，last-wins 全量），dsh 重启后仍在磁盘——官方面板只是重启后没重新渲染
- **面板**：官方 `useProjection('todos')` 投影 + 槽位同 id 顶替（`priority: -1`，最低者渲染）——纯官方接口
- **校验**：官方 `tools/pre-execute` 瀑布在写入前拦截 `todo_write`；证据不过则拒绝写入并给出可读原因

## 说明

- 纯本地逻辑：零模型调用，零 token 成本
- "伪造文件"是校验边界：证据文件存在 ≠ 真做了，但黄标体系让未验证项肉眼可查
- 严格模式（无证据也拦截）预留 v2

## License

MIT
