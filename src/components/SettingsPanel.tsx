import { useEffect, useRef, useState } from "react";
import { formatHotkey, hotkeyFromEvent, parseHotkey } from "../lib/hotkeys";

type Which = "toggle" | "format" | "save" | "new" | "minimap";

interface Props {
  open: boolean;
  onClose: () => void;
  hotkeys: { toggle: string; format: string; save: string; new: string; minimap: string };
  onChangeHotkey: (which: Which, value: string) => void;
  hideOnBlur: boolean;
  onChangeHideOnBlur: (v: boolean) => void;
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

export default function SettingsPanel(props: Props) {
  const { open, onClose, hotkeys, onChangeHotkey, hideOnBlur, onChangeHideOnBlur } = props;
  const [recording, setRecording] = useState<Which | null>(null);
  // 用 ref 让全局 keydown 监听始终看到最新的 recording 值,避免陈旧闭包。
  const recordingRef = useRef<Which | null>(null);
  recordingRef.current = recording;

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const which = recordingRef.current;
      if (which) {
        // 录制中拦截按键:阻止冒泡,避免 Esc 触发 App 的隐藏窗口逻辑。
        e.preventDefault();
        e.stopPropagation();
        if (e.key === "Escape") { setRecording(null); return; }
        const hk = hotkeyFromEvent(e);
        if (!hk) return; // 纯修饰键,继续等待
        onChangeHotkey(which, formatHotkey(hk));
        setRecording(null);
        return;
      }
      // 打开但未录制:Esc 关闭面板(阻止冒泡,避免触发 App 隐藏窗口)。
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    // capture 阶段监听,确保先于 App 的 window keydown 处理 Esc。
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [open, recording, onChangeHotkey, onClose]);

  // 面板关闭时清理录制状态。
  useEffect(() => {
    if (!open) setRecording(null);
  }, [open]);

  if (!open) return null;

  return (
    <div className="settings-overlay" role="dialog" aria-label="设置">
      <div className="settings-panel">
        <div className="settings-header">
          <h2>设置</h2>
          <button className="settings-close" onClick={onClose} aria-label="关闭设置">×</button>
        </div>

        <div className="settings-section">
          <h3>快捷键</h3>
          {ROWS.map(({ which, label }) => {
            const isRecording = recording === which;
            return (
              <div className="settings-row" key={which}>
                <span className="settings-row-label">{label}</span>
                <span className="settings-hotkey">
                  {isRecording ? "按下快捷键…" : displayHotkey(hotkeys[which])}
                </span>
                <button
                  className="settings-record"
                  onClick={() => setRecording(isRecording ? null : which)}
                >
                  {isRecording ? "取消" : "录制"}
                </button>
              </div>
            );
          })}
        </div>

        <div className="settings-section">
          <label className="settings-row">
            <input
              type="checkbox"
              checked={hideOnBlur}
              onChange={(e) => onChangeHideOnBlur(e.target.checked)}
            />
            失焦时隐藏面板
          </label>
        </div>
      </div>
    </div>
  );
}
