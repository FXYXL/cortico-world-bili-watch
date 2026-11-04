/**
 * B 站私信（会话列表 / 拉对话 / 发消息）。
 *
 * 接口与坑来自 [cortico-world-bili-video-pro](https://github.com/mutoubaicai/cortico-world-bili-video-pro)（MIT）
 * 的 `src/dm.ts`，作者 2026-11-01 用真机登录态实测过：
 *   · 会话列表 `session_svr/v1/session_svr/get_sessions` → code 0
 *   · 拉对话   `svr_sync/v1/svr_sync/fetch_session_msgs` → code 0
 *   · 发消息   `web_im/v1/web_im/send_msg`（POST 表单）→ 必须带
 *     `dev_id` + `timestamp` + csrf（bili_jct），**少一个就 -400「请求错误」**，
 *     而且不是 -101「未登录」——光看错误码会误判成"鉴权有问题"。
 *
 * 私信是私聊场景：**没有**公开评论区那套 60 秒间隔 / 参与度判断 / 可见性核验，
 * 但有自己的护栏（见 tools 的 bili_dm 与 world 的账本）：系统会话不回、
 * 每天发送上限、同一人每天上限。
 */
import { randomUUID } from 'node:crypto';

import type { BiliClient } from './client.ts';
import { BiliError } from './types.ts';

const VC = 'https://api.vc.bilibili.com';
const MESSAGE_REFERER = 'https://message.bilibili.com/';

/** 私信正文上限：B 站限制比这宽，但伙伴场景不需要长文。 */
export const DM_TEXT_MAX = 300;

export interface DmSession {
  talkerId: string;
  unread: number;
  /** 最后一条消息的时间（unix 秒）。 */
  lastAt: number;
  lastText: string;
  /** 系统通知（登录提醒、官方消息之类），不是人。 */
  system: boolean;
  /** 最后一条是不是**自己**发的——轮询靠它过滤"自己刚说的话"，不靠时钟。 */
  lastMine: boolean;
}

export interface DmMessage {
  at: number;
  mine: boolean;
  text: string;
}

/** 私信 content 是 JSON 字符串（`{"content":"..."}`），也可能带图片/表情字段。 */
function textOf(content: unknown, msgType?: number): string {
  let value: unknown = content;
  if (typeof content === 'string') {
    try {
      value = JSON.parse(content);
    } catch {
      return content.trim();
    }
  }
  if (value && typeof value === 'object') {
    const rec = value as Record<string, unknown>;
    for (const key of ['content', 'text', 'title', 'desc']) {
      const v = rec[key];
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
    if (typeof rec.url === 'string') return '[图片]';
  }
  if (msgType === 2) return '[图片]';
  if (msgType === 7) return '[表情]';
  return '';
}

function reasonOfCode(code: number, message: string): string {
  if (code === -101) return '登录态失效了，去面板重新扫码。';
  if (code === -400) return '请求被拒（参数或频率）。';
  if (code === -509) return '被限流了，过一会儿再试。';
  return `接口返回 ${code}${message ? ` ${message}` : ''}`;
}

/* ---------------------------------------------------------------- 读 */

/** 会话列表（按最后消息时间倒序）。 */
export async function listDmSessions(
  client: BiliClient,
  opts: { max?: number; signal?: AbortSignal } = {},
): Promise<DmSession[]> {
  const body = await client.api(
    '/session_svr/v1/session_svr/get_sessions',
    { session_type: 1, group_id: 0, sort_rule: 2, build: 0, mobi_app: 'web' },
    opts.signal,
    { origin: VC, referer: MESSAGE_REFERER },
  );
  const raw = body?.session_list;
  if (!Array.isArray(raw)) return [];
  const items: DmSession[] = [];
  const me = client.cookieField('DedeUserID');
  for (const entry of raw) {
    const rec = entry as Record<string, unknown>;
    const talkerId = String(rec.talker_id ?? '');
    if (!/^\d+$/.test(talkerId) || talkerId === '0') continue;
    const lastMsg = (rec.last_msg ?? {}) as Record<string, unknown>;
    const system =
      Number(rec.system_msg_type ?? 0) > 0 ||
      // B 站官方系统账号的固定 id（登录提醒、安全通知都在这里）
      talkerId === '844424930131964';
    items.push({
      talkerId,
      unread: Math.max(0, Math.round(Number(rec.unread_count ?? 0) || 0)),
      lastAt: Number(lastMsg.timestamp ?? 0) || 0,
      lastText: textOf(lastMsg.content, Number(lastMsg.msg_type ?? 1)) || '(无文字)',
      system,
      lastMine: Boolean(me) && String(lastMsg.sender_uid ?? '') === me,
    });
  }
  items.sort((a, b) => b.lastAt - a.lastAt);
  return items.slice(0, Math.max(1, Math.min(20, opts.max ?? 10)));
}

/** 和一个人的对话（时间升序）。 */
export async function readDmMessages(
  client: BiliClient,
  talkerId: string,
  opts: { size?: number; signal?: AbortSignal } = {},
): Promise<DmMessage[]> {
  if (!/^\d+$/.test(talkerId)) throw new BiliError('talkerId 必须是数字 UID。', 'invalid');
  const size = Math.max(1, Math.min(50, opts.size ?? 20));
  const body = await client.api(
    '/svr_sync/v1/svr_sync/fetch_session_msgs',
    { talker_id: talkerId, session_type: 1, size },
    opts.signal,
    { origin: VC, referer: MESSAGE_REFERER },
  );
  const raw = body?.messages;
  if (!Array.isArray(raw)) return [];
  const me = client.cookieField('DedeUserID');
  const items: DmMessage[] = [];
  for (const entry of raw) {
    const rec = entry as Record<string, unknown>;
    const type = Number(rec.msg_type ?? 1);
    const text = textOf(rec.content, type);
    if (!text) continue;
    items.push({
      at: Number(rec.timestamp ?? 0) || 0,
      mine: Boolean(me) && String(rec.sender_uid ?? '') === me,
      text,
    });
  }
  items.sort((a, b) => a.at - b.at);
  return items;
}

/* ---------------------------------------------------------------- 发 */

/**
 * 发一条私信。**成功与否只有这里知道**——调用方要拿返回值记账、给回执。
 * 抛 BiliError 之外的错误也会被包成 BiliError（rejected）。
 */
export async function sendDm(
  client: BiliClient,
  toUid: string,
  text: string,
  opts: { signal?: AbortSignal } = {},
): Promise<{ receiptId: string }> {
  if (!/^\d+$/.test(toUid)) throw new BiliError('收件人必须是数字 UID。', 'invalid');
  const me = client.cookieField('DedeUserID');
  const csrf = client.cookieField('bili_jct');
  if (!me || !csrf) {
    throw new BiliError('登录态缺 DedeUserID / bili_jct，发不了私信，去面板重新扫码。', 'auth');
  }
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!clean) throw new BiliError('私信正文是空的。', 'invalid');
  if ([...clean].length > DM_TEXT_MAX) {
    throw new BiliError(`私信太长了（上限 ${DM_TEXT_MAX} 字）。`, 'invalid');
  }

  // 2026-11-01 实测：web 端发私信必须带 dev_id + timestamp，少一个就 -400。
  const form: Record<string, string> = {
    'msg[sender_uid]': me,
    'msg[receiver_id]': toUid,
    'msg[receiver_type]': '1',
    'msg[msg_type]': '1',
    'msg[content]': JSON.stringify({ content: clean }),
    'msg[dev_id]': randomUUID().toUpperCase(),
    'msg[timestamp]': String(Math.floor(Date.now() / 1000)),
    csrf,
    csrf_token: csrf,
  };
  const receiptId = `dm-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
  await client.api('/web_im/v1/web_im/send_msg', {}, opts.signal, {
    origin: VC,
    referer: MESSAGE_REFERER,
    form,
  });
  return { receiptId };
}
