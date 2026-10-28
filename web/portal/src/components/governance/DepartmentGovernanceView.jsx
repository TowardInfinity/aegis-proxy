import React, { useState, useEffect } from 'react';
import { GovernanceApi } from '../../services/governanceApi';

export default function DepartmentGovernanceView() {
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingDept, setEditingDept] = useState(null);
  const [overrideModalDept, setOverrideModalDept] = useState(null);
  const [overrideReason, setOverrideReason] = useState('');
  const [toastMessage, setToastMessage] = useState(null);

  const [formData, setFormData] = useState({
    departmentName: '',
    departmentCode: '',
    dailyTokenLimit: 5000000,
    monthlyCostLimitUsd: 5000.0,
    currentMonthlySpendUsd: 0.0,
    allowedModels: 'gpt-4o, claude-3-5-sonnet',
    blockedModels: 'uncensored-v1',
    allowedPromptCategories: 'CUSTOMER_SERVICE, ENGINEERING',
    restrictedCategories: 'FINANCIAL',
    enforceBusinessHours: false,
    businessHoursStart: '09:00',
    businessHoursEnd: '18:00',
    businessTimezone: 'UTC',
    emergencyOverrideActive: false
  });

  useEffect(() => {
    loadDepartments();
  }, []);

  const loadDepartments = async () => {
    setLoading(true);
    const data = await GovernanceApi.getDepartments();
    setDepartments(data);
    setLoading(false);
  };

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleOpenEdit = (dept) => {
    setFormData({ ...dept });
    setEditingDept(dept);
  };

  const handleOpenCreate = () => {
    setFormData({
      departmentName: '',
      departmentCode: 'DEPT-' + Math.floor(100 + Math.random() * 900),
      dailyTokenLimit: 3000000,
      monthlyCostLimitUsd: 3500.0,
      currentMonthlySpendUsd: 0.0,
      allowedModels: 'gpt-4o, gemini-1.5-pro',
      blockedModels: 'uncensored-v1',
      allowedPromptCategories: 'MARKETING, CUSTOMER_SERVICE',
      restrictedCategories: 'FINANCIAL, CODE_INTEGRITY',
      enforceBusinessHours: false,
      businessHoursStart: '09:00',
      businessHoursEnd: '18:00',
      businessTimezone: 'UTC',
      emergencyOverrideActive: false
    });
    setEditingDept('NEW');
  };

  const handleSaveDepartment = async (e) => {
    e.preventDefault();
    const saved = await GovernanceApi.saveDepartment(formData);
    if (saved) {
      showToast(`Department ${saved.departmentName} updated`);
      setEditingDept(null);
      loadDepartments();
    }
  };

  const handleToggleOverride = async (dept) => {
    if (dept.emergencyOverrideActive) {
      // Turn off directly
      const updated = await GovernanceApi.toggleEmergencyOverride(dept.id, false, null);
      if (updated) {
        showToast(`Emergency override deactivated for ${dept.departmentName}`);
        loadDepartments();
      }
    } else {
      // Open modal to capture reason
      setOverrideModalDept(dept);
      setOverrideReason('');
    }
  };

  const handleConfirmOverride = async () => {
    if (!overrideModalDept) return;
    const updated = await GovernanceApi.toggleEmergencyOverride(overrideModalDept.id, true, overrideReason);
    if (updated) {
      showToast(`Emergency override ACTIVATED for ${overrideModalDept.departmentName}`);
      setOverrideModalDept(null);
      loadDepartments();
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
            }}>ORGANIZATIONAL GOVERNANCE</span>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Token Quotas, Cost Ceilings & Model Allow/Block Lists
            </span>
          </div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 800, margin: 0, color: '#f8fafc' }}>
            Department Governance & Quotas
          </h1>
        </div>

        <button
          onClick={handleOpenCreate}
          id="btn-create-department"
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
          <span>+</span> Add Department
        </button>
      </div>

      {/* Department Cards Grid */}
      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
          Loading department governance data...
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))',
          gap: '20px'
        }}>
          {departments.map(dept => {
            const spend = dept.currentMonthlySpendUsd || 0;
            const limit = dept.monthlyCostLimitUsd || 5000;
            const pct = Math.min(100, Math.round((spend / limit) * 100));
            const isHigh = pct >= 80;

            const allowedM = dept.allowedModels ? dept.allowedModels.split(',').map(s => s.trim()).filter(Boolean) : [];
            const blockedM = dept.blockedModels ? dept.blockedModels.split(',').map(s => s.trim()).filter(Boolean) : [];

            return (
              <div
                key={dept.id}
                style={{
                  background: 'var(--bg-glass-card)',
                  borderRadius: '14px',
                  border: `1px solid ${dept.emergencyOverrideActive ? 'rgba(239, 68, 68, 0.4)' : 'var(--border-glass)'}`,
                  padding: '22px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '16px',
                  boxShadow: 'var(--shadow-card)',
                  position: 'relative'
                }}
              >
                {dept.emergencyOverrideActive && (
                  <div style={{
                    position: 'absolute',
                    top: '12px',
                    right: '12px',
                    background: 'rgba(239, 68, 68, 0.2)',
                    border: '1px solid rgba(239, 68, 68, 0.5)',
                    color: '#f87171',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontSize: '0.68rem',
                    fontWeight: 800,
                    letterSpacing: '0.05em'
                  }}>
                    ⚠ EMERGENCY OVERRIDE ACTIVE
                  </div>
                )}

                <div>
                  {/* Department Title & Code */}
                  <div style={{ marginBottom: '12px' }}>
                    <span style={{ fontFamily: 'monospace', fontSize: '0.72rem', color: 'var(--accent-cyan)', fontWeight: 600 }}>
                      {dept.departmentCode}
                    </span>
                    <h3 style={{ margin: '2px 0 0 0', fontSize: '1.25rem', color: '#f8fafc', fontWeight: 700 }}>
                      {dept.departmentName}
                    </h3>
                  </div>

                  {/* Monthly Cost Limit Progress Bar */}
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '6px' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Monthly Cost Quota</span>
                      <strong style={{ color: isHigh ? '#f87171' : '#38bdf8' }}>
                        ${spend.toFixed(0)} / ${limit.toFixed(0)} ({pct}%)
                      </strong>
                    </div>
                    <div style={{ width: '100%', height: '8px', background: 'rgba(0,0,0,0.4)', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{
                        width: `${pct}%`,
                        height: '100%',
                        background: isHigh
                          ? 'linear-gradient(90deg, #f59e0b, #ef4444)'
                          : 'linear-gradient(90deg, var(--accent-cyan), var(--accent-blue))',
                        borderRadius: '4px'
                      }}></div>
                    </div>
                  </div>

                  {/* Token & Business Hours Specs */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '10px',
                    background: 'rgba(0,0,0,0.25)',
                    padding: '12px',
                    borderRadius: '8px',
                    fontSize: '0.75rem',
                    marginBottom: '14px'
                  }}>
                    <div>
                      <span style={{ color: 'var(--text-secondary)', display: 'block' }}>Daily Token Ceiling</span>
                      <strong style={{ color: '#f8fafc' }}>
                        {((dept.dailyTokenLimit || 0) / 1000000).toFixed(1)}M Tokens/day
                      </strong>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-secondary)', display: 'block' }}>Business Hours Policy</span>
                      <strong style={{ color: dept.enforceBusinessHours ? '#fbbf24' : '#94a3b8' }}>
                        {dept.enforceBusinessHours
                          ? `${dept.businessHoursStart || '09:00'} - ${dept.businessHoursEnd || '18:00'} (${dept.businessTimezone || 'UTC'})`
                          : '24/7 Unrestricted'}
                      </strong>
                    </div>
                  </div>

                  {/* Allowed Models */}
                  <div style={{ marginBottom: '8px' }}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                      Allowed Models:
                    </span>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {allowedM.map(m => (
                        <span key={m} style={{
                          background: 'rgba(16, 185, 129, 0.12)',
                          color: '#34d399',
                          border: '1px solid rgba(16, 185, 129, 0.25)',
                          padding: '1px 7px',
                          borderRadius: '4px',
                          fontSize: '0.72rem',
                          fontFamily: 'monospace'
                        }}>
                          ✓ {m}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Blocked Models */}
                  {blockedM.length > 0 && (
                    <div>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                        Blocked Models:
                      </span>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {blockedM.map(m => (
                          <span key={m} style={{
                            background: 'rgba(239, 68, 68, 0.12)',
                            color: '#f87171',
                            border: '1px solid rgba(239, 68, 68, 0.25)',
                            padding: '1px 7px',
                            borderRadius: '4px',
                            fontSize: '0.72rem',
                            fontFamily: 'monospace'
                          }}>
                            ✕ {m}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer Controls */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  borderTop: '1px solid var(--border-glass)',
                  paddingTop: '14px'
                }}>
                  <button
                    onClick={() => handleToggleOverride(dept)}
                    style={{
                      background: dept.emergencyOverrideActive ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                      color: dept.emergencyOverrideActive ? '#f87171' : 'var(--text-secondary)',
                      border: `1px solid ${dept.emergencyOverrideActive ? 'rgba(239,68,68,0.4)' : 'var(--border-glass)'}`,
                      padding: '6px 12px',
                      borderRadius: '6px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    {dept.emergencyOverrideActive ? 'Deactivate Override' : '⚡ Emergency Override'}
                  </button>

                  <button
                    onClick={() => handleOpenEdit(dept)}
                    style={{
                      background: 'rgba(255,255,255,0.05)',
                      color: 'var(--accent-cyan)',
                      border: '1px solid var(--border-glass)',
                      padding: '6px 14px',
                      borderRadius: '6px',
                      fontSize: '0.75rem',
                      cursor: 'pointer'
                    }}
                  >
                    Edit Quotas
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Edit Department Modal */}
      {editingDept && (
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
                {editingDept === 'NEW' ? 'Create Department Policy' : `Configure Department: ${formData.departmentName}`}
              </h2>
              <button
                onClick={() => setEditingDept(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '1.2rem', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveDepartment} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '5px' }}>
                    DEPARTMENT NAME
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.departmentName}
                    onChange={(e) => setFormData({ ...formData, departmentName: e.target.value })}
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
                    DEPARTMENT CODE
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.departmentCode}
                    onChange={(e) => setFormData({ ...formData, departmentCode: e.target.value })}
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
                    DAILY TOKEN LIMIT
                  </label>
                  <input
                    type="number"
                    value={formData.dailyTokenLimit}
                    onChange={(e) => setFormData({ ...formData, dailyTokenLimit: parseInt(e.target.value) || 0 })}
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
                    MONTHLY COST CEILING ($ USD)
                  </label>
                  <input
                    type="number"
                    value={formData.monthlyCostLimitUsd}
                    onChange={(e) => setFormData({ ...formData, monthlyCostLimitUsd: parseFloat(e.target.value) || 0 })}
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

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '5px' }}>
                  ALLOWED MODELS (Comma-Separated)
                </label>
                <input
                  type="text"
                  placeholder="gpt-4o, claude-3-5-sonnet, gemini-1.5-pro"
                  value={formData.allowedModels}
                  onChange={(e) => setFormData({ ...formData, allowedModels: e.target.value })}
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
                  BLOCKED MODELS (Comma-Separated)
                </label>
                <input
                  type="text"
                  placeholder="uncensored-v1, internal-experimental"
                  value={formData.blockedModels}
                  onChange={(e) => setFormData({ ...formData, blockedModels: e.target.value })}
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
                    ALLOWED PROMPT CATEGORIES
                  </label>
                  <input
                    type="text"
                    value={formData.allowedPromptCategories}
                    onChange={(e) => setFormData({ ...formData, allowedPromptCategories: e.target.value })}
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
                    RESTRICTED CATEGORIES
                  </label>
                  <input
                    type="text"
                    value={formData.restrictedCategories}
                    onChange={(e) => setFormData({ ...formData, restrictedCategories: e.target.value })}
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

              <div style={{
                background: 'rgba(0,0,0,0.2)',
                padding: '12px',
                borderRadius: '8px',
                border: '1px solid var(--border-glass)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '10px' }}>
                  <input
                    type="checkbox"
                    checked={formData.enforceBusinessHours}
                    onChange={(e) => setFormData({ ...formData, enforceBusinessHours: e.target.checked })}
                    style={{ cursor: 'pointer', transform: 'scale(1.2)' }}
                  />
                  <span style={{ fontSize: '0.82rem', marginLeft: '10px', color: '#f8fafc', fontWeight: 600 }}>
                    Enforce Business Hours Policy (Block queries outside operating window)
                  </span>
                </div>

                {formData.enforceBusinessHours && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginTop: '8px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                        START TIME
                      </label>
                      <input
                        type="time"
                        value={formData.businessHoursStart}
                        onChange={(e) => setFormData({ ...formData, businessHoursStart: e.target.value })}
                        style={{ width: '100%', background: '#0f172a', border: '1px solid var(--border-glass)', borderRadius: '6px', padding: '6px 10px', color: '#f8fafc', fontSize: '0.8rem' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                        END TIME
                      </label>
                      <input
                        type="time"
                        value={formData.businessHoursEnd}
                        onChange={(e) => setFormData({ ...formData, businessHoursEnd: e.target.value })}
                        style={{ width: '100%', background: '#0f172a', border: '1px solid var(--border-glass)', borderRadius: '6px', padding: '6px 10px', color: '#f8fafc', fontSize: '0.8rem' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                        TIMEZONE
                      </label>
                      <input
                        type="text"
                        value={formData.businessTimezone}
                        onChange={(e) => setFormData({ ...formData, businessTimezone: e.target.value })}
                        style={{ width: '100%', background: '#0f172a', border: '1px solid var(--border-glass)', borderRadius: '6px', padding: '6px 10px', color: '#f8fafc', fontSize: '0.8rem' }}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '12px' }}>
                <button
                  type="button"
                  onClick={() => setEditingDept(null)}
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
                  Save Department
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Emergency Override Modal */}
      {overrideModalDept && (
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
              <span>⚠</span> Trigger Emergency Override
            </h3>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '14px' }}>
              Activating emergency override for <strong>{overrideModalDept.departmentName}</strong> temporarily lifts daily token limits and business-hour restrictions. Every query will still be audited with elevated priority.
            </p>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                JUSTIFICATION / INCIDENT TICKET ID
              </label>
              <textarea
                rows="3"
                required
                placeholder="e.g. INC-94821 Production Incident response underway"
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
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
                onClick={() => setOverrideModalDept(null)}
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
                onClick={handleConfirmOverride}
                disabled={!overrideReason.trim()}
                style={{
                  background: '#ef4444',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '8px 16px',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  cursor: overrideReason.trim() ? 'pointer' : 'not-allowed',
                  opacity: overrideReason.trim() ? 1 : 0.5
                }}
              >
                Confirm Override
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
