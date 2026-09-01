# dsh-todo-guard ✅

[English](README.md) | [简体中文](README.zh-CN.md)

![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)

A **todo review plugin** for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`) web: the official todo panel stays untouched, and a **review dock** hangs right below it — unfinished tasks persist across turns/restarts (checkpoint resume), completed items get evidence verification (verified / evidence-missing / unverified), and missing evidence **never blocks the check**: it is only annotated and left for you to confirm.

*Unofficial: a community project, not a DeepSeek product.*

## Screenshot

![dsh-todo-guard review dock](assets/todo-panel.png)

## Requirements

- DSH web (≥ 0.1.1-rc.1, latest recommended) (`npx @deepseek-ai/dsh web`)
- **Version compatibility (best-effort, not guaranteed for every DSH version)**:
  - DSH 0.1.1-rc.1+ (incl. 0.1.1-rc.2 / 0.1.2): install `main` (default). Contract points: mirror projection `stateSchema+wire` (0.1.1-rc.1+), multi-id dock coexistence (`conversation.input.dock`), settings card dual field `key`+`id` (satisfies rc.6 & rc.7+), `tools/post-execute` nudges (degrade silently on hosts without this hook — panel annotation only)
  - DSH 0.1.0-rc.7 / rc.8: **old projection contract (pre-0.1.1-rc.1) — review dock data not guaranteed**; fallback `v0.1.6` (`dsh plugin add github:a903067276-rgb/dsh-todo-guard#v0.1.6`)
  - DSH 0.1.0-rc.6: frozen `rc6-compat` (no longer maintained)
- **Maintenance policy**: this plugin tracks the latest DSH; legacy compatibility is best-effort only.

## Features

- **Checkpoint resume** — the official todos projection is cleared at `turn/start` (by design); the plugin's mirror projection `todo-guard/todos` is not: the full list persists across turns, session switches and dsh restarts in the review dock (also the fallback when the official panel fails to render after a restart)
- **Official panel untouched** — no shadow/replacement of the official component or data flow; the review dock is an additional `conversation.input.dock` entry (right below the official todo panel)
- **Three-state evidence annotation** (strictMode, on by default):
  - evidence `（证据：path）` exists → ✅ **verified** (green) + evidence text (URLs rendered as links)
  - evidence/path anchor present but missing → ⚠️ **evidence missing** (orange; hover lists missing paths)
  - no verifiable trace → 🟡 **unverified** (yellow)
- **Non-blocking** — fake/missing evidence is still written (no error); the agent only gets a text nudge in the tool result (`⚠ N items without evidence / N evidence paths missing / too many checks at once`)
- **Incremental check nudge** — checking ≥2 items at once triggers a "do it step by step" hint
- **One-click finalize** — the dock is collapsed by default; when collapsed the header shows `⚠ N pending` and the finalize button stays visible; all checked + all auto-verified → auto-hides; pending items → you click **Confirm finalize** (confirmation is persisted per session in the browser)

## Evidence syntax

Put `（证据：path）` inside a todo item (multiple allowed). Relative paths resolve against the session working directory; absolute paths and `~/` work as-is:

```
Fix the button（证据：lib/index.js）
Run tests（证据：test/run.log）（证据：docs/result.md）
```

Path anchors mentioned in the content (absolute path or with a directory separator + extension) also count as "traced" and are existence-checked.

## Install

```bash
dsh plugin --profile web add "github:a903067276-rgb/dsh-todo-guard#main"
# restart dsh web
```

## How it works

- **Data**: the mirror projection follows official `todo/write` events (last-wins whole list), is never cleared at `turn/start`, and persists with the session projection cache — recovery after restart yields the "last valid list"
- **Panel**: the review dock registers an independent `conversation.input.dock` id (order 10, below official todo / above queue) — pure official interfaces, zero model calls, zero tokens
- **Verification**: the panel calls the plugin's `/api/dsh-todo-guard/evidence` for completed items' evidence paths (host does `stat` existence only, never reads content); relative paths resolve against the session cwd
- **Nudges**: official `tools/post-execute` waterfall appends a non-blocking text notice after a successful write (not an Error); on older hosts without the hook it degrades to panel annotation only

## Notes

- Pure local logic: zero model calls, zero token cost
- "Forged file" is the annotation boundary: existence ≠ actually done; three-state annotation + human confirm is the backstop
- strictMode can be disabled (Settings → todo strict mode): the dock becomes a plain list (no annotation, no confirm), resume still works

## License

MIT
