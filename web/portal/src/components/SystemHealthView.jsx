import { useCallback, useEffect, useState } from 'react';
import { ApiService } from '../services/api';
import ErrorBanner from './ErrorBanner';

async function probeDataPlane() {
  const start = performance.now();
  try {
    const res = await fetch('/healthz', { cache: 'no-store' });
    const latencyMs = Math.round(performance.now() - start);
    if (!res.ok) {
      return { ok: false, latencyMs, detail: `Proxy unreachable (HTTP ${res.status})` };
    }
    return { ok: true, latencyMs, detail: 'OK' };
  } catch {
    return { ok: false, latencyMs: Math.round(performance.now() - start), detail: 'Proxy unreachable' };
  }
}

async function probeAdmin() {
  const start = performance.now();
  try {
    const stats = await ApiService.getStats();
    const median = Number.isFinite(stats?.median_latency_ms) ? `${stats.median_latency_ms} ms median` : 'no median';
    return { ok: true, latencyMs: Math.round(performance.now() - start), detail: `OK · ${median}` };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Math.round(performance.now() - start),
      detail: err?.message || 'Proxy unreachable',
    };
  }
}

function HealthRow({ name, probe, result }) {
  return (
    <tr style={{ borderTop: '1px solid var(--border-subtle)' }}>
      <td style={{ padding: '14px 16px', fontWeight: 700 }}>{name}</td>
      <td style={{ padding: '14px 16px', fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>{probe}</td>
      <td style={{ padding: '14px 16px' }}>
        {result ? (
          <span className={`badge ${result.ok ? 'badge-low' : 'badge-critical'}`}>{result.ok ? 'UP' : 'DOWN'}</span>
        ) : (
          <span style={{ color: 'var(--text-dim)' }}>Checking…</span>
        )}
      </td>
      <td style={{ padding: '14px 16px' }}>{result ? `${result.latencyMs} ms` : '—'}</td>
      <td style={{ padding: '14px 16px', color: result && !result.ok ? '#fb7185' : 'var(--text-muted)' }}>
        {result ? result.detail : '—'}
      </td>
    </tr>
  );
}

export default function SystemHealthView() {
  const [dataPlane, setDataPlane] = useState(null);
  const [adminPlane, setAdminPlane] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const probe = useCallback(async () => {
    setRefreshing(true);
    const [data, admin] = await Promise.all([probeDataPlane(), probeAdmin()]);
    setDataPlane(data);
    setAdminPlane(admin);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    probe();
  }, [probe]);

  const banner = [dataPlane, adminPlane]
    .filter((row) => row && !row.ok)
    .map((row) => row.detail);
  const bannerText = [...new Set(banner)].join(' · ');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0 }}>System Health</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '4px 0 0 0' }}>
            Data plane and admin plane. A 404 on admin stats means the token is wrong.
          </p>
        </div>
        <button id="btn-probe-refresh" onClick={probe} disabled={refreshing} className="btn btn-primary" style={{ fontSize: '0.8rem' }}>
          {refreshing ? 'Probing…' : 'Probe again'}
        </button>
      </div>

      <ErrorBanner message={bannerText} />

      <div className="glass-card" style={{ overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.84rem' }}>
          <thead>
            <tr style={{ color: 'var(--text-dim)' }}>
              <th style={{ padding: '12px 16px' }}>Plane</th>
              <th style={{ padding: '12px 16px' }}>Probe</th>
              <th style={{ padding: '12px 16px' }}>Status</th>
              <th style={{ padding: '12px 16px' }}>Latency</th>
              <th style={{ padding: '12px 16px' }}>Detail</th>
            </tr>
          </thead>
          <tbody>
            <HealthRow name="Data plane" probe="GET /healthz" result={dataPlane} />
            <HealthRow name="Admin plane" probe="GET /admin/stats" result={adminPlane} />
          </tbody>
        </table>
      </div>
    </div>
  );
}
