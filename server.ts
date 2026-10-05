import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { musicRouter } from './src/server/routes/music';
import { webhookRouter } from './src/server/routes/webhooks';
import { adminRouter } from './src/server/routes/admin';
import { authRouter } from './src/server/routes/auth';

dotenv.config();

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Body parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// CORS & Security headers
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-User-Id, X-User-Email');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Health endpoint
app.get(['/api/health', '/health'], (_req, res) => {
  res.json({
    status: 'ok',
    service: 'Sonic Hub AI',
    timestamp: new Date().toISOString()
  });
});

// Favicon fallback
app.get('/favicon.ico', (_req, res) => {
  res.redirect(301, '/favicon.svg');
});

// Normalize Vercel rewritten paths
app.use((req, _res, next) => {
  const matchedPath = req.headers['x-matched-path'] as string;
  if (matchedPath && matchedPath.startsWith('/api') && req.url !== matchedPath) {
    req.url = matchedPath;
  }
  next();
});

// Mount API routes (supports both /api/* and direct prefix in case Vercel rewrites strip /api)
app.use('/api/music', musicRouter);
app.use('/music', musicRouter);

app.use('/api/webhooks', webhookRouter);
app.use('/webhooks', webhookRouter);

app.use('/api/admin', adminRouter);
app.use('/admin', adminRouter);

app.use('/api/auth', authRouter);
app.use('/auth', authRouter);

// JSON 404 handler for API routes
app.all(['/api', '/api/*'], (req, res) => {
  res.status(404).json({
    success: false,
    code: 'NOT_FOUND',
    message: `API route not found: ${req.method} ${req.originalUrl || req.url}`
  });
});

// Global Express error handler: ensures server NEVER responds with HTML error pages to API callers
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[Sonic Hub Server Error]', err);
  if (!res.headersSent) {
    res.status(err.status || 500).json({
      success: false,
      code: err.code || 'INTERNAL_SERVER_ERROR',
      message: err.message || 'An unexpected server error occurred'
    });
  }
});

// Frontend Vite integration
async function startServer() {
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Sonic Hub AI] Server listening on http://0.0.0.0:${PORT}`);
  });
}

// In Vercel serverless functions, the app is exported rather than started with app.listen
if (process.env.VERCEL !== '1') {
  startServer().catch(err => {
    console.error('[Sonic Hub AI] Failed to start server:', err);
    process.exit(1);
  });
}

export default app;
