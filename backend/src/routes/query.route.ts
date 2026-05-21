import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { isGroqRateLimitError, runAnalyticsPipeline } from '../utils/agentOrchestrator';

const router = Router();

const QuerySchema = z.object({
  prompt: z.string().trim().min(3).max(500),
  sessionId: z.string().optional(),
  previousContext: z.object({
    previousPrompt: z.string().optional(),
    previousTitle: z.string().optional(),
    previousSql: z.string().optional(),
    previousChartType: z.string().optional(),
  }).optional(),
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const body = QuerySchema.parse(req.body);

    const result = await runAnalyticsPipeline({
      userPrompt: body.prompt,
      sessionId: body.sessionId,
      previousContext: body.previousContext,
    });

    if (!result.success) {
      if (result.type === 'rate_limit') {
        return res.status(429).json(result);
      }
      // Return 422 for validation/clarification blocks, 200 for non-analytics
      const status = result.type === 'validation_error' ? 422 : 200;
      return res.status(status).json(result);
    }

    // Pipeline success — return full result
    // NOTE: sql is included for internal save/refresh use — NEVER display in UI
    return res.json(result);

  } catch (err: any) {
    const isValidationError = err?.name === 'ZodError';

    console.error('[query.route] Unhandled error:', isValidationError ? 'Invalid request payload' : err?.stack || err?.message || err);

    if (err?.message?.includes('GROQ_API_KEY')) {
      return res.status(500).json({
        success: false,
        type: 'llm_error',
        message: 'GROQ_API_KEY is not configured. Set GROQ_API_KEY in backend/.env to enable LLM calls.',
        details: process.env.NODE_ENV === 'development' ? err.message : undefined,
      });
    }

    if (isGroqRateLimitError(err)) {
      return res.status(429).json({
        success: false,
        type: 'rate_limit',
        message: err.message || String(err),
      });
    }

    return res.status(500).json({
      success: false,
      type: 'error',
      message: isValidationError
        ? 'Invalid request payload. Please send a prompt string.'
        : 'Something went wrong. Please try again.',
    });
  }
});

export default router;
