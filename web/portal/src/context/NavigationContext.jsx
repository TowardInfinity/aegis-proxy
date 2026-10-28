import React, { createContext, useContext, useState, useEffect } from 'react';

export const ROUTES = [
  {
    id: 'dashboard',
    path: '#/dashboard',
    title: 'Dashboard',
    category: 'Core Operations',
    description: 'Request volume, blocks, spend, and cache savings from the proxy.',
    badge: null
  },
  {
    id: 'playground',
    path: '#/playground',
    title: 'Playground',
    category: 'Core Operations',
    description: 'Check text against the live policy, or send it through the data plane.',
    badge: null
  },
  {
    id: 'audit',
    path: '#/audit',
    title: 'Audit Log',
    category: 'Governance & Forensics',
    description: 'Ledger rows with masked samples, actions, and pipeline traces.',
    badge: null
  },
  {
    id: 'approvals',
    path: '#/approvals',
    title: 'Approvals',
    category: 'Governance & Forensics',
    description: 'Pending security holds and decisions already recorded.',
    badge: null
  },
  {
    id: 'system',
    path: '#/system',
    title: 'System Health',
    category: 'Infrastructure',
    description: 'Data plane and admin plane reachability.',
    badge: null
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
    { label: 'Aegis', href: '#/dashboard' },
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
