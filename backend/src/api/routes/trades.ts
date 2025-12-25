import { Router, Request, Response } from 'express';
import db from '../../db/client';

const router = Router();

interface GetTradesQuery {
  exchange?: string;
  marketId?: string;
  side?: string;
  start?: string;
  end?: string;
  limit?: string;
}

/**
 * GET /trades
 * 
 * Query parameters:
 * - exchange: 'polymarket' | 'kalshi' (required)
 * - marketId: string (required)
 * - side: 'buy' | 'sell' (optional)
 * - start: ISO timestamp (optional)
 * - end: ISO timestamp (optional)
 * - limit: number (default 100, max 1000)
 */
router.get('/', async (req: Request<{}, {}, {}, GetTradesQuery>, res: Response) => {
  try {
    const { exchange, marketId, side, start, end, limit: limitStr } = req.query;

    // Validate required parameters
    if (!exchange || !marketId) {
      return res.status(400).json({
        error: 'Missing required parameters: exchange, marketId',
      });
    }

    // Validate exchange
    if (exchange !== 'polymarket' && exchange !== 'kalshi') {
      return res.status(400).json({
        error: 'Invalid exchange. Must be "polymarket" or "kalshi"',
      });
    }

    // Validate side if provided
    if (side && side !== 'buy' && side !== 'sell') {
      return res.status(400).json({
        error: 'Invalid side. Must be "buy" or "sell"',
      });
    }

    // Parse and validate limit
    let limit = 100;
    if (limitStr) {
      limit = Math.min(Math.max(parseInt(limitStr, 10) || 100, 1), 1000);
    }

    // Build query
    let query = `
      SELECT id, exchange, market_id, price, quantity, side, timestamp, tx_hash
      FROM trades
      WHERE exchange = $1 AND market_id = $2
    `;
    const params: any[] = [exchange, marketId];

    // Add optional filters
    if (side) {
      params.push(side);
      query += ` AND side = $${params.length}`;
    }
    if (start) {
      params.push(new Date(start));
      query += ` AND timestamp >= $${params.length}`;
    }
    if (end) {
      params.push(new Date(end));
      query += ` AND timestamp <= $${params.length}`;
    }

    // Order by most recent first and limit
    query += ` ORDER BY timestamp DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await db.query(query, params);

    // Transform to API response format
    const trades = result.rows.map((row) => ({
      id: row.id,
      exchange: row.exchange,
      marketId: row.market_id,
      price: row.price.toString(),
      quantity: row.quantity.toString(),
      side: row.side,
      timestamp: row.timestamp.toISOString(),
      txHash: row.tx_hash || null,
    }));

    return res.json({ data: trades });
  } catch (error) {
    console.error('[API] Error fetching trades:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /trades/latest
 * 
 * Get latest trades across all markets
 * 
 * Query parameters:
 * - exchange: 'polymarket' | 'kalshi' (optional)
 * - limit: number (default 50, max 200)
 */
router.get('/latest', async (req: Request, res: Response) => {
  try {
    const { exchange, limit: limitStr } = req.query;

    // Parse and validate limit
    let limit = 50;
    if (limitStr) {
      limit = Math.min(Math.max(parseInt(limitStr as string, 10) || 50, 1), 200);
    }

    // Build query
    let query = `
      SELECT id, exchange, market_id, price, quantity, side, timestamp, tx_hash
      FROM trades
    `;
    const params: any[] = [];

    if (exchange && (exchange === 'polymarket' || exchange === 'kalshi')) {
      params.push(exchange);
      query += ` WHERE exchange = $${params.length}`;
    }

    query += ` ORDER BY timestamp DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await db.query(query, params);

    const trades = result.rows.map((row) => ({
      id: row.id,
      exchange: row.exchange,
      marketId: row.market_id,
      price: row.price.toString(),
      quantity: row.quantity.toString(),
      side: row.side,
      timestamp: row.timestamp.toISOString(),
      txHash: row.tx_hash || null,
    }));

    return res.json({ data: trades });
  } catch (error) {
    console.error('[API] Error fetching latest trades:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /trades/markets
 * 
 * Get list of available markets with trade data
 * 
 * Query parameters:
 * - exchange: 'polymarket' | 'kalshi' (optional)
 */
router.get('/markets', async (req: Request, res: Response) => {
  try {
    const { exchange } = req.query;

    let query = `
      SELECT DISTINCT exchange, market_id,
             COUNT(*) as trade_count,
             MIN(timestamp) as first_trade,
             MAX(timestamp) as last_trade
      FROM trades
    `;
    const params: any[] = [];

    if (exchange && (exchange === 'polymarket' || exchange === 'kalshi')) {
      params.push(exchange);
      query += ` WHERE exchange = $${params.length}`;
    }

    query += ` GROUP BY exchange, market_id ORDER BY trade_count DESC LIMIT 100`;

    const result = await db.query(query, params);

    const markets = result.rows.map((row) => ({
      exchange: row.exchange,
      marketId: row.market_id,
      tradeCount: parseInt(row.trade_count, 10),
      firstTrade: row.first_trade.toISOString(),
      lastTrade: row.last_trade.toISOString(),
    }));

    return res.json({ data: markets });
  } catch (error) {
    console.error('[API] Error fetching markets:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

