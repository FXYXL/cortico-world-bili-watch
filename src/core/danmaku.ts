/**
 * 视频弹幕：分片拉取 + 按时间窗取。
 *
 * 协议来自 [cortico-world-bili-video-pro](https://github.com/mutoubaicai/cortico-world-bili-video-pro)（MIT）：
 * `GET /x/v2/dm/web/seg.so?type=1&oid=<cid>&pid=<aid>&segment_index=<n>` 返回 protobuf
 * `DmSegMobileReply`（field 1 repeated `DanmakuElem`：1 id、2 progress 毫秒、3 mode、
 * 7 content、9 weight）。一片约覆盖前 6 分钟，长视频要按 segment_index 依次取。
 *
 * **给鱼看的不是全部弹幕**：probe 给概览（高赞 + 密度），storyboard 每段时间窗给
 * 几条采样——弹幕是氛围，不是逐条精读的材料。
 */
import { pbDecode, pbInt, pbText } from './protobuf.ts';

export interface Danmaku {
  id: string;
  /** 视频内时间（秒）。 */
  t: number;
  mode: number;
  /** 热度权重，B 站用来排序"高赞弹幕"。 */
  weight: number;
  content: string;
}

/** 解一片响应体；不可读的输入返回空列表，不抛异常。 */
export function decodeDanmakuSegment(bytes: Uint8Array): Danmaku[] {
  const fields = pbDecode(bytes);
  if (!fields) return [];
  const out: Danmaku[] = [];
  for (const f of fields) {
    if (f.field !== 1 || !f.bytes) continue;
    const e = pbDecode(f.bytes);
    const content = pbText(e, 7);
    if (!content) continue;
    const id = pbInt(e, 1);
    const progress = pbInt(e, 2) ?? 0;
    out.push({
      id: id === undefined ? `${progress}:${content}` : String(id),
      t: progress / 1000,
      mode: pbInt(e, 3) ?? 1,
      weight: pbInt(e, 9) ?? 0,
      content,
    });
  }
  return out;
}

/** 一条视频的弹幕池：按 id 去重合并，时间窗查询。 */
export class DanmakuPool {
  private readonly byId = new Map<string, Danmaku>();
  private sorted: Danmaku[] | null = null;

  add(list: readonly Danmaku[]): number {
    let fresh = 0;
    for (const d of list) {
      if (this.byId.has(d.id)) continue;
      this.byId.set(d.id, d);
      fresh++;
    }
    if (fresh) this.sorted = null;
    return fresh;
  }

  get size(): number {
    return this.byId.size;
  }

  clear(): void {
    this.byId.clear();
    this.sorted = null;
  }

  /** `(from, to]` 时间窗内的弹幕，按时间升序。 */
  between(from: number, to: number): Danmaku[] {
    this.sorted ??= [...this.byId.values()].sort((a, b) => a.t - b.t);
    return this.sorted.filter((d) => d.t > from && d.t <= to);
  }

  /** 按热度取前 n 条（并列取时间在前的）。 */
  top(n: number): Danmaku[] {
    return [...this.byId.values()].sort((a, b) => b.weight - a.weight || a.t - b.t).slice(0, n);
  }
}

/** 从一串里均匀挑 max 条，保持顺序——弹幕采样用，避免只取开头。 */
export function spread<T>(list: readonly T[], max: number): T[] {
  if (list.length <= max) return [...list];
  if (max <= 0) return [];
  const out: T[] = [];
  for (let i = 0; i < max; i++) out.push(list[Math.floor((i * list.length) / max)]);
  return out;
}

/** 弹幕正文清洗：太短的（"哈哈哈"）、太长的、纯符号的没有信息量。 */
export function isWorthKeeping(content: string): boolean {
  const c = content.trim();
  return c.length >= 2 && c.length <= 30 && /\S/.test(c);
}

/* ---------------------------------------------------------------- 字幕 */

export interface SubtitleLine {
  from: number;
  to: number;
  content: string;
}

/** 解字幕文件（`{ body: [{ from, to, content }] }`，秒）；不是这个形状返回空列表。 */
export function parseSubtitle(json: unknown): SubtitleLine[] {
  const body = (json as { body?: unknown })?.body;
  if (!Array.isArray(body)) return [];
  const out: SubtitleLine[] = [];
  for (const row of body) {
    const r = row as { from?: unknown; to?: unknown; content?: unknown };
    if (typeof r.from !== 'number' || typeof r.to !== 'number' || typeof r.content !== 'string') continue;
    out.push({ from: r.from, to: r.to, content: r.content });
  }
  return out;
}

/** 覆盖 `(from, to]` 的字幕行。 */
export function subtitlesBetween(lines: readonly SubtitleLine[], from: number, to: number): SubtitleLine[] {
  return lines.filter((l) => l.to > from && l.from <= to);
}

/**
 * 全片速览：高赞弹幕 + 观众最热闹的时段。**给 probe / storyboard 用**——
 * 弹幕是氛围，概览够了；逐条的按时间窗取（zoom 场景）。
 */
export function danmakuOverview(pool: DanmakuPool, topN = 8): string {
  if (!pool.size) return '';
  const parts: string[] = [`共载入 ${pool.size} 条`];
  const top = pool
    .top(topN * 3)
    .filter((d) => isWorthKeeping(d.content))
    .slice(0, topN);
  if (top.length) parts.push(`高赞：${top.map((d) => d.content).join(' ／ ')}`);

  // 观众最热闹的 5 分钟段（最多 3 段）：密度比单条更能说明"哪里有节目效果"
  const byMin = new Map<number, number>();
  for (const d of pool.between(0, Number.MAX_SAFE_INTEGER)) {
    byMin.set(Math.floor(d.t / 60), (byMin.get(Math.floor(d.t / 60)) ?? 0) + 1);
  }
  if (byMin.size) {
    const hot = [...byMin.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .filter(([, n]) => n >= 5)
      .sort((a, b) => a[0] - b[0]);
    if (hot.length) {
      parts.push(
        `最热闹：${hot.map(([m, n]) => `${m}~${m + 5} 分钟（${n} 条）`).join('、')}`,
      );
    }
  }
  return parts.join('；');
}
