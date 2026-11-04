/**
 * read/stream.ts — 「把 B 站视频流拉成一份本地 mp4」。
 *
 * 从 `core/video.ts` 拿播放地址，用 ffmpeg 合流落盘。这一层只管**下载**，
 * 不管扫描和分镜（那是 `engine/` 的事）。
 *
 * ## 三处被真机数据改过的实现，都在这里
 *
 * 1. **按 `info.height` 选轨，不重新 pickBest()**（0.1.0 的 bug）：
 *    `playurl` 返回十几条轨道，重新挑会挑到 1080P —— 480p 扫描却下了 16.8MB，
 *    首次读从 9 秒涨到 194 秒，而画面像素一个都没多。
 * 2. **超时按片长算，不是写死 20 分钟**（0.3.1 的 bug）：
 *    实测一条 3 分钟片子因为直链打不开，硬等了 **746 秒**才失败。
 * 3. **ffmpeg 的 stderr 要把 URL 剥掉**（0.3.1 的 bug）：
 *    400 字的错误额度全被带签名的 CDN URL 吃掉，真正原因（HTTP 403 / 超时）一个字没留下。
 */

import { spawn } from 'node:child_process';

import { REFERER, USER_AGENT } from '../core/client.ts';
import type { DashTrack, PlayInfo } from '../core/video.ts';
import { pickBestTrack } from '../core/video.ts';

/** 跑一次 ffmpeg，把 stderr 收进错误信息。 */
function runFfmpeg(
  bin: string,
  args: string[],
  opts: { signal?: AbortSignal; timeoutMs?: number; label?: string } = {},
): Promise<void> {
  const label = opts.label ?? 'ffmpeg';
  const timeoutMs = opts.timeoutMs ?? 10 * 60_000;
  return new Promise((resolve, reject) => {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true, shell: false });
    } catch (error) {
      reject(new Error(`无法启动 ${bin}：${(error as Error).message}`));
      return;
    }
    let stderr = '';
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      opts.signal?.removeEventListener('abort', onAbort);
      fn();
    };
    const onAbort = () => finish(() => { child.kill(); reject(new Error('操作已取消。')); });
    const timer = setTimeout(() => {
      finish(() => { child.kill(); reject(new Error(`${label}超时（${Math.round(timeoutMs / 60000)} 分钟）。`)); });
    }, timeoutMs);
    timer.unref?.();
    opts.signal?.addEventListener('abort', onAbort, { once: true });
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
      if (stderr.length > 8192) stderr = stderr.slice(-4096);
    });
    child.on('error', (error: NodeJS.ErrnoException) => {
      finish(() => reject(new Error(
        error.code === 'ENOENT'
          ? `找不到 ${bin}。装好 ffmpeg 并加进 PATH，或在配置里填绝对路径。`
          : `${label}启动失败：${error.message}`,
      )));
    });
    child.on('close', (code) => {
      finish(() => {
        if (code === 0) {
          resolve();
          return;
        }
        reject(new Error(`${label}失败（${code}）：${explainFfmpegStderr(stderr)}`));
      });
    });
  });
}

/**
 * 把 ffmpeg 的 stderr 压成一句能照着做的话。
 *
 * **不能直接截最后三行**：实测错误额度全被一条带签名的 CDN URL 吃掉了。
 * 做法：先丢 URL，再优先挑诊断行，最后才硬截。
 */
export function explainFfmpegStderr(stderr: string): string {
  const raw = String(stderr ?? '');
  if (!raw.trim()) return '没有输出（可能是网络中断或磁盘空间不足）';

  const lines = raw
    .split('\n')
    .map((l) => l.trim())
    .map((l) => l.replace(/https?:\/\/\S+/g, '<url>'))
    .filter(Boolean);
  if (lines.length === 0) return '没有输出';

  const diagnostic = lines.find((l) =>
    /HTTP\s*(error)?\s*[45]\d\d|Error opening|Invalid data|No such file|Permission denied|ENOSPC|Connection|timed? ?out|Server returned|403|404|412|429/i.test(l),
  );
  if (diagnostic) return diagnostic.replace(/^\[[^\]]*\]\s*/, '').slice(0, 300);
  return lines[lines.length - 1].replace(/^\[[^\]]*\]\s*/, '').slice(0, 300);
}

/**
 * 下载并合流成一份 mp4。
 *
 * `durationSec` 用来算超时：`片长 × 3 + 60 秒`，下限 90 秒、上限 10 分钟。
 */
export async function downloadTo(
  info: PlayInfo,
  out: string,
  ffmpeg: string,
  opts: { signal?: AbortSignal; timeoutMs?: number; durationSec?: number } = {},
): Promise<{ hasAudio: boolean }> {
  // **沿用在 getPlayInfo 里挑过的那一档**，不重新挑（原因见文件头第 1 条）
  const videosAt = info.height === null
    ? info.videos
    : info.videos.filter((t) => (t.height ?? 0) <= info.height! + 1);
  const video = pickBestTrack(videosAt.length ? videosAt : info.videos) ?? null;
  const audio = pickBestTrack(info.audios) ?? null;

  const dur = Number(opts.durationSec) || 0;
  const timeoutMs = opts.timeoutMs ?? (dur > 0
    ? Math.min(10 * 60_000, Math.max(90_000, dur * 3000 + 60_000))
    : 5 * 60_000);

  const args = ['-hide_banner', '-v', 'error', '-y'];

  if (!video && info.progressive) {
    args.push('-user_agent', USER_AGENT, '-referer', REFERER, '-i', info.progressive);
    args.push('-c', 'copy', '-movflags', '+faststart', out);
    await runFfmpeg(ffmpeg, args, { signal: opts.signal, timeoutMs, label: 'B站视频流下载' });
    return { hasAudio: true };
  }

  args.push('-user_agent', USER_AGENT, '-referer', REFERER, '-i', (video as DashTrack).url);
  if (audio) {
    args.push('-user_agent', USER_AGENT, '-referer', REFERER, '-i', audio.url);
    // 显式 map：不加的话封面图（mjpeg）会混进来
    args.push('-map', '0:v:0', '-map', '1:a:0');
  } else {
    args.push('-map', '0:v:0');
  }
  args.push('-c', 'copy', '-movflags', '+faststart', out);
  await runFfmpeg(ffmpeg, args, { signal: opts.signal, timeoutMs, label: 'B站视频流下载' });
  return { hasAudio: Boolean(audio) };
}
