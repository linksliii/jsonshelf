import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import SettingsPanel from "../SettingsPanel";

const baseProps = {
  hotkeys: { toggle: "Alt+Cmd+J", format: "Shift+Alt+F", save: "Cmd+S", new: "Cmd+T", minimap: "Cmd+Shift+M" },
  onChangeHotkey: () => {},
  hideOnBlur: false,
  onChangeHideOnBlur: () => {},
  onClose: () => {},
};

describe("SettingsPanel", () => {
  it("open=false 时不渲染", () => {
    const { container } = render(<SettingsPanel open={false} {...baseProps} />);
    expect(container.firstChild).toBeNull();
  });

  it("open 时展示当前快捷键(规范化)", () => {
    render(<SettingsPanel open {...baseProps} />);
    expect(screen.getByText("呼出面板")).toBeInTheDocument();
    // formatHotkey 规范化: Alt+Cmd+J
    expect(screen.getByText("Alt+Cmd+J")).toBeInTheDocument();
  });

  it("展示新建快捷键行(规范化 Cmd+T)", () => {
    render(<SettingsPanel open {...baseProps} />);
    expect(screen.getByText("新建")).toBeInTheDocument();
    expect(screen.getByText("Cmd+T")).toBeInTheDocument();
  });

  it("点击新建行的录制并按下组合键触发 onChangeHotkey('new', ...)", () => {
    const onChangeHotkey = vi.fn();
    render(<SettingsPanel open {...baseProps} onChangeHotkey={onChangeHotkey} />);
    // 第 4 个"录制"对应 new 行
    fireEvent.click(screen.getAllByText("录制")[3]);
    fireEvent.keyDown(window, { key: "n", metaKey: true });
    expect(onChangeHotkey).toHaveBeenCalledWith("new", "Cmd+N");
  });

  it("点击录制后按下组合键触发 onChangeHotkey", () => {
    const onChangeHotkey = vi.fn();
    render(<SettingsPanel open {...baseProps} onChangeHotkey={onChangeHotkey} />);
    // 第一个"录制"对应 toggle 行
    fireEvent.click(screen.getAllByText("录制")[0]);
    expect(screen.getByText("按下快捷键…")).toBeInTheDocument();
    // 按下 Cmd+K
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    expect(onChangeHotkey).toHaveBeenCalledWith("toggle", "Cmd+K");
  });

  it("录制时按 Esc 取消录制,不触发 onChangeHotkey 也不关闭面板", () => {
    const onChangeHotkey = vi.fn();
    const onClose = vi.fn();
    render(<SettingsPanel open {...baseProps} onChangeHotkey={onChangeHotkey} onClose={onClose} />);
    fireEvent.click(screen.getAllByText("录制")[0]);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onChangeHotkey).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getAllByText("录制").length).toBeGreaterThan(0);
  });

  it("打开且未录制时按 Esc 关闭面板", () => {
    const onClose = vi.fn();
    render(<SettingsPanel open {...baseProps} onClose={onClose} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("切换失焦隐藏复选框触发 onChangeHideOnBlur", () => {
    const onChangeHideOnBlur = vi.fn();
    render(<SettingsPanel open {...baseProps} onChangeHideOnBlur={onChangeHideOnBlur} />);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(onChangeHideOnBlur).toHaveBeenCalledWith(true);
  });
});
