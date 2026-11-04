/**
 * Protobuf wire-format 读取器：只认字段号、wire type 和原始值，不依赖 `.proto`；
 * 布局由调用方解读。失败返回 null / undefined / 空串，不抛异常。
 *
 * 来自 [cortico-world-bili-video-pro](https://github.com/mutoubaicai/cortico-world-bili-video-pro)（MIT），
 * 其源头是 Cortico 内置的 bilibili world（Pal-AI-Lab，MIT）。本文只保留弹幕解码用到的函数。
 */

/** 一个读出的字段。按 wire type 是 varint 或 bytes。 */
export interface PbField {
  readonly field: number;
  readonly wire: number;
  readonly varint?: bigint;
  readonly bytes?: Uint8Array;
}

const TEXT = new TextDecoder('utf-8', { fatal: true });

/** 读一层字段；截断、越界长度或不支持的 wire type 返回 null。单值字段取该字段号的最后一次出现。 */
export function pbDecode(buf: Uint8Array): PbField[] | null {
  const out: PbField[] = [];
  let i = 0;
  while (i < buf.length) {
    const key = readVarint(buf, i);
    if (!key) return null;
    i = key.next;
    const field = Number(key.value >> 3n);
    const wire = Number(key.value & 7n);
    if (field <= 0) return null;
    if (wire === 0) {
      const value = readVarint(buf, i);
      if (!value) return null;
      i = value.next;
      out.push({ field, wire, varint: value.value });
    } else if (wire === 2) {
      const len = readVarint(buf, i);
      if (!len) return null;
      const start = len.next;
      const end = start + Number(len.value);
      if (!Number.isSafeInteger(end) || end > buf.length) return null;
      out.push({ field, wire, bytes: buf.subarray(start, end) });
      i = end;
    } else if (wire === 5 || wire === 1) {
      const width = wire === 5 ? 4 : 8;
      if (i + width > buf.length) return null;
      out.push({ field, wire, bytes: buf.subarray(i, i + width) });
      i += width;
    } else {
      return null;
    }
  }
  return out;
}

/** 字段的 bytes 按 UTF-8 解；缺失、非法 UTF-8 或含控制字符返回空串。 */
export function pbText(fields: readonly PbField[] | null, field: number): string {
  const bytes = pick(fields, field)?.bytes;
  if (!bytes) return '';
  let text: string;
  try {
    text = TEXT.decode(bytes);
  } catch {
    return '';
  }
  return hasControlChars(text) ? '' : text;
}

/** 字段的 varint；缺失或超出安全整数范围返回 undefined。 */
export function pbInt(fields: readonly PbField[] | null, field: number): number | undefined {
  const value = pick(fields, field)?.varint;
  if (value === undefined) return undefined;
  const num = Number(value);
  return Number.isSafeInteger(num) ? num : undefined;
}

function hasControlChars(text: string): boolean {
  for (let i = 0; i < text.length; i += 1) {
    if (text.charCodeAt(i) < 0x20) return true;
  }
  return false;
}

function pick(fields: readonly PbField[] | null, field: number): PbField | undefined {
  if (!fields) return undefined;
  for (let i = fields.length - 1; i >= 0; i -= 1) {
    if (fields[i].field === field) return fields[i];
  }
  return undefined;
}

/** 最多读 10 字节；没有终止字节返回 null。 */
function readVarint(buf: Uint8Array, from: number): { value: bigint; next: number } | null {
  let value = 0n;
  let shift = 0n;
  for (let i = from; i < buf.length && i - from < 10; i += 1) {
    const byte = buf[i];
    value |= BigInt(byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) return { value, next: i + 1 };
    shift += 7n;
  }
  return null;
}
