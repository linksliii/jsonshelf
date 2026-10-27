import {
  forwardRef, useEffect, useImperativeHandle, useRef,
} from "react";
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLine } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import {
  defaultKeymap, history, historyKeymap,
} from "@codemirror/commands";
import { searchKeymap, searchPanelOpen } from "@codemirror/search";
import { json, jsonParseLinter } from "@codemirror/lang-json";
import { linter, lintGutter } from "@codemirror/lint";
import { bracketMatching, foldGutter, foldKeymap } from "@codemirror/language";
import {
  autocompletion, closeBrackets, closeBracketsKeymap,
} from "@codemirror/autocomplete";
import { showMinimap as showMinimapExtension } from "@replit/codemirror-minimap";
import { hotkeyFromEvent, hotkeysEqual, parseHotkey, type Hotkey } from "../lib/hotkeys";
import { jsonCompletionSource } from "../lib/jsonCompletion";
import { DOC_FULL_LIMIT, DOC_HEAD_CHARS, type Snapshot } from "../lib/history";

// 深色主题:通过 EditorView.theme 注册,作为编辑器 state 的一部分,
// 天然赢过任何外部全局 CSS 的加载顺序/特异性。
const darkTheme = EditorView.theme({
  "&": { backgroundColor: "transparent", color: "#e8ebf5", height: "100%" },
  ".cm-scroller": {
    fontFamily:
      'ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Monaco, "Cascadia Code", monospace',
    fontSize: "12.5px",
    lineHeight: "1.72",
    padding: "12px 0 48px",
  },
  ".cm-content": { caretColor: "#9db2ff", padding: "0 0 0 2px" },
  ".cm-line": { padding: "0 18px 0 10px" },
  ".cm-gutters": {
    backgroundColor: "transparent",
    color: "rgba(232,235,245,0.24)",
    border: "none",
    paddingRight: "2px",
  },
  ".cm-lineNumbers .cm-gutterElement": { padding: "0 8px 0 14px", minWidth: "42px" },
  ".cm-activeLine": { backgroundColor: "rgba(255,255,255,0.032)" },
  ".cm-activeLineGutter": {
    backgroundColor: "transparent",
    color: "rgba(232,235,245,0.62)",
  },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "#9db2ff", borderLeftWidth: "2px" },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, & .cm-selectionBackground, .cm-content ::selection":
    { backgroundColor: "rgba(124,152,255,0.26)" },
  "&.cm-focused": { outline: "none" },
  // 编辑内容区:光标为文本光标,允许文本选中(UI chrome 不可选中)。
  ".cm-content, .cm-scroller": { cursor: "text", userSelect: "text" },
  ".cm-foldGutter .cm-gutterElement": { color: "rgba(232,235,245,0.26)", padding: "0 2px" },
  ".cm-foldPlaceholder": {
    backgroundColor: "rgba(255,255,255,0.06)",
    border: "none",
    color: "#b9c4e6",
    borderRadius: "5px",
    padding: "0 6px",
  },
  ".cm-minimap-gutter": {
    backgroundColor: "transparent",
    borderLeft: "1px solid rgba(255,255,255,0.05)",
    opacity: "0.75",
    cursor: "pointer",
    userSelect: "none",
  },
  ".cm-minimap-inner": { backgroundColor: "transparent" },
  ".cm-minimap-overlay": {
    backgroundColor: "rgba(124,152,255,0.10)",
    border: "1px solid rgba(124,152,255,0.20)",
    borderRadius: "3px",
  },
  ".cm-minimap-overlay-active .cm-minimap-overlay": {
    backgroundColor: "rgba(124,152,255,0.18)",
  },
  ".cm-tooltip": {
    backgroundColor: "rgba(23,26,41,0.96)",
    border: "1px solid rgba(255,255,255,0.09)",
    borderRadius: "10px",
    boxShadow: "0 18px 44px rgba(0,0,0,0.5)",
    overflow: "hidden",
  },
  ".cm-tooltip-autocomplete ul li[aria-selected]": {
    backgroundColor: "rgba(124,152,255,0.2)",
    color: "#eef1fb",
  },
  ".cm-panels": {
    backgroundColor: "rgba(18,21,34,0.94)",
    color: "#e8ebf5",
    borderTop: "1px solid rgba(255,255,255,0.08)",
  },
  ".cm-panels.cm-panels-top": { borderBottom: "1px solid rgba(255,255,255,0.08)" },
  ".cm-searchMatch": {
    backgroundColor: "rgba(255,205,110,0.18)",
    outline: "1px solid rgba(255,205,110,0.3)",
  },
  ".cm-searchMatch.cm-searchMatch-selected": { backgroundColor: "rgba(255,205,110,0.36)" },
  ".cm-panel.cm-search input, .cm-panel.cm-search button, .cm-panel.cm-search label": {
    fontSize: "12px",
  },
}, { dark: true });

const jsonHighlightStyle = HighlightStyle.define([
  { tag: tags.string, color: "#b9e3a4" },
  { tag: tags.number, color: "#f6b58c" },
  { tag: tags.bool, color: "#c8a6ff" },
  { tag: tags.null, color: "#c8a6ff" },
  { tag: tags.keyword, color: "#c8a6ff" },
  { tag: tags.propertyName, color: "#9fb8ff" },
  { tag: tags.bracket, color: "#93bfe0" },
  { tag: tags.punctuation, color: "#7f8aa6" },
  { tag: tags.comment, color: "#69718c", fontStyle: "italic" },
  { tag: tags.invalid, color: "#ff7d7d" },
]);

interface Props {
  initialValue: string;
  // 文档变更后(防抖)回调。大文件只回开头 4KB,避免整篇字符串在 React 里再存一份。
  onChange: (text: string, length: number, lines: number) => void;
  onFormat: () => void;      // 默认 Shift+Alt+F
  onSave: () => void;        // 默认 Cmd+S
  onEscape?: () => void;     // Esc(编辑器未占用时)隐藏窗口
  formatKey?: string;
  saveKey?: string;
  showMinimap?: boolean;
  // 自动换行:JSON 常见单行长文本,换行后不横向乱跳。超大文件自动关闭。
  wordWrap?: boolean;
  // 外部(防抖后)的文档长度,用来在超大文件时自动收起缩略图,避免渲染拖慢输入。
  docLength?: number;
}

export interface EditorHandle {
  getValue: () => string;
  // 轻量快照:大文件不 copy 整篇正文。
  getSnapshot: () => Snapshot;
  setValue: (v: string) => void;
  focus: () => void;
}

function snapOf(state: EditorState): Snapshot {
  const length = state.doc.length;
  return {
    text: length > DOC_FULL_LIMIT ? state.doc.sliceString(0, DOC_HEAD_CHARS) : state.doc.toString(),
    length,
    lines: state.doc.lines,
  };
}

const MINIMAP_DOC_LIMIT = 600_000;
const LINT_DOC_LIMIT = 400_000;
const WRAP_DOC_LIMIT = 400_000;

// JSON 语法 + 校验 + 补全。空文档与超大文档都不校验,避免多余 parse。
function jsonExtensions(): Extension {
  const baseLint = jsonParseLinter();
  return [
    json(),
    // 超大 JSON 不做整篇 parse 校验 —— 这是输入卡顿的主要来源之一。
    // 空文档不校验(否则会凭空出现一个红色错误点);超大文档也不校验。
    linter((view) => (
      view.state.doc.length === 0 || view.state.doc.length > LINT_DOC_LIMIT
        ? [] : baseLint(view)
    ), { delay: 700 }),
    lintGutter(),
    autocompletion({ override: [jsonCompletionSource] }),
  ];
}

function minimapExt() {
  return showMinimapExtension.compute([], () => ({
    create: () => {
      const dom = document.createElement("div");
      return { dom };
    },
    displayText: "blocks",
    showOverlay: "mouse-over",
  }));
}

const EditorPane = forwardRef<EditorHandle, Props>(function EditorPane({
  initialValue, onChange, onFormat, onSave, onEscape,
  formatKey = "Shift+Alt+F", saveKey = "Cmd+S",
  showMinimap = true, wordWrap = true, docLength = 0,
}: Props, ref) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const handlerCompartment = useRef(new Compartment());
  const minimapCompartment = useRef(new Compartment());
  const wrapCompartment = useRef(new Compartment());
  // 记住当前折叠/换行/缩略图的状态,避免每次输入(文档变长)都 reconfigure 一次,
  // 反复重建扩展会让滚动位置和折叠状态抖动。
  const wrapEnabledRef = useRef<boolean | null>(null);
  const minimapEnabledRef = useRef<boolean | null>(null);
  const changeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 用 ref 持有最新回调:编辑器只创建一次,回调始终取最新版本,避免陈旧闭包。
  const cbRef = useRef({ onChange, onFormat, onSave, onEscape });
  cbRef.current = { onChange, onFormat, onSave, onEscape };

  useImperativeHandle(ref, () => ({
    getValue: () => viewRef.current?.state.doc.toString() ?? "",
    getSnapshot: () => (viewRef.current ? snapOf(viewRef.current.state) : { text: "", length: 0, lines: 0 }),
    setValue: (v: string) => {
      const view = viewRef.current;
      if (!view) return;
      // 大文件不做整篇字符串比较(那会多复制一份 18MB)。
      if (view.state.doc.length === v.length && (v.length > DOC_FULL_LIMIT || view.state.doc.toString() === v)) {
        return;
      }
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: v },
        selection: { anchor: 0 },
      });
      view.scrollDOM.scrollTop = 0;
      view.scrollDOM.scrollLeft = 0;
      const snap = snapOf(view.state);
      cbRef.current.onChange(snap.text, snap.length, snap.lines);
    },
    focus: () => viewRef.current?.focus(),
  }), []);

  // 快捷键匹配用 e.code(物理键),不受 macOS Option 合字影响。
  const buildHandlers = (fmtRaw: string, svRaw: string): Extension => {
    const fmt: Hotkey | null = parseHotkey(fmtRaw);
    const sv: Hotkey | null = parseHotkey(svRaw);
    return EditorView.domEventHandlers({
      keydown: (e, view) => {
        if (e.key === "Escape") {
          if (searchPanelOpen(view.state)) return false;
          cbRef.current.onEscape?.();
          e.preventDefault();
          return true;
        }
        const pressed = hotkeyFromEvent(e);
        if (!pressed) return false;
        if (fmt && hotkeysEqual(pressed, fmt)) {
          e.preventDefault();
          cbRef.current.onFormat();
          return true;
        }
        if (sv && hotkeysEqual(pressed, sv)) {
          e.preventDefault();
          cbRef.current.onSave();
          return true;
        }
        return false;
      },
    });
  };

  useEffect(() => {
    if (!hostRef.current) return;
    const state = EditorState.create({
      doc: initialValue,
      extensions: [
        darkTheme,
        syntaxHighlighting(jsonHighlightStyle),
        EditorState.tabSize.of(2),
        lineNumbers(),
        foldGutter(),
        highlightActiveLine(),
        history(),
        minimapCompartment.current.of(
          showMinimap && initialValue.length > 0 && initialValue.length < MINIMAP_DOC_LIMIT
            ? minimapExt() : [],
        ),
        wrapCompartment.current.of(wordWrap ? EditorView.lineWrapping : []),
        jsonExtensions(),
        closeBrackets(),
        bracketMatching(),
        handlerCompartment.current.of(buildHandlers(formatKey, saveKey)),
        keymap.of([
          ...closeBracketsKeymap,
          ...defaultKeymap, ...historyKeymap, ...searchKeymap,
          ...foldKeymap,
        ]),
        EditorView.updateListener.of((u) => {
          if (!u.docChanged) return;
          // 往空编辑器里粘贴时回到开头:大 JSON 粘贴后不应直接停在文件末尾。
          const pastedIntoEmpty = u.startState.doc.length === 0
            && u.transactions.some((tr) => tr.isUserEvent("input.paste"));
          if (pastedIntoEmpty) {
            const view = u.view;
            requestAnimationFrame(() => {
              view.dispatch({ selection: { anchor: 0 }, scrollIntoView: true });
              view.scrollDOM.scrollTop = 0;
              view.scrollDOM.scrollLeft = 0;
            });
          }
          if (changeTimer.current) clearTimeout(changeTimer.current);
          // 大文件:降低把整篇 doc 转成字符串的频率,输入不再被 O(n) 拷贝拖慢。
          const delay = u.state.doc.length > 800_000 ? 600 : 140;
          changeTimer.current = setTimeout(() => {
            const snap = snapOf(u.state);
            cbRef.current.onChange(snap.text, snap.length, snap.lines);
          }, delay);
        }),
      ],
    });
    const view = new EditorView({ state, parent: hostRef.current });
    viewRef.current = view;
    // 面板类工具的默认预期:打开就能直接粘贴/输入。
    view.focus();
    return () => {
      if (changeTimer.current) clearTimeout(changeTimer.current);
      view.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: handlerCompartment.current.reconfigure(buildHandlers(formatKey, saveKey)),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formatKey, saveKey]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    // 超长单行文本换行会生成海量视觉行,大文件直接不换行,保证输入流畅。
    const enabled = wordWrap && docLength < WRAP_DOC_LIMIT;
    if (wrapEnabledRef.current === enabled) return;
    wrapEnabledRef.current = enabled;
    view.dispatch({
      effects: wrapCompartment.current.reconfigure(enabled ? EditorView.lineWrapping : []),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wordWrap, docLength]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const active = showMinimap && docLength > 0 && docLength < MINIMAP_DOC_LIMIT;
    if (minimapEnabledRef.current === active) return;
    minimapEnabledRef.current = active;
    view.dispatch({
      effects: minimapCompartment.current.reconfigure(active ? minimapExt() : []),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showMinimap, docLength]);

  return <div ref={hostRef} className="editor-pane" />;
});

export default EditorPane;