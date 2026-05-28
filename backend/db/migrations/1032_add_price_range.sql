-- Migration 1032: 为自定义交易对添加价格区间字段
-- 支持管理员设置 price_min / price_max，价格生成器将在此区间内进行均值回归游走
-- 幂等 – 可安全重复执行

ALTER TABLE trading_pairs
  ADD COLUMN IF NOT EXISTS price_min NUMERIC(20, 8) NULL,
  ADD COLUMN IF NOT EXISTS price_max NUMERIC(20, 8) NULL;
