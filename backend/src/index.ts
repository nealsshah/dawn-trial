import express from 'express';
import cors from 'cors';
import http from 'http';
import dotenv from 'dotenv';
import db from './db/client';
import { kalshiIndexer } from './indexers/kalshi-indexer';
import { polymarketIndexer } from './indexers/polymarket-indexer';
import { candleAggregator } from './services/candle-aggregator';
import candlesRouter from './api/routes/candles';
import tradesRouter from './api/routes/trades';

dotenv.config();

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Database connection failed' });
  }
});

// API Routes
app.use('/candles', candlesRouter);
app.use('/trades', tradesRouter);

// Start server
server.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  
  // Start candle aggregator first (listens for trade events)
  candleAggregator.start();
  
  // Backfill candles from existing trades
  await candleAggregator.backfillCandles();
  
  // Start indexers (emit trade events)
  kalshiIndexer.start();
  polymarketIndexer.start();
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Shutting down...');
  kalshiIndexer.stop();
  polymarketIndexer.stop();
  candleAggregator.stop();
  server.close();
  process.exit(0);
});

export { app, server };

