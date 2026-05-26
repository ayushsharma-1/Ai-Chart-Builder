import 'dotenv/config';
import cors from 'cors';
import express from 'express';

import { connectMongo } from './config/mongo';
import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';
import chartsRoute from './routes/charts.route';
import metricsRoute from './routes/metrics.route';
import queryRoute from './routes/query.route';
import queryBuilderRoute from './routes/queryBuilder.route';
import queryBuilderAstRoute from './routes/query-builder-ast.route';
import reportsRoute from './routes/reports.route';

const app = express();
const PORT = Number.parseInt(process.env.PORT || '3002', 10);

app.disable('x-powered-by');
app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:3600' }));
app.use(express.json({ limit: '1mb' }));
app.use(requestLogger);

app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/api/query', queryRoute);
app.use('/api/query-builder', queryBuilderRoute);
app.use('/api/query-builder/ast', queryBuilderAstRoute);
app.use('/api/charts', chartsRoute);
app.use('/api/reports', reportsRoute);
app.use('/api/metrics', metricsRoute);
app.use(errorHandler);

async function start() {
  await connectMongo();

  app.listen(PORT, () => {
    console.log(`Backend running on http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  console.error('Failed to start backend:', err?.message || err);
  process.exit(1);
});
