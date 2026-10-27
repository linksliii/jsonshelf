CREATE INDEX IF NOT EXISTS idx_history_updated_only ON history(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_history_created ON history(created_at DESC);
