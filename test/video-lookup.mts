/**
 * 离线验证：bili_roam({ action: 'video' }) 按视频查
 *
 * 直连真机 state 的副本，调真实 videoHistory()，不复制逻辑、不联网。
 */
import { copyFileSync, mkdirSync } from 'node:fs';
import { SocialStore } from '../src/social/store.ts';
import { videoHistory } from '../src/social/videoHistory.ts';

const SRC = 'D:/Coopanion/data/home/companion/data/worlds/bili-watch/state/state.json';
const DIR = 'D:/AI/.tmp-bili-test';
mkdirSync(DIR, { recursive: true });
copyFileSync(SRC, `${DIR}/state.json`);

// 注入超限数据：1 条 400 字长评 + 10 条短评（让 said 超过 8 条预算）
import { readFileSync, writeFileSync } from 'node:fs';
{
  const st = JSON.parse(readFileSync(`${DIR}/state.json`, 'utf8'));
  const long = '这条视频我反反复复看了三遍。' + '邹忌讽齐王纳谏的骨架放在 AI 身上意外地贴，'.repeat(12) +
    '尤其是「 me beauté 与北美 GPT 孰美」那段，弹幕全在刷慎到。';
  const mk = (i: number, text: string) => ({
    id: `test-fold-${i}`, operationId: `bilibili:test-fold-${i}`, requestId: `test-fold-${i}`,
    accountId: '3747576750804208', platform: 'bilibili',
    target: { oid: '117469737916999', type: 1, root: '0', parent: '0' },
    text, kind: 'proactive', status: 'sent',
    createdAt: new Date(Date.now() - (20 - i) * 3600e3).toISOString(),
  });
  for (let i = 1; i <= 10; i++) st.outbox.push(mk(i, `短评第 ${i} 条：看完这段我愣了一下。`));
  const longRec = mk(0, long);
  longRec.createdAt = new Date().toISOString(); // 时间戳也要是最新（排序看的是它）
  st.outbox.push(longRec);
  writeFileSync(`${DIR}/state.json`, JSON.stringify(st));
}

const store = new SocialStore(DIR);
const show = (label: string, args: any, pick?: (d: any) => any) => {
  try {
    const d = videoHistory(store, args);
    console.log(`\n=== ${label} ===`);
    console.log(JSON.stringify(pick ? pick(d) : d, null, 1).slice(0, 1600));
  } catch (e: any) {
    console.log(`\n=== ${label} === ❌ ${e.message}`);
  }
};

// ① 列表：一条视频一行 —— 发过 / 心得 / 草稿 三个数分开
show('① 列表', { limit: 5 }, (d) => ({
  rows: (d.videos as any[]).map(
    (v) =>
      `${v.bvid} 看过${v.watched}次 | 发过${v.said} 心得${v.notes} 草稿${v.drafts} | ${String(v.title).slice(0, 16)}`,
  ),
}));

// ② 单条：评论是否全文、草稿是否单独标、心得是否只给最近一篇全文
show('② BV 号', { video: 'BV1x4Jf6tEWC' }, (d) => ({
  verdict: d.verdict,
  said: (d.said as any[]).map((s) => `[${s.statusLabel}/${s.kindLabel}] ${s.text.length}字: ${s.text}`),
  notes: (d.notes as any[]).map((n) => ({ round: n.round, hasFull: !!n.summary, firstLine: n.firstLine })),
  drafts: (d.drafts as any[]).map((x) => `[${x.statusLabel}] ${x.text.slice(0, 24)}`),
}));

// ③ 多轮心得：应只有最近 1 篇给全文，其余给首句
show('③ 多轮心得（deepseek）', { video: 'BV1QZ4Q6BED9' }, (d) => ({
  verdict: d.verdict,
  notes: (d.notes as any[]).map((n) =>
    n.summary ? `第${n.round}轮 全文${n.summary.length}字` : `第${n.round}轮 首句: ${n.firstLine}`,
  ),
  saidCount: (d.said as any[]).length,
  maxSaidLen: Math.max(...(d.said as any[]).map((s) => s.text.length)),
}));

// ④ 查不到 → 带 recent 供挑选
show('④ 不存在', { video: 'BV1xxxxxxxxx' }, (d) => ({
  found: d.found,
  verdict: d.verdict,
  recentCount: (d.recent as any[])?.length,
  recent: (d.recent as any[])?.slice(0, 3).map((r) => r.bvid),
}));

// ⑥ 长评论折叠 + 条数预算
show('⑥ 折叠与预算', { video: 'BV1x4Jf6tEWC' }, (d) => ({
  saidCount: (d.said as any[]).length,
  saidOmitted: d.saidOmitted,
  longest: (d.said as any[]).reduce((a, b) => (b.text.length > a.text.length ? b : a)),
  earlierSample: (d.saidEarlier as any[])?.slice(0, 2).map((s) => s.text),
}));

// ⑤ 各种标识
show('⑤ av 号', { video: 'av117469737916999' }, (d) => (d.video as any)?.bvid);
show('⑤ 链接', { video: 'https://www.bilibili.com/video/BV1x4Jf6tEWC/' }, (d) => (d.video as any)?.bvid);
