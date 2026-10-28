import React, { createContext, useContext, useState, useEffect } from 'react';

export const ROUTES = [
  {
    id: 'dashboard',
    path: '#/dashboard',
    title: 'Governance Dashboard',
    category: 'Core Operations',
    description: 'High-level executive metrics, threat mitigation overview, and model cost allocation.',
    badge: null
  },
  {
    id: 'playground',
    path: '#/playground',
    title: 'Prompt Guard Playground',
    category: 'Core Operations',
    description: 'Interactive AI sandbox with 9-stage real-time security pipeline inspection.',
    badge: 'INTERACTIVE'
  },
  {
    id: 'audit',
    path: '#/audit',
    title: 'Security Audit Log',
    category: 'Governance & Forensics',
    description: 'Immutable forensic records of all intercepted AI queries, token metrics, and violations.',
    badge: null
  },
  {
    id: 'approvals',
    path: '#/approvals',
    title: 'Approval Queue',
    category: 'Governance & Forensics',
    description: 'Human-in-the-loop review station for elevated-risk prompts and policy escalations.',
    badge: '3 PENDING',
    badgeVariant: 'warning'
  },
  {
    id: 'compliance',
    path: '#/compliance',
    title: 'Compliance & Policies',
    category: 'Governance & Forensics',
    description: 'Regulatory posture matrix mapped against NIST AI RMF, EU AI Act, and HIPAA standards.',
    badge: null
  },
  {
    id: 'system',
    path: '#/system',
    title: 'Microservices Topology',
    category: 'Infrastructure',
    description: 'Hexagonal architecture nodes, reactive WebFlux mesh, and Kafka broker telemetry.',
    badge: '5 NODES'
  },
  {
    id: 'settings',
    path: '#/settings',
    title: 'Gateway Settings',
    category: 'Infrastructure',
    description: 'Identity enforcement thresholds, circuit breaker triggers, and token budget rules.',
    badge: null
  },
  {
    id: 'gov-overview',
    path: '#/gov-overview',
    title: 'Governance Overview',
    category: 'AI Governance Suite',
    description: 'Central command for AI policies, model registries, quotas, and compliance posture.',
    badge: 'CONTROL'
  },
  {
    id: 'gov-policies',
    path: '#/gov-policies',
    title: 'AI Policies',
    category: 'AI Governance Suite',
    description: 'Deterministic rule configuration, JSON definitions, categories, and version rollback.',
    badge: null
  },
  {
    id: 'gov-models',
    path: '#/gov-models',
    title: 'Model Registry',
    category: 'AI Governance Suite',
    description: 'Vendor catalog, OpenAI, Gemini, Claude, Llama, Mistral, pricing, and health probes.',
    badge: null
  },
  {
    id: 'gov-templates',
    path: '#/gov-templates',
    title: 'Prompt Templates',
    category: 'AI Governance Suite',
    description: 'Parameterized enterprise prompt library, variables, versioning, and import/export.',
    badge: null
  },
  {
    id: 'gov-departments',
    path: '#/gov-departments',
    title: 'Department Quotas',
    category: 'AI Governance Suite',
    description: 'Token limits, monthly cost ceiling progress bars, allowlists, and emergency override.',
    badge: null
  },
  {
    id: 'gov-users',
    path: '#/gov-users',
    title: 'User Governance',
    category: 'AI Governance Suite',
    description: 'Individual token budgets, bypass permissions, and security restriction enforcement.',
    badge: null
  },
  {
    id: 'gov-approvals',
    path: '#/gov-approvals',
    title: 'Approval Policies',
    category: 'AI Governance Suite',
    description: 'Configurable Human-in-the-Loop review gates, multi-level escalation, and auto-expiry.',
    badge: null
  },
  {
    id: 'gov-history',
    path: '#/gov-history',
    title: 'Policy History',
    category: 'AI Governance Suite',
    description: 'Immutable forensic audit trail of policy mutations with Who, What, and JSON diffs.',
    badge: null
  },
  {
    id: 'gov-simulator',
    path: '#/gov-simulator',
    title: 'Policy Simulator',
    category: 'AI Governance Suite',
    description: 'Dry-run testing sandbox for user, department, prompt, and model combinations.',
    badge: 'SIMULATOR',
    badgeVariant: 'cyan'
  }
];

const NavigationContext = createContext();

export function NavigationProvider({ children, initialRoute = 'dashboard' }) {
  const getRouteFromHash = () => {
    const hash = window.location.hash.replace('#/', '').replace('#', '');
    const found = ROUTES.find(r => r.id === hash);
    return found ? found.id : initialRoute;
  };

  const [currentRoute, setCurrentRoute] = useState(getRouteFromHash);

  useEffect(() => {
    const handleHashChange = () => {
      setCurrentRoute(getRouteFromHash());
    };

    window.addEventListener('hashchange', handleHashChange);
    if (!window.location.hash) {
      window.location.hash = `#/${currentRoute}`;
    }

    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const navigate = (routeId) => {
    const target = ROUTES.find(r => r.id === routeId);
    if (target) {
      window.location.hash = target.path;
      setCurrentRoute(target.id);
    }
  };

  const currentRouteMeta = ROUTES.find(r => r.id === currentRoute) || ROUTES[0];

  const breadcrumbs = [
    { label: 'AI Guardian', href: '#/dashboard' },
    { label: currentRouteMeta.category, href: null },
    { label: currentRouteMeta.title, href: currentRouteMeta.path }
  ];

  return (
    <NavigationContext.Provider
      value={{
        currentRoute,
        navigate,
        routes: ROUTES,
        currentRouteMeta,
        breadcrumbs
      }}
    >
      {children}
    </NavigationContext.Provider>
  );
}

export function useNavigation() {
  const context = useContext(NavigationContext);
  if (!context) {
    throw new Error('useNavigation must be used within a NavigationProvider');
  }
  return context;
}
