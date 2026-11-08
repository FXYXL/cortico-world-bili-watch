/**
 * social/service.ts — 社交流程的**唯一编排者**。
 *
 * 多平台版本会被平台维度切得很碎（每 100 行就有 1 处 `cfg.platforms[id]`）；
 * 只做 B 站时那些分支全是死代码，所以按单平台重写。
 *
 * ## 但每一条校验都保留了 —— 这是这个文件存在的全部理由
 *
 * 下面这些不是"流程"，是**曾经出过事的防线**。少一条就会以某种方式重发或错发：
 *
 * 1. `operationId` —— 同一个操作编号只允许一次真实发送（**必须落盘**）
 * 2. `recover()`   —— 已有记录就返回原记录，**不重新提交**
 * 3. `pending`     —— 同位置已有 unknown/sending 时直接拒绝
 * 4. `validateMention` —— @ 之前校验绑定、凭证、额度、transport
 * 5. 同一人每日 5 条（跨视频累计，**按天重置**）
 * 6. 通知回复额度与主动发言额度**分开算**
 * 7. 主人评论区自动回应单独计账，不占普通额度
 * 8. 可见性三档：public / self-only / unconfirmed，**后两档绝不重发**
 *
 * ## 2026-11-04 体检修掉的坑（都在这一个文件里）
 *
 * - 第一层防重查不到：`operationId` 从来没写进记录，`operationSends()` 永远返回空
 * - `hasSend()` 恒 false：记录里没有 `platform` 字段
 * - 单人 5 条从"每天"变成"终身"：`repliesTo()` 忘了按天过滤
 * - 主动接楼没有 `recipientId`：不去读父楼，等于单人上限不存在
 * - 待办每 60 秒重投一次：`deliver()` 不写 `delivered`
 * - `verify()` 里 `return next`（变量不存在，被 catch 吞掉）
 */

import { randomUUID } from 'node:crypto';

import type { BiliWatchConfig } from '../config.ts';
import { MAX_REPLIES_PER_PERSON } from '../config.ts';
import type { BiliClient } from '../core/client.ts';
import { normalizeTarget } from '../core/client.ts';
import { checkVisibility, readComments, sendComment } from '../core/comments.ts';
import { BiliError, type CommentTarget, type InboxItem, type SendRecord } from '../core/types.ts';
import { judgeParticipation } from './judgment.ts';
import { assessPublicInput, PublicReplySkipped } from './safety.ts';
import { roamingConfig } from './roaming.ts';
import { parseFocusAccount } from './focus.ts';
import type { SocialStore } from './store.ts';

/** 一次发送请求。 */
export interface PublishInput {
  target?: CommentTarget;
  inboxId?: string;
  /** 稳定的防重键。**同一个 requestId 只能有一次真实发送**。 */
  requestId?: string;
  text: string;
  preparation?: {
    briefId: string;
    mention?: { id: string; name: string };
    judgment?: unknown;
    purpose?: string;
    advice?: string[];
  };
  mentionFocus?: boolean;
  /** 推荐给主人：在评论区 @ 主人说一句。走独立的 recommend 账本与开关。 */
  recommend?: boolean;
  /** 明确重试**已判定失败**的那一次。 */
  retryRejected?: boolean;
  roamId?: string;
}

export interface PublishResult extends Partial<SendRecord> {
  reused?: boolean;
  submittedThisCall?: boolean;
  notice?: string;
  delivery?: { state: string; summary: string };
}

/** 一天的日期（部署时区）。**额度按天算，所以这个必须准。** */
function dayKey(timezone: string, iso: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(iso));
  } catch {
    return String(iso).slice(0, 10);
  }
}

export interface ServiceDeps {
  cfg: BiliWatchConfig;
  store: SocialStore;
  client: () => BiliClient;
  timezone: string;
  /** 读 secret（cookie）。 */
  secret: (name: string) => string;
  /** 浏览器发评通道。配 transport='browser' 时才用；没有就回落 api。 */
  browser?: {
    send(
      target: CommentTarget,
      text: string,
      signal?: AbortSignal,
      expectedAccountId?: string,
      mention?: { id: string; name: string },
    ): Promise<import('../core/types.ts').SendReceipt>;
  };
}

/**
 * 两个文本的相似度（0–1）：按字符的最长公共子序列 / 较长那条的长度。
 *
 * 为什么不用 bigram 重合度：中文短句里换个短语会把连续好几个 bigram 一起毁掉，
 * 实测「补一句」→「补一个实际做法」只有 69%，被误判成"换了话题"。
 * LCS 对这种局部替换是线性的，同样改法能到 78%，更贴近人的直觉。
 *
 * 用来区分「润色」和「换了一段话」：她实测会因为改一个词被拒
 * 「文案与凭据不一致」，只能重跑整轮 prepare —— 那不是防篡改，是在罚她改错字。
 */
function draftSimilarity(a: string, b: string): number {
  const A = [...String(a).replace(/\s+/g, '')];
  const B = [...String(b).replace(/\s+/g, '')];
  if (!A.length || !B.length) return A.length === B.length ? 1 : 0;
  const m = B.length;
  let prev = new Uint16Array(m + 1);
  let cur = new Uint16Array(m + 1);
  for (let i = 1; i <= A.length; i++) {
    for (let j = 1; j <= m; j++) {
      cur[j] = A[i - 1] === B[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
    }
    const swap = prev;
    prev = cur;
    cur = swap;
    cur.fill(0);
  }
  return prev[m] / Math.max(A.length, B.length);
}

/** 润色和篡改的分界：重合度低于这个值就当"换了话题"，要求重新 prepare。 */
const DRAFT_SIMILARITY_MIN = 0.7;

export class BiliService {
  private account: { id: string; name: string } | null = null;
  private lastPollAt: string | null = null;
  private lastError: string | null = null;
  private polling = false;
  private delivering = false;
  /** 限流/网络错误后的退避时刻。**412 时不能再每 60 秒打一次**。 */
  private retryAtMs = 0;
  private readonly deliveryStartedAt = Date.now();
  private readonly cursors: Record<'reply' | 'at', { id: string; time: number } | undefined> = {
    reply: undefined,
    at: undefined,
  };

  constructor(private readonly d: ServiceDeps) {}

  get currentAccount(): { id: string; name: string } | null {
    return this.account;
  }

  get lastPoll(): string | null {
    return this.lastPollAt;
  }

  get lastPollError(): string | null {
    return this.lastError;
  }

  private day(iso = new Date().toISOString()): string {
    return dayKey(this.d.timezone, iso);
  }

  private get cfg(): BiliWatchConfig {
    return this.d.cfg;
  }

  /* ------------------------------------------------- 推荐给主人（@ 主人） */

  /**
   * 解析「要 @ 的账号」。UID 优先用推荐配置，留空就复用特别关注绑定（已核验过的 UID）。
   * 昵称优先用配置，留空按 UID 从联系人表反查 —— **B 站的 at_name_to_mid 要真实昵称**，
   * `UID 456764639` 这种占位名 @ 不出来，所以反查不到就判为「还没配好」，绝不硬发。
   */
  recommendOwner(accountId: string): { id: string; name: string } | undefined {
    const r = this.cfg.recommend;
    let uid = String(r?.ownerUid ?? '').normalize('NFKC').trim();
    if (!uid) {
      const input = String(this.cfg.focus?.account ?? '').trim();
      const binding = this.d.store.focusBinding(accountId, input);
      if (binding) uid = binding.ownerId;
      else {
        try {
          uid = parseFocusAccount(input).uid ?? '';
        } catch {
          uid = '';
        }
      }
    }
    if (!/^[1-9]\d{0,19}$/.test(uid)) return undefined;

    let name = String(r?.ownerName ?? '').normalize('NFKC').trim();
    if (!name) {
      name =
        this.d.store
          .contacts()
          .filter((c) => c.accountId === accountId && c.userId === uid)
          .sort((a, b) => b.firstAt - a.firstAt)[0]?.names.at(-1) ?? '';
    }
    // 占位名不是真昵称，拿去 @ 只会静默失效
    if (!name || /^UID\s+\d+$/.test(name)) return undefined;
    return { id: uid, name: name.slice(0, 80) };
  }

  /** 今天还能推荐几次（闲逛机会文本与工具都读这个，保证口径一致）。 */
  recommendStatus(accountId: string): {
    enabled: boolean;
    maxDaily: number;
    usedToday: number;
    remaining: number;
    owner: { id: string; name: string } | undefined;
    likedList: string;
  } {
    const r = this.cfg.recommend;
    const maxDaily = Math.max(0, Number(r?.maxDaily) || 0);
    const usedToday = this.usedToday('recommend', accountId);
    const owner = this.recommendOwner(accountId);
    return {
      enabled: Boolean(r?.enabled) && maxDaily > 0 && Boolean(owner),
      maxDaily,
      usedToday,
      remaining: Math.max(0, maxDaily - usedToday),
      owner,
      likedList: String(r?.likedList ?? '').trim(),
    };
  }

  /**
   * 这条视频是否已经推荐给主人（只算成功发出的）。
   *
   * 为什么要单独查：推荐的 requestId 从 briefId 派生，每次 prepare 都是新键 ——
   * 四层防重一层都命中不了。实测 11-06 06:35 和 11-08 00:23 把同一条
   * 《免费live2D模型》推了两次，主人连收两条 @。
   */
  recommendAlreadySent(accountId: string, oid: string) {
    return this.d.store
      .outbox()
      .filter(
        (r) =>
          r.accountId === accountId &&
          r.kind === 'recommend' &&
          r.target.oid === oid &&
          r.status !== 'rejected',
      )
      .at(-1);
  }

  /* ---------------------------------------------------------------- 连接 */

  /** 连上并核对账号。 */
  async connect(signal?: AbortSignal): Promise<{ id: string; name: string }> {
    if (!this.cfg.enabled) throw new BiliError('这个 World 已关闭。', 'invalid');
    if (!this.d.secret(this.cfg.cookieSecret)) {
      throw new BiliError('尚未登录，请先在面板扫码。', 'auth');
    }
    const acc = await this.d.client().account(signal);
    this.account = acc;
    return acc;
  }

  disconnect(): void {
    this.account = null;
    this.cursors.reply = undefined;
    this.cursors.at = undefined;
  }

  /* ---------------------------------------------------------------- 通知 */

  /**
   * 拉一轮通知。
   *
   * **两条通道都要拉**：`reply`（有人回复我）和 `at`（有人 @ 我）。
   * 只拉一路会漏掉一半对话 —— 而 `reply` 这一路恰好包括"别人回复我刚发的评论"，
   * 那正是发完评论后要接的后续。
   *
   * 三条 2026-11-04 补回来的健壮性：
   *   1. 每路最多回溯 3 页（原来只拉一页，忙的时候会漏）
   *   2. `sinceAt` 水位落盘（原来只存在内存里，重启就丢）
   *   3. 412/429 退避 5 分钟（原来每 60 秒硬打，越打越限）
   */
  async poll(signal?: AbortSignal, force = false): Promise<number> {
    const cfg = this.cfg;
    if (!cfg.enabled || !cfg.monitor.enabled) return 0;
    if (this.polling) return 0;
    if (this.retryAtMs > Date.now()) return 0;
    if (
      !force &&
      this.lastPollAt &&
      Date.now() - Date.parse(this.lastPollAt) < Math.max(30, cfg.monitor.intervalSec) * 1000
    ) {
      return 0;
    }

    this.polling = true;
    let added = 0;
    const errors: string[] = [];
    try {
      let acc = this.account;
      if (!acc) {
        try {
          acc = await this.connect(signal);
        } catch (error) {
          this.lastError = (error as Error).message;
          this.retryAtMs = Date.now() + 60_000;
          return 0;
        }
      }

      for (const lane of ['reply', 'at'] as const) {
        const key = `bilibili:${acc.id}:${lane}`;
        // 首次登记就把水位设在"现在"，避免一装插件就把历史通知全灌进来
        let feed = this.d.store.feed(key);
        try {
          for (let page = 0; page < 3; page += 1) {
            signal?.throwIfAborted();
            const result = await this.d.client().notifications(
              lane,
              acc.id,
              feed.cursor,
              signal,
            );
            let reachedOld = false;
            let newest = feed.sinceAt;
            for (const item of result.items) {
              if (Number.isFinite(item.occurredAt) && item.occurredAt > newest) {
                newest = item.occurredAt;
              }
              // 比水位还老 = 这一页已经翻到底了
              if (!Number.isFinite(item.occurredAt) || item.occurredAt < feed.sinceAt) {
                reachedOld = true;
                continue;
              }
              // 自己发的东西不算"有人在找你"
              if (item.authorId && item.authorId === acc.id) continue;
              if (item.accountId !== acc.id) continue;
              if (this.d.store.getInbox(item.id)) continue;
              if (
                this.d.store.addInbox({
                  ...item,
                  platform: 'bilibili',
                  status: 'pending',
                  ...(item.notificationType === 'reply' || item.notificationType === 'mention'
                    ? {}
                    : { notificationType: 'reply' as const }),
                })
              ) {
                added += 1;
              }
              this.d.store.rememberContact({
                platform: 'bilibili',
                accountId: acc.id,
                authorId: item.authorId,
                author: item.author,
                lastAt: new Date(item.occurredAt).toISOString(),
              });
            }

            const sameCursor =
              JSON.stringify(feed.cursor) === JSON.stringify(result.cursor ?? null);
            const done = result.done || reachedOld || !result.cursor || sameCursor;
            this.d.store.checkpoint(key, done ? undefined : result.cursor, newest);
            if (done) break;
            feed = this.d.store.feed(key);
          }
        } catch (error) {
          const e = error as BiliError;
          errors.push(`${lane}: ${e.message}`);
          if (e.kind === 'auth') this.account = null;
          this.retryAtMs = Date.now() + (e.kind === 'rate' ? 5 * 60_000 : 60_000);
        }
      }

      this.lastPollAt = new Date().toISOString();
      this.lastError = errors.join('；') || null;
      if (!errors.length) this.retryAtMs = 0;
      return added;
    } finally {
      this.polling = false;
      if (!this.lastPollAt) this.lastPollAt = new Date().toISOString();
    }
  }

  /* ---------------------------------------------------------------- 额度 */

  private usedToday(kind: SendRecord['kind'], accountId: string): number {
    const today = this.day();
    return this.d.store
      .outbox()
      .filter(
        (r) =>
          r.accountId === accountId &&
          r.kind === kind &&
          r.status !== 'rejected' &&
          this.day(r.createdAt) === today,
      ).length;
  }

  /**
   * 同一人**今天**已经回了几条。
   *
   * `重启不重置` 靠的是记录落盘；但**必须按天过滤** ——
   * 漏了它，这个上限就从"每天 5 条"变成"终身 5 条"（实测库里已经有人卡死）。
   */
  private repliesToday(recipientId: string, accountId: string): number {
    const today = this.day();
    return this.d.store
      .outbox()
      .filter(
        (r) =>
          r.accountId === accountId &&
          r.recipientId === recipientId &&
          r.status !== 'rejected' &&
          this.day(r.createdAt) === today,
      ).length;
  }

  /** 这条通知该不该发、该走哪本账。返 `undefined` = 没限制。 */
  private notificationLimit(item: InboxItem): string | undefined {
    const cfg = this.cfg;
    if (item.focusOwnerId) {
      if (!cfg.focus.enabled) return '特别关注已关闭，本条不再主动参与。';
      const binding = this.d.store.focusBinding(item.accountId, cfg.focus.account.trim());
      if (!binding || binding.ownerId !== item.focusOwnerId) {
        return '特别关注绑定已改变，本条不再主动参与。';
      }
      if (item.ownerAutoReply) {
        if (!cfg.focus.autoReplyNewComments) return '主人评论区自动回应已关闭。';
        return undefined;
      }
      const today = this.day();
      const used = this.d.store
        .outbox()
        .filter(
          (r) =>
            r.accountId === item.accountId &&
            r.focusOwnerId === item.focusOwnerId &&
            !r.ownerAutoReply &&
            r.status !== 'rejected' &&
            this.day(r.createdAt) === today,
        ).length;
      if (used >= cfg.focus.maxDailyActions) {
        return '今日特别关注参与额度已用完，保留记录即可。';
      }
      return undefined;
    }

    if (this.usedToday('reply', item.accountId) >= cfg.posting.maxDailyReplies) {
      return '今日通知回应额度已用完，请留到明天。';
    }
    if (item.target.parent !== '0' && item.authorId) {
      if (this.repliesToday(item.authorId, item.accountId) >= MAX_REPLIES_PER_PERSON) {
        return `今天已回应这位用户 ${MAX_REPLIES_PER_PERSON} 条，请留到明天。`;
      }
    }
    return undefined;
  }

  private isAutoReply(item: InboxItem): boolean {
    return Boolean(
      item.focusOwnerId &&
        item.notificationType === 'focus-comment' &&
        item.target.parent !== '0' &&
        (item.ownerAutoReply || this.cfg.focus.autoReplyNewComments),
    );
  }

  /** 这个位置是不是已经发过了（防重第二层之外的另一道闸）。 */
  private alreadySent(item: InboxItem): boolean {
    return this.d.store.hasSend('bilibili', item.accountId, item.target.oid, item.target.parent);
  }

  private storageLimit(): string | undefined {
    /**
     * `historyStatus()` 会摸 `node:sqlite`。**拿不到归档能力时必须放行** ——
     * 让它抛出去会连累 `pendingReplies()`，整个同步周期每一轮都失败。
     */
    let bytes = 0;
    let maxArchiveBytes = Infinity;
    try {
      const h = this.d.store.historyStatus();
      bytes = h.bytes;
      maxArchiveBytes = h.maxArchiveBytes;
    } catch {
      return undefined;
    }
    if (bytes >= maxArchiveBytes) {
      return '历史归档达到空间预算，请在配置里查看并调整；记录与防重凭据保留。';
    }
    const pendingSends = this.d.store
      .outbox()
      .filter((r) => r.status === 'unknown' || r.status === 'sending').length;
    if (pendingSends >= 200) {
      return '待核实发送过多，暂停新增发评；原记录保留，请先核实结果。';
    }
    return undefined;
  }

  /** 还等着回复的条数。**有它在就别给闲逛机会** —— 先处理人。 */
  pendingReplies(): InboxItem[] {
    if (this.storageLimit()) return [];
    if (!this.cfg.posting.enabled) return [];
    return this.d.store
      .inbox()
      .filter(
        (i) =>
          i.status === 'pending' &&
          (!i.retryAt || Date.parse(i.retryAt) <= Date.now()) &&
          !this.alreadySent(i) &&
          assessPublicInput(i.text).action !== 'skip' &&
          !this.notificationLimit(i),
      );
  }

  /**
   * 把待办投给模型。
   *
   * **必须写 `delivered`**：不写的话每一轮都会把同一条待办重新推一遍事件，
   * 模型会以为"又有一个人回复了"——这是最容易让人觉得"这鱼疯了"的表现。
   * 已投过的，15 分钟后才允许再投（那次是提醒，不是新消息）。
   */
  async deliver(sink: (item: InboxItem) => Promise<void>): Promise<void> {
    if (!this.cfg.monitor.enabled || !this.cfg.posting.enabled) return;
    if (this.delivering || this.storageLimit()) return;
    this.delivering = true;
    try {
      const candidates = this.d.store
        .inbox()
        .filter(
          (i) =>
            i.status === 'pending' &&
            (!i.retryAt || Date.parse(i.retryAt) <= Date.now()) &&
            !this.alreadySent(i) &&
            (!i.delivered ||
              !i.deliveredAt ||
              Date.parse(i.deliveredAt) < this.deliveryStartedAt ||
              Date.now() - Date.parse(i.deliveredAt) >= 15 * 60_000),
        )
        .sort(
          (a, b) =>
            Number(Boolean(b.focusOwnerId)) - Number(Boolean(a.focusOwnerId)) ||
            Number(Boolean(a.delivered)) - Number(Boolean(b.delivered)) ||
            a.occurredAt - b.occurredAt,
        )
        .slice(0, 3);

      for (const item of candidates) {
        const assessment = assessPublicInput(item.text);
        const limit = this.notificationLimit(item);
        if (assessment.action === 'skip' || limit) {
          this.d.store.updateInbox(item.id, {
            status: 'handled',
            handling: {
              kind: assessment.kind ?? 'limit',
              reason: assessment.reason ?? limit ?? '本机规则跳过',
            },
          });
          continue;
        }
        await sink({ ...item, ownerAutoReply: this.isAutoReply(item) || undefined });
        this.d.store.updateInbox(item.id, {
          delivered: true,
          deliveredAt: new Date().toISOString(),
          ownerAutoReply: this.isAutoReply(item) || undefined,
        });
      }
    } finally {
      this.delivering = false;
    }
  }

  /** 明确决定不接话。**这是收尾，不是失败** —— 理由要留下来。 */
  handleInbox(id: string, reason?: string, kind: 'skip' | 'replied' = 'skip'): InboxItem | null {
    const item = this.d.store.getInbox(id);
    if (!item) throw new Error('收件箱消息不存在');
    this.d.store.updateInbox(id, {
      status: 'handled',
      ...(reason?.trim()
        ? { handling: { kind, reason: reason.trim().slice(0, 500) } }
        : {}),
    });
    return { ...item, status: 'handled' };
  }

  /** 稍后再处理（不丢待办，也不占着这一轮）。 */
  deferInbox(id: string, minutes = 30): InboxItem | null {
    const item = this.d.store.getInbox(id);
    if (!item) return null;
    const retryAt = new Date(Date.now() + Math.max(1, minutes) * 60_000).toISOString();
    this.d.store.updateInbox(id, { retryAt, delivered: false });
    return { ...item, retryAt };
  }

  /* ---------------------------------------------------------------- 发布 */

  /**
   * 读父楼作者，补 `recipientId`。
   *
   * **不补就等于没有单人上限**：闲逛接楼时 target 是"回复某条评论"，
   * 只有拿到被回复者的 mid，5 条/天才有意义。
   */
  private async parentAuthor(target: CommentTarget, signal?: AbortSignal): Promise<string | undefined> {
    const cached = this.d.store.comment(target)?.authorId;
    if (cached) return cached;
    if (target.parent === '0') return undefined;
    // 楼中楼按时间正序分页 —— 刚回复的那条（也就是我们要找的 parent）
    // **永远在最后一页**。只读第 1 页等于永远找不到，所以往下翻几页。
    for (let page = 1; page <= 3; page++) {
      try {
        const r = await readComments(this.d.client(), { ...target, parent: '0' }, page, signal);
        this.d.store.rememberComments(r);
        const hit = this.d.store.comment(target)?.authorId;
        if (hit) return hit;
        if (!r.items?.length) break;
      } catch {
        // 读不到父楼不是"不能发"的理由，调用方会用 recipientId 兜底或明确拒绝
        break;
      }
    }
    return this.d.store.comment(target)?.authorId;
  }

  private assertQuota(
    kind: SendRecord['kind'],
    accountId: string,
    recipientId: string | undefined,
    ownerAutoReply = false,
  ): void {
    const cfg = this.cfg;
    if (!cfg.posting.enabled) {
      throw new BiliError('公开发布已关闭，请由主人在这个 World 的设置里开启。', 'auth');
    }
    // 主人评论区自动回应单独计账：不占普通额度，也不设单人次数上限
    if (kind === 'focus' && ownerAutoReply) return;

    // 同一人的硬底线 —— 不给调，也不受任何档位影响
    if (recipientId && kind !== 'focus') {
      const n = this.repliesToday(recipientId, accountId);
      if (n >= MAX_REPLIES_PER_PERSON) {
        throw new PublicReplySkipped(
          `今天已经回这个人 ${n} 条了（上限 ${MAX_REPLIES_PER_PERSON}）。换个人、或者等明天。`,
        );
      }
    }

    if (kind === 'focus') return; // 特别关注那本账在 notificationLimit 里算过
    // 推荐给主人是独立账本（recommend.maxDaily），不占主动发言额度
    if (kind === 'recommend') {
      const r = cfg.recommend;
      const used = this.usedToday('recommend', accountId);
      const limit = Math.max(0, Number(r?.maxDaily) || 0);
      if (!r?.enabled || used >= limit) {
        throw new PublicReplySkipped(
          `今日推荐额度已用完（已用 ${used} 次 / 上限 ${limit} 次` +
            (used > limit ? '，上限比已用次数小——可能被调小过' : '') +
            '），明天再来。',
        );
      }
      // 不 return：下面「两条评论最小间隔」照样生效，避免连着刷屏
    } else {
      const used = this.usedToday(kind, accountId);
      if (kind === 'reply' && used >= cfg.posting.maxDailyReplies) {
        throw new PublicReplySkipped(`今日回复额度已用完（${used}/${cfg.posting.maxDailyReplies}）。`);
      }
      if (kind === 'proactive' && used >= cfg.posting.maxDailyComments) {
        throw new PublicReplySkipped(
          `今日主动发言额度已用完（${used}/${cfg.posting.maxDailyComments}）。`,
        );
      }
    }

    // 两条评论之间的最小间隔
    const last = this.d.store
      .outbox()
      .filter((r) => r.accountId === accountId && r.status !== 'rejected')
      .at(-1);
    if (last) {
      const gap = (Date.now() - Date.parse(last.createdAt)) / 1000;
      if (gap < cfg.posting.minIntervalSec) {
        const wait = Math.max(1, Math.ceil(cfg.posting.minIntervalSec - gap));
        throw new PublicReplySkipped(
          `距上一条评论只过了 ${Math.round(gap)} 秒，至少要 ${cfg.posting.minIntervalSec} 秒；还要等 ${wait} 秒。`,
          wait,
        );
      }
    }
  }

  /**
   * 发一条评论。**四层防重，任何一层命中都不提交。**
   *
   * 这四层的意义各不相同，缺一层就有一种翻车方式：
   *   1. 同编号已有记录  —— 返回原记录（否则会二次提交）
   *   2. 同位置未核实    —— 拒绝（否则同一楼两条）
   *   3. @ 凭证失效      —— 拒绝（否则 @ 错人 / 超额）
   *   4. 额度与间隔      —— 拒绝（否则刷屏）
   */
  async publish(input: PublishInput, signal?: AbortSignal): Promise<PublishResult> {
    const cfg = this.cfg;
    if (!cfg.posting.enabled) {
      throw new BiliError('公开发布已关闭，请由主人在这个 World 的设置里开启。', 'auth');
    }
    const text = String(input.text ?? '').trim();
    if (!text || text.length > 1000) throw new BiliError('评论应为 1–1000 字', 'invalid');

    const acc = this.account ?? (await this.connect(signal));

    // ── 凭据（briefId）：先读，它本身就是 target 与 requestId 的来源 ────
    //
    // 模型只需要 `bili_prepare` → `bili_publish({ briefId, text })`。凭据里已经
    // 绑定了平台/账号/目标，还要它自己再抄一遍 target，只会抄错 —— 实测：
    // 漏传 target 被报「评论类型仅支持视频(1)」，补上 target 又要自己编
    // requestId，编出来的还是新键（防重直接失效）。
    const brief = input.preparation?.briefId
      ? this.d.store.brief(input.preparation.briefId)
      : undefined;
    if (input.preparation?.briefId && !brief) {
      throw new BiliError('找不到这份接话凭据（可能已过期），请重新 bili_prepare。', 'rejected');
    }
    /** 文案相对草稿的重合度；1 = 一字未改。 */
    let draftSim = 1;
    /** 有值说明这次是润色过的，记下来方便复盘。 */
    let revisedFrom: string | undefined;

    // ── 定位目标与账本 ───────────────────────────────────────────────
    let target: CommentTarget;
    let kind: SendRecord['kind'] = input.recommend ? 'recommend' : 'proactive';
    let recipientId: string | undefined;
    let inboxItem: InboxItem | undefined;

    /**
     * 来源通知：显式 `inboxId`，或者凭据里记着的那个。
     *
     * **凭据也必须算**：prepare 明明是从收件箱来的，publish 只带 briefId 时
     * 以前完全不知道自己来自哪条通知 —— 后果有两个，都是实测撞出来的：
     *   1. 发完不自动标「已回复」，待办一直挂着；她再 prepare 一次就是新
     *      briefId、新 requestId，**同一条通知会被回第二遍**；
     *   2. 只能回头读楼中楼找父评论作者，而父评论在最后一页，常常读不到。
     */
    const inboxId = input.inboxId
      ? String(input.inboxId)
      : (brief?.sourceInboxId ?? undefined);

    if (input.inboxId) {
      inboxItem = this.d.store.getInbox(input.inboxId) ?? undefined;
      if (!inboxItem) throw new Error('收件箱消息不存在');
      if (inboxItem.accountId !== acc.id) {
        throw new Error('该消息属于其他账号，不能用当前账号回复。');
      }
    } else if (inboxId) {
      // 凭据带来的通知：找不到就忽略（收件箱可能已经清理过），不影响发送
      const found = this.d.store.getInbox(inboxId);
      if (found && found.accountId === acc.id) inboxItem = found;
    }

    if (inboxItem) {
      target = normalizeTarget(inboxItem.target);
      kind = inboxItem.focusOwnerId ? 'focus' : 'reply';
      recipientId = inboxItem.authorId || brief?.recipientId;
    } else {
      const raw = input.target ?? brief?.target;
      if (!raw) {
        throw new BiliError(
          '缺少发送目标：给 briefId（bili_prepare 拿到的）或完整 target（oid/type/root/parent）。',
          'invalid',
        );
      }
      target = normalizeTarget(raw);
      // 接楼就是回复，用回复账本（每人每日上限才算得对）。
      // 以前只有 inboxId 才记 reply，凭据接楼一律记成 proactive —— 主动发言
      // 额度被扣、单人上限没生效、记录页还显示成"主动评论"。
      if (!input.recommend) kind = target.parent !== '0' ? 'reply' : 'proactive';
    }

    // 接楼必须有 recipientId：拿不到就不发，绝不绕过单人上限。
    // 通知里已经有 authorId 的就别再找了 —— 以前这里写的是 `!input.inboxId`，
    // 只带 briefId 时会绕过上面的赋值、又去读楼中楼，反而把能发的楼卡死。
    if (!recipientId && target.parent !== '0') {
      // 凭据里记着"回给谁"就先信它（来自收件箱的 authorId，收到通知那刻就确定了）。
      // 只拿 briefId 来发时，这里会回头读楼中楼找父评论作者 —— 而父评论通常是
      // **最新的那条，排在最后一页**，第一页永远读不到，于是明明能回的楼被卡成
      // 「暂未取得对方平台账号身份」（实测：2026-11-08 01:2x 缘梦幻境那条）。
      recipientId = brief?.recipientId ?? (await this.parentAuthor(target, signal));
      if (!recipientId || !/^[1-9]\d*$/.test(recipientId)) {
        throw new PublicReplySkipped(
          '暂未取得对方平台账号身份，本次不发；先读清原楼层（bili_comments）再来，不换目标绕过每人上限。',
        );
      }
    }

    // 凭据本身就是幂等键：同一个 brief 重试沿用同一个 requestId，
    // 模型不用编、也不该编（编新的会让四层防重失效）。
    // 通知回复的键 = 通知 id：同一条通知无论如何 prepare 几次，都只可能发一次。
    // （以前只有显式 inboxId 才这样，走凭据时退化成 brief:<briefId> —— 每 prepare
    // 一次就是新键，等于给"重复回同一条"开了口子。）
    const requestId = inboxId
      ? `reply:${inboxId}`
      : (input.requestId ?? (brief ? `brief:${brief.id}` : undefined));
    if (!requestId || (!input.inboxId && requestId.length > 180) || /[\r\n]/.test(requestId)) {
      throw new BiliError('新评论必须提供固定的 requestId；重试要沿用原值。', 'invalid');
    }
    const operationId = `bilibili:${acc.id}:${requestId}`;
    const previousAttempts = this.d.store.operationSends(operationId);

    // ── 第一层：同编号已有记录 ────────────────────────────────────────
    const prior = previousAttempts.at(-1);
    if (prior) {
      if (prior.text !== text && !(input.retryRejected && prior.status === 'rejected')) {
        throw new BiliError('同一操作编号的内容发生变化，请先核实原发送记录。', 'rejected');
      }
      if (JSON.stringify(prior.target) !== JSON.stringify(target)) {
        throw new BiliError('同一操作编号的目标发生变化，请先核实原发送记录。', 'rejected');
      }
      if (prior.status !== 'rejected' || !input.retryRejected) {
        return {
          ...prior,
          reused: true,
          submittedThisCall: false,
          notice: '本次只返回已有发送记录，没有重新提交；失败信息属于原尝试。',
        };
      }
    }

    // ── 第二层：同位置已有未核实的发送 ────────────────────────────────
    const pending = this.d.store
      .outbox()
      .find(
        (r) =>
          r.accountId === acc.id &&
          ['unknown', 'sending'].includes(r.status) &&
          JSON.stringify(r.target) === JSON.stringify(target),
      );
    if (pending) {
      return {
        ...pending,
        reused: true,
        submittedThisCall: false,
        notice:
          '这个位置已有一次未核实的发送，本次没有再提交。换文案或换编号也不重投 —— 先核实原记录。',
      };
    }

    // ── 凭据绑定的账号/目标/草稿必须对得上 ───────────────────────────
    if (brief) {
      if (brief.accountId !== acc.id) {
        throw new BiliError('凭据属于另一个账号，未提交。', 'rejected');
      }
      if (JSON.stringify(brief.target) !== JSON.stringify(target)) {
        throw new BiliError('凭据绑定的目标与本次发送不一致，未提交；请重新 prepare。', 'rejected');
      }
      // 草稿不一致：**润色放行、换话题要求重来**。
      // 以前要求一字不差，结果她改「补一句 → 补一个实际做法」都被拒，
      // 只能重跑整轮 prepare（重读评论区、重算判断）—— 防篡改不该用字符串相等。
      // 真正的把关是下面用**新文案**重跑参与判断。
      if (brief.draft && brief.draft !== text) {
        draftSim = draftSimilarity(brief.draft, text);
        if (draftSim < DRAFT_SIMILARITY_MIN) {
          throw new BiliError(
            `文案与凭据里的草稿差太多（重合度 ${Math.round(draftSim * 100)}%），` +
              '像是换了一段话。把新文案作为 draft 重新 bili_prepare 再来。',
            'rejected',
          );
        }
        revisedFrom = brief.draft;
      }
    }

    // ── 第三层：@ 的凭证与绑定 ───────────────────────────────────────
    // 两条独立通道：
    //   ① 推荐给主人 —— @ 的 UID/昵称来自本地推荐配置，走 recommend 账本；
    //   ② @ 特别关注 —— @ 的 UID 必须等于已核验的 focus 绑定，走 focus 账本。
    // 混在一起会让「@ 我」被错误地拿去和 UP 主绑定比对，永远发不出去。
    const recommend = input.recommend === true;
    if (recommend) {
      const st = this.recommendStatus(acc.id);
      if (!st.enabled) {
        throw new PublicReplySkipped(
          '推荐给主人没配好：请确认开关已开、每日次数 > 0、且被 @ 的账号有真实昵称。',
        );
      }
      if (kind !== 'recommend' || input.inboxId || target.parent !== '0') {
        throw new BiliError('推荐给主人只能在视频下新发一条评论，不能接楼或回复通知。', 'invalid');
      }
      if (cfg.posting.transport !== 'api') {
        throw new BiliError('@ 主人需要在配置里选「接口发评」；网页发评不会自动切换。', 'rejected');
      }
      if (st.remaining <= 0) {
        throw new PublicReplySkipped(
          `今日推荐额度已用完（${st.usedToday}/${st.maxDaily}），明天再来。`,
        );
      }
      if (!brief || !brief.mention || JSON.stringify(brief.mention) !== JSON.stringify(st.owner)) {
        throw new BiliError('推荐凭据无效：请重新 bili_recommend({ action: "prepare" })。', 'rejected');
      }
    }

    const mention = recommend
      ? this.recommendOwner(acc.id)
      : (brief?.mention ?? input.preparation?.mention);
    if (input.mentionFocus && !mention && !recommend) {
      throw new PublicReplySkipped(
        '@ 特别关注需要先 bili_prepare({ mentionFocus: true, draft }) 取得发送凭据。',
      );
    }
    if (mention) {
      if (
        !brief ||
        brief.accountId !== acc.id ||
        JSON.stringify(brief.target) !== JSON.stringify(target) ||
        (brief.draft && brief.draft !== text && draftSim < DRAFT_SIMILARITY_MIN) ||
        JSON.stringify(brief.mention) !== JSON.stringify(mention) ||
        Date.now() - Date.parse(brief.createdAt) > 3 * 3600_000
      ) {
        throw new BiliError('@ 发送凭据无效或已过期，未提交。', 'rejected');
      }
      if (!recommend) {
        if (!cfg.focus.enabled || !cfg.focus.allowMentions) {
          throw new PublicReplySkipped('主动 @ 没有在本地开启，未提交。');
        }
        const binding = this.d.store.focusBinding(acc.id, cfg.focus.account.trim());
        if (!binding || binding.ownerId !== mention.id) {
          throw new BiliError('@ 对象与当前本地特别关注绑定不一致，未提交。', 'rejected');
        }
        if (cfg.posting.transport !== 'api') {
          throw new BiliError('主动 @ 需要在本地显式选择接口发评；网页发评不会自动切换。', 'rejected');
        }
        const today = this.day();
        const used = this.d.store
          .outbox()
          .filter(
            (r) =>
              r.accountId === acc.id &&
              r.kind !== 'recommend' &&
              r.mention &&
              r.status !== 'rejected' &&
              this.day(r.createdAt) === today,
          ).length;
        if (used >= cfg.focus.maxDailyMentions) {
          throw new PublicReplySkipped(`今日 @ 额度已用完（${used}/${cfg.focus.maxDailyMentions}）。`);
        }
      }
    }

    // ── 内容判断：外部文本安全 + 参与判断 ─────────────────────────────
    const sourceText = inboxItem?.text ?? this.d.store.comment(target)?.text ?? '';
    if (sourceText) {
      const assessment = assessPublicInput(sourceText);
      if (assessment.action === 'skip') {
        if (inboxItem) {
          this.d.store.updateInbox(inboxItem.id, {
            status: 'handled',
            handling: { kind: assessment.kind ?? 'unsafe', reason: assessment.reason ?? '跳过' },
          });
        }
        throw new PublicReplySkipped(`外部请求已跳过：${assessment.reason ?? ''}`);
      }
    }
    const videoTitle =
      this.d.store.video(target.oid)?.title ?? brief?.videoTitle ?? '';
    // 润色过的文案不能用旧草稿的判断：那份是拿旧字算的，改了字就得重新判。
    const participation = judgeParticipation(
      videoTitle,
      text,
      revisedFrom
        ? undefined
        : ((input.preparation?.judgment ?? brief?.judgment) as
            | { mode?: string; evidence?: string }
            | undefined),
    );
    if (participation.needsRevision || participation.mode !== 'discuss') {
      throw new PublicReplySkipped(participation.reason);
    }

    // ── 第四层：额度与间隔 ───────────────────────────────────────────
    if (input.roamId !== undefined) {
      if (typeof input.roamId !== 'string' || !input.roamId || input.roamId.length > 80) {
        throw new BiliError('闲逛编号无效。', 'invalid');
      }
    }
    if (inboxItem) {
      const limit = this.notificationLimit(inboxItem);
      if (limit) {
        this.d.store.updateInbox(inboxItem.id, {
          status: 'handled',
          handling: { kind: 'limit', reason: limit },
        });
        throw new PublicReplySkipped(limit);
      }
    }
    this.assertQuota(kind, acc.id, recipientId, Boolean(inboxItem && this.isAutoReply(inboxItem)));

    const limited = this.storageLimit();
    if (limited) {
      if (inboxItem) this.d.store.updateInbox(inboxItem.id, { delivered: false });
      throw new PublicReplySkipped(limited);
    }

    signal?.throwIfAborted();

    // ── 落盘占位：崩在这里也能看出"可能发出去了" ─────────────────────
    const record: SendRecord = {
      id: randomUUID(),
      operationId,
      platform: 'bilibili',
      requestId,
      accountId: acc.id,
      target,
      text,
      status: 'sending',
      createdAt: new Date().toISOString(),
      kind,
      ...(recipientId ? { recipientId } : {}),
      ...(inboxId ? { inboxId } : {}),
      ...(input.roamId ? { roamId: input.roamId } : {}),
      ...(mention ? { mention } : {}),
      ...(inboxItem?.focusOwnerId ? { focusOwnerId: inboxItem.focusOwnerId } : {}),
      ...(inboxItem && this.isAutoReply(inboxItem) ? { ownerAutoReply: true } : {}),
      ...(revisedFrom ? { revised: true } : {}),
      ...(brief
        ? {
            preparation: {
              briefId: brief.id,
              purpose: brief.purpose,
              advice: brief.advice,
              ...(brief.mention ? { mention: brief.mention } : {}),
              ...(brief.judgment ? { judgment: brief.judgment } : {}),
            },
          }
        : {}),
    };
    this.d.store.reserve({
      id: record.id,
      operationId: record.operationId,
      platform: record.platform,
      requestId: record.requestId,
      accountId: record.accountId,
      target: record.target,
      text: record.text,
      kind: record.kind,
      ...(record.recipientId ? { recipientId: record.recipientId } : {}),
      ...(record.inboxId ? { inboxId: record.inboxId } : {}),
      ...(record.roamId ? { roamId: record.roamId } : {}),
      ...(record.mention ? { mention: record.mention } : {}),
      ...(record.focusOwnerId ? { focusOwnerId: record.focusOwnerId } : {}),
      ...(record.ownerAutoReply ? { ownerAutoReply: record.ownerAutoReply } : {}),
      ...(record.revised ? { revised: true } : {}),
      ...(record.preparation ? { preparation: record.preparation } : {}),
    });

    try {
      /**
       * **按配置选发送通道**。
       *
       * `api` 走接口（不用开浏览器，最省事）；`browser` 用真实 Chrome/Edge 点评论框
       * （更接近真人，更不容易被判定为机器人，但要装浏览器、也慢）。
       *
       * 两个通道都有各自的失败语义：浏览器失败时**可能已经点出去了**，
       * 所以 browser 的失败一律当 `unknown` 处理，只有 api 能明确区分"确定没发出去"。
       */
      const transport = this.cfg.posting.transport ?? 'api';
      const receipt =
        transport === 'browser' && this.d.browser
          ? await this.d.browser.send(target, text, signal, acc.id, mention ?? undefined)
          : await sendComment(this.d.client(), target, text, {
              signal,
              expectedAccountId: acc.id,
              ...(mention ? { mention } : {}),
            });

      // 发完立刻核验可见性（**用访客视角**）
      let visibility;
      try {
        visibility = await checkVisibility(this.d.client(), target, receipt.receiptId, signal);
      } catch {
        visibility = {
          status: 'unconfirmed' as const,
          detail: '核验本身失败，不能据此判断是否公开。不要重复发布。',
          checkedAt: new Date().toISOString(),
        };
      }

      const done: SendRecord = {
        ...record,
        status: 'sent',
        receiptId: receipt.receiptId,
        transport: receipt.transport,
        visibility,
        ...(receipt.platformState !== undefined ? { platformState: receipt.platformState } : {}),
      };
      this.d.store.updateSend(record.id, {
        status: 'sent',
        receiptId: receipt.receiptId,
        transport: receipt.transport,
        visibility,
        ...(receipt.platformState !== undefined ? { platformState: receipt.platformState } : {}),
      });

      if (inboxItem) this.handleInbox(inboxItem.id, '已回复', 'replied');

      return { ...done, submittedThisCall: true, delivery: describeDelivery(done) };
    } catch (error) {
      const e = error as BiliError;
      // **确定没发出去**：标 rejected，允许用同一 requestId 重试
      if (e.kind === 'auth' || e.kind === 'invalid' || e.kind === 'rejected' || e.kind === 'rate') {
        const failed: SendRecord = { ...record, status: 'rejected', detail: e.message };
        this.d.store.updateSend(record.id, { status: 'rejected', detail: failed.detail });
        return { ...failed, submittedThisCall: false, delivery: describeDelivery(failed) };
      }
      // **结果不明**（网络断在中间）：保持 unknown，**绝不允许重试**
      const unknown: SendRecord = {
        ...record,
        status: 'unknown',
        detail: `${e.message}（这次可能已经发出去了，先去核实，不要重发）`,
      };
      this.d.store.updateSend(record.id, { status: 'unknown', detail: unknown.detail });
      return { ...unknown, submittedThisCall: true, delivery: describeDelivery(unknown) };
    }
  }

  /* ---------------------------------------------------------------- 核验 */

  /** 复查一条回执的可见性。**只核验，不重发。** */
  async verify(id: string, signal?: AbortSignal): Promise<SendRecord | null> {
    const record = this.d.store.getSend(id);
    if (!record) return null;
    if (!record.receiptId) return record;
    // 已有 public / self-only 的结论不需要再查（self-only 是平台裁定，不会变好）
    if (record.visibility?.status === 'public') return record;
    try {
      const visibility = await checkVisibility(
        this.d.client(),
        record.target,
        record.receiptId,
        signal,
      );
      // 已经明确 self-only 的，后续读不到也不能降级成"待核验"
      const merged =
        visibility.status === 'unconfirmed' && record.visibility?.status === 'self-only'
          ? record.visibility
          : visibility;
      return this.d.store.updateSend(record.id, { visibility: merged });
    } catch {
      // 核验失败要保住原始回执，不能因为核不了就说发送失败
      return record;
    }
  }

  /** 批量复查最近那些还没定论的记录（只查 3 分钟内的，避免长期打接口）。 */
  async verifyRecent(signal?: AbortSignal): Promise<number> {
    const now = Date.now();
    const recent = this.d.store
      .outbox()
      .filter(
        (r) =>
          r.status === 'sent' &&
          r.receiptId &&
          r.visibility?.status !== 'public' &&
          r.visibility?.status !== 'self-only' &&
          now - Date.parse(r.createdAt) < 180_000 &&
          (!r.visibility || now - Date.parse(r.visibility.checkedAt) >= 20_000),
      )
      .slice(-2);
    let n = 0;
    for (const r of recent) {
      if (signal?.aborted) break;
      await this.verify(r.id, signal).catch(() => {});
      n += 1;
    }
    return n;
  }

  /* ---------------------------------------------------------------- 状态 */

  status() {
    const cfg = this.cfg;
    const acc = this.account;
    const today = this.day();
    const sentToday = this.d.store
      .outbox()
      .filter((r) => r.status !== 'rejected' && this.day(r.createdAt) === today).length;
    return {
      enabled: cfg.enabled,
      loggedIn: Boolean(this.d.secret(cfg.cookieSecret)),
      account: acc ? { id: acc.id, name: acc.name } : null,
      monitor: cfg.monitor,
      posting: {
        enabled: cfg.posting.enabled,
        transport: cfg.posting.transport,
        replyPriority: this.pendingReplies().length,
      },
      pendingReplies: this.pendingReplies().length,
      unknownSends: this.d.store.outbox().filter((r) => r.status === 'unknown').length,
      sentToday,
      lastPollAt: this.lastPollAt,
      lastError: this.lastError,
      // 三本账分别报，不要合成一个数
      quota: acc
        ? {
            repliesToday: this.usedToday('reply', acc.id),
            repliesLimit: cfg.posting.maxDailyReplies,
            proactiveToday: this.usedToday('proactive', acc.id),
            proactiveLimit: cfg.posting.maxDailyComments,
            focusToday: this.usedToday('focus', acc.id),
            recommendToday: this.usedToday('recommend', acc.id),
            recommendLimit: Math.max(0, Number(cfg.recommend?.maxDaily) || 0),
            perPersonLimit: MAX_REPLIES_PER_PERSON,
          }
        : null,
      roaming: roamingConfig(cfg).enabled,
      storage: this.storageLimit() ?? null,
    };
  }
}

/** 给人看的一句话，把状态和"该不该重发"说清楚。 */
export function describeDelivery(r: Pick<SendRecord, 'status' | 'visibility' | 'transport'>) {
  void r.transport;
  if (r.status === 'sent') {
    if (r.visibility?.status === 'public') {
      return { state: 'public', summary: '已在未登录访客的评论列表里读到这条评论。' };
    }
    if (r.visibility?.status === 'self-only') {
      return { state: 'self-only', summary: '平台已受理，但核验为仅自己可见；不要重发。' };
    }
    return {
      state: 'accepted',
      summary: '平台已受理并返回编号，公开与否尚未核实；这不是失败，不要重发。',
    };
  }
  if (r.status === 'unknown') {
    return {
      state: 'unknown',
      summary: '结果待核实 —— 可能已经发出去了。不能认定失败，也不能换文案或换编号再投同一位置。',
    };
  }
  if (r.status === 'sending') {
    return { state: 'sending', summary: '仍在处理中，不要重复提交。' };
  }
  return { state: 'rejected', summary: '这次确实没发出去，可以修正后重试。' };
}
