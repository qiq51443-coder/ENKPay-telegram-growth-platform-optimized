-- Fix trading_sessions table: ensure status, rule_id, pair_id columns exist
ALTER TABLE trading_sessions ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active';
ALTER TABLE trading_sessions ADD COLUMN IF NOT EXISTS rule_id INTEGER REFERENCES trading_rules(id) ON DELETE SET NULL;
ALTER TABLE trading_sessions ADD COLUMN IF NOT EXISTS start_time TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE trading_sessions ADD COLUMN IF NOT EXISTS end_time TIMESTAMPTZ;
ALTER TABLE trading_sessions ADD COLUMN IF NOT EXISTS settlement_time TIMESTAMPTZ;
ALTER TABLE trading_sessions ADD COLUMN IF NOT EXISTS settlement_price DECIMAL(20, 8);
ALTER TABLE trading_sessions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE trading_sessions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Fix trading_orders table: ensure all columns exist
ALTER TABLE trading_orders ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active';
ALTER TABLE trading_orders ADD COLUMN IF NOT EXISTS result VARCHAR(10);
ALTER TABLE trading_orders ADD COLUMN IF NOT EXISTS profit DECIMAL(20, 8);
ALTER TABLE trading_orders ADD COLUMN IF NOT EXISTS close_price DECIMAL(20, 8);
ALTER TABLE trading_orders ADD COLUMN IF NOT EXISTS entry_price DECIMAL(20, 8);
ALTER TABLE trading_orders ADD COLUMN IF NOT EXISTS rule_id INTEGER;
ALTER TABLE trading_orders ADD COLUMN IF NOT EXISTS odds DECIMAL(10, 4) DEFAULT 1.85;
ALTER TABLE trading_orders ADD COLUMN IF NOT EXISTS pair_id INTEGER;
ALTER TABLE trading_orders ADD COLUMN IF NOT EXISTS settled_at TIMESTAMPTZ;
ALTER TABLE trading_orders ADD COLUMN IF NOT EXISTS expected_profit DECIMAL(20, 8);
