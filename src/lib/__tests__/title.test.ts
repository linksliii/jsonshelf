import { describe, it, expect } from "vitest";
import { autoTitle, safeFileName } from "../title";

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

describe("safeFileName", () => {
  it("保留普通名称", () => {
    expect(safeFileName("my-config")).toBe("my-config");
    expect(safeFileName("用户列表 2024")).toBe("用户列表 2024");
  });
  it("替换文件名非法字符为下划线", () => {
    expect(safeFileName('a/b\\c:d*e?f"g<h>i|j')).toBe("a_b_c_d_e_f_g_h_i_j");
  });
  it("去除首尾空白", () => {
    expect(safeFileName("  spaced  ")).toBe("spaced");
  });
  it("清洗后为空回退 untitled", () => {
    expect(safeFileName("")).toBe("untitled");
    expect(safeFileName("   ")).toBe("untitled");
    expect(safeFileName("///")).toBe("___");
  });
});
