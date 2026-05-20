-- =============================================================================
-- @manual-only
-- 1100_clear_transaction_data.sql
-- One-time transaction data clearing script.
-- This file is stored with ordered migrations for traceability, but it must be
-- executed manually only (for example via psql) and is skipped by automatic
-- startup migrations.
-- Take a full backup before executing.
-- =============================================================================

BEGIN;

DELETE FROM nft_yield_logs;
DELETE FROM user_nft_holdings;

DELETE FROM lucky_auction_participants;
DELETE FROM lucky_auction_results;
DELETE FROM auction_entries;

DELETE FROM trading_orders;
DELETE FROM trading_sessions;

DELETE FROM red_packet_claims;
DELETE FROM red_packets;

DELETE FROM deposit_records;
DELETE FROM withdrawal_records;
DELETE FROM transfer_records;

DELETE FROM transactions;
DELETE FROM orders;
DELETE FROM balance_adjustments;

UPDATE users
SET
  balance = 0,
  wallet_balance = 0,
  reward_balance = 0,
  frozen_balance = 0,
  total_recharged = 0,
  total_withdrawn = 0,
  total_traded = 0,
  total_transferred_out = 0,
  total_transferred_in = 0,
  reward_unlock_traded = 0,
  invite_level1_count = 0,
  invite_level2_count = 0,
  is_first_trade_done = false,
  vip_level = 0;

COMMIT;
