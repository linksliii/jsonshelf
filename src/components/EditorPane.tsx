import { useEffect, useRef } from "react";
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLine } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { searchKeymap, searchPanelOpen } from "@codemirror/search";
import { json, jsonParseLinter } from "@codemirror/lang-json";
import { linter, lintGutter } from "@codemirror/lint";
import { bracketMatching } from "@codemirror/language";
import {
  autocompletion, closeBrackets, closeBracketsKeymap,
} from "@codemirror/autocomplete";
import { hotkeyFromEvent, hotkeysEqual, parseHotkey, type Hotkey } from "../lib/hotkeys";

interface Props {
  value: string;
  onChange: (v: string) => void;
  onFormat: () => void;   // 默认 Shift+Alt+F
  onSave: () => void;     // 默认 Cmd+S
  onEscape?: () => void;  // Esc 时调用(如隐藏窗口),仅在编辑器未占用 Esc 时触发
  formatKey?: string;     // 规范快捷键串,如 "Shift+Alt+F"
  saveKey?: string;       // 规范快捷键串,如 "Cmd+S"
}

export interface EditorHandle { view: EditorView | null; }

export default function EditorPane({
  value, onChange, onFormat, onSave, onEscape,
  formatKey = "Shift+Alt+F", saveKey = "Cmd+S",
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  // 事件处理放进 Compartment,快捷键变化时 reconfigure 而不重建整个编辑器。
  const handlerCompartment = useRef(new Compartment());

  // 用 ref 持有最新回调:编辑器只创建一次,但事件处理通过 ref 始终调用最新的
  // onFormat/onSave/onChange/onEscape,避免陈旧闭包(否则会捕获首次渲染的
  // 空 content)。
  const cbRef = useRef({ onChange, onFormat, onSave, onEscape });
  cbRef.current = { onChange, onFormat, onSave, onEscape };

  // 依据当前快捷键构建 keydown 处理扩展。快捷键匹配用 e.code(物理键),
  // 不受 macOS Option 合字影响(⌥⇧F 的 e.key 会变成 "Ï",但 e.code 仍是 "KeyF")。
  const buildHandlers = (fmtRaw: string, svRaw: string): Extension => {
    const fmt: Hotkey | null = parseHotkey(fmtRaw);
    const sv: Hotkey | null = parseHotkey(svRaw);
    return EditorView.domEventHandlers({
      keydown: (e, view) => {
        // Esc:搜索面板打开时不拦截,交由 searchKeymap 关闭面板;CM 处理后会
        // preventDefault,冒泡到 window 时带 defaultPrevented,故不会连带隐藏窗口。
        // 无搜索面板时编辑器主动处理 Esc:调用 onEscape 隐藏窗口,并 preventDefault
        // + 消费事件,避免冒泡到 window 级监听造成重复调用(double-fire)。
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
      doc: value,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        history(),
        json(),
        linter(jsonParseLinter()),
        lintGutter(),
        // 基础编辑辅助:自动闭合括号/引号、括号匹配高亮、基础补全弹窗。
        closeBrackets(),
        bracketMatching(),
        autocompletion(),
        handlerCompartment.current.of(buildHandlers(formatKey, saveKey)),
        keymap.of([
          ...closeBracketsKeymap,
          ...defaultKeymap, ...historyKeymap, ...searchKeymap,
        ]),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) cbRef.current.onChange(u.state.doc.toString());
        }),
      ],
    });
    const view = new EditorView({ state, parent: hostRef.current });
    viewRef.current = view;
    return () => view.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 快捷键变化时,通过 compartment reconfigure 更新 keydown 处理(不重建视图)。
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: handlerCompartment.current.reconfigure(buildHandlers(formatKey, saveKey)),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formatKey, saveKey]);

  // 外部 setValue(格式化/加载历史后同步)
  useEffect(() => {
    const view = viewRef.current;
    if (view && value !== view.state.doc.toString()) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
    }
  }, [value]);

  return <div ref={hostRef} className="editor-pane" style={{ height: "100%" }} />;
}
