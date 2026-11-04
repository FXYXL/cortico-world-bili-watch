/**
 * scripts/export-describe.mjs — 生成 describe.json。
 *
 * 市场**只读 describe.json，不执行代码**；`check:extension` 会把它和代码里那份
 * 逐字段比对。手写两份必然漂移，所以从 `src/tools.ts` 与 `src/ENV_PROMPT.md` 生成。
 *
 * 用法（在包目录下）：
 *   node "<Coopanion>/resources/app/node_modules/tsx/dist/cli.mjs" scripts/export-describe.mjs
 *
 * 字段顺序与桌宠 `describe-export.ts` 一致：tools → events → prompts。
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { BILI_WATCH_TOOL_DECLS, EVENT_TYPES, TOOL_SUMMARY } from '../src/tools.ts';

const root = fileURLToPath(new URL('../', import.meta.url));

// 等价于 cortico/world.ts 的 describeTools()：给模型看的四个字段 + 一句 summary
const tools = BILI_WATCH_TOOL_DECLS.map(({ name, description, parameters, tags }) => ({
  name,
  description,
  parameters,
  tags,
  summary: TOOL_SUMMARY[name],
}));

// 等价于 exportFrom 里的 events 展开
const events = EVENT_TYPES.map((e) => ({
  type: e.type,
  description: e.description,
}));

// 只写 PromptDescribe 的四个字段 —— check:extension 是逐字段深比较
const prompt = {
  key: 'worlds.bili-watch.envPrompt',
  title: 'B站伴侣 · 环境说明',
  role: 'envPrompt',
  content: readFileSync(root + 'src/ENV_PROMPT.md', 'utf8'),
};

const file = { tools, events, prompts: [prompt] };
writeFileSync(root + 'describe.json', `${JSON.stringify(file, null, 2)}\n`, 'utf8');

console.log(`describe.json 已生成：${tools.length} 个工具、${events.length} 个事件、1 段环境提示词。`);
console.log('工具：' + tools.map((t) => t.name).join(', '));
