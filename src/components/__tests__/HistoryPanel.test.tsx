import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import HistoryPanel from "../HistoryPanel";
import type { HistoryEntry } from "../../types";

const entries: HistoryEntry[] = [
  { id: 1, title: "user_name", content: '{"user":1}', language: "json", pinned: true, createdAt: 0, updatedAt: 2 },
  { id: 2, title: "product", content: "[1,2,3]", language: "json", pinned: false, createdAt: 0, updatedAt: 1 },
];

describe("HistoryPanel", () => {
  beforeEach(() => vi.clearAllMocks());

  it("渲染条目列表", () => {
    render(<HistoryPanel entries={entries} selectedId={null} onCopyContent={() => {}} onSelect={() => {}} onRename={() => {}} onTogglePin={() => {}} onDelete={() => {}} onSearch={() => {}} />);
    expect(screen.getByText("user_name")).toBeInTheDocument();
    expect(screen.getByText("product")).toBeInTheDocument();
  });

  it("点击条目触发 onSelect", () => {
    const onSelect = vi.fn();
    render(<HistoryPanel entries={entries} selectedId={null} onCopyContent={() => {}} onSelect={onSelect} onRename={() => {}} onTogglePin={() => {}} onDelete={() => {}} onSearch={() => {}} />);
    fireEvent.click(screen.getByText("product"));
    expect(onSelect).toHaveBeenCalledWith(entries[1]);
  });

  it("搜索框输入触发 onSearch", async () => {
    const onSearch = vi.fn();
    render(<HistoryPanel entries={entries} selectedId={null} onCopyContent={() => {}} onSelect={() => {}} onRename={() => {}} onTogglePin={() => {}} onDelete={() => {}} onSearch={onSearch} />);
    fireEvent.change(screen.getByPlaceholderText(/搜索/), { target: { value: "usr" } });
    await waitFor(() => expect(onSearch).toHaveBeenCalledWith("usr"));
  });

  it("删除按钮触发 onDelete", () => {
    const onDelete = vi.fn();
    render(<HistoryPanel entries={entries} selectedId={null} onCopyContent={() => {}} onSelect={() => {}} onRename={() => {}} onTogglePin={() => {}} onDelete={onDelete} onSearch={() => {}} />);
    fireEvent.click(screen.getAllByLabelText("删除")[0]);
    expect(onDelete).toHaveBeenCalledWith(1);
  });

  it("双击标题重命名,失焦提交 trimmed 标题", () => {
    const onRename = vi.fn();
    render(<HistoryPanel entries={entries} selectedId={null} onCopyContent={() => {}} onSelect={() => {}} onRename={onRename} onTogglePin={() => {}} onDelete={() => {}} onSearch={() => {}} />);
    fireEvent.doubleClick(screen.getByText("product"));
    const input = screen.getByLabelText("重命名") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "  new title  " } });
    fireEvent.blur(input);
    expect(onRename).toHaveBeenCalledWith(2, "new title");
  });

  it("重命名为空白不提交", () => {
    const onRename = vi.fn();
    render(<HistoryPanel entries={entries} selectedId={null} onCopyContent={() => {}} onSelect={() => {}} onRename={onRename} onTogglePin={() => {}} onDelete={() => {}} onSearch={() => {}} />);
    fireEvent.doubleClick(screen.getByText("product"));
    const input = screen.getByLabelText("重命名") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.blur(input);
    expect(onRename).not.toHaveBeenCalled();
  });

  it("点击固定按钮切换 pinned 状态", () => {
    const onTogglePin = vi.fn();
    render(<HistoryPanel entries={entries} selectedId={null} onCopyContent={() => {}} onSelect={() => {}} onRename={() => {}} onTogglePin={onTogglePin} onDelete={() => {}} onSearch={() => {}} />);
    // entries[1] product 当前 pinned=false,点它的固定按钮应调用 (2, true)
    fireEvent.click(screen.getAllByLabelText("固定")[1]);
    expect(onTogglePin).toHaveBeenCalledWith(2, true);
  });
});
