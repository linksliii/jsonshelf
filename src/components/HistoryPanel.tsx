import { useEffect, useRef, useState } from "react";
import type { HistoryEntry } from "../types";
import HistoryItem from "./HistoryItem";

interface Props {
  entries: HistoryEntry[];
  onSelect: (e: HistoryEntry) => void;
  onRename: (id: number, title: string) => void;
  onTogglePin: (id: number, pinned: boolean) => void;
  onDelete: (id: number) => void;
  onSearch: (keyword: string) => void;
}

export default function HistoryPanel(props: Props) {
  const [kw, setKw] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => props.onSearch(kw), 200);
    return () => { if (timer.current) clearTimeout(timer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kw]);

  return (
    <aside className="history-panel">
      <input
        className="history-search"
        placeholder="搜索历史…"
        value={kw}
        onChange={(e) => setKw(e.target.value)}
      />
      <div className="history-list">
        {props.entries.map((entry) => (
          <HistoryItem
            key={entry.id}
            entry={entry}
            onSelect={props.onSelect}
            onRename={props.onRename}
            onTogglePin={props.onTogglePin}
            onDelete={props.onDelete}
          />
        ))}
      </div>
    </aside>
  );
}
