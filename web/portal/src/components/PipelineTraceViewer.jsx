function outcomeBadge(outcome) {
  const value = String(outcome || '').toLowerCase();
  if (value === 'block' || value === 'error' || value === 'fail') return 'badge-critical';
  if (value === 'redact' || value === 'escalate' || value === 'held') return 'badge-warning';
  if (value === 'pass' || value === 'ok' || value === 'allow' || value === 'hit') return 'badge-low';
  return 'badge-cyan';
}

export default function PipelineTraceViewer({ trace }) {
  const steps = Array.isArray(trace) ? trace : [];
  if (steps.length === 0) {
    return (
      <div className="glass-card" style={{ padding: '16px 18px' }}>
        <h3 style={{ fontSize: '0.95rem', fontWeight: 600, margin: '0 0 6px 0' }}>Pipeline trace</h3>
        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.82rem' }}>
          No trace recorded for this request.
        </p>
      </div>
    );
  }

  const maxMs = steps.reduce((max, step) => Math.max(max, Number(step.ms) || 0), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ fontSize: '0.95rem', fontWeight: 600, margin: 0 }}>Pipeline trace</h3>
        <span className="badge badge-cyan">TRACE</span>
      </div>
      {steps.map((step, index) => {
        const ms = Number(step.ms);
        const knownMs = Number.isFinite(ms);
        const width = knownMs && ms > 0 && maxMs > 0 ? Math.max(4, (ms / maxMs) * 100) : 0;
        return (
          <div key={`${step.stage || 'stage'}-${index}`} className="glass-card" style={{ padding: '12px 14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center' }}>
              <strong style={{ fontSize: '0.84rem' }}>{step.stage || '—'}</strong>
              <span className={`badge ${outcomeBadge(step.outcome)}`} style={{ fontSize: '0.62rem' }}>
                {step.outcome || '—'}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '8px' }}>
              <div style={{ flex: 1, height: '6px', borderRadius: '99px', background: 'rgba(148, 163, 184, 0.2)' }}>
                <div style={{ width: `${width}%`, height: '100%', borderRadius: '99px', background: 'var(--accent-cyan)' }} />
              </div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-dim)', minWidth: '64px', textAlign: 'right' }}>
                {knownMs ? `${ms < 10 ? ms.toFixed(2) : Math.round(ms)} ms` : '—'}
              </span>
            </div>
            {step.detail ? (
              <div style={{ marginTop: '8px', fontSize: '0.78rem', color: 'var(--text-muted)', whiteSpace: 'pre-wrap' }}>
                {step.detail}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
