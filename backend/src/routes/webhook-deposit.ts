import express from 'express';
import { query } from '../db';
import { processDeposit } from '../services/deposit.service';

const router = express.Router();

/**
 * POST /webhook/deposit/tron
 * Receives TronGrid webhook notifications
 */
router.post('/tron', async (req, res) => {
  try {
    const { transaction_id, to_address, from_address, value, block_timestamp, confirmations } = req.body;

    // Validate required fields
    if (!transaction_id || !to_address || !value) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Find user by deposit address
    const addressResult = await query(
      `SELECT uda.user_id, uda.network_id, dn.min_confirmations
       FROM user_deposit_addresses uda
       JOIN deposit_networks dn ON uda.network_id = dn.id
       WHERE uda.address = $1 AND uda.is_active = true AND dn.chain_name = 'TRON'`,
      [to_address]
    );

    if (addressResult.rows.length === 0) {
      // Address not found - this is fine, just not for our system
      return res.status(200).json({ message: 'Address not tracked' });
    }

    const { user_id, network_id, min_confirmations } = addressResult.rows[0];

    // Convert value from smallest unit (e.g., SUN to TRX, or raw USDT)
    // Assuming value is already in USDT (6 decimals)
    const amount = parseFloat(value) / 1000000;

    // Process the deposit
    await processDeposit(
      user_id,
      network_id,
      transaction_id,
      from_address,
      to_address,
      amount,
      confirmations || 0,
      min_confirmations,
      0, // block_number not always available in webhook
      new Date(block_timestamp * 1000 || Date.now())
    );

    res.json({ success: true, message: 'Deposit processed' });
  } catch (error: any) {
    console.error('Tron webhook error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /webhook/deposit/eth
 * Receives Etherscan webhook notifications
 */
router.post('/eth', async (req, res) => {
  try {
    const { hash, to, from, value, blockNumber, timeStamp, confirmations } = req.body;

    // Validate required fields
    if (!hash || !to || !value) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Find user by deposit address
    const addressResult = await query(
      `SELECT uda.user_id, uda.network_id, dn.min_confirmations
       FROM user_deposit_addresses uda
       JOIN deposit_networks dn ON uda.network_id = dn.id
       WHERE uda.address = $1 AND uda.is_active = true AND dn.chain_name = 'ETH'`,
      [to]
    );

    if (addressResult.rows.length === 0) {
      return res.status(200).json({ message: 'Address not tracked' });
    }

    const { user_id, network_id, min_confirmations } = addressResult.rows[0];

    // Convert value from wei/smallest unit to USDT (assuming 6 decimals for USDT)
    const amount = parseFloat(value) / 1000000;

    // Process the deposit
    await processDeposit(
      user_id,
      network_id,
      hash,
      from,
      to,
      amount,
      confirmations || 0,
      min_confirmations,
      parseInt(blockNumber) || 0,
      new Date(parseInt(timeStamp) * 1000 || Date.now())
    );

    res.json({ success: true, message: 'Deposit processed' });
  } catch (error: any) {
    console.error('ETH webhook error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /webhook/deposit/bsc
 * Receives BscScan webhook notifications
 */
router.post('/bsc', async (req, res) => {
  try {
    const { hash, to, from, value, blockNumber, timeStamp, confirmations } = req.body;

    // Validate required fields
    if (!hash || !to || !value) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Find user by deposit address
    const addressResult = await query(
      `SELECT uda.user_id, uda.network_id, dn.min_confirmations
       FROM user_deposit_addresses uda
       JOIN deposit_networks dn ON uda.network_id = dn.id
       WHERE uda.address = $1 AND uda.is_active = true AND dn.chain_name = 'BSC'`,
      [to]
    );

    if (addressResult.rows.length === 0) {
      return res.status(200).json({ message: 'Address not tracked' });
    }

    const { user_id, network_id, min_confirmations } = addressResult.rows[0];

    // Convert value from wei/smallest unit to USDT (assuming 6 decimals for USDT)
    const amount = parseFloat(value) / 1000000;

    // Process the deposit
    await processDeposit(
      user_id,
      network_id,
      hash,
      from,
      to,
      amount,
      confirmations || 0,
      min_confirmations,
      parseInt(blockNumber) || 0,
      new Date(parseInt(timeStamp) * 1000 || Date.now())
    );

    res.json({ success: true, message: 'Deposit processed' });
  } catch (error: any) {
    console.error('BSC webhook error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
