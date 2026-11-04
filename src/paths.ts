/**
 * paths.ts — 本 World 自己的目录布局。
 *
 * ## 为什么必须给每个 World 一个私有目录
 *
 * `WorldContext.dataDir` 是**整份部署共享**的（`.../companion/data`），不是每个 World 一个。
 *
 * 后果很具体：`data/media/` 放的是**宿主的图片附件库**（几百个 .jpg/.png）。
 * 不加区分地把视频副本写进去，宿主的附件目录里就会混进几十 MB 的 mp4，
 * 而「数据清理」页签还在数另一个目录 —— 主人点了清除也清不掉。
 *
 * 所以：**所有落盘都收敛到 `<dataDir>/worlds/bili-watch/` 下面**。
 *
 * ## ⚠ 别原样复制别的插件的 paths.ts
 *
 * 这个文件最初是从 `cortico-world-video-reader` 抄来的，**`worldRoot` 里的目录名忘了改**，
 * 于是新插件把自己的记录写进了 video-reader 的目录 —— 两个插件会互相覆盖 `state.json`。
 *
 * 真机验证时发现的：闲逛记录"落盘成功"，但落在 `worlds/video-reader/state/state.json`。
 * 所以这里把目录名抽成 `WORLD_DIRNAME` 常量，抄文件时第一件事就是改它。
 */

import { mkdirSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 本 World 在 `data/worlds/` 下的目录名。
 * **改了它等于换数据目录** —— 老记录会看不见，发布后不要再动。
 */
export const WORLD_DIRNAME = 'bili-watch';

/** 本 World 的私有根。**不要直接用 ctx.dataDir**。 */
export function worldRoot(dataDir: string): string {
  return join(dataDir, 'worlds', WORLD_DIRNAME);
}

export interface WorldDirs {
  root: string;
  /** 下载的视频副本（引擎的媒体 LRU）。 */
  media: string;
  /** 引擎的扫描缓存、cells.json、seen.jsonl。 */
  cache: string;
  /** 站点字幕与本地转写。 */
  transcripts: string;
  /** 互动记录、用量账本、动态草稿、临时产物（如硬字幕长图）。 */
  state: string;
  /** 浏览器发评的资料目录（登录态）。 */
  browserProfile: string;
}

export function worldDirs(dataDir: string): WorldDirs {
  const root = worldRoot(dataDir);
  return {
    root,
    media: join(root, 'media'),
    cache: join(root, 'cache'),
    transcripts: join(root, 'transcripts'),
    state: join(root, 'state'),
    browserProfile: join(root, 'browser-profile'),
  };
}

export function ensureDirs(dataDir: string): WorldDirs {
  const d = worldDirs(dataDir);
  for (const p of [d.root, d.media, d.cache, d.transcripts, d.state]) {
    mkdirSync(p, { recursive: true });
  }
  return d;
}

/** 目录体积（有上限地走）。面板显示用。 */
export function dirSize(dir: string, budget = 4000): number {
  let total = 0;
  let seen = 0;
  const stack = [dir];
  while (stack.length && seen < budget) {
    const cur = stack.pop() as string;
    let names: string[];
    try {
      names = readdirSync(cur);
    } catch {
      continue;
    }
    for (const name of names) {
      if (seen >= budget) break;
      const p = join(cur, name);
      try {
        const st = statSync(p);
        seen += 1;
        if (st.isDirectory()) stack.push(p);
        else total += st.size;
      } catch {
        /* 走到一半被删了：跳过 */
      }
    }
  }
  return total;
}

/** 目录里有多少个文件（不递归）。 */
export function fileCount(dir: string): number {
  try {
    return readdirSync(dir, { withFileTypes: true }).filter((e) => e.isFile()).length;
  } catch {
    return 0;
  }
}
