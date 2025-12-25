import { useEffect, useRef, useState, useCallback } from 'react';
import type { Exchange, Trade, WSMessage } from '../types';

const WS_URL = 'ws://localhost:3000/ws';

interface UseWebSocketOptions {
  exchange: Exchange;
  marketId: string;
  onTrade?: (trade: Trade) => void;
}

interface UseWebSocketReturn {
  isConnected: boolean;
  lastTrade: Trade | null;
  error: string | null;
}

export function useWebSocket({
  exchange,
  marketId,
  onTrade,
}: UseWebSocketOptions): UseWebSocketReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastTrade, setLastTrade] = useState<Trade | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Store current subscription to avoid stale closures
  const currentSubscription = useRef({ exchange, marketId });

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      setError(null);
      
      // Subscribe to the market
      const { exchange: ex, marketId: mId } = currentSubscription.current;
      if (ex && mId) {
        ws.send(JSON.stringify({
          action: 'subscribe',
          exchange: ex,
          marketId: mId,
        }));
      }
    };

    ws.onmessage = (event) => {
      try {
        const message: WSMessage = JSON.parse(event.data);
        
        if (message.type === 'trade') {
          setLastTrade(message.data);
          onTrade?.(message.data);
        } else if (message.type === 'error') {
          setError(message.message);
        }
      } catch (err) {
        console.error('Failed to parse WebSocket message:', err);
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      
      // Reconnect after 3 seconds
      setTimeout(() => {
        if (currentSubscription.current.marketId) {
          connect();
        }
      }, 3000);
    };

    ws.onerror = () => {
      setError('WebSocket connection error');
    };
  }, [onTrade]);

  // Handle subscription changes
  useEffect(() => {
    currentSubscription.current = { exchange, marketId };

    if (!marketId) {
      // Close connection if no market selected
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      return;
    }

    // If connected, send new subscription
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      // Unsubscribe from previous (handled by server on new subscribe)
      wsRef.current.send(JSON.stringify({
        action: 'subscribe',
        exchange,
        marketId,
      }));
    } else {
      // Connect and subscribe
      connect();
    }

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [exchange, marketId, connect]);

  return { isConnected, lastTrade, error };
}

