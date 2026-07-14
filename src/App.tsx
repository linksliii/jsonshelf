import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import EditorPane from "./components/EditorPane";
import HistoryPanel from "./components/HistoryPanel";
import Toolbar from "./components/Toolbar";
import SettingsPanel from "./components/SettingsPanel";
import { formatJSON, minifyJSON, formatOther } from "./lib/formatter";
import { jsonStats, isValidJSON } from "./lib/jsonStats";
import { autoTitle } from "./lib/title";
import { fuzzyRank } from "./lib/fuzzy";
import { hotkeysEqual, parseHotkey, toTauriAccelerator } from "./lib/hotkeys";
import {
  listHistory, searchHistory, upsertHistory,
  renameHistory, togglePin, deleteHistory, exportJSON,
  getSetting, setSetting, setHideOnBlur, rebindToggleShortcut,
} from "./lib/ipc";
import type { HistoryEntry } from "./types";

const DEFAULT_HK = { toggle: "Alt+Cmd+J", format: "Shift+Alt+F", save: "Cmd+S" };

// 冲突检测:value 是否与 others 中任一已绑定键(可解析的)相同。
// 导出以便单测;value 无法解析时视为无冲突(由调用方另行拒绝无效键)。
export function hotkeyConflicts(value: string, others: string[]): boolean {
  const parsed = parseHotkey(value);
  if (!parsed) return false;
  return others.some((o) => {
    const h = parseHotkey(o);
    return h != null && hotkeysEqual(parsed, h);
  });
}

export default function App() {
  const [content, setContent] = useState("");
  const [language, setLanguage] = useState("json");
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [keyword, setKeyword] = useState("");
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
  // 搜索关键字用 ref 镜像,使 reload 无需进依赖数组即可读到最新值。
  const keywordRef = useRef("");
  keywordRef.current = keyword;

  // 按当前关键字加载历史:有关键字则搜索并模糊排序,否则拉全量。
  // rename/pin/delete/自动保存后调用它以重放当前筛选,避免过滤视图被全量列表覆盖。
  const reload = useCallback(async () => {
    const kw = keywordRef.current;
    try {
      const candidates = kw.trim() ? await searchHistory(kw) : await listHistory();
      setEntries(kw.trim() ? fuzzyRank(candidates, kw).map((r) => r.entry) : candidates);
    } catch { /* DB 不可用不阻塞编辑 */ }
  }, []);

  // Esc → 隐藏窗口。设置面板打开时让位给 SettingsPanel(不隐藏);
  // 仅在 Tauri 运行时内生效。EditorPane(编辑器聚焦时)与 window 级监听
  // (编辑器未聚焦时)都调用它,以保证 Esc 在各焦点上下文下都可靠隐藏窗口。
  const hideWindow = useCallback(() => {
    if (settingsOpenRef.current) return;
    if ("__TAURI_INTERNALS__" in window) getCurrentWindow().hide();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // 已被处理的 Esc 不再隐藏窗口:CodeMirror 关闭查找面板(preventDefault)、
      // 或 EditorPane 已主动隐藏窗口(preventDefault)后事件都带 defaultPrevented,
      // 这里跳过可避免"关查找面板连带隐藏窗口"以及正常隐藏时的重复调用。
      if (e.defaultPrevented) return;
      if (e.key === "Escape") hideWindow();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hideWindow]);

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
          reload();
          setStatus({ kind: "ok", message: "已存入历史" });
          if (savedStatusRef.current) clearTimeout(savedStatusRef.current);
          savedStatusRef.current = setTimeout(() => {
            setStatus({ kind: "idle", message: "" });
          }, 2000);
        } catch { /* 写失败不打断 */ }
      });
    }, 800);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [content, language, saveToHistory, reload]);

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

  // 复制当前内容到剪贴板。Tauri 2 webview 内 navigator.clipboard 可用,失败再提示。
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(content);
      setStatus({ kind: "ok", message: "已复制" });
    } catch (e) {
      setStatus({ kind: "error", message: `复制失败: ${(e as Error).message ?? e}` });
    }
  }, [content]);

  // 新建/清空:不改动任何已加载的历史条目(currentIdRef 置空),
  // 下次自动保存(若开启且内容非空)会新插入一条,而非覆盖旧条目。
  const handleNew = useCallback(() => {
    setContent("");
    currentIdRef.current = null;
    setStatus({ kind: "idle", message: "" });
  }, []);

  const stats = useMemo(() => jsonStats(content), [content]);
  // 校验指示:仅在 JSON 语言且内容非空时给出真/假,否则 null(不显示)。
  const valid = useMemo<boolean | null>(
    () => (language === "json" && content.trim() ? isValidJSON(content) : null),
    [language, content],
  );

  // 记录关键字(state 供渲染 + ref 供 reload 立即读到),再走统一的加载逻辑。
  const handleSearch = useCallback(async (kw: string) => {
    setKeyword(kw);
    keywordRef.current = kw;
    await reload();
  }, [reload]);

  const handleSelect = useCallback((e: HistoryEntry) => {
    setContent(e.content); setLanguage(e.language);
    currentIdRef.current = e.id;
  }, []);

  const setterFor = { toggle: setHkToggle, format: setHkFormat, save: setHkSave };

  const onChangeHotkey = useCallback(
    async (which: "toggle" | "format" | "save", value: string) => {
      const all = { toggle: hkToggle, format: hkFormat, save: hkSave };
      const prev = all[which];

      // 校验:必须是合法快捷键,且不能与另外两个已绑定键冲突。
      const parsed = parseHotkey(value);
      if (!parsed) { setStatus({ kind: "error", message: "无效快捷键" }); return; }
      const others = (["toggle", "format", "save"] as const)
        .filter((w) => w !== which)
        .map((w) => all[w]);
      if (hotkeyConflicts(value, others)) {
        setStatus({ kind: "error", message: "该快捷键与其他快捷键冲突" });
        return;
      }

      setterFor[which](value);
      try { await setSetting("hotkey." + which, value); } catch { /* 持久化失败不阻塞 */ }
      if (which === "toggle") {
        try {
          await rebindToggleShortcut(toTauriAccelerator(parsed));
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
        onCopy={handleCopy} onNew={handleNew}
        saveToHistory={saveToHistory} onToggleSaveToHistory={setSaveToHistory}
        status={status}
        stats={stats} valid={valid}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <div className="main">
        <EditorPane
          value={content} onChange={setContent}
          onFormat={handleFormat} onSave={handleSave}
          onEscape={hideWindow}
          formatKey={hkFormat}
          saveKey={hkSave}
        />
        <HistoryPanel
          entries={entries}
          onSelect={handleSelect}
          onRename={async (id, t) => { await renameHistory(id, t); reload(); }}
          onTogglePin={async (id, p) => { await togglePin(id, p); reload(); }}
          onDelete={async (id) => { await deleteHistory(id); if (id === currentIdRef.current) currentIdRef.current = null; reload(); }}
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
