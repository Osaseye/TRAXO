export type BrokerVenueId = 'paper' | 'webhook' | 'ctrader' | 'tradovate';
export type WebhookPreset = 'generic' | 'traderspost' | 'pickmytrade' | 'pineconnector';
export type WebhookTriggerMode = 'auto' | 'manual' | 'both';

export interface UserWebhookConfigRecord {
  uid: string;
  enabled: boolean;
  url: string;
  preset: WebhookPreset;
  triggerMode: WebhookTriggerMode;
  secretEncrypted: string;
  updatedAt: number;
}

export interface PublicWebhookConfig {
  enabled: boolean;
  url: string;
  preset: WebhookPreset;
  triggerMode: WebhookTriggerMode;
  hasSecret: boolean;
  secretHint: string | null;
  updatedAt: number | null;
}

export interface WebhookDeliveryLogRecord {
  id: string;
  uid: string;
  url: string;
  preset: WebhookPreset;
  symbol: string;
  action: string;
  triggerSource: 'auto' | 'manual' | 'test';
  ok: boolean;
  httpStatus: number | null;
  latencyMs: number;
  responsePreview: string | null;
  error: string | null;
  createdAt: number;
}

export interface ExternalTradeDispatchPayload {
  tradeId?: string;
  signalId?: string;
  symbol: string;
  action: 'BUY' | 'SELL';
  entryType: 'MARKET' | 'LIMIT' | 'STOP';
  price: number;
  sl?: number;
  tp1?: number;
  tp2?: number;
  volume: number;
  riskAmountUsd?: number;
  timeframe?: string;
  strategyId?: string;
  strategyLabel?: string;
  confidence?: number;
  rr?: number;
  triggerSource: 'auto' | 'manual' | 'test';
}
