/**
 * 离线验证：睡眠时间窗（0.2.13）
 *
 * 跨午夜（23:30 → 08:00）是最容易写错的：`start > end` 时必须用「或」，
 * 写成「与」就变成整天都在睡。所以每个边界都单列一条。
 */
import { sleepState, parseClock, fmtClock, minutesOfDay } from '../src/core/sleep.ts';
import type { BiliWatchConfig } from '../src/config.ts';

type SleepCfg = BiliWatchConfig['sleep'];

let ok = 0;
let fail = 0;
const check = (label: string, cond: boolean, extra = '') => {
  if (cond) ok++;
  else fail++;
  console.log(`${cond ? '✅' : '❌'} ${label}${extra ? ' — ' + extra : ''}`);
};

/** 用 UTC 时间构造"北京时间某点"的时刻，避免依赖本机时区 */
const at = (hhmm: string) => new Date(`2026-11-14T${hhmm}:00+08:00`);

const sleeping = (cfg: SleepCfg, time: string, tz = 'Asia/Shanghai') =>
  sleepState(cfg, tz, at(time)).sleeping;

// ① 跨午夜：23:30 → 08:00
const night: SleepCfg = { enabled: true, start: '23:30', end: '08:00', allowDm: true };
check('23:00 不该睡', !sleeping(night, '23:00'));
check('23:30 开始睡（含起点）', sleeping(night, '23:30'));
check('00:00 在睡', sleeping(night, '00:00'));
check('03:00 在睡', sleeping(night, '03:00'));
check('07:59 还在睡', sleeping(night, '07:59'));
check('08:00 该醒（不含终点）', !sleeping(night, '08:00'));
check('12:00 醒着', !sleeping(night, '12:00'));
check('醒来钟点是 08:00', sleepState(night, 'Asia/Shanghai', at('02:00')).until === '08:00');

// ② 同日窗口：13:00 → 14:30（午睡）
const nap: SleepCfg = { enabled: true, start: '13:00', end: '14:30', allowDm: true };
check('12:59 不该睡', !sleeping(nap, '12:59'));
check('13:00 开始睡', sleeping(nap, '13:00'));
check('14:29 在睡', sleeping(nap, '14:29'));
check('14:30 醒', !sleeping(nap, '14:30'));
check('23:00 不睡（同日窗口不会绕回来）', !sleeping(nap, '23:00'));

// ③ 配置异常一律当"没开"（宁可多推送，也不能整天沉默）
check('默认关闭 = 不睡', !sleeping({ ...night, enabled: false }, '02:00'));
check('开始=结束 = 不睡', !sleeping({ ...night, start: '08:00', end: '08:00' }, '02:00'));
check('非法时间 = 不睡', !sleeping({ ...night, start: '25:00' }, '02:00'));
check('空字符串 = 不睡', !sleeping({ ...night, start: '' }, '02:00'));

// ④ 时区按配置算，不按本机
// 北京时间 02:00 = UTC 前一日 18:00 → 在 UTC 时区看是"傍晚"，不该算睡
check('同一时刻换时区判断会变', !sleepState(night, 'UTC', new Date('2026-11-13T18:00:00Z')).sleeping);
check('北京时间同一时刻在睡', sleepState(night, 'Asia/Shanghai', new Date('2026-11-13T18:00:00Z')).sleeping);

// ⑤ 工具函数
check('parseClock 23:30', parseClock('23:30') === 1410);
check('parseClock 8:05（单位数小时）', parseClock('8:05') === 485);
check('parseClock 垃圾', parseClock('abc') === undefined);
check('fmtClock 480 → 08:00', fmtClock(480) === '08:00');
check('minutesOfDay 午夜不返回 24 点', minutesOfDay(new Date('2026-11-13T16:00:00Z'), 'Asia/Shanghai') === 0);

console.log(`\n${ok} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
