-- 为 charity_projects 表添加自动进度字段
ALTER TABLE charity_projects
  ADD COLUMN IF NOT EXISTS progress_auto_increment BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS progress_increment_rate NUMERIC(10,4) NOT NULL DEFAULT 0.5,
  ADD COLUMN IF NOT EXISTS progress_increment_interval INTEGER NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS progress_last_incremented_at TIMESTAMPTZ;
-- progress_auto_increment: 是否开启自动进度增长
-- progress_increment_rate: 每次自动增加的百分比（如 0.5 = 增加 0.5%）
-- progress_increment_interval: 增加间隔（分钟）
-- progress_last_incremented_at: 上次执行增长的时间戳
