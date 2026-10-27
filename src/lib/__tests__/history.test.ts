import { describe, it, expect } from "vitest";
import { mergeSaved, previewOf } from "../history";
import type { HistoryEntry } from "../../types";

function entry(id: number, overrides: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    id,
    title: `t${id}`,
    language: "json",
    pinned: false,
    createdAt: 1,
    updatedAt: 2,
    size: 2,
    ...overrides,
  };
}

describe("previewOf", () => {
  it("折叠空白,避免多行正文把列表撑乱", () => {
    expect(previewOf('{\n  "a": 1\n}')).toBe('{ "a": 1 }');
  });

  it("按长度截断", () => {
    expect(previewOf("x".repeat(300), 10)).toHaveLength(10);
  });
});

describe("mergeSaved", () => {
  it("更新已有条目时原地替换,不重排(编辑时列表不跳)", () => {
    const before = [entry(1), entry(2), entry(3)];
    const after = mergeSaved(before, {
      id: 2, title: "t2", language: "json", content: '{"a":1}', updatedAt: 99,
    }, false);
    expect(after.map((e) => e.id)).toEqual([1, 2, 3]);
    expect(after[1].updatedAt).toBe(99);
    expect(after[1].size).toBe(7);
    expect(after[1].preview).toBe('{"a":1}');
  });

  it("新条目插到列表最前", () => {
    const before = [entry(1), entry(2)];
    const after = mergeSaved(before, {
      id: 9, title: "new", language: "json", content: "[]", updatedAt: 10,
    }, true);
    expect(after.map((e) => e.id)).toEqual([9, 1, 2]);
  });

  it("保存已有条目不覆盖原有 pinned 状态", () => {
    const before = [entry(1, { pinned: true })];
    const after = mergeSaved(before, {
      id: 1, title: "t1", language: "json", content: "{}", updatedAt: 5,
    }, false);
    expect(after[0].pinned).toBe(true);
  });

  it("未知 id 且非新增时保持原数组", () => {
    const before = [entry(1)];
    expect(mergeSaved(before, {
      id: 7, title: "x", language: "json", content: "{}", updatedAt: 5,
    }, false)).toBe(before);
  });
});
