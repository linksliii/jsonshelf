import { useEffect, useState } from "react";
import type { HistoryEntry } from "../types";
import { formatAbsTime } from "../lib/formatAbsTime";
import { formatBytes } from "../lib/jsonStats";
import Icon from "./Icons";

interface Props {
  entry: HistoryEntry;
  selected: boolean;
  menuPos: { x: number; y: number } | null;
  onOpenMenu: (id: number, pos: { x: number; y: number }) => void;
  onCloseMenu: () => void;
  onSelect: (e: HistoryEntry) => void;
  onRename: (id: number, title: string) => void;
  onTogglePin: (id: number, pinned: boolean) => void;
  onDelete: (id: number) => void;
  onCopyContent: (e: HistoryEntry) => void;
}

export default function HistoryItem({
  entry, selected, menuPos, onOpenMenu, onCloseMenu,
  onSelect, onRename, onTogglePin, onDelete, onCopyContent,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(entry.title);
  const menu = menuPos;

  useEffect(() => {
    if (!menu) return;
    const close = () => onCloseMenu();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); e.preventDefault(); onCloseMenu(); }
    };
    window.addEventListener("click", close);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [menu, onCloseMenu]);

  const startRename = () => { setDraft(entry.title); setEditing(true); };

  return (
    <div
      className={`history-item${selected ? " selected" : ""}`}
      onClick={() => !editing && onSelect(entry)}
      onKeyDown={(e) => {
        if (editing) return;
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(entry); }
      }}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onOpenMenu(entry.id, { x: e.clientX, y: e.clientY }); }}
      role="button"
      tabIndex={0}
    >
      <span className="history-item-main">
        {editing ? (
          <input
            aria-label="重命名"
            value={draft}
            autoFocus
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => { setEditing(false); if (draft.trim()) onRename(entry.id, draft.trim()); }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") { e.stopPropagation(); setEditing(false); }
            }}
          />
        ) : (
          <span className="title" onDoubleClick={(e) => { e.stopPropagation(); startRename(); }}>
            <span className="title-row">
              {entry.pinned ? <Icon name="pin" size={11} className="pin-indicator" /> : null}
              <span className="title-text">{entry.title}</span>
            </span>
            <span className="history-meta">
              <span>{formatAbsTime(entry.updatedAt)}</span>
              {typeof entry.size === "number" && entry.size > 0 ? (
                <>
                  <span className="meta-dot" />
                  <span>{formatBytes(entry.size)}</span>
                </>
              ) : null}
            </span>
          </span>
        )}
      </span>

      <span className="history-item-actions">
        <button
          aria-label="固定"
          title={entry.pinned ? "取消固定" : "固定"}
          onClick={(e) => { e.stopPropagation(); onTogglePin(entry.id, !entry.pinned); }}
        >
          <Icon name="pin" size={13} />
        </button>
        <button
          aria-label="删除"
          title="删除"
          onClick={(e) => { e.stopPropagation(); onDelete(entry.id); }}
        >
          <Icon name="trash" size={13} />
        </button>
      </span>

      {menu ? (
        <div
          className="context-menu"
          role="menu"
          style={{ left: menu.x, top: menu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button role="menuitem" onClick={() => { onCloseMenu(); startRename(); }}>
            <Icon name="file" size={13} /> 重命名
          </button>
          <button role="menuitem" onClick={() => { onCloseMenu(); onCopyContent(entry); }}>
            <Icon name="copy" size={13} /> 复制内容
          </button>
          <button role="menuitem" onClick={() => { onCloseMenu(); onTogglePin(entry.id, !entry.pinned); }}>
            <Icon name="pin" size={13} /> {entry.pinned ? "取消固定" : "固定"}
          </button>
          <span className="context-sep" />
          <button role="menuitem" className="danger" onClick={() => { onCloseMenu(); onDelete(entry.id); }}>
            <Icon name="trash" size={13} /> 删除
          </button>
        </div>
      ) : null}
    </div>
  );
}
