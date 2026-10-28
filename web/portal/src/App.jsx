import React, { useState, useEffect } from 'react';
import { ThemeProvider } from './context/ThemeContext';
import { NavigationProvider, useNavigation } from './context/NavigationContext';
import { GlobalLayout } from './components/layout';
import DashboardView from './components/DashboardView';
import PlaygroundView from './components/PlaygroundView';
import AuditLogView from './components/AuditLogView';
import ApprovalsView from './components/ApprovalsView';
import ComplianceView from './components/ComplianceView';
import SystemHealthView from './components/SystemHealthView';
import EventDetailModal from './components/EventDetailModal';
import { ApiService, mockAuditEvents, mockPendingApprovals } from './services/api';

// AI Governance Suite (Phase 18)
import GovernanceOverviewView from './components/governance/GovernanceOverviewView';
import PoliciesView from './components/governance/PoliciesView';
import ModelRegistryView from './components/governance/ModelRegistryView';
import PromptTemplatesView from './components/governance/PromptTemplatesView';
import DepartmentGovernanceView from './components/governance/DepartmentGovernanceView';
import UserGovernanceView from './components/governance/UserGovernanceView';
import ApprovalPoliciesView from './components/governance/ApprovalPoliciesView';
import PolicyHistoryView from './components/governance/PolicyHistoryView';
import PolicySimulatorView from './components/governance/PolicySimulatorView';

function AppContent() {
  const { currentRoute, navigate } = useNavigation();
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [auditEvents, setAuditEvents] = useState(mockAuditEvents);
  const [pendingApprovals, setPendingApprovals] = useState(mockPendingApprovals);
  const [systemStatus, setSystemStatus] = useState([]);
  const [toastMessage, setToastMessage] = useState(null);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const loadData = async () => {
    try {
      const health = await ApiService.checkHealth();
      setSystemStatus(health);

      const events = await ApiService.getAuditEvents(50);
      if (events) setAuditEvents(events);

      const pending = await ApiService.getPendingApprovals();
      if (pending) setPendingApprovals(pending);
    } catch (e) {
      console.warn('Initial data load warning');
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 20000);
    return () => clearInterval(interval);
  }, []);

  // When a prompt is processed in the Playground Demo Console
  const handleEventGenerated = (chatResult) => {
    const newEvent = {
      id: chatResult.auditEventId || Date.now(),
      requestId: chatResult.requestId,
      userId: 'secops.operator@enterprise.ai',
      userRole: 'OPERATOR',
      model: chatResult.model || 'gpt-4o',
      promptCategory: 'CODE',
      action: chatResult.action,
      riskScore: chatResult.riskScore,
      riskLevel: chatResult.riskLevel,
      tokensIn: chatResult.tokensIn,
      tokensOut: chatResult.tokensOut,
      costUsd: chatResult.costUsd,
      qualityVerdict: chatResult.qualityVerdict,
      hallucinationScore: chatResult.hallucinationScore,
      approvalRequired: chatResult.action === 'REVIEW',
      violationsSummary: chatResult.promptViolations && chatResult.promptViolations.length > 0
        ? chatResult.promptViolations.map(v => `${v.type} (${v.severity})`).join(', ')
        : 'None',
      blockReason: chatResult.blockedReason,
      prompt: '(Evaluated live in Prompt Guard Console)',
      timestamp: new Date().toISOString(),
      approvalStatus: chatResult.action === 'REVIEW' ? 'PENDING' : 'NONE'
    };

    setAuditEvents(prev => [newEvent, ...prev]);

    if (chatResult.action === 'REVIEW') {
      setPendingApprovals(prev => [newEvent, ...prev]);
      showToast(`Escalated to Approval Queue: ${chatResult.riskLevel} Risk Detected`);
    } else if (chatResult.action === 'BLOCK') {
      showToast(`Enforced BLOCKED: ${chatResult.riskLevel} Security Violation`);
    } else {
      showToast('Request Dispatched: Compliant & Verified');
    }
  };

  const handleApprovalResolved = (id, resolution) => {
    showToast(`Request #${id} successfully ${resolution}`);
    setPendingApprovals(prev => prev.filter(p => p.id !== id));
  };

  return (
    <GlobalLayout>
      {/* Toast Notification Notification */}
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

      {/* Dynamic Route Switching */}
      {currentRoute === 'dashboard' && (
        <DashboardView
          onNavigateToPlayground={() => navigate('playground')}
          onSelectEvent={setSelectedEvent}
        />
      )}

      {currentRoute === 'playground' && (
        <PlaygroundView
          onEventGenerated={handleEventGenerated}
        />
      )}

      {currentRoute === 'audit' && (
        <AuditLogView
          auditEvents={auditEvents}
          onSelectEvent={setSelectedEvent}
        />
      )}

      {currentRoute === 'approvals' && (
        <ApprovalsView
          pendingApprovals={pendingApprovals}
          onApprovalResolved={handleApprovalResolved}
        />
      )}

      {currentRoute === 'compliance' && (
        <ComplianceView />
      )}

      {currentRoute === 'system' && (
        <SystemHealthView
          systemStatus={systemStatus}
          onRefreshStatus={loadData}
        />
      )}

      {currentRoute === 'settings' && (
        <ComplianceView />
      )}

      {/* AI Governance Suite Views (Phase 18) */}
      {currentRoute === 'gov-overview' && (
        <GovernanceOverviewView />
      )}

      {currentRoute === 'gov-policies' && (
        <PoliciesView />
      )}

      {currentRoute === 'gov-models' && (
        <ModelRegistryView />
      )}

      {currentRoute === 'gov-templates' && (
        <PromptTemplatesView />
      )}

      {currentRoute === 'gov-departments' && (
        <DepartmentGovernanceView />
      )}

      {currentRoute === 'gov-users' && (
        <UserGovernanceView />
      )}

      {currentRoute === 'gov-approvals' && (
        <ApprovalPoliciesView />
      )}

      {currentRoute === 'gov-history' && (
        <PolicyHistoryView />
      )}

      {currentRoute === 'gov-simulator' && (
        <PolicySimulatorView />
      )}

      {/* Forensic Inspection Modal */}
      {selectedEvent && (
        <EventDetailModal
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
        />
      )}
    </GlobalLayout>
  );
}

/**
 * Enterprise AI Guardian - Main Application
 * Phase 13: Full Suite UI Integration (Dashboard, Audit Log, Approvals, Compliance, Demo Console, Pipeline Trace)
 */
export default function App() {
  return (
    <ThemeProvider>
      <NavigationProvider initialRoute="dashboard">
        <AppContent />
      </NavigationProvider>
    </ThemeProvider>
  );
}
