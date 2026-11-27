import crypto from 'crypto';
import { decryptSecret, signWebhookPayload } from '../credentialVault';
import type {
  ExternalTradeDispatchPayload,
  UserWebhookConfigRecord,
  WebhookDeliveryLogRecord,
  WebhookPreset,
} from '../types';

const WEBHOOK_TIMEOUT_MS = 8_000;

export function validateWebhookUrl(rawUrl: string): { ok: boolean; normalized?: string; error?: string } {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed) {
    return { ok: false, error: 'Webhook URL is required.' };
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, error: 'Please enter a valid URL starting with https://.' };
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { ok: false, error: 'Webhook URL must use https:// (or http:// for testing).' };
  }

  const host = parsed.hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '0.0.0.0' ||
    host === '::1' ||
    host.endsWith('.local') ||
    host.startsWith('10.') ||
    host.startsWith('192.168.') ||
    host.startsWith('169.254.') ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
  ) {
    return { ok: false, error: 'Private/local network URLs are not allowed for webhooks.' };
  }

  return { ok: true, normalized: parsed.toString() };
}

export function buildPresetWebhookBody(
  preset: WebhookPreset,
  payload: ExternalTradeDispatchPayload,
  secretPlaintext: string
): Record<string, unknown> {
  const actionLower = payload.action.toLowerCase();
  const timestamp = new Date().toISOString();

  if (preset === 'traderspost') {
    return {
      ticker: payload.symbol,
      action: actionLower,
      sentiment: payload.action === 'BUY' ? 'bullish' : 'bearish',
      orderType: payload.entryType.toLowerCase(),
      price: payload.price,
      quantity: payload.volume,
      stopLoss: payload.sl ? { type: 'stop', stopPrice: payload.sl } : undefined,
      takeProfit: payload.tp1 ? { limitPrice: payload.tp1 } : undefined,
      extras: {
        source: 'TRAXO',
        tradeId: payload.tradeId,
        strategy: payload.strategyLabel || payload.strategyId,
        timeframe: payload.timeframe,
        riskUsd: payload.riskAmountUsd,
        test: payload.triggerSource === 'test',
      },
    };
  }

  if (preset === 'pickmytrade') {
    return {
      symbol: payload.symbol,
      data: actionLower,
      quantity: payload.volume,
      price: payload.price,
      sl: payload.sl ?? 0,
      tp: payload.tp1 ?? 0,
      token: secretPlaintext || undefined,
      source: 'TRAXO',
      test: payload.triggerSource === 'test',
    };
  }

  if (preset === 'pineconnector') {
    const command = payload.action === 'BUY' ? 'buy' : 'sell';
    return {
      licenseId: secretPlaintext || undefined,
      command,
      symbol: payload.symbol,
      risk: payload.volume,
      sl: payload.sl ?? null,
      tp: payload.tp1 ?? null,
      comment: `TRAXO:${payload.strategyId || 'signal'}`,
      test: payload.triggerSource === 'test',
    };
  }

  // Default: TRAXO Generic Institutional JSON
  return {
    event: payload.triggerSource === 'test' ? 'traxo.webhook.test' : 'traxo.trade.execute',
    source: 'TRAXO',
    trigger: payload.triggerSource,
    timestamp,
    trade: {
      tradeId: payload.tradeId || null,
      signalId: payload.signalId || null,
      symbol: payload.symbol,
      action: payload.action,
      entryType: payload.entryType,
      price: payload.price,
      sl: payload.sl ?? null,
      tp1: payload.tp1 ?? null,
      tp2: payload.tp2 ?? null,
      volume: payload.volume,
      riskAmountUsd: payload.riskAmountUsd ?? null,
      timeframe: payload.timeframe ?? null,
      strategyId: payload.strategyId ?? null,
      strategyLabel: payload.strategyLabel ?? null,
      confidence: payload.confidence ?? null,
      rr: payload.rr ?? null,
    },
  };
}

export async function dispatchWebhookRequest(
  config: UserWebhookConfigRecord,
  payload: ExternalTradeDispatchPayload
): Promise<WebhookDeliveryLogRecord> {
  const startedAt = Date.now();
  const id = `wh_${startedAt}_${crypto.randomBytes(3).toString('hex')}`;
  const urlCheck = validateWebhookUrl(config.url);
  if (!urlCheck.ok || !urlCheck.normalized) {
    return {
      id,
      uid: config.uid,
      url: config.url,
      preset: config.preset,
      symbol: payload.symbol,
      action: payload.action,
      triggerSource: payload.triggerSource,
      ok: false,
      httpStatus: null,
      latencyMs: Date.now() - startedAt,
      responsePreview: null,
      error: urlCheck.error || 'Invalid webhook URL',
      createdAt: startedAt,
    };
  }

  const secretPlain = decryptSecret(config.secretEncrypted);
  const bodyObj = buildPresetWebhookBody(config.preset, payload, secretPlain);
  const bodyJson = JSON.stringify(bodyObj);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'TRAXO-Execution-Bridge/1.0',
    'X-Traxo-Event': payload.triggerSource === 'test' ? 'test' : 'trade.execute',
    'X-Traxo-Delivery-Id': id,
  };
  if (secretPlain) {
    headers['X-Traxo-Signature'] = `sha256=${signWebhookPayload(bodyJson, secretPlain)}`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);

  try {
    const res = await fetch(urlCheck.normalized, {
      method: 'POST',
      headers,
      body: bodyJson,
      signal: controller.signal,
    });
    const text = await res.text().catch(() => '');
    const preview = text ? text.slice(0, 220) : null;
    return {
      id,
      uid: config.uid,
      url: urlCheck.normalized,
      preset: config.preset,
      symbol: payload.symbol,
      action: payload.action,
      triggerSource: payload.triggerSource,
      ok: res.ok,
      httpStatus: res.status,
      latencyMs: Date.now() - startedAt,
      responsePreview: preview,
      error: res.ok ? null : `HTTP ${res.status}${preview ? `: ${preview}` : ''}`,
      createdAt: startedAt,
    };
  } catch (err: any) {
    const isAbort = err?.name === 'AbortError';
    return {
      id,
      uid: config.uid,
      url: urlCheck.normalized,
      preset: config.preset,
      symbol: payload.symbol,
      action: payload.action,
      triggerSource: payload.triggerSource,
      ok: false,
      httpStatus: null,
      latencyMs: Date.now() - startedAt,
      responsePreview: null,
      error: isAbort ? `Timed out after ${WEBHOOK_TIMEOUT_MS / 1000}s` : err?.message || 'Network error',
      createdAt: startedAt,
    };
  } finally {
    clearTimeout(timeout);
  }
}
