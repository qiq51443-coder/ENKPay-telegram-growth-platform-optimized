-- ONE-TIME FORCE CLEAR: All Transaction Records + NFT Holdings
-- WARNING: THIS OPERATION IS IRREVERSIBLE.

-- Step 1: Clear nft_yield_logs first (references user_nft_holdings)
DELETE FROM public.nft_yield_logs;

-- Step 2: Clear all NFT holdings
DELETE FROM public.user_nft_holdings;

-- Step 3: Clear ALL transactions (including NFT yield transactions)
DELETE FROM public.transactions;

-- Step 4: Clear orders
DELETE FROM public.orders;

-- Step 5: Clear deposit/withdrawal/transfer records
DELETE FROM public.deposit_records;
DELETE FROM public.withdrawal_records;
DELETE FROM public.transfer_records;

-- Step 6: Clear red packet records
DELETE FROM public.red_packet_claims;
DELETE FROM public.red_packets;

-- Step 7: Clear trading records
DELETE FROM public.trading_orders;
DELETE FROM public.trading_sessions;

-- Step 8: Clear auction participation records
DELETE FROM public.lucky_auction_participants;
DELETE FROM public.lucky_auction_results;
DELETE FROM public.auction_entries;

-- Step 9: Clear balance adjustments
DELETE FROM public.balance_adjustments;

-- Step 10: Reset all user balance fields to zero
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

-- Step 11: Reset NFT product remaining_supply back to total_supply
UPDATE public.nft_products
SET remaining_supply = total_supply
WHERE total_supply IS NOT NULL;

SELECT 'All transaction records and NFT holdings cleared successfully' AS status;
