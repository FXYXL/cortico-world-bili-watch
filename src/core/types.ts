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

/** 一次通知（别人回复我 / @ 我 / 主人评论区）。 */
export interface InboxItem {
  /** `bilibili:<accountId>:<parent>` —— 用它去重，同一楼重复通知只留一条。 */
  id: string;
  /**
   * 单平台，但**必须写**。
   *
   * `store.rememberContact()` 曾经因为没有这个字段，`item.platform !== 'bilibili'`
   * 恒真、联系人表永远是空的 —— 真机验证「迁移后 contacts 为 0」才发现。
   * 现在统一由 service 填 `'bilibili'`，别再靠 `?? 'bilibili'` 兜底。
   */
  platform?: string;
  accountId: string;
  authorId: string;
  author: string;
  text: string;
  target: CommentTarget;
  occurredAt: number;
  status: 'pending' | 'handled';
  notificationType: 'reply' | 'mention' | 'focus-video' | 'focus-comment';
  url?: string;
  /** 什么时候该再看（`defer` 用）。 */
  retryAt?: string;
  /** 已经投给模型了没有。**没有它就会每轮重投同一条待办**。 */
  delivered?: boolean;
  deliveredAt?: string;
  /** 这条来自特别关注（主人评论区），有值就走 `focus` 那本账。 */
  focusOwnerId?: string;
  /** 主人评论区自动回应：单独计账，不占普通额度。 */
  ownerAutoReply?: boolean;
  /** 被本机规则直接收尾时的原因（`skip` / `limit` 等），面板会显示。 */
  handling?: { kind: 'unsafe' | 'resource' | 'limit' | 'skip' | 'replied'; reason: string };
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
  /**
   * 防重主键：`bilibili:<accountId>:<requestId>`。
   *
   * **必须落盘**。`store.operationSends()` 用 `(r.operationId ?? r.id) === id` 比对，
   * 而新记录的 `id` 是随机 UUID —— 只写 `requestId` 不写 `operationId` 的话，
   * 第一层防重会永远查不到（实测：reserve 一条后 `operationSends` 返回 `[]`），
   * 同一 requestId 可以重复发同一条评论。
   */
  operationId?: string;
  /** 单平台，但要写：`hasSend()` 早先因为缺这个字段恒返回 false。 */
  platform?: string;
  /** 稳定的防重键。**同一个 requestId 只能有一次发送**。 */
  requestId: string;
  accountId: string;
  /** 回给谁（同一个人每日配额按这个算）。 */
  recipientId?: string;
  /** 发出去的文案相对凭据里的草稿做过润色（内容判断已按新文案重跑）。 */
  revised?: boolean;
  target: CommentTarget;
  text: string;
  status: SendStatus;
  createdAt: string;
  receiptId?: string;
  transport?: 'api' | 'browser';
  visibility?: VisibilityReport;
  detail?: string;
  platformState?: number;
  inboxId?: string;
  roamId?: string;
  /** 这条是回复通知 / 主动发言 / 特别关注 / 推荐给主人 —— 四本账靠它分开。 */
  kind: 'reply' | 'proactive' | 'focus' | 'recommend';
  /** 主人评论区自动回应单独计账。 */
  focusOwnerId?: string;
  ownerAutoReply?: boolean;
  /** 这条发言里 @ 了谁（有就说明用掉了 @ 额度）。 */
  mention?: { id: string; name: string };
  /** prepare 留下的凭据摘要（审计用）。 */
  preparation?: PreparationNote;
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

/* ------------------------------------------------------------------ 社交侧 */
/* 下面这几个原本定义在 `core/platform.ts`（多平台版本带过来的）。            */
/* 现在统一放这里，`platform.ts` 只做 re-export —— 两份同名类型已经            */
/* 造成过一次真实 bug（`InboxItem.platform` 缺失导致联系人表恒为空）。        */

/** 归档过的作品（面板按它显示卡片标题）。 */
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

/** 被 @ 的对象。**必须是核验过的 UID**，不靠文本 @。 */
export interface FocusMention {
  id: string;
  name: string;
}

/** prepare 产出的凭据摘要。 */
export interface PreparationNote {
  mention?: FocusMention;
  judgment?: import('../social/judgment.ts').ParticipationJudgment;
  briefId: string;
  purpose: string;
  advice: string[];
  parent?: PublicComment;
  video?: PublicVideo;
}

/** 一份完整的接话凭据（存进 `briefs[]`）。 */
export interface ConversationBrief {
  id: string;
  platform?: string;
  accountId: string;
  target: CommentTarget;
  createdAt: string;
  purpose: string;
  draft: string;
  /** prepare 时明确要 @ 谁（`mentionFocus`）。publish 只认这一份。 */
  mention?: FocusMention;
  /**
   * 这份凭据是从哪条通知来的。publish 只带 briefId 时靠它认出"我是在回通知"，
   * 才能自动标已回复、并按 `reply:<通知id>` 派生防重键。
   */
  sourceInboxId?: string;
  /**
   * 该回给谁（平台账号 id）。来自收件箱的 authorId —— 收到通知那一刻就确定了。
   * 存进凭据是因为 publish 常常只带 briefId：那时回头读楼中楼找父评论作者
   * 经常找不到（父评论排在最后一页），会把能回的楼卡成「暂未取得身份」。
   */
  recipientId?: string;
  video?: PublicVideo;
  videoTitle?: string;
  parent?: PublicComment;
  nearby: Array<Pick<PublicComment, 'author' | 'text'>>;
  recentOwn: string[];
  advice: string[];
  guidance: string[];
  judgment?: import('../social/judgment.ts').ParticipationJudgment;
}

export const isHttpUrl = (v: string): boolean => /^https?:\/\//i.test(String(v ?? '').trim());

/** 像不像一个 B 站视频标识（BV 号 / av 号 / 站内链接）。 */
export const looksLikeBiliVideo = (v: string): boolean => {
  const s = String(v ?? '').trim();
  return /bilibili\.com/i.test(s) || /^(BV[0-9A-Za-z]{10}|av\d{1,20})$/i.test(s);
};
