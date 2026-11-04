/**
 * core/video.ts — 视频层：`BV 号 → 元信息 / 播放地址 / 字幕`。
 *
 * 协议（签名、cookie、错误分类、大整数）全在 `client.ts`，这里只管**视频语义**：
 * 分P 怎么选、DASH 轨道怎么挑、字幕优先哪一轨。
 *
 * ## 为什么取流是 DASH 而不是 `durl`
 *
 * 老办法是 `qn=16, fnval=1`（360P 渐进式），省带宽，只抽两帧看一眼够用。
 * 但我们要出分镜图，360P 糊到字幕都读不出来。
 *
 * DASH（`fnval=4048`）一次返回十几条视频轨（360p–1080P+）和几条音频轨，
 * 按需挑：扫描挑 480p，放大时临时取 1080P 直链按帧读。
 */

import { REFERER, USER_AGENT, type BiliClient, numericId } from './client.ts';
import { BiliError, type Video, type VideoPart } from './types.ts';

/** 从 BV 号 / av 号 / 完整链接里取出编号。**短链接（b23.tv）要用户先在浏览器展开。** */
export function videoId(input: string): string {
  let value = String(input ?? '').trim();
  if (/^https?:/i.test(value)) {
    let u: URL;
    try {
      u = new URL(value);
    } catch {
      throw new BiliError('这不是一个完整的链接。B站短链接（b23.tv）请先在浏览器里展开。', 'invalid');
    }
    if (!['www.bilibili.com', 'bilibili.com', 'm.bilibili.com'].includes(u.hostname)) {
      throw new BiliError('请提供 B站完整视频链接或 BV/av 号。', 'invalid');
    }
    value = u.pathname.split('/').filter(Boolean)[1] ?? '';
  }
  if (!/^(BV[0-9A-Za-z]{10}|av\d{1,20})$/i.test(value)) {
    throw new BiliError('视频编号无效：只认 BV 号、av 号或 B站完整视频链接。', 'invalid');
  }
  return value.toLowerCase().startsWith('av') ? `av${value.slice(2)}` : value;
}

export interface DashTrack {
  url: string;
  backupUrls: string[];
  width?: number;
  height?: number;
  bandwidth?: number;
  codecs?: string;
  codecid?: number;
  id?: number;
}

export interface PlayInfo {
  qualityLabels: string[];
  videos: DashTrack[];
  audios: DashTrack[];
  progressive: string | null;
  /** 真正选中的那一档（可能低于请求值 —— 那就是降级）。 */
  height: number | null;
  requestedHeight: number;
  /** 降级原因，**必须写进结果**，否则模型不知道自己看的是糊的。 */
  degraded: string[];
}

export interface SubtitleSegment {
  from: number;
  to: number;
  text: string;
}

export interface SubtitleInfo {
  available: boolean;
  reason?: string;
  lang?: string;
  langDoc?: string;
  segments: SubtitleSegment[];
  raw?: unknown;
  /** 站点说"要登录才给字幕" —— 这和"这视频没有字幕"是两回事。 */
  needsLogin?: boolean;
}

/**
 * 选一条轨道：**先看高度，再优先 AVC**。
 *
 * 优先 AVC 是因为 hevc/av1 在某些老 ffmpeg 构建上要看解码器脸色，
 * 而"能出图"比"省 20% 码率"重要得多。
 */
export function pickBestTrack(tracks: DashTrack[]): DashTrack | null {
  const ok = tracks.filter((t) => t.url);
  if (!ok.length) return null;
  return ok.slice().sort((a, b) => {
    const rank = (t: DashTrack) => [t.height ?? 0, t.codecid === 7 ? 1 : 0, t.bandwidth ?? 0];
    const ra = rank(a);
    const rb = rank(b);
    return rb[0] - ra[0] || rb[1] - ra[1] || rb[2] - ra[2];
  })[0];
}

function mapTrack(t: any): DashTrack {
  return {
    url: String(t.baseUrl ?? t.base_url ?? ''),
    backupUrls: (t.backupUrl ?? t.backup_url ?? []).map(String).filter(Boolean),
    width: Number(t.width) || undefined,
    height: Number(t.height) || undefined,
    bandwidth: Number(t.bandwidth) || undefined,
    codecs: t.codecs ? String(t.codecs) : undefined,
    codecid: Number(t.codecid) || undefined,
    id: Number(t.id) || undefined,
  };
}

/**
 * 视频元信息 + 分P 表。
 *
 * `part` 超范围时**报清楚**（该视频共几集），而不是静默回第一集 ——
 * 静默回退会让模型以为读的是第 5 集，实际是第 1 集。
 */
export async function getVideo(
  client: BiliClient,
  input: string,
  part = 1,
  signal?: AbortSignal,
): Promise<Video> {
  const id = videoId(input);
  const d = await client.api(
    '/x/web-interface/view',
    id.startsWith('BV') || id.startsWith('bv') ? { bvid: id } : { aid: id.slice(2) },
    signal,
  );

  const parts: VideoPart[] = (d.pages ?? []).map((p: any) => ({
    cid: numericId(p.cid),
    page: Number(p.page) || 1,
    title: String(p.part ?? '').slice(0, 160),
    durationSec: Number(p.duration) || 0,
  }));

  const idx = Math.max(0, Math.min(parts.length - 1, Math.trunc(part) - 1));
  const cur = parts[idx];
  if (!cur) throw new BiliError(`该视频没有第 ${part} 集（共 ${parts.length} 集）。`, 'invalid');

  return {
    id: String(d.bvid),
    aid: numericId(d.aid),
    cid: cur.cid,
    title: String(d.title ?? '').slice(0, 200),
    description: String(d.desc ?? '').slice(0, 4000),
    author: String(d.owner?.name ?? '').slice(0, 80),
    ownerId: String(d.owner?.mid ?? ''),
    durationSec: Number(d.duration) || cur.durationSec,
    cover: String(d.pic ?? ''),
    url: `https://www.bilibili.com/video/${d.bvid}?p=${cur.page}`,
    parts,
  };
}

/**
 * 播放地址。
 *
 * `height` 只是**上限**，实际能拿到多少由账号权限决定 ——
 * 拿不到就写进 `degraded`，绝不假装成功。
 */
export async function getPlayInfo(
  client: BiliClient,
  video: Video,
  height: number,
  signal?: AbortSignal,
): Promise<PlayInfo> {
  const qn = height >= 1080 ? 80 : height >= 720 ? 64 : height >= 480 ? 32 : 16;
  const d = await client.api(
    '/x/player/playurl',
    { bvid: video.id, cid: video.cid, qn, fnval: 4048, fourk: 1, platform: 'pc' },
    signal,
  );

  const qualityLabels: string[] = (d.accept_description ?? []).map(String);
  const videos: DashTrack[] = (d.dash?.video ?? []).map(mapTrack);
  const audios: DashTrack[] = (d.dash?.audio ?? []).map(mapTrack);
  const progressive = d.durl?.[0]?.url ? String(d.durl[0].url) : null;

  const degraded: string[] = [];
  let picked: DashTrack | null = null;
  if (videos.length) {
    const under = videos.filter((v) => (v.height ?? 0) <= height);
    picked = pickBestTrack(under.length ? under : videos);
  }
  const got = picked?.height ?? null;
  if (got !== null && got + 1 < height) {
    degraded.push(
      `source-max-${got}p (requested ${height}p)` +
        (client.loggedIn ? '' : ' —— 匿名请求，1080P 需要登录（扫码即可）'),
    );
  }
  if (!videos.length && !progressive) {
    throw new BiliError('这个视频没有可用的视频流（可能付费/会员专享，或已下架）。', 'rejected');
  }

  return {
    qualityLabels,
    videos,
    audios,
    progressive,
    height: got,
    requestedHeight: height,
    degraded,
  };
}

/** 给 zoom 用：一份新鲜的 1080P 直链（带签名、约 2 小时过期，所以每次重取）。 */
export async function getFrameSource(
  client: BiliClient,
  video: Video,
  height: number,
  signal?: AbortSignal,
): Promise<{ uri: string; userAgent: string; referer: string; height: number } | null> {
  try {
    const info = await getPlayInfo(client, video, height, signal);
    const best = pickBestTrack(info.videos);
    if (!best) return null;
    return { uri: best.url, userAgent: USER_AGENT, referer: REFERER, height: best.height ?? height };
  } catch {
    // 直链拿不到不该让 zoom 失败：引擎会自动回落到本地那份低清
    return null;
  }
}

/**
 * 字幕轨。
 *
 * **三种情况要分开**（踩过的坑）：
 *   1. 有字幕 → 返回 segments
 *   2. 站点说"要登录才给"（`need_login_subtitle`）→ `needsLogin: true`
 *   3. 真的没有 → `reason`
 *
 * 把 2 说成 3 会让用户以为"这视频没字幕"，而他只是没登录。
 */
export async function getSubtitles(
  client: BiliClient,
  video: Video,
  signal?: AbortSignal,
): Promise<SubtitleInfo> {
  let d: any;
  try {
    d = await client.wbi('/x/player/wbi/v2', { aid: video.aid, cid: video.cid }, signal);
  } catch (error) {
    // 签名路走不通时退回旧接口：两个都挂才算没有
    try {
      d = await client.api('/x/player/v2', { aid: video.aid, cid: video.cid }, signal);
    } catch {
      return {
        available: false,
        reason: `字幕接口未响应（${(error as Error).message.slice(0, 80)}）`,
        segments: [],
      };
    }
  }

  if (d?.need_login_subtitle === true) {
    return {
      available: false,
      needsLogin: true,
      reason: '这个视频的字幕要登录才给，不是你登录失败。',
      segments: [],
    };
  }

  const tracks: any[] = d?.subtitle?.subtitles ?? [];
  if (!tracks.length) {
    return {
      available: false,
      reason: client.loggedIn ? '这个视频没有字幕轨。' : '未登录时看不到字幕轨；扫码后重试。',
      segments: [],
    };
  }

  // 优先中文；没有就第一轨
  const selected = tracks.find((s) => /^zh/i.test(String(s.lan))) ?? tracks[0];
  const raw = await client.assetJson(String(selected.subtitle_url ?? ''), signal);
  const body: any[] = Array.isArray(raw?.body) ? raw.body : [];
  const segments: SubtitleSegment[] = body
    .map((s) => ({
      from: Number(s.from),
      to: Number(s.to),
      text: stripSubtitleMarkup(s.content),
    }))
    .filter((s) => Number.isFinite(s.from) && Number.isFinite(s.to) && s.text);

  if (!segments.length) return { available: false, reason: '字幕文件是空的。', segments: [] };
  return {
    available: true,
    lang: String(selected.lan ?? ''),
    langDoc: String(selected.lan_doc ?? ''),
    segments,
    raw,
  };
}

/** 去掉字幕里常见的标记：`<i>` `<font color=…>` `{\an8}` 和实体。 */
export function stripSubtitleMarkup(text: unknown): string {
  return String(text ?? '')
    .replace(/<[^>]{1,80}>/g, '')
    .replace(/\{\\[^}]{1,40}\}/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/[ \t]+/g, ' ')
    .trim();
}
