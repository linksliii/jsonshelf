import Icon, { type IconName } from "./Icons";

interface Props {
  onFormat: () => void;
  onMinify: () => void;
  onSave: () => void;
  onCopy: () => void;
  onNew: () => void;
  saveToHistory: boolean;
  onToggleSaveToHistory: (v: boolean) => void;
  formatHint: string;
  saveHint: string;
  newHint: string;
  empty: boolean;
}

interface ActionProps {
  icon: IconName;
  label: string;
  hint?: string;
  onClick: () => void;
  disabled?: boolean;
}

function Action({ icon, label, hint, onClick, disabled }: ActionProps) {
  return (
    <button
      className="action"
      onClick={onClick}
      disabled={disabled}
      title={hint ? `${label} · ${hint}` : label}
    >
      <Icon name={icon} size={15} />
      <span>{label}</span>
    </button>
  );
}

export default function Toolbar(props: Props) {
  return (
    <div className="actionbar">
      <div className="action-group">
        <Action icon="plus" label="新建" hint={props.newHint} onClick={props.onNew} />
        <Action icon="sparkle" label="格式化" hint={props.formatHint}
          onClick={props.onFormat} disabled={props.empty} />
        <Action icon="collapse" label="压缩" onClick={props.onMinify} disabled={props.empty} />
        <Action icon="copy" label="复制" onClick={props.onCopy} disabled={props.empty} />
        <Action icon="download" label="导出" hint={props.saveHint}
          onClick={props.onSave} disabled={props.empty} />
      </div>

      <div className="actionbar-right">
        <label className="switch" title="自动把编辑内容存进历史">
          <input
            type="checkbox"
            checked={props.saveToHistory}
            onChange={(e) => props.onToggleSaveToHistory(e.target.checked)}
          />
          <span className="switch-track" aria-hidden="true"><span className="switch-thumb" /></span>
          <span className="switch-label">存入历史</span>
        </label>
      </div>
    </div>
  );
}
