/**
 * 离线验证：凭据里记着 recipientId 时，回复通知不再依赖"读楼中楼找父评论作者"。
 *
 * 现场：2026-11-08 01:2x，雅汐回缘梦幻境（parent=319521908065，在楼中楼第 2 页），
 * publish 只带 briefId → 走 parentAuthor → 只读第 1 页 → 找不到 → 报
 * 「暂未取得对方平台账号身份」，明明能回的楼卡死。
 */
import { copyFileSync, mkdirSync } from 'node:fs';
import { BiliService } from '../src/social/service.ts';
import { SocialStore } from '../src/social/store.ts';
import { BiliClient } from '../src/core/client.ts';

const SRC = 'D:/Coopanion/data/home/companion/data/worlds/bili-watch/state/state.json';
const DIR = 'D:/AI/.tmp-bili-test';
const ACCOUNT = '3747576750804208';
const OID = '117574343987404';
const ROOT = '319473064529';
const PARENT = '319521908065';

mkdirSync(DIR, { recursive: true });
copyFileSync(SRC, `${DIR}/state.json`);

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
  posting: { enabled: true, transport: 'api', maxDailyReplies: 100, maxDailyComments: 100, minIntervalSec: 0 },
  focus: { enabled: false, allowMentions: false, account: '' },
  recommend: { enabled: false, maxDaily: 0 },
  dynamics: { enabled: false, allowPublishing: false },
});

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
      isLogin: true, mid: Number(ACCOUNT), uname: '测试',
      wbi_img: {
        img_url: 'https://i0.hdslb.com/bfs/wbi/7cd084941338484aae1ad9425b84077c.png',
        sub_url: 'https://i0.hdslb.com/bfs/wbi/4932caff0ff746eab6f01bf08b70ac45.png',
      },
    });
  if (u.includes('/x/v2/reply/add')) return json({ rpid: '999000111222', rpid_str: '999000111222', reply: { rpid: '999000111222' } });
  // 楼中楼：故意返回**空**，模拟"父评论不在第 1 页"（第 2 页才有）
  if (u.includes('/x/v2/reply/reply')) return json({ replies: [], page: { count: 0 } });
  if (u.includes('/x/v2/reply')) return json({ replies: [], page: { count: 0 } });
  return json({});
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

const mkBrief = (id: string, recipientId?: string) =>
  store.saveBrief({
    id,
    accountId: ACCOUNT,
    target: { oid: OID, type: 1, root: ROOT, parent: PARENT },
    createdAt: new Date().toISOString(),
    purpose: '回通知',
    draft: '没人看着也会做完的：把当天的事写进本子，明天翻开它还在。',
    nearby: [], recentOwn: [], advice: [], guidance: [],
    judgment: { mode: 'discuss' } as any,
    ...(recipientId ? { recipientId } : {}),
  } as any);

// ① 有 recipientId：应该直接发出去，且**不读楼中楼**
mkBrief('test-reply-with-recipient', '1873718294');
seen.length = 0;
try {
  const r: any = await svc.publish({
    preparation: { briefId: 'test-reply-with-recipient' },
    text: '没人看着也会做完的：把当天的事写进本子，明天翻开它还在。',
  });
  console.log('① 凭据带 recipientId:', r.status);
  console.log('   请求顺序:');
  seen.forEach((u) => console.log('    ', u.replace('https://api.bilibili.com', '').slice(0, 90)));
} catch (e: any) {
  console.log('① 凭据带 recipientId: 抛错 ❌', e.message.slice(0, 60));
}

// ② 没有 recipientId：仍然要读楼中楼，读不到就明确拒绝（保留原来的保护）
mkBrief('test-reply-no-recipient');
seen.length = 0;
try {
  const r: any = await svc.publish({
    preparation: { briefId: 'test-reply-no-recipient' },
    text: '没人看着也会做完的：把当天的事写进本子，明天翻开它还在。',
  });
  console.log('② 无 recipientId:', r.status);
} catch (e: any) {
  console.log('② 无 recipientId: 拒绝 ✅ —', e.message.slice(0, 40));
}

// ③ 推荐重复检查（拿真实数据）
console.log(
  '③ 已推过的 117527753588880 →',
  svc.recommendAlreadySent(ACCOUNT, '117527753588880') ? '能查到（会拦）✅' : '查不到 ❌',
);
console.log(
  '③ 没推过的 117469737916999 →',
  svc.recommendAlreadySent(ACCOUNT, '117469737916999') ? '查到了（误拦）❌' : '查不到 ✅',
);
