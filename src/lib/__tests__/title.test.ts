import { describe, it, expect } from "vitest";
import { autoTitle, safeFileName } from "../title";

describe("autoTitle", () => {
  it("取 JSON 首个顶层键", () => {
    expect(autoTitle('{"name":"x","age":1}')).toBe("name");
  });
  it("数组给出元素计数摘要", () => {
    expect(autoTitle("[1,2,3]")).toBe("array[3]");
  });
  it("空/全空白内容回退为 Untitled", () => {
    expect(autoTitle("")).toBe("Untitled");
    expect(autoTitle("   \n\t  ")).toBe("Untitled");
  });
  it("非法 JSON 回退为内容预览(而非 Untitled)", () => {
    expect(autoTitle("{bad}")).toBe("{bad}");
  });
  it("多行/含空白内容折叠空白后取预览", () => {
    expect(autoTitle("hello\n  world\t!")).toBe("hello world !");
  });
  it("超长内容预览截断到 40 字符", () => {
    const long = "x".repeat(60);
    const t = autoTitle(long);
    expect(t.length).toBe(40);
    expect(t).toBe("x".repeat(40));
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
