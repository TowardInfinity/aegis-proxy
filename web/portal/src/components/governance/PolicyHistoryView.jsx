import React, { useState, useEffect } from 'react';
import { GovernanceApi } from '../../services/governanceApi';

export default function PolicyHistoryView() {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedRecord, setSelectedRecord] = useState(null); // inspection modal
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    setLoading(true);
    const data = await GovernanceApi.getPolicyHistory();
    setHistory(data);
    setLoading(false);
  };

  const filtered = history.filter(h => {
    return (h.policyKey || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (h.changedBy || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (h.changeSummary || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (h.actionType || '').toLowerCase().includes(searchQuery.toLowerCase());
  });

  const getActionBadgeColor = (action) => {
    switch (action) {
      case 'CREATE': return { bg: 'rgba(16, 185, 129, 0.15)', text: '#34d399', border: 'rgba(16, 185, 129, 0.3)' };
      case 'UPDATE': return { bg: 'rgba(56, 189, 248, 0.15)', text: '#38bdf8', border: 'rgba(56, 189, 248, 0.3)' };
      case 'ROLLBACK': return { bg: 'rgba(245, 158, 11, 0.15)', text: '#fbbf24', border: 'rgba(245, 158, 11, 0.3)' };
      case 'STATUS_CHANGE': return { bg: 'rgba(168, 85, 247, 0.15)', text: '#c084fc', border: 'rgba(168, 85, 247, 0.3)' };
      default: return { bg: 'rgba(148, 163, 184, 0.15)', text: '#94a3b8', border: 'rgba(148, 163, 184, 0.3)' };
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '24px 28px',
        background: 'var(--bg-glass-card)',
        borderRadius: '16px',
        border: '1px solid var(--border-highlight)'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
            <span style={{
              background: 'linear-gradient(135deg, var(--accent-cyan), var(--accent-blue))',
              color: '#0f172a',
              fontSize: '0.72rem',
              fontWeight: 800,
              padding: '3px 8px',
              borderRadius: '6px'
            }}>FORENSIC AUDIT</span>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Cryptographic Immutability of Policy Lifecycle Changes
            </span>
          </div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 800, margin: 0, color: '#f8fafc' }}>
            Policy Audit History & Versions
          </h1>
        </div>

        <button
          onClick={loadHistory}
          style={{
            background: 'rgba(255, 255, 255, 0.05)',
            color: 'var(--text-secondary)',
            border: '1px solid var(--border-glass)',
            borderRadius: '8px',
            padding: '10px 16px',
            fontSize: '0.85rem',
            fontWeight: 600,
            cursor: 'pointer'
          }}
        >
          ↻ Refresh Audit Trail
        </button>
      </div>

      {/* Search Bar */}
      <div style={{
        background: 'var(--bg-glass-card)',
        padding: '14px 20px',
        borderRadius: '12px',
        border: '1px solid var(--border-glass)'
      }}>
        <input
          type="text"
          placeholder="Filter audit entries by policy key, operator ID, or summary..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            width: '100%',
            maxWidth: '380px',
            background: 'rgba(0,0,0,0.25)',
            border: '1px solid var(--border-glass)',
            borderRadius: '8px',
            padding: '8px 14px',
            color: '#f8fafc',
            fontSize: '0.82rem',
            outline: 'none'
          }}
        />
      </div>

      {/* Audit History Table */}
      <div style={{
        background: 'var(--bg-glass-card)',
        borderRadius: '14px',
        border: '1px solid var(--border-glass)',
        overflow: 'hidden'
      }}>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            Loading policy audit log...
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            No audit records matching your search.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--border-glass)', color: 'var(--text-secondary)' }}>
                <th style={{ padding: '14px 18px', fontWeight: 600 }}>TIMESTAMP</th>
                <th style={{ padding: '14px 18px', fontWeight: 600 }}>POLICY KEY</th>
                <th style={{ padding: '14px 18px', fontWeight: 600 }}>ACTION</th>
                <th style={{ padding: '14px 18px', fontWeight: 600 }}>OPERATOR (WHO)</th>
                <th style={{ padding: '14px 18px', fontWeight: 600 }}>CHANGE SUMMARY</th>
                <th style={{ padding: '14px 18px', fontWeight: 600, textAlign: 'right' }}>DIFF INSPECTION</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(record => {
                const actStyle = getActionBadgeColor(record.actionType);

                return (
                  <tr
                    key={record.id}
                    style={{ borderBottom: '1px solid var(--border-glass)' }}
                  >
                    <td style={{ padding: '16px 18px', fontFamily: 'monospace', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                      {record.changedAt ? new Date(record.changedAt).toLocaleString() : 'N/A'}
                    </td>

                    <td style={{ padding: '16px 18px' }}>
                      <span style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--accent-cyan)' }}>
                        {record.policyKey}
                      </span>
                    </td>

                    <td style={{ padding: '16px 18px' }}>
                      <span style={{
                        padding: '3px 8px',
                        borderRadius: '6px',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        background: actStyle.bg,
                        color: actStyle.text,
                        border: `1px solid ${actStyle.border}`
                      }}>
                        {record.actionType}
                      </span>
                    </td>

                    <td style={{ padding: '16px 18px' }}>
                      <span style={{ color: '#f8fafc', fontWeight: 600 }}>
                        {record.changedBy}
                      </span>
                    </td>

                    <td style={{ padding: '16px 18px' }}>
                      <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                        {record.changeSummary}
                      </span>
                    </td>

                    <td style={{ padding: '16px 18px', textAlign: 'right' }}>
                      <button
                        onClick={() => setSelectedRecord(record)}
                        style={{
                          background: 'rgba(255,255,255,0.05)',
                          color: 'var(--accent-cyan)',
                          border: '1px solid var(--border-glass)',
                          padding: '5px 12px',
                          borderRadius: '6px',
                          fontSize: '0.75rem',
                          cursor: 'pointer'
                        }}
                      >
                        View Diff
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Forensic Inspection Modal */}
      {selectedRecord && (
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
          zIndex: 1000,
          padding: '20px'
        }}>
          <div style={{
            background: 'var(--bg-glass-card)',
            border: '1px solid var(--border-highlight)',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '720px',
            maxHeight: '90vh',
            overflowY: 'auto',
            padding: '28px',
            boxShadow: 'var(--shadow-card)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <span style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--accent-cyan)' }}>
                  Audit Record #{selectedRecord.id}
                </span>
                <h2 style={{ margin: '4px 0 0 0', fontSize: '1.25rem', color: '#f8fafc' }}>
                  Policy Audit: {selectedRecord.policyKey}
                </h2>
              </div>
              <button
                onClick={() => setSelectedRecord(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '1.2rem', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr',
              gap: '12px',
              background: 'rgba(0,0,0,0.25)',
              padding: '14px',
              borderRadius: '8px',
              fontSize: '0.78rem',
              marginBottom: '18px'
            }}>
              <div>
                <span style={{ color: 'var(--text-secondary)', display: 'block' }}>OPERATOR</span>
                <strong style={{ color: '#f8fafc' }}>{selectedRecord.changedBy}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-secondary)', display: 'block' }}>ACTION</span>
                <strong style={{ color: '#38bdf8' }}>{selectedRecord.actionType}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-secondary)', display: 'block' }}>TIMESTAMP</span>
                <span style={{ color: '#94a3b8', fontFamily: 'monospace' }}>
                  {new Date(selectedRecord.changedAt).toLocaleString()}
                </span>
              </div>
            </div>

            {/* Old vs New Value Comparison */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: '#f87171', fontWeight: 700, marginBottom: '6px' }}>
                  OLD CONFIGURATION VALUE
                </label>
                <div style={{
                  background: 'rgba(239, 68, 68, 0.05)',
                  border: '1px solid rgba(239, 68, 68, 0.2)',
                  borderRadius: '8px',
                  padding: '12px',
                  fontFamily: 'monospace',
                  fontSize: '0.78rem',
                  color: '#fca5a5',
                  maxHeight: '260px',
                  overflowY: 'auto',
                  whiteSpace: 'pre-wrap'
                }}>
                  {selectedRecord.oldValueJson
                    ? JSON.stringify(JSON.parse(selectedRecord.oldValueJson), null, 2)
                    : '(Initial Creation - No Previous Value)'}
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: '#34d399', fontWeight: 700, marginBottom: '6px' }}>
                  NEW CONFIGURATION VALUE
                </label>
                <div style={{
                  background: 'rgba(16, 185, 129, 0.05)',
                  border: '1px solid rgba(16, 185, 129, 0.2)',
                  borderRadius: '8px',
                  padding: '12px',
                  fontFamily: 'monospace',
                  fontSize: '0.78rem',
                  color: '#86efac',
                  maxHeight: '260px',
                  overflowY: 'auto',
                  whiteSpace: 'pre-wrap'
                }}>
                  {selectedRecord.newValueJson
                    ? JSON.stringify(JSON.parse(selectedRecord.newValueJson), null, 2)
                    : '(None)'}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button
                onClick={() => setSelectedRecord(null)}
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid var(--border-glass)',
                  color: 'var(--text-secondary)',
                  borderRadius: '8px',
                  padding: '8px 18px',
                  fontSize: '0.85rem',
                  cursor: 'pointer'
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
