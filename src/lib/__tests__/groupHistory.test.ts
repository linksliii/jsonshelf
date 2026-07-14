import { describe, it, expect } from "vitest";
import { groupHistory } from "../groupHistory";
import type { HistoryEntry } from "../../types";

// 固定一个 "now":2026-07-14 12:00:00 本地时间。
const NOW = new Date(2026, 6, 14, 12, 0, 0).getTime();

function entry(id: number, updatedAt: number, pinned = false): HistoryEntry {
  return {
    id,
    title: `t${id}`,
    content: "{}",
    language: "json",
    pinned,
    createdAt: 0,
    updatedAt,
  };
}

describe("groupHistory", () => {
  it("空输入返回空数组", () => {
    expect(groupHistory([], NOW)).toEqual([]);
  });

  it("按今天/昨天/更早分桶(以日历日为准)", () => {
    const today = new Date(2026, 6, 14, 9, 0, 0).getTime();     // 今天 09:00
    const yesterday = new Date(2026, 6, 13, 23, 0, 0).getTime(); // 昨天 23:00
    const older = new Date(2026, 6, 1, 0, 0, 0).getTime();       // 更早

    const groups = groupHistory(
      [entry(1, today), entry(2, yesterday), entry(3, older)],
      NOW,
    );
    expect(groups.map((g) => g.label)).toEqual(["今天", "昨天", "更早"]);
    expect(groups[0].entries.map((e) => e.id)).toEqual([1]);
    expect(groups[1].entries.map((e) => e.id)).toEqual([2]);
    expect(groups[2].entries.map((e) => e.id)).toEqual([3]);
  });

  it("固定项汇入 已固定 组置顶,不参与时间分桶", () => {
    const today = new Date(2026, 6, 14, 9, 0, 0).getTime();
    const older = new Date(2026, 6, 1, 0, 0, 0).getTime();

    const groups = groupHistory(
      [entry(1, today, true), entry(2, older, true), entry(3, today)],
      NOW,
    );
    expect(groups[0].label).toBe("已固定");
    expect(groups[0].entries.map((e) => e.id)).toEqual([1, 2]);
    // 非固定的今天项进入 今天 组
    expect(groups.find((g) => g.label === "今天")?.entries.map((e) => e.id)).toEqual([3]);
  });

  it("忽略没有任何条目的分组", () => {
    const today = new Date(2026, 6, 14, 9, 0, 0).getTime();
    const groups = groupHistory([entry(1, today)], NOW);
    expect(groups.map((g) => g.label)).toEqual(["今天"]);
  });

  it("保留每个分组内的输入顺序", () => {
    const t1 = new Date(2026, 6, 14, 11, 0, 0).getTime();
    const t2 = new Date(2026, 6, 14, 8, 0, 0).getTime();
    const groups = groupHistory([entry(5, t1), entry(9, t2)], NOW);
    expect(groups[0].entries.map((e) => e.id)).toEqual([5, 9]);
  });
});
