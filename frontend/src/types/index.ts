// API Types
export type Exchange = 'polymarket' | 'kalshi';
export type Interval = '1s' | '1m' | '1h';
export type Side = 'buy' | 'sell';

export interface Candle {
  openTime: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
}

export interface Trade {
  id: number;
  exchange: Exchange;
  marketId: string;
  price: string;
  quantity: string;
  side: Side;
  timestamp: string;
  txHash: string | null;
}

export interface Market {
  exchange: Exchange;
  marketId: string;
  tradeCount: number;
  firstTrade: string;
  lastTrade: string;
}

// WebSocket Types
export interface WSTradeMessage {
  type: 'trade';
  data: Trade;
}

export interface WSSubscribedMessage {
  type: 'subscribed' | 'unsubscribed';
  exchange: string;
  marketId: string;
}

export interface WSConnectedMessage {
  type: 'connected';
  message: string;
}

export interface WSErrorMessage {
  type: 'error';
  message: string;
}

export type WSMessage = WSTradeMessage | WSSubscribedMessage | WSConnectedMessage | WSErrorMessage;

// API Response Types
export interface APIResponse<T> {
  data: T;
}

