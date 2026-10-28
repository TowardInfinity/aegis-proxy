import React from 'react';

export default function EventDetailModal({ event, onClose }) {
  if (!event) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
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
        maxWidth: '720px',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        borderRadius: '16px',
        border: '1px solid var(--border-highlight)',
        overflow: 'hidden',
        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.7)'
      }}>
        {/* Header */}
        <div style={{
          padding: '18px 24px',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'rgba(15, 23, 42, 0.9)'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className={`badge ${event.riskLevel === 'CRITICAL' ? 'badge-critical' : event.riskLevel === 'HIGH' ? 'badge-high' : 'badge-low'}`}>
                {event.riskLevel} RISK (SCORE: {event.riskScore})
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                {event.requestId}
              </span>
            </div>
            <h3 style={{ fontSize: '1.1rem', margin: '4px 0 0 0' }}>Forensic Audit Event Inspection</h3>
          </div>

          <button
            id="btn-close-modal"
            onClick={onClose}
            className="btn btn-secondary"
            style={{ padding: '4px 10px', fontSize: '0.8rem' }}
          >
            ✕ Close
          </button>
        </div>

        {/* Content Body */}
        <div style={{ padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Metadata Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', fontSize: '0.8rem' }}>
            <div style={{ padding: '10px', background: 'rgba(30, 41, 59, 0.4)', borderRadius: '8px' }}>
              <div style={{ color: 'var(--text-dim)', fontSize: '0.7rem' }}>USER & ROLE</div>
              <strong style={{ color: 'var(--text-main)' }}>{event.userId}</strong>
              <div style={{ fontSize: '0.7rem', color: 'var(--accent-cyan)' }}>Role: {event.userRole}</div>
            </div>

            <div style={{ padding: '10px', background: 'rgba(30, 41, 59, 0.4)', borderRadius: '8px' }}>
              <div style={{ color: 'var(--text-dim)', fontSize: '0.7rem' }}>ENFORCED ACTION</div>
              <strong style={{
                color: event.action === 'BLOCK' ? 'var(--accent-rose)' : event.action === 'REVIEW' ? 'var(--accent-amber)' : 'var(--accent-emerald)'
              }}>
                {event.action}
              </strong>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>Status: {event.approvalStatus || 'NONE'}</div>
            </div>

            <div style={{ padding: '10px', background: 'rgba(30, 41, 59, 0.4)', borderRadius: '8px' }}>
              <div style={{ color: 'var(--text-dim)', fontSize: '0.7rem' }}>MODEL & SPEND</div>
              <strong style={{ color: 'var(--text-main)' }}>{event.model}</strong>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>
                Tokens: {event.tokensIn || 0} in / {event.tokensOut || 0} out (${event.costUsd?.toFixed(5) || '0.00000'})
              </div>
            </div>
          </div>

          {/* Triggered Violations Summary */}
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-dim)', marginBottom: '6px' }}>
              VIOLATIONS & TRIGGER REASON
            </div>
            <div style={{
              padding: '12px 14px',
              background: 'rgba(244, 63, 94, 0.08)',
              border: '1px solid rgba(244, 63, 94, 0.2)',
              borderRadius: '8px',
              color: '#fb7185',
              fontSize: '0.82rem',
              fontWeight: 500
            }}>
              {event.violationsSummary || 'No security violations flagged.'}
              {event.blockReason && (
                <div style={{ marginTop: '4px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Block Details: {event.blockReason}
                </div>
              )}
            </div>
          </div>

          {/* Prompt Content */}
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-dim)', marginBottom: '6px' }}>
              RECORDED PROMPT PAYLOAD
            </div>
            <pre style={{
              background: 'var(--bg-input)',
              padding: '14px',
              borderRadius: '8px',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.8rem',
              color: 'var(--text-main)',
              whiteSpace: 'pre-wrap',
              border: '1px solid var(--border-subtle)',
              maxHeight: '160px',
              overflowY: 'auto'
            }}>
              {event.prompt || '(Prompt content not stored)'}
            </pre>
          </div>

          {/* Output Quality & Verification Heuristics */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', fontSize: '0.8rem' }}>
            <div style={{ padding: '12px', background: 'rgba(30, 41, 59, 0.4)', borderRadius: '8px' }}>
              <span style={{ color: 'var(--text-dim)', fontSize: '0.7rem' }}>RESPONSE QUALITY VERDICT</span>
              <div style={{ fontWeight: 700, color: event.qualityVerdict === 'FAIL' ? 'var(--accent-rose)' : '#34d399', marginTop: '2px' }}>
                {event.qualityVerdict || 'PASS'}
              </div>
            </div>

            <div style={{ padding: '12px', background: 'rgba(30, 41, 59, 0.4)', borderRadius: '8px' }}>
              <span style={{ color: 'var(--text-dim)', fontSize: '0.7rem' }}>HALLUCINATION PROBABILITY</span>
              <div style={{ fontWeight: 700, color: 'var(--text-main)', marginTop: '2px' }}>
                {event.hallucinationScore != null ? `${(event.hallucinationScore * 100).toFixed(1)}%` : '0.0%'}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
