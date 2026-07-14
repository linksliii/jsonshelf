// 将 unix 毫秒时间戳格式化为本地时区的 "MM-DD HH:mm"(零填充、24 小时制)。
export function formatAbsTime(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
