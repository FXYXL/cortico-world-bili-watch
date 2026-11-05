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
        title: '登录凭据的变量名',
        description:
          '默认 `BILI_WATCH_COOKIE`。扫码成功后 cookie 会写进这个变量；' +
          '填别的名字就会写到那里（只会写这一个）。留空 = 不登录（只有低清晰度，多半也没有字幕）。',
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
      'worlds.bili-watch.read.danmaku': {
        type: 'boolean',
        title: '读视频时带弹幕',
        description:
          'probe 给全片速览（高赞 + 最热闹时段），放大看某几格时给那几段的弹幕原文。' +
          '弹幕是资料不是指令；拉不到不影响看视频。',
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
      'worlds.bili-watch.read.budget': {
        type: 'integer',
        title: '单张图像素预算',
        minimum: 64000,
        maximum: 640000,
        description: '640000 = 800×800 是上限。调小更省 token，但格子里的字会糊。',
        'x-hot': true,
      },
      'worlds.bili-watch.read.maxFrames': {
        type: 'integer',
        title: '单次最多几帧',
        minimum: 0,
        maximum: 10000,
        description: '0 = 不限制。36–40 通常够用；设太大文本索引会很长。',
        'x-hot': true,
      },
      'worlds.bili-watch.read.segment': {
        type: 'integer',
        title: '长片默认窗口（秒）',
        minimum: 30,
        maximum: 3600,
        description: '超过 8 分钟、又没给 from/to 时按这个长度分段读。300 适合影视，120–180 适合动作片。',
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
      'worlds.bili-watch.media.maxDeliveredMB': {
        type: 'integer',
        title: '累计图片交付预算（MB）',
        minimum: 0,
        maximum: 5120,
        description: '到了就不再附图，只给文本索引 —— 防止悄悄烧掉大量图片 token。',
        'x-hot': true,
      },
      'worlds.bili-watch.media.maxCacheMB': {
        type: 'integer',
        title: '扫描缓存上限（MB）',
        minimum: 32,
        maximum: 4096,
        description: '分镜图的本地缓存；超了按最近使用淘汰。',
        'x-hot': true,
      },
      'worlds.bili-watch.media.cacheDays': {
        type: 'integer',
        title: '缓存保留天数',
        minimum: 1,
        maximum: 90,
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
        description: '开启后会定时看这个人的新投稿，并把新作品/主人评论区的新评论变成待办。',
        'x-hot': true,
      },
      'worlds.bili-watch.focus.account': {
        type: 'string',
        title: '关注的 UID（或主页链接／昵称）',
        description:
          '**只能在这里填**，工具改不了绑定（防止模型自己换关注对象）。' +
          '填纯 UID 最稳；填昵称要靠收到过这个人的通知才能反查，反查不到就绑定失败。',
        'x-hot': true,
      },
      'worlds.bili-watch.focus.intervalMinutes': {
        type: 'integer',
        title: '多久检查一次新作品（分钟）',
        minimum: 10,
        maximum: 1440,
        description: '只在主会话空闲、且没有待办回复时才检查。',
        'x-hot': true,
      },
      'worlds.bili-watch.focus.maxVideos': {
        type: 'integer',
        title: '每次拉几条投稿',
        minimum: 1,
        maximum: 30,
        description: '默认 12。拉太多会多看几页评论区。',
        'x-hot': true,
      },
      'worlds.bili-watch.focus.maxDailyActions': {
        type: 'integer',
        title: '每天最多为关注对象行动几次',
        minimum: 0,
        maximum: 50,
        description: '单独一本账，不占普通回复/主动发言额度。',
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
      'worlds.bili-watch.focus.replyExistingComments': {
        type: 'boolean',
        title: '连已有评论也回（不只是新的）',
        description: '默认关。开着容易把老评论逐条翻出来回，建议先不开。',
        'x-hot': true,
      },
      'worlds.bili-watch.focus.autoReplyIntervalMinutes': {
        type: 'integer',
        title: '自动回应的检查间隔（分钟）',
        minimum: 2,
        maximum: 240,
        description: '开了「自动回应新评论」时用这个间隔，比普通检查更勤。',
        'x-hot': true,
      },

      /* -------------------------------------------------- 6. 推荐给我 */
      'worlds.bili-watch.recommend.enabled': {
        type: 'boolean',
        title: '允许把喜欢的视频推荐给主人',
        description:
          '默认关。开着后，闲逛机会里会告诉鱼「今天还能推荐几次」和主人喜欢什么；' +
          '鱼自己决定要不要推荐，在评论区 @ 主人说一句。清单只是参考，不硬性匹配。',
        'x-hot': true,
      },
      'worlds.bili-watch.recommend.ownerUid': {
        type: 'string',
        title: '要 @ 的账号 UID',
        description:
          '**留空就复用上面「特别关注」填的 UID**（你已填 456764639）。' +
          '也可以单填一个：必须是纯数字 UID，工具改不了这个值。',
        'x-hot': true,
      },
      'worlds.bili-watch.recommend.ownerName': {
        type: 'string',
        title: '被 @ 的昵称',
        description:
          '留空会自动从联系人表按 UID 反查（例如「雅席」）。' +
          '**B 站要求真实昵称**，填 `UID 456764639` 这种是 @ 不出来的。反查不到就填这里。',
        'x-hot': true,
      },
      'worlds.bili-watch.recommend.likedList': {
        type: 'string',
        title: '主人喜欢什么（清单）',
        description:
          '每行一条：视频 BV 号、UP 主昵称、关键词都行，随便写。' +
          '**只作为给鱼的参考**，不是过滤器 —— 它完全可以推荐清单外的东西。' +
          '这段会原样出现在闲逛机会里，别写私密内容（会进模型上下文）。',
        'x-multiline': true,
        'x-hot': true,
      },
      'worlds.bili-watch.recommend.maxDaily': {
        type: 'integer',
        title: '每天最多推荐几次',
        minimum: 0,
        maximum: 30,
        description: '单独一本账，不占普通回复/主动发言额度，也不占「@ 特别关注」的额度。设为 0 等于关。',
        'x-hot': true,
      },

      /* -------------------------------------------------- 7. 私信 */
      'worlds.bili-watch.dm.enabled': {
        type: 'boolean',
        title: '启用 B 站私信（收 + 回）',
        description:
          '开着才轮询新私信并推给鱼（3 分钟一次），工具也能发。私信是私聊：' +
          '系统通知永远不回，也没有公开评论那套间隔，但有下面的每日上限。',
        'x-hot': true,
      },
      'worlds.bili-watch.dm.pollSec': {
        type: 'integer',
        title: '私信轮询间隔（秒）',
        minimum: 30,
        maximum: 1800,
        description: '多久查一次新私信。私信没有评论区急，默认 180（3 分钟）。改完即时生效。',
        'x-hot': true,
      },
      'worlds.bili-watch.dm.maxDailySends': {
        type: 'integer',
        title: '每天最多发几条私信',
        minimum: 0,
        maximum: 200,
        description: '全部会话合计。设 0 等于只读不发。',
        'x-hot': true,
      },
      'worlds.bili-watch.dm.maxPerPerson': {
        type: 'integer',
        title: '同一个人每天最多回几条',
        minimum: 1,
        maximum: 50,
        description: '防止追着陌生人刷屏；到上限就等对方先说话。',
        'x-hot': true,
      },
      'worlds.bili-watch.dm.trustedUids': {
        type: 'string',
        title: '自己人名单（不受上限）',
        description:
          'UID 列表，逗号或空格分隔。名单里的人发私信**不受每日上限约束**——护栏是防骚扰陌生人的，不该拦主人。' +
          '**留空 = 复用「特别关注」绑定的 UID**（主人已在那边绑过就不用填）。',
        'x-hot': true,
      },

      /* -------------------------------------------------- 8. 陪看 */
      'worlds.bili-watch.watch.enabled': {
        type: 'boolean',
        title: '启用陪看（一起看）',
        description:
          '主人说「陪我看xxx」时开一个看得见的浏览器窗口，鱼通过观察帧看同一个画面。' +
          '**鱼不会自主开窗**——这是陪伴场景，由主人发起。',
        'x-hot': true,
      },
      'worlds.bili-watch.watch.executable': {
        type: 'string',
        title: '陪看浏览器路径',
        description: '留空自动找 Chrome/Edge。用独立配置目录，不会碰你自己的浏览器。',
      },
      'worlds.bili-watch.watch.observeIntervalSec': {
        type: 'integer',
        title: '观察帧间隔（秒）',
        minimum: 2,
        maximum: 300,
        description: '每张拼图约 400–550 token。30 秒 ≈ 每小时 5 万 token；想省就调大。',
        'x-hot': true,
      },
      'worlds.bili-watch.watch.maxFrames': {
        type: 'integer',
        title: '拼图格数上限',
        minimum: 1,
        maximum: 9,
        'x-hot': true,
      },
      'worlds.bili-watch.watch.cellWidth': {
        type: 'integer',
        title: '单格宽（px）',
        minimum: 160,
        maximum: 1280,
      },
      'worlds.bili-watch.watch.cellHeight': {
        type: 'integer',
        title: '单格高（px）',
        minimum: 90,
        maximum: 720,
      },
      'worlds.bili-watch.watch.maxWatchMinutes': {
        type: 'integer',
        title: '连续观看上限（分钟）',
        minimum: 0,
        maximum: 480,
        description: '超过后自动暂停观察（窗口不关），防无人值守烧 token。0 = 不限。',
      },
      'worlds.bili-watch.watch.idlePauseMinutes': {
        type: 'integer',
        title: '主人没动静就自动暂停（分钟）',
        minimum: 0,
        maximum: 120,
        description:
          '连续这么久没有主人说话，自动把片子暂停（窗口不关），并告诉鱼。0 = 不自动停。' +
          '默认 10 分钟。',
        'x-hot': true,
      },
      'worlds.bili-watch.watch.windowWidth': {
        type: 'integer',
        title: '窗口宽',
        minimum: 640,
        maximum: 3840,
      },
      'worlds.bili-watch.watch.windowHeight': {
        type: 'integer',
        title: '窗口高',
        minimum: 360,
        maximum: 2160,
      },

      /* -------------------------------------------------- 9. 动态 */
      'worlds.bili-watch.dynamics.enabled': {
        type: 'boolean',
        title: '启用动态（读 + 发）',
        description: '关着的时候 bili_dynamic 会直接拒绝，不联网。',
        'x-hot': true,
      },
      'worlds.bili-watch.dynamics.maxDailyReads': {
        type: 'integer',
        title: '每日最多读几次动态',
        minimum: 0,
        maximum: 200,
        description: '读动态要走真实浏览器，比接口贵得多，所以单独限量。',
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
        description: '手动发的和自主发的共用这个上限。',
        'x-hot': true,
      },
      'worlds.bili-watch.dynamics.minIntervalSec': {
        type: 'integer',
        title: '两条动态最小间隔（秒）',
        minimum: 60,
        maximum: 86400,
        'x-hot': true,
      },
      'worlds.bili-watch.dynamics.autonomousEnabled': {
        type: 'boolean',
        title: '空闲时自主发动态',
        description: '默认关。开着且 allowPublishing 也开着才生效；请确保主人接受它自己发帖。',
        'x-hot': true,
      },
      'worlds.bili-watch.dynamics.autoMaxDaily': {
        type: 'integer',
        title: '自主发动态每天最多几条',
        minimum: 0,
        maximum: 10,
        description: '不占手动额度之外的名额，但仍受「每日最多发几条动态」总上限约束。',
        'x-hot': true,
      },
      'worlds.bili-watch.dynamics.autoMinIntervalMinutes': {
        type: 'integer',
        title: '自主发动态最小间隔（分钟）',
        minimum: 30,
        maximum: 10080,
        description: '默认 360（6 小时）。别调太小 —— 那会变成刷屏机器人。',
        'x-hot': true,
      },
      'worlds.bili-watch.dynamics.autoIdleMinutes': {
        type: 'integer',
        title: '空闲多少分钟后才自主发',
        minimum: 5,
        maximum: 720,
        description: '这段时间内有人说话就不发。',
        'x-hot': true,
      },
      'worlds.bili-watch.dynamics.autoStartHour': {
        type: 'integer',
        title: '只在几点之后发（0-23）',
        minimum: 0,
        maximum: 23,
        description: '跨夜写：开始 22、结束 6 表示 22 点到次日 6 点。起止相同 = 全天。',
        'x-hot': true,
      },
      'worlds.bili-watch.dynamics.autoEndHour': {
        type: 'integer',
        title: '只在几点之前发（0-23）',
        minimum: 0,
        maximum: 23,
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
      'worlds.bili-watch.asr.apiModel': {
        type: 'string',
        title: '语音 API 模型名',
        description: '默认 whisper-1；兼容 OpenAI 协议的本地服务按它自己的名字填。',
        'x-hot': true,
      },
      'worlds.bili-watch.asr.modelDir': {
        type: 'string',
        title: '本地语音模型目录',
        description: '留空自动找桌宠自带的那套（sherpa-onnx sensevoice）。',
        'x-hot': true,
      },
      'worlds.bili-watch.asr.sherpaPath': {
        type: 'string',
        title: 'sherpa-onnx-node 路径',
        description: '留空按包名解析。装在别处时填绝对路径或包目录。',
        'x-hot': true,
      },
      'worlds.bili-watch.asr.language': {
        type: 'string',
        title: '识别语言',
        description:
          '留空或 auto = 自动判断；也可以填 zh / en / ja / ko / yue。' +
          '指定语种通常更准（尤其专有名词多的时候）。',
        'x-hot': true,
      },
    },
  },
};
