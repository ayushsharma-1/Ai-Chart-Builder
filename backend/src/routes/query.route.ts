import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { isGroqRateLimitError, runAnalyticsPipeline } from '../utils/agentOrchestrator';

const router = Router();

const QuerySchema = z.object({
  prompt: z.string().trim().min(3).max(500),
  accountId: z.string().regex(/^\d+$/, 'accountId must be a numeric string').min(1),
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
      accountId: body.accountId,
      sessionId: body.sessionId,
      previousContext: body.previousContext,
    });

    if (!result.success) {
      if (result.type === 'rate_limit') {
        return res.status(429).json(result);
      }
      // Return 200 for chat-style blocks so the frontend can render them inline.
      const status = 200;
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

    return res.status(isValidationError ? 400 : 500).json({
      success: false,
      type: 'error',
      message: isValidationError
        ? 'Invalid request payload. Please send a prompt string and accountId.'
        : 'Something went wrong. Please try again.',
    });
  }
});

export default router;
