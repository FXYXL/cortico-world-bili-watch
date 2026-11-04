// src/webui/client.ts
var CSS = `
.bl-desk { display:flex; flex-direction:column; gap:14px; font:inherit; color:inherit; }
.bl-head { display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
.bl-chip { border:1px solid currentColor; border-radius:999px; padding:2px 10px; font-size:12px; opacity:.75; }
.bl-chip[data-tone="on"] { border-color:#3ba55d; color:#3ba55d; opacity:1; }
.bl-chip[data-tone="off"] { opacity:.45; }
.bl-chip[data-tone="warn"] { border-color:#d9822b; color:#d9822b; opacity:1; }
.bl-chip[data-tone="bad"] { border-color:#d64545; color:#d64545; opacity:1; }

.bl-bar { display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
.bl-tab { border:1px solid rgba(128,128,128,.35); background:transparent; color:inherit;
  border-radius:8px; padding:5px 12px; cursor:pointer; font-size:13px; }
.bl-tab[aria-pressed="true"] { background:rgba(128,128,128,.18); border-color:rgba(128,128,128,.6); font-weight:600; }
.bl-search { flex:1 1 180px; min-width:140px; border:1px solid rgba(128,128,128,.35); background:transparent;
  color:inherit; border-radius:8px; padding:6px 10px; font-size:13px; }
.bl-btn { border:1px solid rgba(128,128,128,.35); background:transparent; color:inherit;
  border-radius:8px; padding:5px 12px; cursor:pointer; font-size:13px; }
.bl-btn:hover { background:rgba(128,128,128,.12); }
.bl-btn:disabled { opacity:.4; cursor:default; }

/* \u2014\u2014 \u6298\u53E0\u5361\uFF1A\u8FD9\u662F\u8981\u590D\u73B0\u7684\u4E3B\u4F53 \u2014\u2014 */
.bl-list { display:flex; flex-direction:column; gap:10px; }
.bl-card { border:1px solid rgba(128,128,128,.28); border-radius:14px; overflow:hidden;
  background:rgba(128,128,128,.05); }
.bl-card > summary { list-style:none; cursor:pointer; padding:12px 14px; display:flex;
  flex-direction:column; gap:6px; }
.bl-card > summary::-webkit-details-marker { display:none; }
.bl-card[open] { background:rgba(128,128,128,.09); }
.bl-card-title { font-size:14px; font-weight:600; line-height:1.35; }
.bl-card-meta { display:flex; flex-wrap:wrap; gap:10px; align-items:center; font-size:12px; opacity:.7; }
.bl-card-meta .bl-when { margin-left:auto; }
.bl-tag { border-radius:999px; padding:1px 8px; font-size:11px; border:1px solid rgba(128,128,128,.35); }
.bl-tag[data-k="reply"] { border-color:#4a9eff; color:#4a9eff; }
.bl-tag[data-k="sent"] { border-color:#3ba55d; color:#3ba55d; }
.bl-tag[data-k="roam"] { border-color:#9b7bd4; color:#9b7bd4; }
.bl-tag[data-k="pending"] { border-color:#d9822b; color:#d9822b; font-weight:600; }

/* \u2014\u2014 \u5C55\u5F00\u540E\u7684\u697C\u5C42 \u2014\u2014 */
.bl-thread { border-top:1px solid rgba(128,128,128,.22); padding:10px 14px 14px;
  display:flex; flex-direction:column; gap:9px; }
.bl-ev { display:flex; flex-direction:column; gap:3px; padding-left:10px;
  border-left:2px solid rgba(128,128,128,.3); }
.bl-ev[data-k="reply"] { border-left-color:#4a9eff; }
.bl-ev[data-k="sent"] { border-left-color:#3ba55d; }
.bl-ev[data-k="roam"] { border-left-color:#9b7bd4; }
.bl-ev-author { font-size:12px; font-weight:600; display:flex; gap:8px; align-items:center; }
.bl-ev-text { font-size:13px; line-height:1.5; white-space:pre-wrap; word-break:break-word; }
.bl-ev-at { font-size:11px; opacity:.55; }
.bl-ev-do { display:flex; gap:6px; margin-top:2px; }
.bl-pill { border-radius:999px; padding:1px 7px; font-size:10px; border:1px solid currentColor; opacity:.9; }
.bl-pill[data-v="public"] { color:#3ba55d; }
.bl-pill[data-v="self-only"] { color:#d64545; }
.bl-pill[data-v="unconfirmed"] { color:#d9822b; }
.bl-pill[data-s="rejected"] { color:#d64545; }
.bl-pill[data-s="unknown"] { color:#d9822b; }
.bl-pill[data-s="sending"] { color:#4a9eff; }

.bl-empty { padding:28px 16px; text-align:center; font-size:13px; opacity:.6; }
.bl-foot { display:flex; flex-wrap:wrap; gap:10px; align-items:center; font-size:12px; opacity:.65; }
.bl-roam { display:flex; flex-direction:column; gap:4px; font-size:12px; opacity:.7;
  border-top:1px solid rgba(128,128,128,.22); padding-top:10px; }

.bl-login { display:flex; flex-direction:column; gap:10px; align-items:center;
  border:1px solid rgba(128,128,128,.28); border-radius:14px; padding:14px; }
.bl-login img { border-radius:10px; background:#fff; padding:6px; display:block; }
.bl-login-note { font-size:12px; opacity:.75; text-align:center; line-height:1.5; }
.bl-login-row { display:flex; gap:8px; align-items:center; flex-wrap:wrap; justify-content:center; }
`;
var el = (tag, text, cls) => {
  const n = document.createElement(tag);
  if (text !== void 0) n.textContent = text;
  if (cls) n.className = cls;
  return n;
};
function prettyTime(v) {
  const t = typeof v === "number" ? v : Date.parse(String(v));
  if (!Number.isFinite(t)) return String(v);
  const d = new Date(t);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function cardNode(card) {
  const wrap = el("details", void 0, "bl-card");
  const sum = el("summary");
  const title = el("span", card.title || `\u4F5C\u54C1 ${card.oid}`, "bl-card-title");
  sum.append(title);
  const meta = el("span", void 0, "bl-card-meta");
  if (card.counts.pending > 0) {
    const t = el("span", `\u5F85\u56DE\u5E94 ${card.counts.pending}`, "bl-tag");
    t.dataset.k = "pending";
    meta.append(t);
  }
  if (card.counts.reply > 0) {
    const t = el("span", `\u6536\u5230\u56DE\u590D ${card.counts.reply}`, "bl-tag");
    t.dataset.k = "reply";
    meta.append(t);
  }
  if (card.counts.sent > 0) {
    const t = el("span", `\u5DF2\u53D1\u51FA ${card.counts.sent}`, "bl-tag");
    t.dataset.k = "sent";
    meta.append(t);
  }
  if (card.counts.roam > 0) {
    const t = el("span", `\u95F2\u901B\u8BFB\u8FC7 ${card.counts.roam}`, "bl-tag");
    t.dataset.k = "roam";
    meta.append(t);
  }
  if (card.bvid) {
    const a = el("a", card.bvid, "bl-tag");
    a.href = `https://www.bilibili.com/video/${card.bvid}`;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    meta.append(a);
  }
  const when = el("span", prettyTime(card.lastAt), "bl-when");
  meta.append(when);
  sum.append(meta);
  wrap.append(sum);
  const thread = el("div", void 0, "bl-thread");
  let filled = false;
  wrap.addEventListener("toggle", () => {
    if (!wrap.open || filled) return;
    filled = true;
    for (const e of card.events) {
      const ev = el("div", void 0, "bl-ev");
      ev.dataset.k = e.kind;
      const author = el("span", void 0, "bl-ev-author");
      author.append(el("span", e.author || "\uFF08\u672A\u77E5\uFF09"));
      if (e.kind === "sent" && e.status) {
        const pill = el("span", statusLabel(e.status), "bl-pill");
        pill.dataset.s = e.status;
        author.append(pill);
      }
      if (e.visibility) {
        const pill = el("span", visLabel(e.visibility), "bl-pill");
        pill.dataset.v = e.visibility;
        author.append(pill);
      }
      ev.append(author);
      ev.append(el("div", e.text || "\uFF08\u7A7A\uFF09", "bl-ev-text"));
      ev.append(el("div", prettyTime(e.at), "bl-ev-at"));
      if (e.url) {
        const a = el("a", "\u6253\u5F00\u539F\u9875", "bl-btn");
        a.href = e.url;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        ev.append(a);
      }
      thread.append(ev);
    }
    if (!card.events.length) thread.append(el("div", "\u8FD9\u4E00\u697C\u8FD8\u6CA1\u6709\u8BB0\u5F55\u3002", "bl-empty"));
  });
  wrap.append(thread);
  return wrap;
}
function statusLabel(s) {
  switch (s) {
    case "sent":
      return "\u5DF2\u53D7\u7406";
    case "unknown":
      return "\u7ED3\u679C\u5F85\u6838\u5B9E";
    case "sending":
      return "\u5904\u7406\u4E2D";
    default:
      return "\u672A\u53D1\u51FA";
  }
}
function visLabel(v) {
  switch (v) {
    case "public":
      return "\u8BBF\u5BA2\u53EF\u89C1";
    case "self-only":
      return "\u4EC5\u81EA\u5DF1\u53EF\u89C1";
    default:
      return "\u5F85\u6838\u9A8C";
  }
}
async function mount(ctx) {
  const style = el("style");
  style.textContent = CSS;
  ctx.root.append(style);
  const desk = el("div", void 0, "bl-desk");
  ctx.root.append(desk);
  const head = el("div", void 0, "bl-head");
  desk.append(head);
  const bar = el("div", void 0, "bl-bar");
  let filter = "pending";
  let query = "";
  const tabs = {};
  for (const [key, label] of [
    ["pending", "\u5F85\u56DE\u5E94"],
    ["sent", "\u5DF2\u53D1\u51FA"],
    ["roam", "\u95F2\u901B"],
    ["all", "\u5168\u90E8"]
  ]) {
    const b = el("button", label, "bl-tab");
    b.dataset.filter = key;
    b.addEventListener("click", () => {
      filter = key;
      for (const [k, x] of Object.entries(tabs)) x.setAttribute("aria-pressed", String(k === key));
      void load();
    });
    b.setAttribute("aria-pressed", String(key === filter));
    tabs[key] = b;
    bar.append(b);
  }
  const search = el("input", void 0, "bl-search");
  search.type = "search";
  search.placeholder = "\u641C\u7D22\u89C6\u9891\u3001\u4F5C\u8005\u6216\u6B63\u6587";
  let searchTimer = null;
  search.addEventListener("input", () => {
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      query = search.value;
      void load();
    }, 400);
  });
  bar.append(search);
  const syncBtn = el("button", "\u7ACB\u5373\u540C\u6B65", "bl-btn");
  syncBtn.addEventListener("click", () => {
    syncBtn.setAttribute("disabled", "true");
    void ctx.invoke("sync").then(() => setTimeout(() => void load(), 1500)).finally(() => syncBtn.removeAttribute("disabled"));
  });
  bar.append(syncBtn);
  desk.append(bar);
  const login = el("div", void 0, "bl-login");
  desk.append(login);
  const list = el("div", void 0, "bl-list");
  desk.append(list);
  const foot = el("div", void 0, "bl-roam");
  desk.append(foot);
  async function load() {
    let snap;
    try {
      snap = await ctx.invoke("timeline", [{ filter, query, limit: 60 }]);
    } catch (e) {
      list.textContent = "";
      list.append(el("div", `\u8BFB\u53D6\u5931\u8D25\uFF1A${e.message}`, "bl-empty"));
      return;
    }
    head.textContent = "";
    const s = snap.state;
    head.append(chip(s.login ? `\u767B\u5F55${s.account ? `\uFF1A${s.account}` : ""}` : "\u672A\u767B\u5F55", s.login ? "on" : "bad"));
    head.append(chip(s.monitor ? "\u76D1\u542C\u4E2D" : "\u76D1\u542C\u5173", s.monitor ? "on" : "off"));
    head.append(
      chip(
        s.roaming ? s.roamingActive ? "\u95F2\u901B\u4E2D" : "\u95F2\u901B\u5F85\u547D" : "\u95F2\u901B\u5173",
        s.roaming ? s.roamingActive ? "on" : "warn" : "off"
      )
    );
    head.append(chip(s.posting ? s.transport === "browser" ? "\u53EF\u53D1\u8BC4\uFF08\u7F51\u9875\uFF09" : "\u53EF\u53D1\u8BC4\uFF08\u63A5\u53E3\uFF09" : "\u53D1\u8BC4\u5173", s.posting ? "on" : "off"));
    head.append(chip(`\u5F85\u56DE\u5E94 ${snap.usage.pending}`, snap.usage.pending > 0 ? "warn" : "off"));
    if (s.lastError) head.append(chip(`\u9519\u8BEF\uFF1A${s.lastError.slice(0, 60)}`, "bad"));
    login.textContent = "";
    if (!s.login) {
      const note = el(
        "div",
        "\u672A\u767B\u5F55\u65F6\u53EA\u80FD\u62FF\u4F4E\u6E05\u6670\u5EA6\u3001\u591A\u534A\u4E5F\u6CA1\u5B57\u5E55\u3002\u7528\u624B\u673A B\u7AD9 App \u626B\u8FD9\u4E2A\u7801\uFF1A",
        "bl-login-note"
      );
      login.append(note);
      const imgBox = el("div");
      login.append(imgBox);
      const row = el("div", void 0, "bl-login-row");
      const btn = el("button", "\u83B7\u53D6\u4E8C\u7EF4\u7801", "bl-btn");
      const status = el("span", "");
      row.append(btn, status);
      login.append(row);
      let pollTimer = null;
      btn.addEventListener("click", () => {
        btn.setAttribute("disabled", "true");
        status.textContent = "\u6B63\u5728\u751F\u6210\u2026";
        void ctx.invoke("qr-start").then((r) => {
          if (!r || r.error) {
            status.textContent = `\u5931\u8D25\uFF1A${r?.error ?? "\u672A\u77E5\u9519\u8BEF"}`;
            return;
          }
          imgBox.textContent = "";
          if (r.image) {
            const im = el("img");
            im.src = r.image;
            im.alt = "B\u7AD9\u767B\u5F55\u4E8C\u7EF4\u7801";
            imgBox.append(im);
          } else {
            imgBox.append(el("div", "\uFF08\u4E8C\u7EF4\u7801\u7EC4\u4EF6\u6CA1\u88C5\uFF0C\u53EF\u6539\u7528\u914D\u7F6E\u91CC\u7684\u767B\u5F55\u6765\u6E90\uFF09", "bl-login-note"));
          }
          status.textContent = "\u7B49\u5F85\u626B\u7801\u2026";
          if (pollTimer) clearInterval(pollTimer);
          pollTimer = setInterval(() => {
            void ctx.invoke("qr-poll", [r.key]).then((p) => {
              if (!p) return;
              if (p.status === "success") {
                status.textContent = "\u767B\u5F55\u6210\u529F\uFF01\u6B63\u5728\u5237\u65B0\u2026";
                if (pollTimer) clearInterval(pollTimer);
                setTimeout(() => void load(), 800);
              } else if (p.status === "scanned") {
                status.textContent = "\u5DF2\u626B\u7801\uFF0C\u8BF7\u5728\u624B\u673A\u4E0A\u786E\u8BA4";
              } else if (p.status === "expired") {
                status.textContent = "\u4E8C\u7EF4\u7801\u8FC7\u671F\u4E86\uFF0C\u91CD\u65B0\u83B7\u53D6";
                if (pollTimer) clearInterval(pollTimer);
                btn.removeAttribute("disabled");
              } else if (p.status === "error") {
                status.textContent = String(p.message ?? "\u51FA\u9519\u4E86");
                if (pollTimer) clearInterval(pollTimer);
                btn.removeAttribute("disabled");
              }
            });
          }, 2e3);
        }).finally(() => btn.removeAttribute("disabled"));
      });
    }
    list.textContent = "";
    if (!snap.cards.length) {
      list.append(
        el(
          "div",
          filter === "pending" ? "\u6CA1\u6709\u5F85\u56DE\u5E94\u7684\u6D88\u606F\u3002\u6709\u4EBA\u56DE\u590D\u6216 @ \u4F60\u65F6\uFF0C\u4F1A\u51FA\u73B0\u5728\u8FD9\u91CC\u3002" : query ? `\u6CA1\u6709\u5339\u914D\u300C${query}\u300D\u7684\u8BB0\u5F55\u3002` : "\u8FD8\u6CA1\u6709\u4EFB\u4F55\u4E92\u52A8\u8BB0\u5F55\u3002",
          "bl-empty"
        )
      );
    } else {
      for (const c of snap.cards) list.append(cardNode(c));
    }
    foot.textContent = "";
    foot.append(
      el(
        "div",
        `\u5171 ${snap.total} \u4E2A\u4F5C\u54C1 \xB7 \u4ECA\u65E5\u53D1\u51FA ${snap.usage.sentToday}/${snap.usage.sentLimit} \u6761 \xB7 \u95F2\u901B ${snap.usage.roamToday}/${snap.usage.roamLimit} \u8F6E` + (s.lastPollAt ? ` \xB7 \u4E0A\u6B21\u540C\u6B65 ${prettyTime(s.lastPollAt)}` : "")
      )
    );
    const recent = snap.roamingRecent ?? [];
    if (recent.length) {
      foot.append(el("div", "\u6700\u8FD1\u95F2\u901B\uFF1A"));
      for (const r of recent) {
        const line = `\xB7 ${prettyTime(r.at)} ${r.status}${r.summary ? ` \u2014\u2014 ${r.summary}` : ""}`;
        foot.append(el("div", line.slice(0, 180)));
      }
    }
  }
  function chip(text, tone) {
    const c = el("span", text, "bl-chip");
    c.dataset.tone = tone;
    return c;
  }
  await load();
  ctx.interval(() => void load(), 15e3);
}
var client_default = { panels: { desk: { mount } } };
export {
  client_default as default,
  mount
};
