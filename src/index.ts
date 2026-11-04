/**
 * index.ts — 包入口。默认导出 WorldDefinition。
 *
 * `describe.tools` 是给**市场和人**看的自描述（`describe.json` 由它导出）；
 * 实例的 `tools()` 才是真正发给模型的那份。两边指的必须是同一批工具名，
 * 否则桌宠会在扩展页把"声明了但没实现"标出来。
 */

import { describeTools, type WorldDefinition } from 'cortico/world.ts';

import { BILI_WATCH_DEFAULTS, BILI_WATCH_ID, type BiliWatchConfig } from './config.ts';
import { EVENT_TYPES, TOOL_SUMMARY, BILI_WATCH_TOOL_DECLS } from './tools.ts';
import { BiliWatchWorld } from './world.ts';

export const BILI_WATCH: WorldDefinition<BiliWatchConfig> = {
  id: BILI_WATCH_ID,
  label: 'B站伴侣',
  defaults: () => structuredClone(BILI_WATCH_DEFAULTS),
  /**
   * **故意什么都不拦**。没装 ffmpeg、没登录、没有语音模型都只是"降级"，
   * 不是"不能用" —— probe 在这些情况下都能给出有用的话。
   * 真拦下来，主人就看不到"为什么看不到视频"的那句解释了。
   */
  create: (ctx) => new BiliWatchWorld(ctx),
  describe: {
    tools: describeTools(BILI_WATCH_TOOL_DECLS, TOOL_SUMMARY),
    events: EVENT_TYPES.map((e) => ({ ...e })),
  },
};

export default BILI_WATCH;

export { BILI_WATCH_CONFIG_GROUP } from './config-group.ts';
export { BILI_WATCH_DEFAULTS, BILI_WATCH_ID } from './config.ts';
export { BILI_WATCH_TOOL_DECLS, TOOL_SUMMARY, EVENT_TYPES } from './tools.ts';
export { BiliWatchWorld } from './world.ts';
