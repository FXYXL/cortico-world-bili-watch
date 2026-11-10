/**
 * 离线验证：BV 号直接当 oid 用 + oid 解析不出视频时拦住（0.2.12）
 *
 * 她实测填错过 oid：「那个 oid 根本解析不出视频，它也照样给凭据」，
 * 差点把评论发到别的视频下面。
 */
import { videoOid, bv2av, BiliClient, normalizeTarget } from '../src/core/client.ts';
import { probeVideoOid } from '../src/core/video.ts';

let ok = 0;
let fail = 0;
const check = (label: string, cond: boolean, extra = '') => {
  if (cond) ok++;
  else fail++;
  console.log(`${cond ? '✅' : '❌'} ${label}${extra ? ' — ' + extra : ''}`);
};

// ① BV 换算（真机数据交叉验证）
const cases: Array<[string, string]> = [
  ['BV1x4Jf6tEWC', '117469737916999'],
  ['BV1QZ4Q6BED9', '117183820597765'],
  ['BV1KmxY66EZ3', '117527753588880'],
  ['BV13y4E6gEPi', '117574343987404'],
];
for (const [bv, aid] of cases) check(`${bv} → ${aid}`, bv2av(bv) === aid, String(bv2av(bv)));

// ② 各种写法的 oid 都能归一
check('纯 aid 原样', videoOid('117469737916999') === '117469737916999');
check('BV 号', videoOid('BV1x4Jf6tEWC') === '117469737916999');
check('av 号', videoOid('av117469737916999') === '117469737916999');
check('完整链接', videoOid('https://www.bilibili.com/video/BV1x4Jf6tEWC/?p=2') === '117469737916999');
check('带 aid 参数的链接', videoOid('https://x.com/a?aid=117469737916999') === '117469737916999');
try {
  videoOid('随便写的');
  check('乱填要报错', false);
} catch {
  check('乱填要报错', true);
}
// 换函数时最容易漏的就是这个：原来的 numericId 拒 0，新的必须也拒
for (const zero of ['0', '000']) {
  try {
    videoOid(zero);
    check(`oid=${zero} 要拒绝`, false);
  } catch {
    check(`oid=${zero} 要拒绝`, true);
  }
}

// ③ normalizeTarget 吃 BV（视频）但不吃 BV（动态）
const t1 = normalizeTarget({ oid: 'BV1x4Jf6tEWC', type: 1, root: '0', parent: '0' });
check('normalizeTarget 视频收 BV', t1.oid === '117469737916999', t1.oid);
try {
  normalizeTarget({ oid: 'BV1x4Jf6tEWC', type: 11, root: '0', parent: '0' });
  check('动态不该收 BV', false);
} catch {
  check('动态不该收 BV', true);
}

// ④ oid 探针：硬失败 vs 软失败
const mkClient = (behavior: 'ok' | 'gone' | 'risk') =>
  new BiliClient({
    cookie: () => 'SESSDATA=x;bili_jct=y;DedeUserID=1',
    fetcher: async () => {
      if (behavior === 'ok')
        return new Response(
          JSON.stringify({ code: 0, data: { title: '《肥鱼讽克王纳谏》', owner: { name: '某UP' } } }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      if (behavior === 'gone')
        return new Response(JSON.stringify({ code: -404, message: '啥啥都木有', data: null }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      return new Response(JSON.stringify({ code: -352, message: '风控校验失败', data: null }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });

const okProbe = await probeVideoOid(mkClient('ok'), '117469737916999');
check('正常视频 → ok + 标题', okProbe.ok && okProbe.title === '《肥鱼讽克王纳谏》', String(okProbe.title));

const goneProbe = await probeVideoOid(mkClient('gone'), '1');
check('视频不存在 → 拒绝', goneProbe.ok === false, goneProbe.reason);

const riskProbe = await probeVideoOid(mkClient('risk'), '117469737916999');
check(
  '风控/网络 → 放行但要提示',
  riskProbe.ok === true && Boolean(riskProbe.unverified),
  riskProbe.unverified,
);

console.log(`\n${ok} 通过 / ${fail} 失败`);
