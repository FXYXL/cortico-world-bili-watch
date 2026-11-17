/**
 * social/receipt.ts — 工具回执的**精简版**。只回答"我还要做什么"，不复述已知信息。
 *
 * ## 为什么需要
 *
 * `bili_publish` 原来直接把整条 `SendRecord` 序列化返回：包含 operationId、
 * requestId、accountId、target、createdAt、transport，以及 **`preparation` 里
 * prepare 刚刚给过的 advice 和 judgment** —— 实测 1195 字符，其中约 600 是
 * "三十秒前刚读过一遍"的内容。
 *
 * 她真正需要的只有四件事：**发出去了没 / 回执号 / 是不是只有自己看得见 / 要不要重试**。
 *
 * ## 原则
 *
 * - 状态词用平台语义（sent / unknown / rejected），不要自造"成功"
 * - 每种状态给**一句**下一步，不铺开解释（详细规则在 ENV_PROMPT 里）
 * - 拒绝原因保留，但截断：原因太长会挤掉别的东西
 */

import type { SendRecord } from '../core/types.ts';

export interface CompactReceipt {
  status: SendRecord['status'];
  /** 楼层号：她之后复查、引用、定位都靠它。 */
  receiptId?: string;
  visibility?: string;
  /** 文案相对草稿润色过（内容判断已按新文案重跑）。 */
  revised?: boolean;
  /** 一句话说清下一步。 */
  next: string;
  /** 失败/被拒的原因（截断）。 */
  detail?: string;
  delivery?: string;
}

const pick = (s: unknown, max = 160): string | undefined => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, max) : undefined;
};

/**
 * publish 的回执。**不接受 preparation** —— 那是 prepare 的输入，不该回传。
 */
export function publishReceipt(
  record: SendRecord,
  delivery?: { state?: string; summary?: string } | null,
): CompactReceipt {
  const visibility = record.visibility?.status;
  const detail = pick(record.detail ?? (record as { reason?: string }).reason);

  let next: string;
  if (record.status === 'sent') {
    // 未核实公开与否是常态（审核中/分页没覆盖），别让她误以为失败去重发
    next =
      visibility === 'self-only'
        ? '已发出但仅自己可见（被限流）：**不要重发同一句**。'
        : visibility === 'public'
          ? '已发出，访客可见。'
          : '已受理（公开与否待核实）：**不要重发**。';
  } else if (record.status === 'unknown') {
    next = '结果未知：用**同一个 briefId** 重试，别换文案、别换编号。';
  } else if (record.status === 'sending') {
    next = '正在提交：先别动，等这一次的结果。';
  } else {
    next = '没发出去：先看 detail，别把同一句换个编号重发。';
  }

  return {
    status: record.status,
    ...(record.receiptId ? { receiptId: String(record.receiptId) } : {}),
    ...(visibility ? { visibility } : {}),
    ...(record.revised ? { revised: true } : {}),
    next,
    ...(record.status !== 'sent' && detail ? { detail } : {}),
    ...(delivery?.state ? { delivery: String(delivery.state) } : {}),
  };
}
