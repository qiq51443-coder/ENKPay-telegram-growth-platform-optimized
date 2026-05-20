-- =====================================================================
-- ONE-TIME DATA CLEAR: NFT Holdings + User Balances Reset
-- WARNING: THIS OPERATION IS IRREVERSIBLE.
-- This migration clears all user NFT holdings, yield logs,
-- and resets all user balance fields to zero.
-- =====================================================================

BEGIN;

-- Step 1: Clear NFT yield logs first (child of user_nft_holdings)
DELETE FROM public.nft_yield_logs;

-- Step 2: Clear all NFT holdings
DELETE FROM public.user_nft_holdings;

-- Step 3: Reset NFT product remaining_supply back to total_supply
UPDATE public.nft_products
SET remaining_supply = total_supply
WHERE total_supply IS NOT NULL;

-- Step 4: Reset all user balance fields to zero
UPDATE public.users SET
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
  is_first_trade_done = false,
  invite_level1_count = 0,
  invite_level2_count = 0,
  vip_level = 0;

COMMIT;

SELECT 'NFT holdings cleared and user balances reset successfully' AS status;
