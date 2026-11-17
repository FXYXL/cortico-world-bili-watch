/**
 * 离线验证：工具回执瘦身（0.2.18）
 *
 * 三件事各有各的"改前基线"，都用真机数据：
 *   1. publish 原来回整条 SendRecord（实测 1195 字符，其中 preparation 是 prepare 刚给过的）
 *   2. probe 原来两段字幕警告 + 清晰度列表（实测 1402 字符）
 *   3. storyboard 的诊断行占 52%（实测 1773/3394）
 */
import { readFileSync } from 'node:fs';

import { publishReceipt } from '../src/social/receipt.ts';
import { formatBiliProbe } from '../src/read/probe-text.ts';
import { compactBoardMeta } from '../src/engine/storyboard/format.js';

let ok = 0;
let fail = 0;
const check = (label: string, cond: boolean, extra = '') => {
  if (cond) ok++;
  else fail++;
  console.log(`${cond ? '✅' : '❌'} ${label}${extra ? ` — ${extra}` : ''}`);
};

/* ------------------------------------------------------- ① publish 回执 */

const STATE = 'D:/Coopanion/data/home/companion/data/worlds/bili-watch/state/state.json';
const state = JSON.parse(readFileSync(STATE, 'utf8'));
const sent = [...(state.outbox ?? [])].reverse().find((r: any) => r.status === 'sent');

if (sent) {
  const r = publishReceipt(sent as any, { state: 'accepted' });
  const json = JSON.stringify(r);
  check('publish 回执长度 < 400（原 1195）', json.length < 400, `${json.length} 字符`);
  check('保留了回执号', Boolean(r.receiptId) || !sent.receiptId);
  check('保留状态', r.status === 'sent');
  check('给了下一步', Boolean(r.next));
  check('不再夹带 preparation', !json.includes('preparation'));
  check('不再夹带内部字段', !/(operationId|accountId|requestId)/.test(json));
  console.log('   实际回执:', json);
} else {
  check('state 里有可用的 sent 记录', false);
}

// 三种状态的"下一步"必须不一样（否则她不知道该不该重试）
const mk = (status: string, extra: any = {}) =>
  publishReceipt({ status, text: 't', createdAt: '', target: {}, accountId: '1', kind: 'proactive', requestId: 'x', id: 'i', ...extra } as any);
check('unknown 提示用同一个 briefId 重试', /同一个 briefId/.test(mk('unknown').next));
check('rejected 提示别换编号重发', /换个编号/.test(mk('rejected').next));
check('self-only 提示别重发', /不要重发/.test(mk('sent', { visibility: { status: 'self-only' } }).next));

/* --------------------------------------------------------- ② probe 回执 */

const facts: any = {
  meta: {
    bvid: 'BV1P9nR6EEpx',
    part: 1,
    parts: [{ duration: 95 }],
    partDuration: 95,
    duration: 95,
    title: '我给大肥鱼装上了声音！',
    author: '墨戥玳',
    url: 'https://www.bilibili.com/video/BV1P9nR6EEpx',
  },
  play: {
    height: 480,
    requestedHeight: 480,
    qualityLabels: ['高清 1080P+', '高清 1080P', '高清 720P', '清晰 480P', '流畅 360P'],
    degraded: [],
  },
  subtitle: {
    available: true,
    langDoc: '中文（自动生成）',
    auto: true,
    segments: Array.from({ length: 16 }, () => ({ from: 0, to: 1, text: 'x' })),
  },
  loggedIn: true,
  scanHeight: 480,
  withCookie: true,
  audio: null,
};
const probeText = formatBiliProbe(facts);
check('probe 长度 < 1100（原 1402，其中字幕警告 523）', probeText.length < 1100, `${probeText.length} 字符`);
check('分辨率压成一行', /resolution: 480p \(account max 高清 1080P\+\)/.test(probeText));
check('只留一句字幕质量提示', probeText.split('\n').filter((l) => l.startsWith('subtitles_')).length === 1);
check('仍然说清了"别当原话"', /never quote as exact words/.test(probeText));
check('仍然指了画面里的硬字幕', /burned-in/.test(probeText));

/* ---------------------------------------------------- ③ storyboard 诊断 */

const board = [
  '[video] 示例 · bilibili:BV1xx:p1 · 1:35',
  'badges: 7 of 12 cells are integral-sample points (a long take that kept changing, split every ~6 s) and carry NO number on the image — that is why the numbers skip. They are real frames; cite them by cell number from this list.',
  'plan: strategy=compact (每帧尺寸降一档) · 12 frames on 1 image(s) · tiers 1/2×3 1/3×1 1/4×5 1/5×1 1/8×2 (+2 on integral-mark frames) · integral-marks=15 · meanLufs=-20.8 LUFS · motion=2.9 · cuts=101 · cutThreshold=12 · canvas=800x450 · cell>=114x64 (composition, smallest) · fill=87.4% (before crop)',
  'cost: 1 image(s) × ~384 = ~384 vision tokens (384/img, 800x800 cap)',
  'footer strip shares the timeline: teal bars = loudness (taller = louder), grey blocks = silence, yellow ticks = cut points.',
  '<storyboard path="D:////data////media////bc24677cf60856880a50////video.mp4" duration="94.02" window="0.00-94.02" image="800x490" grid="12 frames on 1 image(s)" cell>=114x64 tokens="384" ffmpeg="2025-04-23-git" footer="audio-strip(32px)" audio="present">',
  'cell 1 = 00:00.00-00:08.07  k=2 (1/2)',
  '    "嗯嗯谁呀谁在背后说鱼坏话"',
].join('\n');

const compact = compactBoardMeta(board);
check('诊断行被压缩（原 1000+ 字符 → < 350）', compact.length < 350, `${board.length} → ${compact.length} 字符`);
check('badges 折进 plan 一句', /积分采样点/.test(compact) && !/^badges:/m.test(compact));
check('plan 保留关键信息', /plan: compact/.test(compact) && /12格\/1张/.test(compact) && /cell≥114x64/.test(compact) && /cuts 101/.test(compact));
check('cost 只留 token 数', /^cost: ~384 vision tokens$/m.test(compact));
check('音频图例删掉', !/footer strip shares/.test(compact));
check('开标签去掉本机路径/ffmpeg/图例高度', !/path="|ffmpeg=|footer="audio/.test(compact));
check('开标签保留时长/格子/清晰度信息', /duration="94.02"/.test(compact) && /cell>=114x64/.test(compact));
check('格子内容一字不动', compact.includes('cell 1 = 00:00.00-00:08.07') && compact.includes('嗯嗯谁呀谁在背后说鱼坏话'));

// `!!` 告警必须原样保留（格子小到看不清时那是唯一可执行的建议）
const warn = compactBoardMeta(
  'plan: strategy=frugal · 12 frames on 1 image(s) · cell>=114x64\n' +
    '!! the smallest cells are 114x64 — that is "composition", colour blocks rather than content. Fix it one of three ways: …',
);
check('!! 可读性告警保留', /^!! the smallest cells/m.test(warn));
check('缺少 plan 字段时原样保留（不硬猜）', compactBoardMeta('plan: 奇怪的一行').includes('奇怪的一行'));

console.log(`\n${ok} 通过 / ${fail} 失败`);
if (fail) process.exitCode = 1;
