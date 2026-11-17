/**
 * Backward-compatible shim re-exporting poller controls from the decoupled News Engine.
 */
export {
  prefetchAllCategories,
  startNewsPoller,
  stopNewsPoller,
} from '../../services/news/newsEngine';
