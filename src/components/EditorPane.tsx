import { useEffect, useRef } from "react";
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLine } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { searchKeymap } from "@codemirror/search";
import { json, jsonParseLinter } from "@codemirror/lang-json";
import { linter, lintGutter } from "@codemirror/lint";

interface Props {
  value: string;
  onChange: (v: string) => void;
  onFormat: () => void;   // 默认 Shift-Alt-f
  onSave: () => void;     // 默认 Mod-s
  formatKey?: string;     // CodeMirror keymap 字符串,如 "Shift-Alt-f"
  saveKey?: string;       // CodeMirror keymap 字符串,如 "Mod-s"
}

export interface EditorHandle { view: EditorView | null; }

export default function EditorPane({
  value, onChange, onFormat, onSave,
  formatKey = "Shift-Alt-f", saveKey = "Mod-s",
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  // keymap 放进 Compartment,快捷键变化时 reconfigure 而不重建整个编辑器。
  const keymapCompartment = useRef(new Compartment());

  // 用 ref 持有最新回调:编辑器只创建一次,但 keymap/updateListener
  // 通过 ref 始终调用最新的 onFormat/onSave/onChange,避免陈旧闭包
  // (否则 keymap 会捕获首次渲染的 onFormat,其闭包里的 content 永远是初始空串)。
  const cbRef = useRef({ onChange, onFormat, onSave });
  cbRef.current = { onChange, onFormat, onSave };

  // 依据当前快捷键构建 keymap 扩展。key 用最新 props,回调经 cbRef 取最新。
  const buildKeymap = (fmtKey: string, svKey: string): Extension =>
    keymap.of([
      { key: fmtKey, run: () => { cbRef.current.onFormat(); return true; } },
      { key: svKey, run: () => { cbRef.current.onSave(); return true; } },
      ...defaultKeymap, ...historyKeymap, ...searchKeymap,
    ]);

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
        keymapCompartment.current.of(buildKeymap(formatKey, saveKey)),
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

  // 快捷键变化时,通过 compartment reconfigure 更新 keymap(不重建视图)。
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: keymapCompartment.current.reconfigure(buildKeymap(formatKey, saveKey)),
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
