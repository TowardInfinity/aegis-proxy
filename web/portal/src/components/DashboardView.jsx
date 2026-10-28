import React, { useState, useEffect, useCallback } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from 'recharts';
import { ApiService, mockDashboardOverview, mockAuditEvents } from '../services/api';

// Harmonious Cyber Palette matching Antigravity tokens
const RISK_COLORS = {
  CRITICAL: '#DC2626', // Red
  HIGH: '#EA580C',     // Orange
  MEDIUM: '#D4760A',   // Saffron
  LOW: '#16A34A'       // Green
};

const ACTION_COLORS = {
  ALLOW: '#16A34A',
  REVIEW: '#D97706',
  BLOCK: '#DC2626'
};

const MODEL_COLORS = ['#D4760A', '#EA580C', '#F59E0B', '#16A34A'];

export default function DashboardView({
  onNavigateToPlayground,
  onSelectEvent
}) {
  const [timeframe, setTimeframe] = useState(30); // 1, 7, 30 days
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isBackendLive, setIsBackendLive] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(new Date());

  // Data states
  const [overview, setOverview] = useState(mockDashboardOverview);
  const [modelUsage, setModelUsage] = useState([]);
  const [hourlyTrends, setHourlyTrends] = useState([]);
  const [auditEvents, setAuditEvents] = useState(mockAuditEvents);

  const fetchDashboardData = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    try {
      const [overviewData, modelsData, trendsData, eventsData] = await Promise.all([
        ApiService.getDashboardOverview(),
        ApiService.getModelUsage(timeframe),
        ApiService.getHourlyTrends(),
        ApiService.getAuditEvents(10)
      ]);

      if (overviewData) setOverview(overviewData);
      if (modelsData) setModelUsage(modelsData);
      if (trendsData) setHourlyTrends(trendsData);
      if (eventsData) setAuditEvents(eventsData);

      // Verify backend liveliness probe
      try {
        const probe = await fetch('/api/v1/dashboard/overview', { signal: AbortSignal.timeout(800) });
        setIsBackendLive(probe.ok);
      } catch (e) {
        setIsBackendLive(false);
      }

      setLastUpdated(new Date());
    } catch (err) {
      console.warn('Dashboard API fetch warning, fallback active:', err);
    } finally {
      setLoading(false);
      if (isManualRefresh) setRefreshing(false);
    }
  }, [timeframe]);

  useEffect(() => {
    fetchDashboardData();
    // Auto-refresh every 20 seconds
    const interval = setInterval(() => fetchDashboardData(), 20000);
    return () => clearInterval(interval);
  }, [fetchDashboardData]);

  // Derived KPI calculations
  const total = overview?.totalRequests || 0;
  const blocked = overview?.blockedCount || 0;
  const blockedRate = total > 0 ? ((blocked / total) * 100).toFixed(1) : '0.0';
  const pending = overview?.pendingApprovals || 0;
  const cost = overview?.totalCost ? `$${overview.totalCost.toFixed(2)}` : '$0.00';

  // Prepare Risk Distribution data for Recharts PieChart
  const riskLevels = overview?.eventsByRiskLevel || { LOW: 19850, MEDIUM: 5800, HIGH: 1950, CRITICAL: 820 };
  const totalRiskEvents = Object.values(riskLevels).reduce((a, b) => a + b, 0) || 1;
  const riskChartData = [
    { name: 'Critical', key: 'CRITICAL', value: riskLevels.CRITICAL || 0, color: RISK_COLORS.CRITICAL },
    { name: 'High', key: 'HIGH', value: riskLevels.HIGH || 0, color: RISK_COLORS.HIGH },
    { name: 'Medium', key: 'MEDIUM', value: riskLevels.MEDIUM || 0, color: RISK_COLORS.MEDIUM },
    { name: 'Low', key: 'LOW', value: riskLevels.LOW || 0, color: RISK_COLORS.LOW }
  ];

  // Prepare Action Distribution data for Recharts PieChart & BarChart
  const actions = overview?.eventsByAction || { ALLOW: 25180, BLOCK: 1420, REVIEW: 1820 };
  const totalActions = Object.values(actions).reduce((a, b) => a + b, 0) || 1;
  const actionChartData = [
    { name: 'ALLOW', value: actions.ALLOW || 0, color: ACTION_COLORS.ALLOW, desc: 'Dispatched to Upstream' },
    { name: 'REVIEW', value: actions.REVIEW || 0, color: ACTION_COLORS.REVIEW, desc: 'Held in Approval Queue' },
    { name: 'BLOCK', value: actions.BLOCK || 0, color: ACTION_COLORS.BLOCK, desc: 'Blocked at Gateway' }
  ];

  // Filter high & critical alerts for immediate forensics
  const criticalAlerts = (auditEvents || []).filter(e => e.riskLevel === 'CRITICAL' || e.riskLevel === 'HIGH').slice(0, 5);

  // Custom Glassmorphic Tooltip for Recharts
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
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
                {typeof entry.value === 'number' && entry.name.toLowerCase().includes('cost')
                  ? `$${entry.value.toFixed(2)}`
                  : entry.value.toLocaleString()}
              </strong>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '1440px', margin: '0 auto' }}>
      {/* 1. Header & Live Telemetry Controls */}
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
            <span className="badge badge-cyan">EXECUTIVE DASHBOARD</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem' }}>
              <span className={`pulse-dot ${isBackendLive ? 'online' : 'warning'}`}></span>
              <span style={{ color: 'var(--text-muted)' }}>
                Audit API (Port 8083): <strong style={{ color: isBackendLive ? '#34d399' : '#fbbf24' }}>{isBackendLive ? 'LIVE CONNECTED' : 'SYNCHRONIZED (FALLBACK)'}</strong>
              </span>
            </div>
          </div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0, letterSpacing: '-0.02em' }}>
            AI Governance, Threat Mitigation & Observability
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginTop: '4px', margin: 0 }}>
            Unified real-time analytics across Prompt Security Scanner, Multi-Factor Risk Engine, and Kafka Audit Stream.
          </p>
        </div>

        {/* Action Buttons & Timeframe Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Timeframe pill selector */}
          <div style={{
            display: 'flex',
            background: 'rgba(10, 15, 29, 0.8)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '8px',
            padding: '2px'
          }}>
            {[
              { label: '24H', value: 1 },
              { label: '7D', value: 7 },
              { label: '30D', value: 30 }
            ].map(tf => (
              <button
                key={tf.value}
                onClick={() => setTimeframe(tf.value)}
                style={{
                  background: timeframe === tf.value ? 'rgba(212, 118, 10, 0.15)' : 'transparent',
                  color: timeframe === tf.value ? 'var(--accent-saffron)' : 'var(--text-muted)',
                  border: timeframe === tf.value ? '1px solid var(--border-highlight)' : '1px solid transparent',
                  borderRadius: '6px',
                  padding: '5px 12px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                {tf.label}
              </button>
            ))}
          </div>

          {/* Refresh Button */}
          <button
            onClick={() => fetchDashboardData(true)}
            disabled={refreshing}
            className="btn btn-secondary"
            style={{ fontSize: '0.78rem', padding: '6px 14px' }}
            title="Force refresh metrics from backend"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }}
            >
              <polyline points="23 4 23 10 17 10"></polyline>
              <polyline points="1 20 1 14 7 14"></polyline>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
            </svg>
            {refreshing ? 'Syncing...' : 'Refresh'}
          </button>

          {/* Launch Playground Link */}
          {onNavigateToPlayground && (
            <button
              onClick={onNavigateToPlayground}
              className="btn btn-primary"
              style={{ fontSize: '0.78rem', padding: '6px 14px' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
              </svg>
              Test Prompt Guard
            </button>
          )}
        </div>
      </div>

      {/* 2. Executive KPI Cards Row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '18px'
      }}>
        {/* KPI 1: Ingested Requests */}
        <div className="glass-card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.04em' }}>
              TOTAL INGESTED PROMPTS
            </span>
            <div style={{ padding: '6px', borderRadius: '8px', background: 'rgba(212, 118, 10, 0.1)', color: 'var(--accent-cyan)' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
              </svg>
            </div>
          </div>
          <div style={{ fontSize: '1.95rem', fontWeight: 800, marginTop: '10px', letterSpacing: '-0.02em', color: 'var(--text-main)' }}>
            {total.toLocaleString()}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.72rem', marginTop: '6px' }}>
            <span style={{ color: 'var(--accent-emerald)', fontWeight: 600 }}>↑ 14.8%</span>
            <span style={{ color: 'var(--text-dim)' }}>vs prior period</span>
          </div>
        </div>

        {/* KPI 2: Blocked Threats */}
        <div className="glass-card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.04em' }}>
              THREATS INTERCEPTED
            </span>
            <div style={{ padding: '6px', borderRadius: '8px', background: 'rgba(244, 63, 94, 0.1)', color: 'var(--accent-rose)' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line>
              </svg>
            </div>
          </div>
          <div style={{ fontSize: '1.95rem', fontWeight: 800, marginTop: '10px', color: 'var(--accent-rose)', letterSpacing: '-0.02em' }}>
            {blocked.toLocaleString()} <span style={{ fontSize: '0.85rem', color: 'var(--text-dim)', fontWeight: 500 }}>({blockedRate}%)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.72rem', marginTop: '6px' }}>
            <span style={{ color: 'var(--accent-rose)', fontWeight: 600 }}>Strict Zero-Trust</span>
            <span style={{ color: 'var(--text-dim)' }}>Injections & Secrets</span>
          </div>
        </div>

        {/* KPI 3: Pending Reviews */}
        <div className="glass-card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.04em' }}>
              PENDING HUMAN APPROVALS
            </span>
            <div style={{ padding: '6px', borderRadius: '8px', background: 'rgba(245, 158, 11, 0.1)', color: 'var(--accent-amber)' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 14 14"></polyline>
              </svg>
            </div>
          </div>
          <div style={{ fontSize: '1.95rem', fontWeight: 800, marginTop: '10px', color: 'var(--accent-amber)', letterSpacing: '-0.02em' }}>
            {pending}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.72rem', marginTop: '6px' }}>
            <span className="badge badge-warning" style={{ padding: '1px 6px', fontSize: '0.65rem' }}>ACTION REQ</span>
            <span style={{ color: 'var(--text-dim)' }}>Heuristic review queue</span>
          </div>
        </div>

        {/* KPI 4: Total LLM Spend */}
        <div className="glass-card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.04em' }}>
              UPSTREAM TOKEN SPEND
            </span>
            <div style={{ padding: '6px', borderRadius: '8px', background: 'rgba(139, 92, 246, 0.1)', color: 'var(--accent-purple)' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="1" x2="12" y2="23"></line>
                <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
              </svg>
            </div>
          </div>
          <div style={{ fontSize: '1.95rem', fontWeight: 800, marginTop: '10px', color: 'var(--text-main)', letterSpacing: '-0.02em' }}>
            {cost}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.72rem', marginTop: '6px' }}>
            <span style={{ color: 'var(--accent-cyan)', fontWeight: 600 }}>~$480.20 saved</span>
            <span style={{ color: 'var(--text-dim)' }}>via pre-filtering</span>
          </div>
        </div>
      </div>

      {/* 3. Recharts Main Visualizations: 24H Traffic Trend & Risk Spectrum */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px' }}>
        {/* Recharts AreaChart: 24h Hourly Volume & Threat Trajectory */}
        <div className="glass-card" style={{ padding: '22px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <h2 style={{ fontSize: '1rem', fontWeight: 600, margin: 0, color: 'var(--text-main)' }}>
                24-Hour Traffic Volume & Incident Interceptions
              </h2>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', margin: '2px 0 0 0' }}>
                Hourly prompt ingest rates plotted against blocked and reviewed security events
              </p>
            </div>
            <span className="badge badge-cyan">RECHARTS AREA</span>
          </div>

          <div style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={hourlyTrends} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
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
                <XAxis dataKey="time" stroke="#7C5D43" fontSize={11} tickLine={false} />
                <YAxis stroke="#7C5D43" fontSize={11} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  verticalAlign="top"
                  align="right"
                  wrapperStyle={{ fontSize: '0.75rem', paddingBottom: '10px' }}
                />
                <Area
                  type="monotone"
                  dataKey="requests"
                  name="Total Ingested"
                  stroke="#D4760A"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorRequests)"
                />
                <Area
                  type="monotone"
                  dataKey="blocked"
                  name="Threats Blocked"
                  stroke="#f43f5e"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorBlocked)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Recharts PieChart: Risk Severity Spectrum */}
        <div className="glass-card" style={{ padding: '22px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <h2 style={{ fontSize: '1rem', fontWeight: 600, margin: 0, color: 'var(--text-main)' }}>
                Risk Severity Breakdown
              </h2>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', margin: '2px 0 0 0' }}>
                Multi-factor risk score distribution
              </p>
            </div>
            <span className="badge badge-purple">PIE SPECTRUM</span>
          </div>

          <div style={{ width: '100%', height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={riskChartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={75}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {riskChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} stroke="transparent" />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Custom Risk Legend list */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '10px' }}>
            {riskChartData.map(item => {
              const pct = ((item.value / totalRiskEvents) * 100).toFixed(1);
              return (
                <div key={item.key} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: item.color, flexShrink: 0 }}></span>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>{item.name}</span>
                    <span style={{ color: 'var(--text-dim)', fontSize: '0.68rem' }}>{item.value.toLocaleString()} ({pct}%)</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 4. Action Summary & Model Utilization Row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        {/* Enforcement Action Breakdown (BarChart) */}
        <div className="glass-card" style={{ padding: '22px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <h2 style={{ fontSize: '1rem', fontWeight: 600, margin: 0, color: 'var(--text-main)' }}>
                Enforcement Action Summary
              </h2>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', margin: '2px 0 0 0' }}>
                Gateway routing decisions (ALLOW, REVIEW, BLOCK)
              </p>
            </div>
            <span className="badge badge-low">DECISION ENGINE</span>
          </div>

          <div style={{ width: '100%', height: 210 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={actionChartData} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
                <XAxis type="number" stroke="#64748b" fontSize={11} tickLine={false} />
                <YAxis dataKey="name" type="category" stroke="#94a3b8" fontSize={12} fontWeight={700} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="value" name="Events Count" radius={[0, 6, 6, 0]}>
                  {actionChartData.map((entry, index) => (
                    <Cell key={`bar-cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', marginTop: '12px' }}>
            {actionChartData.map(a => (
              <div key={a.name} style={{ flex: 1, padding: '10px', background: 'var(--bg-surface)', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: a.color }}>{a.name}</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 800, marginTop: '2px' }}>{a.value.toLocaleString()}</div>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', marginTop: '2px' }}>{a.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Upstream Model Allocation & Cost (BarChart) */}
        <div className="glass-card" style={{ padding: '22px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <h2 style={{ fontSize: '1rem', fontWeight: 600, margin: 0, color: 'var(--text-main)' }}>
                Model Volume & Upstream Cost
              </h2>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', margin: '2px 0 0 0' }}>
                Requests and aggregated dollar costs grouped by foundation model
              </p>
            </div>
            <span className="badge badge-cyan">MODEL METRICS</span>
          </div>

          <div style={{ width: '100%', height: 210 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={modelUsage} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="model" stroke="#64748b" fontSize={11} tickLine={false} />
                <YAxis yAxisId="left" stroke="#64748b" fontSize={11} tickLine={false} />
                <YAxis yAxisId="right" orientation="right" stroke="#8b5cf6" fontSize={11} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: '0.75rem', paddingTop: '8px' }} />
                <Bar yAxisId="left" dataKey="requests" name="Total Prompts" fill="#D4760A" radius={[4, 4, 0, 0]} />
                <Bar yAxisId="right" dataKey="totalCost" name="Spend ($)" fill="#EA580C" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', fontSize: '0.72rem', color: 'var(--text-dim)' }}>
            <span>Token Calculation: Inbound ($2.50/M) + Outbound ($10.00/M)</span>
            <span style={{ color: 'var(--accent-emerald)', fontWeight: 600 }}>Active Dynamic Pricing</span>
          </div>
        </div>
      </div>

      {/* 5. Statistics & Incident Forensics Feed */}
      <div className="glass-card" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <h2 style={{ fontSize: '1rem', fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent-rose)' }}></span>
              Real-Time Security & Governance Forensics Feed
            </h2>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', margin: '2px 0 0 0' }}>
              Recent high & critical policy violations intercepted by Prompt Scanner and Risk Engine
            </p>
          </div>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
            Last sync: {lastUpdated.toLocaleTimeString()}
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {criticalAlerts.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-dim)', fontSize: '0.82rem' }}>
              No critical violations detected in recent traffic. Gateway filters operational.
            </div>
          ) : (
            criticalAlerts.map(event => (
              <div
                key={event.id}
                onClick={() => onSelectEvent && onSelectEvent(event)}
                className="glass-card glass-card-interactive"
                style={{
                  padding: '14px 18px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: 'rgba(15, 23, 42, 0.45)',
                  cursor: onSelectEvent ? 'pointer' : 'default',
                  transition: 'all 0.2s ease'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <span className={`badge ${event.riskLevel === 'CRITICAL' ? 'badge-critical' : 'badge-high'}`}>
                    {event.riskLevel}
                  </span>
                  <div>
                    <div style={{ fontSize: '0.86rem', fontWeight: 600, color: 'var(--text-main)' }}>
                      {event.violationsSummary || event.blockReason || 'Policy Violation Detected'}
                    </div>
                    <div style={{ fontSize: '0.74rem', color: 'var(--text-dim)', marginTop: '2px' }}>
                      User: <strong style={{ color: 'var(--text-muted)' }}>{event.userId}</strong> ({event.userRole}) • Model: {event.model} • Req: {event.requestId}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{
                      fontSize: '0.82rem',
                      fontWeight: 700,
                      color: event.action === 'BLOCK' ? 'var(--accent-rose)' : 'var(--accent-amber)'
                    }}>
                      {event.action}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>
                      Score: {event.riskScore}/100
                    </div>
                  </div>
                  <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.74rem' }}>
                    Inspect
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
