window.__ModuleLoader__.load({
  id: "dsh-todo-guard",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    let react = require("react");

    /**
     * dsh-todo-guard — Client 半（v2）
     *
     * 官方 TodoPanel 原样不动（本插件不再顶替 conversation.input.dock 的 id:'todo'）。
     * 外挂「复查区」：注册 conversation.input.dock 独立 id 'todo-guard-review'
     * （order 10，排在官方 todo 面板下方 / queue 上方），数据走官方
     * useProjection('todo-guard/todos')——本插件 host 侧镜像投影（不清空），
     * 保证跨 turn / 断会话 / 恢复会话后仍带出列表（断点续传；官方组件缺席时兜底）。
     *
     * 交互（用户拍板）：
     * - 默认折叠；折叠时 header 显示「⚠ N 项未验证」提醒；确认按钮不在折叠区内
     * - 证据标注（strictMode 开）：完成项有痕 → 调 host evidence API 核验存在性 →
     *   全存在"已验证"绿标 / 有缺失"证据异常"橙标 / 核验中灰标；无痕 → "未验证"黄标
     * - 一键收尾：全部完成且无未验证/异常 → 自动收起；有 → 收尾条（始终可见）
     *   + [确认收尾] → 收起（确认态 localStorage 按 sessionId 持久，刷新不丢）
     * - strictMode 关：复查区纯列表（无标注无确认，断点续传保留）
     * 样式全部 dsw token（禁硬编码色），视觉对齐官方 TodoPanel。
     */

    // ── 幂等样式注入（带 id，卸载残留可重复注入）──
    if (typeof document !== "undefined" && !document.getElementById("dsh-todo-guard-style")) {
      const tag = document.createElement("style");
      tag.id = "dsh-todo-guard-style";
      tag.textContent = [
        ".tg-root{box-sizing:border-box;width:calc(100% - var(--dsh-composer-side-clearance) - var(--dsh-composer-side-clearance) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset));max-width:calc(var(--dsh-composer-card-max-width) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset));border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-specific-tip);border-radius:12px;flex:none;margin:0 auto;overflow:hidden}",
        ".tg-body{flex-direction:column;gap:8px;padding:6px 12px;display:flex}",
        ".tg-header{text-align:left;cursor:pointer;background:0 0;border:none;align-items:center;gap:10px;width:100%;padding:0;display:flex}",
        ".tg-title{color:var(--dsw-alias-label-primary);flex:none;font-size:13px;font-weight:500;line-height:24px}",
        ".tg-progress{min-width:0;color:var(--dsw-alias-label-tertiary);text-overflow:ellipsis;white-space:nowrap;flex:auto;font-size:13px;font-weight:400;line-height:20px;overflow:hidden}",
        ".tg-chevron{color:var(--dsw-alias-label-tertiary);flex:none;place-items:center;display:grid}",
        ".tg-list{flex-direction:column;gap:8px;max-height:180px;margin:0;padding:0;list-style:none;display:flex;overflow-y:auto}",
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
        ".tg-finalize{flex-direction:column;gap:6px;padding:6px 12px;background:var(--dsw-alias-bg-base);display:flex}",
        ".tg-finalizeText{color:var(--dsw-alias-state-warn-primary);font-size:12px;line-height:18px}",
        ".tg-finalizeBtn{align-self:flex-start;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-specific-tip);color:var(--dsw-alias-label-primary);border-radius:8px;padding:4px 10px;font-size:12px;cursor:pointer}",
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

    // ── 证据标记解析（与 host 保守规则一致）──
    function parseProofs(content) {
      const out = [];
      const re = /[(（]\s*证据\s*[:：]\s*([^)）]+)[)）]/g;
      let m;
      while ((m = re.exec(content)) !== null) {
        const p = m[1].trim();
        if (p) out.push(p);
      }
      return out;
    }

    function hasTrace(content) {
      if (parseProofs(content).length > 0) return true;
      const stripped = content
        .replace(/\w+:\/\/\S+/g, " ")
        .replace(/[(（]\s*证据\s*[:：][^)）]*[)）]/g, " ");
      return stripped.split(/[\s,，;；："'`<>（）()\[\]【】]+/).some((t) => {
        if (!t || t.length > 300) return false;
        if (t.includes("://") || t.startsWith("www.")) return false;
        if (!t.includes("/") && !t.includes("\\")) return false;
        if (/^(?:\/|~\/)/.test(t) || /^[A-Za-z]:[\\/]/.test(t)) return true;
        return /\.[A-Za-z0-9]{1,8}$/.test(t.replace(/[.。，,;；]+$/, ""));
      });
    }

    function evidencePaths(content) {
      const proofs = parseProofs(content);
      if (proofs.length > 0) return proofs;
      const stripped = content
        .replace(/\w+:\/\/\S+/g, " ")
        .replace(/[(（]\s*证据\s*[:：][^)）]*[)）]/g, " ");
      const out = [];
      for (const t of stripped.split(/[\s,，;；："'`<>（）()\[\]【】]+/)) {
        if (!t || t.length > 300) continue;
        if (t.includes("://") || t.startsWith("www.")) continue;
        if (!t.includes("/") && !t.includes("\\")) continue;
        if (/^(?:\/|~\/)/.test(t) || /^[A-Za-z]:[\\/]/.test(t)) { out.push(t); continue; }
        if (/\.[A-Za-z0-9]{1,8}$/.test(t.replace(/[.。，,;；]+$/, ""))) out.push(t);
      }
      return out;
    }

    // 证据存在性核验缓存（按会话 + 路径；存在性不变，一次请求多次复用）
    const evidenceCache = new Map(); // key: `${sessionId}\u0000${path}` → boolean
    async function checkEvidence(sessionId, paths) {
      const miss = [];
      const results = [];
      for (const p of paths) {
        const key = sessionId + "\u0000" + p;
        if (evidenceCache.has(key)) {
          results.push({ path: p, exists: evidenceCache.get(key) });
        } else {
          miss.push(p);
        }
      }
      if (miss.length > 0) {
        try {
          const q = new URLSearchParams({ session: sessionId, paths: miss.join(",") });
          const r = await fetch("/api/dsh-todo-guard/evidence?" + q.toString());
          const d = await r.json();
          if (d && d.ok && Array.isArray(d.results)) {
            for (const item of d.results) {
              evidenceCache.set(sessionId + "\u0000" + item.path, item.exists === true);
              results.push({ path: item.path, exists: item.exists === true });
            }
          }
        } catch (e) { /* 网络失败：留在核验中状态，下次渲染重试 */ }
      }
      return results;
    }

    // 已确认项（一键收尾后不再提醒）：localStorage 按 sessionId 持久
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

    function EvidenceBadge({ item, sessionId, results }) {
      // results: Map<path, boolean>（核验结果）；undefined = 核验中
      const paths = evidencePaths(item.content);
      if (paths.length === 0) {
        return react.createElement(
          "span", { className: "tg-badge tg-badgeWarn", title: "完成项无任何可核验痕迹（如具体文件路径），请确认任务确实完成" }, "未验证");
      }
      if (results === undefined) {
        return react.createElement("span", { className: "tg-badge tg-badgeMuted" }, "核验中…");
      }
      const missing = paths.filter((p) => results.get(p) !== true);
      if (missing.length === 0) {
        return react.createElement("span", { className: "tg-badge tg-badgeOk", title: "证据路径均存在" }, "已验证");
      }
      return react.createElement(
        "span", { className: "tg-badge tg-badgeEr", title: "证据路径不存在：" + missing.join("、") }, "证据异常");
    }

    function EvidenceText({ item }) {
      const paths = evidencePaths(item.content);
      if (paths.length === 0) return null;
      const label = paths.join("、");
      const isUrl = paths.length === 1 && /^(https?|ftp):\/\/\S+$/i.test(paths[0]);
      const node = isUrl
        ? react.createElement("a", { href: paths[0], target: "_blank", rel: "noreferrer" }, label)
        : label;
      return react.createElement("span", { className: "tg-evidence", title: label }, node);
    }

    function ReviewPanelView(props) {
      const todos = props.useProjection("todo-guard/todos") ?? [];
      const sessionId = typeof props.sessionId === "string" ? props.sessionId : "none";
      const [collapsed, setCollapsed] = react.useState(true); // 默认折叠（官方面板同款）
      const [confirmed, setConfirmed] = react.useState(() => loadConfirmed(sessionId));
      const [verdicts, setVerdicts] = react.useState({}); // content → Map<path,boolean>（undefined=核验中）
      const [mode, setMode] = react.useState(strictMode);
      react.useEffect(() => {
        const onCfg = () => setMode(strictMode);
        window.addEventListener(CONFIG_EVENT, onCfg);
        refreshConfig().then(onCfg);
        return () => window.removeEventListener(CONFIG_EVENT, onCfg);
      }, []);
      // 核验请求：对完成有痕项异步拉存在性（strictMode 开时才需要）
      react.useEffect(() => {
        if (!mode) return;
        const targets = {};
        for (const t of todos) {
          if (t.status !== "completed") continue;
          const paths = evidencePaths(t.content);
          if (paths.length === 0) continue;
          if (verdicts[t.content] !== undefined) continue;
          targets[t.content] = paths;
        }
        const keys = Object.keys(targets);
        if (keys.length === 0) return;
        let alive = true;
        (async () => {
          for (const content of keys) {
            const res = await checkEvidence(sessionId, targets[content]);
            if (!alive) return;
            setVerdicts((prev) => {
              if (prev[content] !== undefined) return prev;
              const m = new Map();
              for (const item of res) m.set(item.path, item.exists);
              return { ...prev, [content]: m };
            });
          }
        })();
        return () => { alive = false; };
      }, [todos, mode, sessionId, verdicts]);

      if (!todos || todos.length === 0) return null;
      const total = todos.length;
      const done = todos.filter((t) => t.status === "completed").length;
      const incomplete = total - done;
      // 问题项：完成且（无痕 或 有痕但核验后存在缺失）——已确认的不计
      let problemCount = 0;
      let problemItems = [];
      if (mode) {
        for (const t of todos) {
          if (t.status !== "completed") continue;
          if (confirmed.has(t.content)) continue;
          const paths = evidencePaths(t.content);
          const verdict = verdicts[t.content];
          const isProblem = paths.length === 0 || (verdict !== undefined && paths.some((p) => verdict.get(p) !== true));
          if (isProblem) {
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
        ? react.createElement("span", { className: "tg-badge tg-badgeWarn", title: "有完成项缺证据或证据路径不存在，展开列表核对" },
          "⚠ " + problemCount + " 项待确认")
        : null;

      return react.createElement("div", { className: "tg-root" },
        react.createElement("div", { className: "tg-body" },
          react.createElement("button", { type: "button", className: "tg-header", onClick: () => setCollapsed(!collapsed) },
            react.createElement("span", { className: "tg-title" }, "复查"),
            react.createElement("span", { className: "tg-progress" },
              incomplete > 0 ? (done + "/" + total + " 已完成") : "全部完成"),
            visibleProblems,
            react.createElement("span", { className: "tg-chevron", "aria-hidden": "true" }, collapsed ? "▸" : "▾")),
          // 收尾确认条：始终可见（折叠时也在）
          (mode && problemItems.length > 0 && done === total
            ? react.createElement("div", { className: "tg-finalize" },
                react.createElement("span", { className: "tg-finalizeText" },
                  "共 " + problemItems.length + " 项待确认（无证据或证据路径不存在），确认收尾？"),
                react.createElement("button", { type: "button", className: "tg-finalizeBtn", onClick: confirmAll }, "确认收尾"))
            : null),
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
                evidenceText = react.createElement(EvidenceText, { item });
                badge = react.createElement(EvidenceBadge, { item, sessionId, results: verdicts[item.content] });
              }
              return react.createElement("li", { className: "tg-item", key: item.content },
                glyph,
                react.createElement("span", { className: "tg-content" }, item.content),
                evidenceText,
                badge);
            })))))
    }

    // ── 官方设置卡片壳（2026-09-02，视觉对齐 dsh 0.1.2 host PluginCard；key 须与宿主命名空间一致）──
    const CARD_CSS = ".dsh-settings-card{list-style:none;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;transition:border-color .16s,background .16s}.dsh-settings-card:hover{border-color:var(--dsw-alias-label-dimmed)}.dsh-settings-open{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-label-dimmed)}.dsh-settings-head{appearance:none;width:100%;font:inherit;color:inherit;text-align:left;cursor:pointer;background:none;border:0;border-radius:12px;display:flex;align-items:center;gap:12px;padding:14px 16px}.dsh-settings-head:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}.dsh-settings-headtext{display:flex;flex-direction:column;flex:1;min-width:0;gap:4px}.dsh-settings-name{color:var(--dsw-alias-label-primary);font-size:15px;font-weight:600;line-height:1.4}.dsh-settings-desc{color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:1.5}.dsh-settings-chevron{color:var(--dsw-alias-label-tertiary);flex:none;transition:transform .16s}.dsh-settings-open .dsh-settings-chevron{transform:rotate(180deg)}.dsh-settings-body{border-top:1px solid var(--dsw-alias-border-l2);margin:0 16px;padding:10px 0 8px}.dsh-settings-body input,.dsh-settings-body textarea,.dsh-settings-body select{box-sizing:border-box;max-width:100%;min-width:0}";
    let cardCssInjected = false;
    function injectCardCss() {
      if (typeof document === "undefined" || cardCssInjected) return;
      cardCssInjected = true;
      if (document.getElementById("dsh-settings-card-style") !== null) return;
      const tag = document.createElement("style");
      tag.id = "dsh-settings-card-style";
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
            "证据标注（不阻塞勾选；缺证据/证据异常需人工确认收尾）"),
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
        () => react.createElement(SettingsCardShell, { title: "todo 严格模式", desc: "待办证据校验：缺证据/证据异常面板标注，不阻塞勾选" },
          react.createElement(SettingsCard, { inCard: true }))
      ));

      console.log("[dsh-todo-guard] client loaded (v2)");
    }

    exports.inject = inject;
    exports.apply = apply;
    return module.exports;
  }
});
