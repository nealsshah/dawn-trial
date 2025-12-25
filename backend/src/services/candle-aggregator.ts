import db from '../db/client';
import { Trade, Candle, Interval } from '../types';
import { tradeEmitter } from '../events/trade-emitter';

const INTERVALS: Interval[] = ['1s', '1m', '1h'];

/**
 * CandleAggregator listens for trade events and updates OHLC candles
 * in real-time for 1s, 1m, and 1h intervals.
 */
class CandleAggregator {
  private isRunning = false;

  start() {
    if (this.isRunning) {
      console.log('[CandleAggregator] Already running');
      return;
    }

    this.isRunning = true;
    console.log('[CandleAggregator] Starting candle aggregation service...');

    // Listen for trade events from both indexers
    tradeEmitter.on('trade', (trade: Trade) => {
      this.processTrade(trade).catch((error) => {
        console.error('[CandleAggregator] Error processing trade:', error);
      });
    });

    console.log('[CandleAggregator] ✅ Listening for trades to aggregate into candles');
  }

  stop() {
    this.isRunning = false;
    tradeEmitter.removeAllListeners('trade');
    console.log('[CandleAggregator] Stopped');
  }

  /**
   * Process a single trade and update candles for all intervals
   */
  private async processTrade(trade: Trade) {
    // Update candles for each interval in parallel
    await Promise.all(
      INTERVALS.map((interval) => this.updateCandle(trade, interval))
    );
  }

  /**
   * Calculate the open_time for a given timestamp and interval
   */
  private getOpenTime(timestamp: Date, interval: Interval): Date {
    const time = new Date(timestamp);
    
    switch (interval) {
      case '1s':
        // Truncate to second
        time.setMilliseconds(0);
        break;
      case '1m':
        // Truncate to minute
        time.setSeconds(0, 0);
        break;
      case '1h':
        // Truncate to hour
        time.setMinutes(0, 0, 0);
        break;
    }
    
    return time;
  }

  /**
   * Update or create a candle for the given trade and interval
   * Uses PostgreSQL UPSERT for atomic updates
   */
  private async updateCandle(trade: Trade, interval: Interval) {
    const openTime = this.getOpenTime(trade.timestamp, interval);
    const price = trade.price;
    const volume = trade.quantity;

    // UPSERT query:
    // - If candle doesn't exist: create with all values from this trade
    // - If candle exists: update high/low/close/volume, keep original open
    const query = `
      INSERT INTO candles (exchange, market_id, interval, open_time, open, high, low, close, volume)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (exchange, market_id, interval, open_time)
      DO UPDATE SET
        high = GREATEST(candles.high, EXCLUDED.high),
        low = LEAST(candles.low, EXCLUDED.low),
        close = EXCLUDED.close,
        volume = candles.volume + EXCLUDED.volume
    `;

    try {
      await db.query(query, [
        trade.exchange,
        trade.marketId,
        interval,
        openTime,
        price,  // open (only used on INSERT, not UPDATE)
        price,  // high
        price,  // low
        price,  // close
        volume, // volume
      ]);
    } catch (error) {
      console.error(`[CandleAggregator] Failed to update ${interval} candle:`, error);
    }
  }

  /**
   * Backfill candles from existing trades in the database
   * Useful when starting fresh or recovering from downtime
   */
  async backfillCandles(exchange?: string, marketId?: string) {
    console.log('[CandleAggregator] Starting candle backfill...');

    let whereClause = '';
    const params: any[] = [];
    
    if (exchange) {
      params.push(exchange);
      whereClause += `WHERE exchange = $${params.length}`;
    }
    if (marketId) {
      params.push(marketId);
      whereClause += whereClause ? ` AND market_id = $${params.length}` : `WHERE market_id = $${params.length}`;
    }

    // Process trades in batches for each interval
    for (const interval of INTERVALS) {
      await this.backfillInterval(interval, whereClause, params);
    }

    console.log('[CandleAggregator] ✅ Backfill complete');
  }

  private async backfillInterval(interval: Interval, whereClause: string, params: any[]) {
    const truncExpr = this.getTruncateExpression(interval);
    
    // Aggregate trades into candles directly in SQL
    const query = `
      INSERT INTO candles (exchange, market_id, interval, open_time, open, high, low, close, volume)
      SELECT 
        exchange,
        market_id,
        '${interval}' as interval,
        ${truncExpr} as open_time,
        (ARRAY_AGG(price ORDER BY timestamp ASC))[1] as open,
        MAX(price) as high,
        MIN(price) as low,
        (ARRAY_AGG(price ORDER BY timestamp DESC))[1] as close,
        SUM(quantity) as volume
      FROM trades
      ${whereClause}
      GROUP BY exchange, market_id, ${truncExpr}
      ON CONFLICT (exchange, market_id, interval, open_time)
      DO UPDATE SET
        high = GREATEST(candles.high, EXCLUDED.high),
        low = LEAST(candles.low, EXCLUDED.low),
        close = EXCLUDED.close,
        volume = EXCLUDED.volume
    `;

    try {
      const result = await db.query(query, params);
      console.log(`[CandleAggregator] Backfilled ${result.rowCount} ${interval} candles`);
    } catch (error) {
      console.error(`[CandleAggregator] Failed to backfill ${interval} candles:`, error);
    }
  }

  private getTruncateExpression(interval: Interval): string {
    switch (interval) {
      case '1s':
        return "DATE_TRUNC('second', timestamp)";
      case '1m':
        return "DATE_TRUNC('minute', timestamp)";
      case '1h':
        return "DATE_TRUNC('hour', timestamp)";
    }
  }

  /**
   * Get candles for a specific market and interval
   */
  async getCandles(
    exchange: string,
    marketId: string,
    interval: Interval,
    start?: Date,
    end?: Date,
    limit: number = 1000
  ): Promise<Candle[]> {
    let query = `
      SELECT exchange, market_id, interval, open_time, open, high, low, close, volume
      FROM candles
      WHERE exchange = $1 AND market_id = $2 AND interval = $3
    `;
    const params: any[] = [exchange, marketId, interval];

    if (start) {
      params.push(start);
      query += ` AND open_time >= $${params.length}`;
    }
    if (end) {
      params.push(end);
      query += ` AND open_time <= $${params.length}`;
    }

    query += ` ORDER BY open_time DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await db.query(query, params);
    
    return result.rows.map((row) => ({
      exchange: row.exchange,
      marketId: row.market_id,
      interval: row.interval,
      openTime: row.open_time,
      open: row.open.toString(),
      high: row.high.toString(),
      low: row.low.toString(),
      close: row.close.toString(),
      volume: row.volume.toString(),
    }));
  }
}

export const candleAggregator = new CandleAggregator();

