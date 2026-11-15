/**
 * 离线验证：字幕选轨（0.2.16）
 *
 * 起因：一条粤语老歌 MV，AI 字幕把歌词转成「欢迎翻到千里年的广东」，
 * 而插件把它当正常字幕喂给模型引用。
 *
 * 这里锁死三条：
 *   1. 人工轨永远优先于 AI 轨（否则白瞎作者写的准确文本）
 *   2. 只有 AI 轨时也能用，但必须带上 `auto` 标记（模型才知道"别当原话"）
 *   3. 判断只有一处（core/subtitle-pick.ts），两处调用方共用
 */
import { isAutoSubtitle, pickSubtitleTrack } from '../src/core/subtitle-pick.ts';

let ok = 0;
let fail = 0;
const check = (label: string, cond: boolean, extra = '') => {
  if (cond) ok++;
  else fail++;
  console.log(`${cond ? '✅' : '❌'} ${label}${extra ? ` — ${extra}` : ''}`);
};

// 真机上常见的几种 track 形状
const manualZh = { lan: 'zh-CN', lan_doc: '中文（中国）', subtitle_url: '//a/zh.json' };
const manualZhHans = { lan: 'zh-Hans', lan_doc: '中文（简体）', subtitle_url: '//a/hans.json' };
const manualEn = { lan: 'en-US', lan_doc: 'English', subtitle_url: '//a/en.json' };
const aiZh = { lan: 'ai-zh', lan_doc: '中文（自动生成）', subtitle_url: '//a/ai.json' };
const docSaysAuto = { lan: 'zh-CN', lan_doc: '中文（自动生成）', subtitle_url: '//a/bad.json' };

// ① 标记识别
check('ai-zh 认成自动', isAutoSubtitle(aiZh));
check('lan_doc 写「自动生成」也认', isAutoSubtitle(docSaysAuto));
check('zh-CN 人工不算自动', !isAutoSubtitle(manualZh));
check('空值不算自动', !isAutoSubtitle(undefined));

// ② 人工优先
check(
  'AI 轨排在前面也挑人工',
  pickSubtitleTrack([aiZh, manualZh])?.lan === 'zh-CN',
  String(pickSubtitleTrack([aiZh, manualZh])?.lan),
);
check(
  '人工简体优先于人工英文',
  pickSubtitleTrack([manualEn, manualZhHans])?.lan === 'zh-Hans',
);
check('只有英文人工时用它', pickSubtitleTrack([manualEn])?.lan === 'en-US');

// ③ 只有 AI 轨：能用，但带标记
const onlyAi = pickSubtitleTrack([aiZh]);
check('只有 AI 轨能挑出来', onlyAi?.lan === 'ai-zh');
check('并且标记成 auto', isAutoSubtitle(onlyAi ?? undefined));
check('空列表返回 undefined', pickSubtitleTrack([]) === undefined);
check('null 也安全', pickSubtitleTrack(null as any) === undefined);

// ④ lan 字段缺失（老接口/别的站点）：按人工处理，别乱标 auto
const noLan = { subtitle_url: '//a/x.json' };
check('没有 lan 字段不算自动', !isAutoSubtitle(noLan));
check('没有 lan 也能挑出来', pickSubtitleTrack([aiZh, noLan])?.subtitle_url === '//a/x.json');

console.log(`\n${ok} 通过 / ${fail} 失败`);
if (fail) process.exitCode = 1;
