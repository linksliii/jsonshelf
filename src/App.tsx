import { useCallback, useEffect, useRef, useState } from "react";
import EditorPane from "./components/EditorPane";
import HistoryPanel from "./components/HistoryPanel";
import Toolbar from "./components/Toolbar";
import { formatJSON, minifyJSON, formatOther } from "./lib/formatter";
import { autoTitle } from "./lib/title";
import { fuzzyRank } from "./lib/fuzzy";
import {
  listHistory, searchHistory, upsertHistory,
  renameHistory, togglePin, deleteHistory, exportJSON,
} from "./lib/ipc";
import type { HistoryEntry } from "./types";

export default function App() {
  const [content, setContent] = useState("");
  const [language, setLanguage] = useState("json");
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [currentId, setCurrentId] = useState<number | null>(null);
  const [saveToHistory, setSaveToHistory] = useState(true);
  const [status, setStatus] = useState<{ kind: "ok" | "error" | "idle"; message: string }>({ kind: "idle", message: "" });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    try { setEntries(await listHistory()); } catch { /* DB 不可用不阻塞编辑 */ }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (!saveToHistory || !content.trim()) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const id = await upsertHistory({ id: currentId, title: autoTitle(content), content, language });
        if (currentId == null) setCurrentId(id);
        refresh();
      } catch { /* 写失败不打断 */ }
    }, 800);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [content, language, saveToHistory, currentId, refresh]);

  const handleFormat = useCallback(async () => {
    try {
      const out = language === "json" ? formatJSON(content) : await formatOther(content, language);
      setContent(out);
      setStatus({ kind: "ok", message: "已格式化" });
    } catch (e) {
      setStatus({ kind: "error", message: `格式化失败: ${(e as Error).message}` });
    }
  }, [content, language]);

  const handleMinify = useCallback(() => {
    try { setContent(minifyJSON(content)); setStatus({ kind: "ok", message: "已压缩" }); }
    catch (e) { setStatus({ kind: "error", message: `压缩失败: ${(e as Error).message}` }); }
  }, [content]);

  const handleSave = useCallback(async () => {
    try {
      const path = await exportJSON(content, `${autoTitle(content)}.json`);
      setStatus(path ? { kind: "ok", message: `已保存: ${path}` } : { kind: "idle", message: "已取消" });
    } catch (e) {
      setStatus({ kind: "error", message: `保存失败: ${(e as Error).message}` });
    }
  }, [content]);

  const handleSearch = useCallback(async (kw: string) => {
    try {
      const candidates = kw.trim() ? await searchHistory(kw) : await listHistory();
      setEntries(kw.trim() ? fuzzyRank(candidates, kw).map((r) => r.entry) : candidates);
    } catch { /* ignore */ }
  }, []);

  const handleSelect = useCallback((e: HistoryEntry) => {
    setContent(e.content); setLanguage(e.language); setCurrentId(e.id);
  }, []);

  return (
    <div className="app">
      <Toolbar
        language={language} onLanguageChange={setLanguage}
        onFormat={handleFormat} onMinify={handleMinify} onSave={handleSave}
        saveToHistory={saveToHistory} onToggleSaveToHistory={setSaveToHistory}
        status={status}
      />
      <div className="main">
        <EditorPane value={content} onChange={setContent} onFormat={handleFormat} onSave={handleSave} />
        <HistoryPanel
          entries={entries}
          onSelect={handleSelect}
          onRename={async (id, t) => { await renameHistory(id, t); refresh(); }}
          onTogglePin={async (id, p) => { await togglePin(id, p); refresh(); }}
          onDelete={async (id) => { await deleteHistory(id); if (id === currentId) setCurrentId(null); refresh(); }}
          onSearch={handleSearch}
        />
      </div>
    </div>
  );
}
