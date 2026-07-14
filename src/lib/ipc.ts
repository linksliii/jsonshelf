import Database from "@tauri-apps/plugin-sql";
import { invoke } from "@tauri-apps/api/core";
import type { HistoryEntry } from "../types";

let dbPromise: Promise<Database> | null = null;
function db(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = Database.load("sqlite:jsonshelf.db").catch((e) => {
      dbPromise = null; // 失败时清空,下次调用重试,避免毒化单例
      throw e;
    });
  }
  return dbPromise;
}

interface Row {
  id: number;
  title: string;
  content: string;
  language: string;
  pinned: number;
  created_at: number;
  updated_at: number;
}

const toEntry = (r: Row): HistoryEntry => ({
  id: r.id,
  title: r.title,
  content: r.content,
  language: r.language,
  pinned: r.pinned === 1,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
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
  await d.execute(
    "UPDATE history SET title=?, content=?, language=?, updated_at=? WHERE id=?",
    [entry.title, entry.content, entry.language, now, entry.id]
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
