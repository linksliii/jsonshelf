import { useEffect, useState } from "react";
import type { HistoryEntry } from "../types";
import { relativeTime } from "../lib/relativeTime";

interface Props {
  entry: HistoryEntry;
  selected: boolean;
  onSelect: (e: HistoryEntry) => void;
  onRename: (id: number, title: string) => void;
  onTogglePin: (id: number, pinned: boolean) => void;
  onDelete: (id: number) => void;
  onCopyContent: (e: HistoryEntry) => void;
}

export default function HistoryItem({
  entry, selected, onSelect, onRename, onTogglePin, onDelete, onCopyContent,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(entry.title);
  // 右键菜单相对视口的坐标;null 表示未打开。
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  // 菜单打开时,点击别处或 Esc 关闭。Esc 需 stopPropagation,避免连带触发 App 的隐藏窗口。
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); e.preventDefault(); setMenu(null); }
    };
    window.addEventListener("click", close);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [menu]);

  const startRename = () => { setDraft(entry.title); setEditing(true); };

  return (
    <div
      className={`history-item${selected ? " selected" : ""}`}
      onClick={() => onSelect(entry)}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setMenu({ x: e.clientX, y: e.clientY }); }}
    >
      {editing ? (
        <input
          aria-label="重命名"
          value={draft}
          autoFocus
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => { setEditing(false); if (draft.trim()) onRename(entry.id, draft.trim()); }}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        />
      ) : (
        <span className="title" onDoubleClick={(e) => { e.stopPropagation(); startRename(); }}>
          <span className="title-row">
            {entry.pinned ? <span className="pin-indicator" aria-hidden="true">📌 </span> : null}
            <span className="title-text">{entry.title}</span>
          </span>
          <span className="history-time">{relativeTime(entry.updatedAt, Date.now())}</span>
        </span>
      )}
      <button aria-label="固定" onClick={(e) => { e.stopPropagation(); onTogglePin(entry.id, !entry.pinned); }}>
        {entry.pinned ? "取消固定" : "固定"}
      </button>
      <button aria-label="删除" onClick={(e) => { e.stopPropagation(); onDelete(entry.id); }}>删除</button>

      {menu ? (
        <div
          className="history-context-menu"
          role="menu"
          style={{ left: menu.x, top: menu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button role="menuitem" onClick={() => { setMenu(null); startRename(); }}>重命名</button>
          <button role="menuitem" onClick={() => { setMenu(null); onCopyContent(entry); }}>复制内容</button>
          <button role="menuitem" onClick={() => { setMenu(null); onTogglePin(entry.id, !entry.pinned); }}>
            {entry.pinned ? "取消固定" : "固定"}
          </button>
          <button role="menuitem" onClick={() => { setMenu(null); onDelete(entry.id); }}>删除</button>
        </div>
      ) : null}
    </div>
  );
}
