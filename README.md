# Prediction Market Trade Indexer

A real-time data indexing and visualization system for prediction market trades from Polymarket (on-chain) and Kalshi (API).

## Features

- Real-time trade indexing from Polymarket (Polygon) and Kalshi
- Pre-aggregated OHLC candlestick data (1s, 1m, 1h intervals)
- REST API for historical candles and trades
- WebSocket for live trade streaming
- React frontend with TradingView Lightweight Charts

## Tech Stack

- **Backend:** TypeScript, Node.js, Express
- **Database:** PostgreSQL
- **Frontend:** React, Vite, TradingView Lightweight Charts
- **Blockchain:** Polygon via Alchemy RPC

## Getting Started

### Prerequisites

- Node.js 18+
- Docker and Docker Compose
- Alchemy account with Polygon API key

### Setup

1. **Clone and install dependencies:**
   ```bash
   # Backend
   cd backend
   npm install

   # Frontend
   cd ../frontend
   npm install
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your Alchemy API key
   ```

3. **Start PostgreSQL:**
   ```bash
   docker-compose up -d
   ```

4. **Run database migrations:**
   ```bash
   cd backend
   npm run migrate
   ```

5. **Start the backend:**
   ```bash
   npm run dev
   ```

6. **Start the frontend (in another terminal):**
   ```bash
   cd frontend
   npm run dev
   ```

## API Endpoints

### GET /candles
Get OHLC candlestick data for a market.

**Query Parameters:**
- `exchange` (required): `polymarket` or `kalshi`
- `marketId` (required): Market identifier
- `interval` (required): `1s`, `1m`, or `1h`
- `start`: Start timestamp (ISO 8601)
- `end`: End timestamp (ISO 8601)
- `limit`: Number of results (default: 100)

### GET /trades
Get latest trades for a market.

**Query Parameters:**
- `exchange` (required): `polymarket` or `kalshi`
- `marketId` (required): Market identifier
- `limit`: Number of results (default: 100)

## WebSocket

Connect to `ws://localhost:3000` for live trade updates.

**Subscribe to a market:**
```json
{ "action": "subscribe", "exchange": "kalshi", "marketId": "MARKET_ID" }
```

**Trade event:**
```json
{ "type": "trade", "data": { "exchange": "kalshi", "marketId": "...", "price": "0.55", ... } }
```

## Project Structure

```
├── backend/
│   └── src/
│       ├── api/routes/      # REST API endpoints
│       ├── db/              # Database client and migrations
│       ├── indexers/        # Trade indexers (Kalshi, Polymarket)
│       ├── services/        # Business logic (candle aggregation)
│       ├── types/           # TypeScript interfaces
│       └── websocket/       # WebSocket server
├── frontend/
│   └── src/
│       ├── components/      # React components
│       └── hooks/           # Custom hooks
└── docker-compose.yml
```

## License

MIT

# dawn-takehome
# dawn-trial-2
# dawn-trial-2
