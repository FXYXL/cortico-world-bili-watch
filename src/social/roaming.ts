/**
 * social/roaming.ts — 闲逛（自主去看 B 站）。
 *
 * 从社交视窗的 `roaming.ts`（307 行）重写。**重写的部分只有一个：平台维度。**
 * 其它逻辑 —— 预算、超时、让位、配额 —— **一条都没改**，因为它们都是精心设计的。
 *
 * ## 这个文件存在的理由
 *
 * 用户说得很直接：「不然她自己不会去看的，难道每次要我和她说，你该去看 B 站了吗？」
 *
 * 所以这里做的是**投递机会**：主会话空闲够久 → 生成一个"闲逛机会" → 投事件给鱼
 * → 鱼自己决定 begin / skip → 逛完 finish 写心得。
 *
 * ## 一轮的生命周期
 *
 * ```
 * offered  投递出去了，等鱼接
 *   ↓ begin
 * active   逛着。受预算约束：搜索次数、视频数、每视频评论数、本轮发言数
 *   ↓ finish / skip / 超时 / 让位
 * finished | skipped | expired
 * ```
 *
 * ## 为什么要有"让位"（yield）
 *
 * 鱼正在逛，突然有人回复它。这时它该**先回应人**，而不是继续逛。
 * 但硬打断会丢掉"逛到哪儿了"，所以 `requestYield` 只打标记，
 * 等它当前动作做完再 `finishYield`（写一句"先回应新消息"并保存进度）。
 *
 * 这一条是社交感的关键：**人优先于内容**。
 */

import { randomUUID } from 'node:crypto';

import type { BiliWatchConfig } from '../config.ts';
import type { SocialStore } from './store.ts';

export interface RoamVideo {
  id: string;
  aid: string;
  title: string;
  url: string;
  commentsRead: number;
}

export interface RoamSession {
  id: string;
  createdAt: string;
  expiresAt?: string;
  status: 'offered' | 'active' | 'finished' | 'skipped' | 'expired';
  yieldRequestedAt?: string;
  yieldReason?: string;
  searches: number;
  totalVideos?: number;
  videos: RoamVideo[];
  summary?: string;
  completedAt?: string;
}

/** 这一轮的预算。 */
export interface RoamLimits {
  enabled: boolean;
  mode: 'bounded' | 'free';
  maxDailySessions: number;
  maxVideosPerSession: number;
  maxCommentsPerVideo: number;
  maxCommentsPerSession: number;
  maxDailyComments: number;
  minIntervalMinutes: number;
  idleMinutes: number;
  maxSessionMinutes: number;
  maxTextChars: number;
}

/** 从配置读这一轮的预算。 */
export function roamingConfig(cfg: BiliWatchConfig): RoamLimits {
  return { ...cfg.roaming };
}

export interface RoamStatus {
  enabled: boolean;
  limits: RoamLimits;
  usedToday: number;
  active?: RoamSession & { totalVideos: number; videos: RoamVideo[] };
  recent: Array<RoamSession & { totalVideos: number; videos: RoamVideo[] }>;
}

/**
 * 闲逛调度器。
 *
 * 只做**本地机会与预算**；看什么、说什么全由主 Persona 决定。
 */
export class Roaming {
  constructor(
    private readonly cfg: () => BiliWatchConfig,
    private readonly store: SocialStore,
    private readonly timezone: string,
    private readonly now: () => number = () => Date.now(),
  ) {}

  private day(time: string): string {
    try {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: this.timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date(time));
    } catch {
      return String(time).slice(0, 10);
    }
  }

  private policy(): RoamLimits {
    return roamingConfig(this.cfg());
  }

  /**
   * 把过期的轮次标掉。
   *
   * **`free` 模式不超时** —— 那种模式是"只要空闲就来"，不设时限。
   */
  private expire(): void {
    const p = this.policy();
    for (const r of this.store.roams()) {
      if (!['offered', 'active'].includes(r.status)) continue;
      if (r.status === 'active' && p.mode === 'free') continue;
      const deadline = Date.parse(
        r.expiresAt ?? new Date(Date.parse(r.createdAt) + p.maxSessionMinutes * 60_000).toISOString(),
      );
      if (deadline <= this.now()) {
        r.status = 'expired';
        r.completedAt = new Date(this.now()).toISOString();
        this.store.saveRoam(r);
      }
    }
  }

  status(): RoamStatus {
    this.expire();
    const all = this.store.roams();
    const today = this.day(new Date(this.now()).toISOString());
    const usedToday =
      this.store.roamCount(today, 'bilibili') ??
      all.filter((r) => this.day(r.createdAt) === today).length;

    const active = all.slice().reverse().find((r) => ['offered', 'active'].includes(r.status));
    const expand = (r: RoamSession) => ({
      ...r,
      totalVideos: r.totalVideos ?? r.videos.length,
      videos: r.videos.slice(-10),
    });

    return {
      enabled: this.policy().enabled,
      limits: this.policy(),
      usedToday,
      ...(active ? { active: expand(active) } : {}),
      recent: all.slice(-5).reverse().map(expand),
    };
  }

  /**
   * 生成一个机会。**不满足条件就返回 undefined**（这是正常情况，不是错误）。
   *
   * 三个条件：今天轮次没用完（free 不限）、距上一轮够久、当前没有活跃轮次。
   */
  offer(): RoamSession | undefined {
    const p = this.policy();
    if (!p.enabled) return;
    const st = this.status();
    if (st.active) return;
    if (p.mode !== 'free' && st.usedToday >= p.maxDailySessions) return;

    const last = this.store
      .roams()
      .slice()
      .reverse()
      .find((r) => !['offered', 'active'].includes(r.status));
    if (last) {
      const gapMin = (this.now() - Date.parse(last.completedAt ?? last.createdAt)) / 60_000;
      if (gapMin < p.minIntervalMinutes) return;
    }

    const r: RoamSession = {
      id: randomUUID(),
      createdAt: new Date(this.now()).toISOString(),
      expiresAt: new Date(this.now() + p.maxSessionMinutes * 60_000).toISOString(),
      status: 'offered',
      searches: 0,
      videos: [],
    };
    this.store.saveRoam(r, {
      day: this.day(r.createdAt),
      platform: 'bilibili',
      count: st.usedToday + 1,
    });
    return r;
  }

  /** 取一轮。**已过期/已结束/不存在都要报清楚**，因为模型拿的可能是旧 roamId。 */
  session(id: string, allowDisabled = false): RoamSession {
    if (!allowDisabled && !this.policy().enabled) throw new Error('闲逛已关闭');
    this.expire();
    const r = this.store.roams().find((x) => x.id === id);
    if (!r) throw new Error('闲逛记录不存在');
    if (r.status === 'expired') throw new Error('本轮闲逛已超时，请留待下一次机会');
    if (!['offered', 'active'].includes(r.status)) throw new Error('本轮闲逛已结束');
    return r;
  }

  begin(id: string): RoamSession & { limits: RoamLimits } {
    const r = this.session(id);
    r.status = 'active';
    // free 模式不限时
    if (this.policy().mode === 'free') delete r.expiresAt;
    this.store.saveRoam(r);
    return { ...r, limits: this.policy() };
  }

  /** 收尾。`summary` **必须记** —— 这是"记录"的核心，没有它面板上什么都看不到。 */
  finish(id: string, summary: string, skip = false): RoamSession {
    const r = this.session(id, true);
    r.status = skip ? 'skipped' : 'finished';
    r.summary = String(summary || '').trim().slice(0, 1000);
    r.completedAt = new Date(this.now()).toISOString();
    this.store.saveRoam(r);
    return r;
  }

  /** 有人找它了，打个让位标记。 */
  requestYield(id: string, reason = '有新消息，当前操作结束后先回应'): RoamSession | undefined {
    const r = this.store.roams().find((x) => x.id === id && ['offered', 'active'].includes(x.status));
    if (!r) return;
    if (!r.yieldRequestedAt) {
      r.yieldRequestedAt = new Date(this.now()).toISOString();
      r.yieldReason = reason;
      this.store.saveRoam(r);
    }
    return r;
  }

  /**
   * 真的收尾。
   *
   * 写的那句"先回应新消息"会进 summary，所以面板上能看到"这一轮为什么没逛完"，
   * 而不是留下一个莫名中断的记录。
   */
  finishYield(id: string): RoamSession | undefined {
    const r = this.store.roams().find((x) => x.id === id);
    if (!r?.yieldRequestedAt) return;
    if (!['offered', 'active'].includes(r.status)) return r;
    return this.finish(
      id,
      `有新消息，本轮已保存。最近读到：${r.videos.at(-1)?.title ?? '尚未开始阅读'}。先回应新消息；不自动重发任何评论。`,
    );
  }

  /* ---------------------------------------------------------------- 预算 */

  /** 记一次搜索。**失败/重复的搜索也算**，否则可以无限重试。 */
  search(id: string): void {
    const r = this.session(id);
    const p = this.policy();
    if (p.mode !== 'free' && r.searches >= p.maxVideosPerSession * 2) {
      throw new Error('本轮搜索预算已用完，可以从已读结果选择或结束');
    }
    r.searches += 1;
    this.store.saveRoam(r);
  }

  /** 记一个读过的视频。重复 aid 不重复计。 */
  recordVideo(id: string, video: { id: string; aid: string; title: string; url: string }): RoamSession {
    const r = this.session(id);
    const p = this.policy();
    if (!r.videos.some((v) => v.aid === video.aid)) {
      if (p.mode !== 'free' && r.videos.length >= p.maxVideosPerSession) {
        throw new Error('本轮视频预算已用完，请整理心得并结束');
      }
      r.totalVideos = (r.totalVideos ?? r.videos.length) + 1;
      r.videos.push({
        id: video.id,
        aid: video.aid,
        title: String(video.title ?? '').slice(0, 200),
        url: video.url,
        commentsRead: 0,
      });
      r.videos = r.videos.slice(-100);
      this.store.saveRoam(r);
    }
    return r;
  }

  /** 还能读几条评论。**必须先读过视频**，否则就是"凭空评论"。 */
  remainingComments(id: string, aid: string): number {
    const r = this.session(id);
    const v = r.videos.find((x) => x.aid === aid);
    if (!v) throw new Error('请先读取本轮视频，再读其评论');
    const p = this.policy();
    const left = p.mode === 'free' ? Infinity : p.maxCommentsPerVideo - v.commentsRead;
    if (left <= 0) throw new Error('本视频评论阅读预算已用完，可表达观点或结束');
    return left;
  }

  /**
   * 按预算裁剪一页评论。
   *
   * **楼中楼也计入**（递归裁），否则一条顶层评论带 20 条回复就能一次掏空额度。
   */
  comments<T extends { items?: unknown[]; root?: unknown }>(id: string, aid: string, page: T): T {
    let left = this.remainingComments(id, aid);
    let consumed = 0;

    type Node = { replies?: Node[]; [k: string]: unknown };
    const trim = (list: Node[]): Node[] => {
      const out: Node[] = [];
      for (const raw of list) {
        if (left <= 0) break;
        left -= 1;
        consumed += 1;
        const copy: Node = { ...raw };
        if (Array.isArray(copy.replies)) copy.replies = trim(copy.replies);
        out.push(copy);
      }
      return out;
    };

    const root = page.root ? trim([page.root as Node])[0] : undefined;
    const items = trim((page.items ?? []) as Node[]);

    const r = this.session(id);
    const v = r.videos.find((x) => x.aid === aid);
    if (v) v.commentsRead += consumed;
    this.store.saveRoam(r);

    return { ...page, root, items, readingRemaining: Number.isFinite(left) ? left : null } as T;
  }

  /**
   * 能不能发言。
   *
   * **三件事都要满足**：
   *   1. 指向本轮读过的视频（不许凭空评论）
   *   2. 本轮发言数没超
   *   3. 今日主动发言数没超（**这是主动账本，不影响通知回复**）
   */
  canPublish(id: string | undefined, oid: string): void {
    if (!id) return;
    const r = this.session(id);
    const p = this.policy();

    if (!r.videos.some((v) => v.aid === oid)) {
      throw new Error('闲逛发言须指向本轮读过的视频');
    }
    const sessionCount = this.store
      .outbox()
      .filter((s) => s.roamId === id && s.status !== 'rejected').length;
    if (sessionCount >= p.maxCommentsPerSession) throw new Error('本轮主动发言预算已用完');

    const today = this.day(new Date(this.now()).toISOString());
    const dailyCount = this.store
      .outbox()
      .filter(
        (s) =>
          Boolean(s.roamId) &&
          !s.inboxId &&
          s.status !== 'rejected' &&
          this.day(s.createdAt) === today,
      ).length;
    if (dailyCount >= p.maxDailyComments) {
      throw new Error('今日主动发言预算已用完；不影响通知回复');
    }
  }
}
