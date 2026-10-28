import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { ApiService, formatUsd } from '../services/api';
import ErrorBanner from './ErrorBanner';

function when(ts) {
  if (!ts) return '—';
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString();
}

export default function AuditLogView({ onSelectEvent }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [riskFilter, setRiskFilter] = useState('ALL');
  const [actionFilter, setActionFilter] = useState('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    try {
      const liveEvents = await ApiService.getLedger(500);
      setEvents(liveEvents);
      setError(null);
    } catch (err) {
      setError(err?.message || 'Proxy unreachable');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      if (activeTab === 'ALERTS_ONLY' && event.riskLevel !== 'CRITICAL' && event.riskLevel !== 'HIGH') return false;
      if (activeTab === 'BLOCKED' && event.action !== 'BLOCK') return false;
      if (activeTab === 'REVIEW' && event.action !== 'REVIEW') return false;
      if (riskFilter !== 'ALL' && event.riskLevel !== riskFilter) return false;
      if (actionFilter !== 'ALL' && event.action !== actionFilter) return false;
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matches =
          (event.requestId && event.requestId.toLowerCase().includes(term)) ||
          (event.userId && event.userId.toLowerCase().includes(term)) ||
          (event.violationsSummary && event.violationsSummary.toLowerCase().includes(term)) ||
          (event.blockReason && event.blockReason.toLowerCase().includes(term)) ||
          (event.model && event.model.toLowerCase().includes(term));
        if (!matches) return false;
      }
      return true;
    });
  }, [events, activeTab, riskFilter, actionFilter, searchTerm]);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, riskFilter, actionFilter, searchTerm, pageSize]);

  const totalItems = filteredEvents.length;
  const totalPages = Math.ceil(totalItems / pageSize) || 1;
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedEvents = filteredEvents.slice(startIndex, startIndex + pageSize);

  const exportToJson = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(filteredEvents, null, 2));
    const link = document.createElement('a');
    link.setAttribute('href', dataStr);
    link.setAttribute('download', `aegis_audit_${Date.now()}.json`);
    link.click();
  };

  const exportToCsv = () => {
    const headers = ['Request ID', 'Employee', 'Risk Level', 'Risk Score', 'Action', 'Model', 'Cost USD', 'Cache Hit', 'Saved USD', 'Timestamp', 'Rules'];
    const rows = filteredEvents.map((event) => [
      event.requestId,
      event.userId,
      event.riskLevel,
      event.riskScore,
      event.action,
      event.model,
      event.costUsd,
      event.cacheHit ? 'yes' : 'no',
      event.savedUsd,
      event.timestamp,
      `"${(event.violationsSummary || '').replace(/"/g, '""')}"`
    ]);
    const csvContent = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
    const link = document.createElement('a');
    link.setAttribute('href', 'data:text/csv;charset=utf-8,' + encodeURIComponent(csvContent));
    link.setAttribute('download', `aegis_audit_${Date.now()}.csv`);
    link.click();
  };

  const criticalCount = events.filter((event) => event.riskLevel === 'CRITICAL' || event.riskLevel === 'HIGH').length;
  const blockedCount = events.filter((event) => event.action === 'BLOCK').length;
  const reviewCount = events.filter((event) => event.action === 'REVIEW').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <ErrorBanner message={error} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0 }}>Audit Log</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', margin: '4px 0 0 0' }}>
            Latest 500 ledger rows. Masked samples only. Spend {events.length ? formatUsd(events.reduce((sum, event) => sum + (Number(event.costUsd) || 0), 0)) : '—'}.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={loadEvents} className="btn btn-secondary" style={{ fontSize: '0.78rem' }}>Refresh</button>
          <button id="btn-export-csv" onClick={exportToCsv} className="btn btn-secondary" style={{ fontSize: '0.78rem' }}>Export CSV</button>
          <button id="btn-export-json" onClick={exportToJson} className="btn btn-secondary" style={{ fontSize: '0.78rem' }}>Export JSON</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '10px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '8px', flexWrap: 'wrap' }}>
        {[
          { id: 'ALL', label: 'All', badge: events.length },
          { id: 'ALERTS_ONLY', label: 'High and critical', badge: criticalCount },
          { id: 'BLOCKED', label: 'Blocked', badge: blockedCount },
          { id: 'REVIEW', label: 'Held for review', badge: reviewCount }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              background: activeTab === tab.id ? 'rgba(212, 118, 10, 0.12)' : 'transparent',
              border: activeTab === tab.id ? '1px solid var(--border-highlight)' : '1px solid transparent',
              borderRadius: '8px',
              color: activeTab === tab.id ? 'var(--accent-cyan)' : 'var(--text-muted)',
              padding: '6px 14px',
              fontSize: '0.8rem',
              fontWeight: activeTab === tab.id ? 700 : 500,
              cursor: 'pointer'
            }}
          >
            {tab.label} ({tab.badge})
          </button>
        ))}
      </div>

      <div className="glass-card" style={{ padding: '16px 20px', display: 'flex', gap: '14px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          id="audit-search-input"
          type="text"
          placeholder="Search request id, employee, model, or rule"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            flex: 2,
            minWidth: '240px',
            background: 'var(--bg-input)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-main)',
            padding: '8px 12px',
            borderRadius: '8px',
            fontSize: '0.82rem'
          }}
        />
        <select id="select-risk-filter" value={riskFilter} onChange={(e) => setRiskFilter(e.target.value)} style={selectStyle}>
          <option value="ALL">All risk levels</option>
          <option value="CRITICAL">Critical</option>
          <option value="HIGH">High</option>
          <option value="MEDIUM">Medium</option>
          <option value="LOW">Low</option>
        </select>
        <select id="select-action-filter" value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} style={selectStyle}>
          <option value="ALL">All actions</option>
          <option value="ALLOW">ALLOW</option>
          <option value="BLOCK">BLOCK</option>
          <option value="REVIEW">REVIEW</option>
        </select>
        <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} style={selectStyle}>
          <option value={10}>10</option>
          <option value={25}>25</option>
          <option value={50}>50</option>
        </select>
      </div>

      <div className="glass-card" style={{ overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem' }}>
          <thead>
            <tr style={{ background: 'rgba(30, 41, 59, 0.45)', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-dim)' }}>
              <th style={th}>TIMESTAMP</th>
              <th style={th}>REQUEST ID</th>
              <th style={th}>EMPLOYEE</th>
              <th style={th}>RISK</th>
              <th style={th}>ACTION</th>
              <th style={th}>MODEL</th>
              <th style={th}>RULES</th>
              <th style={{ ...th, textAlign: 'right' }}>DETAILS</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ padding: '36px', textAlign: 'center', color: 'var(--text-dim)' }}>Loading the ledger…</td></tr>
            ) : paginatedEvents.length === 0 ? (
              <tr><td colSpan={8} style={{ padding: '36px', textAlign: 'center', color: 'var(--text-dim)' }}>No ledger rows matched.</td></tr>
            ) : paginatedEvents.map((event, index) => (
              <tr key={`${event.id}-${index}`} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <td style={td}>{when(event.timestamp)}</td>
                <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>{event.requestId}</td>
                <td style={td}>{event.userId || '—'}</td>
                <td style={td}>
                  <span className={`badge ${event.riskLevel === 'CRITICAL' ? 'badge-critical' : event.riskLevel === 'HIGH' ? 'badge-high' : event.riskLevel === 'MEDIUM' ? 'badge-medium' : 'badge-low'}`}>
                    {event.riskLevel}
                  </span>
                  <strong style={{ marginLeft: '8px' }}>{event.riskScore}</strong>
                </td>
                <td style={{ ...td, color: event.action === 'BLOCK' ? 'var(--accent-rose)' : event.action === 'REVIEW' ? 'var(--accent-amber)' : 'var(--accent-emerald)', fontWeight: 700 }}>
                  {event.action}
                </td>
                <td style={td}>{event.model || '—'}</td>
                <td style={{ ...td, maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {event.violationsSummary || 'None'}
                </td>
                <td style={{ ...td, textAlign: 'right' }}>
                  <button onClick={() => onSelectEvent(event)} className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.72rem' }}>
                    Inspect
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
            {totalItems === 0 ? '0 rows' : `${startIndex + 1}–${Math.min(startIndex + pageSize, totalItems)} of ${totalItems}`}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} disabled={currentPage === 1} className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.75rem' }}>Previous</button>
            <button onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))} disabled={currentPage === totalPages} className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.75rem' }}>Next</button>
          </div>
        </div>
      </div>
    </div>
  );
}

const th = { padding: '12px 16px', fontWeight: 600 };
const td = { padding: '12px 16px' };
const selectStyle = {
  background: 'var(--bg-input)',
  border: '1px solid var(--border-subtle)',
  color: 'var(--text-main)',
  padding: '8px 10px',
  borderRadius: '8px',
  fontSize: '0.78rem'
};
