import type { CompletionContext, CompletionResult } from "@codemirror/autocomplete";

// 基础、无 schema 的 JSON 补全:仅提供结构性字面量 true/false/null。
// 超大文档直接不弹,避免补全扫描拖慢输入。
export function jsonCompletionSource(context: CompletionContext): CompletionResult | null {
  if ((context.state?.doc?.length ?? 0) > 400_000) return null;
  const word = context.matchBefore(/\w*/);
  if (!word) return null;
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
