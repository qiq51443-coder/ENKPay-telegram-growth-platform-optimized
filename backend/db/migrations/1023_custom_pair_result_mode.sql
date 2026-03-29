-- 为 trading_pairs 增加开奖模式字段
ALTER TABLE trading_pairs
  ADD COLUMN IF NOT EXISTS result_mode VARCHAR(20) DEFAULT 'random'
    CHECK (result_mode IN ('random', 'preset', 'pay_more', 'pay_less'));

-- 预生成的涨跌序列表（支持1/5/10分钟跨时段一致性）
CREATE TABLE IF NOT EXISTS pair_result_schedule (
  id            BIGSERIAL PRIMARY KEY,
  pair_id       INTEGER NOT NULL REFERENCES trading_pairs(id) ON DELETE CASCADE,
  -- 归属时段：60 / 300 / 600（秒），NULL 表示所有时段共享同一序列（互斥锁定时使用）
  duration_seconds INTEGER,
  -- 期序号，从 1 开始递增
  seq           INTEGER NOT NULL,
  -- 开奖方向
  direction     VARCHAR(4) NOT NULL CHECK (direction IN ('up', 'down')),
  -- 是否已被消费（结算时标记）
  consumed      BOOLEAN NOT NULL DEFAULT FALSE,
  -- 对应的 period_label（若已知）
  period_label  VARCHAR(50),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(pair_id, duration_seconds, seq)
);

-- 为 trading_pairs 增加预设模式参数
ALTER TABLE trading_pairs
  ADD COLUMN IF NOT EXISTS result_mode_params JSONB DEFAULT '{}';

-- 当某个时段被锁定后，其他时段不能再设置（用于互斥）
ALTER TABLE trading_pairs
  ADD COLUMN IF NOT EXISTS result_mode_locked_duration INTEGER DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_pair_result_schedule_pair_dur_seq
  ON pair_result_schedule(pair_id, duration_seconds, seq);

CREATE INDEX IF NOT EXISTS idx_pair_result_schedule_unconsumed
  ON pair_result_schedule(pair_id, duration_seconds, consumed)
  WHERE consumed = FALSE;
