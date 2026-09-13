# dsh-todo-guard ✅

[English](README.md) | [简体中文](README.zh-CN.md)

![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)

A **todo review plugin** for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`) web: the official todo panel stays untouched (item text carries nothing but the task itself), and a **review dock** hangs right below it — unfinished tasks persist across turns/restarts (checkpoint resume), completed items get evidence submitted through the plugin's own `todo_evidence` tool and verified automatically (verified / evidence-missing / text-only / unsubmitted), and missing evidence **never blocks the check**: it is only annotated and left for your **one-click confirm** (works while the dock is collapsed).

*Unofficial: a community project, not a DeepSeek product.*

## Screenshot

![dsh-todo-guard review dock](assets/todo-panel.png)

## Requirements

- DSH web (≥ 0.1.1-rc.1, latest recommended) (`npx @deepseek-ai/dsh web`)
- **Version compatibility (best-effort, not guaranteed for every DSH version)**:
  - DSH 0.1.1-rc.1+ (incl. 0.1.1-rc.2 / 0.1.2): install `main` (default).
  - **DSH 0.1.5-rc.2: v2.1 verified** — `tools.register`, the mirror-projection contract (`stateSchema`+`wire`), the `tools/post-execute` hook and reading `tool/call` events from the session log all work. Contract points: mirror projection `stateSchema+wire` (0.1.1-rc.1+), multi-id dock coexistence (`conversation.input.dock`), settings card dual field `key`+`id` (satisfies rc.6 & rc.7+), tool registration via `defineTool` from `@deepseek-ai/dsh-tools` (peer dependency, provided by the host), `tools/post-execute` nudges (degrade silently on hosts without this hook — panel annotation only)
  - DSH 0.1.0-rc.7 / rc.8: **old projection contract (pre-0.1.1-rc.1) — review dock data not guaranteed**; fallback `v0.1.6` (`dsh plugin add github:a903067276-rgb/dsh-todo-guard#v0.1.6`)
  - DSH 0.1.0-rc.6: frozen `rc6-compat` (no longer maintained)
- **Maintenance policy**: this plugin tracks the latest DSH; legacy compatibility is best-effort only.

## Features

- **Checkpoint resume** — the official todos projection is cleared at `turn/start` (by design); the plugin's mirror projection `todo-guard/todos` is not: the full list persists across turns, session switches and dsh restarts in the review dock (also the fallback when the official panel fails to render after a restart)
- **Official panel untouched** — no shadow/replacement of the official component or data flow. Official todo items only carry `content`/`status`, and the plugin **never stuffs anything into that text** (the pre-2.1 habit of writing `（证据：…）` inside an item is retired — it showed up verbatim in the official panel); the review dock is an additional `conversation.input.dock` entry right below it
- **Evidence through the plugin's own channel** (strictMode, on by default) — the agent submits evidence with the `todo_evidence` tool; the host verifies path existence (`stat` only, never reads content; relative paths resolve against the session cwd). Four annotations:
  - every path exists → ✅ **verified** (green) + evidence text (URLs rendered as links)
  - some path missing → ⚠️ **evidence missing** (orange; hover lists missing paths)
  - only text credentials submitted (e.g. "pnpm test all green") → ⚪ **evidence submitted** (grey; existence is not auto-checkable)
  - nothing submitted at completion → 🟡 **no evidence** (yellow)
- **Non-blocking** — fake/missing evidence is still written (no error); the agent only gets a text nudge in the tool result (`⚠ N items without evidence (call todo_evidence) / N evidence paths missing / too many checks at once`)
- **Incremental check nudge** — checking ≥2 items at once triggers a "do it step by step" hint
- **One-click confirm (clickable while collapsed)** — the dock is collapsed by default and the header row carries a `Confirm N` button, so you never have to expand the list to confirm; all checked + nothing pending → auto-hides (confirmation is persisted per session in the browser)
- **Legacy syntax, read-only** — `（证据：…）` written inside item text before the upgrade still displays and verifies in the review dock (old sessions keep working), but is no longer recommended

## Submitting evidence

The agent writes clean task names into the official `todo_write` and submits evidence afterwards with `todo_evidence`:

```
todo_write     { todos: [ { content: "Fix the button", status: "completed" }, … ] }
todo_evidence  { items: [ { content: "Fix the button", evidence: ["lib/index.js"] } ] }
```

- `content` must match the `todo_write` item text (that is how evidence is attached; a mismatch is reported back so it can be resubmitted)
- `evidence` accepts several entries: file / artifact / log paths, absolute paths and `~/` as-is; plain text credentials (e.g. "pnpm test all green") are accepted too, just not existence-checked
- Re-submitting the same item overwrites its previous evidence
- Evidence lands in the session log as a `tool/call` event — it survives restarts, session switches and session restore

## Install

```bash
dsh plugin --profile web add "github:a903067276-rgb/dsh-todo-guard#main"
# restart dsh web
```

## How it works

- **Data**: the mirror projection follows official `todo/write` events (last-wins whole list), is never cleared at `turn/start`, and persists with the session projection cache — recovery after restart yields the "last valid list"
- **Panel**: the review dock registers an independent `conversation.input.dock` id (order 10, below official todo / above queue) — pure official interfaces, zero model calls, zero tokens
- **Tool**: `todo_evidence` (host-side `tools.register`) writes evidence into the session log; the dock joins it by item text; nothing extra is persisted on disk — a restart rebuilds it from the log
- **Verification**: the dock calls the plugin's `/api/dsh-todo-guard/review` (host aggregates evidence + `stat` existence only, never reads content); relative paths resolve against the session cwd; the dock refreshes immediately on list changes and polls every 4s to cover a "check first, submit evidence after" ordering
- **Nudges**: official `tools/post-execute` waterfall appends a non-blocking text notice after a successful write (not an Error); on older hosts without the hook it degrades to panel annotation only

## Notes

- Pure local logic: zero model calls, zero token cost
- "Forged file" is the annotation boundary: existence ≠ actually done; four-state annotation + human confirm is the backstop
- strictMode can be disabled (Settings → todo strict mode): the dock becomes a plain list (no annotation, no confirm), resume still works

## License

MIT
