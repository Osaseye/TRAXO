import https from 'https';
import { env } from '../../config/env';

export const VALID_CATEGORIES = new Set(['general', 'forex', 'crypto', 'merger']);

export interface NormalizedNewsItem {
  id: number;
  category: string;
  datetime: number;
  headline: string;
  summary: string;
  source: string;
  url: string;
  image: string;
  related: string;
}

function httpsGet(url: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      if (res.statusCode === 429) {
        reject(new Error('Finnhub rate limit reached (429)'));
        res.resume();
        return;
      }
      let raw = '';
      res.on('data', (chunk) => {
        raw += chunk;
      });
      res.on('end', () => {
        try {
          resolve(JSON.parse(raw));
        } catch (e: any) {
          reject(new Error(`JSON parse error: ${e.message}`));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(8000, () => {
      req.destroy(new Error('Finnhub request timed out (8s)'));
    });
  });
}

function normalise(item: any): NormalizedNewsItem {
  return {
    id: item.id ?? 0,
    category: item.category ?? 'general',
    datetime: item.datetime ?? 0,
    headline: item.headline ?? '',
    summary: item.summary ?? '',
    source: item.source ?? '',
    url: item.url ?? '',
    image: item.image ?? '',
    related: item.related ?? '',
  };
}

export async function fetchMarketNews(
  category = 'general',
  limit = 25
): Promise<NormalizedNewsItem[]> {
  const token = env.finnhubApiKey;
  if (!token) {
    throw new Error('FINNHUB_API_KEY is not set on the server');
  }
  const cat = VALID_CATEGORIES.has(category) ? category : 'general';
  const url = `https://finnhub.io/api/v1/news?category=${cat}&token=${token}`;
  const items = await httpsGet(url);
  if (!Array.isArray(items)) {
    throw new Error(`Unexpected Finnhub response: ${JSON.stringify(items).slice(0, 200)}`);
  }
  return items.slice(0, limit).map(normalise);
}
