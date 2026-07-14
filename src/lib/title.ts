// 将历史标题转为安全文件名:替换文件名非法字符(/ \ : * ? " < > |)为下划线,
// 去除首尾空白;若清洗后为空则回退 "untitled"。不含扩展名,由调用方追加 .json。
export function safeFileName(title: string): string {
  const cleaned = title.replace(/[/\\:*?"<>|]/g, "_").trim();
  return cleaned === "" ? "untitled" : cleaned;
}

export function autoTitle(content: string): string {
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) return `array[${parsed.length}]`;
    if (parsed && typeof parsed === "object") {
      const keys = Object.keys(parsed);
      if (keys.length > 0) return keys[0].slice(0, 40);
    }
    return "Untitled";
  } catch {
    return "Untitled";
  }
}
