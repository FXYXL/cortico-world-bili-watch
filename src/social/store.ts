import type { DynamicPost } from '../core/dynamic-types.ts';
import type { DynamicOffer } from '../core/dynamic-autonomy.ts';
import { SendArchive } from './archive.ts';
import type { PublicDynamic } from '../core/dynamics.ts';
import { RESOURCE_DEFAULTS, type ResourceConfig } from './resources.ts';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
  unlinkSync,
} from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { RoamSession } from './roaming.ts';
import type {
  InboxItem,
  SendRecord,
  PublicVideo,
  PublicComment,
  ConversationBrief,
  Video,
} from '../core/platform.ts';

import type { FocusBinding, FocusWork, FocusCheck, Contact } from './focus.ts';
interface State {
  dynamicOffers?: Record<string, DynamicOffer>;
  dynamicPosts?: DynamicPost[];
  dynamics?: PublicDynamic[];
  dynamicReads?: Record<string, number>;
  /** 私信发送账本（3 天窗口，护栏用）。 */
  dmSends?: Array<{ at: string; talkerId: string }>;
  /** 私信投递水位（talkerId → 已投递的最后消息时间/未读数）。**必须持久化**：内存态一重启就清零，重启后会把旧消息全推一遍。 */
  dmWatermark?: Record<string, { lastAt: number; unread: number }>;
  focusBindings: FocusBinding[];
  focusWorks: FocusWork[];
  focusChecks: Record<string, FocusCheck>;
  contacts: Contact[];
  version: 1 | 2;
  roaming: RoamSession[];
  roamCounts?: Record<string, number>;
  videos: PublicVideo[];
  comments: PublicComment[];
  briefs: ConversationBrief[];
  inbox: InboxItem[];
  outbox: SendRecord[];
  feeds: Record<
    string,
    { sinceAt: number; scanMaxAt?: number; cursor?: { id: string; time: number } }
  >;
}
/** One store per deployment. Writes replace a complete, bounded snapshot atomically. */
export class SocialStore {
  private state: State;
  private file: string;
  private archive: SendArchive;
  constructor(
    dir: string,
    private resourceSettings: () => Partial<ResourceConfig> = () => ({}),
  ) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    this.file = join(dir, 'state.json');
    this.archive = new SendArchive(join(dir, 'history.sqlite'));

    this.state = {
      version: 1,
      focusBindings: [],
      focusWorks: [],
      focusChecks: {},
      contacts: [],
      inbox: [],
      outbox: [],
      feeds: {},
      roaming: [],
      videos: [],
      comments: [],
      briefs: [],
    };
    if (existsSync(this.file)) {
      try {
        const s = JSON.parse(readFileSync(this.file, 'utf8'));
        if (
          (s.version !== 1 && s.version !== 2) ||
          !Array.isArray(s.inbox) ||
          !Array.isArray(s.outbox) ||
          !s.feeds ||
          typeof s.feeds !== 'object'
        )
          throw new Error();
        if (
          s.focusChecks !== undefined &&
          (!s.focusChecks || typeof s.focusChecks !== 'object' || Array.isArray(s.focusChecks))
        )
          throw new Error();
        if (s.roaming !== undefined && !Array.isArray(s.roaming)) throw new Error();
        if (
          s.dynamicOffers !== undefined &&
          (!s.dynamicOffers ||
            typeof s.dynamicOffers !== 'object' ||
            Array.isArray(s.dynamicOffers))
        )
          throw new Error();
        if (s.dynamicPosts !== undefined && !Array.isArray(s.dynamicPosts)) throw new Error();
        if (s.dynamics !== undefined && !Array.isArray(s.dynamics)) throw new Error();
        if (s.dynamicReads !== undefined &&
          (!s.dynamicReads || typeof s.dynamicReads !== 'object' || Array.isArray(s.dynamicReads))
        )
          throw new Error();
        if (s.dmSends !== undefined && !Array.isArray(s.dmSends)) throw new Error();
        if (
          s.dmWatermark !== undefined &&
          (!s.dmWatermark || typeof s.dmWatermark !== 'object' || Array.isArray(s.dmWatermark))
        )
          throw new Error();
        for (const key of [
          'videos',
          'comments',
          'briefs',
          'focusBindings',
          'focusWorks',
          'contacts',
        ])
          if (s[key] !== undefined && !Array.isArray(s[key])) throw new Error();
        this.state = {
          ...s,
          focusBindings: s.focusBindings ?? [],
          focusWorks: s.focusWorks ?? [],
          focusChecks: s.focusChecks ?? {},
          contacts: s.contacts ?? [],
          roaming: s.roaming ?? [],
          videos: s.videos ?? [],
          comments: s.comments ?? [],
          briefs: s.briefs ?? [],
        };
      } catch {
        throw new Error('社交记录无法读取，已保留原文件，请先核实 state.json。');
      }
      for (const i of this.state.inbox) this.rememberContact(i);
      let changed = false;
      for (const r of this.state.outbox)
        if (r.status === 'sending') {
          r.status = 'unknown';
          r.detail = '发送期间进程中断，请核对评论区；未自动重发。';
          changed = true;
        }
      for (const r of this.state.dynamicPosts ?? [])
        if (r.status === 'sending') {
          r.status = 'unknown';
          r.detail = '发布期间进程中断，结果待核实，不自动重发。';
          changed = true;
        }
      if (changed) this.save();
    }
  }
  dynamicOffer(accountId: string) {
    return structuredClone(this.state.dynamicOffers?.[accountId]);
  }
  saveDynamicOffer(offer: DynamicOffer) {
    const rows = this.state.dynamicOffers ?? {};
    delete rows[offer.accountId];
    rows[offer.accountId] = structuredClone(offer);
    this.state.dynamicOffers = Object.fromEntries(Object.entries(rows).slice(-20));
    this.save();
  }
  dynamicPosts(accountId: string) {
    return structuredClone(
      (this.state.dynamicPosts ?? []).filter((r) => r.accountId === accountId),
    );
  }
  /** 私信发送账本：3 天窗口，护栏查额度用。 */
  dmSends(): Array<{ at: string; talkerId: string }> {
    return structuredClone(this.state.dmSends ?? []);
  }
  recordDmSend(talkerId: string): void {
    const rows = this.state.dmSends ?? [];
    rows.push({ at: new Date().toISOString(), talkerId });
    const cutoff = Date.now() - 3 * 86_400_000;
    this.state.dmSends = rows.filter((x) => Date.parse(x.at) >= cutoff);
    this.save();
  }
  dmSendsToday(): { total: number; toPerson: Map<string, number> } {
    const today = new Date().toISOString().slice(0, 10);
    const per = new Map<string, number>();
    let total = 0;
    for (const x of this.state.dmSends ?? []) {
      if (!String(x.at).startsWith(today)) continue;
      total += 1;
      per.set(x.talkerId, (per.get(x.talkerId) ?? 0) + 1);
    }
    return { total, toPerson: per };
  }
  /** 私信投递水位（持久化，重启不丢）。 */
  getDmWatermark(talkerId: string): { lastAt: number; unread: number } {
    return { ...(this.state.dmWatermark?.[String(talkerId)] ?? { lastAt: 0, unread: 0 }) };
  }
  setDmWatermark(talkerId: string, lastAt: number, unread: number): void {
    const map = this.state.dmWatermark ?? {};
    const prev = map[String(talkerId)];
    // 只前进不后退：乱序返回的会话列表不能把水位带回过去
    map[String(talkerId)] = {
      lastAt: Math.max(lastAt, prev?.lastAt ?? 0),
      unread: Math.max(unread, prev?.unread ?? 0),
    };
    this.state.dmWatermark = map;
    this.save();
  }
  saveDynamicPost(record: DynamicPost) {
    const rows = this.state.dynamicPosts ?? [];
    const index = rows.findIndex((r) => r.id === record.id);
    if (index >= 0) rows[index] = structuredClone(record);
    else {
      // Expired never-submitted drafts have no recovery or duplicate-send value.
      const keep = rows.filter(
        (r) => r.status !== 'prepared' || Date.now() - Date.parse(r.createdAt) < 3600000,
      );
      if (keep.length >= 2000) throw Error('动态记录达到2000条保护上限，暂停新发布；原记录保留。');
      this.state.dynamicPosts = [...keep, structuredClone(record)];
    }
    this.save();
  }
  dynamics(accountId: string) {
    return structuredClone((this.state.dynamics ?? []).filter((x) => x.accountId === accountId));
  }
  rememberDynamics(accountId: string, items: PublicDynamic[]) {
    const merged = new Map((this.state.dynamics ?? []).map((x) => [x.accountId + ':' + x.id, x]));
    for (const item of items) {
      const key = accountId + ':' + item.id;
      merged.delete(key);
      merged.set(key, { ...structuredClone(item), accountId });
    }
    this.state.dynamics = [...merged.values()].slice(-100);
    this.save();
  }
  dynamicReadCount(accountId: string, day: string) {
    return this.state.dynamicReads?.[day + '|' + accountId] ?? 0;
  }
  reserveDynamicRead(accountId: string, day: string, max: number) {
    const count = this.dynamicReadCount(accountId, day);
    if (count >= max) throw Error('今天B站动态读取已达本地上限，已读记录仍可查看。');
    const counts = (this.state.dynamicReads ??= {});
    counts[day + '|' + accountId] = count + 1;
    const days = [...new Set(Object.keys(counts).map((k) => k.split('|')[0]))].sort().slice(-14);
    for (const key of Object.keys(counts))
      if (!days.includes(key.split('|')[0])) delete counts[key];
    this.save();
  }
  contacts() {
    return structuredClone(this.state.contacts);
  }
  focusBinding(accountId: string, input: string, platform = 'bilibili') {
    return structuredClone(
      this.state.focusBindings.find(
        (b) =>
          (b.platform ?? 'bilibili') === platform && b.accountId === accountId && b.input === input,
      ),
    );
  }
  saveFocusBinding(binding: FocusBinding) {
    this.state.focusBindings = [
      ...this.state.focusBindings.filter(
        (b) =>
          (b.platform ?? 'bilibili') !== (binding.platform ?? 'bilibili') ||
          b.accountId !== binding.accountId,
      ),
      structuredClone(binding),
    ].slice(-20);
    this.save();
    return binding;
  }
  focusWorks() {
    return structuredClone(this.state.focusWorks);
  }
  saveFocusWorks(works: FocusWork[]) {
    const keys = new Set(
      works.map(
        (w) => (w.platform ?? 'bilibili') + ':' + w.accountId + ':' + w.ownerId + ':' + w.video.aid,
      ),
    );
    this.state.focusWorks = [
      ...this.state.focusWorks.filter(
        (w) =>
          !keys.has(
            (w.platform ?? 'bilibili') + ':' + w.accountId + ':' + w.ownerId + ':' + w.video.aid,
          ),
      ),
      ...structuredClone(works),
    ].slice(-100);
    this.save();
  }
  focusCheck(key: string) {
    return structuredClone(this.state.focusChecks[key]);
  }
  saveFocusCheck(key: string, value: FocusCheck) {
    this.state.focusChecks[key] = structuredClone(value);
    this.save();
  }
  private rememberContact(item: InboxItem) {
    if (
      /**
       * 单平台插件里 `platform` 字段不存在 —— 用 `?? 'bilibili'` 兜底。
       *
       * 原来写的是 `item.platform !== 'bilibili'`：从多平台版本改过来时这个字段被去掉了，
       * 于是 `undefined !== 'bilibili'` 恒真，**这个函数永远直接 return**，联系人表一直是空的。
       * 真机验证「迁移后 contacts 为 0」时发现的。
       */
      (item.platform ?? 'bilibili') !== 'bilibili' ||
      item.focusOwnerId ||
      !/^[1-9]\d*$/.test(item.authorId) ||
      !Number.isFinite(item.occurredAt)
    )
      return;
    let c = this.state.contacts.find(
      (c) => c.accountId === item.accountId && c.userId === item.authorId,
    );
    if (!c) {
      c = { accountId: item.accountId, userId: item.authorId, firstAt: item.occurredAt, names: [] };
      this.state.contacts.push(c);
    }
    c.firstAt = Math.min(c.firstAt, item.occurredAt);
    if (!c.names.includes(item.author)) c.names = [...c.names, item.author].slice(-5);
    this.state.contacts = this.state.contacts.slice(-3000);
  }
  videos() {
    return structuredClone(this.state.videos);
  }
  video(aid: string) {
    return structuredClone(this.state.videos.find((v) => v.aid === aid));
  }
  rememberVideo(
    video: Pick<Video, 'aid' | 'id' | 'title' | 'url'> &
      Partial<Video> & { ownerId?: string; publishedAt?: number },
    observation?: string,
    unavailable = false,
  ) {
    const old = this.state.videos.find((v) => v.aid === video.aid);
    const value: PublicVideo = {
      ...old,
      aid: video.aid,
      ownerId: video.ownerId ?? old?.ownerId,
      publishedAt: video.publishedAt ?? old?.publishedAt,
      id: video.id,
      title: video.title.slice(0, 200),
      url: video.url,
      author: video.author,
      description: video.description?.slice(0, 1200),
      observation: observation ?? old?.observation,
      updatedAt: new Date().toISOString(),
      unavailable,
    };
    this.state.videos = [...this.state.videos.filter((v) => v.aid !== video.aid), value].slice(
      -200,
    );
    this.save();
    return structuredClone(value);
  }
  publicComments() {
    return structuredClone(this.state.comments);
  }
  comment(target: PublicComment['target']) {
    return structuredClone(
      this.state.comments.find(
        (c) =>
          c.target.type === target.type &&
          c.target.oid === target.oid &&
          c.target.root === target.root &&
          c.target.parent === target.parent,
      ),
    );
  }
  rememberComment(comment: PublicComment) {
    const key = (c: PublicComment) => [c.target.type, c.target.oid, c.target.parent].join(':');
    this.state.comments = [
      ...this.state.comments.filter((c) => key(c) !== key(comment)),
      {
        id: comment.id,
        authorId: comment.authorId,
        author: String(comment.author || '').slice(0, 80),
        text: String(comment.text || '').slice(0, 1500),
        target: structuredClone(comment.target),
      },
    ].slice(-1000);
    this.save();
  }
  rememberComments(input: unknown) {
    if (!input || typeof input !== 'object') return;
    const p = input as { root?: PublicComment; items?: PublicComment[] };
    const collected: PublicComment[] = [];
    const collect = (c: PublicComment) => {
      if (c && typeof c.text === 'string' && c.target?.parent)
        collected.push({
          id: String(c.id),
          authorId: c.authorId,
          author: String(c.author || '').slice(0, 80),
          text: c.text.slice(0, 1500),
          target: structuredClone(c.target),
        });
    };
    const visit = (c: PublicComment & { replies?: PublicComment[] }) => {
      collect(c);
      for (const child of c?.replies ?? []) collect(child);
    };
    if (p.root) visit(p.root);
    for (const c of p.items ?? []) visit(c);
    if (!collected.length) return;
    const key = (c: PublicComment) => [c.target.type, c.target.oid, c.target.parent].join(':');
    const merged = new Map(this.state.comments.map((c) => [key(c), c]));
    for (const c of collected) {
      merged.delete(key(c));
      merged.set(key(c), c);
    }
    this.state.comments = [...merged.values()].slice(-1000);
    this.save();
  }
  briefs() {
    return structuredClone(this.state.briefs);
  }
  brief(id: string) {
    return structuredClone(this.state.briefs.find((b) => b.id === id));
  }
  saveBrief(brief: ConversationBrief) {
    this.state.briefs = [
      ...this.state.briefs.filter((b) => b.id !== brief.id),
      structuredClone(brief),
    ].slice(-50);
    this.save();
    return structuredClone(brief);
  }
  roams() {
    return structuredClone(this.state.roaming);
  }
  roamCount(day: string, platform: string) {
    return this.state.roamCounts?.[day + '|' + platform];
  }
  saveRoam(session: RoamSession, usage?: { day: string; platform: string; count: number }) {
    if (usage) {
      const counts = (this.state.roamCounts ??= {});
      counts[usage.day + '|' + usage.platform] = usage.count;
      const days = [...new Set(Object.keys(counts).map((k) => k.split('|')[0]))].sort().slice(-14);
      for (const key of Object.keys(counts))
        if (!days.includes(key.split('|')[0])) delete counts[key];
    }
    const index = this.state.roaming.findIndex((r) => r.id === session.id);
    if (index < 0) this.state.roaming.push(structuredClone(session));
    else this.state.roaming[index] = structuredClone(session);
    this.state.roaming = this.state.roaming.slice(-100);
    this.save();
  }
  inbox() {
    return structuredClone(this.state.inbox);
  }
  outbox() {
    return structuredClone(this.state.outbox);
  }
  getInbox(id: string) {
    return structuredClone(this.state.inbox.find((x) => x.id === id));
  }
  getSend(id: string) {
    const live = this.state.outbox.find((x) => x.id === id);
    if (live) return structuredClone(live);
    try {
      return structuredClone(this.archive.get(id));
    } catch {
      return undefined;
    }
  }
  /**
   * 按防重主键取已有发送记录。
   *
   * **键要算，不能只看 `id`。** 新记录的 `id` 是随机 UUID，主键在 `operationId` 里；
   * 早期迁移过来的记录则把主键放在了 `id`、`requestId` 或 `operationId` 三个位置之一。
   * 只比其中一处 = 第一层防重静默失效（同一 requestId 可以重复发）。
   */
  operationSends(id: string) {
    const keyOf = (r: SendRecord): string =>
      r.operationId ??
      (r.requestId ? `${r.platform ?? 'bilibili'}:${r.accountId}:${r.requestId}` : r.id);
    /** 归档摸 `node:sqlite`；拿不到就只用内存那份，**不能让防重查询抛错**。 */
    let archived: SendRecord[] = [];
    try {
      archived = this.archive.operation(id);
    } catch {
      archived = [];
    }
    return [
      ...new Map(
        [...archived, ...this.state.outbox.filter((r) => keyOf(r) === id)].map((r) => [r.id, r]),
      ).values(),
    ];
  }
  /**
   * 这个位置是否已经有过一次非拒绝的发送。
   *
   * `platform` 允许记录里没有：单平台插件，历史记录（迁移来的）可能不带这个字段，
   * 而把它写成 `r.platform === platform` 会让整条判断恒为 false —— 那等于没有这道闸。
   */
  hasSend(platform: string, account: string, oid: string, parent?: string, owner?: string) {
    if (
      this.state.outbox.some(
        (r) =>
          (!r.platform || r.platform === platform) &&
          r.accountId === account &&
          r.target.oid === oid &&
          r.status !== 'rejected' &&
          (parent === undefined || r.target.parent === parent) &&
          (owner === undefined || r.focusOwnerId === owner),
      )
    ) {
      return true;
    }
    try {
      return this.archive.has(platform, account, oid, parent, owner);
    } catch {
      // 没有归档能力时只按内存判断：宁可少拦一条，也不能让整个发评流程抛错
      return false;
    }
  }
  hasReceipt(platform: string, account: string, id: string) {
    return (
      this.state.outbox.some(
        (r) => r.platform === platform && r.accountId === account && r.receiptId === id,
      ) || this.archive.receipt(platform, account, id)
    );
  }
  historyPage(limit = 30, offset = 0) {
    return this.archive.page(limit, offset);
  }
  historyStatus() {
    return {
      ...this.archive.status(),
      recent: this.state.outbox.length,
      maxArchiveBytes:
        (this.resourceSettings().maxArchiveMB ?? RESOURCE_DEFAULTS.maxArchiveMB) * 1048576,
    };
  }
  maintainHistory() {
    const cfg = { ...RESOURCE_DEFAULTS, ...this.resourceSettings() },
      now = Date.now(),
      count = this.state.outbox.length;
    const records = this.state.outbox
      .filter(
        (r, i) =>
          (!['unknown', 'sending'].includes(r.status) &&
            now - Date.parse(r.createdAt) > Math.max(2, cfg.historyDays) * 86400000) ||
          (!['unknown', 'sending'].includes(r.status) &&
            i < count - cfg.maxRecentSends &&
            now - Date.parse(r.createdAt) > 2 * 86400000),
      )
      .filter((r) => !r.inboxId || this.getInbox(r.inboxId)?.status !== 'pending');
    this.archive.put(records);
    if (records.length) {
      const ids = new Set(records.map((r) => r.id));
      this.state.outbox = this.state.outbox.filter((r) => !ids.has(r.id));
      this.state.version = 2;
      this.save();
    }
    return { archived: records.length, ...this.historyStatus() };
  }

  addInbox(item: InboxItem) {
    if (this.state.inbox.some((x) => x.id === item.id)) return false;
    if (this.state.inbox.filter((x) => x.status === 'pending').length >= 2000)
      throw new Error('收件箱有 2000 条待处理消息，请处理后继续同步。');
    this.rememberContact(item);
    this.state.inbox.push(structuredClone(item));
    this.save();
    return true;
  }
  updateInbox(
    id: string,
    patch: Partial<
      Pick<
        InboxItem,
        'status' | 'delivered' | 'deliveredAt' | 'retryAt' | 'handling' | 'ownerAutoReply'
      >
    >,
  ) {
    const r = this.state.inbox.find((x) => x.id === id);
    if (!r) throw new Error('消息不存在');
    Object.assign(r, patch);
    this.save();
  }
  reserve(input: Omit<SendRecord, 'status' | 'createdAt'>) {
    if (this.getSend(input.id)) throw new Error('该发送操作已存在，请读取原回执。');
    /**
     * 硬上限：outbox 只增不减会让 state.json 越来越大，写盘也会变慢
     * （`maintainHistory` 正常会把老记录挪进归档，但归档依赖 `node:sqlite`，
     * 拿不到时不能无限堆在 JSON 里）。
     */
    if (this.state.outbox.length >= 4000) {
      throw new Error('发送记录达到 4000 条保护上限，暂停新增；请先归档或清理历史。');
    }
    this.state.outbox.push({
      ...structuredClone({ platform: 'bilibili', ...input }),
      createdAt: new Date().toISOString(),
      status: 'sending',
    });
    this.save();
  }
  updateSend(
    id: string,
    patch: Partial<
      Pick<SendRecord, 'status' | 'receiptId' | 'detail' | 'platformState' | 'visibility'>
    >,
  ) {
    const r = this.state.outbox.find((x) => x.id === id);
    if (!r) {
      let archived: SendRecord | undefined;
      try {
        archived = this.archive.get(id);
      } catch {
        archived = undefined;
      }
      if (!archived) throw new Error('发送记录不存在');
      Object.assign(archived, patch);
      try {
        this.archive.put([archived]);
      } catch {
        /* 归档不可用时只改内存副本，不阻断核验结果 */
      }
      return structuredClone(archived);
    }
    Object.assign(r, patch);
    this.save();
    return structuredClone(r);
  }
  feed(key: string, sinceAt = Math.floor(Date.now() / 1000)) {
    if (!this.state.feeds[key]) {
      this.state.feeds[key] = { sinceAt };
      this.save();
    }
    return structuredClone(this.state.feeds[key]);
  }
  checkpoint(key: string, cursor?: { id: string; time: number }, scannedAt?: number) {
    const f = this.state.feeds[key];
    if (!f) throw new Error('通知流未初始化');
    f.cursor = cursor;
    f.scanMaxAt = Math.max(f.sinceAt, f.scanMaxAt ?? 0, scannedAt ?? 0);
    if (!cursor) {
      f.sinceAt = f.scanMaxAt;
      f.scanMaxAt = undefined;
    }
    this.save();
  }
  private save() {
    // Pending messages and all send keys survive compaction; old handled messages are presentation history.
    const handled = this.state.inbox.filter((x) => x.status === 'handled').slice(-1000);
    this.state.inbox = [...handled, ...this.state.inbox.filter((x) => x.status === 'pending')];
    const temp = `${this.file}.${randomUUID()}.tmp`;
    try {
      writeFileSync(temp, JSON.stringify(this.state), { mode: 0o600, flush: true });
      renameSync(temp, this.file);
    } finally {
      if (existsSync(temp)) unlinkSync(temp);
    }
  }
}
