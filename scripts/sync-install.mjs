/**
 * scripts/sync-install.mjs — 把本包同步到桌宠的安装目录。
 *
 * **为什么需要这个脚本**：桌宠读的是 `extensions/node_modules/<包名>/`，
 * 而我们在别处开发。手动 `cp -r` 容易漏掉 `dist/`（前端产物）或 `node_modules/`（依赖）。
 *
 * ## ⚠ 那个位置通常是**符号链接**
 *
 * pnpm 会把 `node_modules/<包名>` 做成指向 `.pnpm/<包名>@<hash>/node_modules/<包名>` 的软链。
 * 直接 `rmSync` + `cpSync` 会把**软链替换成一个真实目录** ——
 * 之后 pnpm 仍认为它是链接，两边就脱节了（下次 install 可能把改动冲掉）。
 *
 * 所以这里先 `realpath` 解析到真实位置，**往真实位置写**，软链保持不动。
 *
 * 用法：
 *   node scripts/sync-install.mjs             # 用默认目标
 *   node scripts/sync-install.mjs <目标目录>
 */

import { cpSync, existsSync, lstatSync, mkdirSync, readlinkSync, realpathSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url)).replace(/[\\/]$/, '');
const target = process.argv[2]
  ?? 'D:/Coopanion/data/extensions/node_modules/cortico-world-bili-watch';

if (!existsSync(join(root, 'src', 'index.ts'))) throw new Error('这不是本包的根目录？');

/** 解析软链到真实位置，保留链接本身。 */
function resolveTarget(p) {
  try {
    if (lstatSync(p).isSymbolicLink()) {
      console.log('  （目标位置是软链，写入其真实路径）');
      return realpathSync(p);
    }
  } catch {
    /* 不存在：当普通路径处理，下面 mkdirSync 会创建 */
  }
  return p;
}

const dest = resolveTarget(target);
mkdirSync(dest, { recursive: true });

/** 逐项覆盖。**只删要覆盖的那一项**，不动目录本身。 */
function put(item, from, to) {
  if (!existsSync(from)) return false;
  rmSync(to, { recursive: true, force: true });
  cpSync(from, to, { recursive: true, dereference: true });
  console.log('  synced', item);
  return true;
}

for (const item of ['src', 'dist', 'scripts', 'package.json', 'describe.json', 'README.md', 'CHANGELOG.md', 'LICENSE']) {
  put(item, join(root, item), join(dest, item));
}

// 运行时要用的依赖。**不复制 .pnpm**，只把真身拷过来。
const nm = join(dest, 'node_modules');
mkdirSync(nm, { recursive: true });
for (const dep of ['playwright-core', 'qrcode']) {
  const from = join(root, 'node_modules', dep);
  if (!existsSync(from)) {
    console.log(`  ! 开发目录里没有 ${dep}（浏览器发评/动态会不可用）`);
    continue;
  }
  put(`node_modules/${dep}`, from, join(nm, dep));
}

// 校验关键产物，避免"同步完了但其实漏了"
const must = ['src/index.ts', 'describe.json', 'dist/webui.js'];
const missing = must.filter((f) => !existsSync(join(dest, f)));
if (missing.length) {
  console.error(`\n✗ 同步后缺少：${missing.join(', ')}`);
  process.exit(1);
}

console.log(`\n已同步到 ${dest}`);
console.log('  src ✓  dist/webui.js ✓  describe.json ✓');
