import { useState, useEffect, useCallback } from 'react';
import './PerformanceStats.css';

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

interface PerformanceData {
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

interface QuickStats {
  tradesPerSecond: number;
  avgLatencyMs: number;
  uptimeSeconds: number;
}

const API_BASE_URL = 'http://localhost:3000';

function formatUptime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  }
  return `${secs}s`;
}

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  } else if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toString();
}

function getTimeSince(isoDate: string | null): string {
  if (!isoDate) return 'N/A';
  const diff = Date.now() - new Date(isoDate).getTime();
  const seconds = Math.floor(diff / 1000);
  
  if (seconds < 1) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

function getLatencyClass(latencyMs: number): string {
  if (latencyMs < 500) return 'latency-excellent';
  if (latencyMs < 2000) return 'latency-good';
  if (latencyMs < 5000) return 'latency-fair';
  return 'latency-poor';
}

export function PerformanceStats() {
  const [stats, setStats] = useState<PerformanceData | null>(null);
  const [quickStats, setQuickStats] = useState<QuickStats | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [lastApiLatency, setLastApiLatency] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchQuickStats = useCallback(async () => {
    try {
      const start = performance.now();
      const response = await fetch(`${API_BASE_URL}/stats/quick`);
      const latency = Math.round(performance.now() - start);
      setLastApiLatency(latency);
      
      if (response.ok) {
        const data: QuickStats = await response.json();
        setQuickStats(data);
      }
    } catch (error) {
      console.error('Failed to fetch quick stats:', error);
    }
  }, []);

  const fetchFullStats = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`${API_BASE_URL}/stats`);
      if (response.ok) {
        const data: PerformanceData = await response.json();
        setStats(data);
      }
    } catch (error) {
      console.error('Failed to fetch full stats:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Quick stats polling (every 2 seconds)
  useEffect(() => {
    fetchQuickStats();
    const interval = setInterval(fetchQuickStats, 2000);
    return () => clearInterval(interval);
  }, [fetchQuickStats]);

  // Full stats fetch when expanded
  useEffect(() => {
    if (isExpanded) {
      fetchFullStats();
      const interval = setInterval(fetchFullStats, 5000);
      return () => clearInterval(interval);
    }
  }, [isExpanded, fetchFullStats]);

  return (
    <div className="performance-stats">
      {/* Compact header stats */}
      <div className="quick-stats" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="stat-pill">
          <span className="stat-label">TPS</span>
          <span className="stat-value">{quickStats?.tradesPerSecond.toFixed(1) ?? '—'}</span>
        </div>
        <div className={`stat-pill ${getLatencyClass(quickStats?.avgLatencyMs ?? 0)}`}>
          <span className="stat-label">Latency</span>
          <span className="stat-value">{quickStats?.avgLatencyMs ?? '—'}ms</span>
        </div>
        <div className="stat-pill">
          <span className="stat-label">API</span>
          <span className="stat-value">{lastApiLatency ?? '—'}ms</span>
        </div>
        <div className="stat-pill">
          <span className="stat-label">Uptime</span>
          <span className="stat-value">{quickStats ? formatUptime(quickStats.uptimeSeconds) : '—'}</span>
        </div>
        <span className="expand-icon">{isExpanded ? '▼' : '▶'}</span>
      </div>

      {/* Expanded detailed stats */}
      {isExpanded && (
        <div className="detailed-stats">
          {isLoading && !stats ? (
            <div className="loading">Loading detailed stats...</div>
          ) : stats ? (
            <>
              {/* Database Stats */}
              <div className="stats-section">
                <h3>📊 Database</h3>
                <div className="stats-grid">
                  <div className="stat-item">
                    <span className="label">Total Trades</span>
                    <span className="value">{formatNumber(stats.database.totalTradesInDb)}</span>
                  </div>
                  <div className="stat-item">
                    <span className="label">Total Candles</span>
                    <span className="value">{formatNumber(stats.database.totalCandlesInDb)}</span>
                  </div>
                  <div className="stat-item">
                    <span className="label">Latest Trade</span>
                    <span className="value">{getTimeSince(stats.database.newestTrade)}</span>
                  </div>
                  <div className="stat-item">
                    <span className="label">Data Range</span>
                    <span className="value">{getTimeSince(stats.database.oldestTrade)}</span>
                  </div>
                </div>
              </div>

              {/* Exchange Stats */}
              <div className="stats-section">
                <h3>📈 Kalshi</h3>
                <div className="stats-grid">
                  <div className="stat-item">
                    <span className="label">Session Trades</span>
                    <span className="value">{formatNumber(stats.exchanges.kalshi.totalTrades)}</span>
                  </div>
                  <div className="stat-item">
                    <span className="label">Trades/60s</span>
                    <span className="value">{stats.exchanges.kalshi.tradesLast60s}</span>
                  </div>
                  <div className="stat-item">
                    <span className="label">TPS</span>
                    <span className="value">{stats.exchanges.kalshi.tradesPerSecond.toFixed(2)}</span>
                  </div>
                  <div className={`stat-item ${getLatencyClass(stats.exchanges.kalshi.avgLatencyMs)}`}>
                    <span className="label">Avg Latency</span>
                    <span className="value">{stats.exchanges.kalshi.avgLatencyMs}ms</span>
                  </div>
                  <div className="stat-item">
                    <span className="label">Min/Max</span>
                    <span className="value">{stats.exchanges.kalshi.minLatencyMs}/{stats.exchanges.kalshi.maxLatencyMs}ms</span>
                  </div>
                  <div className="stat-item">
                    <span className="label">Last Trade</span>
                    <span className="value">{getTimeSince(stats.exchanges.kalshi.lastTradeAt)}</span>
                  </div>
                </div>
              </div>

              <div className="stats-section">
                <h3>🔮 Polymarket</h3>
                <div className="stats-grid">
                  <div className="stat-item">
                    <span className="label">Session Trades</span>
                    <span className="value">{formatNumber(stats.exchanges.polymarket.totalTrades)}</span>
                  </div>
                  <div className="stat-item">
                    <span className="label">Trades/60s</span>
                    <span className="value">{stats.exchanges.polymarket.tradesLast60s}</span>
                  </div>
                  <div className="stat-item">
                    <span className="label">TPS</span>
                    <span className="value">{stats.exchanges.polymarket.tradesPerSecond.toFixed(2)}</span>
                  </div>
                  <div className={`stat-item ${getLatencyClass(stats.exchanges.polymarket.avgLatencyMs)}`}>
                    <span className="label">Avg Latency</span>
                    <span className="value">{stats.exchanges.polymarket.avgLatencyMs}ms</span>
                  </div>
                  <div className="stat-item">
                    <span className="label">Min/Max</span>
                    <span className="value">{stats.exchanges.polymarket.minLatencyMs}/{stats.exchanges.polymarket.maxLatencyMs}ms</span>
                  </div>
                  <div className="stat-item">
                    <span className="label">Last Trade</span>
                    <span className="value">{getTimeSince(stats.exchanges.polymarket.lastTradeAt)}</span>
                  </div>
                </div>
              </div>

              {/* Legend */}
              <div className="latency-legend">
                <span className="legend-title">Latency:</span>
                <span className="legend-item latency-excellent">●&lt;500ms</span>
                <span className="legend-item latency-good">●&lt;2s</span>
                <span className="legend-item latency-fair">●&lt;5s</span>
                <span className="legend-item latency-poor">●&gt;5s</span>
              </div>
            </>
          ) : (
            <div className="error">Failed to load stats</div>
          )}
        </div>
      )}
    </div>
  );
}

