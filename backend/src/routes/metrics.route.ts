import { Router } from 'express';

import { SEMANTIC_METRICS } from '../utils/semanticMetrics';

const router = Router();

router.get('/', (_req, res) => {
  res.json({ success: true, metrics: SEMANTIC_METRICS });
});

export default router;
