-- DePIN node plans + user positions (platform bookkeeping)
CREATE TABLE IF NOT EXISTS depin_node_plans (
  id SERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  description TEXT,
  price NUMERIC(18, 6) NOT NULL DEFAULT 0,
  daily_yield_rate NUMERIC(10, 4) NOT NULL DEFAULT 0,
  term_days INT NOT NULL DEFAULT 30,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS depin_positions (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL,
  mode VARCHAR(32) NOT NULL,
  plan_id INT REFERENCES depin_node_plans(id) ON DELETE SET NULL,
  amount NUMERIC(18, 6) NOT NULL DEFAULT 0,
  lock_days INT,
  daily_yield_rate NUMERIC(10, 4),
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  start_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  end_at TIMESTAMPTZ,
  total_yield NUMERIC(18, 6) NOT NULL DEFAULT 0,
  meta JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_depin_positions_user ON depin_positions(user_id);
CREATE INDEX IF NOT EXISTS idx_depin_positions_status ON depin_positions(status);

CREATE TABLE IF NOT EXISTS depin_swap_orders (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL,
  from_asset VARCHAR(32) NOT NULL DEFAULT 'USDT',
  to_asset VARCHAR(32) NOT NULL,
  from_amount NUMERIC(18, 6) NOT NULL,
  to_amount NUMERIC(18, 6) NOT NULL,
  rate NUMERIC(18, 8) NOT NULL DEFAULT 1,
  status VARCHAR(32) NOT NULL DEFAULT 'done',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_depin_swap_user ON depin_swap_orders(user_id);
