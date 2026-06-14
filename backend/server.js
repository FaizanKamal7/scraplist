'use strict';

require('dotenv').config();

const express = require('express');
const cors    = require('cors');

const emailVerifierRouter = require('./routes/emailVerifier');

const app  = express();
const PORT = parseInt(process.env.PORT, 10) || 3001;

// ── CORS — only allow the Chrome extension origin ──────────────────────────
const allowedOrigin = process.env.CORS_ALLOWED_ORIGIN || '';

app.use(cors({
  origin(origin, cb) {
    // Allow requests with no origin (e.g., curl, health checks from localhost)
    if (!origin) return cb(null, true);
    if (!allowedOrigin) {
      // No restriction configured — allow all (dev mode)
      return cb(null, true);
    }
    if (origin === allowedOrigin) return cb(null, true);
    cb(new Error(`CORS: origin "${origin}" is not allowed`));
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
}));

app.use(express.json({ limit: '100kb' }));

// ── Routes ─────────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

app.use('/api/email-verifier', emailVerifierRouter);

// ── 404 catch-all ──────────────────────────────────────────────────────────

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ── Global error handler ───────────────────────────────────────────────────

app.use((err, _req, res, _next) => {
  console.error('[server error]', err.message);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// ── Start ──────────────────────────────────────────────────────────────────

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Email verifier backend listening on http://127.0.0.1:${PORT}`);
  console.log(`CORS allowed origin: ${allowedOrigin || '(any — set CORS_ALLOWED_ORIGIN in .env)'}`);
});
