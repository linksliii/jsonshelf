import { useCallback, useEffect, useRef, useState } from "react";
import type { HistoryEntry } from "../types";
import { groupHistory } from "../lib/groupHistory";
import HistoryItem from "./HistoryItem";
import Icon from "./Icons";
import AppMark from "./AppMark";

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
  const [openMenu, setOpenMenu] = useState<{ id: number; x: number; y: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => props.onSearch(kw), 200);
    return () => { if (timer.current) clearTimeout(timer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kw]);

  const openMenuAt = useCallback((id: number, pos: { x: number; y: number }) => {
    // 简单夹紧,避免贴近右/下边缘时菜单被裁掉。
    const x = Math.min(pos.x, Math.max(8, window.innerWidth - 168));
    const y = Math.min(pos.y, Math.max(8, window.innerHeight - 168));
    setOpenMenu({ id, x, y });
  }, []);
  const closeMenu = useCallback(() => setOpenMenu(null), []);

  const groups = groupHistory(props.entries, Date.now());

  return (
    <aside className="history-panel">
      <div className="history-head">
        <span className="history-heading">历史</span>
        <span className="history-count">{props.entries.length}</span>
      </div>

      <div className="panel-search">
        <Icon name="search" size={13} className="panel-search-icon" />
        <input
          className="history-search"
          placeholder="搜索历史…"
          aria-label="搜索历史"
          value={kw}
          onChange={(e) => setKw(e.target.value)}
        />
        {kw ? (
          <button
            className="search-clear"
            aria-label="清空搜索"
            onClick={() => { setKw(""); props.onSearch(""); }}
          >
            <Icon name="x" size={11} />
          </button>
        ) : null}
      </div>

      {props.entries.length === 0 ? (
        <div className="history-empty">
          <div className="history-empty-mark"><AppMark size={30} /></div>
          <p>{kw ? "没有匹配的历史" : "还没有历史"}</p>
          <span>{kw ? "换个关键词试试" : "编辑过的 JSON 会自动存到这里"}</span>
        </div>
      ) : (
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
      )}
    </aside>
  );
}