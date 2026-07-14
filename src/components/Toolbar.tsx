interface Props {
  language: string;
  onLanguageChange: (lang: string) => void;
  onFormat: () => void;
  onMinify: () => void;
  onSave: () => void;
  saveToHistory: boolean;
  onToggleSaveToHistory: (v: boolean) => void;
  status: { kind: "ok" | "error" | "idle"; message: string };
}

const LANGUAGES = ["json", "yaml", "html", "css", "javascript"];

export default function Toolbar(props: Props) {
  return (
    <div className="toolbar">
      <select value={props.language} onChange={(e) => props.onLanguageChange(e.target.value)}>
        {LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
      </select>
      <button onClick={props.onFormat}>格式化 (⇧⌥F)</button>
      <button onClick={props.onMinify}>压缩</button>
      <button onClick={props.onSave}>保存到文件 (⌘S)</button>
      <label>
        <input type="checkbox" checked={props.saveToHistory}
          onChange={(e) => props.onToggleSaveToHistory(e.target.checked)} />
        保存到历史
      </label>
      <span className={`status status-${props.status.kind}`}>{props.status.message}</span>
    </div>
  );
}
