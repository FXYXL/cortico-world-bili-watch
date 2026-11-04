/**
 * core/platform.ts — **历史遗留的转发层，只做 re-export。**
 *
 * ## 为什么保留
 *
 * `social/store.ts` / `social/archive.ts` / `core/dynamic-types.ts` 都从这里取类型
 * （从多平台版本带过来的 import 路径）。类型定义本身已经全部收敛到 `core/types.ts`。
 *
 * ## 为什么必须收敛（这不是洁癖）
 *
 * 两份同名类型已经造成过一次真实 bug：`platform.ts` 的 `InboxItem` 有 `platform` 字段，
 * `types.ts` 的没有。于是 `store.rememberContact()` 里的 `item.platform !== 'bilibili'`
 * 在单平台下恒真，**联系人表永远是空的** —— 而且不报错。真机验证「迁移后 contacts 为 0」
 * 时才发现的。
 *
 * 同一类问题在 `SendRecord` 上又来过一次：`platform` / `operationId` 只存在于旧的
 * `platform.ts` 版本里，实际写入的是 `types.ts` 的形状 —— 结果 `hasSend()` 恒为 false、
 * 第一层防重永远查不到。
 *
 * 所以：**同名的类型只能有一份**。新代码一律从 `core/types.ts` 取。
 */

export type {
  Account,
  CommentTarget,
  ConversationBrief,
  FocusMention,
  InboxItem,
  NotificationPage,
  PreparationNote,
  PublicComment,
  PublicVideo,
  SendReceipt,
  SendRecord,
  SendStatus,
  Video,
  VideoPart,
  VisibilityReport,
} from './types.ts';

export { BiliError, looksLikeBiliVideo } from './types.ts';
