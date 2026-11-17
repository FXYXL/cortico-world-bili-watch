/**
 * scripts/check-syntax.mjs — 发布前的三道闸门：
 *
 *   1. **真解析**（esbuild）：抓字符串引号写错这类「宿主 import 就失败」的语法错。
 *   2. **未定义名字**（tsc 的 TS2304/2551/2552）：抓「解析通过但运行 ReferenceError」，
 *      比如写了 `publishReceipt(...)` 忘记 import —— 实测真机上就撞过。
 *   3. **括号计数**（本文件原本的功能）：只作参考、不阻断，模板字符串和正则会误报。
 *
 * 为什么需要：这套代码里有大量正则（`/\{\\[^}]{1,40}\}/`、`/^[0-9]{1,24}$/`），
 * 朴素地数花括号会把它们当成真实括号，误报不平衡 —— 我第一次就被误报过。
 * 所以先剥离注释、字符串、正则，再数。
 *
 * 这不是编译器，只是"能不能一眼看出少了个右括号"。
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('../src/', import.meta.url).pathname.replace(/^\//, '');

/** 把字符串、模板串、正则、注释都替换成空格（保留长度，便于定位）。 */
function stripNoise(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const c2 = src[i + 1];
    // 行注释
    if (c === '/' && c2 === '/') {
      while (i < n && src[i] !== '\n') { out += ' '; i += 1; }
      continue;
    }
    // 块注释
    if (c === '/' && c2 === '*') {
      out += '  '; i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { out += ' '; i += 1; }
      if (i < n) { out += '  '; i += 2; }
      continue;
    }
    // 字符串 / 模板串
    if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      out += ' '; i += 1;
      while (i < n) {
        if (src[i] === '\\') { out += '  '; i += 2; continue; }
        if (src[i] === quote) { out += ' '; i += 1; break; }
        out += ' '; i += 1;
      }
      continue;
    }
    // 正则：只在 "/" 前面是非值字符时当作正则起始（粗略但够用）
    if (c === '/') {
      let j = out.length - 1;
      while (j >= 0 && out[j] === ' ') j -= 1;
      const prev = j >= 0 ? out[j] : '';
      if (!/[A-Za-z0-9_$\])}]/.test(prev)) {
        out += ' '; i += 1;
        let inClass = false;
        while (i < n) {
          if (src[i] === '\\') { out += '  '; i += 2; continue; }
          if (src[i] === '[') inClass = true;
          else if (src[i] === ']') inClass = false;
          else if (src[i] === '/' && !inClass) { out += ' '; i += 1; break; }
          out += ' '; i += 1;
        }
        while (i < n && /[gimsuy]/.test(src[i])) { out += ' '; i += 1; }
        continue;
      }
    }
    out += c; i += 1;
  }
  return out;
}

const problems = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) { walk(p); continue; }
    if (!/\.(ts|js|mjs)$/.test(p)) continue;

    const raw = readFileSync(p, 'utf8');
    const clean = stripNoise(raw);

    let brace = 0, paren = 0, bracket = 0;
    for (const c of clean) {
      if (c === '{') brace += 1; else if (c === '}') brace -= 1;
      else if (c === '(') paren += 1; else if (c === ')') paren -= 1;
      else if (c === '[') bracket += 1; else if (c === ']') bracket -= 1;
    }
    if (brace !== 0 || paren !== 0 || bracket !== 0) {
      problems.push(`${p}: {}=${brace} ()=${paren} []=${bracket}`);
    }
  }
}
walk(ROOT);

// 比 src 只由 .ts 组成的目录
const EXTRA = [new URL('../scripts/', import.meta.url).pathname.replace(/^\//, '')];
for (const d of EXTRA) {
  try { walk(d); } catch { /* 目录不存在就跳过 */ }
}

/* ------------------------------------------------------------------ 真 parse
 *
 * 括号平衡抓不到"字符串里的引号写错"：实测把 `author\\'s` 写成 `author's`，
 * 单引号提前闭合，括号数依然平衡 —— 而这个文件是**宿主启动时 import 的**，
 * 一坏就是整个 World 加载失败（界面上只显示 "Transform failed … Expected ) but found s"）。
 *
 * 所以再跑一遍真实解析。用 esbuild（tsx 自带那个）：它支持 TS 全部语法
 * （含 constructor parameter property，Node 的 strip-types 不支持），`transformSync`
 * 只做解析不做类型检查，正合适。找不到 esbuild 就跳过，不阻断。
 */
const files = [];
(function collect(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) { collect(p); continue; }
    if (/\.(ts|js|mjs)$/.test(p)) files.push(p);
  }
})(ROOT);

let esbuild = null;
for (const spec of [
  'esbuild',
  'file:///D:/Coopanion/resources/app/node_modules/esbuild/lib/main.js',
]) {
  try {
    const mod = await import(spec);
    esbuild = mod.default ?? mod;
    if (typeof esbuild?.transformSync === 'function') break;
    esbuild = null;
  } catch { /* 下一个候选 */ }
}

if (!esbuild) {
  console.log('（没找到 esbuild，跳过真实解析）');
} else {
  const parseErrors = [];
  for (const f of files) {
    const raw = readFileSync(f, 'utf8');
    try {
      esbuild.transformSync(raw, { loader: f.endsWith('.js') || f.endsWith('.mjs') ? 'js' : 'ts' });
    } catch (e) {
      const err = e?.errors?.[0];
      const where = err?.location ? `:${err.location.line}:${err.location.column}` : '';
      parseErrors.push(`${f}${where}: ${err?.text ?? (e?.message ?? 'parse error')}`);
    }
  }
  if (parseErrors.length) {
    console.log('解析失败（真语法错，宿主会 import 失败）：');
    for (const p of parseErrors) console.log('  ' + p);
    process.exit(1);
  }
  console.log(`所有源文件解析通过（${files.length} 个）。`);
}

// 括号统计只作参考、不阻断：模板字符串和正则里的 {} () 会被误计
// （capture.ts / coWatch.ts 一直是误报）。真正的闸门是上面的解析与名字检查。
if (problems.length) {
  console.log('（括号计数可疑，仅供参考，通常是模板字符串/正则误报）');
  for (const p of problems) console.log('  ' + p);
}
console.log('检查完毕。');

/* ------------------------------------------------------------- 未定义名字
 *
 * 解析通过 ≠ 能跑。实测把 `publishReceipt(result, …)` 写进 world.ts 却忘了加
 * import：esbuild 解析通过、括号也平衡，宿主一调到那条就 ReferenceError
 * （她那边看到的是「publishReceipt is not defined」）。这类错只有类型检查能抓。
 *
 * 只用 tsc 的 **TS2304「找不到名字」** 这一类（含 2551/2552「你是不是想写…」），
 * 其余类型错一律忽略 —— 宿主包没有类型声明，全量检查会淹在噪音里。
 * 找不到 typescript 就跳过，不阻断发布。
 */
const TS_CANDIDATES = [
  'typescript',
  // Windows 绝对路径动态 import 必须是 file:// URL，直接给盘符会报
  // "Only URLs with a scheme in: file, data, and node are supported"
  'file:///D:/AI/tech-blog/node_modules/typescript/lib/typescript.js',
  'file:///D:/Coopanion/resources/app/node_modules/typescript/lib/typescript.js',
];

let ts = null;
for (const spec of TS_CANDIDATES) {
  try {
    const mod = await import(spec);
    ts = mod.default ?? mod;
    if (typeof ts?.createProgram === 'function') break;
    ts = null;
  } catch { /* 下一个候选 */ }
}

if (!ts) {
  console.log('（没找到 typescript，跳过「未定义名字」检查）');
} else {
  const ID_NAME_CODES = new Set([2304, 2551, 2552]);
  const program = ts.createProgram(files, {
    noEmit: true,
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    allowImportingTsExtensions: true,
    skipLibCheck: true,
    strict: false,
  });
  const nameErrors = [];
  const seen = new Set();
  // 语法错已由上面的 esbuild 报过，这里只管语义层的「找不到名字」
  for (const sf of program.getSourceFiles()) {
    if (sf.fileName.includes('node_modules')) continue;
    const diags = [
      ...program.getSemanticDiagnostics(sf),
      ...program.getDeclarationDiagnostics(sf),
    ];
    for (const d of diags) {
      if (!ID_NAME_CODES.has(d.code)) continue;
      const key = sf.fileName + ':' + d.start;
      if (seen.has(key)) continue;
      seen.add(key);
      const { line, character } = sf.getLineAndCharacterOfPosition(d.start ?? 0);
      const msg = ts.flattenDiagnosticMessageText(d.messageText, ' ');
      nameErrors.push(`${relative(ROOT, sf.fileName)}:${line + 1}:${character + 1}: ${msg}`);
    }
  }
  const bad = nameErrors;
  if (bad.length) {
    console.log('未定义的名字（解析通过但运行会 ReferenceError）：');
    for (const p of bad) console.log('  ' + p);
    process.exit(1);
  }
  console.log('所有源文件引用的名字都已定义。');
}
