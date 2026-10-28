import React from 'react';
import { useTheme } from '../../context/ThemeContext';

export default function StatusBar() {
  const { theme } = useTheme();

  return (
    <footer className="app-status-bar" aria-label="Operational status bar">
      {/* Left: Engine & Health Status */}
      <div className="status-bar-left">
        <div className="status-indicator-group">
          <span className="pulse-dot online"></span>
          <span className="status-label">
            STATUS: <strong className="text-emerald">ALL ENGINES OPERATIONAL</strong>
          </span>
        </div>
        <span className="status-divider">|</span>
        <div className="status-item">
          <span>PIPELINE:</span> <span className="text-cyan">9 STAGES ACTIVE</span>
        </div>
        <span className="status-divider">|</span>
        <div className="status-item">
          <span>KAFKA BUS:</span> <span className="text-muted">ai.audit.events (PARTITIONS: 3, DLQ: ON)</span>
        </div>
      </div>

      {/* Right: Metrics, Framework, Standards */}
      <div className="status-bar-right">
        <div className="status-item">
          <span>LATENCY:</span> <span className="text-emerald">p99 &lt; 14ms</span>
        </div>
        <span className="status-divider">|</span>
        <div className="status-item">
          <span>COMPLIANCE:</span> <span className="text-cyan">NIST AI RMF 1.0</span>
        </div>
        <span className="status-divider">|</span>
        <div className="status-item theme-pill">
          <span>THEME:</span> <strong className="text-main uppercase">{theme}</strong>
        </div>
      </div>
    </footer>
  );
}
