import { useEffect, useRef, useState, useCallback } from 'react';
import {
  createChart,
  ColorType,
} from 'lightweight-charts';
import type {
  IChartApi,
  ISeriesApi,
  CandlestickData,
  HistogramData,
  Time,
} from 'lightweight-charts';
import type { Candle, Trade, Exchange, Interval } from '../types';
import { fetchCandles } from '../services/api';
import { useWebSocket } from '../hooks/useWebSocket';

interface ChartProps {
  exchange: Exchange;
  marketId: string;
  interval: Interval;
}

// Get timezone offset in seconds (negative for EST/EDT)
const TIMEZONE_OFFSET_SECONDS = new Date().getTimezoneOffset() * 60;

// Chart candle with volume for internal tracking
interface ChartCandleWithVolume extends CandlestickData<Time> {
  volume: number;
}

// Convert our Candle to TradingView format with local timezone adjustment
function toChartCandle(candle: Candle): ChartCandleWithVolume {
  // TradingView expects Unix timestamps in seconds
  // We subtract the timezone offset to display in local time
  const utcSeconds = new Date(candle.openTime).getTime() / 1000;
  const localSeconds = utcSeconds - TIMEZONE_OFFSET_SECONDS;
  
  return {
    time: localSeconds as Time,
    open: parseFloat(candle.open),
    high: parseFloat(candle.high),
    low: parseFloat(candle.low),
    close: parseFloat(candle.close),
    volume: parseFloat(candle.volume),
  };
}

// Convert candle to volume histogram bar
function toVolumeBar(candle: ChartCandleWithVolume): HistogramData<Time> {
  const isUp = candle.close >= candle.open;
  return {
    time: candle.time,
    value: candle.volume,
    color: isUp ? 'rgba(34, 197, 94, 0.5)' : 'rgba(239, 68, 68, 0.5)', // green/red with transparency
  };
}

// Get interval in seconds
function getIntervalSeconds(interval: Interval): number {
  switch (interval) {
    case '1s': return 1;
    case '1m': return 60;
    case '1h': return 3600;
  }
}

// Format relative time (e.g., "2s ago", "1m ago")
function formatRelativeTime(timestamp: Date | string): string {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diffSec = Math.floor((now - then) / 1000);
  
  if (diffSec < 0) return 'just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

// OHLCV data for legend display
interface OHLCVData {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  change: number;
  changePercent: number;
}

export function Chart({ exchange, marketId, interval }: ChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const candlesRef = useRef<Map<number, ChartCandleWithVolume>>(new Map());
  const [, setTick] = useState(0); // Force re-render for relative time updates
  const [hoveredData, setHoveredData] = useState<OHLCVData | null>(null);
  
  // Keep interval in a ref to avoid stale closures
  const intervalRef = useRef(interval);
  useEffect(() => {
    intervalRef.current = interval;
  }, [interval]);

  // Handle live trade updates - use useCallback with stable deps
  const handleTrade = useCallback((trade: Trade) => {
    const series = seriesRef.current;
    const volumeSeries = volumeSeriesRef.current;
    if (!series) {
      console.log('[Chart] No series ref, skipping trade update');
      return;
    }

    const currentInterval = intervalRef.current;
    // Convert UTC timestamp to local time for chart display
    const tradeTimeUtc = new Date(trade.timestamp).getTime() / 1000;
    const tradeTime = tradeTimeUtc - TIMEZONE_OFFSET_SECONDS;
    const intervalSec = getIntervalSeconds(currentInterval);
    const candleTime = Math.floor(tradeTime / intervalSec) * intervalSec;
    const price = parseFloat(trade.price);
    const quantity = parseFloat(trade.quantity);

    console.log(`[Chart] Processing trade: price=${price}, qty=${quantity}, candleTime=${candleTime}, interval=${currentInterval}`);

    const existing = candlesRef.current.get(candleTime);

    if (existing) {
      // Update existing candle
      const updated: ChartCandleWithVolume = {
        time: candleTime as Time,
        open: existing.open,
        high: Math.max(existing.high, price),
        low: Math.min(existing.low, price),
        close: price,
        volume: existing.volume + quantity,
      };
      candlesRef.current.set(candleTime, updated);
      series.update(updated);
      if (volumeSeries) {
        volumeSeries.update(toVolumeBar(updated));
      }
      console.log(`[Chart] Updated candle: O=${updated.open} H=${updated.high} L=${updated.low} C=${updated.close} V=${updated.volume}`);
    } else {
      // Create new candle
      const newCandle: ChartCandleWithVolume = {
        time: candleTime as Time,
        open: price,
        high: price,
        low: price,
        close: price,
        volume: quantity,
      };
      candlesRef.current.set(candleTime, newCandle);
      series.update(newCandle);
      if (volumeSeries) {
        volumeSeries.update(toVolumeBar(newCandle));
      }
      console.log(`[Chart] Created new candle: price=${price}, volume=${quantity}, time=${candleTime}`);
    }
  }, []); // Empty deps - uses refs internally

  const { isConnected, lastTrade } = useWebSocket({
    exchange,
    marketId,
    onTrade: handleTrade,
  });

  // Update relative time display every second
  useEffect(() => {
    if (!lastTrade) return;
    const timer = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, [lastTrade]);

  // Initialize chart
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#0a0a0f' },
        textColor: '#9ca3af',
      },
      grid: {
        vertLines: { color: '#1f2937' },
        horzLines: { color: '#1f2937' },
      },
      crosshair: {
        mode: 1,
        vertLine: {
          color: '#6366f1',
          width: 1,
          style: 2,
        },
        horzLine: {
          color: '#6366f1',
          width: 1,
          style: 2,
        },
      },
      timeScale: {
        borderColor: '#374151',
        timeVisible: true,
        secondsVisible: interval === '1s',
      },
      rightPriceScale: {
        borderColor: '#374151',
      },
    });

    const series = chart.addCandlestickSeries({
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderUpColor: '#22c55e',
      borderDownColor: '#ef4444',
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
    });

    // Add volume histogram series
    const volumeSeries = chart.addHistogramSeries({
      color: '#6366f1',
      priceFormat: {
        type: 'volume',
      },
      priceScaleId: 'volume', // Separate price scale for volume
    });

    // Configure volume price scale (bottom 20% of chart)
    chart.priceScale('volume').applyOptions({
      scaleMargins: {
        top: 0.8, // Volume takes bottom 20%
        bottom: 0,
      },
    });

    chartRef.current = chart;
    seriesRef.current = series;
    volumeSeriesRef.current = volumeSeries;

    // Subscribe to crosshair move to show OHLCV legend
    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.seriesData) {
        setHoveredData(null);
        return;
      }

      const candleData = param.seriesData.get(series) as CandlestickData<Time> | undefined;
      if (!candleData) {
        setHoveredData(null);
        return;
      }

      // Get volume from our stored data
      const timeNum = param.time as number;
      const storedCandle = candlesRef.current.get(timeNum);
      const volume = storedCandle?.volume ?? 0;

      // Format time based on interval
      const date = new Date((timeNum + TIMEZONE_OFFSET_SECONDS) * 1000);
      let timeStr: string;
      if (intervalRef.current === '1s') {
        timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      } else if (intervalRef.current === '1m') {
        timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      } else {
        timeStr = date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      }

      const change = candleData.close - candleData.open;
      const changePercent = (change / candleData.open) * 100;

      setHoveredData({
        time: timeStr,
        open: candleData.open,
        high: candleData.high,
        low: candleData.low,
        close: candleData.close,
        volume,
        change,
        changePercent,
      });
    });

    // Handle resize
    const handleResize = () => {
      if (containerRef.current) {
        chart.applyOptions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      volumeSeriesRef.current = null;
    };
  }, [interval]);

  // Load candles when market/interval changes
  useEffect(() => {
    if (!marketId || !seriesRef.current) return;

    setIsLoading(true);
    setError(null);
    candlesRef.current.clear();

    fetchCandles(exchange, marketId, interval, 500)
      .then((candles) => {
        if (!seriesRef.current) return;

        // Sort candles by time ascending (oldest first)
        const sortedCandles = candles.sort((a, b) => 
          new Date(a.openTime).getTime() - new Date(b.openTime).getTime()
        );
        
        const chartCandles = sortedCandles.map(toChartCandle);
        
        // Store candles for live updates
        chartCandles.forEach((c) => {
          candlesRef.current.set(c.time as number, c);
        });

        // Set candlestick data
        seriesRef.current.setData(chartCandles);
        
        // Set volume data
        if (volumeSeriesRef.current) {
          const volumeBars = chartCandles.map(toVolumeBar);
          volumeSeriesRef.current.setData(volumeBars);
        }
        
        chartRef.current?.timeScale().fitContent();
        setIsLoading(false);
        
        console.log(`[Chart] Loaded ${chartCandles.length} candles for ${marketId}`);
      })
      .catch((err) => {
        setError(err.message);
        setIsLoading(false);
      });
  }, [exchange, marketId, interval]);

  return (
    <div className="chart-container">
      {/* Status bar */}
      <div className="chart-status">
        <span className={`status-dot ${isConnected ? 'connected' : 'disconnected'}`} />
        <span className="status-text">
          {isConnected ? 'Live' : 'Connecting...'}
        </span>
        {lastTrade && (
          <span className="last-trade">
            Last: ${parseFloat(lastTrade.price).toFixed(4)} ({lastTrade.side})
            <span className="trade-time">· {formatRelativeTime(lastTrade.timestamp)}</span>
          </span>
        )}
      </div>

      {/* OHLCV Legend - shows when hovering over candles */}
      <div className="chart-legend">
        {hoveredData ? (
          <>
            <span className="legend-time">{hoveredData.time}</span>
            <span className="legend-item">
              <span className="legend-label">O</span>
              <span className="legend-value">{hoveredData.open.toFixed(4)}</span>
            </span>
            <span className="legend-item">
              <span className="legend-label">H</span>
              <span className="legend-value">{hoveredData.high.toFixed(4)}</span>
            </span>
            <span className="legend-item">
              <span className="legend-label">L</span>
              <span className="legend-value">{hoveredData.low.toFixed(4)}</span>
            </span>
            <span className="legend-item">
              <span className="legend-label">C</span>
              <span className="legend-value">{hoveredData.close.toFixed(4)}</span>
            </span>
            <span className="legend-item">
              <span className="legend-label">V</span>
              <span className="legend-value">{hoveredData.volume.toFixed(2)}</span>
            </span>
            <span className={`legend-change ${hoveredData.change >= 0 ? 'positive' : 'negative'}`}>
              {hoveredData.change >= 0 ? '+' : ''}{hoveredData.change.toFixed(4)} ({hoveredData.changePercent.toFixed(2)}%)
            </span>
          </>
        ) : (
          <span className="legend-hint">Hover over chart to see OHLCV</span>
        )}
      </div>

      {/* Chart */}
      <div ref={containerRef} className="chart" />

      {/* Loading/Error overlay */}
      {isLoading && (
        <div className="chart-overlay">
          <div className="loading-spinner" />
          <span>Loading chart data...</span>
        </div>
      )}
      {error && (
        <div className="chart-overlay error">
          <span>⚠️ {error}</span>
        </div>
      )}
    </div>
  );
}
