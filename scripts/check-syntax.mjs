/**
 * scripts/check-syntax.mjs — 只做**花括号/圆括号平衡**的粗检查。
 *
 * 为什么需要：这套代码里有大量正则（`/\{\\[^}]{1,40}\}/`、`/^[0-9]{1,24}$/`），
 * 朴素地数花括号会把它们当成真实括号，误报不平衡 —— 我第一次就被误报过。
 * 所以先剥离注释、字符串、正则，再数。
 *
 * 这不是编译器，只是"能不能一眼看出少了个右括号"。
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

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

if (problems.length) {
  console.log('括号不平衡：');
  for (const p of problems) console.log('  ' + p);
  process.exit(1);
}
console.log('所有源文件括号平衡。');
