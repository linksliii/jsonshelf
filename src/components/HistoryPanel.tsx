import { useCallback, useEffect, useRef, useState } from "react";
import type { HistoryEntry } from "../types";
import { groupHistory } from "../lib/groupHistory";
import HistoryItem from "./HistoryItem";

interface Props {
  entries: HistoryEntry[];
  selectedId: number | null;
  onSelect: (e: HistoryEntry) => void;
  onRename: (id: number, title: string) => void;
  onTogglePin: (id: number, pinned: boolean) => void;
  onDelete: (id: number) => void;
  onCopyContent: (e: HistoryEntry) => void;
  onSearch: (keyword: string) => void;
}

export default function HistoryPanel(props: Props) {
  const [kw, setKw] = useState("");
  // 单一管理"当前打开哪个条目的右键菜单及其坐标",保证同时只有一个菜单。
  // 右键任一行时先把 openMenu 指向该行,旧行 menuPos 自然变 null 并收起。
  const [openMenu, setOpenMenu] = useState<{ id: number; x: number; y: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => props.onSearch(kw), 200);
    return () => { if (timer.current) clearTimeout(timer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kw]);

  const openMenuAt = useCallback((id: number, pos: { x: number; y: number }) => {
    setOpenMenu({ id, x: pos.x, y: pos.y });
  }, []);
  const closeMenu = useCallback(() => setOpenMenu(null), []);

  const groups = groupHistory(props.entries, Date.now());

  return (
    <aside className="history-panel">
      <input
        className="history-search"
        placeholder="搜索历史…"
        value={kw}
        onChange={(e) => setKw(e.target.value)}
      />
      <div className="history-list">
        {groups.map((group) => (
          <div key={group.label} className="history-group">
            <div className="history-group-label">{group.label}</div>
            {group.entries.map((entry) => (
              <HistoryItem
                key={entry.id}
                entry={entry}
                selected={entry.id === props.selectedId}
                menuPos={openMenu?.id === entry.id ? { x: openMenu.x, y: openMenu.y } : null}
                onOpenMenu={openMenuAt}
                onCloseMenu={closeMenu}
                onSelect={props.onSelect}
                onRename={props.onRename}
                onTogglePin={props.onTogglePin}
                onDelete={props.onDelete}
                onCopyContent={props.onCopyContent}
              />
            ))}
          </div>
        ))}
      </div>
    </aside>
  );
}
