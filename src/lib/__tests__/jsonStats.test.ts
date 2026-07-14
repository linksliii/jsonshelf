import { describe, it, expect } from "vitest";
import { jsonStats, formatBytes, isValidJSON } from "../jsonStats";

describe("jsonStats", () => {
  it("counts UTF-8 bytes for ascii", () => {
    expect(jsonStats("abc").bytes).toBe(3);
  });

  it("counts UTF-8 bytes for multibyte chars", () => {
    // "中" is 3 bytes in UTF-8
    expect(jsonStats("中").bytes).toBe(3);
    expect(jsonStats("中文").bytes).toBe(6);
  });

  it("empty string → 0 bytes and 0 lines", () => {
    const s = jsonStats("");
    expect(s.bytes).toBe(0);
    expect(s.lines).toBe(0);
  });

  it("counts lines by newlines", () => {
    expect(jsonStats("a").lines).toBe(1);
    expect(jsonStats("a\nb").lines).toBe(2);
    expect(jsonStats("a\nb\nc").lines).toBe(3);
    // trailing newline yields an extra (empty) line
    expect(jsonStats("a\n").lines).toBe(2);
  });

  it("counts top-level keys for an object", () => {
    expect(jsonStats('{"a":1,"b":2,"c":3}').keys).toBe(3);
    expect(jsonStats("{}").keys).toBe(0);
  });

  it("counts elements for an array", () => {
    expect(jsonStats("[1,2,3,4]").keys).toBe(4);
    expect(jsonStats("[]").keys).toBe(0);
  });

  it("keys is null for invalid JSON", () => {
    expect(jsonStats("{not json}").keys).toBeNull();
    expect(jsonStats("").keys).toBeNull();
  });

  it("keys is null for a JSON primitive", () => {
    expect(jsonStats("42").keys).toBeNull();
    expect(jsonStats('"hello"').keys).toBeNull();
    expect(jsonStats("true").keys).toBeNull();
    expect(jsonStats("null").keys).toBeNull();
  });
});

describe("isValidJSON", () => {
  it("true for valid JSON of any kind", () => {
    expect(isValidJSON('{"a":1}')).toBe(true);
    expect(isValidJSON("[1,2]")).toBe(true);
    expect(isValidJSON("42")).toBe(true);
    expect(isValidJSON('"x"')).toBe(true);
    expect(isValidJSON("null")).toBe(true);
  });

  it("false for invalid JSON", () => {
    expect(isValidJSON("{oops}")).toBe(false);
    expect(isValidJSON("")).toBe(false);
    expect(isValidJSON("undefined")).toBe(false);
  });
});

describe("formatBytes", () => {
  it("formats sub-KB as N B", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1)).toBe("1 B");
    expect(formatBytes(1023)).toBe("1023 B");
  });

  it("formats KB with one decimal", () => {
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
  });

  it("formats MB with one decimal", () => {
    expect(formatBytes(1024 * 1024)).toBe("1.0 MB");
    expect(formatBytes(1024 * 1024 * 3)).toBe("3.0 MB");
  });
});
