# JSONShelf Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个 macOS 轻量 JSON 面板:全局快捷键呼出 Spotlight 式浮层,CodeMirror 6 编辑 JSON,一键格式化,历史条目可模糊搜索/命名/固定/回查,支持导出到本地文件。

**Architecture:** Tauri(Rust 主进程)负责全局快捷键、窗口浮层控制、SQLite 历史 CRUD、文件导出;React + Vite 前端用 CodeMirror 6 编辑,格式化纯前端(JSON 走原生、其他走动态导入的 Prettier),历史搜索用「后端 LIKE 粗筛 + 前端 fuzzy 精排」两级方案。编辑器内容为唯一真相,后台错误只提示不打断。

**Tech Stack:** Tauri 2 · React 18 · Vite · TypeScript · CodeMirror 6 · SQLite(tauri-plugin-sql)· Prettier(动态)· uFuzzy · Vitest · Testing Library

---

## 文件结构

```
json-tools/
├── src/                              # React 前端
│   ├── main.tsx                      # React 入口
│   ├── App.tsx                       # 顶层布局:Toolbar + EditorPane + HistoryPanel
│   ├── components/
│   │   ├── EditorPane.tsx            # CodeMirror 6 封装
│   │   ├── HistoryPanel.tsx          # 历史列表 + 搜索框 + 条目交互
│   │   ├── HistoryItem.tsx           # 单条历史行(命名/固定/删除)
│   │   └── Toolbar.tsx               # 语言选择 + 格式化/压缩/保存按钮 + 状态栏
│   ├── lib/
│   │   ├── formatter.ts              # 纯函数:formatJSON/minifyJSON/formatOther
│   │   ├── fuzzy.ts                  # 纯函数:fuzzyRank(候选集精排+高亮)
│   │   ├── title.ts                  # 纯函数:autoTitle(content)
│   │   └── ipc.ts                    # 封装所有 Tauri invoke
│   ├── hooks/
│   │   └── useHotkeys.ts             # 快捷键绑定层
│   └── types.ts                      # 共享类型:HistoryEntry 等
├── src-tauri/
│   ├── src/
│   │   ├── main.rs                   # Tauri 入口 + 插件注册 + 命令注册
│   │   ├── db.rs                     # SQLite 连接 + 迁移
│   │   ├── commands/
│   │   │   ├── mod.rs
│   │   │   ├── history.rs            # list/get/upsert/rename/toggle_pin/delete/search
│   │   │   └── export.rs            # 保存对话框 + 写 .json
│   │   ├── window.rs                 # 浮层显示/隐藏/居中/失焦隐藏
│   │   └── shortcut.rs               # 全局快捷键注册
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── migrations/
│       └── 0001_init.sql             # history 表 + 索引
├── src/lib/__tests__/               # 前端纯函数单测
│   ├── formatter.test.ts
│   ├── fuzzy.test.ts
│   └── title.test.ts
├── src/components/__tests__/
│   └── HistoryPanel.test.tsx
├── package.json
├── vite.config.ts
├── vitest.config.ts
├── tsconfig.json
└── docs/superpowers/                # 已存在
```

---

## Task 0: 环境准备(Rust 工具链)

**说明:** Node v24 + pnpm 10 已就绪,Xcode CLT 已装。Rust/Cargo 未安装,Tauri 必需。此任务无测试(纯环境),完成即验证。

- [ ] **Step 1: 安装 rustup + Rust 稳定版**

如已装可跳过。运行:
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
source "$HOME/.cargo/env"
```

- [ ] **Step 2: 验证工具链**

```bash
rustc --version && cargo --version
```
Expected: 两行版本号(如 `rustc 1.8x.x` / `cargo 1.8x.x`),无 "command not found"。

- [ ] **Step 3: 安装 Tauri CLI**

```bash
cargo install tauri-cli --version "^2.0" --locked
cargo tauri --version
```
Expected: 输出 `tauri-cli 2.x.x`。

---

## Task 1: 脚手架 + 前端测试环境

**Files:**
- Create: `package.json`, `vite.config.ts`, `vitest.config.ts`, `tsconfig.json`, `index.html`, `src/main.tsx`, `src/App.tsx`
- Create: `src-tauri/`(由 tauri init 生成后调整)

- [ ] **Step 1: 用 Vite 创建 React+TS 前端**

在项目根运行(目录已存在 docs/,create 命令需允许非空目录,故手动初始化):
```bash
cd /Users/didi/Documents/json-tools
pnpm init
pnpm add react react-dom
pnpm add -D vite @vitejs/plugin-react typescript @types/react @types/react-dom
pnpm add -D vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
```

- [ ] **Step 2: 写 `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: 写 `vite.config.ts`**

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  envPrefix: ["VITE_", "TAURI_"],
});
```

- [ ] **Step 4: 写 `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test-setup.ts"],
  },
});
```

- [ ] **Step 5: 写 `src/test-setup.ts`**

```ts
import "@testing-library/jest-dom";
```

- [ ] **Step 6: 写 `index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>JSONShelf</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 7: 写最小 `src/main.tsx` 与 `src/App.tsx`**

`src/main.tsx`:
```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

`src/App.tsx`:
```tsx
export default function App() {
  return <div>JSONShelf</div>;
}
```

- [ ] **Step 8: 在 package.json 加 scripts**

```json
"scripts": {
  "dev": "vite",
  "build": "tsc && vite build",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

- [ ] **Step 9: 验证前端构建与测试框架**

```bash
pnpm build && pnpm test
```
Expected: build 成功;test 输出 "No test files found"(此刻无测试)不报错即可。

- [ ] **Step 10: Commit**

```bash
git add -A && git commit -m "chore: scaffold React+Vite+Vitest frontend"
```

---

## Task 2: formatter 纯函数(TDD)

**Files:**
- Create: `src/lib/formatter.ts`
- Test: `src/lib/__tests__/formatter.test.ts`

- [ ] **Step 1: 写失败测试**

`src/lib/__tests__/formatter.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { formatJSON, minifyJSON } from "../formatter";

describe("formatJSON", () => {
  it("缩进 2 空格格式化", () => {
    expect(formatJSON('{"a":1}')).toBe('{\n  "a": 1\n}');
  });
  it("非法 JSON 抛带位置的错误", () => {
    expect(() => formatJSON("{bad}")).toThrow();
  });
  it("空字符串抛错", () => {
    expect(() => formatJSON("")).toThrow();
  });
});

describe("minifyJSON", () => {
  it("压缩去除空白", () => {
    expect(minifyJSON('{\n  "a": 1\n}')).toBe('{"a":1}');
  });
  it("非法 JSON 抛错", () => {
    expect(() => minifyJSON("{bad}")).toThrow();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
pnpm test src/lib/__tests__/formatter.test.ts
```
Expected: FAIL,报 `formatter` 模块不存在。

- [ ] **Step 3: 实现 formatter**

`src/lib/formatter.ts`:
```ts
export function formatJSON(input: string, indent = 2): string {
  const parsed = JSON.parse(input);
  return JSON.stringify(parsed, null, indent);
}

export function minifyJSON(input: string): string {
  const parsed = JSON.parse(input);
  return JSON.stringify(parsed);
}

// 非 JSON 语言:动态导入 Prettier,失败则抛错由调用方降级
export async function formatOther(input: string, language: string): Promise<string> {
  const prettier = await import("prettier/standalone");
  const parserMap: Record<string, () => Promise<any>> = {
    yaml: () => import("prettier/plugins/yaml"),
    html: () => import("prettier/plugins/html"),
    css: () => import("prettier/plugins/postcss"),
    babel: () => import("prettier/plugins/babel"),
  };
  const parserKeyMap: Record<string, string> = {
    yaml: "yaml", html: "html", css: "css", javascript: "babel", js: "babel",
  };
  const pluginLoader = parserMap[parserKeyMap[language] ?? language];
  if (!pluginLoader) throw new Error(`unsupported language: ${language}`);
  const plugin = await pluginLoader();
  const estree = language === "javascript" || language === "js"
    ? await import("prettier/plugins/estree")
    : null;
  return prettier.format(input, {
    parser: parserKeyMap[language] ?? language,
    plugins: estree ? [plugin.default ?? plugin, estree.default ?? estree] : [plugin.default ?? plugin],
  });
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
pnpm test src/lib/__tests__/formatter.test.ts
```
Expected: PASS(5 个用例)。`formatOther` 暂无测试,依赖网络/插件,留待手动冒烟。

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: JSON format/minify pure functions with tests"
```

---

## Task 3: fuzzy 精排纯函数(TDD)

**Files:**
- Create: `src/lib/fuzzy.ts`, `src/types.ts`
- Test: `src/lib/__tests__/fuzzy.test.ts`
- Dep: `pnpm add @leeoniya/ufuzzy`

- [ ] **Step 1: 定义共享类型 `src/types.ts`**

```ts
export interface HistoryEntry {
  id: number;
  title: string;
  content: string;
  language: string;
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
}
```

- [ ] **Step 2: 装依赖**

```bash
pnpm add @leeoniya/ufuzzy
```

- [ ] **Step 3: 写失败测试**

`src/lib/__tests__/fuzzy.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { fuzzyRank } from "../fuzzy";
import type { HistoryEntry } from "../../types";

const mk = (id: number, title: string, content = ""): HistoryEntry => ({
  id, title, content, language: "json", pinned: false, createdAt: 0, updatedAt: id,
});

describe("fuzzyRank", () => {
  const items = [mk(1, "user_name"), mk(2, "product list"), mk(3, "config", '{"user":1}')];

  it("空 query 原样返回", () => {
    expect(fuzzyRank(items, "").map(r => r.entry.id)).toEqual([1, 2, 3]);
  });
  it("子序列模糊命中 title", () => {
    const ids = fuzzyRank(items, "usrnm").map(r => r.entry.id);
    expect(ids).toContain(1);
  });
  it("命中 content", () => {
    const ids = fuzzyRank(items, "user").map(r => r.entry.id);
    expect(ids).toContain(3);
  });
  it("无匹配返回空", () => {
    expect(fuzzyRank(items, "zzzzz")).toEqual([]);
  });
});
```

- [ ] **Step 4: 运行确认失败**

```bash
pnpm test src/lib/__tests__/fuzzy.test.ts
```
Expected: FAIL,`fuzzy` 模块不存在。

- [ ] **Step 5: 实现 fuzzy**

`src/lib/fuzzy.ts`:
```ts
import uFuzzy from "@leeoniya/ufuzzy";
import type { HistoryEntry } from "../types";

export interface RankedEntry {
  entry: HistoryEntry;
  // 匹配区间用于高亮:[start,end) 相对 haystack 字符串
}

// 在 title + content 上做子序列模糊匹配,返回按相关性排序的条目
export function fuzzyRank(items: HistoryEntry[], query: string): RankedEntry[] {
  if (!query.trim()) return items.map((entry) => ({ entry }));
  const uf = new uFuzzy({ intraMode: 1 });
  const haystack = items.map((it) => `${it.title} ${it.content}`);
  const idxs = uf.filter(haystack, query);
  if (!idxs || idxs.length === 0) return [];
  const info = uf.info(idxs, haystack, query);
  const order = uf.sort(info, haystack, query);
  return order.map((oi) => ({ entry: items[info.idx[oi]] }));
}
```

- [ ] **Step 6: 运行确认通过**

```bash
pnpm test src/lib/__tests__/fuzzy.test.ts
```
Expected: PASS(4 个用例)。若 uFuzzy 对 "usrnm" 子序列默认不命中,将 `intraMode: 1` 保留(允许单字符替换/插入),测试用例已按此行为设计。

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: fuzzy ranking over history title+content"
```

---

## Task 4: autoTitle 纯函数(TDD)

**Files:**
- Create: `src/lib/title.ts`
- Test: `src/lib/__tests__/title.test.ts`

- [ ] **Step 1: 写失败测试**

`src/lib/__tests__/title.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { autoTitle } from "../title";

describe("autoTitle", () => {
  it("取 JSON 首个顶层键", () => {
    expect(autoTitle('{"name":"x","age":1}')).toBe("name");
  });
  it("数组给出元素计数摘要", () => {
    expect(autoTitle("[1,2,3]")).toBe("array[3]");
  });
  it("非法/空内容回退为 Untitled", () => {
    expect(autoTitle("")).toBe("Untitled");
    expect(autoTitle("{bad}")).toBe("Untitled");
  });
  it("超长键截断到 40 字符", () => {
    const longKey = "k".repeat(60);
    expect(autoTitle(`{"${longKey}":1}`).length).toBeLessThanOrEqual(40);
  });
});
```

- [ ] **Step 2: 运行确认失败**

```bash
pnpm test src/lib/__tests__/title.test.ts
```
Expected: FAIL,模块不存在。

- [ ] **Step 3: 实现 title**

`src/lib/title.ts`:
```ts
export function autoTitle(content: string): string {
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) return `array[${parsed.length}]`;
    if (parsed && typeof parsed === "object") {
      const keys = Object.keys(parsed);
      if (keys.length > 0) return keys[0].slice(0, 40);
    }
    return "Untitled";
  } catch {
    return "Untitled";
  }
}
```

- [ ] **Step 4: 运行确认通过**

```bash
pnpm test src/lib/__tests__/title.test.ts
```
Expected: PASS(4 个用例)。

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: auto-title generation from JSON content"
```

---

## Task 5: Tauri 后端脚手架 + SQLite 迁移

**Files:**
- Create: `src-tauri/` 整套(tauri init 生成)
- Create: `src-tauri/migrations/0001_init.sql`
- Modify: `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `src-tauri/src/main.rs`

- [ ] **Step 1: 初始化 Tauri**

```bash
cd /Users/didi/Documents/json-tools
cargo tauri init --ci \
  --app-name "JSONShelf" \
  --window-title "JSONShelf" \
  --frontend-dist ../dist \
  --dev-url http://localhost:1420 \
  --before-dev-command "pnpm dev" \
  --before-build-command "pnpm build"
```
Expected: 生成 `src-tauri/`。

- [ ] **Step 2: 加 SQL 插件依赖**

编辑 `src-tauri/Cargo.toml`,在 `[dependencies]` 加:
```toml
tauri-plugin-sql = { version = "2", features = ["sqlite"] }
tauri-plugin-global-shortcut = "2"
tauri-plugin-dialog = "2"
tauri-plugin-fs = "2"
```

- [ ] **Step 3: 写迁移 `src-tauri/migrations/0001_init.sql`**

```sql
CREATE TABLE IF NOT EXISTS history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT    NOT NULL,
  content     TEXT    NOT NULL,
  language    TEXT    NOT NULL DEFAULT 'json',
  pinned      INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_history_updated ON history(pinned DESC, updated_at DESC);
```

- [ ] **Step 4: 在 main.rs 注册插件与迁移**

`src-tauri/src/main.rs`(替换 builder 部分):
```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri_plugin_sql::{Migration, MigrationKind};

fn main() {
    let migrations = vec![Migration {
        version: 1,
        description: "create history table",
        sql: include_str!("../migrations/0001_init.sql"),
        kind: MigrationKind::Up,
    }];

    tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:jsonshelf.db", migrations)
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 5: 验证后端可编译**

```bash
cd src-tauri && cargo check
```
Expected: 编译通过(首次会拉依赖,较慢)。

- [ ] **Step 6: Commit**

```bash
cd /Users/didi/Documents/json-tools
git add -A && git commit -m "feat: Tauri backend scaffold + SQLite history migration"
```

---

## Task 6: ipc 封装 + 历史 CRUD(前端侧 + DB 交互)

**说明:** tauri-plugin-sql 允许前端直接执行 SQL,历史 CRUD 放在前端 `ipc.ts` 里通过 SQL 完成,避免额外 Rust 命令层(更轻)。搜索的 LIKE 粗筛也在此。

**Files:**
- Create: `src/lib/ipc.ts`
- Dep: `pnpm add @tauri-apps/plugin-sql @tauri-apps/api`

- [ ] **Step 1: 装前端插件包**

```bash
pnpm add @tauri-apps/plugin-sql @tauri-apps/api @tauri-apps/plugin-dialog @tauri-apps/plugin-fs
```

- [ ] **Step 2: 实现 `src/lib/ipc.ts`**

```ts
import Database from "@tauri-apps/plugin-sql";
import type { HistoryEntry } from "../types";

let dbPromise: Promise<Database> | null = null;
function db(): Promise<Database> {
  if (!dbPromise) dbPromise = Database.load("sqlite:jsonshelf.db");
  return dbPromise;
}

interface Row {
  id: number; title: string; content: string; language: string;
  pinned: number; created_at: number; updated_at: number;
}
const toEntry = (r: Row): HistoryEntry => ({
  id: r.id, title: r.title, content: r.content, language: r.language,
  pinned: r.pinned === 1, createdAt: r.created_at, updatedAt: r.updated_at,
});

export async function listHistory(): Promise<HistoryEntry[]> {
  const d = await db();
  const rows = await d.select<Row[]>(
    "SELECT * FROM history ORDER BY pinned DESC, updated_at DESC"
  );
  return rows.map(toEntry);
}

// LIKE 粗筛(不区分大小写);精排在前端 fuzzy 做
export async function searchHistory(keyword: string): Promise<HistoryEntry[]> {
  const d = await db();
  const kw = `%${keyword}%`;
  const rows = await d.select<Row[]>(
    "SELECT * FROM history WHERE title LIKE ?1 OR content LIKE ?1 ORDER BY pinned DESC, updated_at DESC",
    [kw]
  );
  return rows.map(toEntry);
}

export async function upsertHistory(
  entry: { id: number | null; title: string; content: string; language: string }
): Promise<number> {
  const d = await db();
  const now = Date.now();
  if (entry.id == null) {
    const res = await d.execute(
      "INSERT INTO history (title, content, language, pinned, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)",
      [entry.title, entry.content, entry.language, now, now]
    );
    return res.lastInsertId as number;
  }
  await d.execute(
    "UPDATE history SET title=?, content=?, language=?, updated_at=? WHERE id=?",
    [entry.title, entry.content, entry.language, now, entry.id]
  );
  return entry.id;
}

export async function renameHistory(id: number, title: string): Promise<void> {
  const d = await db();
  await d.execute("UPDATE history SET title=?, updated_at=? WHERE id=?", [title, Date.now(), id]);
}

export async function togglePin(id: number, pinned: boolean): Promise<void> {
  const d = await db();
  await d.execute("UPDATE history SET pinned=? WHERE id=?", [pinned ? 1 : 0, id]);
}

export async function deleteHistory(id: number): Promise<void> {
  const d = await db();
  await d.execute("DELETE FROM history WHERE id=?", [id]);
}
```

- [ ] **Step 3: 类型检查**

```bash
pnpm build
```
Expected: tsc 通过(注意:此文件仅在 Tauri 运行时可真正执行,构建期只做类型检查)。

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: history CRUD + LIKE search via tauri-plugin-sql"
```

---

## Task 7: EditorPane 组件(CodeMirror 6)

**Files:**
- Create: `src/components/EditorPane.tsx`
- Dep: `pnpm add @codemirror/state @codemirror/view @codemirror/lang-json @codemirror/lint @codemirror/commands codemirror`

- [ ] **Step 1: 装 CodeMirror**

```bash
pnpm add codemirror @codemirror/state @codemirror/view @codemirror/lang-json @codemirror/lint @codemirror/commands @codemirror/search
```

- [ ] **Step 2: 实现 EditorPane**

`src/components/EditorPane.tsx`:
```tsx
import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLine } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { searchKeymap } from "@codemirror/search";
import { json, jsonParseLinter } from "@codemirror/lang-json";
import { linter, lintGutter } from "@codemirror/lint";

interface Props {
  value: string;
  onChange: (v: string) => void;
  onFormat: () => void;   // ⇧⌥F
  onSave: () => void;     // ⌘S
}

export interface EditorHandle { view: EditorView | null; }

export default function EditorPane({ value, onChange, onFormat, onSave }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

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
        keymap.of([
          { key: "Shift-Alt-f", run: () => { onFormat(); return true; } },
          { key: "Mod-s", run: () => { onSave(); return true; } },
          ...defaultKeymap, ...historyKeymap, ...searchKeymap,
        ]),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) onChange(u.state.doc.toString());
        }),
      ],
    });
    const view = new EditorView({ state, parent: hostRef.current });
    viewRef.current = view;
    return () => view.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 外部 setValue(格式化/加载历史后同步)
  useEffect(() => {
    const view = viewRef.current;
    if (view && value !== view.state.doc.toString()) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
    }
  }, [value]);

  return <div ref={hostRef} className="editor-pane" style={{ height: "100%" }} />;
}
```

- [ ] **Step 3: 类型检查**

```bash
pnpm build
```
Expected: tsc 通过。

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: EditorPane wrapping CodeMirror 6 with JSON lint + format/save keys"
```

---

## Task 8: HistoryPanel + HistoryItem 组件(TDD)

**Files:**
- Create: `src/components/HistoryPanel.tsx`, `src/components/HistoryItem.tsx`
- Test: `src/components/__tests__/HistoryPanel.test.tsx`

- [ ] **Step 1: 写失败测试(mock ipc)**

`src/components/__tests__/HistoryPanel.test.tsx`:
```tsx
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
    render(<HistoryPanel entries={entries} onSelect={() => {}} onRename={() => {}} onTogglePin={() => {}} onDelete={() => {}} onSearch={() => {}} />);
    expect(screen.getByText("user_name")).toBeInTheDocument();
    expect(screen.getByText("product")).toBeInTheDocument();
  });

  it("点击条目触发 onSelect", () => {
    const onSelect = vi.fn();
    render(<HistoryPanel entries={entries} onSelect={onSelect} onRename={() => {}} onTogglePin={() => {}} onDelete={() => {}} onSearch={() => {}} />);
    fireEvent.click(screen.getByText("product"));
    expect(onSelect).toHaveBeenCalledWith(entries[1]);
  });

  it("搜索框输入触发 onSearch", async () => {
    const onSearch = vi.fn();
    render(<HistoryPanel entries={entries} onSelect={() => {}} onRename={() => {}} onTogglePin={() => {}} onDelete={() => {}} onSearch={onSearch} />);
    fireEvent.change(screen.getByPlaceholderText(/搜索/), { target: { value: "usr" } });
    await waitFor(() => expect(onSearch).toHaveBeenCalledWith("usr"));
  });

  it("删除按钮触发 onDelete", () => {
    const onDelete = vi.fn();
    render(<HistoryPanel entries={entries} onSelect={() => {}} onRename={() => {}} onTogglePin={() => {}} onDelete={onDelete} onSearch={() => {}} />);
    fireEvent.click(screen.getAllByLabelText("删除")[0]);
    expect(onDelete).toHaveBeenCalledWith(1);
  });
});
```

- [ ] **Step 2: 运行确认失败**

```bash
pnpm test src/components/__tests__/HistoryPanel.test.tsx
```
Expected: FAIL,组件不存在。

- [ ] **Step 3: 实现 HistoryItem**

`src/components/HistoryItem.tsx`:
```tsx
import { useState } from "react";
import type { HistoryEntry } from "../types";

interface Props {
  entry: HistoryEntry;
  onSelect: (e: HistoryEntry) => void;
  onRename: (id: number, title: string) => void;
  onTogglePin: (id: number, pinned: boolean) => void;
  onDelete: (id: number) => void;
}

export default function HistoryItem({ entry, onSelect, onRename, onTogglePin, onDelete }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(entry.title);

  return (
    <div className="history-item" onClick={() => onSelect(entry)}>
      {editing ? (
        <input
          value={draft}
          autoFocus
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => { setEditing(false); if (draft.trim()) onRename(entry.id, draft.trim()); }}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        />
      ) : (
        <span className="title" onDoubleClick={(e) => { e.stopPropagation(); setEditing(true); }}>
          {entry.pinned ? "📌 " : ""}{entry.title}
        </span>
      )}
      <button aria-label="固定" onClick={(e) => { e.stopPropagation(); onTogglePin(entry.id, !entry.pinned); }}>
        {entry.pinned ? "取消固定" : "固定"}
      </button>
      <button aria-label="删除" onClick={(e) => { e.stopPropagation(); onDelete(entry.id); }}>删除</button>
    </div>
  );
}
```

- [ ] **Step 4: 实现 HistoryPanel**

`src/components/HistoryPanel.tsx`:
```tsx
import { useEffect, useRef, useState } from "react";
import type { HistoryEntry } from "../types";
import HistoryItem from "./HistoryItem";

interface Props {
  entries: HistoryEntry[];
  onSelect: (e: HistoryEntry) => void;
  onRename: (id: number, title: string) => void;
  onTogglePin: (id: number, pinned: boolean) => void;
  onDelete: (id: number) => void;
  onSearch: (keyword: string) => void;
}

export default function HistoryPanel(props: Props) {
  const [kw, setKw] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => props.onSearch(kw), 200);
    return () => { if (timer.current) clearTimeout(timer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kw]);

  return (
    <aside className="history-panel">
      <input
        className="history-search"
        placeholder="搜索历史…"
        value={kw}
        onChange={(e) => setKw(e.target.value)}
      />
      <div className="history-list">
        {props.entries.map((entry) => (
          <HistoryItem
            key={entry.id}
            entry={entry}
            onSelect={props.onSelect}
            onRename={props.onRename}
            onTogglePin={props.onTogglePin}
            onDelete={props.onDelete}
          />
        ))}
      </div>
    </aside>
  );
}
```

- [ ] **Step 5: 运行确认通过**

```bash
pnpm test src/components/__tests__/HistoryPanel.test.tsx
```
Expected: PASS(4 个用例)。

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: HistoryPanel + HistoryItem with rename/pin/delete/search"
```

---

## Task 9: Toolbar 组件

**Files:**
- Create: `src/components/Toolbar.tsx`

- [ ] **Step 1: 实现 Toolbar**

`src/components/Toolbar.tsx`:
```tsx
interface Props {
  language: string;
  onLanguageChange: (lang: string) => void;
  onFormat: () => void;
  onMinify: () => void;
  onSave: () => void;
  saveToHistory: boolean;
  onToggleSaveToHistory: (v: boolean) => void;
  status: { kind: "ok" | "error" | "idle"; message: string };
}

const LANGUAGES = ["json", "yaml", "html", "css", "javascript"];

export default function Toolbar(props: Props) {
  return (
    <div className="toolbar">
      <select value={props.language} onChange={(e) => props.onLanguageChange(e.target.value)}>
        {LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
      </select>
      <button onClick={props.onFormat}>格式化 (⇧⌥F)</button>
      <button onClick={props.onMinify}>压缩</button>
      <button onClick={props.onSave}>保存到文件 (⌘S)</button>
      <label>
        <input type="checkbox" checked={props.saveToHistory}
          onChange={(e) => props.onToggleSaveToHistory(e.target.checked)} />
        保存到历史
      </label>
      <span className={`status status-${props.status.kind}`}>{props.status.message}</span>
    </div>
  );
}
```

- [ ] **Step 2: 类型检查**

```bash
pnpm build
```
Expected: tsc 通过(App 尚未接线,若报未使用组件属正常,下一任务接线)。

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: Toolbar with language select, format/minify/save, history toggle, status"
```

---

## Task 10: App 接线 + 导出命令(Rust)

**Files:**
- Modify: `src/App.tsx`
- Create: `src-tauri/src/commands/mod.rs`, `src-tauri/src/commands/export.rs`
- Modify: `src-tauri/src/main.rs`

- [ ] **Step 1: 写导出命令 `src-tauri/src/commands/export.rs`**

```rust
use tauri_plugin_dialog::DialogExt;
use std::fs;

#[tauri::command]
pub async fn export_json(app: tauri::AppHandle, content: String, default_name: String) -> Result<Option<String>, String> {
    let file_path = app
        .dialog()
        .file()
        .set_file_name(&default_name)
        .add_filter("JSON", &["json"])
        .blocking_save_file();

    match file_path {
        Some(path) => {
            let p = path.into_path().map_err(|e| e.to_string())?;
            fs::write(&p, content).map_err(|e| e.to_string())?;
            Ok(Some(p.to_string_lossy().to_string()))
        }
        None => Ok(None), // 用户取消
    }
}
```

- [ ] **Step 2: 写 `src-tauri/src/commands/mod.rs`**

```rust
pub mod export;
```

- [ ] **Step 3: 在 main.rs 注册命令**

在 `main.rs` 顶部加 `mod commands;`,在 builder 加:
```rust
.invoke_handler(tauri::generate_handler![commands::export::export_json])
```

- [ ] **Step 4: 前端 ipc 加导出封装**

在 `src/lib/ipc.ts` 追加:
```ts
import { invoke } from "@tauri-apps/api/core";

export async function exportJSON(content: string, defaultName: string): Promise<string | null> {
  return invoke<string | null>("export_json", { content, defaultName });
}
```

- [ ] **Step 5: 接线 App.tsx**

`src/App.tsx`(完整替换):
```tsx
import { useCallback, useEffect, useRef, useState } from "react";
import EditorPane from "./components/EditorPane";
import HistoryPanel from "./components/HistoryPanel";
import Toolbar from "./components/Toolbar";
import { formatJSON, minifyJSON, formatOther } from "./lib/formatter";
import { autoTitle } from "./lib/title";
import { fuzzyRank } from "./lib/fuzzy";
import {
  listHistory, searchHistory, upsertHistory,
  renameHistory, togglePin, deleteHistory, exportJSON,
} from "./lib/ipc";
import type { HistoryEntry } from "./types";

export default function App() {
  const [content, setContent] = useState("");
  const [language, setLanguage] = useState("json");
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [currentId, setCurrentId] = useState<number | null>(null);
  const [saveToHistory, setSaveToHistory] = useState(true);
  const [status, setStatus] = useState<{ kind: "ok" | "error" | "idle"; message: string }>({ kind: "idle", message: "" });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    try { setEntries(await listHistory()); } catch { /* DB 不可用不阻塞编辑 */ }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  // 防抖 upsert(仅当开关开)
  useEffect(() => {
    if (!saveToHistory || !content.trim()) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const id = await upsertHistory({ id: currentId, title: autoTitle(content), content, language });
        if (currentId == null) setCurrentId(id);
        refresh();
      } catch { /* 写失败不打断 */ }
    }, 800);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [content, language, saveToHistory, currentId, refresh]);

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

  const handleSearch = useCallback(async (kw: string) => {
    try {
      const candidates = kw.trim() ? await searchHistory(kw) : await listHistory();
      setEntries(kw.trim() ? fuzzyRank(candidates, kw).map((r) => r.entry) : candidates);
    } catch { /* ignore */ }
  }, []);

  const handleSelect = useCallback((e: HistoryEntry) => {
    setContent(e.content); setLanguage(e.language); setCurrentId(e.id);
  }, []);

  return (
    <div className="app">
      <Toolbar
        language={language} onLanguageChange={setLanguage}
        onFormat={handleFormat} onMinify={handleMinify} onSave={handleSave}
        saveToHistory={saveToHistory} onToggleSaveToHistory={setSaveToHistory}
        status={status}
      />
      <div className="main">
        <EditorPane value={content} onChange={setContent} onFormat={handleFormat} onSave={handleSave} />
        <HistoryPanel
          entries={entries}
          onSelect={handleSelect}
          onRename={async (id, t) => { await renameHistory(id, t); refresh(); }}
          onTogglePin={async (id, p) => { await togglePin(id, p); refresh(); }}
          onDelete={async (id) => { await deleteHistory(id); if (id === currentId) setCurrentId(null); refresh(); }}
          onSearch={handleSearch}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 6: 后端编译 + 前端构建**

```bash
cd src-tauri && cargo check && cd .. && pnpm build
```
Expected: 均通过。

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: wire App + export command (save .json to disk)"
```

---

## Task 11: 全局快捷键 + Spotlight 浮层窗口

**Files:**
- Modify: `src-tauri/tauri.conf.json`(窗口配置)
- Create: `src-tauri/src/window.rs`, `src-tauri/src/shortcut.rs`
- Modify: `src-tauri/src/main.rs`

- [ ] **Step 1: 配置浮层窗口 `tauri.conf.json`**

在 `app.windows[0]` 设置:
```json
{
  "label": "main",
  "title": "JSONShelf",
  "width": 820,
  "height": 560,
  "center": true,
  "resizable": true,
  "decorations": false,
  "transparent": true,
  "alwaysOnTop": true,
  "skipTaskbar": true,
  "visible": false
}
```

- [ ] **Step 2: 写窗口控制 `src-tauri/src/window.rs`**

```rust
use tauri::{Manager, WebviewWindow};

pub fn toggle_panel(window: &WebviewWindow) {
    if window.is_visible().unwrap_or(false) {
        let _ = window.hide();
    } else {
        let _ = window.center();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

pub fn hide_panel(window: &WebviewWindow) {
    let _ = window.hide();
}

// 失焦自动隐藏
pub fn setup_blur_hide(app: &tauri::App) {
    if let Some(win) = app.get_webview_window("main") {
        let w = win.clone();
        win.on_window_event(move |event| {
            if let tauri::WindowEvent::Focused(false) = event {
                let _ = w.hide();
            }
        });
    }
}
```

- [ ] **Step 3: 写全局快捷键 `src-tauri/src/shortcut.rs`**

```rust
use tauri::Manager;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
use crate::window::toggle_panel;

pub fn register(app: &tauri::App) -> tauri::Result<()> {
    // ⌥⌘J
    let toggle = Shortcut::new(Some(Modifiers::ALT | Modifiers::SUPER), Code::KeyJ);
    let handle = app.handle().clone();
    app.handle().plugin(
        tauri_plugin_global_shortcut::Builder::new()
            .with_handler(move |_app, shortcut, event| {
                if event.state() == ShortcutState::Pressed && shortcut == &toggle {
                    if let Some(win) = handle.get_webview_window("main") {
                        toggle_panel(&win);
                    }
                }
            })
            .build(),
    )?;
    app.global_shortcut().register(toggle)?;
    Ok(())
}
```

- [ ] **Step 4: main.rs 组装 setup**

在 `main.rs` 加 `mod window; mod shortcut;`,并在 builder 加 `.setup`:
```rust
.setup(|app| {
    shortcut::register(app)?;
    window::setup_blur_hide(app);
    Ok(())
})
```
同时确保 `use tauri::Manager;` 与 `tauri_plugin_global_shortcut` 已在依赖(Task 5 已加)。

- [ ] **Step 5: 前端 Esc 隐藏 + 钉住开关**

在 `src/App.tsx` 顶部 effect 里加 Esc 监听(通过窗口 API 隐藏):
```tsx
import { getCurrentWindow } from "@tauri-apps/api/window";
// …在组件内:
useEffect(() => {
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") getCurrentWindow().hide();
  };
  window.addEventListener("keydown", onKey);
  return () => window.removeEventListener("keydown", onKey);
}, []);
```

- [ ] **Step 6: 编译**

```bash
cd src-tauri && cargo check
```
Expected: 通过。

- [ ] **Step 7: Commit**

```bash
cd /Users/didi/Documents/json-tools
git add -A && git commit -m "feat: global shortcut toggle + Spotlight-style floating panel + blur/Esc hide"
```

---

## Task 12: 样式 + 端到端手动冒烟

**Files:**
- Create: `src/styles.css`
- Modify: `src/main.tsx`(引入样式)

- [ ] **Step 1: 写基础样式 `src/styles.css`**

```css
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body, #root { height: 100%; }
body { font-family: -apple-system, system-ui, sans-serif; background: rgba(30,30,34,0.98); color: #e6e6e6; }
.app { display: flex; flex-direction: column; height: 100vh; border-radius: 12px; overflow: hidden; }
.toolbar { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-bottom: 1px solid #333; }
.toolbar button, .toolbar select { background: #2a2a2e; color: #e6e6e6; border: 1px solid #3a3a3e; border-radius: 6px; padding: 4px 10px; cursor: pointer; }
.status { margin-left: auto; font-size: 12px; }
.status-error { color: #ff6b6b; }
.status-ok { color: #51cf66; }
.main { display: flex; flex: 1; min-height: 0; }
.editor-pane { flex: 1; min-width: 0; overflow: auto; }
.history-panel { width: 260px; border-left: 1px solid #333; display: flex; flex-direction: column; }
.history-search { margin: 8px; padding: 6px 8px; background: #2a2a2e; border: 1px solid #3a3a3e; border-radius: 6px; color: #e6e6e6; }
.history-list { flex: 1; overflow-y: auto; }
.history-item { display: flex; align-items: center; gap: 6px; padding: 6px 8px; cursor: pointer; border-bottom: 1px solid #2a2a2e; }
.history-item:hover { background: #2a2a2e; }
.history-item .title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.history-item button { font-size: 11px; background: none; border: none; color: #888; cursor: pointer; }
.history-item button:hover { color: #e6e6e6; }
```

- [ ] **Step 2: 引入样式**

在 `src/main.tsx` 顶部加:
```tsx
import "./styles.css";
```

- [ ] **Step 3: 全量测试 + 构建**

```bash
pnpm test && pnpm build
```
Expected: 所有单测 PASS,build 成功。

- [ ] **Step 4: 启动开发模式手动冒烟**

```bash
cargo tauri dev
```
执行以下**手动冒烟清单**(逐项确认):
- [ ] 应用启动后窗口默认隐藏
- [ ] 按 `⌥⌘J` 呼出居中浮层
- [ ] 粘贴 `{"b":2,"a":1}`,按 `⇧⌥F` 格式化为缩进 JSON
- [ ] 输入非法 JSON,错误行标红且不打断编辑
- [ ] 点"压缩"还原为单行
- [ ] 勾选"保存到历史",编辑后条目出现在右侧列表
- [ ] 历史搜索框输入部分字符,模糊命中相关条目
- [ ] 双击条目标题重命名成功
- [ ] 点"固定",条目置顶
- [ ] 点"删除",条目消失
- [ ] 点"保存到文件",系统对话框弹出并成功写盘
- [ ] 点击窗口外(失焦),浮层自动隐藏
- [ ] 按 `Esc`,浮层隐藏

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: styles + end-to-end smoke pass"
```

---

## Task 13: README + 打包

**Files:**
- Create: `README.md`

- [ ] **Step 1: 写 README**

`README.md`:
```markdown
# JSONShelf

macOS 轻量 JSON 面板。全局快捷键呼出,CodeMirror 编辑,一键格式化,历史可搜索/命名/固定,支持导出。

## 开发
\`\`\`bash
pnpm install
cargo tauri dev
\`\`\`

## 打包
\`\`\`bash
cargo tauri build
\`\`\`

## 默认快捷键
- ⌥⌘J 呼出/隐藏面板
- ⇧⌥F 格式化
- ⌘S 导出到文件
- ⌘F 编辑器内查找
- Esc 隐藏面板
```

- [ ] **Step 2: 打包验证**

```bash
cargo tauri build
```
Expected: 生成 `src-tauri/target/release/bundle/macos/JSONShelf.app` 与 `.dmg`。

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "docs: README + release build"
```

---

## 完成标准

- 所有前端纯函数单测(formatter/fuzzy/title)+ HistoryPanel 组件测通过
- `cargo check` / `cargo tauri build` 通过
- Task 12 手动冒烟清单全部勾选
- 全局快捷键、失焦隐藏、格式化、历史 CRUD、模糊搜索、导出均可用
