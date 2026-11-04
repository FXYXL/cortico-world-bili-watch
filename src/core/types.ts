/**
 * core/types.ts — B 站插件里的所有 ID 与目标类型。
 *
 * ## 为什么 ID 全是字符串
 *
 * B 站的 `aid` / `cid` / `avid` 真的会超过 JS 的安全整数（2^53）。
 * `JSON.parse` 遇到它们会**静默变成一个看起来正常但已经错的值** —— 而且不报错。
 * 所以：**解析前先把 16 位以上的整数转成字符串**（见 `parsePlatformJson`），
 * 之后全程当字符串走，只在需要参与 API 调用时拼成 URL 参数。
 *
 * 这一条不是洁癖：`cid` 错一位就会取到**另一个视频的流**，而画面看起来完全正常。
 */

/** 视频标识：BV 号或 av 号，统一成 `BV…` / `av…` 两种前缀写法。 */
export type VideoId = string;

/** 分P 的 cid（字符串形式的数字）。 */
export type Cid = string;

/**
 * 评论区目标。
 *
 * - `oid`：视频 aid / 动态 id（**不是** BV 号 —— B 站评论接口只认数字）
 * - `type`：`1`=视频、`11`=动态、`17`=动态评论
 * - `root`：顶层楼层的 rpid；新评论为 `'0'`
 * - `parent`：要回复的那条评论的 rpid；新评论为 `'0'`
 *
 * **`root` 和 `parent` 必须同时为 `'0'` 或同时非 `'0'`** —— 只给一个是错的，
 * B 站会把它当成"回复到某个不存在的楼层"。这个校验放在 `normalizeTarget()` 里。
 */
export interface CommentTarget {
  oid: string;
  type: 1 | 11 | 17;
  root: string;
  parent: string;
}

export interface VideoPart {
  cid: Cid;
  page: number;
  title: string;
  durationSec: number;
}

export interface Video {
  /** BV 号。 */
  id: VideoId;
  aid: string;
  /** 当前选中分P 的 cid。 */
  cid: Cid;
  title: string;
  description: string;
  author: string;
  ownerId: string;
  durationSec: number;
  cover: string;
  url: string;
  parts: VideoPart[];
}

export interface Account {
  /** DedeUserID */
  id: string;
  name: string;
}

export interface PublicComment {
  id: string;
  authorId: string;
  author: string;
  text: string;
  createdAt?: number;
  target: CommentTarget;
  replies: PublicComment[];
}

/** 一次通知（别人回复我 / @ 我）。 */
export interface InboxItem {
  /** `bilibili:<accountId>:<parent>` —— 用它去重，同一楼重复通知只留一条。 */
  id: string;
  accountId: string;
  authorId: string;
  author: string;
  text: string;
  target: CommentTarget;
  occurredAt: number;
  status: 'pending' | 'handled';
  notificationType: 'reply' | 'mention';
  url?: string;
  /** 什么时候该再看（`defer` 用）。 */
  retryAt?: string;
}

/** 一次发送的结局。**这五个状态不能混** —— 弄混就是重发或漏发。 */
export type SendStatus = 'sending' | 'sent' | 'unknown' | 'rejected';

export interface VisibilityReport {
  /** `public` = 访客看得到；`self-only` = 平台判定仅自己可见；`unconfirmed` = 核不了。 */
  status: 'public' | 'self-only' | 'unconfirmed';
  detail: string;
  checkedAt: string;
  platformState?: number;
}

export interface SendReceipt {
  receiptId: string;
  transport: 'api' | 'browser';
  platformState?: number;
}

export interface SendRecord {
  id: string;
  /** 稳定的防重键。**同一个 requestId 只能有一次发送**。 */
  requestId: string;
  accountId: string;
  /** 回给谁（同一个人每日配额按这个算）。 */
  recipientId?: string;
  target: CommentTarget;
  text: string;
  status: SendStatus;
  createdAt: string;
  receiptId?: string;
  transport?: 'api' | 'browser';
  visibility?: VisibilityReport;
  detail?: string;
  inboxId?: string;
  roamId?: string;
  /** 这条是回复通知还是主动发言 —— 两个额度账本靠它分开。 */
  kind: 'reply' | 'proactive' | 'focus';
  /** 主人评论区自动回应单独计账。 */
  focusOwnerId?: string;
}

/** B 站错误分类。**分类决定模型下一步做什么**，所以不能糊成一个 Error。 */
export class BiliError extends Error {
  constructor(
    message: string,
    readonly kind: 'auth' | 'rate' | 'rejected' | 'network' | 'invalid' = 'invalid',
  ) {
    super(message);
    this.name = 'BiliError';
  }
}

/** 通知的一页。`cursor` 为空表示没有下一页。 */
export interface NotificationPage {
  items: InboxItem[];
  cursor?: { id: string; time: number };
  done: boolean;
}

export const isHttpUrl = (v: string): boolean => /^https?:\/\//i.test(String(v ?? '').trim());

/** 像不像一个 B 站视频标识（BV 号 / av 号 / 站内链接）。 */
export const looksLikeBiliVideo = (v: string): boolean => {
  const s = String(v ?? '').trim();
  return /bilibili\.com/i.test(s) || /^(BV[0-9A-Za-z]{10}|av\d{1,20})$/i.test(s);
};
