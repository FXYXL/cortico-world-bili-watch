/**
 * core/subtitle-pick.ts — 从站点的字幕轨列表里挑一条。
 *
 * ## 为什么值得单独一个文件
 *
 * 这个"挑哪条轨"的判断原本有**两份**：`core/video.ts` 的 `getSubtitles`（HTTP 那条）
 * 和 `watch/browser.ts` 的 CDP 拦截（播放器实际请求的那条）。两份写法还不一样：
 * 前者「`/^zh/` 优先，否则第一轨」，后者「直接取 `subtitles[0]`」。
 *
 * 后果很具体：AI 轨的 `lan` 是 `ai-zh`，不以 `zh` 开头；一旦视频只有 AI 轨，
 * 两边都会拿到机器转写，而且**没有任何标记**往上传 —— 模型把它当原话引用，
 * 主人一看就知道在瞎编（实测粤语老歌：「欢迎翻到千里年的广东」）。
 *
 * 所以顺序只在这里定义一次：**人工中文 → 人工任意 → AI 中文 → AI 任意**。
 */

export interface SubtitleTrackLike {
  lan?: string;
  lan_doc?: string;
  subtitle_url?: string;
}

/**
 * 这条轨是不是站点自动识别的（AI 字幕）。
 *
 * 两种标记都要认：`lan=ai-zh`（站点给的轨道 id），以及 `lan_doc` 里写「自动生成」
 * 之类。只认前者的话，换个接口字段就漏了。
 */
export function isAutoSubtitle(t: SubtitleTrackLike | undefined | null): boolean {
  if (!t) return false;
  return /^ai-/i.test(String(t.lan ?? '')) || /自动|auto|AI/i.test(String(t.lan_doc ?? ''));
}

/** 人工中文 → 人工任意 → AI 中文 → AI 任意。列表为空返回 undefined。 */
export function pickSubtitleTrack<T extends SubtitleTrackLike>(
  tracks: readonly T[] | undefined | null,
): T | undefined {
  const list = (tracks ?? []).filter(Boolean) as T[];
  if (!list.length) return undefined;
  const zh = (x: T) => /^zh/i.test(String(x.lan ?? ''));
  const manual = list.filter((t) => !isAutoSubtitle(t));
  const auto = list.filter((t) => isAutoSubtitle(t));
  return manual.find(zh) ?? manual[0] ?? auto.find(zh) ?? auto[0] ?? list[0];
}
