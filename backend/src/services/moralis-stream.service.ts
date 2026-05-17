import crypto from 'crypto';
import axios from 'axios';

const MORALIS_STREAMS_BASE = 'https://api.moralis-streams.com';

const ERC20_TRANSFER_ABI = [
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'address', name: 'from', type: 'address' },
      { indexed: true, internalType: 'address', name: 'to', type: 'address' },
      { indexed: false, internalType: 'uint256', name: 'value', type: 'uint256' },
    ],
    name: 'Transfer',
    type: 'event',
  },
];

const ERC20_TRANSFER_TOPIC0 = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

/**
 * Create a new Moralis Stream.
 * @returns The created stream's id.
 */
export async function createMoralisStream(
  apiKey: string,
  webhookUrl: string,
  tag: string,
  chains: string[]
): Promise<{ id: string }> {
  // Sanitize tag: Moralis only allows alphanumeric, hyphens, and underscores; max 64 chars
  const safeTag = tag.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);

  // Moralis Streams API uses PUT (not POST) for stream creation — this is the documented API contract.
  // See: https://api.moralis-streams.com (PUT /streams/evm)
  const response = await axios.put(
    `${MORALIS_STREAMS_BASE}/streams/evm`,
    {
      webhookUrl,
      description: safeTag,
      tag: safeTag,
      chains,
      type: 'wallet',
      includeNativeTxs: false,
      includeContractLogs: true,   // Must be true to capture ERC20 Transfer events
      includeInternalTxs: false,
      abi: ERC20_TRANSFER_ABI,
      topic0: [ERC20_TRANSFER_TOPIC0],
    },
    {
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    }
  );
  return { id: response.data.id };
}

/**
 * Add an address to an existing Moralis Stream.
 */
export async function addAddressToStream(
  apiKey: string,
  streamId: string,
  address: string
): Promise<void> {
  await axios.post(
    `${MORALIS_STREAMS_BASE}/streams/evm/${streamId}/address`,
    { address },
    {
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    }
  );
}

/**
 * Remove an address from a Moralis Stream.
 */
export async function removeAddressFromStream(
  apiKey: string,
  streamId: string,
  address: string
): Promise<void> {
  await axios.delete(
    `${MORALIS_STREAMS_BASE}/streams/evm/${streamId}/address`,
    {
      data: { address },
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    }
  );
}

/**
 * Delete a Moralis Stream entirely.
 */
export async function deleteStream(
  apiKey: string,
  streamId: string
): Promise<void> {
  await axios.delete(
    `${MORALIS_STREAMS_BASE}/streams/evm/${streamId}`,
    {
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    }
  );
}

/**
 * Verify a Moralis Streams webhook signature.
 * Moralis signs the request body concatenated with the webhook secret using SHA3-256.
 * The resulting hex digest is sent in the x-moralis-signature header.
 *
 * @param body      Raw request body string (before JSON.parse)
 * @param secret    Moralis Streams webhook secret (MORALIS_STREAMS_SECRET env var)
 * @param signature Value of the x-moralis-signature request header
 * @returns true if the signature is valid
 */
export function verifyMoralisSignature(
  body: string,
  secret: string,
  signature: string
): boolean {
  if (!secret || !signature) return false;
  // Moralis uses SHA3-256 (Keccak-256) of (body + secret)
  const hash = crypto
    .createHash('sha3-256')
    .update(body + secret)
    .digest('hex');
  // Timing-safe comparison
  const hashBuf = Buffer.from(hash);
  const sigBuf = Buffer.from(signature);
  if (hashBuf.length !== sigBuf.length) return false;
  return crypto.timingSafeEqual(hashBuf, sigBuf);
}
