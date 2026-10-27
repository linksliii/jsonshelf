import type { HistoryEntry } from "../types";

// 大文件:App 只保留正文开头一小段,避免同一份几 MB 字符串在 JS 堆里存两份。
export const DOC_FULL_LIMIT = 1_000_000;
export const DOC_HEAD_CHARS = 4096;

// 取正文前 n 个字符作为列表预览。先截断再折叠空白,避免对整篇大文件做正则拷贝。
export function previewOf(content: string, n = 240): string {
  return content.slice(0, n * 4).replace(/\s+/g, " ").trim().slice(0, n);
}

export function headOf(content: string): string {
  return content.length > DOC_FULL_LIMIT ? content.slice(0, DOC_HEAD_CHARS) : content;
}

export interface Snapshot {
  text: string;
  length: number;
  lines: number;
}

// 指纹只比长度 + 开头一段:大文件改在尾部时长度仍然会变,足够触发保存。
export function sameSnapshot(a: Snapshot, b: Snapshot): boolean {
  return a.length === b.length && a.text === b.text;
}

export interface SavedPatch {
  id: number;
  title: string;
  language: string;
  content: string;
  updatedAt: number;
  pinned?: boolean;
  createdAt?: number;
}

// 保存后的局部更新:已存在的条目原地替换,不重排(编辑时列表不跳动);
// 新条目插到最前面。返回新数组,便于 setState。
export function mergeSaved(
  entries: HistoryEntry[],
  patch: SavedPatch,
  isNew: boolean,
): HistoryEntry[] {
  const preview = previewOf(patch.content);
  const idx = entries.findIndex((e) => e.id === patch.id);

  if (idx === -1) {
    if (!isNew) return entries;
    return [{
      id: patch.id,
      title: patch.title,
      language: patch.language,
      pinned: patch.pinned ?? false,
      createdAt: patch.createdAt ?? patch.updatedAt,
      updatedAt: patch.updatedAt,
      size: patch.content.length,
      preview,
    }, ...entries];
  }

  const copy = entries.slice();
  copy[idx] = {
    ...copy[idx],
    title: patch.title,
    language: patch.language,
    updatedAt: patch.updatedAt,
    size: patch.content.length,
    preview,
    ...(patch.pinned === undefined ? {} : { pinned: patch.pinned }),
    ...(patch.createdAt === undefined ? {} : { createdAt: patch.createdAt }),
  };
  return copy;
}