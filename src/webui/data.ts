/**
 * webui/data.ts — 自定义前端要的数据接口（服务端）。
 *
 * ## 为什么面板要有自己的数据面
 *
 * Core 内置渲染（`storage`）只能报"条数/体积"，做不出时间线：
 * 按视频折叠、展开看楼层串联、筛选、搜索 —— 那是**结构化的交互数据**，
 * 必须由 World 自己提供一个 JSON 接口。
 *
 * 所以：**服务端算好、前端只摆**。前端不做业务判断（谁是待回应、哪条已发出），
 * 免得"界面上说的"和"实际记录的"两套逻辑慢慢漂移。
 *
 * ## 数据形状的约定
 *
 * 每条 `TimelineItem` 是**一张视频卡**：
 *   - `videos`：这次互动围绕的作品
 *   - `events`：按时间倒序的楼层事件（收到回复 / 我发的评论 / 闲逛读过）
 *   - `counts`：四类计数（待回应 / 已发出 / 闲逛 / 全部），给筛选按钮用
 *
 * 一个视频可能既有"别人回复我"又有"我主动评论"——它们按视频聚在一张卡上，
 * 这正是社交视窗那个界面的核心：**不按消息排，按作品排**。
 */

import type { InboxItem, SendRecord } from '../core/types.ts';
import type { RoamSession } from '../social/roaming.ts';
import type { SocialStore } from '../social/store.ts';

export type TimelineFilter = 'all' | 'pending' | 'sent' | 'roam';

export interface TimelineEvent {
  /** `reply` 别人回复我；`sent` 我发的；`roam` 闲逛读过。 */
  kind: 'reply' | 'sent' | 'roam';
  id: string;
  at: string | number;
  author: string;
  text: string;
  /** 发送记录的状态；`reply`/`roam` 没有这个字段。 */
  status?: SendRecord['status'];
  visibility?: string;
  /** 楼层的 target，前端用来显示"第几楼"。 */
  target?: { oid: string; root: string };
  url?: string;
  /** 这条是不是"我现在该处理的"。 */
  pending?: boolean;
}

export interface VideoCard {
  oid: string;
  title: string;
  /** BV 号（能构造链接）。 */
  bvid?: string;
  url?: string;
  events: TimelineEvent[];
  counts: { reply: number; sent: number; roam: number; pending: number };
  /** 最近一次互动的时间，排序用。 */
  lastAt: string | number;
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
  };
  /** 状态灯需要的字段。 */
  state: {
    login: boolean;
    account: string | null;
    monitor: boolean;
    lastError: string | null;
    lastPollAt: string | null;
    posting: boolean;
    transport: string;
    roaming: boolean;
    roamingActive: string | null;
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

  // oid → 卡片
  const byOid = new Map<string, VideoCard>();

  const cardOf = (oid: string): VideoCard => {
    let c = byOid.get(oid);
    if (!c) {
      const v = store.video(oid);
      c = {
        oid,
        title: (v as any)?.title ?? `作品 ${oid}`,
        ...(v && /^BV[0-9A-Za-z]{10}$/.test(String((v as any).id ?? '')) ? { bvid: String((v as any).id) } : {}),
        ...(v?.url ? { url: (v as any).url } : {}),
        events: [],
        counts: { reply: 0, sent: 0, roam: 0, pending: 0 },
        lastAt: 0,
      };
      byOid.set(oid, c);
    }
    return c;
  };

  const push = (oid: string, e: TimelineEvent) => {
    const c = cardOf(oid);
    c.events.push(e);
    if (e.kind === 'reply') {
      c.counts.reply += 1;
      if (e.pending) c.counts.pending += 1;
    } else if (e.kind === 'sent') {
      c.counts.sent += 1;
    }
    const t = typeof e.at === 'number' ? e.at : Date.parse(String(e.at)) || 0;
    if (t > (typeof c.lastAt === 'number' ? c.lastAt : 0)) c.lastAt = t;
  };

  // ① 通知（别人回复我）
  for (const i of store.inbox() as InboxItem[]) {
    push(i.target.oid, {
      kind: 'reply',
      id: i.id,
      at: i.occurredAt,
      author: i.author,
      text: i.text,
      target: { oid: i.target.oid, root: i.target.root },
      pending: i.status === 'pending',
      ...(i.url ? { url: i.url } : {}),
    });
  }

  // ② 我发出的评论
  for (const r of store.outbox() as SendRecord[]) {
    push(r.target.oid, {
      kind: 'sent',
      id: r.id,
      at: r.createdAt,
      author: '我',
      text: r.text,
      status: r.status,
      ...(r.visibility ? { visibility: r.visibility.status } : {}),
      target: { oid: r.target.oid, root: r.target.root },
    });
  }

  // ③ 闲逛读过的视频（没有楼层，但要让主人看到"这轮看了什么"）
  for (const r of store.roams() as RoamSession[]) {
    for (const v of r.videos ?? []) {
      push(v.aid, {
        kind: 'roam',
        id: `${r.id}:${v.aid}`,
        at: r.completedAt ?? r.createdAt,
        author: '闲逛',
        text: `读了《${v.title}》${v.commentsRead ? `，看了 ${v.commentsRead} 条评论` : ''}`,
      });
    }
  }

  // 排序：最近的在前；同一作品内部按时间正序（像聊天记录）
  let cards = [...byOid.values()].map((c) => ({
    ...c,
    events: c.events.slice().sort((a, b) => {
      const x = typeof a.at === 'number' ? a.at : Date.parse(String(a.at)) || 0;
      const y = typeof b.at === 'number' ? b.at : Date.parse(String(b.at)) || 0;
      return x - y;
    }),
  }));
  cards.sort((a, b) => {
    const x = typeof a.lastAt === 'number' ? a.lastAt : Date.parse(String(a.lastAt)) || 0;
    const y = typeof b.lastAt === 'number' ? b.lastAt : Date.parse(String(b.lastAt)) || 0;
    return y - x;
  });

  // 筛选
  if (filter === 'pending') cards = cards.filter((c) => c.counts.pending > 0);
  else if (filter === 'sent') cards = cards.filter((c) => c.counts.sent > 0);
  else if (filter === 'roam') cards = cards.filter((c) => c.counts.roam > 0);

  // 搜索：标题、作者、正文都能命中
  if (q) {
    cards = cards.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.oid.includes(q) ||
        c.events.some((e) => e.author.toLowerCase().includes(q) || e.text.toLowerCase().includes(q)),
    );
  }

  const total = cards.length;
  return {
    cards: cards.slice(0, limit),
    total,
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
