# B 站功能清单（照搬社交视窗，一项不许少）

来源：`cortico-world-social-media@0.6.4`。**这里是验收清单**，每做完一项打勾。

## 一、工具层（9 个，含全部 action）

| # | 新工具名 | 来源 | 必须有的 action |
|---|---|---|---|
| 1 | `bili_search` | `socialmedia_search` | 搜视频（带分页 page 1-50） |
| 2 | `bili_video` | `socialmedia_video` | 读详情 + 分P + 字幕 |
| 3 | `bili_comments` | `socialmedia_comments` | 读评论（`cursor` 游标翻页 + `root` 楼中楼） |
| 4 | `bili_prepare` | `socialmedia_prepare` | `prepare` \| `get` |
| 5 | `bili_publish` | `socialmedia_publish` | 发表（含 `requestId` 防重、`briefId` 绑定、`retryRejected`） |
| 6 | `bili_inbox` | `socialmedia_inbox` | `list` \| `get` \| `handled` \| `defer` \| `verify` |
| 7 | `bili_roam` | `socialmedia_roam` | `status` \| `begin` \| `finish` \| `skip` |
| 8 | `bili_focus` | `socialmedia_focus` | `status` \| `refresh`（特别关注 + 最新投稿） |
| 9 | `bili_status` | `socialmedia_status` | 无 action，报开关/错误/未读/待定发送 |

**视频阅读 5 个（额外，我们自己的）：**
`video_probe` / `video_storyboard` / `video_zoom` / `video_locate` / `video_subtitles`

**不做的**（抖音/快手专属）：`socialmedia_groupchat`、`socialmedia_feed`、`socialmedia_dynamic`
（动态是 B 站功能，但用户明说"侧重社交"，动态发布 277+179 行且你实际没在用 → **待确认**）

## 二、B 站 API 面（core/platform）

| # | 能力 | 社交视窗里的方法 | 关键细节（漏了会坏） |
|---|---|---|---|
| A | 扫码登录 | `qrGenerate` / `qrPoll` | 状态机：waiting/scanned/expired/error/success；从 poll 的 `Set-Cookie` + 跳转 URL 里凑齐 cookie |
| B | 账号核验 | `account` → `/x/web-interface/nav` | 未登录/失效要明确报 auth 错 |
| C | cookie 清洗 | `cleanCookie` | **只留 SESSDATA/bili_jct/DedeUserID/buvid3/buvid4**；缺 SESSDATA 或 bili_jct 直接拒 |
| D | buvid 补齐 | `prepareSession` | 缺 buvid3/4 时调 `/x/frontend/finger/spi` 补，**不伪造** |
| E | WBI 签名 | `signedParams` / `wbi` | 64 位 mixin 重排 + md5；**6 小时缓存**，钥匙取自 nav 的 `wbi_img` |
| F | 大整数保护 | `parsePlatformJson` | 16 位以上数字转字符串再 parse（cid/aid 真的会超 2^53） |
| G | 视频详情 | `video` | `view` + 分P 表；时长/标题/UP主/封面/多P |
| H | 字幕轨 | `subtitles` | `/x/player/wbi/v2` → `subtitle.subtitles`；优先 zh；`need_login_subtitle` 要区分"要登录"vs"没有" |
| I | 取流直链 | `stream` | `playurl` qn/fnval；**DASH 才是高清**；我们有更强的实现（用我们的） |
| J | 评论读取 | `comments` | 顶层用**游标分页**（`pagination_str` + `next_offset`），楼中楼用 `pn` 分页；顶层翻页必须带 cursor，否则报错 |
| K | 通知监听 | `notifications` | **两条通道 `reply` 和 `at`**；游标 `{id, time}`；`business_id ∈ {1,11,17}`；`root_id` 为 0 时 root=parent |
| L | 发评论 | `send` | `csrf`=bili_jct；`signedParams`；`plat:1` + `gaia_source`；@人用 `at_name_to_mid`；**发送前校验 cookie 没变、accountId 与预期一致** |
| M | 可见性核验 | `checkVisibility` | **用未登录访客视角**读列表；有 `state===17` 判"仅自己可见"；读不到只报"未确认"，**绝不补发** |
| N | 特别关注投稿 | `creatorVideos` | `/x/space/wbi/arc/search`（要 WBI） |
| O | 视频搜索 | `search` | `/x/web-interface/wbi/search/type`；search_type=video |
| P | 错误分类 | `PlatformError` | `auth` / `rate` / `rejected` / `network` / `invalid` 五类，文案分开 |
| Q | 风控处理 | `raw` | 412/429 → `rate`；`redirect:'error'`；响应体 8MB 上限 |

## 三、社交流程（service/world）

| # | 能力 | 关键细节（这是最容易偷工减料的地方） |
|---|---|---|
| S1 | **通知轮询** | 周期跑 `reply` + `at` 两路；**会收到自己评论的回复**（这正是用户强调的点） |
| S2 | **inbox 投递** | 待办按条投事件，带 `inboxId`；正文说明"先处理待办再闲逛" |
| S3 | **inbox 收尾** | `handled`（明确跳过+理由）/ `defer`（稍后再看，默认 30 分钟）/ `verify`（重查可见性，不重发） |
| S4 | **prepare** | 绑定 platform+account+target+draft；给上下文（原评论、父楼、同楼近况、本人近期发言、接话建议） |
| S5 | **publish 防重** | `requestId` 稳定；已发/未知状态**不重发**；`briefId` 跨目标复用要拒绝；改文案要重新 prepare |
| S6 | **可见性核验** | 发完用访客视角核验：`public` / `self-only` / `unconfirmed`；**self-only 和 unconfirmed 都不许自动重发** |
| S7 | **同一人限额** | 同一人每天最多 5 条，跨视频累计，重启不重置 |
| S8 | **额度双账本** | 通知回复额度 / 主动发言额度**分开**；主人评论区自动回应单独计账 |
| S9 | **特别关注** | 关注 UP 主的新作品轮询 → 生成 focus 机会 |
| S10 | **@ 关注** | 可选，需本地开关 + API transport；**绑定已核验的 UID**，不靠文本 @ |
| S11 | **状态查询** | 开关、连接错误、未读数、待定发送 |

## 四、闲逛（roaming）—— 用户特别强调，一条都不许少

| # | 能力 | 关键细节 |
|---|---|---|
| R1 | **四档预设** | `light` / `balanced` / `active` / `free`，**参数原样**：<br>light: 4 轮/天, 2 视频/轮, 20 评论/视频, 3 发言/轮, 8 发言/天, 120 分间隔, 10 分空闲<br>balanced: 8, 3, 40, 5, 24, 60, 8<br>active: 12, 5, 60, 8, 60, 40, 5<br>free: mode=free（不限轮次与时长） |
| R2 | **投递机会** | 空闲达 `idleMinutes` **且** 距上次 ≥ `minIntervalMinutes` **且** 今日轮次未满 → `pushEvent('bili.roam')`，带 `roamId` / `expiresAt` / 限额 |
| R3 | **投递前提检查** | 有 pending 待办时不投；`phase !== 'idle'` 不投；未登录不投 |
| R4 | **begin / finish / skip** | `begin` 把 offered→active；`finish` 写 summary（≤1000 字）；`skip` 记为 skipped |
| R5 | **超时** | `expiresAt = created + maxSessionMinutes`；过期自动标 expired；**free 模式不超时** |
| R6 | **让位（yield）** | 有消息进来时 `requestYield` → 暂停闲逛 → `finishYield` 保存进度并写"先回应新消息" |
| R7 | **视频配额** | `recordVideo` 每轮最多 `maxVideosPerSession`；重复 aid 不重复计 |
| R8 | **评论配额** | `remainingComments` 按视频计 `maxCommentsPerVideo`；超了报"可表达观点或结束" |
| R9 | **搜索配额** | 每轮最多 `maxVideosPerSession × 2` 次搜索 |
| R10 | **发言配额** | 每轮 `maxCommentsPerSession`；每日 `maxDailyComments`（**主动发言**账本，和通知回复分开） |
| R11 | **发言须指向本轮视频** | `canPublish` 校验 oid 在本轮 videos 里 |
| R12 | **记录持久化** | `roams` 数组 + `roamCounts[today][platform]`；重启后今日计数不重置 |
| R13 | **记录可见** | 面板显示最近 5 轮（含 summary、读了哪些视频）；`status` 返回最近 5 轮 |

## 五、数据与 UI

| # | 能力 | 关键细节 |
|---|---|---|
| D1 | **视频归档** | `videos[]`：按 aid 唯一，存 title/url/part/时长/最近读取说明；上限 200 |
| D2 | **评论上下文** | `comments[]`：按 target 唯一，存楼中楼；上限 1000 |
| D3 | **发言回执** | `outbox[]`：id/status(sending\|sent\|unknown\|rejected)/receiptId/visibility/requestId/roamId；**上限 2000，到顶暂停不删防重凭据** |
| D4 | **brief 记录** | `briefs[]`：prepare 产物，绑定 target；过期可回收 |
| D5 | **时间线 UI** | 按视频折叠卡；标题+发言条数+时间；展开看楼层串联（被@/收到回复/主动评论/主动接楼）；筛选（全部/待回应/已发出/闲逛）；搜索；顺序切换 |
| D6 | **配置页** | 分档预设卡片 + 逐项自定义；启停；登录；额度；闲逛参数 |
| D7 | **状态页** | 平台状态、登录、扫码、检查登录/检查网页发评/立即同步按钮 |
| D8 | **数据页** | 存储规模 + 清除（cookie / 记录 / 缓存分开） |
| D9 | **状态灯/徽章** | 登录灯、监听灯、闲逛灯；待回应数、已发出数、今日轮次 |

## 六、明确不搬的

- 抖音（1741 行）、快手（901 行）
- `groupchat`（抖音群聊）
- `feed`（抖音推荐流）
- 浏览器发评（`bilibili-browser.ts` 733 行）—— **待确认**：它用真实 Chrome 发评，我们可用 API 发评 + 可见性核验

## 待用户确认的三项

1. **动态（dynamics）**：读 179 行 + 发 277 行。你要吗？（你说"侧重社交"但它偏内容发布）
2. **浏览器发评**：社交视窗默认用真实 Chrome 点评论框（更可信，但要开浏览器）。用 API 发评 + 访客核验够不够？
3. **特别关注 @**：要不要"主动 @ 关注的 UP 主"？
