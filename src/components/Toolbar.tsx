import { formatBytes, type JSONStats } from "../lib/jsonStats";

interface Props {
  language: string;
  onLanguageChange: (lang: string) => void;
  onFormat: () => void;
  onMinify: () => void;
  onSave: () => void;
  onCopy: () => void;
  onNew: () => void;
  saveToHistory: boolean;
  onToggleSaveToHistory: (v: boolean) => void;
  status: { kind: "ok" | "error" | "idle"; message: string };
  stats: JSONStats;
  valid: boolean | null;  // null = 空内容或非 JSON,不显示校验指示
  onOpenSettings: () => void;
}

const LANGUAGES = ["json", "yaml", "html", "css", "javascript", "plaintext"];

function statsText(stats: JSONStats): string {
  const parts = [`${formatBytes(stats.bytes)}`, `${stats.lines} 行`];
  if (stats.keys !== null) parts.push(`${stats.keys} 键`);
  return parts.join(" · ");
}

export default function Toolbar(props: Props) {
  return (
    <div className="toolbar">
      <select value={props.language} onChange={(e) => props.onLanguageChange(e.target.value)}>
        {LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
      </select>
      <button onClick={props.onNew}>新建</button>
      <button onClick={props.onFormat}>格式化 (⇧⌥F)</button>
      <button onClick={props.onMinify}>压缩</button>
      <button onClick={props.onCopy}>复制</button>
      <button onClick={props.onSave}>保存到文件 (⌘S)</button>
      <label>
        <input type="checkbox" checked={props.saveToHistory}
          onChange={(e) => props.onToggleSaveToHistory(e.target.checked)} />
        保存到历史
      </label>
      <span className={`status status-${props.status.kind}`}>{props.status.message}</span>
      {props.valid !== null && (
        <span className={`json-validity json-validity-${props.valid ? "ok" : "error"}`}>
          {props.valid ? "✓ 有效" : "✗ 无效"}
        </span>
      )}
      <span className="json-stats">{statsText(props.stats)}</span>
      <button className="toolbar-settings" onClick={props.onOpenSettings} aria-label="设置" title="设置">⚙</button>
    </div>
  );
}
