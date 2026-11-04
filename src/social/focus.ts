/**
 * social/focus.ts — 特别关注（主人账号）的机会发现。
 *
 * ## 这个文件在 2026-11-04 之前是**死代码**
 *
 * 它原来是一段没人用的遗留代码：
 *   1. 没人 import 它（`store.ts` 只有 `import type`，type import 会被擦除）
 *   2. 它 `import { focusConfig } from '../config.ts'`、`SocialMediaConfigSection`
 *      —— 这两个在本包里**不存在**，一旦真被加载就会当场炸
 *
 * 结果就是：配置页有「特别关注」，工具 `bili_focus` 也在，但**永远没有新作品提醒、
 * 没有主人评论区机会、`focusWorks` 恒为空**。这轮重写并接进同步周期。
 *
 * ## 它做什么
 *
 * 1. 把配置里的「UID / 主页链接 / 昵称」解析成**核验过的 UID** 并落盘（绑定）
 * 2. 定时拉这位 UP 主的最新投稿 → 存作品表 + 生成一条 `focus-video` 待办
 * 3. 可选：读这些作品下的新评论，生成 `focus-comment` 待办（主人评论区自动回应）
 * 4. 所有待办都带 `focusOwnerId`，走**单独那本账**，不占普通额度
 *
 * ## 为什么绑定只能在这里做
 *
 * 工具不能改绑定 —— 否则模型可以自己换关注对象来绕过额度。
 * 只有本地配置页能改 `focus.account`。
 */

import { randomUUID } from 'node:crypto';

import type { BiliWatchConfig } from '../config.ts';
import type { CommentTarget, InboxItem, PublicComment, PublicVideo } from '../core/types.ts';
import { assessPublicInput } from './safety.ts';
import type { SocialStore } from './store.ts';

export interface Contact {
  accountId: string;
  userId: string;
  firstAt: number;
  names: string[];
}

export interface FocusBinding {
  platform?: string;
  accountId: string;
  /** 配置里填的原文（UID / 链接 / 昵称）。 */
  input: string;
  /** 核验过的 UID —— **一切以它为准**，不靠文本匹配。 */
  ownerId: string;
  name: string;
  method: 'uid' | 'first-contact';
}

export interface FocusWork {
  platform?: string;
  accountId: string;
  ownerId: string;
  video: PublicVideo;
}

export interface FocusCheck {
  autoReplySince?: number;
  autoReplySeen?: Record<string, string[]>;
  at: number;
  nextAt: number;
  cursor?: number;
  error?: string;
}

/** 数据来源（由 world 用真实 client 实现，便于单测替换）。 */
export interface FocusSource {
  creatorVideos(
    uid: string,
    limit: number,
    signal?: AbortSignal,
  ): Promise<
    Array<{
      aid: string;
      id: string;
      title: string;
      author?: string;
      url: string;
      publishedAt?: number;
      ownerId?: string;
    }>
  >;
  comments(
    target: CommentTarget,
    page: number,
    signal?: AbortSignal,
    cursor?: string,
  ): Promise<{ items: PublicComment[]; nextCursor?: string }>;
}

/**
 * 解析关注的账号。
 *
 * 认三种：纯 UID / `space.bilibili.com/<uid>` 主页 / 昵称（靠联系人表反查）。
 * **昵称不猜** —— 反查不到就是绑定失败，绝不绑一个近似的人。
 */
export function parseFocusAccount(raw: string): { uid?: string; name?: string } {
  const value = String(raw ?? '').normalize('NFKC').trim();
  if (/^[1-9]\d{0,19}$/.test(value)) return { uid: value };
  if (value.includes('://')) {
    const u = new URL(value);
    if (
      u.protocol !== 'https:' ||
      u.hostname !== 'space.bilibili.com' ||
      !/^\/[1-9]\d{0,19}\/?$/.test(u.pathname)
    ) {
      throw Error('请填写 B站 UID、space.bilibili.com 主页或昵称');
    }
    return { uid: u.pathname.replaceAll('/', '') };
  }
  if (!value || value.length > 80 || /[\r\n]/.test(value)) throw Error('主人昵称应为 1—80 字');
  return { name: value };
}

const normal = (s: string) => s.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase();

export class OwnerFocus {
  private polling = false;

  constructor(
    private readonly cfg: () => BiliWatchConfig,
    private readonly store: SocialStore,
    private readonly source: FocusSource,
    private readonly timezone = 'UTC',
    private readonly now: () => number = () => Date.now(),
  ) {}

  get settings() {
    return this.cfg().focus;
  }

  private day(iso: string): string {
    try {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: this.timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date(iso));
    } catch {
      return iso.slice(0, 10);
    }
  }

  /** 当前账号对应的绑定。**按配置原文缓存**，所以配置一改就会重新解析。 */
  binding(accountId: string): FocusBinding | undefined {
    const input = this.settings.account.trim();
    if (!input || !accountId) return;
    const old = this.store.focusBinding(accountId, input);
    if (old) return old;
    let parsed: { uid?: string; name?: string };
    try {
      parsed = parseFocusAccount(input);
    } catch {
      return;
    }
    const contact = parsed.name
      ? this.store
          .contacts()
          .filter(
            (c) => c.accountId === accountId && c.names.some((n) => normal(n) === normal(parsed.name!)),
          )
          .sort((a, b) => a.firstAt - b.firstAt || a.userId.localeCompare(b.userId))[0]
      : undefined;
    const uid = parsed.uid ?? contact?.userId;
    // 关注自己没意义，而且会让"主人评论区"变成"我自己的评论区"
    if (!uid || uid === accountId) return;
    return this.store.saveFocusBinding({
      accountId,
      input,
      ownerId: uid,
      name: contact?.names.at(-1) ?? 'UID ' + uid,
      method: parsed.uid ? 'uid' : 'first-contact',
    });
  }

  private key(accountId: string, ownerId: string): string {
    return `${accountId}:${ownerId}`;
  }

  /** 面板/工具读的状态。 */
  status(accountId: string) {
    const binding = this.binding(accountId);
    const works = binding
      ? this.store
          .focusWorks()
          .filter((w) => w.accountId === accountId && w.ownerId === binding.ownerId)
          .sort((a, b) => (b.video.publishedAt ?? 0) - (a.video.publishedAt ?? 0))
          .slice(0, this.settings.maxVideos)
      : [];
    const check = binding
      ? this.store.focusCheck(this.key(accountId, binding.ownerId))
      : undefined;
    return {
      enabled: this.settings.enabled,
      autoReplyNewComments: Boolean(this.settings.autoReplyNewComments),
      replyExistingComments: Boolean(this.settings.replyExistingComments),
      allowMentions: Boolean(this.settings.allowMentions),
      maxDailyMentions: this.settings.maxDailyMentions,
      input: this.settings.account,
      binding,
      identity: {
        state: binding
          ? 'bound'
          : !this.settings.account.trim()
            ? 'unconfigured'
            : !accountId
              ? 'awaiting-account'
              : 'unresolved',
        profileUrl: binding
          ? `https://space.bilibili.com/${encodeURIComponent(binding.ownerId)}`
          : undefined,
        notice: binding
          ? '主人账号已绑定，作品读取结果不改变身份绑定。'
          : '尚未完成主人账号绑定；昵称反查需要先收到过这个人的通知，否则请直接填 UID。',
      },
      check: check
        ? { at: check.at, nextAt: check.nextAt, cursor: check.cursor, error: check.error }
        : undefined,
      works: works.map((w) => {
        const sends = this.store
          .outbox()
          .filter((r) => r.accountId === accountId && r.target.oid === w.video.aid);
        const accepted = sends.filter((r) => r.status === 'sent');
        return {
          ...w.video,
          participation: accepted.some((r) => r.visibility?.status === 'public')
            ? 'public'
            : accepted.some((r) => r.visibility?.status === 'self-only')
              ? 'limited'
              : accepted.length
                ? 'accepted'
                : sends.some((r) => r.status === 'unknown' || r.status === 'sending')
                  ? 'unknown'
                  : this.store.hasSend('bilibili', accountId, w.video.aid)
                    ? 'accepted'
                    : 'unseen',
          comments: accepted.length,
        };
      }),
    };
  }

  /**
   * 检查一轮。
   *
   * 节流、失败退避、去重、额度都在这里，**别在 world 里重复实现一遍**。
   */
  async poll(
    account: { id: string; name: string },
    signal?: AbortSignal,
    force = false,
  ): Promise<{ added: number; error?: string }> {
    const s = this.settings;
    if (!s.enabled || !s.account.trim() || this.polling) return { added: 0 };
    const binding = this.binding(account.id);
    if (!binding) return { added: 0, error: '主人账号尚未绑定（填 UID 最稳）' };

    const key = this.key(account.id, binding.ownerId);
    let prior = this.store.focusCheck(key);
    const now = this.now();
    if (prior && prior.nextAt > now && (!force || now - prior.at < 60_000)) return { added: 0 };

    this.polling = true;
    let added = 0;
    let partialError: string | undefined;
    try {
      const budget = AbortSignal.timeout(20_000);
      const combined = signal ? AbortSignal.any([signal, budget]) : budget;

      const items = await this.source.creatorVideos(binding.ownerId, s.maxVideos, combined);
      // 配置在等待期间被改掉就别写回旧结果
      if (!this.settings.enabled || this.settings.account.trim() !== binding.input) {
        return { added: 0 };
      }

      const works: FocusWork[] = items
        .slice(0, s.maxVideos)
        .filter((v) => !v.ownerId || v.ownerId === binding.ownerId)
        .map((v) => ({
          accountId: account.id,
          ownerId: binding.ownerId,
          video: { ...v, updatedAt: new Date(now).toISOString() },
        }));
      this.store.saveFocusWorks(works);
      for (const w of works) this.store.rememberVideo({ ...w.video });

      // ── 新作品：最多一条邀请 ────────────────────────────────────────
      const fresh = works.find(
        (w) =>
          !this.store.hasSend('bilibili', account.id, w.video.aid) &&
          !this.store.getInbox(`focus:${key}:video:${w.video.aid}`),
      );
      if (fresh && this.settings.enabled) {
        const item: InboxItem = {
          id: `focus:${key}:video:${fresh.video.aid}`,
          platform: 'bilibili',
          accountId: account.id,
          authorId: binding.ownerId,
          author: fresh.video.author ?? binding.name,
          text: `特别关注的新作品：《${fresh.video.title}》。先了解作品，再决定是否真诚捧场；无需硬夸或补发。`,
          target: { oid: fresh.video.aid, type: 1, root: '0', parent: '0' },
          occurredAt: now / 1000,
          status: 'pending',
          notificationType: 'focus-video',
          focusOwnerId: binding.ownerId,
          url: fresh.video.url,
        };
        if (this.store.addInbox(item)) added += 1;
      }

      // ── 评论区机会：默认最多 2 条 ─────────────────────────────────
      const auto = Boolean(s.autoReplyNewComments);
      const limitPerScan = auto ? 3 : 2;
      const autoReplySeen = Object.fromEntries(
        Object.entries(prior?.autoReplySeen ?? {}).filter(([id]) => works.some((w) => w.video.aid === id)),
      );
      const autoReplySince = prior?.autoReplySince ?? now / 1000;
      const recent = works.slice(0, auto ? s.maxVideos : 3);
      const cursor = prior?.cursor ?? 0;
      const selected = recent.length ? recent[cursor % recent.length] : undefined;
      const scan = auto
        ? [
            ...new Map(
              [recent[0], selected, recent[(cursor + 1) % Math.max(1, recent.length)]]
                .filter(Boolean)
                .map((w) => [w!.video.aid, w!]),
            ).values(),
          ]
        : selected
          ? [selected]
          : [];

      for (const work of scan) {
        const firstAutoScan = !autoReplySeen[work.video.aid];
        const seen = new Set(autoReplySeen[work.video.aid] ?? []);
        const target: CommentTarget = {
          oid: work.video.aid,
          type: 1,
          root: '0',
          parent: '0',
        };
        const pages: Array<{ items: PublicComment[]; nextCursor?: string }> = [
          await this.source.comments(target, 1, combined),
        ];
        if (auto) {
          for (let page = 2; page <= 3 && pages.at(-1)?.nextCursor; page += 1) {
            try {
              pages.push(
                await this.source.comments(target, page, combined, pages.at(-1)!.nextCursor),
              );
            } catch (error) {
              if (combined.aborted) throw error;
              partialError = '后续评论页未读全，保留本次已读评论，下次继续检查。';
              break;
            }
          }
        }
        for (const page of pages) this.store.rememberComments(page);

        const comments = pages
          .flatMap((p) => p.items ?? [])
          .flatMap((c) => [c, ...(c.replies ?? [])]);
        let queued = 0;
        for (const c of comments) {
          if (!auto && queued >= limitPerScan) break;
          if (auto) {
            const isFresh =
              Boolean(s.replyExistingComments) ||
              (!seen.has(c.id) && (c.createdAt ? c.createdAt >= autoReplySince : !firstAutoScan));
            seen.add(c.id);
            if (!isFresh) continue;
          }
          if (
            !c.authorId ||
            c.authorId === account.id ||
            (!auto && c.authorId === binding.ownerId) ||
            this.store
              .inbox()
              .some(
                (i) =>
                  i.accountId === account.id &&
                  i.target.oid === c.target.oid &&
                  i.target.parent === c.id,
              ) ||
            assessPublicInput(c.text).action === 'skip' ||
            this.store.hasSend('bilibili', account.id, c.target.oid, c.id)
          ) {
            continue;
          }
          const item: InboxItem = {
            id: `focus:${key}:comment:${c.target.oid}:${c.id}`,
            platform: 'bilibili',
            accountId: account.id,
            authorId: c.authorId,
            author: c.author,
            text: String(c.text).slice(0, 1500),
            target: c.target,
            occurredAt: now / 1000,
            status: 'pending',
            notificationType: 'focus-comment',
            focusOwnerId: binding.ownerId,
            ...(auto ? { ownerAutoReply: true } : {}),
            url: work.video.url,
          };
          if (this.store.addInbox(item)) {
            added += 1;
            queued += 1;
          }
        }
        if (auto) {
          autoReplySeen[work.video.aid] = [...seen].slice(-1000);
          prior = { ...(prior ?? { at: now, nextAt: now }), autoReplySince, autoReplySeen };
          this.store.saveFocusCheck(key, prior);
        }
      }

      this.store.saveFocusCheck(key, {
        ...prior,
        at: now,
        nextAt:
          now +
          (auto ? Math.max(2, s.autoReplyIntervalMinutes) : Math.max(10, s.intervalMinutes)) * 60_000,
        cursor: (prior?.cursor ?? 0) + 1,
        ...(partialError ? { error: partialError } : { error: undefined }),
      });
      return { added, ...(partialError ? { error: partialError } : {}) };
    } catch (error) {
      const message = (error as Error).message.slice(0, 200);
      this.store.saveFocusCheck(key, {
        ...prior,
        at: now,
        nextAt: now + Math.max(10, s.intervalMinutes) * 60_000,
        cursor: prior?.cursor ?? 0,
        error: message,
      });
      return { added, error: message };
    } finally {
      this.polling = false;
    }
  }

  /** 绑定摘要（给面板一句话）。 */
  summary(accountId: string): string {
    const b = this.binding(accountId);
    if (!b) return '未绑定';
    return `${b.name}（${b.method === 'uid' ? 'UID 绑定' : '按昵称反查'}）`;
  }

  /** 给 brief 用的 @ 对象：只在本地允许 @ 时才给。 */
  mentionFor(accountId: string): { id: string; name: string } | undefined {
    if (!this.settings.allowMentions) return undefined;
    const b = this.binding(accountId);
    if (!b) return undefined;
    return { id: b.ownerId, name: b.name };
  }

  /** 稳定 id 生成（面板/测试用）。 */
  newId(): string {
    return randomUUID();
  }
}
