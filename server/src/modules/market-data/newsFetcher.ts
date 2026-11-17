/**
 * Backward-compatible shim re-exporting Finnhub fetcher logic from the decoupled News Engine.
 */
export {
  VALID_CATEGORIES,
  fetchMarketNews,
  type NormalizedNewsItem,
} from '../../services/news/newsEngine';
