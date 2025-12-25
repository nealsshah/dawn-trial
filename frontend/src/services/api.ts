import type { Candle, Trade, Market, Exchange, Interval } from '../types';

// Use environment variable for production, fallback to localhost for development
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

/**
 * Fetch candlestick data for a market
 */
export async function fetchCandles(
  exchange: Exchange,
  marketId: string,
  interval: Interval,
  limit: number = 500
): Promise<Candle[]> {
  const params = new URLSearchParams({
    exchange,
    marketId,
    interval,
    limit: limit.toString(),
  });

  const response = await fetch(`${API_BASE_URL}/candles?${params}`);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch candles: ${response.statusText}`);
  }

  const json: { data: Candle[] } = await response.json();
  return json.data;
}

/**
 * Fetch trades for a market
 */
export async function fetchTrades(
  exchange: Exchange,
  marketId: string,
  limit: number = 100
): Promise<Trade[]> {
  const params = new URLSearchParams({
    exchange,
    marketId,
    limit: limit.toString(),
  });

  const response = await fetch(`${API_BASE_URL}/trades?${params}`);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch trades: ${response.statusText}`);
  }

  const json: { data: Trade[] } = await response.json();
  return json.data;
}

/**
 * Fetch available markets for an exchange
 */
export async function fetchMarkets(exchange?: Exchange): Promise<Market[]> {
  const params = exchange ? new URLSearchParams({ exchange }) : '';
  
  const response = await fetch(`${API_BASE_URL}/trades/markets?${params}`);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch markets: ${response.statusText}`);
  }

  const json: { data: Market[] } = await response.json();
  return json.data;
}

/**
 * Health check
 */
export async function healthCheck(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/health`);
    return response.ok;
  } catch {
    return false;
  }
}

