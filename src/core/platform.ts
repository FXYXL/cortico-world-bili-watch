/**
 * core/platform.ts — 社交层的类型定义（**历史遗留，与 `types.ts` 有重叠**）。
 *
 * ## 现状：同一批类型有两份
 *
 * 本文件是从多平台版本（B站/抖音/快手）带过来的，`social/` 下的
 * `store.ts` / `focus.ts` / `archive.ts` 都从这里取类型。
 * 而 `core/types.ts` 是重写社交层时新建的、单平台精简版。
 *
 * 两边**重叠**的有：`CommentTarget` `PublicComment` `InboxItem` `SendReceipt`
 *   `VisibilityReport` `SendRecord` `NotificationPage` `Account` `Video`
 *
 * 本文件**独有**：`PublicVideo` `FocusMention` `ConversationBrief`
 *   `PreparationNote` `SocialPlatform` `PlatformError` `describeDelivery`
 *
 * ## 该用哪个
 *
 * **新代码用 `core/types.ts`。** 本文件保留只是为了让那三个文件不用改 import。
 *
 * ## 两份定义已经造成过一次真实 bug
 *
 * 本文件的 `InboxItem` 有 `platform` 字段，`types.ts` 的没有。
 * 于是 `store.rememberContact()` 里的 `item.platform !== 'bilibili'`
 * 在单平台下恒真（`undefined !== 'bilibili'`），**联系人表永远是空的** ——
 * 而且不报错。真机验证「迁移后 contacts 为 0」时才发现的。
 *
 * 所以：**动这边的类型时，记得同步 `types.ts`**；或者干脆把它们合并掉。
 */

export interface CommentTarget {
  oid: string;
  type: number;
  root: string;
  parent: string;
}
export interface PublicVideo {
  ownerId?: string;
  publishedAt?: number;
  aid: string;
  id: string;
  title: string;
  url: string;
  author?: string;
  description?: string;
  updatedAt: string;
  observation?: string;
  unavailable?: boolean;
}
export interface PublicComment {
  createdAt?: number;
  authorId?: string;
  author: string;
  text: string;
  target: CommentTarget;
  id: string;
}
export interface FocusMention {
  id: string;
  name: string;
}
export interface ConversationBrief {
  mention?: FocusMention;
  judgment?: import('./judgment.ts').ParticipationJudgment;
  id: string;
  platform: string;
  accountId: string;
  target: CommentTarget;
  createdAt: string;
  purpose: string;
  draft: string;
  video?: PublicVideo;
  parent?: PublicComment;
  nearby: PublicComment[];
  recentOwn: string[];
  advice: string[];
  guidance: string[];
}
export interface PreparationNote {
  mention?: FocusMention;
  judgment?: import('./judgment.ts').ParticipationJudgment;
  briefId: string;
  purpose: string;
  advice: string[];
  parent?: PublicComment;
  video?: PublicVideo;
}
export interface InboxItem {
  ownerAutoReply?: boolean;
  id: string;
  platform: string;
  accountId: string;
  authorId: string;
  author: string;
  text: string;
  target: CommentTarget;
  occurredAt: number;
  status: 'pending' | 'handled';
  delivered?: boolean;
  deliveredAt?: string;
  retryAt?: string;
  notificationType?: 'mention' | 'reply' | 'focus-video' | 'focus-comment';
  focusOwnerId?: string;
  handling?: { kind: 'unsafe' | 'resource' | 'limit' | 'skip'; reason: string };
  url?: string;
}
export interface SendReceipt {
  receiptId: string;
  transport?: 'api' | 'browser';
  platformState?: number;
}
export interface VisibilityReport {
  status: 'public' | 'self-only' | 'unconfirmed';
  checkedAt: string;
  detail: string;
  platformState?: number;
}
export interface SendRecord {
  resourceUrl?: string;
  mention?: FocusMention;
  ownerAutoReply?: boolean;
  focusOwnerId?: string;
  recipientId?: string;
  id: string;
  operationId?: string;
  platform: string;
  accountId: string;
  text: string;
  target: CommentTarget;
  status: 'sending' | 'sent' | 'unknown' | 'rejected';
  createdAt: string;
  receiptId?: string;
  transport?: 'api' | 'browser';
  platformState?: number;
  visibility?: VisibilityReport;
  detail?: string;
  inboxId?: string;
  roamId?: string;
  preparation?: PreparationNote;
}
export interface NotificationPage {
  items: InboxItem[];
  cursor?: { id: string; time: number };
  done: boolean;
}
export interface Account {
  id: string;
  name: string;
}
export interface Video {
  kind?: 'video' | 'images';
  ownerId?: string;
  publishedAt?: number;
  id: string;
  aid: string;
  cid: string;
  title: string;
  description: string;
  author: string;
  durationSec: number;
  cover: string;
  url: string;
  parts: Array<{ cid: string; title: string; durationSec: number }>;
}
/** Each adapter owns platform-specific authentication, identifiers and HTTP endpoints. */
export interface SocialPlatform {
  readonly id: string;
  normalizeTarget(value: unknown): CommentTarget;
  validRecipientId?(value: string): boolean;
  account(signal?: AbortSignal): Promise<Account>;
  search(query: string, page: number, signal?: AbortSignal): Promise<unknown>;
  nextVideo?(seen: string[], signal?: AbortSignal): Promise<Video>;
  resolveCreator?(input: string, signal?: AbortSignal): Promise<Account>;
  creatorVideos?(
    uid: string,
    limit: number,
    signal?: AbortSignal,
  ): Promise<{ items: Array<Omit<PublicVideo, 'updatedAt'>> }>;
  video(id: string, part: number, signal?: AbortSignal): Promise<Video>;
  subtitles(video: Video, signal?: AbortSignal): Promise<unknown>;
  comments(
    target: CommentTarget,
    page: number,
    signal?: AbortSignal,
    cursor?: string,
  ): Promise<unknown>;
  notifications(
    lane: 'reply' | 'at',
    accountId: string,
    cursor?: { id: string; time: number },
    signal?: AbortSignal,
  ): Promise<NotificationPage>;
  send(
    target: CommentTarget,
    text: string,
    signal?: AbortSignal,
    expectedAccountId?: string,
    mention?: FocusMention,
  ): Promise<string | SendReceipt>;
  findOwnComment?(
    target: CommentTarget,
    text: string,
    accountId: string,
    signal?: AbortSignal,
  ): Promise<string | undefined>;
  checkVisibility?(
    target: CommentTarget,
    receiptId: string,
    signal?: AbortSignal,
  ): Promise<VisibilityReport>;
  frames?(
    video: Video,
    times: number[],
    signal?: AbortSignal,
  ): Promise<Array<{ atSec: number; bytes: Buffer }>>;
  stream?(video: Video, signal?: AbortSignal): Promise<string>;
}
export class PlatformError extends Error {
  constructor(
    message: string,
    readonly kind: 'auth' | 'rate' | 'rejected' | 'network' | 'invalid' = 'invalid',
  ) {
    super(message);
  }
}

export function describeDelivery(record: SendRecord) {
  const requiresBrowserSession =
    record.platform === 'douyin' ||
    record.platform === 'kuaishou' ||
    record.transport === 'browser';
  if (record.status === 'sent') {
    if (record.visibility?.status === 'public')
      return {
        state: 'public',
        summary: '已在未登录访客列表中读到此评论。',
        requiresBrowserSession,
      };
    if (record.visibility?.status === 'self-only')
      return {
        state: 'self-only',
        summary: '平台已受理，当前核验为仅自己可见；不要重发。',
        requiresBrowserSession,
      };
    return {
      state: 'accepted',
      summary: '平台已受理并返回编号，公开展示尚未核实；这不是发送失败，不补发。',
      requiresBrowserSession,
    };
  }
  if (record.status === 'unknown')
    return {
      state: 'unknown',
      summary: '发送结果待核实，不能认定失败，也不能换文案或编号重投同一位置。',
      requiresBrowserSession,
    };
  if (record.status === 'sending')
    return { state: 'sending', summary: '操作仍在处理中，不要重复提交。', requiresBrowserSession };
  return {
    state: 'rejected',
    summary: '本次未被受理，见具体原因；不要把它与结果待核实混为一谈。',
    requiresBrowserSession,
  };
}
