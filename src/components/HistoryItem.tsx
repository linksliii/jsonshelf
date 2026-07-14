import { useState } from "react";
import type { HistoryEntry } from "../types";

interface Props {
  entry: HistoryEntry;
  onSelect: (e: HistoryEntry) => void;
  onRename: (id: number, title: string) => void;
  onTogglePin: (id: number, pinned: boolean) => void;
  onDelete: (id: number) => void;
}

export default function HistoryItem({ entry, onSelect, onRename, onTogglePin, onDelete }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(entry.title);

  return (
    <div className="history-item" onClick={() => onSelect(entry)}>
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
        <span className="title" onDoubleClick={(e) => { e.stopPropagation(); setEditing(true); }}>
          {entry.pinned ? <span className="pin-indicator" aria-hidden="true">📌 </span> : null}
          <span className="title-text">{entry.title}</span>
        </span>
      )}
      <button aria-label="固定" onClick={(e) => { e.stopPropagation(); onTogglePin(entry.id, !entry.pinned); }}>
        {entry.pinned ? "取消固定" : "固定"}
      </button>
      <button aria-label="删除" onClick={(e) => { e.stopPropagation(); onDelete(entry.id); }}>删除</button>
    </div>
  );
}
