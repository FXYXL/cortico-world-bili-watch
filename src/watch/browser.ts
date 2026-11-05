/**
 * watch/browser.ts — 陪看的浏览器：**主人看得见的那个窗口**。
 *
 * 按 [cortico-world-bili-video-pro](https://github.com/mutoubaicai/cortico-world-bili-video-pro)（MIT，Phantivia）
 * 的方案，puppeteer 换成插件已有的 playwright-core：
 *
 * - **必须 spawn 本机 Chrome/Edge**（`windowsHide: false`）：框架的 `launch()` 在 Windows
 *   会把窗口藏起来——主人要看的画面就没了。这是 video-pro 注释里明确的坑。
 * - **独立 user-data-dir**：绝不碰主人自己的 Chrome 配置。
 * - CDP 拦 `seg.so` / player v2 响应 → 弹幕池（复用 `core/danmaku.ts`）。
 * - 抽帧/拼图在**被控页面里**用 canvas 做（B 站视频流不污染同源 canvas），
 *   Node 侧零图像依赖 —— 页面脚本照搬 video-pro 的 `SAMPLE_FRAME` / `LOOK_FRAME`。
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import net from 'node:net';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { chromium, type Browser, type CDPSession, type Page } from 'playwright-core';

import { decodeDanmakuSegment, parseSubtitle, type Danmaku, type SubtitleLine } from '../core/danmaku.ts';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/132.0.0.0 Safari/537.36';
const LAUNCH_TIMEOUT_MS = 30_000;
const NAV_TIMEOUT_MS = 30_000;
const STDERR_TAIL = 2000;

/** 常见安装路径（按顺序找第一个存在的）。 */
const EXECUTABLES: Record<string, string[]> = {
  win32: [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    join(process.env.LOCALAPPDATA ?? '', 'Google/Chrome/Application/chrome.exe'),
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  ],
  darwin: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'],
  linux: ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/microsoft-edge'],
};

export interface WatchBrowserOptions {
  dataDir: string;
  executable?: string;
  cdpUrl?: string;
  windowWidth: number;
  windowHeight: number;
  cookie: () => string;
  onDanmaku: (list: readonly Danmaku[]) => void;
  onSubtitle: (lines: readonly SubtitleLine[]) => void;
  onLost: () => void;
  log?: (msg: string) => void;
}

export interface Sample {
  t: number;
  /** cell JPEG，base64。 */
  jpeg: string;
  /** 64×36 亮度图（行优先）。 */
  gray: number[];
  w: number;
  h: number;
}

export interface Playback {
  t: number;
  duration: number;
  paused: boolean;
  ended: boolean;
  readyState: number;
  bufferedEnd: number;
  width: number;
  height: number;
  webFullscreen: boolean;
  quality: string;
}

export interface VideoInfo {
  aid: number;
  cid: number;
  bvid: string;
  title: string;
  owner: string;
  duration: number;
  p: number;
  parts: Array<{ p: number; title: string; duration: number }>;
  desc: string;
  chapters: Array<{ from: number; to: number; title: string }>;
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close(() => (port ? resolve(port) : reject(new Error('拿不到空闲端口'))));
    });
    srv.on('error', reject);
  });
}

async function waitForDevtools(url: string, timeoutMs: number, dead: () => boolean): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (dead()) throw new Error('浏览器进程退出了');
    try {
      const res = await fetch(`${url}/json/version`, { signal: AbortSignal.timeout(1500) });
      if (res.ok) return;
    } catch {
      /* 还没起来，继续等 */
    }
    await delay(250);
  }
  throw new Error(`${timeoutMs / 1000} 秒内没有开出调试端口`);
}

/*
 * 页面脚本是字符串：TS 编译会把函数包上页面没有的辅助物。
 * 裁剪状态存在 `window.__bvCrop`，让 look 共享采样器的决定。
 */
const SAMPLE_FRAME = `(cellLong, cellShort, q) => {
  const v = document.querySelector('video');
  if (!v || v.readyState < 2 || !v.videoWidth) return null;
  const W = v.videoWidth, H = v.videoHeight;
  const PW = 96, PH = 54, BLACK = 24;
  const p = window.__bvProbe || (window.__bvProbe = document.createElement('canvas'));
  if (p.width !== PW) { p.width = PW; p.height = PH; }
  const px = p.getContext('2d', { willReadFrequently: true });
  px.drawImage(v, 0, 0, PW, PH);
  const d = px.getImageData(0, 0, PW, PH).data;
  const colMax = new Array(PW).fill(0), rowMax = new Array(PH).fill(0);
  for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) {
    const i = (y * PW + x) * 4;
    const l = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
    if (l > colMax[x]) colMax[x] = l;
    if (l > rowMax[y]) rowMax[y] = l;
  }
  let x0 = 0, x1 = PW - 1, y0 = 0, y1 = PH - 1;
  while (x0 < x1 && colMax[x0] < BLACK) x0++;
  while (x1 > x0 && colMax[x1] < BLACK) x1--;
  while (y0 < y1 && rowMax[y0] < BLACK) y0++;
  while (y1 > y0 && rowMax[y1] < BLACK) y1--;
  let det = { x: x0 / PW, y: y0 / PH, w: (x1 - x0 + 1) / PW, h: (y1 - y0 + 1) / PH };
  if (det.w < 0.2 || det.h < 0.2) det = { x: 0, y: 0, w: 1, h: 1 };
  const hist = window.__bvCropHist || (window.__bvCropHist = []);
  hist.push(det);
  if (hist.length > 4) hist.shift();
  let cx0 = 1, cy0 = 1, cx1 = 0, cy1 = 0;
  for (const r of hist) { cx0 = Math.min(cx0, r.x); cy0 = Math.min(cy0, r.y); cx1 = Math.max(cx1, r.x + r.w); cy1 = Math.max(cy1, r.y + r.h); }
  const crop = { x: Math.round(cx0 * W), y: Math.round(cy0 * H), w: Math.max(16, Math.round((cx1 - cx0) * W)), h: Math.max(16, Math.round((cy1 - cy0) * H)) };
  window.__bvCrop = crop;
  const portrait = crop.h > crop.w;
  const w = portrait ? cellShort : cellLong, h = portrait ? cellLong : cellShort;
  const c = window.__bvCell || (window.__bvCell = document.createElement('canvas'));
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  const ctx = c.getContext('2d');
  const s = Math.min(w / crop.w, h / crop.h);
  const dw = Math.round(crop.w * s), dh = Math.round(crop.h * s);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(v, crop.x, crop.y, crop.w, crop.h, Math.floor((w - dw) / 2), Math.floor((h - dh) / 2), dw, dh);
  const jpeg = (c.toDataURL('image/jpeg', q).split(',')[1]) || '';
  const g = window.__bvGray || (window.__bvGray = document.createElement('canvas'));
  if (g.width !== 64) { g.width = 64; g.height = 36; }
  const gx = g.getContext('2d', { willReadFrequently: true });
  gx.drawImage(v, crop.x, crop.y, crop.w, crop.h, 0, 0, 64, 36);
  const gd = gx.getImageData(0, 0, 64, 36).data;
  const gray = [];
  for (let i = 0; i < gd.length; i += 4) gray.push((gd[i] * 299 + gd[i + 1] * 587 + gd[i + 2] * 114) / 1000);
  return { t: v.currentTime, jpeg, gray, w, h, crop };
}`;

const LOOK_FRAME = `(mw, mh, q, r) => {
  const v = document.querySelector('video');
  if (!v || v.readyState < 2 || !v.videoWidth) return null;
  const crop = window.__bvCrop || { x: 0, y: 0, w: v.videoWidth, h: v.videoHeight };
  const sx = crop.x + (r ? r.x * crop.w : 0), sy = crop.y + (r ? r.y * crop.h : 0);
  const sw = r ? r.width * crop.w : crop.w, sh = r ? r.height * crop.h : crop.h;
  const scale = Math.min(1, mw / sw, mh / sh);
  const w = Math.max(16, Math.round(sw * scale)), h = Math.max(16, Math.round(sh * scale));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d').drawImage(v, sx, sy, sw, sh, 0, 0, w, h);
  return { jpeg: (c.toDataURL('image/jpeg', q).split(',')[1]) || '', width: w, height: h, t: v.currentTime };
}`;

const VIDEO_INFO = `() => {
  const v = document.querySelector('video');
  if (!v) return null;
  const __INITIAL_STATE__ = window.__INITIAL_STATE__ || {};
  const current = (__INITIAL_STATE__.videoInfo?.pages || []).find((p) => p.cid === __INITIAL_STATE__.videoInfo?.cid) || (__INITIAL_STATE__.videoInfo?.pages || [])[0];
  const pages = __INITIAL_STATE__.videoInfo?.pages || [];
  const owner = __INITIAL_STATE__.videoInfo?.owner || {};
  const stat = __INITIAL_STATE__.videoInfo?.stat || {};
  const chapters = (__INITIAL_STATE__.playerData?.view?.chapters || __INITIAL_STATE__.videoData?.chapters || []).map((c) => ({ from: Number(c.from ?? 0), to: Number(c.to ?? 0), title: String(c.content ?? c.title ?? '') }));
  return {
    aid: Number(v.aid ?? __INITIAL_STATE__.videoInfo?.aid ?? 0),
    cid: Number(current?.cid ?? v.cid ?? 0),
    bvid: String(__INITIAL_STATE__.videoInfo?.bvid || location.pathname.match(/BV[0-9A-Za-z]{10}/)?.[0] || ''),
    title: String(__INITIAL_STATE__.videoInfo?.title || document.title.replace(/_哔哩哔哩.*/, '')),
    owner: String(owner.name ?? ''),
    duration: Number(current?.duration ?? v.duration ?? 0),
    p: Number(current?.page ?? 1),
    parts: pages.map((x) => ({ p: Number(x.page), title: String(x.part ?? ''), duration: Number(x.duration ?? 0) })),
    desc: String(__INITIAL_STATE__.videoInfo?.desc ?? ''),
    views: Number(stat.view ?? 0),
    chapters,
  };
}`;

export class WatchBrowser {
  private readonly o: WatchBrowserOptions;
  private browser: Browser | null = null;
  private page: Page | null = null;
  private cdp: CDPSession | null = null;
  private process: ChildProcess | null = null;
  private starting: Promise<Page> | null = null;
  /** CDP 里看到待取体的 URL（requestId → url）。 */
  private readonly pendingBodies = new Map<string, string>();

  constructor(opts: Partial<WatchBrowserOptions> & Pick<WatchBrowserOptions, 'dataDir' | 'cookie' | 'onDanmaku' | 'onLost'>) {
    this.o = {
      windowWidth: 1280,
      windowHeight: 720,
      onSubtitle: () => {},
      log: () => {},
      ...opts,
    } as WatchBrowserOptions;
  }

  get connected(): boolean {
    return Boolean(this.browser?.isConnected?.() ?? false) || Boolean(this.page && !this.page.isClosed());
  }

  url(): string {
    return this.page?.url() ?? '';
  }

  private executable(): string {
    if (this.o.executable) {
      if (!existsSync(this.o.executable)) throw new Error(`找不到浏览器程序 ${this.o.executable}`);
      return this.o.executable;
    }
    const hit = (EXECUTABLES[process.platform] ?? []).find((p) => p && existsSync(p));
    if (!hit) throw new Error('这台电脑上没找到 Chrome 或 Edge；在配置里填「陪看浏览器路径」。');
    return hit;
  }

  async ensure(): Promise<Page> {
    if (this.page && !this.page.isClosed() && this.browser?.isConnected()) return this.page;
    this.starting ??= this.open().finally(() => {
      this.starting = null;
    });
    return this.starting;
  }

  private async open(): Promise<Page> {
    let browser: Browser;
    let launched = false;
    if (this.o.cdpUrl) {
      browser = await chromium.connectOverCDP(this.o.cdpUrl, { timeout: LAUNCH_TIMEOUT_MS });
    } else {
      // spawn 而不是 chromium.launch：launch 在 Windows 会 windowsHide，主人的画面就没了
      const { windowWidth: w, windowHeight: h } = this.o;
      const port = await freePort();
      const profileDir = join(this.o.dataDir, 'watch-browser');
      mkdirSync(profileDir, { recursive: true });
      const args = [
        `--remote-debugging-port=${port}`,
        `--user-data-dir=${profileDir}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-infobars',
        '--hide-crash-restore-bubble',
        `--window-size=${w},${h}`,
        '--autoplay-policy=no-user-gesture-required',
        '--disable-features=Translate',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-background-timer-throttling',
        'about:blank',
      ];
      const file = this.executable();
      const proc = spawn(file, args, { windowsHide: false, detached: false, stdio: ['ignore', 'ignore', 'pipe'] });
      this.process = proc;
      let stderr = '';
      proc.stderr?.setEncoding('utf8').on('data', (chunk: string) => {
        stderr = (stderr + chunk).slice(-STDERR_TAIL);
      });
      proc.on('exit', (code) => {
        if (this.process === proc) {
          this.process = null;
          this.o.log?.(`陪看浏览器退出（${code}）${stderr.trim() ? `：${stderr.trim().slice(0, 160)}` : ''}`);
        }
      });
      const browserURL = `http://127.0.0.1:${port}`;
      try {
        await waitForDevtools(browserURL, LAUNCH_TIMEOUT_MS, () => proc.exitCode !== null);
        browser = await chromium.connectOverCDP(browserURL, { timeout: LAUNCH_TIMEOUT_MS });
      } catch (err) {
        proc.kill();
        this.process = null;
        throw new Error(`陪看浏览器没起来：${(err as Error).message}${stderr.trim() ? `（${stderr.trim().slice(0, 160)}）` : ''}`);
      }
      launched = true;
    }
    browser.on('disconnected', () => {
      if (this.browser !== browser) return;
      this.browser = null;
      this.page = null;
      this.cdp = null;
      this.o.log?.('陪看浏览器断开');
      this.o.onLost();
    });
    void launched;
    this.browser = browser;
    const context = browser.contexts()[0] ?? (await browser.newContext());
    await this.syncCookies(context);
    const pages = context.pages().filter((p) => !p.url().startsWith('devtools://') && !p.isClosed());
    const page = pages[0] ?? (await context.newPage());
    for (const extra of pages.slice(1)) await extra.close().catch(() => {});
    await page.setExtraHTTPHeaders({ 'User-Agent': UA }).catch(() => {});
    await this.attach(page);
    this.page = page;
    return page;
  }

  /** 登录态注入（只认五个字段，与 core/client.ts 一致）。 */
  private async syncCookies(context: import('playwright-core').BrowserContext): Promise<void> {
    const raw = this.o.cookie();
    if (!raw) return;
    const want = ['SESSDATA', 'bili_jct', 'DedeUserID', 'buvid3', 'buvid4'];
    const cookies: Array<{ name: string; value: string; domain: string; path: string }> = [];
    for (const part of raw.split(';')) {
      const idx = part.indexOf('=');
      if (idx < 0) continue;
      const name = part.slice(0, idx).trim();
      const value = part.slice(idx + 1).trim();
      if (want.includes(name) && value) cookies.push({ name, value, domain: '.bilibili.com', path: '/' });
    }
    if (cookies.length) await context.addCookies(cookies).catch(() => {});
  }

  private async attach(page: Page): Promise<void> {
    page.setDefaultNavigationTimeout(NAV_TIMEOUT_MS);
    page.on('dialog', (d) => {
      void d.dismiss().catch(() => {});
    });
    const context = page.context();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    cdp.on('Network.responseReceived', (e: any) => {
      const url = String(e?.response?.url ?? '');
      if (/seg\.so/.test(url) || /\/x\/player\/(wbi\/)?v2\?/.test(url)) this.pendingBodies.set(String(e.requestId), url);
    });
    cdp.on('Network.loadingFinished', (e: any) => {
      const url = this.pendingBodies.get(String(e.requestId));
      if (!url) return;
      this.pendingBodies.delete(String(e.requestId));
      void cdp
        .send('Network.getResponseBody', { requestId: e.requestId })
        .then((r: any) => this.onBody(url, r.body, r.base64Encoded))
        .catch(() => {});
    });
    this.cdp = cdp;
  }

  /** seg.so → 弹幕；player v2 的 subtitle url → 字幕。 */
  private onBody(url: string, body: string, base64: boolean): void {
    try {
      if (/seg\.so/.test(url)) {
        const bytes = base64 ? Buffer.from(body, 'base64') : Buffer.from(body, 'utf8');
        const list = decodeDanmakuSegment(new Uint8Array(bytes));
        if (list.length) this.o.onDanmaku(list);
      } else if (/\/x\/player\/(wbi\/)?v2\?/.test(url) && base64) {
        const json = JSON.parse(Buffer.from(body, 'base64').toString('utf8'));
        const url2 = json?.data?.subtitle?.subtitles?.[0]?.subtitle_url;
        if (typeof url2 === 'string' && url2) void this.loadSubtitle(url2);
      }
    } catch {
      /* 拦截是锦上添花 */
    }
  }

  private async loadSubtitle(subtitleUrl: string): Promise<void> {
    try {
      const url = subtitleUrl.startsWith('//') ? `https:${subtitleUrl}` : subtitleUrl;
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) return;
      const lines = parseSubtitle(await res.json());
      if (lines.length) this.o.onSubtitle(lines);
    } catch {
      /* 字幕失败不影响看 */
    }
  }

  /** 打开一条视频并等播放器就绪。 */
  async openVideo(input: string): Promise<void> {
    const page = await this.ensure();
    const id = input.replace(/^https?:\/\/[^/]*\/video\//i, '').split(/[?#/]/)[0] || input;
    if (!/^BV[0-9A-Za-z]{10}$|^av\d{1,20}$/i.test(id)) throw new Error(`认不出视频编号：${input}`);
    const url = id.toLowerCase().startsWith('av')
      ? `https://www.bilibili.com/video/av${id.slice(2)}`
      : `https://www.bilibili.com/video/${id}`;
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('video', { timeout: NAV_TIMEOUT_MS });
    await this.play().catch(() => {});
  }

  async videoInfo(): Promise<VideoInfo | null> {
    const page = this.page;
    if (!page || page.isClosed()) return null;
    return (await page.evaluate(`(${VIDEO_INFO})()`).catch(() => null)) as VideoInfo | null;
  }

  async playback(): Promise<Playback | null> {
    const page = this.page;
    if (!page || page.isClosed()) return null;
    return (await page
      .evaluate(() => {
        const v = document.querySelector('video');
        if (!v) return null;
        const container = document.querySelector('.bpx-player-container');
        let bufferedEnd = 0;
        for (let i = 0; i < v.buffered.length; i++) {
          if (v.buffered.start(i) <= v.currentTime + 0.5 && v.buffered.end(i) >= v.currentTime - 0.5) bufferedEnd = v.buffered.end(i);
        }
        const quality = (document.querySelector('.bpx-player-ctrl-quality-result') as HTMLElement | null)?.innerText?.trim() ?? '';
        return {
          t: v.currentTime,
          duration: v.duration || 0,
          paused: v.paused,
          ended: v.ended,
          readyState: v.readyState,
          bufferedEnd,
          width: v.videoWidth,
          height: v.videoHeight,
          webFullscreen: container?.getAttribute('data-screen') === 'web',
          quality,
        };
      })
      .catch(() => null)) as Playback | null;
  }

  async qualityOptions(): Promise<Array<{ label: string; active: boolean }>> {
    const page = await this.ensure();
    return (await page
      .evaluate(() =>
        Array.from(document.querySelectorAll<HTMLElement>('.bpx-player-ctrl-quality-menu-item')).map((el) => ({
          label: el.innerText.replace(/\s+/g, ' ').trim(),
          active: el.classList.contains('bpx-state-active'),
        })),
      )
      .catch(() => [])) as Array<{ label: string; active: boolean }>;
  }

  async setQuality(want: string): Promise<boolean> {
    const page = await this.ensure();
    return Boolean(
      await page
        .evaluate((w) => {
          const items = Array.from(document.querySelectorAll<HTMLElement>('.bpx-player-ctrl-quality-menu-item'));
          const hit = items.find((el) => el.innerText.replace(/\s+/g, '').includes(String(w).replace(/\s+/g, '')));
          if (!hit) return false;
          hit.click();
          return true;
        }, want)
        .catch(() => false),
    );
  }

  async setWebFullscreen(on: boolean): Promise<void> {
    const page = await this.ensure();
    const now = (await this.playback())?.webFullscreen ?? false;
    if (now === on) return;
    await page
      .evaluate(() => {
        (document.querySelector('.bpx-player-ctrl-web') as HTMLElement | null)?.click();
      })
      .catch(() => {});
  }

  async play(fromSec?: number): Promise<void> {
    const page = await this.ensure();
    await page
      .evaluate((from) => {
        const v = document.querySelector('video');
        if (!v) throw new Error('页面上没有播放器');
        if (typeof from === 'number') v.currentTime = from;
        void (v as HTMLVideoElement).play().catch(() => {});
      }, fromSec)
      .catch((e) => {
        throw new Error(`播放失败：${(e as Error).message}`);
      });
  }

  async pause(): Promise<void> {
    const page = await this.ensure();
    await page
      .evaluate(() => {
        document.querySelector('video')?.pause();
      })
      .catch(() => {});
  }

  async seek(sec: number): Promise<void> {
    const page = await this.ensure();
    await page
      .evaluate((s) => {
        const v = document.querySelector('video');
        if (v) v.currentTime = s;
      }, sec)
      .catch(() => {});
  }

  /** 一格采样（cell JPEG + 64×36 亮度图）。播放器没就绪返回 null。 */
  async sample(cellLong: number, cellShort: number, quality: number): Promise<Sample | null> {
    const page = this.page;
    if (!page || page.isClosed()) return null;
    return (await page.evaluate(`(${SAMPLE_FRAME})(${cellLong}, ${cellShort}, ${quality})`).catch(() => null)) as Sample | null;
  }

  /** 当前帧（look 用）。 */
  async frame(
    maxW: number,
    maxH: number,
    quality: number,
  ): Promise<{ jpeg: string; width: number; height: number; t: number } | null> {
    const page = this.page;
    if (!page || page.isClosed()) return null;
    return (await page.evaluate(`(${LOOK_FRAME})(${maxW}, ${maxH}, ${quality}, null)`).catch(() => null)) as {
      jpeg: string;
      width: number;
      height: number;
      t: number;
    } | null;
  }

  /** 把若干格 JPEG 拼成网格（在页面 canvas 里画，Node 侧零依赖）。 */
  async montage(
    cells: readonly string[],
    cols: number,
    rows: number,
    cellW: number,
    cellH: number,
    quality: number,
  ): Promise<string | null> {
    const page = this.page;
    if (!page || page.isClosed()) return null;
    // ⚠ `page.evaluate` 在 **playwright 里只接受一个参数**（多参数是 puppeteer 的签名）。
    // 这里踩过：传 6 个参数 → nc/nr/w/h/q 全 undefined → canvas 尺寸 NaN → 拼图
    // 一直返回 null，而 look（字符串内联参数）正常 —— 观察帧全灭的真凶就是这里。
    return (await page
      .evaluate(
        async (a: { jpegs: string[]; nc: number; nr: number; w: number; h: number; q: number }) => {
          const { jpegs, nc, nr, w, h, q } = a;
          const c = document.createElement('canvas');
          c.width = nc * w;
          c.height = nr * h;
          const ctx = c.getContext('2d')!;
          ctx.fillStyle = '#000';
          ctx.fillRect(0, 0, c.width, c.height);
          await Promise.all(
            jpegs.map(
              (src, i) =>
                new Promise<void>((res) => {
                  const im = new Image();
                  im.onload = () => {
                    ctx.drawImage(im, (i % nc) * w, Math.floor(i / nc) * h, w, h);
                    res();
                  };
                  im.onerror = () => res();
                  im.src = `data:image/jpeg;base64,${src}`;
                }),
            ),
          );
          return c.toDataURL('image/jpeg', q).split(',')[1] ?? '';
        },
        { jpegs: [...cells], nc: cols, nr: rows, w: cellW, h: cellH, q: quality },
      )
      .catch(() => null)) as string | null;
  }

  async stop(): Promise<void> {
    try {
      await this.browser?.close();
    } catch {
      /* 已经断了 */
    }
    this.browser = null;
    this.page = null;
    this.cdp = null;
    if (this.process && this.process.exitCode === null) this.process.kill();
    this.process = null;
  }

  /**
   * 诊断用：原始执行一段页面脚本，**把异常原文带回来**。
   * sample 的失败被静默吞掉过一整轮，就是因为它只返回 null。
   */
  async evaluateRaw<T = unknown>(script: string): Promise<{ ok: boolean; value?: T; error?: string }> {
    const page = this.page;
    if (!page || page.isClosed()) return { ok: false, error: 'no page' };
    try {
      const value = (await page.evaluate(script)) as T;
      return { ok: true, value };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }

  /** 诊断用：跑一次 SAMPLE_FRAME 并带出原始异常。 */
  async debugSample(cellLong: number, cellShort: number, quality: number): Promise<{ ok: boolean; value?: Sample; error?: string }> {
    return this.evaluateRaw<Sample>(`(${SAMPLE_FRAME})(${cellLong}, ${cellShort}, ${quality})`);
  }

  /** 会话指纹（日志用）。 */
  fingerprint(): string {
    return createHash('sha1').update(this.url()).digest('hex').slice(0, 8);
  }
}
