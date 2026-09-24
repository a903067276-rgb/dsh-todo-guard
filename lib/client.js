window.__ModuleLoader__.load({
  id: "dsh-todo-guard",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    let react = require("react");

    /**
     * dsh-todo-guard — Client 半（v2.1）
     *
     * 官方 TodoPanel 原样不动（本插件不顶替 conversation.input.dock 的 id:'todo'）。
     * 外挂「复查区」：注册 conversation.input.dock 独立 id 'todo-guard-review'
     * （order 10，排在官方 todo 面板下方 / queue 上方），列表走官方
     * useProjection('todo-guard/todos')——本插件 host 侧镜像投影（不清空），
     * 保证跨 turn / 断会话 / 恢复会话后仍带出列表（断点续传；官方组件缺席时兜底）。
     *
     * 交互（用户拍板）：
     * - 默认折叠；**确认按钮在折叠态也可见可点**（header 行右侧，不用展开列表）
     * - 证据不再来自 todo 条目文字（那样会污染官方面板：官方条目只有 content/status，
     *   写什么就显示什么）。证据由 agent 调 host 侧 todo_evidence 工具交到复查区，
     *   本组件只从 /api/dsh-todo-guard/review 取「条目 → 证据 + 路径存在性」结果：
     *   全存在"已验证"绿 / 有缺失"证据异常"橙 / 只有文字凭据"已交证据"灰 / 没交"未交证据"黄
     * - 一键确认：把当前标黄/标橙的完成项标记为已确认（localStorage 按 sessionId 持久，
     *   刷新不丢）；确认后若无剩余问题且全部完成 → 面板自动收起
     * - strictMode 关：复查区纯列表（无标注无确认，断点续传保留）
     * 样式全部 dsw token（禁硬编码色），视觉对齐官方 TodoPanel。
     */

    // ── 幂等样式注入（带 id，卸载残留可重复注入）──
    if (typeof document !== "undefined" && !document.getElementById("dsh-todo-guard-style")) {
      const tag = document.createElement("style");
      tag.id = "dsh-todo-guard-style";
      tag.textContent = [
        ".tg-root{box-sizing:border-box;width:calc(100% - var(--dsh-composer-side-clearance) - var(--dsh-composer-side-clearance) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset));max-width:calc(var(--dsh-composer-card-max-width) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset));border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-specific-tip);border-radius:12px;flex:none;margin:0 auto;overflow:hidden}",
        ".tg-headRow{align-items:center;gap:8px;padding:6px 12px;display:flex}",
        ".tg-header{text-align:left;cursor:pointer;background:0 0;border:none;min-width:0;align-items:center;gap:10px;flex:auto;padding:0;display:flex}",
        ".tg-title{color:var(--dsw-alias-label-primary);flex:none;font-size:13px;font-weight:500;line-height:24px}",
        ".tg-progress{min-width:0;color:var(--dsw-alias-label-tertiary);text-overflow:ellipsis;white-space:nowrap;flex:auto;font-size:13px;font-weight:400;line-height:20px;overflow:hidden}",
        ".tg-chevron{color:var(--dsw-alias-label-tertiary);flex:none;place-items:center;display:grid}",
        ".tg-confirmBtn{flex:none;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-specific-tip);color:var(--dsw-alias-label-primary);border-radius:8px;padding:3px 10px;font-size:12px;line-height:18px;cursor:pointer}",
        ".tg-confirmBtn:hover{border-color:var(--dsw-alias-label-dimmed)}",
        ".tg-list{flex-direction:column;gap:8px;max-height:180px;margin:0;padding:0 12px 6px;list-style:none;display:flex;overflow-y:auto}",
        ".tg-item{min-width:0;color:var(--dsw-alias-label-secondary);align-items:center;gap:10px;font-size:13px;line-height:20px;display:flex}",
        ".tg-glyph{flex:none;place-items:center;width:16px;height:16px;display:grid}",
        ".tg-glyphDone{color:var(--dsw-alias-state-success-primary)}",
        ".tg-glyphPending{color:var(--dsw-alias-label-caption)}",
        ".tg-glyphProgress{color:var(--dsw-alias-state-business-primary);animation:1s linear infinite tg-spin}",
        "@keyframes tg-spin{to{transform:rotate(360deg)}}",
        ".tg-content{text-overflow:ellipsis;white-space:nowrap;min-width:0;overflow:hidden}",
        ".tg-badge{flex:none;font-size:11px;line-height:16px;border-radius:8px;padding:0 6px}",
        ".tg-badgeWarn{color:var(--dsw-alias-state-warn-primary);background:var(--dsw-alias-state-warn-tertiary)}",
        ".tg-badgeOk{color:var(--dsw-alias-state-success-primary);background:var(--dsw-alias-state-success-tertiary)}",
        ".tg-badgeEr{color:var(--dsw-alias-state-warn-primary);background:var(--dsw-alias-state-warn-tertiary);font-weight:500}",
        ".tg-badgeMuted{color:var(--dsw-alias-label-tertiary);background:var(--dsw-alias-bg-base)}",
        ".tg-evidence{flex:none;max-width:220px;font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary);text-overflow:ellipsis;white-space:nowrap;overflow:hidden}",
        ".tg-evidence a{color:var(--dsw-alias-state-business-primary);text-decoration:none}",
      ].join("\n");
      (document.head || document.documentElement).appendChild(tag);
    }

    function DoneGlyph() {
      return react.createElement("svg", { width: 14, height: 14, viewBox: "0 0 14 14", fill: "none", "aria-hidden": "true" },
        react.createElement("circle", { cx: "7", cy: "7", r: "6.4", stroke: "currentColor", strokeWidth: "1.2" }),
        react.createElement("path", { d: "M10.9631 5.71411L7.70154 8.97571C7.48011 9.19714 7.27736 9.40099 7.09229 9.54993C6.89742 9.70669 6.66314 9.85279 6.3634 9.90027C6.2049 9.92534 6.04339 9.92534 5.88489 9.90027C5.58515 9.85279 5.35087 9.70669 5.15601 9.54993C4.97093 9.40099 4.76818 9.19714 4.54675 8.97571L3.03516 7.46411L3.96313 6.53613L5.47473 8.04773C5.7169 8.28989 5.86196 8.43389 5.97888 8.52795C6.08597 8.61409 6.10875 8.60701 6.08997 8.604C6.11259 8.60758 6.13571 8.60758 6.15833 8.604C6.13954 8.60701 6.16232 8.61409 6.26941 8.52795C6.38633 8.43389 6.53139 8.28989 6.77356 8.04773L10.0352 4.78613L10.9631 5.71411Z", fill: "currentColor" }));
    }

    function SpinnerGlyph() {
      const gid = react.useId();
      return react.createElement("svg", { width: 14, height: 14, viewBox: "0 0 14 14", fill: "none", "aria-hidden": "true" },
        react.createElement("defs", null, react.createElement("linearGradient", { id: gid, x1: "2.5", y1: "12", x2: "10.5", y2: "3.5", gradientUnits: "userSpaceOnUse" },
          react.createElement("stop", { stopColor: "currentColor" }),
          react.createElement("stop", { offset: "1", stopColor: "currentColor", stopOpacity: "0" }))),
        react.createElement("circle", { cx: "7", cy: "7", r: "6.4", stroke: "url(#" + gid + ")", strokeWidth: "1.2" }));
    }

    function PendingGlyph() {
      return react.createElement("svg", { width: 14, height: 14, viewBox: "0 0 14 14", fill: "none", "aria-hidden": "true" },
        react.createElement("circle", { cx: "7", cy: "7", r: "6.4", stroke: "currentColor", strokeWidth: "1.2", strokeDasharray: "2.4 2.4" }));
    }

    // ── 严格模式开关（设置卡片可切；关 = 复查区纯列表）──
    let strictMode = true;
    const CONFIG_EVENT = "dsh-todo-guard:config";
    async function refreshConfig() {
      try {
        const r = await fetch("/api/dsh-todo-guard/config");
        const d = await r.json();
        strictMode = d.strictMode !== false;
      } catch (e) { /* 保持默认 */ }
    }

    // 条目文字归一：必须与 host 侧 normContent 同一套规则（证据靠它关联条目）
    function normContent(s) {
      return String(s == null ? "" : s).replace(/\s+/g, " ").trim();
    }

    // ── 复查数据（host 聚合：证据 + 路径存在性 + 旧式内联标记兼容）──
    // 返回 { byExact, byNorm, json }；失败返回 null（保留上一次结果，不闪）
    async function fetchReview(sessionId) {
      const r = await fetch("/api/dsh-todo-guard/review?session=" + encodeURIComponent(sessionId));
      const d = await r.json();
      if (!d || !d.ok || !Array.isArray(d.entries)) return null;
      const byExact = {};
      const byNorm = {};
      for (const e of d.entries) {
        if (!e || typeof e.content !== "string") continue;
        const paths = Array.isArray(e.paths) ? e.paths : [];
        byExact[e.content] = paths;
        byNorm[normContent(e.content)] = paths;
      }
      return { byExact, byNorm, json: JSON.stringify(d.entries) };
    }

    // 已确认项（一键确认后不再提醒）：localStorage 按 sessionId 持久
    function loadConfirmed(sessionId) {
      try {
        const raw = localStorage.getItem("dsh-todo-guard:confirmed:" + sessionId);
        const arr = raw ? JSON.parse(raw) : [];
        return Array.isArray(arr) ? new Set(arr) : new Set();
      } catch (e) { return new Set(); }
    }
    function saveConfirmed(sessionId, set) {
      try { localStorage.setItem("dsh-todo-guard:confirmed:" + sessionId, JSON.stringify([...set])); } catch (e) { /* 隐私模式忽略 */ }
    }

    // 证据 → 该条目的判定（与 host 的 isPath/exists 口径一致）
    function verdictOf(paths) {
      if (!Array.isArray(paths) || paths.length === 0) return { kind: "none", paths: [] };
      const real = paths.filter((p) => p && p.isPath);
      const missing = real.filter((p) => p.exists !== true);
      if (missing.length > 0) return { kind: "bad", paths, missing };
      if (real.length === 0) return { kind: "text", paths };
      return { kind: "ok", paths };
    }

    function EvidenceBadge({ verdict }) {
      if (verdict.kind === "none") {
        return react.createElement("span", { className: "tg-badge tg-badgeWarn", title: "勾完成时没交证据：请让 agent 用 todo_evidence 交证据" }, "未交证据");
      }
      if (verdict.kind === "bad") {
        return react.createElement("span", { className: "tg-badge tg-badgeEr", title: "证据路径不存在：" + verdict.missing.map((p) => p.text).join("、") }, "证据异常");
      }
      if (verdict.kind === "text") {
        return react.createElement("span", { className: "tg-badge tg-badgeMuted", title: "证据是文字凭据（非路径），无法自动核验存在性" }, "已交证据");
      }
      return react.createElement("span", { className: "tg-badge tg-badgeOk", title: "证据路径均存在" }, "已验证");
    }

    function EvidenceText({ verdict }) {
      if (verdict.kind === "none") return null;
      const label = verdict.paths.map((p) => p.text).join("、");
      const single = verdict.paths.length === 1 ? verdict.paths[0] : null;
      const isUrl = single !== null && /^(https?|ftp):\/\/\S+$/i.test(single.text);
      const node = isUrl
        ? react.createElement("a", { href: single.text, target: "_blank", rel: "noreferrer" }, label)
        : label;
      return react.createElement("span", { className: "tg-evidence", title: label }, node);
    }

    function ReviewPanelView(props) {
      const todos = props.useProjection("todo-guard/todos") ?? [];
      const sessionId = typeof props.sessionId === "string" ? props.sessionId : "none";
      const [collapsed, setCollapsed] = react.useState(true); // 默认折叠（官方面板同款）
      const [confirmed, setConfirmed] = react.useState(() => loadConfirmed(sessionId));
      const [evidence, setEvidence] = react.useState({ byExact: {}, byNorm: {} });
      const [mode, setMode] = react.useState(strictMode);
      react.useEffect(() => {
        const onCfg = () => setMode(strictMode);
        window.addEventListener(CONFIG_EVENT, onCfg);
        refreshConfig().then(onCfg);
        return () => window.removeEventListener(CONFIG_EVENT, onCfg);
      }, []);
      // 复查数据拉取：列表变化立即拉一次，之后 4s 轮询（证据可能在最后一次 todo_write
      // 之后才交，靠轮询补上；只在面板挂载且严格模式开启时轮询）
      const todosKey = todos.map((t) => t.content + "\u0000" + t.status).join("|");
      react.useEffect(() => {
        if (!mode) return;
        let alive = true;
        let last = "";
        const load = async () => {
          const data = await fetchReview(sessionId);
          if (!alive || data === null) return;
          if (data.json === last) return; // 内容没变就不重渲染
          last = data.json;
          setEvidence({ byExact: data.byExact, byNorm: data.byNorm });
        };
        load();
        const timer = setInterval(load, 4000);
        return () => { alive = false; clearInterval(timer); };
      }, [sessionId, mode, todosKey]);

      if (!todos || todos.length === 0) return null;
      const total = todos.length;
      const done = todos.filter((t) => t.status === "completed").length;
      const incomplete = total - done;
      const verdictFor = (content) => verdictOf(evidence.byExact[content] || evidence.byNorm[normContent(content)]);
      // 问题项：完成且（没交证据 或 证据路径存在缺失）——已确认的不计
      let problemCount = 0;
      let problemItems = [];
      if (mode) {
        for (const t of todos) {
          if (t.status !== "completed") continue;
          if (confirmed.has(t.content)) continue;
          const kind = verdictFor(t.content).kind;
          if (kind === "none" || kind === "bad") {
            problemCount++;
            problemItems.push(t);
          }
        }
      }
      // 全部完成 + 无问题项 → 自动收起（无需人工确认）
      if (done === total && problemCount === 0) return null;

      const confirmAll = () => {
        const next = new Set(confirmed);
        for (const t of problemItems) next.add(t.content);
        setConfirmed(next);
        saveConfirmed(sessionId, next);
      };

      const visibleProblems = problemCount > 0
        ? react.createElement("span", { className: "tg-badge tg-badgeWarn", title: "有完成项没交证据或证据路径不存在" },
          "⚠ " + problemCount + " 项待确认")
        : null;

      return react.createElement("div", { className: "tg-root" },
        react.createElement("div", { className: "tg-headRow" },
          react.createElement("button", { type: "button", className: "tg-header", onClick: () => setCollapsed(!collapsed) },
            react.createElement("span", { className: "tg-title" }, "复查"),
            react.createElement("span", { className: "tg-progress" },
              incomplete > 0 ? (done + "/" + total + " 已完成") : "全部完成"),
            visibleProblems,
            react.createElement("span", { className: "tg-chevron", "aria-hidden": "true" }, collapsed ? "▸" : "▾")),
          // 快速确认：折叠态也可见可点（不展开列表就能确认）
          (mode && problemItems.length > 0
            ? react.createElement("button", {
                type: "button", className: "tg-confirmBtn",
                title: "把这 " + problemItems.length + " 项待确认的完成项标记为已确认（不展开列表也能点）",
                onClick: confirmAll,
              }, "确认 " + problemItems.length + " 项")
            : null)),
        // 列表（折叠时不渲染）
        (!collapsed && react.createElement("ul", { className: "tg-list" },
          todos.map((item) => {
            let glyph = null;
            if (item.status === "completed") {
              glyph = react.createElement("span", { className: "tg-glyph tg-glyphDone" }, react.createElement(DoneGlyph, null));
            } else if (item.status === "in_progress") {
              glyph = react.createElement("span", { className: "tg-glyph tg-glyphProgress" }, react.createElement(SpinnerGlyph, null));
            } else {
              glyph = react.createElement("span", { className: "tg-glyph tg-glyphPending" }, react.createElement(PendingGlyph, null));
            }
            let badge = null;
            let evidenceText = null;
            if (mode && item.status === "completed") {
              const verdict = verdictFor(item.content);
              evidenceText = react.createElement(EvidenceText, { verdict });
              badge = react.createElement(EvidenceBadge, { verdict });
            }
            return react.createElement("li", { className: "tg-item", key: item.content },
              glyph,
              react.createElement("span", { className: "tg-content" }, item.content),
              evidenceText,
              badge);
          }))));
    }

    // ── 官方设置卡片壳（2026-09-02，视觉对齐 dsh 0.1.2 host PluginCard；key 须与宿主命名空间一致）──
    const CARD_CSS = ".dsh-settings-card{list-style:none;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;transition:border-color .16s,background .16s}.dsh-settings-card:hover{border-color:var(--dsw-alias-label-dimmed)}.dsh-settings-open{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-label-dimmed)}.dsh-settings-head{appearance:none;width:100%;font:inherit;color:inherit;text-align:left;cursor:pointer;background:none;border:0;border-radius:12px;display:flex;align-items:center;gap:12px;padding:14px 16px}.dsh-settings-head:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}.dsh-settings-headtext{display:flex;flex-direction:column;flex:1;min-width:0;gap:4px}.dsh-settings-name{color:var(--dsw-alias-label-primary);font-size:15px;font-weight:600;line-height:1.4}.dsh-settings-desc{color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:1.5}.dsh-settings-chevron{color:var(--dsw-alias-label-tertiary);flex:none;transition:transform .16s}.dsh-settings-open .dsh-settings-chevron{transform:rotate(180deg)}.dsh-settings-body{border-top:1px solid var(--dsw-alias-border-l2);margin:0 16px;padding:10px 0 8px}.dsh-settings-body input,.dsh-settings-body textarea,.dsh-settings-body select{box-sizing:border-box;max-width:100%;min-width:0}";
    let cardCssInjected = false;
    function injectCardCss() {
      if (typeof document === "undefined" || cardCssInjected) return;
      cardCssInjected = true;
      if (document.getElementById("dsh-todoguard-settings-card-style") !== null) return;
      const tag = document.createElement("style");
      tag.id = "dsh-todoguard-settings-card-style";
      tag.textContent = CARD_CSS;
      document.head.appendChild(tag);
    }
    function SettingsCardShell(props) {
      const [open, setOpen] = react.useState(false);
      return react.createElement("li", { className: "dsh-settings-card" + (open ? " dsh-settings-open" : "") },
        react.createElement("button", {
          type: "button", className: "dsh-settings-head", "aria-expanded": open,
          onClick: () => setOpen(!open),
          "aria-label": (open ? "折叠" : "展开") + "：" + props.title,
        },
          react.createElement("span", { className: "dsh-settings-headtext" },
            react.createElement("span", { className: "dsh-settings-name" }, props.title),
            react.createElement("span", { className: "dsh-settings-desc" }, props.desc)
          ),
          react.createElement("svg", { className: "dsh-settings-chevron", width: "14", height: "14", viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round" },
            react.createElement("path", { d: "M4 6.5 8 10.5 12 6.5" })
          )
        ),
        open ? react.createElement("div", { className: "dsh-settings-body" }, props.children) : null
      );
    }

    // ── 设置卡片：严格模式开关 ──
    function SettingsCard(props) {
      const [enabled, setEnabled] = react.useState(strictMode);
      react.useEffect(() => {
        refreshConfig().then(() => setEnabled(strictMode));
      }, []);
      function toggle() {
        const next = !enabled;
        setEnabled(next);
        fetch("/api/dsh-todo-guard/config", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ strictMode: next }),
        })
          .then((r) => r.json())
          .then((d) => {
            if (d.ok) {
              strictMode = d.strictMode;
              window.dispatchEvent(new Event(CONFIG_EVENT));
            } else {
              setEnabled(!next);
            }
          })
          .catch(() => setEnabled(!next));
      }
      return react.createElement("div", { style: { display: "flex", flexDirection: "column", gap: "8px", padding: "8px 0" } },
        // 卡片壳内不重复标题
        props && props.inCard ? null : react.createElement("h3", { style: { margin: 0, fontSize: 14, fontWeight: 600, color: "var(--dsw-alias-label-primary)" } }, "todo 严格模式"),
        react.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10, fontSize: 13 } },
          react.createElement("label", { htmlFor: "tg-strict", style: { color: "var(--dsw-alias-label-primary)", flex: "auto", cursor: "pointer" } },
            "证据标注（不阻塞勾选；没交证据/证据异常需人工确认）"),
          react.createElement("input", {
            id: "tg-strict",
            type: "checkbox",
            checked: enabled,
            onChange: toggle,
            style: { width: 16, height: 16, accentColor: "var(--dsw-alias-state-business-primary)", cursor: "pointer" },
          }),
          react.createElement("span", { style: { color: "var(--dsw-alias-label-tertiary)", fontSize: 12, flex: "none" } },
            enabled ? "开" : "关"),
        )
      );
    }

    const inject = ["slots"];

    function apply(ctx) {
      const slots = ctx.get("slots");
      if (slots === undefined) return;
      injectCardCss();

      // 复查区：官方 todo 面板下方（order 10 < queue 的 20；官方 todo 为 order 0 原样保留）
      slots.inject("conversation.input.dock", () => slots.register(
        { name: "conversation.input.dock", id: "todo-guard-review", order: 10 },
        (props) => {
          const sid = typeof props.sessionId === "string" ? props.sessionId : "none";
          return react.createElement(ReviewPanelView, Object.assign({}, props, { key: sid }));
        },
      ));

      // 设置卡片：严格模式开关（侧边栏页 + 插件卡片，内容一致；双字段 key+id 兼容 rc.6/rc.7+）
      slots.inject("settings.section", () => slots.register(
        { name: "settings.section", id: "dsh-todo-guard-settings", order: 40, label: "todo 严格模式" },
        () => react.createElement(SettingsCard),
      ));
      slots.inject("settings.plugin.item", () => slots.register(
        { name: "settings.plugin.item", key: "todo-guard", id: "todo-guard" },
        () => react.createElement(SettingsCardShell, { title: "todo 严格模式", desc: "待办证据校验：没交证据/证据异常面板标注，不阻塞勾选" },
          react.createElement(SettingsCard, { inCard: true }))
      ));

      // ── 插件区（0.1.7 官方插件管理页）──
      // 已装成「包」的插件在插件区里是两级：包详情 → **组件行详情**；组件行的配置位是
      // keyed 槽 `plugins.row.config`，键 = `${包名}#${条目id}`（管理页内部 rowConfigKey 的拼法，
      // 见 dsh-client-ui-plugin-manager）。注：官方 ui-settings-* 注册的 `plugins.item` 是
      // 「内置条目」那一档的位，装成包的插件走 `plugins.row.config` 这条。
      // summary 视图渲染列表行的一行说明，page 视图渲染同一张设置卡。
      const itemViews = {
        summary: () => "待办证据校验：" + (strictMode ? "开" : "关") + " · 复查区跨轮保留",
        page: () => react.createElement(SettingsCardShell, {
          title: "todo 严格模式",
          desc: "待办证据校验：没交证据/证据异常面板标注，不阻塞勾选",
        }, react.createElement(SettingsCard, { inCard: true })),
      };
      const renderItem = (props) => itemViews[props && props.view === "summary" ? "summary" : "page"]();
      for (const key of ["dsh-todo-guard#todo-guard", "todo-guard#todo-guard"]) {
        slots.inject("plugins.row.config", () => slots.register(
          { name: "plugins.row.config", key, order: 30, label: "todo 严格模式" },
          renderItem,
        ));
      }

      console.log("[dsh-todo-guard] client loaded (v2.3)");
    }

    exports.inject = inject;
    exports.apply = apply;
    return module.exports;
  }
});
