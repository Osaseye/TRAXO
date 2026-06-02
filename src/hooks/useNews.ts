import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/useAuthStore'

export type NewsCategory = 'general' | 'forex' | 'crypto' | 'merger'

export interface NewsItem {
  id: number
  category: string
  /** Unix timestamp (seconds) */
  datetime: number
  headline: string
  summary: string
  source: string
  url: string
  image: string
  related: string
}

const SERVER_BASE = (import.meta.env.VITE_SERVER_URL as string | undefined) ?? 'http://localhost:8080'

async function fetchNews(category: NewsCategory, idToken: string | null): Promise<NewsItem[]> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (idToken) headers['Authorization'] = `Bearer ${idToken}`

  const res = await fetch(`${SERVER_BASE}/api/news?category=${category}`, { headers })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`)
  }
  const data = await res.json() as { items: NewsItem[] }
  return data.items
}

/**
 * Fetches and caches financial news for the given category.
 * Data is considered fresh for 15 minutes (matching server-side Redis TTL).
 */
export function useNews(category: NewsCategory = 'general') {
  const idToken = useAuthStore((s) => s.idToken)

  return useQuery<NewsItem[], Error>({
    queryKey: ['news', category],
    queryFn: () => fetchNews(category, idToken ?? null),
    staleTime: 1000 * 60 * 15, // 15 minutes — mirrors Redis TTL
    retry: 1,
    enabled: !!idToken,
  })
}
