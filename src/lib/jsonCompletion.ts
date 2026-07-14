import type { CompletionContext, CompletionResult } from "@codemirror/autocomplete";

// 基础、无 schema 的 JSON 补全:仅提供结构性字面量 true/false/null。
// 触发条件:光标正在输入一个词(matchBefore(/\w+/)),或用户显式触发补全。
// 保持轻量——不做键/值语义推断,自动闭合括号/引号交由 closeBrackets() 负责。
export function jsonCompletionSource(context: CompletionContext): CompletionResult | null {
  const word = context.matchBefore(/\w*/);
  if (!word) return null;
  // 非显式触发时,空词(如刚输入分隔符)不弹补全,避免噪音。
  if (word.from === word.to && !context.explicit) return null;
  return {
    from: word.from,
    options: [
      { label: "true", type: "keyword" },
      { label: "false", type: "keyword" },
      { label: "null", type: "keyword" },
    ],
  };
}
