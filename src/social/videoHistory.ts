/**
 * social/videoHistory.ts —— 「这条视频我碰过没有」。
 *
 * 为什么要单独一个东西：
 *   `bili_roam history` 是按**轮次**排的（回答"我最近逛了什么"）。要回答
 *   "这条视频我碰过没有"就得翻五六轮才找到一条，中间还夹着跳过的轮子。
 *   这里把同一份 state 反过来索引：**一条视频一行** ——
 *   看过没、什么时候、哪一轮、发过哪几条什么状态、写过没有。
 *
 * 三条来自她的实测反馈（2026-11-07）：
 *   1. **评论不要截断**：她发的都短，截了就认不出是自己哪句。
 *   2. **草稿不是"说过的话"**：全塞进「写过」会显得她话多 —— 所以心得和草稿
 *      分成 `notes` / `drafts` 两类，草稿明确标发没发出去。
 *   3. 真正占地方的是心得：只给最近 1 篇全文，更早的留首句。
 *
 * 数据全部来自本地 state，不联网。
 */
import type { SocialStore } from './store.ts';
import { commentUrl } from '../webui/data.ts';

const clean = (v: unknown, max: number) => String(v ?? '').replace(/<[^>]*>/g, '').slice(0, max);

/** 把 ISO 时间换成「11-07 13:50」这种能一眼看的本地时间。 */
function fmtAt(iso: string | undefined, tz: string): string | undefined {
  if (!iso) return undefined;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  try {
    // 用 formatToParts 自己拼「11-07 13:50」：不同 ICU 版本对 sv-SE/en-CA
    // 的日期顺序处理不一致（实测这里给的是 07/11），拼死的格式才稳定。
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(new Date(t));
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
    return `${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`;
  } catch {
    return iso;
  }
}

/** 首句：到第一个句号/问号/感叹号/换行为止，最多 60 字。 */
function firstSentence(text: string): string {
  const s = String(text ?? '').trim();
  if (!s) return '';
  const m = s.match(/^[^。！？\n]{1,60}/);
  const head = (m?.[0] ?? s.slice(0, 60)).trim();
  return head.length < s.length ? `${head}…` : head;
}

/** 合格的切口：句末强标点，或逗号/顿号这类弱停顿 —— 切在标点后都是通顺的。 */
const ANY_BREAK = /[。！？!?…\n，,、；;：:]/g;

/** 在 [from, from+max) 里找第一个切口，返回其**之后**的下标；找不到 -1。 */
function breakAfter(s: string, from: number, max: number): number {
  const m = [...s.slice(from, from + max).matchAll(ANY_BREAK)];
  if (!m.length) return -1;
  return from + m[0].index + m[0][0].length;
}

/** 在 [from-back, from) 里找最后一个切口，返回其**之后**的下标；找不到 -1。 */
function breakBefore(s: string, from: number, back: number): number {
  const start = Math.max(0, from - back);
  const m = [...s.slice(start, from).matchAll(ANY_BREAK)];
  if (!m.length) return -1;
  return start + m[m.length - 1].index + m[m.length - 1][0].length;
}

/**
 * 长文本折叠：**头留七成、尾留三成**，中间标明省略了多少字。
 *
 * 比硬夹断好的地方（她 2026-11-07 定的规矩）：
 *   - 认出是哪句靠**开头**，所以头占大头；
 *   - 结尾常是梗/态度，尾那三成不能砍没；
 *   - **宁可少截**：长度没超阈值就原样返回，大多数评论根本不该被碰；
 *   - 真要截，头尾都**落在标点后**（句号找不到就退到逗号），不许把话说一半 ——
 *     截出来人话不通比多花几个字更糟。
 *
 * @param limit     折叠后的目标长度（约数，按切口会略超）
 * @param threshold 超过这个长度才折叠
 */
export function foldText(
  raw: unknown,
  limit = 280,
  threshold = 300,
): { text: string; omitted: number } {
  const text = String(raw ?? '').replace(/<[^>]*>/g, '');
  const len = [...text].length;
  if (len <= threshold) return { text, omitted: 0 };

  const headLen = Math.floor(limit * 0.7);
  const tailLen = limit - headLen;

  // 头：优先向后 40 字内找切口（比目标略长没关系），不行就向前缩，再不行硬切
  let headEnd = headLen;
  const fwd = breakAfter(text, headLen, 40);
  if (fwd > 0) headEnd = fwd;
  else {
    const back = breakBefore(text, headLen, 40);
    if (back >= 40) headEnd = back;
  }
  const head = text.slice(0, headEnd);

  // 尾：优先向前 40 字内找切口（尾巴从句子开头开始），不行就向后推，再不行硬切
  let tailStart = len - tailLen;
  const back = breakBefore(text, tailStart, 40);
  if (back > 0 && tailStart - back <= 40) tailStart = back;
  else {
    const fwd = breakAfter(text, tailStart, 40);
    if (fwd > 0) tailStart = fwd;
  }
  let tail = text.slice(tailStart);
  if ([...tail].length < 20) tail = text.slice(-20); // 尾巴别砍没了

  const omitted = len - [...head].length - [...tail].length;
  return { text: `${head}…〔中间省略 ${omitted} 字〕…${tail}`, omitted };
}


/**
 * 把一个视频标识拆成 `{ bvid }` 或 `{ aid }`。
 *
 * 她习惯直接给 BV 号，但链接、av 号、裸 aid 也都该认 ——
 * 认不出来就返回 null，由调用方按"原样字符串"再比对一次。
 */
export function parseVideoRef(input: string): { bvid?: string; aid?: string } | null {
  const s = String(input ?? '').trim();
  if (!s) return null;
  const bv = s.match(/BV[0-9A-Za-z]{10}/);
  if (bv) return { bvid: bv[0] };
  const av = s.match(/(?:^|[^0-9a-zA-Z])av(\d{3,20})/i);
  if (av) return { aid: av[1] };
  const oid = s.match(/[?&](?:oid|aid)=(\d{3,20})/);
  if (oid) return { aid: oid[1] };
  if (/^\d{3,20}$/.test(s)) return { aid: s };
  return null;
}

/**
 * 心得里有没有提到这条视频，返回提到的那一小段。
 *
 * BV 号 > 标题前 8 字：只匹配短标题容易撞（"【中文】"这种开头满地都是）。
 */
function mentionSnippet(bvid: string, title: string, text: string): string | undefined {
  if (!text) return undefined;
  const keys = [bvid, title.slice(0, 8)].filter((k) => k && k.length >= 8);
  for (const key of keys) {
    const at = text.indexOf(key);
    if (at >= 0) {
      const start = Math.max(0, at - 30);
      const end = Math.min(text.length, at + key.length + 30);
      return text.slice(start, end).replace(/\s+/g, ' ').trim();
    }
  }
  return undefined;
}

interface Note {
  at: string;
  round: number;
  excerpt: string;
  firstLine: string;
  summary?: string;
}
interface Draft {
  at: string;
  sent: boolean;
  text: string;
}
interface Row {
  aid: string;
  bvid: string;
  title: string;
  url: string;
  times: number;
  firstAt: string;
  lastAt: string;
  rounds: number[];
  commentsRead: number;
  said: Array<{ at: string; kind: string; status: string; text: string; url?: string }>;
  notes: Note[];
  drafts: Draft[];
}

const statusLabel: Record<string, string> = {
  sent: '已发出',
  rejected: '被拒',
  unknown: '未确认',
  sending: '发送中',
};

const kindLabel: Record<string, string> = {
  reply: '回别人',
  proactive: '主动评论',
  recommend: '推荐给主人',
  focus: '特别关注',
};

function summarize(row: Row, tz: string): string {
  const parts: string[] = [];
  parts.push(
    row.times
      ? `看过 ${row.times} 次（最近 ${fmtAt(row.lastAt, tz)}，第 ${row.rounds.join('/')} 轮）`
      : '没在闲逛里看过',
  );
  if (row.said.length) {
    const sent = row.said.filter((s) => s.status === 'sent').length;
    const bad = row.said.filter((s) => s.status === 'rejected').length;
    const pend = row.said.filter((s) => s.status === 'unknown' || s.status === 'sending').length;
    parts.push(
      `发过 ${row.said.length} 条（已发出 ${sent}` +
        `${pend ? `，未确认 ${pend}` : ''}${bad ? `，被拒 ${bad}` : ''}）`,
    );
  } else {
    parts.push('没发过评论');
  }
  if (row.notes.length) parts.push(`心得提过 ${row.notes.length} 轮`);
  // 只数"没发出去的"草稿：已经发出去的正文就是 said 里那几条，
  // 再算一次等于把同一句话数两遍，看着就像她话特别多。
  const unsent = row.drafts.filter((d) => !d.sent).length;
  if (unsent) parts.push(`另有 ${unsent} 条草稿没发出去`);
  return `${parts.join('；')}。`;
}

/**
 * @param opts.video BV 号 / av 号 / 链接 / aid；给了就返回单条档案。
 * @param opts.limit 没给 video 时，列表返回多少条（默认 15，最多 40）。
 */
export function videoHistory(
  store: SocialStore,
  opts: { video?: unknown; limit?: unknown; saidLimit?: unknown; timezone?: unknown } = {},
): Record<string, unknown> {
  const tz = String(opts.timezone || 'Asia/Shanghai');
  // 一条视频下她可能发过几十条：最近的给全文，更早的给首句摘要行。
  // 全量塞会爆上下文；截太狠又认不出是哪句 —— 预算放在条数上，不在单条上。
  const saidLimit = Math.max(1, Math.min(40, Number(opts.saidLimit) || 8));
  const asked = String(opts.video ?? '').trim();
  const limit = Math.max(1, Math.min(40, Number(opts.limit) || 15));
  const rounds = store.roams().filter((r) => r.status !== 'offered');
  const outbox = store.outbox();
  const briefs = store.briefs();

  const rows = new Map<string, Row>();
  const rowOf = (aid: string, bvid = '', title = '', url = '') => {
    const key = aid || bvid;
    let row = rows.get(key);
    if (!row) {
      row = {
        aid,
        bvid,
        title,
        url,
        times: 0,
        firstAt: '',
        lastAt: '',
        rounds: [],
        commentsRead: 0,
        said: [],
        notes: [],
        drafts: [],
      };
      rows.set(key, row);
    }
    if (bvid) row.bvid = bvid;
    if (title) row.title = title;
    if (url) row.url = url;
    return row;
  };

  // ① 逛过的轮次：谁在哪一轮被看到、读了几条评论、心得里提没提它
  for (let i = 0; i < rounds.length; i++) {
    const r = rounds[i];
    const seq = i + 1;
    const summary = String(r.summary ?? '');
    for (const v of r.videos ?? []) {
      if (!v.aid && !v.id) continue;
      const row = rowOf(v.aid, v.id, v.title, v.url);
      row.times += 1;
      row.rounds.push(seq);
      row.commentsRead += v.commentsRead ?? 0;
      if (!row.firstAt || r.createdAt < row.firstAt) row.firstAt = r.createdAt;
      if (!row.lastAt || r.createdAt > row.lastAt) row.lastAt = r.createdAt;
      const hit = mentionSnippet(v.id, v.title, summary);
      if (hit) {
        row.notes.push({
          at: r.createdAt,
          round: seq,
          excerpt: hit,
          firstLine: firstSentence(summary),
          summary,
        });
      }
    }
  }

  // ② 发过的评论（可能发在闲逛外，比如特别关注 / 推荐里，也得能查到）
  for (const o of outbox) {
    const row = rowOf(o.target.oid);
    if (!row.title) {
      const meta = store.video(o.target.oid);
      if (meta) {
        row.bvid = row.bvid || meta.id;
        row.title = meta.title;
        row.url = row.url || meta.url;
      }
    }
    const link = commentUrl(o.target, o.receiptId);
    row.said.push({
      at: o.createdAt,
      kind: o.kind ?? 'proactive',
      status: o.status,
      // 不截断：她发的都短，截了反而认不出是自己哪一句（B 站上限 1000）
      text: clean(o.text, 1000),
      ...(link ? { url: link } : {}),
    });
  }

  // ③ prepare 过的草稿（单独一类：草稿不是"说过的话"）
  for (const b of briefs) {
    const row = rows.get(b.target.oid);
    if (!row || !b.draft) continue;
    const head = clean(b.draft, 20);
    row.drafts.push({
      at: b.createdAt,
      sent: row.said.some((s) => s.text.startsWith(head)),
      text: clean(b.draft, 300),
    });
  }

  // 补标题：videos 表里有的就用它（比 roam 记录更全）
  for (const row of rows.values()) {
    if (!row.title) {
      const meta = store.video(row.aid);
      if (meta) {
        row.bvid = row.bvid || meta.id;
        row.title = meta.title;
        row.url = row.url || meta.url;
      }
    }
    row.said.sort((a, b) => a.at.localeCompare(b.at));
    row.notes.sort((a, b) => a.at.localeCompare(b.at));
    row.drafts.sort((a, b) => a.at.localeCompare(b.at));
  }

  const brief = (row: Row) => {
    const last = row.said.at(-1);
    return {
      bvid: row.bvid,
      aid: row.aid,
      title: clean(row.title, 60),
      url: row.url,
      lastAt: fmtAt(row.lastAt, tz),
      watched: row.times,
      rounds: row.rounds,
      said: row.said.length,
      notes: row.notes.length,
      drafts: row.drafts.length,
      // 列表也要能一眼看出"我最近在这条下说过什么"（她 2026-11-07 明确要的）
      ...(last
        ? { lastSaid: `${statusLabel[last.status] ?? last.status}·${kindLabel[last.kind] ?? last.kind}：${firstSentence(last.text)}` }
        : {}),
    };
  };

  const recent = (n: number) =>
    [...rows.values()]
      .sort((a, b) => (b.lastAt || '').localeCompare(a.lastAt || ''))
      .slice(0, n)
      .map(brief);

  // ── 指定了视频：返回这一条的完整档案 ───────────────────────────────
  if (asked) {
    const ref = parseVideoRef(asked);
    const hit = [...rows.values()].find(
      (r) =>
        (ref?.bvid && r.bvid === ref.bvid) ||
        (ref?.aid && r.aid === ref.aid) ||
        (!ref && (r.bvid === asked || r.aid === asked)),
    );
    if (!hit) {
      const meta = store
        .videos()
        .find((v) => (ref?.bvid && v.id === ref.bvid) || (ref?.aid && v.aid === ref.aid));
      return {
        video: asked,
        found: false,
        ...(meta
          ? {
              known: { bvid: meta.id, aid: meta.aid, title: meta.title, url: meta.url },
              verdict:
                '本地有这条视频的内容记录（probe 过或看过分镜），但没在闲逛里逛过、也没发过评论。',
            }
          : { verdict: '本地没有这条视频的记录：没看过、没发过、没写过。' }),
        // 查不到也别只回一句"没有"：直接列几条最近碰过的，让她挑着问
        recent: recent(5),
        note: '想看内容先用 video_probe 或 video_storyboard；也可以从 recent 里挑一条再问。',
      };
    }

    // 心得只给最近 1 篇全文，更早的只留首句 —— 心得才是真正占地方的地方
    const notes = hit.notes.map((n, i) => {
      const isLatest = i === hit.notes.length - 1;
      return {
        round: n.round,
        at: fmtAt(n.at, tz),
        // 心得全文同样超限才折（>340 折到约 320，首尾保留），不超就是原文
        ...(isLatest
          ? { summary: foldText(n.summary, 320, 340).text, excerpt: n.excerpt }
          : { firstLine: n.firstLine }),
      };
    });

    return {
      found: true,
      video: { bvid: hit.bvid, aid: hit.aid, title: hit.title, url: hit.url },
      watched: {
        times: hit.times,
        firstAt: fmtAt(hit.firstAt, tz),
        lastAt: fmtAt(hit.lastAt, tz),
        rounds: hit.rounds,
        commentsRead: hit.commentsRead,
      },
      said: hit.said.slice(-saidLimit).map((s) => {
        const f = foldText(s.text);
        return {
          at: fmtAt(s.at, tz),
          kind: s.kind,
          kindLabel: kindLabel[s.kind] ?? s.kind,
          status: s.status,
          statusLabel: statusLabel[s.status] ?? s.status,
          text: f.text,
          ...(f.omitted ? { omitted: f.omitted, fullLength: [...s.text].length } : {}),
          ...(s.url ? { url: s.url } : {}),
        };
      }),
      // 预算外的更早条目：一行一条（首句），要全文再传 saidLimit
      ...(hit.said.length > saidLimit
        ? {
            saidOmitted: hit.said.length - saidLimit,
            saidEarlier: hit.said.slice(0, hit.said.length - saidLimit).map((s) => ({
              at: fmtAt(s.at, tz),
              status: s.status,
              statusLabel: statusLabel[s.status] ?? s.status,
              text: firstSentence(s.text) || clean(s.text, 40),
            })),
          }
        : {}),
      notes,
      // 只列没发出去的草稿；已发的正文已经在上面的 said 里了，不重复
      drafts: hit.drafts
        .filter((d) => !d.sent)
        .map((d) => {
          const f = foldText(d.text, 200, 220);
          return {
            at: fmtAt(d.at, tz),
            statusLabel: '只是草稿（没发）',
            text: f.text,
          };
        }),
      verdict: summarize(hit, tz),
      note:
        'said 是你真的发出去的评论：最近 ' + saidLimit + ' 条给全文，超长的首尾保留、中间标了省略多少字' +
        '（omitted），更早的在 saidEarlier（首句）；要更多传 saidLimit。' +
        'notes 是心得里**点名**提到这条视频的轮次，只有最近 1 篇给全文；' +
        'drafts 只列**没发出去**的草稿。',
    };
  }

  // ── 没指定：最近碰过的视频，一条一行（按最近时间倒序） ─────────────
  return {
    videos: recent(limit),
    note:
      '一条视频一行，按最近碰过的时间倒序，不在轮次里翻。' +
      '填 video（BV 号 / av 号 / 链接）可以看单条的完整档案：发过哪几条、什么状态、写过哪儿。',
  };
}
