/**
 * scripts/migrate-from-socialmedia.mjs — 从社交视窗搬历史记录过来。
 *
 * ## 为什么需要它
 *
 * 很多人先装了社交视窗（在那边说过几十条评论、逛过上百轮），
 * 再换成这个插件。如果记录不搬过来：
 *
 *   1. **面板上是空的** —— 主人看不到鱼之前在哪儿说过什么
 *   2. **更糟：防重凭据丢了** —— 插件以为"这条评论没发过"，
 *      可能对同一个位置再发一条。这是真实会发生的重复发言。
 *   3. 闲逛的今日计数归零 —— 一天能逛的轮次重新算，等于放宽了限制
 *
 * ## 防重是怎么接上的
 *
 * 两边的操作编号格式**天然一样**：
 *   社交视窗：`operationId = <platform>:<accountId>:<requestId>`
 *   本插件：  `operationId = bilibili:<accountId>:<requestId>`（实时拼）
 *
 * 所以只要把 `requestId` 从对方的 `operationId` 里切出来存好，
 * 之后 `operationSends()` 查到的就是同一条记录，**不会重发**。
 *
 * ## 用法
 *
 *   node scripts/migrate-from-socialmedia.mjs            # 预览（不写）
 *   node scripts/migrate-from-socialmedia.mjs --apply     # 真的写
 *
 * 数据目录默认取桌宠部署路径；用 `--from <path>` / `--to <dir>` 覆盖。
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const argOf = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const HOME = 'D:/Coopanion/data/home/companion';
const FROM = argOf('--from', join(HOME, 'data', 'socialmedia', 'state.json'));
const TO_DIR = argOf('--to', join(HOME, 'data', 'worlds', 'bili-watch', 'state'));

if (!existsSync(FROM)) {
  console.error(`找不到来源：${FROM}`);
  process.exit(1);
}

const src = JSON.parse(readFileSync(FROM, 'utf8'));

// ── 转换 ────────────────────────────────────────────────────────────

/** 去掉我这边没有的字段（platform / delivered / handling 等）。 */
const cleanInbox = (i) => ({
  id: i.id,
  accountId: i.accountId,
  authorId: i.authorId ?? '',
  author: i.author ?? '',
  text: i.text ?? '',
  target: i.target,
  occurredAt: Number(i.occurredAt) || 0,
  // **保留原状态**：对方标 handled 的就不要在本插件里重新变成待办
  status: i.status === 'handled' ? 'handled' : 'pending',
  notificationType: i.notificationType === 'mention' ? 'mention' : 'reply',
  ...(i.url ? { url: i.url } : {}),
  ...(i.retryAt ? { retryAt: i.retryAt } : {}),
});

/**
 * 从 operationId 切出 requestId。
 *
 * 形如 `bilibili:3747576750804208:reply:bilibili:3747576750804208:322903742704`
 * → 去掉前两段 → `reply:bilibili:3747576750804208:322903742704`
 *
 * 切不出来就退回 id（对方把 operationId 当 id 用过）。
 */
function requestIdOf(o) {
  const op = String(o.operationId ?? '');
  const m = /^[a-z]+:[^:]+:(.+)$/.exec(op);
  const out = m ? m[1] : String(o.id ?? '');
  if (!out || out.length > 180 || /[\r\n]/.test(out)) {
    throw new Error(`operationId 异常，无法安全迁移：${op.slice(0, 80)}`);
  }
  return out;
}

const cleanOutbox = (o) => ({
  id: o.id,
  requestId: requestIdOf(o),
  accountId: o.accountId,
  target: o.target,
  text: o.text ?? '',
  status: o.status,
  createdAt: o.createdAt ?? new Date().toISOString(),
  // 三本账靠 kind 分开：有 inboxId 的是回复，有 roamId 的是闲逛主动发言
  kind: o.inboxId ? 'reply' : 'proactive',
  ...(o.recipientId ? { recipientId: o.recipientId } : {}),
  ...(o.receiptId ? { receiptId: o.receiptId } : {}),
  ...(o.transport ? { transport: o.transport } : {}),
  ...(o.platformState !== undefined ? { platformState: o.platformState } : {}),
  ...(o.detail ? { detail: o.detail } : {}),
  ...(o.visibility ? { visibility: o.visibility } : {}),
  ...(o.roamId ? { roamId: o.roamId } : {}),
  ...(o.inboxId ? { inboxId: o.inboxId } : {}),
});

const cleanRoam = (r) => {
  const { platform, ...rest } = r;
  void platform;
  return rest;
};

const cleanVideo = (v) => ({
  id: v.id,
  aid: v.aid,
  title: v.title ?? '',
  url: v.url ?? '',
  ...(v.author ? { author: v.author } : {}),
  ...(v.observation ? { observation: v.observation } : {}),
  ...(v.updatedAt ? { updatedAt: v.updatedAt } : {}),
  ...(v.unavailable !== undefined ? { unavailable: v.unavailable } : {}),
});

// ── 统计与预览 ──────────────────────────────────────────────────────

const inbox = (src.inbox ?? []).map(cleanInbox);
const outbox = (src.outbox ?? []).map(cleanOutbox);
const roaming = (src.roaming ?? []).map(cleanRoam);
const videos = (src.videos ?? []).map(cleanVideo);
const roamCounts = src.roamCounts ?? {};
const focusBindings = (src.focusBindings ?? []).map((b) => {
  const { platform, ...rest } = b;
  void platform;
  return { ...rest, platform: 'bilibili' };
});

const byStatus = (rows) =>
  Object.entries(
    rows.reduce((acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1;
      return acc;
    }, {}),
  )
    .map(([k, v]) => `${k}=${v}`)
    .join(' ');

console.log('将从社交视窗搬这些过来：\n');
console.log(`  通知      ${String(inbox.length).padStart(4)} 条   ${byStatus(inbox)}`);
console.log(`  发送记录  ${String(outbox.length).padStart(4)} 条   ${byStatus(outbox)}`);
console.log(`  闲逛      ${String(roaming.length).padStart(4)} 轮   ${byStatus(roaming)}`);
console.log(`  视频归档  ${String(videos.length).padStart(4)} 个`);
console.log(`  评论缓存  ${String((src.comments ?? []).length).padStart(4)} 条`);
console.log(`  凭据      ${String((src.briefs ?? []).length).padStart(4)} 份`);
console.log(`  联系人    ${String((src.contacts ?? []).length).padStart(4)} 个`);
console.log(`  特别关注  ${String(focusBindings.length).padStart(4)} 条`);
console.log(`  今日计数  ${JSON.stringify(roamCounts)}`);

// 防重自检：requestId 有没有重复/空的
const ids = new Set();
let dup = 0;
for (const o of outbox) {
  if (ids.has(o.requestId)) dup += 1;
  ids.add(o.requestId);
}
console.log(`\n  防重自检：${outbox.length} 条记录 → ${ids.size} 个唯一 requestId${dup ? `（${dup} 条重复，正常）` : ''}`);

if (!APPLY) {
  console.log('\n这是预览。确认无误后加 --apply 真的写入。');
  process.exit(0);
}

// ── 写入 ────────────────────────────────────────────────────────────

mkdirSync(TO_DIR, { recursive: true });
const target = join(TO_DIR, 'state.json');

// 先备份（万一写坏了能回去）
if (existsSync(target)) {
  const backup = `${target}.bak-${Date.now()}`;
  copyFileSync(target, backup);
  console.log(`\n已备份原有 state.json → ${backup.split(/[\\/]/).pop()}`);
}

// 用本插件自己的代码来建对象：格式一定对，不靠手拼 JSON
const { SocialStore } = await import(new URL('../src/social/store.ts', import.meta.url).href);
const store = new SocialStore(TO_DIR, () => ({}));

let skipped = 0,
  added = 0;

// 通知
for (const item of inbox) {
  if (store.getInbox(item.id)) {
    skipped += 1;
    continue;
  }
  store.addInbox(item);
  added += 1;
}
// addInbox 默认写 pending；把已是 handled 的改回去
for (const item of inbox) {
  if (item.status === 'handled') store.updateInbox(item.id, { status: 'handled' });
}

// 发送记录：reserve 会写 sending，紧接着用 updateSend 改成真实状态
for (const rec of outbox) {
  if (store.getSend(rec.id)) {
    skipped += 1;
    continue;
  }
  store.reserve({
    id: rec.id,
    requestId: rec.requestId,
    accountId: rec.accountId,
    target: rec.target,
    text: rec.text,
    kind: rec.kind,
    ...(rec.recipientId ? { recipientId: rec.recipientId } : {}),
    ...(rec.inboxId ? { inboxId: rec.inboxId } : {}),
    ...(rec.roamId ? { roamId: rec.roamId } : {}),
  });
  store.updateSend(rec.id, {
    status: rec.status,
    ...(rec.receiptId ? { receiptId: rec.receiptId } : {}),
    ...(rec.detail ? { detail: rec.detail } : {}),
    ...(rec.platformState !== undefined ? { platformState: rec.platformState } : {}),
    ...(rec.visibility ? { visibility: rec.visibility } : {}),
  });
  added += 1;
}

// 闲逛记录（带当日计数）
for (const r of roaming) {
  if (store.roams().some((x) => x.id === r.id)) {
    skipped += 1;
    continue;
  }
  const day = String(r.createdAt ?? '').slice(0, 10);
  const count = roamCounts[`${day}|bilibili`];
  store.saveRoam(r, day && count ? { day, platform: 'bilibili', count } : undefined);
  added += 1;
}

// 视频 / 评论 / 特别关注
for (const v of videos) store.rememberVideo(v, v.observation);
for (const c of src.comments ?? []) store.rememberComment(c);
for (const b of focusBindings) store.saveFocusBinding(b);
for (const w of src.focusWorks ?? []) void w; // 作品表由 refresh 重建
if (src.focusWorks?.length) store.saveFocusWorks(src.focusWorks);
for (const [k, v] of Object.entries(src.focusChecks ?? {})) store.saveFocusCheck(k, v);
// 联系人不用单独搬：store 加载时会从 inbox 自动重建（rememberContact 是私有方法）
for (const b of src.briefs ?? []) {
  try {
    store.saveBrief(b);
  } catch {
    /* 过期凭据就算了 */
  }
}

/**
 * 今日计数要**单独写回**。
 *
 * `saveRoam(session, usage)` 只在传了 usage 时更新计数，而历史轮次大多没带 ——
 * 结果是「今日已逛 12 轮」变成 0，等于把每日上限重新放宽一遍。
 *
 * 取 max 而不是覆盖：运行中的插件可能已经记了几轮，不能抹掉。
 */
{
  const raw = JSON.parse(readFileSync(target, 'utf8'));
  const merged = { ...(raw.roamCounts ?? {}) };
  for (const [k, v] of Object.entries(roamCounts)) {
    merged[k] = Math.max(Number(merged[k]) || 0, Number(v) || 0);
  }
  raw.roamCounts = merged;
  writeFileSync(target, JSON.stringify(raw), 'utf8');
  const todayKey = `${new Date().toISOString().slice(0, 10)}|bilibili`;
  console.log(
    `\n  今日计数已合并：${Object.keys(merged).length} 天（今日 ${merged[todayKey] ?? 0} 轮）`,
  );
}

console.log(`\n已写入：新增 ${added} 条，跳过 ${skipped} 条（已存在）`);
console.log(`  ${target}`);
console.log('\n下一步：重启桌宠，面板上应该能看到这些历史。');
