/**
 * Backward-compatible shim re-exporting news cache helpers from the decoupled News Engine.
 */
export {
  getCachedNews,
  setCachedNews,
  invalidateCachedNews,
  isRedisAvailable,
} from '../../services/news/newsEngine';
