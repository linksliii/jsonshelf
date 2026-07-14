import uFuzzy from "@leeoniya/ufuzzy";
import type { HistoryEntry } from "../types";

export interface RankedEntry {
  entry: HistoryEntry;
}

// 在 title + content 上做子序列模糊匹配,返回按相关性排序的条目。
// intraMode:0 (MultiInsert) + intraIns:2 允许每个需求字符之间最多跳过 2 个字符,
// 从而支持 "usrnm" 命中 "user_name" 这类子序列模糊匹配;intraChars:"." 让被跳过的
// 字符可为任意字符(默认 [a-z\d] 会挡住 "_" 等分隔符)。
// (intraMode:1/SingleError 每个词最多 1 次编辑,无法命中需要多次删除的子序列。)
export function fuzzyRank(items: HistoryEntry[], query: string): RankedEntry[] {
  if (!query.trim()) return items.map((entry) => ({ entry }));
  const uf = new uFuzzy({ intraMode: 0, intraIns: 2, intraChars: "." });
  const haystack = items.map((it) => `${it.title} ${it.content}`);
  const idxs = uf.filter(haystack, query);
  if (!idxs || idxs.length === 0) return [];
  const info = uf.info(idxs, haystack, query);
  const order = uf.sort(info, haystack, query);
  return order.map((oi) => ({ entry: items[info.idx[oi]] }));
}
