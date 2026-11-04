/**
 * scripts/build-webui.mjs — 把 `src/webui/client.ts` 打成 `dist/webui.js`。
 *
 * ## 为什么必须打包
 *
 * 桌宠**不会**在运行时编译扩展的 TypeScript 前端。它按 `cortico.webUiClient`
 * 指向的文件直接当普通 ESM 加载，所以必须是已经编译好的 JS。
 *
 * 这个坑在 video-reader 上真实踩过：声明了 `panels` 却没有 `dist/webui.js`，
 * 页签直接报「缺少面板构建产物」——用户点进去只看到红字。
 *
 * ## 产物形态
 *
 * 输出一个 ESM 文件，`export default { panels: { desk: { mount } } }`。
 * 宿主通过 `mount(ctx)` 接管渲染，DOM 只往 `ctx.root` 里写。
 *
 * 用法：`node scripts/build-webui.mjs`（发布前会自动跑）
 */

import { mkdirSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url)).replace(/[\\/]scripts$/, '');
const require2 = createRequire(import.meta.url);

/** esbuild 可能在三个地方：本包、桌宠、全局。挨个试。 */
function findEsbuild() {
  const candidates = [
    'esbuild',
    join(root, 'node_modules', 'esbuild'),
    'D:/Coopanion/resources/app/node_modules/esbuild',
  ];
  for (const c of candidates) {
    try {
      return require2(c);
    } catch {
      /* 试下一个 */
    }
  }
  throw new Error(
    '找不到 esbuild。装一下：`npm i -D esbuild`，或者用桌宠自带的那个（通常已经在 resources/app/node_modules）。',
  );
}

const esbuild = findEsbuild();

const src = join(root, 'src', 'webui', 'client.ts');
if (!existsSync(src)) throw new Error(`找不到前端入口：${src}`);

const outDir = join(root, 'dist');
mkdirSync(outDir, { recursive: true });
const out = join(outDir, 'webui.js');

const result = await esbuild.build({
  entryPoints: [src],
  outfile: out,
  bundle: true,
  format: 'esm',
  platform: 'browser',
  // 宿主注入的框架模块不从包外解析：`cortico/*` 由宿主的解析钩子处理
  external: ['cortico/*'],
  // 面板前端只需要 type-only import，运行时不该有框架依赖 —— 真有就让它报错
  logLevel: 'warning',
  sourcemap: false,
  target: ['es2020'],
  minify: false,
});

if (result.errors?.length) {
  console.error('构建失败：');
  for (const e of result.errors) console.error('  ' + (e.text ?? e));
  process.exit(1);
}

console.log(`dist/webui.js 已生成（${(await import('node:fs')).statSync(out).size / 1024}KB）`);
