-- Migration 012: Clean up deposit_networks, keep only 3 standard USDT networks
-- Remove all existing networks and re-insert the 3 canonical ones.
DELETE FROM deposit_networks;

INSERT INTO deposit_networks (network_name, network_display, chain_name, min_deposit_amount, is_active, sort_order)
VALUES
  ('TRC', 'TRC20 (USDT)', 'TRON',      1.00,  true, 1),
  ('BSC', 'BSC (BEP20)',  'BSC',        1.00,  true, 2),
  ('ETH', 'ETH (ERC20)',  'Ethereum',  10.00,  true, 3);
