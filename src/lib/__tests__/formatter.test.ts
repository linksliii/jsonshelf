import { describe, it, expect } from "vitest";
import { formatJSON, minifyJSON } from "../formatter";

describe("formatJSON", () => {
  it("缩进 2 空格格式化", () => {
    expect(formatJSON('{"a":1}')).toBe('{\n  "a": 1\n}');
  });
  it("非法 JSON 抛带位置的错误", () => {
    expect(() => formatJSON("{bad}")).toThrow();
  });
  it("空字符串抛错", () => {
    expect(() => formatJSON("")).toThrow();
  });
});

describe("minifyJSON", () => {
  it("压缩去除空白", () => {
    expect(minifyJSON('{\n  "a": 1\n}')).toBe('{"a":1}');
  });
  it("非法 JSON 抛错", () => {
    expect(() => minifyJSON("{bad}")).toThrow();
  });
});
