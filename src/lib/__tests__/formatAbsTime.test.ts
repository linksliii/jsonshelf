import { describe, it, expect } from "vitest";
import { formatAbsTime } from "../formatAbsTime";

describe("formatAbsTime", () => {
  // 用本地 Date 构造输入,期望值也由本地字段推导,保证跨时区一致。
  it("格式化为 MM-DD HH:mm(零填充、24 小时、本地时区)", () => {
    const ts = new Date(2026, 0, 5, 9, 3).getTime(); // 本地 2026-01-05 09:03
    expect(formatAbsTime(ts)).toBe("01-05 09:03");
  });
  it("双位数月/日/时/分不额外填充", () => {
    const ts = new Date(2026, 10, 23, 14, 45).getTime(); // 本地 2026-11-23 14:45
    expect(formatAbsTime(ts)).toBe("11-23 14:45");
  });
  it("零点/整点零填充", () => {
    const ts = new Date(2026, 5, 1, 0, 0).getTime(); // 本地 2026-06-01 00:00
    expect(formatAbsTime(ts)).toBe("06-01 00:00");
  });
});
