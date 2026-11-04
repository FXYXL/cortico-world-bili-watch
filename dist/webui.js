// src/config-group.ts
var BILI_WATCH_CONFIG_GROUP = {
  id: "world:bili-watch",
  owner: "world:bili-watch",
  schema: {
    type: "object",
    title: "B\u7AD9\u4F34\u4FA3",
    properties: {
      /* -------------------------------------------------- 1. 总开关与登录 */
      "worlds.bili-watch.enabled": {
        type: "boolean",
        title: "\u542F\u7528",
        description: "\u5173\u6389\u540E\u4E0D\u518D\u6CE8\u518C\u4EFB\u4F55\u5DE5\u5177\u3002",
        "x-hot": true
      },
      "worlds.bili-watch.cookieSecret": {
        type: "string",
        title: "\u767B\u5F55\u51ED\u636E\u7684\u53D8\u91CF\u540D",
        description: "\u9ED8\u8BA4 `BILI_WATCH_COOKIE`\u3002\u626B\u7801\u6210\u529F\u540E cookie \u4F1A\u5199\u8FDB\u8FD9\u4E2A\u53D8\u91CF\uFF1B\u586B\u522B\u7684\u540D\u5B57\u5C31\u4F1A\u5199\u5230\u90A3\u91CC\uFF08\u53EA\u4F1A\u5199\u8FD9\u4E00\u4E2A\uFF09\u3002\u7559\u7A7A = \u4E0D\u767B\u5F55\uFF08\u53EA\u6709\u4F4E\u6E05\u6670\u5EA6\uFF0C\u591A\u534A\u4E5F\u6CA1\u6709\u5B57\u5E55\uFF09\u3002",
        "x-hot": true
      },
      /* -------------------------------------------------- 2. 看视频 */
      "worlds.bili-watch.read.scanHeight": {
        type: "integer",
        title: "\u626B\u63CF\u6E05\u6670\u5EA6",
        minimum: 120,
        maximum: 2160,
        description: "\u62BD\u5E27\u7528\u7684\u4E0B\u8F7D\u6863\u4F4D\u3002480 \u8DB3\u591F\u51FA\u5206\u955C\uFF0C\u8C03\u9AD8\u53EA\u4F1A\u8BA9\u4E0B\u8F7D\u53D8\u6162\u3002",
        "x-hot": true
      },
      "worlds.bili-watch.read.zoomHeight": {
        type: "integer",
        title: "\u653E\u5927\u91CD\u770B\u6E05\u6670\u5EA6",
        minimum: 120,
        maximum: 2160,
        description: "video_zoom \u56DE\u8BFB\u539F\u59CB\u6D41\u7684\u6863\u4F4D\uFF0C\u4E0D\u843D\u76D8\u3002",
        "x-hot": true
      },
      "worlds.bili-watch.read.zoomFromStream": {
        type: "boolean",
        title: "\u653E\u5927\u65F6\u56DE\u539F\u59CB\u6D41\u53D6\u9AD8\u6E05\u5E27",
        description: "\u6253\u5F00\u6700\u6E05\u695A\uFF0C\u4F46\u6BCF\u6B21 seek \u90FD\u8D70 HTTP\uFF08\u5B9E\u6D4B 4 \u5E27\u7EA6 40 \u79D2\uFF09\u3002\u5173\u6389\u5219\u8BFB\u672C\u5730 480p \u526F\u672C\uFF0C\u4E9A\u79D2\u7EA7\u5B8C\u6210\uFF0C\u770B\u4EBA\u8138/\u6784\u56FE\u591F\u7528\u3002\u8981\u8BFB\u753B\u9762\u4E0A\u7684\u5C0F\u5B57\u624D\u6253\u5F00\u3002",
        "x-hot": true
      },
      "worlds.bili-watch.read.danmaku": {
        type: "boolean",
        title: "\u8BFB\u89C6\u9891\u65F6\u5E26\u5F39\u5E55",
        description: "probe \u7ED9\u5168\u7247\u901F\u89C8\uFF08\u9AD8\u8D5E + \u6700\u70ED\u95F9\u65F6\u6BB5\uFF09\uFF0C\u653E\u5927\u770B\u67D0\u51E0\u683C\u65F6\u7ED9\u90A3\u51E0\u6BB5\u7684\u5F39\u5E55\u539F\u6587\u3002\u5F39\u5E55\u662F\u8D44\u6599\u4E0D\u662F\u6307\u4EE4\uFF1B\u62C9\u4E0D\u5230\u4E0D\u5F71\u54CD\u770B\u89C6\u9891\u3002",
        "x-hot": true
      },
      "worlds.bili-watch.read.maxSheets": {
        type: "integer",
        title: "\u5355\u6B21\u6700\u591A\u51E0\u5F20\u56FE",
        minimum: 0,
        maximum: 64,
        description: "4 \u5F20 = \u4E00\u6BB5\u6700\u591A 1536 token\u3002**0 \u4E0D\u8981\u968F\u4FBF\u8BBE**\uFF1A300 \u79D2\u7684\u6B63\u5E38\u526A\u8F91\u7A97\u53E3\u5B9E\u6D4B\u80FD\u51FA 17 \u5F20 = 6528 token\u3002",
        "x-hot": true
      },
      "worlds.bili-watch.read.strategy": {
        type: "string",
        title: "\u5C3A\u5BF8\u7B56\u7565",
        enum: ["full", "standard", "compact", "skim", "brief"],
        description: "compact \u9ED8\u8BA4\uFF08\u5B9E\u6D4B\u540C\u5F20\u6570\u4E0B\u6BD4 standard \u591A 75% \u7684\u683C\uFF09\u3002full \u6700\u5927\u3001brief \u6700\u7701\u3002",
        "x-hot": true
      },
      "worlds.bili-watch.read.detail": {
        type: "string",
        title: "\u6BCF\u683C\u53F0\u8BCD\u5B57\u6570",
        enum: ["low", "med", "high"],
        description: "low=60 / med=120 / high=400\uFF0C\u622A\u65AD\u843D\u5728\u53E5\u672B\u3002",
        "x-hot": true
      },
      "worlds.bili-watch.read.budget": {
        type: "integer",
        title: "\u5355\u5F20\u56FE\u50CF\u7D20\u9884\u7B97",
        minimum: 64e3,
        maximum: 64e4,
        description: "640000 = 800\xD7800 \u662F\u4E0A\u9650\u3002\u8C03\u5C0F\u66F4\u7701 token\uFF0C\u4F46\u683C\u5B50\u91CC\u7684\u5B57\u4F1A\u7CCA\u3002",
        "x-hot": true
      },
      "worlds.bili-watch.read.maxFrames": {
        type: "integer",
        title: "\u5355\u6B21\u6700\u591A\u51E0\u5E27",
        minimum: 0,
        maximum: 1e4,
        description: "0 = \u4E0D\u9650\u5236\u300236\u201340 \u901A\u5E38\u591F\u7528\uFF1B\u8BBE\u592A\u5927\u6587\u672C\u7D22\u5F15\u4F1A\u5F88\u957F\u3002",
        "x-hot": true
      },
      "worlds.bili-watch.read.segment": {
        type: "integer",
        title: "\u957F\u7247\u9ED8\u8BA4\u7A97\u53E3\uFF08\u79D2\uFF09",
        minimum: 30,
        maximum: 3600,
        description: "\u8D85\u8FC7 8 \u5206\u949F\u3001\u53C8\u6CA1\u7ED9 from/to \u65F6\u6309\u8FD9\u4E2A\u957F\u5EA6\u5206\u6BB5\u8BFB\u3002300 \u9002\u5408\u5F71\u89C6\uFF0C120\u2013180 \u9002\u5408\u52A8\u4F5C\u7247\u3002",
        "x-hot": true
      },
      "worlds.bili-watch.media.mediaMaxMB": {
        type: "integer",
        title: "\u5A92\u4F53\u7F13\u5B58\u4E0A\u9650\uFF08MB\uFF09",
        minimum: 32,
        maximum: 8192,
        description: "\u4E0B\u8F7D\u7684\u7247\u5B50\u6309\u6700\u8FD1\u4F7F\u7528\u6DD8\u6C70\u3002",
        "x-hot": true
      },
      "worlds.bili-watch.media.maxDailyCalls": {
        type: "integer",
        title: "\u6BCF\u65E5\u51FA\u56FE\u6B21\u6570\u4E0A\u9650",
        minimum: 0,
        maximum: 500,
        description: "\u542B\u547D\u4E2D\u7F13\u5B58\u7684\u91CD\u770B\u3002\u81EA\u4E3B\u95F2\u901B\u65F6\u7684\u62A4\u680F\u3002",
        "x-hot": true
      },
      "worlds.bili-watch.media.maxDeliveredMB": {
        type: "integer",
        title: "\u7D2F\u8BA1\u56FE\u7247\u4EA4\u4ED8\u9884\u7B97\uFF08MB\uFF09",
        minimum: 0,
        maximum: 5120,
        description: "\u5230\u4E86\u5C31\u4E0D\u518D\u9644\u56FE\uFF0C\u53EA\u7ED9\u6587\u672C\u7D22\u5F15 \u2014\u2014 \u9632\u6B62\u6084\u6084\u70E7\u6389\u5927\u91CF\u56FE\u7247 token\u3002",
        "x-hot": true
      },
      "worlds.bili-watch.media.maxCacheMB": {
        type: "integer",
        title: "\u626B\u63CF\u7F13\u5B58\u4E0A\u9650\uFF08MB\uFF09",
        minimum: 32,
        maximum: 4096,
        description: "\u5206\u955C\u56FE\u7684\u672C\u5730\u7F13\u5B58\uFF1B\u8D85\u4E86\u6309\u6700\u8FD1\u4F7F\u7528\u6DD8\u6C70\u3002",
        "x-hot": true
      },
      "worlds.bili-watch.media.cacheDays": {
        type: "integer",
        title: "\u7F13\u5B58\u4FDD\u7559\u5929\u6570",
        minimum: 1,
        maximum: 90,
        "x-hot": true
      },
      "worlds.bili-watch.asr.mode": {
        type: "string",
        title: "\u8BED\u97F3\u8BC6\u522B\uFF08\u6CA1\u6709\u5B57\u5E55\u8F68\u65F6\uFF09",
        enum: ["auto", "sherpa", "api", "off"],
        description: 'auto \u9ED8\u8BA4\uFF1A\u672C\u673A\u6709\u684C\u5BA0\u81EA\u5E26\u8BED\u97F3\u6A21\u578B\u5C31\u76F4\u63A5\u7528\uFF0C\u6CA1\u6709\u5C31\u660E\u8BF4"\u6CA1\u6709\u53F0\u8BCD"\uFF0C\u4E0D\u4F1A\u5047\u88C5\u542C\u8FC7\u97F3\u9891\u3002',
        "x-hot": true
      },
      /* -------------------------------------------------- 3. 社交发言 */
      "worlds.bili-watch.monitor.enabled": {
        type: "boolean",
        title: "\u76D1\u542C\u901A\u77E5\uFF08\u522B\u4EBA\u56DE\u590D/ @ \u4F60\uFF09",
        description: "**\u8FD9\u662F\u793E\u4EA4\u611F\u7684\u6765\u6E90**\u3002\u5173\u6389\u540E\u6709\u4EBA\u56DE\u590D\u4F60\u4E5F\u4E0D\u4F1A\u77E5\u9053\u3002",
        "x-hot": true
      },
      "worlds.bili-watch.monitor.intervalSec": {
        type: "integer",
        title: "\u68C0\u67E5\u95F4\u9694\uFF08\u79D2\uFF09",
        minimum: 30,
        maximum: 3600,
        "x-hot": true
      },
      "worlds.bili-watch.posting.enabled": {
        type: "boolean",
        title: "\u5141\u8BB8\u53D1\u8BC4\u8BBA",
        description: "\u603B\u5F00\u5173\u3002\u5173\u6389\u540E\u6240\u6709\u53D1\u9001\u90FD\u88AB\u62D2\u7EDD\uFF08prepare \u4ECD\u7136\u53EF\u7528\uFF09\u3002",
        "x-hot": true
      },
      "worlds.bili-watch.posting.transport": {
        type: "string",
        title: "\u53D1\u8BC4\u65B9\u5F0F",
        enum: ["api", "browser"],
        description: "api = \u8D70\u63A5\u53E3\uFF08\u4E0D\u7528\u5F00\u6D4F\u89C8\u5668\uFF0C\u6700\u7701\u4E8B\uFF09\uFF1Bbrowser = \u7528\u771F\u5B9E Chrome/Edge \u70B9\u8BC4\u8BBA\u6846\uFF08\u66F4\u63A5\u8FD1\u771F\u4EBA\uFF0C\u4F46\u8981\u88C5\u6D4F\u89C8\u5668\uFF0C\u4E14\u4E3B\u52A8 @ \u53EA\u80FD\u7528 api\uFF09\u3002",
        "x-hot": true
      },
      "worlds.bili-watch.posting.maxDailyReplies": {
        type: "integer",
        title: "\u6BCF\u65E5\u6700\u591A\u56DE\u51E0\u6761\u901A\u77E5",
        minimum: 0,
        maximum: 300,
        description: "**\u548C\u4E3B\u52A8\u53D1\u8A00\u5206\u5F00\u7B97**\u3002\u666E\u901A\u6E20\u9053\u540C\u4E00\u4EBA\u6BCF\u5929\u6700\u591A 5 \u6761\uFF0C\u8DE8\u89C6\u9891\u7D2F\u8BA1\u3001\u91CD\u542F\u4E0D\u91CD\u7F6E\u3002",
        "x-hot": true
      },
      "worlds.bili-watch.posting.maxDailyComments": {
        type: "integer",
        title: "\u6BCF\u65E5\u6700\u591A\u4E3B\u52A8\u53D1\u8A00",
        minimum: 0,
        maximum: 300,
        description: "\u95F2\u901B\u65F6\u7684\u4E3B\u52A8\u8BC4\u8BBA\u989D\u5EA6\uFF0C\u4E0D\u5360\u901A\u77E5\u56DE\u590D\u3002",
        "x-hot": true
      },
      "worlds.bili-watch.posting.minIntervalSec": {
        type: "integer",
        title: "\u4E24\u6761\u8BC4\u8BBA\u6700\u5C0F\u95F4\u9694\uFF08\u79D2\uFF09",
        minimum: 10,
        maximum: 3600,
        "x-hot": true
      },
      /* -------------------------------------------------- 4. 闲逛 */
      "worlds.bili-watch.roaming.enabled": {
        type: "boolean",
        title: "\u5F00\u542F\u95F2\u901B\uFF08\u9C7C\u81EA\u5DF1\u53BB\u770B\uFF09",
        description: "**\u9ED8\u8BA4\u5173**\u3002\u5173\u7740\u7684\u65F6\u5019\u9C7C\u4E0D\u4F1A\u81EA\u5DF1\u53BB\u770B B \u7AD9\uFF0C\u6BCF\u6B21\u90FD\u8981\u4E3B\u4EBA\u558A\u4E00\u53E5\u3002\u6253\u5F00\u540E\uFF1A\u4E3B\u4F1A\u8BDD\u7A7A\u95F2\u591F\u4E45 \u2192 \u7ED9\u4E00\u4E2A\u673A\u4F1A \u2192 \u5B83\u81EA\u5DF1\u51B3\u5B9A\u901B\u4E0D\u901B\u3001\u8BF4\u4EC0\u4E48\u3002",
        "x-hot": true
      },
      "worlds.bili-watch.roaming.mode": {
        type: "string",
        title: "\u95F2\u901B\u6A21\u5F0F",
        enum: ["bounded", "free"],
        description: "bounded = \u6709\u8F6E\u6B21\u4E0A\u9650\u4E14\u4F1A\u8D85\u65F6\uFF1Bfree = \u53EA\u7B49\u7A7A\u95F2\uFF0C\u4E0D\u9650\u8F6E\u6B21\u4E5F\u4E0D\u8D85\u65F6\u3002",
        "x-hot": true
      },
      "worlds.bili-watch.roaming.maxDailySessions": {
        type: "integer",
        title: "\u6BCF\u65E5\u6700\u591A\u51E0\u8F6E",
        minimum: 1,
        maximum: 100,
        "x-hot": true
      },
      "worlds.bili-watch.roaming.idleMinutes": {
        type: "integer",
        title: "\u7A7A\u95F2\u591A\u5C11\u5206\u949F\u540E\u7ED9\u673A\u4F1A",
        minimum: 1,
        maximum: 720,
        description: "\u4E3B\u4F1A\u8BDD\u8FDE\u7EED\u8FD9\u4E48\u957F\u65F6\u95F4\u6CA1\u5728\u5FD9\uFF0C\u624D\u8003\u8651\u7ED9\u95F2\u901B\u673A\u4F1A\u3002",
        "x-hot": true
      },
      "worlds.bili-watch.roaming.minIntervalMinutes": {
        type: "integer",
        title: "\u4E24\u8F6E\u4E4B\u95F4\u81F3\u5C11\u9694\u51E0\u5206\u949F",
        minimum: 1,
        maximum: 1440,
        "x-hot": true
      },
      "worlds.bili-watch.roaming.maxVideosPerSession": {
        type: "integer",
        title: "\u6BCF\u8F6E\u6700\u591A\u770B\u51E0\u4E2A\u89C6\u9891",
        minimum: 1,
        maximum: 30,
        "x-hot": true
      },
      "worlds.bili-watch.roaming.maxCommentsPerVideo": {
        type: "integer",
        title: "\u6BCF\u4E2A\u89C6\u9891\u6700\u591A\u8BFB\u51E0\u6761\u8BC4\u8BBA",
        minimum: 1,
        maximum: 200,
        description: "\u697C\u4E2D\u697C\u4E5F\u8BA1\u5165\u3002",
        "x-hot": true
      },
      "worlds.bili-watch.roaming.maxCommentsPerSession": {
        type: "integer",
        title: "\u6BCF\u8F6E\u6700\u591A\u4E3B\u52A8\u53D1\u8A00\u51E0\u6761",
        minimum: 0,
        maximum: 30,
        description: "\u4E3B\u52A8\u63A5\u697C\u4E0E\u72EC\u7ACB\u8BC4\u8BBA\u5171\u7528\u8FD9\u4E2A\u989D\u5EA6\u3002",
        "x-hot": true
      },
      "worlds.bili-watch.roaming.maxDailyComments": {
        type: "integer",
        title: "\u6BCF\u65E5\u6700\u591A\u4E3B\u52A8\u53D1\u8A00\uFF08\u95F2\u901B\uFF09",
        minimum: 0,
        maximum: 300,
        "x-hot": true
      },
      "worlds.bili-watch.roaming.maxSessionMinutes": {
        type: "integer",
        title: "\u4E00\u8F6E\u6700\u957F\u591A\u5C11\u5206\u949F",
        minimum: 5,
        maximum: 240,
        description: "\u8D85\u65F6\u81EA\u52A8\u7ED3\u675F\u3002free \u6A21\u5F0F\u5FFD\u7565\u8FD9\u4E00\u9879\u3002",
        "x-hot": true
      },
      /* -------------------------------------------------- 5. 特别关注 */
      "worlds.bili-watch.focus.enabled": {
        type: "boolean",
        title: "\u7279\u522B\u5173\u6CE8\u67D0\u4E2A UP \u4E3B",
        description: "\u5F00\u542F\u540E\u4F1A\u5B9A\u65F6\u770B\u8FD9\u4E2A\u4EBA\u7684\u65B0\u6295\u7A3F\uFF0C\u5E76\u628A\u65B0\u4F5C\u54C1/\u4E3B\u4EBA\u8BC4\u8BBA\u533A\u7684\u65B0\u8BC4\u8BBA\u53D8\u6210\u5F85\u529E\u3002",
        "x-hot": true
      },
      "worlds.bili-watch.focus.account": {
        type: "string",
        title: "\u5173\u6CE8\u7684 UID\uFF08\u6216\u4E3B\u9875\u94FE\u63A5\uFF0F\u6635\u79F0\uFF09",
        description: "**\u53EA\u80FD\u5728\u8FD9\u91CC\u586B**\uFF0C\u5DE5\u5177\u6539\u4E0D\u4E86\u7ED1\u5B9A\uFF08\u9632\u6B62\u6A21\u578B\u81EA\u5DF1\u6362\u5173\u6CE8\u5BF9\u8C61\uFF09\u3002\u586B\u7EAF UID \u6700\u7A33\uFF1B\u586B\u6635\u79F0\u8981\u9760\u6536\u5230\u8FC7\u8FD9\u4E2A\u4EBA\u7684\u901A\u77E5\u624D\u80FD\u53CD\u67E5\uFF0C\u53CD\u67E5\u4E0D\u5230\u5C31\u7ED1\u5B9A\u5931\u8D25\u3002",
        "x-hot": true
      },
      "worlds.bili-watch.focus.intervalMinutes": {
        type: "integer",
        title: "\u591A\u4E45\u68C0\u67E5\u4E00\u6B21\u65B0\u4F5C\u54C1\uFF08\u5206\u949F\uFF09",
        minimum: 10,
        maximum: 1440,
        description: "\u53EA\u5728\u4E3B\u4F1A\u8BDD\u7A7A\u95F2\u3001\u4E14\u6CA1\u6709\u5F85\u529E\u56DE\u590D\u65F6\u624D\u68C0\u67E5\u3002",
        "x-hot": true
      },
      "worlds.bili-watch.focus.maxVideos": {
        type: "integer",
        title: "\u6BCF\u6B21\u62C9\u51E0\u6761\u6295\u7A3F",
        minimum: 1,
        maximum: 30,
        description: "\u9ED8\u8BA4 12\u3002\u62C9\u592A\u591A\u4F1A\u591A\u770B\u51E0\u9875\u8BC4\u8BBA\u533A\u3002",
        "x-hot": true
      },
      "worlds.bili-watch.focus.maxDailyActions": {
        type: "integer",
        title: "\u6BCF\u5929\u6700\u591A\u4E3A\u5173\u6CE8\u5BF9\u8C61\u884C\u52A8\u51E0\u6B21",
        minimum: 0,
        maximum: 50,
        description: "\u5355\u72EC\u4E00\u672C\u8D26\uFF0C\u4E0D\u5360\u666E\u901A\u56DE\u590D/\u4E3B\u52A8\u53D1\u8A00\u989D\u5EA6\u3002",
        "x-hot": true
      },
      "worlds.bili-watch.focus.allowMentions": {
        type: "boolean",
        title: "\u5141\u8BB8\u4E3B\u52A8 @ \u5173\u6CE8\u7684 UP \u4E3B",
        description: "\u9ED8\u8BA4\u5173\u3002\u5F00\u7740\u624D\u5141\u8BB8\u53D1\u8BC4\u65F6 @ \u5B83\uFF1B\u6BCF\u6B21 @ \u524D\u90FD\u4F1A\u91CD\u65B0\u6838\u5BF9\u7ED1\u5B9A\u4E0E\u989D\u5EA6\u3002\u6CE8\u610F\uFF1A\u4E3B\u52A8 @ \u53EA\u5728\u300C\u53D1\u8BC4\u65B9\u5F0F = api\u300D\u65F6\u53EF\u7528\u3002",
        "x-hot": true
      },
      "worlds.bili-watch.focus.maxDailyMentions": {
        type: "integer",
        title: "\u6BCF\u65E5\u6700\u591A @ \u51E0\u6B21",
        minimum: 0,
        maximum: 30,
        "x-hot": true
      },
      "worlds.bili-watch.focus.autoReplyNewComments": {
        type: "boolean",
        title: "\u81EA\u52A8\u56DE\u5E94\u4E3B\u4EBA\u4F5C\u54C1\u4E0B\u7684\u65B0\u8BC4\u8BBA",
        description: "\u5355\u72EC\u8BA1\u8D26\uFF0C\u4E0D\u5360\u666E\u901A\u989D\u5EA6\uFF0C\u4E5F\u4E0D\u8BBE\u5355\u4EBA\u6B21\u6570\u4E0A\u9650\u3002",
        "x-hot": true
      },
      "worlds.bili-watch.focus.replyExistingComments": {
        type: "boolean",
        title: "\u8FDE\u5DF2\u6709\u8BC4\u8BBA\u4E5F\u56DE\uFF08\u4E0D\u53EA\u662F\u65B0\u7684\uFF09",
        description: "\u9ED8\u8BA4\u5173\u3002\u5F00\u7740\u5BB9\u6613\u628A\u8001\u8BC4\u8BBA\u9010\u6761\u7FFB\u51FA\u6765\u56DE\uFF0C\u5EFA\u8BAE\u5148\u4E0D\u5F00\u3002",
        "x-hot": true
      },
      "worlds.bili-watch.focus.autoReplyIntervalMinutes": {
        type: "integer",
        title: "\u81EA\u52A8\u56DE\u5E94\u7684\u68C0\u67E5\u95F4\u9694\uFF08\u5206\u949F\uFF09",
        minimum: 2,
        maximum: 240,
        description: "\u5F00\u4E86\u300C\u81EA\u52A8\u56DE\u5E94\u65B0\u8BC4\u8BBA\u300D\u65F6\u7528\u8FD9\u4E2A\u95F4\u9694\uFF0C\u6BD4\u666E\u901A\u68C0\u67E5\u66F4\u52E4\u3002",
        "x-hot": true
      },
      /* -------------------------------------------------- 6. 推荐给我 */
      "worlds.bili-watch.recommend.enabled": {
        type: "boolean",
        title: "\u5141\u8BB8\u628A\u559C\u6B22\u7684\u89C6\u9891\u63A8\u8350\u7ED9\u4E3B\u4EBA",
        description: "\u9ED8\u8BA4\u5173\u3002\u5F00\u7740\u540E\uFF0C\u95F2\u901B\u673A\u4F1A\u91CC\u4F1A\u544A\u8BC9\u9C7C\u300C\u4ECA\u5929\u8FD8\u80FD\u63A8\u8350\u51E0\u6B21\u300D\u548C\u4E3B\u4EBA\u559C\u6B22\u4EC0\u4E48\uFF1B\u9C7C\u81EA\u5DF1\u51B3\u5B9A\u8981\u4E0D\u8981\u63A8\u8350\uFF0C\u5728\u8BC4\u8BBA\u533A @ \u4E3B\u4EBA\u8BF4\u4E00\u53E5\u3002\u6E05\u5355\u53EA\u662F\u53C2\u8003\uFF0C\u4E0D\u786C\u6027\u5339\u914D\u3002",
        "x-hot": true
      },
      "worlds.bili-watch.recommend.ownerUid": {
        type: "string",
        title: "\u8981 @ \u7684\u8D26\u53F7 UID",
        description: "**\u7559\u7A7A\u5C31\u590D\u7528\u4E0A\u9762\u300C\u7279\u522B\u5173\u6CE8\u300D\u586B\u7684 UID**\uFF08\u4F60\u5DF2\u586B 456764639\uFF09\u3002\u4E5F\u53EF\u4EE5\u5355\u586B\u4E00\u4E2A\uFF1A\u5FC5\u987B\u662F\u7EAF\u6570\u5B57 UID\uFF0C\u5DE5\u5177\u6539\u4E0D\u4E86\u8FD9\u4E2A\u503C\u3002",
        "x-hot": true
      },
      "worlds.bili-watch.recommend.ownerName": {
        type: "string",
        title: "\u88AB @ \u7684\u6635\u79F0",
        description: "\u7559\u7A7A\u4F1A\u81EA\u52A8\u4ECE\u8054\u7CFB\u4EBA\u8868\u6309 UID \u53CD\u67E5\uFF08\u4F8B\u5982\u300C\u96C5\u5E2D\u300D\uFF09\u3002**B \u7AD9\u8981\u6C42\u771F\u5B9E\u6635\u79F0**\uFF0C\u586B `UID 456764639` \u8FD9\u79CD\u662F @ \u4E0D\u51FA\u6765\u7684\u3002\u53CD\u67E5\u4E0D\u5230\u5C31\u586B\u8FD9\u91CC\u3002",
        "x-hot": true
      },
      "worlds.bili-watch.recommend.likedList": {
        type: "string",
        title: "\u4E3B\u4EBA\u559C\u6B22\u4EC0\u4E48\uFF08\u6E05\u5355\uFF09",
        description: "\u6BCF\u884C\u4E00\u6761\uFF1A\u89C6\u9891 BV \u53F7\u3001UP \u4E3B\u6635\u79F0\u3001\u5173\u952E\u8BCD\u90FD\u884C\uFF0C\u968F\u4FBF\u5199\u3002**\u53EA\u4F5C\u4E3A\u7ED9\u9C7C\u7684\u53C2\u8003**\uFF0C\u4E0D\u662F\u8FC7\u6EE4\u5668 \u2014\u2014 \u5B83\u5B8C\u5168\u53EF\u4EE5\u63A8\u8350\u6E05\u5355\u5916\u7684\u4E1C\u897F\u3002\u8FD9\u6BB5\u4F1A\u539F\u6837\u51FA\u73B0\u5728\u95F2\u901B\u673A\u4F1A\u91CC\uFF0C\u522B\u5199\u79C1\u5BC6\u5185\u5BB9\uFF08\u4F1A\u8FDB\u6A21\u578B\u4E0A\u4E0B\u6587\uFF09\u3002",
        "x-multiline": true,
        "x-hot": true
      },
      "worlds.bili-watch.recommend.maxDaily": {
        type: "integer",
        title: "\u6BCF\u5929\u6700\u591A\u63A8\u8350\u51E0\u6B21",
        minimum: 0,
        maximum: 30,
        description: "\u5355\u72EC\u4E00\u672C\u8D26\uFF0C\u4E0D\u5360\u666E\u901A\u56DE\u590D/\u4E3B\u52A8\u53D1\u8A00\u989D\u5EA6\uFF0C\u4E5F\u4E0D\u5360\u300C@ \u7279\u522B\u5173\u6CE8\u300D\u7684\u989D\u5EA6\u3002\u8BBE\u4E3A 0 \u7B49\u4E8E\u5173\u3002",
        "x-hot": true
      },
      /* -------------------------------------------------- 7. 私信 */
      "worlds.bili-watch.dm.enabled": {
        type: "boolean",
        title: "\u542F\u7528 B \u7AD9\u79C1\u4FE1\uFF08\u6536 + \u56DE\uFF09",
        description: "\u5F00\u7740\u624D\u8F6E\u8BE2\u65B0\u79C1\u4FE1\u5E76\u63A8\u7ED9\u9C7C\uFF083 \u5206\u949F\u4E00\u6B21\uFF09\uFF0C\u5DE5\u5177\u4E5F\u80FD\u53D1\u3002\u79C1\u4FE1\u662F\u79C1\u804A\uFF1A\u7CFB\u7EDF\u901A\u77E5\u6C38\u8FDC\u4E0D\u56DE\uFF0C\u4E5F\u6CA1\u6709\u516C\u5F00\u8BC4\u8BBA\u90A3\u5957\u95F4\u9694\uFF0C\u4F46\u6709\u4E0B\u9762\u7684\u6BCF\u65E5\u4E0A\u9650\u3002",
        "x-hot": true
      },
      "worlds.bili-watch.dm.maxDailySends": {
        type: "integer",
        title: "\u6BCF\u5929\u6700\u591A\u53D1\u51E0\u6761\u79C1\u4FE1",
        minimum: 0,
        maximum: 200,
        description: "\u5168\u90E8\u4F1A\u8BDD\u5408\u8BA1\u3002\u8BBE 0 \u7B49\u4E8E\u53EA\u8BFB\u4E0D\u53D1\u3002",
        "x-hot": true
      },
      "worlds.bili-watch.dm.maxPerPerson": {
        type: "integer",
        title: "\u540C\u4E00\u4E2A\u4EBA\u6BCF\u5929\u6700\u591A\u56DE\u51E0\u6761",
        minimum: 1,
        maximum: 50,
        description: "\u9632\u6B62\u8FFD\u7740\u964C\u751F\u4EBA\u5237\u5C4F\uFF1B\u5230\u4E0A\u9650\u5C31\u7B49\u5BF9\u65B9\u5148\u8BF4\u8BDD\u3002",
        "x-hot": true
      },
      "worlds.bili-watch.dm.trustedUids": {
        type: "string",
        title: "\u81EA\u5DF1\u4EBA\u540D\u5355\uFF08\u4E0D\u53D7\u4E0A\u9650\uFF09",
        description: "UID \u5217\u8868\uFF0C\u9017\u53F7\u6216\u7A7A\u683C\u5206\u9694\u3002\u540D\u5355\u91CC\u7684\u4EBA\u53D1\u79C1\u4FE1**\u4E0D\u53D7\u6BCF\u65E5\u4E0A\u9650\u7EA6\u675F**\u2014\u2014\u62A4\u680F\u662F\u9632\u9A9A\u6270\u964C\u751F\u4EBA\u7684\uFF0C\u4E0D\u8BE5\u62E6\u4E3B\u4EBA\u3002**\u7559\u7A7A = \u590D\u7528\u300C\u7279\u522B\u5173\u6CE8\u300D\u7ED1\u5B9A\u7684 UID**\uFF08\u4E3B\u4EBA\u5DF2\u5728\u90A3\u8FB9\u7ED1\u8FC7\u5C31\u4E0D\u7528\u586B\uFF09\u3002",
        "x-hot": true
      },
      /* -------------------------------------------------- 8. 陪看 */
      "worlds.bili-watch.watch.enabled": {
        type: "boolean",
        title: "\u542F\u7528\u966A\u770B\uFF08\u4E00\u8D77\u770B\uFF09",
        description: "\u4E3B\u4EBA\u8BF4\u300C\u966A\u6211\u770Bxxx\u300D\u65F6\u5F00\u4E00\u4E2A\u770B\u5F97\u89C1\u7684\u6D4F\u89C8\u5668\u7A97\u53E3\uFF0C\u9C7C\u901A\u8FC7\u89C2\u5BDF\u5E27\u770B\u540C\u4E00\u4E2A\u753B\u9762\u3002**\u9C7C\u4E0D\u4F1A\u81EA\u4E3B\u5F00\u7A97**\u2014\u2014\u8FD9\u662F\u966A\u4F34\u573A\u666F\uFF0C\u7531\u4E3B\u4EBA\u53D1\u8D77\u3002",
        "x-hot": true
      },
      "worlds.bili-watch.watch.executable": {
        type: "string",
        title: "\u966A\u770B\u6D4F\u89C8\u5668\u8DEF\u5F84",
        description: "\u7559\u7A7A\u81EA\u52A8\u627E Chrome/Edge\u3002\u7528\u72EC\u7ACB\u914D\u7F6E\u76EE\u5F55\uFF0C\u4E0D\u4F1A\u78B0\u4F60\u81EA\u5DF1\u7684\u6D4F\u89C8\u5668\u3002"
      },
      "worlds.bili-watch.watch.observeIntervalSec": {
        type: "integer",
        title: "\u89C2\u5BDF\u5E27\u95F4\u9694\uFF08\u79D2\uFF09",
        minimum: 2,
        maximum: 300,
        description: "\u6BCF\u5F20\u62FC\u56FE\u7EA6 400\u2013550 token\u300230 \u79D2 \u2248 \u6BCF\u5C0F\u65F6 5 \u4E07 token\uFF1B\u60F3\u7701\u5C31\u8C03\u5927\u3002",
        "x-hot": true
      },
      "worlds.bili-watch.watch.maxFrames": {
        type: "integer",
        title: "\u62FC\u56FE\u683C\u6570\u4E0A\u9650",
        minimum: 1,
        maximum: 9,
        "x-hot": true
      },
      "worlds.bili-watch.watch.cellWidth": {
        type: "integer",
        title: "\u5355\u683C\u5BBD\uFF08px\uFF09",
        minimum: 160,
        maximum: 1280
      },
      "worlds.bili-watch.watch.cellHeight": {
        type: "integer",
        title: "\u5355\u683C\u9AD8\uFF08px\uFF09",
        minimum: 90,
        maximum: 720
      },
      "worlds.bili-watch.watch.maxWatchMinutes": {
        type: "integer",
        title: "\u8FDE\u7EED\u89C2\u770B\u4E0A\u9650\uFF08\u5206\u949F\uFF09",
        minimum: 0,
        maximum: 480,
        description: "\u8D85\u8FC7\u540E\u81EA\u52A8\u6682\u505C\u89C2\u5BDF\uFF08\u7A97\u53E3\u4E0D\u5173\uFF09\uFF0C\u9632\u65E0\u4EBA\u503C\u5B88\u70E7 token\u30020 = \u4E0D\u9650\u3002"
      },
      "worlds.bili-watch.watch.windowWidth": {
        type: "integer",
        title: "\u7A97\u53E3\u5BBD",
        minimum: 640,
        maximum: 3840
      },
      "worlds.bili-watch.watch.windowHeight": {
        type: "integer",
        title: "\u7A97\u53E3\u9AD8",
        minimum: 360,
        maximum: 2160
      },
      /* -------------------------------------------------- 9. 动态 */
      "worlds.bili-watch.dynamics.enabled": {
        type: "boolean",
        title: "\u542F\u7528\u52A8\u6001\uFF08\u8BFB + \u53D1\uFF09",
        description: "\u5173\u7740\u7684\u65F6\u5019 bili_dynamic \u4F1A\u76F4\u63A5\u62D2\u7EDD\uFF0C\u4E0D\u8054\u7F51\u3002",
        "x-hot": true
      },
      "worlds.bili-watch.dynamics.maxDailyReads": {
        type: "integer",
        title: "\u6BCF\u65E5\u6700\u591A\u8BFB\u51E0\u6B21\u52A8\u6001",
        minimum: 0,
        maximum: 200,
        description: "\u8BFB\u52A8\u6001\u8981\u8D70\u771F\u5B9E\u6D4F\u89C8\u5668\uFF0C\u6BD4\u63A5\u53E3\u8D35\u5F97\u591A\uFF0C\u6240\u4EE5\u5355\u72EC\u9650\u91CF\u3002",
        "x-hot": true
      },
      "worlds.bili-watch.dynamics.allowPublishing": {
        type: "boolean",
        title: "\u5141\u8BB8\u53D1\u6587\u5B57\u52A8\u6001",
        description: "\u9ED8\u8BA4\u5173\u3002\u53D1\u52A8\u6001\u662F\u5185\u5BB9\u751F\u4EA7\uFF0C\u98CE\u9669\u6BD4\u8BC4\u8BBA\u9AD8\u3002",
        "x-hot": true
      },
      "worlds.bili-watch.dynamics.maxDailyPosts": {
        type: "integer",
        title: "\u6BCF\u65E5\u6700\u591A\u53D1\u51E0\u6761\u52A8\u6001",
        minimum: 0,
        maximum: 30,
        description: "\u624B\u52A8\u53D1\u7684\u548C\u81EA\u4E3B\u53D1\u7684\u5171\u7528\u8FD9\u4E2A\u4E0A\u9650\u3002",
        "x-hot": true
      },
      "worlds.bili-watch.dynamics.minIntervalSec": {
        type: "integer",
        title: "\u4E24\u6761\u52A8\u6001\u6700\u5C0F\u95F4\u9694\uFF08\u79D2\uFF09",
        minimum: 60,
        maximum: 86400,
        "x-hot": true
      },
      "worlds.bili-watch.dynamics.autonomousEnabled": {
        type: "boolean",
        title: "\u7A7A\u95F2\u65F6\u81EA\u4E3B\u53D1\u52A8\u6001",
        description: "\u9ED8\u8BA4\u5173\u3002\u5F00\u7740\u4E14 allowPublishing \u4E5F\u5F00\u7740\u624D\u751F\u6548\uFF1B\u8BF7\u786E\u4FDD\u4E3B\u4EBA\u63A5\u53D7\u5B83\u81EA\u5DF1\u53D1\u5E16\u3002",
        "x-hot": true
      },
      "worlds.bili-watch.dynamics.autoMaxDaily": {
        type: "integer",
        title: "\u81EA\u4E3B\u53D1\u52A8\u6001\u6BCF\u5929\u6700\u591A\u51E0\u6761",
        minimum: 0,
        maximum: 10,
        description: "\u4E0D\u5360\u624B\u52A8\u989D\u5EA6\u4E4B\u5916\u7684\u540D\u989D\uFF0C\u4F46\u4ECD\u53D7\u300C\u6BCF\u65E5\u6700\u591A\u53D1\u51E0\u6761\u52A8\u6001\u300D\u603B\u4E0A\u9650\u7EA6\u675F\u3002",
        "x-hot": true
      },
      "worlds.bili-watch.dynamics.autoMinIntervalMinutes": {
        type: "integer",
        title: "\u81EA\u4E3B\u53D1\u52A8\u6001\u6700\u5C0F\u95F4\u9694\uFF08\u5206\u949F\uFF09",
        minimum: 30,
        maximum: 10080,
        description: "\u9ED8\u8BA4 360\uFF086 \u5C0F\u65F6\uFF09\u3002\u522B\u8C03\u592A\u5C0F \u2014\u2014 \u90A3\u4F1A\u53D8\u6210\u5237\u5C4F\u673A\u5668\u4EBA\u3002",
        "x-hot": true
      },
      "worlds.bili-watch.dynamics.autoIdleMinutes": {
        type: "integer",
        title: "\u7A7A\u95F2\u591A\u5C11\u5206\u949F\u540E\u624D\u81EA\u4E3B\u53D1",
        minimum: 5,
        maximum: 720,
        description: "\u8FD9\u6BB5\u65F6\u95F4\u5185\u6709\u4EBA\u8BF4\u8BDD\u5C31\u4E0D\u53D1\u3002",
        "x-hot": true
      },
      "worlds.bili-watch.dynamics.autoStartHour": {
        type: "integer",
        title: "\u53EA\u5728\u51E0\u70B9\u4E4B\u540E\u53D1\uFF080-23\uFF09",
        minimum: 0,
        maximum: 23,
        description: "\u8DE8\u591C\u5199\uFF1A\u5F00\u59CB 22\u3001\u7ED3\u675F 6 \u8868\u793A 22 \u70B9\u5230\u6B21\u65E5 6 \u70B9\u3002\u8D77\u6B62\u76F8\u540C = \u5168\u5929\u3002",
        "x-hot": true
      },
      "worlds.bili-watch.dynamics.autoEndHour": {
        type: "integer",
        title: "\u53EA\u5728\u51E0\u70B9\u4E4B\u524D\u53D1\uFF080-23\uFF09",
        minimum: 0,
        maximum: 23,
        "x-hot": true
      },
      /* -------------------------------------------------- 7. 高级 */
      "worlds.bili-watch.bins.ffmpeg": {
        type: "string",
        title: "ffmpeg \u7A0B\u5E8F",
        description: "\u7559\u7A7A\u7528 PATH \u4E0A\u7684 ffmpeg\u3002",
        "x-hot": true
      },
      "worlds.bili-watch.bins.ffprobe": {
        type: "string",
        title: "ffprobe \u7A0B\u5E8F",
        description: "\u7559\u7A7A\u7528 PATH \u4E0A\u7684 ffprobe\u3002",
        "x-hot": true
      },
      "worlds.bili-watch.asr.apiUrl": {
        type: "string",
        title: "\u8BED\u97F3 API \u7AEF\u70B9",
        description: "api \u6A21\u5F0F\u7528\uFF0C\u5F62\u5982 http://127.0.0.1:8000/v1\u3002",
        "x-hot": true
      },
      "worlds.bili-watch.asr.apiKey": {
        type: "string",
        title: "\u8BED\u97F3 API \u4EE4\u724C",
        description: "\u672C\u673A\u670D\u52A1\u901A\u5E38\u4E0D\u9700\u8981\u3002",
        "x-hot": true
      },
      "worlds.bili-watch.asr.apiModel": {
        type: "string",
        title: "\u8BED\u97F3 API \u6A21\u578B\u540D",
        description: "\u9ED8\u8BA4 whisper-1\uFF1B\u517C\u5BB9 OpenAI \u534F\u8BAE\u7684\u672C\u5730\u670D\u52A1\u6309\u5B83\u81EA\u5DF1\u7684\u540D\u5B57\u586B\u3002",
        "x-hot": true
      },
      "worlds.bili-watch.asr.modelDir": {
        type: "string",
        title: "\u672C\u5730\u8BED\u97F3\u6A21\u578B\u76EE\u5F55",
        description: "\u7559\u7A7A\u81EA\u52A8\u627E\u684C\u5BA0\u81EA\u5E26\u7684\u90A3\u5957\uFF08sherpa-onnx sensevoice\uFF09\u3002",
        "x-hot": true
      },
      "worlds.bili-watch.asr.sherpaPath": {
        type: "string",
        title: "sherpa-onnx-node \u8DEF\u5F84",
        description: "\u7559\u7A7A\u6309\u5305\u540D\u89E3\u6790\u3002\u88C5\u5728\u522B\u5904\u65F6\u586B\u7EDD\u5BF9\u8DEF\u5F84\u6216\u5305\u76EE\u5F55\u3002",
        "x-hot": true
      },
      "worlds.bili-watch.asr.language": {
        type: "string",
        title: "\u8BC6\u522B\u8BED\u8A00",
        description: "\u7559\u7A7A\u6216 auto = \u81EA\u52A8\u5224\u65AD\uFF1B\u4E5F\u53EF\u4EE5\u586B zh / en / ja / ko / yue\u3002\u6307\u5B9A\u8BED\u79CD\u901A\u5E38\u66F4\u51C6\uFF08\u5C24\u5176\u4E13\u6709\u540D\u8BCD\u591A\u7684\u65F6\u5019\uFF09\u3002",
        "x-hot": true
      }
    }
  }
};

// src/config.ts
var ROAMING_PRESETS = {
  light: {
    mode: "bounded",
    maxDailySessions: 4,
    maxVideosPerSession: 2,
    maxCommentsPerVideo: 20,
    maxCommentsPerSession: 3,
    maxDailyComments: 8,
    minIntervalMinutes: 120,
    idleMinutes: 10,
    maxSessionMinutes: 30,
    maxTextChars: 8e3
  },
  balanced: {
    mode: "bounded",
    maxDailySessions: 8,
    maxVideosPerSession: 3,
    maxCommentsPerVideo: 40,
    maxCommentsPerSession: 5,
    maxDailyComments: 24,
    minIntervalMinutes: 60,
    idleMinutes: 8,
    maxSessionMinutes: 30,
    maxTextChars: 1e4
  },
  active: {
    mode: "bounded",
    maxDailySessions: 12,
    maxVideosPerSession: 5,
    maxCommentsPerVideo: 60,
    maxCommentsPerSession: 8,
    maxDailyComments: 60,
    minIntervalMinutes: 40,
    idleMinutes: 5,
    maxSessionMinutes: 30,
    maxTextChars: 12e3
  },
  free: {
    mode: "free",
    maxDailySessions: 12,
    maxVideosPerSession: 5,
    maxCommentsPerVideo: 60,
    maxCommentsPerSession: 8,
    maxDailyComments: 60,
    minIntervalMinutes: 10,
    idleMinutes: 5,
    maxSessionMinutes: 30,
    maxTextChars: 12e3
  }
};
var BILI_WATCH_SECRET = "BILI_WATCH_COOKIE";
var DEFAULT_COOKIE_SECRET = BILI_WATCH_SECRET;
var BILI_WATCH_DEFAULTS = {
  enabled: true,
  // 登录凭据存在本插件自己的 secret 里
  cookieSecret: DEFAULT_COOKIE_SECRET,
  // **默认用 balanced 档**：4 档里最接近"日常使用"的一组。
  // 注意 enabled 默认 false —— 闲逛是"鱼自己去看"，要不要让它放手去看，
  // 必须由主人明确打开。默认开会让人措手不及。
  roaming: { enabled: false, ...ROAMING_PRESETS.balanced },
  focus: {
    enabled: false,
    account: "",
    intervalMinutes: 60,
    maxDailyActions: 8,
    maxVideos: 12,
    autoReplyNewComments: false,
    replyExistingComments: false,
    autoReplyIntervalMinutes: 30,
    allowMentions: false,
    maxDailyMentions: 3
  },
  // 推荐给主人：默认关。清单只是参考，次数单独一本账。
  recommend: {
    enabled: false,
    ownerUid: "",
    ownerName: "",
    likedList: "",
    maxDaily: 3
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
    autoEndHour: 23
  },
  // 发评默认关。**transport 默认 api**：不用开浏览器，最省事。
  posting: {
    enabled: false,
    transport: "api",
    minIntervalSec: 60,
    maxDailyComments: 80,
    maxDailyReplies: 80
  },
  monitor: { enabled: true, intervalSec: 60 },
  read: {
    scanHeight: 480,
    zoomHeight: 1080,
    budget: 64e4,
    maxSheets: 4,
    maxFrames: 0,
    detail: "med",
    strategy: "compact",
    segment: 300,
    zoomFromStream: false,
    danmaku: true
  },
  dm: {
    enabled: true,
    maxDailySends: 20,
    maxPerPerson: 5,
    trustedUids: ""
  },
  watch: {
    enabled: true,
    executable: "",
    windowWidth: 1280,
    windowHeight: 720,
    observeIntervalSec: 30,
    frameDensity: 0.3,
    maxFrames: 4,
    cellWidth: 480,
    cellHeight: 270,
    maxWatchMinutes: 120
  },
  media: {
    mediaMaxMB: 300,
    maxDailyCalls: 60,
    maxDeliveredMB: 512,
    cacheDays: 7,
    maxCacheMB: 200
  },
  asr: {
    mode: "auto",
    modelDir: "",
    sherpaPath: "",
    language: "auto",
    apiUrl: "",
    apiKey: "",
    apiModel: "whisper-1"
  },
  bins: { ffmpeg: "", ffprobe: "" }
};

// src/webui/preset.ts
var PRESET_LABEL = {
  light: "\u8F7B\u91CF",
  balanced: "\u5747\u8861",
  active: "\u6D3B\u8DC3",
  free: "\u653E\u517B",
  custom: "\u81EA\u5B9A\u4E49"
};
var FREE_IGNORED = /* @__PURE__ */ new Set(["maxDailySessions", "maxVideosPerSession", "maxSessionMinutes"]);
function detectPreset(values, prefix = "worlds.bili-watch.") {
  for (const key of Object.keys(ROAMING_PRESETS)) {
    const preset = ROAMING_PRESETS[key];
    let match = true;
    for (const [k, want] of Object.entries(preset)) {
      if (key === "free" && FREE_IGNORED.has(k)) continue;
      const path = `${prefix}roaming.${k}`;
      if (!(path in values)) continue;
      const got = values[path];
      const same = typeof want === "number" ? Number(got) === want : String(got ?? "") === String(want);
      if (!same) {
        match = false;
        break;
      }
    }
    if (match) return key;
  }
  return "custom";
}

// src/webui/client.ts
var PREFIX = "worlds.bili-watch.";
var el = (tag2, text, cls) => {
  const n = document.createElement(tag2);
  if (text !== void 0 && text !== null) n.textContent = text;
  if (cls) n.className = cls;
  return n;
};
var short = (v, max = 240) => v.length > max ? `${v.slice(0, max)}\u2026` : v;
function when(value) {
  if (value === void 0) return "";
  const t = typeof value === "number" ? value : Date.parse(String(value));
  if (!Number.isFinite(t)) return String(value ?? "");
  const d = new Date(t);
  const p = (n) => String(n).padStart(2, "0");
  const sameDay = d.toDateString() === (/* @__PURE__ */ new Date()).toDateString();
  return sameDay ? `${p(d.getHours())}:${p(d.getMinutes())}` : `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
var statusLabel = (s) => s === "sent" ? "\u5DF2\u53D7\u7406" : s === "unknown" ? "\u5F85\u6838\u5B9E" : s === "sending" ? "\u63D0\u4EA4\u4E2D" : "\u672A\u53D1\u51FA";
var visLabel = (v) => v === "public" ? "\u8BBF\u5BA2\u53EF\u89C1" : v === "self-only" ? "\u4EC5\u81EA\u5DF1\u53EF\u89C1" : "\u5F85\u6838\u9A8C";
function tag(text, kind) {
  const t = el("span", text, "bw-tag");
  if (kind) t.dataset.k = kind;
  return t;
}
async function saveConfig(ctx, values) {
  const r = await ctx.invoke("save", [values]);
  return r?.message ?? "\u5DF2\u4FDD\u5B58\uFF0C\u5373\u65F6\u751F\u6548";
}
function buildLogin(ctx, onChanged) {
  const node = el("div", null, "bw-login");
  const head = el("div", null, "bw-login-head");
  const stateText = el("span", "", "bw-muted");
  head.append(el("strong", "\u767B\u5F55"), stateText);
  const qrBox = el("div", null, "bw-qr");
  const row = el("div", null, "bw-login-row");
  const msg = el("div", null, "bw-login-msg");
  const btnCheck = el("button", "\u68C0\u67E5\u767B\u5F55");
  const btnQr = el("button", "\u83B7\u53D6\u4E8C\u7EF4\u7801");
  const btnLogout = el("button", "\u9000\u51FA\u767B\u5F55");
  row.append(btnCheck, btnQr, btnLogout);
  node.append(head, qrBox, row, msg);
  let cookie = false;
  let pollTimer = null;
  const say = (text, bad = false) => {
    msg.textContent = text;
    msg.dataset.tone = bad ? "bad" : "ok";
  };
  const stop = () => {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
  };
  ctx.signal.addEventListener("abort", stop);
  const box = {
    node,
    hasCookie: () => cookie,
    lastVerified: false,
    update(state) {
      cookie = Boolean(state.login);
      box.lastVerified = Boolean(state.verified);
      node.dataset.state = !cookie ? "none" : state.verified ? "ok" : "unverified";
      stateText.textContent = !cookie ? "\u672A\u767B\u5F55 \u2014\u2014 \u53EA\u80FD\u770B\u4F4E\u6E05\u6670\u5EA6\uFF0C\u591A\u534A\u4E5F\u6CA1\u6709\u5B57\u5E55" : state.verified ? `\u5DF2\u6838\u9A8C\uFF1A${state.account ?? "\uFF08\u8D26\u53F7\u672A\u77E5\uFF09"}` : "\u6709\u51ED\u636E\uFF0C\u4F46\u8FD8\u6CA1\u6838\u9A8C\u8FC7\u8D26\u53F7\uFF08\u53EF\u80FD\u5DF2\u8FC7\u671F\uFF09";
      btnLogout.hidden = !cookie;
      if (!cookie) qrBox.textContent = "";
      node.title = state.cookieSecret ? `\u51ED\u636E\u53D8\u91CF\uFF1A${state.cookieSecret}` : "";
    },
    async check(quiet = false) {
      if (!quiet) say("\u6B63\u5728\u6838\u5BF9\u8D26\u53F7\u2026");
      try {
        const r = await ctx.invoke("check-login");
        if (r?.ok) {
          say(`\u5DF2\u767B\u5F55\uFF1A${r.account ?? ""}`);
          box.lastVerified = true;
          onChanged();
        } else {
          say(r?.error ?? "\u6838\u9A8C\u5931\u8D25", true);
        }
      } catch (error) {
        say(error.message, true);
      }
    }
  };
  btnCheck.addEventListener("click", () => {
    btnCheck.disabled = true;
    void box.check().finally(() => {
      btnCheck.disabled = false;
    });
  });
  btnQr.addEventListener("click", () => {
    btnQr.disabled = true;
    say("\u6B63\u5728\u751F\u6210\u4E8C\u7EF4\u7801\u2026");
    void ctx.invoke("qr-start").then((r) => {
      if (!r || r.error) {
        say(`\u751F\u6210\u5931\u8D25\uFF1A${r?.error ?? "\u672A\u77E5\u9519\u8BEF"}`, true);
        return;
      }
      qrBox.textContent = "";
      if (r.image) {
        const img = el("img");
        img.src = r.image;
        img.alt = "B\u7AD9\u767B\u5F55\u4E8C\u7EF4\u7801";
        img.width = 220;
        qrBox.append(img);
      } else {
        qrBox.append(el("p", "\u4E8C\u7EF4\u7801\u7EC4\u4EF6\u4E0D\u53EF\u7528\u3002", "bw-muted"));
        if (r.url) {
          const a = el("a", "\u6539\u7528\u624B\u673A\u6253\u5F00\u8FD9\u4E2A\u767B\u5F55\u94FE\u63A5");
          a.href = r.url;
          a.target = "_blank";
          a.rel = "noopener noreferrer";
          qrBox.append(a);
        }
      }
      say("\u7528\u624B\u673A B\u7AD9 App \u626B\u7801");
      stop();
      pollTimer = setInterval(() => {
        void ctx.invoke("qr-poll", [r.key]).then((p) => {
          if (!p) return;
          if (p.status === "success") {
            stop();
            qrBox.textContent = "";
            say(`\u767B\u5F55\u6210\u529F${p.account ? `\uFF1A${p.account}` : ""}`);
            onChanged();
          } else if (p.status === "scanned") {
            say("\u5DF2\u626B\u7801\uFF0C\u8BF7\u5728\u624B\u673A\u4E0A\u786E\u8BA4");
          } else if (p.status === "expired") {
            stop();
            say("\u4E8C\u7EF4\u7801\u8FC7\u671F\u4E86\uFF0C\u91CD\u65B0\u83B7\u53D6", true);
          } else if (p.status === "error") {
            stop();
            say(p.message ?? "\u767B\u5F55\u5931\u8D25", true);
          }
        });
      }, 2e3);
    }).finally(() => {
      btnQr.disabled = false;
    });
  });
  btnLogout.addEventListener("click", () => {
    void ctx.invoke("logout").then((r) => {
      say(r?.ok ? r.note ?? "\u5DF2\u9000\u51FA" : r.error ?? "\u9000\u51FA\u5931\u8D25", !r?.ok);
      onChanged();
    });
  });
  return box;
}
function mountDesk(ctx) {
  const root = ctx.root;
  root.classList.add("bw-desk");
  const overview = el("div", null, "bw-overview");
  root.append(overview);
  const banner = el("div", null, "bw-feedback");
  banner.hidden = true;
  banner.setAttribute("role", "status");
  root.append(banner);
  const loginBox = buildLogin(ctx, () => void load());
  root.append(loginBox.node);
  const toolbar = el("div", null, "bw-toolbar");
  const filters = el("div", null, "bw-filters");
  let filter = "sent";
  const filterButtons = {};
  for (const [key, label] of [
    ["pending", "\u5F85\u56DE\u5E94"],
    ["sent", "\u5DF2\u53D1\u51FA"],
    ["all", "\u5168\u90E8"]
  ]) {
    const b = el("button", label);
    b.addEventListener("click", () => {
      filter = key;
      for (const [k, x] of Object.entries(filterButtons)) {
        x.setAttribute("aria-pressed", String(k === key));
      }
      void load();
    });
    b.setAttribute("aria-pressed", String(key === filter));
    filterButtons[key] = b;
    filters.append(b);
  }
  const search = el("input");
  search.type = "search";
  search.placeholder = "\u641C\u89C6\u9891\u3001\u4F5C\u8005\u6216\u6B63\u6587";
  let searchTimer = null;
  search.addEventListener("input", () => {
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => void load(), 380);
  });
  const syncBtn = el("button", "\u7ACB\u5373\u540C\u6B65");
  syncBtn.addEventListener("click", () => {
    syncBtn.disabled = true;
    void ctx.invoke("sync").then(() => void ctx.timeout(() => void load(), 1500)).finally(() => {
      syncBtn.disabled = false;
    });
  });
  toolbar.append(filters, search, syncBtn);
  root.append(toolbar);
  const list = el("div", null, "bw-list");
  root.append(list);
  const roam = el("div", null, "bw-roam");
  root.append(roam);
  const expanded = new Set(ctx.memo.get("expanded", []) ?? []);
  function say(text, bad = false) {
    banner.textContent = text;
    banner.dataset.tone = bad ? "bad" : "ok";
    banner.hidden = false;
  }
  async function act(run, okText) {
    try {
      const r = await run();
      if (r && r.ok === false) say(String(r.error ?? "\u64CD\u4F5C\u5931\u8D25"), true);
      else say(okText);
      await load();
    } catch (error) {
      say(error.message, true);
    }
  }
  function eventNode(e, thread) {
    const wrap = el("div", null, "bw-event");
    wrap.dataset.k = e.direction;
    const meta = el("div", null, "bw-event-meta");
    const tags = el("div", null, "bw-tags");
    tags.append(tag(e.label));
    if (e.direction === "outgoing") {
      if (e.status) tags.append(tag(statusLabel(e.status), e.status === "rejected" ? "bad" : e.status === "sent" ? "good" : void 0));
      if (e.visibility) tags.append(tag(visLabel(e.visibility), e.visibility === "public" ? "good" : void 0));
    } else if (e.pending) {
      tags.append(tag("\u5F85\u56DE\u5E94", "pending"));
    }
    meta.append(tags, el("time", when(e.at)));
    wrap.append(meta);
    wrap.append(el("div", e.direction === "incoming" ? e.author || "\uFF08\u672A\u77E5\uFF09" : "\u6211", "bw-speaker"));
    if (e.quote?.text && !thread.entries.some(
      (i) => i.direction === "incoming" && i.target?.parent === e.quote?.target?.parent
    )) {
      const quote = el("blockquote", null, "bw-quote");
      quote.append(el("span", `\u56DE\u590D ${e.quote.author || "\u539F\u8BC4\u8BBA"}`, "bw-quote-author"));
      quote.append(el("div", short(e.quote.text, 300)));
      wrap.append(quote);
    }
    wrap.append(el("div", short(e.text || "\uFF08\u7A7A\uFF09", 900), "bw-body"));
    const actions = el("div", null, "bw-event-actions");
    if (e.href) {
      const go = el("a", "\u5B9A\u4F4D\u5230\u8FD9\u6761\u8BC4\u8BBA");
      go.href = e.href;
      go.target = "_blank";
      go.rel = "noopener noreferrer";
      actions.append(go);
    }
    if (e.direction === "incoming" && e.pending) {
      const done = el("button", "\u6807\u8BB0\u5DF2\u5904\u7406");
      done.addEventListener(
        "click",
        () => void act(
          () => ctx.invoke("handled", [e.id, "\u5728\u9762\u677F\u4E0A\u6807\u8BB0\u5DF2\u5904\u7406"]),
          "\u5DF2\u6807\u8BB0\u5904\u7406\uFF0C\u8FD9\u6761\u4E0D\u4F1A\u56DE\u590D\u3002"
        )
      );
      const later = el("button", "30 \u5206\u949F\u540E\u518D\u770B");
      later.addEventListener(
        "click",
        () => void act(() => ctx.invoke("defer", [e.id, 30]), "\u5DF2\u5EF6\u540E 30 \u5206\u949F\u3002")
      );
      actions.append(done, later);
    }
    if (e.direction === "outgoing" && (e.status === "unknown" || e.status === "sent")) {
      const verify = el("button", "\u6838\u9A8C\u53EF\u89C1\u6027");
      verify.addEventListener(
        "click",
        () => void act(() => ctx.invoke("verify", [e.id]), "\u5DF2\u91CD\u65B0\u6838\u9A8C\uFF08\u4E0D\u4F1A\u91CD\u53D1\uFF09\u3002")
      );
      actions.append(verify);
    }
    if (actions.childElementCount) wrap.append(actions);
    return wrap;
  }
  function cardNode(card) {
    const wrap = el("details", void 0, "bw-card");
    if (expanded.has(card.oid)) wrap.open = true;
    const sum = el("summary");
    const main = el("div", null, "bw-card-main");
    main.append(el("h4", card.title || `\u4F5C\u54C1 ${card.oid}`));
    const tags = el("div", null, "bw-tags");
    if (card.counts.pending) tags.append(tag(`\u5F85\u56DE\u5E94 ${card.counts.pending}`, "pending"));
    if (card.counts.reply) tags.append(tag(`\u6536\u5230 ${card.counts.reply}`, "reply"));
    if (card.counts.sent) tags.append(tag(`\u5DF2\u53D1\u51FA ${card.counts.sent}`, "sent"));
    main.append(tags);
    const side = el("div", null, "bw-card-side");
    side.append(el("time", when(card.lastAt)));
    if (card.counts.pending) side.append(el("span", "\u70B9\u5F00\u770B\u8FD9\u4E00\u697C", "bw-open-label"));
    sum.append(main, side);
    wrap.append(sum);
    const body = el("div", null, "bw-threads");
    let filled = false;
    const fill = () => {
      if (filled) return;
      filled = true;
      if (!card.threads.length) body.append(el("div", "\u8FD9\u4E00\u697C\u8FD8\u6CA1\u6709\u8BB0\u5F55\u3002", "bw-empty"));
      for (const t of card.threads) {
        const box = el("div", null, "bw-thread");
        for (const e of t.entries) box.append(eventNode(e, t));
        body.append(box);
      }
      const footer = el("div", null, "bw-card-footer");
      const href = card.url ?? (card.bvid ? `https://www.bilibili.com/video/${card.bvid}` : null);
      if (href) {
        const a = el("a", "\u6253\u5F00\u539F\u9875");
        a.href = href;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        footer.append(a);
      }
      body.append(footer);
    };
    if (wrap.open) fill();
    wrap.addEventListener("toggle", () => {
      if (wrap.open) {
        fill();
        expanded.add(card.oid);
      } else {
        expanded.delete(card.oid);
      }
      ctx.memo.set("expanded", [...expanded]);
    });
    wrap.append(body);
    return wrap;
  }
  function renderOverview(snap) {
    overview.textContent = "";
    const items = [
      ["\u5F85\u56DE\u5E94", String(snap.usage.pending), snap.usage.pending > 0],
      ["\u4ECA\u65E5\u56DE\u590D", `${snap.usage.repliesToday}/${snap.usage.repliesLimit}`, false],
      ["\u4ECA\u65E5\u4E3B\u52A8", `${snap.usage.proactiveToday}/${snap.usage.proactiveLimit}`, false],
      ["\u4ECA\u65E5\u95F2\u901B", `${snap.usage.roamToday}/${snap.usage.roamLimit}`, false]
    ];
    for (const [k, v, warn] of items) {
      const m = el("div", null, "bw-metric");
      if (warn) m.dataset.tone = "warn";
      m.append(el("span", k), el("strong", v));
      overview.append(m);
    }
  }
  function renderRoam(snap) {
    roam.textContent = "";
    const recent = snap.roamingRecent ?? [];
    roam.append(el("h3", "\u6700\u8FD1\u95F2\u901B"));
    if (!recent.length) {
      roam.append(el("p", "\u8FD8\u6CA1\u901B\u8FC7\u3002\u5F00\u542F\u95F2\u901B\u540E\uFF0C\u4E3B\u4F1A\u8BDD\u7A7A\u95F2\u591F\u4E45\u5B83\u4F1A\u81EA\u5DF1\u53BB\u770B\u3002", "bw-muted"));
      return;
    }
    for (const r of recent) {
      const status = r.status === "finished" ? "\u901B\u5B8C" : r.status === "skipped" ? "\u8DF3\u8FC7" : r.status === "expired" ? "\u8D85\u65F6" : "\u8FDB\u884C\u4E2D";
      const row = el("div", null, "bw-roam-row");
      row.append(
        el("time", when(r.at)),
        el(
          "span",
          `${status}${r.summary ? ` \xB7 ${short(r.summary, 160)}` : ""}${r.videos.length ? ` \xB7 \u8BFB\u4E86 ${r.videos.join("\u3001")}` : ""}`
        )
      );
      roam.append(row);
    }
  }
  async function load() {
    let snap;
    try {
      snap = await ctx.invoke("timeline", [
        { filter, query: search.value, limit: 60 }
      ]);
    } catch (error) {
      list.textContent = "";
      list.append(el("div", `\u8BFB\u53D6\u5931\u8D25\uFF1A${error.message}`, "bw-empty"));
      return;
    }
    renderOverview(snap);
    loginBox.update(snap.state);
    if (snap.state.lastError) {
      banner.textContent = `\u540C\u6B65\u6709\u95EE\u9898\uFF1A${short(snap.state.lastError, 200)}`;
      banner.dataset.tone = "bad";
      banner.hidden = false;
    }
    list.textContent = "";
    if (!snap.cards.length) {
      list.append(
        el(
          "div",
          filter === "pending" ? "\u6CA1\u6709\u5F85\u56DE\u5E94\u7684\u6D88\u606F\u3002\u6709\u4EBA\u56DE\u590D\u4F60\u3001@ \u4F60\uFF0C\u6216\u7279\u522B\u5173\u6CE8\u53D1\u4E86\u65B0\u4F5C\u54C1\uFF0C\u4F1A\u51FA\u73B0\u5728\u8FD9\u91CC\u3002" : search.value ? `\u6CA1\u6709\u5339\u914D\u300C${search.value}\u300D\u7684\u8BB0\u5F55\u3002` : "\u8FD8\u6CA1\u6709\u4EFB\u4F55\u4E92\u52A8\u8BB0\u5F55\u3002",
          "bw-empty"
        )
      );
    } else {
      for (const c of snap.cards) list.append(cardNode(c));
    }
    renderRoam(snap);
  }
  void load();
  ctx.interval(() => void load(), 15e3);
  ctx.interval(() => {
    if (loginBox.hasCookie() && !loginBox.lastVerified) void loginBox.check(true);
  }, 6e4);
}
function sectionOf(path) {
  const key = path.slice(PREFIX.length);
  if (key === "enabled" || key === "cookieSecret") return "login";
  if (key.startsWith("read.") || key.startsWith("media.") || key.startsWith("asr.")) return "read";
  if (key.startsWith("monitor.") || key.startsWith("posting.")) return "social";
  if (key.startsWith("roaming.")) return "roam";
  if (key.startsWith("focus.")) return "focus";
  if (key.startsWith("recommend.")) return "recommend";
  if (key.startsWith("dm.")) return "dm";
  if (key.startsWith("watch.")) return "watch";
  if (key.startsWith("dynamics.")) return "dynamics";
  return "advanced";
}
function mountSettings(ctx) {
  const root = ctx.root;
  root.classList.add("bw-desk", "bw-settings");
  root.append(
    el(
      "p",
      "\u4ECE\u4E0A\u5F80\u4E0B\u586B\u5C31\u80FD\u7528\uFF1A\u5148\u767B\u5F55\uFF0C\u518D\u51B3\u5B9A\u8981\u4E0D\u8981\u81EA\u5DF1\u53BB\u770B\u89C6\u9891\u3001\u8981\u4E0D\u8981\u5728\u8BC4\u8BBA\u533A\u8BF4\u8BDD\u3002\u6539\u52A8\u8981\u4FDD\u5B58\u624D\u751F\u6548\u3002",
      "bw-summary"
    )
  );
  const feedback = el("div", null, "bw-feedback");
  feedback.hidden = true;
  feedback.setAttribute("role", "status");
  root.append(feedback);
  const savebar = el("div", null, "bw-savebar");
  const dirtyNote = el("span", "\u6CA1\u6709\u672A\u4FDD\u5B58\u7684\u6539\u52A8", "bw-muted");
  const saveBtn = el("button", "\u4FDD\u5B58\u4FEE\u6539");
  const reloadBtn = el("button", "\u653E\u5F03\u6539\u52A8");
  savebar.append(saveBtn, reloadBtn, dirtyNote);
  root.append(savebar);
  const loginBox = buildLogin(ctx, () => void reload());
  root.append(loginBox.node);
  const loginFields = el("div");
  loginFields.append(
    el("p", "\u4E0B\u9762\u4E24\u9879\u63A7\u5236\u8FD9\u4E2A World \u5F00\u4E0D\u5F00\u3001\u4EE5\u53CA\u767B\u5F55\u51ED\u636E\u5B58\u5728\u54EA\u4E2A\u53D8\u91CF\u91CC\u3002", "bw-section-note")
  );
  root.append(loginFields);
  const inputs = /* @__PURE__ */ new Map();
  const dirty = /* @__PURE__ */ new Set();
  let values = {};
  const presetButtons = {};
  let customChip = null;
  let presetStatus = null;
  function syncPreset() {
    if (!presetStatus) return;
    const key = detectPreset(values, PREFIX);
    for (const [k, b] of Object.entries(presetButtons)) {
      b.setAttribute("aria-pressed", String(k === key));
    }
    customChip?.setAttribute("aria-pressed", String(key === "custom"));
    const unsaved = [...dirty].some((p) => p.startsWith(`${PREFIX}roaming.`));
    presetStatus.textContent = (key === "custom" ? "\u5F53\u524D\u6863\u4F4D\uFF1A\u81EA\u5B9A\u4E49\uFF08\u624B\u52A8\u6539\u8FC7\u53C2\u6570\uFF09" : `\u5F53\u524D\u6863\u4F4D\uFF1A${PRESET_LABEL[key]}`) + (unsaved ? " \xB7 \u6709\u672A\u4FDD\u5B58\u7684\u6539\u52A8" : "");
  }
  const sections = {};
  const defs = [
    ["read", "\u770B\u89C6\u9891", "\u6E05\u6670\u5EA6\u3001\u51FA\u56FE\u9884\u7B97\u3001\u6CA1\u6709\u5B57\u5E55\u65F6\u7684\u8BED\u97F3\u8BC6\u522B\u3002", false],
    ["social", "\u793E\u4EA4\u53D1\u8A00", "\u76D1\u542C\u901A\u77E5\u3001\u53D1\u8BC4\u5F00\u5173\uFF0C\u4EE5\u53CA\u4E24\u6761\u8BC4\u8BBA\u4E4B\u95F4\u7684\u6700\u5C0F\u95F4\u9694\u3002", false],
    ["roam", "\u95F2\u901B\uFF08\u81EA\u5DF1\u53BB\u770B\uFF09", "\u56DB\u6863\u9884\u8BBE + \u9010\u9879\u5FAE\u8C03\u3002\u5173\u7740\u7684\u65F6\u5019\u5B83\u4E0D\u4F1A\u81EA\u5DF1\u53BB\u770B\u3002", false],
    ["focus", "\u7279\u522B\u5173\u6CE8", "\u67D0\u4E2A UP \u4E3B\u7684\u65B0\u4F5C\u54C1\uFF0C\u4EE5\u53CA\u4ED6\u4F5C\u54C1\u4E0B\u503C\u5F97\u63A5\u7684\u8BC4\u8BBA\u3002", false],
    ["recommend", "\u63A8\u8350\u7ED9\u6211", "\u9C7C\u770B\u5230\u4F60\u559C\u6B22\u7684\u89C6\u9891\u65F6\u5728\u8BC4\u8BBA\u533A @ \u4F60\u3002\u6E05\u5355\u53EA\u662F\u53C2\u8003\uFF0C\u6B21\u6570\u5355\u72EC\u7B97\u3002", false],
    ["dm", "\u79C1\u4FE1", "\u6536 B \u7AD9\u79C1\u4FE1\u5E76\u56DE\u590D\u3002\u7CFB\u7EDF\u901A\u77E5\u4E0D\u56DE\uFF0C\u6BCF\u5929\u6709\u4E0A\u9650\u3002", false],
    ["watch", "\u966A\u770B", "\u4E3B\u4EBA\u53D1\u8D77\u7684\u4E00\u8D77\u770B\uFF1A\u5171\u540C\u7A97\u53E3 + \u89C2\u5BDF\u5E27\u3002\u6CE8\u610F\u6BCF\u5E27\u7684 token \u5F00\u9500\u3002", false],
    ["dynamics", "\u52A8\u6001", "\u8BFB/\u53D1\u6587\u5B57\u52A8\u6001\uFF0C\u4EE5\u53CA\u7A7A\u95F2\u65F6\u81EA\u4E3B\u53D1\u3002", false],
    ["advanced", "\u9AD8\u7EA7", "ffmpeg \u8DEF\u5F84\u3001\u8BED\u97F3\u6A21\u578B\u7EC6\u8282\u3002\u4E00\u822C\u4E0D\u7528\u52A8\u3002", false]
  ];
  function markDirty(path) {
    if (path) dirty.add(path);
    dirtyNote.textContent = dirty.size ? `${dirty.size} \u9879\u672A\u4FDD\u5B58` : "\u6CA1\u6709\u672A\u4FDD\u5B58\u7684\u6539\u52A8";
    dirtyNote.className = dirty.size ? "bw-dirty" : "bw-muted";
    saveBtn.disabled = dirty.size === 0;
  }
  function applyToInputs(patch) {
    for (const [path, v] of Object.entries(patch)) {
      const input = inputs.get(path);
      if (!input) continue;
      if (input instanceof HTMLInputElement && input.type === "checkbox") input.checked = v === true;
      else input.value = String(v ?? "");
      values[path] = v;
    }
  }
  function fieldRow(path, prop) {
    const label = el("label", void 0, "bw-field");
    const copy = el("span");
    copy.append(el("strong", prop.title));
    if (prop.description) copy.append(el("small", prop.description));
    let control;
    if (prop["x-multiline"]) {
      const area = el("textarea");
      area.rows = 5;
      control = area;
    } else if (prop.enum) {
      const select = el("select");
      for (const v of prop.enum) {
        const o = el("option", String(v));
        o.value = String(v);
        select.append(o);
      }
      control = select;
    } else {
      const input = el("input");
      input.type = prop.type === "boolean" ? "checkbox" : prop.type === "integer" ? "number" : "text";
      if (prop.minimum !== void 0) input.min = String(prop.minimum);
      if (prop.maximum !== void 0) input.max = String(prop.maximum);
      if (prop.type === "integer") input.step = "1";
      control = input;
    }
    control.setAttribute("aria-label", prop.title);
    const current = values[path];
    if (control instanceof HTMLInputElement && control.type === "checkbox") {
      control.checked = current === true;
    } else {
      control.value = current === void 0 || current === null ? "" : String(current);
    }
    control.addEventListener(
      "input",
      () => {
        values[path] = control instanceof HTMLInputElement && control.type === "checkbox" ? control.checked : prop.type === "integer" ? Number(control.value === "" ? 0 : control.value) : control.value;
        markDirty(path);
        if (path.startsWith(`${PREFIX}roaming.`)) syncPreset();
        feedback.hidden = true;
      },
      { signal: ctx.signal }
    );
    inputs.set(path, control);
    label.append(copy, control);
    return label;
  }
  function presets() {
    const wrap = el("div", null, "bw-presets-wrap");
    const grid = el("div", null, "bw-presets");
    for (const key of Object.keys(ROAMING_PRESETS)) {
      const preset = ROAMING_PRESETS[key];
      const b = el("button");
      b.append(
        el("strong", PRESET_LABEL[key]),
        el("small", key === "free" ? "\u9605\u8BFB\u4E0D\u9650\u8F6E\u6B21" : `${preset.maxDailySessions} \u8F6E/\u5929`),
        el("small", key === "free" ? "\u4E0D\u8D85\u65F6" : `\u95F4\u9694 ${preset.minIntervalMinutes} \u5206`)
      );
      b.addEventListener(
        "click",
        () => {
          const patch = {
            [`${PREFIX}roaming.enabled`]: true,
            [`${PREFIX}roaming.mode`]: preset.mode
          };
          for (const [k, v] of Object.entries(preset)) patch[`${PREFIX}roaming.${k}`] = v;
          applyToInputs(patch);
          for (const p of Object.keys(patch)) if (inputs.has(p)) markDirty(p);
          syncPreset();
          ctx.ui.toast(`\u300C${PRESET_LABEL[key]}\u300D\u6863\u5DF2\u586B\u5165\uFF0C\u70B9\u4FDD\u5B58\u751F\u6548`);
        },
        { signal: ctx.signal }
      );
      b.setAttribute("aria-pressed", "false");
      presetButtons[key] = b;
      grid.append(b);
    }
    const custom = el("button", void 0, "bw-preset-custom");
    custom.append(
      el("strong", "\u81EA\u5B9A\u4E49"),
      el("small", "\u624B\u52A8\u6539\u8FC7\u53C2\u6570"),
      el("small", "\u70B9\u6863\u4F4D\u53EF\u4E00\u952E\u8FD8\u539F")
    );
    custom.disabled = true;
    custom.title = "\u6539\u52A8\u4EFB\u4F55\u4E00\u9879\u53C2\u6570\u5C31\u81EA\u52A8\u53D8\u6210\u81EA\u5B9A\u4E49\uFF1B\u70B9\u5DE6\u8FB9\u4EFB\u610F\u4E00\u6863\u53EF\u4E00\u952E\u8FD8\u539F";
    custom.setAttribute("aria-pressed", "false");
    customChip = custom;
    grid.append(custom);
    wrap.append(grid);
    presetStatus = el("p", "", "bw-preset-status");
    wrap.append(presetStatus);
    wrap.append(
      el(
        "p",
        "\u653E\u517B\u6863\u8FD0\u884C\u65F6\u4F1A\u5FFD\u7565\u300C\u6BCF\u65E5\u8F6E\u6B21 / \u6BCF\u8F6E\u89C6\u9891\u6570 / \u5355\u8F6E\u65F6\u957F\u4E0A\u9650\u300D\uFF0C\u6539\u8FD9\u4E09\u9879\u4E0D\u7B97\u6539\u6863\uFF1B\u5176\u5B83\u9879\u4E00\u6539\u5C31\u53D8\u6210\u81EA\u5B9A\u4E49\u3002",
        "bw-section-note"
      )
    );
    return wrap;
  }
  for (const [id, title, note, open] of defs) {
    const box = el("details", void 0, "bw-section");
    box.dataset.section = id;
    box.open = open;
    box.append(el("summary", title));
    if (id === "roam") box.append(presets());
    box.append(el("p", note, "bw-section-note"));
    sections[id] = box;
    root.append(box);
  }
  async function reload() {
    let r;
    try {
      r = await ctx.invoke("config");
    } catch (error) {
      feedback.textContent = `\u8BFB\u914D\u7F6E\u5931\u8D25\uFF1A${error.message}`;
      feedback.dataset.tone = "bad";
      feedback.hidden = false;
      return;
    }
    values = r?.values ?? {};
    inputs.clear();
    for (const box of [...Object.values(sections), loginFields]) {
      for (const row of [...box.querySelectorAll(".bw-field")]) row.remove();
    }
    for (const [path, prop] of Object.entries(BILI_WATCH_CONFIG_GROUP.schema.properties)) {
      const id = sectionOf(path);
      const target = id === "login" ? loginFields : sections[id] ?? sections.advanced;
      target.append(fieldRow(path, prop));
    }
    dirty.clear();
    markDirty();
    syncPreset();
    if (r?.state) loginBox.update(r.state);
  }
  async function save() {
    if (!dirty.size) return;
    const patch = {};
    for (const path of dirty) {
      const prop = BILI_WATCH_CONFIG_GROUP.schema.properties[path];
      const input = inputs.get(path);
      if (!prop || !input) continue;
      if (prop.type === "boolean") {
        patch[path] = input instanceof HTMLInputElement ? input.checked : false;
      } else if (prop.type === "integer") {
        patch[path] = Number(input.value === "" ? 0 : input.value);
      } else {
        patch[path] = input.value;
      }
    }
    saveBtn.disabled = true;
    try {
      const message = await saveConfig(ctx, patch);
      feedback.textContent = message || "\u5DF2\u4FDD\u5B58\uFF0C\u5373\u65F6\u751F\u6548";
      feedback.dataset.tone = "ok";
      feedback.hidden = false;
      dirty.clear();
      markDirty();
      await reload();
    } catch (error) {
      feedback.textContent = `\u4FDD\u5B58\u5931\u8D25\uFF1A${error.message}`;
      feedback.dataset.tone = "bad";
      feedback.hidden = false;
      saveBtn.disabled = false;
    }
  }
  saveBtn.addEventListener("click", () => void save());
  reloadBtn.addEventListener("click", () => void reload());
  void reload();
}
function mountRoams(ctx) {
  const root = ctx.root;
  root.classList.add("bw-desk", "bw-roams");
  root.append(
    el(
      "p",
      "\u5B83\u81EA\u5DF1\u53BB\u770B\u89C6\u9891\u7684\u6BCF\u4E00\u8F6E\uFF1A\u4EC0\u4E48\u65F6\u5019\u901B\u7684\u3001\u770B\u4E86\u4EC0\u4E48\u3001\u8BF4\u4E86\u4EC0\u4E48\u3001\u4E3A\u4EC0\u4E48\u6536\u5C3E\u3002\u6700\u8FD1\u5728\u524D\u3002",
      "bw-summary"
    )
  );
  const info = el("p", "", "bw-summary");
  const list = el("div", null, "bw-list");
  const pager = el("div", null, "bw-pager");
  const prev = el("button", "\u4E0A\u4E00\u9875");
  const next = el("button", "\u4E0B\u4E00\u9875");
  const pageLabel = el("span", "", "bw-muted");
  pager.append(prev, pageLabel, next);
  root.append(info, list, pager);
  let page = 1;
  let total = 0;
  const pageSize = 20;
  const statusText = (s) => s === "finished" ? "\u901B\u5B8C" : s === "skipped" ? "\u8DF3\u8FC7" : s === "expired" ? "\u8D85\u65F6" : s === "active" ? "\u8FDB\u884C\u4E2D" : "\u7B49\u5B83\u63A5";
  async function load() {
    try {
      const r = await ctx.invoke("roams", [
        { page, pageSize }
      ]);
      total = r.total;
      const pages = Math.max(1, Math.ceil(total / pageSize));
      page = Math.min(page, pages);
      info.textContent = `\u5171 ${total} \u8F6E \xB7 \u6BCF\u9875 ${pageSize} \u6761`;
      pageLabel.textContent = `${page} / ${pages}`;
      prev.disabled = page <= 1;
      next.disabled = page >= pages;
      list.textContent = "";
      if (!r.items.length) {
        list.append(
          el(
            "div",
            "\u8FD8\u6CA1\u6709\u95F2\u901B\u8BB0\u5F55\u3002\u5F00\u542F\u95F2\u901B\u540E\uFF0C\u4E3B\u4F1A\u8BDD\u7A7A\u95F2\u591F\u4E45\u5B83\u4F1A\u81EA\u5DF1\u53BB\u770B\uFF0C\u6BCF\u4E00\u8F6E\u90FD\u4F1A\u8BB0\u5728\u8FD9\u91CC\u3002",
            "bw-empty"
          )
        );
        return;
      }
      for (const item of r.items) {
        const card = el("details", null, "bw-card");
        const sum = el("summary");
        const main = el("div", null, "bw-card-main");
        main.append(el("h4", `${statusText(item.status)} \xB7 ${when(item.at)}`));
        const tags = el("div", null, "bw-tags");
        tags.append(tag(`\u770B\u4E86 ${item.videos.length} \u4E2A\u89C6\u9891`));
        tags.append(tag(`\u641C\u7D22 ${item.searches} \u6B21`));
        if (item.summary) tags.append(tag("\u6709\u5FC3\u5F97"));
        main.append(tags);
        const side = el("div", null, "bw-card-side");
        side.append(el("span", "\u70B9\u5F00\u770B\u660E\u7EC6", "bw-open-label"));
        sum.append(main, side);
        card.append(sum);
        const body = el("div", null, "bw-thread");
        if (item.summary) {
          const row = el("div", null, "bw-event");
          row.append(el("div", "\u5FC3\u5F97", "bw-speaker"), el("div", item.summary, "bw-body"));
          body.append(row);
        }
        if (!item.videos.length) {
          body.append(el("div", "\u8FD9\u4E00\u8F6E\u6CA1\u8BFB\u89C6\u9891\u3002", "bw-muted"));
        }
        for (const v of item.videos) {
          const row = el("div", null, "bw-event");
          const line = el("div", null, "bw-speaker");
          if (v.url) {
            const a = el("a", `\u300A${short(v.title, 60)}\u300B`);
            a.href = v.url;
            a.target = "_blank";
            a.rel = "noopener noreferrer";
            line.append(a);
          } else {
            line.append(el("span", `\u300A${short(v.title, 60)}\u300B`));
          }
          if (v.commentsRead) line.append(tag(`\u8BC4\u8BBA ${v.commentsRead} \u6761`));
          row.append(line);
          body.append(row);
        }
        card.append(body);
        list.append(card);
      }
    } catch (error) {
      list.textContent = "";
      list.append(el("div", `\u8BFB\u53D6\u5931\u8D25\uFF1A${error.message}`, "bw-empty"));
    }
  }
  prev.addEventListener("click", () => {
    if (page > 1) {
      page -= 1;
      void load();
    }
  });
  next.addEventListener("click", () => {
    if (page * pageSize < total) {
      page += 1;
      void load();
    }
  });
  void load();
  ctx.interval(() => void load(), 6e4);
}
var client_default = {
  panels: {
    desk: { mount: mountDesk },
    settings: { mount: mountSettings },
    roams: { mount: mountRoams }
  }
};
export {
  client_default as default,
  mountDesk,
  mountRoams,
  mountSettings
};
