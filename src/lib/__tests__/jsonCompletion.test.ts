import { describe, it, expect } from "vitest";
import type { CompletionContext } from "@codemirror/autocomplete";
import { jsonCompletionSource } from "../jsonCompletion";

// 用最小的 CompletionContext 桩测试纯逻辑:matchBefore + explicit 分支。
function ctx(match: { from: number; to: number; text: string } | null, explicit = false): CompletionContext {
  return { matchBefore: () => match, explicit } as unknown as CompletionContext;
}

describe("jsonCompletionSource", () => {
  it("输入词时提供 true/false/null", () => {
    const res = jsonCompletionSource(ctx({ from: 0, to: 1, text: "t" }));
    expect(res).not.toBeNull();
    expect(res!.options.map((o) => o.label)).toEqual(["true", "false", "null"]);
    expect(res!.from).toBe(0);
  });

  it("空词且非显式触发时不弹补全", () => {
    expect(jsonCompletionSource(ctx({ from: 3, to: 3, text: "" }))).toBeNull();
  });

  it("空词但显式触发时仍提供字面量", () => {
    const res = jsonCompletionSource(ctx({ from: 3, to: 3, text: "" }, true));
    expect(res).not.toBeNull();
    expect(res!.options).toHaveLength(3);
  });

  it("matchBefore 返回 null 时返回 null", () => {
    expect(jsonCompletionSource(ctx(null))).toBeNull();
  });
});
