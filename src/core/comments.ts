/**
 * core/comments.ts — 评论区：读、翻页、楼中楼、发、核验可见性。
 *
 * ## 这几段是从社交视窗原样搬过来的，因为每一行都是踩出来的
 *
 * 1. **顶层翻页必须带游标**（`pagination_str` 里的 `offset`）。
 *    `pn` 那套分页参数只对楼中楼有效；对顶层用了它会跳过或重复评论，
 *    而接口不报错 —— 你只会发现"怎么漏了半页"。
 * 2. **发评论前要核对账号没变**。用户可能在发送途中重新扫码；
 *    变化了还发，评论就挂到另一个账号名下。
 * 3. **可见性核验必须用未登录访客视角**。用自己的账号读，审核中的评论也读得到，
 *    会把"还在审核"误报成"已公开"。
 * 4. **`state === 17` 是"仅自己可见"的明确信号**。这时**绝不重发** ——
 *    重发只会得到另一条同样被限的评论，还可能触发风控。
 */

import { cookieField, type BiliClient } from './client.ts';
import { numericId, normalizeTarget } from './client.ts';
import { BiliError, type CommentTarget, type PublicComment, type VisibilityReport, type SendReceipt } from './types.ts';

const cleanText = (v: unknown, max = 8000): string =>
  String(v ?? '')
    .replace(/<[^>]*>/g, '')
    .slice(0, max);

export interface CommentPage {
  page: number;
  total?: number;
  /** 顶层评论的下一页游标。**楼中楼没有这个字段**。 */
  nextCursor?: string;
  hasMore?: boolean;
  /** 楼中楼模式下，这一楼本身。 */
  root?: PublicComment;
  items: PublicComment[];
}

/** 把接口返回的一条评论投影成我们的形状（含前 5 条楼中楼）。 */
function project(r: any, t: CommentTarget): PublicComment {
  return {
    id: numericId(r.rpid),
    authorId: String(r.mid ?? r.member?.mid ?? ''),
    author: cleanText(r.member?.uname, 80),
    text: cleanText(r.content?.message),
    createdAt: typeof r.ctime === 'number' ? r.ctime : undefined,
    target: { oid: t.oid, type: t.type, root: String(r.root || r.rpid), parent: String(r.rpid) },
    replies: (r.replies ?? []).slice(0, 5).map((s: any) => ({
      id: String(s.rpid),
      authorId: String(s.mid ?? s.member?.mid ?? ''),
      author: cleanText(s.member?.uname, 80),
      text: cleanText(s.content?.message),
      target: {
        oid: t.oid,
        type: t.type,
        root: String(s.root || r.rpid),
        parent: String(s.rpid),
      },
      replies: [],
    })),
  };
}

/**
 * 读一页评论。
 *
 * `target.root === '0'` → 读顶层（游标分页）；
 * 否则 → 读那一楼下面的回复（`pn` 分页）。
 */
export async function readComments(
  client: BiliClient,
  input: CommentTarget,
  page = 1,
  signal?: AbortSignal,
  cursor?: string,
): Promise<CommentPage> {
  const t = normalizeTarget(input);
  if (cursor !== undefined && (typeof cursor !== 'string' || cursor.length > 4000)) {
    throw new BiliError('评论游标无效', 'invalid');
  }
  // 顶层翻页没有游标就会跳过/重复 —— 宁可报错也不给错的结果
  if (t.root === '0' && page > 1 && !cursor) {
    throw new BiliError('顶层评论翻页请传入上一页返回的 nextCursor，避免跳过或重复评论。', 'invalid');
  }

  const d =
    t.root === '0'
      ? await client.wbi(
        '/x/v2/reply/wbi/main',
        {
          oid: t.oid,
          type: t.type,
          mode: 2,
          pagination_str: JSON.stringify({ offset: cursor ?? '' }),
        },
        signal,
      )
      : await client.api(
        '/x/v2/reply/reply',
        { oid: t.oid, type: t.type, root: t.root, pn: Math.max(1, Math.min(500, page)), ps: 20 },
        signal,
      );

  return {
    page,
    ...(typeof (d.cursor?.all_count ?? d.page?.count) === 'number'
      ? { total: Number(d.cursor?.all_count ?? d.page?.count) }
      : {}),
    ...(t.root === '0'
      ? {
        ...(d.cursor?.pagination_reply?.next_offset
          ? { nextCursor: String(d.cursor.pagination_reply.next_offset) }
          : {}),
        hasMore: d.cursor?.is_end === false,
      }
      : {}),
    ...(d.root ? { root: project(d.root, t) } : {}),
    items: (d.replies ?? []).map((r: any) => project(r, t)),
  };
}

/**
 * 发评论。
 *
 * 顺序**不能乱**：
 *   1. 校验目标与长度（错的东西根本不该发出去）
 *   2. 补齐会话（缺 buvid 时向 B 站要）
 *   3. 拿 csrf（就是 `bili_jct`）
 *   4. **核对 cookie 没变、accountId 与预期一致**
 *   5. 签名 → POST
 *
 * 第 4 步是最容易被"优化"掉的，也是出事最难查的：账号中途换了，
 * 评论会挂到另一个号上，而所有日志都看不出异常。
 */
export async function sendComment(
  client: BiliClient,
  input: CommentTarget,
  text: string,
  opts: {
    signal?: AbortSignal;
    expectedAccountId?: string;
    mention?: { id: string; name: string };
  } = {},
): Promise<SendReceipt> {
  const t = normalizeTarget(input);
  const mention = opts.mention;
  if (mention && (!mention.name.trim() || mention.name.length > 80 || /[\r\n@]/.test(mention.name))) {
    throw new BiliError('@账号名称无效，未提交。', 'invalid');
  }
  const message = (mention ? `@${mention.name} ` : '') + text.trim();
  if (!message) throw new BiliError('评论不能为空', 'invalid');
  if (message.length > 1000) throw new BiliError('评论应为 1–1000 字', 'invalid');

  await client.prepareSession(opts.signal);

  const csrf = cookieField(client.currentCookie(), 'bili_jct');
  if (!csrf) throw new BiliError('尚未登录或缺少发布凭证。', 'auth');
  opts.signal?.throwIfAborted();

  const before = client.currentCookie();

  // 签名（这一步会顺便刷新 wbi 钥匙）
  const signed = await client.signGuest({}, opts.signal);

  if (
    client.currentCookie() !== before ||
    (opts.expectedAccountId &&
      !client.currentCookie()
        .split(';')
        .some((v) => v.trim() === `DedeUserID=${opts.expectedAccountId}`))
  ) {
    throw new BiliError('发送前账号已变化或与预期不符，尚未提交。', 'auth');
  }

  const d = await client.api('/x/v2/reply/add', signed, opts.signal, {
    form: {
      ...t,
      message,
      csrf,
      plat: 1,
      ...(mention
        ? { at_name_to_mid: `{${JSON.stringify(mention.name)}:${numericId(mention.id)}}` }
        : {}),
      // 这两个参数 B 站前端会带；不带时评论有时被判成"客户端"，容易进审核
      gaia_source: 'main_web',
      statistics: JSON.stringify({ appId: 100, platform: 5 }),
    },
  });

  const receiptId = d.rpid_str ?? d.rpid ?? d.reply?.rpid_str ?? d.reply?.rpid;
  if (!receiptId) {
    throw new BiliError('平台未返回评论编号，请核实是否已发布（这个结果不明，不要重发）。', 'network');
  }
  return {
    receiptId: numericId(receiptId),
    transport: 'api',
    ...(typeof d.reply?.state === 'number' ? { platformState: d.reply.state } : {}),
  };
}

/**
 * 核验一条评论对**未登录访客**是否可见。
 *
 * 判据分三档，**不能合并**：
 *   `public`      —— 访客列表里读到了，且状态不是 17
 *   `self-only`   —— B 站明确 `state === 17`（仅自己可见）
 *   `unconfirmed` —— 读不到或读不全。**这不是失败，也不是"仅自己可见"**
 *
 * 最后一档最容易被写错：把"核不了"说成"失败"会诱导模型重发，
 * 而重发才是真正的坏事（可能触发风控，也把对话搞乱）。
 */
export async function checkVisibility(
  client: BiliClient,
  input: CommentTarget,
  receiptId: string,
  signal?: AbortSignal,
): Promise<VisibilityReport> {
  const t = normalizeTarget(input);
  const id = numericId(receiptId);
  const budget = AbortSignal.timeout(8000);
  const checkSignal = signal ? AbortSignal.any([signal, budget]) : budget;

  const report = (
    status: VisibilityReport['status'],
    detail: string,
    platformState?: number,
  ): VisibilityReport => ({
    status,
    detail,
    checkedAt: new Date().toISOString(),
    ...(platformState === undefined ? {} : { platformState }),
  });

  /** 在返回结构里找那条评论。B 站把不同位置的评论放在不同字段里。 */
  const find = (d: any): any | undefined => {
    const roots = [d.root, ...(d.replies ?? []), ...(d.top_replies ?? []), d.top?.upper].filter(Boolean);
    return roots
      .flatMap((r: any) => [r, ...(r.replies ?? [])])
      .find((r: any) => String(r.rpid_str ?? r.rpid) === id);
  };

  // ① 访客视角（**必须匿名**：用自己账号读会把审核中的也读出来）
  const guest = new (client.constructor as any)({ cookie: () => '' }) as BiliClient;
  try {
    const d =
      t.root === '0'
        ? await guest.wbi(
          '/x/v2/reply/wbi/main',
          {
            oid: t.oid,
            type: t.type,
            mode: 2,
            seek_rpid: id,
            pagination_str: JSON.stringify({ offset: '' }),
          },
          checkSignal,
        )
        : await guest.api(
          '/x/v2/reply/reply',
          { oid: t.oid, type: t.type, root: t.root, pn: 1, ps: 20 },
          checkSignal,
        );
    const r = find(d);
    if (r && r.state !== 17) {
      return report('public', '已在未登录访客的评论列表中读到本条评论；可见性可能随后变化。', r.state);
    }
  } catch {
    // 访客读失败**不等于**审核判定 —— 继续走下一档
  }

  // ② 自己的视角：能明确看到 state 17 才算"仅自己可见"
  try {
    const d = await client.api(
      '/x/v2/reply/reply',
      { oid: t.oid, type: t.type, root: t.root === '0' ? id : t.root, pn: 1, ps: 20 },
      checkSignal,
    );
    const r = find(d);
    if (r?.state === 17) {
      return report(
        'self-only',
        'B站明确返回仅自己可见（state 17），未确认公开。平台审核结果无法改写，请勿自动重复发布。',
        17,
      );
    }
  } catch {
    // 核验失败要保住原始回执，不能因为核不了就说发送失败
  }

  return report(
    'unconfirmed',
    '尚未在访客评论列表中核实：可能等待审核、分页未覆盖或读取受限；不能据此断言仅自己可见。可稍后复查，不要重复发布。',
  );
}
