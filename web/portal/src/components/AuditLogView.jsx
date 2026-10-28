import React, { useState, useEffect, useMemo } from 'react';
import { ApiService, mockAuditEvents } from '../services/api';

export default function AuditLogView({ auditEvents: initialEvents, onSelectEvent }) {
  const [events, setEvents] = useState(initialEvents && initialEvents.length > 0 ? initialEvents : mockAuditEvents);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('ALL'); // 'ALL', 'ALERTS_ONLY', 'BLOCKED', 'REVIEW'
  const [searchTerm, setSearchTerm] = useState('');
  const [riskFilter, setRiskFilter] = useState('ALL');
  const [actionFilter, setActionFilter] = useState('ALL');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Sync with backend on mount
  useEffect(() => {
    let isMounted = true;
    const loadEvents = async () => {
      setLoading(true);
      try {
        const liveEvents = await ApiService.getAuditEvents(100);
        if (isMounted && liveEvents && liveEvents.length > 0) {
          setEvents(liveEvents);
        }
      } catch (e) {
        console.warn('AuditLog API fallback active');
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    loadEvents();
    return () => { isMounted = false; };
  }, []);

  // Filtered dataset
  const filteredEvents = useMemo(() => {
    return events.filter(e => {
      // Tab pre-filters
      if (activeTab === 'ALERTS_ONLY' && e.riskLevel !== 'CRITICAL' && e.riskLevel !== 'HIGH') return false;
      if (activeTab === 'BLOCKED' && e.action !== 'BLOCK') return false;
      if (activeTab === 'REVIEW' && e.action !== 'REVIEW') return false;

      // Dropdown filters
      if (riskFilter !== 'ALL' && e.riskLevel !== riskFilter) return false;
      if (actionFilter !== 'ALL' && e.action !== actionFilter) return false;
      if (roleFilter !== 'ALL' && e.userRole !== roleFilter) return false;

      // Text search
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matches =
          (e.requestId && e.requestId.toLowerCase().includes(term)) ||
          (e.userId && e.userId.toLowerCase().includes(term)) ||
          (e.prompt && e.prompt.toLowerCase().includes(term)) ||
          (e.violationsSummary && e.violationsSummary.toLowerCase().includes(term)) ||
          (e.model && e.model.toLowerCase().includes(term));
        if (!matches) return false;
      }
      return true;
    });
  }, [events, activeTab, riskFilter, actionFilter, roleFilter, searchTerm]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, riskFilter, actionFilter, roleFilter, searchTerm, pageSize]);

  // Pagination calculation
  const totalItems = filteredEvents.length;
  const totalPages = Math.ceil(totalItems / pageSize) || 1;
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedEvents = filteredEvents.slice(startIndex, startIndex + pageSize);

  // Export functions
  const exportToJson = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(filteredEvents, null, 2));
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute('href', dataStr);
    dlAnchorElem.setAttribute('download', `ai_guardian_audit_export_${Date.now()}.json`);
    dlAnchorElem.click();
  };

  const exportToCsv = () => {
    const headers = ['ID', 'Request ID', 'User ID', 'Role', 'Risk Level', 'Risk Score', 'Action', 'Model', 'Cost USD', 'Timestamp', 'Violations'];
    const rows = filteredEvents.map(e => [
      e.id,
      e.requestId,
      e.userId,
      e.userRole,
      e.riskLevel,
      e.riskScore,
      e.action,
      e.model,
      e.costUsd,
      e.timestamp,
      `"${(e.violationsSummary || '').replace(/"/g, '""')}"`
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute('href', encodeURI(csvContent));
    dlAnchorElem.setAttribute('download', `ai_guardian_audit_export_${Date.now()}.csv`);
    dlAnchorElem.click();
  };

  const criticalCount = events.filter(e => e.riskLevel === 'CRITICAL' || e.riskLevel === 'HIGH').length;
  const blockedCount = events.filter(e => e.action === 'BLOCK').length;
  const reviewCount = events.filter(e => e.action === 'REVIEW').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Title & Stats */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0 }}>
            Security Audit Log & Forensic Explorer
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginTop: '4px', margin: 0 }}>
            Immutable event records capturing prompt input, model metadata, multi-factor risk scores, and token spend.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button id="btn-export-csv" onClick={exportToCsv} className="btn btn-secondary" style={{ fontSize: '0.78rem' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            Export CSV
          </button>
          <button id="btn-export-json" onClick={exportToJson} className="btn btn-secondary" style={{ fontSize: '0.78rem' }}>
            Export JSON
          </button>
        </div>
      </div>

      {/* Quick Navigation Tabs: All vs Risk Alerts vs Blocked vs Reviews */}
      <div style={{ display: 'flex', gap: '10px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '8px', flexWrap: 'wrap' }}>
        {[
          { id: 'ALL', label: 'All Audit Events', badge: events.length, color: 'cyan' },
          { id: 'ALERTS_ONLY', label: 'Risk Alerts (High/Critical)', badge: criticalCount, color: 'critical' },
          { id: 'BLOCKED', label: 'Blocked Threats', badge: blockedCount, color: 'rose' },
          { id: 'REVIEW', label: 'Human Review Escalations', badge: reviewCount, color: 'warning' }
        ].map(tab => (
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
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.18s ease'
            }}
          >
            <span>{tab.label}</span>
            <span className={`badge ${tab.color === 'critical' ? 'badge-critical' : tab.color === 'warning' ? 'badge-warning' : tab.color === 'rose' ? 'badge-rose' : 'badge-cyan'}`} style={{ fontSize: '0.62rem', padding: '1px 6px' }}>
              {tab.badge}
            </span>
          </button>
        ))}
      </div>

      {/* Filter & Search Toolbar */}
      <div className="glass-card" style={{ padding: '16px 20px', display: 'flex', gap: '14px', flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Search Input */}
        <div style={{ flex: 2, minWidth: '240px', position: 'relative' }}>
          <input
            id="audit-search-input"
            type="text"
            placeholder="Search by Request ID, user email, model, violation pattern..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: '100%',
              background: 'var(--bg-input)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-main)',
              padding: '8px 12px 8px 36px',
              borderRadius: '8px',
              fontSize: '0.82rem',
              outline: 'none'
            }}
          />
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--text-dim)"
            strokeWidth="2"
            style={{ position: 'absolute', left: '10px', top: '10px' }}
          >
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
        </div>

        {/* Risk Level Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', fontWeight: 700 }}>RISK:</span>
          <select
            id="select-risk-filter"
            value={riskFilter}
            onChange={(e) => setRiskFilter(e.target.value)}
            style={{
              background: 'var(--bg-input)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-main)',
              padding: '8px 10px',
              borderRadius: '8px',
              fontSize: '0.78rem'
            }}
          >
            <option value="ALL">All Risk Levels</option>
            <option value="CRITICAL">Critical (≥80)</option>
            <option value="HIGH">High (60-79)</option>
            <option value="MEDIUM">Medium (30-59)</option>
            <option value="LOW">Low (&lt;30)</option>
          </select>
        </div>

        {/* Action Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', fontWeight: 700 }}>ACTION:</span>
          <select
            id="select-action-filter"
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            style={{
              background: 'var(--bg-input)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-main)',
              padding: '8px 10px',
              borderRadius: '8px',
              fontSize: '0.78rem'
            }}
          >
            <option value="ALL">All Actions</option>
            <option value="ALLOW">ALLOW</option>
            <option value="BLOCK">BLOCK</option>
            <option value="REVIEW">REVIEW</option>
          </select>
        </div>

        {/* User Role Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', fontWeight: 700 }}>ROLE:</span>
          <select
            id="select-role-filter"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            style={{
              background: 'var(--bg-input)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-main)',
              padding: '8px 10px',
              borderRadius: '8px',
              fontSize: '0.78rem'
            }}
          >
            <option value="ALL">All Roles</option>
            <option value="INTERN">INTERN</option>
            <option value="ANALYST">ANALYST</option>
            <option value="ENGINEER">ENGINEER</option>
            <option value="ADMIN">ADMIN</option>
          </select>
        </div>

        {/* Page Size Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: 'auto' }}>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>SHOW:</span>
          <select
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            style={{
              background: 'var(--bg-input)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-main)',
              padding: '6px 8px',
              borderRadius: '6px',
              fontSize: '0.75rem'
            }}
          >
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
          </select>
        </div>
      </div>

      {/* Events Table */}
      <div className="glass-card" style={{ overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem' }}>
          <thead>
            <tr style={{ background: 'rgba(30, 41, 59, 0.45)', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-dim)' }}>
              <th style={{ padding: '12px 16px', fontWeight: 600 }}>TIMESTAMP</th>
              <th style={{ padding: '12px 16px', fontWeight: 600 }}>REQUEST ID</th>
              <th style={{ padding: '12px 16px', fontWeight: 600 }}>USER & ROLE</th>
              <th style={{ padding: '12px 16px', fontWeight: 600 }}>RISK SCORE</th>
              <th style={{ padding: '12px 16px', fontWeight: 600 }}>ACTION</th>
              <th style={{ padding: '12px 16px', fontWeight: 600 }}>MODEL</th>
              <th style={{ padding: '12px 16px', fontWeight: 600 }}>VIOLATIONS</th>
              <th style={{ padding: '12px 16px', fontWeight: 600, textAlign: 'right' }}>DETAILS</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} style={{ padding: '36px', textAlign: 'center', color: 'var(--text-dim)' }}>
                  Loading real-time audit ledger from database...
                </td>
              </tr>
            ) : paginatedEvents.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ padding: '36px', textAlign: 'center', color: 'var(--text-dim)' }}>
                  No audit events matched the selected filter criteria.
                </td>
              </tr>
            ) : (
              paginatedEvents.map((e) => (
                <tr
                  key={e.id}
                  style={{
                    borderBottom: '1px solid var(--border-subtle)',
                    transition: 'background 0.15s ease'
                  }}
                  onMouseEnter={(evt) => evt.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)'}
                  onMouseLeave={(evt) => evt.currentTarget.style.background = 'transparent'}
                >
                  <td style={{ padding: '12px 16px', color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>
                    {new Date(e.timestamp).toLocaleTimeString()}
                  </td>
                  <td style={{ padding: '12px 16px', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-main)' }}>
                    {e.requestId}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>{e.userId}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>{e.userRole}</div>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className={`badge ${e.riskLevel === 'CRITICAL' ? 'badge-critical' : e.riskLevel === 'HIGH' ? 'badge-high' : e.riskLevel === 'MEDIUM' ? 'badge-medium' : 'badge-low'}`}>
                        {e.riskLevel}
                      </span>
                      <strong style={{ fontSize: '0.8rem' }}>{e.riskScore}</strong>
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <strong style={{
                      color: e.action === 'BLOCK' ? 'var(--accent-rose)' : e.action === 'REVIEW' ? 'var(--accent-amber)' : 'var(--accent-emerald)'
                    }}>
                      {e.action}
                    </strong>
                  </td>
                  <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>
                    {e.model}
                  </td>
                  <td style={{ padding: '12px 16px', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: e.violationsSummary && e.violationsSummary !== 'None' ? '#fbbf24' : 'var(--text-dim)' }}>
                    {e.violationsSummary || 'None'}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                    <button
                      id={`btn-inspect-${e.id}`}
                      onClick={() => onSelectEvent(e)}
                      className="btn btn-secondary"
                      style={{ padding: '4px 10px', fontSize: '0.72rem' }}
                    >
                      Inspect
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Pagination Strip */}
        <div style={{
          padding: '14px 20px',
          borderTop: '1px solid var(--border-subtle)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          background: 'rgba(15, 23, 42, 0.5)'
        }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
            Showing <strong>{startIndex + 1}</strong> to <strong>{Math.min(startIndex + pageSize, totalItems)}</strong> of <strong>{totalItems}</strong> entries
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="btn btn-secondary"
              style={{ padding: '4px 10px', fontSize: '0.75rem' }}
            >
              Previous
            </button>

            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
              .map((p, idx, arr) => (
                <React.Fragment key={p}>
                  {idx > 0 && arr[idx - 1] !== p - 1 && (
                    <span style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>...</span>
                  )}
                  <button
                    onClick={() => setCurrentPage(p)}
                    style={{
                      background: currentPage === p ? 'var(--accent-cyan)' : 'transparent',
                      color: currentPage === p ? '#080c14' : 'var(--text-muted)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '6px',
                      width: '28px',
                      height: '28px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.75rem',
                      fontWeight: currentPage === p ? 700 : 500,
                      cursor: 'pointer'
                    }}
                  >
                    {p}
                  </button>
                </React.Fragment>
              ))}

            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="btn btn-secondary"
              style={{ padding: '4px 10px', fontSize: '0.75rem' }}
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
