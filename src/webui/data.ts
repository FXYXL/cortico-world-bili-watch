/**
 * webui/data.ts — 自定义前端要的数据接口（服务端）。
 *
 * ## 为什么面板要有自己的数据面
 *
 * Core 内置渲染（`storage`）只能报"条数/体积"，做不出时间线：
 * 按视频折叠、展开看**对话线程**、筛选、搜索 —— 那是结构化的交互数据，
 * 必须由 World 自己提供一个 JSON 接口。
 *
 * 所以：**服务端算好、前端只摆**。前端不做业务判断（谁是待回应、哪条已发出），
 * 免得"界面上说的"和"实际记录的"两套逻辑慢慢漂移。
 *
 * ## 线程（一一对应的关键）
 *
 * 卡片里**不按事件类型排**（先一堆"别人说的"、再一堆"我说的"），
 * 而是按**楼层线程**排：
 *
 *   - 回复线程：`target.root !== '0'` → 线程键就是 root，
 *     "别人回复我"和"我接的那句"落进同一条线程，按时间正序串起来。
 *   - 我自己发的新评论：`root === '0'` → 线程键用**回执编号**（receiptId）。
 *     之后有人回复它，通知里的 root 恰好就是这个编号 → 自动归入同一线程。
 *
 * 闲逛事件**不进卡片**：那是阅读行为不是对话，最近闲逛/闲逛记录页里有更全的。
 */

import type { InboxItem, SendRecord } from '../core/types.ts';
import type { RoamSession } from '../social/roaming.ts';
import type { SocialStore } from '../social/store.ts';

export type TimelineFilter = 'all' | 'pending' | 'sent';

export interface TimelineEvent {
  /** `incoming` 别人说的；`outgoing` 我说的。 */
  direction: 'incoming' | 'outgoing';
  /**
   * 一眼能看懂的种类文字：「收到回复」「被@」「主动评论」「通知回复」「主动接楼」。
   * 照搬 interactions 的 kind —— 渲染时直接摆出来，不用前端再猜。
   */
  label: string;
  id: string;
  /** 统一毫秒（数据面换算好；前端 `new Date(at)` 就能用，**不要再乘 1000**）。 */
  at: number;
  author: string;
  text: string;
  /** 发送记录的状态；`incoming` 没有这个字段。 */
  status?: SendRecord['status'];
  visibility?: string;
  /** 楼层的 target；引用块的去重判断要用 `parent`。 */
  target?: { oid: string; root: string; parent: string };
  url?: string;
  /** 这条是不是"我现在该处理的"。 */
  pending?: boolean;
  /**
   * 我接楼时，被接的那句原话（`store.comment(target)`）。
   * **渲染时要做去重**：如果线程里已经有这条原话（incoming 且 parent 相同），
   * 就不再显示引用块 —— 否则同一句话出现两遍。
   */
  quote?: { author: string; text: string; target: { parent: string } };
  /** 定位到这条评论的站内深链（带 comment_root_id / #reply）。 */
  href?: string;
}

/**
 * 评论深链：带 `comment_root_id` / `comment_secondary_id` / `#reply<id>`，
 * 打开时页面会自动滚到那条评论 —— 面板里"定位"按钮就用它。
 *
 * 视频用 `av<aid>`（评论接口的 oid 就是 aid）；动态用 `t.bilibili.com/<id>`。
 * 自己发的新评论 root 是 '0'，锚点用回执编号。
 */
export function commentUrl(
  t: { oid: string; type: number; root: string; parent: string },
  receiptId?: string,
): string | undefined {
  const parent = receiptId ?? t.parent;
  if (!/^\d+$/.test(parent ?? '') || parent === '0') return undefined;
  const root = t.root !== '0' ? t.root : parent;
  let base: string;
  if (t.type === 1) base = `https://www.bilibili.com/video/av${t.oid}/`;
  else if (t.type === 11 || t.type === 17) base = `https://t.bilibili.com/${t.oid}`;
  else return undefined;
  try {
    const u = new URL(base);
    u.searchParams.set('comment_root_id', root);
    u.searchParams.set('comment_secondary_id', parent);
    u.hash = `reply${parent}`;
    return u.href;
  } catch {
    return undefined;
  }
}

/** 一条对话线程：同一层楼里的来往，按时间正序。 */
export interface TimelineThread {
  key: string;
  entries: TimelineEvent[];
}

export interface VideoCard {
  oid: string;
  title: string;
  /** BV 号（能构造链接）。 */
  bvid?: string;
  url?: string;
  threads: TimelineThread[];
  counts: { reply: number; sent: number; pending: number };
  /** 最近一次互动的时间（毫秒），排序用。 */
  lastAt: number;
}

export interface TimelineSnapshot {
  cards: VideoCard[];
  /** 总数（不只是本页）。 */
  total: number;
  /** 今日 / 限额，前端显示徽章。 */
  usage: {
    pending: number;
    sentToday: number;
    sentLimit: number;
    roamToday: number;
    roamLimit: number;
    repliesToday: number;
    repliesLimit: number;
    proactiveToday: number;
    proactiveLimit: number;
  };
  /** 状态灯需要的字段。 */
  state: {
    login: boolean;
    /** 有 cookie ≠ 能用：这里是「已过 nav 核验」。 */
    verified?: boolean;
    account: string | null;
    accountId?: string | null;
    monitor: boolean;
    lastError: string | null;
    lastPollAt: string | null;
    posting: boolean;
    transport: string;
    roaming: boolean;
    roamingActive: string | null;
    /** 特别关注一句话摘要（未开启时是"未开启"）。 */
    focus?: string;
    /** 动态读/发摘要。 */
    dynamics?: string;
    /** 当前写登录的变量名（登录卡 title 用）。 */
    cookieSecret?: string;
  };
  /** 关联的最近闲逛轮次（面板底部用）。 */
  roamingRecent: Array<{
    id: string;
    at: string;
    status: string;
    summary?: string;
    videos: string[];
  }>;
}

/**
 * 线程键：同一段对话的"锚点"。
 * 回复线程锚在 root 楼；我发的新评论锚在自己的回执编号上 ——
 * 这样别人回复我那条评论时（通知的 root = 我的回执），自动归入同一线程。
 */
function threadKeyOf(t: { root: string }, receiptId: string | undefined, fallbackId: string): string {
  return t.root !== '0' ? `r:${t.root}` : receiptId ? `r:${receiptId}` : `x:${fallbackId}`;
}

/** 把"楼层 → 视频"这张表建起来。**这是把消息变作品卡的关键一步**。 */
export function buildTimeline(
  store: SocialStore,
  o: {
    filter?: TimelineFilter;
    query?: string;
    limit?: number;
    usage: TimelineSnapshot['usage'];
    state: TimelineSnapshot['state'];
    roamingRecent: RoamSession[];
  },
): TimelineSnapshot {
  const limit = Math.max(1, Math.min(200, o.limit ?? 40));
  const filter = o.filter ?? 'all';
  const q = String(o.query ?? '').trim().toLowerCase();

  // oid → 卡片；(oid + 线程键) → 线程
  const byOid = new Map<string, VideoCard>();
  const byThread = new Map<string, TimelineThread>();

  const cardOf = (oid: string): VideoCard => {
    let c = byOid.get(oid);
    if (!c) {
      const v = store.video(oid);
      c = {
        oid,
        title: (v as any)?.title ?? `作品 ${oid}`,
        ...(v && /^BV[0-9A-Za-z]{10}$/.test(String((v as any).id ?? '')) ? { bvid: String((v as any).id) } : {}),
        ...(v?.url ? { url: (v as any).url } : {}),
        threads: [],
        counts: { reply: 0, sent: 0, pending: 0 },
        lastAt: 0,
      };
      byOid.set(oid, c);
    }
    return c;
  };

  const push = (oid: string, threadKey: string, e: TimelineEvent): void => {
    const c = cardOf(oid);
    const tk = `${oid}:${threadKey}`;
    let thread = byThread.get(tk);
    if (!thread) {
      thread = { key: threadKey, entries: [] };
      byThread.set(tk, thread);
      c.threads.push(thread);
    }
    thread.entries.push(e);
    if (e.direction === 'incoming') {
      c.counts.reply += 1;
      if (e.pending) c.counts.pending += 1;
    } else {
      c.counts.sent += 1;
    }
    if (e.at > c.lastAt) c.lastAt = e.at;
  };

  // ① 通知（别人回复我 / @ 我 / 主人作品下的机会）—— occurredAt 是**秒**，×1000 成毫秒
  for (const i of store.inbox() as InboxItem[]) {
    const target = i.target;
    push(target.oid, threadKeyOf(target, undefined, i.id), {
      direction: 'incoming',
      label: i.notificationType === 'mention' ? '被@' : '收到回复',
      id: i.id,
      at: i.occurredAt * 1000,
      author: i.author,
      text: i.text,
      target: { oid: target.oid, root: target.root, parent: target.parent },
      pending: i.status === 'pending',
      ...(i.url ? { url: i.url } : {}),
      href: commentUrl(target),
    });
  }

  // ② 我发出的评论：挂进它所属的线程（接楼 → 对方那层；新评论 → 自己的回执）
  for (const r of store.outbox() as SendRecord[]) {
    const target = r.target;
    const cached = target.parent !== '0' ? store.comment(target) : undefined;
    push(target.oid, threadKeyOf(target, r.receiptId, r.id), {
      direction: 'outgoing',
      label: target.parent === '0' ? '主动评论' : r.inboxId ? '通知回复' : '主动接楼',
      id: r.id,
      at: Date.parse(r.createdAt) || 0,
      author: '我',
      text: r.text,
      status: r.status,
      ...(r.visibility ? { visibility: r.visibility.status } : {}),
      target: { oid: target.oid, root: target.root, parent: target.parent },
      href: commentUrl(target, r.receiptId),
      ...(cached
        ? {
            quote: {
              author: String(cached.author || ''),
              text: String(cached.text || ''),
              target: { parent: target.parent },
            },
          }
        : {}),
    });
  }

  // 排序（照搬参考实现的三层排序）：
  // ① 线程内按时间正序 —— **必须有这一步**：entries 是"先全部 inbox、再全部 outbox"
  //   塞进去的，不排序就会"对方的话一堆、我的话一堆"，对话对不上。
  // ② 线程按最近一条倒序；③ 卡片按最近互动倒序。
  const cards = [...byOid.values()].map((c) => {
    for (const t of c.threads) t.entries.sort((a, b) => a.at - b.at);
    c.threads.sort(
      (a, b) =>
        Math.max(...b.entries.map((e) => e.at)) - Math.max(...a.entries.map((e) => e.at)),
    );
    return c;
  });
  cards.sort((a, b) => b.lastAt - a.lastAt);

  // 筛选
  let shown = cards;
  if (filter === 'pending') shown = cards.filter((c) => c.counts.pending > 0);
  else if (filter === 'sent') shown = cards.filter((c) => c.counts.sent > 0);

  // 搜索：标题、作者、正文、原话都能命中
  if (q) {
    shown = shown.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.oid.includes(q) ||
        c.threads.some((t) =>
          t.entries.some(
            (e) => e.author.toLowerCase().includes(q) || e.text.toLowerCase().includes(q),
          ),
        ),
    );
  }

  return {
    cards: shown.slice(0, limit),
    total: shown.length,
    usage: o.usage,
    state: o.state,
    roamingRecent: (o.roamingRecent ?? []).slice(-5).reverse().map((r) => ({
      id: r.id,
      at: r.completedAt ?? r.createdAt,
      status: r.status,
      ...(r.summary ? { summary: r.summary } : {}),
      videos: (r.videos ?? []).map((v) => v.title).slice(-5),
    })),
  };
}
