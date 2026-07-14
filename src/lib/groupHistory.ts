import type { HistoryEntry } from "../types";

export interface HistoryGroup {
  label: string;
  entries: HistoryEntry[];
}

// 计算两个时间戳相差的日历天数(以本地日为准,非 24h 差)。
function calendarDayDiff(a: number, b: number): number {
  const da = new Date(a);
  const db = new Date(b);
  const dayA = new Date(da.getFullYear(), da.getMonth(), da.getDate()).getTime();
  const dayB = new Date(db.getFullYear(), db.getMonth(), db.getDate()).getTime();
  return Math.round((dayB - dayA) / 86_400_000);
}

// 将历史条目按时间分组:已固定 组置顶(不参与时间分桶),
// 其余按 updatedAt 的日历日分为 今天 / 昨天 / 更早。
// 纯函数:now 由调用方注入。保留每组内的输入顺序;空组被省略。
export function groupHistory(entries: HistoryEntry[], now: number): HistoryGroup[] {
  const pinned: HistoryEntry[] = [];
  const today: HistoryEntry[] = [];
  const yesterday: HistoryEntry[] = [];
  const older: HistoryEntry[] = [];

  for (const e of entries) {
    if (e.pinned) {
      pinned.push(e);
      continue;
    }
    const diff = calendarDayDiff(e.updatedAt, now);
    if (diff <= 0) today.push(e);
    else if (diff === 1) yesterday.push(e);
    else older.push(e);
  }

  const groups: HistoryGroup[] = [
    { label: "已固定", entries: pinned },
    { label: "今天", entries: today },
    { label: "昨天", entries: yesterday },
    { label: "更早", entries: older },
  ];
  return groups.filter((g) => g.entries.length > 0);
}
