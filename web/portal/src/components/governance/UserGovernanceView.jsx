import React, { useState, useEffect } from 'react';
import { GovernanceApi } from '../../services/governanceApi';

export default function UserGovernanceView() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingUser, setEditingUser] = useState(null);
  const [restrictModalUser, setRestrictModalUser] = useState(null);
  const [restrictionReason, setRestrictionReason] = useState('');
  const [toastMessage, setToastMessage] = useState(null);

  const [formData, setFormData] = useState({
    userId: '',
    department: 'Engineering',
    role: 'DEVELOPER',
    customDailyTokenLimit: 100000,
    canBypassApproval: false,
    isRestricted: false,
    restrictionReason: '',
    allowedCategories: 'CODE_INTEGRITY, ENGINEERING',
    restrictedCategories: 'FINANCIAL'
  });

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    const data = await GovernanceApi.getUsers();
    setUsers(data);
    setLoading(false);
  };

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleOpenEdit = (user) => {
    setFormData({ ...user });
    setEditingUser(user);
  };

  const handleOpenCreate = () => {
    setFormData({
      userId: '',
      department: 'Engineering',
      role: 'DEVELOPER',
      customDailyTokenLimit: 150000,
      canBypassApproval: false,
      isRestricted: false,
      restrictionReason: '',
      allowedCategories: 'ENGINEERING',
      restrictedCategories: 'FINANCIAL, LEGAL'
    });
    setEditingUser('NEW');
  };

  const handleSaveUser = async (e) => {
    e.preventDefault();
    const saved = await GovernanceApi.saveUser(formData);
    if (saved) {
      showToast(`User ${saved.userId} governance policy saved`);
      setEditingUser(null);
      loadUsers();
    }
  };

  const handleToggleRestriction = async (user) => {
    if (user.isRestricted) {
      // Unrestrict directly
      const updated = await GovernanceApi.toggleUserRestriction(user.id, false, null);
      if (updated) {
        showToast(`Restriction lifted for ${user.userId}`);
        loadUsers();
      }
    } else {
      // Open modal to capture restriction reason
      setRestrictModalUser(user);
      setRestrictionReason('');
    }
  };

  const handleConfirmRestriction = async () => {
    if (!restrictModalUser) return;
    const updated = await GovernanceApi.toggleUserRestriction(restrictModalUser.id, true, restrictionReason);
    if (updated) {
      showToast(`User ${restrictModalUser.userId} has been restricted`);
      setRestrictModalUser(null);
      loadUsers();
    }
  };

  const filtered = users.filter(u => {
    return (u.userId || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (u.department || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (u.role || '').toLowerCase().includes(searchQuery.toLowerCase());
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Toast */}
      {toastMessage && (
        <div style={{
          position: 'fixed',
          bottom: '48px',
          right: '28px',
          background: 'rgba(15, 23, 42, 0.95)',
          color: '#f8fafc',
          border: '1px solid var(--border-highlight)',
          boxShadow: 'var(--shadow-glow-cyan)',
          padding: '12px 20px',
          borderRadius: '10px',
          fontSize: '0.82rem',
          fontWeight: 600,
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          gap: '10px'
        }}>
          <span style={{ color: 'var(--accent-cyan)' }}>●</span>
          {toastMessage}
        </div>
      )}

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
            }}>IDENTITY GOVERNANCE</span>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              User Permissions, Per-User Token Ceilings & Security Restrictions
            </span>
          </div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 800, margin: 0, color: '#f8fafc' }}>
            User Governance & Access
          </h1>
        </div>

        <button
          onClick={handleOpenCreate}
          id="btn-register-user"
          style={{
            background: 'linear-gradient(135deg, var(--accent-cyan), var(--accent-blue))',
            color: '#0f172a',
            border: 'none',
            borderRadius: '8px',
            padding: '10px 18px',
            fontSize: '0.85rem',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: 'var(--shadow-glow-cyan)'
          }}
        >
          <span>+</span> Add Governed User
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
          placeholder="Search by user ID, department, or role..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            width: '100%',
            maxWidth: '360px',
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

      {/* Users Table */}
      <div style={{
        background: 'var(--bg-glass-card)',
        borderRadius: '14px',
        border: '1px solid var(--border-glass)',
        overflow: 'hidden'
      }}>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            Loading governed users...
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            No users found matching your search.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--border-glass)', color: 'var(--text-secondary)' }}>
                <th style={{ padding: '14px 18px', fontWeight: 600 }}>USER IDENTIFIER</th>
                <th style={{ padding: '14px 18px', fontWeight: 600 }}>DEPARTMENT</th>
                <th style={{ padding: '14px 18px', fontWeight: 600 }}>ROLE</th>
                <th style={{ padding: '14px 18px', fontWeight: 600 }}>DAILY TOKEN CEILING</th>
                <th style={{ padding: '14px 18px', fontWeight: 600 }}>BYPASS APPROVAL</th>
                <th style={{ padding: '14px 18px', fontWeight: 600 }}>RESTRICTION STATUS</th>
                <th style={{ padding: '14px 18px', fontWeight: 600, textAlign: 'right' }}>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(user => (
                <tr
                  key={user.id}
                  style={{
                    borderBottom: '1px solid var(--border-glass)',
                    opacity: user.isRestricted ? 0.7 : 1
                  }}
                >
                  <td style={{ padding: '16px 18px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontWeight: 700, color: '#f8fafc' }}>
                        {user.userId}
                      </span>
                      {user.isRestricted && (
                        <span style={{ fontSize: '0.72rem', color: '#f87171' }}>
                          Reason: {user.restrictionReason || 'Security hold'}
                        </span>
                      )}
                    </div>
                  </td>

                  <td style={{ padding: '16px 18px' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>
                      {user.department}
                    </span>
                  </td>

                  <td style={{ padding: '16px 18px' }}>
                    <span style={{
                      padding: '3px 8px',
                      borderRadius: '6px',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      background: 'rgba(56, 189, 248, 0.12)',
                      color: '#38bdf8'
                    }}>
                      {user.role}
                    </span>
                  </td>

                  <td style={{ padding: '16px 18px' }}>
                    <span style={{ fontFamily: 'monospace', color: '#f8fafc' }}>
                      {(user.customDailyTokenLimit || 0).toLocaleString()} tokens
                    </span>
                  </td>

                  <td style={{ padding: '16px 18px' }}>
                    {user.canBypassApproval ? (
                      <span style={{ color: '#34d399', fontSize: '0.75rem', fontWeight: 700 }}>
                        ✓ GRANTED
                      </span>
                    ) : (
                      <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                        Enforced
                      </span>
                    )}
                  </td>

                  <td style={{ padding: '16px 18px' }}>
                    <button
                      onClick={() => handleToggleRestriction(user)}
                      style={{
                        padding: '4px 10px',
                        borderRadius: '20px',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        background: user.isRestricted ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.2)',
                        color: user.isRestricted ? '#f87171' : '#34d399'
                      }}
                      title="Click to toggle restriction"
                    >
                      {user.isRestricted ? 'RESTRICTED' : 'CLEAR'}
                    </button>
                  </td>

                  <td style={{ padding: '16px 18px', textAlign: 'right' }}>
                    <button
                      onClick={() => handleOpenEdit(user)}
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
                      Configure
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Edit / Create User Modal */}
      {editingUser && (
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
            maxWidth: '560px',
            maxHeight: '90vh',
            overflowY: 'auto',
            padding: '28px',
            boxShadow: 'var(--shadow-card)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#f8fafc' }}>
                {editingUser === 'NEW' ? 'Add Governed User' : `Configure User: ${formData.userId}`}
              </h2>
              <button
                onClick={() => setEditingUser(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '1.2rem', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveUser} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '5px' }}>
                  USER IDENTIFIER (Email or SSO ID)
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. engineer.jane@enterprise.ai"
                  value={formData.userId}
                  onChange={(e) => setFormData({ ...formData, userId: e.target.value })}
                  style={{
                    width: '100%',
                    background: 'rgba(0,0,0,0.3)',
                    border: '1px solid var(--border-glass)',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    color: '#f8fafc',
                    fontSize: '0.82rem'
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '5px' }}>
                    DEPARTMENT
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.department}
                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                    style={{
                      width: '100%',
                      background: 'rgba(0,0,0,0.3)',
                      border: '1px solid var(--border-glass)',
                      borderRadius: '8px',
                      padding: '8px 12px',
                      color: '#f8fafc',
                      fontSize: '0.82rem'
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '5px' }}>
                    ROLE
                  </label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                    style={{
                      width: '100%',
                      background: '#0f172a',
                      border: '1px solid var(--border-glass)',
                      borderRadius: '8px',
                      padding: '8px 12px',
                      color: '#f8fafc',
                      fontSize: '0.82rem'
                    }}
                  >
                    <option value="DEVELOPER">DEVELOPER</option>
                    <option value="ANALYST">ANALYST</option>
                    <option value="EXECUTIVE">EXECUTIVE</option>
                    <option value="RESEARCHER">RESEARCHER</option>
                    <option value="AUDITOR">AUDITOR</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '5px' }}>
                  CUSTOM DAILY TOKEN LIMIT
                </label>
                <input
                  type="number"
                  value={formData.customDailyTokenLimit}
                  onChange={(e) => setFormData({ ...formData, customDailyTokenLimit: parseInt(e.target.value) || 0 })}
                  style={{
                    width: '100%',
                    background: 'rgba(0,0,0,0.3)',
                    border: '1px solid var(--border-glass)',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    color: '#f8fafc',
                    fontSize: '0.82rem'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '5px' }}>
                  ALLOWED CATEGORIES (Comma-Separated)
                </label>
                <input
                  type="text"
                  placeholder="ENGINEERING, GENERAL"
                  value={formData.allowedCategories}
                  onChange={(e) => setFormData({ ...formData, allowedCategories: e.target.value })}
                  style={{
                    width: '100%',
                    background: 'rgba(0,0,0,0.3)',
                    border: '1px solid var(--border-glass)',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    color: '#f8fafc',
                    fontSize: '0.82rem'
                  }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', marginTop: '6px' }}>
                <input
                  type="checkbox"
                  checked={formData.canBypassApproval}
                  onChange={(e) => setFormData({ ...formData, canBypassApproval: e.target.checked })}
                  style={{ cursor: 'pointer', transform: 'scale(1.2)' }}
                />
                <span style={{ fontSize: '0.8rem', marginLeft: '10px', color: '#f8fafc' }}>
                  Allow Review Bypass (Skip Human-in-the-Loop review gates for this user)
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '14px' }}>
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid var(--border-glass)',
                    color: 'var(--text-secondary)',
                    borderRadius: '8px',
                    padding: '8px 16px',
                    fontSize: '0.85rem',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    background: 'linear-gradient(135deg, var(--accent-cyan), var(--accent-blue))',
                    color: '#0f172a',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '8px 20px',
                    fontSize: '0.85rem',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Save User Policy
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Restriction Modal */}
      {restrictModalUser && (
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
            border: '1px solid rgba(239, 68, 68, 0.5)',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '460px',
            padding: '24px',
            boxShadow: 'var(--shadow-card)'
          }}>
            <h3 style={{ margin: '0 0 10px 0', color: '#f87171', fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>🛑</span> Enforce Security Restriction
            </h3>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '14px' }}>
              Restrict AI Gateway access for user <strong>{restrictModalUser.userId}</strong>. All outbound LLM requests from this user will immediately be blocked.
            </p>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                RESTRICTION REASON / SECURITY INCIDENT TICKET
              </label>
              <textarea
                rows="3"
                required
                placeholder="e.g. Flagged for repetitive prompt injection probes"
                value={restrictionReason}
                onChange={(e) => setRestrictionReason(e.target.value)}
                style={{
                  width: '100%',
                  background: 'rgba(0,0,0,0.3)',
                  border: '1px solid var(--border-glass)',
                  borderRadius: '8px',
                  padding: '8px 12px',
                  color: '#f8fafc',
                  fontSize: '0.82rem'
                }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={() => setRestrictModalUser(null)}
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid var(--border-glass)',
                  color: 'var(--text-secondary)',
                  borderRadius: '8px',
                  padding: '8px 14px',
                  fontSize: '0.82rem',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmRestriction}
                disabled={!restrictionReason.trim()}
                style={{
                  background: '#ef4444',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '8px 16px',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  cursor: restrictionReason.trim() ? 'pointer' : 'not-allowed',
                  opacity: restrictionReason.trim() ? 1 : 0.5
                }}
              >
                Restrict User
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
