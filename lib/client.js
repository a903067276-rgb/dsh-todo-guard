window.__ModuleLoader__.load({
  id: "dsh-todo-guard",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    let react = require("react");

    /**
     * dsh-todo-guard — Client 半
     *
     * 顶替官方 todo 面板（conversation.input.dock 的 id:'todo'，官方契约支持
     * 同 id 替换），数据走官方 useProjection('todos') 投影，修复官方重启后
     * 面板不显示的问题。展示三态：
     * - completed + 证据标记 → 绿勾（已验证）
     * - completed + 无证据标记 → 黄标"未验证"（宽松放行，肉眼可查）
     * - in_progress / pending → 官方同款 glyph
     * 样式全部 dsw token（禁硬编码色），布局对齐官方 TodoPanel。
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

    // ── 证据验证开关（设置卡片可切；关 = 官方逻辑只保留显示修复）──
    let verifyEnabled = true;
    const CONFIG_EVENT = "dsh-todo-guard:config";
    async function refreshConfig() {
      try {
        const r = await fetch("/api/dsh-todo-guard/config");
        const d = await r.json();
        verifyEnabled = d.verifyEnabled !== false;
      } catch (e) { /* 保持默认 */ }
    }

    function hasProof(content) {
      return /[(（]\s*证据\s*[:：]/.test(content);
    }

    function TodoPanelView(props) {
      const todos = props.useProjection("todos") ?? [];
      const [collapsed, setCollapsed] = react.useState(false);
      const [verified, setVerified] = react.useState(verifyEnabled);
      react.useEffect(() => {
        const onCfg = () => setVerified(verifyEnabled);
        window.addEventListener(CONFIG_EVENT, onCfg);
        refreshConfig().then(onCfg);
        return () => window.removeEventListener(CONFIG_EVENT, onCfg);
      }, []);
      if (!todos || todos.length === 0) return null;
      const done = todos.filter((t) => t.status === "completed").length;
      const total = todos.length;
      return react.createElement("div", { className: "tg-root" },
        react.createElement("div", { className: "tg-body" },
          react.createElement("button", { type: "button", className: "tg-header", onClick: () => setCollapsed(!collapsed) },
            react.createElement("span", { className: "tg-title" }, "任务"),
            react.createElement("span", { className: "tg-progress" }, done + "/" + total + " 已完成"),
            react.createElement("span", { className: "tg-chevron", "aria-hidden": "true" }, collapsed ? "▸" : "▾")),
          !collapsed && react.createElement("ul", { className: "tg-list" },
            todos.map((item) => {
              let glyph = null;
              if (item.status === "completed") {
                glyph = react.createElement("span", { className: "tg-glyph tg-glyphDone" }, react.createElement(DoneGlyph, null));
              } else if (item.status === "in_progress") {
                glyph = react.createElement("span", { className: "tg-glyph tg-glyphProgress" }, react.createElement(SpinnerGlyph, null));
              } else {
                glyph = react.createElement("span", { className: "tg-glyph tg-glyphPending" }, react.createElement(PendingGlyph, null));
              }
              const badge = verified && item.status === "completed" && !hasProof(item.content)
                ? react.createElement("span", { className: "tg-badge tg-badgeWarn" }, "未验证")
                : null;
              return react.createElement("li", { className: "tg-item", key: item.content },
                glyph,
                react.createElement("span", { className: "tg-content" }, item.content),
                badge);
            }))));
    }

    // ── 设置卡片：证据验证开关 ──
    function SettingsCard() {
      const [enabled, setEnabled] = react.useState(verifyEnabled);
      react.useEffect(() => {
        refreshConfig().then(() => setEnabled(verifyEnabled));
      }, []);
      function toggle() {
        const next = !enabled;
        setEnabled(next);
        fetch("/api/dsh-todo-guard/config", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ verifyEnabled: next }),
        })
          .then((r) => r.json())
          .then((d) => {
            if (d.ok) {
              verifyEnabled = d.verifyEnabled;
              window.dispatchEvent(new Event(CONFIG_EVENT));
            } else {
              setEnabled(!next);
            }
          })
          .catch(() => setEnabled(!next));
      }
      return react.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10, padding: "8px 0", fontSize: 13 } },
        react.createElement("label", { htmlFor: "tg-verify", style: { color: "var(--dsw-alias-label-primary)", flex: "auto", cursor: "pointer" } },
          "证据验证（勾完成时检查证据，防漏做）"),
        react.createElement("input", {
          id: "tg-verify",
          type: "checkbox",
          checked: enabled,
          onChange: toggle,
          style: { width: 16, height: 16, accentColor: "var(--dsw-alias-state-business-primary)", cursor: "pointer" },
        }),
        react.createElement("span", { style: { color: "var(--dsw-alias-label-tertiary)", fontSize: 12, flex: "none" } },
          enabled ? "开" : "关"),
      );
    }

    const inject = ["slots"];

    function apply(ctx) {
      const slots = ctx.get("slots");
      if (slots === undefined) return;

      slots.inject("conversation.input.dock", () => slots.register(
        // priority: -1 低于官方 todo dock 的 0 → 同 id 顶替（lowest renders）
        { name: "conversation.input.dock", id: "todo", order: 0, priority: -1 },
        (props) => {
          // key = sessionId：会话切换强制重挂载——清掉上个会话的残留投影与
          // 折叠状态（否则旧 list 闪一下/残留，造成"跳动"）
          const sid = typeof props.sessionId === "string" ? props.sessionId : "none";
          return react.createElement(TodoPanelView, Object.assign({}, props, { key: sid }));
        },
      ));

      // 设置卡片：证据验证开关
      slots.inject("settings.plugin.item", () => slots.register(
        { name: "settings.plugin.item", key: "todo-guard" },
        () => react.createElement(SettingsCard),
      ));

      console.log("[dsh-todo-guard] client loaded");
    }

    exports.inject = inject;
    exports.apply = apply;
    return module.exports;
  }
});
