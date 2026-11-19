/**
 * 离线验证：mergeConfig —— 嵌套组要逐键补默认值
 *
 * 起因：`{ ...DEFAULTS, ...ctx.cfg }` 是浅合并，她配置里只要有 `posting`（哪怕只有
 * 5 个老键），默认值整块 `posting` 就被覆盖 → 新加的 `posting.dropStaleReplies`
 * 是 undefined，配置页那个输入框也是空的。
 */
import { BILI_WATCH_DEFAULTS, mergeConfig } from '../src/config.ts';

let ok = 0;
let fail = 0;
const check = (name: string, pass: boolean, extra = '') => {
  console.log(`${pass ? '✅' : '❌'} ${name}${extra ? ` — ${extra}` : ''}`);
  pass ? (ok += 1) : (fail += 1);
};

// 她真机上的 posting 就是这个形状（没有新加的两个键）
const real = {
  enabled: true,
  transport: 'api' as const,
  minIntervalSec: 30,
  maxDailyComments: 80,
  maxDailyReplies: 80,
};

const merged = mergeConfig({ posting: real } as any);
check('旧配置里没有的新键补上默认值', merged.posting.dropStaleReplies === false && merged.posting.staleReplyHours === 24,
  JSON.stringify({ d: merged.posting.dropStaleReplies, h: merged.posting.staleReplyHours }));
check('她自己设的值保留', merged.posting.minIntervalSec === 30 && merged.posting.maxDailyReplies === 80);
check('嵌套组的键一个不少', Object.keys(merged.posting).length === Object.keys(BILI_WATCH_DEFAULTS.posting).length,
  `${Object.keys(merged.posting).length} vs ${Object.keys(BILI_WATCH_DEFAULTS.posting).length}`);

// 显式设成 true 要保留
const on = mergeConfig({ posting: { ...real, dropStaleReplies: true, staleReplyHours: 48 } } as any);
check('显式打开时不被默认值盖掉', on.posting.dropStaleReplies === true && on.posting.staleReplyHours === 48);

// 空配置 / 未配置
const empty = mergeConfig(undefined);
check('没有配置时全是默认值', empty.posting.staleReplyHours === 24 && empty.sleep?.start === '23:30');
const none = mergeConfig({});
check('空对象也不炸', none.posting.maxDailyReplies === 80);

// 顶层标量覆盖
const top = mergeConfig({ enabled: false, cookieSecret: 'X' } as any);
check('顶层标量照常覆盖', top.enabled === false && top.cookieSecret === 'X');

// 不认识的嵌套键要留着（别把用户手写的东西吃掉）
const extra = mergeConfig({ posting: { ...real }, custom: { a: 1 } } as any);
check('未知的嵌套键原样保留', (extra as any).custom?.a === 1);

// 不能改坏默认值本身
check(
  '不污染 BILI_WATCH_DEFAULTS',
  BILI_WATCH_DEFAULTS.posting.dropStaleReplies === false &&
    (BILI_WATCH_DEFAULTS as any).custom === undefined,
);

console.log(`\n${ok} 通过 / ${fail} 失败`);
if (fail) process.exitCode = 1;
