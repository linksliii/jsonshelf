import { describe, it, expect } from "vitest";
import { fuzzyRank } from "../fuzzy";
import type { HistoryEntry } from "../../types";

const mk = (id: number, title: string, content = ""): HistoryEntry => ({
  id, title, content, language: "json", pinned: false, createdAt: 0, updatedAt: id,
});

describe("fuzzyRank", () => {
  const items = [mk(1, "user_name"), mk(2, "product list"), mk(3, "config", '{"user":1}')];

  it("空 query 原样返回", () => {
    expect(fuzzyRank(items, "").map(r => r.entry.id)).toEqual([1, 2, 3]);
  });
  it("子序列模糊命中 title", () => {
    const ids = fuzzyRank(items, "usrnm").map(r => r.entry.id);
    expect(ids).toContain(1);
  });
  it("命中 content", () => {
    const ids = fuzzyRank(items, "user").map(r => r.entry.id);
    expect(ids).toContain(3);
  });
  it("无匹配返回空", () => {
    expect(fuzzyRank(items, "zzzzz")).toEqual([]);
  });
});
