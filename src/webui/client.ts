/**
 * webui/client.ts — 自定义面板前端（「视频与对话」）。
 *
 * ## 复现的是**样式**，不是照搬代码
 *
 * 社交视窗那个界面用户很满意：**按作品折叠的圆角卡** ——
 * 标题、发言条数、时间、点开展开楼层串联。
 * 这里照那个样式做，但代码是重写的：因为我们的 store 结构更小，
 * 照搬会带一堆对不上的字段。
 *
 * ## 三个设计决定
 *
 * 1. **按作品聚合，不按消息排**。同一支视频下的"别人回复我 / 我发的评论 /
 *    闲逛读过"收在一张卡里 —— 这是那个界面的核心，也是它比"消息列表"好用的原因。
 * 2. **默认只显示待回应**。主人在面板上第一眼该看到的是"有人等你回"，
 *    而不是 200 条历史。
 * 3. **每条发出去的评论都标可见性**。`self-only` / `unconfirmed` 用不同颜色 ——
 *    这是那个界面的价值：它让"我以为我发出去了"变成"我知道它只有我能看见"。
 */

import type { WebUiPanelContext } from 'cortico/web/shared/client-panel.ts';
import type { TimelineSnapshot, VideoCard } from './data.ts';

const CSS = `
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

/* —— 折叠卡：这是要复现的主体 —— */
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

/* —— 展开后的楼层 —— */
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

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, cls?: string) => {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = text;
  if (cls) n.className = cls;
  return n;
};

function prettyTime(v: string | number): string {
  const t = typeof v === 'number' ? v : Date.parse(String(v));
  if (!Number.isFinite(t)) return String(v);
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 一条视频卡。**展开才渲染楼层** —— 折叠状态下只画标题和计数。 */
function cardNode(card: VideoCard): HTMLElement {
  const wrap = el('details', undefined, 'bl-card');

  const sum = el('summary');
  const title = el('span', card.title || `作品 ${card.oid}`, 'bl-card-title');
  sum.append(title);

  const meta = el('span', undefined, 'bl-card-meta');
  if (card.counts.pending > 0) {
    const t = el('span', `待回应 ${card.counts.pending}`, 'bl-tag');
    t.dataset.k = 'pending';
    meta.append(t);
  }
  if (card.counts.reply > 0) {
    const t = el('span', `收到回复 ${card.counts.reply}`, 'bl-tag');
    t.dataset.k = 'reply';
    meta.append(t);
  }
  if (card.counts.sent > 0) {
    const t = el('span', `已发出 ${card.counts.sent}`, 'bl-tag');
    t.dataset.k = 'sent';
    meta.append(t);
  }
  if (card.counts.roam > 0) {
    const t = el('span', `闲逛读过 ${card.counts.roam}`, 'bl-tag');
    t.dataset.k = 'roam';
    meta.append(t);
  }
  if (card.bvid) {
    const a = el('a', card.bvid, 'bl-tag');
    (a as HTMLAnchorElement).href = `https://www.bilibili.com/video/${card.bvid}`;
    (a as HTMLAnchorElement).target = '_blank';
    (a as HTMLAnchorElement).rel = 'noopener noreferrer';
    meta.append(a);
  }
  const when = el('span', prettyTime(card.lastAt), 'bl-when');
  meta.append(when);
  sum.append(meta);
  wrap.append(sum);

  // 楼层（展开时才填充）
  const thread = el('div', undefined, 'bl-thread');
  let filled = false;
  wrap.addEventListener('toggle', () => {
    if (!wrap.open || filled) return;
    filled = true;
    for (const e of card.events) {
      const ev = el('div', undefined, 'bl-ev');
      ev.dataset.k = e.kind;

      const author = el('span', undefined, 'bl-ev-author');
      author.append(el('span', e.author || '（未知）'));
      if (e.kind === 'sent' && e.status) {
        const pill = el('span', statusLabel(e.status), 'bl-pill');
        pill.dataset.s = e.status;
        author.append(pill);
      }
      if (e.visibility) {
        const pill = el('span', visLabel(e.visibility), 'bl-pill');
        pill.dataset.v = e.visibility;
        author.append(pill);
      }
      ev.append(author);

      ev.append(el('div', e.text || '（空）', 'bl-ev-text'));
      ev.append(el('div', prettyTime(e.at), 'bl-ev-at'));

      if (e.url) {
        const a = el('a', '打开原页', 'bl-btn');
        (a as HTMLAnchorElement).href = e.url;
        (a as HTMLAnchorElement).target = '_blank';
        (a as HTMLAnchorElement).rel = 'noopener noreferrer';
        ev.append(a);
      }
      thread.append(ev);
    }
    if (!card.events.length) thread.append(el('div', '这一楼还没有记录。', 'bl-empty'));
  });
  wrap.append(thread);
  return wrap;
}

function statusLabel(s: string): string {
  switch (s) {
    case 'sent': return '已受理';
    case 'unknown': return '结果待核实';
    case 'sending': return '处理中';
    default: return '未发出';
  }
}

function visLabel(v: string): string {
  switch (v) {
    case 'public': return '访客可见';
    case 'self-only': return '仅自己可见';
    default: return '待核验';
  }
}

export async function mount(ctx: WebUiPanelContext): Promise<void> {
  const style = el('style');
  style.textContent = CSS;
  ctx.root.append(style);

  const desk = el('div', undefined, 'bl-desk');
  ctx.root.append(desk);

  // 顶部状态
  const head = el('div', undefined, 'bl-head');
  desk.append(head);

  // 筛选 + 搜索
  const bar = el('div', undefined, 'bl-bar');
  let filter: 'all' | 'pending' | 'sent' | 'roam' = 'pending';
  let query = '';
  const tabs: Record<string, HTMLButtonElement> = {};
  for (const [key, label] of [
    ['pending', '待回应'],
    ['sent', '已发出'],
    ['roam', '闲逛'],
    ['all', '全部'],
  ] as const) {
    const b = el('button', label, 'bl-tab');
    b.dataset.filter = key;
    b.addEventListener('click', () => {
      filter = key;
      for (const [k, x] of Object.entries(tabs)) x.setAttribute('aria-pressed', String(k === key));
      void load();
    });
    b.setAttribute('aria-pressed', String(key === filter));
    tabs[key] = b;
    bar.append(b);
  }
  const search = el('input', undefined, 'bl-search');
  (search as HTMLInputElement).type = 'search';
  (search as HTMLInputElement).placeholder = '搜索视频、作者或正文';
  let searchTimer: ReturnType<typeof setTimeout> | null = null;
  search.addEventListener('input', () => {
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      query = (search as HTMLInputElement).value;
      void load();
    }, 400);
  });
  bar.append(search);

  const syncBtn = el('button', '立即同步', 'bl-btn');
  syncBtn.addEventListener('click', () => {
    syncBtn.setAttribute('disabled', 'true');
    void ctx
      .invoke('sync')
      .then(() => setTimeout(() => void load(), 1500))
      .finally(() => syncBtn.removeAttribute('disabled'));
  });
  bar.append(syncBtn);
  desk.append(bar);

  // 登录区（未登录时才显示）
  const login = el('div', undefined, 'bl-login');
  desk.append(login);

  // 卡片列表
  const list = el('div', undefined, 'bl-list');
  desk.append(list);

  // 底部：闲逛记录
  const foot = el('div', undefined, 'bl-roam');
  desk.append(foot);

  async function load(): Promise<void> {
    let snap: TimelineSnapshot;
    try {
      snap = await ctx.invoke<TimelineSnapshot>('timeline', [{ filter, query, limit: 60 }]);
    } catch (e) {
      list.textContent = '';
      list.append(el('div', `读取失败：${(e as Error).message}`, 'bl-empty'));
      return;
    }

    // 状态灯
    head.textContent = '';
    const s = snap.state;
    head.append(chip(s.login ? `登录${s.account ? `：${s.account}` : ''}` : '未登录', s.login ? 'on' : 'bad'));
    head.append(chip(s.monitor ? '监听中' : '监听关', s.monitor ? 'on' : 'off'));
    head.append(
      chip(
        s.roaming ? (s.roamingActive ? '闲逛中' : '闲逛待命') : '闲逛关',
        s.roaming ? (s.roamingActive ? 'on' : 'warn') : 'off',
      ),
    );
    head.append(chip(s.posting ? (s.transport === 'browser' ? '可发评（网页）' : '可发评（接口）') : '发评关', s.posting ? 'on' : 'off'));
    head.append(chip(`待回应 ${snap.usage.pending}`, snap.usage.pending > 0 ? 'warn' : 'off'));
    if (s.lastError) head.append(chip(`错误：${s.lastError.slice(0, 60)}`, 'bad'));

    // 未登录时把扫码区摆出来
    login.textContent = '';
    if (!s.login) {
      const note = el(
        'div',
        '未登录时只能拿低清晰度、多半也没字幕。用手机 B站 App 扫这个码：',
        'bl-login-note',
      );
      login.append(note);
      const imgBox = el('div');
      login.append(imgBox);
      const row = el('div', undefined, 'bl-login-row');
      const btn = el('button', '获取二维码', 'bl-btn');
      const importBtn = el('button', '从社交视窗导入登录', 'bl-btn');
      const status = el('span', '');
      row.append(btn, importBtn, status);
      login.append(row);

      // 已经用过社交视窗的人不用重新扫码
      importBtn.addEventListener('click', () => {
        importBtn.setAttribute('disabled', 'true');
        status.textContent = '正在导入…';
        void ctx
          .invoke<any>('import-login')
          .then((r) => {
            status.textContent = r?.ok
              ? (r.note ?? '已导入')
              : `没导入：${r?.error ?? '未知错误'}`;
            if (r?.ok) setTimeout(() => void load(), 600);
          })
          .finally(() => importBtn.removeAttribute('disabled'));
      });

      let pollTimer: ReturnType<typeof setInterval> | null = null;
      btn.addEventListener('click', () => {
        btn.setAttribute('disabled', 'true');
        status.textContent = '正在生成…';
        void ctx
          .invoke<any>('qr-start')
          .then((r) => {
            if (!r || r.error) {
              status.textContent = `失败：${r?.error ?? '未知错误'}`;
              return;
            }
            imgBox.textContent = '';
            if (r.image) {
              const im = el('img') as HTMLImageElement;
              im.src = r.image;
              im.alt = 'B站登录二维码';
              imgBox.append(im);
            } else {
              imgBox.append(el('div', '（二维码组件没装，可改用配置里的登录来源）', 'bl-login-note'));
            }
            status.textContent = '等待扫码…';
            if (pollTimer) clearInterval(pollTimer);
            pollTimer = setInterval(() => {
              void ctx.invoke<any>('qr-poll', [r.key]).then((p) => {
                if (!p) return;
                if (p.status === 'success') {
                  status.textContent = '登录成功！正在刷新…';
                  if (pollTimer) clearInterval(pollTimer);
                  setTimeout(() => void load(), 800);
                } else if (p.status === 'scanned') {
                  status.textContent = '已扫码，请在手机上确认';
                } else if (p.status === 'expired') {
                  status.textContent = '二维码过期了，重新获取';
                  if (pollTimer) clearInterval(pollTimer);
                  btn.removeAttribute('disabled');
                } else if (p.status === 'error') {
                  status.textContent = String(p.message ?? '出错了');
                  if (pollTimer) clearInterval(pollTimer);
                  btn.removeAttribute('disabled');
                }
              });
            }, 2000) as any;
          })
          .finally(() => btn.removeAttribute('disabled'));
      });
    }

    // 卡片
    list.textContent = '';
    if (!snap.cards.length) {
      list.append(
        el(
          'div',
          filter === 'pending'
            ? '没有待回应的消息。有人回复或 @ 你时，会出现在这里。'
            : query
              ? `没有匹配「${query}」的记录。`
              : '还没有任何互动记录。',
          'bl-empty',
        ),
      );
    } else {
      for (const c of snap.cards) list.append(cardNode(c));
    }

    // 底部
    foot.textContent = '';
    foot.append(
      el(
        'div',
        `共 ${snap.total} 个作品 · 今日发出 ${snap.usage.sentToday}/${snap.usage.sentLimit} 条 · ` +
        `闲逛 ${snap.usage.roamToday}/${snap.usage.roamLimit} 轮` +
        (s.lastPollAt ? ` · 上次同步 ${prettyTime(s.lastPollAt)}` : ''),
      ),
    );
    const recent = snap.roamingRecent ?? [];
    if (recent.length) {
      foot.append(el('div', '最近闲逛：'));
      for (const r of recent) {
        const line = `· ${prettyTime(r.at)} ${r.status}${r.summary ? ` —— ${r.summary}` : ''}`;
        foot.append(el('div', line.slice(0, 180)));
      }
    }
  }

  function chip(text: string, tone: 'on' | 'off' | 'warn' | 'bad'): HTMLElement {
    const c = el('span', text, 'bl-chip');
    c.dataset.tone = tone;
    return c;
  }

  await load();
  // 每 15 秒刷一次（面板开着的时候）
  ctx.interval(() => void load(), 15_000);
}

export default { panels: { desk: { mount } } };
