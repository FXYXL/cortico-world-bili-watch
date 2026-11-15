/**
 * 陪看的选帧纯函数：观察窗口里哪些采样进拼图、拼图什么形状。像素全留在页面里，这里只算元数据。
 *
 * 采样点从最新帧往回按等比排布（密度靠近"现在"），每个位置吸附到半间距内的镜头切换帧；
 * 近重复（dHash）与黑场/冻结段折叠成一幅。整文件按
 * [cortico-world-bili-video-pro](https://github.com/mutoubaicai/cortico-world-bili-video-pro)（MIT，Phantivia）
 * 的 `src/capture.ts` 照搬，仅改注释与格式 —— 算法一个字没动，别"优化"。
 */

export interface FrameMeta {
  /** Video time in seconds. */
  t: number;
  /** 64-bit difference hash of the frame, 16 hex chars. */
  hash: string;
  /** Mean luma 0–255. */
  luma: number;
  /** Mean absolute luma difference to the previous sample, 0–255; 0 for the first. */
  diff: number;
}

export interface SelectOptions {
  frameDensity: number;
  maxFrames: number;
  ratio: number;
  dedupeHamming: number;
  cutThreshold: number;
  blackLuma: number;
}

export interface GridShape {
  cols: number;
  rows: number;
}

/** Row-major grid for n cells: 1×1, 2×1, 2×2, 3×2, 3×3. */
export function gridFor(n: number): GridShape {
  if (n <= 1) return { cols: 1, rows: 1 };
  if (n === 2) return { cols: 2, rows: 1 };
  if (n <= 4) return { cols: 2, rows: 2 };
  if (n <= 6) return { cols: 3, rows: 2 };
  return { cols: 3, rows: 3 };
}

/** Target frame count for a gap: density × gap, at least 1, at most the cap. */
export function targetCount(gapSec: number, opts: Pick<SelectOptions, 'frameDensity' | 'maxFrames'>): number {
  const n = Math.round(gapSec * opts.frameDensity);
  return Math.max(1, Math.min(opts.maxFrames, n));
}

/** Hamming distance between two 16-hex-char hashes. */
export function hamming(a: string, b: string): number {
  let d = 0;
  for (let i = 0; i < 16; i++) {
    let x = parseInt(a[i] ?? '0', 16) ^ parseInt(b[i] ?? '0', 16);
    while (x) { d += x & 1; x >>= 1; }
  }
  return d;
}

/**
 * dHash of a grayscale image: average into a 9×8 grid, 1 bit per horizontal neighbour pair.
 * `gray` is row-major, `w`×`h` values 0–255.
 */
export function dhash(gray: ArrayLike<number>, w: number, h: number): string {
  const cells: number[] = [];
  for (let gy = 0; gy < 8; gy++) {
    for (let gx = 0; gx < 9; gx++) {
      const x0 = Math.floor((gx * w) / 9), x1 = Math.max(x0 + 1, Math.floor(((gx + 1) * w) / 9));
      const y0 = Math.floor((gy * h) / 8), y1 = Math.max(y0 + 1, Math.floor(((gy + 1) * h) / 8));
      let sum = 0, n = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { sum += gray[y * w + x] as number; n++; }
      cells.push(sum / n);
    }
  }
  let hex = '';
  for (let gy = 0; gy < 8; gy++) {
    let nibbleHi = 0, nibbleLo = 0;
    for (let gx = 0; gx < 8; gx++) {
      const bit = (cells[gy * 9 + gx] as number) > (cells[gy * 9 + gx + 1] as number) ? 1 : 0;
      if (gx < 4) nibbleHi = (nibbleHi << 1) | bit; else nibbleLo = (nibbleLo << 1) | bit;
    }
    hex += nibbleHi.toString(16) + nibbleLo.toString(16);
  }
  return hex;
}

/** Mean absolute difference between two equally sized gray arrays. */
export function meanAbsDiff(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const n = Math.min(a.length, b.length);
  if (!n) return 0;
  let s = 0;
  for (let i = 0; i < n; i++) s += Math.abs((a[i] as number) - (b[i] as number));
  return s / n;
}

/**
 * Picks frame indices (ascending by time) from `frames`, which are the samples in `(t0, t1]`
 * sorted by time; the last one is the newest. Returns at least the newest when `frames` is
 * non-empty.
 */
export function selectFrames(frames: readonly FrameMeta[], gapSec: number, opts: SelectOptions): number[] {
  if (frames.length === 0) return [];
  const last = frames.length - 1;
  const t1 = frames[last].t;
  const n = targetCount(gapSec, opts);
  if (n === 1 || frames.length === 1) return [last];

  // geometric positions back from t1
  const picked = new Set<number>([last]);
  const positions: number[] = [];
  let d = gapSec;
  for (let k = 0; k < n - 1; k++) {
    d *= opts.ratio;
    positions.push(t1 - d);
  }
  // snap: cut frames (diff over threshold) inside the half-spacing win over the nominal frame
  const spacingAt = (i: number) => {
    const prev = i === 0 ? t1 - gapSec : positions[i - 1];
    const next = i === positions.length - 1 ? t1 : positions[i + 1];
    return Math.min(positions[i] - prev, next - positions[i]) / 2;
  };
  const nearest = (t: number) => {
    let best = 0, bestD = Infinity;
    for (let i = 0; i < frames.length; i++) {
      const dd = Math.abs(frames[i].t - t);
      if (dd < bestD) { bestD = dd; best = i; }
    }
    return best;
  };
  positions.forEach((p, i) => {
    const half = spacingAt(i);
    let choice = nearest(p);
    let bestCut = 0;
    for (let j = 0; j < frames.length; j++) {
      if (Math.abs(frames[j].t - p) > half) continue;
      if (frames[j].diff >= opts.cutThreshold && frames[j].diff > bestCut) { bestCut = frames[j].diff; choice = j; }
    }
    picked.add(choice);
  });

  // positions closer together than the sampling period land on the same frame; fill the
  // remaining slots with the frames farthest in time from everything picked so far
  while (picked.size < n) {
    let best = -1, bestGap = 0;
    for (let j = 0; j < frames.length; j++) {
      if (picked.has(j)) continue;
      let gap = Infinity;
      for (const k of picked) gap = Math.min(gap, Math.abs(frames[j].t - frames[k].t));
      if (gap > bestGap) { bestGap = gap; best = j; }
    }
    if (best < 0 || bestGap < 0.25) break;
    picked.add(best);
  }

  // dedupe newest-first; black runs keep one frame
  const order = [...picked].sort((a, b) => b - a);
  const kept: number[] = [];
  for (const i of order) {
    const f = frames[i];
    const dup = kept.some((k) => {
      const g = frames[k];
      if (f.luma < opts.blackLuma && g.luma < opts.blackLuma) return true;
      return hamming(f.hash, g.hash) < opts.dedupeHamming;
    });
    if (!dup) kept.push(i);
  }
  if (!kept.includes(last)) kept.push(last);
  return kept.sort((a, b) => a - b);
}

/** Time range of one grid cell, seconds. */
export interface CellSpan {
  from: number;
  to: number;
}

/**
 * Splits the observed span `[start, times.at(-1)]` into one range per grid cell: each cell covers
 * from the previous cell's frame time to its own, so the ranges are contiguous and add up to what
 * the grid actually shows.
 */
export function cellSpans(times: readonly number[], start: number): CellSpan[] {
  const out: CellSpan[] = [];
  let prev = start;
  for (const t of times) {
    const to = Math.max(prev, t);
    out.push({ from: prev, to });
    prev = to;
  }
  return out;
}

export interface StoryboardCell extends CellSpan {
  /** Subtitle lines inside the cell; empty is a fact about this span, not about the video. */
  subtitles: readonly string[];
  /** Danmaku count in the cell; null when the danmaku data was not available at all. */
  danmaku: number | null;
}

export interface StoryboardOptions {
  fmt: (t: number) => string;
  /** False when no subtitle track was loaded: say the data is missing, not that nobody spoke. */
  subtitleData: boolean;
  /** Character budget; the middle cells are dropped first when it is exceeded. */
  maxChars?: number;
}

const CIRCLED = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨'];

/**
 * The per-cell list delivered with a grid: time range, up to two subtitle lines and the danmaku
 * count, nothing else — what the cells show is for the reader to judge. Over budget, the middle
 * cells collapse into one `（中间省略 N 格）` line so the head and tail stay readable.
 */
export function renderStoryboard(cells: readonly StoryboardCell[], opts: StoryboardOptions): string {
  if (cells.length === 0) return '';
  const max = opts.maxChars ?? 600;
  const first = cells[0]!;
  const last = cells[cells.length - 1]!;
  const header = `【分镜清单】${cells.length} 格 · 覆盖 ${opts.fmt(first.from)}–${opts.fmt(last.to)}`;
  const line = (cell: StoryboardCell, i: number) => {
    const sub = !opts.subtitleData
      ? '（这段没有字幕数据）'
      : cell.subtitles.length
        ? cell.subtitles.map((s) => `「${s}」`).join('')
        : '（这一段没有字幕）';
    const dm = cell.danmaku === null ? '弹幕数据不全' : `弹幕 ${cell.danmaku} 条`;
    return `${CIRCLED[i] ?? `${i + 1})`} ${opts.fmt(cell.from)}–${opts.fmt(cell.to)} · 字幕：${sub} · ${dm}`;
  };
  const assemble = (omitFrom: number, omitCount: number) => {
    const body: string[] = [];
    for (let i = 0; i < cells.length; i++) {
      if (omitCount > 0 && i === omitFrom) {
        body.push(`（中间省略 ${omitCount} 格）`);
        i += omitCount - 1;
        continue;
      }
      body.push(line(cells[i]!, i));
    }
    return [header, ...body].join('\n');
  };
  let omitCount = 0;
  let text = assemble(0, 0);
  while (text.length > max && omitCount < cells.length - 2) {
    omitCount++;
    text = assemble(Math.floor((cells.length - omitCount) / 2), omitCount);
  }
  return text;
}

/** Detected picture events in `(t0, t1]` for the observation text: cuts and black runs. */
export function describeEvents(frames: readonly FrameMeta[], opts: Pick<SelectOptions, 'cutThreshold' | 'blackLuma'>, fmt: (t: number) => string): string[] {
  const out: string[] = [];
  let blackFrom: number | null = null;
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    const black = f.luma < opts.blackLuma;
    if (black && blackFrom === null) blackFrom = f.t;
    if (!black && blackFrom !== null) {
      const len = f.t - blackFrom;
      out.push(len >= 1 ? `${fmt(blackFrom)} 黑场 ${len.toFixed(1)} 秒` : `${fmt(blackFrom)} 短暂黑场`);
      blackFrom = null;
    }
    if (f.diff >= opts.cutThreshold && !black && !(i > 0 && frames[i - 1].luma < opts.blackLuma)) out.push(`${fmt(f.t)} 画面切换`);
  }
  if (blackFrom !== null) out.push(`${fmt(blackFrom)} 起黑场,持续中`);
  return out;
}
