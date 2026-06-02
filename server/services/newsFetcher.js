/**
 * Fetches financial news from the Finnhub REST API.
 * Uses the server-side FINNHUB_API_KEY env var.
 * Falls back to VITE_FINNHUB_API_KEY so local dev works without duplication.
 */

const https = require('https')

const FINNHUB_TOKEN = process.env.FINNHUB_API_KEY || process.env.VITE_FINNHUB_API_KEY || ''

const VALID_CATEGORIES = new Set(['general', 'forex', 'crypto', 'merger'])

/**
 * Promise-based HTTPS GET that returns a parsed JSON body.
 * @param {string} url
 * @returns {Promise<unknown>}
 */
function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      if (res.statusCode === 429) {
        reject(new Error('Finnhub rate limit reached (429)'))
        res.resume()
        return
      }
      let raw = ''
      res.on('data', (chunk) => { raw += chunk })
      res.on('end', () => {
        try {
          resolve(JSON.parse(raw))
        } catch (e) {
          reject(new Error(`JSON parse error: ${e.message}`))
        }
      })
    })
    req.on('error', reject)
    req.setTimeout(8000, () => {
      req.destroy(new Error('Finnhub request timed out (8s)'))
    })
  })
}

/**
 * Normalises a raw Finnhub news item to a stable shape.
 * @param {object} item
 */
function normalise(item) {
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
  }
}

/**
 * Fetches up to `limit` general market news items for the given category.
 * @param {'general'|'forex'|'crypto'|'merger'} category
 * @param {number} [limit=25]
 * @returns {Promise<Array>}
 */
async function fetchMarketNews(category = 'general', limit = 25) {
  if (!FINNHUB_TOKEN) {
    throw new Error('FINNHUB_API_KEY is not set on the server')
  }
  const cat = VALID_CATEGORIES.has(category) ? category : 'general'
  const url = `https://finnhub.io/api/v1/news?category=${cat}&token=${FINNHUB_TOKEN}`
  const items = await httpsGet(url)
  if (!Array.isArray(items)) {
    throw new Error(`Unexpected Finnhub response: ${JSON.stringify(items).slice(0, 200)}`)
  }
  return items.slice(0, limit).map(normalise)
}

module.exports = { fetchMarketNews, VALID_CATEGORIES }
