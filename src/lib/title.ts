// 将历史标题转为安全文件名:替换文件名非法字符(/ \ : * ? " < > |)为下划线,
// 去除首尾空白;若清洗后为空则回退 "untitled"。不含扩展名,由调用方追加 .json。
export function safeFileName(title: string): string {
  const cleaned = title.replace(/[/\\:*?"<>|]/g, "_").trim();
  return cleaned === "" ? "untitled" : cleaned;
}

export function autoTitle(content: string): string {
  // 大文件只扫开头找第一个 key,避免为了标题把整篇 10MB JSON parse 成对象。
  if (content.length > 200_000) {
    const head = content.slice(0, 4096);
    const m = /^\s*\{\s*"((?:[^"\\]|\\.){1,120})"/.exec(head);
    if (m) return m[1].slice(0, 40);
    return contentPreview(head);
  }
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) return `array[${parsed.length}]`;
    if (parsed && typeof parsed === "object") {
      const keys = Object.keys(parsed);
      if (keys.length > 0) return keys[0].slice(0, 40);
    }
    // JSON 基本类型(字符串/数字/null 等)或空对象:走内容预览回退。
    return contentPreview(content);
  } catch {
    // 非法 JSON:同样回退到内容预览。
    return contentPreview(content);
  }
}

// 折叠空白后取前 40 字符作为标题;全空白/空内容回退 "Untitled"。
function contentPreview(content: string): string {
  const preview = content.replace(/\s+/g, " ").trim().slice(0, 40);
  return preview === "" ? "Untitled" : preview;
}