import React, { useState } from 'react';
import { ApiService } from '../services/api';

export default function SystemHealthView({ systemStatus, onRefreshStatus }) {
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await onRefreshStatus();
    } finally {
      setTimeout(() => setRefreshing(false), 400);
    }
  };

  const services = [
    {
      id: 'gateway',
      name: 'AI Gateway',
      port: 8080,
      protocol: 'Reactive Spring WebFlux',
      path: '/api/v1/ai/chat',
      role: 'Orchestrator & Ingress Boundary (Hexagonal Inbound Adapter)',
      swagger: 'http://localhost:8080/swagger-ui.html'
    },
    {
      id: 'scanner',
      name: 'Prompt Security Scanner',
      port: 8081,
      protocol: 'Spring Boot REST',
      path: '/api/v1/scan',
      role: 'PII, Secret Key, Injection, & Source Code Detection',
      swagger: 'http://localhost:8081/swagger-ui.html'
    },
    {
      id: 'risk',
      name: 'Risk Scoring Engine',
      port: 8082,
      protocol: 'Spring Boot REST',
      path: '/api/v1/risk/assess',
      role: 'Multi-Factor Weighted Risk Scoring Matrix',
      swagger: 'http://localhost:8082/swagger-ui.html'
    },
    {
      id: 'audit',
      name: 'Audit Service',
      port: 8083,
      protocol: 'Spring Boot JPA / H2',
      path: '/api/v1/audit/events',
      role: 'Immutable Audit Logging & Executive Dashboard Aggregator',
      swagger: 'http://localhost:8083/swagger-ui.html'
    },
    {
      id: 'quality',
      name: 'Response Quality Checker',
      port: 8084,
      protocol: 'Spring Boot REST',
      path: '/api/v1/quality/check',
      role: 'Hallucination, Toxicity, & Safety Output Verification',
      swagger: 'http://localhost:8084/swagger-ui.html'
    }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0 }}>
            Microservices Topology & Runtime Health
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '4px' }}>
            Live status probes, latency measurements, and endpoint contracts across the 5 enterprise microservices.
          </p>
        </div>

        <button
          id="btn-probe-refresh"
          onClick={handleRefresh}
          disabled={refreshing}
          className="btn btn-primary"
          style={{ fontSize: '0.8rem' }}
        >
          {refreshing ? 'Probing Services...' : 'Probe Live Endpoints'}
        </button>
      </div>

      {/* Microservice Cards Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: '18px'
      }}>
        {services.map((svc) => {
          const liveStat = systemStatus?.find(s => s.name === svc.name);
          const isUp = liveStat && liveStat.status === 'UP';

          return (
            <div key={svc.id} className="glass-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--accent-cyan)', fontWeight: 600 }}>
                    PORT :{svc.port}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span className={`pulse-dot ${isUp ? 'online' : 'warning'}`}></span>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: isUp ? '#34d399' : '#fbbf24' }}>
                      {isUp ? 'ACTIVE' : 'STANDBY'}
                    </span>
                  </div>
                </div>

                <h3 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '4px' }}>{svc.name}</h3>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '8px' }}>
                  {svc.protocol}
                </div>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '14px', lineHeight: 1.4 }}>
                  {svc.role}
                </p>
              </div>

              <div style={{
                background: 'rgba(15, 23, 42, 0.6)',
                padding: '10px 12px',
                borderRadius: '8px',
                fontSize: '0.72rem',
                border: '1px solid var(--border-subtle)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>
                  {svc.path}
                </span>
                <span style={{ color: isUp ? 'var(--accent-cyan)' : 'var(--text-dim)' }}>
                  {liveStat?.latency ? `${liveStat.latency}ms` : 'Ready'}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Hexagonal Architecture Pipeline Flow Diagram */}
      <div className="glass-card" style={{ padding: '24px' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '16px' }}>
          Reactive Hexagonal Pipelining Pipeline Flow
        </h3>
        <div style={{
          background: 'rgba(11, 17, 32, 0.7)',
          padding: '24px',
          borderRadius: '12px',
          border: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          overflowX: 'auto',
          gap: '12px'
        }}>
          {[
            { step: '1', title: 'Client Ingress', desc: 'React UI / REST Ingress', color: '#D4760A' },
            { step: '2', title: 'AI Gateway (8080)', desc: 'WebClient Reactor Pipeline', color: '#EA580C' },
            { step: '3', title: 'Scanner (8081)', desc: 'PII, Injection, Secrets', color: '#D97706' },
            { step: '4', title: 'Risk Engine (8082)', desc: 'Weighted Multi-factor Matrix', color: '#B45309' },
            { step: '5', title: 'Upstream LLM', desc: 'Mock / OpenAI / Claude', color: '#16A34A' },
            { step: '6', title: 'Quality (8084)', desc: 'Hallucination & Toxicity', color: '#D4760A' },
            { step: '7', title: 'Audit (8083)', desc: 'H2 JPA / Kafka Stream', color: '#16A34A' }
          ].map((node, i) => (
            <React.Fragment key={i}>
              <div style={{
                minWidth: '130px',
                padding: '12px',
                background: 'var(--bg-card)',
                borderRadius: '8px',
                border: '1px solid var(--border-subtle)',
                borderTop: `3px solid ${node.color}`,
                textAlign: 'center'
              }}>
                <div style={{ fontSize: '0.65rem', color: node.color, fontWeight: 700 }}>STAGE {node.step}</div>
                <div style={{ fontSize: '0.78rem', fontWeight: 700, margin: '2px 0' }}>{node.title}</div>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)' }}>{node.desc}</div>
              </div>
              {i < 6 && (
                <span style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>→</span>
              )}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}
