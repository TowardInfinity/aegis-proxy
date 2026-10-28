import React, { useState } from 'react';
import { ThemeProvider } from './context/ThemeContext';
import { NavigationProvider, useNavigation } from './context/NavigationContext';
import { GlobalLayout } from './components/layout';
import DashboardView from './components/DashboardView';
import PlaygroundView from './components/PlaygroundView';
import AuditLogView from './components/AuditLogView';
import ApprovalsView from './components/ApprovalsView';
import SystemHealthView from './components/SystemHealthView';
import EventDetailModal from './components/EventDetailModal';

function AppContent() {
  const { currentRoute, navigate } = useNavigation();
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  return (
    <GlobalLayout>
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
          gap: '10px',
          backdropFilter: 'blur(8px)'
        }}>
          <span style={{ color: 'var(--accent-cyan)' }}>●</span>
          {toastMessage}
        </div>
      )}

      {currentRoute === 'dashboard' && (
        <DashboardView
          onNavigateToPlayground={() => navigate('playground')}
          onSelectEvent={setSelectedEvent}
        />
      )}

      {currentRoute === 'playground' && (
        <PlaygroundView />
      )}

      {currentRoute === 'audit' && (
        <AuditLogView onSelectEvent={setSelectedEvent} />
      )}

      {currentRoute === 'approvals' && (
        <ApprovalsView onResolved={(ticket, resolution) => showToast(`${ticket} ${resolution}`)} />
      )}

      {currentRoute === 'system' && (
        <SystemHealthView />
      )}

      {selectedEvent && (
        <EventDetailModal
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
        />
      )}
    </GlobalLayout>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <NavigationProvider initialRoute="dashboard">
        <AppContent />
      </NavigationProvider>
    </ThemeProvider>
  );
}
