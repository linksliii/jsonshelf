import { useEffect, useRef, useState } from "react";
import { formatHotkey, hotkeyFromEvent, hotkeysEqual, parseHotkey } from "../lib/hotkeys";
import type { ShortcutStatus } from "../lib/ipc";
import AppMark from "./AppMark";
import Icon from "./Icons";

type Which = "toggle" | "format" | "save" | "new" | "minimap";

interface Props {
  open: boolean;
  onClose: () => void;
  hotkeys: { toggle: string; format: string; save: string; new: string; minimap: string };
  onChangeHotkey: (which: Which, value: string) => void;
  hideOnBlur: boolean;
  onChangeHideOnBlur: (v: boolean) => void;
  showMinimap?: boolean;
  onChangeShowMinimap?: (v: boolean) => void;
  wordWrap?: boolean;
  onChangeWordWrap?: (v: boolean) => void;
  appearance?: "glass" | "solid";
  onChangeAppearance?: (v: "glass" | "solid") => void;
  glassKind?: "liquid" | "vibrancy" | "none";
  shortcutStatus?: ShortcutStatus | null;
  onRetryShortcut?: () => void;
}

const ROWS: { which: Which; label: string }[] = [
  { which: "toggle", label: "呼出面板" },
  { which: "format", label: "格式化" },
  { which: "save", label: "保存到文件" },
  { which: "new", label: "新建" },
  { which: "minimap", label: "缩略图" },
];

// 尽量以规范形式展示;若存储值无法解析则原样显示。
function displayHotkey(raw: string): string {
  const h = parseHotkey(raw);
  return h ? formatHotkey(h) : raw;
}

const GLASS_LABEL: Record<string, string> = {
  liquid: "系统原生液态玻璃",
  vibrancy: "系统毛玻璃",
  none: "当前系统不支持",
};

export default function SettingsPanel(props: Props) {
  const {
    open, onClose, hotkeys, onChangeHotkey, hideOnBlur, onChangeHideOnBlur,
    showMinimap = true, onChangeShowMinimap,
    wordWrap = true, onChangeWordWrap,
    appearance = "glass", onChangeAppearance,
    glassKind = "none", shortcutStatus = null, onRetryShortcut,
  } = props;
  const [recording, setRecording] = useState<Which | null>(null);
  const recordingRef = useRef<Which | null>(null);
  recordingRef.current = recording;

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const which = recordingRef.current;
      if (which) {
        e.preventDefault();
        e.stopPropagation();
        if (e.key === "Escape") { setRecording(null); return; }
        const hk = hotkeyFromEvent(e);
        if (!hk) return;
        onChangeHotkey(which, formatHotkey(hk));
        setRecording(null);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [open, recording, onChangeHotkey, onClose]);

  useEffect(() => {
    if (!open) setRecording(null);
  }, [open]);

  if (!open) return null;

  // 状态里记录的是"实际注册成功的键";和界面上的呼出键不一致时同样算未生效。
  const toggleParsed = parseHotkey(hotkeys.toggle);
  const statusParsed = shortcutStatus ? parseHotkey(shortcutStatus.accelerator) : null;
  const toggleActive = Boolean(
    shortcutStatus?.registered && toggleParsed && statusParsed
    && hotkeysEqual(toggleParsed, statusParsed),
  );
  const shortcutBroken = shortcutStatus != null && !toggleActive;

  return (
    <div
      className="settings-overlay"
      role="dialog"
      aria-label="设置"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="settings-panel">
        <div className="settings-header">
          <div className="settings-title">
            <span className="settings-mark"><AppMark size={26} /></span>
            <h2>设置</h2>
          </div>
          <button className="settings-close" onClick={onClose} aria-label="关闭设置">
            <Icon name="x" size={15} />
          </button>
        </div>

        <div className="settings-section">
          <h3>快捷键</h3>
          {ROWS.map(({ which, label }) => {
            const isRecording = recording === which;
            return (
              <div className="settings-row" key={which}>
                <span className="settings-row-label">{label}</span>
                <span className={`settings-hotkey${isRecording ? " is-recording" : ""}`}>
                  {isRecording ? "按下快捷键…" : displayHotkey(hotkeys[which])}
                </span>
                {which === "toggle" && shortcutStatus ? (
                  <span className={`hk-status ${toggleActive ? "ok" : "bad"}`}>
                    {toggleActive ? "已生效" : "未生效"}
                  </span>
                ) : null}
                <button
                  className="settings-record"
                  onClick={() => setRecording(isRecording ? null : which)}
                >
                  {isRecording ? "取消" : "录制"}
                </button>
              </div>
            );
          })}
          {shortcutBroken ? (
            <div className="settings-hint">
              <Icon name="x" size={12} />
              <span>呼出键被别的应用占用了，换一个或者重试。</span>
              {onRetryShortcut ? (
                <button className="link-button" onClick={onRetryShortcut}>重试</button>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="settings-section">
          <h3>外观与行为</h3>
          <div className="settings-row">
            <span className="settings-row-label">背景</span>
            <div className="segmented" role="group" aria-label="背景效果">
              <button
                className={appearance === "glass" ? "is-active" : ""}
                disabled={glassKind === "none"}
                onClick={() => onChangeAppearance?.("glass")}
              >
                液态玻璃
              </button>
              <button
                className={appearance === "solid" ? "is-active" : ""}
                onClick={() => onChangeAppearance?.("solid")}
              >
                纯色
              </button>
            </div>
          </div>
          <div className="settings-note">{GLASS_LABEL[glassKind]}</div>

          <div className="settings-row">
            <span className="settings-row-label">缩略图</span>
            <button
              role="switch"
              aria-checked={showMinimap}
              aria-label="缩略图"
              className={`toggle-switch${showMinimap ? " is-on" : ""}`}
              onClick={() => onChangeShowMinimap?.(!showMinimap)}
            >
              <span className="toggle-thumb" />
            </button>
            <span className="settings-note inline">超大文件会自动隐藏</span>
          </div>

          <div className="settings-row">
            <span className="settings-row-label">自动换行</span>
            <button
              role="switch"
              aria-checked={wordWrap}
              aria-label="自动换行"
              className={`toggle-switch${wordWrap ? " is-on" : ""}`}
              onClick={() => onChangeWordWrap?.(!wordWrap)}
            >
              <span className="toggle-thumb" />
            </button>
            <span className="settings-note inline">长 JSON 不再横向滚动</span>
          </div>

          <label className="settings-row settings-checkbox">
            <input
              type="checkbox"
              checked={hideOnBlur}
              onChange={(e) => onChangeHideOnBlur(e.target.checked)}
            />
            <span>失焦时自动隐藏面板</span>
          </label>
        </div>

        <div className="settings-footer">
          <span>JSONShelf 0.2.0</span>
          <span className="settings-footer-dot" />
          <span>数据只存在本机</span>
        </div>
      </div>
    </div>
  );
}