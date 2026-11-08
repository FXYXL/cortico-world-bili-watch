/**
 * 离线验证：润色放行、换话题拒绝（0.2.11）
 *
 * 她实测：把草稿里的「补一句」改成「补一个实际做法」，被拒
 * 「文案与凭据不一致」，只能重跑整轮 prepare —— 语义一模一样，白折腾。
 */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { BiliService } from '../src/social/service.ts';
import { SocialStore } from '../src/social/store.ts';
import { BiliClient } from '../src/core/client.ts';

const SRC = 'D:/Coopanion/data/home/companion/data/worlds/bili-watch/state/state.json';
const DIR = 'D:/AI/.tmp-bili-test';
const ACCOUNT = '3747576750804208';

mkdirSync(DIR, { recursive: true });
copyFileSync(SRC, `${DIR}/state.json`);

const st = JSON.parse(readFileSync(`${DIR}/state.json`, 'utf8'));
const t = st.inbox[st.inbox.length - 1];
t.status = 'pending';
delete t.handling;
st.outbox = st.outbox.filter((r: any) => r.requestId !== `reply:${t.id}`);
writeFileSync(`${DIR}/state.json`, JSON.stringify(st));

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
    get(tt, k: any) {
      if (k in tt) {
        const v = tt[k];
        return v && typeof v === 'object' ? wrap(v) : v;
      }
      return anyNode();
    },
  });
}
const cfg = wrap({
  enabled: true,
  cookieSecret: 'BILI_WATCH_COOKIE',
  posting: { enabled: true, transport: 'api', maxDailyReplies: 100, maxDailyComments: 100, minIntervalSec: 0 },
  focus: { enabled: false, allowMentions: false, account: '' },
  recommend: { enabled: false, maxDaily: 0 },
  dynamics: { enabled: false, allowPublishing: false },
});

const fakeFetch = async (url: string) => {
  const u = String(url);
  const json = (data: any) =>
    new Response(JSON.stringify({ code: 0, data }), { status: 200, headers: { 'content-type': 'application/json' } });
  if (u.includes('/x/web-interface/nav'))
    return json({
      isLogin: true, mid: Number(ACCOUNT), uname: '测试',
      wbi_img: {
        img_url: 'https://i0.hdslb.com/bfs/wbi/7cd084941338484aae1ad9425b84077c.png',
        sub_url: 'https://i0.hdslb.com/bfs/wbi/4932caff0ff746eab6f01bf08b70ac45.png',
      },
    });
  if (u.includes('/x/v2/reply/add')) return json({ rpid: '999000111222', rpid_str: '999000111222', reply: { rpid: '999000111222' } });
  return json({ replies: [], page: { count: 0 } });
};

const store = new SocialStore(DIR);
const client = new BiliClient({
  cookie: () => `SESSDATA=x;bili_jct=y;DedeUserID=${ACCOUNT}`,
  fetcher: fakeFetch as any,
});
const svc = new BiliService({
  cfg: cfg as any, store, client: () => client,
  timezone: 'Asia/Shanghai',
  secret: () => `SESSDATA=x;bili_jct=y;DedeUserID=${ACCOUNT}`,
});
await svc.connect();

const DRAFT = '评论区补一句：擦之前先写便签，下次贴回来。';
const mkBrief = (id: string, draft: string) =>
  store.saveBrief({
    id, accountId: ACCOUNT, target: t.target,
    createdAt: new Date().toISOString(),
    purpose: '回通知', draft,
    nearby: [], recentOwn: [], advice: [], guidance: [],
    judgment: { mode: 'discuss' } as any,
    ...(t.authorId ? { recipientId: t.authorId } : {}),
  } as any);

// ① 她的真实案例：补一句 → 补一个实际做法
mkBrief('rev-a', DRAFT);
try {
  const r: any = await svc.publish({
    preparation: { briefId: 'rev-a' },
    requestId: 'rev-case-a',
    text: '评论区补一个实际做法：擦之前先写便签，下次贴回来。',
  });
  const rec: any = store.outbox().at(-1);
  console.log('① 润色一字之差:', r.status, '| revised 标记:', rec?.revised === true ? '有 ✅' : '无 ❌');
} catch (e: any) {
  console.log('① 润色一字之差: 被拒 ❌', e.message.slice(0, 50));
}

// ② 换了一整段话 → 必须拒
mkBrief('rev-b', DRAFT);
try {
  const r: any = await svc.publish({
    preparation: { briefId: 'rev-b' },
    requestId: 'rev-case-b',
    text: '话说这个视频里的白板比喻其实挺有意思的，窗口大不等于全都记得住，中间细节容易滑过去。',
  });
  console.log('② 换了一段话:', r.status, '—— 应该被拒 ❌');
} catch (e: any) {
  console.log('② 换了一段话: 拒绝 ✅ —', e.message.slice(0, 44));
}

// ③ 一字未改 → 正常发
mkBrief('rev-c', DRAFT);
try {
  const r: any = await svc.publish({ preparation: { briefId: 'rev-c' }, requestId: 'rev-case-c', text: DRAFT });
  const rec: any = store.outbox().at(-1);
  console.log('③ 一字未改:', r.status, '| revised 标记:', rec?.revised ? '有（不该有）❌' : '无 ✅');
} catch (e: any) {
  console.log('③ 一字未改: 抛错 ❌', e.message.slice(0, 50));
}
