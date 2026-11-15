/**
 * social/gallery.ts — 「画集」：她真正收到过的图，留一份可翻看的档案。
 *
 * ## 为什么不引用宿主的 media 目录
 *
 * 宿主确实会按内容 sha256 把交付的图落到 `<数据根>/media/<sha256>.<ext>`，
 * 看起来可以直接引用、零存储。但实测：`pushEvent` 带过去的观察帧**没有**落进去
 * （`media/` 里只有别的插件和少数几条，13:5x 那场 12 帧一张都没找到）。
 * 引用一个"有时存在有时不存在"的位置，面板上就会出现一半图裂。
 *
 * 所以这里自己存一份：`<world>/gallery/files/<id>.<ext>`，索引写在
 * `index.jsonl`（**追加写**，不回写 state.json）。
 *
 * ## 为什么要追加写
 *
 * 陪看每 20 秒一张，一小时 180 张。若塞进 state.json，就是 180 次全量写盘
 * （每次 0.7MB 起），纯属自找麻烦。追加一行几十字节，代价可以忽略。
 *
 * ## 淘汰
 *
 * 按条数 + 总体积双上限，从**最旧**开始删（只删自己 files/ 下的文件，
 * 绝不碰宿主目录）。一张拼图实测 60–110KB，400MB 大约能留 20 多个小时的陪看。
 */

import { createHash, randomUUID } from 'node:crypto';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

/** 交给画集的一张图（就是工具/观察帧要交付的那个 blob）。 */
export interface GalleryBlob {
  bytes: Uint8Array | Buffer;
  mime?: string;
  name?: string;
  fallbackText?: string;
}

/** 这张图属于哪儿。 */
export type GalleryKind = 'watch' | 'storyboard' | 'strip' | 'other';

export interface GalleryEntry {
  id: string;
  /** ISO 时间。 */
  at: string;
  kind: GalleryKind;
  /** 相对 `gallery/files/` 的文件名。 */
  file: string;
  bytes: number;
  mime: string;
  /** 人看的一句话：「观察帧 1:20」「分镜图 2/6」。 */
  label: string;
  oid?: string;
  bvid?: string;
  title?: string;
  /** 这一轮闲逛（storyboard / 字幕长图）。 */
  roamId?: string;
  /** 这一场陪看。 */
  watchId?: string;
  /** 产生它的工具名。 */
  tool?: string;
}

export interface GalleryMeta {
  kind: GalleryKind;
  oid?: string;
  bvid?: string;
  title?: string;
  roamId?: string;
  watchId?: string;
  tool?: string;
  at?: string;
  /** 覆盖单张图的 label（不传就用 blob 的 fallbackText / name）。 */
  label?: string;
}

export interface GalleryQuery {
  kind?: GalleryKind;
  oid?: string;
  roamId?: string;
  watchId?: string;
  limit?: number;
  offset?: number;
}

const MAX_ENTRIES = 800;
const MAX_BYTES = 400 * 1024 * 1024;

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

const MIME_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

const extOf = (mime: string | undefined, name: string | undefined): string => {
  const byMime = mime ? EXT_BY_MIME[mime.toLowerCase()] : undefined;
  if (byMime) return byMime;
  const m = String(name ?? '').match(/(\.[a-z0-9]{2,5})$/i);
  return m ? m[1].toLowerCase() : '.jpg';
};

/** 只允许我们自己生成的 id：挡住 `../` 之类的路径穿越。 */
const SAFE_ID = /^[0-9]{8}-[0-9]{6}-[a-z0-9]+$/;

export class Gallery {
  private readonly dir: string;
  private readonly files: string;
  private readonly index: string;
  private entries: GalleryEntry[] = [];
  /** 索引里累计的字节数（淘汰用）。 */
  private totalBytes = 0;

  constructor(root: string) {
    this.dir = join(root, 'gallery');
    this.files = join(this.dir, 'files');
    this.index = join(this.dir, 'index.jsonl');
    mkdirSync(this.files, { recursive: true });
    this.load();
  }

  private load(): void {
    if (!existsSync(this.index)) return;
    let raw = '';
    try {
      raw = readFileSync(this.index, 'utf8');
    } catch {
      return;
    }
    const seen = new Set<string>();
    const rows: GalleryEntry[] = [];
    for (const line of raw.split('\n')) {
      const s = line.trim();
      if (!s) continue;
      try {
        const e = JSON.parse(s) as GalleryEntry;
        if (!e?.id || !SAFE_ID.test(String(e.id)) || seen.has(e.id)) continue;
        seen.add(e.id);
        rows.push(e);
      } catch {
        // 半行（写到一半崩了）直接跳过，不影响其余
      }
    }
    // 索引比上限长（比如上限调小了）：原地压缩一次
    rows.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    this.entries = rows.slice(-MAX_ENTRIES);
    this.totalBytes = this.entries.reduce((n, e) => n + (Number(e.bytes) || 0), 0);
    if (rows.length > this.entries.length) this.compact();
  }

  /** 把索引文件重写成当前内存里的这些条（半行、旧条目一并清掉）。 */
  private compact(): void {
    const text = this.entries.map((e) => JSON.stringify(e)).join('\n');
    try {
      writeFileSync(this.index, text ? `${text}\n` : '', 'utf8');
    } catch {
      /* 写不动就算了，下次再压 */
    }
  }

  /**
   * 收下这批图。返回落库的条目（供日志/调试）。
   *
   * **失败不抛**：画集是旁证，不该让"陪看的图没存上"变成"这轮陪看报错"。
   */
  record(blobs: GalleryBlob[] | undefined, meta: GalleryMeta): GalleryEntry[] {
    if (!blobs?.length) return [];
    const out: GalleryEntry[] = [];
    const at = meta.at ?? new Date().toISOString();
    for (const blob of blobs) {
      try {
        const buf = Buffer.isBuffer(blob.bytes) ? blob.bytes : Buffer.from(blob.bytes);
        if (!buf.length) continue;
        const ext = extOf(blob.mime, blob.name);
        const stamp = new Date(at);
        const p = (n: number) => String(n).padStart(2, '0');
        const day = `${stamp.getFullYear()}${p(stamp.getMonth() + 1)}${p(stamp.getDate())}`;
        const clock = `${p(stamp.getHours())}${p(stamp.getMinutes())}${p(stamp.getSeconds())}`;
        const id = `${day}-${clock}-${randomUUID().slice(0, 8)}`;
        const file = `${id}${ext}`;
        writeFileSync(join(this.files, file), buf);
        const entry: GalleryEntry = {
          id,
          at,
          kind: meta.kind,
          file,
          bytes: buf.length,
          mime: blob.mime || MIME_BY_EXT[ext] || 'image/jpeg',
          label: String(meta.label ?? blob.fallbackText ?? blob.name ?? '画面').slice(0, 120),
          ...(meta.oid ? { oid: meta.oid } : {}),
          ...(meta.bvid ? { bvid: meta.bvid } : {}),
          ...(meta.title ? { title: meta.title.slice(0, 200) } : {}),
          ...(meta.roamId ? { roamId: meta.roamId } : {}),
          ...(meta.watchId ? { watchId: meta.watchId } : {}),
          ...(meta.tool ? { tool: meta.tool } : {}),
        };
        this.entries.push(entry);
        this.totalBytes += entry.bytes;
        appendFileSync(this.index, `${JSON.stringify(entry)}\n`, 'utf8');
        out.push(entry);
      } catch {
        // 单张失败不影响其余
      }
    }
    if (out.length) this.prune();
    return out;
  }

  /** 超出条数/体积上限时，从最旧的开始删（**只删自己 files/ 下的**）。 */
  private prune(): void {
    let dropped = 0;
    while (
      this.entries.length > MAX_ENTRIES ||
      (this.totalBytes > MAX_BYTES && this.entries.length > 1)
    ) {
      const old = this.entries.shift();
      if (!old) break;
      this.totalBytes -= Number(old.bytes) || 0;
      dropped += 1;
      try {
        unlinkSync(join(this.files, old.file));
      } catch {
        /* 文件已经不在了 */
      }
    }
    if (dropped) this.compact();
  }

  /** 面板用：只给元数据，图按需再取（一次十几张 base64 会卡）。 */
  list(q: GalleryQuery = {}): { total: number; items: GalleryEntry[]; bytes: number } {
    let rows = this.entries;
    if (q.kind) rows = rows.filter((e) => e.kind === q.kind);
    if (q.oid) rows = rows.filter((e) => e.oid === q.oid);
    if (q.roamId) rows = rows.filter((e) => e.roamId === q.roamId);
    if (q.watchId) rows = rows.filter((e) => e.watchId === q.watchId);
    const sorted = [...rows].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    const limit = Math.max(1, Math.min(200, Number(q.limit) || 60));
    const offset = Math.max(0, Number(q.offset) || 0);
    return {
      total: sorted.length,
      items: sorted.slice(offset, offset + limit),
      bytes: sorted.reduce((n, e) => n + (Number(e.bytes) || 0), 0),
    };
  }

  /** 按 id 取一张图，返回 data URL（复用 qr-start 那套：前端直接塞 <img src>）。 */
  read(id: string): { dataUrl: string; mime: string; entry: GalleryEntry } | null {
    if (!SAFE_ID.test(String(id))) return null;
    const entry = this.entries.find((e) => e.id === id);
    if (!entry) return null;
    const file = join(this.files, entry.file);
    try {
      if (!existsSync(file)) return null;
      // 单张上限 8MB：正常拼图 100KB 级，超了说明不是我们存的
      if (statSync(file).size > 8 * 1024 * 1024) return null;
      const buf = readFileSync(file);
      return { dataUrl: `data:${entry.mime};base64,${buf.toString('base64')}`, mime: entry.mime, entry };
    } catch {
      return null;
    }
  }

  stats(): { entries: number; bytes: number; dir: string } {
    return { entries: this.entries.length, bytes: this.totalBytes, dir: this.dir };
  }

  /** 内容 sha256（只用于日志/去重排查，不作为文件名）。 */
  static digest(blob: GalleryBlob): string {
    return createHash('sha256')
      .update(Buffer.isBuffer(blob.bytes) ? blob.bytes : Buffer.from(blob.bytes))
      .digest('hex');
  }
}
