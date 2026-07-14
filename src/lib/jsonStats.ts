// JSON 统计与格式化的纯函数,便于单测。

export interface JSONStats {
  bytes: number;         // UTF-8 字节数
  lines: number;         // 行数(空串为 0,末尾换行计入额外空行)
  keys: number | null;   // 顶层键/元素数;非对象/数组或无效 JSON 为 null
}

// 计算内容的字节数、行数与顶层键数。TextEncoder 是确定性的,函数仍为纯函数。
export function jsonStats(content: string): JSONStats {
  const bytes = new TextEncoder().encode(content).length;
  const lines = content === "" ? 0 : content.split("\n").length;

  let keys: number | null = null;
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) keys = parsed.length;
    else if (parsed !== null && typeof parsed === "object") keys = Object.keys(parsed).length;
    // 原始值(数字/字符串/布尔/null)保持 keys = null
  } catch {
    keys = null;
  }
  return { bytes, lines, keys };
}

// 是否为合法 JSON(任意类型,含原始值)。
export function isValidJSON(content: string): boolean {
  try {
    JSON.parse(content);
    return true;
  } catch {
    return false;
  }
}

// 人类可读字节:<1024 → "N B";否则按 KB/MB/... 保留一位小数。
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let val = n / 1024;
  let i = 0;
  while (val >= 1024 && i < units.length - 1) {
    val /= 1024;
    i++;
  }
  return `${val.toFixed(1)} ${units[i]}`;
}
