import uFuzzy from "@leeoniya/ufuzzy";
import type { HistoryEntry } from "../types";

export interface RankedEntry {
  entry: HistoryEntry;
}

// 在 title + 预览上做子序列模糊匹配。用预览而不是完整正文,
// 避免搜索时对大文件做整串拼接与排序。
export function fuzzyRank(items: HistoryEntry[], query: string): RankedEntry[] {
  if (!query.trim()) return items.map((entry) => ({ entry }));
  const uf = new uFuzzy({ intraMode: 0, intraIns: 2, intraChars: "." });
  const haystack = items.map((it) => `${it.title} ${it.preview ?? it.content ?? ""}`);
  const idxs = uf.filter(haystack, query);
  if (!idxs || idxs.length === 0) return [];
  const info = uf.info(idxs, haystack, query);
  const order = uf.sort(info, haystack, query);
  return order.map((oi) => ({ entry: items[info.idx[oi]] }));
}
