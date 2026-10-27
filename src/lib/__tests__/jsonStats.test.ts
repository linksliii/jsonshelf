import { describe, it, expect } from "vitest";
import { formatBytes } from "../jsonStats";

describe("formatBytes", () => {
  it("formats sub-KB as N B", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1)).toBe("1 B");
    expect(formatBytes(1023)).toBe("1023 B");
  });
  it("formats KB/MB with one decimal", () => {
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(1024 * 1024 * 3)).toBe("3.0 MB");
  });
});
