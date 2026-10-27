import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import EditorPane, { type EditorHandle } from "./components/EditorPane";
import HistoryPanel from "./components/HistoryPanel";
import Toolbar from "./components/Toolbar";
import StatusBar from "./components/StatusBar";
import TitleBar from "./components/TitleBar";
import SettingsPanel from "./components/SettingsPanel";
import EmptyState from "./components/EmptyState";
import { formatJSON, minifyJSON } from "./lib/formatter";
import { autoTitle, safeFileName } from "./lib/title";
import { fuzzyRank } from "./lib/fuzzy";
import { hotkeyFromEvent, hotkeysEqual, parseHotkey, toTauriAccelerator } from "./lib/hotkeys";
import { PANEL_DEFAULT, PANEL_COLLAPSE_THRESHOLD, clampWidth } from "./lib/panelWidth";
import { headOf, mergeSaved, sameSnapshot, type Snapshot } from "./lib/history";
import {
  listHistory, searchHistory, upsertHistory,
  renameHistory, togglePin, deleteHistory, exportJSON, getHistoryContent,
  getSetting, setSetting, setHideOnBlur, rebindToggleShortcut,
  getShortcutStatus, getGlassKind, type ShortcutStatus,
} from "./lib/ipc";
import type { HistoryEntry } from "./types";

const DEFAULT_HK = { toggle: "Alt+Cmd+J", format: "Shift+Alt+F", save: "Cmd+S", new: "Cmd+T", minimap: "Cmd+Shift+M" };

// 超过这个长度不再整篇 parse(键数/合法性都跳过),避免输入卡顿与内存峰值。
const ANALYZE_DOC_LIMIT = 400_000;

export type StatusKind = "ok" | "error" | "idle";
export interface Status { kind: StatusKind; message: string }

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

// 把 "Alt+Cmd+J" 显示成 "⌥⌘J",给按钮 tooltip / 空状态提示用。
export function hotkeyLabel(raw: string): string {
  const h = parseHotkey(raw);
  if (!h) return raw;
  return `${h.ctrl ? "⌃" : ""}${h.alt ? "⌥" : ""}${h.shift ? "⇧" : ""}${h.meta ? "⌘" : ""}${h.key}`;
}

export default function App() {
  // content:小文件是全文,大文件只存开头 4KB;长度/行数单独存,避免大字符串在 JS 堆里复制两份。
  const [content, setContent] = useState("");
  const [docLength, setDocLength] = useState(0);
  const [docLines, setDocLines] = useState(0);
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [keyword, setKeyword] = useState("");
  const [saveToHistory, setSaveToHistory] = useState(true);
  const [status, setStatus] = useState<Status>({ kind: "idle", message: "" });
  const [hkToggle, setHkToggle] = useState(DEFAULT_HK.toggle);
  const [hkFormat, setHkFormat] = useState(DEFAULT_HK.format);
  const [hkSave, setHkSave] = useState(DEFAULT_HK.save);
  const [hkNew, setHkNew] = useState(DEFAULT_HK.new);
  const [hkMinimap, setHkMinimap] = useState(DEFAULT_HK.minimap);
  const [showMinimap, setShowMinimap] = useState(true);
  const [wordWrap, setWordWrap] = useState(true);
  const [hideOnBlur, setHideOnBlurState] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [panelHidden, setPanelHidden] = useState(false);
  const [panelWidth, setPanelWidth] = useState(PANEL_DEFAULT);
  const [shortcutStatus, setShortcutStatus] = useState<ShortcutStatus | null>(null);
  const [glassKind, setGlassKind] = useState<"liquid" | "vibrancy" | "none">("none");
  const [appearance, setAppearance] = useState<"glass" | "solid">("glass");
  // 设置还没从库里读回来之前,不要用默认值回写,否则会把用户偏好覆盖掉。
  const [hydrated, setHydrated] = useState(false);

  const editorRef = useRef<EditorHandle | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const currentIdRef = useRef<number | null>(null);
  // 编辑器里的正文属于哪一条历史。写库只认这个 id,避免"界面切到 A、正文还是 B"时写串。
  const ownerIdRef = useRef<number | null>(null);
  const selectedTitleRef = useRef<string | null>(null);
  const savingRef = useRef<Promise<void> | null>(null);
  const lastSavedRef = useRef<Snapshot>({ text: "", length: 0, lines: 0 });
  const saveTokenRef = useRef(0);
  const selectTokenRef = useRef(0);
  const savedStatusRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 加载/新建时记下"刚装入的正文";内容等于它时不属于用户编辑,不触发自动保存。
  // 用值比较而不是一次性 flag,重复点同一条历史也不会漏存下一次编辑。
  const loadedRef = useRef<Snapshot>({ text: "", length: 0, lines: 0 });
  const settingsOpenRef = useRef(false);
  settingsOpenRef.current = settingsOpen;
  const keywordRef = useRef("");
  keywordRef.current = keyword;
  const contentRef = useRef("");
  contentRef.current = content;
  const saveToHistoryRef = useRef(saveToHistory);
  saveToHistoryRef.current = saveToHistory;

  const hkNewRef = useRef(hkNew);
  hkNewRef.current = hkNew;
  const hkMinimapRef = useRef(hkMinimap);
  hkMinimapRef.current = hkMinimap;
  const handleNewRef = useRef<() => void>(() => {});

  // 统一的"取当前正文"入口:编辑器是唯一真相,React 里的 content 只是防抖镜像。
  const getText = useCallback(() => editorRef.current?.getValue() ?? contentRef.current, []);
  // 轻量快照:大文件不 toString,只拿长度/行数/开头。
  const snapNow = useCallback(
    () => editorRef.current?.getSnapshot() ?? { text: contentRef.current, length: contentRef.current.length, lines: 0 },
    [],
  );

  // 切换条目前把尚未落库的改动直接写回"当时的条目",并作废旧定时器。
  // 写库不阻塞 UI;捕获的 id / 正文能保证不会写到另一条上。
  const flushNow = useCallback(() => {
    const snap = snapNow();
    const id = ownerIdRef.current;
    if (!saveToHistoryRef.current || snap.length === 0 || sameSnapshot(snap, lastSavedRef.current)) {
      saveTokenRef.current += 1;
      return;
    }
    saveTokenRef.current += 1;
    const text = editorRef.current?.getValue() ?? snap.text;
    const wasNew = id == null;
    const title = wasNew ? autoTitle(text) : (selectedTitleRef.current ?? autoTitle(text));
    void (async () => {
      try {
        const newId = await upsertHistory({ id, title, content: text, language: "json" });
        lastSavedRef.current = { text: headOf(text), length: text.length, lines: snap.lines };
        if (wasNew) {
          setEntries((prev) => mergeSaved(prev, {
            id: newId, title, language: "json", content: text, updatedAt: Date.now(),
          }, true));
        }
      } catch { /* 写失败不打断切换 */ }
    })();
  }, [snapNow]);

  const flash = useCallback((message: string, kind: StatusKind = "ok") => {
    setStatus({ kind, message });
    if (savedStatusRef.current) clearTimeout(savedStatusRef.current);
    savedStatusRef.current = setTimeout(() => setStatus({ kind: "idle", message: "" }), 2600);
  }, []);

  useEffect(() => () => {
    if (savedStatusRef.current) clearTimeout(savedStatusRef.current);
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  // 按当前关键字加载历史:有关键字则搜索并模糊排序,否则拉全量(只取元数据)。
  const reload = useCallback(async () => {
    const kw = keywordRef.current;
    try {
      const candidates = kw.trim() ? await searchHistory(kw) : await listHistory();
      setEntries(kw.trim() ? fuzzyRank(candidates, kw).map((r) => r.entry) : candidates);
    } catch { /* DB 不可用不阻塞编辑 */ }
  }, []);

  const hideWindow = useCallback(() => {
    if (settingsOpenRef.current) return;
    if ("__TAURI_INTERNALS__" in window) getCurrentWindow().hide();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey && (e.key === "b" || e.key === "B")) {
        e.preventDefault();
        setPanelHidden((h) => !h);
        return;
      }
      if (e.metaKey && e.key === ",") {
        e.preventDefault();
        setSettingsOpen(true);
        return;
      }
      const hkNewParsed = parseHotkey(hkNewRef.current);
      if (hkNewParsed) {
        const pressed = hotkeyFromEvent(e);
        if (pressed && hotkeysEqual(pressed, hkNewParsed)) {
          e.preventDefault();
          handleNewRef.current();
          return;
        }
      }
      const hkMinimapParsed = parseHotkey(hkMinimapRef.current);
      if (hkMinimapParsed) {
        const pressed = hotkeyFromEvent(e);
        if (pressed && hotkeysEqual(pressed, hkMinimapParsed)) {
          e.preventDefault();
          setShowMinimap((v) => !v);
          return;
        }
      }
      if (e.defaultPrevented) return;
      if (e.key === "Escape") hideWindow();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hideWindow]);

  // 启动:读取设置 + 历史 + 原生背景能力 + 全局快捷键状态。
  useEffect(() => {
    (async () => {
      try {
        const [toggle, format, save, hkNewVal, hkMinimapVal, blur, pWidth, pHidden, sm, appearanceVal, wrapVal] = await Promise.all([
          getSetting("hotkey.toggle"),
          getSetting("hotkey.format"),
          getSetting("hotkey.save"),
          getSetting("hotkey.new"),
          getSetting("hotkey.minimap"),
          getSetting("hideOnBlur"),
          getSetting("panelWidth"),
          getSetting("panelHidden"),
          getSetting("showMinimap"),
          getSetting("appearance"),
          getSetting("wordWrap"),
        ]);
        const tg = toggle ?? DEFAULT_HK.toggle;
        setHkToggle(tg);
        setHkFormat(format ?? DEFAULT_HK.format);
        setHkSave(save ?? DEFAULT_HK.save);
        setHkNew(hkNewVal ?? DEFAULT_HK.new);
        setHkMinimap(hkMinimapVal ?? DEFAULT_HK.minimap);

        const hb = (blur ?? "false") === "true";
        setHideOnBlurState(hb);
        await setHideOnBlur(hb);

        const w = parseInt(pWidth ?? "", 10);
        setPanelWidth(Number.isFinite(w) ? clampWidth(w) : PANEL_DEFAULT);
        setPanelHidden((pHidden ?? "false") === "true");
        setShowMinimap(sm !== "false");
        setWordWrap(wrapVal !== "false");
        if (appearanceVal === "solid") setAppearance("solid");

        // Rust 已用默认键注册;存储值不同则重绑,失败则回退默认键,避免界面显示一个没生效的键。
        if (tg !== DEFAULT_HK.toggle) {
          const h = parseHotkey(tg);
          if (h) {
            try {
              await rebindToggleShortcut(toTauriAccelerator(h));
            } catch {
              // 注册失败(常见于旧进程还没完全退出)不要覆盖用户偏好:
              // 保持原设置,设置面板会标记"未生效"并提供重试入口。
            }
          }
        }
      } catch { /* DB/IPC 不可用时保持默认 */ }
      setHydrated(true);
      try { setShortcutStatus(await getShortcutStatus()); } catch { /* ignore */ }
      try {
        const kind = await getGlassKind();
        setGlassKind(kind);
        if (kind === "none") setAppearance("solid");
      } catch { /* ignore */ }
    })();
    void reload();
  }, [reload]);

  // 液态玻璃开关:通过 html[data-glass] 切 CSS,原生玻璃视图由 Rust 负责。
  useEffect(() => {
    const on = appearance === "glass" && glassKind !== "none";
    document.documentElement.dataset.glass = on ? "on" : "off";
  }, [appearance, glassKind]);

  // 状态栏菜单发来的事件。
  useEffect(() => {
    let unlistenNew: (() => void) | null = null;
    let unlistenSettings: (() => void) | null = null;
    let unlistenShortcut: (() => void) | null = null;
    (async () => {
      try {
        unlistenNew = await listen("tray:new", () => { handleNewRef.current(); });
        unlistenSettings = await listen("tray:settings", () => { setSettingsOpen(true); });
        unlistenShortcut = await listen<string>("shortcut:failed", () => {
          void getShortcutStatus().then(setShortcutStatus).catch(() => {});
          flash("呼出键被其它应用占用了，去设置里换一个", "error");
        });
      } catch { /* 非 Tauri 环境或事件不可用时静默忽略 */ }
    })();
    return () => {
      if (unlistenNew) unlistenNew();
      if (unlistenSettings) unlistenSettings();
      if (unlistenShortcut) unlistenShortcut();
    };
  }, [flash]);

  // 窗口重新获得焦点时把光标送回编辑器,呼出后可以直接打字。
  useEffect(() => {
    if (!("__TAURI_INTERNALS__" in window)) return;
    let unlisten: (() => void) | null = null;
    (async () => {
      try {
        unlisten = await getCurrentWindow().onFocusChanged(({ payload }) => {
          if (payload) editorRef.current?.focus();
        });
      } catch { /* ignore */ }
    })();
    return () => { if (unlisten) unlisten(); };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    (async () => {
      try { await setSetting("panelHidden", String(panelHidden)); } catch { /* ignore */ }
    })();
  }, [panelHidden, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    (async () => {
      try { await setSetting("showMinimap", String(showMinimap)); } catch { /* ignore */ }
    })();
  }, [showMinimap, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    (async () => {
      try { await setSetting("wordWrap", String(wordWrap)); } catch { /* ignore */ }
    })();
  }, [wordWrap, hydrated]);

  // 自动保存:防抖 + 领先的 token 守卫,保证"切到别的条目后旧的定时器不会把内容写串"。
  const persist = useCallback(async (idAtSchedule: number | null, token: number) => {
    if (token !== saveTokenRef.current) return;
    if (ownerIdRef.current !== idAtSchedule) return;
    const snap = snapNow();
    if (snap.length === 0 || sameSnapshot(snap, lastSavedRef.current)) return;

    const job = (savingRef.current ?? Promise.resolve()).then(async () => {
      if (token !== saveTokenRef.current) return;
      if (ownerIdRef.current !== idAtSchedule) return;
      const text = editorRef.current?.getValue() ?? snap.text;
      const wasNew = idAtSchedule == null;
      const title = wasNew
        ? autoTitle(text)
        : (selectedTitleRef.current ?? autoTitle(text));
      const id = await upsertHistory({ id: idAtSchedule, title, content: text, language: "json" });
      if (wasNew) {
        currentIdRef.current = id;
        ownerIdRef.current = id;
        setSelectedId(id);
        selectedTitleRef.current = title;
      }
      lastSavedRef.current = { text: headOf(text), length: text.length, lines: snap.lines };
      const now = Date.now();
      setEntries((prev) => mergeSaved(prev, {
        id, title, language: "json", content: text, updatedAt: now,
      }, wasNew));
      flash(wasNew ? "已存入历史" : "已保存");
    }).catch(() => { /* 写失败不打断编辑 */ });
    savingRef.current = job;
  }, [flash, snapNow]);

  useEffect(() => {
    const snap: Snapshot = { text: content, length: docLength, lines: docLines };
    if (sameSnapshot(snap, loadedRef.current)) return;
    if (!saveToHistory || docLength === 0) return;
    if (sameSnapshot(snap, lastSavedRef.current)) return;
    const idAtSchedule = ownerIdRef.current;
    const token = ++saveTokenRef.current;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const delay = docLength > 400_000 ? 1600 : 700;
    debounceRef.current = setTimeout(() => { void persist(idAtSchedule, token); }, delay);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [content, docLength, docLines, saveToHistory, persist]);

  const handleFormat = useCallback(() => {
    const text = getText();
    if (!text.trim()) { flash("先有内容再格式化", "idle"); return; }
    try {
      const out = formatJSON(text);
      editorRef.current?.setValue(out);
      setContent(headOf(out));
      setDocLength(out.length);
      flash("已格式化");
    } catch (e) {
      flash(`格式化失败：${(e as Error).message}`, "error");
    }
  }, [flash, getText]);

  const handleMinify = useCallback(() => {
    const text = getText();
    if (!text.trim()) { flash("先有内容再压缩", "idle"); return; }
    try {
      const out = minifyJSON(text);
      editorRef.current?.setValue(out);
      setContent(headOf(out));
      setDocLength(out.length);
      flash("已压缩");
    } catch (e) {
      flash(`压缩失败：${(e as Error).message}`, "error");
    }
  }, [flash, getText]);

  const handleSave = useCallback(async () => {
    const text = getText();
    if (!text.trim()) { flash("还没有内容可以导出", "idle"); return; }
    try {
      const base = safeFileName(selectedTitleRef.current ?? autoTitle(text));
      const path = await exportJSON(text, `${base}.json`);
      flash(path ? `已导出到 ${path}` : "已取消", path ? "ok" : "idle");
    } catch (e) {
      flash(`导出失败：${(e as Error).message}`, "error");
    }
  }, [flash, getText]);

  const handleCopy = useCallback(async () => {
    if (snapNow().length === 0) { flash("还没有内容可以复制", "idle"); return; }
    try {
      await navigator.clipboard.writeText(getText());
      flash("已复制");
    } catch (e) {
      flash(`复制失败：${(e as Error).message ?? e}`, "error");
    }
  }, [flash, getText, snapNow]);

  const handleNew = useCallback(() => {
    flushNow();
    saveTokenRef.current += 1;
    editorRef.current?.setValue("");
    setContent("");
    setDocLength(0);
    setDocLines(0);
    loadedRef.current = { text: "", length: 0, lines: 0 };
    lastSavedRef.current = { text: "", length: 0, lines: 0 };
    currentIdRef.current = null;
    ownerIdRef.current = null;
    setSelectedId(null);
    selectedTitleRef.current = null;
    flash("已新建", "idle");
  }, [flash, flushNow]);
  handleNewRef.current = handleNew;

  const handleSearch = useCallback(async (kw: string) => {
    setKeyword(kw);
    keywordRef.current = kw;
    await reload();
  }, [reload]);

  // 选中历史:按需取正文(列表接口不返回正文),再灌进编辑器。
  const handleSelect = useCallback(async (e: HistoryEntry) => {
    flushNow();
    const token = ++selectTokenRef.current;
    try {
      const full = await getHistoryContent(e.id);
      if (token !== selectTokenRef.current) return;
      const snap: Snapshot = { text: headOf(full), length: full.length, lines: 0 };
      loadedRef.current = snap;
      lastSavedRef.current = snap;
      currentIdRef.current = e.id;
      ownerIdRef.current = e.id;
      selectedTitleRef.current = e.title;
      setSelectedId(e.id);
      setContent(snap.text);
      setDocLength(full.length);
      editorRef.current?.setValue(full);
    } catch {
      flash("读取这条历史失败", "error");
    }
  }, [flash, flushNow]);

  const handleCopyContent = useCallback(async (e: HistoryEntry) => {
    try {
      const text = await getHistoryContent(e.id);
      await navigator.clipboard.writeText(text);
      flash("已复制");
    } catch (err) {
      flash(`复制失败：${(err as Error).message ?? err}`, "error");
    }
  }, [flash]);

  const handleDelete = useCallback(async (id: number) => {
    const title = entries.find((x) => x.id === id)?.title ?? "这条历史记录";
    if (!window.confirm(`确定删除「${title}」？`)) return;
    try {
      await deleteHistory(id);
    } catch { /* ignore */ }
    if (id === currentIdRef.current) currentIdRef.current = null;
    if (id === ownerIdRef.current) ownerIdRef.current = null;
    setSelectedId((cur) => (cur === id ? null : cur));
    setEntries((prev) => prev.filter((x) => x.id !== id));
  }, [entries]);

  const handleDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startWidth: panelWidth };
    const prevUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = "none";
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
      if (!collapsed) {
        (async () => {
          try { await setSetting("panelWidth", String(latest)); } catch { /* ignore */ }
        })();
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [panelWidth]);

  const setterFor = { toggle: setHkToggle, format: setHkFormat, save: setHkSave, new: setHkNew, minimap: setHkMinimap };

  const refreshShortcutStatus = useCallback(async () => {
    try { setShortcutStatus(await getShortcutStatus()); } catch { /* ignore */ }
  }, []);

  const onChangeHotkey = useCallback(
    async (which: "toggle" | "format" | "save" | "new" | "minimap", value: string) => {
      const all = { toggle: hkToggle, format: hkFormat, save: hkSave, new: hkNew, minimap: hkMinimap };
      const prev = all[which];

      const parsed = parseHotkey(value);
      if (!parsed) { flash("无效快捷键", "error"); return; }
      const others = (["toggle", "format", "save", "new", "minimap"] as const)
        .filter((w) => w !== which)
        .map((w) => all[w]);
      if (hotkeyConflicts(value, others)) {
        flash("这个组合已经被别的快捷键用了", "error");
        return;
      }

      setterFor[which](value);
      try { await setSetting("hotkey." + which, value); } catch { /* ignore */ }
      if (which === "toggle") {
        try {
          await rebindToggleShortcut(toTauriAccelerator(parsed));
          await refreshShortcutStatus();
          flash("呼出快捷键已更新");
        } catch (e) {
          setterFor.toggle(prev);
          try { await setSetting("hotkey.toggle", prev); } catch { /* ignore */ }
          await refreshShortcutStatus();
          flash(`快捷键更新失败：${(e as Error).message ?? e}`, "error");
        }
      }
    },
    [hkToggle, hkFormat, hkSave, hkNew, hkMinimap, flash, refreshShortcutStatus],
  );

  const retryShortcut = useCallback(async () => {
    const parsed = parseHotkey(hkToggle);
    if (!parsed) return;
    try {
      await rebindToggleShortcut(toTauriAccelerator(parsed));
      await refreshShortcutStatus();
      flash("呼出快捷键已生效");
    } catch (e) {
      await refreshShortcutStatus();
      flash(`还是不行：${(e as Error).message ?? e}`, "error");
    }
  }, [hkToggle, flash, refreshShortcutStatus]);

  const onChangeHideOnBlur = useCallback(async (v: boolean) => {
    setHideOnBlurState(v);
    try { await setSetting("hideOnBlur", String(v)); } catch { /* ignore */ }
    try { await setHideOnBlur(v); } catch { /* ignore */ }
  }, []);

  const onChangeAppearance = useCallback(async (v: "glass" | "solid") => {
    setAppearance(v);
    try { await setSetting("appearance", v); } catch { /* ignore */ }
  }, []);

  // 一次 parse 同时拿到具体合法性和顶层键数;大文件直接跳过。
  const analysis = useMemo(() => {
    if (docLength === 0) return { valid: null as boolean | null, keys: null as number | null, bytes: 0 };
    if (docLength > ANALYZE_DOC_LIMIT) {
      return { valid: null, keys: null, bytes: docLength };
    }
    const bytes = new TextEncoder().encode(content).length;
    try {
      const parsed = JSON.parse(content);
      const keys = Array.isArray(parsed)
        ? parsed.length
        : (parsed && typeof parsed === "object" ? Object.keys(parsed).length : null);
      return { valid: true, keys, bytes };
    } catch {
      return { valid: false, keys: null, bytes };
    }
  }, [content, docLength]);
  const stats = { bytes: analysis.bytes, lines: docLines, keys: analysis.keys };
  const valid = analysis.valid;
  const empty = docLength === 0;

  const onDocChange = useCallback((text: string, length: number, lines: number) => {
    setContent(text);
    setDocLength(length);
    setDocLines(length === 0 ? 0 : lines);
  }, []);

  return (
    <div className="app">
      <TitleBar
        panelHidden={panelHidden}
        onTogglePanel={() => setPanelHidden((h) => !h)}
        onOpenSettings={() => setSettingsOpen(true)}
        toggleHint={hotkeyLabel(hkToggle)}
      />
      <Toolbar
        onFormat={handleFormat}
        onMinify={handleMinify}
        onSave={handleSave}
        onCopy={handleCopy}
        onNew={handleNew}
        saveToHistory={saveToHistory}
        onToggleSaveToHistory={setSaveToHistory}
        formatHint={hotkeyLabel(hkFormat)}
        saveHint={hotkeyLabel(hkSave)}
        newHint={hotkeyLabel(hkNew)}
        empty={empty}
      />

      <div className="main">
        <div className="editor-wrap">
          <EditorPane
            ref={editorRef}
            initialValue=""
            onChange={onDocChange}
            onFormat={handleFormat}
            onSave={handleSave}
            onEscape={hideWindow}
            formatKey={hkFormat}
            saveKey={hkSave}
            showMinimap={showMinimap}
            wordWrap={wordWrap}
            docLength={docLength}
          />
          {empty ? <EmptyState toggleHint={hotkeyLabel(hkToggle)} /> : null}
        </div>

        {!panelHidden && (
          <>
            <div
              className="panel-divider"
              onMouseDown={handleDividerMouseDown}
              role="separator"
              aria-label="调整历史面板宽度"
            />
            <div className="history-panel-wrap" style={{ width: panelWidth }}>
              <HistoryPanel
                entries={entries}
                selectedId={selectedId}
                onSelect={handleSelect}
                onRename={async (id, t) => {
                  await renameHistory(id, t);
                  if (id === currentIdRef.current) selectedTitleRef.current = t;
                  setEntries((prev) => prev.map((x) => (x.id === id ? { ...x, title: t } : x)));
                }}
                onTogglePin={async (id, p) => {
                  await togglePin(id, p);
                  setEntries((prev) => prev.map((x) => (x.id === id ? { ...x, pinned: p } : x)));
                }}
                onDelete={handleDelete}
                onCopyContent={handleCopyContent}
                onSearch={handleSearch}
              />
            </div>
          </>
        )}
      </div>

      <StatusBar valid={valid} stats={stats} status={status} />

      <SettingsPanel
        open={settingsOpen}
        onClose={() => { setSettingsOpen(false); editorRef.current?.focus(); }}
        hotkeys={{ toggle: hkToggle, format: hkFormat, save: hkSave, new: hkNew, minimap: hkMinimap }}
        onChangeHotkey={onChangeHotkey}
        hideOnBlur={hideOnBlur}
        onChangeHideOnBlur={onChangeHideOnBlur}
        showMinimap={showMinimap}
        onChangeShowMinimap={setShowMinimap}
        wordWrap={wordWrap}
        onChangeWordWrap={setWordWrap}
        appearance={appearance}
        onChangeAppearance={onChangeAppearance}
        glassKind={glassKind}
        shortcutStatus={shortcutStatus}
        onRetryShortcut={retryShortcut}
      />
    </div>
  );
}