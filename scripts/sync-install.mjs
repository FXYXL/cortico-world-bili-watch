/**
 * scripts/sync-install.mjs — 把本包同步到桌宠的安装目录。
 *
 * **为什么需要这个脚本**：桌宠读的是 `extensions/node_modules/<包名>/`，
 * 而我们在这里开发。手动 `cp -r` 容易漏掉 `dist/`（前端产物）或 `node_modules/`（依赖）。
 *
 * 用法：`node scripts/sync-install.mjs [目标目录]`
 */

import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url)).replace(/[\\/]$/, '');
const target = process.argv[2]
  ?? 'D:/Coopanion/data/extensions/node_modules/cortico-world-bili-watch';

if (!existsSync(join(root, 'src', 'index.ts'))) throw new Error('这不是本包的根目录？');

mkdirSync(target, { recursive: true });

// 只同步桌宠需要的东西；.git / test / 临时文件不要
const COPY = ['src', 'dist', 'scripts', 'package.json', 'describe.json', 'README.md', 'CHANGELOG.md', 'LICENSE'];
for (const item of COPY) {
  const from = join(root, item);
  if (!existsSync(from)) continue;
  const to = join(target, item);
  rmSync(to, { recursive: true, force: true });
  cpSync(from, to, { recursive: true });
  console.log('  synced', item);
}

// node_modules 单独处理：只复制运行时要用的依赖，别把 .pnpm 整个搬过去
const deps = ['playwright-core', 'qrcode'];
const nm = join(target, 'node_modules');
mkdirSync(nm, { recursive: true });
for (const d of deps) {
  const from = join(root, 'node_modules', d);
  if (!existsSync(from)) continue;
  const to = join(nm, d);
  rmSync(to, { recursive: true, force: true });
  // 真实目录可能在 .pnpm 下（pnpm 的符号链接）；用 realpath 拿到真身
  cpSync(from, to, { recursive: true, dereference: true });
  console.log('  synced node_modules/' + d);
}

console.log(`\n已同步到 ${target}`);
