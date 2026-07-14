import { describe, it, expect } from "vitest";
import { autoTitle } from "../title";

describe("autoTitle", () => {
  it("取 JSON 首个顶层键", () => {
    expect(autoTitle('{"name":"x","age":1}')).toBe("name");
  });
  it("数组给出元素计数摘要", () => {
    expect(autoTitle("[1,2,3]")).toBe("array[3]");
  });
  it("非法/空内容回退为 Untitled", () => {
    expect(autoTitle("")).toBe("Untitled");
    expect(autoTitle("{bad}")).toBe("Untitled");
  });
  it("超长键截断到 40 字符", () => {
    const longKey = "k".repeat(60);
    expect(autoTitle(`{"${longKey}":1}`).length).toBeLessThanOrEqual(40);
  });
});
