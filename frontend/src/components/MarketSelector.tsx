import { useEffect, useState } from 'react';
import type { Exchange, Interval, Market } from '../types';
import { fetchMarkets } from '../services/api';

interface MarketSelectorProps {
  exchange: Exchange;
  marketId: string;
  interval: Interval;
  onExchangeChange: (exchange: Exchange) => void;
  onMarketChange: (marketId: string) => void;
  onIntervalChange: (interval: Interval) => void;
}

export function MarketSelector({
  exchange,
  marketId,
  interval,
  onExchangeChange,
  onMarketChange,
  onIntervalChange,
}: MarketSelectorProps) {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Fetch markets when exchange changes
  useEffect(() => {
    setIsLoading(true);
    fetchMarkets(exchange)
      .then((data) => {
        setMarkets(data);
        // Auto-select first market if none selected
        if (!marketId && data.length > 0) {
          onMarketChange(data[0].marketId);
        }
        setIsLoading(false);
      })
      .catch((err) => {
        console.error('Failed to fetch markets:', err);
        setIsLoading(false);
      });
  }, [exchange]);

  // Format market ID for display
  const formatMarketId = (id: string): string => {
    // Kalshi IDs are readable, Polymarket IDs are long numbers
    if (id.length > 30) {
      return `${id.slice(0, 8)}...${id.slice(-6)}`;
    }
    return id;
  };

  return (
    <div className="market-selector">
      {/* Exchange Toggle */}
      <div className="selector-group">
        <label>Exchange</label>
        <div className="toggle-group">
          <button
            className={`toggle-btn ${exchange === 'kalshi' ? 'active' : ''}`}
            onClick={() => {
              onExchangeChange('kalshi');
              onMarketChange('');
            }}
          >
            📊 Kalshi
          </button>
          <button
            className={`toggle-btn ${exchange === 'polymarket' ? 'active' : ''}`}
            onClick={() => {
              onExchangeChange('polymarket');
              onMarketChange('');
            }}
          >
            🔮 Polymarket
          </button>
        </div>
      </div>

      {/* Market Dropdown */}
      <div className="selector-group">
        <label>Market</label>
        <select
          value={marketId}
          onChange={(e) => onMarketChange(e.target.value)}
          disabled={isLoading || markets.length === 0}
        >
          {isLoading ? (
            <option>Loading markets...</option>
          ) : markets.length === 0 ? (
            <option>No markets available</option>
          ) : (
            <>
              <option value="">Select a market...</option>
              {markets.map((m) => (
                <option key={m.marketId} value={m.marketId}>
                  {formatMarketId(m.marketId)} ({m.tradeCount} trades)
                </option>
              ))}
            </>
          )}
        </select>
      </div>

      {/* Interval Selector */}
      <div className="selector-group">
        <label>Interval</label>
        <div className="toggle-group">
          {(['1s', '1m', '1h'] as Interval[]).map((int) => (
            <button
              key={int}
              className={`toggle-btn ${interval === int ? 'active' : ''}`}
              onClick={() => onIntervalChange(int)}
            >
              {int}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

