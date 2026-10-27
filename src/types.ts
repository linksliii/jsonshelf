export interface HistoryEntry {
  id: number;
  title: string;
  // 列表接口不再返回完整正文,避免每次刷新都搬运 MB 级字符串;
  // 需要正文时用 ipc.getHistoryContent(id) 按需取。
  content?: string;
  // 列表/搜索用的短预览(前 240 字符),仅用于模糊排序与展示。
  preview?: string;
  language: string;
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
  // 正文字符数(LENGTH(content));列表里展示体积用。
  size?: number;
}
