import { useCallback, useEffect, useState } from 'react';
import { ApiService } from '../services/api';
import ErrorBanner from './ErrorBanner';

function formatAge(createdAt) {
  if (!createdAt) return '—';
  const delta = Date.now() - createdAt;
  if (!Number.isFinite(delta)) return '—';
  const sec = Math.max(0, Math.round(delta / 1000));
  if (sec < 60) return `${sec}s`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  const rem = min % 60;
  if (hr < 48) return rem ? `${hr}h ${rem}m` : `${hr}h`;
  return `${Math.floor(hr / 24)}d`;
}

function when(ms) {
  if (!ms) return '—';
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString();
}

export default function ApprovalsView({ onResolved }) {
  const [pending, setPending] = useState([]);
  const [decided, setDecided] = useState([]);
  const [pendingLoaded, setPendingLoaded] = useState(false);
  const [decidedLoaded, setDecidedLoaded] = useState(false);
  const [notes, setNotes] = useState({});
  const [rowError, setRowError] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyTicket, setBusyTicket] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const [pendingR, allR] = await Promise.allSettled([
      ApiService.getHeld('pending'),
      ApiService.getHeld('all'),
    ]);
    const messages = [pendingR, allR]
      .filter((result) => result.status === 'rejected')
      .map((result) => result.reason?.message || 'Proxy unreachable');
    setError(messages.length ? messages.join(' · ') : null);
    if (pendingR.status === 'fulfilled') {
      setPending(pendingR.value);
      setPendingLoaded(true);
    }
    if (allR.status === 'fulfilled') {
      setDecided(allR.value.filter((item) => item.status !== 'pending'));
      setDecidedLoaded(true);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const decide = async (item, action) => {
    setBusyTicket(item.ticket);
    setRowError((prev) => ({ ...prev, [item.ticket]: null }));
    try {
      const note = notes[item.ticket] || '';
      if (action === 'approve') await ApiService.approveEvent(item.ticket, note);
      else await ApiService.rejectEvent(item.ticket, note);
      if (onResolved) onResolved(item.ticket, action === 'approve' ? 'approved' : 'rejected');
      await load();
    } catch (err) {
      setRowError((prev) => ({ ...prev, [item.ticket]: err?.message || 'Proxy unreachable' }));
    } finally {
      setBusyTicket(null);
    }
  };

  const term = searchTerm.trim().toLowerCase();
  const matches = (item) => {
    if (!term) return true;
    return [item.ticket, item.key, item.category, item.reason, item.status, item.note]
      .some((value) => String(value || '').toLowerCase().includes(term));
  };
  const visiblePending = pending.filter(matches);
  const visibleDecided = decided.filter(matches);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0 }}>Approvals</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', margin: '4px 0 0 0' }}>
            Pending holds, plus tickets that are already approved or rejected.
          </p>
        </div>
        <button onClick={load} className="btn btn-secondary" style={{ fontSize: '0.8rem' }}>Refresh</button>
      </div>

      <ErrorBanner message={error} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
        <div className="glass-card" style={{ padding: '16px 20px' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>PENDING</span>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--accent-amber)' }}>{pendingLoaded ? pending.length : '—'}</div>
        </div>
        <div className="glass-card" style={{ padding: '16px 20px' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>DECIDED</span>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--accent-emerald)' }}>{decidedLoaded ? decided.length : '—'}</div>
        </div>
      </div>

      <div className="glass-card" style={{ padding: '12px 18px' }}>
        <input
          type="text"
          placeholder="Filter by ticket, employee, category, or reason"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            width: '100%',
            background: 'var(--bg-input)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-main)',
            padding: '8px 12px',
            borderRadius: '8px',
            fontSize: '0.82rem'
          }}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {loading && pending.length === 0 ? (
          <div className="glass-card" style={{ padding: '28px', color: 'var(--text-dim)' }}>Loading held tickets…</div>
        ) : visiblePending.length === 0 ? (
          <div className="glass-card" style={{ padding: '28px', color: 'var(--text-dim)' }}>No pending tickets.</div>
        ) : visiblePending.map((item) => (
          <div key={item.ticket} className="glass-card" style={{ padding: '22px', borderLeft: '4px solid var(--accent-amber)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-cyan)', fontSize: '0.85rem' }}>{item.ticket}</div>
                <div style={{ marginTop: '6px', fontSize: '0.85rem' }}>
                  Employee: <strong>{item.key || '—'}</strong> · {item.category || '—'} · age {formatAge(item.created_at)}
                </div>
                <div style={{ marginTop: '6px', color: 'var(--text-muted)', fontSize: '0.82rem' }}>{item.reason || '—'}</div>
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  id={`btn-approve-${item.ticket}`}
                  className="btn btn-success"
                  disabled={busyTicket === item.ticket}
                  onClick={() => decide(item, 'approve')}
                  style={{ fontSize: '0.78rem' }}
                >
                  Approve
                </button>
                <button
                  id={`btn-reject-${item.ticket}`}
                  className="btn btn-danger"
                  disabled={busyTicket === item.ticket}
                  onClick={() => decide(item, 'reject')}
                  style={{ fontSize: '0.78rem' }}
                >
                  Reject
                </button>
              </div>
            </div>
            <input
              type="text"
              value={notes[item.ticket] || ''}
              onChange={(e) => setNotes((prev) => ({ ...prev, [item.ticket]: e.target.value }))}
              placeholder="Optional note"
              style={{
                marginTop: '12px',
                width: '100%',
                background: 'var(--bg-input)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-main)',
                padding: '8px 12px',
                borderRadius: '8px',
                fontSize: '0.82rem'
              }}
            />
            {rowError[item.ticket] ? (
              <div style={{ marginTop: '10px', color: '#fb7185', fontSize: '0.82rem', fontWeight: 600 }}>{rowError[item.ticket]}</div>
            ) : null}
          </div>
        ))}
      </div>

      <div className="glass-card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '16px 18px', fontWeight: 700 }}>Decided</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
          <thead>
            <tr style={{ color: 'var(--text-dim)', textAlign: 'left' }}>
              <th style={cell}>Ticket</th>
              <th style={cell}>Employee</th>
              <th style={cell}>Category</th>
              <th style={cell}>Status</th>
              <th style={cell}>Decided by</th>
              <th style={cell}>When</th>
              <th style={cell}>Note</th>
            </tr>
          </thead>
          <tbody>
            {visibleDecided.length === 0 ? (
              <tr><td colSpan={7} style={{ ...cell, color: 'var(--text-dim)' }}>No decided tickets.</td></tr>
            ) : visibleDecided.map((item) => (
              <tr key={item.ticket} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                <td style={cell}>{item.ticket}</td>
                <td style={cell}>{item.key || '—'}</td>
                <td style={cell}>{item.category || '—'}</td>
                <td style={cell}>{item.status || '—'}</td>
                <td style={cell}>{item.decided_by || '—'}</td>
                <td style={cell}>{when(item.decided_at)}</td>
                <td style={cell}>{item.note || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const cell = { padding: '12px 16px', verticalAlign: 'top' };
