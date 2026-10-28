import React, { useState, useEffect } from 'react';
import { GovernanceApi } from '../../services/governanceApi';

export default function ApprovalPoliciesView() {
  const [approvalPolicies, setApprovalPolicies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingPolicy, setEditingPolicy] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);

  const [formData, setFormData] = useState({
    policyKey: '',
    name: '',
    triggerCategory: 'HIGH_RISK',
    workflowType: 'MULTI_LEVEL',
    primaryApproverRole: 'SECURITY_OFFICER',
    secondaryApproverRole: 'CISO',
    escalationRole: 'VP_SECURITY',
    escalationHours: 24,
    autoExpiryHours: 48,
    delegateApprovalRole: 'DEPUTY_CISO',
    allowSelfApproval: false,
    enabled: true
  });

  useEffect(() => {
    loadApprovalPolicies();
  }, []);

  const loadApprovalPolicies = async () => {
    setLoading(true);
    const data = await GovernanceApi.getApprovalPolicies();
    setApprovalPolicies(data);
    setLoading(false);
  };

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleOpenEdit = (p) => {
    setFormData({ ...p });
    setEditingPolicy(p);
  };

  const handleOpenCreate = () => {
    setFormData({
      policyKey: `APPR-${Math.floor(100 + Math.random() * 900)}`,
      name: '',
      triggerCategory: 'HIGH_RISK',
      workflowType: 'SINGLE_APPROVAL',
      primaryApproverRole: 'SECURITY_OFFICER',
      secondaryApproverRole: '',
      escalationRole: 'CISO',
      escalationHours: 12,
      autoExpiryHours: 24,
      delegateApprovalRole: '',
      allowSelfApproval: false,
      enabled: true
    });
    setEditingPolicy('NEW');
  };

  const handleSavePolicy = async (e) => {
    e.preventDefault();
    const saved = await GovernanceApi.saveApprovalPolicy(formData);
    if (saved) {
      showToast(`Approval Workflow "${saved.name}" saved successfully`);
      setEditingPolicy(null);
      loadApprovalPolicies();
    }
  };

  const getWorkflowBadgeColor = (type) => {
    switch (type) {
      case 'SINGLE_APPROVAL': return '#38bdf8';
      case 'MULTI_LEVEL': return '#a855f7';
      case 'PARALLEL': return '#34d399';
      case 'ESCALATION': return '#fbbf24';
      default: return '#94a3b8';
    }
  };

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
            }}>GATEWAY WORKFLOWS</span>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Configurable Human-in-the-Loop Review Gates
            </span>
          </div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 800, margin: 0, color: '#f8fafc' }}>
            Approval Policy Engine
          </h1>
        </div>

        <button
          onClick={handleOpenCreate}
          id="btn-create-approval-policy"
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
          <span>+</span> Create Workflow
        </button>
      </div>

      {/* Workflow Cards */}
      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
          Loading approval workflows...
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))',
          gap: '20px'
        }}>
          {approvalPolicies.map(p => {
            const badgeColor = getWorkflowBadgeColor(p.workflowType);

            return (
              <div
                key={p.id}
                style={{
                  background: 'var(--bg-glass-card)',
                  borderRadius: '14px',
                  border: '1px solid var(--border-glass)',
                  padding: '22px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '16px',
                  boxShadow: 'var(--shadow-card)'
                }}
              >
                <div>
                  {/* Top Bar with Trigger Category & Workflow Type */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontSize: '0.7rem',
                      fontWeight: 800,
                      background: 'rgba(239, 68, 68, 0.15)',
                      color: '#f87171',
                      border: '1px solid rgba(239, 68, 68, 0.3)'
                    }}>
                      ⚡ TRIGGER: {p.triggerCategory}
                    </span>

                    <span style={{
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      color: badgeColor,
                      border: `1px solid ${badgeColor}40`,
                      background: `${badgeColor}15`
                    }}>
                      {p.workflowType}
                    </span>
                  </div>

                  <h3 style={{ margin: '8px 0 2px 0', fontSize: '1.2rem', color: '#f8fafc', fontWeight: 700 }}>
                    {p.name}
                  </h3>
                  <span style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    Policy Key: {p.policyKey}
                  </span>

                  {/* Chain of Custody Box */}
                  <div style={{
                    background: 'rgba(0,0,0,0.25)',
                    padding: '14px',
                    borderRadius: '8px',
                    marginTop: '14px',
                    fontSize: '0.78rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Primary Reviewer:</span>
                      <strong style={{ color: '#38bdf8' }}>{p.primaryApproverRole}</strong>
                    </div>

                    {p.secondaryApproverRole && (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Secondary Reviewer:</span>
                        <strong style={{ color: '#a855f7' }}>{p.secondaryApproverRole}</strong>
                      </div>
                    )}

                    {p.escalationRole && (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Escalation Path:</span>
                        <strong style={{ color: '#fbbf24' }}>
                          {p.escalationRole} (after {p.escalationHours || 24}h)
                        </strong>
                      </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Auto-Expiry Timeout:</span>
                      <strong style={{ color: '#94a3b8' }}>
                        {p.autoExpiryHours || 48} Hours
                      </strong>
                    </div>

                    {p.delegateApprovalRole && (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Delegate Delegate:</span>
                        <span style={{ color: '#cbd5e1' }}>{p.delegateApprovalRole}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer Edit Button */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  borderTop: '1px solid var(--border-glass)',
                  paddingTop: '12px'
                }}>
                  <button
                    onClick={() => handleOpenEdit(p)}
                    style={{
                      background: 'rgba(255,255,255,0.05)',
                      color: 'var(--accent-cyan)',
                      border: '1px solid var(--border-glass)',
                      padding: '6px 14px',
                      borderRadius: '6px',
                      fontSize: '0.78rem',
                      cursor: 'pointer'
                    }}
                  >
                    Edit Workflow
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Edit / Create Workflow Modal */}
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
            maxWidth: '600px',
            maxHeight: '90vh',
            overflowY: 'auto',
            padding: '28px',
            boxShadow: 'var(--shadow-card)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#f8fafc' }}>
                {editingPolicy === 'NEW' ? 'Configure Approval Workflow' : `Edit Workflow: ${formData.name}`}
              </h2>
              <button
                onClick={() => setEditingPolicy(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '1.2rem', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSavePolicy} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
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
                    TRIGGER CATEGORY
                  </label>
                  <select
                    value={formData.triggerCategory}
                    onChange={(e) => setFormData({ ...formData, triggerCategory: e.target.value })}
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
                    <option value="HIGH_RISK">High Risk Prompts</option>
                    <option value="FINANCIAL">Finance & Material Statements</option>
                    <option value="LEGAL">Legal & Regulatory Analysis</option>
                    <option value="SOURCE_CODE">Source Code Ingestion</option>
                    <option value="CUSTOMER_DATA">Customer Data & PII</option>
                    <option value="CRITICAL_SECRETS">Critical Secrets & Credentials</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '5px' }}>
                  WORKFLOW NAME
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Critical Financial Statement Review Gate"
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
                  WORKFLOW TOPOLOGY
                </label>
                <select
                  value={formData.workflowType}
                  onChange={(e) => setFormData({ ...formData, workflowType: e.target.value })}
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
                  <option value="SINGLE_APPROVAL">Single Approval (Any authorized reviewer)</option>
                  <option value="MULTI_LEVEL">Multi-Level Approval (Sequential sign-off required)</option>
                  <option value="PARALLEL">Parallel Approval (Consensus of 2+ reviewers)</option>
                  <option value="ESCALATION">Escalation (Auto-escalate on inactivity)</option>
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '5px' }}>
                    PRIMARY APPROVER ROLE
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="SECURITY_OFFICER"
                    value={formData.primaryApproverRole}
                    onChange={(e) => setFormData({ ...formData, primaryApproverRole: e.target.value })}
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
                    SECONDARY APPROVER ROLE (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="CISO or VP_LEGAL"
                    value={formData.secondaryApproverRole}
                    onChange={(e) => setFormData({ ...formData, secondaryApproverRole: e.target.value })}
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

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '5px' }}>
                    ESCALATION ROLE
                  </label>
                  <input
                    type="text"
                    placeholder="CFO or CISO"
                    value={formData.escalationRole}
                    onChange={(e) => setFormData({ ...formData, escalationRole: e.target.value })}
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
                    ESCALATE AFTER (Hours)
                  </label>
                  <input
                    type="number"
                    value={formData.escalationHours}
                    onChange={(e) => setFormData({ ...formData, escalationHours: parseInt(e.target.value) || 0 })}
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

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '5px' }}>
                    AUTO-EXPIRY TIMEOUT (Hours)
                  </label>
                  <input
                    type="number"
                    value={formData.autoExpiryHours}
                    onChange={(e) => setFormData({ ...formData, autoExpiryHours: parseInt(e.target.value) || 0 })}
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
                    DELEGATE APPROVAL ROLE
                  </label>
                  <input
                    type="text"
                    placeholder="DEPUTY_OFFICER"
                    value={formData.delegateApprovalRole}
                    onChange={(e) => setFormData({ ...formData, delegateApprovalRole: e.target.value })}
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

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '14px' }}>
                <button
                  type="button"
                  onClick={() => setEditingPolicy(null)}
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
                  Save Workflow
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
