# dsh-todo-guard ✅

[English](README.md) | [简体中文](README.zh-CN.md)

![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)

A **reliable todo panel** plugin for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`) web: the todo strip survives restarts (works around the official panel disappearing after a restart), and completion is verified against evidence paths.

*Unofficial project: independently developed and maintained by a community member, not an official DeepSeek product.*

## Screenshot

![dsh-todo-guard panel](assets/todo-panel.png)

## Requirements

- DSH web >= 0.1.0-rc.7 (run with `npx @deepseek-ai/dsh web`)
- **rc.6 users:** install the frozen `rc6-compat` tag instead: `dsh plugin add github:a903067276-rgb/dsh-todo-guard#rc6-compat` (no maintenance; upgrade to rc.7+ recommended)

## Features

- **Restart-proof panel** — replaces the official todo strip (`conversation.input.dock` cell, shadowed at `priority: -1`); after a dsh restart, reopening the session shows the todo list again
- **Completion verification (three states)** — when the agent marks a todo `completed`, evidence is checked automatically:
  - `（证据：路径）` and the path exists → ✅ green check (verified)
  - `（证据：路径）` but the path does not exist → 🚫 blocked, the agent gets a clear error and must fix it
  - no evidence marker → ⚠️ allowed, the item shows a yellow "unverified" badge (no false blocks on "did it but forgot to write evidence"; visible at a glance)

## Evidence syntax

Write `（证据：路径）` inside a todo item (multiple allowed). Relative paths resolve against the session working directory; absolute paths work as-is:

```
Fix the button（证据：lib/index.js）
Run tests（证据：test/run.log）（证据：docs/result.md）
```

## Install

```bash
dsh plugin --profile web add "github:a903067276-rgb/dsh-todo-guard#main"
# restart dsh web to activate
```

## How it works (why it survives restarts)

- **Data**: todos live in the session event stream (official `todo/write`, last-wins whole-list), persisted on disk — the official panel just fails to re-render them after a restart
- **Panel**: official `useProjection('todos')` projection + same-id slot shadowing (`priority: -1`, lowest renders) — official interfaces only
- **Verification**: official `tools/pre-execute` waterfall intercepts `todo_write` before it commits; failed evidence denies the write with a readable reason

## Notes

- Pure local logic: zero model calls, zero token cost
- Fake files are the verification boundary: an existing path does not prove the work was done, but the unverified badge keeps the loop honest
- Strict mode (block when evidence is missing) is planned for v2

## License

MIT
