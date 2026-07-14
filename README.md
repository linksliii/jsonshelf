# JSONShelf

macOS 上的轻量 JSON 面板。全局快捷键呼出 Spotlight 式浮层,粘贴/编辑 JSON,一键格式化,历史条目可模糊搜索、命名、固定、回查,支持导出到本地文件。

基于 Tauri + React + CodeMirror 6 + SQLite,注重低内存占用。

## 功能

- **全局快捷键呼出**:`⌥⌘J` 呼出/隐藏居中浮层;失焦或 `Esc` 自动隐藏(状态保留,不销毁)。
- **格式化**:`⇧⌥F` 格式化(对齐 VSCode);JSON 走浏览器原生,YAML/HTML/CSS/JS 按需动态加载 Prettier。
- **压缩**:一键 minify。
- **历史记录**:编辑内容防抖自动存入 SQLite(可用"保存到历史"开关关闭);列表支持模糊搜索(LIKE 粗筛 + 前端 fuzzy 精排)、双击重命名、固定置顶、删除。
- **导出**:`⌘S` 通过系统对话框保存为 `.json` 文件到任意目录。

## 默认快捷键

| 快捷键 | 作用 |
|--------|------|
| `⌥⌘J` | 全局呼出 / 隐藏面板 |
| `⇧⌥F` | 格式化 |
| `⌘S` | 导出到文件 |
| `⌘F` | 编辑器内查找 |
| `Esc` | 隐藏面板 |

> 全局呼出键若与其他软件冲突,应用会在启动时打印警告并继续运行(不影响窗口内使用)。

## 开发

前置:Node ≥ 18、pnpm、Rust 工具链、Tauri CLI 2.x。

```bash
pnpm install
cargo tauri dev      # 启动开发模式(自动跑 pnpm dev)
```

国内网络建议为 rustup / cargo 配置镜像(见下文"镜像配置")。

### 测试

```bash
pnpm test            # 前端单元测试(formatter / fuzzy / title / HistoryPanel)
cargo check          # 后端编译检查(在 src-tauri/ 下)
```

## 打包

```bash
cargo tauri build    # 生成 src-tauri/target/release/bundle/macos/JSONShelf.app 与 .dmg
```

产物:
- `.app`(`bundle/macos/JSONShelf.app`,约 15MB)——核心可运行产物,可直接双击运行或拖入"应用程序"。
- `.dmg`(`bundle/dmg/`)——磁盘镜像。

> **注意**:`.dmg` 的最后一步用 AppleScript 通过 Finder 设置镜像窗口外观,需在**正常桌面会话**中运行 `cargo tauri build`(非 SSH/后台/无 GUI 环境),否则 `bundle_dmg.sh` 会失败——此时 `.app` 仍已成功生成,不受影响。

## 镜像配置(国内网络)

```bash
# rustup / toolchain
export RUSTUP_DIST_SERVER="https://mirrors.ustc.edu.cn/rust-static"
export RUSTUP_UPDATE_ROOT="https://mirrors.ustc.edu.cn/rust-static/rustup"
```

cargo 依赖镜像(`~/.cargo/config.toml`):

```toml
[source.crates-io]
replace-with = 'ustc'

[source.ustc]
registry = "sparse+https://mirrors.ustc.edu.cn/crates.io-index/"
```

## 架构

```
Tauri 主进程 (Rust)                     WebView 前端 (React + Vite)
├─ 全局快捷键 (shortcut.rs)             ├─ EditorPane   CodeMirror 6 + JSON lint
├─ 窗口浮层控制 (window.rs)             ├─ Toolbar      语言/格式化/压缩/保存/历史开关
├─ SQLite 历史 (tauri-plugin-sql)       ├─ HistoryPanel 搜索 + 重命名/固定/删除
└─ 文件导出 (commands/export.rs)        └─ lib/         formatter · fuzzy · title · ipc
```

- 编辑器内容为唯一真相,后台(DB / 导出)错误只提示不打断编辑。
- 历史持久化由"历史开关 + 防抖 upsert"驱动;格式化纯前端,不落库。

## 许可

私有项目。
