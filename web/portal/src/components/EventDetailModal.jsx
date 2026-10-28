import { formatUsd } from '../services/api';
import PipelineTraceViewer from './PipelineTraceViewer';

function when(ts) {
  if (!ts) return '—';
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString();
}

export default function EventDetailModal({ event, onClose }) {
  if (!event) return null;
  const samples = Array.isArray(event.samples) ? event.samples : [];

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(4, 7, 13, 0.75)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 100,
      padding: '20px'
    }}>
      <div className="glass-card" style={{
        width: '100%',
        maxWidth: '860px',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        borderRadius: '16px',
        border: '1px solid var(--border-highlight)',
        overflow: 'hidden'
      }}>
        <div style={{
          padding: '18px 24px',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '12px'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span className={`badge ${event.riskLevel === 'CRITICAL' ? 'badge-critical' : event.riskLevel === 'HIGH' ? 'badge-high' : event.riskLevel === 'MEDIUM' ? 'badge-medium' : 'badge-low'}`}>
                {event.riskLevel} · {event.riskScore}
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                {event.requestId}
              </span>
            </div>
            <h3 style={{ fontSize: '1.1rem', margin: '4px 0 0 0' }}>Ledger row</h3>
          </div>
          <button id="btn-close-modal" onClick={onClose} className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.8rem' }}>
            Close
          </button>
        </div>

        <div style={{ padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', fontSize: '0.8rem' }}>
            <div style={{ padding: '10px', background: 'rgba(30, 41, 59, 0.4)', borderRadius: '8px' }}>
              <div style={{ color: 'var(--text-dim)', fontSize: '0.7rem' }}>EMPLOYEE</div>
              <strong>{event.userId || '—'}</strong>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>{when(event.timestamp)}</div>
            </div>
            <div style={{ padding: '10px', background: 'rgba(30, 41, 59, 0.4)', borderRadius: '8px' }}>
              <div style={{ color: 'var(--text-dim)', fontSize: '0.7rem' }}>ACTION</div>
              <strong style={{ color: event.action === 'BLOCK' ? 'var(--accent-rose)' : event.action === 'REVIEW' ? 'var(--accent-amber)' : 'var(--accent-emerald)' }}>
                {event.action || '—'}
              </strong>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>{event.rawAction || '—'}{event.stage ? ` · ${event.stage}` : ''}</div>
            </div>
            <div style={{ padding: '10px', background: 'rgba(30, 41, 59, 0.4)', borderRadius: '8px' }}>
              <div style={{ color: 'var(--text-dim)', fontSize: '0.7rem' }}>MODEL AND SPEND</div>
              <strong>{event.model || '—'}</strong>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>
                {event.tokensIn || 0} in / {event.tokensOut || 0} out · {formatUsd(event.costUsd)}
              </div>
            </div>
            <div style={{ padding: '10px', background: 'rgba(30, 41, 59, 0.4)', borderRadius: '8px' }}>
              <div style={{ color: 'var(--text-dim)', fontSize: '0.7rem' }}>CACHE</div>
              <strong>{event.cacheHit ? 'Hit' : 'Miss'}</strong>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>Saved {formatUsd(event.savedUsd)}</div>
            </div>
          </div>

          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-dim)', marginBottom: '6px' }}>RULES</div>
            <div style={{
              padding: '12px 14px',
              background: 'rgba(244, 63, 94, 0.08)',
              border: '1px solid rgba(244, 63, 94, 0.2)',
              borderRadius: '8px',
              color: '#fb7185',
              fontSize: '0.82rem'
            }}>
              {event.violationsSummary || 'No rule hits.'}
              {event.blockReason ? (
                <div style={{ marginTop: '4px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>{event.blockReason}</div>
              ) : null}
            </div>
          </div>

          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-dim)', marginBottom: '6px' }}>MASKED SAMPLES</div>
            <p style={{ margin: '0 0 8px 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Aegis never stores prompts. Masked samples only.
            </p>
            {samples.length === 0 ? (
              <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>No masked samples on this row.</div>
            ) : (
              <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '0.8rem' }}>
                {samples.map((sample, index) => (
                  <li key={`${sample.rule}-${index}`} style={{ marginBottom: '4px' }}>
                    <strong>{sample.rule || 'rule'}</strong>: {sample.sample}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <PipelineTraceViewer trace={event.trace} />
        </div>
      </div>
    </div>
  );
}
