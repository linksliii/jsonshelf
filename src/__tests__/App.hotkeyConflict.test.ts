import { describe, it, expect } from "vitest";
import { hotkeyConflicts } from "../App";

describe("hotkeyConflicts", () => {
  it("与另一已绑定键相同(规范化后)判为冲突", () => {
    // "Cmd+S" 与 "Meta+S" 解析后等价
    expect(hotkeyConflicts("Cmd+S", ["Meta+S", "Shift+Alt+F"])).toBe(true);
  });

  it("不同组合不冲突", () => {
    expect(hotkeyConflicts("Alt+Cmd+J", ["Shift+Alt+F", "Cmd+S"])).toBe(false);
  });

  it("修饰键顺序/别名不同但等价仍冲突", () => {
    expect(hotkeyConflicts("Cmd+Alt+J", ["Alt+Cmd+J"])).toBe(true);
  });

  it("value 无法解析时视为无冲突", () => {
    expect(hotkeyConflicts("Ctrl+Shift", ["Cmd+S"])).toBe(false);
  });

  it("others 中不可解析项被忽略", () => {
    expect(hotkeyConflicts("Cmd+S", ["Ctrl+Shift", "Cmd+S"])).toBe(true);
  });
});
