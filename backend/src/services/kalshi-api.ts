import crypto from 'crypto';

/**
 * Kalshi API Client for fetching market metadata
 * Uses RSA-PSS signature authentication
 */

const KALSHI_API_BASE = 'https://api.elections.kalshi.com/trade-api/v2';

interface KalshiMarket {
  ticker: string;
  title: string;
  subtitle?: string;
  yes_sub_title?: string;
  no_sub_title?: string;
  status?: string;
  category?: string;
  event_ticker?: string;
}

interface KalshiMarketResponse {
  market: KalshiMarket;
}

/**
 * Generate authentication headers for Kalshi API
 */
function generateAuthHeaders(
  method: string,
  path: string,
  apiKeyId: string,
  privateKey: string
): Record<string, string> {
  const timestamp = Date.now().toString();
  
  // Message to sign: timestamp + method + path
  const message = timestamp + method.toUpperCase() + path;
  
  // Create RSA-PSS signature
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(message);
  sign.end();
  
  const signature = sign.sign(
    {
      key: privateKey,
      padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
      saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
    },
    'base64'
  );

  return {
    'KALSHI-ACCESS-KEY': apiKeyId,
    'KALSHI-ACCESS-SIGNATURE': signature,
    'KALSHI-ACCESS-TIMESTAMP': timestamp,
    'Content-Type': 'application/json',
  };
}

/**
 * Fetch market details from Kalshi API
 */
export async function fetchKalshiMarket(ticker: string): Promise<KalshiMarket | null> {
  const apiKeyId = process.env.KALSHI_API_KEY_ID;
  const privateKey = process.env.KALSHI_PRIVATE_KEY;

  if (!apiKeyId || !privateKey) {
    console.warn('[KalshiAPI] Missing KALSHI_API_KEY_ID or KALSHI_PRIVATE_KEY');
    return null;
  }

  const path = `/trade-api/v2/markets/${ticker}`;
  
  try {
    const headers = generateAuthHeaders('GET', path, apiKeyId, privateKey);
    
    const response = await fetch(`${KALSHI_API_BASE}/markets/${ticker}`, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      if (response.status === 404) {
        // Market not found - this is expected for some tickers
        return null;
      }
      console.error(`[KalshiAPI] Error fetching market ${ticker}: ${response.status}`);
      return null;
    }

    const data = (await response.json()) as KalshiMarketResponse;
    return data.market;
  } catch (error) {
    console.error(`[KalshiAPI] Error fetching market ${ticker}:`, error);
    return null;
  }
}

/**
 * Fetch multiple markets in parallel with rate limiting
 */
export async function fetchKalshiMarkets(
  tickers: string[],
  batchSize = 10,
  delayMs = 100
): Promise<Map<string, KalshiMarket>> {
  const results = new Map<string, KalshiMarket>();
  
  // Process in batches to avoid rate limiting
  for (let i = 0; i < tickers.length; i += batchSize) {
    const batch = tickers.slice(i, i + batchSize);
    
    const promises = batch.map(async (ticker) => {
      const market = await fetchKalshiMarket(ticker);
      if (market) {
        results.set(ticker, market);
      }
    });
    
    await Promise.all(promises);
    
    // Small delay between batches to avoid rate limiting
    if (i + batchSize < tickers.length) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  
  return results;
}

export type { KalshiMarket };

