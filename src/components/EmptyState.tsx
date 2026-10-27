import AppMark from "./AppMark";

interface Props {
  toggleHint: string;
}

export default function EmptyState({ toggleHint }: Props) {
  return (
    <div className="editor-empty" aria-hidden="true">
      <div className="empty-glow" />
      <div className="empty-mark"><AppMark size={56} /></div>
      <h2>把 JSON 放进来</h2>
      <p>直接粘贴就可以开始。右边是历史，挑一条接着改也行。</p>
      <div className="empty-keys">
        <span><kbd>{toggleHint}</kbd> 随时呼出</span>
        <span><kbd>⌘B</kbd> 历史面板</span>
        <span><kbd>⌘S</kbd> 导出文件</span>
      </div>
    </div>
  );
}