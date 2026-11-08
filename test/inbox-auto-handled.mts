/**
 * 离线验证：只带 briefId 回复通知时，发完自动把那条通知标成「已回复」。
 *
 * 现场：她一直是 prepare({inboxId}) → publish({briefId, text})，从不显式传 inboxId，
 * 于是 publish 不知道自己来自哪条通知 —— 不自动标记，待办一直挂着。她再 prepare
 * 一次就是新 briefId、新 requestId，**同一条通知会被回第二遍**。
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

// 把最后一条通知恢复成 pending，模拟"刚收到、还没处理"
const st = JSON.parse(readFileSync(`${DIR}/state.json`, 'utf8'));
const target = st.inbox[st.inbox.length - 1];
target.status = 'pending';
delete target.handling;
const INBOX_ID: string = target.id;
const T = target.target;
// 这条可能在真机上已经回过 —— 清掉它的发送记录，模拟"刚收到、还没回"
st.outbox = st.outbox.filter((r: any) => r.requestId !== `reply:${INBOX_ID}`);
writeFileSync(`${DIR}/state.json`, JSON.stringify(st));
console.log('用这条通知测:', INBOX_ID, '|', target.author, '| parent=' + T.parent);

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

const TEXT = '回一句试试，看看发完会不会自动标已回复。';
store.saveBrief({
  id: 'test-auto-handled',
  accountId: ACCOUNT,
  target: T,
  createdAt: new Date().toISOString(),
  purpose: '回通知',
  draft: TEXT,
  nearby: [], recentOwn: [], advice: [], guidance: [],
  judgment: { mode: 'discuss' } as any,
  sourceInboxId: INBOX_ID,
  ...(target.authorId ? { recipientId: target.authorId } : {}),
} as any);

const r: any = await svc.publish({ preparation: { briefId: 'test-auto-handled' }, text: TEXT });

const after = store.getInbox(INBOX_ID);
const rec = store.outbox().at(-1) as any;
console.log('\n发送结果:', r.status);
console.log('通知状态:', after?.status, after?.status === 'handled' ? '✅ 自动标了' : '❌ 还挂着');
console.log('处理说明:', JSON.stringify(after?.handling));
console.log('requestId:', rec?.requestId, rec?.requestId === `reply:${INBOX_ID}` ? '✅ 按通知 id 派生' : '❌');
console.log('kind:', rec?.kind, rec?.kind === 'reply' ? '✅' : '❌');
console.log('记录里的 inboxId:', rec?.inboxId, rec?.inboxId === INBOX_ID ? '✅' : '❌');

// 再 prepare 一次（新 briefId）→ 应该被同一 requestId 挡住，不会回第二遍
store.saveBrief({
  id: 'test-auto-handled-2',
  accountId: ACCOUNT,
  target: T,
  createdAt: new Date().toISOString(),
  purpose: '回通知（第二次 prepare，同一句话）',
  draft: TEXT,
  nearby: [], recentOwn: [], advice: [], guidance: [],
  judgment: { mode: 'discuss' } as any,
  sourceInboxId: INBOX_ID,
} as any);
const r2: any = await svc.publish({ preparation: { briefId: 'test-auto-handled-2' }, text: TEXT });
console.log(
  '\n重新 prepare 后再发:',
  r2.status,
  '| reused=' + r2.reused,
  '| submitted=' + r2.submittedThisCall,
  r2.submittedThisCall === false ? '✅ 没有重复提交' : '❌ 又发了一次',
);
