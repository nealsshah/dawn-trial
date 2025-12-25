import express from 'express';
import cors from 'cors';
import http from 'http';
import dotenv from 'dotenv';
import db from './db/client';
import { kalshiIndexer } from './indexers/kalshi-indexer';
import { polymarketIndexer } from './indexers/polymarket-indexer';
import { candleAggregator } from './services/candle-aggregator';
import { performanceTracker } from './services/performance-tracker';
import { tradeWebSocketServer } from './websocket/server';
import candlesRouter from './api/routes/candles';
import tradesRouter from './api/routes/trades';

dotenv.config();

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

// Middleware - allow both localhost and production URL
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(null, true); // Allow all origins in development
    }
  },
  credentials: true,
}));
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

// WebSocket stats endpoint
app.get('/ws/stats', (req, res) => {
  res.json(tradeWebSocketServer.getStats());
});

// Performance stats endpoint
app.get('/stats', async (req, res) => {
  try {
    const stats = await performanceTracker.getStats();
    res.json(stats);
  } catch (error) {
    console.error('[API] Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// Quick stats for header display
app.get('/stats/quick', (req, res) => {
  res.json(performanceTracker.getQuickStats());
});

// Initialize WebSocket server
tradeWebSocketServer.initialize(server);

// Start server
server.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`WebSocket available at ws://localhost:${PORT}/ws`);
  
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

