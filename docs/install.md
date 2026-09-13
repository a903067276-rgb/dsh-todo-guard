# 安装指南（dsh-todo-guard）

> 2026-09-13 更新至 v2.1.0 现状（官方 todo 面板原样保留 + 复查区：断点续传 / 证据通道 / 折叠态一键确认）。

## 功能概览（装完即用）

- **官方面板原样**：不顶替官方 todo 组件与数据流；官方条目文字只写任务本身，插件不往里面塞任何东西
- **复查区**：官方面板下方外挂一块折叠面板，跨轮 / 断会话 / 重启 dsh 后仍显示最后有效列表（断点续传）
- **证据通道**：agent 用 `todo_evidence` 工具交证据 → 复查区标注 四态：已验证（绿）/ 证据异常（橙）/ 已交证据·文字凭据（灰）/ 未交证据（黄）；host 只 `stat` 路径存在性、不读内容
- **不阻塞**：没交证据/路径不存在照常勾选，只在工具结果里给 agent 一句文字提醒
- **一键确认**：折叠状态下 header 右侧就有「确认 N 项」按钮（不用展开列表）；全部完成且无待确认项自动收起
- **设置开关**：设置 → todo 严格模式（开 = 标注 + 确认；关 = 复查区纯列表，断点续传保留），运行时生效

## 安装（推荐：官方 bundle 一行安装）

```sh
dsh plugin --profile web add "github:a903067276-rgb/dsh-todo-guard#main"
```

装完**重启 `dsh web`**。更新时 `dsh plugin --profile web update dsh-todo-guard`，重启生效。

> **需要 pnpm**：`dsh plugin` 是 pnpm 转发器，PATH 里没有 pnpm 会直接失败。

## 安装（兜底：手动挂载，macOS 实测路径）

1. 把仓库放到本地，例如 `~/Documents/DSH/plugin-dev/dsh-todo-guard`。
2. 让 web profile 能按包名解析到它：

   ```bash
   ln -s ~/Documents/DSH/plugin-dev/dsh-todo-guard ~/.dsh/profiles/web/node_modules/dsh-todo-guard
   ```

3. 在 `~/.dsh/profiles/web/cordis.patch.yml` 加 entry（与 bundle 安装二选一，别双挂）：

   ```yaml
   - insert:
       - id: todo-guard
         name: 'dsh-todo-guard'
   ```

4. 重启 `dsh web`。

## 卸载

```sh
dsh plugin --profile web remove dsh-todo-guard
```

重启 `dsh web` 后官方面板恢复（复查区消失）。

## 常用设置

| 项 | 位置 | 说明 |
|---|---|---|
| 证据标注开关 | 设置 → todo 严格模式 | 开 = 四态标注 + 一键确认（默认）；关 = 复查区纯列表 |
| 证据怎么交 | agent 调 `todo_evidence` | `content` 照抄 todo 条目文字；`evidence` 交路径或文字凭据 |
| 官方 todo 条目 | agent 调 `todo_write` | 只写任务本身（别再写 `（证据：…）`，那会显示在官方面板上） |
