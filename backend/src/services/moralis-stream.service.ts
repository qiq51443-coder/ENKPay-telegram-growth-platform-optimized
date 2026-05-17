import crypto from 'crypto';
import axios from 'axios';

const MORALIS_STREAMS_BASE = 'https://api.moralis-streams.com';

// ERC20 Transfer event: keccak256("Transfer(address,address,uint256)")
const ERC20_TRANSFER_TOPIC0 = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

// Minimal ERC20 Transfer event ABI — used by Moralis to decode log data
const ERC20_TRANSFER_ABI = [
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'from', type: 'address' },
      { indexed: true, name: 'to', type: 'address' },
      { indexed: false, name: 'value', type: 'uint256' },
    ],
    name: 'Transfer',
    type: 'event',
  },
];

/**
 * Create a new Moralis EVM Stream.
 *
 * - When `contractAddress` is provided (ERC20 token, e.g. USDT): the stream
 *   monitors contract logs for the given address. Moralis requires
 *   `contractAddresses` whenever `includeContractLogs: true` is set.
 * - When `contractAddress` is omitted (native coin, e.g. ETH/BNB): the stream
 *   monitors native transactions only (`includeNativeTxs: true`).
 *
 * Valid fields for PUT /streams/evm (Moralis Streams v2):
 *   webhookUrl, description, tag, topic0, allAddresses, includeNativeTxs,
 *   includeContractLogs, includeInternalTxs, abi, chains, advancedOptions,
 *   contractAddresses.
 * Note: there is NO `type` field — passing unknown fields causes 422 Validation Failed.
 *
 * @returns The created stream's id.
 */
export async function createMoralisStream(
  apiKey: string,
  webhookUrl: string,
  tag: string,
  chains: string[],
  contractAddress?: string
): Promise<{ id: string }> {
  // Sanitize tag: Moralis only allows alphanumeric, hyphens, and underscores; max 64 chars
  const safeTag = tag.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);

  // Build request body depending on whether this is an ERC20 or native-coin stream.
  let body: Record<string, unknown>;
  if (contractAddress) {
    // ERC20 token stream: contractAddresses is required with includeContractLogs: true
    body = {
      webhookUrl,
      description: safeTag,
      tag: safeTag,
      chains,
      includeNativeTxs: false,
      includeContractLogs: true,
      includeInternalTxs: false,
      contractAddresses: [contractAddress],
      topic0: [ERC20_TRANSFER_TOPIC0],
      abi: ERC20_TRANSFER_ABI,
    };
  } else {
    // Native coin stream
    body = {
      webhookUrl,
      description: safeTag,
      tag: safeTag,
      chains,
      includeNativeTxs: true,
      includeContractLogs: false,
      includeInternalTxs: false,
    };
  }

  // Moralis Streams API uses PUT (not POST) for stream creation — this is the documented API contract.
  // See: https://api.moralis-streams.com (PUT /streams/evm)
  const response = await axios.put(
    `${MORALIS_STREAMS_BASE}/streams/evm`,
    body,
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
