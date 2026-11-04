/**
 * config-group.ts — 配置表单（Core 自动渲染，**不需要前端构建产物**）。
 *
 * ## 为什么不用自定义面板
 *
 * 自定义面板要求包里有 `dist/webui.js`，否则页签直接报「缺少面板构建产物」——
 * 这个坑在 video-reader 上真实踩过（用户点进去只看到红字）。
 *
 * 所以配置这一层永远走 Core 内置渲染：`config` 生成表单、`storage` 生成数据页、
 * `badges` 显示用量、`lamps` 显示状态。
 *
 * ## 分组的顺序是按"第一次用需要什么"排的
 *
 * 1. 登录 → 2. 看视频 → 3. 社交发言 → 4. 闲逛 → 5. 动态 → 6. 高级
 *
 * 一个刚装好的人从上往下填就能用，不用先理解全部概念。
 */

import type { ConfigGroup } from 'cortico/core/types.ts';

export const BILI_WATCH_CONFIG_GROUP: ConfigGroup = {
   id: 'world:bili-watch',
  owner: 'world:bili-watch',
  schema: {
    type: 'object',
    title: 'B站伴侣',
    properties: {
      /* -------------------------------------------------- 1. 总开关与登录 */
      'worlds.bili-watch.enabled': {
        type: 'boolean',
        title: '启用',
        description: '关掉后不再注册任何工具。',
        'x-hot': true,
      },
      'worlds.bili-watch.cookieSecret': {
        type: 'string',
        title: '登录来源（环境变量名）',
        description:
          '默认直接读社交视窗扫码存下的那份（SOCIALMEDIA_BILIBILI_COOKIE），**只读不写**。' +
          '留空 = 匿名（只有低清晰度，多半也没有字幕）。',
        'x-hot': true,
      },

      /* -------------------------------------------------- 2. 看视频 */
      'worlds.bili-watch.read.scanHeight': {
        type: 'integer',
        title: '扫描清晰度',
        minimum: 120,
        maximum: 2160,
        description: '抽帧用的下载档位。480 足够出分镜，调高只会让下载变慢。',
        'x-hot': true,
      },
      'worlds.bili-watch.read.zoomHeight': {
        type: 'integer',
        title: '放大重看清晰度',
        minimum: 120,
        maximum: 2160,
        description: 'video_zoom 回读原始流的档位，不落盘。',
        'x-hot': true,
      },
      'worlds.bili-watch.read.zoomFromStream': {
        type: 'boolean',
        title: '放大时回原始流取高清帧',
        description:
          '打开最清楚，但每次 seek 都走 HTTP（实测 4 帧约 40 秒）。' +
          '关掉则读本地 480p 副本，亚秒级完成，看人脸/构图够用。要读画面上的小字才打开。',
        'x-hot': true,
      },
      'worlds.bili-watch.read.maxSheets': {
        type: 'integer',
        title: '单次最多几张图',
        minimum: 0,
        maximum: 64,
        description:
          '4 张 = 一段最多 1536 token。**0 不要随便设**：300 秒的正常剪辑窗口实测能出 17 张 = 6528 token。',
        'x-hot': true,
      },
      'worlds.bili-watch.read.strategy': {
        type: 'string',
        title: '尺寸策略',
        enum: ['full', 'standard', 'compact', 'skim', 'brief'],
        description: 'compact 默认（实测同张数下比 standard 多 75% 的格）。full 最大、brief 最省。',
        'x-hot': true,
      },
      'worlds.bili-watch.read.detail': {
        type: 'string',
        title: '每格台词字数',
        enum: ['low', 'med', 'high'],
        description: 'low=60 / med=120 / high=400，截断落在句末。',
        'x-hot': true,
      },
      'worlds.bili-watch.media.mediaMaxMB': {
        type: 'integer',
        title: '媒体缓存上限（MB）',
        minimum: 32,
        maximum: 8192,
        description: '下载的片子按最近使用淘汰。',
        'x-hot': true,
      },
      'worlds.bili-watch.media.maxDailyCalls': {
        type: 'integer',
        title: '每日出图次数上限',
        minimum: 0,
        maximum: 500,
        description: '含命中缓存的重看。自主闲逛时的护栏。',
        'x-hot': true,
      },
      'worlds.bili-watch.asr.mode': {
        type: 'string',
        title: '语音识别（没有字幕轨时）',
        enum: ['auto', 'sherpa', 'api', 'off'],
        description:
          'auto 默认：本机有桌宠自带语音模型就直接用，没有就明说"没有台词"，不会假装听过音频。',
        'x-hot': true,
      },

      /* -------------------------------------------------- 3. 社交发言 */
      'worlds.bili-watch.monitor.enabled': {
        type: 'boolean',
        title: '监听通知（别人回复/ @ 你）',
        description: '**这是社交感的来源**。关掉后有人回复你也不会知道。',
        'x-hot': true,
      },
      'worlds.bili-watch.monitor.intervalSec': {
        type: 'integer',
        title: '检查间隔（秒）',
        minimum: 30,
        maximum: 3600,
        'x-hot': true,
      },
      'worlds.bili-watch.posting.enabled': {
        type: 'boolean',
        title: '允许发评论',
        description: '总开关。关掉后所有发送都被拒绝（prepare 仍然可用）。',
        'x-hot': true,
      },
      'worlds.bili-watch.posting.transport': {
        type: 'string',
        title: '发评方式',
        enum: ['api', 'browser'],
        description:
          'api = 走接口（不用开浏览器，最省事）；browser = 用真实 Chrome/Edge 点评论框' +
          '（更接近真人，但要装浏览器，且主动 @ 只能用 api）。',
        'x-hot': true,
      },
      'worlds.bili-watch.posting.maxDailyReplies': {
        type: 'integer',
        title: '每日最多回几条通知',
        minimum: 0,
        maximum: 300,
        description: '**和主动发言分开算**。普通渠道同一人每天最多 5 条，跨视频累计、重启不重置。',
        'x-hot': true,
      },
      'worlds.bili-watch.posting.maxDailyComments': {
        type: 'integer',
        title: '每日最多主动发言',
        minimum: 0,
        maximum: 300,
        description: '闲逛时的主动评论额度，不占通知回复。',
        'x-hot': true,
      },
      'worlds.bili-watch.posting.minIntervalSec': {
        type: 'integer',
        title: '两条评论最小间隔（秒）',
        minimum: 10,
        maximum: 3600,
        'x-hot': true,
      },

      /* -------------------------------------------------- 4. 闲逛 */
      'worlds.bili-watch.roaming.enabled': {
        type: 'boolean',
        title: '开启闲逛（鱼自己去看）',
        description:
          '**默认关**。关着的时候鱼不会自己去看 B 站，每次都要主人喊一句。' +
          '打开后：主会话空闲够久 → 给一个机会 → 它自己决定逛不逛、说什么。',
        'x-hot': true,
      },
      'worlds.bili-watch.roaming.mode': {
        type: 'string',
        title: '闲逛模式',
        enum: ['bounded', 'free'],
        description: 'bounded = 有轮次上限且会超时；free = 只等空闲，不限轮次也不超时。',
        'x-hot': true,
      },
      'worlds.bili-watch.roaming.maxDailySessions': {
        type: 'integer',
        title: '每日最多几轮',
        minimum: 1,
        maximum: 100,
        'x-hot': true,
      },
      'worlds.bili-watch.roaming.idleMinutes': {
        type: 'integer',
        title: '空闲多少分钟后给机会',
        minimum: 1,
        maximum: 720,
        description: '主会话连续这么长时间没在忙，才考虑给闲逛机会。',
        'x-hot': true,
      },
      'worlds.bili-watch.roaming.minIntervalMinutes': {
        type: 'integer',
        title: '两轮之间至少隔几分钟',
        minimum: 1,
        maximum: 1440,
        'x-hot': true,
      },
      'worlds.bili-watch.roaming.maxVideosPerSession': {
        type: 'integer',
        title: '每轮最多看几个视频',
        minimum: 1,
        maximum: 30,
        'x-hot': true,
      },
      'worlds.bili-watch.roaming.maxCommentsPerVideo': {
        type: 'integer',
        title: '每个视频最多读几条评论',
        minimum: 1,
        maximum: 200,
        description: '楼中楼也计入。',
        'x-hot': true,
      },
      'worlds.bili-watch.roaming.maxCommentsPerSession': {
        type: 'integer',
        title: '每轮最多主动发言几条',
        minimum: 0,
        maximum: 30,
        description: '主动接楼与独立评论共用这个额度。',
        'x-hot': true,
      },
      'worlds.bili-watch.roaming.maxDailyComments': {
        type: 'integer',
        title: '每日最多主动发言（闲逛）',
        minimum: 0,
        maximum: 300,
        'x-hot': true,
      },
      'worlds.bili-watch.roaming.maxSessionMinutes': {
        type: 'integer',
        title: '一轮最长多少分钟',
        minimum: 5,
        maximum: 240,
        description: '超时自动结束。free 模式忽略这一项。',
        'x-hot': true,
      },

      /* -------------------------------------------------- 5. 特别关注 */
      'worlds.bili-watch.focus.enabled': {
        type: 'boolean',
        title: '特别关注某个 UP 主',
        'x-hot': true,
      },
      'worlds.bili-watch.focus.account': {
        type: 'string',
        title: '关注的 UID',
        description: '**只能在这里填**，工具改不了绑定（防止模型自己换关注对象）。',
        'x-hot': true,
      },
      'worlds.bili-watch.focus.allowMentions': {
        type: 'boolean',
        title: '允许主动 @ 关注的 UP 主',
        description:
          '默认关。开着才允许发评时 @ 它；每次 @ 前都会重新核对绑定与额度。' +
          '注意：主动 @ 只在「发评方式 = api」时可用。',
        'x-hot': true,
      },
      'worlds.bili-watch.focus.maxDailyMentions': {
        type: 'integer',
        title: '每日最多 @ 几次',
        minimum: 0,
        maximum: 30,
        'x-hot': true,
      },
      'worlds.bili-watch.focus.autoReplyNewComments': {
        type: 'boolean',
        title: '自动回应主人作品下的新评论',
        description: '单独计账，不占普通额度，也不设单人次数上限。',
        'x-hot': true,
      },

      /* -------------------------------------------------- 6. 动态 */
      'worlds.bili-watch.dynamics.enabled': {
        type: 'boolean',
        title: '启用动态（读 + 发）',
        'x-hot': true,
      },
      'worlds.bili-watch.dynamics.allowPublishing': {
        type: 'boolean',
        title: '允许发文字动态',
        description: '默认关。发动态是内容生产，风险比评论高。',
        'x-hot': true,
      },
      'worlds.bili-watch.dynamics.maxDailyPosts': {
        type: 'integer',
        title: '每日最多发几条动态',
        minimum: 0,
        maximum: 30,
        'x-hot': true,
      },
      'worlds.bili-watch.dynamics.autonomousEnabled': {
        type: 'boolean',
        title: '空闲时自主发动态',
        description: '默认关。开着且 allowPublishing 也开着才生效。',
        'x-hot': true,
      },

      /* -------------------------------------------------- 7. 高级 */
      'worlds.bili-watch.bins.ffmpeg': {
        type: 'string',
        title: 'ffmpeg 程序',
        description: '留空用 PATH 上的 ffmpeg。',
        'x-hot': true,
      },
      'worlds.bili-watch.bins.ffprobe': {
        type: 'string',
        title: 'ffprobe 程序',
        description: '留空用 PATH 上的 ffprobe。',
        'x-hot': true,
      },
      'worlds.bili-watch.asr.apiUrl': {
        type: 'string',
        title: '语音 API 端点',
        description: 'api 模式用，形如 http://127.0.0.1:8000/v1。',
        'x-hot': true,
      },
      'worlds.bili-watch.asr.apiKey': {
        type: 'string',
        title: '语音 API 令牌',
        description: '本机服务通常不需要。',
        'x-hot': true,
      },
    },
  },
};
