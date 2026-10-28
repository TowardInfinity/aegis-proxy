import React from 'react';
import { useNavigation } from '../../context/NavigationContext';

export default function PagePlaceholder() {
  const { currentRoute, currentRouteMeta } = useNavigation();

  // Route-specific mock summaries to showcase layout flexibility
  const getRouteMetrics = (routeId) => {
    switch (routeId) {
      case 'dashboard':
        return [
          { label: 'Total Ingested Requests', value: '1,428,920', change: '+12.4%', variant: 'cyan' },
          { label: 'Security Blocks Enforced', value: '3,842', change: '-4.1%', variant: 'rose' },
          { label: 'Pending Human Reviews', value: '3', change: 'Escalated', variant: 'amber' },
          { label: 'Est. Model Spend Saved', value: '$18,420.50', change: '+28.2%', variant: 'emerald' }
        ];
      case 'playground':
        return [
          { label: 'Pipeline Stages Active', value: '9 / 9', change: 'Online', variant: 'cyan' },
          { label: 'Average Pipeline Latency', value: '18.4 ms', change: '-2.1ms', variant: 'emerald' },
          { label: 'PII Redaction Rate', value: '99.8%', change: 'Optimal', variant: 'purple' },
          { label: 'Circuit Breaker State', value: 'CLOSED', change: 'Healthy', variant: 'cyan' }
        ];
      case 'audit':
        return [
          { label: 'Immutable Audit Records', value: '1,428,920', change: 'Postgres H2', variant: 'cyan' },
          { label: 'Forensic Violations Logged', value: '14,290', change: 'Indexed', variant: 'rose' },
          { label: 'DLQ Dead Letter Messages', value: '0', change: 'Clean', variant: 'emerald' },
          { label: 'Audit Retention Window', value: '365 Days', change: 'Compliant', variant: 'purple' }
        ];
      case 'approvals':
        return [
          { label: 'Awaiting SecOps Review', value: '3 Prompts', change: 'Urgent', variant: 'amber' },
          { label: 'Approved This Week', value: '48', change: 'Reviewed', variant: 'emerald' },
          { label: 'Rejected Violations', value: '19', change: 'Blocked', variant: 'rose' },
          { label: 'Avg Review Turnaround', value: '4.2 mins', change: '-35s', variant: 'cyan' }
        ];
      case 'compliance':
        return [
          { label: 'NIST AI RMF 1.0 Coverage', value: '98.5%', change: 'Validated', variant: 'emerald' },
          { label: 'EU AI Act High-Risk Rules', value: '100%', change: 'Strict', variant: 'cyan' },
          { label: 'HIPAA & PII Data Masks', value: '16 Patterns', change: 'Active', variant: 'purple' },
          { label: 'Automated Audit Snapshots', value: 'Hourly', change: 'Cron Active', variant: 'amber' }
        ];
      case 'system':
        return [
          { label: 'Active Microservices', value: '5 of 5 UP', change: '100% Mesh', variant: 'emerald' },
          { label: 'Gateway Reactive Threads', value: 'Netty EventLoop', change: 'Non-blocking', variant: 'cyan' },
          { label: 'Kafka Audit Partition Lag', value: '0 ms', change: 'Real-time', variant: 'purple' },
          { label: 'Relational DB Connections', value: 'HikariCP 10/10', change: 'Optimal', variant: 'cyan' }
        ];
      case 'settings':
        return [
          { label: 'Identity Enforcement', value: 'STRICT', change: 'Bearer JWT', variant: 'cyan' },
          { label: 'Risk Threshold Block', value: '70 / 100', change: 'Critical Cutoff', variant: 'rose' },
          { label: 'Auto Redaction Policy', value: 'AUTOMATIC', change: 'Masking ON', variant: 'emerald' },
          { label: 'Fallback Audit Channel', value: 'REST SYNC', change: 'Resilient', variant: 'amber' }
        ];
      default:
        return [];
    }
  };

  const metrics = getRouteMetrics(currentRoute);

  return (
    <div className="page-layout-container">
      {/* Page Header Banner */}
      <div className="page-header-banner">
        <div className="page-header-text">
          <div className="page-category-tag">{currentRouteMeta.category}</div>
          <h1 className="page-title">{currentRouteMeta.title}</h1>
          <p className="page-description">{currentRouteMeta.description}</p>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-secondary">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            Export View
          </button>
          <button className="btn btn-primary">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            New Rule / Action
          </button>
        </div>
      </div>

      {/* KPI Metric Summary Grid */}
      <div className="kpi-grid">
        {metrics.map((m, idx) => (
          <div key={idx} className="kpi-card glass-card">
            <div className="kpi-label">{m.label}</div>
            <div className="kpi-value-row">
              <div className="kpi-value">{m.value}</div>
              <span className={`badge badge-${m.variant}`}>{m.change}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Responsive Section Grid */}
      <div className="content-grid-two-column">
        {/* Main Panel */}
        <div className="glass-card panel-main">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">{currentRouteMeta.title} Telemetry</h2>
              <p className="panel-subtitle">Real-time layout container with responsive scaling</p>
            </div>
            <span className="badge badge-cyan">LAYOUT PREVIEW</span>
          </div>
          <div className="panel-body-placeholder">
            <div className="mock-chart-container">
              <div className="mock-grid-lines">
                <div className="grid-line"></div>
                <div className="grid-line"></div>
                <div className="grid-line"></div>
              </div>
              <div className="mock-bars">
                <div className="mock-bar" style={{ height: '45%' }}></div>
                <div className="mock-bar" style={{ height: '70%' }}></div>
                <div className="mock-bar" style={{ height: '35%' }}></div>
                <div className="mock-bar" style={{ height: '85%' }}></div>
                <div className="mock-bar" style={{ height: '60%' }}></div>
                <div className="mock-bar highlight" style={{ height: '92%' }}></div>
                <div className="mock-bar" style={{ height: '55%' }}></div>
              </div>
            </div>
            <p className="mock-caption">
              Continuous 24-hour traffic governance distribution across active prompt interceptors.
            </p>
          </div>
        </div>

        {/* Side Panel */}
        <div className="glass-card panel-side">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Operational Policies</h2>
              <p className="panel-subtitle">Current enforcement rules</p>
            </div>
          </div>
          <div className="policy-list">
            <div className="policy-item">
              <div className="policy-bullet cyan"></div>
              <div className="policy-meta">
                <div className="policy-name">Prompt Injection Guard</div>
                <div className="policy-desc">Regex & semantic jailbreak protection</div>
              </div>
              <span className="badge badge-cyan">ACTIVE</span>
            </div>
            <div className="policy-item">
              <div className="policy-bullet emerald"></div>
              <div className="policy-meta">
                <div className="policy-name">PII & Secret Redaction</div>
                <div className="policy-desc">AES tokens & credential masking</div>
              </div>
              <span className="badge badge-low">ENFORCED</span>
            </div>
            <div className="policy-item">
              <div className="policy-bullet amber"></div>
              <div className="policy-meta">
                <div className="policy-name">Hallucination Threshold</div>
                <div className="policy-desc">N-gram factual divergence check</div>
              </div>
              <span className="badge badge-high">STRICT</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
