# JSONShelf 迭代 2 设计文档

**日期**: 2026-07-14
**状态**: 已批准
**前置**: 迭代 1(基础功能)已完成并打包。本轮为用户试用后的改进迭代。

## 背景

用户试用 v1 后提出:格式化快捷键失效(已作为紧急 bug 修复 —— 陈旧闭包)、失焦即隐藏太激进、UI 太丑、要可配置快捷键、要 dock 入口、历史保存不够清楚。

## 目标(6 项,分两批)

### 批次 1 —— 观感与行为(立竿见影)
1. **失焦不再默认隐藏**:从写死改为设置项,默认**关闭**。编辑时切到别处不再丢失面板。
2. **dock 图标可点击打开**:去掉 `skipTaskbar`,dock 显示图标;点击 dock 图标(macOS `Reopen` 事件)呼出并聚焦窗口。
3. **UI 重做**:暗色 + 原生毛玻璃(vibrancy)+ macOS 26 风格(圆角、层次、SF 字体、精细 hover/active)。
4. **历史保存更清楚**:保持自动保存,增加"已存入历史"状态提示 + 历史条目显示相对时间。

### 批次 2 —— 设置与可配置(前后端联动)
5. **设置页面**:承载快捷键自定义 + 失焦隐藏开关。
6. **快捷键可配置**:重录呼出键(⌥⌘J)、格式化键(⇧⌥F)、保存键(⌘S)等;全局呼出键改后**即时生效**(通知 Rust 注销旧键、注册新键,无需重启)。

`Esc` 隐藏窗口行为保留(不改)。

## 技术决策(已定)

| 决策点 | 选择 |
|--------|------|
| 配置存储 | **SQLite `settings` 表**(key-value,复用现有库,零新依赖) |
| 呼出键生效 | **即时**(前端改完 invoke 一个 Rust 命令,注销旧键+注册新键) |
| 失焦隐藏默认 | **关闭** |
| 毛玻璃实现 | **原生 vibrancy**(`window-vibrancy` crate,给窗口加 NSVisualEffectView) |
| dock 行为 | 显示 dock 图标,点击打开窗口 |

## 批次 1 详细设计

### 1.1 数据层:settings 表(批次 1 建表,批次 2 用满)
新迁移 `0002_settings.sql`:
```sql
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```
前端 `ipc.ts` 增 `getSetting(key): Promise<string|null>` / `setSetting(key, value): Promise<void>`。

### 1.2 失焦隐藏改为设置项
- 前端持有 `hideOnBlur: boolean` 状态(从 settings 读,默认 false)。
- Rust `setup_blur_hide` 当前无条件隐藏。改为:blur 时先查一个共享的 `AtomicBool HIDE_ON_BLUR`(默认 false),false 则不隐藏。
- 前端提供 Rust 命令 `set_hide_on_blur(enabled: bool)` 写入该 AtomicBool。App 启动时从 settings 读值并同步给 Rust。
- 保留 v1 已修的"toggle 后 300ms 抑制 blur"竞态防护。

### 1.3 dock 图标可点击打开
- `tauri.conf.json`: `skipTaskbar: false`(或删除该项,默认显示)。
- Rust:监听 macOS `RunEvent::Reopen`(点 dock 图标触发),显示+聚焦+居中主窗口。
- 在 `run()` 的 `.run(|app, event| ...)` 回调里处理 Reopen。

### 1.4 UI 重做(styles.css 整体替换 + 少量组件 class 调整)
- 原生 vibrancy:Rust 侧 `window-vibrancy` 给主窗口 `apply_vibrancy(NSVisualEffectMaterial::HudWindow 或 Sidebar)`;窗口背景设透明,让 vibrancy 透出。
- CSS:去掉纯色背景改半透明层次;更大圆角(12→16);SF 字体;工具栏按钮改图标+文字、精细 hover/active/focus 态;历史条目更好的间距与选中态;滚动条美化。
- 保持深色(vibrancy 用 dark material)。

### 1.5 历史保存提示
- 自动 upsert 成功后,状态栏短暂显示"已存入历史"(2s 后回 idle)。
- 历史条目显示相对时间(如"3分钟前"),用一个纯函数 `relativeTime(ts)` 实现(可测)。

## 批次 2 详细设计

### 2.1 快捷键配置模型
- settings 表存 3 个键:`hotkey.toggle`(默认 "Alt+Cmd+J")、`hotkey.format`(默认 "Shift+Alt+F")、`hotkey.save`(默认 "Cmd+S")。存标准化字符串。
- 前端 `hotkeys.ts` 纯函数:解析/序列化快捷键字符串 ↔ 结构;校验冲突;转 CodeMirror keymap 格式 / Tauri Shortcut 格式。

### 2.2 设置页面
- 新组件 `SettingsPanel.tsx`:模态或侧滑面板。含:
  - 快捷键录制行(点击 → 捕获下一个组合键 → 显示 → 保存到 settings)。
  - 失焦隐藏开关。
- 入口:工具栏加齿轮图标。

### 2.3 快捷键即时生效
- **编辑器内键(格式化/保存)**:前端持有 hotkey 状态,EditorPane 的 keymap 用动态 key(需让 keymap 可重配 —— 用 CodeMirror Compartment 动态重配 keymap,或重建 view)。
- **全局呼出键**:新 Rust 命令 `rebind_toggle_shortcut(accelerator: string)`:注销旧的 global shortcut,按新字符串解析并注册新的。前端录完新键后 invoke 它。解析失败/冲突则返回错误,前端提示并回滚。

## 组件/文件影响

**批次 1:**
- `src-tauri/migrations/0002_settings.sql`(新)
- `src-tauri/src/lib.rs`(注册新迁移;Reopen 事件;vibrancy)
- `src-tauri/src/window.rs`(HIDE_ON_BLUR AtomicBool;set_hide_on_blur 命令;reopen 显示)
- `src-tauri/Cargo.toml`(+ window-vibrancy)
- `src-tauri/tauri.conf.json`(skipTaskbar false)
- `src-tauri/capabilities/default.json`(如新命令需要)
- `src/lib/ipc.ts`(getSetting/setSetting/setHideOnBlur)
- `src/lib/relativeTime.ts`(新,纯函数 + 测试)
- `src/App.tsx`(读 hideOnBlur、历史提示、时间显示接线)
- `src/components/HistoryItem.tsx`(相对时间显示)
- `src/styles.css`(整体重做)

**批次 2:**
- `src/lib/hotkeys.ts`(新,纯函数 + 测试)
- `src/components/SettingsPanel.tsx`(新)
- `src/components/Toolbar.tsx`(齿轮入口)
- `src/components/EditorPane.tsx`(keymap 用 Compartment 动态重配)
- `src-tauri/src/shortcut.rs`(rebind_toggle_shortcut 命令)
- `src-tauri/src/lib.rs`(注册新命令)
- `src/App.tsx`(设置状态、录键接线)

## 错误处理

- vibrancy 应用失败(非 macOS 或 API 变动):降级为半透明 CSS 背景,不崩溃。
- 呼出键 rebind 失败(冲突/非法):返回错误,前端提示"该快捷键不可用",保留旧键。
- settings 读写失败:用默认值,不阻塞。
- 沿用 v1 原则:编辑器内容为唯一真相,后台错误只提示不打断。

## 测试策略

- 纯函数单测:`relativeTime`、`hotkeys`(解析/序列化/冲突校验)。
- 组件测:SettingsPanel 录键交互、失焦开关。
- Rust:settings 迁移;set_hide_on_blur / rebind 命令的单元测试(能测的部分)。
- 手动冒烟:vibrancy 观感、dock 点击、失焦开关实际行为、快捷键重录即时生效 —— 系统集成,人工验收。

## 明确不做(YAGNI)

- 快捷键云同步 / 导入导出配置
- 多套主题(仅做暗色毛玻璃一套;浅色留待以后)
- 快捷键之外的其他偏好(字号、缩进宽度等)—— 除非后续提出
