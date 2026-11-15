/**
 * social/watchLog.ts — 陪看记录：每一场「一起看」留一条。
 *
 * ## 为什么要在 open 时就落库
 *
 * 之前的陪看**什么都不留** —— exit 只回一句「看了约 N 分钟、M 个帧」，然后没了。
 * 而真机上窗口会意外断开（13:12 那次：浏览器进程没了，exit 根本没调到），
 * 如果等到 exit 才落库，那种场次就什么都不剩。
 *
 * 所以：open 先建一条（`endedAt` 空 = 还开着），exit / 窗口丢失 / 换片时收尾。
 *
 * ## 总结为什么放在 exit
 *
 * 「播完」不等于「看完」：自动连播、暂停聊两句、倒回去重看都常见。播完就写，
 * 写出来是半截的。关窗那一刻上下文最新、片子确定看完了，而且正好也要跟主人说
 * 一句 —— 一句话顺手就有。**可选**：不写也能关窗，记录照样在，面板标「没写总结」。
 */

export interface WatchSession {
  id: string;
  title: string;
  bvid?: string;
  aid?: string;
  /** 视频总时长（秒）。 */
  duration: number;
  startedAt: string;
  endedAt?: string;
  /** 观察帧数（含播完时补的那一帧）。 */
  frames: number;
  /** 关窗时她自己写的一句话；不写就空着。 */
  summary?: string;
  /** `exit` = 正常关窗；`gone` = 窗口/浏览器自己没了；`open` = 还开着。 */
  end?: 'exit' | 'gone' | 'switch' | 'open';
}

/** 面板上那行「3:25 的片子看了 12 分钟 / 14 帧」。 */
export function watchLine(w: WatchSession): string {
  const len = w.duration > 0 ? clockOf(w.duration) : '';
  return `${len ? `${len} 的片子 · ` : ''}${w.frames} 个观察帧`;
}

export function clockOf(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}
