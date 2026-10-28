import { useEffect, useState } from 'react';

const HELD_RULES = ['judge_escalate', 'judge_held'];

const GUARDRAIL_HEADERS = [
  'X-Guardrail-Action',
  'X-Guardrail-Stage',
  'X-Guardrail-Ticket',
  'X-Guardrail-Judge',
  'X-Guardrail-Request-Id',
  'X-Guardrail-Cache',
  'X-Guardrail-Budget-Remaining-Tokens',
];

let adminLink = {
  ok: false,
  status: null,
  latencyMs: null,
  error: null,
  medianLatencyMs: null,
  checkedAt: null,
};

const listeners = new Set();

function getAdminLink() {
  return { ...adminLink };
}

function publishAdminLink(patch) {
  adminLink = { ...adminLink, ...patch };
  const snap = getAdminLink();
  listeners.forEach((fn) => fn(snap));
}

export function subscribeAdminLink(fn) {
  fn(getAdminLink());
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useAdminLink() {
  const [link, setLink] = useState(getAdminLink);
  useEffect(() => subscribeAdminLink(setLink), []);
  return link;
}

export function formatUsd(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  if (v !== 0 && Math.abs(v) < 0.01) return `$${v.toFixed(4)}`;
  return `$${v.toFixed(2)}`;
}

async function readBody(res) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function requestJson(path, options = {}) {
  const headers = { Accept: 'application/json', ...(options.headers || {}) };
  if (options.body) headers['Content-Type'] = 'application/json';
  let res;
  try {
    res = await fetch(path, { ...options, headers });
  } catch {
    throw new Error('Proxy unreachable');
  }
  const body = await readBody(res);
  if (!res.ok) {
    const err = new Error(`Proxy unreachable (HTTP ${res.status})`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

function mapLedgerRow(row) {
  const hits = Array.isArray(row?.RuleHits) ? row.RuleHits : [];
  const heldHit = hits.find((hit) => HELD_RULES.includes(hit.rule));
  const held = Boolean(heldHit);
  const raw = row?.Action || '';
  let action = 'ALLOW';
  if (held) action = 'REVIEW';
  else if (raw === 'block') action = 'BLOCK';

  let riskLevel = 'LOW';
  if (raw === 'block') riskLevel = 'CRITICAL';
  else if (held) riskLevel = 'HIGH';
  else if (raw === 'redact') riskLevel = 'MEDIUM';

  const maxScore = hits.reduce((max, hit) => Math.max(max, Number(hit.score) || 0), 0);
  const id = row?.RequestID ? String(row.RequestID) : `${row?.TS || ''}|${row?.Key || ''}`;

  let blockReason = '';
  if (heldHit?.sample) blockReason = heldHit.sample;
  else if (raw === 'block') {
    const hit = hits.find((item) => item.sample) || hits[0];
    blockReason = hit?.sample || '';
  }

  return {
    id,
    requestId: id,
    userId: row?.Key || '',
    model: row?.Model || '',
    action,
    rawAction: raw,
    riskLevel,
    riskScore: hits.length ? Math.round(maxScore * 100) : 0,
    tokensIn: row?.InputTokens || 0,
    tokensOut: row?.OutputTokens || 0,
    costUsd: row?.CostUSD || 0,
    violationsSummary: hits.map((hit) => hit.rule).filter(Boolean).join(', '),
    blockReason,
    cacheHit: Boolean(row?.CacheHit),
    savedUsd: row?.SavedUSD || 0,
    timestamp: row?.TS || '',
    trace: Array.isArray(row?.Trace) ? row.Trace : null,
    samples: hits
      .filter((hit) => hit.sample)
      .map((hit) => ({ rule: hit.rule, score: hit.score, sample: hit.sample })),
    ruleHits: hits,
    stage: row?.Stage || '',
    route: row?.Route || '',
    latencyMs: row?.LatencyMS || 0,
  };
}

// The live aggregate counts block, redact, and cache_hit. Pass is the remainder
// of total_requests until the payload includes actions.pass.
export function countActions(stats) {
  const actions = stats?.actions || {};
  const block = actions.block || 0;
  const redact = actions.redact || 0;
  const cacheHit = actions.cache_hit || 0;
  const pass = Object.prototype.hasOwnProperty.call(actions, 'pass')
    ? (actions.pass || 0)
    : Math.max(0, (stats?.total_requests || 0) - block - redact - cacheHit);
  return { pass, redact, block, cacheHit };
}

async function decideHeld(ticket, action, note) {
  let res;
  try {
    res = await fetch(`/admin/held/${encodeURIComponent(ticket)}/${action}`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: note || '' }),
    });
  } catch {
    throw new Error('Proxy unreachable');
  }
  if (res.status === 404) throw new Error('Unknown ticket');
  if (res.status === 409) throw new Error('Already decided');
  const body = await readBody(res);
  if (!res.ok) throw new Error(`Proxy unreachable (HTTP ${res.status})`);
  return body;
}

export const ApiService = {
  async getStats() {
    const start = performance.now();
    try {
      const stats = await requestJson('/admin/stats');
      publishAdminLink({
        ok: true,
        status: 200,
        latencyMs: Math.round(performance.now() - start),
        error: null,
        medianLatencyMs: Number.isFinite(stats?.median_latency_ms) ? stats.median_latency_ms : null,
        checkedAt: Date.now(),
      });
      return stats;
    } catch (err) {
      const status = err.status ?? null;
      const message = status === 404
        ? 'Admin token is wrong (HTTP 404)'
        : (err.message || 'Proxy unreachable');
      publishAdminLink({
        ok: false,
        status,
        latencyMs: Math.round(performance.now() - start),
        error: message,
        medianLatencyMs: null,
        checkedAt: Date.now(),
      });
      err.message = message;
      throw err;
    }
  },

  async getLedger(limit = 100) {
    const data = await requestJson(`/admin/ledger?limit=${encodeURIComponent(limit)}`);
    const rows = Array.isArray(data?.rows) ? data.rows : [];
    return rows.map(mapLedgerRow);
  },

  async getTimeseries(minutes = 1440) {
    const data = await requestJson(`/admin/timeseries?minutes=${encodeURIComponent(minutes)}`);
    const points = Array.isArray(data?.points) ? data.points : [];
    return {
      bucketSec: data?.bucket_sec ?? null,
      points: points.map((point) => {
        const when = new Date((point.t || 0) * 1000);
        const hh = String(when.getHours()).padStart(2, '0');
        const mm = String(when.getMinutes()).padStart(2, '0');
        return {
          time: `${hh}:${mm}`,
          requests: (point.pass || 0) + (point.redact || 0) + (point.block || 0) + (point.cache_hit || 0),
          blocked: point.block || 0,
          cost: point.usd || 0,
        };
      }),
    };
  },

  async getHeld(status) {
    const data = await requestJson(`/admin/held?status=${encodeURIComponent(status)}`);
    return Array.isArray(data?.items) ? data.items : [];
  },

  approveEvent(ticket, note) {
    return decideHeld(ticket, 'approve', note);
  },

  rejectEvent(ticket, note) {
    return decideHeld(ticket, 'reject', note);
  },

  async simulate(text) {
    return requestJson('/admin/simulate', {
      method: 'POST',
      body: JSON.stringify({ text }),
    });
  },

  async sendChat(employee, content) {
    let res;
    try {
      res = await fetch('/v1/chat/completions', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${employee}`,
        },
        body: JSON.stringify({
          model: 'aipro-chat',
          max_tokens: 200,
          messages: [{ role: 'user', content }],
        }),
      });
    } catch {
      throw new Error('Proxy unreachable');
    }
    const headers = {};
    GUARDRAIL_HEADERS.forEach((name) => {
      headers[name] = res.headers.get(name);
    });
    const body = await readBody(res);
    let message = '';
    if (body?.error && typeof body.error.message === 'string') {
      message = body.error.message;
    } else if (typeof body?.choices?.[0]?.message?.content === 'string') {
      message = body.choices[0].message.content;
    } else if (typeof body?.raw === 'string') {
      message = body.raw;
    }
    return { status: res.status, ok: res.ok, headers, message };
  },
};
