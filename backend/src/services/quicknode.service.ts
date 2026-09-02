import crypto from 'crypto';
import axios from 'axios';

const STREAMS_API = 'https://api.quicknode.com/streams/rest/v1/streams';

/** 链名 → QuickNode Streams network slug */
export function toQuickNodeNetwork(chainName: string): string {
  const u = (chainName || '').toUpperCase();
  if (u === 'ETH' || u === 'ETHEREUM' || u === 'ERC20') return 'ethereum-mainnet';
  if (u === 'BSC' || u === 'BNB' || u === 'BEP20') return 'bnbchain-mainnet';
  if (u === 'POLYGON' || u === 'MATIC') return 'polygon-mainnet';
  if (u === 'ARBITRUM') return 'arbitrum-mainnet';
  if (u === 'BASE') return 'base-mainnet';
  return 'ethereum-mainnet';
}

/**
 * Filter: ERC20 Transfer logs；若传了 contract 则只保留该合约。
 * 返回 base64 编码的 filter_function。
 */
function buildErc20TransferFilter(contractAddress?: string): string {
  const contract = (contractAddress || '').trim().toLowerCase();
  const src = `
function main(stream) {
  var TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
  var contract = ${JSON.stringify(contract)};
  var payload = stream && stream.data !== undefined ? stream.data : stream;
  var logs = [];
  if (Array.isArray(payload)) {
    for (var i = 0; i < payload.length; i++) {
      var item = payload[i];
      if (item && Array.isArray(item.logs)) logs = logs.concat(item.logs);
      else if (item && item.topics) logs.push(item);
    }
  } else if (payload && Array.isArray(payload.logs)) {
    logs = payload.logs;
  }
  var out = [];
  for (var j = 0; j < logs.length; j++) {
    var log = logs[j] || {};
    var topics = log.topics || [];
    if (!topics.length || String(topics[0]).toLowerCase() !== TRANSFER) continue;
    var addr = String(log.address || '').toLowerCase();
    if (contract && addr !== contract) continue;
    if (topics.length < 3) continue;
    out.push({
      tokenAddress: log.address,
      from: '0x' + String(topics[1]).slice(-40),
      to: '0x' + String(topics[2]).slice(-40),
      value: log.data,
      transactionHash: log.transactionHash || log.transaction_hash,
      blockNumber: log.blockNumber || log.block_number
    });
  }
  return out.length ? out : null;
}
`.trim();
  return Buffer.from(src, 'utf8').toString('base64');
}

/**
 * 方案 B：用 Streams REST API 创建 Stream（类似 Moralis 一键创建）
 * 返回 stream id + security_token（用于验签）
 */
export async function createQuickNodeStream(
  apiKey: string,
  webhookUrl: string,
  name: string,
  chainName: string,
  contractAddress?: string
): Promise<{ id: string; securityToken?: string }> {
  const network = toQuickNodeNetwork(chainName);
  const body: Record<string, unknown> = {
    name: name.slice(0, 64) || 'enkpay-deposit',
    network,
    dataset: 'logs',
    region: 'usa_east',
    dataset_batch_size: 1,
    elastic_batch_enabled: true,
    destination: 'webhook',
    status: 'active',
    fix_block_reorgs: 0,
    keep_distance_from_tip: 0,
    filter_function: buildErc20TransferFilter(contractAddress),
    destination_attributes: {
      url: webhookUrl,
      compression: 'none',
      max_retry: 3,
      retry_interval_sec: 2,
      post_timeout_sec: 20,
      mtls: false,
    },
  };

  const { data } = await axios.post(STREAMS_API, body, {
    headers: {
      'Content-Type': 'application/json',
      accept: 'application/json',
      'x-api-key': apiKey,
    },
    timeout: 60000,
  });

  const id = data?.id || data?.stream?.id;
  if (!id) {
    throw new Error(
      'QuickNode Stream created but no id in response: ' + JSON.stringify(data).slice(0, 500)
    );
  }

  const securityToken =
    data?.destination_attributes?.security_token ||
    data?.stream?.destination_attributes?.security_token ||
    undefined;

  return { id: String(id), securityToken };
}

/** 兼容旧名 */
export async function createQuickNodeWebhook(
  apiKey: string,
  webhookUrl: string,
  tag: string,
  _chains: string[],
  contractAddress?: string
): Promise<{ id: string; secret?: string }> {
  const chainHint = _chains?.[0] || 'ETH';
  const { id, securityToken } = await createQuickNodeStream(
    apiKey,
    webhookUrl,
    tag,
    chainHint,
    contractAddress
  );
  return { id, secret: securityToken };
}

/** QuickNode 无「按地址订阅」；地址在 webhook 里用 DB 匹配 */
export async function addAddressToQuickNodeWebhook(
  _apiKey: string,
  _webhookId: string,
  _address: string
): Promise<void> {
  return;
}

export async function removeAddressFromQuickNodeWebhook(
  _apiKey: string,
  _webhookId: string,
  _address: string
): Promise<void> {
  return;
}

export async function deleteQuickNodeWebhook(apiKey: string, webhookId: string): Promise<void> {
  if (!apiKey || !webhookId) return;
  try {
    await axios.delete(`${STREAMS_API}/${encodeURIComponent(webhookId)}`, {
      headers: { 'x-api-key': apiKey, accept: 'application/json' },
      timeout: 30000,
    });
  } catch (err: any) {
    // 404 视为已删除
    if (err.response?.status === 404) return;
    throw err;
  }
}

/**
 * 校验 QuickNode Streams webhook 签名
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
    const expected =
      'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    const expectedBuf = Buffer.from(expected);
    const sigBuf = Buffer.from(signatureHeader);
    if (expectedBuf.length !== sigBuf.length) return false;
    return crypto.timingSafeEqual(expectedBuf, sigBuf);
  } catch {
    return false;
  }
}
