import React, { useState, useEffect } from 'react';
import { ApiService, mockPendingApprovals } from '../services/api';

export default function ApprovalsView({ pendingApprovals: initialApprovals, onApprovalResolved }) {
  const [approvals, setApprovals] = useState(initialApprovals && initialApprovals.length > 0 ? initialApprovals : mockPendingApprovals);
  const [loading, setLoading] = useState(false);
  const [actionInProgressId, setActionInProgressId] = useState(null);
  const [resolvedHistory, setResolvedHistory] = useState([]);
  const [activeModalItem, setActiveModalItem] = useState(null);
  const [modalActionType, setModalActionType] = useState('APPROVE'); // 'APPROVE' or 'REJECT'
  const [auditorNotes, setAuditorNotes] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // Fetch live approvals on mount
  useEffect(() => {
    let isMounted = true;
    const fetchPending = async () => {
      setLoading(true);
      try {
        const live = await ApiService.getPendingApprovals();
        if (isMounted && live && live.length > 0) {
          setApprovals(live);
        }
      } catch (e) {
        console.warn('Approvals API fallback active');
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    fetchPending();
    return () => { isMounted = false; };
  }, []);

  const openDecisionModal = (item, type) => {
    setActiveModalItem(item);
    setModalActionType(type);
    setAuditorNotes(type === 'APPROVE' ? 'Approved under security exception protocol' : 'Violates data governance compliance');
  };

  const confirmDecision = async () => {
    if (!activeModalItem) return;
    const item = activeModalItem;
    setActionInProgressId(item.id);
    setActiveModalItem(null);

    try {
      if (modalActionType === 'APPROVE') {
        await ApiService.approveEvent(item.id, 'secops.lead@enterprise.ai');
        setResolvedHistory(prev => [{ ...item, status: 'APPROVED', notes: auditorNotes, resolvedAt: new Date() }, ...prev]);
        setApprovals(prev => prev.filter(p => p.id !== item.id));
        if (onApprovalResolved) onApprovalResolved(item.id, 'APPROVED');
      } else {
        await ApiService.rejectEvent(item.id, 'secops.lead@enterprise.ai');
        setResolvedHistory(prev => [{ ...item, status: 'REJECTED', notes: auditorNotes, resolvedAt: new Date() }, ...prev]);
        setApprovals(prev => prev.filter(p => p.id !== item.id));
        if (onApprovalResolved) onApprovalResolved(item.id, 'REJECTED');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setActionInProgressId(null);
    }
  };

  const filteredApprovals = approvals.filter(item => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      (item.requestId && item.requestId.toLowerCase().includes(term)) ||
      (item.userId && item.userId.toLowerCase().includes(term)) ||
      (item.prompt && item.prompt.toLowerCase().includes(term)) ||
      (item.violationsSummary && item.violationsSummary.toLowerCase().includes(term))
    );
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
      {/* Title & Description */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0 }}>
            Human-in-the-Loop Approval & Review Station
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginTop: '4px', margin: 0 }}>
            Sensitive prompts flagged with HIGH risk scores requiring SecOps or Compliance authorization before LLM dispatch.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <span className="badge badge-warning">MANDATORY ESCALATION QUEUE</span>
        </div>
      </div>

      {/* KPI Status Strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
        <div className="glass-card" style={{ padding: '16px 20px' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontWeight: 600 }}>AWAITING SECOPS REVIEW</span>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, marginTop: '6px', color: 'var(--accent-amber)' }}>
            {approvals.length}
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '2px' }}>High Data Sensitivity or Intern Role</div>
        </div>

        <div className="glass-card" style={{ padding: '16px 20px' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontWeight: 600 }}>RESOLVED THIS SESSION</span>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, marginTop: '6px', color: 'var(--accent-emerald)' }}>
            {resolvedHistory.length}
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '2px' }}>Audited by SecOps Lead</div>
        </div>

        <div className="glass-card" style={{ padding: '16px 20px' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontWeight: 600 }}>AVG TURNAROUND SLA</span>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, marginTop: '6px', color: 'var(--accent-cyan)' }}>
            3.8m
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '2px' }}>Target SLA: &lt; 15 mins</div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="glass-card" style={{ padding: '12px 18px' }}>
        <input
          type="text"
          placeholder="Filter approval queue by user email, request ID, prompt keywords..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            width: '100%',
            background: 'var(--bg-input)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-main)',
            padding: '8px 12px',
            borderRadius: '8px',
            fontSize: '0.82rem',
            outline: 'none'
          }}
        />
      </div>

      {/* Review Queue Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {loading ? (
          <div className="glass-card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-dim)' }}>
            Loading pending review requests from database...
          </div>
        ) : filteredApprovals.length === 0 ? (
          <div className="glass-card" style={{ padding: '48px', textAlign: 'center', color: 'var(--text-dim)' }}>
            <div style={{
              width: '52px',
              height: '52px',
              borderRadius: '50%',
              background: 'rgba(16, 185, 129, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 14px auto'
            }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </div>
            <h3 style={{ color: 'var(--text-main)', marginBottom: '4px', fontSize: '1.1rem' }}>Queue Clean & Compliant</h3>
            <p style={{ fontSize: '0.82rem', margin: 0 }}>All high-risk prompt escalations have been authorized or rejected.</p>
          </div>
        ) : (
          filteredApprovals.map((item) => (
            <div key={item.id} className="glass-card" style={{ padding: '22px', borderLeft: '4px solid var(--accent-amber)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span className="badge badge-high">RISK SCORE: {item.riskScore}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--accent-cyan)' }}>{item.requestId}</span>
                    <span style={{ fontSize: '0.74rem', color: 'var(--text-dim)' }}>
                      • {new Date(item.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.85rem', marginTop: '6px' }}>
                    User: <strong style={{ color: 'var(--text-main)' }}>{item.userId}</strong> • Role: <strong>{item.userRole}</strong> • Model: {item.model} • Category: {item.promptCategory || 'FINANCE'}
                  </div>
                </div>

                {/* Approve / Reject Actions */}
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    id={`btn-approve-${item.id}`}
                    onClick={() => openDecisionModal(item, 'APPROVE')}
                    disabled={actionInProgressId === item.id}
                    className="btn btn-success"
                    style={{ fontSize: '0.78rem', padding: '7px 16px' }}
                  >
                    ✓ Authorize Request
                  </button>
                  <button
                    id={`btn-reject-${item.id}`}
                    onClick={() => openDecisionModal(item, 'REJECT')}
                    disabled={actionInProgressId === item.id}
                    className="btn btn-danger"
                    style={{ fontSize: '0.78rem', padding: '7px 16px' }}
                  >
                    ✕ Reject & Terminate
                  </button>
                </div>
              </div>

              {/* Violations Summary */}
              <div style={{ marginBottom: '12px', fontSize: '0.8rem' }}>
                <span style={{ color: 'var(--text-dim)', fontWeight: 600 }}>ESCALATION REASON: </span>
                <span style={{ color: '#fbbf24', fontWeight: 600 }}>{item.violationsSummary}</span>
              </div>

              {/* Prompt Text Preview */}
              <div style={{
                background: 'var(--bg-input)',
                padding: '14px',
                borderRadius: '8px',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.82rem',
                color: 'var(--text-main)',
                border: '1px solid var(--border-subtle)',
                whiteSpace: 'pre-wrap',
                lineHeight: 1.5
              }}>
                {item.prompt}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Auditor Decision Dialog Modal */}
      {activeModalItem && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '20px'
        }}>
          <div className="glass-card" style={{ width: '100%', maxWidth: '520px', padding: '24px', borderRadius: '14px' }}>
            <h3 style={{ fontSize: '1.1rem', margin: '0 0 10px 0', color: modalActionType === 'APPROVE' ? 'var(--accent-emerald)' : 'var(--accent-rose)' }}>
              {modalActionType === 'APPROVE' ? 'Authorize Prompt Dispatch' : 'Reject & Terminate Request'}
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '14px' }}>
              Recording auditor attestation in the immutable Kafka audit trail for Request ID <strong>{activeModalItem.requestId}</strong>.
            </p>

            <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '6px', fontWeight: 600 }}>
              AUDITOR REASON & NOTES
            </label>
            <textarea
              rows={4}
              value={auditorNotes}
              onChange={(e) => setAuditorNotes(e.target.value)}
              style={{
                width: '100%',
                background: 'var(--bg-input)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-main)',
                borderRadius: '8px',
                padding: '10px',
                fontSize: '0.82rem',
                outline: 'none',
                marginBottom: '16px'
              }}
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button onClick={() => setActiveModalItem(null)} className="btn btn-secondary" style={{ fontSize: '0.78rem' }}>
                Cancel
              </button>
              <button
                onClick={confirmDecision}
                className={`btn ${modalActionType === 'APPROVE' ? 'btn-success' : 'btn-danger'}`}
                style={{ fontSize: '0.78rem' }}
              >
                Confirm {modalActionType === 'APPROVE' ? 'Authorization' : 'Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
