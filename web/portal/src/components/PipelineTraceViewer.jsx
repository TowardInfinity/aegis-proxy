import React, { useState } from 'react';

const STAGE_DEFINITIONS = [
  { id: 'INTERCEPT', name: 'Stage 1: Intercept', desc: 'Gateway HTTP ingress & correlation tracking' },
  { id: 'IDENTITY', name: 'Stage 2: Identity', desc: 'Bearer JWT token validation & role attribution' },
  { id: 'SCAN', name: 'Stage 3: Scan', desc: 'Regex & heuristic PII, credential & injection detectors' },
  { id: 'REDACT', name: 'Stage 4: Redact', desc: 'Deterministic masking of sensitive data tokens' },
  { id: 'RISK', name: 'Stage 5: Risk Scoring', desc: '4-factor weighted score calculation (0 - 100)' },
  { id: 'DECISION', name: 'Stage 6: Decision Engine', desc: 'Policy rule evaluation (ALLOW / REVIEW / BLOCK)' },
  { id: 'LLM', name: 'Stage 7: Upstream LLM', desc: 'Reactive WebClient dispatch with streaming & mock fallback' },
  { id: 'QUALITY', name: 'Stage 8: Quality Check', desc: 'Hallucination, echo, and toxicity verification' },
  { id: 'AUDIT', name: 'Stage 9: Audit Publisher', desc: 'Kafka event publish to ai.audit.events & REST sync fallback' }
];

export default function PipelineTraceViewer({ pipelineTrace, result }) {
  const [expandedStage, setExpandedStage] = useState(null);

  // Generate trace stages if result doesn't have an explicit array
  const stages = STAGE_DEFINITIONS.map((def, idx) => {
    const isBlocked = result?.action === 'BLOCK';
    const isReview = result?.action === 'REVIEW';

    let status = 'COMPLETED';
    let latencyMs = Math.max(1, Math.round((idx + 1) * 3.4));

    if (isBlocked && idx >= 6) {
      status = 'SKIPPED_BLOCKED';
    } else if (isReview && idx === 6) {
      status = 'HELD_FOR_REVIEW';
    }

    let payload = {};
    switch (def.id) {
      case 'INTERCEPT':
        payload = {
          requestId: result?.requestId || 'req-init',
          protocol: 'HTTP/2.0 Reactive WebFlux',
          timestamp: new Date().toISOString()
        };
        break;
      case 'IDENTITY':
        payload = {
          userId: 'secops.operator@enterprise.ai',
          userRole: result?.userRole || 'OPERATOR',
          authScheme: 'Bearer JWT',
          authenticated: true
        };
        break;
      case 'SCAN':
        payload = {
          violationsFound: result?.promptViolations?.length || 0,
          detectedPatterns: result?.promptViolations?.map(v => v.type) || ['NONE'],
          sensitivityScore: result?.sensitivityScore || 0
        };
        break;
      case 'REDACT':
        payload = {
          redactionApplied: !!result?.redactedPrompt,
          tokensMasked: result?.promptViolations?.length || 0,
          sanitizedPayload: result?.redactedPrompt || '(Unchanged - no PII patterns found)'
        };
        break;
      case 'RISK':
        payload = {
          aggregateScore: result?.riskScore || 15,
          riskLevel: result?.riskLevel || 'LOW',
          weights: {
            dataSensitivity: '40%',
            userRole: '25%',
            promptCategory: '20%',
            targetModel: '15%'
          }
        };
        break;
      case 'DECISION':
        payload = {
          enforcedAction: result?.action || 'ALLOW',
          blockReason: result?.blockedReason || null,
          ruleMatched: result?.action === 'BLOCK' ? 'RULE-CRITICAL-SEVERITY-CUTOFF' : 'DEFAULT-COMPLIANCE-PASS'
        };
        break;
      case 'LLM':
        payload = {
          targetModel: result?.model || 'gpt-4o',
          tokensIn: result?.tokensIn || 120,
          tokensOut: result?.tokensOut || 340,
          costUsd: result?.costUsd || 0.0015,
          status: status === 'SKIPPED_BLOCKED' ? 'TERMINATED_NO_CALL' : 'DISPATCHED_OK'
        };
        break;
      case 'QUALITY':
        payload = {
          verdict: result?.qualityVerdict || 'PASS',
          hallucinationScore: result?.hallucinationScore || 0.02,
          secretEchoDetected: false
        };
        break;
      case 'AUDIT':
        payload = {
          kafkaTopic: 'ai.audit.events',
          partition: 1,
          persistedDatabaseId: result?.auditEventId || 1095,
          fallbackChannel: 'REST Sync Active'
        };
        break;
      default:
        break;
    }

    return {
      ...def,
      status,
      latencyMs,
      payload
    };
  });

  const getStatusBadge = (status) => {
    switch (status) {
      case 'COMPLETED':
        return <span className="badge badge-low" style={{ fontSize: '0.62rem' }}>COMPLETED</span>;
      case 'SKIPPED_BLOCKED':
        return <span className="badge badge-critical" style={{ fontSize: '0.62rem' }}>BLOCKED</span>;
      case 'HELD_FOR_REVIEW':
        return <span className="badge badge-warning" style={{ fontSize: '0.62rem' }}>HELD (REVIEW)</span>;
      default:
        return <span className="badge badge-cyan" style={{ fontSize: '0.62rem' }}>{status}</span>;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 600, margin: 0, color: 'var(--text-main)' }}>
            9-Stage Gateway Pipeline Trace Viewer
          </h3>
          <p style={{ fontSize: '0.72rem', color: 'var(--text-dim)', margin: '2px 0 0 0' }}>
            Click any execution stage node to inspect input/output JSON payloads and decision traces
          </p>
        </div>
        <span className="badge badge-cyan">TRACE INSPECTOR</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {stages.map((stage, idx) => {
          const isExpanded = expandedStage === stage.id;
          return (
            <div
              key={stage.id}
              className="glass-card"
              style={{
                borderRadius: '8px',
                border: isExpanded ? '1px solid var(--border-highlight)' : '1px solid var(--border-subtle)',
                overflow: 'hidden',
                transition: 'all 0.18s ease'
              }}
            >
              <div
                onClick={() => setExpandedStage(isExpanded ? null : stage.id)}
                style={{
                  padding: '10px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  background: isExpanded ? 'rgba(212, 118, 10, 0.08)' : 'var(--bg-card)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    background: stage.status === 'SKIPPED_BLOCKED' ? 'rgba(220, 38, 38, 0.15)' : 'rgba(212, 118, 10, 0.15)',
                    color: stage.status === 'SKIPPED_BLOCKED' ? 'var(--accent-rose)' : 'var(--accent-cyan)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.7rem',
                    fontWeight: 700
                  }}>
                    {idx + 1}
                  </div>
                  <div>
                    <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-main)' }}>
                      {stage.name}
                    </span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginLeft: '8px' }}>
                      ({stage.desc})
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '0.7rem', fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>
                    {stage.latencyMs}ms
                  </span>
                  {getStatusBadge(stage.status)}
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}
                  >
                    <polyline points="6 9 12 15 18 9"></polyline>
                  </svg>
                </div>
              </div>

              {/* Expandable Payload Inspector */}
              {isExpanded && (
                <div style={{
                  padding: '12px 16px',
                  background: 'var(--bg-input)',
                  borderTop: '1px solid var(--border-subtle)',
                  fontSize: '0.75rem',
                  fontFamily: 'var(--font-mono)'
                }}>
                  <div style={{ color: 'var(--accent-cyan)', fontWeight: 600, marginBottom: '6px' }}>
                    STAGE PAYLOAD & TRACE METADATA
                  </div>
                  <pre style={{
                    color: 'var(--text-main)',
                    margin: 0,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    lineHeight: 1.4
                  }}>
                    {JSON.stringify(stage.payload, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
