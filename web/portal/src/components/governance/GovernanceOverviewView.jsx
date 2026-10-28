import React, { useState, useEffect } from 'react';
import { GovernanceApi } from '../../services/governanceApi';
import { useNavigation } from '../../context/NavigationContext';

export default function GovernanceOverviewView() {
  const { navigate } = useNavigation();
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadOverview();
  }, []);

  const loadOverview = async () => {
    setLoading(true);
    const data = await GovernanceApi.getOverview();
    setOverview(data);
    setLoading(false);
  };

  if (loading || !overview) {
    return (
      <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-secondary)' }}>
        Loading Enterprise AI Governance Control Center...
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      {/* Top Banner / Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '24px 28px',
        background: 'var(--bg-glass-card)',
        borderRadius: '16px',
        border: '1px solid var(--border-highlight)',
        boxShadow: 'var(--shadow-card)'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
            <span style={{
              background: 'linear-gradient(135deg, var(--accent-cyan), var(--accent-blue))',
              color: '#0f172a',
              fontSize: '0.72rem',
              fontWeight: 800,
              padding: '3px 8px',
              borderRadius: '6px',
              letterSpacing: '0.06em'
            }}>CONTROL CENTER</span>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Centralized Policy & Usage Governance</span>
          </div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 800, margin: 0, color: '#f8fafc' }}>
            Enterprise AI Governance Dashboard
          </h1>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={() => navigate('gov-simulator')}
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
            <span>▶</span> Policy Simulator
          </button>
          <button
            onClick={loadOverview}
            style={{
              background: 'rgba(255,255,255,0.05)',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border-glass)',
              borderRadius: '8px',
              padding: '10px 16px',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '20px'
      }}>
        {/* Active Policies */}
        <div style={{
          padding: '20px',
          borderRadius: '14px',
          background: 'var(--bg-glass-card)',
          border: '1px solid var(--border-glass)',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px'
        }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>
            Active AI Policies
          </span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
            <span style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--accent-cyan)' }}>
              {overview.activePolicies}
            </span>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              / {overview.totalPolicies} Defined
            </span>
          </div>
          <span style={{ fontSize: '0.74rem', color: '#10b981', fontWeight: 600 }}>
            100% Zero-Trust Enforced
          </span>
        </div>

        {/* Registered Models */}
        <div style={{
          padding: '20px',
          borderRadius: '14px',
          background: 'var(--bg-glass-card)',
          border: '1px solid var(--border-glass)',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px'
        }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>
            Enterprise Model Catalog
          </span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
            <span style={{ fontSize: '2rem', fontWeight: 800, color: '#38bdf8' }}>
              {overview.approvedModels}
            </span>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              / {overview.totalModels} Models
            </span>
          </div>
          <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
            OpenAI, Anthropic, Google, Llama, Mistral
          </span>
        </div>

        {/* Governed Departments & Users */}
        <div style={{
          padding: '20px',
          borderRadius: '14px',
          background: 'var(--bg-glass-card)',
          border: '1px solid var(--border-glass)',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px'
        }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>
            Governed Departments
          </span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
            <span style={{ fontSize: '2rem', fontWeight: 800, color: '#a78bfa' }}>
              {overview.totalDepartments}
            </span>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              ({overview.totalGovernedUsers} Active Users)
            </span>
          </div>
          <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
            Quotas & Model Allowlist Active
          </span>
        </div>

        {/* Budget & Cost Cap */}
        <div style={{
          padding: '20px',
          borderRadius: '14px',
          background: 'var(--bg-glass-card)',
          border: '1px solid var(--border-glass)',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px'
        }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>
            Monthly AI Budget Spend
          </span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
            <span style={{ fontSize: '1.8rem', fontWeight: 800, color: '#f59e0b' }}>
              ${overview.currentMonthlySpendUsd ? overview.currentMonthlySpendUsd.toLocaleString() : '6,111'}
            </span>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              / ${overview.totalMonthlyBudgetCeilingUsd ? overview.totalMonthlyBudgetCeilingUsd.toLocaleString() : '14,500'}
            </span>
          </div>
          <div style={{
            width: '100%',
            height: '6px',
            background: 'rgba(255,255,255,0.08)',
            borderRadius: '3px',
            overflow: 'hidden'
          }}>
            <div style={{
              width: `${Math.min(100, overview.budgetUtilizationPercent || 42)}%`,
              height: '100%',
              background: 'linear-gradient(90deg, #10b981, #f59e0b)',
              borderRadius: '3px'
            }} />
          </div>
        </div>
      </div>

      {/* Quick Launchpad Navigation Grid */}
      <div>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '14px', color: '#f1f5f9' }}>
          AI Governance Control Modules
        </h2>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '16px'
        }}>
          {[
            {
              id: 'gov-policies',
              title: 'Policy Management',
              desc: 'Define security guardrails, JSON rule definitions, priorities, and instant rollback.',
              icon: '🛡️',
              stat: `${overview.activePolicies} Active Policies`
            },
            {
              id: 'gov-models',
              title: 'Model Registry',
              desc: 'Manage approved models across OpenAI, Anthropic, Google, Meta, and internal clusters.',
              icon: '🧠',
              stat: `${overview.approvedModels} Approved Models`
            },
            {
              id: 'gov-templates',
              title: 'Prompt Templates',
              desc: 'Curate approved, pre-vetted prompt libraries with variable extraction and analytics.',
              icon: '📝',
              stat: `${overview.totalPromptTemplates} Templates`
            },
            {
              id: 'gov-departments',
              title: 'Department Quotas',
              desc: 'Enforce daily token thresholds, dollar cost limits, model allowlists, and business hours.',
              icon: '🏢',
              stat: `${overview.totalDepartments} Departments`
            },
            {
              id: 'gov-users',
              title: 'User Governance',
              desc: 'Assign roles, custom token quotas, review bypass rights, and emergency account locks.',
              icon: '👤',
              stat: `${overview.totalGovernedUsers} Users`
            },
            {
              id: 'gov-approvals',
              title: 'Approval Policies',
              desc: 'Configure multi-level, parallel, and escalation sign-offs for High Risk & Financial prompts.',
              icon: '✍️',
              stat: `${overview.totalApprovalWorkflows} Workflows`
            },
            {
              id: 'gov-history',
              title: 'Policy Audit Trail',
              desc: 'Immutable historical record tracking Who, What, When, Old Values, and New Values.',
              icon: '📜',
              stat: 'Full Audit Trail'
            },
            {
              id: 'gov-simulator',
              title: 'Policy Simulator',
              desc: 'Interactive sandbox testing prompt queries against live department and policy matrices.',
              icon: '🧪',
              stat: 'Interactive Sandbox'
            }
          ].map((item) => (
            <div
              key={item.id}
              onClick={() => navigate(item.id)}
              style={{
                background: 'var(--bg-glass-card)',
                borderRadius: '14px',
                border: '1px solid var(--border-glass)',
                padding: '20px',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: '12px'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--border-highlight)';
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = 'var(--shadow-glow-cyan)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border-glass)';
                e.currentTarget.style.transform = 'none';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '1.4rem' }}>{item.icon}</span>
                  <span style={{
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    color: 'var(--accent-cyan)',
                    background: 'rgba(56, 189, 248, 0.1)',
                    padding: '2px 8px',
                    borderRadius: '4px'
                  }}>{item.stat}</span>
                </div>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 6px 0', color: '#f8fafc' }}>
                  {item.title}
                </h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4 }}>
                  {item.desc}
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', color: 'var(--accent-cyan)', fontWeight: 600 }}>
                Configure Module <span>→</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Policy Audit History Table */}
      <div style={{
        background: 'var(--bg-glass-card)',
        borderRadius: '16px',
        border: '1px solid var(--border-glass)',
        padding: '24px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#f8fafc' }}>
              Recent Governance Audit Activity
            </h3>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
              Real-time audit log of policy modifications, rollbacks, and status changes
            </span>
          </div>
          <button
            onClick={() => navigate('gov-history')}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--accent-cyan)',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            View Full Audit History →
          </button>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-glass)', color: 'var(--text-secondary)' }}>
                <th style={{ padding: '10px 12px' }}>ACTION</th>
                <th style={{ padding: '10px 12px' }}>POLICY KEY</th>
                <th style={{ padding: '10px 12px' }}>VERSION</th>
                <th style={{ padding: '10px 12px' }}>OPERATOR</th>
                <th style={{ padding: '10px 12px' }}>CHANGE SUMMARY</th>
                <th style={{ padding: '10px 12px' }}>TIMESTAMP</th>
              </tr>
            </thead>
            <tbody>
              {overview.recentAuditHistory && overview.recentAuditHistory.length > 0 ? (
                overview.recentAuditHistory.map((item, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ padding: '12px' }}>
                      <span style={{
                        padding: '3px 8px',
                        borderRadius: '4px',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        background: item.actionType === 'ROLLBACK' ? 'rgba(239, 68, 68, 0.15)' :
                                    item.actionType === 'CREATE' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(56, 189, 248, 0.15)',
                        color: item.actionType === 'ROLLBACK' ? '#ef4444' :
                               item.actionType === 'CREATE' ? '#10b981' : '#38bdf8'
                      }}>
                        {item.actionType}
                      </span>
                    </td>
                    <td style={{ padding: '12px', fontWeight: 600, color: '#f8fafc' }}>
                      {item.policyKey}
                    </td>
                    <td style={{ padding: '12px', color: 'var(--text-secondary)' }}>
                      v{item.version}
                    </td>
                    <td style={{ padding: '12px', color: 'var(--text-secondary)' }}>
                      {item.changedBy}
                    </td>
                    <td style={{ padding: '12px', color: '#cbd5e1' }}>
                      {item.summary || 'Policy configuration updated'}
                    </td>
                    <td style={{ padding: '12px', color: 'var(--text-secondary)' }}>
                      {new Date(item.changedAt).toLocaleString()}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    No policy modifications recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
