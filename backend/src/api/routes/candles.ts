import { Router, Request, Response } from 'express';
import db from '../../db/client';
import { Interval, Exchange } from '../../types';

const router = Router();

interface GetCandlesQuery {
  exchange?: string;
  marketId?: string;
  interval?: string;
  start?: string;
  end?: string;
  limit?: string;
}

/**
 * GET /candles
 * 
 * Query parameters:
 * - exchange: 'polymarket' | 'kalshi' (required)
 * - marketId: string (required)
 * - interval: '1s' | '1m' | '1h' (required)
 * - start: ISO timestamp (optional)
 * - end: ISO timestamp (optional)
 * - limit: number (default 1000, max 5000)
 */
router.get('/', async (req: Request<{}, {}, {}, GetCandlesQuery>, res: Response) => {
  try {
    const { exchange, marketId, interval, start, end, limit: limitStr } = req.query;

    // Validate required parameters
    if (!exchange || !marketId || !interval) {
      return res.status(400).json({
        error: 'Missing required parameters: exchange, marketId, interval',
      });
    }

    // Validate exchange
    if (exchange !== 'polymarket' && exchange !== 'kalshi') {
      return res.status(400).json({
        error: 'Invalid exchange. Must be "polymarket" or "kalshi"',
      });
    }

    // Validate interval
    if (interval !== '1s' && interval !== '1m' && interval !== '1h') {
      return res.status(400).json({
        error: 'Invalid interval. Must be "1s", "1m", or "1h"',
      });
    }

    // Parse and validate limit
    let limit = 1000;
    if (limitStr) {
      limit = Math.min(Math.max(parseInt(limitStr, 10) || 1000, 1), 5000);
    }

    // Build query
    let query = `
      SELECT open_time, open, high, low, close, volume
      FROM candles
      WHERE exchange = $1 AND market_id = $2 AND interval = $3
    `;
    const params: any[] = [exchange, marketId, interval];

    // Add time range filters
    if (start) {
      params.push(new Date(start));
      query += ` AND open_time >= $${params.length}`;
    }
    if (end) {
      params.push(new Date(end));
      query += ` AND open_time <= $${params.length}`;
    }

    // Order by time (ascending for charting) and limit
    query += ` ORDER BY open_time ASC LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await db.query(query, params);

    // Transform to API response format
    const candles = result.rows.map((row) => ({
      openTime: row.open_time.toISOString(),
      open: row.open.toString(),
      high: row.high.toString(),
      low: row.low.toString(),
      close: row.close.toString(),
      volume: row.volume.toString(),
    }));

    return res.json({ data: candles });
  } catch (error) {
    console.error('[API] Error fetching candles:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /candles/markets
 * 
 * Get list of available markets with candle data
 * 
 * Query parameters:
 * - exchange: 'polymarket' | 'kalshi' (optional, filters by exchange)
 */
router.get('/markets', async (req: Request, res: Response) => {
  try {
    const { exchange } = req.query;

    let query = `
      SELECT DISTINCT exchange, market_id, 
             MIN(open_time) as first_candle,
             MAX(open_time) as last_candle,
             COUNT(*) as candle_count
      FROM candles
      WHERE interval = '1m'
    `;
    const params: any[] = [];

    if (exchange && (exchange === 'polymarket' || exchange === 'kalshi')) {
      params.push(exchange);
      query += ` AND exchange = $${params.length}`;
    }

    query += ` GROUP BY exchange, market_id ORDER BY candle_count DESC LIMIT 100`;

    const result = await db.query(query, params);

    const markets = result.rows.map((row) => ({
      exchange: row.exchange,
      marketId: row.market_id,
      firstCandle: row.first_candle.toISOString(),
      lastCandle: row.last_candle.toISOString(),
      candleCount: parseInt(row.candle_count, 10),
    }));

    return res.json({ data: markets });
  } catch (error) {
    console.error('[API] Error fetching markets:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

