-- Add claim_condition to red_packets
ALTER TABLE red_packets ADD COLUMN IF NOT EXISTS claim_condition VARCHAR(50) DEFAULT 'all_users';

-- Ensure authorized_groups has all required fields
ALTER TABLE authorized_groups ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE authorized_groups ADD COLUMN IF NOT EXISTS country VARCHAR(100);
ALTER TABLE authorized_groups ADD COLUMN IF NOT EXISTS language VARCHAR(20);
ALTER TABLE authorized_groups ADD COLUMN IF NOT EXISTS member_count INTEGER DEFAULT 0;

-- Make pair_id optional in trading_rules (allow NULL for global rules)
ALTER TABLE trading_rules ALTER COLUMN pair_id DROP NOT NULL;
ALTER TABLE trading_rules ALTER COLUMN rule_name DROP NOT NULL;
ALTER TABLE trading_rules ALTER COLUMN direction DROP NOT NULL;
