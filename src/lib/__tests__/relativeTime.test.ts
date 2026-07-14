import { describe, it, expect } from "vitest";
import { relativeTime } from "../relativeTime";

const NOW = 1_000_000_000_000;

describe("relativeTime", () => {
  it("30 秒内为 刚刚", () => {
    expect(relativeTime(NOW - 30_000, NOW)).toBe("刚刚");
  });
  it("分钟", () => {
    expect(relativeTime(NOW - 5 * 60_000, NOW)).toBe("5分钟前");
  });
  it("小时", () => {
    expect(relativeTime(NOW - 3 * 3_600_000, NOW)).toBe("3小时前");
  });
  it("天", () => {
    expect(relativeTime(NOW - 2 * 86_400_000, NOW)).toBe("2天前");
  });
  it("月", () => {
    expect(relativeTime(NOW - 60 * 86_400_000, NOW)).toBe("2个月前");
  });
  it("未来时间戳视为刚刚", () => {
    expect(relativeTime(NOW + 10_000, NOW)).toBe("刚刚");
  });
});
