import { useState, useEffect, useRef } from 'react';
import type { Trade, Exchange } from '../types';
import { useWebSocket } from '../hooks/useWebSocket';
import { fetchTrades } from '../services/api';
import './TradesTable.css';

interface TradesTableProps {
  exchange: Exchange;
  marketId: string;
}

function formatTime(timestamp: Date | string): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function formatQuantity(quantity: string): string {
  const num = parseFloat(quantity);
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  if (num >= 1) return num.toFixed(0);
  return num.toFixed(2);
}

export function TradesTable({ exchange, marketId }: TradesTableProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const tradesContainerRef = useRef<HTMLDivElement>(null);

  // Handle new trades from WebSocket
  const handleTrade = (trade: Trade) => {
    setTrades((prev) => {
      // Add new trade at the beginning, keep max 50
      const updated = [trade, ...prev].slice(0, 50);
      return updated;
    });
  };

  const { isConnected } = useWebSocket({
    exchange,
    marketId,
    onTrade: handleTrade,
  });

  // Load initial trades when market changes
  useEffect(() => {
    if (!marketId) {
      setTrades([]);
      return;
    }

    setIsLoading(true);
    fetchTrades(exchange, marketId, 30)
      .then((fetchedTrades) => {
        // Sort by timestamp descending (newest first)
        const sorted = fetchedTrades.sort(
          (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );
        setTrades(sorted);
      })
      .catch((err) => {
        console.error('Failed to fetch trades:', err);
        setTrades([]);
      })
      .finally(() => setIsLoading(false));
  }, [exchange, marketId]);

  // Scroll to top when new trade arrives (if expanded)
  useEffect(() => {
    if (isExpanded && tradesContainerRef.current && trades.length > 0) {
      tradesContainerRef.current.scrollTop = 0;
    }
  }, [trades.length, isExpanded]);

  const tradeCount = trades.length;

  return (
    <div className={`trades-table-container ${isExpanded ? 'expanded' : 'collapsed'}`}>
      {/* Header - always visible */}
      <button
        className="trades-table-header"
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
      >
        <div className="trades-header-left">
          <span className="trades-icon">📋</span>
          <span className="trades-title">Recent Trades</span>
          {tradeCount > 0 && (
            <span className="trades-count">{tradeCount}</span>
          )}
          {isConnected && (
            <span className="trades-live-dot" title="Live updates active" />
          )}
        </div>
        <span className={`trades-chevron ${isExpanded ? 'up' : 'down'}`}>
          {isExpanded ? '▼' : '▲'}
        </span>
      </button>

      {/* Trades list - collapsible */}
      {isExpanded && (
        <div className="trades-table-content" ref={tradesContainerRef}>
          {isLoading ? (
            <div className="trades-loading">
              <div className="loading-spinner" />
              <span>Loading trades...</span>
            </div>
          ) : trades.length === 0 ? (
            <div className="trades-empty">
              No trades yet for this market
            </div>
          ) : (
            <table className="trades-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Side</th>
                  <th className="price-col">Price</th>
                  <th className="qty-col">Qty</th>
                </tr>
              </thead>
              <tbody>
                {trades.map((trade, index) => (
                  <tr
                    key={`${trade.txHash || trade.timestamp}-${index}`}
                    className={`trade-row ${trade.side} ${index === 0 ? 'newest' : ''}`}
                  >
                    <td className="time-col">{formatTime(trade.timestamp)}</td>
                    <td className={`side-col ${trade.side}`}>
                      {trade.side === 'buy' ? '▲ BUY' : '▼ SELL'}
                    </td>
                    <td className="price-col">${parseFloat(trade.price).toFixed(4)}</td>
                    <td className="qty-col">{formatQuantity(trade.quantity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
