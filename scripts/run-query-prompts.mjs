#!/usr/bin/env node
/**
 * Hits the analytics "chat" pipeline: POST /api/query (see backend/src/routes/query.route.ts).
 *
 * Usage:
 *   node scripts/run-query-prompts.mjs
 *   QUERY_BASE_URL=http://localhost:3001 node scripts/run-query-prompts.mjs
 *   DELAY_MS=2000 node scripts/run-query-prompts.mjs
 *   RATE_LIMIT_POLL_MS=5000 node scripts/run-query-prompts.mjs
 *   START_INDEX=10 PROMPT_LIMIT=5 node scripts/run-query-prompts.mjs
 *
 * Regenerate prompt list:
 *   node scripts/build-prompts-array.mjs
 *
 * Rate limits (Groq TPD / RPM): on 429 or message containing "Rate limit reached" / "tokens per day",
 * the runner pauses on the same prompt, retries every RATE_LIMIT_POLL_MS (default 5s), then continues
 * with DELAY_MS (default 2s) between successful prompts.
 *
 * Note: Backend validates prompt length max 500 chars (Zod in query.route.ts).
 *       Longer prompts may return 400.
 */

import { PROMPTS } from './run-query-prompts-data.mjs';

const BASE_URL = (process.env.QUERY_BASE_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/$/, '');
const DELAY_MS = Number.parseInt(process.env.DELAY_MS || '2000', 10);
const RATE_LIMIT_POLL_MS = Number.parseInt(process.env.RATE_LIMIT_POLL_MS || '5000', 10);
const TIMEOUT_MS = Number.parseInt(process.env.REQUEST_TIMEOUT_MS || '120000', 10);
/** 1-based inclusive slice: START_INDEX=1 PROMPT_LIMIT=5 runs first five prompts */
const START_INDEX = Math.max(1, Number.parseInt(process.env.START_INDEX || '1', 10));
const PROMPT_LIMIT = process.env.PROMPT_LIMIT ? Number.parseInt(process.env.PROMPT_LIMIT, 10) : null;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Detect Groq org/model TPD or similar rate-limit errors in API responses */
function isRateLimitExceeded({ status, type, message, error, details, rawBody }) {
  if (status === 429 || type === 'rate_limit') return true;
  const haystack = [message, error, details, rawBody].filter(Boolean).join('\n');
  return /rate\s*limit\s*reached|tokens per day|\bTPD\b|llama-3\.3-70b-versatile/i.test(haystack);
}

async function postPrompt(prompt, index) {
  const url = `${BASE_URL}/api/query`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const started = Date.now();
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
      signal: controller.signal,
    });

    const text = await res.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text.slice(0, 2000) };
    }

    const elapsed = Date.now() - started;
    const ok = res.ok;
    const success = body?.success === true;
    const message = typeof body?.message === 'string' ? body.message : undefined;
    const details = typeof body?.details === 'string' ? body.details : undefined;
    const errorField =
      typeof body?.error === 'string'
        ? body.error
        : typeof body?.error?.message === 'string'
          ? body.error.message
          : undefined;
    const rawBody = typeof body?.raw === 'string' ? body.raw : text.slice(0, 2000);
    const rateLimited = isRateLimitExceeded({
      status: res.status,
      type: body?.type,
      message,
      error: errorField,
      details,
      rawBody,
    });

    return {
      index,
      ok,
      status: res.status,
      elapsedMs: elapsed,
      success,
      rateLimited,
      type: body?.type,
      message,
      details,
      error: errorField,
      rowCount: body?.rowCount,
      chartType: body?.chartType,
    };
  } catch (err) {
    const errMsg = err?.name === 'AbortError' ? `Timeout after ${TIMEOUT_MS}ms` : String(err?.message || err);
    return {
      index,
      ok: false,
      status: 0,
      elapsedMs: 0,
      success: false,
      rateLimited: isRateLimitExceeded({ message: errMsg }),
      error: errMsg,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Run one prompt; on Groq rate limit, hold position and retry every RATE_LIMIT_POLL_MS until it clears.
 */
async function runPromptUntilReady(prompt, index) {
  let attempt = 0;
  while (true) {
    attempt += 1;
    const result = await postPrompt(prompt, index);

    if (!result.rateLimited) {
      return result;
    }

    console.error(
      `[rate-limit] Prompt ${index} blocked (attempt ${attempt}). ` +
        `Waiting ${RATE_LIMIT_POLL_MS}ms before retry…`,
    );
    if (result.message) {
      console.error(`  ${result.message.slice(0, 200)}${result.message.length > 200 ? '…' : ''}`);
    }
    await sleep(RATE_LIMIT_POLL_MS);
  }
}

async function main() {
  const startIdx = START_INDEX - 1;
  const endIdx =
    PROMPT_LIMIT != null && Number.isFinite(PROMPT_LIMIT)
      ? Math.min(PROMPTS.length, startIdx + PROMPT_LIMIT)
      : PROMPTS.length;
  const slice = PROMPTS.slice(startIdx, endIdx);

  console.error(`Base URL: ${BASE_URL}`);
  console.error(`Endpoint: POST ${BASE_URL}/api/query`);
  console.error(`Delay between successful prompts: ${DELAY_MS}ms`);
  console.error(`Rate-limit retry interval: ${RATE_LIMIT_POLL_MS}ms`);
  console.error(
    `Prompts: ${slice.length} of ${PROMPTS.length} (START_INDEX=${START_INDEX}${PROMPT_LIMIT != null ? ` PROMPT_LIMIT=${PROMPT_LIMIT}` : ''})\n`,
  );

  const results = [];

  for (let i = 0; i < slice.length; i += 1) {
    const prompt = slice[i];
    const n = startIdx + i + 1;
    const overLimit = prompt.length > 500;
    console.error(
      `[${n}/${PROMPTS.length}] (${prompt.length} chars${overLimit ? ', may exceed API max 500' : ''}) ` +
        `${prompt.slice(0, 80)}${prompt.length > 80 ? '…' : ''}`,
    );

    const result = await runPromptUntilReady(prompt, n);
    results.push({ ...result, promptLen: prompt.length });

    const line = JSON.stringify(result);
    console.log(line);

    if (i < slice.length - 1) {
      await sleep(DELAY_MS);
    }
  }

  const passed = results.filter((r) => r.success).length;
  const rateLimitHits = results.filter((r) => r.rateLimited).length;
  console.error(`\nDone. success=true: ${passed}/${results.length}`);
  if (rateLimitHits > 0) {
    console.error(`(Note: ${rateLimitHits} result(s) still marked rateLimited — should not happen after retry loop)`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
