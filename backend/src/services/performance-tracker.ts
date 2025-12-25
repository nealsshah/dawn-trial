/**
 * Performance Tracker Service
 * Tracks indexing performance, latency, and throughput metrics
 */

interface TradeMetric {
  exchange: 'kalshi' | 'polymarket';
  timestamp: number; // When the trade occurred (source timestamp)
  indexedAt: number; // When we indexed it
  latencyMs: number; // Difference
}

interface ExchangeStats {
  totalTrades: number;
  tradesLast60s: number;
  tradesPerSecond: number;
  avgLatencyMs: number;
  minLatencyMs: number;
  maxLatencyMs: number;
  lastTradeAt: string | null;
  lastIndexedAt: string | null;
}

interface PerformanceStats {
  uptime: number;
  startedAt: string;
  exchanges: {
    kalshi: ExchangeStats;
    polymarket: ExchangeStats;
  };
  totals: {
    totalTrades: number;
    tradesLast60s: number;
    tradesPerSecond: number;
    avgLatencyMs: number;
  };
  database: {
    totalTradesInDb: number;
    totalCandlesInDb: number;
    oldestTrade: string | null;
    newestTrade: string | null;
  };
}

class PerformanceTracker {
  private startTime: number = Date.now();
  private recentTrades: TradeMetric[] = [];
  private readonly WINDOW_SIZE_MS = 60000; // 60 seconds rolling window
  private readonly MAX_RECENT_TRADES = 10000; // Keep last 10k for calculations

  private exchangeStats: Record<'kalshi' | 'polymarket', {
    totalTrades: number;
    latencies: number[];
    lastTradeTimestamp: number | null;
    lastIndexedTimestamp: number | null;
  }> = {
    kalshi: { totalTrades: 0, latencies: [], lastTradeTimestamp: null, lastIndexedTimestamp: null },
    polymarket: { totalTrades: 0, latencies: [], lastTradeTimestamp: null, lastIndexedTimestamp: null },
  };

  /**
   * Record a trade being indexed
   * @param exchange - The exchange source
   * @param tradeTimestamp - When the trade occurred (from source)
   * @param indexedAt - When we indexed it (defaults to now)
   */
  recordTrade(
    exchange: 'kalshi' | 'polymarket',
    tradeTimestamp: Date,
    indexedAt: Date = new Date()
  ): void {
    const tradeTs = tradeTimestamp.getTime();
    const indexedTs = indexedAt.getTime();
    const latencyMs = Math.max(0, indexedTs - tradeTs);

    const metric: TradeMetric = {
      exchange,
      timestamp: tradeTs,
      indexedAt: indexedTs,
      latencyMs,
    };

    // Add to recent trades
    this.recentTrades.push(metric);

    // Trim if too many
    if (this.recentTrades.length > this.MAX_RECENT_TRADES) {
      this.recentTrades = this.recentTrades.slice(-this.MAX_RECENT_TRADES);
    }

    // Update exchange stats
    const stats = this.exchangeStats[exchange];
    stats.totalTrades++;
    stats.latencies.push(latencyMs);
    stats.lastTradeTimestamp = tradeTs;
    stats.lastIndexedTimestamp = indexedTs;

    // Keep only recent latencies for calculation
    if (stats.latencies.length > 1000) {
      stats.latencies = stats.latencies.slice(-1000);
    }
  }

  /**
   * Get trades in the last N milliseconds
   */
  private getTradesInWindow(windowMs: number = this.WINDOW_SIZE_MS): TradeMetric[] {
    const cutoff = Date.now() - windowMs;
    return this.recentTrades.filter((t) => t.indexedAt >= cutoff);
  }

  /**
   * Calculate exchange-specific stats
   */
  private getExchangeStats(exchange: 'kalshi' | 'polymarket'): ExchangeStats {
    const stats = this.exchangeStats[exchange];
    const recentTrades = this.getTradesInWindow().filter((t) => t.exchange === exchange);
    const latencies = stats.latencies;

    return {
      totalTrades: stats.totalTrades,
      tradesLast60s: recentTrades.length,
      tradesPerSecond: Math.round((recentTrades.length / 60) * 100) / 100,
      avgLatencyMs: latencies.length > 0
        ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
        : 0,
      minLatencyMs: latencies.length > 0 ? Math.min(...latencies) : 0,
      maxLatencyMs: latencies.length > 0 ? Math.max(...latencies) : 0,
      lastTradeAt: stats.lastTradeTimestamp
        ? new Date(stats.lastTradeTimestamp).toISOString()
        : null,
      lastIndexedAt: stats.lastIndexedTimestamp
        ? new Date(stats.lastIndexedTimestamp).toISOString()
        : null,
    };
  }

  /**
   * Get comprehensive performance stats
   */
  async getStats(): Promise<PerformanceStats> {
    const recentTrades = this.getTradesInWindow();
    const allLatencies = [
      ...this.exchangeStats.kalshi.latencies,
      ...this.exchangeStats.polymarket.latencies,
    ];

    // Get database counts
    const db = (await import('../db/client')).default;
    
    let dbStats = {
      totalTradesInDb: 0,
      totalCandlesInDb: 0,
      oldestTrade: null as string | null,
      newestTrade: null as string | null,
    };

    try {
      const [tradesCount, candlesCount, tradeRange] = await Promise.all([
        db.query<{ count: string }>('SELECT COUNT(*) as count FROM trades'),
        db.query<{ count: string }>('SELECT COUNT(*) as count FROM candles'),
        db.query<{ min_ts: Date; max_ts: Date }>(
          'SELECT MIN(timestamp) as min_ts, MAX(timestamp) as max_ts FROM trades'
        ),
      ]);

      dbStats = {
        totalTradesInDb: parseInt(tradesCount.rows[0]?.count || '0', 10),
        totalCandlesInDb: parseInt(candlesCount.rows[0]?.count || '0', 10),
        oldestTrade: tradeRange.rows[0]?.min_ts?.toISOString() || null,
        newestTrade: tradeRange.rows[0]?.max_ts?.toISOString() || null,
      };
    } catch (error) {
      console.error('[PerformanceTracker] Error fetching DB stats:', error);
    }

    const kalshiStats = this.getExchangeStats('kalshi');
    const polymarketStats = this.getExchangeStats('polymarket');

    return {
      uptime: Math.round((Date.now() - this.startTime) / 1000),
      startedAt: new Date(this.startTime).toISOString(),
      exchanges: {
        kalshi: kalshiStats,
        polymarket: polymarketStats,
      },
      totals: {
        totalTrades: kalshiStats.totalTrades + polymarketStats.totalTrades,
        tradesLast60s: recentTrades.length,
        tradesPerSecond: Math.round((recentTrades.length / 60) * 100) / 100,
        avgLatencyMs: allLatencies.length > 0
          ? Math.round(allLatencies.reduce((a, b) => a + b, 0) / allLatencies.length)
          : 0,
      },
      database: dbStats,
    };
  }

  /**
   * Get a quick summary for the frontend header
   */
  getQuickStats(): {
    tradesPerSecond: number;
    avgLatencyMs: number;
    uptimeSeconds: number;
  } {
    const recentTrades = this.getTradesInWindow();
    const allLatencies = [
      ...this.exchangeStats.kalshi.latencies.slice(-100),
      ...this.exchangeStats.polymarket.latencies.slice(-100),
    ];

    return {
      tradesPerSecond: Math.round((recentTrades.length / 60) * 100) / 100,
      avgLatencyMs: allLatencies.length > 0
        ? Math.round(allLatencies.reduce((a, b) => a + b, 0) / allLatencies.length)
        : 0,
      uptimeSeconds: Math.round((Date.now() - this.startTime) / 1000),
    };
  }
}

export const performanceTracker = new PerformanceTracker();

