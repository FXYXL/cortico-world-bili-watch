/**
 * 离线验证：别人回「我很久以前那条评论」时，按小时阈值直接丢弃（0.2.21）
 *
 * 关键判据是 **target.root = 被回复的那条评论 rpid**，再用 outbox 里它的 createdAt
 * 和通知时间比。这个测试盯五件事：
 *   ① 超阈值的丢弃、且记下理由
 *   ② 阈值内照常投递
 *   ③ 找不到我那條评论的时间 → 放行（宁可多推，不误杀）
 *   ④ 特别关注（root 是主人的评论）不按我的时间判
 *   ⑤ 旧通知不能占满每轮 3 条的名额（必须在 slice 之前清）
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { BiliService } from '../src/social/service.ts';
import { SocialStore } from '../src/social/store.ts';
import { BiliClient } from '../src/core/client.ts';

const DIR = 'D:/AI/.tmp-stale-test';
const ACC = '3747576750804208';
const H = 3_600_000;
const now = Date.now();
const iso = (msAgo: number) => new Date(now - msAgo).toISOString();

rmSync(DIR, { recursive: true, force: true });
mkdirSync(DIR, { recursive: true });

/** 她的三条评论：old（30 小时前）、fresh（1 小时前）、unknown（不在 outbox 里） */
const mine = (rpid: string, hoursAgo: number) => ({
  id: `send-${rpid}`,
  operationId: `bilibili:${ACC}:roam-${rpid}`,
  requestId: `roam-${rpid}`,
  accountId: ACC,
  platform: 'bilibili',
  target: { oid: '117469737916999', type: 1, root: '0', parent: '0' },
  text: '我之前的评论。',
  status: 'sent',
  createdAt: iso(hoursAgo * H),
  receiptId: rpid,
});

const item = (key: string, root: string, hoursAgo: number, extra: Record<string, unknown> = {}) => ({
  id: `bilibili:${ACC}:${key}`,
  platform: 'bilibili',
  accountId: ACC,
  authorId: '999001',
  author: '路人',
  text: '你那条我看了，说得挺对。',
  target: { oid: '117469737916999', type: 1, root, parent: key },
  occurredAt: Math.floor((now - hoursAgo * H) / 1000),
  status: 'pending',
  notificationType: 'reply',
  ...extra,
});

writeFileSync(
  `${DIR}/state.json`,
  JSON.stringify({
    version: 1,
    focusBindings: [],
    focusWorks: [],
    focusChecks: {},
    contacts: [],
    feeds: {},
    roaming: [],
    videos: [],
    comments: [],
    briefs: [],
    outbox: [mine('9001', 30), mine('9002', 1)],
    // 判据是「通知时间 − 我那条评论的发送时间」：
    // 9001 是 30 小时前发的，下面四条通知分别在 5/4/3/2 小时前 → 25/26/27/28 小时 → 都超 24
    // 9002 是 1 小时前发的，通知 0.2 小时前 → 0.8 小时 → 不该丢
    inbox: [
      item('stale-1', '9001', 5),
      item('stale-2', '9001', 4),
      item('stale-3', '9001', 3),
      item('stale-4', '9001', 2),
      item('fresh', '9002', 0.2),
      item('unknown-root', '8888', 0.2), // outbox 里没有 → 推
      item('zero-root', '0', 0.2), // 不知道在回谁 → 推
    ],
  }),
);

function anyNode() {
  const f = function () {
    return '';
  };
  return new Proxy(f, {
    get(_t, k) {
      if (k === Symbol.toPrimitive) return (hint: string) => (hint === 'string' ? '' : 0);
      if (k === 'then' || typeof k === 'symbol') return undefined;
      if (k === 'toString') return () => '';
      if (k === 'valueOf') return () => 0;
      return anyNode();
    },
  });
}
function wrap(obj: any): any {
  return new Proxy(obj, {
    get(t, k: any) {
      if (k in t) {
        const v = t[k];
        return v && typeof v === 'object' ? wrap(v) : v;
      }
      return anyNode();
    },
  });
}

const cfg = wrap({
  enabled: true,
  cookieSecret: 'BILI_WATCH_COOKIE',
  monitor: { enabled: true, intervalSec: 60 },
  sleep: { enabled: false },
  posting: {
    enabled: true,
    transport: 'api',
    minIntervalSec: 0,
    maxDailyComments: 100,
    maxDailyReplies: 100,
    dropStaleReplies: true,
    staleReplyHours: 24,
  },
  focus: { enabled: false, allowMentions: false, account: '' },
  recommend: { enabled: false, maxDaily: 0 },
  dynamics: { enabled: false, allowPublishing: false },
  roaming: { enabled: false },
});

const store = new SocialStore(DIR);
const client = new BiliClient({
  cookie: () => `SESSDATA=x;bili_jct=y;DedeUserID=${ACC}`,
  fetcher: (async () => new Response('{"code":0,"data":{}}', { status: 200 })) as any,
});
const svc = new BiliService({
  cfg,
  store,
  client: () => client,
  timezone: 'Asia/Shanghai',
  secret: () => `SESSDATA=x;bili_jct=y;DedeUserID=${ACC}`,
});

let ok = 0;
let fail = 0;
const check = (name: string, pass: boolean, extra = '') => {
  console.log(`${pass ? '✅' : '❌'} ${name}${extra ? ` — ${extra}` : ''}`);
  pass ? (ok += 1) : (fail += 1);
};

const delivered: string[] = [];
await svc.deliver(async (i) => {
  delivered.push(i.id.split(':').pop()!);
});

const byKey = (k: string) => store.inbox().find((i) => i.id.endsWith(`:${k}`))!;

console.log('投递到的:', delivered.join(', ') || '(无)');
check('四条旧话题全部丢弃', ['stale-1', 'stale-2', 'stale-3', 'stale-4'].every((k) => !delivered.includes(k)));
check('旧话题标成 handled + skip', byKey('stale-1').status === 'handled' && byKey('stale-1').handling?.kind === 'skip');
check('理由说清了多久', /已经 \d+ 小时/.test(byKey('stale-1').handling?.reason ?? ''), byKey('stale-1').handling?.reason);
check('阈值内照常投递', delivered.includes('fresh'));
check('Outbox 里没有记录 → 不误杀', delivered.includes('unknown-root'));
check('root=0（不知道在回谁）→ 不误杀', delivered.includes('zero-root'));
// 每轮只投 3 条：四条旧的先出队，三个名额全给新的
check('旧话题不占 3 条名额', delivered.length === 3, `投了 ${delivered.length} 条：${delivered.join(', ')}`);

// —— 楼中楼：她在别人楼里回复，别人再回她（root 是楼根，不是她的评论）——
const DIR_SUB = `${DIR}-sub`;
rmSync(DIR_SUB, { recursive: true, force: true });
mkdirSync(DIR_SUB, { recursive: true });

/** 她在楼里的回复：target.root = 楼根（别人的），receiptId = 她这条 */
const sub = (rpid: string, root: string, hoursAgo: number) => ({
  ...mine(rpid, hoursAgo),
  target: { oid: '117469737916999', type: 1 as const, root, parent: '4000' },
});

writeFileSync(
  `${DIR_SUB}/state.json`,
  JSON.stringify({
    version: 1,
    focusBindings: [],
    focusWorks: [],
    focusChecks: {},
    contacts: [],
    feeds: {},
    roaming: [],
    videos: [],
    comments: [],
    briefs: [],
    outbox: [
      sub('4001', '5001', 30), // 楼 5001：她 30 小时前在楼里回了一条
      sub('4002', '5002', 1), // 楼 5002：她 1 小时前在楼里回了一条
      sub('4003', '5003', 30), // 楼 5003：老，但通知不带 target_id，要靠"楼里最近一条"
    ],
    inbox: [
      // ① 有 target_id 指向她的评论（4001，30 小时前）→ 丢
      item('sub-via-id', '5001', 4, { replyToId: '4001' }),
      // ② 有 target_id 指向她 1 小时前那条 → 推
      item('sub-fresh', '5002', 0.2, { replyToId: '4002' }),
      // ③ 没有 target_id，只能按"同视频+同 root 里她最近一条"（4003，30 小时前）→ 丢
      item('sub-via-thread', '5003', 4),
      // ④ root 完全对不上（她没在那楼回过）→ 放行
      item('sub-unknown', '5999', 4),
      // ⑤ @ 提到她：不该用"我的评论"这把尺子 → 放行
      item('sub-mention', '5001', 4, { notificationType: 'mention' }),
    ],
  }),
);

const storeSub = new SocialStore(DIR_SUB);
const svcSub = new BiliService({
  cfg: wrap({
    ...cfg,
    posting: { ...cfg.posting, dropStaleReplies: true, staleReplyHours: 24 },
  }),
  store: storeSub,
  client: () => client,
  timezone: 'Asia/Shanghai',
  secret: () => `SESSDATA=x;bili_jct=y;DedeUserID=${ACC}`,
});
const deliveredSub: string[] = [];
await svcSub.deliver(async (i) => {
  deliveredSub.push(i.id.split(':').pop()!);
});
console.log('楼中楼投递到的:', deliveredSub.join(', ') || '(无)');
check('楼中楼：target_id 指向旧评论 → 丢', !deliveredSub.includes('sub-via-id'));
check('楼中楼：target_id 指向新评论 → 推', deliveredSub.includes('sub-fresh'));
check('楼中楼：没有 target_id，按楼里她最近一条判 → 丢', !deliveredSub.includes('sub-via-thread'));
check('楼中楼：她没在这楼回过 → 放行', deliveredSub.includes('sub-unknown'));
check('@ 提到她 → 不用这个尺子', deliveredSub.includes('sub-mention'));

// —— 特别关注：root 是主人评论，不该按"我的评论时间"判 ——
const DIR3 = `${DIR}-focus`;
rmSync(DIR3, { recursive: true, force: true });
rmSync(DIR_SUB, { recursive: true, force: true });
mkdirSync(DIR3, { recursive: true });
writeFileSync(
  `${DIR3}/state.json`,
  JSON.stringify({
    version: 1,
    focusBindings: [],
    focusWorks: [],
    focusChecks: {},
    contacts: [],
    feeds: {},
    roaming: [],
    videos: [],
    comments: [],
    briefs: [],
    outbox: [mine('9001', 100)],
    inbox: [item('focus', '7777', 1, { focusOwnerId: '555' })],
  }),
);
const store3 = new SocialStore(DIR3);
const svc3 = new BiliService({
  cfg: wrap({
    ...cfg,
    posting: { ...cfg.posting, dropStaleReplies: true, staleReplyHours: 24 },
    focus: { enabled: false, allowMentions: false, account: '' },
  }),
  store: store3,
  client: () => client,
  timezone: 'Asia/Shanghai',
  secret: () => `SESSDATA=x;bili_jct=y;DedeUserID=${ACC}`,
});
await svc3.deliver(async () => {});
const focusItem = store3.inbox().find((i) => i.id.endsWith(':focus'))!;
check(
  '特别关注不按我的时间判（被 focus 开关拦，理由不是"不追旧话题"）',
  focusItem.handling?.kind === 'limit' && !/不追旧话题/.test(focusItem.handling?.reason ?? ''),
  focusItem.handling?.reason,
);

// —— 开关关掉：一条都不许丢 ——
const DIR2 = `${DIR}-off`;
rmSync(DIR2, { recursive: true, force: true });
rmSync(DIR3, { recursive: true, force: true });
mkdirSync(DIR2, { recursive: true });
writeFileSync(
  `${DIR2}/state.json`,
  JSON.stringify({
    version: 1,
    focusBindings: [],
    focusWorks: [],
    focusChecks: {},
    contacts: [],
    feeds: {},
    roaming: [],
    videos: [],
    comments: [],
    briefs: [],
    outbox: [mine('9001', 100)],
    inbox: [item('old', '9001', 1)],
  }),
);
const store2 = new SocialStore(DIR2);
const svc2 = new BiliService({
  cfg: wrap({
    ...cfg,
    posting: { ...cfg.posting, dropStaleReplies: false },
  }),
  store: store2,
  client: () => client,
  timezone: 'Asia/Shanghai',
  secret: () => `SESSDATA=x;bili_jct=y;DedeUserID=${ACC}`,
});
const out2: string[] = [];
await svc2.deliver(async (i) => {
  out2.push(i.id);
});
check('开关关掉时不丢（100 小时前的也推）', out2.length === 1, `投了 ${out2.length} 条`);

console.log(`\n${ok} 通过 / ${fail} 失败`);
if (fail) process.exitCode = 1;
rmSync(DIR, { recursive: true, force: true });
rmSync(DIR2, { recursive: true, force: true });
