/**
 * webui/preset.ts — 闲逛档位的**派生状态**。
 *
 * ## 为什么档位不存进配置
 *
 * 档位不是一个独立设置，它只是"当前这一组参数长什么样"的标签。如果配置里
 * 再存一份 `roaming.preset`，就会出现两份事实：用户手动改了某一项、或外部直接改
 * config.json 时，标签和参数会漂移（"标着放养，其实是自定义"）。
 * 所以：**配置里只有参数，档位每次从参数反推**。零迁移、零漂移，
 * 改任意一项即时反映，保存后重载自然回显。
 *
 * ## 放养档的特殊规则
 *
 * `free` 模式下 roaming.ts 会跳过三类检查（`mode !== 'free' && ...`）：
 * 每日轮次上限、每轮视频数、单轮时长。也就是说改这几项**不会改变任何行为**，
 * 因此比对放养档时跳过它们 —— 否则用户改了个无效字段就被踢成"自定义"。
 */

import { ROAMING_PRESETS, type RoamingPreset } from '../config.ts';

export type PresetState = RoamingPreset | 'custom';

export const PRESET_LABEL: Record<PresetState, string> = {
  light: '轻量',
  balanced: '均衡',
  active: '活跃',
  free: '放养',
  custom: '自定义',
};

/** free 模式运行时忽略的字段。 */
export const FREE_IGNORED = new Set(['maxDailySessions', 'maxVideosPerSession', 'maxSessionMinutes']);

/**
 * 从扁平的配置值（`worlds.bili-watch.roaming.*`）反推当前档位。
 *
 * **只比对配置页里真实存在的字段**：`values` 来自 `configValues()`（遍历 schema.properties），
 * 所以"某个键不在 values 里"等价于"配置页没这一项、用户改不了、运行时多半也没用到"。
 * 预设里偶尔带这种历史遗留字段（`maxTextChars` 只在类型里声明过，配置页和 roaming.ts
 * 都没接），拿它比对会让**任何配置都匹配不上任何一档 → 永远显示「自定义」**。
 * 判定范围必须等于用户能改的范围。
 */
export function detectPreset(
  values: Record<string, unknown>,
  prefix = 'worlds.bili-watch.',
): PresetState {
  for (const key of Object.keys(ROAMING_PRESETS) as RoamingPreset[]) {
    const preset = ROAMING_PRESETS[key] as unknown as Record<string, unknown>;
    let match = true;
    for (const [k, want] of Object.entries(preset)) {
      if (key === 'free' && FREE_IGNORED.has(k)) continue;
      const path = `${prefix}roaming.${k}`;
      if (!(path in values)) continue;
      const got = values[path];
      const same =
        typeof want === 'number' ? Number(got) === want : String(got ?? '') === String(want);
      if (!same) {
        match = false;
        break;
      }
    }
    if (match) return key;
  }
  return 'custom';
}
