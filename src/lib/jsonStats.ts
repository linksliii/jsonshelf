export interface JSONStats {
  bytes: number;
  lines: number;
  keys: number | null;
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
