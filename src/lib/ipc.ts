import Database from "@tauri-apps/plugin-sql";
import { invoke } from "@tauri-apps/api/core";
import type { HistoryEntry } from "../types";

let dbPromise: Promise<Database> | null = null;
function db(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const d = await Database.load("sqlite:jsonshelf.db");
      // 大文件写入性能:WAL + NORMAL,避免每次 UPDATE 都等 fsync。
      // PRAGMA 失败不影响功能(不同 sqlite 版本行为略有差异)。
      try { await d.select("PRAGMA journal_mode=WAL"); } catch { /* ignore */ }
      try { await d.execute("PRAGMA synchronous=NORMAL"); } catch { /* ignore */ }
      try { await d.execute("PRAGMA temp_store=MEMORY"); } catch { /* ignore */ }
      return d;
    })().catch((e) => {
      dbPromise = null; // 失败时清空,下次调用重试,避免毒化单例
      throw e;
    });
  }
  return dbPromise;
}

interface Row {
  id: number;
  title: string;
  content?: string;
  preview?: string;
  language: string;
  pinned: number;
  created_at: number;
  updated_at: number;
  size?: number;
}

// 列表只取元数据 + 240 字符预览,不搬运正文 —— 大文件历史很多时这是主要收益。
const LIST_COLUMNS =
  "id, title, language, pinned, created_at, updated_at, " +
  "LENGTH(content) AS size, substr(content, 1, 240) AS preview";

const toEntry = (r: Row): HistoryEntry => ({
  id: r.id,
  title: r.title,
  content: r.content,
  preview: r.preview,
  language: r.language,
  pinned: r.pinned === 1,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  size: r.size,
});

export async function listHistory(): Promise<HistoryEntry[]> {
  const d = await db();
  const rows = await d.select<Row[]>(
    `SELECT ${LIST_COLUMNS} FROM history ORDER BY pinned DESC, updated_at DESC`
  );
  return rows.map(toEntry);
}

// LIKE 粗筛(不区分大小写);精排在前端 fuzzy 做。
// 只返回预览,不返回正文。
export async function searchHistory(keyword: string): Promise<HistoryEntry[]> {
  const d = await db();
  const kw = `%${keyword}%`;
  const rows = await d.select<Row[]>(
    `SELECT ${LIST_COLUMNS} FROM history WHERE title LIKE ?1 OR content LIKE ?1 ORDER BY pinned DESC, updated_at DESC`,
    [kw]
  );
  return rows.map(toEntry);
}

// 按需读取单条正文(选中历史时调用)。
export async function getHistoryContent(id: number): Promise<string> {
  const d = await db();
  const rows = await d.select<{ content: string }[]>(
    "SELECT content FROM history WHERE id = ?",
    [id]
  );
  return rows.length ? rows[0].content : "";
}

export async function upsertHistory(entry: {
  id: number | null;
  title: string;
  content: string;
  language: string;
}): Promise<number> {
  const d = await db();
  const now = Date.now();
  if (entry.id == null) {
    const res = await d.execute(
      "INSERT INTO history (title, content, language, pinned, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)",
      [entry.title, entry.content, entry.language, now, now]
    );
    return res.lastInsertId as number;
  }
  // 不更新 title:避免覆盖用户经 renameHistory 设置的标题(title 由 rename 独立入口负责)
  await d.execute(
    "UPDATE history SET content=?, language=?, updated_at=? WHERE id=?",
    [entry.content, entry.language, now, entry.id]
  );
  return entry.id;
}

export async function renameHistory(id: number, title: string): Promise<void> {
  const d = await db();
  await d.execute("UPDATE history SET title=?, updated_at=? WHERE id=?", [
    title,
    Date.now(),
    id,
  ]);
}

export async function togglePin(id: number, pinned: boolean): Promise<void> {
  const d = await db();
  await d.execute("UPDATE history SET pinned=? WHERE id=?", [pinned ? 1 : 0, id]);
}

export async function deleteHistory(id: number): Promise<void> {
  const d = await db();
  await d.execute("DELETE FROM history WHERE id=?", [id]);
}

export async function exportJSON(content: string, defaultName: string): Promise<string | null> {
  return invoke<string | null>("export_json", { content, defaultName });
}

export async function getSetting(key: string): Promise<string | null> {
  const d = await db();
  const rows = await d.select<{ value: string }[]>(
    "SELECT value FROM settings WHERE key = ?",
    [key]
  );
  return rows.length ? rows[0].value : null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const d = await db();
  await d.execute(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [key, value]
  );
}

export async function setHideOnBlur(enabled: boolean): Promise<void> {
  await invoke("set_hide_on_blur_cmd", { enabled });
}

export async function rebindToggleShortcut(accelerator: string): Promise<void> {
  await invoke("rebind_toggle_shortcut", { accelerator });
}

export interface ShortcutStatus {
  accelerator: string;
  registered: boolean;
}

export async function getShortcutStatus(): Promise<ShortcutStatus | null> {
  return invoke<ShortcutStatus | null>("shortcut_status");
}

export async function getGlassKind(): Promise<"liquid" | "vibrancy" | "none"> {
  return invoke<"liquid" | "vibrancy" | "none">("glass_kind");
}
