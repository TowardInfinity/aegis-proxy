import React, { useState, useEffect } from 'react';
import { GovernanceApi } from '../../services/governanceApi';
import { useNavigation } from '../../context/NavigationContext';

export default function PoliciesView() {
  const { navigate } = useNavigation();
  const [policies, setPolicies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingPolicy, setEditingPolicy] = useState(null); // modal open for create/edit
  const [rollbackPolicyId, setRollbackPolicyId] = useState(null); // modal open for rollback
  const [rollbackVersion, setRollbackVersion] = useState(1);
  const [feedbackMsg, setFeedbackMsg] = useState(null);

  // Form state
  const [formData, setFormData] = useState({
    policyKey: '',
    name: '',
    category: 'SECURITY',
    description: '',
    priority: 5,
    status: 'ACTIVE',
    rulesJson: '{\n  "keywords": ["jailbreak", "override"],\n  "action": "BLOCK"\n}',
    action: 'BLOCK',
    approvalRequired: false,
    effectiveDate: '',
    expiryDate: '',
    enabled: true
  });

  useEffect(() => {
    loadPolicies();
  }, []);

  const loadPolicies = async () => {
    setLoading(true);
    const data = await GovernanceApi.getPolicies();
    setPolicies(data);
    setLoading(false);
  };

  const showToast = (msg) => {
    setFeedbackMsg(msg);
    setTimeout(() => setFeedbackMsg(null), 3500);
  };

  const handleToggle = async (policy) => {
    const updated = await GovernanceApi.togglePolicy(policy.id, !policy.enabled);
    if (updated) {
      setPolicies(prev => prev.map(p => p.id === policy.id ? updated : p));
      showToast(`Policy ${policy.policyKey} ${updated.enabled ? 'activated' : 'suspended'}`);
    }
  };

  const handleOpenCreate = () => {
    setFormData({
      policyKey: `POL-CUSTOM-${Math.floor(100 + Math.random() * 900)}`,
      name: '',
      category: 'SECURITY',
      description: '',
      priority: 5,
      status: 'ACTIVE',
      rulesJson: '{\n  "keywords": ["confidential", "internal-only"],\n  "action": "BLOCK"\n}',
      action: 'BLOCK',
      approvalRequired: false,
      effectiveDate: new Date().toISOString().split('T')[0],
      expiryDate: '',
      enabled: true
    });
    setEditingPolicy('NEW');
  };

  const handleOpenEdit = (p) => {
    setFormData({
      id: p.id,
      policyKey: p.policyKey,
      name: p.name,
      category: p.category,
      description: p.description || '',
      priority: p.priority || 5,
      status: p.status || 'ACTIVE',
      rulesJson: p.rulesJson || '{\n  "keywords": [],\n  "action": "BLOCK"\n}',
      action: p.action || 'BLOCK',
      approvalRequired: !!p.approvalRequired,
      effectiveDate: p.effectiveDate ? p.effectiveDate.split('T')[0] : '',
      expiryDate: p.expiryDate ? p.expiryDate.split('T')[0] : '',
      enabled: p.enabled !== false,
      version: p.version
    });
    setEditingPolicy(p);
  };

  const handleSavePolicy = async (e) => {
    e.preventDefault();
    try {
      JSON.parse(formData.rulesJson); // Validate JSON
    } catch (err) {
      alert('Invalid Rules JSON: ' + err.message);
      return;
    }

    const payload = {
      ...formData,
      effectiveDate: formData.effectiveDate ? `${formData.effectiveDate}T00:00:00` : null,
      expiryDate: formData.expiryDate ? `${formData.expiryDate}T23:59:59` : null
    };

    const saved = await GovernanceApi.savePolicy(payload);
    if (saved) {
      showToast(`Policy ${saved.policyKey} successfully saved (v${saved.version || 1})`);
      setEditingPolicy(null);
      loadPolicies();
    }
  };

  const handleConfirmRollback = async () => {
    if (!rollbackPolicyId) return;
    const res = await GovernanceApi.rollbackPolicy(rollbackPolicyId, rollbackVersion);
    if (res) {
      showToast(`Policy rolled back to version v${rollbackVersion}`);
      setRollbackPolicyId(null);
      loadPolicies();
    }
  };

  const categories = ['ALL', 'SECURITY', 'FINANCIAL', 'DATA_PRIVACY', 'CODE_INTEGRITY', 'COMPLIANCE'];

  const filtered = policies.filter(p => {
    const matchCat = selectedCategory === 'ALL' || p.category === selectedCategory;
    const matchSearch = (p.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.policyKey || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.description || '').toLowerCase().includes(searchQuery.toLowerCase());
    return matchCat && matchSearch;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Toast */}
      {feedbackMsg && (
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
          {feedbackMsg}
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
            }}>POLICY ENGINE</span>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Deterministic Rule Enforcement & Versioning
            </span>
          </div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 800, margin: 0, color: '#f8fafc' }}>
            AI Policies Management
          </h1>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={() => navigate('gov-simulator')}
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-glass)',
              borderRadius: '8px',
              padding: '10px 16px',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            ▶ Test in Simulator
          </button>
          <button
            onClick={handleOpenCreate}
            id="btn-create-policy"
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
            <span>+</span> Create Policy
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '16px',
        flexWrap: 'wrap',
        background: 'var(--bg-glass-card)',
        padding: '16px 20px',
        borderRadius: '12px',
        border: '1px solid var(--border-glass)'
      }}>
        {/* Category Pills */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              style={{
                background: selectedCategory === cat ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.04)',
                color: selectedCategory === cat ? '#0f172a' : 'var(--text-secondary)',
                border: selectedCategory === cat ? 'none' : '1px solid var(--border-glass)',
                padding: '6px 14px',
                borderRadius: '8px',
                fontSize: '0.78rem',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Search */}
        <div style={{ minWidth: '260px' }}>
          <input
            type="text"
            placeholder="Search policies by key, name, or rule..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
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
      </div>

      {/* Policies Table */}
      <div style={{
        background: 'var(--bg-glass-card)',
        borderRadius: '14px',
        border: '1px solid var(--border-glass)',
        overflow: 'hidden'
      }}>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            Loading AI policies...
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            No policies matching your filter.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--border-glass)', color: 'var(--text-secondary)' }}>
                <th style={{ padding: '14px 18px', fontWeight: 600 }}>KEY & NAME</th>
                <th style={{ padding: '14px 18px', fontWeight: 600 }}>CATEGORY</th>
                <th style={{ padding: '14px 18px', fontWeight: 600 }}>ACTION</th>
                <th style={{ padding: '14px 18px', fontWeight: 600 }}>PRIORITY</th>
                <th style={{ padding: '14px 18px', fontWeight: 600 }}>VERSION</th>
                <th style={{ padding: '14px 18px', fontWeight: 600 }}>APPROVAL</th>
                <th style={{ padding: '14px 18px', fontWeight: 600 }}>STATUS</th>
                <th style={{ padding: '14px 18px', fontWeight: 600, textAlign: 'right' }}>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(policy => (
                <tr
                  key={policy.id}
                  style={{
                    borderBottom: '1px solid var(--border-glass)',
                    transition: 'background 0.2s',
                    opacity: policy.enabled ? 1 : 0.65
                  }}
                >
                  <td style={{ padding: '16px 18px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      <span style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: 'var(--accent-cyan)', fontWeight: 600 }}>
                        {policy.policyKey}
                      </span>
                      <span style={{ fontWeight: 700, color: '#f8fafc' }}>
                        {policy.name}
                      </span>
                      <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', maxWidth: '320px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {policy.description}
                      </span>
                    </div>
                  </td>

                  <td style={{ padding: '16px 18px' }}>
                    <span style={{
                      padding: '3px 8px',
                      borderRadius: '6px',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      background: 'rgba(56, 189, 248, 0.1)',
                      color: 'var(--accent-cyan)',
                      border: '1px solid rgba(56, 189, 248, 0.2)'
                    }}>
                      {policy.category}
                    </span>
                  </td>

                  <td style={{ padding: '16px 18px' }}>
                    <span style={{
                      padding: '3px 8px',
                      borderRadius: '6px',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      background: policy.action === 'BLOCK' ? 'rgba(239, 68, 68, 0.15)' :
                                  policy.action === 'REVIEW' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                      color: policy.action === 'BLOCK' ? '#f87171' :
                             policy.action === 'REVIEW' ? '#fbbf24' : '#34d399',
                      border: `1px solid ${policy.action === 'BLOCK' ? 'rgba(239,68,68,0.3)' : policy.action === 'REVIEW' ? 'rgba(245,158,11,0.3)' : 'rgba(16,185,129,0.3)'}`
                    }}>
                      {policy.action}
                    </span>
                  </td>

                  <td style={{ padding: '16px 18px' }}>
                    <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>
                      P{policy.priority}
                    </span>
                  </td>

                  <td style={{ padding: '16px 18px' }}>
                    <span style={{
                      background: 'rgba(255,255,255,0.06)',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontFamily: 'monospace',
                      fontSize: '0.78rem',
                      color: '#94a3b8'
                    }}>
                      v{policy.version || 1}
                    </span>
                  </td>

                  <td style={{ padding: '16px 18px' }}>
                    {policy.approvalRequired ? (
                      <span style={{ color: '#fbbf24', fontSize: '0.75rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span>⚡</span> Required
                      </span>
                    ) : (
                      <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>Auto</span>
                    )}
                  </td>

                  <td style={{ padding: '16px 18px' }}>
                    <button
                      onClick={() => handleToggle(policy)}
                      style={{
                        padding: '4px 10px',
                        borderRadius: '20px',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        background: policy.enabled ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                        color: policy.enabled ? '#34d399' : '#f87171'
                      }}
                      title="Click to toggle status"
                    >
                      {policy.enabled ? '● ACTIVE' : '○ SUSPENDED'}
                    </button>
                  </td>

                  <td style={{ padding: '16px 18px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                      <button
                        onClick={() => handleOpenEdit(policy)}
                        style={{
                          background: 'rgba(255,255,255,0.05)',
                          color: 'var(--accent-cyan)',
                          border: '1px solid var(--border-glass)',
                          padding: '5px 10px',
                          borderRadius: '6px',
                          fontSize: '0.75rem',
                          cursor: 'pointer'
                        }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => {
                          setRollbackPolicyId(policy.id);
                          setRollbackVersion(Math.max(1, (policy.version || 1) - 1));
                        }}
                        style={{
                          background: 'rgba(255,255,255,0.03)',
                          color: 'var(--text-secondary)',
                          border: '1px solid var(--border-glass)',
                          padding: '5px 8px',
                          borderRadius: '6px',
                          fontSize: '0.75rem',
                          cursor: 'pointer'
                        }}
                        title="Rollback version"
                      >
                        ⟲ Rollback
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Edit / Create Policy Modal */}
      {editingPolicy && (
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
            maxWidth: '640px',
            maxHeight: '90vh',
            overflowY: 'auto',
            padding: '28px',
            boxShadow: 'var(--shadow-card)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#f8fafc' }}>
                {editingPolicy === 'NEW' ? 'Create New AI Policy' : `Edit Policy: ${formData.policyKey}`}
              </h2>
              <button
                onClick={() => setEditingPolicy(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  fontSize: '1.2rem',
                  cursor: 'pointer'
                }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSavePolicy} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '5px' }}>
                    POLICY KEY
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.policyKey}
                    onChange={(e) => setFormData({ ...formData, policyKey: e.target.value })}
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
                    CATEGORY
                  </label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
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
                    <option value="SECURITY">SECURITY</option>
                    <option value="FINANCIAL">FINANCIAL</option>
                    <option value="DATA_PRIVACY">DATA_PRIVACY</option>
                    <option value="CODE_INTEGRITY">CODE_INTEGRITY</option>
                    <option value="COMPLIANCE">COMPLIANCE</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '5px' }}>
                  POLICY NAME
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Pre-Release Earnings Protection"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
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
                  DESCRIPTION
                </label>
                <textarea
                  rows="2"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
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

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '5px' }}>
                    ACTION
                  </label>
                  <select
                    value={formData.action}
                    onChange={(e) => setFormData({ ...formData, action: e.target.value })}
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
                    <option value="BLOCK">BLOCK</option>
                    <option value="REVIEW">REVIEW</option>
                    <option value="REDACT">REDACT</option>
                    <option value="ALLOW">ALLOW</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '5px' }}>
                    PRIORITY (1=Highest)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) || 1 })}
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
                    APPROVAL REQUIRED
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', height: '36px' }}>
                    <input
                      type="checkbox"
                      checked={formData.approvalRequired}
                      onChange={(e) => setFormData({ ...formData, approvalRequired: e.target.checked })}
                      style={{ cursor: 'pointer', transform: 'scale(1.2)' }}
                    />
                    <span style={{ fontSize: '0.8rem', marginLeft: '8px', color: '#f8fafc' }}>
                      {formData.approvalRequired ? 'Yes' : 'No'}
                    </span>
                  </div>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '5px' }}>
                  POLICY RULES (JSON DEFINITION)
                </label>
                <textarea
                  rows="5"
                  required
                  value={formData.rulesJson}
                  onChange={(e) => setFormData({ ...formData, rulesJson: e.target.value })}
                  style={{
                    width: '100%',
                    fontFamily: 'monospace',
                    background: '#090d16',
                    border: '1px solid var(--border-glass)',
                    borderRadius: '8px',
                    padding: '10px 12px',
                    color: '#38bdf8',
                    fontSize: '0.82rem'
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '5px' }}>
                    EFFECTIVE DATE
                  </label>
                  <input
                    type="date"
                    value={formData.effectiveDate}
                    onChange={(e) => setFormData({ ...formData, effectiveDate: e.target.value })}
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
                    EXPIRY DATE
                  </label>
                  <input
                    type="date"
                    value={formData.expiryDate}
                    onChange={(e) => setFormData({ ...formData, expiryDate: e.target.value })}
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
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '12px' }}>
                <button
                  type="button"
                  onClick={() => setEditingPolicy(null)}
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid var(--border-glass)',
                    color: 'var(--text-secondary)',
                    borderRadius: '8px',
                    padding: '9px 16px',
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
                    padding: '9px 20px',
                    fontSize: '0.85rem',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Save Policy
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Rollback Version Modal */}
      {rollbackPolicyId && (
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
            maxWidth: '420px',
            padding: '24px',
            boxShadow: 'var(--shadow-card)'
          }}>
            <h3 style={{ margin: '0 0 12px 0', color: '#f8fafc', fontSize: '1.1rem' }}>
              Rollback Policy Version
            </h3>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              Select historical version to restore. A new revision will be created containing the previous configuration.
            </p>
            <div style={{ marginBottom: '18px' }}>
              <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                TARGET REVISION
              </label>
              <input
                type="number"
                min="1"
                value={rollbackVersion}
                onChange={(e) => setRollbackVersion(parseInt(e.target.value) || 1)}
                style={{
                  width: '100%',
                  background: 'rgba(0,0,0,0.3)',
                  border: '1px solid var(--border-glass)',
                  borderRadius: '8px',
                  padding: '8px 12px',
                  color: '#f8fafc',
                  fontSize: '0.85rem'
                }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={() => setRollbackPolicyId(null)}
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
                onClick={handleConfirmRollback}
                style={{
                  background: 'var(--accent-cyan)',
                  color: '#0f172a',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '8px 16px',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Confirm Rollback
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
