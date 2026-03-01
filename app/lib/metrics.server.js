/**
 * Lightweight in-process metrics. Counters reset every flush interval and are
 * printed to stdout so they appear in Railway logs. No external dependencies.
 *
 * Upgrade benchmarks (for reference):
 *   OpenAI Tier 1 (500 RPM, 10k RPD) → upgrade at sustained >400 RPM or >8k RPD
 *   Supabase Micro (2-core, 1GB)      → upgrade at CPU >70% or query latency >200ms
 *   Railway Pro ($20/mo)               → upgrade at memory >80% or response-time spikes
 */

const FLUSH_INTERVAL_MS = 60_000;

const counters = {
  webhooks_received: 0,
  dm_messages_processed: 0,
  comment_messages_processed: 0,
  automations_sent: 0,
  automations_skipped: 0,
  openai_requests: 0,
  openai_429s: 0,
  queue_processed: 0,
  queue_sent: 0,
  queue_failed: 0,
  db_errors: 0,
};

const timings = {
  webhook_response_ms: [],
  openai_latency_ms: [],
};

let _flushTimer = null;

function ensureTimer() {
  if (_flushTimer) return;
  _flushTimer = setInterval(flushMetrics, FLUSH_INTERVAL_MS);
  if (_flushTimer.unref) _flushTimer.unref();
}

export function incCounter(name, amount = 1) {
  if (name in counters) {
    counters[name] += amount;
    ensureTimer();
  }
}

export function recordTiming(name, ms) {
  if (name in timings) {
    timings[name].push(ms);
    ensureTimer();
  }
}

function avg(arr) {
  if (!arr.length) return 0;
  return Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
}

function p99(arr) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length * 0.99)] ?? sorted[sorted.length - 1];
}

function flushMetrics() {
  const hasActivity =
    counters.webhooks_received > 0 ||
    counters.queue_processed > 0 ||
    counters.openai_requests > 0;

  if (!hasActivity) return;

  const webhookAvg = avg(timings.webhook_response_ms);
  const openaiAvg = avg(timings.openai_latency_ms);
  const openaiP99 = p99(timings.openai_latency_ms);

  console.log(
    `[metrics] webhooks=${counters.webhooks_received}` +
    ` dms=${counters.dm_messages_processed}` +
    ` comments=${counters.comment_messages_processed}` +
    ` sent=${counters.automations_sent}` +
    ` skipped=${counters.automations_skipped}` +
    ` openai_rq=${counters.openai_requests}` +
    ` openai_429=${counters.openai_429s}` +
    ` openai_avg=${openaiAvg}ms` +
    ` openai_p99=${openaiP99}ms` +
    ` queue_proc=${counters.queue_processed}` +
    ` queue_sent=${counters.queue_sent}` +
    ` queue_fail=${counters.queue_failed}` +
    ` db_err=${counters.db_errors}` +
    ` webhook_avg=${webhookAvg}ms`
  );

  for (const key of Object.keys(counters)) counters[key] = 0;
  for (const key of Object.keys(timings)) timings[key] = [];
}
