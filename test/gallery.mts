/**
 * 离线验证：画集 + 陪看记录（0.2.15）
 *
 * 三件事必须成立：
 *   1. 图真的落盘、重启后索引还在（不然"翻旧账"翻不开）
 *   2. 归属对得上（watchId / roamId 各查各的，不能混）
 *   3. 闲逛记录上限从 100 提到 500，而且**删的是最旧的**
 *
 * 另外单列一条安全用例：id 走路径拼接，必须挡住 `../`。
 */
import { mkdirSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { Gallery } from '../src/social/gallery.ts';
import { SocialStore } from '../src/social/store.ts';
import type { RoamSession } from '../src/social/roaming.ts';
import type { WatchSession } from '../src/social/watchLog.ts';

const DIR = 'D:/AI/.tmp-gallery-test';
rmSync(DIR, { recursive: true, force: true });
mkdirSync(DIR, { recursive: true });

let ok = 0;
let fail = 0;
const check = (label: string, cond: boolean, extra = '') => {
  if (cond) ok++;
  else fail++;
  console.log(`${cond ? '✅' : '❌'} ${label}${extra ? ` — ${extra}` : ''}`);
};

const jpeg = (n: number) => Buffer.from(`fake-jpeg-${n}`.repeat(20));
const at = (min: number) => new Date(Date.UTC(2026, 10, 15, 2, min, 0)).toISOString();

/* ---------------------------------------------------------------- 画集 */

const g = new Gallery(DIR);
const rec = g.record([{ bytes: jpeg(1), mime: 'image/jpeg', name: 'scene-1.jpg', fallbackText: '画面拼图 9 格' }], {
  kind: 'watch',
  watchId: 'w-1',
  bvid: 'BV1x4Jf6tEWC',
  title: '测试片',
  at: at(1),
  label: '观察帧 1:20',
});
check('落一条记录', rec.length === 1, rec[0]?.id);
check('文件真的在盘上', existsSync(join(DIR, 'gallery', 'files', rec[0].file)));
check('索引也写了', readdirSync(join(DIR, 'gallery')).includes('index.jsonl'));

// 同一场再来两张 + 另一场一张 + 一轮闲逛的分镜
g.record([{ bytes: jpeg(2), mime: 'image/jpeg' }], { kind: 'watch', watchId: 'w-1', at: at(2), label: '观察帧 1:40' });
g.record([{ bytes: jpeg(3), mime: 'image/jpeg' }], { kind: 'watch', watchId: 'w-1', at: at(3), label: '结尾 2:12' });
g.record([{ bytes: jpeg(4), mime: 'image/jpeg' }], { kind: 'watch', watchId: 'w-2', at: at(4), label: '观察帧 0:20' });
g.record(
  [{ bytes: jpeg(5), mime: 'image/png' }, { bytes: jpeg(6), mime: 'image/png' }],
  { kind: 'storyboard', roamId: 'r-1', tool: 'video_storyboard', at: at(5) },
);

const w1 = g.list({ watchId: 'w-1' });
check('按场次筛：w-1 有 3 张', w1.total === 3, String(w1.total));
check('按闲逛轮次筛：r-1 有 2 张', g.list({ roamId: 'r-1' }).total === 2);
check('按场次筛：w-2 只有 1 张', g.list({ watchId: 'w-2' }).total === 1);
check('全部：6 张', g.list({}).total === 6, String(g.list({}).total));
check('按时间正序（最新在最后）', g.list({ watchId: 'w-1' }).items.at(-1)?.label === '结尾 2:12');

const one = g.read(w1.items[0].id);
check('取图返回 data URL', Boolean(one?.dataUrl?.startsWith('data:image/jpeg;base64,')));
check('取图带上原文标签', one?.entry.label === '观察帧 1:20');
check('路径穿越被挡住', g.read('../../etc/passwd') === null);
check('瞎写的 id 返回 null', g.read('2026-11-15-000000-nope') === null);

// 重启（新实例）后还读得到
const g2 = new Gallery(DIR);
check('重建后索引还在（6 条）', g2.list({}).total === 6, String(g2.list({}).total));
check('重建后仍能取图', Boolean(g2.read(w1.items[0].id)?.dataUrl));

/* ------------------------------------------------------ 陪看记录落库 */

const store = new SocialStore(join(DIR, 'state'), () => ({}));
const watch: WatchSession = {
  id: 'watch-a',
  title: '《测试片》',
  bvid: 'BV1x4Jf6tEWC',
  duration: 205,
  startedAt: at(0),
  frames: 0,
  end: 'open',
};
store.saveWatch(watch);
check('open 就落一条（还没结束）', store.watches().length === 1);
check('进行中的记录 end=open', store.watches()[0].end === 'open');

// 收尾：同一 id 覆盖，不新增
store.saveWatch({ ...watch, endedAt: at(6), frames: 12, summary: '白板比喻很贴。', end: 'exit' });
const ws = store.watches();
check('收尾是覆盖不是新增', ws.length === 1, String(ws.length));
check('帧数/总结写进去了', ws[0].frames === 12 && ws[0].summary === '白板比喻很贴。');
check('结束方式记的是 exit', ws[0].end === 'exit');

store.saveWatch({ ...watch, id: 'watch-b', title: '《另一条》', endedAt: at(9), frames: 3, end: 'gone' });
check('第二场能并存（最近在前由调用方 reverse）', store.watches().length === 2);

/* -------------------------------------------------- 闲逛记录保留 500 轮 */

const mkRoam = (i: number): RoamSession => ({
  id: `roam-${i}`,
  createdAt: at(i),
  status: 'finished',
  searches: 1,
  videos: [],
  summary: `第 ${i} 轮`,
});

for (let i = 0; i < 620; i++) store.saveRoam(mkRoam(i));
const roams = store.roams();
check('闲逛记录留 500 轮（不再是 100）', roams.length === 500, String(roams.length));
check('留下的是最近的（最后一条是 619）', roams.at(-1)?.id === 'roam-619', roams.at(-1)?.id);
check('最旧的已经滚出去了', roams[0]?.id === 'roam-120', roams[0]?.id);

rmSync(DIR, { recursive: true, force: true });
console.log(`\n${ok} 通过 / ${fail} 失败`);
if (fail) process.exitCode = 1;
