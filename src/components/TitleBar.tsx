import AppMark from "./AppMark";
import Icon from "./Icons";

interface Props {
  panelHidden: boolean;
  onTogglePanel: () => void;
  onOpenSettings: () => void;
  toggleHint: string;
}

export default function TitleBar({
  panelHidden, onTogglePanel, onOpenSettings, toggleHint,
}: Props) {
  return (
    <header className="titlebar" data-tauri-drag-region="deep">
      <div className="traffic-spacer" />
      <div className="brand">
        <span className="brand-mark"><AppMark size={24} /></span>
        <span className="brand-name">JSONShelf</span>
      </div>
      <div className="titlebar-grow" />

      <span className="lang-pill is-static" title="JSON 语法">JSON</span>

      <button
        className={`icon-button${panelHidden ? "" : " is-on"}`}
        onClick={onTogglePanel}
        aria-label="历史面板"
        title={`历史面板 · ${toggleHint}`}
      >
        <Icon name="sidebar" size={16} />
      </button>
      <button
        className="icon-button"
        onClick={onOpenSettings}
        aria-label="设置"
        title="设置 ⌘,"
      >
        <Icon name="sliders" size={16} />
      </button>
    </header>
  );
}