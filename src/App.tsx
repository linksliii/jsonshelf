import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import EditorPane from "./components/EditorPane";
import HistoryPanel from "./components/HistoryPanel";
import Toolbar from "./components/Toolbar";
import SettingsPanel from "./components/SettingsPanel";
import { formatJSON, minifyJSON, formatOther } from "./lib/formatter";
import { autoTitle } from "./lib/title";
import { fuzzyRank } from "./lib/fuzzy";
import { parseHotkey, toCodeMirror, toTauriAccelerator } from "./lib/hotkeys";
import {
  listHistory, searchHistory, upsertHistory,
  renameHistory, togglePin, deleteHistory, exportJSON,
  getSetting, setSetting, setHideOnBlur, rebindToggleShortcut,
} from "./lib/ipc";
import type { HistoryEntry } from "./types";

const DEFAULT_HK = { toggle: "Alt+Cmd+J", format: "Shift+Alt+F", save: "Cmd+S" };

// 解析规范快捷键串为 CodeMirror keymap 串;解析失败时退回默认。
function cmKey(raw: string, fallback: string): string {
  const h = parseHotkey(raw);
  return h ? toCodeMirror(h) : fallback;
}

export default function App() {
  const [content, setContent] = useState("");
  const [language, setLanguage] = useState("json");
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [saveToHistory, setSaveToHistory] = useState(true);
  const [status, setStatus] = useState<{ kind: "ok" | "error" | "idle"; message: string }>({ kind: "idle", message: "" });
  const [hkToggle, setHkToggle] = useState(DEFAULT_HK.toggle);
  const [hkFormat, setHkFormat] = useState(DEFAULT_HK.format);
  const [hkSave, setHkSave] = useState(DEFAULT_HK.save);
  const [hideOnBlur, setHideOnBlurState] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentIdRef = useRef<number | null>(null);
  const savingRef = useRef<Promise<void> | null>(null);
  const savedStatusRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // App 的 Esc 隐藏窗口逻辑需在录制/设置打开时让位给 SettingsPanel。
  const settingsOpenRef = useRef(false);
  settingsOpenRef.current = settingsOpen;

  const refresh = useCallback(async () => {
    try { setEntries(await listHistory()); } catch { /* DB 不可用不阻塞编辑 */ }
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // 设置面板打开时,Esc 交给 SettingsPanel(取消录制/关闭),不隐藏窗口。
      // SettingsPanel 录制时用 capture 阶段 stopPropagation 已能拦截,
      // 这里的 ref 判断是设置打开但未录制场景的双保险。
      if (settingsOpenRef.current) return;
      if (e.key === "Escape" && "__TAURI_INTERNALS__" in window) {
        getCurrentWindow().hide();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // 从设置读取快捷键与失焦隐藏(带默认值),同步 Rust 状态。
  useEffect(() => {
    (async () => {
      try {
        const [toggle, format, save, blur] = await Promise.all([
          getSetting("hotkey.toggle"),
          getSetting("hotkey.format"),
          getSetting("hotkey.save"),
          getSetting("hideOnBlur"),
        ]);
        const tg = toggle ?? DEFAULT_HK.toggle;
        setHkToggle(tg);
        setHkFormat(format ?? DEFAULT_HK.format);
        setHkSave(save ?? DEFAULT_HK.save);

        const hb = (blur ?? "false") === "true";
        setHideOnBlurState(hb);
        await setHideOnBlur(hb);

        // Rust 已在默认键(Alt+Cmd+J)注册呼出键;若存储值不同则重绑。
        if (tg !== DEFAULT_HK.toggle) {
          const h = parseHotkey(tg);
          if (h) {
            try { await rebindToggleShortcut(toTauriAccelerator(h)); }
            catch { /* 重绑失败保持默认键有效 */ }
          }
        }
      } catch { /* DB/IPC 不可用时保持前后端默认 */ }
    })();
  }, []);

  // 清理保存反馈的复位定时器,避免卸载后 setState 泄漏
  useEffect(() => () => {
    if (savedStatusRef.current) clearTimeout(savedStatusRef.current);
  }, []);

  useEffect(() => {
    if (!saveToHistory || !content.trim()) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      savingRef.current = (savingRef.current ?? Promise.resolve()).then(async () => {
        try {
          const id = await upsertHistory({
            id: currentIdRef.current, title: autoTitle(content), content, language,
          });
          currentIdRef.current = id;   // 同步,下次运行即可见
          refresh();
          setStatus({ kind: "ok", message: "已存入历史" });
          if (savedStatusRef.current) clearTimeout(savedStatusRef.current);
          savedStatusRef.current = setTimeout(() => {
            setStatus({ kind: "idle", message: "" });
          }, 2000);
        } catch { /* 写失败不打断 */ }
      });
    }, 800);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [content, language, saveToHistory, refresh]);

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
    setContent(e.content); setLanguage(e.language);
    currentIdRef.current = e.id;
  }, []);

  const setterFor = { toggle: setHkToggle, format: setHkFormat, save: setHkSave };

  const onChangeHotkey = useCallback(
    async (which: "toggle" | "format" | "save", value: string) => {
      const prev = { toggle: hkToggle, format: hkFormat, save: hkSave }[which];
      setterFor[which](value);
      try { await setSetting("hotkey." + which, value); } catch { /* 持久化失败不阻塞 */ }
      if (which === "toggle") {
        const h = parseHotkey(value);
        if (!h) { setterFor.toggle(prev); setStatus({ kind: "error", message: "无效快捷键" }); return; }
        try {
          await rebindToggleShortcut(toTauriAccelerator(h));
          setStatus({ kind: "ok", message: "呼出快捷键已更新" });
        } catch (e) {
          // 重绑失败:回退状态与存储,保留旧键。
          setterFor.toggle(prev);
          try { await setSetting("hotkey.toggle", prev); } catch { /* ignore */ }
          setStatus({ kind: "error", message: `快捷键更新失败: ${(e as Error).message ?? e}` });
        }
      }
    },
    [hkToggle, hkFormat, hkSave],
  );

  const onChangeHideOnBlur = useCallback(async (v: boolean) => {
    setHideOnBlurState(v);
    try { await setSetting("hideOnBlur", String(v)); } catch { /* ignore */ }
    try { await setHideOnBlur(v); } catch { /* ignore */ }
  }, []);

  return (
    <div className="app">
      <Toolbar
        language={language} onLanguageChange={setLanguage}
        onFormat={handleFormat} onMinify={handleMinify} onSave={handleSave}
        saveToHistory={saveToHistory} onToggleSaveToHistory={setSaveToHistory}
        status={status}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <div className="main">
        <EditorPane
          value={content} onChange={setContent}
          onFormat={handleFormat} onSave={handleSave}
          formatKey={cmKey(hkFormat, "Shift-Alt-f")}
          saveKey={cmKey(hkSave, "Mod-s")}
        />
        <HistoryPanel
          entries={entries}
          onSelect={handleSelect}
          onRename={async (id, t) => { await renameHistory(id, t); refresh(); }}
          onTogglePin={async (id, p) => { await togglePin(id, p); refresh(); }}
          onDelete={async (id) => { await deleteHistory(id); if (id === currentIdRef.current) currentIdRef.current = null; refresh(); }}
          onSearch={handleSearch}
        />
      </div>
      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        hotkeys={{ toggle: hkToggle, format: hkFormat, save: hkSave }}
        onChangeHotkey={onChangeHotkey}
        hideOnBlur={hideOnBlur}
        onChangeHideOnBlur={onChangeHideOnBlur}
      />
    </div>
  );
}
