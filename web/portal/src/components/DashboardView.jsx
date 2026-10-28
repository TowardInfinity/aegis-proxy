import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from 'recharts';
import { ApiService, countActions, formatUsd } from '../services/api';
import ErrorBanner from './ErrorBanner';

const RISK_COLORS = {
  CRITICAL: '#DC2626',
  HIGH: '#EA580C',
  MEDIUM: '#D4760A',
  LOW: '#16A34A'
};

const ACTION_COLORS = {
  ALLOW: '#16A34A',
  REVIEW: '#D97706',
  BLOCK: '#DC2626'
};

function aggregateModels(events) {
  const map = new Map();
  events.forEach((event) => {
    const name = event.model || '(none)';
    const cur = map.get(name) || { model: name, requests: 0, totalTokens: 0, totalCost: 0 };
    cur.requests += 1;
    cur.totalTokens += (event.tokensIn || 0) + (event.tokensOut || 0);
    cur.totalCost += Number(event.costUsd) || 0;
    map.set(name, cur);
  });
  return [...map.values()].sort((a, b) => b.requests - a.requests);
}

function aggregateRules(events) {
  const map = new Map();
  events.forEach((event) => {
    (event.ruleHits || []).forEach((hit) => {
      if (!hit.rule) return;
      map.set(hit.rule, (map.get(hit.rule) || 0) + 1);
    });
  });
  return [...map.entries()]
    .map(([rule, count]) => ({ rule, count }))
    .sort((a, b) => b.count - a.count);
}

function failureMessage(result) {
  if (!result || result.status === 'fulfilled') return null;
  return result.reason?.message || 'Proxy unreachable';
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload || !payload.length) return null;
  return (
    <div style={{
      background: 'rgba(15, 23, 42, 0.95)',
      border: '1px solid rgba(255, 255, 255, 0.15)',
      padding: '10px 14px',
      borderRadius: '8px',
      boxShadow: '0 8px 24px rgba(0, 0, 0, 0.6)',
      backdropFilter: 'blur(8px)',
      fontSize: '0.78rem'
    }}>
      <div style={{ fontWeight: 700, color: '#f8fafc', marginBottom: '6px' }}>{label}</div>
      {payload.map((entry, index) => (
        <div key={`item-${index}`} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '3px' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: entry.color || entry.fill }}></span>
          <span style={{ color: '#94a3b8' }}>{entry.name}:</span>
          <strong style={{ color: '#f8fafc' }}>
            {typeof entry.value === 'number' && String(entry.name || '').toLowerCase().includes('cost')
              ? formatUsd(entry.value)
              : Number(entry.value || 0).toLocaleString()}
          </strong>
        </div>
      ))}
    </div>
  );
};

export default function DashboardView({ onNavigateToPlayground, onSelectEvent }) {
  const alive = useRef(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [stats, setStats] = useState(null);
  const [pendingCount, setPendingCount] = useState(null);
  const [ledger, setLedger] = useState(null);
  const [hourlyTrends, setHourlyTrends] = useState(null);

  // StrictMode mounts, unmounts and remounts in dev, so set the flag on every mount.
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  const fetchDashboardData = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    const [statsR, heldR, seriesR, ledgerR] = await Promise.allSettled([
      ApiService.getStats(),
      ApiService.getHeld('pending'),
      ApiService.getTimeseries(1440),
      ApiService.getLedger(500),
    ]);
    if (!alive.current) return;

    const messages = [statsR, heldR, seriesR, ledgerR].map(failureMessage).filter(Boolean);
    setError(messages.length ? [...new Set(messages)].join(' · ') : null);
    if (statsR.status === 'fulfilled') setStats(statsR.value);
    if (heldR.status === 'fulfilled') setPendingCount(heldR.value.length);
    if (seriesR.status === 'fulfilled') setHourlyTrends(seriesR.value.points);
    if (ledgerR.status === 'fulfilled') setLedger(ledgerR.value);
    if (messages.length === 0) setLastUpdated(new Date());
    setLoading(false);
    if (isManualRefresh) setRefreshing(false);
  }, []);

  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(() => fetchDashboardData(), 5000);
    return () => clearInterval(interval);
  }, [fetchDashboardData]);

  const counts = stats ? countActions(stats) : null;
  const reviewCount = ledger ? ledger.filter((event) => event.action === 'REVIEW').length : null;
  const total = stats ? stats.total_requests || 0 : null;
  const blocked = counts ? counts.block : null;
  const blockedRate = total > 0 && blocked != null ? ((blocked / total) * 100).toFixed(1) : null;
  const allow = counts ? counts.pass + counts.redact + counts.cacheHit : null;

  const riskChartData = counts ? [
    { name: 'Critical', key: 'CRITICAL', value: counts.block, color: RISK_COLORS.CRITICAL },
    ...(reviewCount == null ? [] : [{ name: 'High', key: 'HIGH', value: reviewCount, color: RISK_COLORS.HIGH }]),
    { name: 'Medium', key: 'MEDIUM', value: counts.redact, color: RISK_COLORS.MEDIUM },
    { name: 'Low', key: 'LOW', value: counts.pass + counts.cacheHit, color: RISK_COLORS.LOW }
  ] : [];
  const totalRiskEvents = riskChartData.reduce((sum, item) => sum + item.value, 0) || 1;

  const actionChartData = [
    allow != null ? { name: 'ALLOW', value: allow, color: ACTION_COLORS.ALLOW, desc: 'Pass, redact, and cache hits' } : null,
    reviewCount != null ? { name: 'REVIEW', value: reviewCount, color: ACTION_COLORS.REVIEW, desc: 'Held rows in the latest 500' } : null,
    blocked != null ? { name: 'BLOCK', value: blocked, color: ACTION_COLORS.BLOCK, desc: 'Blocked at the proxy' } : null,
  ].filter(Boolean);

  const modelUsage = ledger ? aggregateModels(ledger) : [];
  const categories = ledger ? aggregateRules(ledger) : [];
  const criticalAlerts = ledger
    ? ledger.filter((event) => event.riskLevel === 'CRITICAL' || event.riskLevel === 'HIGH').slice(0, 5)
    : [];
  const hitRate = stats && Number.isFinite(stats.cache_hit_rate)
    ? `${(stats.cache_hit_rate * 100).toFixed(1)}% cache hit rate`
    : '—';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '1440px', margin: '0 auto' }}>
      <ErrorBanner message={error} />

      <div className="glass-card" style={{
        padding: '22px 28px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '16px',
        background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95) 0%, rgba(30, 41, 59, 0.5) 100%)',
        border: '1px solid var(--border-subtle)'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
            <span className="badge badge-cyan">DASHBOARD</span>
            <span className="badge badge-cyan">24H</span>
          </div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0, letterSpacing: '-0.02em' }}>
            NextGen Guardians traffic, blocks, and spend
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginTop: '4px', margin: 0 }}>
            Live totals from the admin plane. The chart is the last 24 hours.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={() => fetchDashboardData(true)}
            disabled={refreshing}
            className="btn btn-secondary"
            style={{ fontSize: '0.78rem', padding: '6px 14px' }}
          >
            {refreshing ? 'Syncing...' : 'Refresh'}
          </button>
          {onNavigateToPlayground && (
            <button
              onClick={onNavigateToPlayground}
              className="btn btn-primary"
              style={{ fontSize: '0.78rem', padding: '6px 14px' }}
            >
              Open playground
            </button>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '18px' }}>
        <div className="glass-card" style={{ padding: '20px' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>TOTAL REQUESTS</span>
          <div style={{ fontSize: '1.95rem', fontWeight: 800, marginTop: '10px' }}>
            {loading && total == null ? '…' : total == null ? '—' : total.toLocaleString()}
          </div>
          <div style={{ fontSize: '0.72rem', marginTop: '6px', color: 'var(--text-dim)' }}>{stats ? hitRate : '—'}</div>
        </div>
        <div className="glass-card" style={{ padding: '20px' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>BLOCKED</span>
          <div style={{ fontSize: '1.95rem', fontWeight: 800, marginTop: '10px', color: 'var(--accent-rose)' }}>
            {blocked == null ? '—' : blocked.toLocaleString()}
            {blockedRate != null && (
              <span style={{ fontSize: '0.85rem', color: 'var(--text-dim)', fontWeight: 500 }}> ({blockedRate}%)</span>
            )}
          </div>
          <div style={{ fontSize: '0.72rem', marginTop: '6px', color: 'var(--text-dim)' }}>actions.block</div>
        </div>
        <div className="glass-card" style={{ padding: '20px' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>PENDING APPROVALS</span>
          <div style={{ fontSize: '1.95rem', fontWeight: 800, marginTop: '10px', color: 'var(--accent-amber)' }}>
            {pendingCount == null ? '—' : pendingCount}
          </div>
          <div style={{ fontSize: '0.72rem', marginTop: '6px', color: 'var(--text-dim)' }}>Held tickets still pending</div>
        </div>
        <div className="glass-card" style={{ padding: '20px' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>SPEND</span>
          <div style={{ fontSize: '1.95rem', fontWeight: 800, marginTop: '10px' }}>
            {stats ? formatUsd(stats.usd_spent) : '—'}
          </div>
          <div style={{ fontSize: '0.72rem', marginTop: '6px', color: 'var(--accent-cyan)', fontWeight: 600 }}>
            Cache saved {stats ? formatUsd(stats.usd_saved) : '—'}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px' }}>
        <div className="glass-card" style={{ padding: '22px' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>24-hour traffic</h2>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', margin: '2px 0 16px 0' }}>
            Requests are pass, redact, block, and cache hits. Cost is bucket spend.
          </p>
          <div style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={hourlyTrends || []} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorRequests" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#D4760A" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#D4760A" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="colorBlocked" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#DC2626" stopOpacity={0.6} />
                    <stop offset="95%" stopColor="#DC2626" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(232, 213, 181, 0.4)" />
                <XAxis dataKey="time" stroke="#7C5D43" fontSize={11} tickLine={false} minTickGap={48} />
                <YAxis yAxisId="count" stroke="#7C5D43" fontSize={11} tickLine={false} />
                <YAxis yAxisId="cost" orientation="right" stroke="#8b5cf6" fontSize={11} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Legend verticalAlign="top" align="right" wrapperStyle={{ fontSize: '0.75rem', paddingBottom: '10px' }} />
                <Area yAxisId="count" type="monotone" dataKey="requests" name="Requests" stroke="#D4760A" strokeWidth={2} fillOpacity={1} fill="url(#colorRequests)" />
                <Area yAxisId="count" type="monotone" dataKey="blocked" name="Blocked" stroke="#f43f5e" strokeWidth={2} fillOpacity={1} fill="url(#colorBlocked)" />
                <Line yAxisId="cost" type="monotone" dataKey="cost" name="Cost USD" stroke="#8b5cf6" dot={false} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glass-card" style={{ padding: '22px' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>Events by risk level</h2>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', margin: '2px 0 12px 0' }}>
            Critical is block, high is held rows, medium is redact, low is the rest.
          </p>
          <div style={{ width: '100%', height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={riskChartData} cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={5} dataKey="value">
                  {riskChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} stroke="transparent" />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '10px' }}>
            {riskChartData.map((item) => {
              const pct = ((item.value / totalRiskEvents) * 100).toFixed(1);
              return (
                <div key={item.key} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: item.color }}></span>
                  <div>
                    <div style={{ fontWeight: 600 }}>{item.name}</div>
                    <div style={{ color: 'var(--text-dim)', fontSize: '0.68rem' }}>{item.value.toLocaleString()} ({pct}%)</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        <div className="glass-card" style={{ padding: '22px' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>Events by action</h2>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', margin: '2px 0 16px 0' }}>
            ALLOW is pass plus redact plus cache hits. REVIEW is held rows in the latest 500.
          </p>
          <div style={{ width: '100%', height: 210 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={actionChartData} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
                <XAxis type="number" stroke="#64748b" fontSize={11} tickLine={false} />
                <YAxis dataKey="name" type="category" stroke="#94a3b8" fontSize={12} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="value" name="Events" radius={[0, 6, 6, 0]}>
                  {actionChartData.map((entry, index) => (
                    <Cell key={`bar-cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glass-card" style={{ padding: '22px' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>Model usage</h2>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', margin: '2px 0 16px 0' }}>
            Latest 500 ledger rows, grouped by model.
          </p>
          {modelUsage.length === 0 ? (
            <div style={{ color: 'var(--text-dim)', fontSize: '0.82rem' }}>No ledger rows.</div>
          ) : (
            <>
              <div style={{ width: '100%', height: 210 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={modelUsage} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="model" stroke="#64748b" fontSize={11} tickLine={false} />
                    <YAxis yAxisId="left" stroke="#64748b" fontSize={11} tickLine={false} />
                    <YAxis yAxisId="right" orientation="right" stroke="#8b5cf6" fontSize={11} tickLine={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{ fontSize: '0.75rem', paddingTop: '8px' }} />
                    <Bar yAxisId="left" dataKey="requests" name="Requests" fill="#D4760A" radius={[4, 4, 0, 0]} />
                    <Bar yAxisId="right" dataKey="totalCost" name="Cost USD" fill="#EA580C" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
                {modelUsage.map((model) => (
                  <div key={model.model} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', fontSize: '0.8rem' }}>
                    <strong>{model.model}</strong>
                    <span style={{ color: 'var(--text-muted)' }}>
                      {model.requests.toLocaleString()} requests · {model.totalTokens.toLocaleString()} tokens · {formatUsd(model.totalCost)}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="glass-card" style={{ padding: '22px' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>Rule categories</h2>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', margin: '2px 0 16px 0' }}>
          Rule hits counted across the same 500 ledger rows.
        </p>
        {categories.length === 0 ? (
          <div style={{ color: 'var(--text-dim)', fontSize: '0.82rem' }}>No rule hits in the latest 500 ledger rows.</div>
        ) : (
          <div style={{ width: '100%', height: Math.max(180, categories.length * 36) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categories} layout="vertical" margin={{ top: 5, right: 24, left: 24, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
                <XAxis type="number" stroke="#64748b" fontSize={11} tickLine={false} allowDecimals={false} />
                <YAxis dataKey="rule" type="category" stroke="#94a3b8" fontSize={11} width={160} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" name="Hits" fill="#D4760A" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="glass-card" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>High and critical rows</h2>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
            {lastUpdated ? `Last sync: ${lastUpdated.toLocaleTimeString()}` : 'Waiting for the admin plane'}
          </span>
        </div>
        {ledger == null ? (
          <div style={{ color: 'var(--text-dim)', fontSize: '0.82rem' }}>Ledger not loaded.</div>
        ) : criticalAlerts.length === 0 ? (
          <div style={{ color: 'var(--text-dim)', fontSize: '0.82rem' }}>No high or critical rows in the latest 500.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {criticalAlerts.map((event, index) => (
              <div
                key={`${event.id}-${index}`}
                onClick={() => onSelectEvent && onSelectEvent(event)}
                className="glass-card glass-card-interactive"
                style={{ padding: '14px 18px', display: 'flex', justifyContent: 'space-between', gap: '12px', cursor: 'pointer' }}
              >
                <div>
                  <span className={`badge ${event.riskLevel === 'CRITICAL' ? 'badge-critical' : 'badge-high'}`}>{event.riskLevel}</span>
                  <div style={{ fontSize: '0.86rem', fontWeight: 600, marginTop: '6px' }}>
                    {event.violationsSummary || event.blockReason || 'Rule hit'}
                  </div>
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-dim)', marginTop: '2px' }}>
                    Employee: {event.userId || '—'} · Model: {event.model || '—'} · {event.requestId}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 700, color: event.action === 'BLOCK' ? 'var(--accent-rose)' : 'var(--accent-amber)' }}>{event.action}</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>Score: {event.riskScore}/100</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
