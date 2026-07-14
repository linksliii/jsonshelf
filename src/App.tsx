import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import EditorPane from "./components/EditorPane";
import HistoryPanel from "./components/HistoryPanel";
import Toolbar from "./components/Toolbar";
import SettingsPanel from "./components/SettingsPanel";
import { formatJSON, minifyJSON, formatOther } from "./lib/formatter";
import { jsonStats, isValidJSON } from "./lib/jsonStats";
import { autoTitle, safeFileName } from "./lib/title";
import { fuzzyRank } from "./lib/fuzzy";
import { hotkeyFromEvent, hotkeysEqual, parseHotkey, toTauriAccelerator } from "./lib/hotkeys";
import {
  PANEL_DEFAULT, PANEL_COLLAPSE_THRESHOLD, clampWidth,
} from "./lib/panelWidth";
import {
  listHistory, searchHistory, upsertHistory,
  renameHistory, togglePin, deleteHistory, exportJSON,
  getSetting, setSetting, setHideOnBlur, rebindToggleShortcut,
} from "./lib/ipc";
import type { HistoryEntry } from "./types";

const DEFAULT_HK = { toggle: "Alt+Cmd+J", format: "Shift+Alt+F", save: "Cmd+S", new: "Cmd+T" };

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
  // 当前选中条目 id 的 STATE(驱动列表高亮);currentIdRef 仍供自动保存同步读取。
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [keyword, setKeyword] = useState("");
  const [saveToHistory, setSaveToHistory] = useState(true);
  const [status, setStatus] = useState<{ kind: "ok" | "error" | "idle"; message: string }>({ kind: "idle", message: "" });
  const [hkToggle, setHkToggle] = useState(DEFAULT_HK.toggle);
  const [hkFormat, setHkFormat] = useState(DEFAULT_HK.format);
  const [hkSave, setHkSave] = useState(DEFAULT_HK.save);
  const [hkNew, setHkNew] = useState(DEFAULT_HK.new);
  const [hideOnBlur, setHideOnBlurState] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // 历史面板:可折叠(Cmd+B / 拖到最窄)+ 可拖拽调宽,两者均持久化到 settings。
  const [panelHidden, setPanelHidden] = useState(false);
  const [panelWidth, setPanelWidth] = useState(PANEL_DEFAULT);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 拖拽调宽状态:startX 记录按下时鼠标 x,startWidth 记录按下时面板宽度。
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const currentIdRef = useRef<number | null>(null);
  // 始终保存当前选中条目的最新标题(含被 rename 后的);导出文件名以此为准,
  // 不受搜索过滤后 entries 中查不到该条目的影响。
  const selectedTitleRef = useRef<string | null>(null);
  const savingRef = useRef<Promise<void> | null>(null);
  const savedStatusRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // "刚加载"守卫:加载历史条目 / 新建会以编程方式修改 content(可能连带 language),
  // 这类变更不应触发自动保存(否则仅"查看"一条就会更新 updated_at 把它顶到列表顶部)。
  // handleSelect/handleNew 置 true;自动保存 effect 在开头消费一次(置 false 并 return),
  // 恰好跳过加载引起的那一次 effect 运行,而后续真实编辑(flag 已为 false)照常保存并重排。
  const justLoadedRef = useRef(false);
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

  // 新建快捷键(默认 Cmd+T)与 handleNew 用 ref 镜像,供 window 级 keydown 监听读到最新值,
  // 避免把它们放进 effect 依赖后频繁重建监听。handleNew 定义在下方,先声明 ref 后同步。
  const hkNewRef = useRef(hkNew);
  hkNewRef.current = hkNew;
  const handleNewRef = useRef<() => void>(() => {});

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Cmd+B 切换历史面板显隐。放在 window 级(App)处理,不论焦点在编辑器还是别处都生效;
      // Cmd+B 非 JSON 编辑器绑定,不与其冲突。独立于下方 Esc 逻辑,先处理并返回。
      if (e.metaKey && (e.key === "b" || e.key === "B")) {
        e.preventDefault();
        setPanelHidden((h) => !h);
        return;
      }
      // 新建快捷键(默认 Cmd+T,可自定义)。与 Cmd+B 一样在 window 级处理,焦点在编辑器时
      // 事件仍冒泡到此(编辑器只消费 format/save/Esc)。用 e.code 版 hotkeyFromEvent 匹配,
      // 与编辑器一致(不受 macOS Option 合字影响),命中即 preventDefault + 新建。
      const hkNewParsed = parseHotkey(hkNewRef.current);
      if (hkNewParsed) {
        const pressed = hotkeyFromEvent(e);
        if (pressed && hotkeysEqual(pressed, hkNewParsed)) {
          e.preventDefault();
          handleNewRef.current();
          return;
        }
      }
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
        const [toggle, format, save, hkNewVal, blur, pWidth, pHidden] = await Promise.all([
          getSetting("hotkey.toggle"),
          getSetting("hotkey.format"),
          getSetting("hotkey.save"),
          getSetting("hotkey.new"),
          getSetting("hideOnBlur"),
          getSetting("panelWidth"),
          getSetting("panelHidden"),
        ]);
        const tg = toggle ?? DEFAULT_HK.toggle;
        setHkToggle(tg);
        setHkFormat(format ?? DEFAULT_HK.format);
        setHkSave(save ?? DEFAULT_HK.save);
        setHkNew(hkNewVal ?? DEFAULT_HK.new);

        const hb = (blur ?? "false") === "true";
        setHideOnBlurState(hb);
        await setHideOnBlur(hb);

        // 面板宽度:解析为整数并夹紧到合法区间;非法/缺省回退默认。面板显隐:字符串布尔。
        const w = parseInt(pWidth ?? "", 10);
        setPanelWidth(Number.isFinite(w) ? clampWidth(w) : PANEL_DEFAULT);
        setPanelHidden((pHidden ?? "false") === "true");

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

  // 持久化面板显隐(Cmd+B / 拖到最窄触发的收起都会经此)。首挂载从 DB 读回时也会写一次,
  // 值相同幂等无副作用。setSetting 包 try/catch,DB 出错不阻塞 UI。
  useEffect(() => {
    (async () => {
      try { await setSetting("panelHidden", String(panelHidden)); } catch { /* ignore */ }
    })();
  }, [panelHidden]);

  // 分隔条拖拽调宽:按下记录起点,监听 window mousemove 实时更新宽度(面板在右侧,
  // 左拖变宽 → 用 startX - 当前 x 作为增量),mouseup 时移除监听并把最终宽度持久化。
  // 拖到窄于折叠阈值则直接收起面板并结束。拖拽期间禁用 body 文本选中,结束恢复。
  const handleDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startWidth: panelWidth };
    const prevUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = "none";
    // 记录拖拽过程中的最新宽度,mouseup 时据此持久化(避免读到 state 的旧闭包值)。
    let latest = panelWidth;
    let collapsed = false;

    const cleanup = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.userSelect = prevUserSelect;
      dragRef.current = null;
    };
    const onMove = (ev: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const raw = drag.startWidth + (drag.startX - ev.clientX);
      if (raw < PANEL_COLLAPSE_THRESHOLD) {
        // 拖到最窄:收起面板(其持久化由 panelHidden 的 effect 负责)并结束拖拽。
        collapsed = true;
        setPanelHidden(true);
        cleanup();
        return;
      }
      latest = clampWidth(raw);
      setPanelWidth(latest);
    };
    const onUp = () => {
      cleanup();
      // 仅在正常松手(非收起)时持久化宽度;拖拽过程中不写库以免频繁 IO。
      if (!collapsed) {
        (async () => {
          try { await setSetting("panelWidth", String(latest)); } catch { /* ignore */ }
        })();
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [panelWidth]);

  useEffect(() => {
    // 加载/新建引起的 content(及 language)变更:消费守卫并跳过本次保存。
    // handleSelect 中 setContent+setLanguage 在同一渲染批次内,effect 只运行一次即被跳过;
    // 用户随后真实输入时 flag 已为 false,正常保存并重排(编辑顶到顶部是期望行为)。
    if (justLoadedRef.current) { justLoadedRef.current = false; return; }
    if (!saveToHistory || !content.trim()) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      savingRef.current = (savingRef.current ?? Promise.resolve()).then(async () => {
        try {
          const wasNew = currentIdRef.current == null;
          const insertTitle = autoTitle(content);
          const id = await upsertHistory({
            id: currentIdRef.current, title: insertTitle, content, language,
          });
          currentIdRef.current = id;   // 同步,下次运行即可见
          // 新插入的条目让其在列表中显示为选中(currentIdRef 之前为 null),
          // 并同步导出用标题为本次 INSERT 所用标题。
          if (wasNew) { setSelectedId(id); selectedTitleRef.current = insertTitle; }
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
    // 纯文本无格式化器,直接给出提示避免走 prettier 报错。
    if (language === "plaintext") {
      setStatus({ kind: "idle", message: "纯文本无需格式化" });
      return;
    }
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
      // 文件名优先沿用当前选中条目的最新标题(含被 rename 后的,存于 selectedTitleRef,
      // 不受搜索过滤影响);无选中条目时回退到按内容推断的 autoTitle。均经 safeFileName 清洗。
      const base = safeFileName(selectedTitleRef.current ?? autoTitle(content));
      const path = await exportJSON(content, `${base}.json`);
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
    // 与 handleSelect 一致:清空为编程式变更,不触发自动保存(空内容本就会被 effect 提前返回)。
    justLoadedRef.current = true;
    setContent("");
    currentIdRef.current = null;
    setSelectedId(null);
    selectedTitleRef.current = null;
    setStatus({ kind: "idle", message: "" });
  }, []);
  // 同步最新 handleNew 到 ref,供 window 级 keydown 监听调用(避免陈旧闭包)。
  handleNewRef.current = handleNew;

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
    // 标记本次 content/language 变更为"编程式加载",供自动保存 effect 跳过一次。
    justLoadedRef.current = true;
    setContent(e.content); setLanguage(e.language);
    currentIdRef.current = e.id;
    setSelectedId(e.id);
    selectedTitleRef.current = e.title;
  }, []);

  // 右键菜单"复制内容":将该条目内容写入剪贴板(不影响当前编辑内容)。
  const handleCopyContent = useCallback(async (e: HistoryEntry) => {
    try {
      await navigator.clipboard.writeText(e.content);
      setStatus({ kind: "ok", message: "已复制" });
    } catch (err) {
      setStatus({ kind: "error", message: `复制失败: ${(err as Error).message ?? err}` });
    }
  }, []);

  // 删除历史条目:先 window.confirm 二次确认(Tauri webview 可用),取消则不删除。
  // 删除的若是当前选中/加载条目,清空选中态与 currentIdRef。
  const handleDelete = useCallback(async (id: number) => {
    const title = entries.find((x) => x.id === id)?.title ?? "这条历史记录";
    if (!window.confirm(`确定删除「${title}」?`)) return;
    await deleteHistory(id);
    if (id === currentIdRef.current) currentIdRef.current = null;
    setSelectedId((cur) => (cur === id ? null : cur));
    reload();
  }, [entries, reload]);

  const setterFor = { toggle: setHkToggle, format: setHkFormat, save: setHkSave, new: setHkNew };

  const onChangeHotkey = useCallback(
    async (which: "toggle" | "format" | "save" | "new", value: string) => {
      const all = { toggle: hkToggle, format: hkFormat, save: hkSave, new: hkNew };
      const prev = all[which];

      // 校验:必须是合法快捷键,且不能与另外三个已绑定键冲突。
      const parsed = parseHotkey(value);
      if (!parsed) { setStatus({ kind: "error", message: "无效快捷键" }); return; }
      const others = (["toggle", "format", "save", "new"] as const)
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
    [hkToggle, hkFormat, hkSave, hkNew],
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
          language={language}
        />
        {!panelHidden && (
          <>
            {/* 拖拽分隔条:调节右侧历史面板宽度;拖到最窄自动收起。 */}
            <div
              className="panel-divider"
              onMouseDown={handleDividerMouseDown}
              role="separator"
              aria-label="调整历史面板宽度"
            />
            {/* 内联宽度覆盖 CSS 默认,收起时整块不渲染,编辑器占满全宽。 */}
            <div className="history-panel-wrap" style={{ width: panelWidth }}>
              <HistoryPanel
                entries={entries}
                selectedId={selectedId}
                onSelect={handleSelect}
                onRename={async (id, t) => {
                  await renameHistory(id, t);
                  // 重命名的若是当前选中条目,同步导出用标题(即使被搜索过滤掉也不丢失)。
                  if (id === currentIdRef.current) selectedTitleRef.current = t;
                  reload();
                }}
                onTogglePin={async (id, p) => { await togglePin(id, p); reload(); }}
                onDelete={handleDelete}
                onCopyContent={handleCopyContent}
                onSearch={handleSearch}
              />
            </div>
          </>
        )}
      </div>
      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        hotkeys={{ toggle: hkToggle, format: hkFormat, save: hkSave, new: hkNew }}
        onChangeHotkey={onChangeHotkey}
        hideOnBlur={hideOnBlur}
        onChangeHideOnBlur={onChangeHideOnBlur}
      />
    </div>
  );
}
