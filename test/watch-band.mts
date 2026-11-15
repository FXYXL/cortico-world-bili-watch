/**
 * 离线验证：字幕带取样（0.2.16 的 A 方案）
 *
 * 规则只有一条：**最多 4 条，多的时候按时间均匀取**。
 * 取前 4 条不行 —— 镜头切换密集时那就等于只看开头几秒。
 */
import { pickSpaced, pickTextBands } from '../src/watch/capture.ts';

let ok = 0;
let fail = 0;
const check = (label: string, cond: boolean, extra = '') => {
  if (cond) ok++;
  else fail++;
  console.log(`${cond ? '✅' : '❌'} ${label}${extra ? ` — ${extra}` : ''}`);
};

const list = (n: number) => Array.from({ length: n }, (_, i) => i);

check('不够就全给（3 条 → 3 条）', pickSpaced(list(3), 4).length === 3);
check('正好 4 条不动', JSON.stringify(pickSpaced(list(4), 4)) === '[0,1,2,3]');

const six = pickSpaced(list(6), 4);
check('6 条取 4 条', six.length === 4, JSON.stringify(six));
check('末尾那条一定要在里面（结尾常是梗）', six.at(-1) === 5, JSON.stringify(six));

const nine = pickSpaced(list(9), 4);
check('9 条取 4 条', nine.length === 4, JSON.stringify(nine));
check('首尾都在（0 和 8）', nine[0] === 0 && nine.at(-1) === 8, JSON.stringify(nine));
check('没有重复下标', new Set(nine).size === nine.length, JSON.stringify(nine));
check('保持原有顺序（递增）', nine.every((v, i) => i === 0 || v > nine[i - 1]));

check('空列表安全', pickSpaced([], 4).length === 0);
check('max=1 给最新那条', JSON.stringify(pickSpaced(list(9), 1)) === '[8]');
check('max 非法（0）也至少给一条', pickSpaced(list(9), 0).length === 1);


/* ------------------------------------ 从全窗口采样里挑"像有字"的带子 */

const sample = (t: number, edge?: number, band = true) => ({
  t,
  ...(band ? { band: `b${t}` } : {}),
  ...(edge !== undefined ? { bandEdge: edge } : {}),
});

// 20 个每秒采样点，只有 8/9/10 秒有字（一句字幕持续 3 秒）——拼图那几格很可能全错过
const pool = Array.from({ length: 20 }, (_, i) =>
  sample(i, [8, 9, 10].includes(i) ? 0.4 : 0.02),
);
const hit = pickTextBands(pool, 4);
check('挑到有字的那几帧', hit.picked.length === 3, String(hit.picked.length));
check('挑的是 8/9/10 秒', hit.picked.map((x) => x.t).join(',') === '8,9,10', hit.picked.map((x) => x.t).join(','));
check('不是"没挑到"的兜底', hit.fallback === false);

// 时间顺序必须保留（竖拼自上而下就是时间）
const many = Array.from({ length: 20 }, (_, i) => sample(i, i > 12 ? 0.3 : 0.01));
const four = pickTextBands(many, 4);
check('最多给 4 条', four.picked.length === 4, String(four.picked.length));
check('按时间升序', four.picked.every((v, i) => i === 0 || v.t > four.picked[i - 1].t));

// 一条都不像字 → 兜底 2 条 + 明说
const blank = Array.from({ length: 20 }, (_, i) => sample(i, 0.01));
const none = pickTextBands(blank, 4);
check('全都没字时兜底 2 条', none.picked.length === 2, String(none.picked.length));
check('并且标了 fallback', none.fallback === true);

check('完全没采到带子 → 空', pickTextBands([sample(0, 0.3, false)], 4).picked.length === 0);
check('空列表安全', pickTextBands([], 4).picked.length === 0);

console.log(`\n${ok} 通过 / ${fail} 失败`);
if (fail) process.exitCode = 1;
