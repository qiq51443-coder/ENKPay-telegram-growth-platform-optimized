import axios from 'axios';
import crypto from 'crypto';

// NOTE: QuickNode management API endpoints and webhook formats may differ.
// This service implements a best-effort integration: it assumes QuickNode
// exposes a REST API at QUICKNODE_API_BASE to create/delete webhooks and
// supports adding/removing addresses. You must verify the exact endpoints
// and request/response shapes against QuickNode's current documentation and
// update the URL paths/field names accordingly.

const QUICKNODE_API_BASE = process.env.QUICKNODE_API_BASE || 'https://api.quicknode.com';

/**
 * Create a QuickNode webhook for monitoring ERC20 Transfer events.
 * Returns an object with { id: string, secret?: string }
 *
 * TODO: Confirm the exact QuickNode API path & request body in QuickNode docs.
 */
export async function createQuickNodeWebhook(
  apiKey: string,
  webhookUrl: string,
  tag: string,
  chains: string[],
  contractAddress?: string
): Promise<{ id: string; secret?: string }> {
  const safeTag = tag.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);

  const body: any = {
    url: webhookUrl,
    name: safeTag,
    chains,
    // If QuickNode supports filtering by contract address, include it
    contractAddress: contractAddress || undefined,
    // event type: ERC20 Transfer
    event: 'erc20:transfer',
  };

  try {
    const resp = await axios.post(
      `${QUICKNODE_API_BASE}/v1/webhooks`,
      body,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      }
    );

    // Expect response.data to include { id, secret }
    return { id: resp.data.id, secret: resp.data.secret };
  } catch (err: any) {
    // Bubble a helpful error message
    throw new Error(`Failed to create QuickNode webhook: ${err.response?.data?.message || err.message}`);
  }
}

/**
 * Add a single address to an existing QuickNode webhook (if supported).
 */
export async function addAddressToQuickNodeWebhook(
  apiKey: string,
  webhookId: string,
  address: string
): Promise<void> {
  try {
    await axios.post(
      `${QUICKNODE_API_BASE}/v1/webhooks/${webhookId}/addresses`,
      { address },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      }
    );
  } catch (err: any) {
    throw new Error(`Failed to add address to QuickNode webhook: ${err.response?.data?.message || err.message}`);
  }
}

/**
 * Remove an address from a QuickNode webhook (if supported).
 */
export async function removeAddressFromQuickNodeWebhook(
  apiKey: string,
  webhookId: string,
  address: string
): Promise<void> {
  try {
    await axios.delete(
      `${QUICKNODE_API_BASE}/v1/webhooks/${webhookId}/addresses`,
      {
        data: { address },
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      }
    );
  } catch (err: any) {
    throw new Error(`Failed to remove address from QuickNode webhook: ${err.response?.data?.message || err.message}`);
  }
}

/**
 * Delete a QuickNode webhook entirely.
 */
export async function deleteQuickNodeWebhook(apiKey: string, webhookId: string): Promise<void> {
  try {
    await axios.delete(
      `${QUICKNODE_API_BASE}/v1/webhooks/${webhookId}`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      }
    );
  } catch (err: any) {
    throw new Error(`Failed to delete QuickNode webhook: ${err.response?.data?.message || err.message}`);
  }
}

/**
 * Verify a QuickNode webhook signature.
 *
 * Many webhook providers use HMAC-SHA256 over the raw body using a webhook secret.
 * If QuickNode uses a different scheme, update this implementation accordingly.
 *
 * Expected signature header name: 'x-quicknode-signature' (common pattern).
 */
export function verifyQuickNodeSignature(rawBody: string, secret: string, signatureHeader: string | undefined): boolean {
  if (!secret || !signatureHeader) return false;
  try {
    const expected = 'sha256=' +
      crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    const expectedBuf = Buffer.from(expected);
    const sigBuf = Buffer.from(signatureHeader);
    if (expectedBuf.length !== sigBuf.length) return false;
    return crypto.timingSafeEqual(expectedBuf, sigBuf);
  } catch (err) {
    return false;
  }
}
