/**
 * scripts/sync-install.mjs — 把本包同步到桌宠的安装目录。
 *
 * **默认 cp 复制；加 `--link` 改硬链接。**
 * 复制后两边是独立副本：改了源码**必须再跑一次**才生效（最容易踩的坑是
 * 「改了没反应」，比报错还难查）。硬链接则改一边就是改另一边 —— 开发期用这个。
 * 但**新增文件**（比如新加一个 .ts）不会被旧的硬链接自动带过去，所以
 * 每次新增文件后也要跑一次 `--link`。
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

import { cpSync, existsSync, linkSync, lstatSync, mkdirSync, readdirSync, readlinkSync, realpathSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url)).replace(/[\\/]$/, '');
// 参数里先剔掉 `--link` 这类开关，别把它当成目标路径（踩过一次：
// 直接把包链进了项目下的 `--link` 目录）。
const args = process.argv.slice(2);
const target =
  args.find((a) => !a.startsWith('--')) ??
  'D:/Coopanion/data/extensions/node_modules/cortico-world-bili-watch';

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

const useLink = process.argv.includes('--link');

/** 递归建硬链接：dev 和实装共享同一个 inode，改哪边都是改同一份。 */
function linkTree(from, to) {
  mkdirSync(to, { recursive: true });
  for (const name of readdirSync(from)) {
    const src = join(from, name);
    const dst = join(to, name);
    if (statSync(src).isDirectory()) {
      rmSync(dst, { recursive: true, force: true });
      linkTree(src, dst);
    } else {
      rmSync(dst, { force: true });
      try {
        linkSync(src, dst);
      } catch {
        cpSync(src, dst); // 跨卷等情况退回复制
      }
    }
  }
}

/** 逐项覆盖。**只删要覆盖的那一项**，不动目录本身。 */
function put(item, from, to) {
  if (!existsSync(from)) return false;
  rmSync(to, { recursive: true, force: true });
  if (useLink) {
    if (statSync(from).isDirectory()) linkTree(from, to);
    else {
      try {
        linkSync(from, to);
      } catch {
        cpSync(from, to);
      }
    }
  } else {
    cpSync(from, to, { recursive: true, dereference: true });
  }
  console.log(`  ${useLink ? 'linked' : 'synced'}`, item);
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
