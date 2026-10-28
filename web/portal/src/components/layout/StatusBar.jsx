import { useAdminLink } from '../../services/api';
import { useTheme } from '../../context/ThemeContext';

export default function StatusBar() {
  const { theme } = useTheme();
  const link = useAdminLink();
  const up = Boolean(link.checkedAt && link.ok);
  const statusText = !link.checkedAt
    ? 'CHECKING ADMIN'
    : link.ok
      ? 'ADMIN CONNECTED'
      : (link.error || 'ADMIN OFFLINE');
  const latencyText = link.ok && link.medianLatencyMs != null
    ? `median ${link.medianLatencyMs} ms`
    : link.latencyMs != null
      ? `probe ${link.latencyMs} ms`
      : '—';

  return (
    <footer className="app-status-bar" aria-label="Operational status bar">
      <div className="status-bar-left">
        <div className="status-indicator-group">
          <span
            className={`pulse-dot ${up ? 'online' : ''}`}
            style={up ? undefined : { background: '#f43f5e' }}
          ></span>
          <span className="status-label">
            STATUS: <strong className={up ? 'text-emerald' : 'text-muted'}>{statusText}</strong>
          </span>
        </div>
        <span className="status-divider">|</span>
        <div className="status-item">
          <span>LAST /admin/stats:</span> <span className="text-cyan">{latencyText}</span>
        </div>
      </div>

      <div className="status-bar-right">
        <div className="status-item theme-pill">
          <span>THEME:</span> <strong className="text-main uppercase">{theme}</strong>
        </div>
      </div>
    </footer>
  );
}
