/**
 * core/sleep.ts —— 睡眠时间窗。
 *
 * 为什么单独一个文件：
 *   跨午夜的时间窗（23:30 → 08:00）是最容易写错的那类判断 —— `start > end`
 *   时必须用 `或` 而不是 `与`，差一个字符就变成"整天都算睡觉"。抽成纯函数
 *   才测得动。
 *
 * 只判断"现在是不是睡眠时间"，不做任何投递决策 —— 拦截放在调用方，
 * 这样私信要不要通这类策略不会渗进时间判断里。
 */
import type { BiliWatchConfig } from '../config.ts';

/** 把 "HH:MM" 拆成当天第几分钟；非法返回 undefined。 */
export function parseClock(value: unknown): number | undefined {
  const m = String(value ?? '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return undefined;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return undefined;
  return h * 60 + min;
}

/** 某分钟数还原成 "HH:MM"。 */
export function fmtClock(minutes: number): string {
  const m = Math.max(0, Math.min(24 * 60 - 1, Math.round(minutes)));
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/**
 * 某个时刻在指定时区是当天的第几分钟。
 *
 * 用 Intl 而不是本地 `getHours()`：宿主的时区设置跟她所在的地方不一定一致，
 * 这个插件一直是按配置里的 timezone 算天的（配额、每日上限都靠它）。
 */
export function minutesOfDay(at: Date, timeZone: string): number | undefined {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(at);
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
    // 某些 ICU 版本午夜给的是 "24"，取模兜一下
    const h = Number(get('hour')) % 24;
    const m = Number(get('minute'));
    if (!Number.isFinite(h) || !Number.isFinite(m)) return undefined;
    return h * 60 + m;
  } catch {
    return undefined;
  }
}

export interface SleepState {
  sleeping: boolean;
  /** 睡眠中时给出醒来的钟点（"08:00"），用于提示和状态展示 */
  until?: string;
}

/**
 * 现在是不是睡眠时间。
 *
 * 配置不合法（写成 "25:00"、开始=结束）一律当**没开** —— 宁可多推送，
 * 也不能因为填错一个字符就整天不说话。
 */
export function sleepState(
  cfg: BiliWatchConfig['sleep'] | undefined,
  timeZone: string,
  now: Date = new Date(),
): SleepState {
  if (!cfg?.enabled) return { sleeping: false };
  const start = parseClock(cfg.start);
  const end = parseClock(cfg.end);
  if (start === undefined || end === undefined || start === end) return { sleeping: false };
  const t = minutesOfDay(now, timeZone);
  if (t === undefined) return { sleeping: false };
  // 跨午夜：23:30→08:00 是 t >= start 或 t < end，不是"与"
  const sleeping = start < end ? t >= start && t < end : t >= start || t < end;
  return { sleeping, until: sleeping ? fmtClock(end) : undefined };
}
