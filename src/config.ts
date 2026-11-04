/**
 * config.ts — 本插件唯一的配置来源。
 *
 * ## 结构
 *
 * 分档预设 + 逐项可调。只做 B 站，所以没有 `platforms.*` 那一层路径。
 *
 * 三个新增（用户 2026-11-04 拍板）：
 *   1. **动态**（读 + 发）
 *   2. **发评方式可选**：API 或真实浏览器
 *   3. **主动 @**（可开关）
 *
 * ## 为什么预设用"档位"而不是一堆散参数
 *
 * 实测证明散参数会让人调到互相矛盾：把"每日发言"调到 50，却把"同一人上限"留在 5，
 * 结果是大部分额度用不出去。四档预设是**按比例**配好的一组数，选一档就对。
 * 想微调再改单项，预设只负责给出一组不自相矛盾的起点。
 */

/** 闲逛参数。四档预设 + 可逐项覆盖。 */
export interface RoamingConfig {
  enabled: boolean;
  /** `bounded` = 有轮次上限且会超时；`free` = 只等空闲，不限轮次也不超时。 */
  mode: 'bounded' | 'free';
  maxDailySessions: number;
  maxVideosPerSession: number;
  maxCommentsPerVideo: number;
  maxCommentsPerSession: number;
  maxDailyComments: number;
  /** 两次闲逛之间至少隔多少分钟。 */
  minIntervalMinutes: number;
  /** 主会话空闲多少分钟后才给机会。 */
  idleMinutes: number;
  /** 一轮最长多少分钟（free 模式忽略）。 */
  maxSessionMinutes: number;
  /** 每轮最多塞给模型多少字的正文。 */
  maxTextChars: number;
}

/**
 * 四档预设。**这组数是实测调过的**，选一档就有一组不自相矛盾的参数。
 */
export const ROAMING_PRESETS = {
  light: {
    mode: 'bounded',
    maxDailySessions: 4,
    maxVideosPerSession: 2,
    maxCommentsPerVideo: 20,
    maxCommentsPerSession: 3,
    maxDailyComments: 8,
    minIntervalMinutes: 120,
    idleMinutes: 10,
    maxSessionMinutes: 30,
    maxTextChars: 8000,
  },
  balanced: {
    mode: 'bounded',
    maxDailySessions: 8,
    maxVideosPerSession: 3,
    maxCommentsPerVideo: 40,
    maxCommentsPerSession: 5,
    maxDailyComments: 24,
    minIntervalMinutes: 60,
    idleMinutes: 8,
    maxSessionMinutes: 30,
    maxTextChars: 10000,
  },
  active: {
    mode: 'bounded',
    maxDailySessions: 12,
    maxVideosPerSession: 5,
    maxCommentsPerVideo: 60,
    maxCommentsPerSession: 8,
    maxDailyComments: 60,
    minIntervalMinutes: 40,
    idleMinutes: 5,
    maxSessionMinutes: 30,
    maxTextChars: 12000,
  },
  free: {
    mode: 'free',
    maxDailySessions: 12,
    maxVideosPerSession: 5,
    maxCommentsPerVideo: 60,
    maxCommentsPerSession: 8,
    maxDailyComments: 60,
    minIntervalMinutes: 10,
    idleMinutes: 5,
    maxSessionMinutes: 30,
    maxTextChars: 12000,
  },
} satisfies Record<string, Omit<RoamingConfig, 'enabled'>>;

export type RoamingPreset = keyof typeof ROAMING_PRESETS;

/** 通知回复额度档位（每日条数）。 */
export const REPLY_PRESETS = { light: 40, balanced: 80, active: 120 } as const;

/** **同一人每天最多几条**。跨视频累计、重启不重置 —— 这是防骚扰的硬底线，不给调。 */
export const MAX_REPLIES_PER_PERSON = 5;

/** 配置里存的 secret 名（部署 `.env`）。 */
export const BILI_WATCH_SECRET = 'BILI_WATCH_COOKIE';
/**
 * 默认登录来源：**本插件自己的 secret**。
 *
 * 不读别人的变量，也不指向任何外部插件的密钥 —— 登录状态归这个插件自己管。
 * 想换成别的位置（例如统一放在一个私有的变量名下）就改 `cookieSecret`，
 * 但注意：写回时只会写这一个变量。
 */
export const DEFAULT_COOKIE_SECRET = BILI_WATCH_SECRET;

/** World id。**一旦发布就不能改** —— 改了用户的配置段会失效。 */
export const BILI_WATCH_ID = 'bili-watch';

export interface FocusConfig {
  /** 特别关注开关。 */
  enabled: boolean;
  /** 关注的 UID。 */
  account: string;
  /** 多久检查一次新投稿（分钟）。 */
  intervalMinutes: number;
  /** 每天最多为关注对象做几次动作。 */
  maxDailyActions: number;
  /** 每次检查拉最新几条投稿。 */
  maxVideos: number;
  /** 主人新作品下自动回应新评论（单独计账，不占普通额度）。 */
  autoReplyNewComments: boolean;
  /** 也回应已有评论（默认只回新的）。 */
  replyExistingComments: boolean;
  /** 自动回应时的最小间隔（分钟）。 */
  autoReplyIntervalMinutes: number;
  /** 允许主动 @ 关注的 UP 主。**默认关**，开着才生效。 */
  allowMentions: boolean;
  /** 每天最多 @ 几次。 */
  maxDailyMentions: number;
}

/**
 * 推荐给我：鱼在闲逛时看到主人可能喜欢的视频，在评论区 @ 主人说一句。
 *
 * **清单只是参考**，不做硬校验 —— 鱼可以推荐清单外的东西，重点是有额度、
 * 有 @ 对象、发得出去。@ 走的还是公开发评通道，所以 posting.enabled 与
 * transport=api 仍然必须满足。
 */
export interface RecommendConfig {
  /** 总开关。默认关。 */
  enabled: boolean;
  /** 要 @ 的账号 UID。留空 = 复用「特别关注」里填的 UID。 */
  ownerUid: string;
  /** @ 时显示的昵称。留空 = 从联系人表按 UID 反查（B 站要求真实昵称）。 */
  ownerName: string;
  /** 主人喜欢什么（视频/UP主/关键词，每行一条）。**仅作参考，不硬性匹配**。 */
  likedList: string;
  /** 每天最多推荐几次。独立于「@ 特别关注」那本账。 */
  maxDaily: number;
}

export interface DynamicsConfig {
  /** 动态功能总开关。 */
  enabled: boolean;
  /** 每天最多读几次动态。 */
  maxDailyReads: number;
  /** 允许发文字动态（默认关）。 */
  allowPublishing: boolean;
  /** 每天最多发几条动态。 */
  maxDailyPosts: number;
  /** 两条动态最少间隔（秒）。 */
  minIntervalSec: number;
  /** 空闲时自主发动态（默认关）。 */
  autonomousEnabled: boolean;
  /** 自主发动态每天最多几条。 */
  autoMaxDaily: number;
  /** 自主发动态的最小间隔（分钟）。 */
  autoMinIntervalMinutes: number;
  /** 主会话空闲多少分钟后才自主发。 */
  autoIdleMinutes: number;
  /** 只在几点到几点之间发（本地时区）。 */
  autoStartHour: number;
  autoEndHour: number;
}

export interface PostingConfig {
  enabled: boolean;
  /** `api` 走接口；`browser` 用真实浏览器点评论框。 */
  transport: 'api' | 'browser';
  /** 两条评论最少间隔（秒）。 */
  minIntervalSec: number;
  /** 每天最多发多少条普通评论。 */
  maxDailyComments: number;
  /** 每天最多回多少条通知（**和主动发言分开算**）。 */
  maxDailyReplies: number;
}

export interface ObserveConfig {
  /** 监听通知的周期（秒）。 */
  intervalSec: number;
  /** 要不要监听。 */
  enabled: boolean;
}

export interface BiliWatchConfig {
  enabled: boolean;

  /** 登录来源（部署 .env 里的变量名）。留空 = 匿名。 */
  cookieSecret: string;

  roaming: RoamingConfig;
  focus: FocusConfig;
  recommend: RecommendConfig;
  dynamics: DynamicsConfig;
  posting: PostingConfig;
  monitor: ObserveConfig;

  /** 视频阅读 */
  read: {
    /** 扫描清晰度（抽帧用的下载档位）。 */
    scanHeight: number;
    /** 放大重看时回读原始流的档位。 */
    zoomHeight: number;
    /** 单张图像素预算，上限 640000 = 800×800。 */
    budget: number;
    /** 单次最多几张图。 */
    maxSheets: number;
    /** 单次最多几帧，0 = 不限。 */
    maxFrames: number;
    /** 每格台词字数 low/med/high。 */
    detail: string;
    /** 尺寸策略。 */
    strategy: string;
    /** 只传 from 时的窗口长度（秒）。 */
    segment: number;
    /** 放大重看是否回原始流取高清帧（慢但更清楚）。 */
    zoomFromStream: boolean;
    /** 读视频时带弹幕（probe 速览 / zoom 该段原文）。 */
    danmaku: boolean;
  };

  /** B 站私信 */
  dm: {
    /** 开关：关掉就不轮询、工具也会拒发。 */
    enabled: boolean;
    /** 私信轮询间隔（秒）。私信没有评论区急，默认 3 分钟。 */
    pollSec: number;
    /** 每天最多发几条（全部会话合计）。 */
    maxDailySends: number;
    /** 同一个人每天最多回几条。 */
    maxPerPerson: number;
    /**
     * 自己人名单（UID，逗号/空格分隔）：**不受上面两个上限约束**。
     * 留空 = 复用特别关注绑定的 UID。护栏是防骚扰陌生人的，不该拦主人。
     */
    trustedUids: string;
  };

  /** 陪看（一起看） */
  watch: {
    /** 总开关：关了工具直接拒。 */
    enabled: boolean;
    /** 浏览器程序路径；留空自动找 Chrome/Edge。 */
    executable: string;
    windowWidth: number;
    windowHeight: number;
    /** 两张观察帧的最小间隔（秒）。越大越省 token。 */
    observeIntervalSec: number;
    /** 帧密度：格数 = 间隔 × 密度，封顶 maxFrames。 */
    frameDensity: number;
    maxFrames: number;
    cellWidth: number;
    cellHeight: number;
    /** 陪看超过这个分钟数自动暂停观察（窗口不关）。0 = 不限。 */
    maxWatchMinutes: number;
  };

  /** 媒体与额度 */
  media: {
    /** 下载副本的容量上限（MB）。 */
    mediaMaxMB: number;
    /** 每日最多出几次图。 */
    maxDailyCalls: number;
    /** 累计图片交付预算（MB）。 */
    maxDeliveredMB: number;
    /** 图片缓存保留天数。 */
    cacheDays: number;
    /** 缓存容量上限（MB）。 */
    maxCacheMB: number;
  };

  /** 语音识别（没有字幕轨时） */
  asr: {
    /** `auto` | `sherpa` | `api` | `off` */
    mode: string;
    /** 本地模型目录，留空自动找桌宠自带那套。 */
    modelDir: string;
    /** sherpa-onnx-node 解析路径，留空按包名。 */
    sherpaPath: string;
    /** sensevoice 的识别语言。 */
    language: string;
    /** api 模式端点。 */
    apiUrl: string;
    apiKey: string;
    apiModel: string;
  };

  /** ffmpeg / ffprobe */
  bins: {
    ffmpeg: string;
    ffprobe: string;
  };
}

export const BILI_WATCH_DEFAULTS: BiliWatchConfig = {
  enabled: true,
  // 登录凭据存在本插件自己的 secret 里
  cookieSecret: DEFAULT_COOKIE_SECRET,

  // **默认用 balanced 档**：4 档里最接近"日常使用"的一组。
  // 注意 enabled 默认 false —— 闲逛是"鱼自己去看"，要不要让它放手去看，
  // 必须由主人明确打开。默认开会让人措手不及。
  roaming: { enabled: false, ...ROAMING_PRESETS.balanced },

  focus: {
    enabled: false,
    account: '',
    intervalMinutes: 60,
    maxDailyActions: 8,
    maxVideos: 12,
    autoReplyNewComments: false,
    replyExistingComments: false,
    autoReplyIntervalMinutes: 30,
    allowMentions: false,
    maxDailyMentions: 3,
  },

  // 推荐给主人：默认关。清单只是参考，次数单独一本账。
  recommend: {
    enabled: false,
    ownerUid: '',
    ownerName: '',
    likedList: '',
    maxDaily: 3,
  },

  // 动态默认只读不发 —— 发动态是内容生产，风险比评论高
  dynamics: {
    enabled: false,
    maxDailyReads: 20,
    allowPublishing: false,
    maxDailyPosts: 3,
    minIntervalSec: 300,
    autonomousEnabled: false,
    autoMaxDaily: 1,
    autoMinIntervalMinutes: 360,
    autoIdleMinutes: 20,
    autoStartHour: 9,
    autoEndHour: 23,
  },

  // 发评默认关。**transport 默认 api**：不用开浏览器，最省事。
  posting: {
    enabled: false,
    transport: 'api',
    minIntervalSec: 60,
    maxDailyComments: 80,
    maxDailyReplies: 80,
  },

  monitor: { enabled: true, intervalSec: 60 },

  read: {
    scanHeight: 480,
    zoomHeight: 1080,
    budget: 640_000,
    maxSheets: 4,
    maxFrames: 0,
    detail: 'med',
    strategy: 'compact',
    segment: 300,
    zoomFromStream: false,
    danmaku: true,
  },

  dm: {
    enabled: true,
    pollSec: 180,
    maxDailySends: 20,
    maxPerPerson: 5,
    trustedUids: '',
  },

  watch: {
    enabled: true,
    executable: '',
    windowWidth: 1280,
    windowHeight: 720,
    observeIntervalSec: 30,
    frameDensity: 0.3,
    maxFrames: 4,
    cellWidth: 480,
    cellHeight: 270,
    maxWatchMinutes: 120,
  },

  media: {
    mediaMaxMB: 300,
    maxDailyCalls: 60,
    maxDeliveredMB: 512,
    cacheDays: 7,
    maxCacheMB: 200,
  },

  asr: {
    mode: 'auto',
    modelDir: '',
    sherpaPath: '',
    language: 'auto',
    apiUrl: '',
    apiKey: '',
    apiModel: 'whisper-1',
  },

  bins: { ffmpeg: '', ffprobe: '' },
};
