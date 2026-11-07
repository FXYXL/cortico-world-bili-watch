/**
 * 离线验证：bili_publish 只给 briefId + text 就能发（0.2.7 修复）
 *
 * 用真实 state.json 的副本 + 假网络，跑四种入参形态，看落库的 target/kind/requestId。
 * 每次运行都从真机 state 重新复制，不碰真实数据、不真的发出去。
 */
import { copyFileSync, mkdirSync } from 'node:fs';
import { BiliService } from '../src/social/service.ts';
import { SocialStore } from '../src/social/store.ts';
import { BiliClient } from '../src/core/client.ts';

const SRC = 'D:/Coopanion/data/home/companion/data/worlds/bili-watch/state/state.json';
const DIR = 'D:/AI/.tmp-bili-test';
const ACCOUNT = '3747576750804208';
const BRIEF = '71f211fc-c29c-4b1b-93ab-148f33255001';
const DRAFT = '同感。我夸完会回头想一句：这是真觉得好，还是只想让对方高兴。多数时候两样都在，分不开。';

mkdirSync(DIR, { recursive: true });
copyFileSync(SRC, `${DIR}/state.json`); // 每次重置，避免上一次的落库记录影响间隔判断

/** 未声明字段一律兜底：数字 0、布尔 true、字符串 '' */
function anyNode() {
  const f = function () { return ''; };
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
  posting: {
    enabled: true,
    transport: 'api',
    maxDailyReplies: 100,
    maxDailyComments: 100,
    minIntervalSec: 0,
  },
  focus: { enabled: false, allowMentions: false, account: '' },
  recommend: { enabled: false, maxDaily: 0 },
  dynamics: { enabled: false, allowPublishing: false },
  roaming: { enabled: false },
});

const sent: string[] = [];
const seen: string[] = [];
const fakeFetch = async (url: string) => {
  const u = String(url);
  seen.push(u);
  const json = (data: any) =>
    new Response(JSON.stringify({ code: 0, data }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  if (u.includes('/x/web-interface/nav'))
    return json({
      isLogin: true,
      mid: Number(ACCOUNT),
      uname: '测试',
      wbi_img: {
        img_url: 'https://i0.hdslb.com/bfs/wbi/7cd084941338484aae1ad9425b84077c.png',
        sub_url: 'https://i0.hdslb.com/bfs/wbi/4932caff0ff746eab6f01bf08b70ac45.png',
      },
    });
  if (u.includes('/x/v2/reply/add')) {
    sent.push(u);
    return json({ rpid: '1234567890123', rpid_str: '1234567890123', reply: { rpid: '1234567890123' } });
  }
  if (u.includes('/x/v2/reply')) return json({ replies: [], page: { count: 0 } });
  return json({});
};

const store = new SocialStore(DIR);
const client = new BiliClient({
  cookie: () => `SESSDATA=x;bili_jct=y;DedeUserID=${ACCOUNT}`,
  fetcher: fakeFetch as any,
});
const svc = new BiliService({
  cfg: cfg as any,
  store,
  client: () => client,
  timezone: 'Asia/Shanghai',
  secret: () => `SESSDATA=x;bili_jct=y;DedeUserID=${ACCOUNT}`,
});

await svc.connect();

function report(label: string, lenBefore: number, extra = '') {
  const fresh = store.outbox().length > lenBefore ? (store.outbox().at(-1) as any) : null;
  if (!fresh) {
    console.log(`${label}: 未落库 ${extra}`);
    return;
  }
  console.log(
    `${label}: kind=${fresh.kind} | req=${String(fresh.requestId).slice(0, 28)} | root=${fresh.target.root} parent=${fresh.target.parent} | status=${fresh.status} ${extra}`,
  );
}

// ① 只给 briefId + text（接楼）—— 以前会报「评论类型仅支持视频(1)」
try {
  const len = store.outbox().length;
  const res: any = await svc.publish({ preparation: { briefId: BRIEF }, text: DRAFT });
  report('① briefId 接楼', len, `返回值 status=${res.status}`);
} catch (e: any) {
  console.log('① briefId 接楼: 抛错 ❌', e.message.slice(0, 80));
}

// ② 只给 briefId + text（新评论，parent=0）—— 应记 proactive
store.saveBrief({
  id: 'test-top-level-brief',
  accountId: ACCOUNT,
  target: { oid: '117469737916999', type: 1, root: '0', parent: '0' },
  createdAt: new Date().toISOString(),
  purpose: '新评论',
  draft: '这条只想发在视频下面，不接楼。',
  nearby: [],
  recentOwn: [],
  advice: [],
  guidance: [],
  judgment: { mode: 'discuss' } as any,
} as any);
try {
  const len = store.outbox().length;
  const res: any = await svc.publish({
    preparation: { briefId: 'test-top-level-brief' },
    text: '这条只想发在视频下面，不接楼。',
  });
  report('② briefId 新评论', len, `返回值 status=${res.status}`);
} catch (e: any) {
  console.log('② briefId 新评论: 抛错 ❌', e.message.slice(0, 80));
}

// ③ 什么都不给 —— 应该是「缺少发送目标」，而不是误导性的「评论类型仅支持」
try {
  await svc.publish({ text: '随便说点什么' } as any);
  console.log('③ 缺参数: 竟然没报错 ❌');
} catch (e: any) {
  console.log(
    `③ 缺参数: ${e.message.slice(0, 40)}${e.message.includes('缺少发送目标') ? ' ✅' : ' ❌'}`,
  );
}

// ④ 回归：显式 target + requestId 的旧用法仍然可用
try {
  const len = store.outbox().length;
  const res: any = await svc.publish({
    target: { oid: '117511999722773', type: 1, root: '0', parent: '0' },
    requestId: 'legacy-explicit-1',
    text: '旧的显式传参方式也要能用。',
  });
  report('④ 显式 target', len, `返回值 status=${res.status}`);
} catch (e: any) {
  console.log('④ 显式 target: 抛错 ❌', e.message.slice(0, 80));
}

// ⑤ 幂等：同一个 brief 再发一次，必须复用原记录、不重复提交
const sentBefore = sent.length;
try {
  const len = store.outbox().length;
  const res: any = await svc.publish({ preparation: { briefId: BRIEF }, text: DRAFT });
  const dup = store.outbox().length > len;
  console.log(
    `⑤ 同 brief 重发: reused=${res.reused} submitted=${res.submittedThisCall} 新增记录=${dup ? '是 ❌' : '否 ✅'} 多提交=${sent.length - sentBefore} 次`,
  );
} catch (e: any) {
  console.log('⑤ 同 brief 重发: 抛错', e.message.slice(0, 60));
}

console.log(`\n真的提交到 /x/v2/reply/add 的次数: ${sent.length}`);
console.log('假网络收到的请求数:', seen.length);
seen.forEach((u) => console.log('  →', u.slice(0, 120)));
