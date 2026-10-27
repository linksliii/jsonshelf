import { formatBytes, type JSONStats } from "../lib/jsonStats";

interface Props {
  valid: boolean | null;
  stats: JSONStats;
  status: { kind: "ok" | "error" | "idle"; message: string };
}

export default function StatusBar({ valid, stats, status }: Props) {
  const hasContent = stats.bytes > 0;
  return (
    <footer className="statusbar">
      <div className="status-left">
        {valid === null ? (
          hasContent
            ? <span className="badge badge-muted" title="超过 400 KB 的文件不做实时语法校验，格式化/导出时仍会解析">未校验</span>
            : <span className="badge badge-muted">空</span>
        ) : (
          <span className={`badge ${valid ? "badge-ok" : "badge-bad"}`}>
            <i className="dot" />
            {valid ? "JSON 有效" : "语法有误"}
          </span>
        )}
        <span className="meta-sep" />
        <span className="meta">{formatBytes(stats.bytes)}</span>
        <span className="meta">{stats.lines} 行</span>
        {stats.keys !== null && <span className="meta">{stats.keys} 键</span>}
      </div>
      <div className="status-right">
        {status.message ? (
          <span className={`status-line status-${status.kind}`}>{status.message}</span>
        ) : (
          <span className="status-line status-idle">就绪</span>
        )}
      </div>
    </footer>
  );
}
