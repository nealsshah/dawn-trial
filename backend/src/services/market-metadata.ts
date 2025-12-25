import { fetchKalshiMarket, type KalshiMarket } from './kalshi-api';

/**
 * Market Metadata Service
 * Caches market titles to avoid repeated API calls
 */

interface MarketMetadata {
  ticker: string;
  title: string;
  subtitle?: string;
  fetchedAt: Date;
}

// In-memory cache for market metadata
// Key format: exchange:marketId
const metadataCache = new Map<string, MarketMetadata>();

// Cache TTL: 1 hour (market titles don't change often)
const CACHE_TTL_MS = 60 * 60 * 1000;

/**
 * Get market title for a Kalshi market
 * Returns cached value if available and not expired
 */
export async function getKalshiMarketTitle(ticker: string): Promise<string | null> {
  const cacheKey = `kalshi:${ticker}`;
  
  // Check cache first
  const cached = metadataCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt.getTime() < CACHE_TTL_MS) {
    return cached.title;
  }

  // Fetch from API
  const market = await fetchKalshiMarket(ticker);
  
  if (market) {
    // Cache the result
    metadataCache.set(cacheKey, {
      ticker: market.ticker,
      title: market.title,
      subtitle: market.subtitle,
      fetchedAt: new Date(),
    });
    return market.title;
  }

  return null;
}

/**
 * Batch fetch market titles for multiple Kalshi markets
 * Returns a map of ticker -> title
 */
export async function getKalshiMarketTitles(
  tickers: string[]
): Promise<Map<string, string>> {
  const results = new Map<string, string>();
  const tickersToFetch: string[] = [];

  // Check cache first for each ticker
  for (const ticker of tickers) {
    const cacheKey = `kalshi:${ticker}`;
    const cached = metadataCache.get(cacheKey);
    
    if (cached && Date.now() - cached.fetchedAt.getTime() < CACHE_TTL_MS) {
      results.set(ticker, cached.title);
    } else {
      tickersToFetch.push(ticker);
    }
  }

  // Fetch uncached tickers from API (with rate limiting)
  if (tickersToFetch.length > 0) {
    console.log(`[MarketMetadata] Fetching titles for ${tickersToFetch.length} Kalshi markets...`);
    
    // Fetch in parallel with rate limiting
    const batchSize = 5;
    const delayMs = 200;
    
    for (let i = 0; i < tickersToFetch.length; i += batchSize) {
      const batch = tickersToFetch.slice(i, i + batchSize);
      
      await Promise.all(
        batch.map(async (ticker) => {
          const market = await fetchKalshiMarket(ticker);
          if (market) {
            const cacheKey = `kalshi:${ticker}`;
            metadataCache.set(cacheKey, {
              ticker: market.ticker,
              title: market.title,
              subtitle: market.subtitle,
              fetchedAt: new Date(),
            });
            results.set(ticker, market.title);
          }
        })
      );
      
      // Delay between batches
      if (i + batchSize < tickersToFetch.length) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
    
    console.log(`[MarketMetadata] Fetched ${results.size - (tickers.length - tickersToFetch.length)} new titles`);
  }

  return results;
}

/**
 * Get market title - returns ticker as fallback if title not found
 */
export async function getMarketDisplayName(
  exchange: 'kalshi' | 'polymarket',
  marketId: string
): Promise<string> {
  if (exchange === 'kalshi') {
    const title = await getKalshiMarketTitle(marketId);
    return title || marketId;
  }
  
  // For Polymarket, just return the marketId for now
  return marketId;
}

/**
 * Clear the metadata cache (useful for testing)
 */
export function clearMetadataCache(): void {
  metadataCache.clear();
}

/**
 * Get cache stats
 */
export function getMetadataCacheStats(): { size: number; entries: string[] } {
  return {
    size: metadataCache.size,
    entries: Array.from(metadataCache.keys()),
  };
}

