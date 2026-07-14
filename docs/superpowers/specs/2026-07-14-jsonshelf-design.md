# JSONShelf 设计文档

**日期**: 2026-07-14
**状态**: 已批准
**工作名**: JSONShelf(可改)

## 1. 目标与定位

一个 macOS 上的轻量 JSON 处理面板。核心场景:**长期管理多份 JSON**——全局快捷键呼出浮层,粘贴/编辑 JSON,一键格式化,历史条目可搜索、可命名、可固定、可回头编辑,并支持导出到本地文件。

**硬约束**:整体轻量,运行时内存占用尽可能小。这条约束优先于"功能齐全"和"VSCode 同款体验"。

## 2. 技术选型(已定)

| 层 | 选型 | 理由 |
|----|------|------|
| 运行时 | **Tauri** | 系统 WebView,产物小(~10MB)、内存低、全局快捷键/窗口控制原生支持好 |
| 前端框架 | **React + Vite** | 生态成熟,组件化清晰 |
| 编辑器内核 | **CodeMirror 6** | 模块化、内存占用远低于 Monaco;JSON 高亮/折叠/校验/搜索齐全,快捷键可自定义 |
| 存储 | **SQLite**(`tauri-plugin-sql`) | 天然支持搜索、排序、固定标记、分页;条目多也不卡 |
| 多语言格式化 | **Prettier**(动态导入) | 仅在格式化非 JSON 时按需拉入内存;JSON 走浏览器原生 |
| 模糊搜索 | **uFuzzy / fuse.js**(gzip 几 KB) | 前端对粗筛结果做子序列模糊匹配 + 高亮 + 相关性排序 |

## 3. 架构总览

```
┌─────────────────────────────────────────────┐
│  Tauri 主进程 (Rust)                          │
│  · 全局快捷键注册 (呼出/隐藏浮层)              │
│  · 窗口管理 (居中浮层、失焦隐藏)               │
│  · SQLite 读写 (历史 CRUD、搜索)               │
│  · 文件导出 (保存 .json 到用户目录)            │
└───────────────┬─────────────────────────────┘
                │ Tauri IPC (invoke / event)
┌───────────────┴─────────────────────────────┐
│  WebView 前端 (React + Vite)                  │
│  · CodeMirror 6 编辑器 (JSON 高亮/折叠/校验)   │
│  · 格式化引擎 (JSON 原生 + Prettier 按需)      │
│  · 历史面板 (列表/搜索/重命名/固定/删除)       │
│  · 快捷键层 (格式化、保存、呼出内切换)         │
└───────────────────────────────────────────────┘
```

**轻量落实:**
- Rust 侧只做系统集成、DB、文件,不引入重框架。
- 前端按需加载:Prettier 多语言 parser 用动态 `import()`,仅在真正格式化非 JSON 时进内存;JSON 走原生 `JSON.parse/stringify`,零依赖。
- 窗口隐藏时不销毁 WebView(保证秒开),空闲时前端主动释放大对象。
- **编辑器内容是唯一真相**,DB 是持久化副本;后台错误不打断编辑。

## 4. 组件划分

**前端组件(职责单一、可独立测试):**

| 组件 | 职责 | 依赖 |
|------|------|------|
| `EditorPane` | 包裹 CodeMirror 6,暴露 getValue/setValue/format 事件 | CodeMirror |
| `formatter/` | 纯函数:`formatJSON`、`minifyJSON`、`formatOther(lang)` | Prettier(动态) |
| `HistoryPanel` | 历史列表:搜索框、条目行、重命名/固定/删除 | ipc |
| `Toolbar` | 语言选择、格式化/压缩/保存按钮、状态提示 | — |
| `useHotkeys` | 快捷键绑定层(格式化、保存、切换历史) | — |
| `ipc/` | 封装所有 Tauri `invoke`,前端唯一的后端出入口 | Tauri API |

**Rust 侧模块:**

| 模块 | 职责 |
|------|------|
| `commands/history` | `list / get / upsert / rename / toggle_pin / delete / search` |
| `commands/export` | 弹系统保存对话框,写 `.json` 到磁盘 |
| `window` | 浮层显示/隐藏、居中、失焦监听 |
| `shortcut` | 全局快捷键注册 |
| `db` | SQLite 连接、迁移 |

## 5. 数据模型

```sql
CREATE TABLE history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT    NOT NULL,          -- 默认自动生成,可重命名
  content     TEXT    NOT NULL,          -- 原始文本
  language    TEXT    NOT NULL DEFAULT 'json',
  pinned      INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,          -- unix ms
  updated_at  INTEGER NOT NULL
);
CREATE INDEX idx_history_updated ON history(pinned DESC, updated_at DESC);
```

**"是否保存到历史"** 由前端开关控制:关掉时不调 `upsert`,纯临时编辑。

## 6. 搜索方案(模糊)

- **匹配范围**:同时搜 `title` 和 `content`,不区分大小写。
- **两级模糊**:
  - **后端 `LIKE` 粗筛**:`WHERE title LIKE '%kw%' OR content LIKE '%kw%'`,拉出候选集(快、省内存,不全表读进前端)。
  - **前端 fuzzy 精排**:对粗筛结果用极小模糊库(uFuzzy/fuse.js)做子序列匹配 + 高亮 + 相关性排序。输入 `usrnm` 可命中 `user_name`。
- 数据库只回粗筛子集,模糊排序在小集合上做,兼顾体验与内存。
- 多关键词/上万条目场景日后再升级 FTS5(YAGNI)。

## 7. 数据流

```
按全局快捷键
   → Rust: 显示浮层 + 居中 + 聚焦 WebView
   → 前端: 光标进编辑区, 自动读剪贴板(可选)
   → 用户粘贴/输入 JSON
   → 按格式化键 → formatter 就地格式化 (纯前端, 不落库)
   → [若历史开关开] 防抖 800ms 后 invoke upsert → SQLite
   → 失焦 / Esc → Rust 隐藏浮层 (WebView 不销毁, 状态保留)
```

- **格式化不落库**,只改编辑器内容;落库由"历史开关 + 防抖 upsert"独立驱动,临时用时零磁盘写。
- **草稿态 vs 历史条目**:当前内容有 `currentId`(null=新草稿)。upsert 时 null 就 INSERT 回填 id,非 null 就 UPDATE。从历史面板点开某条 → 设 `currentId` → 后续更新该条。
- **失焦隐藏**默认开,设"钉住"开关防误隐藏。

## 8. 快捷键(默认值,后续可配置)

| 快捷键 | 作用 | 层级 |
|--------|------|------|
| `⌥⌘J` | 全局呼出/隐藏浮层 | 系统全局 |
| `⇧⌥F` | 格式化(对齐 VSCode) | 编辑器内 |
| `⇧⌥M` 或按钮 | 压缩/minify | 编辑器内 |
| `⌘S` | 导出 .json 到磁盘 | 编辑器内 |
| `⌘F` | 编辑器内查找 | CodeMirror 自带 |
| `⌘K` / `⌘P` | 聚焦历史搜索框 | 应用内 |
| `Esc` | 隐藏浮层 | 应用内 |

全局呼出键若冲突,做成可改。

## 9. 错误处理

| 场景 | 处理 |
|------|------|
| JSON 语法错误(格式化) | 不打断;CodeMirror lint 标红错误行 + 状态栏"第 X 行:错误信息",内容不动 |
| 非 JSON 格式化失败 | 状态栏提示 parser 报错,保留原文 |
| Prettier parser 加载失败 | 降级提示"该语言格式化暂不可用",JSON 走原生不受影响 |
| SQLite 写入失败 | toast 告警,不阻塞编辑(内容为唯一真相) |
| 导出失败(权限/磁盘满) | 对话框返回错误 → toast 明确原因 |
| DB 迁移失败 | 启动时捕获,保留旧库备份,不静默丢数据 |

原则:**编辑器内容永远不因后台错误而丢失或被打断**,错误只提示不破坏。

## 10. 测试策略(与轻量匹配,不过度)

- **纯函数单测(重点)**:`formatter/` 全部纯函数——JSON 格式化/压缩/非法输入、fuzzy 排序、title 自动生成。覆盖率优先拉满。
- **Rust 命令单测**:`history` CRUD + 搜索用内存 SQLite 测;`export` 用临时目录测。
- **前端组件测**:`HistoryPanel` 交互(重命名/固定/删除/搜索)用 Testing Library。
- **手动冒烟清单**:全局快捷键呼出、失焦隐藏、格式化快捷键、导出落盘——涉及系统集成,列清单人工验证,不做 Tauri E2E(YAGNI)。

## 11. 明确不做(YAGNI)

- 多关键词布尔搜索 / FTS5(条目上万再说)
- Tauri E2E 自动化
- 云同步 / 多设备
- Monaco 级智能补全
- 多语言格式化的完整语言覆盖(先 JSON,Prettier 覆盖常见几种)
