/**
 * webui/client.ts — 「B站伴侣」的两个面板：**视频与对话**（记录）+ **配置**。
 *
 * ## 设计取舍
 *
 * 1. **记录页按作品聚合，不按消息排**。同一支视频下的"别人回复我 / 我发的评论 /
 *    闲逛读过"收在一张卡里 —— 消息列表看不出"这一楼到底在聊什么"。
 * 2. **配置页从 schema 生成**。`config-group.ts` 是唯一来源：加一个配置项不用动前端，
 *    标题、说明、上下限、枚举全跟着走。保存走宿主配置面（`ctx.setConfig`，
 *    校验与热更新由框架做），失败再回落到本 World 的 `save`。
 * 3. **登录区常驻**。以前只有"未登录"才渲染，cookie 一存在二维码入口就消失了。
 *    现在三种状态都摆出来：未登录 / 有凭据未核验 / 已核验。
 *
 * ## 依赖
 *
 * 样式在 `dist/webui.css`（`package.json` 的 `cortico.webUiStyle`），
 * 所以这里**不注入 `<style>`**，结构直接用 `bw-*` 类名。
 */

import type { WebUiPanelContext } from 'cortico/web/shared/client-panel.ts';

import { BILI_WATCH_CONFIG_GROUP } from '../config-group.ts';
import { ROAMING_PRESETS } from '../config.ts';
import type { TimelineEvent, TimelineSnapshot, TimelineThread, VideoCard } from './data.ts';
import { detectPreset, PRESET_LABEL } from './preset.ts';

const PREFIX = 'worlds.bili-watch.';

type Prop = (typeof BILI_WATCH_CONFIG_GROUP)['schema']['properties'][string];
type Values = Record<string, unknown>;

/* ------------------------------------------------------------------ 小工具 */

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text?: string | null,
  cls?: string,
): HTMLElementTagNameMap[K] => {
  const n = document.createElement(tag);
  if (text !== undefined && text !== null) n.textContent = text;
  if (cls) n.className = cls;
  return n;
};

const short = (v: string, max = 240) => (v.length > max ? `${v.slice(0, max)}…` : v);

function when(value: string | number | undefined): string {
  if (value === undefined) return '';
  // 数据面已统一成**毫秒数字**（或 ISO 字符串）——这里只管建 Date，**不要**再乘 1000。
  const t = typeof value === 'number' ? value : Date.parse(String(value));
  if (!Number.isFinite(t)) return String(value ?? '');
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, '0');
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? `${p(d.getHours())}:${p(d.getMinutes())}`
    : `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

const statusLabel = (s?: string): string =>
  s === 'sent' ? '已受理' : s === 'unknown' ? '待核实' : s === 'sending' ? '提交中' : '未发出';

const visLabel = (v?: string): string =>
  v === 'public' ? '访客可见' : v === 'self-only' ? '仅自己可见' : '待核验';

function tag(text: string, kind?: string): HTMLElement {
  const t = el('span', text, 'bw-tag');
  if (kind) t.dataset.k = kind;
  return t;
}

/**
 * 保存配置。
 *
 * 走本 World 的 `save`：服务端用**同一份 schema** 校验（`coerceGroupValues`），
 * 再 `ctx.persist` 写回活配置 —— 不需要另开一套字段白名单。
 */
async function saveConfig(ctx: WebUiPanelContext, values: Values): Promise<string> {
  const r = await ctx.invoke<{ message?: string }>('save', [values]);
  return r?.message ?? '已保存，即时生效';
}

/* ------------------------------------------------------------------ 登录区 */

interface LoginBox {
  node: HTMLElement;
  hasCookie(): boolean;
  lastVerified: boolean;
  check(quiet?: boolean): Promise<void>;
  update(state: TimelineSnapshot['state']): void;
}

function buildLogin(ctx: WebUiPanelContext, onChanged: () => void): LoginBox {
  const node = el('div', null, 'bw-login');
  const head = el('div', null, 'bw-login-head');
  const stateText = el('span', '', 'bw-muted');
  head.append(el('strong', '登录'), stateText);

  const qrBox = el('div', null, 'bw-qr');
  const row = el('div', null, 'bw-login-row');
  const msg = el('div', null, 'bw-login-msg');

  const btnCheck = el('button', '检查登录');
  const btnQr = el('button', '获取二维码');
  const btnLogout = el('button', '退出登录');
  row.append(btnCheck, btnQr, btnLogout);
  node.append(head, qrBox, row, msg);

  let cookie = false;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  const say = (text: string, bad = false) => {
    msg.textContent = text;
    msg.dataset.tone = bad ? 'bad' : 'ok';
  };
  const stop = () => {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
  };
  ctx.signal.addEventListener('abort', stop);

  const box: LoginBox = {
    node,
    hasCookie: () => cookie,
    lastVerified: false,
    update(state) {
      cookie = Boolean(state.login);
      box.lastVerified = Boolean(state.verified);
      node.dataset.state = !cookie ? 'none' : state.verified ? 'ok' : 'unverified';
      stateText.textContent = !cookie
        ? '未登录 —— 只能看低清晰度，多半也没有字幕'
        : state.verified
          ? `已核验：${state.account ?? '（账号未知）'}`
          : '有凭据，但还没核验过账号（可能已过期）';
      btnLogout.hidden = !cookie;
      if (!cookie) qrBox.textContent = '';
      node.title = state.cookieSecret ? `凭据变量：${state.cookieSecret}` : '';
    },
    async check(quiet = false) {
      if (!quiet) say('正在核对账号…');
      try {
        const r = await ctx.invoke<{ ok?: boolean; account?: string; error?: string }>('check-login');
        if (r?.ok) {
          say(`已登录：${r.account ?? ''}`);
          box.lastVerified = true;
          onChanged();
        } else {
          say(r?.error ?? '核验失败', true);
        }
      } catch (error) {
        say((error as Error).message, true);
      }
    },
  };

  btnCheck.addEventListener('click', () => {
    btnCheck.disabled = true;
    void box.check().finally(() => {
      btnCheck.disabled = false;
    });
  });

  btnQr.addEventListener('click', () => {
    btnQr.disabled = true;
    say('正在生成二维码…');
    void ctx
      .invoke<{ image?: string; key?: string; url?: string; error?: string }>('qr-start')
      .then((r) => {
        if (!r || r.error) {
          say(`生成失败：${r?.error ?? '未知错误'}`, true);
          return;
        }
        qrBox.textContent = '';
        if (r.image) {
          const img = el('img') as HTMLImageElement;
          img.src = r.image;
          img.alt = 'B站登录二维码';
          img.width = 220;
          qrBox.append(img);
        } else {
          qrBox.append(el('p', '二维码组件不可用。', 'bw-muted'));
          if (r.url) {
            const a = el('a', '改用手机打开这个登录链接');
            (a as HTMLAnchorElement).href = r.url;
            (a as HTMLAnchorElement).target = '_blank';
            (a as HTMLAnchorElement).rel = 'noopener noreferrer';
            qrBox.append(a);
          }
        }
        say('用手机 B站 App 扫码');
        stop();
        pollTimer = setInterval(() => {
          void ctx
            .invoke<{ status?: string; message?: string; account?: string }>('qr-poll', [r.key])
            .then((p) => {
              if (!p) return;
              if (p.status === 'success') {
                stop();
                qrBox.textContent = '';
                say(`登录成功${p.account ? `：${p.account}` : ''}`);
                onChanged();
              } else if (p.status === 'scanned') {
                say('已扫码，请在手机上确认');
              } else if (p.status === 'expired') {
                stop();
                say('二维码过期了，重新获取', true);
              } else if (p.status === 'error') {
                stop();
                say(p.message ?? '登录失败', true);
              }
            });
        }, 2000);
      })
      .finally(() => {
        btnQr.disabled = false;
      });
  });

  btnLogout.addEventListener('click', () => {
    void ctx
      .invoke<{ ok?: boolean; note?: string; error?: string }>('logout')
      .then((r) => {
        say(r?.ok ? (r.note ?? '已退出') : (r.error ?? '退出失败'), !r?.ok);
        onChanged();
      });
  });

  return box;
}

/* ------------------------------------------------------------------ 记录页 */

export function mountDesk(ctx: WebUiPanelContext): void {
  const root = ctx.root;
  root.classList.add('bw-desk');

  // 不再放自己的大标题：宿主的 World 页头已经有「B站伴侣」，重复一份会把版面撑乱
  const overview = el('div', null, 'bw-overview');
  root.append(overview);

  const banner = el('div', null, 'bw-feedback');
  banner.hidden = true;
  banner.setAttribute('role', 'status');
  root.append(banner);

  const loginBox = buildLogin(ctx, () => void load());
  root.append(loginBox.node);

  const toolbar = el('div', null, 'bw-toolbar');
  const filters = el('div', null, 'bw-filters');
  // 默认打开「已发出」：用户最常看的是"我说过什么、谁回了我"；
  // 待回应有顶部读数盯着，需要时再切。
  let filter: 'pending' | 'sent' | 'all' = 'sent';
  const filterButtons: Record<string, HTMLButtonElement> = {};
  for (const [key, label] of [
    ['pending', '待回应'],
    ['sent', '已发出'],
    ['all', '全部'],
  ] as const) {
    const b = el('button', label);
    b.addEventListener('click', () => {
      filter = key;
      for (const [k, x] of Object.entries(filterButtons)) {
        x.setAttribute('aria-pressed', String(k === key));
      }
      void load();
    });
    b.setAttribute('aria-pressed', String(key === filter));
    filterButtons[key] = b;
    filters.append(b);
  }
  const search = el('input') as HTMLInputElement;
  search.type = 'search';
  search.placeholder = '搜视频、作者或正文';
  let searchTimer: ReturnType<typeof setTimeout> | null = null;
  search.addEventListener('input', () => {
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => void load(), 380);
  });
  const syncBtn = el('button', '立即同步');
  syncBtn.addEventListener('click', () => {
    syncBtn.disabled = true;
    void ctx
      .invoke('sync')
      .then(() => void ctx.timeout(() => void load(), 1500))
      .finally(() => {
        syncBtn.disabled = false;
      });
  });
  toolbar.append(filters, search, syncBtn);
  root.append(toolbar);

  const list = el('div', null, 'bw-list');
  root.append(list);

  const roam = el('div', null, 'bw-roam');
  root.append(roam);

  const expanded = new Set<string>(ctx.memo.get<string[]>('expanded', []) ?? []);

  function say(text: string, bad = false): void {
    banner.textContent = text;
    banner.dataset.tone = bad ? 'bad' : 'ok';
    banner.hidden = false;
  }

  async function act(run: () => Promise<unknown>, okText: string): Promise<void> {
    try {
      const r = (await run()) as { ok?: boolean; error?: string } | undefined;
      if (r && r.ok === false) say(String(r.error ?? '操作失败'), true);
      else say(okText);
      await load();
    } catch (error) {
      say((error as Error).message, true);
    }
  }

  function eventNode(e: TimelineEvent, thread: TimelineThread): HTMLElement {
    const wrap = el('div', null, 'bw-event');
    wrap.dataset.k = e.direction;

    // 第一行：种类标签 + 状态标签 + 时间（照搬那套 meta 行，不把状态塞进说话人里）
    const meta = el('div', null, 'bw-event-meta');
    const tags = el('div', null, 'bw-tags');
    tags.append(tag(e.label));
    if (e.direction === 'outgoing') {
      if (e.status) tags.append(tag(statusLabel(e.status), e.status === 'rejected' ? 'bad' : e.status === 'sent' ? 'good' : undefined));
      if (e.visibility) tags.append(tag(visLabel(e.visibility), e.visibility === 'public' ? 'good' : undefined));
    } else if (e.pending) {
      tags.append(tag('待回应', 'pending'));
    }
    meta.append(tags, el('time', when(e.at)));
    wrap.append(meta);

    wrap.append(el('div', e.direction === 'incoming' ? e.author || '（未知）' : '我', 'bw-speaker'));

    // 引用块**要去重**：被接的原话已经作为 incoming 楼层出现在同一线程里时，
    // 不再重复显示引用 —— 否则同一句话既单独一条又嵌在回复里，看两遍。
    if (
      e.quote?.text &&
      !thread.entries.some(
        (i) => i.direction === 'incoming' && i.target?.parent === e.quote?.target?.parent,
      )
    ) {
      const quote = el('blockquote', null, 'bw-quote');
      quote.append(el('span', `回复 ${e.quote.author || '原评论'}`, 'bw-quote-author'));
      quote.append(el('div', short(e.quote.text, 300)));
      wrap.append(quote);
    }
    wrap.append(el('div', short(e.text || '（空）', 900), 'bw-body'));

    const actions = el('div', null, 'bw-event-actions');
    if (e.href) {
      const go = el('a', '定位到这条评论');
      (go as HTMLAnchorElement).href = e.href;
      (go as HTMLAnchorElement).target = '_blank';
      (go as HTMLAnchorElement).rel = 'noopener noreferrer';
      actions.append(go);
    }
    if (e.direction === 'incoming' && e.pending) {
      const done = el('button', '标记已处理');
      done.addEventListener('click', () =>
        void act(
          () => ctx.invoke('handled', [e.id, '在面板上标记已处理']),
          '已标记处理，这条不会回复。',
        ),
      );
      const later = el('button', '30 分钟后再看');
      later.addEventListener('click', () =>
        void act(() => ctx.invoke('defer', [e.id, 30]), '已延后 30 分钟。'),
      );
      actions.append(done, later);
    }
    if (e.direction === 'outgoing' && (e.status === 'unknown' || e.status === 'sent')) {
      const verify = el('button', '核验可见性');
      verify.addEventListener('click', () =>
        void act(() => ctx.invoke('verify', [e.id]), '已重新核验（不会重发）。'),
      );
      actions.append(verify);
    }
    if (actions.childElementCount) wrap.append(actions);
    return wrap;
  }

  function cardNode(card: VideoCard): HTMLElement {
    const wrap = el('details', undefined, 'bw-card') as HTMLDetailsElement;
    if (expanded.has(card.oid)) wrap.open = true;

    const sum = el('summary');
    const main = el('div', null, 'bw-card-main');
    main.append(el('h4', card.title || `作品 ${card.oid}`));
    const tags = el('div', null, 'bw-tags');
    if (card.counts.pending) tags.append(tag(`待回应 ${card.counts.pending}`, 'pending'));
    if (card.counts.reply) tags.append(tag(`收到 ${card.counts.reply}`, 'reply'));
    if (card.counts.sent) tags.append(tag(`已发出 ${card.counts.sent}`, 'sent'));
    main.append(tags);

    const side = el('div', null, 'bw-card-side');
    side.append(el('time', when(card.lastAt)));
    if (card.counts.pending) side.append(el('span', '点开看这一楼', 'bw-open-label'));
    sum.append(main, side);
    wrap.append(sum);

    // 展开时才渲染：卡片可能很多，没必要一次全建。
    // **按线程排**：同一段对话（对方的话 + 我接的那句）挨在一起，不是两类各一堆。
    const body = el('div', null, 'bw-threads');
    let filled = false;
    const fill = () => {
      if (filled) return;
      filled = true;
      if (!card.threads.length) body.append(el('div', '这一楼还没有记录。', 'bw-empty'));
      for (const t of card.threads) {
        const box = el('div', null, 'bw-thread');
        for (const e of t.entries) box.append(eventNode(e, t));
        body.append(box);
      }
      // 「打开原页」放展开后的左下角，一条链接就够，不跟着每条楼层走
      const footer = el('div', null, 'bw-card-footer');
      const href = card.url ?? (card.bvid ? `https://www.bilibili.com/video/${card.bvid}` : null);
      if (href) {
        const a = el('a', '打开原页');
        (a as HTMLAnchorElement).href = href;
        (a as HTMLAnchorElement).target = '_blank';
        (a as HTMLAnchorElement).rel = 'noopener noreferrer';
        footer.append(a);
      }
      body.append(footer);
    };
    if (wrap.open) fill();
    wrap.addEventListener('toggle', () => {
      if (wrap.open) {
        fill();
        expanded.add(card.oid);
      } else {
        expanded.delete(card.oid);
      }
      ctx.memo.set('expanded', [...expanded]);
    });
    wrap.append(body);
    return wrap;
  }

  function renderOverview(snap: TimelineSnapshot): void {
    overview.textContent = '';
    const items: Array<[string, string, boolean]> = [
      ['待回应', String(snap.usage.pending), snap.usage.pending > 0],
      ['今日回复', `${snap.usage.repliesToday}/${snap.usage.repliesLimit}`, false],
      ['今日主动', `${snap.usage.proactiveToday}/${snap.usage.proactiveLimit}`, false],
      ['今日闲逛', `${snap.usage.roamToday}/${snap.usage.roamLimit}`, false],
    ];
    for (const [k, v, warn] of items) {
      const m = el('div', null, 'bw-metric');
      if (warn) m.dataset.tone = 'warn';
      m.append(el('span', k), el('strong', v));
      overview.append(m);
    }
  }

  function renderRoam(snap: TimelineSnapshot): void {
    roam.textContent = '';
    const recent = snap.roamingRecent ?? [];
    roam.append(el('h3', '最近闲逛'));
    if (!recent.length) {
      roam.append(el('p', '还没逛过。开启闲逛后，主会话空闲够久它会自己去看。', 'bw-muted'));
      return;
    }
    for (const r of recent) {
      const status =
        r.status === 'finished' ? '逛完' : r.status === 'skipped' ? '跳过' : r.status === 'expired' ? '超时' : '进行中';
      const row = el('div', null, 'bw-roam-row');
      row.append(
        el('time', when(r.at)),
        el(
          'span',
          `${status}${r.summary ? ` · ${short(r.summary, 160)}` : ''}${
            r.videos.length ? ` · 读了 ${r.videos.join('、')}` : ''
          }`,
        ),
      );
      roam.append(row);
    }
  }

  async function load(): Promise<void> {
    let snap: TimelineSnapshot;
    try {
      snap = await ctx.invoke<TimelineSnapshot>('timeline', [
        { filter, query: search.value, limit: 60 },
      ]);
    } catch (error) {
      list.textContent = '';
      list.append(el('div', `读取失败：${(error as Error).message}`, 'bw-empty'));
      return;
    }

    renderOverview(snap);
    loginBox.update(snap.state);

    if (snap.state.lastError) {
      banner.textContent = `同步有问题：${short(snap.state.lastError, 200)}`;
      banner.dataset.tone = 'bad';
      banner.hidden = false;
    }

    list.textContent = '';
    if (!snap.cards.length) {
      list.append(
        el(
          'div',
          filter === 'pending'
            ? '没有待回应的消息。有人回复你、@ 你，或特别关注发了新作品，会出现在这里。'
            : search.value
              ? `没有匹配「${search.value}」的记录。`
              : '还没有任何互动记录。',
          'bw-empty',
        ),
      );
    } else {
      for (const c of snap.cards) list.append(cardNode(c));
    }
    renderRoam(snap);
  }

  void load();
  ctx.interval(() => void load(), 15_000);
  // 有 cookie 但没核验过：每分钟顺手核一次（只在面板开着时）
  ctx.interval(() => {
    if (loginBox.hasCookie() && !loginBox.lastVerified) void loginBox.check(true);
  }, 60_000);
}

/* ------------------------------------------------------------------ 配置页 */

/** 每个配置项落在哪张卡里。schema 是唯一来源，这里只管分组。 */
function sectionOf(path: string): string {
  const key = path.slice(PREFIX.length);
  if (key === 'enabled' || key === 'cookieSecret') return 'login';
  if (key.startsWith('read.') || key.startsWith('media.') || key.startsWith('asr.')) return 'read';
  if (key.startsWith('monitor.') || key.startsWith('posting.')) return 'social';
  if (key.startsWith('roaming.')) return 'roam';
  if (key.startsWith('focus.')) return 'focus';
  if (key.startsWith('recommend.')) return 'recommend';
  if (key.startsWith('dynamics.')) return 'dynamics';
  return 'advanced';
}

export function mountSettings(ctx: WebUiPanelContext): void {
  const root = ctx.root;
  root.classList.add('bw-desk', 'bw-settings');

  root.append(
    el(
      'p',
      '从上往下填就能用：先登录，再决定要不要自己去看视频、要不要在评论区说话。改动要保存才生效。',
      'bw-summary',
    ),
  );

  const feedback = el('div', null, 'bw-feedback');
  feedback.hidden = true;
  feedback.setAttribute('role', 'status');
  root.append(feedback);

  const savebar = el('div', null, 'bw-savebar');
  const dirtyNote = el('span', '没有未保存的改动', 'bw-muted');
  const saveBtn = el('button', '保存修改');
  const reloadBtn = el('button', '放弃改动');
  savebar.append(saveBtn, reloadBtn, dirtyNote);
  root.append(savebar);

  const loginBox = buildLogin(ctx, () => void reload());
  root.append(loginBox.node);
  // `enabled` / `cookieSecret` 属于"连接"，放在登录卡下面，不单独占一张卡
  const loginFields = el('div');
  loginFields.append(
    el('p', '下面两项控制这个 World 开不开、以及登录凭据存在哪个变量里。', 'bw-section-note'),
  );
  root.append(loginFields);

  const inputs = new Map<string, HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>();
  const dirty = new Set<string>();
  let values: Values = {};

  /* ------------------------------------------------ 闲逛档位状态
   * 档位是**派生状态**，不存进配置：判定逻辑在 `preset.ts`（可离线测试），
   * 这里只负责把结果画成按钮高亮和状态条。
   */
  const presetButtons: Record<string, HTMLButtonElement> = {};
  let customChip: HTMLButtonElement | null = null;
  let presetStatus: HTMLElement | null = null;

  function syncPreset(): void {
    if (!presetStatus) return;
    const key = detectPreset(values, PREFIX);
    for (const [k, b] of Object.entries(presetButtons)) {
      b.setAttribute('aria-pressed', String(k === key));
    }
    customChip?.setAttribute('aria-pressed', String(key === 'custom'));
    const unsaved = [...dirty].some((p) => p.startsWith(`${PREFIX}roaming.`));
    presetStatus.textContent =
      (key === 'custom' ? '当前档位：自定义（手动改过参数）' : `当前档位：${PRESET_LABEL[key]}`) +
      (unsaved ? ' · 有未保存的改动' : '');
  }

  const sections: Record<string, HTMLDetailsElement> = {};
  // **默认全部收起**：点开哪张卡就看哪组，别一进来糊一屏字段。
  const defs: Array<[string, string, string, boolean]> = [
    ['read', '看视频', '清晰度、出图预算、没有字幕时的语音识别。', false],
    ['social', '社交发言', '监听通知、发评开关，以及两条评论之间的最小间隔。', false],
    ['roam', '闲逛（自己去看）', '四档预设 + 逐项微调。关着的时候它不会自己去看。', false],
    ['focus', '特别关注', '某个 UP 主的新作品，以及他作品下值得接的评论。', false],
    ['recommend', '推荐给我', '鱼看到你喜欢的视频时在评论区 @ 你。清单只是参考，次数单独算。', false],
    ['dynamics', '动态', '读/发文字动态，以及空闲时自主发。', false],
    ['advanced', '高级', 'ffmpeg 路径、语音模型细节。一般不用动。', false],
  ];

  function markDirty(path?: string): void {
    if (path) dirty.add(path);
    dirtyNote.textContent = dirty.size ? `${dirty.size} 项未保存` : '没有未保存的改动';
    dirtyNote.className = dirty.size ? 'bw-dirty' : 'bw-muted';
    saveBtn.disabled = dirty.size === 0;
  }

  function applyToInputs(patch: Values): void {
    for (const [path, v] of Object.entries(patch)) {
      const input = inputs.get(path);
      if (!input) continue;
      if (input instanceof HTMLInputElement && input.type === 'checkbox') input.checked = v === true;
      else input.value = String(v ?? '');
      values[path] = v;
    }
  }

  function fieldRow(path: string, prop: Prop): HTMLElement {
    const label = el('label', undefined, 'bw-field');
    const copy = el('span');
    copy.append(el('strong', prop.title));
    if (prop.description) copy.append(el('small', prop.description));

    let control: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
    if ((prop as Prop & { 'x-multiline'?: boolean })['x-multiline']) {
      // 清单这类自由文本要能换行；save() 按 prop.type==='string' 读 value 即可
      const area = el('textarea') as HTMLTextAreaElement;
      area.rows = 5;
      control = area;
    } else if (prop.enum) {
      const select = el('select') as HTMLSelectElement;
      for (const v of prop.enum) {
        const o = el('option', String(v)) as HTMLOptionElement;
        o.value = String(v);
        select.append(o);
      }
      control = select;
    } else {
      const input = el('input') as HTMLInputElement;
      input.type = prop.type === 'boolean' ? 'checkbox' : prop.type === 'integer' ? 'number' : 'text';
      if (prop.minimum !== undefined) input.min = String(prop.minimum);
      if (prop.maximum !== undefined) input.max = String(prop.maximum);
      if (prop.type === 'integer') input.step = '1';
      control = input;
    }
    control.setAttribute('aria-label', prop.title);
    const current = values[path];
    if (control instanceof HTMLInputElement && control.type === 'checkbox') {
      control.checked = current === true;
    } else {
      control.value = current === undefined || current === null ? '' : String(current);
    }
    control.addEventListener(
      'input',
      () => {
        // **同步 values**：档位判定读的是 values 不是 DOM，不同步的话
        // 手动改了参数却仍显示旧档位（也不会自动切到"自定义"）。
        values[path] =
          control instanceof HTMLInputElement && control.type === 'checkbox'
            ? control.checked
            : prop.type === 'integer'
              ? Number(control.value === '' ? 0 : control.value)
              : control.value;
        markDirty(path);
        if (path.startsWith(`${PREFIX}roaming.`)) syncPreset();
        feedback.hidden = true;
      },
      { signal: ctx.signal },
    );
    inputs.set(path, control);
    label.append(copy, control);
    return label;
  }

  /** 四档预设 + 自定义状态：点一档填一组参数，改任意一项自动变成「自定义」。 */
  function presets(): HTMLElement {
    const wrap = el('div', null, 'bw-presets-wrap');
    const grid = el('div', null, 'bw-presets');
    for (const key of Object.keys(ROAMING_PRESETS) as Array<keyof typeof ROAMING_PRESETS>) {
      const preset = ROAMING_PRESETS[key];
      const b = el('button');
      b.append(
        el('strong', PRESET_LABEL[key]),
        el('small', key === 'free' ? '阅读不限轮次' : `${preset.maxDailySessions} 轮/天`),
        el('small', key === 'free' ? '不超时' : `间隔 ${preset.minIntervalMinutes} 分`),
      );
      b.addEventListener(
        'click',
        () => {
          const patch: Values = {
            [`${PREFIX}roaming.enabled`]: true,
            [`${PREFIX}roaming.mode`]: preset.mode,
          };
          for (const [k, v] of Object.entries(preset)) patch[`${PREFIX}roaming.${k}`] = v;
          applyToInputs(patch);
          // 预设里可能带着配置页没有的历史字段（如 maxTextChars），
          // 别把它们算进「N 项未保存」，也别让保存时提交空项。
          for (const p of Object.keys(patch)) if (inputs.has(p)) markDirty(p);
          syncPreset();
          ctx.ui.toast(`「${PRESET_LABEL[key]}」档已填入，点保存生效`);
        },
        { signal: ctx.signal },
      );
      b.setAttribute('aria-pressed', 'false');
      presetButtons[key] = b;
      grid.append(b);
    }

    // 第五格是**只读状态**，不是可点的档位 —— 点它没有任何语义
    const custom = el('button', undefined, 'bw-preset-custom') as HTMLButtonElement;
    custom.append(
      el('strong', '自定义'),
      el('small', '手动改过参数'),
      el('small', '点档位可一键还原'),
    );
    custom.disabled = true;
    custom.title = '改动任何一项参数就自动变成自定义；点左边任意一档可一键还原';
    custom.setAttribute('aria-pressed', 'false');
    customChip = custom;
    grid.append(custom);
    wrap.append(grid);

    presetStatus = el('p', '', 'bw-preset-status');
    wrap.append(presetStatus);
    wrap.append(
      el(
        'p',
        '放养档运行时会忽略「每日轮次 / 每轮视频数 / 单轮时长上限」，改这三项不算改档；其它项一改就变成自定义。',
        'bw-section-note',
      ),
    );
    return wrap;
  }

  for (const [id, title, note, open] of defs) {
    const box = el('details', undefined, 'bw-section') as HTMLDetailsElement;
    box.dataset.section = id;
    box.open = open;
    box.append(el('summary', title));
    if (id === 'roam') box.append(presets());
    box.append(el('p', note, 'bw-section-note'));
    sections[id] = box;
    root.append(box);
  }

  async function reload(): Promise<void> {
    let r: { values?: Values; state?: TimelineSnapshot['state'] } | undefined;
    try {
      r = await ctx.invoke('config');
    } catch (error) {
      feedback.textContent = `读配置失败：${(error as Error).message}`;
      feedback.dataset.tone = 'bad';
      feedback.hidden = false;
      return;
    }
    values = r?.values ?? {};
    inputs.clear();
    for (const box of [...Object.values(sections), loginFields]) {
      for (const row of [...box.querySelectorAll('.bw-field')]) row.remove();
    }
    for (const [path, prop] of Object.entries(BILI_WATCH_CONFIG_GROUP.schema.properties)) {
      const id = sectionOf(path);
      const target = id === 'login' ? loginFields : (sections[id] ?? sections.advanced);
      target.append(fieldRow(path, prop as Prop));
    }
    dirty.clear();
    markDirty();
    // 档位是从值反推的：重载后重新算一次，保存后 / 下次进面板都能回显当前状态
    syncPreset();
    if (r?.state) loginBox.update(r.state);
  }

  async function save(): Promise<void> {
    if (!dirty.size) return;
    const patch: Values = {};
    for (const path of dirty) {
      const prop = BILI_WATCH_CONFIG_GROUP.schema.properties[path] as Prop | undefined;
      const input = inputs.get(path);
      if (!prop || !input) continue;
      if (prop.type === 'boolean') {
        patch[path] = input instanceof HTMLInputElement ? input.checked : false;
      } else if (prop.type === 'integer') {
        patch[path] = Number(input.value === '' ? 0 : input.value);
      } else {
        patch[path] = input.value;
      }
    }
    saveBtn.disabled = true;
    try {
      const message = await saveConfig(ctx, patch);
      feedback.textContent = message || '已保存，即时生效';
      feedback.dataset.tone = 'ok';
      feedback.hidden = false;
      dirty.clear();
      markDirty();
      await reload();
    } catch (error) {
      feedback.textContent = `保存失败：${(error as Error).message}`;
      feedback.dataset.tone = 'bad';
      feedback.hidden = false;
      saveBtn.disabled = false;
    }
  }

  saveBtn.addEventListener('click', () => void save());
  reloadBtn.addEventListener('click', () => void reload());

  void reload();
}

/** 闲逛记录页：全量轮次，分页翻。 */
export function mountRoams(ctx: WebUiPanelContext): void {
  const root = ctx.root;
  root.classList.add('bw-desk', 'bw-roams');

  root.append(
    el(
      'p',
      '它自己去看视频的每一轮：什么时候逛的、看了什么、说了什么、为什么收尾。最近在前。',
      'bw-summary',
    ),
  );

  const info = el('p', '', 'bw-summary');
  const list = el('div', null, 'bw-list');
  const pager = el('div', null, 'bw-pager');
  const prev = el('button', '上一页');
  const next = el('button', '下一页');
  const pageLabel = el('span', '', 'bw-muted');
  pager.append(prev, pageLabel, next);
  root.append(info, list, pager);

  let page = 1;
  let total = 0;
  const pageSize = 20;

  interface RoamItem {
    id: string;
    at: string;
    status: string;
    searches: number;
    summary?: string;
    videos: Array<{ title: string; url?: string; commentsRead: number }>;
  }

  const statusText = (s: string) =>
    s === 'finished' ? '逛完' : s === 'skipped' ? '跳过' : s === 'expired' ? '超时' : s === 'active' ? '进行中' : '等它接';

  async function load(): Promise<void> {
    try {
      const r = await ctx.invoke<{ total: number; items: RoamItem[] }>('roams', [
        { page, pageSize },
      ]);
      total = r.total;
      const pages = Math.max(1, Math.ceil(total / pageSize));
      page = Math.min(page, pages);
      info.textContent = `共 ${total} 轮 · 每页 ${pageSize} 条`;
      pageLabel.textContent = `${page} / ${pages}`;
      prev.disabled = page <= 1;
      next.disabled = page >= pages;

      list.textContent = '';
      if (!r.items.length) {
        list.append(
          el(
            'div',
            '还没有闲逛记录。开启闲逛后，主会话空闲够久它会自己去看，每一轮都会记在这里。',
            'bw-empty',
          ),
        );
        return;
      }
      for (const item of r.items) {
        const card = el('details', null, 'bw-card') as HTMLDetailsElement;
        const sum = el('summary');
        const main = el('div', null, 'bw-card-main');
        main.append(el('h4', `${statusText(item.status)} · ${when(item.at)}`));
        const tags = el('div', null, 'bw-tags');
        tags.append(tag(`看了 ${item.videos.length} 个视频`));
        tags.append(tag(`搜索 ${item.searches} 次`));
        if (item.summary) tags.append(tag('有心得'));
        main.append(tags);
        const side = el('div', null, 'bw-card-side');
        side.append(el('span', '点开看明细', 'bw-open-label'));
        sum.append(main, side);
        card.append(sum);

        const body = el('div', null, 'bw-thread');
        if (item.summary) {
          const row = el('div', null, 'bw-event');
          row.append(el('div', '心得', 'bw-speaker'), el('div', item.summary, 'bw-body'));
          body.append(row);
        }
        if (!item.videos.length) {
          body.append(el('div', '这一轮没读视频。', 'bw-muted'));
        }
        for (const v of item.videos) {
          const row = el('div', null, 'bw-event');
          const line = el('div', null, 'bw-speaker');
          if (v.url) {
            const a = el('a', `《${short(v.title, 60)}》`);
            (a as HTMLAnchorElement).href = v.url;
            (a as HTMLAnchorElement).target = '_blank';
            (a as HTMLAnchorElement).rel = 'noopener noreferrer';
            line.append(a);
          } else {
            line.append(el('span', `《${short(v.title, 60)}》`));
          }
          if (v.commentsRead) line.append(tag(`评论 ${v.commentsRead} 条`));
          row.append(line);
          body.append(row);
        }
        card.append(body);
        list.append(card);
      }
    } catch (error) {
      list.textContent = '';
      list.append(el('div', `读取失败：${(error as Error).message}`, 'bw-empty'));
    }
  }

  prev.addEventListener('click', () => {
    if (page > 1) {
      page -= 1;
      void load();
    }
  });
  next.addEventListener('click', () => {
    if (page * pageSize < total) {
      page += 1;
      void load();
    }
  });

  void load();
  ctx.interval(() => void load(), 60_000);
}

export default {
  panels: {
    desk: { mount: mountDesk },
    settings: { mount: mountSettings },
    roams: { mount: mountRoams },
  },
};
