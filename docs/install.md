# 安装指南（dsh-todo-guard）

> 2026-08-19 更新至 0.1.0 现状（功能：重启后 todo 面板照常显示 + 完成证据校验）。

## 功能概览（装完即用）

- **可靠面板**：顶替官方 todo 面板，重启 dsh 后重新打开会话，todo 列表照常显示（官方 bug 修复）
- **完成校验三态**：勾"完成"时自动检查证据——有 `（证据：路径）` 且存在 → 绿勾；查无此物 → 拦截报错；无证据 → 放行 + 黄标"未验证"
- **证据写法**：`（证据：相对路径或绝对路径）`，相对路径按会话工作目录解析，支持多条
- **设置开关**：设置 → todo 校验（开 = 完整校验；关 = 官方逻辑只修显示），运行时生效
- **自动消失**：全部完成的 list 面板自动收起

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

重启 `dsh web` 后官方面板恢复。

## 常用设置

| 项 | 位置 | 说明 |
|---|---|---|
| 证据验证开关 | 设置 → todo 校验 | 开 = 完整校验（默认）；关 = 只修显示不拦截 |
| 证据写法 | 任务条目标记 | `（证据：路径）`，相对会话目录或绝对路径 |
