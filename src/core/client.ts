/**
 * core/client.ts — **唯一一个直接和 B 站接口打交道的地方**。
 *
 * ## 为什么只有这一层能发 HTTP
 *
 * B 站接口变更是常态：WBI 签名换过算法、`seq` 参数加过、字幕接口从 `/x/player/v2` 挪到
 * `/x/player/wbi/v2`、风控码从 412 扩到 429/567。
 * 如果这些散落在十几个工具里，改一次要翻八个文件，而且必然漏一处。
 *
 * 所以：**别的层只调这里的方法，不自己拼 URL、不管签名、不碰 cookie**。
 *
 * ## 三条从真实事故里学来的规矩
 *
 * 1. **大整数必须保护**。`cid` / `aid` 会超过 2^53，`JSON.parse` 静默出错且不报错。
 *    见 `parsePlatformJson`。
 * 2. **cookie 只认五个字段**。`SESSDATA` / `bili_jct` / `DedeUserID` / `buvid3` / `buvid4`。
 *    缺前两个直接拒（拿它发不了评论）。缺 buvid 时**向 B 站申请**，不自己编。
 * 3. **不跟随重定向**。B 站把"登录跳转"伪装成 200，跟过去拿到的是另一个页面。
 */

import { createHash } from 'node:crypto';

import { BiliError, type Account, type CommentTarget, type NotificationPage } from './types.ts';

const API = 'https://api.bilibili.com';
const PASSPORT = 'https://passport.bilibili.com';

/** 与桌面版一致的浏览器 UA。**CDN 对空 UA 直接 403**。 */
export const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/131.0.0.0 Safari/537.36';
export const REFERER = 'https://www.bilibili.com/';

/**
 * WBI 签名的重排表。
 *
 * B站前端公开的常数，**不是密钥**。真正的密钥在 `nav` 接口的 `wbi_img` 里，
 * 两个小时换一次，所以签名要跟着刷新。
 */
const MIXIN = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49, 33, 9, 42, 19, 29, 28,
  14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54,
  21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52,
];

/**
 * **把 16 位以上的整数在 JSON.parse 之前变成字符串。**
 *
 * 这是整个插件里最重要的一行保护。B 站的 `cid` 常常是 17–19 位，
 * `JSON.parse` 会把它变成一个**看起来正常但已经偏了几十的值**，
 * 然后你用它取流，会拿到另一个视频的画面 —— 而且画面完全正常，不会报错。
 *
 * 做法：先用正则把"独立的数字 token"挑出来，长的加引号，再 parse。
 * 字符串内部的数字不会被误伤（正则先匹配完整字符串字面量）。
 */
export function parsePlatformJson(text: string): any {
  const patched = String(text).replace(
    /"(?:\\.|[^"\\])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g,
    (token) => (/^-?\d{16,}$/.test(token) ? JSON.stringify(token) : token),
  );
  return JSON.parse(patched);
}

/** 平台 ID 校验：1–24 位数字。`allowZero` 用于 root/parent（新评论是 0）。 */
export function numericId(value: unknown, allowZero = false): string {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) {
    throw new BiliError('ID 必须传字符串，避免精度损失。', 'invalid');
  }
  const s = String(value ?? '');
  if (!/^[0-9]{1,24}$/.test(s) || (!allowZero && BigInt(s) === 0n)) {
    throw new BiliError('平台 ID 无效。', 'invalid');
  }
  return s;
}

/**
 * 评论区目标校验。
 *
 * **`root` 与 `parent` 必须同时为 0 或同时非 0**。只给一个是错的：
 * B 站会把"有 root 没 parent"当成回复到不存在的楼层，
 * 要么发不出去，要么发到别的地方去。
 */
export function normalizeTarget(value: unknown): CommentTarget {
  const t = value as Record<string, unknown> | null;
  if (!t || ![1, 11, 17].includes(Number(t.type))) {
    throw new BiliError('评论类型仅支持视频(1)、动态(11/17)。', 'invalid');
  }
  const target: CommentTarget = {
    oid: numericId(t.oid),
    type: Number(t.type) as 1 | 11 | 17,
    root: numericId(t.root ?? '0', true),
    parent: numericId(t.parent ?? '0', true),
  };
  if ((target.root === '0') !== (target.parent === '0')) {
    throw new BiliError('回复必须同时提供 root 和 parent；新评论二者都为 0。', 'invalid');
  }
  return target;
}

/**
 * cookie 清洗。
 *
 * 只留五个字段：多留字段不会更安全，反而可能带上过期的追踪 cookie 让请求被拒；
 * 少留 `SESSDATA` / `bili_jct` 就发不了评论。
 *
 * **字段内部不能有空白** —— 实测：Cortico 的 secretReader 在重启后加载 `.env` 时会
 * 在第一个空白处截断，于是 cookie 变成半截，所有请求都变成"未登录"。
 */
export function cleanCookie(input: string): string {
  const s = String(input ?? '');
  if (s.length > 12000 || /[\r\n]/.test(s)) throw new BiliError('Cookie 格式无效', 'invalid');
  const parts = s
    .split(';')
    .map((x) => x.trim())
    .filter((x) => /^(SESSDATA|bili_jct|DedeUserID|buvid3|buvid4)=/.test(x));
  if (!parts.some((x) => x.startsWith('SESSDATA=')) || !parts.some((x) => x.startsWith('bili_jct='))) {
    throw new BiliError('缺少 SESSDATA 或 bili_jct，请重新扫码登录。', 'auth');
  }
  if (parts.some((part) => /\s/.test(part))) {
    throw new BiliError('Cookie 字段内部含空白，请重新扫码或提供原始编码值。', 'invalid');
  }
  return parts.join(';');
}

/** 从 cookie 里取某个字段的值。 */
export function cookieField(cookie: string, name: string): string | undefined {
  return cookie
    .split(';')
    .map((s) => s.trim())
    .find((s) => s.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

export interface ClientOptions {
  /** cookie **用回调**：扫码登录后立刻生效，不用重建 client。 */
  cookie: () => string;
  /** 保存补齐后的 cookie（buvid 是 B 站给的，补完要落盘）。 */
  saveCookie?: (cookie: string) => void;
  fetcher?: typeof fetch;
  /** 单次请求超时（默认 15 秒）。 */
  timeoutMs?: number;
}

/** 一次原始请求的返回。 */
interface RawResult {
  data: any;
  cookies: string[];
}

export class BiliClient {
  private wbiKey: { key: string; at: number } | null = null;
  /** 补齐 buvid 后来，避免每次请求都去问一次。 */
  private sessionPrepared: { source: string; value: string } | null = null;

  constructor(private readonly o: ClientOptions) {}

  get loggedIn(): boolean {
    return Boolean(this.o.cookie());
  }

  private get fetcher(): typeof fetch {
    return this.o.fetcher ?? fetch;
  }

  /** 当前 cookie（补齐过 buvid 的版本）。 */
  currentCookie(): string {
    const source = this.o.cookie();
    return this.sessionPrepared?.source === source ? this.sessionPrepared.value : source;
  }

  private headers(withCookie: boolean, extra?: Record<string, string>): Headers {
    const h = new Headers({
      'User-Agent': USER_AGENT,
      Referer: REFERER,
      Accept: 'application/json, text/plain, */*',
      ...(extra ?? {}),
    });
    if (withCookie && this.currentCookie()) h.set('Cookie', this.currentCookie());
    return h;
  }

  /**
   * 发一次请求，**不跟随重定向**。
   *
   * 响应体上限 8MB：B 站正常响应是几十 KB，超过这个只可能是错误页或攻击载荷。
   */
  private async raw(
    url: string,
    init: RequestInit = {},
    signal?: AbortSignal,
    withCookie = true,
  ): Promise<RawResult> {
    const timeout = AbortSignal.timeout(this.o.timeoutMs ?? 15_000);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;

    let response: Response;
    try {
      response = await this.fetcher(url, {
        ...init,
        headers: {
          ...Object.fromEntries(this.headers(withCookie)),
          ...Object.fromEntries(new Headers(init.headers)),
        },
        redirect: 'error',
        signal: combined,
      });
    } catch (error) {
      if (signal?.aborted) throw new BiliError('操作已取消。', 'network');
      throw new BiliError(
        'B站连接中断或超时。检查网络/代理后再试，不要连续重试。',
        'network',
      );
    }

    if (!response.ok) {
      // 412/429 是风控限流，和"请求本身有错"要分开 —— 前者该等，后者该改参数
      const kind = [412, 429].includes(response.status) ? 'rate' : 'network';
      throw new BiliError(`B站返回 HTTP ${response.status}`, kind);
    }

    const text = await response.text();
    if (text.length > 8 * 1024 * 1024) throw new BiliError('B站响应过大。', 'network');

    let data: any;
    try {
      data = parsePlatformJson(text);
    } catch {
      throw new BiliError('B站响应不是合法 JSON（可能被风控拦截）。', 'network');
    }
    return { data, cookies: response.headers.getSetCookie() };
  }

  /**
   * 调 `api.bilibili.com` 的接口，统一判 `code`。
   *
   * 错误码分三类（这个分类决定模型下一步该干什么）：
   *   -101 / -111  → 登录失效（去扫码）
   *   -352 / -412 / -509 / 12051 → 风控（等一会儿，别重试）
   *   其它         → 请求本身有问题（改参数）
   */
  async api(
    path: string,
    params: Record<string, string | number> = {},
    signal?: AbortSignal,
    opts: { withCookie?: boolean; form?: Record<string, string | number>; origin?: string } = {},
  ): Promise<any> {
    const base = opts.origin ?? API;
    const url = new URL(path, base);
    if (![API, PASSPORT].includes(url.origin)) throw new BiliError('请求目标无效。', 'invalid');
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

    const { data } = await this.raw(
      url.href,
      opts.form
        ? {
          method: 'POST',
          headers: { Origin: 'https://www.bilibili.com', 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams(
            Object.entries(opts.form).map(([k, v]) => [k, String(v)]),
          ),
        }
        : {},
      signal,
      opts.withCookie !== false,
    );

    if (data.code !== 0) {
      const kind = [-101, -111].includes(data.code)
        ? 'auth'
        : [-352, -412, -509, 12051].includes(data.code)
          ? 'rate'
          : 'rejected';
      throw new BiliError(
        `B站返回 ${data.code}：${String(data.message ?? '请求未获准').slice(0, 160)}`,
        kind,
      );
    }
    return data.data ?? {};
  }

  /* ---------------------------------------------------------------- 登录 */

  /**
   * 补齐 `buvid3` / `buvid4`。
   *
   * B 站会给新会话分配设备标识；**不能自己编** —— 伪造的 buvid 会被风控识别，
   * 表现是"某些接口莫名返回 -352"。所以缺就向 `/x/frontend/finger/spi` 要。
   */
  async prepareSession(signal?: AbortSignal): Promise<void> {
    const source = this.o.cookie();
    if (!source) return;
    const value = cleanCookie(this.currentCookie());
    const parts = new Map(
      value.split(';').map((s) => {
        const [key, ...rest] = s.trim().split('=');
        return [key, rest.join('=')] as const;
      }),
    );

    if (parts.get('buvid3') && parts.get('buvid4')) return;

    const d = await this.api('/x/frontend/finger/spi', {}, signal);
    for (const [cookieKey, field] of [
      ['buvid3', 'b_3'],
      ['buvid4', 'b_4'],
    ] as const) {
      if (parts.get(cookieKey)) continue;
      const id = String(d[field] ?? '');
      // 只接受 B 站给的合法形态；形状不对就宁可不要
      if (!/^[A-Za-z0-9_-]{8,200}$/.test(id)) {
        throw new BiliError('发送前的网页会话初始化未完成，尚未提交；请稍后重试或重新扫码。', 'rejected');
      }
      parts.set(cookieKey, id);
    }

    // 补齐期间用户可能重新扫码登录了 —— 那就别把旧值写回去
    if (this.o.cookie() !== source || signal?.aborted) return;

    const merged = cleanCookie([...parts].map(([k, v]) => `${k}=${v}`).join('; '));
    this.o.saveCookie?.(merged);
    this.sessionPrepared = { source: this.o.cookie(), value: merged };
  }

  /** 当前登录的账号。未登录抛 `auth`。 */
  async account(signal?: AbortSignal): Promise<Account> {
    if (!this.loggedIn) throw new BiliError('尚未登录，请先在面板扫码。', 'auth');
    const d = await this.api('/x/web-interface/nav', {}, signal);
    if (!d.isLogin) throw new BiliError('尚未登录或登录已失效，请扫码。', 'auth');
    return { id: numericId(d.mid), name: String(d.uname ?? '').slice(0, 80) };
  }

  /** 扫码：拿二维码内容。 */
  async qrGenerate(signal?: AbortSignal): Promise<{ url: string; key: string }> {
    const d = await this.api(
      '/x/passport-login/web/qrcode/generate',
      {},
      signal,
      { origin: PASSPORT, withCookie: false },
    );
    const u = new URL(String(d.url));
    if (u.protocol !== 'https:' || !u.hostname.endsWith('.bilibili.com')) {
      throw new BiliError('登录二维码地址异常', 'invalid');
    }
    return { url: u.href, key: String(d.qrcode_key) };
  }

  /**
   * 扫码轮询。
   *
   * 成功时 cookie 在**两个地方**：`Set-Cookie` 响应头和跳转 URL 的 query。
   * 只取一处会漏 —— 实测有时候只有 query 那份是完整的。
   */
  async qrPoll(
    key: string,
    signal?: AbortSignal,
  ): Promise<{ status: 'waiting' | 'scanned' | 'expired' | 'error' | 'success'; cookie?: string }> {
    const u = new URL('/x/passport-login/web/qrcode/poll', PASSPORT);
    u.searchParams.set('qrcode_key', key);
    const { data, cookies } = await this.raw(u.href, {}, signal, false);

    if (data.code !== 0) throw new BiliError('登录服务暂不可用', 'network');
    const d = data.data ?? {};
    const code = Number(d.code);
    if (code !== 0) {
      const status =
        code === 86038 ? 'expired' : code === 86090 ? 'scanned' : code === 86101 ? 'waiting' : 'error';
      return { status };
    }

    const parts = cookies.map((s) => s.split(';')[0]);
    if (d.url) {
      const back = new URL(String(d.url));
      for (const k of ['SESSDATA', 'bili_jct', 'DedeUserID']) {
        if (back.searchParams.has(k) && !parts.some((x) => x.startsWith(`${k}=`))) {
          parts.push(`${k}=${back.searchParams.get(k)}`);
        }
      }
    }
    return { status: 'success', cookie: cleanCookie(parts.join('; ')) };
  }

  /* ---------------------------------------------------------------- WBI 签名 */

  /**
   * WBI 签名。
   *
   * 钥匙来自 `nav` 的 `wbi_img`（两个 URL，取文件名去掉扩展名，拼成 64 字符，
   * 再按 `MIXIN` 重排出前 32 位）。**6 小时内复用**，过期自动刷新。
   */
  private async signedParams(
    params: Record<string, string | number>,
    signal?: AbortSignal,
  ): Promise<Record<string, string | number>> {
    if (!this.wbiKey || Date.now() - this.wbiKey.at > 6 * 3600_000) {
      const nav = await this.raw(`${API}/x/web-interface/nav`, {}, signal, true);
      const d = nav.data?.data ?? {};
      const original = ['img_url', 'sub_url']
        .map((k) => String(d.wbi_img?.[k] ?? '').split('/').pop()?.split('.')[0] ?? '')
        .join('');
      if (original.length !== 64) throw new BiliError('无法取得 B站请求签名，请稍后重试。', 'network');
      this.wbiKey = {
        key: MIXIN.map((i) => original[i]).join('').slice(0, 32),
        at: Date.now(),
      };
    }

    const p: Record<string, string | number> = { ...params, wts: Math.floor(Date.now() / 1000) };
    // 按 key 排序后拼 query；**值里要剔掉 !'()* 这几个字符**，否则签名对不上
    const query = Object.keys(p)
      .sort()
      .map(
        (k) =>
          `${encodeURIComponent(k)}=${encodeURIComponent(
            String(p[k]).replace(/[!'()*]/g, ''),
          )}`,
      )
      .join('&');
    return {
      ...p,
      w_rid: createHash('md5').update(query + this.wbiKey.key).digest('hex'),
    };
  }

  /** 需要签名的接口（搜索、播放地址、字幕、UP主投稿）。 */
  async wbi(
    path: string,
    params: Record<string, string | number>,
    signal?: AbortSignal,
  ): Promise<any> {
    return this.api(path, await this.signedParams(params, signal), signal);
  }

  /**
   * 只要签名，不发请求。
   *
   * 发评论要**先签名、再核对账号**、最后才 POST —— 顺序不能倒：
   * 签名本身会触发一次 `nav` 请求，如果它跟发送之间账号变了，
   * 评论会落到另一个号上。所以调用方需要"先拿签名，核对完再发"。
   */
  async signGuest(
    params: Record<string, string | number>,
    signal?: AbortSignal,
  ): Promise<Record<string, string | number>> {
    return this.signedParams(params, signal);
  }

  /* ---------------------------------------------------------------- 通知 */

  /**
   * 收通知。**`reply` 和 `at` 是两条独立通道**。
   *
   * `reply` 是"有人回复了我的评论"，`at` 是"有人 @ 了我"。
   * 只收一路就会漏掉一半 —— 而且 `reply` 这一路**包括别人回复我自己发的评论**，
   * 这正是"发完评论后要能收到后续对话"的地方。
   *
   * 游标是 `{id, time}` 二元组：只传时间会重复拉取，只传 id 会跳过。
   */
  async notifications(
    lane: 'reply' | 'at',
    accountId: string,
    cursor?: { id: string; time: number },
    signal?: AbortSignal,
  ): Promise<NotificationPage> {
    const d = await this.api(
      `/x/msgfeed/${lane}`,
      cursor ? { id: cursor.id, [lane === 'at' ? 'at_time' : 'reply_time']: cursor.time } : {},
      signal,
    );

    const items: NotificationPage['items'] = [];
    for (const r of d.items ?? []) {
      const i = r.item ?? {};
      // business_id：1=视频、11=动态、17=动态评论。其它（如直播、专栏）这里不收
      if (![1, 11, 17].includes(i.business_id) || !i.source_id || !i.subject_id) continue;
      const parent = numericId(i.source_id);
      const root = i.root_id && String(i.root_id) !== '0' ? numericId(i.root_id) : parent;
      items.push({
        id: `bilibili:${accountId}:${parent}`,
        accountId,
        authorId: String(r.user?.mid ?? ''),
        author: String(r.user?.nickname ?? '').replace(/<[^>]*>/g, '').slice(0, 80),
        text: String(i.source_content ?? '').replace(/<[^>]*>/g, '').slice(0, 8000),
        target: { oid: numericId(i.subject_id), type: i.business_id as 1 | 11 | 17, root, parent },
        occurredAt: Number(r[lane === 'at' ? 'at_time' : 'reply_time'] ?? 0),
        status: 'pending',
        notificationType: lane === 'at' ? 'mention' : 'reply',
        ...(typeof i.uri === 'string' && /^https:\/\/(www\.)?bilibili\.com\//.test(i.uri)
          ? { url: i.uri }
          : {}),
      });
    }

    const c = d.cursor;
    return {
      items,
      ...(c?.id && c?.time ? { cursor: { id: String(c.id), time: Number(c.time) } } : {}),
      done: Boolean(c?.is_end) || !(d.items ?? []).length,
    };
  }

  /* ---------------------------------------------------------------- 资产 */

  /**
   * 只允许 B 站媒体域名。
   *
   * 字幕、封面、视频流全走这个校验。**不是过虑**：这些 URL 来自接口响应，
   * 一个被污染的响应就能让插件去请求任意地址。
   */
  assertAssetUrl(input: string): string {
    const raw = String(input ?? '');
    const u = new URL(raw.startsWith('//') ? `https:${raw}` : raw);
    if (
      u.protocol !== 'https:' ||
      u.username ||
      u.password ||
      u.port ||
      !['hdslb.com', 'bilivideo.com', 'bilivideo.cn'].some((h) => u.hostname.endsWith(`.${h}`))
    ) {
      throw new BiliError('素材地址不属于B站媒体域名。', 'invalid');
    }
    return u.href;
  }

  /** 拉一份 B 站媒体域上的 JSON（字幕文件）。 */
  async assetJson(url: string, signal?: AbortSignal): Promise<any> {
    return (await this.raw(this.assertAssetUrl(url), {}, signal, false)).data;
  }
}
