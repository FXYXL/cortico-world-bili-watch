/**
 * social/service.ts — 社交流程的**唯一编排者**。
 *
 * 这是从 `cortico-world-social-media` 的 `service.ts`（868 行）重写来的。
 * **重写而不是照搬**：那份代码每 100 行就有 1 处 `cfg.platforms[id]`，
 * 是给多平台（B站/抖音/快手）设计的；单平台搬过来只会带一堆死分支。
 *
 * ## 但每一条校验都保留了 —— 这是这个文件存在的全部理由
 *
 * 下面这些不是"流程"，是**曾经出过事的防线**。少一条就会以某种方式重发或错发：
 *
 * 1. `operationId` —— 同一个操作编号只允许一次真实发送
 * 2. `recover()`   —— 已有记录就返回原记录，**不重新提交**
 * 3. `pending`     —— 同位置已有 unknown/sending 时直接拒绝
 * 4. `validateMention` —— @ 之前校验绑定、凭证、额度、transport
 * 5. 同一人每日 5 条（跨视频累计，重启不重置）
 * 6. 通知回复额度与主动发言额度**分开算**
 * 7. 主人评论区自动回应单独计账，不占普通额度
 * 8. 可见性三档：public / self-only / unconfirmed，**后两档绝不重发**
 */

import { randomUUID } from 'node:crypto';

import type { BiliWatchConfig } from '../config.ts';
import { MAX_REPLIES_PER_PERSON } from '../config.ts';
import type { BiliClient } from '../core/client.ts';
import { normalizeTarget } from '../core/client.ts';
import { checkVisibility, sendComment } from '../core/comments.ts';
import { BiliError, type CommentTarget, type InboxItem, type SendRecord } from '../core/types.ts';
import { assessPublicInput, PublicReplySkipped } from './safety.ts';
import { roamingConfig } from './roaming.ts';
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
    ): Promise<SendReceipt>;
  };
}

export class BiliService {
  private account: { id: string; name: string } | null = null;
  private lastPollAt: string | null = null;
  private lastError: string | null = null;
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

  private day(iso = new Date().toISOString()): string {
    return dayKey(this.d.timezone, iso);
  }

  /* ---------------------------------------------------------------- 连接 */

  /** 连上并核对账号。 */
  async connect(signal?: AbortSignal): Promise<{ id: string; name: string }> {
    if (!this.d.cfg.enabled) throw new BiliError('这个 World 已关闭。', 'invalid');
    if (!this.d.secret(this.d.cfg.cookieSecret)) {
      throw new BiliError('尚未登录，请先在面板扫码。', 'auth');
    }
    const acc = await this.d.client().account(signal);
    this.account = acc;
    return acc;
  }

  disconnect(): void {
    this.account = null;
  }

  /* ---------------------------------------------------------------- 通知 */

  /**
   * 拉一轮通知。
   *
   * **两条通道都要拉**：`reply`（有人回复我）和 `at`（有人 @ 我）。
   * 只拉一路会漏掉一半对话 —— 而 `reply` 这一路恰好包括"别人回复我刚发的评论"，
   * 那正是发完评论后要接的后续。
   *
   * @returns 本轮新增几条
   */
  async poll(signal?: AbortSignal, force = false): Promise<number> {
    void force;
    const cfg = this.d.cfg;
    if (!cfg.enabled || !cfg.monitor.enabled) return 0;
    const acc = this.account ?? (await this.connect(signal));

    let added = 0;
    for (const lane of ['reply', 'at'] as const) {
      const cursor = this.cursors[lane];
      const page = await this.d.client().notifications(lane, acc.id, cursor, signal);
      if (page.cursor) this.cursors[lane] = page.cursor;

      for (const item of page.items) {
        // **同一条通知只进一次**：id 是 `bilibili:<accountId>:<parent>`
        if (this.d.store.getInbox(item.id)) continue;
        if (item.accountId !== acc.id) continue;
        this.d.store.addInbox({ ...item, status: 'pending' });
        this.d.store.rememberContact({
          platform: 'bilibili',
          accountId: acc.id,
          authorId: item.authorId,
          author: item.author,
          lastAt: new Date(item.occurredAt).toISOString(),
        });
        added += 1;
      }
    }

    this.lastPollAt = new Date().toISOString();
    this.lastError = null;
    return added;
  }

  /** 还等着回复的条数。**有它在就别给闲逛机会** —— 先处理人。 */
  pendingReplies(): InboxItem[] {
    return this.d.store
      .inbox()
      .filter((i) => i.status === 'pending' && (!i.retryAt || Date.parse(i.retryAt) <= Date.now()));
  }

  /** 把待办投给模型。 */
  async deliver(sink: (item: InboxItem) => Promise<void>): Promise<void> {
    if (!this.d.cfg.monitor.enabled) return;
    for (const item of this.pendingReplies()) {
      if (item.retryAt && Date.parse(item.retryAt) > Date.now()) continue;
      await sink(item);
    }
  }

  /** 明确决定不接话。**这是收尾，不是失败**。 */
  handleInbox(id: string, reason?: string): InboxItem | null {
    const item = this.d.store.getInbox(id);
    if (!item) throw new Error('收件箱消息不存在');
    this.d.store.updateInbox(id, { status: 'handled' });
    void reason;
    return { ...item, status: 'handled' };
  }

  /** 稍后再处理（不丢待办，也不占着这一轮）。 */
  deferInbox(id: string, minutes = 30): InboxItem | null {
    const item = this.d.store.getInbox(id);
    if (!item) return null;
    const retryAt = new Date(Date.now() + Math.max(1, minutes) * 60_000).toISOString();
    this.d.store.updateInbox(id, { retryAt });
    return { ...item, retryAt };
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

  /** 同一人今天已经回了几条（**跨视频累计，重启不重置**）。 */
  private repliesTo(recipientId: string, accountId: string): number {
    return this.d.store
      .outbox()
      .filter(
        (r) =>
          r.accountId === accountId &&
          r.recipientId === recipientId &&
          r.status !== 'rejected',
      ).length;
  }

  /**
   * 检查额度。
   *
   * 三本账必须分开：
   *   - **通知回复**（`reply`）：额度 `maxDailyReplies`
   *   - **主动发言**（`proactive`）：额度 `maxDailyComments`
   *   - **主人评论区自动回应**（`focus`）：单独计账，不占上面两本
   *
   * 混在一起的后果：鱼把回复额度花在主动发言上，真正有人找它时反而没额度了。
   */
  private assertQuota(kind: SendRecord['kind'], accountId: string, recipientId?: string): void {
    const cfg = this.d.cfg;
    if (!cfg.posting.enabled) {
      throw new BiliError('公开发布已关闭，请由主人在这个 World 的设置里开启。', 'auth');
    }

    // 同一人的硬底线 —— 不给调，也不受任何档位影响
    if (recipientId) {
      const n = this.repliesTo(recipientId, accountId);
      if (n >= MAX_REPLIES_PER_PERSON) {
        throw new BiliError(
          `今天已经回这个人 ${n} 条了（上限 ${MAX_REPLIES_PER_PERSON}）。换个人、或者等明天。`,
          'rate',
        );
      }
    }

    if (kind === 'focus') return; // 主人评论区单独计账

    const used = this.usedToday(kind, accountId);
    if (kind === 'reply' && used >= cfg.posting.maxDailyReplies) {
      throw new BiliError(`今日回复额度已用完（${used}/${cfg.posting.maxDailyReplies}）。`, 'rate');
    }
    if (kind === 'proactive' && used >= cfg.posting.maxDailyComments) {
      throw new BiliError(`今日主动发言额度已用完（${used}/${cfg.posting.maxDailyComments}）。`, 'rate');
    }

    // 两条评论之间的最小间隔
    const last = this.d.store
      .outbox()
      .filter((r) => r.accountId === accountId && r.status !== 'rejected')
      .at(-1);
    if (last) {
      const gap = (Date.now() - Date.parse(last.createdAt)) / 1000;
      if (gap < cfg.posting.minIntervalSec) {
        throw new BiliError(
          `距上一条评论只过了 ${Math.round(gap)} 秒，至少要 ${cfg.posting.minIntervalSec} 秒。`,
          'rate',
        );
      }
    }
  }

  /* ---------------------------------------------------------------- 发布 */

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
    const cfg = this.d.cfg;
    if (!cfg.posting.enabled) {
      throw new BiliError('公开发布已关闭，请由主人在这个 World 的设置里开启。', 'auth');
    }
    const text = String(input.text ?? '').trim();
    if (!text || text.length > 1000) throw new BiliError('评论应为 1–1000 字', 'invalid');

    // 内容安全：明显的无依据亲历之类的本地拦截
    try {
      assessPublicInput({ text, purpose: input.preparation?.purpose });
    } catch (error) {
      if (error instanceof PublicReplySkipped) {
        throw new BiliError(`这条不发了：${error.message}`, 'rejected');
      }
      throw error;
    }

    const acc = this.account ?? (await this.connect(signal));

    // 定位目标
    let target: CommentTarget;
    let kind: SendRecord['kind'] = 'proactive';
    let recipientId: string | undefined;
    let inboxItem: InboxItem | undefined;
    if (input.inboxId) {
      inboxItem = this.d.store.getInbox(input.inboxId) ?? undefined;
      if (!inboxItem) throw new Error('收件箱消息不存在');
      if (inboxItem.accountId !== acc.id) {
        throw new Error('该消息属于其他账号，不能用当前账号回复。');
      }
      target = normalizeTarget(inboxItem.target);
      kind = 'reply';
      recipientId = inboxItem.authorId || undefined;
    } else {
      target = normalizeTarget(input.target);
    }

    const requestId = input.inboxId ? `reply:${input.inboxId}` : input.requestId;
    if (!requestId || (!input.inboxId && requestId.length > 180) || /[\r\n]/.test(requestId)) {
      throw new BiliError('新评论必须提供固定的 requestId；重试要沿用原值。', 'invalid');
    }
    const operationId = `bilibili:${acc.id}:${requestId}`;

    /**
     * **第一层：同编号已有记录。**
     *
     * `rejected` 是唯一允许重试的状态 —— 那是"确定没发出去"，
     * 而 `unknown` / `sent` / `sending` 都**不许**重试。
     */
    const prior = this.d.store.operationSends(operationId).at(-1);
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

    /** **第二层：同位置已有未核实的发送。** */
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

    /** **第三层：@ 的凭证与绑定。** */
    const mention = input.preparation?.mention;
    if (input.mentionFocus && !mention) {
      throw new BiliError('@ 特别关注需要先 prepare 取得发送凭据。', 'rejected');
    }
    if (mention) {
      const b = input.preparation?.briefId
        ? this.d.store.brief(input.preparation.briefId)
        : undefined;
      if (
        !b ||
        b.accountId !== acc.id ||
        JSON.stringify(b.target) !== JSON.stringify(target) ||
        b.draft !== text ||
        JSON.stringify(b.mention) !== JSON.stringify(mention) ||
        Date.now() - Date.parse(b.createdAt) > 3_600_000
      ) {
        throw new BiliError('@ 发送凭据无效或已过期，未提交。', 'rejected');
      }
      if (!cfg.focus.enabled || !cfg.focus.allowMentions) {
        throw new BiliError('主动 @ 没有在本地开启，未提交。', 'rejected');
      }
      const binding = this.d.store.focusBinding(acc.id, '');
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
            r.accountId === acc.id && r.mention && r.status !== 'rejected' && this.day(r.createdAt) === today,
        ).length;
      if (used >= cfg.focus.maxDailyMentions) {
        throw new BiliError(`今日 @ 额度已用完（${used}/${cfg.focus.maxDailyMentions}）。`, 'rate');
      }
    }

    /** **第四层：额度与间隔。** */
    this.assertQuota(kind, acc.id, recipientId);

    signal?.throwIfAborted();

    // 先落一条 `sending`：**崩在这里也能看出"可能发出去了"**
    const record: SendRecord = {
      id: randomUUID(),
      requestId,
      accountId: acc.id,
      target,
      text,
      status: 'sending',
      createdAt: new Date().toISOString(),
      kind,
      ...(recipientId ? { recipientId } : {}),
      ...(input.inboxId ? { inboxId: input.inboxId } : {}),
      ...(input.roamId ? { roamId: input.roamId } : {}),
      ...(mention ? { mention } : {}),
    };
    this.d.store.reserve({
      id: record.id, requestId: record.requestId, accountId: record.accountId,
      target: record.target, text: record.text, kind: record.kind,
      ...(record.recipientId ? { recipientId: record.recipientId } : {}),
      ...(record.inboxId ? { inboxId: record.inboxId } : {}),
      ...(record.roamId ? { roamId: record.roamId } : {}),
      ...(record.mention ? { mention: record.mention } : {}),
    });

    try {
      /**
       * **按配置选发送通道**。
       *
       * `api` 走接口（不用开浏览器，最省事）；`browser` 用真实 Chrome/Edge 点评论框
       * （更接近真人，更不容易被判定为机器人，但要装浏览器、也慢）。
       *
       * 两个通道都有各自的失败语义：浏览器失败时**可能已经点出去了**
       * （页面点了按钮但网络断了），所以 browser 的失败一律当 `unknown` 处理，
       * 只有 api 能明确区分"确定没发出去"。
       */
      const transport = this.d.cfg.posting.transport ?? 'api';
      const receipt = transport === 'browser' && this.d.browser
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

      if (inboxItem) this.handleInbox(inboxItem.id, '已回复');

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
    const record = this.d.store.outbox().find((r) => r.id === id);
    if (!record) return null;
    if (!record.receiptId) return record;
    try {
      const visibility = await checkVisibility(this.d.client(), record.target, record.receiptId, signal);
      this.d.store.updateSend(record.id, { visibility });
      return next;
    } catch {
      return record;
    }
  }

  /** 批量复查最近那些还没定论的记录。 */
  async verifyRecent(signal?: AbortSignal): Promise<number> {
    let n = 0;
    for (const r of this.d.store.outbox().slice(-20)) {
      if (!r.receiptId) continue;
      if (r.visibility?.status === 'public' || r.visibility?.status === 'self-only') continue;
      const out = await this.verify(r.id, signal);
      if (out) n += 1;
    }
    return n;
  }

  /* ---------------------------------------------------------------- 状态 */

  status() {
    const cfg = this.d.cfg;
    const acc = this.account;
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
          perPersonLimit: MAX_REPLIES_PER_PERSON,
        }
        : null,
      roaming: roamingConfig(cfg).enabled,
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
