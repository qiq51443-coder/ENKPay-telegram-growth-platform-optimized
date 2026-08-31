import crypto from 'crypto';

/**
 * QuickNode Streams integration helpers.
 *
 * Recommended flow for enkpay (small scale):
 * 1) Create a Stream in QuickNode Dashboard (Logs dataset + ERC20 Transfer filter)
 * 2) Set destination URL to https://YOUR_DOMAIN/webhook/deposit/quicknode
 * 3) Copy Stream ID + Security Token into admin panel / env
 * 4) Backend only stores binding; address matching is done against user_deposit_addresses
 */

/**
 * Bind an existing QuickNode Stream (created in dashboard).
 * Does not call QuickNode REST API — avoids fragile endpoint assumptions.
 */
export async function createQuickNodeWebhook(
  _apiKey: string,
  _webhookUrl: string,
  _tag: string,
  _chains: string[],
  _contractAddress?: string
): Promise<{ id: string; secret?: string }> {
  throw new Error(
    'Automatic QuickNode Stream creation is disabled. ' +
      'Please create the Stream in QuickNode Dashboard, then provide quicknode_webhook_id (Stream ID) in admin panel.'
  );
}

/**
 * QuickNode Streams does not mirror Moralis "add address to stream" API.
 * Prefer filtering by token contract in the Stream filter, then match `to` in DB.
 */
export async function addAddressToQuickNodeWebhook(
  _apiKey: string,
  _webhookId: string,
  _address: string
): Promise<void> {
  // no-op by design
  return;
}

export async function removeAddressFromQuickNodeWebhook(
  _apiKey: string,
  _webhookId: string,
  _address: string
): Promise<void> {
  return;
}

export async function deleteQuickNodeWebhook(_apiKey: string, _webhookId: string): Promise<void> {
  // Stream lifecycle is managed in QuickNode Dashboard
  return;
}

/**
 * Verify QuickNode Streams webhook signature.
 * Headers: x-qn-nonce, x-qn-timestamp, x-qn-signature
 * HMAC-SHA256 over (nonce + timestamp + payload) with Stream security token.
 * @see https://www.quicknode.com/guides/quicknode-products/streams/validating-incoming-streams-webhook-messages
 */
export function verifyQuickNodeSignature(
  rawBody: string,
  secret: string,
  signatureHeader: string | undefined,
  nonce?: string,
  timestamp?: string
): boolean {
  if (!secret || !signatureHeader) return false;
  try {
    if (nonce && timestamp) {
      const signatureData = String(nonce) + String(timestamp) + rawBody;
      const computed = crypto
        .createHmac('sha256', Buffer.from(secret))
        .update(Buffer.from(signatureData))
        .digest('hex');
      const a = Buffer.from(computed);
      const b = Buffer.from(signatureHeader);
      if (a.length !== b.length) return false;
      return crypto.timingSafeEqual(a, b);
    }
    // Fallback: simple body HMAC (if headers incomplete)
    const expected =
      'sha256=' +
      crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    const expectedBuf = Buffer.from(expected);
    const sigBuf = Buffer.from(signatureHeader);
    if (expectedBuf.length !== sigBuf.length) return false;
    return crypto.timingSafeEqual(expectedBuf, sigBuf);
  } catch {
    return false;
  }
}
