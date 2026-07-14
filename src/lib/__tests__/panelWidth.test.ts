import { describe, it, expect } from "vitest";
import { clampWidth, PANEL_MIN, PANEL_MAX } from "../panelWidth";

describe("clampWidth", () => {
  it("低于 MIN 收敛到 MIN", () => {
    expect(clampWidth(0)).toBe(PANEL_MIN);
    expect(clampWidth(PANEL_MIN - 1)).toBe(PANEL_MIN);
  });
  it("高于 MAX 收敛到 MAX", () => {
    expect(clampWidth(9999)).toBe(PANEL_MAX);
    expect(clampWidth(PANEL_MAX + 1)).toBe(PANEL_MAX);
  });
  it("区间内原样返回", () => {
    expect(clampWidth(260)).toBe(260);
    expect(clampWidth(PANEL_MIN)).toBe(PANEL_MIN);
    expect(clampWidth(PANEL_MAX)).toBe(PANEL_MAX);
  });
});
